/* ============================================================
   js/db.js — IndexedDB 資料庫層 + 範例資料 + JSON 備份/還原
   ============================================================ */
(function (global) {
  'use strict';

  const OGSM = (global.OGSM = global.OGSM || {});
  const DB_NAME = 'OGSMFlowDB';
  const DB_VERSION = 2;
  const STORES = [
    'projects',
    'goals',
    'strategies',
    'measures',
    'todos',
    'checklists',
    'files',
    'reviews',
    'logs',
  ];

  let dbInstance = null;

  function uid(prefix) {
    return (
      (prefix || 'id') +
      '_' +
      Date.now().toString(36) +
      '_' +
      Math.random().toString(36).slice(2, 7)
    );
  }

  function formatDate(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function offsetDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return formatDate(d);
  }

  function detectDriveType(url, name) {
    const u = (url || '').toLowerCase();
    const n = (name || '').toLowerCase();
    if (u.includes('docs.google.com/document')) return 'doc';
    if (u.includes('docs.google.com/spreadsheets')) return 'sheet';
    if (u.includes('docs.google.com/presentation')) return 'slide';
    if (u.includes('drive.google.com/drive/folders') || u.includes('/folders/')) return 'folder';
    if (u.endsWith('.pdf') || n.endsWith('.pdf')) return 'pdf';
    if (u.includes('drive.google.com')) return 'doc';
    return 'link';
  }

  function driveTypeMeta(type) {
    const map = {
      doc: { label: 'Docs', icon: '📄', cls: 'doc' },
      sheet: { label: 'Sheets', icon: '📊', cls: 'sheet' },
      slide: { label: 'Slides', icon: '📽', cls: 'slide' },
      folder: { label: '資料夾', icon: '📁', cls: 'folder' },
      pdf: { label: 'PDF', icon: '📕', cls: 'pdf' },
      link: { label: '連結', icon: '🔗', cls: 'link' },
    };
    return map[type] || map.link;
  }

  function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        STORES.forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id' });
          }
        });
      };
      req.onsuccess = (e) => {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function getAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function put(storeName, record) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  }

  async function remove(storeName, id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function clearStore(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function loadAllStores() {
    const entries = await Promise.all(
      STORES.map(async (s) => [s, await getAll(s)])
    );
    return Object.fromEntries(entries);
  }

  async function exportAll() {
    const data = await loadAllStores();
    return {
      app: 'OGSM Flow',
      version: 1,
      exportedAt: new Date().toISOString(),
      data,
    };
  }

  async function importAll(payload) {
    const source = payload && payload.data ? payload.data : payload;
    if (!source || !Array.isArray(source.projects)) {
      throw new Error('備份檔案格式不正確，找不到 projects 資料。');
    }
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES, 'readwrite');
      STORES.forEach((storeName) => {
        const os = tx.objectStore(storeName);
        os.clear();
        const rows = Array.isArray(source[storeName]) ? source[storeName] : [];
        rows.forEach((row) => os.put(row));
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function buildSeedData() {
    const p1 = 'proj_demo_1';
    const g1 = 'goal_demo_1';
    const g2 = 'goal_demo_2';
    const s1 = 'strat_demo_1';
    const s2 = 'strat_demo_2';
    const s3 = 'strat_demo_3';
    const m1 = 'meas_demo_1';
    const m2 = 'meas_demo_2';
    const m3 = 'meas_demo_3';
    const m4 = 'meas_demo_4';

    return {
      projects: [
        {
          id: p1,
          name: '個人品牌與產品上線計畫',
          objective: '透過聚焦高價值內容與輕量產品驗證，在本季穩定累積核心讀者並完成首版上線',
          period: `${offsetDate(-14).slice(0, 7)} ～ ${offsetDate(45).slice(0, 7)}`,
          createdAt: new Date().toISOString(),
        },
      ],
      goals: [
        {
          id: g1,
          projectId: p1,
          title: '完成首版產品 MVP 並取得首批使用者回饋',
          metricName: '種子測試者回饋數',
          currentValue: 12,
          targetValue: 20,
          unit: '份',
          deadline: offsetDate(21),
          order: 1,
        },
        {
          id: g2,
          projectId: p1,
          title: '建立穩定內容輸出節奏，提升自然流量',
          metricName: '深度文章發表數',
          currentValue: 5,
          targetValue: 8,
          unit: '篇',
          deadline: offsetDate(30),
          order: 2,
        },
      ],
      strategies: [
        {
          id: s1,
          projectId: p1,
          goalId: g1,
          title: '聚焦核心功能，兩週內完成可測試原型',
          description: '先砍掉次要設定，確保主流程順暢可用',
          order: 1,
        },
        {
          id: s2,
          projectId: p1,
          goalId: g1,
          title: '進行 1 對 1 種子用戶訪談並快速迭代',
          description: '整理回饋清單，每週修正最高頻痛點',
          order: 2,
        },
        {
          id: s3,
          projectId: p1,
          goalId: g2,
          title: '建立固定每週兩篇的寫作與發佈流程',
          description: '統一在 Google Drive 維護草稿與素材庫',
          order: 3,
        },
      ],
      measures: [
        {
          id: m1,
          projectId: p1,
          goalId: g1,
          strategyId: s1,
          title: '完成系統規格書與畫面線框稿',
          metric: '通過自檢清單 100%',
          startDate: offsetDate(-7),
          endDate: offsetDate(-1),
          progress: 100,
          isMilestone: false,
          order: 1,
        },
        {
          id: m2,
          projectId: p1,
          goalId: g1,
          strategyId: s1,
          title: '核心介面開發與本機資料測試',
          metric: '完成主流程 4 個核心頁面',
          startDate: offsetDate(-2),
          endDate: offsetDate(6),
          progress: 65,
          isMilestone: false,
          order: 2,
        },
        {
          id: m3,
          projectId: p1,
          goalId: g1,
          strategyId: s2,
          title: '首波種子用戶體驗測試（里程碑）',
          metric: '回收 20 份有效問卷與訪談紀錄',
          startDate: offsetDate(5),
          endDate: offsetDate(14),
          progress: 25,
          isMilestone: false,
          order: 3,
        },
        {
          id: m4,
          projectId: p1,
          goalId: g2,
          strategyId: s3,
          title: '系列實戰筆記撰寫與排程發佈',
          metric: '每週穩定上架 2 篇並追蹤點閱',
          startDate: offsetDate(-4),
          endDate: offsetDate(12),
          progress: 55,
          isMilestone: false,
          order: 4,
        },
      ],
      todos: [
        {
          id: 'todo_demo_1',
          projectId: p1,
          measureId: m2,
          title: '確認甘特圖在日／週切換時的日期對齊',
          dueDate: offsetDate(0),
          completed: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'todo_demo_2',
          projectId: p1,
          measureId: m2,
          title: '補上 Google Drive 連結快速貼上測試',
          dueDate: offsetDate(1),
          completed: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'todo_demo_3',
          projectId: p1,
          measureId: m3,
          title: '寄出第一批測試邀請與問卷連結',
          dueDate: offsetDate(3),
          completed: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'todo_demo_4',
          projectId: p1,
          measureId: null, // 獨立臨時待辦（不綁 OGSM）
          title: '整理本月 Google Drive 備份資料夾（獨立待辦範例）',
          dueDate: offsetDate(0),
          completed: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'todo_demo_5',
          projectId: p1,
          measureId: null,
          title: '預約下週牙醫回診（臨時雜事範例）',
          dueDate: offsetDate(4),
          completed: false,
          createdAt: new Date().toISOString(),
        },
      ],
      checklists: [
        { id: 'chk_1', projectId: p1, measureId: m1, text: 'OGSM 四層欄位結構定案', checked: true, order: 1 },
        { id: 'chk_2', projectId: p1, measureId: m1, text: '完成主要畫面草圖並存檔至 Google Drive', checked: true, order: 2 },
        { id: 'chk_3', projectId: p1, measureId: m2, text: '確認深色模式對比度柔和不刺眼', checked: true, order: 1 },
        { id: 'chk_4', projectId: p1, measureId: m2, text: '驗證 JSON 匯出與還原流程無遺漏', checked: false, order: 2 },
        { id: 'chk_5', projectId: p1, measureId: m2, text: '手機與窄螢幕排版檢查', checked: false, order: 3 },
        { id: 'chk_6', projectId: p1, measureId: m3, text: '訪談問題清單與表單已就緒', checked: true, order: 1 },
        { id: 'chk_7', projectId: p1, measureId: m3, text: '整理 Top 3 改善項目清單', checked: false, order: 2 },
        { id: 'chk_8', projectId: p1, measureId: m4, text: '完成第 6 篇大綱與配圖', checked: false, order: 1 },
      ],
      files: [
        {
          id: 'file_1',
          projectId: p1,
          measureId: m1,
          name: '產品規格與 OGSM 定案文件',
          url: 'https://docs.google.com/document/d/example-spec',
          driveType: 'doc',
          note: '最新版 v1.2',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'file_2',
          projectId: p1,
          measureId: m2,
          name: '開發進度與測試清單',
          url: 'https://docs.google.com/spreadsheets/d/example-tracker',
          driveType: 'sheet',
          note: 'QA 測試紀錄表',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'file_3',
          projectId: p1,
          measureId: m3,
          name: '種子用戶訪談簡報',
          url: 'https://docs.google.com/presentation/d/example-deck',
          driveType: 'slide',
          note: 'Demo 引導頁',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'file_4',
          projectId: p1,
          measureId: m4,
          name: '文章草稿與素材資料夾',
          url: 'https://drive.google.com/drive/folders/example-assets',
          driveType: 'folder',
          note: '所有封面圖與草稿',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'file_5',
          projectId: p1,
          measureId: null,
          name: '專案總資料夾（Google Drive）',
          url: 'https://drive.google.com/drive/folders/example-project-root',
          driveType: 'folder',
          note: '專案共用根目錄',
          createdAt: new Date().toISOString(),
        },
      ],
      reviews: [
        {
          id: 'rev_demo_1',
          projectId: p1,
          periodType: 'weekly',
          periodLabel: '上週覆盤（範例）',
          reviewDate: offsetDate(-3),
          snapshotGoalRate: 52,
          snapshotMeasureRate: 50,
          snapshotChecklistRate: 50,
          wins: '規格書如期完成，核心介面已可正常跑通資料儲存流程。',
          blockers: '撰寫深度文章花費時間比預期多，壓縮到測試問卷準備時間。',
          nextActions: '下週改為固定早上 1 小時寫作，下午集中收尾開發與寄出測試邀請。',
          createdAt: new Date().toISOString(),
        },
      ],
      logs: [
        {
          id: 'log_demo_1',
          projectId: p1,
          date: offsetDate(0),
          title: '完成專案管理系統上線與功能盤點',
          measureId: m2,
          contentHtml:
            '<h3>今日重點進展</h3><ul><li>確認 <strong>OGSM 藍圖</strong> 與 <strong>日／週甘特圖</strong> 排程資料正確連動</li><li>整理 Google Drive 檔案連結至檔案庫</li></ul><blockquote><p>備註：明天開始集中整理種子用戶訪談問題清單。</p></blockquote>',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };
  }

  async function ensureSeeded() {
    const projects = await getAll('projects');
    if (projects.length === 0) {
      await importAll({ data: buildSeedData() });
      return true;
    }
    return false;
  }

  async function resetToSeed() {
    await importAll({ data: buildSeedData() });
  }

  OGSM.db = {
    STORES,
    uid,
    formatDate,
    offsetDate,
    detectDriveType,
    driveTypeMeta,
    openDB,
    getAll,
    put,
    remove,
    clearStore,
    loadAllStores,
    exportAll,
    importAll,
    ensureSeeded,
    resetToSeed,
  };
})(window);
