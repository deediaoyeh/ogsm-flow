/* ============================================================
   editor.js — 共用 HTML 備註編輯器（自動將網址轉連結 + 支援雲端/本機附檔）
   供 OGSM（O / G / S / M）與時間軸共用，支援手機直式操作
   ============================================================ */
(function (global) {
  'use strict';

  const OGSM = (global.OGSM = global.OGSM || {});

  function esc(str) {
    return OGSM.store ? OGSM.store.esc(str) : String(str == null ? '' : str);
  }

  function safeUrl(url) {
    return OGSM.store ? OGSM.store.safeUrl(url) : String(url || '');
  }

  // 安全消毒 HTML，保留常用排版與可點選超連結
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

  // 將純文字中的 https:// / http:// / www. 網址自動轉換為可點擊的 <a> 連結
  function autoLinkUrls(html) {
    const clean = sanitizeHtml(html);
    const parser = new DOMParser();
    const doc = parser.parseFromString(clean, 'text/html');
    const urlRegex = /(https?:\/\/[^\s<>"'）)]+|www\.[^\s<>"'）)]+)/gi;

    function walk(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'A' || node.tagName === 'CODE' || node.tagName === 'PRE') return;
        Array.from(node.childNodes).forEach(walk);
        return;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue || '';
        if (!urlRegex.test(text)) return;
        urlRegex.lastIndex = 0;

        const frag = doc.createDocumentFragment();
        let lastIdx = 0;
        let match;
        while ((match = urlRegex.exec(text)) !== null) {
          if (match.index > lastIdx) {
            frag.appendChild(doc.createTextNode(text.slice(lastIdx, match.index)));
          }
          let rawUrl = match[0];
          // 去除句尾常見標點，避免吃進網址
          let trailing = '';
          const punctMatch = rawUrl.match(/[.,;!?，。；！？、]+$/);
          if (punctMatch) {
            trailing = punctMatch[0];
            rawUrl = rawUrl.slice(0, -trailing.length);
          }
          const a = doc.createElement('a');
          a.href = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
          a.textContent = rawUrl;
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
          frag.appendChild(a);
          if (trailing) {
            frag.appendChild(doc.createTextNode(trailing));
          }
          lastIdx = match.index + match[0].length;
        }
        if (lastIdx < text.length) {
          frag.appendChild(doc.createTextNode(text.slice(lastIdx)));
        }
        node.parentNode.replaceChild(frag, node);
      }
    }

    walk(doc.body);
    return doc.body.innerHTML;
  }

  function hasMeaningfulHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = sanitizeHtml(html);
    const text = (tmp.textContent || '').replace(/\u00a0/g, ' ').trim();
    return text.length > 0 || Boolean(tmp.querySelector('a, img, hr'));
  }

  function formatBytes(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  // 渲染唯讀附檔膠囊（供 OGSM 藍圖與卡片直接點選開啟／下載）
  function renderAttachmentChips(attachments) {
    const list = Array.isArray(attachments) ? attachments : [];
    if (!list.length) return '';
    return `
      <div class="note-attachments-row" onclick="event.stopPropagation()">
        ${list
          .map((att) => {
            if (att.kind === 'drive_blob' && att.driveFileId) {
              return `
                <button type="button" class="drive-chip attach-chip"
                        data-open-drive-blob="${esc(att.driveFileId)}"
                        data-blob-name="${esc(att.name || 'attachment')}"
                        data-blob-mime="${esc(att.mimeType || '')}"
                        title="點擊開啟／下載附檔：${esc(att.name)}${att.size ? ' (' + formatBytes(att.size) + ')' : ''}"
                        onclick="event.stopPropagation()">
                  <span aria-hidden="true">📎</span>
                  <span class="drive-chip-name">${esc(att.name)}</span>
                </button>
              `;
            }
            if (att.kind === 'upload' && att.dataUrl) {
              return `
                <a class="drive-chip attach-chip" href="${esc(att.dataUrl)}" download="${esc(att.name || 'attachment')}"
                   title="點擊下載附檔：${esc(att.name)} (${formatBytes(att.size)})"
                   onclick="event.stopPropagation()">
                  <span aria-hidden="true">📎</span>
                  <span class="drive-chip-name">${esc(att.name)}</span>
                </a>
              `;
            }
            const meta = OGSM.db.driveTypeMeta(att.driveType || OGSM.db.detectDriveType(att.url, att.name));
            return `
              <a class="drive-chip attach-chip" href="${esc(safeUrl(att.url))}" target="_blank" rel="noopener noreferrer"
                 title="點擊開啟附檔：${esc(att.name)} (${meta.label})"
                 onclick="event.stopPropagation()">
                <span class="drive-dot ${meta.cls}"></span>
                <span class="drive-chip-name">${esc(att.name)}</span>
              </a>
            `;
          })
          .join('')}
      </div>
    `;
  }

  // 渲染唯讀 HTML 備註＋附檔區塊（供 OGSM 藍圖 O / G / S / M 顯示）
  function renderNoteBlock(noteHtml, attachments, extraClass) {
    const hasHtml = hasMeaningfulHtml(noteHtml);
    const attList = Array.isArray(attachments) ? attachments : [];
    if (!hasHtml && !attList.length) return '';
    return `
      <div class="ogsm-note-display ${extraClass || ''}" onclick="event.stopPropagation()">
        ${hasHtml ? `<div class="ogsm-note-html">${autoLinkUrls(noteHtml)}</div>` : ''}
        ${renderAttachmentChips(attList)}
      </div>
    `;
  }

  // 掛載可重複使用的 HTML 備註編輯器（含網址自動轉連結＋雲端/本機附檔面板）
  function mount(hostEl, options) {
    const opts = options || {};
    let isSourceMode = false;
    let attachments = Array.isArray(opts.attachments) ? opts.attachments.map((a) => ({ ...a })) : [];
    const initialClean = autoLinkUrls(opts.initialHtml || '');

    hostEl.innerHTML = `
      <div class="mini-html-editor">
        <div class="html-toolbar mini" role="toolbar" aria-label="備註 HTML 編輯工具列">
          <div class="html-tool-group">
            <button type="button" class="tool-btn" data-cmd="bold" title="粗體"><strong>B</strong></button>
            <button type="button" class="tool-btn" data-cmd="italic" title="斜體"><em>I</em></button>
            <button type="button" class="tool-btn" data-cmd="underline" title="底線"><u>U</u></button>
          </div>
          <div class="html-tool-group">
            <button type="button" class="tool-btn" data-cmd="insertUnorderedList" title="項目清單">• 清單</button>
            <button type="button" class="tool-btn" data-cmd="insertOrderedList" title="編號清單">1. 清單</button>
            <button type="button" class="tool-btn" data-cmd="formatBlock" data-val="BLOCKQUOTE" title="引用">❝</button>
          </div>
          <div class="html-tool-group">
            <button type="button" class="tool-btn" data-act="link" title="插入可點擊連結">🔗 連結</button>
            <button type="button" class="tool-btn" data-act="attach" title="加入附檔（雲端連結或本機檔案）">📎 附檔</button>
          </div>
          <button type="button" class="tool-btn source-toggle" data-act="source" title="切換 HTML 原始碼">&lt;/&gt; HTML</button>
        </div>

        <!-- 展開式附檔新增列（支援雲端連結與無上限本機拖曳/選檔上傳） -->
        <div class="editor-attach-panel" data-attach-panel hidden>
          <div class="attach-panel-row">
            <input type="text" class="input" data-att-name placeholder="附檔名稱（選填，未填自動帶入）" />
            <input type="url" class="input" data-att-url placeholder="貼上 Google Drive 或雲端網址 (https://...)" />
            <button type="button" class="btn btn-sm btn-primary" data-att-add-url>加入連結附檔</button>
          </div>
          <label class="dropzone-box compact" data-att-dropzone>
            <input type="file" data-att-file multiple hidden />
            <span class="dropzone-title">＋ 拖曳本機檔案至此處，或點擊選擇上傳（不限大小・支援多檔）</span>
            <span class="dropzone-sub">直接串流存入您的 Google Drive 專屬空間，跨裝置同步且不拖慢速度</span>
          </label>
          <div class="upload-progress-box" data-att-progress hidden></div>
        </div>

        <div class="html-editor-surface mini"
             data-visual
             contenteditable="true"
             data-placeholder="${esc(opts.placeholder || '填寫備註內容，貼上網址會自動變成可點選連結，亦可直接拖曳本機檔案至此加入附檔...')}">${initialClean}</div>

        <textarea class="html-source-editor mini"
                  data-source
                  spellcheck="false"
                  placeholder="可直接撰寫 HTML，例如 <p>說明 <a href=&quot;https://...&quot;>連結</a></p>"
                  hidden>${esc(initialClean)}</textarea>

        <div class="editor-attachments-list" data-att-list></div>
      </div>
    `;

    const visualEl = hostEl.querySelector('[data-visual]');
    const sourceEl = hostEl.querySelector('[data-source]');
    const attachPanel = hostEl.querySelector('[data-attach-panel]');
    const attListEl = hostEl.querySelector('[data-att-list]');
    const attDropzone = hostEl.querySelector('[data-att-dropzone]');
    const attProgressEl = hostEl.querySelector('[data-att-progress]');
    const btnSource = hostEl.querySelector('[data-act="source"]');

    function renderAttachmentsList() {
      if (!attachments.length) {
        attListEl.innerHTML = '';
        return;
      }
      attListEl.innerHTML = attachments
        .map((att) => {
          if (att.kind === 'drive_blob' && att.driveFileId) {
            return `
              <span class="log-audit-chip">
                <span aria-hidden="true">📎</span>
                <button type="button" class="chip-jump log-audit-chip-text"
                        style="color:var(--accent);"
                        data-open-drive-blob="${esc(att.driveFileId)}"
                        data-blob-name="${esc(att.name)}"
                        data-blob-mime="${esc(att.mimeType || '')}">
                  ${esc(att.name)}${att.size ? ` (${formatBytes(att.size)})` : ''}
                </button>
                <button type="button" class="chip-remove" data-rm-att="${esc(att.id)}" title="移除附檔">✕</button>
              </span>
            `;
          }
          const isUpload = att.kind === 'upload' && att.dataUrl;
          const href = isUpload ? att.dataUrl : safeUrl(att.url);
          const meta = isUpload ? null : OGSM.db.driveTypeMeta(att.driveType || OGSM.db.detectDriveType(att.url, att.name));
          return `
            <span class="log-audit-chip">
              ${isUpload ? '<span aria-hidden="true">📎</span>' : `<span class="drive-dot ${meta.cls}"></span>`}
              <a href="${esc(href)}" ${isUpload ? `download="${esc(att.name)}"` : 'target="_blank" rel="noopener noreferrer"'}
                 class="log-audit-chip-text" style="color:var(--accent);text-decoration:none;">
                ${esc(att.name)}${isUpload && att.size ? ` (${formatBytes(att.size)})` : ''}
              </a>
              <button type="button" class="chip-remove" data-rm-att="${esc(att.id)}" title="移除附檔">✕</button>
            </span>
          `;
        })
        .join('');

      attListEl.querySelectorAll('[data-rm-att]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.rmAtt;
          const removed = attachments.find((a) => a.id === id);
          if (removed && removed.kind === 'drive_blob' && removed.driveFileId && OGSM.auth) {
            OGSM.auth.deleteDriveBlob(removed.driveFileId);
          }
          attachments = attachments.filter((a) => a.id !== id);
          renderAttachmentsList();
        });
      });
    }

    async function handleLocalFilesUpload(fileList) {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      attachPanel.hidden = false;
      attProgressEl.hidden = false;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          attProgressEl.innerHTML = `<div class="muted-text" style="font-size:12px;">正在上傳 (${i + 1}/${files.length})：${esc(file.name)} (0%)...</div><div class="progress-track"><div class="progress-fill" style="width:2%"></div></div>`;
          const uploaded = await OGSM.auth.uploadDriveBlob(file, (pct) => {
            attProgressEl.innerHTML = `<div class="muted-text" style="font-size:12px;">正在上傳 (${i + 1}/${files.length})：${esc(file.name)} (${pct}%)...</div><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>`;
          });
          attachments.push({
            id: OGSM.db.uid('att'),
            kind: 'drive_blob',
            driveFileId: uploaded.driveFileId,
            name: uploaded.name,
            mimeType: uploaded.mimeType,
            size: uploaded.size,
            createdAt: new Date().toISOString(),
          });
          renderAttachmentsList();
          OGSM.store.toast(`已上傳附檔：${uploaded.name}`);
        } catch (err) {
          alert(`上傳「${file.name}」失敗：${err.message}`);
        }
      }
      attProgressEl.hidden = true;
      attProgressEl.innerHTML = '';
    }

    renderAttachmentsList();

    // 工具列排版指令
    hostEl.querySelectorAll('.tool-btn[data-cmd]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (isSourceMode) return;
        visualEl.focus();
        document.execCommand(btn.dataset.cmd, false, btn.dataset.val || null);
      });
    });

    // 插入可點擊超連結
    hostEl.querySelector('[data-act="link"]').addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (isSourceMode) return;
      const selText = (window.getSelection && window.getSelection().toString()) || '';
      const rawUrl = prompt('請輸入網址（支援 Google Drive 或任何網站連結）：', 'https://');
      if (!rawUrl || !rawUrl.trim()) return;
      const cleanHref = safeUrl(rawUrl.trim());
      visualEl.focus();
      if (selText.trim()) {
        document.execCommand('createLink', false, cleanHref);
      } else {
        const label = prompt('連結顯示名稱（留空則直接顯示網址）：', '') || cleanHref;
        const linkHtml = `<a href="${esc(cleanHref)}" target="_blank" rel="noopener noreferrer">${esc(label.trim() || cleanHref)}</a>&nbsp;`;
        document.execCommand('insertHTML', false, linkHtml);
      }
      visualEl.innerHTML = autoLinkUrls(visualEl.innerHTML);
    });

    // 貼上文字時自動把網址轉成可點選連結
    visualEl.addEventListener('paste', (e) => {
      const text = e.clipboardData && e.clipboardData.getData('text/plain');
      if (text && /^(https?:\/\/|www\.)\S+$/i.test(text.trim())) {
        e.preventDefault();
        const url = text.trim();
        const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        document.execCommand(
          'insertHTML',
          false,
          `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>&nbsp;`
        );
      }
    });

    // 失焦時自動將手打的純文字網址轉成可點擊連結
    visualEl.addEventListener('blur', () => {
      const linked = autoLinkUrls(visualEl.innerHTML);
      if (linked !== visualEl.innerHTML) {
        visualEl.innerHTML = linked;
      }
    });

    // 展開／收合附檔面板
    hostEl.querySelector('[data-act="attach"]').addEventListener('click', () => {
      attachPanel.hidden = !attachPanel.hidden;
    });

    // 加入雲端／網址附檔
    hostEl.querySelector('[data-att-add-url]').addEventListener('click', () => {
      const nameInput = hostEl.querySelector('[data-att-name]');
      const urlInput = hostEl.querySelector('[data-att-url]');
      const rawUrl = (urlInput.value || '').trim();
      if (!rawUrl) {
        OGSM.store.toast('請先貼上附檔網址');
        urlInput.focus();
        return;
      }
      const url = safeUrl(rawUrl);
      const name = (nameInput.value || '').trim() || rawUrl.replace(/^https?:\/\//i, '').slice(0, 42);
      const driveType = OGSM.db.detectDriveType(url, name);
      attachments.push({
        id: OGSM.db.uid('att'),
        kind: 'link',
        name,
        url,
        driveType,
        createdAt: new Date().toISOString(),
      });
      nameInput.value = '';
      urlInput.value = '';
      renderAttachmentsList();
      OGSM.store.toast(`已加入附檔：${name}`);
    });

    // 從裝置選擇檔案直接上傳（無大小限制，支援多檔）
    hostEl.querySelector('[data-att-file]').addEventListener('change', async (e) => {
      await handleLocalFilesUpload(e.target.files);
      e.target.value = '';
    });

    // 支援將本機檔案直接拖曳至附檔區或備註編輯畫布上傳
    [attDropzone, visualEl].forEach((zone) => {
      if (!zone) return;
      zone.addEventListener('dragover', (e) => {
        if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
          e.preventDefault();
          zone.classList.add('drag-over');
        }
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', async (e) => {
        zone.classList.remove('drag-over');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          e.preventDefault();
          await handleLocalFilesUpload(e.dataTransfer.files);
        }
      });
    });

    // 切換 HTML 原始碼
    btnSource.addEventListener('click', () => {
      if (!isSourceMode) {
        sourceEl.value = autoLinkUrls(visualEl.innerHTML);
        isSourceMode = true;
        visualEl.hidden = true;
        sourceEl.hidden = false;
        btnSource.classList.add('active');
      } else {
        visualEl.innerHTML = autoLinkUrls(sourceEl.value);
        isSourceMode = false;
        sourceEl.hidden = true;
        visualEl.hidden = false;
        btnSource.classList.remove('active');
      }
    });

    return {
      getHtml() {
        const raw = isSourceMode ? sourceEl.value : visualEl.innerHTML;
        const linked = autoLinkUrls(raw);
        return hasMeaningfulHtml(linked) ? linked : '';
      },
      getAttachments() {
        return attachments.slice();
      },
    };
  }

  OGSM.editor = {
    sanitizeHtml,
    autoLinkUrls,
    hasMeaningfulHtml,
    renderAttachmentChips,
    renderNoteBlock,
    mount,
  };
})(window);
