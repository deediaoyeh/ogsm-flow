/* ============================================================
   view-logs.js — 專案執行時間軸 & HTML 編輯器
   完整追蹤「何時想了什麼、添加了什麼」，並保留與 OGSM／檢核工具之雙向關聯
   ============================================================ */
(function (global) {
  'use strict';

  const OGSM = (global.OGSM = global.OGSM || {});
  OGSM.views = OGSM.views || {};

  let isSourceMode = false;

  const LOG_TYPES = {
    idea: { label: '想法與決策', icon: '💡', cls: 'amber' },
    note: { label: '執行紀錄', icon: '✎', cls: 'blue' },
    add: { label: '添加與整理', icon: '📎', cls: 'green' },
    milestone: { label: '關鍵轉折', icon: '⚑', cls: 'red' },
  };

  function nowTimeStr() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function isoToDateAndTime(iso, fallbackDate) {
    if (iso) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        return {
          date: OGSM.db.formatDate(d),
          time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
          sortKey: d.getTime(),
        };
      }
    }
    const fd = fallbackDate || OGSM.store.todayStr();
    const parsed = OGSM.store.parseDate(fd);
    return {
      date: fd,
      time: '',
      sortKey: parsed ? parsed.getTime() : 0,
    };
  }

  function logSortKey(log) {
    const d = log.date || '1970-01-01';
    const t = log.time || '00:00';
    return `${d} ${t} ${log.createdAt || ''}`;
  }

  // 安全消毒 HTML：保留常用排版標籤，移除 script / iframe / 事件屬性與危險協定
  function sanitizeHtml(rawHtml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(rawHtml || ''), 'text/html');
    const forbiddenTags = new Set([
      'SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT',
      'BUTTON', 'STYLE', 'LINK', 'META', 'BASE', 'SVG', 'MATH',
    ]);

    function cleanNode(node) {
      const children = Array.from(node.childNodes);
      children.forEach((child) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          if (forbiddenTags.has(child.tagName)) {
            child.remove();
            return;
          }
          Array.from(child.attributes).forEach((attr) => {
            const name = attr.name.toLowerCase();
            const val = (attr.value || '').trim();
            if (name.startsWith('on') || name === 'srcdoc') {
              child.removeAttribute(attr.name);
            } else if ((name === 'href' || name === 'src') && !/^(https?:\/\/|mailto:|#)/i.test(val)) {
              child.removeAttribute(attr.name);
            }
          });
          if (child.tagName === 'A') {
            child.setAttribute('target', '_blank');
            child.setAttribute('rel', 'noopener noreferrer');
          }
          cleanNode(child);
        }
      });
    }

    cleanNode(doc.body);
    return doc.body.innerHTML;
  }

  function stripToPreview(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = sanitizeHtml(html);
    const text = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length > 72 ? text.slice(0, 72) + '…' : text || '（尚無內容）';
  }

  function getLogOgsmRef(log) {
    if (log.ogsmType && log.ogsmId) {
      return { type: log.ogsmType, id: log.ogsmId };
    }
    if (log.measureId) {
      return { type: 'measure', id: log.measureId };
    }
    return null;
  }

  function resolveOgsmLabel(ref, goalMap, stratMap, measMap) {
    if (!ref) return null;
    if (ref.type === 'goal' && goalMap.has(ref.id)) {
      return { prefix: 'G', title: goalMap.get(ref.id).title, type: 'goal', id: ref.id };
    }
    if (ref.type === 'strategy' && stratMap.has(ref.id)) {
      return { prefix: 'S', title: stratMap.get(ref.id).title, type: 'strategy', id: ref.id };
    }
    if (ref.type === 'measure' && measMap.has(ref.id)) {
      return { prefix: 'M', title: measMap.get(ref.id).title, type: 'measure', id: ref.id };
    }
    return null;
  }

  // 自動彙整目前專案各時間點「添加了什麼」的系統軌跡事件
  function buildProjectActivityEvents(store) {
    const items = [];
    const proj = store.currentProject();
    if (proj && proj.createdAt) {
      const dt = isoToDateAndTime(proj.createdAt);
      items.push({
        kind: 'activity',
        id: `act_proj_${proj.id}`,
        date: dt.date,
        time: dt.time,
        sortKey: `${dt.date} ${dt.time || '00:00'} ${proj.createdAt}`,
        badge: '建立專案',
        badgeCls: 'blue',
        title: proj.name,
        sub: proj.objective || '',
        actionType: 'view',
        actionTarget: 'ogsm',
      });
    }

    store.projectGoals().forEach((g) => {
      const dt = isoToDateAndTime(g.createdAt, g.deadline);
      items.push({
        kind: 'activity',
        id: `act_g_${g.id}`,
        date: dt.date,
        time: dt.time,
        sortKey: `${dt.date} ${dt.time || '00:00'} ${g.createdAt || ''}`,
        badge: '添加目標 G',
        badgeCls: 'green',
        title: g.title,
        sub: g.metricName ? `指標：${g.metricName} (${g.currentValue}/${g.targetValue} ${g.unit || ''})` : '',
        actionType: 'view',
        actionTarget: 'ogsm',
      });
    });

    store.projectMeasures().forEach((m) => {
      const dt = isoToDateAndTime(m.createdAt, m.startDate);
      items.push({
        kind: 'activity',
        id: `act_m_${m.id}`,
        date: dt.date,
        time: dt.time,
        sortKey: `${dt.date} ${dt.time || '00:00'} ${m.createdAt || ''}`,
        badge: '添加行動 M',
        badgeCls: 'amber',
        title: m.title,
        sub: m.startDate ? `排程：${store.shortDate(m.startDate)} – ${store.shortDate(m.endDate)}` : '',
        actionType: 'measure',
        actionTarget: m.id,
      });
    });

    store.projectFiles().forEach((f) => {
      const dt = isoToDateAndTime(f.createdAt);
      const meta = OGSM.db.driveTypeMeta(f.driveType);
      items.push({
        kind: 'activity',
        id: `act_f_${f.id}`,
        date: dt.date,
        time: dt.time,
        sortKey: `${dt.date} ${dt.time || '00:00'} ${f.createdAt || ''}`,
        badge: `添加 ${meta.label}`,
        badgeCls: '',
        title: f.name,
        sub: f.note || 'Google Drive 檔案連結',
        actionType: 'url',
        actionTarget: f.url,
      });
    });

    store.projectReviews().forEach((r) => {
      const dt = isoToDateAndTime(r.createdAt, r.reviewDate);
      items.push({
        kind: 'activity',
        id: `act_r_${r.id}`,
        date: r.reviewDate || dt.date,
        time: dt.time,
        sortKey: `${r.reviewDate || dt.date} ${dt.time || '23:59'} ${r.createdAt || ''}`,
        badge: r.periodType === 'monthly' ? '月覆盤' : '週覆盤',
        badgeCls: 'amber',
        title: r.periodLabel,
        sub: `G ${r.snapshotGoalRate || 0}% · M ${r.snapshotMeasureRate || 0}% · 檢核 ${r.snapshotChecklistRate || 0}%`,
        actionType: 'view',
        actionTarget: 'audit',
      });
    });

    store.projectEvents().forEach((ev) => {
      items.push({
        kind: 'activity',
        id: `act_ev_${ev.id}`,
        date: ev.date,
        time: ev.time || '',
        sortKey: `${ev.date || ''} ${ev.time || '00:00'} ${ev.createdAt || ''}`,
        badge: '行事曆行程',
        badgeCls: 'blue',
        title: ev.title,
        sub: ev.note || '',
        actionType: 'calendar',
        actionTarget: ev.date,
      });
    });

    return items;
  }

  async function createNewLog(preset) {
    const store = OGSM.store;
    const today = store.todayStr();
    const opts = preset || {};
    const ogsmType = opts.ogsmType || (opts.measureId ? 'measure' : null);
    const ogsmId = opts.ogsmId || opts.measureId || null;

    const newLog = {
      id: OGSM.db.uid('log'),
      projectId: opts.projectId || store.defaultWriteProjectId(),
      date: opts.date || today,
      time: opts.time || nowTimeStr(),
      logType: opts.logType || 'idea',
      title: opts.title || '',
      measureId: ogsmType === 'measure' ? ogsmId : null,
      ogsmType,
      ogsmId,
      checklistIds: Array.isArray(opts.checklistIds) ? opts.checklistIds : [],
      reviewIds: Array.isArray(opts.reviewIds) ? opts.reviewIds : [],
      contentHtml: '<p></p>',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    isSourceMode = false;
    store.state.activeLogId = newLog.id;
    if (store.state.timelineFilter === 'activity') {
      store.state.timelineFilter = 'all';
    }
    await store.saveRecord('logs', newLog);
    store.toast(`已新增 ${newLog.date} ${newLog.time} 時間軸紀錄`);
  }

  function openLogById(logId) {
    const store = OGSM.store;
    store.state.activeLogId = logId;
    if (store.state.timelineFilter === 'activity') {
      store.state.timelineFilter = 'all';
    }
    store.setView('logs');
  }

  function render(container) {
    const store = OGSM.store;
    const { esc, safeUrl } = store;
    const allMode = store.isAllMode();

    if (!store.hasAnyContext()) {
      container.innerHTML = `<div class="empty-state"><p>請先建立或選擇一個專案。</p></div>`;
      return;
    }

    const q = store.state.searchQuery;
    const order = store.state.timelineOrder || 'desc';
    const filter = store.state.timelineFilter || 'all';

    const goals = store.projectGoals();
    const strategies = store.projectStrategies();
    const measures = store.projectMeasures();
    const checklists = store.projectChecklists();
    const reviews = store.projectReviews();

    const goalMap = new Map(goals.map((g) => [g.id, g]));
    const stratMap = new Map(strategies.map((s) => [s.id, s]));
    const measMap = new Map(measures.map((m) => [m.id, m]));
    const checkMap = new Map(checklists.map((c) => [c.id, c]));
    const reviewMap = new Map(reviews.map((r) => [r.id, r]));

    const allLogs = store.projectLogs();
    const filteredLogs = allLogs.filter((l) => {
      if (!q) return true;
      const plain = stripToPreview(l.contentHtml).toLowerCase();
      const ogsmInfo = resolveOgsmLabel(getLogOgsmRef(l), goalMap, stratMap, measMap);
      return (
        (l.date || '').toLowerCase().includes(q) ||
        (l.title || '').toLowerCase().includes(q) ||
        plain.includes(q) ||
        (ogsmInfo && ogsmInfo.title.toLowerCase().includes(q))
      );
    });

    const activityItems = buildProjectActivityEvents(store).filter((act) => {
      if (!q) return true;
      return (
        (act.date || '').toLowerCase().includes(q) ||
        (act.title || '').toLowerCase().includes(q) ||
        (act.sub || '').toLowerCase().includes(q) ||
        (act.badge || '').toLowerCase().includes(q)
      );
    });

    // 組合垂直時間軸項目
    let timelineItems = [];
    if (filter !== 'activity') {
      timelineItems = timelineItems.concat(
        filteredLogs.map((l) => ({
          kind: 'log',
          id: l.id,
          date: l.date || '',
          time: l.time || '',
          sortKey: logSortKey(l),
          log: l,
        }))
      );
    }
    if (filter !== 'logs') {
      timelineItems = timelineItems.concat(activityItems);
    }

    timelineItems.sort((a, b) =>
      order === 'asc'
        ? a.sortKey.localeCompare(b.sortKey)
        : b.sortKey.localeCompare(a.sortKey)
    );

    let activeLog =
      filteredLogs.find((l) => l.id === store.state.activeLogId) ||
      filteredLogs[0] ||
      null;
    if (activeLog) {
      store.state.activeLogId = activeLog.id;
    }

    const timelineHtml = timelineItems.length
      ? timelineItems
          .map((item) => {
            if (item.kind === 'log') {
              const l = item.log;
              const isActive = activeLog && l.id === activeLog.id;
              const tMeta = LOG_TYPES[l.logType] || LOG_TYPES.note;
              const ogsmInfo = resolveOgsmLabel(getLogOgsmRef(l), goalMap, stratMap, measMap);
              const linkedCheckCount = (l.checklistIds || []).filter((id) => checkMap.has(id)).length;
              const linkedRevCount = (l.reviewIds || []).filter((id) => reviewMap.has(id)).length;
              const auditTotal = linkedCheckCount + linkedRevCount;
              return `
                <div class="tl-node log-node ${isActive ? 'active' : ''}">
                  <span class="tl-dot ${tMeta.cls}"></span>
                  <button type="button" class="tl-card ${isActive ? 'active' : ''}" data-select-log="${esc(l.id)}">
                    <div class="tl-card-head">
                      <span class="tl-datetime">${esc(l.date || '未設日期')}${l.time ? ` · ${esc(l.time)}` : ''}</span>
                      <span class="pill ${tMeta.cls}" style="font-size:10.5px;">${tMeta.icon} ${tMeta.label}</span>
                    </div>
                    ${allMode ? `<div style="margin-bottom:2px;"><span class="proj-mini-tag">${esc(store.projectNameById(l.projectId))}</span></div>` : ''}
                    <div class="log-item-title">${esc((l.title || '').trim() || `未命名主題（${l.date || ''}）`)}</div>
                    ${
                      ogsmInfo || auditTotal > 0
                        ? `<div class="tl-tags-row">
                            ${ogsmInfo ? `<span class="tl-mini-tag">${ogsmInfo.prefix} · ${esc(ogsmInfo.title)}</span>` : ''}
                            ${auditTotal > 0 ? `<span class="tl-mini-tag amber">✦ 檢核 ${auditTotal}</span>` : ''}
                          </div>`
                        : ''
                    }
                    <div class="log-item-preview">${esc(stripToPreview(l.contentHtml))}</div>
                  </button>
                </div>
              `;
            }

            // 系統自動記錄的「添加了什麼」節點
            return `
              <div class="tl-node activity-node">
                <span class="tl-dot muted"></span>
                <div class="tl-activity-card"
                     data-act-type="${esc(item.actionType)}"
                     data-act-target="${esc(item.actionTarget || '')}"
                     title="點擊前往對應項目">
                  <div class="tl-card-head">
                    <span class="tl-datetime">${esc(item.date)}${item.time ? ` · ${esc(item.time)}` : ''}</span>
                    <span class="pill ${item.badgeCls}" style="font-size:10.5px;">${esc(item.badge)}</span>
                  </div>
                  <div class="tl-activity-title">${esc(item.title)}</div>
                  ${item.sub ? `<div class="muted-text" style="font-size:11.5px;">${esc(item.sub)}</div>` : ''}
                </div>
              </div>
            `;
          })
          .join('')
      : `<div class="empty-state" style="padding:28px 16px;">
          <p>${q ? '沒有符合搜尋條件的時間軸項目。' : '目前尚無時間軸紀錄，點擊上方「＋ 記錄想法」開始留下專案軌跡！'}</p>
          ${!q ? '<button class="btn btn-primary btn-sm" id="btnEmptyNewLog">＋ 新增時間軸節點</button>' : ''}
        </div>`;

    let editorHtml = '';
    if (activeLog) {
      const activeOgsm = getLogOgsmRef(activeLog);
      const activeOgsmVal = activeOgsm ? `${activeOgsm.type}:${activeOgsm.id}` : '';
      const activeChecklistIds = (activeLog.checklistIds || []).filter((id) => checkMap.has(id));
      const activeReviewIds = (activeLog.reviewIds || []).filter((id) => reviewMap.has(id));
      const currentLogType = activeLog.logType || 'note';

      const auditChipsHtml = [
        ...activeChecklistIds.map((cid) => {
          const chk = checkMap.get(cid);
          const parentM = chk && measMap.get(chk.measureId);
          return `
            <span class="log-audit-chip ${chk.checked ? 'done' : ''}">
              <button type="button" class="checkbox-round ${chk.checked ? 'checked' : ''}"
                      style="width:15px;height:15px;font-size:10px;"
                      data-log-toggle-chk="${esc(cid)}"
                      title="切換檢核項完成狀態">${chk.checked ? '✓' : ''}</button>
              <span class="log-audit-chip-text" title="${esc(chk.text)}${parentM ? '（M: ' + esc(parentM.title) + '）' : ''}">
                清單：${esc(chk.text)}
              </span>
              <button type="button" class="chip-remove" data-unlink-chk="${esc(cid)}" title="取消關聯">✕</button>
            </span>
          `;
        }),
        ...activeReviewIds.map((rid) => {
          const rev = reviewMap.get(rid);
          return `
            <span class="log-audit-chip review">
              <button type="button" class="chip-jump" data-jump-audit title="前往檢核工具查看此覆盤">
                ✦ ${rev.periodType === 'monthly' ? '月覆盤' : '週覆盤'}：${esc(rev.periodLabel)}
              </button>
              <button type="button" class="chip-remove" data-unlink-rev="${esc(rid)}" title="取消關聯">✕</button>
            </span>
          `;
        }),
      ].join('');

      editorHtml = `
        <div class="log-editor-card">
          <div class="log-meta-bar">
            <div class="form-field" style="width:146px;flex-shrink:0;">
              <label for="logDateInput">日期</label>
              <input type="date" id="logDateInput" class="input" value="${esc(activeLog.date || store.todayStr())}" required />
            </div>
            <div class="form-field" style="width:112px;flex-shrink:0;">
              <label for="logTimeInput">時間點</label>
              <input type="time" id="logTimeInput" class="input" value="${esc(activeLog.time || '')}" />
            </div>
            <div class="form-field" style="width:142px;flex-shrink:0;">
              <label for="logTypeSelect">節點類型</label>
              <select id="logTypeSelect" class="select">
                ${Object.entries(LOG_TYPES)
                  .map(
                    ([k, v]) =>
                      `<option value="${k}" ${currentLogType === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`
                  )
                  .join('')}
              </select>
            </div>
            <div class="form-field" style="flex:1;min-width:180px;">
              <label for="logTitleInput">今日主題</label>
              <input type="text" id="logTitleInput" class="input" value="${esc(activeLog.title || '')}" placeholder="輸入這時間點想了什麼、完成了什麼（會同步顯示於關聯項目）..." />
            </div>
          </div>

          <!-- 選填關聯區：OGSM (G / S / M) ＋ 檢核工具 -->
          <div class="log-links-bar">
            <div class="form-field" style="flex:1;min-width:200px;">
              <label for="logOgsmSelect">關聯 OGSM（選填：目標 G / 策略 S / 行動 M）</label>
              <select id="logOgsmSelect" class="select">
                <option value="">不綁定 OGSM</option>
                ${
                  goals.length
                    ? `<optgroup label="目標 G">
                        ${goals
                          .map(
                            (g) =>
                              `<option value="goal:${esc(g.id)}" ${activeOgsmVal === `goal:${g.id}` ? 'selected' : ''}>G · ${esc(g.title)}</option>`
                          )
                          .join('')}
                      </optgroup>`
                    : ''
                }
                ${
                  strategies.length
                    ? `<optgroup label="策略 S">
                        ${strategies
                          .map(
                            (s) =>
                              `<option value="strategy:${esc(s.id)}" ${activeOgsmVal === `strategy:${s.id}` ? 'selected' : ''}>S · ${esc(s.title)}</option>`
                          )
                          .join('')}
                      </optgroup>`
                    : ''
                }
                ${
                  measures.length
                    ? `<optgroup label="行動計畫 M">
                        ${measures
                          .map(
                            (m) =>
                              `<option value="measure:${esc(m.id)}" ${activeOgsmVal === `measure:${m.id}` ? 'selected' : ''}>M · ${esc(m.title)}</option>`
                          )
                          .join('')}
                      </optgroup>`
                    : ''
                }
              </select>
            </div>

            <div class="form-field" style="flex:1;min-width:200px;">
              <label for="logAuditAddSelect">關聯檢核工具（選填，可多選加入）</label>
              <select id="logAuditAddSelect" class="select">
                <option value="">＋ 選擇檢核清單項或覆盤表...</option>
                ${
                  checklists.length
                    ? `<optgroup label="任務檢核清單（Checklist）">
                        ${checklists
                          .filter((c) => !activeChecklistIds.includes(c.id))
                          .map((c) => {
                            const pm = measMap.get(c.measureId);
                            return `<option value="check:${esc(c.id)}">${c.checked ? '✓ ' : '○ '}${esc(c.text)}${pm ? '（' + esc(pm.title) + '）' : ''}</option>`;
                          })
                          .join('')}
                      </optgroup>`
                    : ''
                }
                ${
                  reviews.length
                    ? `<optgroup label="週／月定期覆盤表">
                        ${reviews
                          .filter((r) => !activeReviewIds.includes(r.id))
                          .map(
                            (r) =>
                              `<option value="review:${esc(r.id)}">✦ ${esc(r.periodLabel)} (${esc(r.reviewDate)})</option>`
                          )
                          .join('')}
                      </optgroup>`
                    : ''
                }
              </select>
            </div>
          </div>

          ${auditChipsHtml ? `<div class="log-link-chips">${auditChipsHtml}</div>` : ''}

          <!-- HTML 編輯器工具列 -->
          <div class="html-toolbar" role="toolbar" aria-label="HTML 編輯工具列">
            <div class="html-tool-group">
              <button type="button" class="tool-btn" data-cmd="formatBlock" data-val="H2" title="大標題">H2</button>
              <button type="button" class="tool-btn" data-cmd="formatBlock" data-val="H3" title="小標題">H3</button>
              <button type="button" class="tool-btn" data-cmd="formatBlock" data-val="P" title="一般段落">P</button>
            </div>
            <div class="html-tool-group">
              <button type="button" class="tool-btn" data-cmd="bold" title="粗體"><strong>B</strong></button>
              <button type="button" class="tool-btn" data-cmd="italic" title="斜體"><em>I</em></button>
              <button type="button" class="tool-btn" data-cmd="underline" title="底線"><u>U</u></button>
              <button type="button" class="tool-btn" data-cmd="strikeThrough" title="刪除線"><s>S</s></button>
            </div>
            <div class="html-tool-group">
              <button type="button" class="tool-btn" data-cmd="insertUnorderedList" title="項目清單">• 清單</button>
              <button type="button" class="tool-btn" data-cmd="insertOrderedList" title="編號清單">1. 清單</button>
              <button type="button" class="tool-btn" data-cmd="formatBlock" data-val="BLOCKQUOTE" title="引用區塊">❝</button>
              <button type="button" class="tool-btn" data-cmd="insertHorizontalRule" title="分隔線">―</button>
            </div>
            <div class="html-tool-group">
              <button type="button" class="tool-btn" id="btnInsertLink" title="插入超連結">🔗 連結</button>
              <button type="button" class="tool-btn" id="btnHighlight" title="螢光標記">✦ 標記</button>
              <button type="button" class="tool-btn" data-cmd="removeFormat" title="清除格式">清除</button>
            </div>
            <button type="button" class="tool-btn source-toggle ${isSourceMode ? 'active' : ''}" id="btnToggleHtmlSource" title="切換 HTML 原始碼編輯">
              &lt;/&gt; HTML
            </button>
          </div>

          <div class="html-editor-surface"
               id="logVisualEditor"
               contenteditable="true"
               data-placeholder="記錄在這個時間點您想了什麼、為什麼這樣決策，或添加了哪些重點內容..."
               ${isSourceMode ? 'hidden' : ''}>${sanitizeHtml(activeLog.contentHtml)}</div>

          <textarea class="html-source-editor"
                    id="logSourceEditor"
                    spellcheck="false"
                    placeholder="可直接撰寫或貼上 HTML 語法，例如 <h3>思考脈絡</h3><ul><li>...</li></ul>"
                    ${isSourceMode ? '' : 'hidden'}>${esc(activeLog.contentHtml || '')}</textarea>

          <div class="log-editor-footer">
            <span class="muted-text" style="font-size:12px;">
              ${activeLog.updatedAt ? `上次更新：${new Date(activeLog.updatedAt).toLocaleString('zh-Hant')}` : ''}
            </span>
            <div class="row-gap-xs">
              ${
                activeOgsm && activeOgsm.type === 'measure' && measMap.has(activeOgsm.id)
                  ? `<button type="button" class="btn btn-sm" id="btnOpenLinkedMeasure">檢視關聯 M</button>`
                  : ''
              }
              <button type="button" class="btn btn-sm btn-danger" id="btnDeleteLog">刪除這筆</button>
              <button type="button" class="btn btn-sm btn-primary" id="btnSaveLog">儲存紀錄</button>
            </div>
          </div>
        </div>
      `;
    } else {
      editorHtml = `<div class="empty-state">
        <p>點擊左側「＋ 新增」建立一個時間軸節點，用 HTML 編輯器寫下您的想法與執行過程。</p>
        <button class="btn btn-primary" id="btnEmptyCenterNewLog">＋ 新增時間軸紀錄</button>
      </div>`;
    }

    container.innerHTML = `
      <div class="logs-layout timeline-layout">
        <!-- 左欄：專案執行垂直時間軸 -->
        <aside class="logs-sidebar timeline-sidebar">
          <div class="section-header" style="margin-bottom:10px;">
            <div>
              <h2 class="section-title">專案流程時間軸</h2>
              <div class="muted-text" style="font-size:11.5px;">追蹤每個時間點的想法與新增紀錄</div>
            </div>
            <button class="btn btn-primary btn-sm" id="btnNewLog">＋ 新增</button>
          </div>

          <div class="timeline-controls">
            <div class="seg-tabs" style="flex:1;">
              <button class="seg-tab ${filter === 'all' ? 'active' : ''}" data-tl-filter="all">全部</button>
              <button class="seg-tab ${filter === 'logs' ? 'active' : ''}" data-tl-filter="logs">想法日誌 (${filteredLogs.length})</button>
              <button class="seg-tab ${filter === 'activity' ? 'active' : ''}" data-tl-filter="activity">添加軌跡</button>
            </div>
            <button type="button" class="btn btn-sm" id="btnToggleTlOrder" title="切換時間排序">
              ${order === 'desc' ? '↓ 最新' : '↑ 最早'}
            </button>
          </div>

          <div class="timeline-track">${timelineHtml}</div>
        </aside>

        <!-- 右欄：HTML 內容編輯器 -->
        <section class="logs-main">
          ${editorHtml}
        </section>
      </div>
    `;

    // 新增與篩選控制
    ['#btnNewLog', '#btnEmptyNewLog', '#btnEmptyCenterNewLog'].forEach((sel) => {
      const btn = container.querySelector(sel);
      if (btn) btn.addEventListener('click', () => createNewLog());
    });

    container.querySelectorAll('[data-tl-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.state.timelineFilter = btn.dataset.tlFilter;
        store.notify();
      });
    });

    const btnOrder = container.querySelector('#btnToggleTlOrder');
    if (btnOrder) {
      btnOrder.addEventListener('click', () => {
        store.state.timelineOrder = order === 'desc' ? 'asc' : 'desc';
        store.notify();
      });
    }

    // 切換選取日誌節點
    container.querySelectorAll('[data-select-log]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.state.activeLogId = btn.dataset.selectLog;
        store.notify();
      });
    });

    // 點擊系統軌跡事件跳轉
    container.querySelectorAll('[data-act-type]').forEach((el) => {
      el.addEventListener('click', () => {
        const type = el.dataset.actType;
        const target = el.dataset.actTarget;
        if (type === 'measure' && target) {
          OGSM.drawer.open(target);
        } else if (type === 'url' && target) {
          window.open(safeUrl(target), '_blank', 'noopener,noreferrer');
        } else if (type === 'calendar' && target) {
          const d = store.parseDate(target);
          if (d) {
            store.state.calendarYear = d.getFullYear();
            store.state.calendarMonth = d.getMonth();
            store.state.calendarSelectedDate = target;
          }
          store.setView('calendar');
        } else if (type === 'view' && target) {
          store.setView(target);
        }
      });
    });

    if (!activeLog) return;

    const visualEl = container.querySelector('#logVisualEditor');
    const sourceEl = container.querySelector('#logSourceEditor');

    function collectDraftFields() {
      const dateVal = container.querySelector('#logDateInput').value || store.todayStr();
      const timeVal = container.querySelector('#logTimeInput').value || '';
      const logTypeVal = container.querySelector('#logTypeSelect').value || 'note';
      const titleVal = container.querySelector('#logTitleInput').value.trim();
      const ogsmRaw = container.querySelector('#logOgsmSelect').value;
      let ogsmType = null;
      let ogsmId = null;
      if (ogsmRaw && ogsmRaw.includes(':')) {
        const parts = ogsmRaw.split(':');
        ogsmType = parts[0];
        ogsmId = parts.slice(1).join(':');
      }
      const rawHtml = isSourceMode ? sourceEl.value : visualEl.innerHTML;
      return {
        date: dateVal,
        time: timeVal,
        logType: logTypeVal,
        title: titleVal,
        ogsmType,
        ogsmId,
        measureId: ogsmType === 'measure' ? ogsmId : null,
        contentHtml: sanitizeHtml(rawHtml),
      };
    }

    const ogsmSelect = container.querySelector('#logOgsmSelect');
    if (ogsmSelect) {
      ogsmSelect.addEventListener('change', async () => {
        const draft = collectDraftFields();
        await store.saveRecord('logs', {
          ...activeLog,
          ...draft,
          checklistIds: activeLog.checklistIds || [],
          reviewIds: activeLog.reviewIds || [],
        });
        store.toast(draft.ogsmId ? '已更新 OGSM 關聯並自動儲存' : '已取消 OGSM 關聯');
      });
    }

    const autoSaveMeta = async () => {
      const draft = collectDraftFields();
      if (
        draft.date === activeLog.date &&
        draft.time === (activeLog.time || '') &&
        draft.logType === (activeLog.logType || 'note') &&
        draft.title === (activeLog.title || '')
      ) {
        return;
      }
      await store.saveRecord('logs', {
        ...activeLog,
        ...draft,
        checklistIds: activeLog.checklistIds || [],
        reviewIds: activeLog.reviewIds || [],
      });
    };
    ['#logDateInput', '#logTimeInput', '#logTypeSelect', '#logTitleInput'].forEach((sel) => {
      const el = container.querySelector(sel);
      if (el) el.addEventListener('change', autoSaveMeta);
    });

    const auditSelect = container.querySelector('#logAuditAddSelect');
    if (auditSelect) {
      auditSelect.addEventListener('change', async () => {
        const val = auditSelect.value;
        if (!val) return;
        const draft = collectDraftFields();
        const checklistIds = Array.from(new Set(activeLog.checklistIds || []));
        const reviewIds = Array.from(new Set(activeLog.reviewIds || []));
        if (val.startsWith('check:')) {
          const cid = val.slice(6);
          if (!checklistIds.includes(cid)) checklistIds.push(cid);
        } else if (val.startsWith('review:')) {
          const rid = val.slice(7);
          if (!reviewIds.includes(rid)) reviewIds.push(rid);
        }
        await store.saveRecord('logs', {
          ...activeLog,
          ...draft,
          checklistIds,
          reviewIds,
        });
        store.toast('已關聯檢核工具項目');
      });
    }

    container.querySelectorAll('[data-log-toggle-chk]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const item = store.state.data.checklists.find((c) => c.id === btn.dataset.logToggleChk);
        if (!item) return;
        const draft = collectDraftFields();
        await store.saveRecord('logs', { ...activeLog, ...draft });
        await store.saveRecord('checklists', { ...item, checked: !item.checked });
      });
    });

    container.querySelectorAll('[data-unlink-chk]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const cid = btn.dataset.unlinkChk;
        const draft = collectDraftFields();
        const checklistIds = (activeLog.checklistIds || []).filter((id) => id !== cid);
        await store.saveRecord('logs', { ...activeLog, ...draft, checklistIds });
      });
    });

    container.querySelectorAll('[data-unlink-rev]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const rid = btn.dataset.unlinkRev;
        const draft = collectDraftFields();
        const reviewIds = (activeLog.reviewIds || []).filter((id) => id !== rid);
        await store.saveRecord('logs', { ...activeLog, ...draft, reviewIds });
      });
    });

    container.querySelectorAll('[data-jump-audit]').forEach((btn) => {
      btn.addEventListener('click', () => store.setView('audit'));
    });

    const btnOpenLinkedM = container.querySelector('#btnOpenLinkedMeasure');
    if (btnOpenLinkedM) {
      btnOpenLinkedM.addEventListener('click', () => {
        const ref = getLogOgsmRef(activeLog);
        if (ref && ref.type === 'measure') OGSM.drawer.open(ref.id);
      });
    }

    container.querySelectorAll('.tool-btn[data-cmd]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (isSourceMode) return;
        visualEl.focus();
        document.execCommand(btn.dataset.cmd, false, btn.dataset.val || null);
      });
    });

    const btnLink = container.querySelector('#btnInsertLink');
    if (btnLink) {
      btnLink.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (isSourceMode) return;
        const url = prompt('請輸入超連結網址（例如 Google Drive 連結）：', 'https://');
        if (!url || !url.trim()) return;
        visualEl.focus();
        document.execCommand('createLink', false, safeUrl(url));
      });
    }

    const btnHi = container.querySelector('#btnHighlight');
    if (btnHi) {
      btnHi.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (isSourceMode) return;
        visualEl.focus();
        document.execCommand('hiliteColor', false, 'rgba(223, 176, 93, 0.28)');
      });
    }

    const btnSource = container.querySelector('#btnToggleHtmlSource');
    if (btnSource) {
      btnSource.addEventListener('click', () => {
        if (!isSourceMode) {
          sourceEl.value = sanitizeHtml(visualEl.innerHTML);
          isSourceMode = true;
          visualEl.hidden = true;
          sourceEl.hidden = false;
          btnSource.classList.add('active');
        } else {
          visualEl.innerHTML = sanitizeHtml(sourceEl.value);
          isSourceMode = false;
          sourceEl.hidden = true;
          visualEl.hidden = false;
          btnSource.classList.remove('active');
        }
      });
    }

    async function saveActiveLog() {
      const draft = collectDraftFields();
      await store.saveRecord('logs', {
        ...activeLog,
        ...draft,
        checklistIds: activeLog.checklistIds || [],
        reviewIds: activeLog.reviewIds || [],
      });
      store.toast(`已儲存 ${draft.date} 時間軸紀錄`);
    }

    container.querySelector('#btnSaveLog').addEventListener('click', saveActiveLog);

    const onKeySave = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveActiveLog();
      }
    };
    visualEl.addEventListener('keydown', onKeySave);
    sourceEl.addEventListener('keydown', onKeySave);

    container.querySelector('#btnDeleteLog').addEventListener('click', async () => {
      if (!confirm(`確定要刪除 ${activeLog.date} 這筆時間軸紀錄嗎？`)) return;
      store.state.activeLogId = null;
      await store.deleteRecord('logs', activeLog.id);
      store.toast('已刪除時間軸紀錄');
    });
  }

  OGSM.views.logs = { render, createNewLog, openLogById };
})(window);
