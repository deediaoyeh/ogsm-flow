/* ============================================================
   js/views/database.js — ⑤ 資料庫總覽、Google Drive 檔案庫與備份還原
   ============================================================ */
(function (global) {
  'use strict';

  const OGSM = (global.OGSM = global.OGSM || {});
  OGSM.views = OGSM.views || {};

  let fileTypeFilter = 'all';

  function render(container) {
    const store = OGSM.store;
    const { esc, safeUrl } = store;
    const data = store.state.data;
    const q = store.state.searchQuery;
    const measures = store.projectMeasures();
    const measureMap = new Map(measures.map((m) => [m.id, m]));

    const files = store.projectFiles().filter((f) => {
      if (fileTypeFilter !== 'all' && f.driveType !== fileTypeFilter) return false;
      if (q) {
        const linked = f.measureId ? measureMap.get(f.measureId) : null;
        return (
          (f.name || '').toLowerCase().includes(q) ||
          (f.note || '').toLowerCase().includes(q) ||
          (f.url || '').toLowerCase().includes(q) ||
          (linked && (linked.title || '').toLowerCase().includes(q))
        );
      }
      return true;
    });

    const stats = [
      { label: '專案 (Projects)', val: data.projects.length },
      { label: '目標 (Goals)', val: data.goals.length },
      { label: '策略 (Strategies)', val: data.strategies.length },
      { label: '行動 (Measures)', val: data.measures.length },
      { label: '待辦 (To-Dos)', val: data.todos.length },
      { label: '檢核項 (Checklists)', val: data.checklists.length },
      { label: 'Drive 檔案連結', val: data.files.length },
      { label: '覆盤紀錄 (Reviews)', val: data.reviews.length },
      { label: '工作日誌 (Logs)', val: (data.logs || []).length },
    ];

    const fileRowsHtml = files.length
      ? files
          .map((f) => {
            const meta = OGSM.db.driveTypeMeta(f.driveType);
            const linked = f.measureId ? measureMap.get(f.measureId) : null;
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
                <td><span class="pill">${meta.label}</span></td>
                <td>
                  ${
                    linked
                      ? `<span class="todo-link-tag" data-open-measure="${esc(linked.id)}">M · ${esc(linked.title)}</span>`
                      : `<span class="pill">專案共用</span>`
                  }
                </td>
                <td style="text-align:right;white-space:nowrap;">
                  <a class="btn btn-sm" href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer">開啟 ↗</a>
                  <button class="btn-icon danger" data-del-file="${esc(f.id)}" title="移除連結">✕</button>
                </td>
              </tr>
            `;
          })
          .join('')
      : `<tr><td colspan="4" class="muted-text" style="text-align:center;padding:28px;">目前尚無符合條件的 Google Drive 檔案連結。</td></tr>`;

    container.innerHTML = `
      <!-- IndexedDB 資料表即時狀態 + Google Drive 雲端同步與備份 -->
      <div class="section-header">
        <div>
          <h2 class="section-title">資料庫與 Google Drive 雲端同步</h2>
          <div class="muted-text" style="font-size:12px;">每次異動會自動同步至您 Google Drive 的專屬隱藏空間（appDataFolder），亦可手動匯出 JSON 備份</div>
        </div>
        <div class="row-gap-xs" style="flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" id="btnCloudSyncNow">↻ 立即同步雲端</button>
          <button class="btn btn-sm" id="btnExportJson">↓ 匯出 JSON</button>
          <label class="btn btn-sm" style="cursor:pointer;">
            ↑ 匯入 JSON
            <input type="file" id="inputImportJson" accept=".json,application/json" hidden />
          </label>
          <button class="btn btn-sm btn-danger" id="btnResetDemo">重設範例</button>
        </div>
      </div>

      <div class="db-stats-grid">
        ${stats
          .map(
            (s) => `
          <div class="db-stat-card">
            <div class="db-stat-num">${s.val}</div>
            <div class="db-stat-label">${esc(s.label)}</div>
          </div>
        `
          )
          .join('')}
      </div>

      <!-- Google Drive 檔案庫 -->
      <div class="card">
        <div class="section-header">
          <div class="row-gap-sm" style="flex-wrap:wrap;">
            <h2 class="section-title">目前專案 Google Drive 檔案庫</h2>
            <div class="seg-tabs">
              <button class="seg-tab ${fileTypeFilter === 'all' ? 'active' : ''}" data-ftype="all">全部</button>
              <button class="seg-tab ${fileTypeFilter === 'doc' ? 'active' : ''}" data-ftype="doc">Docs</button>
              <button class="seg-tab ${fileTypeFilter === 'sheet' ? 'active' : ''}" data-ftype="sheet">Sheets</button>
              <button class="seg-tab ${fileTypeFilter === 'slide' ? 'active' : ''}" data-ftype="slide">Slides</button>
              <button class="seg-tab ${fileTypeFilter === 'folder' ? 'active' : ''}" data-ftype="folder">資料夾</button>
            </div>
          </div>
          <button class="btn btn-sm btn-primary" id="btnAddDriveFile">＋ 新增 Drive 連結</button>
        </div>

        <div style="overflow-x:auto;">
          <table class="file-table">
            <thead>
              <tr>
                <th>檔案名稱與備註</th>
                <th style="width:90px;">類型</th>
                <th style="width:220px;">關聯項目</th>
                <th style="width:120px;text-align:right;">操作</th>
              </tr>
            </thead>
            <tbody>${fileRowsHtml}</tbody>
          </table>
        </div>
      </div>
    `;

    // 類型篩選
    container.querySelectorAll('[data-ftype]').forEach((btn) => {
      btn.addEventListener('click', () => {
        fileTypeFilter = btn.dataset.ftype;
        store.notify();
      });
    });

    // 新增 Drive 檔案
    const btnAddFile = container.querySelector('#btnAddDriveFile');
    if (btnAddFile) btnAddFile.addEventListener('click', () => OGSM.modals.openFileModal());

    // 刪除檔案連結
    container.querySelectorAll('[data-del-file]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await store.deleteRecord('files', btn.dataset.delFile);
        store.toast('已移除檔案連結');
      });
    });

    // 開啟關聯 M 抽屜
    container.querySelectorAll('[data-open-measure]').forEach((el) => {
      el.addEventListener('click', () => OGSM.drawer.open(el.dataset.openMeasure));
    });

    // 立即同步雲端
    const btnCloudSync = container.querySelector('#btnCloudSyncNow');
    if (btnCloudSync) {
      btnCloudSync.addEventListener('click', async () => {
        if (!OGSM.auth) return;
        await OGSM.auth.pushToDriveNow();
        store.toast('已將最新資料同步至 Google Drive');
      });
    }

    // 匯出 JSON 備份
    container.querySelector('#btnExportJson').addEventListener('click', async () => {
      const payload = await OGSM.db.exportAll();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ogsm-flow-backup-${store.todayStr()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      store.toast('已匯出 JSON 備份檔');
    });

    // 匯入 JSON 還原
    container.querySelector('#inputImportJson').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!confirm('匯入備份將會覆蓋目前瀏覽器資料庫內容，確定要還原嗎？')) return;
        await OGSM.db.importAll(parsed);
        await store.hydrate();
        if (OGSM.auth) await OGSM.auth.pushToDriveNow();
        store.toast('資料還原並同步至雲端成功！');
      } catch (err) {
        alert('匯入失敗：' + err.message);
      } finally {
        e.target.value = '';
      }
    });

    // 重設範例資料
    container.querySelector('#btnResetDemo').addEventListener('click', async () => {
      if (!confirm('確定要清空並重新載入初始範例專案嗎？建議先匯出備份。')) return;
      await OGSM.db.resetToSeed();
      await store.hydrate();
      if (OGSM.auth) await OGSM.auth.pushToDriveNow();
      store.toast('已重設為範例資料並同步雲端');
    });
  }

  OGSM.views.database = { render };
})(window);
