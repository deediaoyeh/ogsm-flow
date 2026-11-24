/* ============================================================
   js/views/gantt.js — ② 甘特圖（日／週視圖 + Google Drive 直達）
   ============================================================ */
(function (global) {
  'use strict';

  const OGSM = (global.OGSM = global.OGSM || {});
  OGSM.views = OGSM.views || {};

  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

  function addDays(date, days) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + days);
    return d;
  }

  function startOfWeekMonday(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function buildTimeline(scale, offsetDays) {
    const today = new Date();
    const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (scale === 'week') {
      const numWeeks = 10;
      const colWidth = 94;
      const anchor = startOfWeekMonday(addDays(todayMid, offsetDays));
      const columns = [];
      for (let i = 0; i < numWeeks; i++) {
        const ws = addDays(anchor, i * 7);
        const we = addDays(ws, 6);
        const isCurrentWeek = todayMid >= ws && todayMid <= we;
        columns.push({
          start: ws,
          end: we,
          label: `${ws.getMonth() + 1}/${ws.getDate()}`,
          sub: `第${i + 1}週`,
          isWeekend: false,
          isToday: isCurrentWeek,
        });
      }
      const rangeStart = columns[0].start;
      const totalDays = numWeeks * 7;
      const pxPerDay = colWidth / 7;
      return { columns, colWidth, totalWidth: numWeeks * colWidth, rangeStart, totalDays, pxPerDay };
    }

    // 預設：日視圖（24 天）
    const numDays = 24;
    const colWidth = 40;
    const rangeStart = addDays(todayMid, offsetDays);
    const columns = [];
    for (let i = 0; i < numDays; i++) {
      const d = addDays(rangeStart, i);
      const dow = d.getDay();
      columns.push({
        start: d,
        end: d,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        sub: WEEKDAYS[dow],
        isWeekend: dow === 0 || dow === 6,
        isToday: d.getTime() === todayMid.getTime(),
      });
    }
    return { columns, colWidth, totalWidth: numDays * colWidth, rangeStart, totalDays: numDays, pxPerDay: colWidth };
  }

  function render(container) {
    const store = OGSM.store;
    const { esc, safeUrl } = store;
    const allMode = store.isAllMode();

    if (!store.hasAnyContext()) {
      container.innerHTML = `<div class="empty-state"><p>請先建立或選擇一個專案。</p></div>`;
      return;
    }

    const scale = store.state.ganttScale;
    const offset = store.state.ganttOffsetDays;
    const q = store.state.searchQuery;
    const tl = buildTimeline(scale, offset);

    const rangeEnd = addDays(tl.rangeStart, tl.totalDays - 1);
    const rangeLabel = `${OGSM.db.formatDate(tl.rangeStart)} ～ ${OGSM.db.formatDate(rangeEnd)}`;

    // 計算「今天」垂直線像素位置
    const todayMid = store.parseDate(store.todayStr());
    const todayDiff = Math.round((todayMid - tl.rangeStart) / 86400000);
    const todayLinePx =
      todayDiff >= 0 && todayDiff < tl.totalDays
        ? Math.round((todayDiff + 0.5) * tl.pxPerDay)
        : null;

    // 依（專案 ->）Goal -> Strategy 分組整理 Measure
    const projectsToWalk = allMode ? store.state.data.projects : [store.currentProject()].filter(Boolean);
    const groups = [];
    projectsToWalk.forEach((proj) => {
      const goals = store.projectGoals(proj.id);
      goals.forEach((g) => {
        const strategies = store.projectStrategies(g.id, proj.id);
        strategies.forEach((s) => {
          const ms = store.projectMeasures(s.id, proj.id).filter((m) => {
            if (!q) return true;
            const files = store.measureFiles(m.id);
            return (
              (m.title || '').toLowerCase().includes(q) ||
              (s.title || '').toLowerCase().includes(q) ||
              (proj.name || '').toLowerCase().includes(q) ||
              files.some((f) => (f.name || '').toLowerCase().includes(q))
            );
          });
          if (ms.length > 0) {
            groups.push({ project: proj, goal: g, strategy: s, measures: ms });
          }
        });
      });
    });

    // 若有未歸屬策略的行動項目也顯示
    const orphanMeasures = store
      .projectMeasures()
      .filter((m) => !m.strategyId || !store.state.data.strategies.some((s) => s.id === m.strategyId))
      .filter((m) => !q || (m.title || '').toLowerCase().includes(q));
    if (orphanMeasures.length) {
      groups.push({ project: null, goal: null, strategy: { title: '其他行動項目' }, measures: orphanMeasures });
    }

    const headerCellsHtml = tl.columns
      .map(
        (col) => `
        <div class="gantt-cell ${col.isWeekend ? 'weekend' : ''} ${col.isToday ? 'today-col' : ''}"
             style="width:${tl.colWidth}px;">
          <span>${esc(col.label)}</span>
          <span class="gantt-cell-day">${esc(col.sub)}</span>
        </div>
      `
      )
      .join('');

    const bgCellsHtml = tl.columns
      .map(
        (col) => `
        <div class="gantt-cell ${col.isWeekend ? 'weekend' : ''} ${col.isToday ? 'today-col' : ''}"
             style="width:${tl.colWidth}px;"></div>
      `
      )
      .join('');

    const rowsHtml = groups
      .map((grp) => {
        const groupTitle =
          allMode && grp.project
            ? `【${grp.project.name}】S · ${grp.strategy.title}`
            : `S · ${grp.strategy.title}`;
        const groupRow = `
          <div class="gantt-row group-row">
            <div class="gantt-left">
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(groupTitle)}">
                ${esc(groupTitle)}
              </span>
            </div>
            <div class="gantt-right" style="width:${tl.totalWidth}px;">
              ${bgCellsHtml}
              ${todayLinePx !== null ? `<div class="gantt-today-line" style="left:${todayLinePx}px;"></div>` : ''}
            </div>
          </div>
        `;

        const taskRows = grp.measures
          .map((m) => {
            const status = store.measureStatus(m);
            const files = store.measureFiles(m.id);
            const checks = store.measureChecklists(m.id);
            const doneChecks = checks.filter((c) => c.checked).length;

            // 計算 Bar 位置
            let barHtml = '';
            const sd = store.parseDate(m.startDate);
            const ed = store.parseDate(m.endDate || m.startDate);
            if (sd && ed) {
              const startOffset = Math.round((sd - tl.rangeStart) / 86400000);
              const endOffset = Math.round((ed - tl.rangeStart) / 86400000);
              if (endOffset >= 0 && startOffset < tl.totalDays) {
                const clampedStart = Math.max(0, startOffset);
                const clampedEnd = Math.min(tl.totalDays - 1, Math.max(startOffset, endOffset));
                const leftPx = Math.round(clampedStart * tl.pxPerDay) + 2;
                const widthPx = Math.max(18, Math.round((clampedEnd - clampedStart + 1) * tl.pxPerDay) - 4);
                const prog = Number(m.progress) || 0;

                if (m.isMilestone) {
                  const midPx = Math.round((endOffset + 0.5) * tl.pxPerDay) - 8;
                  if (endOffset >= 0 && endOffset < tl.totalDays) {
                    barHtml = `<div class="gantt-milestone" style="left:${midPx}px;" data-open-measure="${esc(m.id)}" title="${esc(m.title)} (${esc(m.endDate)})"></div>`;
                  }
                } else {
                  const barCls = status.key === 'done' ? 'done' : status.key === 'overdue' ? 'overdue' : '';
                  barHtml = `
                    <div class="gantt-bar ${barCls}" style="left:${leftPx}px;width:${widthPx}px;"
                         data-open-measure="${esc(m.id)}"
                         title="${esc(m.title)} | ${esc(m.startDate)} ~ ${esc(m.endDate)} (${prog}%)">
                      <div class="gantt-bar-fill" style="width:${prog}%"></div>
                      <span class="gantt-bar-label">${prog}% ${widthPx > 84 ? '· ' + esc(m.title) : ''}</span>
                    </div>
                  `;
                }
              }
            }

            // Google Drive 快捷按鈕（支援連結與已上傳之雲端檔案）
            const driveButtonsHtml = files.length
              ? files
                  .slice(0, 3)
                  .map((f) => {
                    if (f.kind === 'drive_blob' && f.driveFileId) {
                      return `
                        <button type="button" class="drive-mini-btn"
                                data-open-drive-blob="${esc(f.driveFileId)}"
                                data-blob-name="${esc(f.name)}"
                                data-blob-mime="${esc(f.mimeType || '')}"
                                title="${esc(f.name)}（上傳檔案）— 點擊開啟／下載"
                                onclick="event.stopPropagation()">
                          <span style="font-size:11px;" aria-hidden="true">📎</span>
                        </button>
                      `;
                    }
                    const meta = OGSM.db.driveTypeMeta(f.driveType);
                    return `
                      <a class="drive-mini-btn" href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer"
                         title="${esc(f.name)}（${meta.label}）— 點擊開啟 Google Drive"
                         onclick="event.stopPropagation()">
                        <span class="drive-dot ${meta.cls}"></span>
                      </a>
                    `;
                  })
                  .join('') + (files.length > 3 ? `<span class="muted-text" style="font-size:10.5px;">+${files.length - 3}</span>` : '')
              : `<button class="drive-mini-btn" data-open-measure="${esc(m.id)}" title="新增或上傳相關檔案" style="color:var(--text-muted);">＋</button>`;

            return `
              <div class="gantt-row task-row">
                <div class="gantt-left">
                  <div class="gantt-task-info" data-open-measure="${esc(m.id)}">
                    <div class="gantt-task-title" title="${esc(m.title)}">
                      ${m.isMilestone ? '◆ ' : ''}${esc(m.title)}
                    </div>
                    <div class="gantt-task-sub">
                      <span>${esc(store.shortDate(m.startDate))}–${esc(store.shortDate(m.endDate))}</span>
                      <span>${Number(m.progress) || 0}%</span>
                      ${checks.length ? `<span>✓ ${doneChecks}/${checks.length}</span>` : ''}
                      ${status.key === 'overdue' ? `<span style="color:var(--red);">逾期</span>` : ''}
                    </div>
                  </div>
                  <div class="gantt-drive-slot" title="關聯的 Google Drive 檔案">
                    ${driveButtonsHtml}
                  </div>
                </div>
                <div class="gantt-right" style="width:${tl.totalWidth}px;">
                  ${bgCellsHtml}
                  ${todayLinePx !== null ? `<div class="gantt-today-line" style="left:${todayLinePx}px;"></div>` : ''}
                  ${barHtml}
                </div>
              </div>
            `;
          })
          .join('');

        return groupRow + taskRows;
      })
      .join('');

    container.innerHTML = `
      <div class="gantt-toolbar">
        <div class="row-gap-sm">
          <div class="seg-tabs" role="tablist" aria-label="時間尺度">
            <button class="seg-tab ${scale === 'day' ? 'active' : ''}" data-scale="day">日視圖</button>
            <button class="seg-tab ${scale === 'week' ? 'active' : ''}" data-scale="week">週視圖</button>
          </div>
          <div class="row-gap-xs">
            <button class="btn btn-sm" id="btnGanttPrev" title="往前移動">←</button>
            <button class="btn btn-sm" id="btnGanttToday">今天</button>
            <button class="btn btn-sm" id="btnGanttNext" title="往後移動">→</button>
          </div>
          <span class="gantt-range-label">${esc(rangeLabel)}</span>
        </div>
        <div class="muted-text" style="font-size:12px;">
          點擊任務條可調整日期與進度；點擊右側色點可直接開啟 Google Drive 檔案
        </div>
      </div>

      ${
        groups.length
          ? `
            <div class="gantt-shell">
              <div class="gantt-scroll">
                <div class="gantt-table" style="width:max-content;min-width:100%;">
                  <div class="gantt-row header-row">
                    <div class="gantt-left">
                      <span>行動計畫 M</span>
                      <span>Drive 檔案</span>
                    </div>
                    <div class="gantt-right" style="width:${tl.totalWidth}px;">
                      ${headerCellsHtml}
                    </div>
                  </div>
                  ${rowsHtml}
                </div>
              </div>
            </div>
            <div class="gantt-legend">
              <span class="legend-item"><span class="legend-swatch" style="background:var(--accent);"></span>進行中 / 排程中</span>
              <span class="legend-item"><span class="legend-swatch" style="background:var(--green);"></span>已完成</span>
              <span class="legend-item"><span class="legend-swatch" style="background:var(--red);"></span>已逾期</span>
              <span class="legend-item"><span class="drive-dot doc"></span>Docs</span>
              <span class="legend-item"><span class="drive-dot sheet"></span>Sheets</span>
              <span class="legend-item"><span class="drive-dot slide"></span>Slides</span>
              <span class="legend-item"><span class="drive-dot folder"></span>Drive 資料夾</span>
            </div>
          `
          : `<div class="empty-state">
              <p>${q ? '沒有符合搜尋條件的排程項目。' : '目前尚無可顯示的行動計畫 M，先新增一項就能看到甘特圖！'}</p>
              ${!q ? '<button class="btn btn-primary" id="btnGanttEmptyAdd">＋ 新增行動 M</button>' : ''}
            </div>`
      }
    `;

    // 綁定控制項
    container.querySelectorAll('[data-scale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.state.ganttScale = btn.dataset.scale;
        store.state.ganttOffsetDays = btn.dataset.scale === 'week' ? -7 : -5;
        store.notify();
      });
    });

    const stepDays = scale === 'week' ? 21 : 7;
    const btnPrev = container.querySelector('#btnGanttPrev');
    const btnNext = container.querySelector('#btnGanttNext');
    const btnToday = container.querySelector('#btnGanttToday');
    if (btnPrev) btnPrev.addEventListener('click', () => { store.state.ganttOffsetDays -= stepDays; store.notify(); });
    if (btnNext) btnNext.addEventListener('click', () => { store.state.ganttOffsetDays += stepDays; store.notify(); });
    if (btnToday) btnToday.addEventListener('click', () => { store.state.ganttOffsetDays = scale === 'week' ? -7 : -5; store.notify(); });

    const btnEmptyAdd = container.querySelector('#btnGanttEmptyAdd');
    if (btnEmptyAdd) btnEmptyAdd.addEventListener('click', () => OGSM.modals.openMeasureCreateModal());

    container.querySelectorAll('[data-open-measure]').forEach((el) => {
      el.addEventListener('click', () => OGSM.drawer.open(el.dataset.openMeasure));
    });
  }

  OGSM.views.gantt = { render };
})(window);
