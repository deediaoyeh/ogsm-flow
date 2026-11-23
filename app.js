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
    todo: {
      title: 'To-Do 清單',
      subtitle: '同時管理 OGSM 關聯待辦與日常獨立臨時事項',
      actionLabel: '＋ 新增行動 M',
      onAction: () => OGSM.modals.openMeasureCreateModal(),
    },
    logs: {
      title: '工作日誌',
      subtitle: '彈性記錄每日完成事項（含日期與視覺化 / HTML 編輯器）',
      actionLabel: '＋ 新增日誌',
      onAction: () => OGSM.views.logs.createNewLog(),
    },
    audit: {
      title: '檢核工具',
      subtitle: '集中管理任務檢核清單（Checklist）與週／月定期覆盤快照',
      actionLabel: '＋ 建立本期覆盤',
      onAction: () => OGSM.modals.openReviewModal(),
    },
    database: {
      title: '資料庫 & Google Drive 檔案庫',
      subtitle: '檢視瀏覽器資料庫狀態、統一整理 Drive 檔案連結與匯出備份',
      actionLabel: '＋ 新增 Drive 連結',
      onAction: () => OGSM.modals.openFileModal(),
    },
  };

  function renderShell() {
    const store = OGSM.store;
    const { esc } = store;
    const state = store.state;
    const view = state.currentView;
    const meta = VIEW_META[view] || VIEW_META.ogsm;
    const project = store.currentProject();
    const summary = store.projectSummary();

    // 更新專案下拉選單
    const projSelect = document.getElementById('projectSelect');
    projSelect.innerHTML = state.data.projects.length
      ? state.data.projects
          .map(
            (p) =>
              `<option value="${esc(p.id)}" ${p.id === state.currentProjectId ? 'selected' : ''}>${esc(p.name)}</option>`
          )
          .join('')
      : `<option value="">尚無專案</option>`;

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
    document.getElementById('pageTitle').textContent = meta.title;
    document.getElementById('pageSubtitle').textContent = project
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

    // 新增專案
    document.getElementById('btnNewProject').addEventListener('click', () => {
      OGSM.modals.openProjectModal();
    });

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
