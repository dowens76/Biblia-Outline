// drive.js - Google Drive backup for Bible Outliner
//
// Depends on:
//   BACKUP_FILENAME_PREFIX  (constant from backup.js — loaded before this file)
//
// Backups are written to a Google Drive folder named 'BibleOutlinerBackups'.
// Up to 5 dated backups are retained; older ones are automatically deleted
// from Drive when a new backup is created.
//
// Auth uses chrome.identity.getAuthToken() with the oauth2 block in manifest.json.
// The user must first set up a Google Cloud project and paste their Client ID
// into manifest.json before this feature will work.
//
// Loaded in order: db.js → backup.js → drive.js → sidepanel.js

// ── Constants ────────────────────────────────────────────────────────────────

const DRIVE_FOLDER_NAME = 'BibleOutlinerBackups';
const DRIVE_BACKUP_MAX_COUNT = 5;

// ── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Get a Google OAuth token via chrome.identity.
 * @param {boolean} interactive  true = show OAuth popup; false = silent (cached only)
 * @returns {Promise<string>} OAuth access token
 */
function driveGetToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, token => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || 'No token'));
      } else {
        resolve(token);
      }
    });
  });
}

/**
 * Revoke the cached OAuth token and clear all Drive storage.
 * @returns {Promise<void>}
 */
async function driveDisconnect() {
  try {
    const token = await driveGetToken(false);
    // Revoke with Google's endpoint
    await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
    // Remove from Chrome's cache
    await new Promise(resolve => chrome.identity.removeCachedAuthToken({ token }, resolve));
  } catch (_) {
    // Ignore errors — token may already be gone
  }
  await new Promise(resolve => {
    chrome.storage.local.remove(
      ['drive_connected', 'drive_user_email', 'drive_folder_id', 'drive_entries'],
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
 */
async function refreshDriveUI() {
  const { connected, email } = await loadDriveConnectionState();
  const emailEl = document.getElementById('driveUserEmail');
  const connectBtn = document.getElementById('driveConnectBtn');
  const disconnectBtn = document.getElementById('driveDisconnectBtn');

  if (connected) {
    if (emailEl) {
      emailEl.textContent = email || '';
      emailEl.style.display = email ? 'inline' : 'none';
    }
    if (connectBtn) connectBtn.style.display = 'none';
    if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';
  } else {
    if (emailEl) emailEl.style.display = 'none';
    if (connectBtn) connectBtn.style.display = 'inline-flex';
    if (disconnectBtn) disconnectBtn.style.display = 'none';
  }
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
        showDriveStatus(`Connected as ${email}`, 'success');
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
