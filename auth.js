/* ============================================================
   auth.js — 嚴格 Google 帳號驗證 + Google Drive (appDataFolder) 自動雲端同步
   ============================================================ */
(function (global) {
  'use strict';

  const OGSM = (global.OGSM = global.OGSM || {});

  // 嚴格安全設定（不含明碼 Email，僅保留 SHA-256 雜湊）
  const CONFIG = {
    GOOGLE_CLIENT_ID: '698887704970-b729g85hp93etn1vdd3mcknefs4l4gt7.apps.googleusercontent.com',
    ALLOWED_EMAIL_SHA256: '5dc1dc34a7562fd7703c9db4a9080d06f49c4ced24e6e26c23be7a19fd645072',
    SCOPES: 'openid email profile https://www.googleapis.com/auth/drive.appdata',
    DRIVE_FILENAME: 'ogsm-flow-db.json',
    IDLE_TIMEOUT_MS: 60 * 60 * 1000, // 60 分鐘閒置自動鎖定
  };

  // 所有憑證僅存在記憶體，絕不寫入 localStorage 或 cookie
  const session = {
    authenticated: false,
    accessToken: null,
    expiresAt: 0,
    user: null, // { email, name, picture }
    driveFileId: null,
    lastKnownDriveModifiedTime: null,
    hadRemoteProjects: false,
    syncStatus: 'idle', // 'idle' | 'syncing' | 'synced' | 'error'
    lastSyncedAt: null,
    syncError: '',
  };

  let tokenClient = null;
  let syncTimer = null;
  let idleTimer = null;
  let expiryTimer = null;
  let isPulling = false;
  let pendingDeletedIds = {};

  function markLocalDirty() {
    try {
      localStorage.setItem('ogsm_dirty_local', '1');
    } catch (_) {}
  }

  function clearLocalDirty() {
    try {
      localStorage.removeItem('ogsm_dirty_local');
    } catch (_) {}
    pendingDeletedIds = {};
  }

  function hasPendingLocalChanges() {
    try {
      return localStorage.getItem('ogsm_dirty_local') === '1';
    } catch (_) {
      return false;
    }
  }

  function markDeletedId(id) {
    if (id) pendingDeletedIds[id] = Date.now();
  }

  async function sha256Hex(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function setLockMessage(msg, isError) {
    const el = document.getElementById('authMessage');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'auth-message' + (isError ? ' error' : '');
    el.hidden = !msg;
  }

  function setSignInLoading(loading) {
    const btn = document.getElementById('btnGoogleSignIn');
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? '正在驗證 Google 身分與雲端資料...' : '使用 Google 帳號驗證登入';
  }

  function updateSyncUI() {
    const statusEls = document.querySelectorAll('[data-sync-status]');
    const timeStr = session.lastSyncedAt
      ? new Date(session.lastSyncedAt).toLocaleTimeString('zh-Hant', { hour: '2-digit', minute: '2-digit' })
      : '';
    let label = '☁ 尚未同步';
    let cls = '';
    if (session.syncStatus === 'syncing') {
      label = '↻ 同步至 Google Drive...';
      cls = 'blue';
    } else if (session.syncStatus === 'synced') {
      label = `☁ 已同步 ${timeStr}`;
      cls = 'green';
    } else if (session.syncStatus === 'error') {
      label = '⚠ 同步失敗（點擊重試）';
      cls = 'red';
    }
    statusEls.forEach((el) => {
      el.textContent = label;
      el.className = `sync-pill ${cls}`;
      el.title = session.syncError || '點擊立即與 Google Drive 同步';
    });

    const userEl = document.getElementById('authUserBadge');
    if (userEl && session.user) {
      userEl.textContent = session.user.name || session.user.email;
      userEl.title = `已驗證：${session.user.email}`;
    }
  }

  function showLockScreen(message, isError) {
    const gate = document.getElementById('authGate');
    const shell = document.getElementById('appShell');
    const bottomNav = document.getElementById('mobileBottomNav');
    if (shell) shell.hidden = true;
    if (bottomNav) bottomNav.style.display = 'none';
    if (gate) gate.hidden = false;
    setSignInLoading(false);
    setLockMessage(message || '', Boolean(isError));
  }

  function showAppShell() {
    const gate = document.getElementById('authGate');
    const shell = document.getElementById('appShell');
    const bottomNav = document.getElementById('mobileBottomNav');
    if (gate) gate.hidden = true;
    if (shell) shell.hidden = false;
    if (bottomNav) bottomNav.style.display = '';
    updateSyncUI();
  }

  function resetIdleTimer() {
    if (!session.authenticated) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      lockSession('已閒置超過 60 分鐘，系統已自動上鎖以保護資料，請重新驗證 Google 帳號。', false);
    }, CONFIG.IDLE_TIMEOUT_MS);
  }

  function bindActivityWatchers() {
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((ev) => {
      window.addEventListener(ev, resetIdleTimer, { passive: true });
    });
  }

  async function verifyAccessTokenStrict(accessToken) {
    // 第 1 關：向 Google tokeninfo 驗證 Client ID 與權限範圍
    const infoRes = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!infoRes.ok) {
      throw new Error('Google 權杖驗證失敗，請重試。');
    }
    const tokenInfo = await infoRes.json();
    const audience = tokenInfo.aud || tokenInfo.azp || '';
    if (audience !== CONFIG.GOOGLE_CLIENT_ID) {
      throw new Error('憑證來源（Client ID）不符，已拒絕存取。');
    }
    if (!String(tokenInfo.scope || '').includes('drive.appdata')) {
      throw new Error('缺少 Google Drive 專屬資料夾同步權限，請勾選授權後再試。');
    }

    // 第 2 關：向 Google userinfo 取得已驗證 Email 並比對 SHA-256 白名單
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) {
      throw new Error('無法取得 Google 帳號身分資訊。');
    }
    const profile = await userRes.json();
    if (!profile.email || !profile.email_verified) {
      throw new Error('此 Google 帳號的電子郵件尚未通過驗證。');
    }
    const emailHash = await sha256Hex(String(profile.email).trim().toLowerCase());
    if (emailHash !== CONFIG.ALLOWED_EMAIL_SHA256) {
      throw new Error('存取遭拒：此 Google 帳號不在允許存取名單中。');
    }

    return {
      email: profile.email,
      name: profile.name || profile.email,
      picture: profile.picture || '',
    };
  }

  /* ------------------------------------------------------------
     Google Drive appDataFolder 同步讀寫
     ------------------------------------------------------------ */
  async function driveFetch(url, options) {
    if (!session.accessToken || Date.now() >= session.expiresAt) {
      throw new Error('Google 登入憑證已過期，請重新驗證。');
    }
    const headers = Object.assign(
      { Authorization: `Bearer ${session.accessToken}` },
      (options && options.headers) || {}
    );
    const res = await fetch(url, Object.assign({}, options, { headers }));
    if (res.status === 401) {
      lockSession('Google 憑證已過期或失效，請重新驗證登入。', true);
      throw new Error('憑證已過期');
    }
    return res;
  }

  async function findDriveFile() {
    const q = encodeURIComponent(`name='${CONFIG.DRIVE_FILENAME}' and trashed=false`);
    const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=5`;
    const res = await driveFetch(url);
    if (!res.ok) throw new Error('無法查詢 Google Drive 同步檔案');
    const json = await res.json();
    return json.files && json.files.length > 0 ? json.files[0] : null;
  }

  async function createDriveFile(payloadStr) {
    const boundary = 'ogsm_flow_boundary_' + Date.now().toString(36);
    const metadata = JSON.stringify({
      name: CONFIG.DRIVE_FILENAME,
      parents: ['appDataFolder'],
      mimeType: 'application/json',
    });
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${payloadStr}\r\n` +
      `--${boundary}--`;

    const res = await driveFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime',
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      }
    );
    if (!res.ok) throw new Error('建立 Google Drive 雲端同步檔失敗');
    const created = await res.json();
    session.driveFileId = created.id;
    return created;
  }

  async function updateDriveFile(fileId, payloadStr) {
    const res = await driveFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,modifiedTime`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: payloadStr,
      }
    );
    if (!res.ok) throw new Error('更新 Google Drive 雲端資料失敗');
    const updated = await res.json();
    if (updated && updated.modifiedTime) {
      session.lastKnownDriveModifiedTime = updated.modifiedTime;
    }
    return updated;
  }

  async function fetchRemoteMeta(fileId) {
    const res = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,modifiedTime`
    );
    if (!res.ok) return null;
    return res.json();
  }

  async function downloadRemotePayload(fileId) {
    const res = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`
    );
    if (!res.ok) throw new Error('下載雲端資料失敗');
    return res.json();
  }

  async function pullFromDrive() {
    isPulling = true;
    session.syncStatus = 'syncing';
    session.syncError = '';
    updateSyncUI();
    try {
      const file = await findDriveFile();
      if (file) {
        session.driveFileId = file.id;
        session.lastKnownDriveModifiedTime = file.modifiedTime || null;
        const payload = await downloadRemotePayload(file.id);
        const remoteSource = payload && payload.data ? payload.data : payload;
        session.hadRemoteProjects = Boolean(
          remoteSource && Array.isArray(remoteSource.projects) && remoteSource.projects.length > 0
        );

        // 若本機仍有未同步變更，採非破壞性合併（絕不刪除既有本機或雲端資料）
        const localBefore = await OGSM.db.loadAllStores();
        const localHasAny = OGSM.db.STORES.some((s) => (localBefore[s] || []).length > 0);
        if (hasPendingLocalChanges() && localHasAny) {
          const mergedData = OGSM.db.mergeDatasets(localBefore, remoteSource, pendingDeletedIds);
          await OGSM.db.importAll({ data: mergedData }, { merge: false });
          const mergedExport = await OGSM.db.exportAll();
          await updateDriveFile(file.id, JSON.stringify(mergedExport));
          clearLocalDirty();
        } else {
          await OGSM.db.importAll(payload, { merge: false });
          clearLocalDirty();
        }
        session.lastSyncedAt = Date.now();
        session.syncStatus = 'synced';
      } else {
        // 第一次使用：初始化本機（若空則載入範例）並建立雲端檔
        await OGSM.db.ensureSeeded();
        const exported = await OGSM.db.exportAll();
        const created = await createDriveFile(JSON.stringify(exported));
        session.lastKnownDriveModifiedTime = (created && created.modifiedTime) || null;
        session.hadRemoteProjects = exported.data.projects.length > 0;
        clearLocalDirty();
        session.lastSyncedAt = Date.now();
        session.syncStatus = 'synced';
      }
    } catch (err) {
      session.syncStatus = 'error';
      session.syncError = err.message || '雲端同步錯誤';
      throw err;
    } finally {
      isPulling = false;
      updateSyncUI();
    }
  }

  async function pushToDriveNow(options) {
    if (!session.authenticated || isPulling) return false;
    const opts = options || {};
    clearTimeout(syncTimer);
    session.syncStatus = 'syncing';
    session.syncError = '';
    updateSyncUI();
    try {
      let exported = await OGSM.db.exportAll();

      // 安全防呆 1：禁止在未明確確認刪除專案的情況下，用空白專案意外覆蓋既有雲端資料
      if (exported.data.projects.length === 0 && !opts.allowEmptyPush && session.hadRemoteProjects) {
        session.syncStatus = 'error';
        session.syncError = '已攔截空白覆蓋寫入以保護雲端既有資料';
        updateSyncUI();
        return false;
      }

      if (session.driveFileId) {
        // 安全防呆 2：寫入前先檢查雲端是否有其他裝置的新更新；若有，先非破壞性合併再上傳
        const remoteMeta = await fetchRemoteMeta(session.driveFileId);
        if (
          remoteMeta &&
          remoteMeta.modifiedTime &&
          session.lastKnownDriveModifiedTime &&
          remoteMeta.modifiedTime !== session.lastKnownDriveModifiedTime
        ) {
          const remotePayload = await downloadRemotePayload(session.driveFileId);
          const remoteSource = remotePayload && remotePayload.data ? remotePayload.data : remotePayload;
          const mergedData = OGSM.db.mergeDatasets(exported.data, remoteSource, pendingDeletedIds);
          await OGSM.db.importAll({ data: mergedData }, { merge: false });
          exported = await OGSM.db.exportAll();
          await OGSM.store.hydrate();
        }
        await updateDriveFile(session.driveFileId, JSON.stringify(exported));
      } else {
        const existing = await findDriveFile();
        if (existing) {
          session.driveFileId = existing.id;
          const remotePayload = await downloadRemotePayload(existing.id);
          const remoteSource = remotePayload && remotePayload.data ? remotePayload.data : remotePayload;
          const mergedData = OGSM.db.mergeDatasets(exported.data, remoteSource, pendingDeletedIds);
          await OGSM.db.importAll({ data: mergedData }, { merge: false });
          exported = await OGSM.db.exportAll();
          await updateDriveFile(existing.id, JSON.stringify(exported));
        } else {
          const created = await createDriveFile(JSON.stringify(exported));
          session.lastKnownDriveModifiedTime = (created && created.modifiedTime) || null;
        }
      }

      session.hadRemoteProjects = exported.data.projects.length > 0;
      clearLocalDirty();
      session.lastSyncedAt = Date.now();
      session.syncStatus = 'synced';
      updateSyncUI();
      return true;
    } catch (err) {
      session.syncStatus = 'error';
      session.syncError = err.message || '同步失敗';
      updateSyncUI();
      return false;
    }
  }

  async function deleteDriveSyncFile() {
    if (!session.authenticated) return false;
    clearTimeout(syncTimer);
    let targetId = session.driveFileId;
    if (!targetId) {
      const existing = await findDriveFile();
      if (existing) targetId = existing.id;
    }
    if (!targetId) return false;
    const res = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(targetId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok && res.status !== 404) {
      throw new Error('刪除 Google Drive 雲端同步檔失敗');
    }
    session.driveFileId = null;
    session.syncStatus = 'idle';
    session.lastSyncedAt = null;
    updateSyncUI();
    return true;
  }

  function scheduleSync() {
    if (!session.authenticated || isPulling) return;
    clearTimeout(syncTimer);
    session.syncStatus = 'syncing';
    updateSyncUI();
    syncTimer = setTimeout(() => {
      pushToDriveNow();
    }, 1000);
  }

  async function clearAllLocalCache() {
    try {
      for (const s of OGSM.db.STORES) {
        await OGSM.db.clearStore(s);
      }
      localStorage.removeItem('ogsm_current_project');
    } catch (_) {
      // ignore cache cleanup error
    }
  }

  async function lockSession(message, isError, flushAndClearCache) {
    clearTimeout(idleTimer);
    clearTimeout(expiryTimer);
    clearTimeout(syncTimer);

    let syncedSafely = !hasPendingLocalChanges();
    if (flushAndClearCache && session.authenticated && session.accessToken && Date.now() < session.expiresAt) {
      try {
        syncedSafely = await pushToDriveNow();
      } catch (_) {
        syncedSafely = false;
      }
    }

    const tokenToRevoke = session.accessToken;
    session.authenticated = false;
    session.accessToken = null;
    session.expiresAt = 0;
    session.user = null;
    session.driveFileId = null;
    session.lastKnownDriveModifiedTime = null;
    session.syncStatus = 'idle';

    // 撤銷 Google 權杖
    if (tokenToRevoke && global.google && google.accounts && google.accounts.oauth2) {
      try {
        google.accounts.oauth2.revoke(tokenToRevoke, () => {});
      } catch (_) {}
    }

    // 僅在「使用者主動登出」且「雲端已確認同步成功」時才清除本機快取；
    // 若為閒置自動上鎖或網路未同步成功，完整保留本機資料，下次登入自動合併！
    let finalMsg = message || '';
    if (flushAndClearCache) {
      if (syncedSafely) {
        await clearAllLocalCache();
      } else {
        finalMsg = '已登出鎖定，但因部分異動尚未同步完成，系統已保留本機資料避免遺失，下次登入會自動合併。';
      }
    }

    // 清空記憶體中已渲染畫面
    OGSM.db.STORES.forEach((s) => {
      OGSM.store.state.data[s] = [];
    });
    OGSM.store.state.currentProjectId = null;
    OGSM.drawer.close();
    OGSM.modals.closeModal();

    showLockScreen(finalMsg, isError);
  }

  async function handleTokenResponse(resp) {
    if (!resp || resp.error) {
      setSignInLoading(false);
      const errText =
        resp && resp.error === 'access_denied'
          ? '已取消登入，或此帳號未獲 Google 核准授權。'
          : `Google 驗證失敗：${(resp && resp.error) || '未知錯誤'}`;
      setLockMessage(errText, true);
      return;
    }

    const token = resp.access_token;
    const expiresInSec = Number(resp.expires_in) || 3600;

    try {
      setSignInLoading(true);
      setLockMessage('正在核驗 Google 帳號身分與白名單...', false);

      const user = await verifyAccessTokenStrict(token);

      session.authenticated = true;
      session.accessToken = token;
      session.expiresAt = Date.now() + Math.max(60, expiresInSec - 30) * 1000;
      session.user = user;

      // 權杖到期自動上鎖
      clearTimeout(expiryTimer);
      expiryTimer = setTimeout(() => {
        lockSession('Google 登入憑證已屆滿 60 分鐘，請重新驗證以繼續使用。', false);
      }, Math.max(60, expiresInSec - 30) * 1000);

      setLockMessage('身分驗證通過，正在從 Google Drive 同步您的 OGSM 資料...', false);
      await pullFromDrive();
      await OGSM.store.hydrate();

      resetIdleTimer();
      showAppShell();
      OGSM.store.toast(`歡迎回來，${user.name}（已連接 Google Drive）`);
    } catch (err) {
      // 驗證失敗：立即撤銷權杖，絕不放行
      if (token && global.google && google.accounts && google.accounts.oauth2) {
        try {
          google.accounts.oauth2.revoke(token, () => {});
        } catch (_) {}
      }
      session.authenticated = false;
      session.accessToken = null;
      setSignInLoading(false);
      setLockMessage(err.message || '驗證失敗，已拒絕存取。', true);
    }
  }

  function startSignIn() {
    if (!CONFIG.GOOGLE_CLIENT_ID || CONFIG.GOOGLE_CLIENT_ID === '__GOOGLE_CLIENT_ID__') {
      setLockMessage('尚未設定 Google OAuth Client ID。', true);
      return;
    }
    if (!global.google || !google.accounts || !google.accounts.oauth2) {
      setLockMessage('Google 登入元件尚未載入完成，請確認網路連線後再試。', true);
      return;
    }
    setSignInLoading(true);
    setLockMessage('請在彈出視窗中選擇並驗證您的 Google 帳號...', false);
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: handleTokenResponse,
        error_callback: () => {
          setSignInLoading(false);
          setLockMessage('登入視窗已關閉或被封鎖，請允許彈出視窗後重試。', true);
        },
      });
    }
    // 嚴格要求每次登入明確選擇/確認帳號
    tokenClient.requestAccessToken({ prompt: 'select_account' });
  }

  function init() {
    bindActivityWatchers();
    const btnSignIn = document.getElementById('btnGoogleSignIn');
    if (btnSignIn) {
      btnSignIn.addEventListener('click', startSignIn);
    }
    showLockScreen('', false);
  }

  OGSM.auth = {
    CONFIG,
    session,
    init,
    startSignIn,
    pullFromDrive,
    pushToDriveNow,
    deleteDriveSyncFile,
    scheduleSync,
    markLocalDirty,
    markDeletedId,
    lockSession,
    updateSyncUI,
  };
})(window);
