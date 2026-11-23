/* ============================================================
   view-calendar.js — 專案獨立行事曆（月曆檢視 + 當日事項面板）
   ============================================================ */
(function (global) {
  'use strict';

  const OGSM = (global.OGSM = global.OGSM || {});
  OGSM.views = OGSM.views || {};

  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
  const EVENT_CATS = {
    meeting: { label: '會議', cls: 'blue' },
    deadline: { label: '截止日', cls: 'red' },
    milestone: { label: '里程碑', cls: 'amber' },
    reminder: { label: '提醒', cls: 'green' },
  };

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function dateStr(y, m, d) {
    return `${y}-${pad2(m + 1)}-${pad2(d)}`;
  }

  function render(container) {
    const store = OGSM.store;
    const { esc } = store;
    const allMode = store.isAllMode();
    const project = store.currentProject();

    if (!store.hasAnyContext()) {
      container.innerHTML = `<div class="empty-state"><p>請先建立或選擇一個專案。</p></div>`;
      return;
    }

    const pTag = (pid) => (allMode ? `<span class="proj-mini-tag">${esc(store.projectNameById(pid))}</span>` : '');
    const pPrefix = (pid) => (allMode ? `[${store.projectNameById(pid)}] ` : '');

    const year = store.state.calendarYear;
    const month = store.state.calendarMonth; // 0-11
    const today = store.todayStr();
    const selected = store.state.calendarSelectedDate || today;
    const q = store.state.searchQuery;

    // 彙整本專案的所有日期項目（嚴格隔離只取目前專案！）
    const events = store.projectEvents().filter(
      (ev) => !q || (ev.title || '').toLowerCase().includes(q) || (ev.note || '').toLowerCase().includes(q)
    );
    const measures = store.projectMeasures().filter(
      (m) => !q || (m.title || '').toLowerCase().includes(q)
    );
    const todos = store.projectTodos().filter(
      (t) => !q || (t.title || '').toLowerCase().includes(q)
    );
    const logs = store.projectLogs().filter(
      (l) => !q || (l.title || '').toLowerCase().includes(q)
    );
    const reviews = store.projectReviews().filter(
      (r) => !q || (r.periodLabel || '').toLowerCase().includes(q)
    );

    // 依日期建立快速索引 map
    const dayMap = new Map();
    function pushItem(dStr, item) {
      if (!dStr) return;
      if (!dayMap.has(dStr)) dayMap.set(dStr, []);
      dayMap.get(dStr).push(item);
    }

    events.forEach((ev) => {
      const cat = EVENT_CATS[ev.category] || EVENT_CATS.meeting;
      pushItem(ev.date, {
        kind: 'event',
        cls: cat.cls,
        label: pPrefix(ev.projectId) + (ev.time ? `${ev.time} ` : '') + ev.title,
        raw: ev,
      });
    });

    measures.forEach((m) => {
      if (m.endDate) {
        pushItem(m.endDate, {
          kind: 'measure',
          cls: 'amber',
          label: `${pPrefix(m.projectId)}M 截止：${m.title}`,
          raw: m,
        });
      }
    });

    todos.forEach((t) => {
      if (t.dueDate) {
        pushItem(t.dueDate, {
          kind: 'todo',
          cls: t.completed ? '' : 'green',
          label: `${pPrefix(t.projectId)}${t.completed ? '✓ ' : '☐ '}${t.title}`,
          raw: t,
        });
      }
    });

    logs.forEach((l) => {
      if (l.date) {
        pushItem(l.date, {
          kind: 'log',
          cls: 'blue',
          label: `${pPrefix(l.projectId)}✎ ${(l.title || '').trim() || '時間軸紀錄'}`,
          raw: l,
        });
      }
    });

    reviews.forEach((r) => {
      if (r.reviewDate) {
        pushItem(r.reviewDate, {
          kind: 'review',
          cls: 'amber',
          label: `${pPrefix(r.projectId)}✦ ${r.periodLabel}`,
          raw: r,
        });
      }
    });

    // 建立月曆格子（從當月 1 日前補齊星期日開始，共 35 或 42 格）
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

    const cellsHtml = [];
    for (let i = 0; i < totalCells; i++) {
      const cellDate = new Date(year, month, 1 - startWeekday + i);
      const cy = cellDate.getFullYear();
      const cm = cellDate.getMonth();
      const cd = cellDate.getDate();
      const cStr = dateStr(cy, cm, cd);
      const isCurrentMonth = cm === month;
      const isToday = cStr === today;
      const isSelected = cStr === selected;
      const items = dayMap.get(cStr) || [];

      const pillsHtml = items
        .slice(0, 3)
        .map(
          (it) =>
            `<div class="cal-mini-pill ${it.cls}" title="${esc(it.label)}">${esc(it.label)}</div>`
        )
        .join('');
      const moreHtml =
        items.length > 3 ? `<div class="cal-more">+${items.length - 3} 項</div>` : '';

      cellsHtml.push(`
        <button type="button"
                class="cal-cell ${isCurrentMonth ? '' : 'other-month'} ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}"
                data-select-date="${cStr}">
          <div class="cal-cell-top">
            <span class="cal-day-num">${cd}</span>
            ${items.length ? `<span class="cal-count-dot">${items.length}</span>` : ''}
          </div>
          <div class="cal-cell-items">${pillsHtml}${moreHtml}</div>
        </button>
      `);
    }

    // 右側當日詳情面板
    const selEvents = events.filter((ev) => ev.date === selected);
    const selMeasures = measures.filter(
      (m) => m.endDate === selected || (m.startDate && m.endDate && m.startDate <= selected && m.endDate >= selected)
    );
    const selTodos = todos.filter((t) => t.dueDate === selected);
    const selLogs = logs.filter((l) => l.date === selected);

    const dayDetailEmpty =
      selEvents.length === 0 &&
      selMeasures.length === 0 &&
      selTodos.length === 0 &&
      selLogs.length === 0;

    container.innerHTML = `
      <div class="calendar-layout">
        <!-- 左側：日系極簡月曆 -->
        <section class="cal-main-card">
          <div class="cal-toolbar">
            <div class="row-gap-xs">
              <button type="button" class="btn btn-sm" id="btnCalPrev" title="上個月">←</button>
              <button type="button" class="btn btn-sm" id="btnCalToday">今天</button>
              <button type="button" class="btn btn-sm" id="btnCalNext" title="下個月">→</button>
              <h2 class="cal-month-title">${year} 年 ${month + 1} 月</h2>
            </div>
            <button type="button" class="btn btn-primary btn-sm" id="btnCalAddEvent">＋ 新增行程</button>
          </div>

          <div class="cal-weekdays">
            ${WEEKDAYS.map((w) => `<div class="cal-weekday">${w}</div>`).join('')}
          </div>
          <div class="cal-grid">
            ${cellsHtml.join('')}
          </div>

          <div class="gantt-legend" style="margin-top:14px;">
            <span class="legend-item"><span class="legend-swatch" style="background:var(--accent);"></span>專案行程 / 時間軸</span>
            <span class="legend-item"><span class="legend-swatch" style="background:var(--amber);"></span>行動 M 截止 / 覆盤</span>
            <span class="legend-item"><span class="legend-swatch" style="background:var(--green);"></span>To-Do 到期</span>
            <span class="legend-item"><span class="legend-swatch" style="background:var(--red);"></span>重要截止日</span>
          </div>
        </section>

        <!-- 右側：選取日期的本專案詳情 -->
        <aside class="cal-side-card">
          <div class="section-header" style="margin-bottom:12px;">
            <div>
              <h3 class="section-title">${esc(selected)}</h3>
              <div class="muted-text" style="font-size:11.5px;">
                ${allMode ? `全部專案（共 ${store.state.data.projects.length} 個專案）的共同排程` : `${esc(project.name)} 的當日行程與進度`}
              </div>
            </div>
          </div>

          <div class="row-gap-xs" style="margin-bottom:16px;flex-wrap:wrap;">
            <button type="button" class="btn btn-sm btn-primary" id="btnSideAddEvent">＋ 新增當日行程</button>
            <button type="button" class="btn btn-sm" id="btnSideAddLog">✎ 寫當日時間軸</button>
          </div>

          ${
            dayDetailEmpty
              ? `<div class="empty-state" style="padding:26px 14px;">
                  <p style="margin:0;">這一天目前沒有排定行程或截止項目。</p>
                </div>`
              : `
                <div class="cal-day-sections">
                  ${
                    selEvents.length
                      ? `<div class="cal-day-block">
                          <div class="cal-block-label">專案行程 (${selEvents.length})</div>
                          ${selEvents
                            .map((ev) => {
                              const cat = EVENT_CATS[ev.category] || EVENT_CATS.meeting;
                              return `
                              <div class="cal-detail-item">
                                <div class="row-between" style="gap:6px;">
                                  <div class="row-gap-xs" style="min-width:0;flex-wrap:wrap;">
                                    ${pTag(ev.projectId)}
                                    <span class="pill ${cat.cls}" style="font-size:10.5px;">${cat.label}</span>
                                    ${ev.time ? `<span class="muted-text" style="font-size:11.5px;">${esc(ev.time)}</span>` : ''}
                                  </div>
                                  <div class="row-gap-xs">
                                    <button type="button" class="btn-icon" style="width:24px;height:24px;font-size:12px;" data-edit-event="${esc(ev.id)}" title="編輯">✎</button>
                                    <button type="button" class="btn-icon danger" style="width:24px;height:24px;font-size:11px;" data-del-event="${esc(ev.id)}" title="刪除">✕</button>
                                  </div>
                                </div>
                                <div style="font-weight:550;font-size:13px;margin-top:4px;">${esc(ev.title)}</div>
                                ${ev.note ? `<div class="muted-text" style="font-size:12px;margin-top:2px;">${esc(ev.note)}</div>` : ''}
                              </div>
                            `;
                            })
                            .join('')}
                        </div>`
                      : ''
                  }

                  ${
                    selTodos.length
                      ? `<div class="cal-day-block">
                          <div class="cal-block-label">當日 To-Do (${selTodos.length})</div>
                          ${selTodos
                            .map(
                              (t) => `
                              <div class="checklist-row ${t.completed ? 'done' : ''}">
                                <button type="button" class="checkbox-round ${t.completed ? 'checked' : ''}" data-cal-todo="${esc(t.id)}">${t.completed ? '✓' : ''}</button>
                                ${pTag(t.projectId)}
                                <span style="flex:1;">${esc(t.title)}</span>
                              </div>
                            `
                            )
                            .join('')}
                        </div>`
                      : ''
                  }

                  ${
                    selMeasures.length
                      ? `<div class="cal-day-block">
                          <div class="cal-block-label">相關行動 M (${selMeasures.length})</div>
                          ${selMeasures
                            .map(
                              (m) => `
                              <button type="button" class="cal-detail-link" data-open-measure="${esc(m.id)}">
                                ${pTag(m.projectId)}
                                <span class="pill ${m.endDate === selected ? 'amber' : ''}" style="font-size:10.5px;">
                                  ${m.endDate === selected ? '今日截止' : '進行中'}
                                </span>
                                <span style="flex:1;text-align:left;">M · ${esc(m.title)}</span>
                                <span class="muted-text" style="font-size:11px;">${Number(m.progress) || 0}%</span>
                              </button>
                            `
                            )
                            .join('')}
                        </div>`
                      : ''
                  }

                  ${
                    selLogs.length
                      ? `<div class="cal-day-block">
                          <div class="cal-block-label">當日時間軸紀錄 (${selLogs.length})</div>
                          ${selLogs
                            .map((l) => {
                              const topic = (l.title || '').trim() || `未命名主題（${l.date}）`;
                              return `
                              <button type="button" class="cal-detail-link" data-jump-log="${esc(l.id)}">
                                <span style="color:var(--accent);">✎</span>
                                ${pTag(l.projectId)}
                                <span style="flex:1;text-align:left;font-weight:500;">${esc(topic)}</span>
                                ${l.time ? `<span class="muted-text" style="font-size:11px;">${esc(l.time)}</span>` : ''}
                              </button>
                            `;
                            })
                            .join('')}
                        </div>`
                      : ''
                  }
                </div>
              `
          }
        </aside>
      </div>
    `;

    // 月份切換
    container.querySelector('#btnCalPrev').addEventListener('click', () => {
      if (store.state.calendarMonth === 0) {
        store.state.calendarYear -= 1;
        store.state.calendarMonth = 11;
      } else {
        store.state.calendarMonth -= 1;
      }
      store.notify();
    });
    container.querySelector('#btnCalNext').addEventListener('click', () => {
      if (store.state.calendarMonth === 11) {
        store.state.calendarYear += 1;
        store.state.calendarMonth = 0;
      } else {
        store.state.calendarMonth += 1;
      }
      store.notify();
    });
    container.querySelector('#btnCalToday').addEventListener('click', () => {
      const now = new Date();
      store.state.calendarYear = now.getFullYear();
      store.state.calendarMonth = now.getMonth();
      store.state.calendarSelectedDate = today;
      store.notify();
    });

    // 點選日期格
    container.querySelectorAll('[data-select-date]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.state.calendarSelectedDate = btn.dataset.selectDate;
        store.notify();
      });
    });

    // 新增行程／時間軸
    const openAddEv = () => OGSM.modals.openEventModal(null, selected);
    container.querySelector('#btnCalAddEvent').addEventListener('click', openAddEv);
    container.querySelector('#btnSideAddEvent').addEventListener('click', openAddEv);
    container.querySelector('#btnSideAddLog').addEventListener('click', async () => {
      await OGSM.views.logs.createNewLog({ date: selected });
      store.setView('logs');
    });

    // 編輯／刪除行程
    container.querySelectorAll('[data-edit-event]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ev = store.state.data.events.find((x) => x.id === btn.dataset.editEvent);
        if (ev) OGSM.modals.openEventModal(ev);
      });
    });
    container.querySelectorAll('[data-del-event]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await store.deleteRecord('events', btn.dataset.delEvent);
        store.toast('已刪除行程');
      });
    });

    // 當日 To-Do 勾選
    container.querySelectorAll('[data-cal-todo]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const t = store.state.data.todos.find((x) => x.id === btn.dataset.calTodo);
        if (t) await store.saveRecord('todos', { ...t, completed: !t.completed });
      });
    });

    // 跳轉行動 M 或時間軸日誌
    container.querySelectorAll('[data-open-measure]').forEach((el) => {
      el.addEventListener('click', () => OGSM.drawer.open(el.dataset.openMeasure));
    });
    container.querySelectorAll('[data-jump-log]').forEach((el) => {
      el.addEventListener('click', () => OGSM.views.logs.openLogById(el.dataset.jumpLog));
    });
  }

  OGSM.views.calendar = { render };
})(window);
