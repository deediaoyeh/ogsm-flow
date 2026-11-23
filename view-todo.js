/* ============================================================
   js/views/todo.js — ③ To-Do 清單（支援 OGSM 關聯 + 獨立臨時待辦）
   ============================================================ */
(function (global) {
  'use strict';

  const OGSM = (global.OGSM = global.OGSM || {});
  OGSM.views = OGSM.views || {};

  function render(container) {
    const store = OGSM.store;
    const { esc } = store;
    const allMode = store.isAllMode();

    if (!store.hasAnyContext()) {
      container.innerHTML = `<div class="empty-state"><p>請先建立或選擇一個專案。</p></div>`;
      return;
    }

    const projects = store.state.data.projects;
    const measures = store.projectMeasures();
    const measureMap = new Map(measures.map((m) => [m.id, m]));
    const allTodos = store.projectTodos();
    const filter = store.state.todoFilter;
    const q = store.state.searchQuery;
    const today = store.todayStr();

    const filtered = allTodos.filter((t) => {
      if (q) {
        const linked = t.measureId ? measureMap.get(t.measureId) : null;
        const pName = store.projectNameById(t.projectId);
        const match =
          (t.title || '').toLowerCase().includes(q) ||
          pName.toLowerCase().includes(q) ||
          (linked && (linked.title || '').toLowerCase().includes(q));
        if (!match) return false;
      }
      if (filter === 'today') return !t.completed && t.dueDate && t.dueDate <= today;
      if (filter === 'ogsm') return !t.completed && Boolean(t.measureId);
      if (filter === 'standalone') return !t.completed && !t.measureId;
      if (filter === 'done') return Boolean(t.completed);
      return true;
    });

    const countAll = allTodos.filter((t) => !t.completed).length;
    const countToday = allTodos.filter((t) => !t.completed && t.dueDate && t.dueDate <= today).length;
    const countOgsm = allTodos.filter((t) => !t.completed && t.measureId).length;
    const countStandalone = allTodos.filter((t) => !t.completed && !t.measureId).length;
    const countDone = allTodos.filter((t) => t.completed).length;

    const targetSelectOptionsHtml = allMode
      ? projects
          .map((p) => {
            const pMeasures = store.projectMeasures(null, p.id);
            return `
              <optgroup label="${esc(p.name)}">
                <option value="proj:${esc(p.id)}">【${esc(p.name)}】獨立臨時待辦</option>
                ${pMeasures
                  .map((m) => `<option value="meas:${esc(m.id)}">【${esc(p.name)}】M · ${esc(m.title)}</option>`)
                  .join('')}
              </optgroup>
            `;
          })
          .join('')
      : `
          <option value="proj:${esc(store.state.currentProjectId)}">獨立臨時待辦（不綁 OGSM）</option>
          ${measures.map((m) => `<option value="meas:${esc(m.id)}">M · ${esc(m.title)}</option>`).join('')}
        `;

    const listHtml = filtered.length
      ? filtered
          .map((t) => {
            const linked = t.measureId ? measureMap.get(t.measureId) : null;
            const isOverdue = !t.completed && t.dueDate && t.dueDate < today;
            const isToday = !t.completed && t.dueDate === today;
            return `
              <div class="todo-item ${t.completed ? 'completed' : ''}">
                <button class="checkbox-round ${t.completed ? 'checked' : ''}"
                        data-toggle-todo="${esc(t.id)}"
                        aria-label="切換完成狀態">
                  ${t.completed ? '✓' : ''}
                </button>
                <div class="todo-main">
                  <div class="todo-title">${esc(t.title)}</div>
                  <div class="todo-meta">
                    ${allMode ? `<span class="proj-mini-tag">${esc(store.projectNameById(t.projectId))}</span>` : ''}
                    ${
                      linked
                        ? `<span class="todo-link-tag" data-open-measure="${esc(linked.id)}" title="點擊檢視對應的 OGSM 行動項目">M · ${esc(linked.title)}</span>`
                        : `<span class="todo-link-tag standalone">獨立臨時待辦</span>`
                    }
                    ${
                      t.dueDate
                        ? `<span class="pill ${isOverdue ? 'red' : isToday ? 'amber' : ''}">
                            ${isOverdue ? '逾期 ' : isToday ? '今天 ' : ''}${esc(store.shortDate(t.dueDate))}
                          </span>`
                        : ''
                    }
                  </div>
                </div>
                <button class="btn-icon danger" data-del-todo="${esc(t.id)}" title="刪除待辦">✕</button>
              </div>
            `;
          })
          .join('')
      : `<div class="empty-state">
          <p>${q ? '沒有符合搜尋條件的待辦事項。' : '這個分類目前沒有待辦事項，太棒了！'}</p>
        </div>`;

    container.innerHTML = `
      <!-- 極簡快速新增列 -->
      <form class="quick-add-bar" id="todoQuickForm">
        <input type="text" class="input" id="todoTitleInput" placeholder="輸入待辦事項，按 Enter 加入..." required />
        <select class="select" id="todoMeasureSelect" aria-label="關聯項目">
          ${targetSelectOptionsHtml}
        </select>
        <input type="date" class="input" id="todoDueInput" value="${esc(today)}" aria-label="到期日" />
        <button type="submit" class="btn btn-primary">＋ 加入</button>
      </form>

      <!-- 篩選列 -->
      <div class="section-header">
        <div class="seg-tabs" role="tablist">
          <button class="seg-tab ${filter === 'all' ? 'active' : ''}" data-todo-filter="all">全部 (${countAll})</button>
          <button class="seg-tab ${filter === 'today' ? 'active' : ''}" data-todo-filter="today">今日聚焦 (${countToday})</button>
          <button class="seg-tab ${filter === 'ogsm' ? 'active' : ''}" data-todo-filter="ogsm">OGSM 關聯 (${countOgsm})</button>
          <button class="seg-tab ${filter === 'standalone' ? 'active' : ''}" data-todo-filter="standalone">獨立臨時 (${countStandalone})</button>
          <button class="seg-tab ${filter === 'done' ? 'active' : ''}" data-todo-filter="done">已完成 (${countDone})</button>
        </div>
        ${
          countDone > 0 && filter === 'done'
            ? `<button class="btn btn-sm btn-danger" id="btnClearDoneTodos">清除已完成</button>`
            : `<span class="muted-text" style="font-size:12px;">點擊藍色 M 標籤可直接開啟對應行動詳情</span>`
        }
      </div>

      <div class="todo-list">${listHtml}</div>
    `;

    // 綁定快速新增
    const form = container.querySelector('#todoQuickForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const titleInput = container.querySelector('#todoTitleInput');
      const title = titleInput.value.trim();
      if (!title) return;
      const rawTarget = container.querySelector('#todoMeasureSelect').value || '';
      let targetProjectId = store.defaultWriteProjectId();
      let measureId = null;
      if (rawTarget.startsWith('meas:')) {
        measureId = rawTarget.slice(5);
        const foundM = measureMap.get(measureId);
        if (foundM && foundM.projectId) targetProjectId = foundM.projectId;
      } else if (rawTarget.startsWith('proj:')) {
        targetProjectId = rawTarget.slice(5) || targetProjectId;
      }
      const dueDate = container.querySelector('#todoDueInput').value || '';
      await store.saveRecord('todos', {
        id: OGSM.db.uid('todo'),
        projectId: targetProjectId,
        measureId,
        title,
        dueDate,
        completed: false,
        createdAt: new Date().toISOString(),
      });
      store.toast(measureId ? '已加入 OGSM 關聯待辦' : '已加入獨立待辦');
    });

    // 篩選切換
    container.querySelectorAll('[data-todo-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.state.todoFilter = btn.dataset.todoFilter;
        store.notify();
      });
    });

    // 勾選完成
    container.querySelectorAll('[data-toggle-todo]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const todo = store.state.data.todos.find((t) => t.id === btn.dataset.toggleTodo);
        if (!todo) return;
        await store.saveRecord('todos', { ...todo, completed: !todo.completed });
      });
    });

    // 刪除
    container.querySelectorAll('[data-del-todo]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await store.deleteRecord('todos', btn.dataset.delTodo);
        store.toast('已刪除待辦');
      });
    });

    // 開啟對應 M 抽屜
    container.querySelectorAll('[data-open-measure]').forEach((el) => {
      el.addEventListener('click', () => OGSM.drawer.open(el.dataset.openMeasure));
    });

    // 清除已完成
    const btnClear = container.querySelector('#btnClearDoneTodos');
    if (btnClear) {
      btnClear.addEventListener('click', async () => {
        const doneList = allTodos.filter((t) => t.completed);
        for (const t of doneList) await store.deleteRecord('todos', t.id);
        store.toast(`已清除 ${doneList.length} 筆已完成待辦`);
      });
    }
  }

  OGSM.views.todo = { render };
})(window);
