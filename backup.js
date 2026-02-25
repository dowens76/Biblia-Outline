// backup.js - Local folder backup for Bible Outliner
//
// Depends on:
//   db  (global BibleOutlineDB instance, from db.js — loaded before this file)
//   generateJSONExport()  (global function from sidepanel.js — loaded after this file)
//
// Backups are written to ~/Downloads/{subfolder}/bible-outliner-backup-YYYY-MM-DD.json
// using the chrome.downloads API. Up to 5 dated backups are retained; older ones
// are automatically deleted from disk when a new backup is created.
//
// Loaded in order: db.js → backup.js → sidepanel.js

// ── Constants ────────────────────────────────────────────────────────────────

const BACKUP_MAX_COUNT = 5;
const BACKUP_FILENAME_PREFIX = 'bible-outliner-backup-';
const BACKUP_DEFAULT_SUBFOLDER = 'BibleOutlinerBackups';

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Returns today's date as 'YYYY-MM-DD' in local time.
 * @returns {string}
 */
function getTodayString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * djb2 hash of a string → unsigned 32-bit hex. Used for change detection.
 * @param {string} str
 * @returns {string}
 */
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // keep 32-bit
  }
  return (hash >>> 0).toString(16);
}

// ── Content builder ───────────────────────────────────────────────────────────

/**
 * Build the full JSON content for a backup.
 * Uses the same pipeline as the regular JSON export.
 * @returns {Promise<string>} JSON string
 */
async function buildBackupContent() {
  const rawHeadings = await db.getAllHeadings();

  let fallbackEndRef = null;
  if (rawHeadings.length > 0) {
    const lastBook = rawHeadings[rawHeadings.length - 1].book;
    fallbackEndRef = db.getLastVerseRef(lastBook);
  }

  const headingsWithRanges = db.calculateVerseRanges(rawHeadings, fallbackEndRef);
  return generateJSONExport(headingsWithRanges);
}

// ── Storage helpers ───────────────────────────────────────────────────────────

/**
 * Read backup metadata from chrome.storage.local.
 * @returns {Promise<{lastDate: string|null, lastHash: string|null}>}
 */
function loadBackupMeta() {
  return new Promise(resolve => {
    chrome.storage.local.get(['backup_last_date', 'backup_last_hash'], result => {
      resolve({
        lastDate: result.backup_last_date || null,
        lastHash: result.backup_last_hash || null
      });
    });
  });
}

/**
 * Save backup metadata (date + hash) to chrome.storage.local.
 * @param {string} date  'YYYY-MM-DD'
 * @param {string} hash
 */
function saveBackupMeta(date, hash) {
  return new Promise(resolve => {
    chrome.storage.local.set({ backup_last_date: date, backup_last_hash: hash }, resolve);
  });
}

/**
 * Save only the backup date (used when content is unchanged).
 * @param {string} date  'YYYY-MM-DD'
 */
function saveBackupDate(date) {
  return new Promise(resolve => {
    chrome.storage.local.set({ backup_last_date: date }, resolve);
  });
}

/**
 * Load the backup subfolder name from chrome.storage.local.
 * @returns {Promise<string>}
 */
function loadBackupSubfolder() {
  return new Promise(resolve => {
    chrome.storage.local.get('backup_subfolder', result => {
      resolve(result.backup_subfolder || BACKUP_DEFAULT_SUBFOLDER);
    });
  });
}

/**
 * Save the backup subfolder name to chrome.storage.local.
 * @param {string} name
 */
function saveBackupSubfolder(name) {
  return new Promise(resolve => {
    chrome.storage.local.set({ backup_subfolder: name }, resolve);
  });
}

/**
 * Load the tracked backup entries [{filename, downloadId}] from chrome.storage.local.
 * Newest entry is first.
 * @returns {Promise<Array<{filename: string, downloadId: number}>>}
 */
function loadBackupEntries() {
  return new Promise(resolve => {
    chrome.storage.local.get('backup_entries', result => {
      resolve(result.backup_entries || []);
    });
  });
}

/**
 * Save the tracked backup entries to chrome.storage.local.
 * @param {Array<{filename: string, downloadId: number}>} entries
 */
function saveBackupEntries(entries) {
  return new Promise(resolve => {
    chrome.storage.local.set({ backup_entries: entries }, resolve);
  });
}

// ── Download helpers ──────────────────────────────────────────────────────────

/**
 * Download JSON content as a backup file via chrome.downloads.
 * Saves to ~/Downloads/{subfolder}/{filename}.
 * @param {string} subfolder  Relative subfolder within Downloads
 * @param {string} filename   e.g. 'bible-outliner-backup-2026-02-25.json'
 * @param {string} json       File content
 * @returns {Promise<number>} The chrome download ID
 */
function downloadBackupFile(subfolder, filename, json) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const downloadPath = subfolder ? `${subfolder}/${filename}` : filename;

  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url,
      filename: downloadPath,
      saveAs: false,
      conflictAction: 'overwrite'
    }, downloadId => {
      URL.revokeObjectURL(url);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(downloadId);
      }
    });
  });
}

/**
 * Remove a download entry from Chrome's download history only
 * (used for same-day overwrites where the file on disk is kept/replaced).
 * @param {number} downloadId
 */
function eraseDownloadEntry(downloadId) {
  return new Promise(resolve => {
    chrome.downloads.erase({ id: downloadId }, () => resolve());
  });
}

/**
 * Delete a backup file from disk AND remove it from download history.
 * Used when pruning old backups.
 * @param {number} downloadId
 */
function removeDownloadedFile(downloadId) {
  return new Promise(resolve => {
    chrome.downloads.removeFile(downloadId, () => {
      // Erase from history regardless of whether removeFile succeeded
      // (file may have been manually deleted already)
      chrome.downloads.erase({ id: downloadId }, () => resolve());
    });
  });
}

// ── Core backup logic ─────────────────────────────────────────────────────────

/**
 * Write the local (Downloads) backup for a given date.
 * Handles same-day overwrite and pruning of old files.
 * @param {string} jsonContent
 * @param {string} today  'YYYY-MM-DD'
 * @returns {Promise<{ok: boolean, message: string}>}
 */
async function executeLocalBackup(jsonContent, today) {
  const subfolder = await loadBackupSubfolder();
  const filename = `${BACKUP_FILENAME_PREFIX}${today}.json`;
  let entries = await loadBackupEntries();

  // Same-day re-run: remove the existing entry for today so we don't
  // accumulate duplicates. The old file will be overwritten on disk by
  // conflictAction:'overwrite', so only erase the download history entry.
  const existingIdx = entries.findIndex(e => e.filename === filename);
  if (existingIdx !== -1) {
    const [old] = entries.splice(existingIdx, 1);
    await eraseDownloadEntry(old.downloadId);
  }

  const downloadId = await downloadBackupFile(subfolder, filename, jsonContent);

  // Prepend new entry (newest first)
  entries.unshift({ filename, downloadId });

  // Prune: delete files and history entries beyond the max count
  const toRemove = entries.splice(BACKUP_MAX_COUNT);
  for (const entry of toRemove) {
    try {
      await removeDownloadedFile(entry.downloadId);
    } catch (err) {
      console.warn('Could not remove old backup:', entry.filename, err);
    }
  }

  await saveBackupEntries(entries);
  return { ok: true, message: `Local ✓` };
}

/**
 * Compose a human-readable status string from the settled results of
 * the local and Drive backup promises.
 * @param {PromiseSettledResult} localSettled
 * @param {PromiseSettledResult} driveSettled
 * @returns {string}
 */
function composeBackupStatusMessage(localSettled, driveSettled) {
  const local = localSettled.status === 'fulfilled'
    ? localSettled.value
    : { ok: false, message: `Local: ${localSettled.reason}` };
  const drive = driveSettled.status === 'fulfilled'
    ? driveSettled.value
    : { ok: false, message: `Drive: ${driveSettled.reason}` };

  const parts = [];
  parts.push(local.ok ? 'Local ✓' : 'Local ✗');
  // Drive failure is expected when not configured — show its message, not just ✗
  parts.push(drive.ok ? 'Drive ✓' : drive.message);
  return parts.join(' · ');
}

/**
 * Core backup orchestrator: generate JSON, check for changes, then write to
 * both local Downloads and Google Drive simultaneously.
 * @returns {Promise<{ok: boolean, message: string}>}
 */
async function executeBackup() {
  try {
    const jsonContent = await buildBackupContent();
    const currentHash = hashString(jsonContent);
    const { lastHash } = await loadBackupMeta();
    const today = getTodayString();

    if (currentHash === lastHash) {
      await saveBackupDate(today);
      return { ok: true, message: `No changes since last backup (${today})` };
    }

    const filename = `${BACKUP_FILENAME_PREFIX}${today}.json`;

    const [localSettled, driveSettled] = await Promise.allSettled([
      executeLocalBackup(jsonContent, today),
      executeDriveBackup(jsonContent, filename)
    ]);

    await saveBackupMeta(today, currentHash);
    return { ok: true, message: composeBackupStatusMessage(localSettled, driveSettled) };

  } catch (err) {
    console.error('Backup error:', err);
    return { ok: false, message: `Backup failed: ${err.message}` };
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────────

/**
 * Show a status message in the backup status element.
 * @param {string} message
 * @param {'info'|'success'|'error'} type
 */
function showBackupStatus(message, type = 'info') {
  const el = document.getElementById('backupStatus');
  if (!el) return;
  el.textContent = message;
  el.className = 'backup-status ' + type;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Manual backup: triggered by "Backup Now" button click.
 */
async function backupNow() {
  showBackupStatus('Backing up…', 'info');
  const result = await executeBackup();
  showBackupStatus(result.message, result.ok ? 'success' : 'error');
}

/**
 * Auto-backup: runs on every panel open. Skips if already backed up today.
 */
async function maybeAutoBackup() {
  try {
    const { lastDate } = await loadBackupMeta();
    if (lastDate === getTodayString()) return; // Already backed up today

    const result = await executeBackup();
    // Only show status for auto-backup if something notable happened
    if (!result.ok) {
      showBackupStatus(result.message, 'error');
    }
  } catch (err) {
    console.warn('Auto-backup error:', err);
  }
}

/**
 * Initialize backup UI and wire up event listeners.
 * Called once after db.init().
 */
async function initBackup() {
  // Populate subfolder input with stored value
  try {
    const subfolder = await loadBackupSubfolder();
    const input = document.getElementById('backupSubfolderInput');
    if (input) input.value = subfolder;
  } catch (err) {
    console.warn('Could not load backup subfolder:', err);
  }

  // Settings toggle
  document.getElementById('settingsToggleBtn').addEventListener('click', () => {
    const panel = document.getElementById('settingsPanel');
    const btn = document.getElementById('settingsToggleBtn');
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    btn.setAttribute('aria-expanded', String(!isOpen));
  });

  // Save subfolder name whenever the input loses focus
  document.getElementById('backupSubfolderInput').addEventListener('blur', async (e) => {
    const name = e.target.value.trim() || BACKUP_DEFAULT_SUBFOLDER;
    e.target.value = name; // normalize empty input back to default
    await saveBackupSubfolder(name);
  });

  // Backup Now button
  document.getElementById('backupNowBtn').addEventListener('click', backupNow);
}
