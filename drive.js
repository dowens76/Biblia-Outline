// drive.js - Google Drive backup for Bible Outliner
//
// Depends on:
//   BACKUP_FILENAME_PREFIX  (constant from backup.js — loaded before this file)
//
// Backups are written to a Google Drive folder named 'BibleOutlinerBackups'.
// Up to 5 dated backups are retained; older ones are automatically deleted
// from Drive when a new backup is created.
//
// Auth uses chrome.identity.launchWebAuthFlow() — works in both Brave and Chrome.
// Create a "Web application" OAuth 2.0 client in Google Cloud Console and add
// https://<extension-id>.chromiumapp.org/ as an Authorized redirect URI.
// Paste the resulting Client ID into DRIVE_CLIENT_ID below.
//
// Loaded in order: db.js → backup.js → drive.js → sidepanel.js

// ── Constants ────────────────────────────────────────────────────────────────

const DRIVE_FOLDER_NAME = 'BibleOutlinerBackups';
const DRIVE_BACKUP_MAX_COUNT = 5;

// Paste your Web application OAuth 2.0 Client ID here:
const DRIVE_CLIENT_ID = '464287372031-dchuhmamm5dntccr52v29hbvhll4fjsq.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file email';

// ── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Load a cached token (with its expiry) from storage.
 * @returns {Promise<{token: string, expiresAt: number}|null>}
 */
function loadDriveToken() {
  return new Promise(resolve => {
    chrome.storage.local.get('drive_token', result => {
      resolve(result.drive_token || null);
    });
  });
}

/**
 * Persist a token and its expiry time.
 * @param {string} token
 * @param {number} expiresAt  Unix ms timestamp
 */
function saveDriveToken(token, expiresAt) {
  return new Promise(resolve => {
    chrome.storage.local.set({ drive_token: { token, expiresAt } }, resolve);
  });
}

/**
 * Run the OAuth implicit flow via launchWebAuthFlow.
 * Works in Brave and Chrome without requiring Chrome's Google account integration.
 * @param {boolean} interactive  true = show consent UI if needed; false = silent
 * @returns {Promise<string>} access token
 */
function _launchOAuthFlow(interactive) {
  const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', DRIVE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', DRIVE_SCOPE);
  if (!interactive) authUrl.searchParams.set('prompt', 'none');

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive },
      async redirectUrl => {
        if (chrome.runtime.lastError || !redirectUrl) {
          reject(new Error(chrome.runtime.lastError?.message || 'Auth cancelled'));
          return;
        }
        // Token is in the URL fragment: ...#access_token=TOKEN&expires_in=3600&...
        const fragment = redirectUrl.includes('#')
          ? redirectUrl.substring(redirectUrl.indexOf('#') + 1)
          : '';
        const params = new URLSearchParams(fragment);
        const token = params.get('access_token');
        const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
        if (!token) {
          reject(new Error('No access token in response'));
          return;
        }
        await saveDriveToken(token, Date.now() + expiresIn * 1000);
        resolve(token);
      }
    );
  });
}

/**
 * Get a valid OAuth token. Returns cached token if still valid, otherwise
 * attempts a silent refresh, then an interactive flow if requested.
 * @param {boolean} interactive  true = show OAuth popup if needed
 * @returns {Promise<string>} access token
 */
async function driveGetToken(interactive) {
  // Return cached token if it has more than 2 minutes remaining
  const stored = await loadDriveToken();
  if (stored && Date.now() < stored.expiresAt - 120000) {
    return stored.token;
  }

  if (interactive) {
    return _launchOAuthFlow(true);
  }

  // Non-interactive: try silent refresh (prompt=none)
  try {
    return await _launchOAuthFlow(false);
  } catch {
    throw new Error('No token available');
  }
}

/**
 * Revoke the token and clear all Drive storage.
 * @returns {Promise<void>}
 */
async function driveDisconnect() {
  try {
    const stored = await loadDriveToken();
    if (stored) {
      // Best-effort revocation — ignore failures
      await fetch(`https://oauth2.googleapis.com/revoke?token=${stored.token}`, {
        method: 'POST'
      });
    }
  } catch (_) {
    // Ignore revocation errors
  }
  await new Promise(resolve => {
    chrome.storage.local.remove(
      ['drive_connected', 'drive_user_email', 'drive_folder_id', 'drive_entries', 'drive_token'],
      resolve
    );
  });
}

// ── Storage helpers ───────────────────────────────────────────────────────────

/**
 * @returns {Promise<{connected: boolean, email: string|null}>}
 */
function loadDriveConnectionState() {
  return new Promise(resolve => {
    chrome.storage.local.get(['drive_connected', 'drive_user_email'], result => {
      resolve({
        connected: result.drive_connected === true,
        email: result.drive_user_email || null
      });
    });
  });
}

/**
 * @param {boolean} connected
 * @param {string|null} email
 */
function saveDriveConnectionState(connected, email) {
  return new Promise(resolve => {
    chrome.storage.local.set({ drive_connected: connected, drive_user_email: email || null }, resolve);
  });
}

/**
 * @returns {Promise<string|null>}
 */
function loadDriveFolderId() {
  return new Promise(resolve => {
    chrome.storage.local.get('drive_folder_id', result => {
      resolve(result.drive_folder_id || null);
    });
  });
}

/**
 * @param {string} id
 */
function saveDriveFolderId(id) {
  return new Promise(resolve => {
    chrome.storage.local.set({ drive_folder_id: id }, resolve);
  });
}

/**
 * Load tracked Drive backup entries. Newest entry first.
 * @returns {Promise<Array<{filename: string, fileId: string}>>}
 */
function loadDriveEntries() {
  return new Promise(resolve => {
    chrome.storage.local.get('drive_entries', result => {
      resolve(result.drive_entries || []);
    });
  });
}

/**
 * @param {Array<{filename: string, fileId: string}>} entries
 */
function saveDriveEntries(entries) {
  return new Promise(resolve => {
    chrome.storage.local.set({ drive_entries: entries }, resolve);
  });
}

// ── Drive API helpers ─────────────────────────────────────────────────────────

/**
 * Fetch the signed-in user's email address.
 * @param {string} token
 * @returns {Promise<string>}
 */
async function driveFetchEmail(token) {
  const res = await fetch(
    'https://www.googleapis.com/oauth2/v1/userinfo?fields=email',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`userinfo ${res.status}`);
  const data = await res.json();
  return data.email;
}

/**
 * Find the BibleOutlinerBackups folder in Drive; returns its file ID or null.
 * @param {string} token
 * @returns {Promise<string|null>}
 */
async function driveFindFolder(token) {
  const q = encodeURIComponent(
    `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Drive list ${res.status}`);
  const data = await res.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

/**
 * Create the BibleOutlinerBackups folder in Drive; returns its file ID.
 * @param {string} token
 * @returns {Promise<string>}
 */
async function driveCreateFolder(token) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
  if (!res.ok) throw new Error(`Drive create folder ${res.status}`);
  const data = await res.json();
  return data.id;
}

/**
 * Return the cached folder ID, or find/create it and cache it.
 * @param {string} token
 * @returns {Promise<string>} folder file ID
 */
async function driveEnsureFolder(token) {
  let folderId = await loadDriveFolderId();
  if (folderId) return folderId;

  folderId = await driveFindFolder(token);
  if (!folderId) {
    folderId = await driveCreateFolder(token);
  }
  await saveDriveFolderId(folderId);
  return folderId;
}

/**
 * Upload a new JSON file to Drive inside the given folder.
 * @param {string} token
 * @param {string} folderId
 * @param {string} filename
 * @param {string} jsonContent
 * @returns {Promise<string>} the new file ID
 */
async function driveUploadFile(token, folderId, filename, jsonContent) {
  const metadata = { name: filename, parents: [folderId] };
  const body = _buildMultipartBody(metadata, jsonContent);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${DRIVE_BOUNDARY}"`
      },
      body
    }
  );
  if (!res.ok) throw new Error(`Drive upload ${res.status}`);
  const data = await res.json();
  return data.id;
}

/**
 * Overwrite an existing Drive file's content (without changing its metadata/location).
 * @param {string} token
 * @param {string} fileId
 * @param {string} jsonContent
 * @returns {Promise<string>} the file ID (unchanged)
 */
async function driveUpdateFile(token, fileId, jsonContent) {
  const body = _buildMultipartBody(null, jsonContent);

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${DRIVE_BOUNDARY}"`
      },
      body
    }
  );
  if (!res.ok) throw new Error(`Drive update ${res.status}`);
  const data = await res.json();
  return data.id;
}

/**
 * Delete a file from Drive (best-effort; errors are logged but not re-thrown).
 * @param {string} token
 * @param {string} fileId
 */
async function driveDeleteFile(token, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok && res.status !== 404) {
    console.warn('Drive delete failed:', fileId, res.status);
  }
}

// ── Multipart body builder ────────────────────────────────────────────────────

const DRIVE_BOUNDARY = 'bible_outliner_backup_boundary';

/**
 * Build a multipart/related request body for Drive uploads.
 * Pass null for metadata on updates (media-only).
 * @param {object|null} metadata
 * @param {string} jsonContent
 * @returns {string}
 */
function _buildMultipartBody(metadata, jsonContent) {
  const parts = [];
  if (metadata !== null) {
    parts.push(
      `--${DRIVE_BOUNDARY}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) + `\r\n`
    );
  } else {
    parts.push(`--${DRIVE_BOUNDARY}\r\n` + `Content-Type: application/json; charset=UTF-8\r\n\r\n{}\r\n`);
  }
  parts.push(
    `--${DRIVE_BOUNDARY}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    jsonContent + `\r\n`
  );
  parts.push(`--${DRIVE_BOUNDARY}--`);
  return parts.join('');
}

// ── Core Drive backup ─────────────────────────────────────────────────────────

/**
 * Write a backup to Google Drive.
 * Uses a non-interactive token by default (silent, for auto-backup).
 * @param {string} jsonContent
 * @param {string} filename  e.g. 'bible-outliner-backup-2026-02-25.json'
 * @param {boolean} [interactive=false]
 * @returns {Promise<{ok: boolean, message: string}>}
 */
async function executeDriveBackup(jsonContent, filename, interactive = false) {
  try {
    const token = await driveGetToken(interactive);
    const folderId = await driveEnsureFolder(token);
    const entries = await loadDriveEntries();

    if (entries.length > 0 && entries[0].filename === filename) {
      // Same-day re-run: overwrite the existing file
      await driveUpdateFile(token, entries[0].fileId, jsonContent);
      // entries[0].fileId stays the same; no pruning needed
      await saveDriveEntries(entries);
    } else {
      // New date: upload a fresh file
      const fileId = await driveUploadFile(token, folderId, filename, jsonContent);
      entries.unshift({ filename, fileId });

      // Prune old backups
      const toRemove = entries.splice(DRIVE_BACKUP_MAX_COUNT);
      for (const entry of toRemove) {
        try {
          await driveDeleteFile(token, entry.fileId);
        } catch (err) {
          console.warn('Could not delete old Drive backup:', entry.filename, err);
        }
      }
      await saveDriveEntries(entries);
    }

    return { ok: true, message: 'Drive ✓' };
  } catch (err) {
    // Token errors (not signed in / consent not granted) are expected when Drive not configured
    const isAuthError = err.message.includes('OAuth2') ||
                        err.message.includes('No token') ||
                        err.message.includes('not granted') ||
                        err.message.includes('interaction');
    if (isAuthError) {
      return { ok: false, message: 'Drive: not signed in' };
    }
    console.error('Drive backup error:', err);
    return { ok: false, message: `Drive: ${err.message}` };
  }
}

// ── UI ────────────────────────────────────────────────────────────────────────

/**
 * Show a status message in the Drive status element.
 * @param {string} message
 * @param {'info'|'success'|'error'} type
 */
function showDriveStatus(message, type = 'info') {
  const el = document.getElementById('driveStatus');
  if (!el) return;
  el.textContent = message;
  el.className = 'drive-status ' + type;
}

/**
 * Refresh the Drive UI to reflect current connection state.
 *
 * Three states:
 *  - Fully connected (drive_connected = true):  email + Disconnect
 *  - Partially connected (token stored but not connected): Connect + Disconnect
 *  - Not connected at all: Connect only
 */
async function refreshDriveUI() {
  const { connected, email } = await loadDriveConnectionState();
  const storedToken = await loadDriveToken();
  const hasAnyState = connected || !!storedToken;

  const emailEl = document.getElementById('driveUserEmail');
  const connectBtn = document.getElementById('driveConnectBtn');
  const disconnectBtn = document.getElementById('driveDisconnectBtn');

  // Email: only shown when fully connected
  if (emailEl) {
    emailEl.textContent = connected ? (email || '') : '';
    emailEl.style.display = connected && email ? 'inline' : 'none';
  }

  // Connect button: shown when not fully connected
  if (connectBtn) connectBtn.style.display = connected ? 'none' : 'inline-flex';

  // Disconnect button: shown whenever any Drive state exists
  if (disconnectBtn) disconnectBtn.style.display = hasAnyState ? 'inline-flex' : 'none';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize Drive UI and wire up event listeners.
 * Called once after initBackup().
 */
async function initDrive() {
  try {
    await refreshDriveUI();
  } catch (err) {
    console.warn('Could not initialize Drive UI:', err);
  }

  const connectBtn = document.getElementById('driveConnectBtn');
  const disconnectBtn = document.getElementById('driveDisconnectBtn');

  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      connectBtn.disabled = true;
      showDriveStatus('Connecting…', 'info');
      try {
        const token = await driveGetToken(true);
        const email = await driveFetchEmail(token);
        await saveDriveConnectionState(true, email);
        await refreshDriveUI();
        showDriveStatus(`Connected as ${email} — backing up…`, 'info');

        // Immediately back up current data to Drive so the user doesn't have
        // to wait until the next change or manually trigger a backup.
        // Uses the cached token (non-interactive) since we just obtained it.
        const jsonContent = await buildBackupContent();
        const today = getTodayString();
        const filename = `${BACKUP_FILENAME_PREFIX}${today}.json`;
        const result = await executeDriveBackup(jsonContent, filename, false);
        showDriveStatus(
          result.ok
            ? `Connected as ${email} · Drive ✓`
            : `Connected as ${email} · ${result.message}`,
          result.ok ? 'success' : 'error'
        );
      } catch (err) {
        showDriveStatus('Connection failed: ' + err.message, 'error');
      } finally {
        connectBtn.disabled = false;
      }
    });
  }

  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', async () => {
      disconnectBtn.disabled = true;
      showDriveStatus('Disconnecting…', 'info');
      try {
        await driveDisconnect();
        await refreshDriveUI();
        showDriveStatus('Disconnected', 'info');
      } catch (err) {
        showDriveStatus('Error: ' + err.message, 'error');
      } finally {
        disconnectBtn.disabled = false;
      }
    });
  }
}
