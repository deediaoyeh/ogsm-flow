/* ============================================================
   js/store.js — 統一狀態管理、OGSM 計算與工具函式
   ============================================================ */
(function (global) {
  'use strict';

  const OGSM = (global.OGSM = global.OGSM || {});
  const listeners = new Set();

  const state = {
    currentView: 'ogsm',
    currentProjectId: null,
    searchQuery: '',
    ganttScale: 'day', // 'day' | 'week'
    ganttOffsetDays: -5,
    todoFilter: 'all', // 'all' | 'today' | 'ogsm' | 'standalone' | 'done'
    auditChecklistFilter: 'pending', // 'pending' | 'all'
    activeLogId: null,
    activeDrawerMeasureId: null,
    data: {
      projects: [],
      goals: [],
      strategies: [],
      measures: [],
      todos: [],
      checklists: [],
      files: [],
      reviews: [],
      logs: [],
    },
  };

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(url) {
    const u = (url || '').trim();
    if (!u) return '#';
    if (/^https?:\/\//i.test(u)) return u;
    return 'https://' + u;
  }

  function todayStr() {
    return OGSM.db.formatDate(new Date());
  }

  function parseDate(str) {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function diffDays(aStr, bStr) {
    const a = parseDate(aStr);
    const b = parseDate(bStr);
    if (!a || !b) return 0;
    return Math.round((b - a) / 86400000);
  }

  function shortDate(str) {
    if (!str) return '未排程';
    const parts = str.split('-');
    if (parts.length !== 3) return str;
    return `${Number(parts[1])}/${Number(parts[2])}`;
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function notify() {
    listeners.forEach((fn) => fn(state));
  }

  function toast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 200ms ease';
      setTimeout(() => el.remove(), 220);
    }, 2400);
  }

  async function hydrate() {
    await OGSM.db.ensureSeeded();
    state.data = await OGSM.db.loadAllStores();
    const savedProj = localStorage.getItem('ogsm_current_project');
    const exists = state.data.projects.some((p) => p.id === savedProj);
    if (exists) {
      state.currentProjectId = savedProj;
    } else if (state.data.projects.length > 0) {
      state.currentProjectId = state.data.projects[0].id;
    } else {
      state.currentProjectId = null;
    }
    notify();
  }

  function setProject(projectId) {
    state.currentProjectId = projectId;
    state.activeDrawerMeasureId = null;
    localStorage.setItem('ogsm_current_project', projectId || '');
    notify();
  }

  function setView(view) {
    state.currentView = view;
    notify();
  }

  function setSearch(q) {
    state.searchQuery = (q || '').trim().toLowerCase();
    notify();
  }

  function currentProject() {
    return state.data.projects.find((p) => p.id === state.currentProjectId) || null;
  }

  function projectGoals() {
    return state.data.goals
      .filter((g) => g.projectId === state.currentProjectId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function projectStrategies(goalId) {
    return state.data.strategies
      .filter((s) => s.projectId === state.currentProjectId && (!goalId || s.goalId === goalId))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function projectMeasures(strategyId) {
    return state.data.measures
      .filter((m) => m.projectId === state.currentProjectId && (!strategyId || m.strategyId === strategyId))
      .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '') || (a.order || 0) - (b.order || 0));
  }

  function projectTodos() {
    return state.data.todos
      .filter((t) => t.projectId === state.currentProjectId || t.projectId === null)
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99');
      });
  }

  function measureChecklists(measureId) {
    return state.data.checklists
      .filter((c) => c.measureId === measureId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function projectChecklists() {
    return state.data.checklists.filter((c) => c.projectId === state.currentProjectId);
  }

  function measureFiles(measureId) {
    return state.data.files.filter((f) => f.measureId === measureId);
  }

  function projectFiles() {
    return state.data.files.filter((f) => f.projectId === state.currentProjectId);
  }

  function retainedFiles() {
    return state.data.files.filter((f) => !f.projectId);
  }

  function projectReviews() {
    return state.data.reviews
      .filter((r) => r.projectId === state.currentProjectId)
      .sort((a, b) => (b.reviewDate || '').localeCompare(a.reviewDate || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  function projectLogs() {
    return (state.data.logs || [])
      .filter((l) => l.projectId === state.currentProjectId || l.projectId === null)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }

  function goalRate(goal) {
    const target = Number(goal.targetValue);
    const current = Number(goal.currentValue);
    if (!target || target <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
  }

  function measureStatus(m) {
    const prog = Number(m.progress) || 0;
    if (prog >= 100) return { key: 'done', label: '已完成', pillClass: 'green' };
    if (m.endDate && m.endDate < todayStr()) return { key: 'overdue', label: '已逾期', pillClass: 'red' };
    if (prog > 0) return { key: 'active', label: '進行中', pillClass: 'blue' };
    return { key: 'planned', label: '待開始', pillClass: '' };
  }

  function projectSummary() {
    const goals = projectGoals();
    const measures = projectMeasures();
    const checklists = projectChecklists();
    const todos = projectTodos();

    const avgGoalRate = goals.length
      ? Math.round(goals.reduce((acc, g) => acc + goalRate(g), 0) / goals.length)
      : 0;
    const avgMeasureRate = measures.length
      ? Math.round(measures.reduce((acc, m) => acc + (Number(m.progress) || 0), 0) / measures.length)
      : 0;
    const doneChecks = checklists.filter((c) => c.checked).length;
    const checklistRate = checklists.length ? Math.round((doneChecks / checklists.length) * 100) : 0;
    const pendingTodos = todos.filter((t) => !t.completed).length;
    const pendingChecks = checklists.length - doneChecks;
    const overdueMeasures = measures.filter((m) => measureStatus(m).key === 'overdue').length;

    return {
      avgGoalRate,
      avgMeasureRate,
      checklistRate,
      pendingTodos,
      pendingChecks,
      overdueMeasures,
      measureCount: measures.length,
      goalCount: goals.length,
    };
  }

  function triggerCloudSync() {
    if (OGSM.auth && typeof OGSM.auth.markLocalDirty === 'function') {
      OGSM.auth.markLocalDirty();
    }
    if (OGSM.auth && typeof OGSM.auth.scheduleSync === 'function') {
      OGSM.auth.scheduleSync();
    }
  }

  function recordDeletedId(id) {
    if (id && OGSM.auth && typeof OGSM.auth.markDeletedId === 'function') {
      OGSM.auth.markDeletedId(id);
    }
  }

  /* CRUD 操作封裝 */
  async function saveRecord(storeName, record) {
    const stamped = { ...record, updatedAt: new Date().toISOString() };
    await OGSM.db.put(storeName, stamped);
    const arr = state.data[storeName];
    const idx = arr.findIndex((item) => item.id === stamped.id);
    if (idx >= 0) arr[idx] = stamped;
    else arr.push(stamped);
    notify();
    triggerCloudSync();
    return stamped;
  }

  async function deleteRecord(storeName, id) {
    await OGSM.db.remove(storeName, id);
    recordDeletedId(id);
    state.data[storeName] = state.data[storeName].filter((item) => item.id !== id);
    notify();
    triggerCloudSync();
  }

  async function deleteMeasureCascade(measureId) {
    const relatedChecks = state.data.checklists.filter((c) => c.measureId === measureId);
    const relatedFiles = state.data.files.filter((f) => f.measureId === measureId);
    const relatedTodos = state.data.todos.filter((t) => t.measureId === measureId);

    for (const c of relatedChecks) {
      await OGSM.db.remove('checklists', c.id);
      recordDeletedId(c.id);
    }
    for (const f of relatedFiles) {
      await OGSM.db.remove('files', f.id);
      recordDeletedId(f.id);
    }
    // 關聯的 To-Do 改為獨立待辦而不直接抹除，避免誤刪日常待辦
    for (const t of relatedTodos) {
      t.measureId = null;
      t.updatedAt = new Date().toISOString();
      await OGSM.db.put('todos', t);
    }
    await OGSM.db.remove('measures', measureId);
    recordDeletedId(measureId);

    state.data.checklists = state.data.checklists.filter((c) => c.measureId !== measureId);
    state.data.files = state.data.files.filter((f) => f.measureId !== measureId);
    state.data.measures = state.data.measures.filter((m) => m.id !== measureId);
    if (state.activeDrawerMeasureId === measureId) state.activeDrawerMeasureId = null;
    notify();
    triggerCloudSync();
  }

  async function deleteStrategyCascade(strategyId) {
    const ms = state.data.measures.filter((m) => m.strategyId === strategyId);
    for (const m of ms) await deleteMeasureCascade(m.id);
    await deleteRecord('strategies', strategyId);
  }

  async function deleteGoalCascade(goalId) {
    const ss = state.data.strategies.filter((s) => s.goalId === goalId);
    for (const s of ss) await deleteStrategyCascade(s.id);
    await deleteRecord('goals', goalId);
  }

  async function deleteProjectCascade(projectId, options) {
    const opts = options || {};
    const keepFileLinks = opts.keepFileLinks !== false;
    const cloudAction = opts.cloudAction || 'sync'; // 'sync' | 'keep_cloud' | 'delete_cloud_file'
    const targetProject = state.data.projects.find((p) => p.id === projectId);
    const projectName = targetProject ? targetProject.name : '已刪除專案';

    // 處理專案內掛載的 Google Drive 檔案連結（留存或刪除）
    const projFiles = state.data.files.filter((f) => f.projectId === projectId);
    if (keepFileLinks) {
      for (const f of projFiles) {
        const updated = {
          ...f,
          projectId: null,
          measureId: null,
          note: f.note ? `${f.note}（原專案：${projectName}）` : `原專案：${projectName}`,
          updatedAt: new Date().toISOString(),
        };
        await OGSM.db.put('files', updated);
        const idx = state.data.files.findIndex((item) => item.id === f.id);
        if (idx >= 0) state.data.files[idx] = updated;
      }
    } else {
      for (const f of projFiles) {
        await OGSM.db.remove('files', f.id);
        recordDeletedId(f.id);
      }
      state.data.files = state.data.files.filter((f) => f.projectId !== projectId);
    }

    const stores = ['goals', 'strategies', 'measures', 'todos', 'checklists', 'reviews', 'logs'];
    for (const s of stores) {
      const items = state.data[s].filter((r) => r.projectId === projectId);
      for (const item of items) {
        await OGSM.db.remove(s, item.id);
        recordDeletedId(item.id);
      }
      state.data[s] = state.data[s].filter((r) => r.projectId !== projectId);
    }
    await OGSM.db.remove('projects', projectId);
    recordDeletedId(projectId);
    state.data.projects = state.data.projects.filter((p) => p.id !== projectId);
    state.currentProjectId = state.data.projects[0] ? state.data.projects[0].id : null;
    localStorage.setItem('ogsm_current_project', state.currentProjectId || '');

    if (state.data.projects.length === 0) {
      localStorage.setItem('ogsm_user_deleted_all', '1');
    }

    notify();

    // 依使用者選擇處理 Google Drive 雲端同步檔案
    if (OGSM.auth && OGSM.auth.session && OGSM.auth.session.authenticated) {
      if (cloudAction === 'delete_cloud_file') {
        await OGSM.auth.deleteDriveSyncFile();
      } else if (cloudAction === 'sync') {
        await OGSM.auth.pushToDriveNow({ allowEmptyPush: true });
      }
      // cloudAction === 'keep_cloud' 則保留雲端原本的同步檔不覆寫
    }
  }

  function renderDriveChip(file) {
    const meta = OGSM.db.driveTypeMeta(file.driveType);
    return `
      <a class="drive-chip" href="${esc(safeUrl(file.url))}" target="_blank" rel="noopener noreferrer"
         title="${esc(file.name)} (${meta.label}) — 點擊開啟 Google Drive"
         onclick="event.stopPropagation()">
        <span class="drive-dot ${meta.cls}"></span>
        <span class="drive-chip-name">${esc(file.name)}</span>
      </a>
    `;
  }

  OGSM.store = {
    state,
    esc,
    safeUrl,
    todayStr,
    parseDate,
    diffDays,
    shortDate,
    subscribe,
    notify,
    toast,
    hydrate,
    setProject,
    setView,
    setSearch,
    currentProject,
    projectGoals,
    projectStrategies,
    projectMeasures,
    projectTodos,
    measureChecklists,
    projectChecklists,
    measureFiles,
    projectFiles,
    retainedFiles,
    projectReviews,
    projectLogs,
    goalRate,
    measureStatus,
    projectSummary,
    saveRecord,
    deleteRecord,
    deleteMeasureCascade,
    deleteStrategyCascade,
    deleteGoalCascade,
    deleteProjectCascade,
    renderDriveChip,
  };
})(window);
