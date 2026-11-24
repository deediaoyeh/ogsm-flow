/* ============================================================
   js/app.js — 主程式入口、導覽路由、事件綁定與渲染排程
   ============================================================ */
(function (global) {
  'use strict';

  const OGSM = (global.OGSM = global.OGSM || {});

  const VIEW_META = {
    ogsm: {
      title: 'OGSM 藍圖',
      subtitle: '一頁掌握專案目的 O、量化目標 G、策略 S 與行動項目 M',
      actionLabel: '＋ 新增行動 M',
      onAction: () => OGSM.modals.openMeasureCreateModal(),
    },
    gantt: {
      title: '甘特圖',
      subtitle: '以日／週時間軸追蹤進度，並直接點開關聯的 Google Drive 檔案',
      actionLabel: '＋ 新增行動 M',
      onAction: () => OGSM.modals.openMeasureCreateModal(),
    },
    calendar: {
      title: '專案行事曆',
      subtitle: '此專案專屬月曆：整合行程、行動截止日、To-Do 與時間軸紀錄',
      actionLabel: '＋ 新增行程',
      onAction: () => OGSM.modals.openEventModal(null, OGSM.store.state.calendarSelectedDate),
    },
    todo: {
      title: 'To-Do 清單',
      subtitle: '此專案專屬待辦：支援 OGSM 關聯待辦與專案臨時事項',
      actionLabel: '＋ 新增行動 M',
      onAction: () => OGSM.modals.openMeasureCreateModal(),
    },
    logs: {
      title: '專案時間軸 & HTML 日誌',
      subtitle: '按時間點回顧想法決策、新增項目軌跡與 HTML 完整內容紀錄',
      actionLabel: '＋ 新增節點',
      onAction: () => OGSM.views.logs.createNewLog(),
    },
    audit: {
      title: '檢核工具',
      subtitle: '集中管理任務檢核清單（Checklist）與週／月定期覆盤快照',
      actionLabel: '＋ 建立本期覆盤',
      onAction: () => OGSM.modals.openReviewModal(),
    },
    files: {
      title: '專案檔案庫',
      subtitle: '自動集中彙整本專案所有 Google Drive 檔案與 O / G / S / M 備註附檔',
      actionLabel: '＋ 新增 Drive 連結',
      onAction: () => OGSM.modals.openFileModal(),
    },
    database: {
      title: '資料庫 & 雲端備份',
      subtitle: '檢視瀏覽器資料庫狀態、Google Drive 雲端同步與 JSON 安全備份還原',
      actionLabel: '↻ 立即同步雲端',
      onAction: async () => {
        if (OGSM.auth) {
          await OGSM.auth.pushToDriveNow();
          OGSM.store.toast('已與 Google Drive 完成同步');
        }
      },
    },
  };

  function renderShell() {
    const store = OGSM.store;
    const { esc } = store;
    const state = store.state;
    const view = state.currentView;
    const meta = VIEW_META[view] || VIEW_META.ogsm;
    const allMode = store.isAllMode();
    const project = store.currentProject();
    const summary = store.projectSummary();

    // 更新專案下拉選單（第一項為「🌐 全部專案總覽」）
    const projSelect = document.getElementById('projectSelect');
    if (state.data.projects.length) {
      projSelect.innerHTML =
        `<option value="${store.ALL_PROJECTS_ID}" ${allMode ? 'selected' : ''}>🌐 總覽：全部專案 (${state.data.projects.length})</option>` +
        state.data.projects
          .map(
            (p) =>
              `<option value="${esc(p.id)}" ${p.id === state.currentProjectId ? 'selected' : ''}>${esc(p.name)}</option>`
          )
          .join('');
    } else {
      projSelect.innerHTML = `<option value="">尚無專案</option>`;
    }

    const btnAllToggle = document.getElementById('btnToggleAllMode');
    if (btnAllToggle) {
      btnAllToggle.hidden = state.data.projects.length === 0;
      btnAllToggle.classList.toggle('active', allMode);
      btnAllToggle.textContent = allMode ? '↩ 返回單一專案檢視' : '🌐 切換全部專案總覽';
    }

    const btnEditProjSide = document.getElementById('btnEditProjectSide');
    if (btnEditProjSide) {
      btnEditProjSide.hidden = !project;
    }

    const btnDeleteProj = document.getElementById('btnDeleteProject');
    if (btnDeleteProj) {
      btnDeleteProj.hidden = !project;
    }

    // 更新側邊欄與手機底部導覽高亮與徽章
    document.querySelectorAll('.nav-item[data-view], .bottom-nav-item[data-view]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });

    const badgeTodo = document.getElementById('badgeTodo');
    badgeTodo.textContent = summary.pendingTodos;
    badgeTodo.hidden = summary.pendingTodos === 0;

    const mobileBadgeTodo = document.getElementById('mobileBadgeTodo');
    if (mobileBadgeTodo) mobileBadgeTodo.hidden = summary.pendingTodos === 0;

    const badgeCheck = document.getElementById('badgeChecklist');
    badgeCheck.textContent = summary.pendingChecks;
    badgeCheck.hidden = summary.pendingChecks === 0;

    const badgeFiles = document.getElementById('badgeFiles');
    if (badgeFiles && OGSM.views.files && typeof OGSM.views.files.collectProjectFiles === 'function') {
      const totalFiles = OGSM.views.files.collectProjectFiles(store).length;
      badgeFiles.textContent = totalFiles;
      badgeFiles.hidden = totalFiles === 0;
    }

    // 側邊欄底部極簡進度摘要
    document.getElementById('sidebarGoalRate').textContent = `${summary.avgGoalRate}%`;
    const bar = document.getElementById('sidebarGoalBar');
    bar.style.width = `${summary.avgGoalRate}%`;
    bar.className = `progress-fill ${summary.avgGoalRate >= 80 ? 'green' : summary.avgGoalRate >= 40 ? '' : 'amber'}`;
    document.getElementById('sidebarProgressMeta').textContent =
      summary.overdueMeasures > 0
        ? `${summary.measureCount} 項行動 · ${summary.overdueMeasures} 項逾期`
        : `${summary.measureCount} 項行動 · 進度 ${summary.avgMeasureRate}%`;

    // 頂部標題與快速按鈕
    const ALL_TITLES = {
      ogsm: '全部專案 OGSM 總覽',
      gantt: '全部專案總甘特圖',
      calendar: '全部專案共同行事曆',
      todo: '全部專案總 To-Do 清單',
      logs: '跨專案執行時間軸',
      audit: '全部專案總檢核清單 & 覆盤',
      files: '全部專案檔案集中中心',
      database: '資料庫 & 雲端備份',
    };
    document.getElementById('pageTitle').textContent = allMode ? (ALL_TITLES[view] || meta.title) : meta.title;
    document.getElementById('pageSubtitle').textContent = allMode
      ? `跨專案共同檢視（共 ${state.data.projects.length} 個專案）— ${meta.subtitle}`
      : project
      ? `${project.name} — ${meta.subtitle}`
      : meta.subtitle;

    const quickBtn = document.getElementById('btnQuickAction');
    quickBtn.textContent = meta.actionLabel;

    // 渲染主視圖
    const container = document.getElementById('viewContainer');
    const renderer = OGSM.views[view];
    if (renderer && typeof renderer.render === 'function') {
      renderer.render(container);
    }

    // 若抽屜目前開啟中，同步刷新其內容
    if (state.activeDrawerMeasureId) {
      OGSM.drawer.render();
    }
  }

  function bindGlobalEvents() {
    const store = OGSM.store;

    // 切換專案
    document.getElementById('projectSelect').addEventListener('change', (e) => {
      store.setProject(e.target.value);
    });

    // 一鍵切換「全部專案總覽」模式
    const btnToggleAll = document.getElementById('btnToggleAllMode');
    if (btnToggleAll) {
      btnToggleAll.addEventListener('click', () => {
        store.toggleAllMode();
        closeMobileSidebar();
      });
    }

    // 新增專案
    document.getElementById('btnNewProject').addEventListener('click', () => {
      OGSM.modals.openProjectModal();
    });

    // 編輯目前專案（名稱、目的 O、週期）
    const btnEditProjSide = document.getElementById('btnEditProjectSide');
    if (btnEditProjSide) {
      btnEditProjSide.addEventListener('click', () => {
        const proj = store.currentProject();
        if (proj) OGSM.modals.openProjectModal(proj);
      });
    }

    // 刪除目前專案
    const btnDelProj = document.getElementById('btnDeleteProject');
    if (btnDelProj) {
      btnDelProj.addEventListener('click', () => {
        OGSM.modals.openDeleteProjectModal(store.currentProject());
      });
    }

    function closeMobileSidebar() {
      document.getElementById('sidebar').classList.remove('open');
      const sbBackdrop = document.getElementById('sidebarBackdrop');
      if (sbBackdrop) sbBackdrop.hidden = true;
    }

    // 切換視圖（桌機側欄 + 手機底部導覽列）
    document.querySelectorAll('.nav-item[data-view], .bottom-nav-item[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.setView(btn.dataset.view);
        closeMobileSidebar();
      });
    });

    // 手機頂部快速前往本專案檔案庫
    const btnMobFiles = document.getElementById('btnMobileFiles');
    if (btnMobFiles) {
      btnMobFiles.addEventListener('click', () => {
        store.setView('files');
        closeMobileSidebar();
      });
    }

    // 頂部快速按鈕
    document.getElementById('btnQuickAction').addEventListener('click', () => {
      const meta = VIEW_META[store.state.currentView] || VIEW_META.ogsm;
      meta.onAction();
    });

    // 全域搜尋
    document.getElementById('globalSearch').addEventListener('input', (e) => {
      store.setSearch(e.target.value);
    });

    // 行動抽屜關閉與刪除
    document.getElementById('btnCloseDrawer').addEventListener('click', OGSM.drawer.close);
    document.getElementById('drawerBackdrop').addEventListener('click', OGSM.drawer.close);
    document.getElementById('btnDeleteMeasure').addEventListener('click', async () => {
      const id = store.state.activeDrawerMeasureId;
      if (!id) return;
      if (!confirm('確定要刪除此行動項目 (M) 嗎？（底下的關聯 To-Do 會保留為獨立待辦）')) return;
      await store.deleteMeasureCascade(id);
      OGSM.drawer.close();
      store.toast('已刪除行動項目');
    });

    // Modal 關閉
    document.getElementById('btnCloseModal').addEventListener('click', OGSM.modals.closeModal);
    document.getElementById('modalBackdrop').addEventListener('click', (e) => {
      if (e.target.id === 'modalBackdrop') OGSM.modals.closeModal();
    });

    // 行動裝置側欄開關與遮罩
    document.getElementById('btnToggleSidebar').addEventListener('click', () => {
      const sb = document.getElementById('sidebar');
      const sbBackdrop = document.getElementById('sidebarBackdrop');
      const willOpen = !sb.classList.contains('open');
      sb.classList.toggle('open', willOpen);
      if (sbBackdrop) sbBackdrop.hidden = !willOpen;
    });
    const sbBackdrop = document.getElementById('sidebarBackdrop');
    if (sbBackdrop) {
      sbBackdrop.addEventListener('click', closeMobileSidebar);
    }

    // 手動同步至 Google Drive
    const btnSync = document.getElementById('btnSidebarSync');
    if (btnSync) {
      btnSync.addEventListener('click', async () => {
        if (!OGSM.auth) return;
        await OGSM.auth.pushToDriveNow();
        store.toast('已與 Google Drive 完成同步');
      });
    }

    // 登出並鎖定（撤銷憑證＋清除本機暫存）
    const btnSignOut = document.getElementById('btnLockSignOut');
    if (btnSignOut) {
      btnSignOut.addEventListener('click', async () => {
        if (!confirm('確定要安全登出並清除此裝置暫存嗎？（最新資料會先同步至 Google Drive）')) return;
        await OGSM.auth.lockSession('您已安全登出並清除此裝置快取。', false, true);
      });
    }

    // 全域攔截點選「已上傳至 Google Drive 的附檔」以串流預覽或下載
    document.addEventListener('click', async (e) => {
      const openBtn = e.target.closest('[data-open-drive-blob]');
      const dlBtn = e.target.closest('[data-download-drive-blob]');
      const btn = openBtn || dlBtn;
      if (!btn || !OGSM.auth) return;
      e.preventDefault();
      e.stopPropagation();
      const driveFileId = btn.dataset.openDriveBlob || btn.dataset.downloadDriveBlob;
      const name = btn.dataset.blobName || 'download';
      const mime = btn.dataset.blobMime || '';
      try {
        await OGSM.auth.openOrDownloadDriveBlob(driveFileId, name, mime, Boolean(dlBtn));
      } catch (err) {
        alert('無法載入檔案：' + err.message);
      }
    });

    // 防止在非拖曳區誤觸拖檔導致瀏覽器直接跳離目前頁面
    window.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
        e.preventDefault();
      }
    });
    window.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        e.preventDefault();
      }
    });

    // ESC 鍵關閉彈窗或抽屜
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!document.getElementById('modalBackdrop').hidden) {
          OGSM.modals.closeModal();
        } else if (store.state.activeDrawerMeasureId) {
          OGSM.drawer.close();
        }
      }
    });
  }

  async function init() {
    bindGlobalEvents();
    OGSM.store.subscribe(renderShell);
    // 嚴格驗證模式：未通過 Google 帳號驗證前，絕不載入資料或顯示主畫面
    if (OGSM.auth && typeof OGSM.auth.init === 'function') {
      OGSM.auth.init();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
