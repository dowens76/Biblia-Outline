// sidepanel.js - Main logic for the side panel

// Books that should be outlined together
const BOOK_GROUPS = {
  '1Sam': ['1Sam', '2Sam'],
  '2Sam': ['1Sam', '2Sam'],
  '1Kgs': ['1Kgs', '2Kgs'],
  '2Kgs': ['1Kgs', '2Kgs'],
  '1Chr': ['1Chr', '2Chr'],
  '2Chr': ['1Chr', '2Chr'],
  'Ezra': ['Ezra', 'Neh'],
  'Neh':  ['Ezra', 'Neh'],
};

// Heading level color palettes (Open Color — https://yeun.github.io/open-color/)
// Each palette uses shades 9→4 for levels 1→6 (darkest = most prominent for L1)
const HEADING_PALETTES = {
  default: { name: 'Default', colors: ['#7B3410','#A0522D','#C07840','#9E7B50','#B4B0C8','#8B8AA0'] },
  gray:    { name: 'Gray',    colors: ['#212529','#343a40','#495057','#868e96','#adb5bd','#ced4da'] },
  red:     { name: 'Red',     colors: ['#c92a2a','#e03131','#f03e3e','#fa5252','#ff6b6b','#ff8787'] },
  pink:    { name: 'Pink',    colors: ['#a61e4d','#c2255c','#d6336c','#e64980','#f06595','#f783ac'] },
  grape:   { name: 'Grape',   colors: ['#862e9c','#9c36b5','#ae3ec9','#be4bdb','#cc5de8','#da77f2'] },
  violet:  { name: 'Violet',  colors: ['#5f3dc4','#6741d9','#7048e8','#7950f2','#845ef7','#9775fa'] },
  indigo:  { name: 'Indigo',  colors: ['#364fc7','#3b5bdb','#4263eb','#4c6ef5','#5c7cfa','#748ffc'] },
  blue:    { name: 'Blue',    colors: ['#1864ab','#1971c2','#1c7ed6','#228be6','#339af0','#4dabf7'] },
  cyan:    { name: 'Cyan',    colors: ['#0b7285','#0c8599','#1098ad','#15aabf','#22b8cf','#3bc9db'] },
  teal:    { name: 'Teal',    colors: ['#087f5b','#099268','#0ca678','#12b886','#20c997','#38d9a9'] },
  green:   { name: 'Green',   colors: ['#2b8a3e','#2f9e44','#37b24d','#40c057','#51cf66','#69db7c'] },
  lime:    { name: 'Lime',    colors: ['#5c940d','#66a80f','#74b816','#82c91e','#94d82d','#a9e34b'] },
  yellow:  { name: 'Yellow',  colors: ['#e67700','#f08c00','#f59f00','#fab005','#fcc419','#ffd43b'] },
  orange:  { name: 'Orange',  colors: ['#d9480f','#e8590c','#f76707','#fd7e14','#ff922b','#ffa94d'] },
};

function getBooksToLoad(bookCode) {
  return BOOK_GROUPS[bookCode] || [bookCode];
}

// Group a sorted headings array by book, preserving order
function groupHeadingsByBook(headings) {
  const groups = [];
  let lastCode = null;
  for (const h of headings) {
    if (h.book !== lastCode) {
      lastCode = h.book;
      groups.push({ bookCode: h.book, bookName: getBookName(h.book), headings: [] });
    }
    groups[groups.length - 1].headings.push(h);
  }
  return groups;
}

// If any heading in the array has a numeric position, sort by position
// (headings without a position sort after all positioned ones).
// Otherwise the db-returned sortKey+level order is used unchanged.
function applyPositionSort(headings) {
  if (headings.some(h => typeof h.position === 'number')) {
    headings.sort((a, b) => {
      const ap = typeof a.position === 'number' ? a.position : Infinity;
      const bp = typeof b.position === 'number' ? b.position : Infinity;
      if (ap !== bp) return ap - bp;
      return a.sortKey.localeCompare(b.sortKey) || (a.level - b.level);
    });
  }
}

let currentBook = null;
let currentHeadings = [];
let selectedHeadingLevel = 1;
let editingHeadingId = null;
let isReorderMode = false;
let currentSetId = null;
let editingSetId = null;   // null = add-mode in manage-sets form; int = edit-mode
let savedLang = 'en';      // UI language code, set during init()
let currentOutlineFormat = 'traditional'; // 'traditional' | 'thematic' | 'plot'
let outlineSets = [];                     // cached OutlineSet objects — kept in sync
let currentPassage = null;               // null = all headings; {id,setId,book,startRef,endRef} = filtered
let editingPassageId = null;             // null = add mode; number = edit mode

// Unicode subscript numerals for thematic format (A₁, A₂, …)
const SUBSCRIPT_DIGITS = ['₀','₁','₂','₃','₄','₅','₆','₇','₈','₉'];
function toSubscriptNum(n) {
  return String(n).split('').map(d => SUBSCRIPT_DIGITS[+d] ?? d).join('');
}

// Map plot element codes to i18n keys
const PLOT_LABEL_KEYS = {
  IS: 'plotInitialSituation',
  C:  'plotConflict',
  TA: 'plotTransformingAction',
  R:  'plotResolution',
  FS: 'plotFinalSituation',
};

// ── Color scheme ─────────────────────────────────────────────────────────────

function applyColorScheme(theme) {
  document.body.classList.remove('theme-gray', 'theme-blue', 'theme-green', 'theme-crimson');
  if (theme === 'gray')    document.body.classList.add('theme-gray');
  if (theme === 'blue')    document.body.classList.add('theme-blue');
  if (theme === 'green')   document.body.classList.add('theme-green');
  if (theme === 'crimson') document.body.classList.add('theme-crimson');

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

async function initColorScheme() {
  const saved = (await db.getSetting('colorScheme')) || 'default';
  applyColorScheme(saved);

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const theme = btn.dataset.theme;
      applyColorScheme(theme);
      await db.setSetting('colorScheme', theme);
    });
  });
}

// ── Heading palette ───────────────────────────────────────────────────────────

function applyHeadingPalette(key) {
  const palette = HEADING_PALETTES[key] || HEADING_PALETTES.default;
  palette.colors.forEach((color, i) => {
    document.documentElement.style.setProperty(`--level${i + 1}-color`, color);
  });
  document.querySelectorAll('.palette-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.palette === key);
  });
}

async function initHeadingPalette() {
  const picker = document.getElementById('palettePicker');
  Object.entries(HEADING_PALETTES).forEach(([key, palette]) => {
    const chip = document.createElement('button');
    chip.className = 'palette-chip';
    chip.dataset.palette = key;
    chip.title = i18n.t(`palette_${key}`);

    const swatches = document.createElement('div');
    swatches.className = 'palette-swatches';
    palette.colors.forEach(color => {
      const s = document.createElement('span');
      s.className = 'palette-swatch';
      s.style.background = color;
      swatches.appendChild(s);
    });

    const label = document.createElement('span');
    label.className = 'palette-chip-name';
    label.textContent = i18n.t(`palette_${key}`);

    chip.appendChild(swatches);
    chip.appendChild(label);

    chip.addEventListener('click', async () => {
      applyHeadingPalette(key);
      await db.setSetting('headingPalette', key);
    });

    picker.appendChild(chip);
  });

  // Apply saved palette (or default)
  const saved = (await db.getSetting('headingPalette')) || 'default';
  applyHeadingPalette(saved);
}

// ── Outline Format ────────────────────────────────────────────────────────────

function applyOutlineFormat(fmt) {
  currentOutlineFormat = fmt;
  updatePassageBarVisibility();
}

// ── Passages ──────────────────────────────────────────────────────────────────

function updatePassageBarVisibility() {
  const show = currentOutlineFormat === 'thematic' || currentOutlineFormat === 'plot';
  document.getElementById('passageBar').style.display = show ? 'flex' : 'none';
  if (!show) {
    currentPassage = null;
    document.getElementById('passageForm').style.display = 'none';
  }
}

async function refreshPassageSelect() {
  const bar = document.getElementById('passageBar');
  if (bar.style.display === 'none') return;
  if (!currentBook || !currentSetId) return;

  const passages = await db.getPassages(currentSetId, currentBook);
  const sel = document.getElementById('passageSelect');
  sel.innerHTML = '';

  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = i18n.t('passageAll');
  sel.appendChild(allOpt);

  passages.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    const grouped = getBooksToLoad(currentBook).length > 1;
    const fmtRef = (ref) => {
      const book = ref.split('.')[0];
      return grouped ? `${book} ${db.formatReference(ref)}` : db.formatReference(ref);
    };
    opt.textContent = fmtRef(p.startRef) + ' \u2013 ' + fmtRef(p.endRef);
    sel.appendChild(opt);
  });

  // Restore or clear selection
  if (currentPassage) {
    sel.value = currentPassage.id;
    if (!sel.value) currentPassage = null;
  }
  updatePassageEditDeleteBtns();
}

function updatePassageEditDeleteBtns() {
  const hasSelection = !!currentPassage;
  document.getElementById('editPassageBtn').style.display   = hasSelection ? '' : 'none';
  document.getElementById('deletePassageBtn').style.display = hasSelection ? '' : 'none';
}

async function savePassage() {
  const sCh = parseInt(document.getElementById('passageStartChapter').value);
  const sV  = parseInt(document.getElementById('passageStartVerse').value);
  const eCh = parseInt(document.getElementById('passageEndChapter').value);
  const eV  = parseInt(document.getElementById('passageEndVerse').value);
  if (!sCh || !sV || !eCh || !eV) { alert(i18n.t('fillInAllFields')); return; }
  const startRef = `${currentBook}.${sCh}.${sV}`;
  const endRef   = `${currentBook}.${eCh}.${eV}`;
  if (db.createSortKey(endRef) < db.createSortKey(startRef)) {
    alert(i18n.t('endRefBeforeStartAlert'));
    return;
  }
  if (editingPassageId != null) {
    await db.updatePassage(editingPassageId, { startRef, endRef });
    if (currentPassage && currentPassage.id === editingPassageId) {
      currentPassage = { ...currentPassage, startRef, endRef };
    }
  } else {
    const newId = await db.addPassage({ setId: currentSetId, book: currentBook, startRef, endRef });
    const passages = await db.getPassages(currentSetId, currentBook);
    currentPassage = passages.find(p => p.id === newId) || null;
  }
  document.getElementById('passageForm').style.display = 'none';
  await refreshPassageSelect();
  await loadHeadings();
}

// ── Outline Sets ──────────────────────────────────────────────────────────────

// ~70 ISO 639-1 codes for the language picker
const COMMON_LANGS = [
  'af','am','ar','az','be','bg','bn','ca','cs','cy','da','de','el','en','es',
  'et','eu','fa','fi','fr','ga','gu','he','hi','hr','hu','hy','id','ig','is',
  'it','ja','ka','km','kn','ko','lt','lv','mk','ml','mn','mr','ms','my','ne',
  'nl','no','pa','pl','pt','ro','ru','si','sk','sl','sq','sr','sv','sw','ta',
  'te','th','tl','tr','uk','ur','uz','vi','xh','yo','zh','zu'
];

/**
 * Render a language code as a human-readable name in the given locale.
 * Falls back to the raw code if Intl.DisplayNames is unsupported.
 */
function getLangName(code, locale) {
  try {
    return new Intl.DisplayNames([locale || 'en'], { type: 'language' }).of(code) || code;
  } catch (_) {
    return code;
  }
}

/** Populate a <select> with all COMMON_LANGS sorted by their name in `locale`. */
function populateLangPicker(selectEl, currentLang, locale) {
  const opts = COMMON_LANGS
    .map(code => ({ code, name: getLangName(code, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  selectEl.innerHTML = '';
  opts.forEach(({ code, name }) => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = name;
    if (code === currentLang) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

/** Re-populate the activeSetSelect options from the database. */
async function refreshSetSelector() {
  const sets = await db.getOutlineSets();
  outlineSets = sets;
  const sel = document.getElementById('activeSetSelect');
  const prevId = currentSetId;
  sel.innerHTML = '';
  sets.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });
  // Restore selected value
  const still = sets.some(s => s.id === prevId);
  sel.value = still ? prevId : (sets[0]?.id ?? '');
  // Show copy-from button only when there are 2+ sets
  const copyBtn = document.getElementById('copyFromSetBtn');
  if (copyBtn) copyBtn.style.display = sets.length > 1 ? '' : 'none';
}

/** Initialize the outline-sets bar and manage-sets modal. Called from init(). */
async function initSets() {
  // Populate selector
  const sets = await db.getOutlineSets();
  outlineSets = sets;
  const sel = document.getElementById('activeSetSelect');
  sel.innerHTML = '';
  sets.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });

  // Restore saved active set (fall back to first)
  const rawId = await db.getSetting('activeSetId');
  let targetId = rawId != null ? Number(rawId) : null;
  if (!sets.some(s => s.id === targetId)) targetId = sets[0]?.id ?? null;
  currentSetId = targetId;
  if (targetId != null) sel.value = targetId;

  // Apply this set's outline format
  const activeSet = outlineSets.find(s => s.id === currentSetId);
  applyOutlineFormat(activeSet?.format || 'traditional');
  await refreshPassageSelect();

  // Populate language picker using current UI locale
  populateLangPicker(document.getElementById('setLangSelect'), 'en', savedLang);

  // Show copy-from button only when there are 2+ sets
  const copyBtn = document.getElementById('copyFromSetBtn');
  if (copyBtn) copyBtn.style.display = sets.length > 1 ? '' : 'none';

  // ── Wire events ────────────────────────────────────────────────────────────

  sel.addEventListener('change', async (e) => {
    currentSetId = parseInt(e.target.value, 10);
    await db.setSetting('activeSetId', currentSetId);
    // Apply the new set's outline format
    const activeSet = outlineSets.find(s => s.id === currentSetId);
    applyOutlineFormat(activeSet?.format || 'traditional');
    currentPassage = null;
    await refreshPassageSelect();
    await loadHeadings();
  });

  document.getElementById('manageSetsBtn').addEventListener('click', openManageSetsModal);
  document.getElementById('closeManageSetsModal').addEventListener('click', closeManageSetsModal);
  document.getElementById('manageSetsModal').addEventListener('click', (e) => {
    if (e.target.id === 'manageSetsModal') closeManageSetsModal();
  });
  document.getElementById('saveSetBtn').addEventListener('click', saveSet);
  document.getElementById('cancelSetBtn').addEventListener('click', resetSetForm);
}

function openManageSetsModal() {
  resetSetForm();
  renderSetsList();
  document.getElementById('manageSetsModal').classList.add('active');
}

function closeManageSetsModal() {
  document.getElementById('manageSetsModal').classList.remove('active');
  editingSetId = null;
}

// ── Copy-from-Outline modal ───────────────────────────────────────────────

async function openCopyFromSetModal() {
  const sets = await db.getOutlineSets();
  const sel = document.getElementById('copySourceSetSelect');
  sel.innerHTML = '';
  sets.filter(s => s.id !== currentSetId).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });
  // Reset radios to defaults
  document.querySelector('input[name="copyScope"][value="all"]').checked = true;
  document.querySelector('input[name="copyMode"][value="append"]').checked = true;
  // "Current book" only available when a book is loaded
  document.querySelector('input[name="copyScope"][value="current"]').disabled = !currentBook;
  const st = document.getElementById('copyFromSetStatus');
  st.style.display = 'none';
  st.textContent = '';
  document.getElementById('copyFromSetModal').classList.add('active');
}

function closeCopyFromSetModal() {
  document.getElementById('copyFromSetModal').classList.remove('active');
}

async function executeCopyFromSet() {
  const sourceSetId = parseInt(document.getElementById('copySourceSetSelect').value, 10);
  const scope = document.querySelector('input[name="copyScope"]:checked').value;
  const mode  = document.querySelector('input[name="copyMode"]:checked').value;

  // Determine which books are in scope
  let books;
  if (scope === 'all') {
    const all = await db.getAllHeadings(sourceSetId);
    books = [...new Set(all.map(h => h.book))];
  } else {
    books = getBooksToLoad(currentBook); // respects paired groups (1–2 Sam, etc.)
  }

  // Fetch source headings
  const sourceHeadings = await db.getHeadingsByBooks(books, sourceSetId);
  if (sourceHeadings.length === 0) {
    showCopyStatus(i18n.t('copyNoSource'), 'warning');
    return;
  }

  if (mode === 'replace') {
    // Confirm then delete existing target headings for the scope
    const targetHeadings = await db.getHeadingsByBooks(books, currentSetId);
    if (!confirm(i18n.t('confirmCopyReplace', targetHeadings.length))) return;
    await Promise.all(targetHeadings.map(h => db.deleteHeading(h.id)));
    // Add source headings with [text] wrapping
    for (const h of sourceHeadings) {
      const { id, setId, sortKey, createdAt, position, ...rest } = h;
      await db.addHeading({ ...rest, text: `[${rest.text}]`, setId: currentSetId });
    }
  } else {
    // Append mode: for each source heading, find a matching target heading by
    // book + reference + level. If found, append [sourceText] to the existing
    // text. If not found, add a new heading with [text] wrapping.
    const targetHeadings = await db.getHeadingsByBooks(books, currentSetId);
    const targetMap = new Map(
      targetHeadings.map(h => [`${h.book}|${h.reference}|${h.level}`, h])
    );
    for (const h of sourceHeadings) {
      const key = `${h.book}|${h.reference}|${h.level}`;
      const match = targetMap.get(key);
      if (match) {
        await db.updateHeading(match.id, { text: `${match.text} [${h.text}]` });
      } else {
        const { id, setId, sortKey, createdAt, position, ...rest } = h;
        await db.addHeading({ ...rest, text: `[${rest.text}]`, setId: currentSetId });
      }
    }
  }

  showCopyStatus(i18n.t('copySuccess', sourceHeadings.length), 'success');
  await loadHeadings();
  setTimeout(closeCopyFromSetModal, 1500);
}

function showCopyStatus(msg, type) {
  const el = document.getElementById('copyFromSetStatus');
  el.textContent = msg;
  el.className = 'import-status ' + (type === 'success' ? 'success' : 'warning');
  el.style.display = 'block';
}

async function renderSetsList() {
  const sets = await db.getOutlineSets();
  outlineSets = sets;
  const container = document.getElementById('setsList');
  container.innerHTML = '';
  sets.forEach(set => {
    const row = document.createElement('div');
    row.className = 'set-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'set-item-name';
    nameSpan.textContent = set.name;

    const langSpan = document.createElement('span');
    langSpan.className = 'set-item-lang';
    langSpan.textContent = getLangName(set.lang, savedLang);

    const fmtGroup = document.createElement('div');
    fmtGroup.className = 'set-item-format';
    ['traditional', 'thematic', 'plot'].forEach(fmt => {
      const fmtBtn = document.createElement('button');
      fmtBtn.className = 'format-btn';
      fmtBtn.dataset.format = fmt;
      fmtBtn.textContent = i18n.t('format' + fmt.charAt(0).toUpperCase() + fmt.slice(1));
      if ((set.format || 'traditional') === fmt) fmtBtn.classList.add('active');
      fmtBtn.addEventListener('click', async () => {
        await db.updateOutlineSet(set.id, { format: fmt });
        const cached = outlineSets.find(s => s.id === set.id);
        if (cached) cached.format = fmt;
        fmtGroup.querySelectorAll('.format-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.format === fmt);
        });
        if (set.id === currentSetId) {
          applyOutlineFormat(fmt);
          await loadHeadings();
        }
      });
      fmtGroup.appendChild(fmtBtn);
    });

    const actions = document.createElement('div');
    actions.className = 'set-item-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-small';
    editBtn.textContent = i18n.t('editSetInline');
    editBtn.addEventListener('click', () => startEditSet(set));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-small';
    delBtn.textContent = i18n.t('deleteSet');
    delBtn.style.color = '#d32f2f';
    if (sets.length <= 1) delBtn.disabled = true;
    delBtn.addEventListener('click', () => confirmDeleteSet(set.id, set.name));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    row.appendChild(nameSpan);
    row.appendChild(langSpan);
    row.appendChild(fmtGroup);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

function startEditSet(set) {
  editingSetId = set.id;
  const titleEl = document.getElementById('setFormTitle');
  titleEl.textContent = set.name;
  titleEl.removeAttribute('data-i18n');
  document.getElementById('setNameInput').value = set.name;
  document.getElementById('setLangSelect').value = set.lang;
  const saveBtn = document.getElementById('saveSetBtn');
  saveBtn.textContent = i18n.t('saveEditSet');
  saveBtn.removeAttribute('data-i18n');
  document.getElementById('setNameInput').focus();
}

function resetSetForm() {
  editingSetId = null;
  document.getElementById('setNameInput').value = '';
  document.getElementById('setLangSelect').value = 'en';
  const saveBtn = document.getElementById('saveSetBtn');
  saveBtn.textContent = i18n.t('saveNewSet');
  saveBtn.removeAttribute('data-i18n');
  const titleEl = document.getElementById('setFormTitle');
  titleEl.textContent = i18n.t('addSet');
  titleEl.removeAttribute('data-i18n');
}

async function saveSet() {
  const name = document.getElementById('setNameInput').value.trim();
  const lang = document.getElementById('setLangSelect').value;
  if (!name) {
    document.getElementById('setNameInput').focus();
    return;
  }
  if (editingSetId != null) {
    await db.updateOutlineSet(editingSetId, { name, lang });
  } else {
    await db.addOutlineSet({ name, lang });
  }
  resetSetForm();
  await refreshSetSelector();
  await renderSetsList();
  // Reload headings if the active set's name changed (no data change, but harmless)
  if (editingSetId === currentSetId) await loadHeadings();
}

async function confirmDeleteSet(setId, setName) {
  const count = await db.getHeadingCountForSet(setId);
  if (!confirm(i18n.t('confirmDeleteSet', setName, count))) return;
  await db.deleteOutlineSet(setId);
  // Switch active set if we just deleted it
  if (setId === currentSetId) {
    const sets = await db.getOutlineSets();
    outlineSets = sets;
    currentSetId = sets[0]?.id ?? null;
    if (currentSetId != null) await db.setSetting('activeSetId', currentSetId);
    // Apply the replacement set's format
    const activeSet = outlineSets.find(s => s.id === currentSetId);
    applyOutlineFormat(activeSet?.format || 'traditional');
  }
  await refreshSetSelector();
  if (currentSetId != null) document.getElementById('activeSetSelect').value = currentSetId;
  await renderSetsList();
  await loadHeadings();
}

// Initialize
async function init() {
  await db.init();

  // Load i18n strings, then localize the static DOM
  savedLang = (await db.getSetting('language')) || 'en';
  await i18n.load(savedLang);
  i18n.localizeDOM();
  i18n.localizeBookSelects();

  // Wire language selector
  const langSel = document.getElementById('languageSelect');
  if (langSel) {
    langSel.value = savedLang;
    langSel.addEventListener('change', async () => {
      await db.setSetting('language', langSel.value);
      location.reload();
    });
  }

  await initColorScheme();       // apply saved theme before rendering
  await initHeadingPalette();    // apply saved heading palette before rendering
  await initSets();              // load outline sets, set currentSetId, apply active set's format
  setupEventListeners();
  await loadCurrentBook();

  // Set up backup UI and run auto-backup if due
  await initBackup();
  await initDrive();
  await maybeAutoBackup();

  // Listen for actions triggered by the content script via session storage.
  // chrome.runtime.sendMessage from content scripts doesn't reliably reach
  // side panels in MV3; chrome.storage.onChanged fires in all contexts
  // directly, with no dependency on the service worker being alive.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'session') return;
    if (changes.pendingHeadingRef) {
      openAddHeadingModalWithVerse(changes.pendingHeadingRef.newValue.reference);
    }
    if (changes.pendingHighlightRef) {
      highlightHeadingByReference(changes.pendingHighlightRef.newValue.reference);
    }
  });
}

// Setup event listeners
function setupEventListeners() {
  // Add heading button (exits reorder mode first if active)
  document.getElementById('addHeadingBtn').addEventListener('click', () => {
    if (isReorderMode) exitReorderMode();
    openAddHeadingModal();
  });
  
  // Modal controls
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('saveHeadingBtn').addEventListener('click', saveHeading);
  document.getElementById('tagCheck').addEventListener('change', function () {
    document.getElementById('tagInputRow').style.display = this.checked ? 'block' : 'none';
    if (!this.checked) document.getElementById('tagInput').value = '';
  });
  
  // Level buttons
  document.querySelectorAll('.level-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedHeadingLevel = parseInt(btn.dataset.level);
    });
  });
  
  // Reorder
  document.getElementById('reorderBtn').addEventListener('click', enterReorderMode);
  document.getElementById('saveOrderBtn').addEventListener('click', saveOrder);
  document.getElementById('cancelReorderBtn').addEventListener('click', cancelReorder);

  // Drag-and-drop on the headings list (event delegation, guarded by isReorderMode)
  const hList = document.getElementById('headingsList');
  let dragSrc = null;

  hList.addEventListener('dragstart', (e) => {
    if (!isReorderMode) return;
    const item = e.target.closest('.heading-item');
    if (!item) return;
    dragSrc = item;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.dataset.id);
    requestAnimationFrame(() => item.classList.add('dragging'));
  });

  hList.addEventListener('dragover', (e) => {
    if (!isReorderMode || !dragSrc) return;
    e.preventDefault();
    const target = e.target.closest('.heading-item');
    if (!target || target === dragSrc) return;
    // Clear previous indicators
    hList.querySelectorAll('.drag-over-above').forEach(el => el.classList.remove('drag-over-above'));
    const rect = target.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      hList.insertBefore(dragSrc, target);
    } else {
      hList.insertBefore(dragSrc, target.nextSibling);
    }
  });

  hList.addEventListener('dragend', () => {
    if (dragSrc) { dragSrc.classList.remove('dragging'); dragSrc = null; }
    hList.querySelectorAll('.drag-over-above').forEach(el => el.classList.remove('drag-over-above'));
  });

  hList.addEventListener('drop', (e) => e.preventDefault());

  // Export
  document.getElementById('exportBtn').addEventListener('click', openExportModal);
  document.getElementById('closeExportModal').addEventListener('click', closeExportModal);
  document.getElementById('copyClipboardBtn').addEventListener('click', copyToClipboard);
  document.getElementById('exportMarkdownBtn').addEventListener('click', () => exportOutline('markdown'));
  document.getElementById('exportHtmlBtn').addEventListener('click', () => exportOutline('html'));
  document.getElementById('exportXmlBtn').addEventListener('click', () => exportOutline('xml'));
  document.getElementById('exportJsonBtn').addEventListener('click', () => exportOutline('json'));
  document.getElementById('exportWordBtn').addEventListener('click', () => exportOutline('docx'));
  document.getElementById('exportOdtBtn').addEventListener('click', () => exportOutline('odt'));
  document.getElementById('exportPdfBtn').addEventListener('click', () => exportOutline('pdf'));
  
  // Import
  document.getElementById('importBtn').addEventListener('click', openImportModal);
  document.getElementById('closeImportModal').addEventListener('click', closeImportModal);
  document.getElementById('importJsonBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', handleImportFile);

  // Copy from outline
  document.getElementById('copyFromSetBtn').addEventListener('click', openCopyFromSetModal);
  document.getElementById('closeCopyFromSetModal').addEventListener('click', closeCopyFromSetModal);
  document.getElementById('cancelCopyFromSetBtn').addEventListener('click', closeCopyFromSetModal);
  document.getElementById('doCopyFromSetBtn').addEventListener('click', executeCopyFromSet);

  // Current book dropdown
  document.getElementById('currentBookSelect').addEventListener('change', async (e) => {
    currentBook = e.target.value || null;
    currentPassage = null;
    await refreshPassageSelect();
    await loadHeadings();
  });

  // Passage bar
  document.getElementById('passageSelect').addEventListener('change', async (e) => {
    const id = e.target.value ? parseInt(e.target.value) : null;
    if (!id) {
      currentPassage = null;
    } else {
      const passages = await db.getPassages(currentSetId, currentBook);
      currentPassage = passages.find(p => p.id === id) || null;
    }
    updatePassageEditDeleteBtns();
    await loadHeadings();
  });

  document.getElementById('addPassageBtn').addEventListener('click', () => {
    editingPassageId = null;
    document.getElementById('passageFormTitle').textContent = i18n.t('passageFormAdd');
    document.getElementById('passageStartChapter').value = '';
    document.getElementById('passageStartVerse').value   = '';
    document.getElementById('passageEndChapter').value   = '';
    document.getElementById('passageEndVerse').value     = '';
    document.getElementById('passageForm').style.display = 'flex';
    document.getElementById('passageStartChapter').focus();
  });

  document.getElementById('editPassageBtn').addEventListener('click', () => {
    if (!currentPassage) return;
    editingPassageId = currentPassage.id;
    document.getElementById('passageFormTitle').textContent = i18n.t('passageFormEdit');
    const { chapter: sCh, verse: sV } = db.parseReference(currentPassage.startRef);
    const { chapter: eCh, verse: eV } = db.parseReference(currentPassage.endRef);
    document.getElementById('passageStartChapter').value = sCh;
    document.getElementById('passageStartVerse').value   = sV;
    document.getElementById('passageEndChapter').value   = eCh;
    document.getElementById('passageEndVerse').value     = eV;
    document.getElementById('passageForm').style.display = 'flex';
    document.getElementById('passageStartChapter').focus();
  });

  document.getElementById('deletePassageBtn').addEventListener('click', async () => {
    if (!currentPassage) return;
    const label = db.formatReference(currentPassage.startRef) + ' \u2013 ' + db.formatReference(currentPassage.endRef);
    if (!confirm(i18n.t('confirmDeletePassage', label))) return;
    await db.deletePassage(currentPassage.id);
    currentPassage = null;
    document.getElementById('passageForm').style.display = 'none';
    await refreshPassageSelect();
    await loadHeadings();
  });

  document.getElementById('savePassageBtn').addEventListener('click', savePassage);
  document.getElementById('cancelPassageBtn').addEventListener('click', () => {
    document.getElementById('passageForm').style.display = 'none';
  });

  // Go-to-book button
  document.getElementById('goToBookBtn').addEventListener('click', async () => {
    if (!currentBook) return;
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      const ctx       = getTabContext(tabs[0].url);
      const version   = ctx.version   || (await db.getSetting('bibleVersion'))   || 'ESV';
      const versionId = ctx.versionId || (await db.getSetting('bibleVersionId')) || '1';
      const url       = buildNavigationUrl(ctx.site, currentBook, '1', version, versionId);
      await chrome.tabs.update(tabs[0].id, { url });
    }
  });

  // Click outside modal to close
  document.getElementById('headingText').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.getElementById('headingText').value.trim()) {
      e.preventDefault();
      saveHeading();
    }
  });

  document.getElementById('headingModal').addEventListener('click', (e) => {
    if (e.target.id === 'headingModal') closeModal();
  });
  document.getElementById('exportModal').addEventListener('click', (e) => {
    if (e.target.id === 'exportModal') closeExportModal();
  });
  document.getElementById('importModal').addEventListener('click', (e) => {
    if (e.target.id === 'importModal') closeImportModal();
  });
  document.getElementById('copyFromSetModal').addEventListener('click', (e) => {
    if (e.target.id === 'copyFromSetModal') closeCopyFromSetModal();
  });
}

// Handle messages from other parts of the extension
function handleMessage(message) {
  if (message.type === 'HIGHLIGHT_HEADING') {
    highlightHeadingByReference(message.reference);
  } else if (message.type === 'OPEN_HEADING_MODAL_WITH_VERSE') {
    openAddHeadingModalWithVerse(message.reference);
  }
}

// Load current book from StepBible
async function loadCurrentBook() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && tabs[0].url.includes('stepbible.org')) {
      const response = await chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CURRENT_BOOK' });
      if (response && response.book) {
        currentBook = response.book;
        document.getElementById('currentBookSelect').value = currentBook;
        await loadHeadings();
      }
    }
  } catch (error) {
    console.error('Error loading current book:', error);
  }
}

// Load headings for current book (or grouped books), filtered to the active passage if set
async function loadHeadings() {
  if (!currentBook) return;

  try {
    const books = getBooksToLoad(currentBook);
    currentHeadings = await db.getHeadingsByBooks(books, currentSetId);
    applyPositionSort(currentHeadings);

    let headingsToRender = currentHeadings;
    let fallbackEndRef = db.getLastVerseRef(books[books.length - 1]);

    if (currentPassage) {
      const pStart = db.createSortKey(currentPassage.startRef);
      const pEnd   = db.createSortKey(currentPassage.endRef);
      headingsToRender = currentHeadings.filter(h => h.sortKey >= pStart && h.sortKey <= pEnd);
      fallbackEndRef = currentPassage.endRef;
    }

    const headingsWithRanges = db.calculateVerseRanges(headingsToRender, fallbackEndRef);
    renderHeadings(headingsWithRanges);
  } catch (error) {
    console.error('Error loading headings:', error);
  }
}

// Render headings in the list
function renderHeadings(headings) {
  const container = document.getElementById('headingsList');
  const emptyState = document.getElementById('emptyState');
  
  if (headings.length === 0) {
    emptyState.style.display = 'flex';
    container.innerHTML = '';
    return;
  }
  
  emptyState.style.display = 'none';
  container.innerHTML = '';

  // Assign outline numbers (counters reset per book)
  const numberedHeadings = assignOutlineNumbers(groupHeadingsByBook(headings))
    .flatMap(g => g.headings);

  numberedHeadings.forEach(heading => {
    const item = createHeadingElement(heading);
    container.appendChild(item);
  });
}

// Create heading element
function createHeadingElement(heading) {
  const div = document.createElement('div');
  const displayLevel = heading.displayLevel ?? heading.level;
  div.className = `heading-item level-${displayLevel}${heading.tag ? ' tagged' : ''}`;
  div.dataset.id = heading.id;
  div.dataset.reference = heading.reference;

  // Format the verse range, prefixing book abbr when showing a grouped view
  const grouped = getBooksToLoad(currentBook).length > 1;
  const fmtRef = (ref) => {
    const book = ref.split('.')[0];
    return grouped ? `${book} ${db.formatReference(ref)}` : db.formatReference(ref);
  };
  const startDisplay = fmtRef(heading.startRef);
  const endDisplay = heading.endRef !== heading.startRef ?
    ` – ${fmtRef(heading.endRef)}` : '';

  const prefixHtml = heading.tag
    ? `<span class="tag-label">${heading.tag}</span>`
    : (currentOutlineFormat === 'plot' && heading.prefix
        ? `<span class="plot-label">${heading.prefix}</span>`
        : `<span class="outline-num">${heading.prefix || ''}</span>`);
  const bodyText = heading.tag ? `[${heading.text}]` : heading.text;

  div.innerHTML = `
    <span class="drag-handle" aria-hidden="true">&#8801;</span>
    <span class="heading-text">${prefixHtml} ${bodyText}</span>
    <span class="heading-reference">(${startDisplay}${endDisplay})</span>
    <div class="heading-actions">
      <button class="action-btn edit" title="Edit">✏️</button>
      <button class="action-btn delete" title="Delete">🗑️</button>
    </div>
  `;

  // Click to navigate (suppressed in reorder mode)
  div.addEventListener('click', (e) => {
    if (isReorderMode) return;
    if (!e.target.classList.contains('action-btn')) {
      navigateToVerse(heading.reference);
    }
  });
  
  // Edit button
  div.querySelector('.edit').addEventListener('click', (e) => {
    e.stopPropagation();
    openEditHeadingModal(heading);
  });
  
  // Delete button
  div.querySelector('.delete').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteHeading(heading.id);
  });
  
  return div;
}

// ── Book code maps ────────────────────────────────────────────────────────────

// OSIS → USFM (YouVersion uses USFM 3-letter codes)
// content.js has the same data; duplicated here because the two files run in
// separate JS contexts with no module sharing.
const OSIS_TO_USFM = {
  Gen:'GEN', Exod:'EXO', Lev:'LEV', Num:'NUM', Deut:'DEU',
  Josh:'JOS', Judg:'JDG', Ruth:'RUT', '1Sam':'1SA', '2Sam':'2SA',
  '1Kgs':'1KI', '2Kgs':'2KI', '1Chr':'1CH', '2Chr':'2CH',
  Ezra:'EZR', Neh:'NEH', Esth:'EST', Job:'JOB', Ps:'PSA',
  Prov:'PRO', Eccl:'ECC', Song:'SNG', Isa:'ISA', Jer:'JER',
  Lam:'LAM', Ezek:'EZK', Dan:'DAN', Hos:'HOS', Joel:'JOL',
  Amos:'AMO', Obad:'OBA', Jonah:'JON', Mic:'MIC', Nah:'NAM',
  Hab:'HAB', Zeph:'ZEP', Hag:'HAG', Zech:'ZEC', Mal:'MAL',
  Matt:'MAT', Mark:'MRK', Luke:'LUK', John:'JHN', Acts:'ACT',
  Rom:'ROM', '1Cor':'1CO', '2Cor':'2CO', Gal:'GAL', Eph:'EPH',
  Phil:'PHP', Col:'COL', '1Thess':'1TH', '2Thess':'2TH',
  '1Tim':'1TI', '2Tim':'2TI', Titus:'TIT', Phlm:'PHM',
  Heb:'HEB', Jas:'JAS', '1Pet':'1PE', '2Pet':'2PE',
  '1John':'1JN', '2John':'2JN', '3John':'3JN', Jude:'JUD', Rev:'REV'
};

// ── Tab context & navigation ──────────────────────────────────────────────────

/**
 * Parse site, version code, and (for YouVersion) numeric version ID from a tab URL.
 * @param {string} url
 * @returns {{ site: string|null, version: string|null, versionId: string|null }}
 */
function getTabContext(url) {
  if (!url) return { site: null, version: null, versionId: null };
  if (url.includes('stepbible.org')) {
    const m = url.match(/[?&]q=[^&]*version=([^|&]+)/);
    return { site: 'stepbible', version: m ? decodeURIComponent(m[1]) : null, versionId: null };
  }
  // Check parabible.com before bible.com — "parabible.com" contains "bible.com" as a substring
  if (url.includes('parabible.com')) {
    return { site: 'parabible', version: null, versionId: null };
  }
  if (url.includes('bible.com')) {
    const mId  = url.match(/bible\.com\/bible\/(\d+)\//);
    const mVer = url.match(/bible\.com\/bible\/\d+\/[A-Z0-9]+\.\d+\.([A-Z0-9]+)/i);
    return {
      site: 'youversion',
      version:   mVer ? mVer[1]  : null,
      versionId: mId  ? mId[1]   : null
    };
  }
  if (url.includes('biblegateway.com')) {
    const m = url.match(/[?&]version=([^&]+)/);
    return { site: 'biblegateway', version: m ? decodeURIComponent(m[1]) : null, versionId: null };
  }
  return { site: null, version: null, versionId: null };
}

/**
 * Build a navigation URL for the given site, book, chapter, and version.
 * @param {string} site
 * @param {string} osisBook  - OSIS book code, e.g. "Gen"
 * @param {string} chapter   - chapter number as string
 * @param {string|null} version    - version code, e.g. "ESV"
 * @param {string|null} versionId  - numeric ID (YouVersion only), e.g. "59"
 * @returns {string}
 */
function buildNavigationUrl(site, osisBook, chapter, version, versionId) {
  switch (site) {
    case 'youversion': {
      const uvBook = OSIS_TO_USFM[osisBook] || osisBook.toUpperCase();
      return `https://www.bible.com/bible/${versionId || '1'}/${uvBook}.${chapter}.${version || 'KJV'}`;
    }
    case 'biblegateway': {
      const name    = getBookName(osisBook);
      const encoded = encodeURIComponent(`${name} ${chapter}`);
      return `https://www.biblegateway.com/passage/?search=${encoded}&version=${version || 'ESV'}`;
    }
    case 'parabible': {
      const name = getBookName(osisBook);
      return `https://parabible.com/${encodeURIComponent(name)}/${chapter}`;
    }
    default: // stepbible or unknown — fall back to StepBible
      return `https://www.stepbible.org/?q=version=${version || 'ESV'}|reference=${osisBook}.${chapter}&options=NVHUG`;
  }
}

/**
 * Get the Bible version to use for navigation URLs.
 * 1. Reads context from the currently-active tab's URL (most up-to-date).
 * 2. Persists version (and versionId) to db.settings for next session.
 * 3. Falls back to the stored setting if no supported tab is active.
 * 4. Final fallback: 'ESV'.
 * @returns {Promise<string>}
 */
async function getCurrentVersion() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const ctx = getTabContext(tabs[0]?.url);
    if (ctx.version) {
      await db.setSetting('bibleVersion', ctx.version);
      if (ctx.versionId) await db.setSetting('bibleVersionId', ctx.versionId);
      return ctx.version;
    }
  } catch (_) {}
  return (await db.getSetting('bibleVersion')) || 'ESV';
}

// Navigate to a verse reference on whatever Bible site is currently active
async function navigateToVerse(reference) {
  console.log('Navigating to verse:', reference);

  // Parse the reference
  const parts = reference.split('.');
  const book    = parts[0];
  const chapter = parts[1];

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      const ctx       = getTabContext(tabs[0].url);
      const version   = ctx.version   || (await db.getSetting('bibleVersion'))   || 'ESV';
      const versionId = ctx.versionId || (await db.getSetting('bibleVersionId')) || '1';
      const url       = buildNavigationUrl(ctx.site, book, chapter, version, versionId);
      console.log('Navigating to:', url);

      // Update the tab URL
      await chrome.tabs.update(tabs[0].id, { url });

      // Wait a moment for page to load, then scroll to verse
      setTimeout(async () => {
        chrome.runtime.sendMessage({
          type: 'NAVIGATE_TO_VERSE',
          reference: reference
        });
      }, 1500);
    }
  } catch (error) {
    console.error('Error navigating to verse:', error);
  }

  // Highlight this heading in the side panel
  highlightHeadingByReference(reference);
}

// Highlight a heading by reference
function highlightHeadingByReference(reference) {
  // Remove previous highlights
  document.querySelectorAll('.heading-item.active').forEach(item => {
    item.classList.remove('active');
  });
  
  // Add highlight to matching heading
  const item = document.querySelector(`.heading-item[data-reference="${reference}"]`);
  if (item) {
    item.classList.add('active');
    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Show/hide modal fields appropriate to the current outline format.
// Called each time the heading modal is opened.
function updateModalForFormat() {
  const isTrad = currentOutlineFormat === 'traditional';
  const isThm  = currentOutlineFormat === 'thematic';
  const isPlt  = currentOutlineFormat === 'plot';
  document.getElementById('levelBtnsGroup').style.display    = isTrad ? ''     : 'none';
  document.getElementById('themeKeyGroup').style.display     = isThm  ? 'block' : 'none';
  document.getElementById('plotElementGroup').style.display  = isPlt  ? 'block' : 'none';
  if (isThm) {
    // Populate datalist with existing themeKeys from current headings
    const keys = [...new Set(currentHeadings.filter(h => h.themeKey).map(h => h.themeKey))];
    document.getElementById('themeKeySuggestions').innerHTML =
      keys.map(k => `<option value="${k.replace(/"/g, '&quot;')}">`).join('');
  }
}

// Open add heading modal
function openAddHeadingModal() {
  editingHeadingId = null;
  document.getElementById('modalTitle').textContent = i18n.t('addHeadingModal');
  
  // Set defaults
  if (currentBook) {
    document.getElementById('bookSelect').value = currentBook;
  }
  document.getElementById('chapterInput').value = '1';
  document.getElementById('verseInput').value = '1';
  document.getElementById('midVerseCheck').checked = false;
  document.getElementById('headingText').value = '';
  document.getElementById('headingNotes').value = '';
  document.getElementById('tagCheck').checked = false;
  document.getElementById('tagInput').value = '';
  document.getElementById('tagInputRow').style.display = 'none';
  document.getElementById('themeKeyInput').value = '';
  document.getElementById('plotElementSelect').value = '';

  // Reset level selection
  document.querySelectorAll('.level-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.level === '1');
  });
  selectedHeadingLevel = 1;
  updateModalForFormat();

  document.getElementById('headingModal').classList.add('active');
  document.getElementById('headingText').focus();
}

// Open add heading modal with pre-filled verse reference
function openAddHeadingModalWithVerse(reference) {
  editingHeadingId = null;
  document.getElementById('modalTitle').textContent = i18n.t('addHeadingModal');

  const { book, chapter, verse } = db.parseReference(reference);

  document.getElementById('bookSelect').value = book;
  document.getElementById('chapterInput').value = chapter;
  document.getElementById('verseInput').value = verse;
  document.getElementById('midVerseCheck').checked = false;
  document.getElementById('headingText').value = '';
  document.getElementById('headingNotes').value = '';
  document.getElementById('tagCheck').checked = false;
  document.getElementById('tagInput').value = '';
  document.getElementById('tagInputRow').style.display = 'none';
  document.getElementById('themeKeyInput').value = '';
  document.getElementById('plotElementSelect').value = '';

  // Reset level selection
  document.querySelectorAll('.level-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.level === '1');
  });
  selectedHeadingLevel = 1;
  updateModalForFormat();

  document.getElementById('headingModal').classList.add('active');
  document.getElementById('headingText').focus();
}

// Open edit heading modal
function openEditHeadingModal(heading) {
  editingHeadingId = heading.id;
  document.getElementById('modalTitle').textContent = i18n.t('editHeadingModal');
  
  // Parse reference
  const { book, chapter, verse, midVerse } = db.parseReference(heading.reference);

  document.getElementById('bookSelect').value = book;
  document.getElementById('chapterInput').value = chapter;
  document.getElementById('verseInput').value = verse;
  document.getElementById('midVerseCheck').checked = midVerse;
  document.getElementById('headingText').value = heading.text;
  document.getElementById('headingNotes').value = heading.notes || '';
  const hasTag = !!heading.tag;
  document.getElementById('tagCheck').checked = hasTag;
  document.getElementById('tagInput').value = heading.tag || '';
  document.getElementById('tagInputRow').style.display = hasTag ? 'block' : 'none';
  document.getElementById('themeKeyInput').value = heading.themeKey || '';
  document.getElementById('plotElementSelect').value = heading.plotElement || '';

  // Set level (always kept in case user switches back to traditional format)
  document.querySelectorAll('.level-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.level === heading.level.toString());
  });
  selectedHeadingLevel = heading.level;
  updateModalForFormat();

  document.getElementById('headingModal').classList.add('active');
  document.getElementById('headingText').focus();
}

// Close modal
function closeModal() {
  document.getElementById('headingModal').classList.remove('active');
  editingHeadingId = null;
}

// Save heading
async function saveHeading() {
  const book = document.getElementById('bookSelect').value;
  const chapter = document.getElementById('chapterInput').value;
  const verse = document.getElementById('verseInput').value;
  const midVerse = document.getElementById('midVerseCheck').checked;
  const text = document.getElementById('headingText').value.trim();
  const notes = document.getElementById('headingNotes').value.trim();
  const tagChecked = document.getElementById('tagCheck').checked;
  const tagValue   = document.getElementById('tagInput').value.trim();

  console.log('Save heading called:', { book, chapter, verse, midVerse, text, notes, level: selectedHeadingLevel });

  if (!book || !chapter || !verse || !text) {
    alert(i18n.t('fillInAllFields'));
    return;
  }
  if (tagChecked && !tagValue) {
    alert(i18n.t('tagRequiredAlert'));
    return;
  }
  const tag = tagChecked ? tagValue : '';

  let themeKey = '', plotElement = '';
  if (currentOutlineFormat === 'thematic') {
    themeKey = document.getElementById('themeKeyInput').value.trim();
    if (!themeKey) { alert(i18n.t('themeKeyRequiredAlert')); return; }
  }
  if (currentOutlineFormat === 'plot') {
    plotElement = document.getElementById('plotElementSelect').value;
    if (!plotElement) { alert(i18n.t('plotElementRequiredAlert')); return; }
  }

  const reference = `${book}.${chapter}.${verse}${midVerse ? 'b' : ''}`;
  console.log('Reference:', reference);

  try {
    if (editingHeadingId) {
      // Update existing
      console.log('Updating heading:', editingHeadingId);
      await db.updateHeading(editingHeadingId, {
        book,
        reference,
        level: selectedHeadingLevel,
        text,
        notes,
        tag,
        themeKey,
        plotElement,
      });
      console.log('Heading updated successfully');
    } else {
      // Add new
      console.log('Adding new heading...');
      const id = await db.addHeading({
        book,
        reference,
        level: selectedHeadingLevel,
        text,
        notes,
        setId: currentSetId,
        tag,
        themeKey,
        plotElement,
      });
      console.log('Heading added successfully with id:', id);
    }
    
    closeModal();
    await loadHeadings();
    console.log('Headings reloaded');
  } catch (error) {
    console.error('Error saving heading:', error);
    console.error('Error details:', error.message, error.stack);
    alert(i18n.t('errorSaving', error.message));
  }
}

// Delete heading
async function deleteHeading(id) {
  if (!confirm(i18n.t('confirmDelete'))) {
    return;
  }
  
  try {
    await db.deleteHeading(id);
    await loadHeadings();
  } catch (error) {
    console.error('Error deleting heading:', error);
    alert(i18n.t('errorDeleting'));
  }
}

// Open export modal
function openExportModal() {
  document.getElementById('exportModal').classList.add('active');
}

// Close export modal
function closeExportModal() {
  document.getElementById('exportModal').classList.remove('active');
}

// Open import modal
function openImportModal() {
  document.getElementById('importModal').classList.add('active');
  // Reset status
  const statusDiv = document.getElementById('importStatus');
  statusDiv.style.display = 'none';
  statusDiv.textContent = '';
}

// Close import modal
function closeImportModal() {
  document.getElementById('importModal').classList.remove('active');
}

// Export outline
async function exportOutline(format) {
  console.log('Export outline called, format:', format);
  try {
    const scope = document.querySelector('input[name="exportScope"]:checked')?.value ?? 'all';
    let rawHeadings;
    if (scope === 'current' && currentBook) {
      rawHeadings = await db.getHeadingsByBooks(getBooksToLoad(currentBook), currentSetId);
    } else {
      rawHeadings = await db.getAllHeadings(currentSetId);
    }

    // Determine the last verse of the scope so unclosed ranges extend correctly
    let fallbackEndRef = null;
    if (scope === 'current' && currentBook) {
      const books = getBooksToLoad(currentBook);
      fallbackEndRef = db.getLastVerseRef(books[books.length - 1]);
    } else if (rawHeadings.length > 0) {
      const lastBook = rawHeadings[rawHeadings.length - 1].book;
      const lastGroupBooks = getBooksToLoad(lastBook);
      fallbackEndRef = db.getLastVerseRef(lastGroupBooks[lastGroupBooks.length - 1]);
    }
    const headingsWithRanges = db.calculateVerseRanges(rawHeadings, fallbackEndRef);
    console.log('Headings with ranges:', headingsWithRanges);
    
    let content;
    let filename;
    let mimeType;
    
    if (format === 'markdown') {
      content = generateMarkdownExport(headingsWithRanges);
      filename = 'bible-outline.md';
      mimeType = 'text/markdown';
    } else if (format === 'html') {
      content = generateHTMLExport(headingsWithRanges);
      filename = 'bible-outline.html';
      mimeType = 'text/html';
    } else if (format === 'xml') {
      content = generateXMLExport(headingsWithRanges);
      filename = 'bible-outline.xml';
      mimeType = 'application/xml';
    } else if (format === 'json') {
      content = generateJSONExport(headingsWithRanges);
      filename = 'bible-outline.json';
      mimeType = 'application/json';
    } else if (format === 'docx') {
      content = generateDocxExport(headingsWithRanges);
      filename = 'bible-outline.docx';
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (format === 'odt') {
      content = generateOdtExport(headingsWithRanges);
      filename = 'bible-outline.odt';
      mimeType = 'application/vnd.oasis.opendocument.text';
    } else if (format === 'pdf') {
      await exportAsPDF(headingsWithRanges);
      closeExportModal();
      return;
    }

    console.log('Generated content length:', content.length);

    // Download file
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    console.log('Export complete');
    closeExportModal();
  } catch (error) {
    console.error('Error exporting:', error);
    console.error('Error stack:', error.stack);
    alert(i18n.t('errorExporting', error.message));
  }
}

// Generate Markdown export
function generateMarkdownExport(headings) {
  const groups = assignOutlineNumbers(groupHeadingsByBook(headings));

  let md = `# ${i18n.t('exportDocTitle')}\n\n*${i18n.t('exportGeneratedOn', new Date().toLocaleDateString())}*\n\n`;

  for (const group of groups) {
    md += `---\n\n**${group.bookName}**\n\n`;
    for (const heading of group.headings) {
      const startDisplay = db.formatReference(heading.startRef);
      const endDisplay = heading.endRef !== heading.startRef
        ? `\u2013${db.formatReference(heading.endRef)}` : '';
      if (heading.tag) {
        md += `*${heading.tag} [${heading.text}]* *(${startDisplay}${endDisplay})*\n\n`;
      } else {
        const lvl = heading.displayLevel ?? heading.level;
        const hashes = '#'.repeat(lvl);
        md += `${hashes} ${heading.prefix} ${heading.text} *(${startDisplay}${endDisplay})*\n\n`;
      }
    }
  }

  return md;
}

// Generate plain-text export (for clipboard)
function generatePlainTextExport(headings) {
  const groups = assignOutlineNumbers(groupHeadingsByBook(headings));
  const indent = ['', '  ', '    ', '      ', '        ', '          '];
  let text = '';

  for (const group of groups) {
    if (text) text += '\n';
    text += `${group.bookName}\n`;
    for (const heading of group.headings) {
      const startDisplay = db.formatReference(heading.startRef);
      const endDisplay = heading.endRef !== heading.startRef
        ? `\u2013${db.formatReference(heading.endRef)}` : '';
      const lvl = heading.displayLevel ?? heading.level;
      const pad = indent[lvl - 1] || '';
      if (heading.tag) {
        text += `${pad}${heading.tag} [${heading.text}] (${startDisplay}${endDisplay})\n`;
      } else {
        text += `${pad}${heading.prefix} ${heading.text} (${startDisplay}${endDisplay})\n`;
      }
    }
  }

  return text.trimEnd();
}

// Copy outline to clipboard
async function copyToClipboard() {
  const btn = document.getElementById('copyClipboardBtn');
  const span = btn.querySelector('span');
  try {
    const scope = document.querySelector('input[name="exportScope"]:checked')?.value ?? 'all';
    let rawHeadings;
    if (scope === 'current' && currentBook) {
      rawHeadings = await db.getHeadingsByBooks(getBooksToLoad(currentBook), currentSetId);
    } else {
      rawHeadings = await db.getAllHeadings(currentSetId);
    }

    let fallbackEndRef = null;
    if (scope === 'current' && currentBook) {
      const books = getBooksToLoad(currentBook);
      fallbackEndRef = db.getLastVerseRef(books[books.length - 1]);
    } else if (rawHeadings.length > 0) {
      const lastBook = rawHeadings[rawHeadings.length - 1].book;
      const lastGroupBooks = getBooksToLoad(lastBook);
      fallbackEndRef = db.getLastVerseRef(lastGroupBooks[lastGroupBooks.length - 1]);
    }

    const headingsWithRanges = db.calculateVerseRanges(rawHeadings, fallbackEndRef);
    const text = generatePlainTextExport(headingsWithRanges);
    await navigator.clipboard.writeText(text);

    span.textContent = i18n.t('copiedConfirm');
    setTimeout(() => { span.textContent = i18n.t('copyClipboard'); }, 2000);
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    span.textContent = i18n.t('copyFailed');
    setTimeout(() => { span.textContent = i18n.t('copyClipboard'); }, 2000);
  }
}

// Generate HTML export
function generateHTMLExport(headings) {
  const groups = assignOutlineNumbers(groupHeadingsByBook(headings));

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${i18n.t('exportDocTitle')}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
    .book-title { font-size: 1.5em; font-weight: 700; color: #5C2008; border-bottom: 3px solid #8B4513; padding-bottom: 8px; margin-top: 48px; }
    h1 { color: #5C2008; } h2 { color: #7B3410; } h3 { color: #A0522D; }
    h4 { color: #C07840; } h5 { color: #9E7B50; } h6 { color: #8B8AA0; }
    .num { font-variant-numeric: tabular-nums; margin-right: 4px; }
    .reference { color: #999; font-size: 0.9em; font-family: monospace; }
    .tagged-item { font-style: italic; color: #888; border-left: 3px dashed #ccc; padding-left: 8px; margin: 4px 0; }
  </style>
</head>
<body>
  <h1 style="border-bottom:3px solid #8B4513;padding-bottom:10px;">${i18n.t('exportDocTitle')}</h1>
  <p><em>${i18n.t('exportGeneratedOn', new Date().toLocaleDateString())}</em></p>
`;

  for (const group of groups) {
    html += `  <p class="book-title">${group.bookName}</p>\n`;
    for (const heading of group.headings) {
      const startDisplay = db.formatReference(heading.startRef);
      const endDisplay = heading.endRef !== heading.startRef ?
        `\u2013${db.formatReference(heading.endRef)}` : '';
      const lvl = heading.displayLevel ?? heading.level;
      if (heading.tag) {
        const indent = (lvl - 1) * 20;
        html += `  <p class="tagged-item" style="margin-left:${indent}px"><em>${heading.tag} [${heading.text}]</em> <span class="reference">(${startDisplay}${endDisplay})</span></p>\n`;
      } else {
        html += `  <h${lvl}><span class="num">${heading.prefix}</span> ${heading.text} <span class="reference">(${startDisplay}${endDisplay})</span></h${lvl}>\n`;
      }
    }
  }

  html += `</body>\n</html>`;
  return html;
}

// Generate XML export
function generateXMLExport(headings) {
  const groups = groupHeadingsByBook(headings);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<outline>
  <metadata>
    <generated>${new Date().toISOString()}</generated>
  </metadata>
  <books>
`;

  for (const group of groups) {
    xml += `    <book code="${group.bookCode}" name="${escapeXML(group.bookName)}">\n`;
    for (const heading of group.headings) {
      xml += `      <heading level="${heading.level}" start="${heading.startRef}" end="${heading.endRef}">
        <text>${escapeXML(heading.text)}</text>
        <reference>${heading.reference}</reference>
      </heading>\n`;
    }
    xml += `    </book>\n`;
  }

  xml += `  </books>\n</outline>`;
  return xml;
}

// Generate JSON export (grouped by book; import handles both flat and grouped)
function generateJSONExport(headings) {
  const groups = groupHeadingsByBook(headings);
  const data = groups.map(group => ({
    book: group.bookCode,
    bookName: group.bookName,
    headings: group.headings.map(h => ({
      text: h.text,
      level: h.level,
      reference: h.reference,
      book: h.book,
      ...(h.notes       ? { notes:       h.notes       } : {}),
      ...(h.tag         ? { tag:         h.tag         } : {}),
      ...(h.themeKey    ? { themeKey:    h.themeKey    } : {}),
      ...(h.plotElement ? { plotElement: h.plotElement } : {}),
      startRef: h.startRef,
      endRef: h.endRef
    }))
  }));
  return JSON.stringify(data, null, 2);
}

// ── Traditional outline numbering ────────────────────────────────────────────

function toRoman(n) {
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
  let r = '';
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { r += syms[i]; n -= vals[i]; }
  }
  return r;
}

function outlinePrefix(level, n) {
  switch (level) {
    case 1: return toRoman(n) + '.';
    case 2: return String.fromCharCode(64 + n) + '.';        // A.
    case 3: return n + '.';                                   // 1.
    case 4: return String.fromCharCode(96 + n) + '.';        // a.
    case 5: return '(' + n + ')';                             // (1)
    case 6: return '(' + String.fromCharCode(96 + n) + ')';  // (a)
    default: return n + '.';
  }
}

// ── Outline numbering ─────────────────────────────────────────────────────────

// Dispatcher: delegates to the active format's numbering function.
function assignOutlineNumbers(groups) {
  if (currentOutlineFormat === 'thematic') return assignOutlineNumbersThematic(groups);
  if (currentOutlineFormat === 'plot')     return assignOutlineNumbersPlot(groups);
  return assignOutlineNumbersTraditional(groups);
}

// Traditional format: I. / A. / 1. / a. / (1) / (a)
// Counters reset at the start of each book and when ascending levels.
function assignOutlineNumbersTraditional(groups) {
  return groups.map(group => {
    const counters = [0, 0, 0, 0, 0, 0];
    const headings = group.headings.map(h => {
      if (h.tag) return { ...h, prefix: '' }; // non-outline: no numbering, no counter changes
      const idx = h.level - 1;
      counters[idx]++;
      for (let i = idx + 1; i < 6; i++) counters[i] = 0;
      return { ...h, prefix: outlinePrefix(h.level, counters[idx]) };
    });
    return { ...group, headings };
  });
}

// Thematic format: A / B / C… with subscripts for recurring themes (A₁, A₂…).
// Letter rank (order of first appearance) determines visual indentation level.
// For Psalms, subscript counts reset at each chapter (psalm) boundary.
function assignOutlineNumbersThematic(groups) {
  // Pass 1: build global theme-letter mapping (consistent across all books/chapters).
  const themeOrderMap = new Map();   // themeKey → letterIdx
  let nextIdx = 0;
  for (const g of groups) {
    for (const h of g.headings) {
      if (h.tag || !h.themeKey) continue;
      if (!themeOrderMap.has(h.themeKey)) themeOrderMap.set(h.themeKey, nextIdx++);
    }
  }
  // Pass 1b: count totals per-chapter for Psalms; globally for other books.
  const psalmChapterTotals = new Map(); // chapter → Map<themeKey, count>
  const globalTotals = new Map();        // themeKey → count (non-Psalms only)
  for (const g of groups) {
    for (const h of g.headings) {
      if (h.tag || !h.themeKey) continue;
      if (g.bookCode === 'Ps') {
        const ch = h.reference.split('.')[1];
        if (!psalmChapterTotals.has(ch)) psalmChapterTotals.set(ch, new Map());
        const m = psalmChapterTotals.get(ch);
        m.set(h.themeKey, (m.get(h.themeKey) || 0) + 1);
      } else {
        globalTotals.set(h.themeKey, (globalTotals.get(h.themeKey) || 0) + 1);
      }
    }
  }
  // Pass 2: assign prefix and displayLevel.
  // Psalms: running counts reset per chapter. Others: global running counts.
  const globalRunning = new Map();
  const psalmRunning = new Map();
  let currentPsalmChapter = null;
  return groups.map(group => ({
    ...group,
    headings: group.headings.map(h => {
      if (h.tag) return { ...h, prefix: '' };
      if (!h.themeKey) return { ...h, prefix: '\u2014', displayLevel: 1 };
      const letterIdx = themeOrderMap.get(h.themeKey);
      const letter    = String.fromCharCode(65 + (letterIdx % 26));
      const displayLevel = Math.min(letterIdx + 1, 6);
      let total, current;
      if (group.bookCode === 'Ps') {
        const ch = h.reference.split('.')[1];
        if (ch !== currentPsalmChapter) {
          psalmRunning.clear();
          currentPsalmChapter = ch;
        }
        const chMap = psalmChapterTotals.get(ch) || new Map();
        total = chMap.get(h.themeKey) || 1;
        current = (psalmRunning.get(h.themeKey) || 0) + 1;
        psalmRunning.set(h.themeKey, current);
      } else {
        total = globalTotals.get(h.themeKey) || 1;
        current = (globalRunning.get(h.themeKey) || 0) + 1;
        globalRunning.set(h.themeKey, current);
      }
      const sub = total > 1 ? toSubscriptNum(current) : '';
      return { ...h, prefix: letter + sub, displayLevel };
    }),
  }));
}

// Plot analysis format: Initial Situation / Conflict / Transforming Action /
//                       Resolution / Final Situation — flat level-1 indentation.
function assignOutlineNumbersPlot(groups) {
  // Pass 1: count total occurrences of each plotElement across all books.
  const plotTotalCounts = new Map();
  for (const g of groups) {
    for (const h of g.headings) {
      if (h.tag || !h.plotElement) continue;
      plotTotalCounts.set(h.plotElement, (plotTotalCounts.get(h.plotElement) || 0) + 1);
    }
  }
  // Pass 2: assign prefix (element name, optionally with counter).
  const plotRunning = new Map();
  return groups.map(group => ({
    ...group,
    headings: group.headings.map(h => {
      if (h.tag) return { ...h, prefix: '' };
      if (!h.plotElement) return { ...h, prefix: '\u2014', displayLevel: 1 };
      const labelKey = PLOT_LABEL_KEYS[h.plotElement];
      const label    = i18n.t(labelKey);
      const total    = plotTotalCounts.get(h.plotElement) || 1;
      const current  = (plotRunning.get(h.plotElement) || 0) + 1;
      plotRunning.set(h.plotElement, current);
      const prefix = label + (total > 1 ? ` ${current}` : '');
      return { ...h, prefix, displayLevel: 1 };
    }),
  }));
}

// ── CRC-32 (required by ZIP) ──────────────────────────────────────────────────
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++)
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── Minimal ZIP writer (STORE – no compression) ───────────────────────────────
// files: [{name: string, data: string|Uint8Array}]
function makeZip(files) {
  const enc = new TextEncoder();
  const localBlocks = [];
  const centralRecs  = [];
  let localOffset = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const data = file.data instanceof Uint8Array ? file.data : enc.encode(file.data);
    const checksum = crc32(data);
    const size = data.length;

    // Local file header (30 bytes) + name + data
    const local = new Uint8Array(30 + nameBytes.length + size);
    const lv = new DataView(local.buffer);
    lv.setUint32(0,  0x04034b50, true); // signature
    lv.setUint16(4,  20, true);          // version needed
    lv.setUint16(6,  0,  true);          // flags
    lv.setUint16(8,  0,  true);          // compression: STORE
    lv.setUint16(10, 0,  true);          // mod time
    lv.setUint16(12, 0,  true);          // mod date
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, size, true);        // compressed size
    lv.setUint32(22, size, true);        // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);           // extra field length
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localBlocks.push(local);

    // Central directory record (46 bytes) + name
    const cdr = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdr.buffer);
    cv.setUint32(0,  0x02014b50, true);
    cv.setUint16(4,  20, true);
    cv.setUint16(6,  20, true);
    cv.setUint16(8,  0,  true);
    cv.setUint16(10, 0,  true);  // STORE
    cv.setUint16(12, 0,  true);
    cv.setUint16(14, 0,  true);
    cv.setUint32(16, checksum, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, localOffset, true);
    cdr.set(nameBytes, 46);
    centralRecs.push(cdr);

    localOffset += local.length;
  }

  const cdSize = centralRecs.reduce((s, r) => s + r.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0,  0x06054b50, true);
  ev.setUint16(4,  0, true);
  ev.setUint16(6,  0, true);
  ev.setUint16(8,  files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, localOffset, true);
  ev.setUint16(20, 0, true);

  const zip = new Uint8Array(localOffset + cdSize + 22);
  let pos = 0;
  for (const b of localBlocks) { zip.set(b, pos); pos += b.length; }
  for (const r of centralRecs)  { zip.set(r, pos); pos += r.length; }
  zip.set(eocd, pos);
  return zip;
}

// ── DOCX export ───────────────────────────────────────────────────────────────
function generateDocxExport(headings) {
  const x = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Heading styles: use Word's built-in heading style names so the Navigation
  // pane and TOC features work. w:qFormat surfaces them in the Quick Styles gallery.
  const H = [
    { ilvl:0, id:'Heading1', name:'heading 1', color:'5C2008', sz:40 },
    { ilvl:1, id:'Heading2', name:'heading 2', color:'7B3410', sz:32 },
    { ilvl:2, id:'Heading3', name:'heading 3', color:'A0522D', sz:28 },
    { ilvl:3, id:'Heading4', name:'heading 4', color:'C07840', sz:26 },
    { ilvl:4, id:'Heading5', name:'heading 5', color:'9E7B50', sz:24 },
    { ilvl:5, id:'Heading6', name:'heading 6', color:'8B8AA0', sz:22 },
  ];

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/word/document.xml"  ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml"    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"    Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
    <w:sz w:val="22"/>
  </w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="BookTitle">
    <w:name w:val="Book Title"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="480" w:after="120"/><w:jc w:val="left"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:b/><w:sz w:val="52"/>
      <w:color w:val="5C2008"/>
    </w:rPr>
  </w:style>
${H.map(h =>
`  <w:style w:type="paragraph" w:styleId="${h.id}">
    <w:name w:val="${h.name}"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:outlineLvl w:val="${h.ilvl}"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:b/><w:sz w:val="${h.sz}"/>
      <w:color w:val="${h.color}"/>
    </w:rPr>
  </w:style>`).join('\n')}
</w:styles>`;

  // Multilevel outline list: I. / A. / 1. / a. / (1) / (a)
  // One w:num per book group so counters restart for each book.
  const NUM_LVLS = [
    { fmt:'upperRoman',  text:'%1.',  left:360,  hang:360 },
    { fmt:'upperLetter', text:'%2.',  left:720,  hang:360 },
    { fmt:'decimal',     text:'%3.',  left:1080, hang:360 },
    { fmt:'lowerLetter', text:'%4.',  left:1440, hang:360 },
    { fmt:'decimal',     text:'(%5)', left:1800, hang:480 },
    { fmt:'lowerLetter', text:'(%6)', left:2160, hang:480 },
  ];

  const groups = groupHeadingsByBook(headings);

  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:multiLevelType w:val="multilevel"/>
${NUM_LVLS.map((l, i) =>
`    <w:lvl w:ilvl="${i}">
      <w:start w:val="1"/>
      <w:numFmt w:val="${l.fmt}"/>
      <w:lvlText w:val="${l.text}"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="${l.left}" w:hanging="${l.hang}"/></w:pPr>
    </w:lvl>`).join('\n')}
  </w:abstractNum>
${groups.map((_, i) =>
`  <w:num w:numId="${i + 1}">
    <w:abstractNumId w:val="0"/>
  </w:num>`).join('\n')}
</w:numbering>`;

  let paragraphs = `  <w:p>
    <w:pPr><w:pStyle w:val="BookTitle"/></w:pPr>
    <w:r><w:t>${x(i18n.t('exportDocTitle'))}</w:t></w:r>
  </w:p>\n`;

  groups.forEach((group, gi) => {
    const numId = gi + 1;
    paragraphs += `  <w:p>
    <w:pPr><w:pStyle w:val="BookTitle"/></w:pPr>
    <w:r><w:t>${x(group.bookName)}</w:t></w:r>
  </w:p>\n`;
    for (const h of group.headings) {
      const ref = h.endRef !== h.startRef
        ? `${db.formatReference(h.startRef)}\u2013${db.formatReference(h.endRef)}`
        : db.formatReference(h.startRef);
      if (h.tag) {
        const indentTwips = (h.level - 1) * 360;
        paragraphs += `  <w:p>
    <w:pPr><w:pStyle w:val="Normal"/><w:ind w:left="${indentTwips}"/></w:pPr>
    <w:r><w:rPr><w:i/><w:color w:val="888888"/></w:rPr>
      <w:t xml:space="preserve">${x(h.tag)} [${x(h.text)}] (${ref})</w:t>
    </w:r>
  </w:p>\n`;
      } else if (h.displayLevel !== undefined) {
        // Thematic or plot: use heading style for color/weight but no auto-numbering;
        // embed the computed prefix text directly in the paragraph.
        const lvl = h.displayLevel;
        const indentTwips = (lvl - 1) * 360;
        paragraphs += `  <w:p>
    <w:pPr>
      <w:pStyle w:val="${H[lvl - 1].id}"/>
      <w:ind w:left="${indentTwips}"/>
    </w:pPr>
    <w:r><w:t xml:space="preserve">${x(h.prefix)} ${x(h.text)} (${ref})</w:t></w:r>
  </w:p>\n`;
      } else {
        // Traditional: use Word's outline numbering via numPr
        paragraphs += `  <w:p>
    <w:pPr>
      <w:pStyle w:val="${H[h.level - 1].id}"/>
      <w:numPr><w:ilvl w:val="${h.level - 1}"/><w:numId w:val="${numId}"/></w:numPr>
    </w:pPr>
    <w:r><w:t xml:space="preserve">${x(h.text)} (${ref})</w:t></w:r>
  </w:p>\n`;
      }
    }
  });

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
${paragraphs}    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  return makeZip([
    { name: '[Content_Types].xml',          data: contentTypes  },
    { name: '_rels/.rels',                  data: rels          },
    { name: 'word/_rels/document.xml.rels', data: docRels       },
    { name: 'word/styles.xml',              data: stylesXml     },
    { name: 'word/numbering.xml',           data: numberingXml  },
    { name: 'word/document.xml',            data: documentXml   },
  ]);
}

// ── ODT export (LibreOffice) ──────────────────────────────────────────────────
function generateOdtExport(headings) {
  const x = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const mimetype = 'application/vnd.oasis.opendocument.text';

  // manifest lists all parts, including styles.xml which holds the outline-style
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="styles.xml"  manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;

  // styles.xml: defines the document outline-style used by all text:h elements.
  // The text:outline-style element must live in office:styles (not automatic-styles).
  const ODT_LEVELS = [
    { level:1, fmt:'I', prefix:'',  suffix:'.', before:'0cm',   width:'0.7cm' },
    { level:2, fmt:'A', prefix:'',  suffix:'.', before:'0.7cm', width:'0.7cm' },
    { level:3, fmt:'1', prefix:'',  suffix:'.', before:'1.4cm', width:'0.7cm' },
    { level:4, fmt:'a', prefix:'',  suffix:'.', before:'2.1cm', width:'0.7cm' },
    { level:5, fmt:'1', prefix:'(', suffix:')', before:'2.8cm', width:'0.9cm' },
    { level:6, fmt:'a', prefix:'(', suffix:')', before:'3.7cm', width:'0.9cm' },
  ];

  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  office:version="1.3">
  <office:styles>
    <text:outline-style style:name="Outline">
${ODT_LEVELS.map(l => {
  const pre = l.prefix ? ` style:num-prefix="${l.prefix}"` : '';
  return `      <text:outline-level-style text:level="${l.level}" style:num-format="${l.fmt}"${pre} style:num-suffix="${l.suffix}">
        <style:list-level-properties text:space-before="${l.before}" text:min-label-width="${l.width}"/>
      </text:outline-level-style>`;
}).join('\n')}
    </text:outline-style>
  </office:styles>
</office:document-styles>`;

  // Automatic styles in content.xml inherit from the built-in "Heading N" styles
  // so headings participate in the Navigator and Table of Contents.
  // Only color and size are overridden; spacing/indentation comes from the outline-style.
  const H_COLOR = ['#5C2008','#7B3410','#A0522D','#C07840','#9E7B50','#8B8AA0'];
  const H_SIZE  = ['16pt',   '14pt',   '13pt',   '12pt',   '11pt',   '10pt'  ];

  const autoStyles = H_COLOR.map((color, i) =>
`    <style:style style:name="H${i+1}" style:family="paragraph" style:parent-style-name="Heading ${i+1}">
      <style:text-properties fo:color="${color}" fo:font-size="${H_SIZE[i]}" fo:font-weight="bold"/>
    </style:style>`).join('\n');

  const pBtStyle =
`    <style:style style:name="P_BT" style:family="paragraph">
      <style:paragraph-properties fo:margin-top="18pt" fo:margin-bottom="8pt"/>
      <style:text-properties fo:font-size="20pt" fo:font-weight="bold" fo:color="#5C2008"/>
    </style:style>`;

  const taggedStyles = [1,2,3,4,5,6].map(lvl => {
    const marginCm = ((lvl - 1) * 0.7).toFixed(1);
    return `    <style:style style:name="P_TAGGED_L${lvl}" style:family="paragraph">
      <style:paragraph-properties fo:margin-left="${marginCm}cm" fo:border-left="0.08cm dashed #bbbbbb" fo:padding-left="0.2cm"/>
      <style:text-properties fo:font-style="italic" fo:color="#888888"/>
    </style:style>`;
  }).join('\n');

  const groups = groupHeadingsByBook(headings);
  let body = `    <text:p text:style-name="P_BT">${x(i18n.t('exportDocTitle'))}</text:p>\n`;
  for (const group of groups) {
    body += `    <text:p text:style-name="P_BT">${x(group.bookName)}</text:p>\n`;
    for (const h of group.headings) {
      const ref = h.endRef !== h.startRef
        ? `${db.formatReference(h.startRef)}\u2013${db.formatReference(h.endRef)}`
        : db.formatReference(h.startRef);
      // text:h + text:outline-level picks up the outline-style numbering automatically.
      // For thematic/plot headings (displayLevel set), use text:p to suppress auto-numbering
      // while still applying the H1–H6 visual style.
      if (h.tag) {
        body += `    <text:p text:style-name="P_TAGGED_L${h.level}">${x(h.tag)} [${x(h.text)}] (${ref})</text:p>\n`;
      } else if (h.displayLevel !== undefined) {
        const lvl = h.displayLevel;
        body += `    <text:p text:style-name="H${lvl}">${x(h.prefix)} ${x(h.text)} (${ref})</text:p>\n`;
      } else {
        body += `    <text:h text:outline-level="${h.level}" text:style-name="H${h.level}">${x(h.text)} (${ref})</text:h>\n`;
      }
    }
  }

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  office:version="1.3">
  <office:automatic-styles>
${autoStyles}
${pBtStyle}
${taggedStyles}
  </office:automatic-styles>
  <office:body>
    <office:text>
${body}    </office:text>
  </office:body>
</office:document-content>`;

  // mimetype MUST be the first ZIP entry, stored uncompressed (ODF spec requirement)
  return makeZip([
    { name: 'mimetype',              data: mimetype  },
    { name: 'META-INF/manifest.xml', data: manifest  },
    { name: 'styles.xml',            data: stylesXml },
    { name: 'content.xml',           data: content   },
  ]);
}

// Open a print-ready page in a new tab so the user can save as PDF
async function exportAsPDF(headings) {
  const groups = assignOutlineNumbers(groupHeadingsByBook(headings));
  let body = '';
  for (const group of groups) {
    body += `<p class="book-title">${escapeXML(group.bookName)}</p>\n`;
    for (const heading of group.headings) {
      const startDisplay = db.formatReference(heading.startRef);
      const endDisplay = heading.endRef !== heading.startRef ?
        `\u2013${db.formatReference(heading.endRef)}` : '';
      const lvl = heading.displayLevel ?? heading.level;
      body += `<h${lvl}><span class="num">${escapeXML(heading.prefix)}</span> ${escapeXML(heading.text)} <span class="ref">(${startDisplay}${endDisplay})</span></h${lvl}>\n`;
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${i18n.t('exportDocTitle')}</title>
  <style>
    body       { font-family: Georgia, serif; max-width: 760px; margin: 40px auto; padding: 0 24px; line-height: 1.7; color: #222; }
    .book-title{ font-size: 20pt; font-weight: 700; color: #5C2008; border-bottom: 2px solid #8B4513; padding-bottom: 6px; margin-top: 48px; }
    h1  { font-size: 16pt; color: #5C2008; } h2 { font-size: 14pt; color: #7B3410; }
    h3  { font-size: 13pt; color: #A0522D; } h4 { font-size: 12pt; color: #C07840; }
    h5  { font-size: 11pt; color: #9E7B50; } h6 { font-size: 10pt; color: #8B8AA0; }
    .num{ font-variant-numeric: tabular-nums; margin-right: 4px; }
    .ref{ color: #999; font-size: 0.82em; font-family: monospace; }
    @media print {
      body { margin: 0; max-width: none; }
      @page { margin: 2cm; }
      .book-title { page-break-before: always; }
      .book-title:first-of-type { page-break-before: avoid; }
    }
  </style>
  <script>window.addEventListener('load', () => window.print());<\/script>
</head>
<body>
  <p class="book-title" style="margin-top:0;">${i18n.t('exportDocTitle')}</p>
  <p><em>${i18n.t('exportGeneratedOn', new Date().toLocaleDateString())}</em></p>
  ${body}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  await chrome.tabs.create({ url });
  // Revoke after enough time for the tab to load
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Escape XML special characters
function escapeXML(str) {
  return str.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Get full book name from code
function getBookName(code) {
  const names = {
    'Gen': 'Genesis', 'Exod': 'Exodus', 'Lev': 'Leviticus', 'Num': 'Numbers',
    'Deut': 'Deuteronomy', 'Josh': 'Joshua', 'Judg': 'Judges', 'Ruth': 'Ruth',
    '1Sam': '1 Samuel', '2Sam': '2 Samuel', '1Kgs': '1 Kings', '2Kgs': '2 Kings',
    '1Chr': '1 Chronicles', '2Chr': '2 Chronicles', 'Ezra': 'Ezra', 'Neh': 'Nehemiah',
    'Esth': 'Esther', 'Job': 'Job', 'Ps': 'Psalms', 'Prov': 'Proverbs',
    'Eccl': 'Ecclesiastes', 'Song': 'Song of Solomon', 'Isa': 'Isaiah', 'Jer': 'Jeremiah',
    'Lam': 'Lamentations', 'Ezek': 'Ezekiel', 'Dan': 'Daniel', 'Hos': 'Hosea',
    'Joel': 'Joel', 'Amos': 'Amos', 'Obad': 'Obadiah', 'Jonah': 'Jonah',
    'Mic': 'Micah', 'Nah': 'Nahum', 'Hab': 'Habakkuk', 'Zeph': 'Zephaniah',
    'Hag': 'Haggai', 'Zech': 'Zechariah', 'Mal': 'Malachi',
    'Matt': 'Matthew', 'Mark': 'Mark', 'Luke': 'Luke', 'John': 'John',
    'Acts': 'Acts', 'Rom': 'Romans', '1Cor': '1 Corinthians', '2Cor': '2 Corinthians',
    'Gal': 'Galatians', 'Eph': 'Ephesians', 'Phil': 'Philippians', 'Col': 'Colossians',
    '1Thess': '1 Thessalonians', '2Thess': '2 Thessalonians', '1Tim': '1 Timothy',
    '2Tim': '2 Timothy', 'Titus': 'Titus', 'Phlm': 'Philemon', 'Heb': 'Hebrews',
    'Jas': 'James', '1Pet': '1 Peter', '2Pet': '2 Peter', '1John': '1 John',
    '2John': '2 John', '3John': '3 John', 'Jude': 'Jude', 'Rev': 'Revelation'
  };
  return names[code] || code;
}

// Handle import file selection
async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const statusDiv = document.getElementById('importStatus');
  statusDiv.style.display = 'block';
  statusDiv.style.color = '#666';
  statusDiv.textContent = i18n.t('readingFile');
  
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Support three formats:
    //  1. Wrapped backup: { version, sets, headings: [{book, headings:[...]}] }
    //  2. Grouped export: [{book, headings:[...]}]
    //  3. Flat export:    [{text, level, ...}]
    const groupedOrFlat = (!Array.isArray(data) && Array.isArray(data.headings))
      ? data.headings
      : data;

    if (!Array.isArray(groupedOrFlat)) {
      throw new Error(i18n.t('invalidJson'));
    }

    const flatHeadings = (groupedOrFlat.length > 0 && Array.isArray(groupedOrFlat[0].headings))
      ? groupedOrFlat.flatMap(group => group.headings.map(h => ({ ...h, book: h.book || group.book })))
      : groupedOrFlat;

    statusDiv.textContent = i18n.t('importProgress', flatHeadings.length);

    // Validate and import each heading
    let imported = 0;
    let skipped = 0;

    for (const item of flatHeadings) {
      // Validate required fields
      if (!item.text || !item.level || !item.reference || !item.book) {
        skipped++;
        continue;
      }
      
      // Add to database
      try {
        await db.addHeading({
          book: item.book,
          reference: item.reference,
          level: item.level,
          text: item.text,
          notes: item.notes || '',
          setId: currentSetId
        });
        imported++;
      } catch (err) {
        console.error('Error importing heading:', err);
        skipped++;
      }
    }
    
    // Show success message
    statusDiv.style.color = '#2e7d32';
    statusDiv.style.backgroundColor = '#e8f5e9';
    statusDiv.textContent = skipped > 0
      ? i18n.t('importSuccessWithSkipped', imported, skipped)
      : i18n.t('importSuccess', imported);
    
    // Reload headings
    await loadHeadings();
    
    // Close modal after 2 seconds
    setTimeout(() => {
      closeImportModal();
    }, 2000);
    
  } catch (error) {
    console.error('Import error:', error);
    statusDiv.style.color = '#d32f2f';
    statusDiv.style.backgroundColor = '#ffebee';
    statusDiv.textContent = i18n.t('importError', error.message);
  }
  
  // Reset file input
  event.target.value = '';
}

// ── Reorder mode ──────────────────────────────────────────────────────────────

function enterReorderMode() {
  if (isReorderMode || !currentHeadings.length) return;
  isReorderMode = true;
  document.body.classList.add('reorder-mode');
  document.getElementById('reorderBanner').style.display = 'flex';
  document.getElementById('reorderBtn').style.display = 'none';
  // Make every rendered item draggable
  document.querySelectorAll('#headingsList .heading-item')
    .forEach(el => { el.draggable = true; });
}

function exitReorderMode() {
  isReorderMode = false;
  document.body.classList.remove('reorder-mode');
  document.getElementById('reorderBanner').style.display = 'none';
  document.getElementById('reorderBtn').style.display = '';
  document.querySelectorAll('#headingsList .heading-item')
    .forEach(el => { el.draggable = false; el.classList.remove('drag-over-above', 'dragging'); });
}

async function saveOrder() {
  const orderedIds = [...document.querySelectorAll('#headingsList .heading-item')]
    .map(el => parseInt(el.dataset.id, 10));
  try {
    await db.savePositions(orderedIds);
    exitReorderMode();
    await loadHeadings();
  } catch (err) {
    console.error('Error saving order:', err);
    alert(i18n.t('errorSavingOrder', err.message));
  }
}

async function cancelReorder() {
  exitReorderMode();
  await loadHeadings();
}

// Start the application
init();
