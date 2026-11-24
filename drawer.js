/* ============================================================
   js/components/drawer.js — 右側行動詳情抽屜 & 通用簡易彈窗
   ============================================================ */
(function (global) {
  'use strict';

  const OGSM = (global.OGSM = global.OGSM || {});

  /* ------------------------------------------------------------
     右側詳情抽屜（編輯 M 排程、進度、Google Drive 檔案、Checklist、子 To-Do）
     ------------------------------------------------------------ */
  function openDrawer(measureId) {
    OGSM.store.state.activeDrawerMeasureId = measureId;
    renderDrawer();
    document.getElementById('drawerBackdrop').hidden = false;
    const drawer = document.getElementById('measureDrawer');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }

  function closeDrawer() {
    OGSM.store.state.activeDrawerMeasureId = null;
    document.getElementById('drawerBackdrop').hidden = true;
    const drawer = document.getElementById('measureDrawer');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }

  function renderDrawer() {
    const store = OGSM.store;
    const { esc, safeUrl } = store;
    const id = store.state.activeDrawerMeasureId;
    if (!id) return;

    const m = store.state.data.measures.find((item) => item.id === id);
    if (!m) {
      closeDrawer();
      return;
    }

    const goal = store.state.data.goals.find((g) => g.id === m.goalId);
    const strat = store.state.data.strategies.find((s) => s.id === m.strategyId);
    const status = store.measureStatus(m);
    const files = store.measureFiles(m.id);
    const checks = store.measureChecklists(m.id);
    const linkedTodos = store.state.data.todos.filter((t) => t.measureId === m.id);
    const linkedLogs = store.projectLogs().filter(
      (l) => l.measureId === m.id || (l.ogsmType === 'measure' && l.ogsmId === m.id)
    );
    const strategies = store.projectStrategies(null, m.projectId);

    const pill = document.getElementById('drawerStatusPill');
    pill.textContent = status.label;
    pill.className = `pill ${status.pillClass}`;
    document.getElementById('drawerCrumb').textContent = [
      goal ? `G: ${goal.title}` : null,
      strat ? `S: ${strat.title}` : null,
    ]
      .filter(Boolean)
      .join(' / ');

    const body = document.getElementById('drawerBody');
    body.innerHTML = `
      <!-- 基本排程與進度表單 -->
      <form class="form-stack" id="drawerMeasureForm">
        <div class="form-field">
          <label>行動項目名稱 (M)</label>
          <input type="text" class="input" name="title" value="${esc(m.title)}" required />
        </div>
        <div class="form-field">
          <label>衡量標準 / 驗收指標</label>
          <input type="text" class="input" name="metric" value="${esc(m.metric || '')}" placeholder="例如：回收 20 份有效問卷" />
        </div>
        <div class="form-field">
          <label>所屬策略 (S)</label>
          <select class="select" name="strategyId">
            ${strategies
              .map(
                (s) =>
                  `<option value="${esc(s.id)}" ${s.id === m.strategyId ? 'selected' : ''}>${esc(s.title)}</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>開始日期</label>
            <input type="date" class="input" name="startDate" value="${esc(m.startDate || '')}" />
          </div>
          <div class="form-field">
            <label>結束日期</label>
            <input type="date" class="input" name="endDate" value="${esc(m.endDate || '')}" />
          </div>
        </div>
        <div class="form-field">
          <div class="row-between">
            <label>完成進度</label>
            <strong id="drawerProgLabel" style="font-size:13px;color:var(--accent);">${Number(m.progress) || 0}%</strong>
          </div>
          <input type="range" name="progress" min="0" max="100" step="5" value="${Number(m.progress) || 0}" style="width:100%;accent-color:var(--accent);" />
        </div>
        <label class="row-gap-xs" style="font-size:12.5px;color:var(--text-secondary);cursor:pointer;">
          <input type="checkbox" name="isMilestone" ${m.isMilestone ? 'checked' : ''} />
          <span>在甘特圖上以菱形「里程碑」標記顯示</span>
        </label>
        <div class="form-field">
          <label>行動備註（HTML 編輯器・支援網址自動轉連結與附檔）</label>
          <div id="drawerMeasureNoteHost"></div>
        </div>
        <div class="row-between drawer-save-bar">
          <span class="muted-text" style="font-size:11.5px;">調整後點擊儲存立即同步甘特圖與 OGSM</span>
          <button type="submit" class="btn btn-primary btn-sm">儲存變更</button>
        </div>
      </form>

      <!-- Google Drive 相關檔案 -->
      <div class="drawer-section">
        <h3 class="drawer-section-title">
          <span>Google Drive 相關檔案 (${files.length})</span>
        </h3>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">
          ${
            files.length
              ? files
                  .map((f) => {
                    const meta = OGSM.db.driveTypeMeta(f.driveType);
                    return `
                      <div class="checklist-row">
                        <span class="drive-dot ${meta.cls}"></span>
                        <a href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer"
                           style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                          ${esc(f.name)}
                        </a>
                        <span class="muted-text" style="font-size:11px;">${meta.label}</span>
                        <button class="btn-icon danger" style="width:24px;height:24px;font-size:11px;"
                                data-drawer-del-file="${esc(f.id)}" title="移除連結">✕</button>
                      </div>
                    `;
                  })
                  .join('')
              : `<div class="muted-text" style="font-size:12px;">尚無連結，貼上 Google Drive 網址即可從甘特圖直接點開。</div>`
          }
        </div>
        <form class="form-stack" id="drawerAddFileForm" style="gap:7px;">
          <input type="text" class="input" name="name" placeholder="檔案名稱（例如：專案簡報 v2）" required style="padding:7px 10px;font-size:12.5px;" />
          <div class="row-gap-xs drawer-file-url-row">
            <input type="url" class="input" name="url" placeholder="貼上 Google Drive 連結 (https://...)" required style="padding:7px 10px;font-size:12.5px;" />
            <button type="submit" class="btn btn-sm">＋ 掛載</button>
          </div>
        </form>
      </div>

      <!-- 任務檢核清單 Checklist -->
      <div class="drawer-section">
        <h3 class="drawer-section-title">
          <span>檢核清單 Checklist (${checks.filter((c) => c.checked).length}/${checks.length})</span>
        </h3>
        <div class="checklist-items" style="margin-bottom:8px;">
          ${
            checks.length
              ? checks
                  .map(
                    (c) => `
                    <div class="checklist-row ${c.checked ? 'done' : ''}">
                      <button class="checkbox-round ${c.checked ? 'checked' : ''}" data-drawer-chk="${esc(c.id)}">${c.checked ? '✓' : ''}</button>
                      <span style="flex:1;">${esc(c.text)}</span>
                      <button class="btn-icon danger" style="width:24px;height:24px;font-size:11px;" data-drawer-del-chk="${esc(c.id)}">✕</button>
                    </div>
                  `
                  )
                  .join('')
              : `<div class="muted-text" style="font-size:12px;">尚未設定驗收檢核點。</div>`
          }
        </div>
        <form class="checklist-add-inline" id="drawerAddCheckForm">
          <input type="text" class="input" placeholder="新增檢核項目..." style="padding:6px 10px;font-size:12.5px;" />
          <button type="submit" class="btn btn-sm">＋</button>
        </form>
      </div>

      <!-- 關聯子 To-Do -->
      <div class="drawer-section">
        <h3 class="drawer-section-title">
          <span>關聯 To-Do 待辦 (${linkedTodos.filter((t) => t.completed).length}/${linkedTodos.length})</span>
        </h3>
        <div class="checklist-items" style="margin-bottom:8px;">
          ${
            linkedTodos.length
              ? linkedTodos
                  .map(
                    (t) => `
                    <div class="checklist-row ${t.completed ? 'done' : ''}">
                      <button class="checkbox-round ${t.completed ? 'checked' : ''}" data-drawer-todo="${esc(t.id)}">${t.completed ? '✓' : ''}</button>
                      <span style="flex:1;">${esc(t.title)}</span>
                      ${t.dueDate ? `<span class="muted-text" style="font-size:11px;">${esc(store.shortDate(t.dueDate))}</span>` : ''}
                    </div>
                  `
                  )
                  .join('')
              : `<div class="muted-text" style="font-size:12px;">尚未拆出子待辦事項。</div>`
          }
        </div>
        <form class="checklist-add-inline" id="drawerAddTodoForm">
          <input type="text" class="input" placeholder="快速新增一筆子 To-Do..." style="padding:6px 10px;font-size:12.5px;" />
          <button type="submit" class="btn btn-sm">＋</button>
        </form>
      </div>

      <!-- 關聯工作日誌 -->
      <div class="drawer-section">
        <h3 class="drawer-section-title">
          <span>關聯工作日誌 (${linkedLogs.length})</span>
          <button type="button" class="btn-ghost-xs" id="btnDrawerCreateLog">＋ 寫日誌</button>
        </h3>
        <div class="checklist-items">
          ${
            linkedLogs.length
              ? linkedLogs
                  .map((l) => {
                    const topic = (l.title || '').trim() || `未命名主題（${l.date || '無日期'}）`;
                    return `
                    <button type="button" class="checklist-row" style="width:100%;border:none;text-align:left;cursor:pointer;" data-drawer-open-log="${esc(l.id)}">
                      <span style="color:var(--accent);font-size:12px;">✎</span>
                      <span style="flex:1;font-weight:500;">${esc(topic)}</span>
                      <span class="pill" style="font-size:10.5px;">${esc(store.shortDate(l.date))}</span>
                    </button>
                  `;
                  })
                  .join('')
              : `<div class="muted-text" style="font-size:12px;">尚無關聯工作日誌，點右上角「＋ 寫日誌」可記錄今日進展。</div>`
          }
        </div>
      </div>
    `;

    // 掛載行動 M 的 HTML 備註與附檔編輯器
    const measureNoteEd = OGSM.editor.mount(body.querySelector('#drawerMeasureNoteHost'), {
      initialHtml: m.noteHtml || '',
      attachments: m.attachments || [],
      placeholder: '填寫行動 M 的詳細備註、貼上網址（自動轉可點擊連結）或加入附檔...',
    });

    // 綁定滑桿即時數字
    const form = body.querySelector('#drawerMeasureForm');
    const progInput = form.querySelector('input[name="progress"]');
    const progLabel = body.querySelector('#drawerProgLabel');
    progInput.addEventListener('input', () => {
      progLabel.textContent = progInput.value + '%';
    });

    // 儲存 M 變更
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const selectedStratId = fd.get('strategyId');
      const selectedStrat = store.state.data.strategies.find((s) => s.id === selectedStratId);
      const startDate = fd.get('startDate');
      let endDate = fd.get('endDate');
      if (startDate && endDate && endDate < startDate) endDate = startDate;
      await store.saveRecord('measures', {
        ...m,
        title: String(fd.get('title')).trim(),
        metric: String(fd.get('metric') || '').trim(),
        strategyId: selectedStratId,
        goalId: selectedStrat ? selectedStrat.goalId : m.goalId,
        startDate,
        endDate,
        progress: Number(fd.get('progress')) || 0,
        isMilestone: form.querySelector('input[name="isMilestone"]').checked,
        noteHtml: measureNoteEd.getHtml(),
        attachments: measureNoteEd.getAttachments(),
      });
      store.toast('已儲存行動項目');
    });

    // 新增 Google Drive 連結
    body.querySelector('#drawerAddFileForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const name = String(fd.get('name')).trim();
      const url = String(fd.get('url')).trim();
      if (!name || !url) return;
      await store.saveRecord('files', {
        id: OGSM.db.uid('file'),
        projectId: m.projectId,
        measureId: m.id,
        name,
        url,
        driveType: OGSM.db.detectDriveType(url, name),
        note: '',
        createdAt: new Date().toISOString(),
      });
      store.toast('已掛載 Google Drive 檔案');
    });

    body.querySelectorAll('[data-drawer-del-file]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await store.deleteRecord('files', btn.dataset.drawerDelFile);
        store.toast('已移除檔案連結');
      });
    });

    // 檢核清單操作
    body.querySelector('#drawerAddCheckForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input');
      const text = input.value.trim();
      if (!text) return;
      await store.saveRecord('checklists', {
        id: OGSM.db.uid('chk'),
        projectId: m.projectId,
        measureId: m.id,
        text,
        checked: false,
        order: checks.length + 1,
      });
    });

    body.querySelectorAll('[data-drawer-chk]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const c = store.state.data.checklists.find((item) => item.id === btn.dataset.drawerChk);
        if (c) await store.saveRecord('checklists', { ...c, checked: !c.checked });
      });
    });

    body.querySelectorAll('[data-drawer-del-chk]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await store.deleteRecord('checklists', btn.dataset.drawerDelChk);
      });
    });

    // 子 To-Do 操作
    body.querySelector('#drawerAddTodoForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input');
      const title = input.value.trim();
      if (!title) return;
      await store.saveRecord('todos', {
        id: OGSM.db.uid('todo'),
        projectId: m.projectId,
        measureId: m.id,
        title,
        dueDate: m.endDate || store.todayStr(),
        completed: false,
        createdAt: new Date().toISOString(),
      });
      store.toast('已加入子 To-Do');
    });

    body.querySelectorAll('[data-drawer-todo]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const t = store.state.data.todos.find((item) => item.id === btn.dataset.drawerTodo);
        if (t) await store.saveRecord('todos', { ...t, completed: !t.completed });
      });
    });

    // 關聯工作日誌操作
    const btnDrawerCreateLog = body.querySelector('#btnDrawerCreateLog');
    if (btnDrawerCreateLog) {
      btnDrawerCreateLog.addEventListener('click', async () => {
        closeDrawer();
        await OGSM.views.logs.createNewLog({ projectId: m.projectId, ogsmType: 'measure', ogsmId: m.id, measureId: m.id });
        store.setView('logs');
      });
    }
    body.querySelectorAll('[data-drawer-open-log]').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeDrawer();
        OGSM.views.logs.openLogById(btn.dataset.drawerOpenLog);
      });
    });
  }

  /* ------------------------------------------------------------
     通用輕量 Modal（建立/編輯 Project, Goal, Strategy, Measure, File, Review）
     ------------------------------------------------------------ */
  function openModal(title, html, onMount) {
    document.getElementById('modalTitle').textContent = title;
    const body = document.getElementById('modalBody');
    body.innerHTML = html;
    document.getElementById('modalBackdrop').hidden = false;
    if (typeof onMount === 'function') onMount(body);
  }

  function closeModal() {
    document.getElementById('modalBackdrop').hidden = true;
    document.getElementById('modalBody').innerHTML = '';
  }

  function openProjectModal(existing) {
    const store = OGSM.store;
    const { esc } = store;
    const isEdit = Boolean(existing);
    openModal(
      isEdit ? '編輯專案與目的 (O)' : '建立新 OGSM 專案',
      `
        <form class="form-stack" id="modalProjectForm">
          <div class="form-field">
            <label>專案名稱</label>
            <input type="text" class="input" name="name" value="${esc(existing ? existing.name : '')}" placeholder="例如：2026 Q4 個人產品上線" required />
          </div>
          <div class="form-field">
            <label>O · Objective（專案目的／核心願景）</label>
            <textarea class="textarea" name="objective" placeholder="用一句話說清楚這個專案最終想達成的價值..." required>${esc(existing ? existing.objective : '')}</textarea>
          </div>
          <div class="form-field">
            <label>專案週期</label>
            <input type="text" class="input" name="period" value="${esc(existing ? existing.period : '')}" placeholder="例如：2026-11 ～ 2027-01" />
          </div>
          <div class="form-field">
            <label>目的 O 備註（HTML 編輯器・支援網址自動轉連結與附檔）</label>
            <div id="modalProjectNoteHost"></div>
          </div>
          <div class="modal-footer" style="justify-content:space-between;">
            ${
              isEdit
                ? `<button type="button" class="btn btn-danger btn-sm" id="btnDelProj">刪除專案</button>`
                : '<span></span>'
            }
            <div class="row-gap-xs">
              <button type="button" class="btn" data-close-modal>取消</button>
              <button type="submit" class="btn btn-primary">儲存</button>
            </div>
          </div>
        </form>
      `,
      (body) => {
        const noteEd = OGSM.editor.mount(body.querySelector('#modalProjectNoteHost'), {
          initialHtml: existing ? existing.noteHtml || '' : '',
          attachments: existing ? existing.attachments || [] : [],
          placeholder: '填寫專案背景、參考網址（貼上即轉可點擊連結）或加入相關附檔...',
        });
        body.querySelector('[data-close-modal]').addEventListener('click', closeModal);
        const delBtn = body.querySelector('#btnDelProj');
        if (delBtn) {
          delBtn.addEventListener('click', () => {
            openDeleteProjectModal(existing);
          });
        }
        body.querySelector('#modalProjectForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          localStorage.removeItem('ogsm_user_deleted_all');
          const record = {
            ...(existing || {}),
            id: existing ? existing.id : OGSM.db.uid('proj'),
            name: String(fd.get('name')).trim(),
            objective: String(fd.get('objective')).trim(),
            period: String(fd.get('period') || '').trim(),
            noteHtml: noteEd.getHtml(),
            attachments: noteEd.getAttachments(),
            createdAt: existing ? existing.createdAt : new Date().toISOString(),
          };
          await store.saveRecord('projects', record);
          if (!isEdit) store.setProject(record.id);
          closeModal();
          store.toast(isEdit ? '已更新專案目的' : '已建立新專案');
        });
      }
    );
  }

  function openDeleteProjectModal(project) {
    const store = OGSM.store;
    const { esc, safeUrl } = store;
    if (!project) {
      store.toast('目前沒有可刪除的專案');
      return;
    }

    const projFiles = store.state.data.files.filter((f) => f.projectId === project.id);
    const isLastProject = store.state.data.projects.length <= 1;

    openModal(
      `刪除專案：${project.name}`,
      `
        <form class="form-stack" id="modalDeleteProjectForm">
          <div class="auth-message error" style="margin:0;">
            刪除後將移除「${esc(project.name)}」底下的所有目標 G、策略 S、行動 M、待辦、檢核清單、覆盤與工作日誌。
          </div>

          <!-- 1. 專案掛載的 Google Drive 檔案連結處置 -->
          <div class="form-field">
            <label>① 此專案內記錄的 Google Drive 檔案連結（共 ${projFiles.length} 筆）</label>
            <label class="radio-option-card">
              <input type="radio" name="fileLinkAction" value="keep" checked />
              <div>
                <strong>留存檔案連結（推薦）</strong>
                <div class="muted-text" style="font-size:11.5px;">刪除專案但保留這些 Google Drive 連結在「檔案庫（已留存）」，日後可隨時開啟或轉移到新專案。</div>
              </div>
            </label>
            <label class="radio-option-card">
              <input type="radio" name="fileLinkAction" value="delete" />
              <div>
                <strong>一併移除專案內的檔案連結記錄</strong>
                <div class="muted-text" style="font-size:11.5px;">從系統資料庫清除連結；因本系統採最小權限 <code>drive.appdata</code>，不會擅自刪除您 Google Drive 原檔。</div>
              </div>
            </label>
          </div>

          ${
            projFiles.length
              ? `<div class="form-field">
                  <label>若也要在 Google Drive 本體刪除檔案，可直接點開處理：</label>
                  <div class="log-link-chips" style="max-height:92px;overflow-y:auto;">
                    ${projFiles
                      .map(
                        (f) =>
                          `<a class="drive-chip" href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer">${esc(f.name)} ↗</a>`
                      )
                      .join('')}
                  </div>
                </div>`
              : ''
          }

          <!-- 2. Google Drive 雲端同步資料庫檔案處置 -->
          <div class="form-field">
            <label>② Google Drive 雲端同步檔（<code>ogsm-flow-db.json</code>）</label>
            <label class="radio-option-card">
              <input type="radio" name="cloudAction" value="sync" checked />
              <div>
                <strong>立即同步刪除結果至 Google Drive</strong>
                <div class="muted-text" style="font-size:11.5px;">更新雲端檔案，讓手機與電腦同步移除此專案。</div>
              </div>
            </label>
            <label class="radio-option-card">
              <input type="radio" name="cloudAction" value="keep_cloud" />
              <div>
                <strong>暫時留存 Google Drive 原雲端檔（不覆寫）</strong>
                <div class="muted-text" style="font-size:11.5px;">先僅刪除本機畫面上的專案，保留 Google Drive 雲端舊檔作為備份（下次登入會重新載入，或您可先匯出 JSON）。</div>
              </div>
            </label>
            ${
              isLastProject
                ? `<label class="radio-option-card danger">
                    <input type="radio" name="cloudAction" value="delete_cloud_file" />
                    <div>
                      <strong>直接刪除 Google Drive 內的同步檔（完全清空雲端）</strong>
                      <div class="muted-text" style="font-size:11.5px;">此為最後一個專案，將直接移除 Google Drive 隱藏空間中的 <code>ogsm-flow-db.json</code>。</div>
                    </div>
                  </label>`
                : ''
            }
          </div>

          <div class="modal-footer">
            <button type="button" class="btn" data-close-modal>取消</button>
            <button type="submit" class="btn btn-danger">確認刪除專案</button>
          </div>
        </form>
      `,
      (body) => {
        body.querySelector('[data-close-modal]').addEventListener('click', closeModal);
        body.querySelector('#modalDeleteProjectForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const keepFileLinks = fd.get('fileLinkAction') !== 'delete';
          const cloudAction = String(fd.get('cloudAction') || 'sync');
          try {
            await store.deleteProjectCascade(project.id, { keepFileLinks, cloudAction });
            closeModal();
            if (cloudAction === 'delete_cloud_file') {
              store.toast('已刪除專案並移除 Google Drive 雲端同步檔');
            } else if (cloudAction === 'keep_cloud') {
              store.toast('已刪除本機專案（Google Drive 雲端檔案已留存）');
            } else {
              store.toast(keepFileLinks ? '已刪除專案並留存 Google Drive 連結' : '已刪除專案並同步至 Google Drive');
            }
          } catch (err) {
            store.toast('刪除過程發生錯誤：' + err.message);
          }
        });
      }
    );
  }

  function openGoalModal(existing) {
    const store = OGSM.store;
    const { esc } = store;
    const isEdit = Boolean(existing);
    openModal(
      isEdit ? '編輯目標 (G)' : '新增目標 (G)',
      `
        <form class="form-stack" id="modalGoalForm">
          <div class="form-field">
            <label>目標描述 (G)</label>
            <input type="text" class="input" name="title" value="${esc(existing ? existing.title : '')}" placeholder="例如：取得 20 份種子用戶有效回饋" required />
          </div>
          <div class="form-row">
            <div class="form-field">
              <label>量化指標名稱</label>
              <input type="text" class="input" name="metricName" value="${esc(existing ? existing.metricName : '')}" placeholder="例如：回饋問卷數" />
            </div>
            <div class="form-field">
              <label>截止日期</label>
              <input type="date" class="input" name="deadline" value="${esc(existing ? existing.deadline : OGSM.db.offsetDate(30))}" />
            </div>
          </div>
          <div class="form-row form-row-3">
            <div class="form-field">
              <label>目前數值</label>
              <input type="number" step="any" class="input" name="currentValue" value="${existing ? existing.currentValue : 0}" />
            </div>
            <div class="form-field">
              <label>目標數值</label>
              <input type="number" step="any" class="input" name="targetValue" value="${existing ? existing.targetValue : 100}" required />
            </div>
            <div class="form-field">
              <label>單位</label>
              <input type="text" class="input" name="unit" value="${esc(existing ? existing.unit : '%')}" placeholder="份/篇/%" />
            </div>
          </div>
          <div class="form-field">
            <label>目標 G 備註（HTML 編輯器・支援網址自動轉連結與附檔）</label>
            <div id="modalGoalNoteHost"></div>
          </div>
          <div class="modal-footer" style="justify-content:space-between;">
            ${isEdit ? `<button type="button" class="btn btn-danger btn-sm" id="btnDelGoal">刪除目標</button>` : '<span></span>'}
            <div class="row-gap-xs">
              <button type="button" class="btn" data-close-modal>取消</button>
              <button type="submit" class="btn btn-primary">儲存</button>
            </div>
          </div>
        </form>
      `,
      (body) => {
        const noteEd = OGSM.editor.mount(body.querySelector('#modalGoalNoteHost'), {
          initialHtml: existing ? existing.noteHtml || '' : '',
          attachments: existing ? existing.attachments || [] : [],
          placeholder: '填寫目標 G 的衡量說明、參考資料連結或附檔...',
        });
        body.querySelector('[data-close-modal]').addEventListener('click', closeModal);
        const delBtn = body.querySelector('#btnDelGoal');
        if (delBtn) {
          delBtn.addEventListener('click', async () => {
            if (!confirm('刪除此目標將一併刪除底下的策略與行動項目，確定繼續？')) return;
            await store.deleteGoalCascade(existing.id);
            closeModal();
            store.toast('已刪除目標');
          });
        }
        body.querySelector('#modalGoalForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          await store.saveRecord('goals', {
            ...(existing || {}),
            id: existing ? existing.id : OGSM.db.uid('goal'),
            projectId: existing ? existing.projectId : store.defaultWriteProjectId(),
            title: String(fd.get('title')).trim(),
            metricName: String(fd.get('metricName') || '').trim(),
            currentValue: Number(fd.get('currentValue')) || 0,
            targetValue: Number(fd.get('targetValue')) || 100,
            unit: String(fd.get('unit') || '').trim(),
            deadline: String(fd.get('deadline') || ''),
            noteHtml: noteEd.getHtml(),
            attachments: noteEd.getAttachments(),
            order: existing ? existing.order : store.projectGoals().length + 1,
          });
          closeModal();
          store.toast(isEdit ? '已更新目標 G' : '已新增目標 G');
        });
      }
    );
  }

  function openStrategyModal(existing, presetGoalId) {
    const store = OGSM.store;
    const { esc } = store;
    const isEdit = Boolean(existing);
    const goals = store.projectGoals();
    if (!goals.length) {
      store.toast('請先建立至少一個目標 G');
      return;
    }
    const activeGoalId = existing ? existing.goalId : presetGoalId || goals[0].id;
    openModal(
      isEdit ? '編輯策略 (S)' : '新增策略 (S)',
      `
        <form class="form-stack" id="modalStrategyForm">
          <div class="form-field">
            <label>所屬目標 (G)</label>
            <select class="select" name="goalId">
              ${goals.map((g) => `<option value="${esc(g.id)}" ${g.id === activeGoalId ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label>策略標題 (S)</label>
            <input type="text" class="input" name="title" value="${esc(existing ? existing.title : '')}" placeholder="例如：聚焦核心功能，兩週完成原型" required />
          </div>
          <div class="form-field">
            <label>策略 S 備註（HTML 編輯器・支援網址自動轉連結與附檔）</label>
            <div id="modalStrategyNoteHost"></div>
          </div>
          <div class="modal-footer" style="justify-content:space-between;">
            ${isEdit ? `<button type="button" class="btn btn-danger btn-sm" id="btnDelStrat">刪除策略</button>` : '<span></span>'}
            <div class="row-gap-xs">
              <button type="button" class="btn" data-close-modal>取消</button>
              <button type="submit" class="btn btn-primary">儲存</button>
            </div>
          </div>
        </form>
      `,
      (body) => {
        const legacyHtml =
          existing && !existing.noteHtml && existing.description
            ? `<p>${esc(existing.description)}</p>`
            : existing
            ? existing.noteHtml || ''
            : '';
        const noteEd = OGSM.editor.mount(body.querySelector('#modalStrategyNoteHost'), {
          initialHtml: legacyHtml,
          attachments: existing ? existing.attachments || [] : [],
          placeholder: '填寫策略執行原則、參考網址或附檔...',
        });
        body.querySelector('[data-close-modal]').addEventListener('click', closeModal);
        const delBtn = body.querySelector('#btnDelStrat');
        if (delBtn) {
          delBtn.addEventListener('click', async () => {
            if (!confirm('刪除此策略將一併刪除底下的行動項目 M，確定繼續？')) return;
            await store.deleteStrategyCascade(existing.id);
            closeModal();
            store.toast('已刪除策略');
          });
        }
        body.querySelector('#modalStrategyForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const goalId = String(fd.get('goalId'));
          const parentGoal = goals.find((g) => g.id === goalId);
          await store.saveRecord('strategies', {
            ...(existing || {}),
            id: existing ? existing.id : OGSM.db.uid('strat'),
            projectId: parentGoal ? parentGoal.projectId : store.defaultWriteProjectId(),
            goalId,
            title: String(fd.get('title')).trim(),
            description: '',
            noteHtml: noteEd.getHtml(),
            attachments: noteEd.getAttachments(),
            order: existing ? existing.order : store.projectStrategies().length + 1,
          });
          closeModal();
          store.toast(isEdit ? '已更新策略 S' : '已新增策略 S');
        });
      }
    );
  }

  function openMeasureCreateModal(presetGoalId, presetStrategyId) {
    const store = OGSM.store;
    const { esc } = store;
    const allMode = store.isAllMode();
    const strategies = store.projectStrategies();
    if (!strategies.length) {
      store.toast('請先在 OGSM 藍圖建立目標 G 與策略 S');
      return;
    }
    const activeStratId = presetStrategyId || strategies[0].id;
    openModal(
      '新增行動計畫 (M)',
      `
        <form class="form-stack" id="modalMeasureForm">
          <div class="form-field">
            <label>所屬策略 (S)</label>
            <select class="select" name="strategyId">
              ${strategies
                .map(
                  (s) =>
                    `<option value="${esc(s.id)}" ${s.id === activeStratId ? 'selected' : ''}>${allMode ? `【${esc(store.projectNameById(s.projectId))}】` : ''}${esc(s.title)}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="form-field">
            <label>行動項目名稱 (M)</label>
            <input type="text" class="input" name="title" placeholder="例如：完成首版測試與回饋彙整" required />
          </div>
          <div class="form-field">
            <label>衡量指標 / 完成定義</label>
            <input type="text" class="input" name="metric" placeholder="例如：回收 10 份測試表單" />
          </div>
          <div class="form-row">
            <div class="form-field">
              <label>開始日期</label>
              <input type="date" class="input" name="startDate" value="${esc(store.todayStr())}" required />
            </div>
            <div class="form-field">
              <label>結束日期</label>
              <input type="date" class="input" name="endDate" value="${esc(OGSM.db.offsetDate(7))}" required />
            </div>
          </div>
          <div class="form-field">
            <label>Google Drive 檔案連結（選填，將同步加入專案檔案庫）</label>
            <input type="url" class="input" name="driveUrl" placeholder="https://docs.google.com/..." />
          </div>
          <div class="form-field">
            <label>行動 M 備註（HTML 編輯器・支援網址自動轉連結與附檔）</label>
            <div id="modalMeasureNoteHost"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn" data-close-modal>取消</button>
            <button type="submit" class="btn btn-primary">建立行動 M</button>
          </div>
        </form>
      `,
      (body) => {
        const noteEd = OGSM.editor.mount(body.querySelector('#modalMeasureNoteHost'), {
          initialHtml: '',
          attachments: [],
          placeholder: '填寫行動 M 的執行細節、參考網址或附檔...',
        });
        body.querySelector('[data-close-modal]').addEventListener('click', closeModal);
        body.querySelector('#modalMeasureForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const stratId = String(fd.get('strategyId'));
          const strat = store.state.data.strategies.find((s) => s.id === stratId);
          const startDate = String(fd.get('startDate'));
          let endDate = String(fd.get('endDate'));
          if (endDate < startDate) endDate = startDate;
          const mId = OGSM.db.uid('meas');
          const title = String(fd.get('title')).trim();
          await store.saveRecord('measures', {
            id: mId,
            projectId: strat ? strat.projectId : store.defaultWriteProjectId(),
            goalId: strat ? strat.goalId : presetGoalId || null,
            strategyId: stratId,
            title,
            metric: String(fd.get('metric') || '').trim(),
            startDate,
            endDate,
            progress: 0,
            isMilestone: false,
            noteHtml: noteEd.getHtml(),
            attachments: noteEd.getAttachments(),
            order: store.projectMeasures().length + 1,
          });
          const driveUrl = String(fd.get('driveUrl') || '').trim();
          if (driveUrl) {
            await store.saveRecord('files', {
              id: OGSM.db.uid('file'),
              projectId: strat ? strat.projectId : store.defaultWriteProjectId(),
              measureId: mId,
              name: `${title} — 相關文件`,
              url: driveUrl,
              driveType: OGSM.db.detectDriveType(driveUrl, title),
              note: '',
              createdAt: new Date().toISOString(),
            });
          }
          closeModal();
          store.toast('已新增行動計畫 M');
        });
      }
    );
  }

  function openFileModal() {
    const store = OGSM.store;
    const { esc } = store;
    const allMode = store.isAllMode();
    const projects = store.state.data.projects;
    const measures = store.projectMeasures();
    openModal(
      '新增 Google Drive 檔案連結',
      `
        <form class="form-stack" id="modalFileForm">
          ${
            allMode && projects.length
              ? `<div class="form-field">
                  <label>歸屬專案</label>
                  <select class="select" name="projectId">
                    ${projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
                  </select>
                </div>`
              : ''
          }
          <div class="form-field">
            <label>檔案名稱</label>
            <input type="text" class="input" name="name" placeholder="例如：Q4 行銷預算試算表" required />
          </div>
          <div class="form-field">
            <label>Google Drive 網址</label>
            <input type="url" class="input" name="url" placeholder="貼上 Google Docs / Sheets / Slides / Drive 資料夾連結" required />
          </div>
          <div class="form-field">
            <label>關聯至行動項目 (M)</label>
            <select class="select" name="measureId">
              <option value="">專案共用檔案（顯示在 OGSM 頂部）</option>
              ${measures
                .map(
                  (m) =>
                    `<option value="${esc(m.id)}">${allMode ? `【${esc(store.projectNameById(m.projectId))}】` : ''}M · ${esc(m.title)}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="form-field">
            <label>簡短備註（選填）</label>
            <input type="text" class="input" name="note" placeholder="例如：定案版、每週更新" />
          </div>
          <div class="modal-footer">
            <button type="button" class="btn" data-close-modal>取消</button>
            <button type="submit" class="btn btn-primary">加入檔案庫</button>
          </div>
        </form>
      `,
      (body) => {
        body.querySelector('[data-close-modal]').addEventListener('click', closeModal);
        body.querySelector('#modalFileForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const name = String(fd.get('name')).trim();
          const url = String(fd.get('url')).trim();
          const mId = fd.get('measureId') || null;
          const matchedM = mId ? measures.find((item) => item.id === mId) : null;
          const ownerProjId = matchedM
            ? matchedM.projectId
            : fd.get('projectId') || store.defaultWriteProjectId();
          await store.saveRecord('files', {
            id: OGSM.db.uid('file'),
            projectId: ownerProjId,
            measureId: mId,
            name,
            url,
            driveType: OGSM.db.detectDriveType(url, name),
            note: String(fd.get('note') || '').trim(),
            createdAt: new Date().toISOString(),
          });
          closeModal();
          store.toast('已新增 Google Drive 檔案連結');
        });
      }
    );
  }

  function openReviewModal(existing) {
    const store = OGSM.store;
    const { esc } = store;
    const isEdit = Boolean(existing);
    const allMode = store.isAllMode();
    const projects = store.state.data.projects;
    const snap = store.projectSummary(existing ? existing.projectId : null);
    const goalRate = existing ? existing.snapshotGoalRate : snap.avgGoalRate;
    const measureRate = existing ? existing.snapshotMeasureRate : snap.avgMeasureRate;
    const checklistRate = existing ? existing.snapshotChecklistRate : snap.checklistRate;
    const today = store.todayStr();
    const defaultLabel = `${today.slice(0, 7)} 週覆盤 (${store.shortDate(today)})`;

    openModal(
      isEdit ? '編輯定期覆盤紀錄' : '建立本期 OGSM 定期覆盤',
      `
        <form class="form-stack" id="modalReviewForm">
          ${
            allMode && !isEdit && projects.length
              ? `<div class="form-field">
                  <label>歸屬專案</label>
                  <select class="select" name="projectId">
                    ${projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
                  </select>
                </div>`
              : ''
          }
          <div class="review-snapshots" style="margin:0;">
            <div class="snap-box">
              <div class="snap-label">G 目標達成快照</div>
              <div class="snap-val" style="color:var(--green);">${goalRate}%</div>
            </div>
            <div class="snap-box">
              <div class="snap-label">M 行動進度快照</div>
              <div class="snap-val" style="color:var(--accent);">${measureRate}%</div>
            </div>
            <div class="snap-box">
              <div class="snap-label">檢核清單完成率</div>
              <div class="snap-val" style="color:var(--amber);">${checklistRate}%</div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-field">
              <label>覆盤週期類型</label>
              <select class="select" name="periodType">
                <option value="weekly" ${!existing || existing.periodType === 'weekly' ? 'selected' : ''}>週覆盤</option>
                <option value="monthly" ${existing && existing.periodType === 'monthly' ? 'selected' : ''}>月覆盤</option>
              </select>
            </div>
            <div class="form-field">
              <label>覆盤日期</label>
              <input type="date" class="input" name="reviewDate" value="${esc(existing ? existing.reviewDate : today)}" required />
            </div>
          </div>
          <div class="form-field">
            <label>本期標題</label>
            <input type="text" class="input" name="periodLabel" value="${esc(existing ? existing.periodLabel : defaultLabel)}" required />
          </div>
          <div class="form-field">
            <label>本期進展亮點</label>
            <textarea class="textarea" name="wins" placeholder="完成了哪些關鍵推進？哪些做法特別有效？">${esc(existing ? existing.wins : '')}</textarea>
          </div>
          <div class="form-field">
            <label>卡關與落後原因</label>
            <textarea class="textarea" name="blockers" placeholder="有哪些項目進度落後？主要阻礙是什麼？">${esc(existing ? existing.blockers : '')}</textarea>
          </div>
          <div class="form-field">
            <label>下期調整行動</label>
            <textarea class="textarea" name="nextActions" placeholder="下週／下月要具體調整哪 1～3 件事？">${esc(existing ? existing.nextActions : '')}</textarea>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn" data-close-modal>取消</button>
            <button type="submit" class="btn btn-primary">儲存覆盤</button>
          </div>
        </form>
      `,
      (body) => {
        body.querySelector('[data-close-modal]').addEventListener('click', closeModal);
        body.querySelector('#modalReviewForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          await store.saveRecord('reviews', {
            id: existing ? existing.id : OGSM.db.uid('rev'),
            projectId: existing ? existing.projectId : fd.get('projectId') || store.defaultWriteProjectId(),
            periodType: String(fd.get('periodType')),
            periodLabel: String(fd.get('periodLabel')).trim(),
            reviewDate: String(fd.get('reviewDate')),
            snapshotGoalRate: goalRate,
            snapshotMeasureRate: measureRate,
            snapshotChecklistRate: checklistRate,
            wins: String(fd.get('wins') || '').trim(),
            blockers: String(fd.get('blockers') || '').trim(),
            nextActions: String(fd.get('nextActions') || '').trim(),
            createdAt: existing ? existing.createdAt : new Date().toISOString(),
          });
          closeModal();
          store.toast(isEdit ? '已更新覆盤紀錄' : '已建立本期覆盤快照');
        });
      }
    );
  }

  function openEventModal(existing, presetDate) {
    const store = OGSM.store;
    const { esc } = store;
    const isEdit = Boolean(existing);
    const allMode = store.isAllMode();
    const projects = store.state.data.projects;
    const measures = store.projectMeasures();
    const defaultDate = existing ? existing.date : presetDate || store.todayStr();
    const currentCat = existing ? existing.category || 'meeting' : 'meeting';
    const activeProjId = existing ? existing.projectId : store.defaultWriteProjectId();

    openModal(
      isEdit ? '編輯專案行程' : '新增專案行程',
      `
        <form class="form-stack" id="modalEventForm">
          ${
            allMode && projects.length
              ? `<div class="form-field">
                  <label>歸屬專案</label>
                  <select class="select" name="projectId">
                    ${projects
                      .map((p) => `<option value="${esc(p.id)}" ${p.id === activeProjId ? 'selected' : ''}>${esc(p.name)}</option>`)
                      .join('')}
                  </select>
                </div>`
              : ''
          }
          <div class="form-field">
            <label>行程標題</label>
            <input type="text" class="input" name="title" value="${esc(existing ? existing.title : '')}" placeholder="例如：專案進度檢討會議、簡報定稿截止" required />
          </div>
          <div class="form-row">
            <div class="form-field">
              <label>日期</label>
              <input type="date" class="input" name="date" value="${esc(defaultDate)}" required />
            </div>
            <div class="form-field">
              <label>時間（選填）</label>
              <input type="time" class="input" name="time" value="${esc(existing ? existing.time || '' : '')}" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-field">
              <label>分類</label>
              <select class="select" name="category">
                <option value="meeting" ${currentCat === 'meeting' ? 'selected' : ''}>會議</option>
                <option value="deadline" ${currentCat === 'deadline' ? 'selected' : ''}>截止日</option>
                <option value="milestone" ${currentCat === 'milestone' ? 'selected' : ''}>里程碑</option>
                <option value="reminder" ${currentCat === 'reminder' ? 'selected' : ''}>提醒</option>
              </select>
            </div>
            <div class="form-field">
              <label>關聯行動 M（選填）</label>
              <select class="select" name="measureId">
                <option value="">不特別綁定</option>
                ${measures
                  .map(
                    (m) =>
                      `<option value="${esc(m.id)}" ${existing && existing.measureId === m.id ? 'selected' : ''}>${allMode ? `【${esc(store.projectNameById(m.projectId))}】` : ''}M · ${esc(m.title)}</option>`
                  )
                  .join('')}
              </select>
            </div>
          </div>
          <div class="form-field">
            <label>備註（選填）</label>
            <textarea class="textarea" name="note" placeholder="會議重點、準備事項或地點...">${esc(existing ? existing.note || '' : '')}</textarea>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn" data-close-modal>取消</button>
            <button type="submit" class="btn btn-primary">儲存行程</button>
          </div>
        </form>
      `,
      (body) => {
        body.querySelector('[data-close-modal]').addEventListener('click', closeModal);
        body.querySelector('#modalEventForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const dateVal = String(fd.get('date'));
          const mId = fd.get('measureId') || null;
          const matchedM = mId ? measures.find((item) => item.id === mId) : null;
          const ownerProjId = matchedM
            ? matchedM.projectId
            : fd.get('projectId') || activeProjId || store.defaultWriteProjectId();
          await store.saveRecord('events', {
            id: existing ? existing.id : OGSM.db.uid('evt'),
            projectId: ownerProjId,
            date: dateVal,
            time: String(fd.get('time') || ''),
            category: String(fd.get('category') || 'meeting'),
            title: String(fd.get('title')).trim(),
            measureId: mId,
            note: String(fd.get('note') || '').trim(),
            createdAt: existing ? existing.createdAt : new Date().toISOString(),
          });
          store.state.calendarSelectedDate = dateVal;
          closeModal();
          store.toast(isEdit ? '已更新專案行程' : '已新增專案行程');
        });
      }
    );
  }

  OGSM.drawer = { open: openDrawer, close: closeDrawer, render: renderDrawer };
  OGSM.modals = {
    openModal,
    closeModal,
    openProjectModal,
    openDeleteProjectModal,
    openGoalModal,
    openStrategyModal,
    openMeasureCreateModal,
    openFileModal,
    openReviewModal,
    openEventModal,
  };
})(window);
