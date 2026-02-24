# Biblia Outline - Browser Extension

A Brave/Chrome extension for creating hierarchical outlines of Bible books with verse references. Features a side panel interface that integrates with StepBible.org.

## Features

**Hierarchical Outlines** — Create headings at 6 levels (H1–H6) with traditional outline numbering (I., A., 1., a., (1), (a))
**StepBible Integration** — Hover over any verse at StepBible.org and click "+ Heading" to add a heading at that verse
**Smart Navigation** — Click any heading in the panel to jump to that verse in StepBible
**Automatic Verse Ranges** — Ranges are calculated from each heading to the next heading of equal or higher level
**Mid-verse Support** — Mark a heading as mid-verse to append a "b" suffix to the reference (e.g., Gen.1.1b)
**Persistent Storage** — All data stored locally in IndexedDB (survives browser restarts, never leaves your device)
**Reorder Headings** — Manually drag and drop headings into any order; order is saved to the database
**Notes** — Add optional notes to any heading
**Multiple Export Formats** — Export to Markdown, HTML, XML, JSON, Word (.docx), LibreOffice (.odt), and PDF
**Copy to Clipboard** — Copy the outline as plain text directly to the clipboard (no download needed)
**Import** — Re-import a previously exported JSON file to restore or merge headings
**Grouped Books** — 1–2 Samuel, 1–2 Kings, 1–2 Chronicles, and Ezra–Nehemiah are treated as single outlines

## Installation

### For Brave/Chrome

1. **Download the extension files** to a folder on your computer

2. **Open Extension Management:**
   - Brave: `brave://extensions`
   - Chrome: `chrome://extensions`

3. **Enable Developer Mode** — toggle it in the top-right corner

4. **Load the Extension:**
   - Click "Load unpacked"
   - Select the folder containing the extension files
   - The extension icon should appear in your toolbar

## Usage

### Opening the Side Panel

1. Navigate to [StepBible.org](https://www.stepbible.org/)
2. Click the Biblia Outline extension icon in the toolbar
3. The side panel opens on the right

### Creating Headings

**Method 1: From StepBible (recommended)**
- Hover over any verse at StepBible.org — a "+ Heading" button appears
- Click it; the side panel opens the Add Heading modal pre-filled with that verse reference

**Method 2: Manual Entry**
1. Click **+ Add Heading** in the side panel
2. Select the book, chapter, and verse
3. Optionally check **Mid-verse** to append a "b" suffix
4. Choose a heading level (H1–H6)
5. Enter the heading text and optional notes
6. Click **Save Heading**

### Navigating with Headings

- Click any heading in the panel to navigate to that verse in StepBible
- The current heading is highlighted with a yellow background

### Verse Ranges

Ranges are calculated automatically:
- A heading's range starts at its verse reference
- The range extends until the next heading of **equal or higher level**
- For mid-verse headings, the preceding heading at the same level ends at the "a" half of the same verse
- Ranges are displayed in parentheses: `(1:1–2:5)`
- Grouped books (e.g., 1–2 Samuel) extend ranges across both books

### Reordering Headings

1. Click **Reorder** in the header
2. Drag headings to the desired order
3. Click **Save Order** to persist, or **Cancel** to discard

### Exporting and Copying

Click **Export** to open the export modal. Choose scope first:
- **Entire outline** — all books in the database
- **Current book only** — only the book currently shown in the panel

Then choose a format:

| Button | Format | Notes |
|---|---|---|
| Copy to Clipboard | Plain text | Indented, outline-numbered; no file download |
| Export as Markdown | `.md` | Heading levels as `#` markers |
| Export as HTML | `.html` | Styled webpage |
| Export as XML | `.xml` | Structured data |
| Export as JSON | `.json` | Machine-readable; used for Import |
| Export as Word | `.docx` | Microsoft Word |
| Export as LibreOffice | `.odt` | LibreOffice Writer |
| Export as PDF | `.pdf` | Print-ready PDF via browser |

All export formats include traditional outline numbering (I., A., 1., a., (1), (a)).

### Importing

Click **Import** and select a JSON file previously exported from this extension. Headings are merged into the existing database.

## File Structure

```
biblia-outline/
├── manifest.json       # Extension configuration (Manifest V3)
├── background.js       # Service worker for cross-component messaging
├── content.js          # Runs on StepBible.org — hover button, verse detection
├── content.css         # Styles for the StepBible hover button
├── sidepanel.html      # Side panel UI
├── sidepanel.css       # Side panel styles
├── sidepanel.js        # Side panel logic and all export generators
├── db.js               # IndexedDB database operations
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Database Schema

**Headings table (IndexedDB):**

| Field | Description |
|---|---|
| `id` | Auto-incrementing unique identifier |
| `book` | OSIS book code (e.g., `Gen`, `Matt`) |
| `reference` | Full OSIS reference (e.g., `Gen.1.1`, `Gen.1.1b`) |
| `level` | Heading level 1–6 |
| `text` | Heading text |
| `notes` | Optional notes (may be empty) |
| `sortKey` | Computed sort key for canonical ordering |
| `position` | Integer position for manual ordering (optional) |
| `createdAt` | Timestamp |
| `updatedAt` | Timestamp |

## Book Codes

Standard OSIS abbreviations are used throughout.

**Old Testament:** Gen, Exod, Lev, Num, Deut, Josh, Judg, Ruth, 1Sam, 2Sam, 1Kgs, 2Kgs, 1Chr, 2Chr, Ezra, Neh, Esth, Job, Ps, Prov, Eccl, Song, Isa, Jer, Lam, Ezek, Dan, Hos, Joel, Amos, Obad, Jonah, Mic, Nah, Hab, Zeph, Hag, Zech, Mal

**New Testament:** Matt, Mark, Luke, John, Acts, Rom, 1Cor, 2Cor, Gal, Eph, Phil, Col, 1Thess, 2Thess, 1Tim, 2Tim, Titus, Phlm, Heb, Jas, 1Pet, 2Pet, 1John, 2John, 3John, Jude, Rev

## Technical Notes

### Why IndexedDB?

Browser extensions cannot use SQLite. IndexedDB is the browser's built-in database and provides persistent, indexed, transactional storage with an async API.

### StepBible Integration

The content script looks for `<a class="verseLink">` elements with `name` attributes in `Book.Chapter.Verse` format, matching StepBible's current HTML structure. Hover events inject a floating "+ Heading" button; clicks send an `OPEN_HEADING_MODAL_WITH_VERSE` message directly to the side panel.

### OSIS Reference Format

References follow the OSIS standard (`Gen.1.1`). Mid-verse headings append a `b` suffix (`Gen.1.1b`); the preceding heading's end reference is automatically set to the `a` half (`Gen.1.1a`). Sort keys are zero-padded strings so lexicographic order matches canonical order, with suffixes sorting correctly: `…001` < `…001a` < `…001b` < `…002`.

### DOCX and ODT Generation

Both formats are generated entirely in JavaScript without any server calls — DOCX as a ZIP of Open XML parts, ODT as a ZIP of ODF XML files. No third-party libraries are used.

### Cross-Browser Compatibility

Built for Brave; works in any Chromium-based browser:
- Brave
- Chrome
- Edge
- Opera

## Troubleshooting

**Side panel won't open:** Make sure you're on stepbible.org and click the extension icon in the toolbar.

**"+ Heading" button doesn't appear on hover:** Refresh the StepBible page after installing or reloading the extension.

**Headings not saving:** Open the browser console (F12 → Console) to check for errors. IndexedDB may be disabled in private/incognito mode.

**StepBible navigation not working:** The content script may not be running — check the console. StepBible may have updated their HTML structure.

**Export not downloading:** Check if your browser is blocking downloads and allow them in browser settings.

**ODT won't open in LibreOffice:** Ensure you are using an export from the current version of the extension.

## Privacy

- All data is stored locally in your browser
- No data is sent to any server
- No activity tracking
- Works completely offline after the StepBible page loads

## License

MIT License — free to use, modify, and distribute.

## Credits

Created for biblical study and exegesis. Designed to work with [StepBible.org](https://www.stepbible.org/), an excellent free online Bible study tool.
