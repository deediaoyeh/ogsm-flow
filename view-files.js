/* ============================================================
   view-files.js — 專案專屬「檔案庫」（集中彙整專案檔案與 O / G / S / M 所有附檔）
   ============================================================ */
(function (global) {
  'use strict';

  const OGSM = (global.OGSM = global.OGSM || {});
  OGSM.views = OGSM.views || {};

  const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
  let typeFilter = 'all';
  let sourceFilter = 'all'; // 'all' | 'shared' | 'O' | 'G' | 'S' | 'M'

  function formatBytes(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  // 自動收集目前專案（或全部專案總覽）下所有分散在各處的檔案與附檔
  function collectProjectFiles(store) {
    const allMode = store.isAllMode();
    const items = [];
    const measMap = new Map(store.projectMeasures().map((m) => [m.id, m]));

    // 1. 來自 files 資料表（專案共用檔案 + 行動 M 掛載檔案）
    store.projectFiles().forEach((f) => {
      const linkedM = f.measureId ? measMap.get(f.measureId) : null;
      const isUpload = f.kind === 'upload' && f.dataUrl;
      items.push({
        uid: `file:${f.id}`,
        originStore: 'files',
        originId: f.id,
        attId: null,
        projectId: f.projectId,
        name: f.name || '未命名檔案',
        note: f.note || '',
        kind: isUpload ? 'upload' : 'link',
        url: f.url || '',
        dataUrl: f.dataUrl || '',
        size: f.size || 0,
        driveType: isUpload ? 'upload' : f.driveType || OGSM.db.detectDriveType(f.url, f.name),
        sourceLevel: linkedM ? 'M' : 'shared',
        sourceLabel: linkedM ? `M · ${linkedM.title}` : '專案共用',
        jumpMeasureId: linkedM ? linkedM.id : null,
        createdAt: f.createdAt || '',
      });
    });

    // 2. 來自 O（專案目的）備註附檔
    const projs = allMode ? store.state.data.projects : [store.currentProject()].filter(Boolean);
    projs.forEach((p) => {
      (p.attachments || []).forEach((att) => {
        const isUpload = att.kind === 'upload' && att.dataUrl;
        items.push({
          uid: `O:${p.id}:${att.id}`,
          originStore: 'projects',
          originId: p.id,
          attId: att.id,
          projectId: p.id,
          name: att.name || '未命名附檔',
          note: '來自目的 O 備註附檔',
          kind: isUpload ? 'upload' : 'link',
          url: att.url || '',
          dataUrl: att.dataUrl || '',
          size: att.size || 0,
          driveType: isUpload ? 'upload' : att.driveType || OGSM.db.detectDriveType(att.url, att.name),
          sourceLevel: 'O',
          sourceLabel: `O · ${p.name}`,
          jumpMeasureId: null,
          createdAt: att.createdAt || p.updatedAt || '',
        });
      });
    });

    // 3. 來自 G（目標）備註附檔
    store.projectGoals().forEach((g) => {
      (g.attachments || []).forEach((att) => {
        const isUpload = att.kind === 'upload' && att.dataUrl;
        items.push({
          uid: `G:${g.id}:${att.id}`,
          originStore: 'goals',
          originId: g.id,
          attId: att.id,
          projectId: g.projectId,
          name: att.name || '未命名附檔',
          note: '來自目標 G 備註附檔',
          kind: isUpload ? 'upload' : 'link',
          url: att.url || '',
          dataUrl: att.dataUrl || '',
          size: att.size || 0,
          driveType: isUpload ? 'upload' : att.driveType || OGSM.db.detectDriveType(att.url, att.name),
          sourceLevel: 'G',
          sourceLabel: `G · ${g.title}`,
          jumpMeasureId: null,
          createdAt: att.createdAt || g.updatedAt || '',
        });
      });
    });

    // 4. 來自 S（策略）備註附檔
    store.projectStrategies().forEach((s) => {
      (s.attachments || []).forEach((att) => {
        const isUpload = att.kind === 'upload' && att.dataUrl;
        items.push({
          uid: `S:${s.id}:${att.id}`,
          originStore: 'strategies',
          originId: s.id,
          attId: att.id,
          projectId: s.projectId,
          name: att.name || '未命名附檔',
          note: '來自策略 S 備註附檔',
          kind: isUpload ? 'upload' : 'link',
          url: att.url || '',
          dataUrl: att.dataUrl || '',
          size: att.size || 0,
          driveType: isUpload ? 'upload' : att.driveType || OGSM.db.detectDriveType(att.url, att.name),
          sourceLevel: 'S',
          sourceLabel: `S · ${s.title}`,
          jumpMeasureId: null,
          createdAt: att.createdAt || s.updatedAt || '',
        });
      });
    });

    // 5. 來自 M（行動）備註附檔
    store.projectMeasures().forEach((m) => {
      (m.attachments || []).forEach((att) => {
        const isUpload = att.kind === 'upload' && att.dataUrl;
        items.push({
          uid: `M:${m.id}:${att.id}`,
          originStore: 'measures',
          originId: m.id,
          attId: att.id,
          projectId: m.projectId,
          name: att.name || '未命名附檔',
          note: '來自行動 M 備註附檔',
          kind: isUpload ? 'upload' : 'link',
          url: att.url || '',
          dataUrl: att.dataUrl || '',
          size: att.size || 0,
          driveType: isUpload ? 'upload' : att.driveType || OGSM.db.detectDriveType(att.url, att.name),
          sourceLevel: 'M',
          sourceLabel: `M · ${m.title}`,
          jumpMeasureId: m.id,
          createdAt: att.createdAt || m.updatedAt || '',
        });
      });
    });

    items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return items;
  }

  function render(container) {
    const store = OGSM.store;
    const { esc, safeUrl } = store;
    const allMode = store.isAllMode();
    const project = store.currentProject();

    if (!store.hasAnyContext()) {
      container.innerHTML = `<div class="empty-state"><p>請先建立或選擇一個專案。</p></div>`;
      return;
    }

    const q = store.state.searchQuery;
    const allItems = collectProjectFiles(store);
    const archivedFiles = store.retainedFiles();

    const filtered = allItems.filter((it) => {
      if (typeFilter !== 'all' && it.driveType !== typeFilter) return false;
      if (sourceFilter !== 'all' && it.sourceLevel !== sourceFilter) return false;
      if (q) {
        const pName = store.projectNameById(it.projectId);
        return (
          (it.name || '').toLowerCase().includes(q) ||
          (it.note || '').toLowerCase().includes(q) ||
          (it.sourceLabel || '').toLowerCase().includes(q) ||
          pName.toLowerCase().includes(q)
        );
      }
      return true;
    });

    const filteredArchived = archivedFiles.filter(
      (f) => !q || (f.name || '').toLowerCase().includes(q) || (f.note || '').toLowerCase().includes(q)
    );

    const rowsHtml = filtered.length
      ? filtered
          .map((it) => {
            const isUpload = it.kind === 'upload';
            const meta = isUpload
              ? { label: '上傳附檔', cls: 'link' }
              : OGSM.db.driveTypeMeta(it.driveType);
            const href = isUpload ? it.dataUrl : safeUrl(it.url);
            return `
              <tr>
                <td>
                  <a href="${esc(href)}" ${isUpload ? `download="${esc(it.name)}"` : 'target="_blank" rel="noopener noreferrer"'}
                     style="display:inline-flex;align-items:center;gap:8px;font-weight:500;">
                    ${isUpload ? '<span aria-hidden="true">📎</span>' : `<span class="drive-dot ${meta.cls}"></span>`}
                    <span>${esc(it.name)}</span>
                  </a>
                  <div class="muted-text" style="font-size:11.5px;margin-top:2px;">
                    ${esc(it.note)}${isUpload && it.size ? ` · ${formatBytes(it.size)}` : ''}
                  </div>
                </td>
                <td><span class="pill ${isUpload ? 'amber' : ''}">${meta.label}</span></td>
                <td>
                  <div class="row-gap-xs" style="flex-wrap:wrap;">
                    ${allMode && it.projectId ? `<span class="proj-mini-tag">${esc(store.projectNameById(it.projectId))}</span>` : ''}
                    ${
                      it.jumpMeasureId
                        ? `<span class="todo-link-tag" data-open-measure="${esc(it.jumpMeasureId)}">${esc(it.sourceLabel)}</span>`
                        : `<span class="pill ${it.sourceLevel === 'shared' ? '' : 'blue'}" ${it.sourceLevel !== 'shared' ? 'data-jump-ogsm style="cursor:pointer;"' : ''}>${esc(it.sourceLabel)}</span>`
                    }
                  </div>
                </td>
                <td style="text-align:right;white-space:nowrap;">
                  <a class="btn btn-sm" href="${esc(href)}" ${isUpload ? `download="${esc(it.name)}"` : 'target="_blank" rel="noopener noreferrer"'}>
                    ${isUpload ? '下載 ↓' : '開啟 ↗'}
                  </a>
                  <button type="button" class="btn-icon danger"
                          data-remove-hub-file
                          data-origin-store="${esc(it.originStore)}"
                          data-origin-id="${esc(it.originId)}"
                          data-att-id="${esc(it.attId || '')}"
                          title="移除此檔案">✕</button>
                </td>
              </tr>
            `;
          })
          .join('')
      : `<tr><td colspan="4" class="muted-text" style="text-align:center;padding:32px 12px;">
          ${q || typeFilter !== 'all' || sourceFilter !== 'all' ? '沒有符合篩選條件的檔案。' : '此專案目前尚無檔案，點擊右上角「＋ 新增 Drive 連結」或「＋ 上傳檔案」集中管理！'}
        </td></tr>`;

    container.innerHTML = `
      <div class="card">
        <div class="section-header">
          <div>
            <h2 class="section-title">
              ${allMode ? `全部專案檔案集中中心 (${filtered.length})` : `「${esc(project.name)}」專案檔案庫 (${filtered.length})`}
            </h2>
            <div class="muted-text" style="font-size:12px;">
              自動集中呈現此專案的所有 Google Drive 檔案與 O / G / S / M 備註附檔
            </div>
          </div>
          <div class="row-gap-xs" style="flex-wrap:wrap;">
            <label class="btn btn-sm" style="cursor:pointer;">
              ＋ 上傳檔案（2MB 內）
              <input type="file" id="inputHubUploadFile" hidden />
            </label>
            <button type="button" class="btn btn-sm btn-primary" id="btnHubAddDrive">＋ 新增 Drive 連結</button>
          </div>
        </div>

        <!-- 篩選列：類型 + 來源層級 -->
        <div class="section-header" style="margin-bottom:12px;">
          <div class="seg-tabs">
            <button class="seg-tab ${typeFilter === 'all' ? 'active' : ''}" data-hub-type="all">全部 (${allItems.length})</button>
            <button class="seg-tab ${typeFilter === 'doc' ? 'active' : ''}" data-hub-type="doc">Docs</button>
            <button class="seg-tab ${typeFilter === 'sheet' ? 'active' : ''}" data-hub-type="sheet">Sheets</button>
            <button class="seg-tab ${typeFilter === 'slide' ? 'active' : ''}" data-hub-type="slide">Slides</button>
            <button class="seg-tab ${typeFilter === 'folder' ? 'active' : ''}" data-hub-type="folder">資料夾</button>
            <button class="seg-tab ${typeFilter === 'upload' ? 'active' : ''}" data-hub-type="upload">上傳附檔</button>
          </div>

          <select class="select" id="hubSourceFilter" style="width:auto;min-width:160px;padding:5px 9px;font-size:12px;" aria-label="依來源篩選">
            <option value="all" ${sourceFilter === 'all' ? 'selected' : ''}>所有來源位置</option>
            <option value="shared" ${sourceFilter === 'shared' ? 'selected' : ''}>專案共用檔案</option>
            <option value="O" ${sourceFilter === 'O' ? 'selected' : ''}>目的 O 附檔</option>
            <option value="G" ${sourceFilter === 'G' ? 'selected' : ''}>目標 G 附檔</option>
            <option value="S" ${sourceFilter === 'S' ? 'selected' : ''}>策略 S 附檔</option>
            <option value="M" ${sourceFilter === 'M' ? 'selected' : ''}>行動 M 檔案與附檔</option>
          </select>
        </div>

        <div style="overflow-x:auto;">
          <table class="file-table">
            <thead>
              <tr>
                <th>檔案名稱與說明</th>
                <th style="width:96px;">類型</th>
                <th style="width:240px;">來源歸屬</th>
                <th style="width:128px;text-align:right;">操作</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>

      ${
        filteredArchived.length
          ? `<div class="card" style="margin-top:16px;">
              <div class="section-header" style="margin-bottom:10px;">
                <div>
                  <h2 class="section-title">已留存的歷史檔案（原專案已刪除 · ${filteredArchived.length}）</h2>
                  <div class="muted-text" style="font-size:11.5px;">不混入現有專案，可隨時點「移入目前專案」歸檔</div>
                </div>
              </div>
              <div style="overflow-x:auto;">
                <table class="file-table">
                  <tbody>
                    ${filteredArchived
                      .map((f) => {
                        const meta = OGSM.db.driveTypeMeta(f.driveType);
                        return `
                          <tr>
                            <td>
                              <a href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer"
                                 style="display:inline-flex;align-items:center;gap:8px;font-weight:500;">
                                <span class="drive-dot ${meta.cls}"></span>
                                <span>${esc(f.name)}</span>
                              </a>
                              ${f.note ? `<div class="muted-text" style="font-size:11.5px;margin-top:2px;">${esc(f.note)}</div>` : ''}
                            </td>
                            <td style="width:96px;"><span class="pill">${meta.label}</span></td>
                            <td style="text-align:right;white-space:nowrap;">
                              ${project ? `<button type="button" class="btn btn-sm" data-adopt-file="${esc(f.id)}">移入目前專案</button>` : ''}
                              <a class="btn btn-sm" href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer">開啟 ↗</a>
                              <button type="button" class="btn-icon danger" data-del-archived="${esc(f.id)}" title="移除連結">✕</button>
                            </td>
                          </tr>
                        `;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>
            </div>`
          : ''
      }
    `;

    // 類型與來源篩選
    container.querySelectorAll('[data-hub-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        typeFilter = btn.dataset.hubType;
        store.notify();
      });
    });

    const srcSelect = container.querySelector('#hubSourceFilter');
    if (srcSelect) {
      srcSelect.addEventListener('change', () => {
        sourceFilter = srcSelect.value;
        store.notify();
      });
    }

    // 新增 Drive 連結
    container.querySelector('#btnHubAddDrive').addEventListener('click', () => OGSM.modals.openFileModal());

    // 直接上傳檔案至目前專案檔案庫（≤ 2MB）
    container.querySelector('#inputHubUploadFile').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (file.size > MAX_UPLOAD_BYTES) {
        alert(`「${file.name}」大小為 ${formatBytes(file.size)}，超過 2MB 限制。建議先上傳至 Google Drive 再用「＋ 新增 Drive 連結」加入！`);
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        await store.saveRecord('files', {
          id: OGSM.db.uid('file'),
          projectId: store.defaultWriteProjectId(),
          measureId: null,
          kind: 'upload',
          name: file.name,
          url: '',
          dataUrl: String(reader.result || ''),
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          driveType: 'upload',
          note: '直接上傳至專案檔案庫',
          createdAt: new Date().toISOString(),
        });
        store.toast(`已上傳「${file.name}」至專案檔案庫`);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });

    // 移除檔案（支援 files 表與 O/G/S/M 備註附檔）
    container.querySelectorAll('[data-remove-hub-file]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const originStore = btn.dataset.originStore;
        const originId = btn.dataset.originId;
        const attId = btn.dataset.attId;
        if (originStore === 'files') {
          await store.deleteRecord('files', originId);
          store.toast('已移除檔案');
        } else if (attId) {
          const rec = (store.state.data[originStore] || []).find((r) => r.id === originId);
          if (!rec) return;
          const nextAtts = (rec.attachments || []).filter((a) => a.id !== attId);
          await store.saveRecord(originStore, { ...rec, attachments: nextAtts });
          store.toast('已移除備註附檔');
        }
      });
    });

    // 歷史留存檔操作
    container.querySelectorAll('[data-adopt-file]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const f = store.state.data.files.find((item) => item.id === btn.dataset.adoptFile);
        if (!f || !project) return;
        await store.saveRecord('files', { ...f, projectId: project.id });
        store.toast('已將留存檔案移入目前專案');
      });
    });
    container.querySelectorAll('[data-del-archived]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await store.deleteRecord('files', btn.dataset.delArchived);
        store.toast('已移除歷史檔案連結');
      });
    });

    // 跳轉對應行動 M 或 OGSM
    container.querySelectorAll('[data-open-measure]').forEach((el) => {
      el.addEventListener('click', () => OGSM.drawer.open(el.dataset.openMeasure));
    });
    container.querySelectorAll('[data-jump-ogsm]').forEach((el) => {
      el.addEventListener('click', () => store.setView('ogsm'));
    });
  }

  OGSM.views.files = { render, collectProjectFiles };
})(window);
