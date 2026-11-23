/* ============================================================
   js/views/audit.js — ④ 檢核工具（任務檢核清單 + 週／月定期覆盤表）
   ============================================================ */
(function (global) {
  'use strict';

  const OGSM = (global.OGSM = global.OGSM || {});
  OGSM.views = OGSM.views || {};

  function render(container) {
    const store = OGSM.store;
    const { esc } = store;
    const project = store.currentProject();

    if (!project) {
      container.innerHTML = `<div class="empty-state"><p>請先建立或選擇一個專案。</p></div>`;
      return;
    }

    const q = store.state.searchQuery;
    const chkFilter = store.state.auditChecklistFilter;
    const measures = store.projectMeasures();
    const reviews = store.projectReviews();
    const logs = store.projectLogs();
    const summary = store.projectSummary();

    // 左欄：依 M 分組呈現檢核清單
    const checklistGroupsHtml = measures
      .map((m) => {
        const allItems = store.measureChecklists(m.id);
        const files = store.measureFiles(m.id);
        const doneCount = allItems.filter((c) => c.checked).length;
        const visibleItems = allItems.filter((c) => {
          if (chkFilter === 'pending' && c.checked) return false;
          if (q && !(c.text || '').toLowerCase().includes(q) && !(m.title || '').toLowerCase().includes(q)) {
            return false;
          }
          return true;
        });

        // 在「待檢核」模式下，若這項 M 已經全部勾完且有項目，隱藏以維持極簡（切到「全部」可看到所有 M）
        if (chkFilter === 'pending' && allItems.length > 0 && doneCount === allItems.length) {
          return '';
        }
        if (q && visibleItems.length === 0 && !(m.title || '').toLowerCase().includes(q)) {
          return '';
        }

        const pillCls =
          allItems.length === 0 ? '' : doneCount === allItems.length ? 'green' : 'amber';

        return `
          <div class="checklist-group">
            <div class="checklist-group-head">
              <div style="min-width:0;flex:1;">
                <div class="checklist-group-title" data-open-measure="${esc(m.id)}">
                  M · ${esc(m.title)}
                </div>
                ${
                  files.length
                    ? `<div class="row-gap-xs" style="margin-top:6px;flex-wrap:wrap;">
                        ${files.slice(0, 2).map((f) => store.renderDriveChip(f)).join('')}
                      </div>`
                    : ''
                }
              </div>
              <span class="pill ${pillCls}">${doneCount}/${allItems.length} 已檢核</span>
            </div>

            <div class="checklist-items">
              ${
                visibleItems.length
                  ? visibleItems
                      .map((c) => {
                        const chkLogs = logs.filter((l) => (l.checklistIds || []).includes(c.id));
                        return `
                        <div class="checklist-item-wrap">
                          <div class="checklist-row ${c.checked ? 'done' : ''}">
                            <button class="checkbox-round ${c.checked ? 'checked' : ''}"
                                    data-toggle-check="${esc(c.id)}"
                                    aria-label="勾選檢核項">${c.checked ? '✓' : ''}</button>
                            <span style="flex:1;">${esc(c.text)}</span>
                            <button class="btn-icon danger" style="width:24px;height:24px;font-size:12px;"
                                    data-del-check="${esc(c.id)}" title="刪除">✕</button>
                          </div>
                          ${
                            chkLogs.length
                              ? `<div class="related-logs-strip compact">
                                  <span class="related-logs-label">✎ 日誌</span>
                                  <div class="related-logs-list">
                                    ${chkLogs
                                      .map(
                                        (l) => `
                                        <button type="button" class="log-title-pill" data-jump-log="${esc(l.id)}"
                                                title="點擊前往工作日誌：${esc(l.date)} ${esc(l.title || '工作紀錄')}">
                                          <span class="log-pill-date">${esc(store.shortDate(l.date))}</span>
                                          <span class="log-pill-title">${esc(l.title || `${l.date} 工作紀錄`)}</span>
                                        </button>
                                      `
                                      )
                                      .join('')}
                                  </div>
                                </div>`
                              : ''
                          }
                        </div>
                      `;
                      })
                      .join('')
                  : `<div class="muted-text" style="font-size:12px;padding:4px 2px;">尚無檢核條件，可在下方直接新增。</div>`
              }
            </div>

            <form class="checklist-add-inline" data-add-check-form="${esc(m.id)}">
              <input type="text" class="input" style="padding:6px 10px;font-size:12.5px;"
                     placeholder="新增驗收檢核點，按 Enter..." />
              <button type="submit" class="btn btn-sm">＋</button>
            </form>
          </div>
        `;
      })
      .filter(Boolean)
      .join('');

    // 右欄：週／月定期覆盤紀錄
    const filteredReviews = reviews.filter((r) => {
      if (!q) return true;
      return (
        (r.periodLabel || '').toLowerCase().includes(q) ||
        (r.wins || '').toLowerCase().includes(q) ||
        (r.blockers || '').toLowerCase().includes(q) ||
        (r.nextActions || '').toLowerCase().includes(q)
      );
    });

    const reviewsHtml = filteredReviews.length
      ? filteredReviews
          .map(
            (r) => `
            <article class="review-card">
              <div class="row-between">
                <div class="row-gap-xs">
                  <span class="pill ${r.periodType === 'monthly' ? 'blue' : 'green'}">
                    ${r.periodType === 'monthly' ? '月覆盤' : '週覆盤'}
                  </span>
                  <strong style="font-size:14px;">${esc(r.periodLabel)}</strong>
                </div>
                <div class="row-gap-xs" style="flex-shrink:0;">
                  <span class="muted-text" style="font-size:12px;white-space:nowrap;">${esc(r.reviewDate)}</span>
                  <button class="btn-icon" data-edit-review="${esc(r.id)}" title="編輯覆盤">✎</button>
                  <button class="btn-icon danger" data-del-review="${esc(r.id)}" title="刪除覆盤">✕</button>
                </div>
              </div>

              <div class="review-snapshots">
                <div class="snap-box">
                  <div class="snap-label">G 目標達成</div>
                  <div class="snap-val" style="color:var(--green);">${Number(r.snapshotGoalRate) || 0}%</div>
                </div>
                <div class="snap-box">
                  <div class="snap-label">M 行動進度</div>
                  <div class="snap-val" style="color:var(--accent);">${Number(r.snapshotMeasureRate) || 0}%</div>
                </div>
                <div class="snap-box">
                  <div class="snap-label">檢核完成率</div>
                  <div class="snap-val" style="color:var(--amber);">${Number(r.snapshotChecklistRate) || 0}%</div>
                </div>
              </div>

              ${
                r.wins
                  ? `<div class="review-section">
                      <div class="review-section-label">本期進展亮點</div>
                      <div class="review-section-body">${esc(r.wins)}</div>
                    </div>`
                  : ''
              }
              ${
                r.blockers
                  ? `<div class="review-section">
                      <div class="review-section-label">卡關與落後原因</div>
                      <div class="review-section-body">${esc(r.blockers)}</div>
                    </div>`
                  : ''
              }
              ${
                r.nextActions
                  ? `<div class="review-section">
                      <div class="review-section-label">下期調整行動</div>
                      <div class="review-section-body">${esc(r.nextActions)}</div>
                    </div>`
                  : ''
              }
              ${(() => {
                const revLogs = logs.filter((l) => (l.reviewIds || []).includes(r.id));
                if (!revLogs.length) return '';
                return `
                  <div class="review-section">
                    <div class="review-section-label">相關工作日誌 (${revLogs.length})</div>
                    <div class="related-logs-list" style="margin-top:4px;">
                      ${revLogs
                        .map(
                          (l) => `
                          <button type="button" class="log-title-pill" data-jump-log="${esc(l.id)}"
                                  title="點擊前往工作日誌：${esc(l.date)} ${esc(l.title || '工作紀錄')}">
                            <span class="log-pill-date">${esc(l.date)}</span>
                            <span class="log-pill-title">${esc(l.title || `${l.date} 工作紀錄`)}</span>
                          </button>
                        `
                        )
                        .join('')}
                    </div>
                  </div>
                `;
              })()}
            </article>
          `
          )
          .join('')
      : `<div class="empty-state">
          <p>尚無定期覆盤紀錄。每週或月底花 5 分鐘做一次 OGSM 快照檢討吧！</p>
          <button class="btn btn-primary" id="btnEmptyNewReview">＋ 建立本期覆盤</button>
        </div>`;

    container.innerHTML = `
      <div class="audit-grid">
        <!-- 左欄：任務檢核清單 Checklist -->
        <section>
          <div class="section-header">
            <div>
              <h2 class="section-title">任務檢核清單（Checklist）</h2>
              <div class="muted-text" style="font-size:12px;">整體檢核完成率：${summary.checklistRate}%（待檢核 ${summary.pendingChecks} 項）</div>
            </div>
            <div class="seg-tabs">
              <button class="seg-tab ${chkFilter === 'pending' ? 'active' : ''}" data-chk-filter="pending">待檢核</button>
              <button class="seg-tab ${chkFilter === 'all' ? 'active' : ''}" data-chk-filter="all">全部項目</button>
            </div>
          </div>
          ${
            checklistGroupsHtml ||
            `<div class="empty-state">
              <p>${chkFilter === 'pending' ? '太棒了！目前所有已建立的檢核清單皆已完成。' : '尚未建立行動項目 M，先到 OGSM 藍圖建立即可新增檢核點。'}</p>
            </div>`
          }
        </section>

        <!-- 右欄：週／月定期覆盤表 -->
        <section>
          <div class="section-header">
            <div>
              <h2 class="section-title">週／月定期覆盤表</h2>
              <div class="muted-text" style="font-size:12px;">自動擷取當下 OGSM 達成率快照，追蹤節奏變化</div>
            </div>
            <button class="btn btn-primary btn-sm" id="btnNewReview">＋ 建立本期覆盤</button>
          </div>
          ${reviewsHtml}
        </section>
      </div>
    `;

    // 綁定事件
    container.querySelectorAll('[data-chk-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.state.auditChecklistFilter = btn.dataset.chkFilter;
        store.notify();
      });
    });

    container.querySelectorAll('[data-toggle-check]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const item = store.state.data.checklists.find((c) => c.id === btn.dataset.toggleCheck);
        if (!item) return;
        await store.saveRecord('checklists', { ...item, checked: !item.checked });
      });
    });

    container.querySelectorAll('[data-del-check]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await store.deleteRecord('checklists', btn.dataset.delCheck);
        store.toast('已刪除檢核項目');
      });
    });

    container.querySelectorAll('[data-add-check-form]').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = form.querySelector('input');
        const text = input.value.trim();
        if (!text) return;
        const measureId = form.dataset.addCheckForm;
        const existing = store.measureChecklists(measureId);
        await store.saveRecord('checklists', {
          id: OGSM.db.uid('chk'),
          projectId: store.state.currentProjectId,
          measureId,
          text,
          checked: false,
          order: existing.length + 1,
        });
        store.toast('已新增檢核項目');
      });
    });

    container.querySelectorAll('[data-open-measure]').forEach((el) => {
      el.addEventListener('click', () => OGSM.drawer.open(el.dataset.openMeasure));
    });

    container.querySelectorAll('[data-jump-log]').forEach((el) => {
      el.addEventListener('click', () => OGSM.views.logs.openLogById(el.dataset.jumpLog));
    });

    const btnNewReview = container.querySelector('#btnNewReview');
    if (btnNewReview) btnNewReview.addEventListener('click', () => OGSM.modals.openReviewModal());

    const btnEmptyNewReview = container.querySelector('#btnEmptyNewReview');
    if (btnEmptyNewReview) btnEmptyNewReview.addEventListener('click', () => OGSM.modals.openReviewModal());

    container.querySelectorAll('[data-edit-review]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rev = store.state.data.reviews.find((r) => r.id === btn.dataset.editReview);
        if (rev) OGSM.modals.openReviewModal(rev);
      });
    });

    container.querySelectorAll('[data-del-review]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('確定要刪除這筆覆盤紀錄嗎？')) return;
        await store.deleteRecord('reviews', btn.dataset.delReview);
        store.toast('已刪除覆盤紀錄');
      });
    });
  }

  OGSM.views.audit = { render };
})(window);
