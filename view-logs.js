/* ============================================================
   view-logs.js — 工作日誌（依日期紀錄 + HTML 編輯器 + OGSM & 檢核工具選填關聯）
   ============================================================ */
(function (global) {
  'use strict';

  const OGSM = (global.OGSM = global.OGSM || {});
  OGSM.views = OGSM.views || {};

  let isSourceMode = false;

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
    return text.length > 70 ? text.slice(0, 70) + '…' : text || '（尚無內容）';
  }

  // 解析日誌的 OGSM 關聯（向後相容舊版 measureId）
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

  async function createNewLog(preset) {
    const store = OGSM.store;
    const today = store.todayStr();
    const opts = preset || {};
    const ogsmType = opts.ogsmType || (opts.measureId ? 'measure' : null);
    const ogsmId = opts.ogsmId || opts.measureId || null;

    const newLog = {
      id: OGSM.db.uid('log'),
      projectId: store.state.currentProjectId,
      date: today,
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
    await store.saveRecord('logs', newLog);
    store.toast(`已建立 ${today} 工作日誌`);
  }

  function openLogById(logId) {
    const store = OGSM.store;
    store.state.activeLogId = logId;
    store.setView('logs');
  }

  function render(container) {
    const store = OGSM.store;
    const { esc } = store;
    const project = store.currentProject();

    if (!project) {
      container.innerHTML = `<div class="empty-state"><p>請先建立或選擇一個專案。</p></div>`;
      return;
    }

    const q = store.state.searchQuery;
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

    let activeLog =
      filteredLogs.find((l) => l.id === store.state.activeLogId) ||
      filteredLogs[0] ||
      null;
    if (activeLog) {
      store.state.activeLogId = activeLog.id;
    }

    const listHtml = filteredLogs.length
      ? filteredLogs
          .map((l) => {
            const isActive = activeLog && l.id === activeLog.id;
            const ogsmInfo = resolveOgsmLabel(getLogOgsmRef(l), goalMap, stratMap, measMap);
            const linkedCheckCount = (l.checklistIds || []).filter((id) => checkMap.has(id)).length;
            const linkedRevCount = (l.reviewIds || []).filter((id) => reviewMap.has(id)).length;
            const auditTotal = linkedCheckCount + linkedRevCount;
            return `
              <button type="button" class="log-list-item ${isActive ? 'active' : ''}" data-select-log="${esc(l.id)}">
                <div class="log-item-top">
                  <span class="pill ${isActive ? 'blue' : ''}" style="font-variant-numeric:tabular-nums;">${esc(l.date || '未設日期')}</span>
                  ${auditTotal > 0 ? `<span class="pill amber" style="font-size:10.5px;">✦ 檢核 ${auditTotal}</span>` : ''}
                </div>
                <div class="log-item-title">${esc(l.title || `${l.date} 工作紀錄`)}</div>
                ${
                  ogsmInfo
                    ? `<div class="muted-text" style="font-size:11px;color:var(--accent);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${ogsmInfo.prefix} · ${esc(ogsmInfo.title)}</div>`
                    : ''
                }
                <div class="log-item-preview">${esc(stripToPreview(l.contentHtml))}</div>
              </button>
            `;
          })
          .join('')
      : `<div class="empty-state" style="padding:28px 16px;">
          <p>${q ? '沒有符合搜尋條件的日誌。' : '目前尚無日誌紀錄，有做事的日子再隨手記一筆即可！'}</p>
          ${!q ? '<button class="btn btn-primary btn-sm" id="btnEmptyNewLog">＋ 新增今日紀錄</button>' : ''}
        </div>`;

    let editorHtml = '';
    if (activeLog) {
      const activeOgsm = getLogOgsmRef(activeLog);
      const activeOgsmVal = activeOgsm ? `${activeOgsm.type}:${activeOgsm.id}` : '';
      const activeChecklistIds = (activeLog.checklistIds || []).filter((id) => checkMap.has(id));
      const activeReviewIds = (activeLog.reviewIds || []).filter((id) => reviewMap.has(id));

      // 已關聯的檢核項目與覆盤膠囊
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
            <div class="form-field" style="width:155px;flex-shrink:0;">
              <label for="logDateInput">紀錄日期</label>
              <input type="date" id="logDateInput" class="input" value="${esc(activeLog.date || store.todayStr())}" required />
            </div>
            <div class="form-field" style="flex:1;min-width:180px;">
              <label for="logTitleInput">今日主題</label>
              <input type="text" id="logTitleInput" class="input" value="${esc(activeLog.title || '')}" placeholder="輸入今日主題名稱（會同步顯示在關聯的 OGSM 與檢核事項中）..." />
            </div>
          </div>

          <!-- 選填關聯區：OGSM (G / S / M) ＋ 檢核工具 (Checklist / 定期覆盤) -->
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

          ${
            auditChipsHtml
              ? `<div class="log-link-chips">${auditChipsHtml}</div>`
              : ''
          }

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

          <!-- 視覺化編輯畫布 / HTML 原始碼切換 -->
          <div class="html-editor-surface"
               id="logVisualEditor"
               contenteditable="true"
               data-placeholder="在這裡寫下這一天做了什麼事，或貼上整理好的內容..."
               ${isSourceMode ? 'hidden' : ''}>${sanitizeHtml(activeLog.contentHtml)}</div>

          <textarea class="html-source-editor"
                    id="logSourceEditor"
                    spellcheck="false"
                    placeholder="可直接撰寫或貼上 HTML 語法，例如 <h3>完成事項</h3><ul><li>...</li></ul>"
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
              <button type="button" class="btn btn-sm btn-primary" id="btnSaveLog">儲存日誌</button>
            </div>
          </div>
        </div>
      `;
    } else {
      editorHtml = `<div class="empty-state">
        <p>點擊左上方「＋ 新增」建立一筆有日期的工作紀錄。</p>
        <button class="btn btn-primary" id="btnEmptyCenterNewLog">＋ 新增工作日誌</button>
      </div>`;
    }

    container.innerHTML = `
      <div class="logs-layout">
        <!-- 左欄：有紀錄的日期清單 -->
        <aside class="logs-sidebar">
          <div class="section-header" style="margin-bottom:10px;">
            <div>
              <h2 class="section-title">紀錄清單 (${filteredLogs.length})</h2>
              <div class="muted-text" style="font-size:11.5px;">僅顯示有紀錄的日期，不強迫每日填寫</div>
            </div>
            <button class="btn btn-primary btn-sm" id="btnNewLog">＋ 新增</button>
          </div>
          <div class="log-list">${listHtml}</div>
        </aside>

        <!-- 右欄：HTML 內容編輯器 -->
        <section class="logs-main">
          ${editorHtml}
        </section>
      </div>
    `;

    // 新增日誌按鈕
    ['#btnNewLog', '#btnEmptyNewLog', '#btnEmptyCenterNewLog'].forEach((sel) => {
      const btn = container.querySelector(sel);
      if (btn) btn.addEventListener('click', () => createNewLog());
    });

    // 切換選取日誌
    container.querySelectorAll('[data-select-log]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.state.activeLogId = btn.dataset.selectLog;
        store.notify();
      });
    });

    if (!activeLog) return;

    const visualEl = container.querySelector('#logVisualEditor');
    const sourceEl = container.querySelector('#logSourceEditor');

    // 讀取目前表單中未按儲存的欄位草稿（在新增/移除檢核膠囊時不遺失使用者剛打的字！）
    function collectDraftFields() {
      const dateVal = container.querySelector('#logDateInput').value || store.todayStr();
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
        title: titleVal,
        ogsmType,
        ogsmId,
        measureId: ogsmType === 'measure' ? ogsmId : null,
        contentHtml: sanitizeHtml(rawHtml),
      };
    }

    // 切換關聯 OGSM、修改日期或今日主題時自動存檔，避免切頁漏存
    const ogsmSelect = container.querySelector('#logOgsmSelect');
    if (ogsmSelect) {
      ogsmSelect.addEventListener('change', async () => {
        const draft = collectDraftFields();
        await store.saveRecord('logs', {
          ...activeLog,
          ...draft,
          checklistIds: activeLog.checklistIds || [],
          reviewIds: activeLog.reviewIds || [],
          updatedAt: new Date().toISOString(),
        });
        store.toast(draft.ogsmId ? '已更新 OGSM 關聯並自動儲存' : '已取消 OGSM 關聯');
      });
    }

    const dateInput = container.querySelector('#logDateInput');
    const titleInput = container.querySelector('#logTitleInput');
    const autoSaveMeta = async () => {
      const draft = collectDraftFields();
      if (draft.date === activeLog.date && draft.title === (activeLog.title || '')) return;
      await store.saveRecord('logs', {
        ...activeLog,
        ...draft,
        checklistIds: activeLog.checklistIds || [],
        reviewIds: activeLog.reviewIds || [],
        updatedAt: new Date().toISOString(),
      });
    };
    if (dateInput) dateInput.addEventListener('change', autoSaveMeta);
    if (titleInput) titleInput.addEventListener('change', autoSaveMeta);

    // 立即加入一個檢核工具項目（Checklist 或 Review）
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
          updatedAt: new Date().toISOString(),
        });
        store.toast('已關聯檢核工具項目');
      });
    }

    // 在日誌內直接勾選已關聯的 Checklist 項目
    container.querySelectorAll('[data-log-toggle-chk]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const item = store.state.data.checklists.find((c) => c.id === btn.dataset.logToggleChk);
        if (!item) return;
        // 先保留目前剛打的編輯器草稿再切換勾選
        const draft = collectDraftFields();
        await store.saveRecord('logs', { ...activeLog, ...draft, updatedAt: new Date().toISOString() });
        await store.saveRecord('checklists', { ...item, checked: !item.checked });
      });
    });

    // 取消關聯 Checklist
    container.querySelectorAll('[data-unlink-chk]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const cid = btn.dataset.unlinkChk;
        const draft = collectDraftFields();
        const checklistIds = (activeLog.checklistIds || []).filter((id) => id !== cid);
        await store.saveRecord('logs', {
          ...activeLog,
          ...draft,
          checklistIds,
          updatedAt: new Date().toISOString(),
        });
      });
    });

    // 取消關聯 Review
    container.querySelectorAll('[data-unlink-rev]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const rid = btn.dataset.unlinkRev;
        const draft = collectDraftFields();
        const reviewIds = (activeLog.reviewIds || []).filter((id) => id !== rid);
        await store.saveRecord('logs', {
          ...activeLog,
          ...draft,
          reviewIds,
          updatedAt: new Date().toISOString(),
        });
      });
    });

    // 跳往檢核工具
    container.querySelectorAll('[data-jump-audit]').forEach((btn) => {
      btn.addEventListener('click', () => store.setView('audit'));
    });

    // 檢視關聯 M 抽屜
    const btnOpenLinkedM = container.querySelector('#btnOpenLinkedMeasure');
    if (btnOpenLinkedM) {
      btnOpenLinkedM.addEventListener('click', () => {
        const ref = getLogOgsmRef(activeLog);
        if (ref && ref.type === 'measure') OGSM.drawer.open(ref.id);
      });
    }

    // 工具列指令
    container.querySelectorAll('.tool-btn[data-cmd]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (isSourceMode) return;
        visualEl.focus();
        const cmd = btn.dataset.cmd;
        const val = btn.dataset.val || null;
        document.execCommand(cmd, false, val);
      });
    });

    // 插入連結
    const btnLink = container.querySelector('#btnInsertLink');
    if (btnLink) {
      btnLink.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (isSourceMode) return;
        const url = prompt('請輸入超連結網址（例如 Google Drive 連結）：', 'https://');
        if (!url || !url.trim()) return;
        visualEl.focus();
        document.execCommand('createLink', false, store.safeUrl(url));
      });
    }

    // 螢光標記
    const btnHi = container.querySelector('#btnHighlight');
    if (btnHi) {
      btnHi.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (isSourceMode) return;
        visualEl.focus();
        document.execCommand('hiliteColor', false, 'rgba(223, 176, 93, 0.28)');
      });
    }

    // 切換 HTML 原始碼模式
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

    // 儲存日誌
    async function saveActiveLog() {
      const draft = collectDraftFields();
      await store.saveRecord('logs', {
        ...activeLog,
        ...draft,
        checklistIds: activeLog.checklistIds || [],
        reviewIds: activeLog.reviewIds || [],
        updatedAt: new Date().toISOString(),
      });
      store.toast(`已儲存 ${draft.date} 工作日誌`);
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

    // 刪除日誌
    container.querySelector('#btnDeleteLog').addEventListener('click', async () => {
      if (!confirm(`確定要刪除 ${activeLog.date} 這筆工作日誌嗎？`)) return;
      store.state.activeLogId = null;
      await store.deleteRecord('logs', activeLog.id);
      store.toast('已刪除工作日誌');
    });
  }

  OGSM.views.logs = { render, createNewLog, openLogById };
})(window);
