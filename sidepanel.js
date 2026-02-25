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

// Initialize
async function init() {
  await db.init();
  setupEventListeners();
  await loadCurrentBook();

  // Set up backup UI and run auto-backup if due
  await initBackup();
  await initDrive();
  await maybeAutoBackup();

  // Listen for messages from background/content scripts
  chrome.runtime.onMessage.addListener(handleMessage);
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
  
  // Current book dropdown
  document.getElementById('currentBookSelect').addEventListener('change', async (e) => {
    currentBook = e.target.value || null;
    await loadHeadings();
  });

  // Go-to-book button
  document.getElementById('goToBookBtn').addEventListener('click', async () => {
    if (!currentBook) return;
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      const url = `https://www.stepbible.org/?q=version=ESV|reference=${currentBook}.1&options=NVHUG`;
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

// Load headings for current book (or grouped books)
async function loadHeadings() {
  if (!currentBook) return;

  try {
    const books = getBooksToLoad(currentBook);
    currentHeadings = await db.getHeadingsByBooks(books);
    applyPositionSort(currentHeadings);
    const fallbackEndRef = db.getLastVerseRef(books[books.length - 1]);
    const headingsWithRanges = db.calculateVerseRanges(currentHeadings, fallbackEndRef);
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
  div.className = `heading-item level-${heading.level}`;
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
  
  div.innerHTML = `
    <span class="drag-handle" aria-hidden="true">&#8801;</span>
    <span class="heading-text"><span class="outline-num">${heading.prefix || ''}</span> ${heading.text}</span>
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

// Navigate to verse in StepBible
async function navigateToVerse(reference) {
  console.log('Navigating to verse:', reference);
  
  // Parse the reference
  const parts = reference.split('.');
  const book = parts[0];
  const chapter = parts[1];
  const verse = parts[2];
  
  try {
    // Get the active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      // First, navigate to the chapter (in case it's not loaded)
      const stepBibleUrl = `https://www.stepbible.org/?q=version=ESV|reference=${book}.${chapter}&options=NVHUG`;
      console.log('Navigating to:', stepBibleUrl);
      
      // Update the tab URL
      await chrome.tabs.update(tabs[0].id, { url: stepBibleUrl });
      
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

// Open add heading modal
function openAddHeadingModal() {
  editingHeadingId = null;
  document.getElementById('modalTitle').textContent = 'Add Heading';
  
  // Set defaults
  if (currentBook) {
    document.getElementById('bookSelect').value = currentBook;
  }
  document.getElementById('chapterInput').value = '1';
  document.getElementById('verseInput').value = '1';
  document.getElementById('midVerseCheck').checked = false;
  document.getElementById('headingText').value = '';
  document.getElementById('headingNotes').value = '';

  // Reset level selection
  document.querySelectorAll('.level-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.level === '1');
  });
  selectedHeadingLevel = 1;

  document.getElementById('headingModal').classList.add('active');
  document.getElementById('headingText').focus();
}

// Open add heading modal with pre-filled verse reference
function openAddHeadingModalWithVerse(reference) {
  editingHeadingId = null;
  document.getElementById('modalTitle').textContent = 'Add Heading';

  const { book, chapter, verse } = db.parseReference(reference);

  document.getElementById('bookSelect').value = book;
  document.getElementById('chapterInput').value = chapter;
  document.getElementById('verseInput').value = verse;
  document.getElementById('midVerseCheck').checked = false;
  document.getElementById('headingText').value = '';
  document.getElementById('headingNotes').value = '';

  // Reset level selection
  document.querySelectorAll('.level-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.level === '1');
  });
  selectedHeadingLevel = 1;

  document.getElementById('headingModal').classList.add('active');
  document.getElementById('headingText').focus();
}

// Open edit heading modal
function openEditHeadingModal(heading) {
  editingHeadingId = heading.id;
  document.getElementById('modalTitle').textContent = 'Edit Heading';
  
  // Parse reference
  const { book, chapter, verse, midVerse } = db.parseReference(heading.reference);

  document.getElementById('bookSelect').value = book;
  document.getElementById('chapterInput').value = chapter;
  document.getElementById('verseInput').value = verse;
  document.getElementById('midVerseCheck').checked = midVerse;
  document.getElementById('headingText').value = heading.text;
  document.getElementById('headingNotes').value = heading.notes || '';
  
  // Set level
  document.querySelectorAll('.level-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.level === heading.level.toString());
  });
  selectedHeadingLevel = heading.level;
  
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

  console.log('Save heading called:', { book, chapter, verse, midVerse, text, notes, level: selectedHeadingLevel });

  if (!book || !chapter || !verse || !text) {
    alert('Please fill in all fields');
    return;
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
        notes
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
        notes
      });
      console.log('Heading added successfully with id:', id);
    }
    
    closeModal();
    await loadHeadings();
    console.log('Headings reloaded');
  } catch (error) {
    console.error('Error saving heading:', error);
    console.error('Error details:', error.message, error.stack);
    alert('Error saving heading: ' + error.message);
  }
}

// Delete heading
async function deleteHeading(id) {
  if (!confirm('Are you sure you want to delete this heading?')) {
    return;
  }
  
  try {
    await db.deleteHeading(id);
    await loadHeadings();
  } catch (error) {
    console.error('Error deleting heading:', error);
    alert('Error deleting heading. Please try again.');
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
      rawHeadings = await db.getHeadingsByBooks(getBooksToLoad(currentBook));
    } else {
      rawHeadings = await db.getAllHeadings();
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
    alert('Error exporting outline: ' + error.message);
  }
}

// Generate Markdown export
function generateMarkdownExport(headings) {
  const groups = assignOutlineNumbers(groupHeadingsByBook(headings));

  let md = `# Bible Outline\n\n*Generated on ${new Date().toLocaleDateString()}*\n\n`;

  for (const group of groups) {
    md += `---\n\n**${group.bookName}**\n\n`;
    for (const heading of group.headings) {
      const startDisplay = db.formatReference(heading.startRef);
      const endDisplay = heading.endRef !== heading.startRef
        ? `\u2013${db.formatReference(heading.endRef)}` : '';
      const hashes = '#'.repeat(heading.level);
      md += `${hashes} ${heading.prefix} ${heading.text} *(${startDisplay}${endDisplay})*\n\n`;
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
      const pad = indent[heading.level - 1] || '';
      text += `${pad}${heading.prefix} ${heading.text} (${startDisplay}${endDisplay})\n`;
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
      rawHeadings = await db.getHeadingsByBooks(getBooksToLoad(currentBook));
    } else {
      rawHeadings = await db.getAllHeadings();
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

    span.textContent = 'Copied!';
    setTimeout(() => { span.textContent = 'Copy to Clipboard'; }, 2000);
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    span.textContent = 'Copy failed';
    setTimeout(() => { span.textContent = 'Copy to Clipboard'; }, 2000);
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
  <title>Bible Outline</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
    .book-title { font-size: 1.5em; font-weight: 700; color: #5C2008; border-bottom: 3px solid #8B4513; padding-bottom: 8px; margin-top: 48px; }
    h1 { color: #5C2008; } h2 { color: #7B3410; } h3 { color: #A0522D; }
    h4 { color: #C07840; } h5 { color: #9E7B50; } h6 { color: #8B8AA0; }
    .num { font-variant-numeric: tabular-nums; margin-right: 4px; }
    .reference { color: #999; font-size: 0.9em; font-family: monospace; }
  </style>
</head>
<body>
  <h1 style="border-bottom:3px solid #8B4513;padding-bottom:10px;">Bible Outline</h1>
  <p><em>Generated on ${new Date().toLocaleDateString()}</em></p>
`;

  for (const group of groups) {
    html += `  <p class="book-title">${group.bookName}</p>\n`;
    for (const heading of group.headings) {
      const startDisplay = db.formatReference(heading.startRef);
      const endDisplay = heading.endRef !== heading.startRef ?
        `\u2013${db.formatReference(heading.endRef)}` : '';
      html += `  <h${heading.level}><span class="num">${heading.prefix}</span> ${heading.text} <span class="reference">(${startDisplay}${endDisplay})</span></h${heading.level}>\n`;
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

// Returns a copy of groups with a .prefix string added to each heading.
// Counters reset at the start of each book and when ascending levels.
function assignOutlineNumbers(groups) {
  return groups.map(group => {
    const counters = [0, 0, 0, 0, 0, 0];
    const headings = group.headings.map(h => {
      const idx = h.level - 1;
      counters[idx]++;
      for (let i = idx + 1; i < 6; i++) counters[i] = 0;
      return { ...h, prefix: outlinePrefix(h.level, counters[idx]) };
    });
    return { ...group, headings };
  });
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
    <w:r><w:t>Bible Outline</w:t></w:r>
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
      paragraphs += `  <w:p>
    <w:pPr>
      <w:pStyle w:val="${H[h.level - 1].id}"/>
      <w:numPr><w:ilvl w:val="${h.level - 1}"/><w:numId w:val="${numId}"/></w:numPr>
    </w:pPr>
    <w:r><w:t xml:space="preserve">${x(h.text)} (${ref})</w:t></w:r>
  </w:p>\n`;
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

  const groups = groupHeadingsByBook(headings);
  let body = `    <text:p text:style-name="P_BT">Bible Outline</text:p>\n`;
  for (const group of groups) {
    body += `    <text:p text:style-name="P_BT">${x(group.bookName)}</text:p>\n`;
    for (const h of group.headings) {
      const ref = h.endRef !== h.startRef
        ? `${db.formatReference(h.startRef)}\u2013${db.formatReference(h.endRef)}`
        : db.formatReference(h.startRef);
      // text:h + text:outline-level picks up the outline-style numbering automatically
      body += `    <text:h text:outline-level="${h.level}" text:style-name="H${h.level}">${x(h.text)} (${ref})</text:h>\n`;
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
      body += `<h${heading.level}><span class="num">${escapeXML(heading.prefix)}</span> ${escapeXML(heading.text)} <span class="ref">(${startDisplay}${endDisplay})</span></h${heading.level}>\n`;
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Bible Outline</title>
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
  <p class="book-title" style="margin-top:0;">Bible Outline</p>
  <p><em>Generated on ${new Date().toLocaleDateString()}</em></p>
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
  statusDiv.textContent = 'Reading file...';
  
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (!Array.isArray(data)) {
      throw new Error('Invalid JSON format. Expected an array.');
    }

    // Support both flat [{text,level,...}] and grouped [{book,headings:[...]}] formats
    const flatHeadings = (data.length > 0 && Array.isArray(data[0].headings))
      ? data.flatMap(group => group.headings.map(h => ({ ...h, book: h.book || group.book })))
      : data;

    statusDiv.textContent = `Importing ${flatHeadings.length} heading(s)...`;

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
          text: item.text
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
    statusDiv.textContent = `✓ Successfully imported ${imported} heading(s)${skipped > 0 ? ` (${skipped} skipped)` : ''}`;
    
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
    statusDiv.textContent = `✗ Error: ${error.message}`;
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
    alert('Error saving order: ' + err.message);
  }
}

async function cancelReorder() {
  exitReorderMode();
  await loadHeadings();
}

// Start the application
init();
