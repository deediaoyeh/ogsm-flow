/* ============================================================
   js/views/ogsm.js — ① OGSM 藍圖一頁式總覽視圖
   ============================================================ */
(function (global) {
  'use strict';

  const OGSM = (global.OGSM = global.OGSM || {});
  OGSM.views = OGSM.views || {};

  function matchesSearch(text, q) {
    if (!q) return true;
    return String(text || '').toLowerCase().includes(q);
  }

  function render(container) {
    const store = OGSM.store;
    const { esc } = store;

    // 全部專案總覽模式：呈現所有專案總體規劃一覽表
    if (store.isAllMode()) {
      const projects = store.state.data.projects;
      const summaryAll = store.projectSummary();
      const q = store.state.searchQuery;
      const visibleProjects = projects.filter(
        (p) => !q || (p.name || '').toLowerCase().includes(q) || (p.objective || '').toLowerCase().includes(q)
      );

      container.innerHTML = `
        <section class="objective-banner">
          <div style="flex:1;min-width:0;">
            <div class="objective-tag">ALL PROJECTS · 全部專案總體規劃</div>
            <p class="objective-text">共管理 ${projects.length} 個專案 — 可直接切換左側「甘特圖 / 行事曆 / To-Do / 檢核工具」檢視跨專案總表，或點選下方任一專案進入細部 OGSM。</p>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:12px;">
            <div class="objective-stats">
              <div class="stat-mini">
                <div class="stat-mini-val" style="color:var(--green);">${summaryAll.avgGoalRate}%</div>
                <div class="stat-mini-label">總 G 達成</div>
              </div>
              <div class="stat-mini">
                <div class="stat-mini-val" style="color:var(--accent);">${summaryAll.avgMeasureRate}%</div>
                <div class="stat-mini-label">總 M 進度</div>
              </div>
            </div>
            <button class="btn btn-sm btn-primary" id="btnAllNewProj">＋ 新增專案</button>
          </div>
        </section>

        <div class="portfolio-grid">
          ${visibleProjects
            .map((p) => {
              const s = store.projectSummary(p.id);
              const barColor = s.avgGoalRate >= 80 ? 'green' : s.avgGoalRate >= 40 ? '' : 'amber';
              return `
                <article class="card portfolio-card" data-enter-project="${esc(p.id)}">
                  <div class="row-between" style="margin-bottom:8px;">
                    <h3 style="margin:0;font-size:15.5px;font-weight:600;">${esc(p.name)}</h3>
                    <span class="pill ${s.overdueMeasures > 0 ? 'red' : 'blue'}">
                      ${s.overdueMeasures > 0 ? `${s.overdueMeasures} 項逾期` : `${s.measureCount} 項行動`}
                    </span>
                  </div>
                  <p class="muted-text" style="margin:0 0 12px;font-size:13px;line-height:1.6;">
                    ${esc(p.objective || '尚未填寫目的 O')}
                  </p>
                  <div class="progress-track" style="margin-bottom:10px;">
                    <div class="progress-fill ${barColor}" style="width:${s.avgGoalRate}%"></div>
                  </div>
                  <div class="row-between" style="font-size:12px;color:var(--text-secondary);">
                    <span>G 達成 ${s.avgGoalRate}% · M 進度 ${s.avgMeasureRate}%</span>
                    <span>待辦 ${s.pendingTodos} · 待檢核 ${s.pendingChecks}</span>
                  </div>
                  <div class="row-between" style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);">
                    <span class="muted-text" style="font-size:11.5px;">${esc(p.period || '未設週期')}</span>
                    <div class="row-gap-xs">
                      <button type="button" class="btn btn-sm" data-edit-proj-card="${esc(p.id)}" onclick="event.stopPropagation()">編輯</button>
                      <button type="button" class="btn btn-sm btn-primary" data-enter-project="${esc(p.id)}">進入專案 →</button>
                    </div>
                  </div>
                </article>
              `;
            })
            .join('')}
        </div>
      `;

      const btnNew = container.querySelector('#btnAllNewProj');
      if (btnNew) btnNew.addEventListener('click', () => OGSM.modals.openProjectModal());

      container.querySelectorAll('[data-enter-project]').forEach((el) => {
        el.addEventListener('click', () => store.setProject(el.dataset.enterProject));
      });
      container.querySelectorAll('[data-edit-proj-card]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const p = store.state.data.projects.find((item) => item.id === btn.dataset.editProjCard);
          if (p) OGSM.modals.openProjectModal(p);
        });
      });
      return;
    }

    const project = store.currentProject();

    if (!project) {
      container.innerHTML = `
        <div class="empty-state">
          <p>目前還沒有專案，建立您的第一個 OGSM 專案吧！</p>
          <button class="btn btn-primary" id="btnEmptyNewProj">＋ 建立第一個專案</button>
        </div>
      `;
      const btn = container.querySelector('#btnEmptyNewProj');
      if (btn) btn.addEventListener('click', () => OGSM.modals.openProjectModal());
      return;
    }

    const q = store.state.searchQuery;
    const goals = store.projectGoals();
    const allLogs = store.projectLogs();
    const summary = store.projectSummary();
    const projectRootFiles = store.projectFiles().filter((f) => !f.measureId);

    function renderRelatedLogsRow(logs, label) {
      if (!logs || !logs.length) return '';
      return `
        <div class="related-logs-strip" onclick="event.stopPropagation()">
          <span class="related-logs-label">${esc(label || '相關工作日誌')}</span>
          <div class="related-logs-list">
            ${logs
              .map((l) => {
                const topic = (l.title || '').trim() || `未命名主題（${l.date || '無日期'}）`;
                return `
                <button type="button" class="log-title-pill" data-jump-log="${esc(l.id)}"
                        title="點擊進入工作日誌：${esc(topic)}（${esc(l.date || '')}）">
                  <span class="log-pill-icon" aria-hidden="true">✎</span>
                  <span class="log-pill-title">${esc(topic)}</span>
                  <span class="log-pill-date">${esc(store.shortDate(l.date))}</span>
                </button>
              `;
              })
              .join('')}
          </div>
        </div>
      `;
    }

    const goalsHtml = goals
      .map((goal) => {
        const rate = store.goalRate(goal);
        const barColor = rate >= 100 ? 'green' : rate >= 50 ? '' : 'amber';
        const strategies = store.projectStrategies(goal.id);

        const strategiesHtml = strategies
          .map((strat) => {
            const measures = store.projectMeasures(strat.id).filter((m) => {
              if (!q) return true;
              const files = store.measureFiles(m.id);
              return (
                matchesSearch(m.title, q) ||
                matchesSearch(m.metric, q) ||
                matchesSearch(strat.title, q) ||
                matchesSearch(goal.title, q) ||
                files.some((f) => matchesSearch(f.name, q))
              );
            });

            if (q && measures.length === 0 && !matchesSearch(strat.title, q) && !matchesSearch(goal.title, q)) {
              return '';
            }

            const measuresHtml = measures.length
              ? measures
                  .map((m) => {
                    const status = store.measureStatus(m);
                    const checks = store.measureChecklists(m.id);
                    const doneChecks = checks.filter((c) => c.checked).length;
                    const files = store.measureFiles(m.id);
                    const measureLogs = allLogs.filter(
                      (l) => l.measureId === m.id || (l.ogsmType === 'measure' && l.ogsmId === m.id)
                    );
                    const fillCls = status.key === 'done' ? 'green' : status.key === 'overdue' ? 'red' : '';
                    return `
                      <div class="measure-item-wrap">
                        <div class="measure-row" data-open-measure="${esc(m.id)}">
                          <div class="measure-name">
                            <span class="letter-badge m" style="width:20px;height:20px;font-size:10.5px;">M</span>
                            <span class="measure-name-text" title="${esc(m.title)}">
                              ${m.isMilestone ? '◆ ' : ''}${esc(m.title)}
                            </span>
                            ${status.key === 'overdue' ? '<span class="pill red">逾期</span>' : ''}
                          </div>
                          <div class="measure-dates">
                            ${esc(store.shortDate(m.startDate))} – ${esc(store.shortDate(m.endDate))}
                          </div>
                          <div class="measure-prog">
                            <div class="progress-track" style="width:56px;">
                              <div class="progress-fill ${fillCls}" style="width:${Number(m.progress) || 0}%"></div>
                            </div>
                            <span>${Number(m.progress) || 0}%</span>
                          </div>
                          <div class="measure-files-inline">
                            ${
                              files.length
                                ? files.slice(0, 2).map((f) => store.renderDriveChip(f)).join('') +
                                  (files.length > 2 ? `<span class="muted-text">+${files.length - 2}</span>` : '')
                                : '<span class="muted-text" style="font-size:11.5px;">尚無檔案</span>'
                            }
                          </div>
                          <div class="measure-check-count" title="檢核清單完成數">
                            ${checks.length ? `✓ ${doneChecks}/${checks.length}` : '—'}
                          </div>
                        </div>
                        ${OGSM.editor ? OGSM.editor.renderNoteBlock(m.noteHtml, m.attachments, 'in-measure') : ''}
                        ${renderRelatedLogsRow(measureLogs, '相關日誌')}
                      </div>
                    `;
                  })
                  .join('')
              : `<div class="muted-text" style="padding:8px 6px;font-size:12px;">尚無行動項目 M，點擊右上角「＋ 行動 M」開始排程。</div>`;

            const stratLogs = allLogs.filter(
              (l) => l.ogsmType === 'strategy' && l.ogsmId === strat.id
            );

            const stratNoteHtml =
              strat.noteHtml || (strat.description ? `<p>${esc(strat.description)}</p>` : '');

            return `
              <div class="strategy-block">
                <div class="strategy-header">
                  <div class="strategy-title-row">
                    <span class="letter-badge s">S</span>
                    <div>
                      <div class="strategy-title">${esc(strat.title)}</div>
                    </div>
                  </div>
                  <div class="row-gap-xs">
                    <button class="btn btn-sm" data-add-measure="${esc(strat.id)}" data-goal-id="${esc(goal.id)}">＋ 行動 M</button>
                    <button class="btn-icon" data-edit-strategy="${esc(strat.id)}" title="編輯策略">✎</button>
                  </div>
                </div>
                ${OGSM.editor ? OGSM.editor.renderNoteBlock(stratNoteHtml, strat.attachments, 'in-strategy') : ''}
                ${renderRelatedLogsRow(stratLogs, '相關日誌')}
                <div class="measure-rows">${measuresHtml}</div>
              </div>
            `;
          })
          .filter(Boolean)
          .join('');

        if (q && !strategiesHtml && !matchesSearch(goal.title, q)) {
          return '';
        }

        const goalLogs = allLogs.filter(
          (l) => l.ogsmType === 'goal' && l.ogsmId === goal.id
        );

        return `
          <article class="goal-card">
            <div class="goal-header">
              <div class="goal-title-group">
                <span class="letter-badge g">G</span>
                <div>
                  <h3 class="goal-title">${esc(goal.title)}</h3>
                  <div class="muted-text" style="font-size:12px;">
                    ${goal.metricName ? `指標：${esc(goal.metricName)}` : ''}
                    ${goal.deadline ? ` · 目標日 ${esc(goal.deadline)}` : ''}
                  </div>
                </div>
              </div>
              <div class="goal-metric-box">
                <button class="goal-metric-pill" data-edit-goal="${esc(goal.id)}" title="點擊更新目標數值">
                  ${Number(goal.currentValue) || 0} / ${Number(goal.targetValue) || 0} ${esc(goal.unit || '')} · <strong>${rate}%</strong>
                </button>
                <div class="goal-bar-wrap">
                  <div class="progress-track">
                    <div class="progress-fill ${barColor}" style="width:${rate}%"></div>
                  </div>
                </div>
                <button class="btn btn-sm" data-add-strategy="${esc(goal.id)}">＋ 策略 S</button>
                <button class="btn-icon" data-edit-goal="${esc(goal.id)}" title="編輯目標">✎</button>
              </div>
            </div>
            ${OGSM.editor ? OGSM.editor.renderNoteBlock(goal.noteHtml, goal.attachments, 'in-goal') : ''}
            ${goalLogs.length ? `<div style="padding:10px 18px 0;">${renderRelatedLogsRow(goalLogs, '相關日誌')}</div>` : ''}
            <div class="strategy-list">
              ${
                strategiesHtml ||
                `<div class="muted-text" style="font-size:12.5px;padding:4px 2px;">尚未設定策略 S，點擊上方「＋ 策略 S」建立執行方向。</div>`
              }
            </div>
          </article>
        `;
      })
      .filter(Boolean)
      .join('');

    container.innerHTML = `
      <!-- O 目的橫幅 -->
      <section class="objective-banner">
        <div style="flex:1;min-width:0;">
          <div class="objective-tag">O · OBJECTIVE 專案目的</div>
          <p class="objective-text">${esc(project.objective || '尚未填寫專案目的 O')}</p>
          ${OGSM.editor ? OGSM.editor.renderNoteBlock(project.noteHtml, project.attachments, 'in-objective') : ''}
          <div class="objective-meta">
            <span>週期：${esc(project.period || '未設定')}</span>
            <span>目標 G：${summary.goalCount} 項</span>
            <span>行動 M：${summary.measureCount} 項</span>
            <button type="button" class="pill blue" id="btnJumpProjectFiles" style="border:none;cursor:pointer;">
              📁 專案檔案庫 (${OGSM.views.files ? OGSM.views.files.collectProjectFiles(store).length : projectRootFiles.length}) →
            </button>
            ${
              projectRootFiles.length
                ? `<span class="row-gap-xs" style="display:inline-flex;">${projectRootFiles.map((f) => store.renderDriveChip(f)).join('')}</span>`
                : ''
            }
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:12px;">
          <div class="objective-stats">
            <div class="stat-mini">
              <div class="stat-mini-val" style="color:var(--green);">${summary.avgGoalRate}%</div>
              <div class="stat-mini-label">G 平均達成</div>
            </div>
            <div class="stat-mini">
              <div class="stat-mini-val" style="color:var(--accent);">${summary.avgMeasureRate}%</div>
              <div class="stat-mini-label">M 平均進度</div>
            </div>
          </div>
          <div class="row-gap-xs" style="flex-wrap:wrap;justify-content:flex-end;">
            <button class="btn btn-sm btn-danger" id="btnDeleteProjectOgsm">刪除專案</button>
            <button class="btn btn-sm" id="btnEditProject">編輯專案 / O</button>
            <button class="btn btn-sm btn-primary" id="btnAddGoal">＋ 新增目標 G</button>
          </div>
        </div>
      </section>

      <!-- G → S → M 階層列表 -->
      <div class="goal-list">
        ${
          goalsHtml ||
          `<div class="empty-state">
            <p>${q ? '沒有符合搜尋條件的 OGSM 項目。' : '尚未建立目標 G，先新增一個可量化的目標吧！'}</p>
            ${!q ? '<button class="btn btn-primary" id="btnEmptyAddGoal">＋ 新增目標 G</button>' : ''}
          </div>`
        }
      </div>
    `;

    // 綁定事件
    const btnDeleteProjectOgsm = container.querySelector('#btnDeleteProjectOgsm');
    if (btnDeleteProjectOgsm) btnDeleteProjectOgsm.addEventListener('click', () => OGSM.modals.openDeleteProjectModal(project));

    const btnJumpProjFiles = container.querySelector('#btnJumpProjectFiles');
    if (btnJumpProjFiles) btnJumpProjFiles.addEventListener('click', () => store.setView('files'));

    const btnEditProject = container.querySelector('#btnEditProject');
    if (btnEditProject) btnEditProject.addEventListener('click', () => OGSM.modals.openProjectModal(project));

    const btnAddGoal = container.querySelector('#btnAddGoal');
    if (btnAddGoal) btnAddGoal.addEventListener('click', () => OGSM.modals.openGoalModal());

    const btnEmptyAddGoal = container.querySelector('#btnEmptyAddGoal');
    if (btnEmptyAddGoal) btnEmptyAddGoal.addEventListener('click', () => OGSM.modals.openGoalModal());

    container.querySelectorAll('[data-edit-goal]').forEach((el) => {
      el.addEventListener('click', () => {
        const g = store.state.data.goals.find((item) => item.id === el.dataset.editGoal);
        if (g) OGSM.modals.openGoalModal(g);
      });
    });

    container.querySelectorAll('[data-add-strategy]').forEach((el) => {
      el.addEventListener('click', () => OGSM.modals.openStrategyModal(null, el.dataset.addStrategy));
    });

    container.querySelectorAll('[data-edit-strategy]').forEach((el) => {
      el.addEventListener('click', () => {
        const s = store.state.data.strategies.find((item) => item.id === el.dataset.editStrategy);
        if (s) OGSM.modals.openStrategyModal(s);
      });
    });

    container.querySelectorAll('[data-add-measure]').forEach((el) => {
      el.addEventListener('click', () =>
        OGSM.modals.openMeasureCreateModal(el.dataset.goalId, el.dataset.addMeasure)
      );
    });

    container.querySelectorAll('[data-open-measure]').forEach((el) => {
      el.addEventListener('click', () => OGSM.drawer.open(el.dataset.openMeasure));
    });

    container.querySelectorAll('[data-jump-log]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        OGSM.views.logs.openLogById(el.dataset.jumpLog);
      });
    });
  }

  OGSM.views.ogsm = { render };
})(window);
