/* ============================================================
   view-logs.js — 工作日誌（依日期紀錄 + 內建視覺化 / HTML 原始碼編輯器）
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

  async function createNewLog() {
    const store = OGSM.store;
    const today = store.todayStr();
    const newLog = {
      id: OGSM.db.uid('log'),
      projectId: store.state.currentProjectId,
      date: today,
      title: '',
      measureId: null,
      contentHtml: '<p></p>',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    isSourceMode = false;
    store.state.activeLogId = newLog.id;
    await store.saveRecord('logs', newLog);
    store.toast(`已建立 ${today} 工作日誌`);
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
    const measures = store.projectMeasures();
    const measureMap = new Map(measures.map((m) => [m.id, m]));
    const allLogs = store.projectLogs();

    const filteredLogs = allLogs.filter((l) => {
      if (!q) return true;
      const plain = stripToPreview(l.contentHtml).toLowerCase();
      return (
        (l.date || '').toLowerCase().includes(q) ||
        (l.title || '').toLowerCase().includes(q) ||
        plain.includes(q)
      );
    });

    // 自動選取目前作用中的日誌（或最新一筆）
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
            const linked = l.measureId ? measureMap.get(l.measureId) : null;
            return `
              <button type="button" class="log-list-item ${isActive ? 'active' : ''}" data-select-log="${esc(l.id)}">
                <div class="log-item-top">
                  <span class="pill ${isActive ? 'blue' : ''}" style="font-variant-numeric:tabular-nums;">${esc(l.date || '未設日期')}</span>
                  ${linked ? `<span class="muted-text" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">M · ${esc(linked.title)}</span>` : ''}
                </div>
                <div class="log-item-title">${esc(l.title || `${l.date} 工作紀錄`)}</div>
                <div class="log-item-preview">${esc(stripToPreview(l.contentHtml))}</div>
              </button>
            `;
          })
          .join('')
      : `<div class="empty-state" style="padding:28px 16px;">
          <p>${q ? '沒有符合搜尋條件的日誌。' : '目前尚無日誌紀錄，有做事的日子再隨手記一筆即可！'}</p>
          ${!q ? '<button class="btn btn-primary btn-sm" id="btnEmptyNewLog">＋ 新增今日紀錄</button>' : ''}
        </div>`;

    const editorHtml = activeLog
      ? `
        <div class="log-editor-card">
          <div class="log-meta-bar">
            <div class="form-field" style="width:155px;flex-shrink:0;">
              <label for="logDateInput">紀錄日期</label>
              <input type="date" id="logDateInput" class="input" value="${esc(activeLog.date || store.todayStr())}" required />
            </div>
            <div class="form-field" style="flex:1;min-width:160px;">
              <label for="logTitleInput">今日主題（選填）</label>
              <input type="text" id="logTitleInput" class="input" value="${esc(activeLog.title || '')}" placeholder="例如：完成客戶簡報初稿、討論排程調整..." />
            </div>
            <div class="form-field" style="width:200px;flex-shrink:0;">
              <label for="logMeasureSelect">關聯行動 M（選填）</label>
              <select id="logMeasureSelect" class="select">
                <option value="">不特別綁定</option>
                ${measures
                  .map(
                    (m) =>
                      `<option value="${esc(m.id)}" ${m.id === activeLog.measureId ? 'selected' : ''}>M · ${esc(m.title)}</option>`
                  )
                  .join('')}
              </select>
            </div>
          </div>

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
              <button type="button" class="btn btn-sm btn-danger" id="btnDeleteLog">刪除這筆</button>
              <button type="button" class="btn btn-sm btn-primary" id="btnSaveLog">儲存日誌</button>
            </div>
          </div>
        </div>
      `
      : `<div class="empty-state">
          <p>點擊左上方「＋ 新增日誌」建立一筆有日期的工作紀錄。</p>
          <button class="btn btn-primary" id="btnEmptyCenterNewLog">＋ 新增工作日誌</button>
        </div>`;

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
      if (btn) btn.addEventListener('click', createNewLog);
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

    // 工具列指令
    container.querySelectorAll('.tool-btn[data-cmd]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); // 避免失去選取範圍焦點
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

    // 儲存日誌（同時觸發 Google Drive 自動同步）
    async function saveActiveLog() {
      const dateVal = container.querySelector('#logDateInput').value || store.todayStr();
      const titleVal = container.querySelector('#logTitleInput').value.trim();
      const measureVal = container.querySelector('#logMeasureSelect').value || null;
      const rawHtml = isSourceMode ? sourceEl.value : visualEl.innerHTML;
      const cleanHtml = sanitizeHtml(rawHtml);

      await store.saveRecord('logs', {
        ...activeLog,
        date: dateVal,
        title: titleVal,
        measureId: measureVal,
        contentHtml: cleanHtml,
        updatedAt: new Date().toISOString(),
      });
      store.toast(`已儲存 ${dateVal} 工作日誌`);
    }

    container.querySelector('#btnSaveLog').addEventListener('click', saveActiveLog);

    // 快捷鍵 Cmd/Ctrl + S 儲存
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

  OGSM.views.logs = { render, createNewLog };
})(window);
