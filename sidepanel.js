// sidepanel.js - Main logic for the side panel

let currentBook = null;
let currentHeadings = [];
let selectedHeadingLevel = 1;
let editingHeadingId = null;

// Initialize
async function init() {
  await db.init();
  setupEventListeners();
  await loadCurrentBook();
  
  // Listen for messages from background/content scripts
  chrome.runtime.onMessage.addListener(handleMessage);
}

// Setup event listeners
function setupEventListeners() {
  // Add heading button
  document.getElementById('addHeadingBtn').addEventListener('click', openAddHeadingModal);
  
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
  
  // Export
  document.getElementById('exportBtn').addEventListener('click', openExportModal);
  document.getElementById('closeExportModal').addEventListener('click', closeExportModal);
  document.getElementById('exportHtmlBtn').addEventListener('click', () => exportOutline('html'));
  document.getElementById('exportXmlBtn').addEventListener('click', () => exportOutline('xml'));
  document.getElementById('exportJsonBtn').addEventListener('click', () => exportOutline('json'));
  
  // Import
  document.getElementById('importBtn').addEventListener('click', openImportModal);
  document.getElementById('closeImportModal').addEventListener('click', closeImportModal);
  document.getElementById('importJsonBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', handleImportFile);
  
  // Click outside modal to close
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
        document.getElementById('currentBook').textContent = getBookName(currentBook);
        await loadHeadings();
      }
    }
  } catch (error) {
    console.error('Error loading current book:', error);
  }
}

// Load headings for current book
async function loadHeadings() {
  if (!currentBook) return;
  
  try {
    currentHeadings = await db.getHeadingsByBook(currentBook);
    const headingsWithRanges = db.calculateVerseRanges(currentHeadings);
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
  
  headings.forEach(heading => {
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
  
  // Format the verse range
  const startDisplay = db.formatReference(heading.startRef);
  const endDisplay = heading.endRef !== heading.startRef ? 
    ` – ${db.formatReference(heading.endRef)}` : '';
  
  div.innerHTML = `
    <span class="heading-text">${heading.text}</span>
    <span class="heading-reference">(${startDisplay}${endDisplay})</span>
    <div class="heading-actions">
      <button class="action-btn edit" title="Edit">✏️</button>
      <button class="action-btn delete" title="Delete">🗑️</button>
    </div>
  `;
  
  // Click to navigate
  div.addEventListener('click', (e) => {
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
  document.getElementById('headingText').value = '';
  
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
  
  // Parse the reference (format: "Book.Chapter.Verse")
  const parts = reference.split('.');
  const book = parts[0];
  const chapter = parts[1];
  const verse = parts[2];
  
  // Set the form values
  document.getElementById('bookSelect').value = book;
  document.getElementById('chapterInput').value = chapter;
  document.getElementById('verseInput').value = verse;
  document.getElementById('headingText').value = '';
  
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
  const { book, chapter, verse } = db.parseReference(heading.reference);
  
  document.getElementById('bookSelect').value = book;
  document.getElementById('chapterInput').value = chapter;
  document.getElementById('verseInput').value = verse;
  document.getElementById('headingText').value = heading.text;
  
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
  const text = document.getElementById('headingText').value.trim();
  
  console.log('Save heading called:', { book, chapter, verse, text, level: selectedHeadingLevel });
  
  if (!book || !chapter || !verse || !text) {
    alert('Please fill in all fields');
    return;
  }
  
  const reference = `${book}.${chapter}.${verse}`;
  console.log('Reference:', reference);
  
  try {
    if (editingHeadingId) {
      // Update existing
      console.log('Updating heading:', editingHeadingId);
      await db.updateHeading(editingHeadingId, {
        book,
        reference,
        level: selectedHeadingLevel,
        text
      });
      console.log('Heading updated successfully');
    } else {
      // Add new
      console.log('Adding new heading...');
      const id = await db.addHeading({
        book,
        reference,
        level: selectedHeadingLevel,
        text
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
    const allHeadings = await db.getAllHeadings();
    console.log('Retrieved headings for export:', allHeadings);
    
    const headingsWithRanges = db.calculateVerseRanges(allHeadings);
    console.log('Headings with ranges:', headingsWithRanges);
    
    let content;
    let filename;
    let mimeType;
    
    if (format === 'html') {
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

// Generate HTML export
function generateHTMLExport(headings) {
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bible Outline</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
    h1 { color: #333; border-bottom: 3px solid #667eea; padding-bottom: 10px; }
    h2 { color: #444; margin-top: 30px; }
    h3 { color: #555; margin-top: 25px; }
    h4 { color: #666; margin-top: 20px; }
    h5 { color: #777; margin-top: 15px; }
    h6 { color: #888; margin-top: 10px; }
    .reference { color: #999; font-size: 0.9em; font-family: monospace; }
  </style>
</head>
<body>
  <h1>Bible Outline</h1>
  <p><em>Generated on ${new Date().toLocaleDateString()}</em></p>
`;
  
  headings.forEach(heading => {
    const startDisplay = db.formatReference(heading.startRef);
    const endDisplay = heading.endRef !== heading.startRef ? 
      `–${db.formatReference(heading.endRef)}` : '';
    
    html += `  <h${heading.level}>${heading.text} <span class="reference">(${startDisplay}${endDisplay})</span></h${heading.level}>\n`;
  });
  
  html += `</body>
</html>`;
  
  return html;
}

// Generate XML export
function generateXMLExport(headings) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<outline>
  <metadata>
    <generated>${new Date().toISOString()}</generated>
  </metadata>
  <headings>
`;
  
  headings.forEach(heading => {
    xml += `    <heading level="${heading.level}" book="${heading.book}" start="${heading.startRef}" end="${heading.endRef}">
      <text>${escapeXML(heading.text)}</text>
      <reference>${heading.reference}</reference>
    </heading>
`;
  });
  
  xml += `  </headings>
</outline>`;
  
  return xml;
}

// Generate JSON export
function generateJSONExport(headings) {
  const data = headings.map(heading => ({
    text: heading.text,
    level: heading.level,
    reference: heading.reference,
    book: heading.book,
    startRef: heading.startRef,
    endRef: heading.endRef
  }));
  
  return JSON.stringify(data, null, 2);
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
      throw new Error('Invalid JSON format. Expected an array of headings.');
    }
    
    statusDiv.textContent = `Importing ${data.length} heading(s)...`;
    
    // Validate and import each heading
    let imported = 0;
    let skipped = 0;
    
    for (const item of data) {
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

// Start the application
init();
