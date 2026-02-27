# Bible Outliner - Browser Extension

A Brave/Chrome extension for creating hierarchical outlines of Bible books with verse references. Features a side panel interface that integrates with multiple Bible websites.

## Features

- **Hierarchical Outlines** — Create headings at 6 levels (H1–H6) with traditional outline numbering (I., A., 1., a., (1), (a))
- **Multi-site Integration** — Works with StepBible, YouVersion, Bible Gateway, and Parabible (see [Supported Sites](#supported-sites))
- **Floating "+ Heading" Button** — Hover over any verse and click "+ Heading" to add a heading at that verse (StepBible, YouVersion, Bible Gateway)
- **Smart Navigation** — Click any heading in the panel to jump to that verse on whichever Bible site is currently open
- **Auto-detected Bible Version** — Navigation links use the version currently shown in your active tab (e.g., NIV, ESV, KJV) and persist it across sessions
- **Automatic Verse Ranges** — Ranges are calculated from each heading to the next heading of equal or higher level
- **Mid-verse Support** — Mark a heading as mid-verse to append a "b" suffix to the reference (e.g., Gen.1.1b)
- **Persistent Storage** — All data stored locally in IndexedDB (survives browser restarts, never leaves your device)
- **Reorder Headings** — Manually drag and drop headings into any order; order is saved to the database
- **Notes** — Add optional notes to any heading
- **Multiple Export Formats** — Export to Markdown, HTML, XML, JSON, Word (.docx), LibreOffice (.odt), and PDF
- **Copy to Clipboard** — Copy the outline as plain text directly to the clipboard (no download needed)
- **Import** — Re-import a previously exported JSON file to restore or merge headings
- **Grouped Books** — 1–2 Samuel, 1–2 Kings, 1–2 Chronicles, and Ezra–Nehemiah are treated as single outlines
- **Multiple Outline Sets** — Create any number of named outline sets (e.g. "English Study", "Vietnamese Translation"), each tagged with a language; switch the active set instantly from the set selector bar
- **Google Drive Backup** — Optional automatic backup to Google Drive in addition to local Downloads
- **Multi-language Interface** — Switch the panel language via Settings; supports English, Spanish, French, German, and Vietnamese — including all 66 Bible book names

## Supported Sites

| Site | Click heading → navigate | Hover verse → add heading |
|------|:---:|:---:|
| [StepBible.org](https://www.stepbible.org/) | ✓ | ✓ |
| [YouVersion (bible.com)](https://www.bible.com/) | ✓ | ✓ |
| [Bible Gateway](https://www.biblegateway.com/) | ✓ | ✓ |
| [Parabible](https://parabible.com/) | ✓ | — |

Navigation always opens the same site that is currently active in your browser tab, using the translation already shown there.

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

1. Navigate to any [supported Bible site](#supported-sites)
2. Click the Bible Outliner extension icon in the toolbar
3. The side panel opens on the right

### Creating Headings

**Method 1: Floating Button (StepBible, YouVersion, Bible Gateway)**
- Hover over any verse — a "+ Heading" button appears above it
- Click it; the side panel opens the Add Heading modal pre-filled with that verse reference

**Method 2: Manual Entry**
1. Click **+ Add Heading** in the side panel
2. Select the book, chapter, and verse
3. Optionally check **Mid-verse** to append a "b" suffix
4. Choose a heading level (H1–H6)
5. Enter the heading text and optional notes
6. Click **Save Heading**

### Navigating with Headings

- Click any heading in the panel to navigate to that verse on the currently-open Bible site
- The translation shown in your active tab is preserved — switching to a different version on the site will be reflected the next time you click a heading
- The current heading is highlighted with a yellow background

### Verse Ranges

Ranges are calculated automatically:
- A heading's range starts at its verse reference
- The range extends until the next heading of **equal or higher level**
- For mid-verse headings, the preceding heading at the same level ends at the "a" half of the same verse
- Ranges are displayed in parentheses: `(1:1–2:5)`
- Grouped books (e.g., 1–2 Samuel) extend ranges across both books

### Outline Sets

The **set selector bar** (between the header and the book selector) shows the active outline set. Each set has a name and an associated language tag (ISO 639-1).

**Switching sets:** Choose a different set in the selector; the headings list instantly reflects the active set.

**Managing sets:** Click the ⚙ button next to the set selector to open the **Manage Outlines** modal:
- Each row shows the set name and its language (rendered in the current interface language).
- Click ✏ **Edit** to rename a set or change its language.
- Click 🗑 **Delete** to permanently remove a set and all its headings (the last remaining set cannot be deleted).
- Use the **New Outline** form to add a set — enter a name and pick a language from the ~70 ISO 639-1 options.

All headings added while a set is active are stored under that set. Exports and copies include only the headings of the currently active set.

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

## Languages

The side panel interface can be switched to any supported language via the **Settings** panel. The selected language is persisted across sessions.
*Note: Spanish, French, and German are AI-generated locales and have not been checked.

| Language | Code | Book names source |
|---|---|---|
| English | `en` | Standard (KJV / OSIS) |
| Spanish | `es` | Reina-Valera (RVR) |
| French | `fr` | Louis Segond / TOB |
| German | `de` | Luther-Bibel |
| Vietnamese | `vi` | Kinh Thánh 1934 |

All 66 Bible book names are translated in each language. Language names in the selector are always shown in their native script and are never translated.

The extension name and description shown in the Chrome Web Store follow your **browser's** language setting (via Chrome's standard `__MSG__` mechanism), independent of the in-panel language selector.

## File Structure

```
biblia-outline/
├── manifest.json           # Extension configuration (Manifest V3)
├── background.js           # Service worker for cross-component messaging
├── content.js              # Runs on all supported sites — hover button, verse detection
├── content.css             # Styles for the hover button
├── sidepanel.html          # Side panel UI
├── sidepanel.css           # Side panel styles
├── sidepanel.js            # Side panel logic and all export generators
├── db.js                   # IndexedDB database operations
├── i18n.js                 # Runtime i18n loader (load/t/localizeDOM)
├── backup.js               # Local Downloads backup logic
├── drive.js                # Google Drive backup logic
├── _locales/
│   ├── en/messages.json    # English strings (~185 keys)
│   ├── es/messages.json    # Spanish
│   ├── fr/messages.json    # French
│   ├── de/messages.json    # German
│   └── vi/messages.json    # Vietnamese
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Database Schema

**OutlineSets table (IndexedDB, v3):**

| Field | Description |
|---|---|
| `id` | Auto-incrementing unique identifier |
| `name` | User-defined set name (e.g., "English Study") |
| `lang` | ISO 639-1 language code (e.g., `en`, `vi`) |

**Headings table (IndexedDB):**

| Field | Description |
|---|---|
| `id` | Auto-incrementing unique identifier |
| `book` | OSIS book code (e.g., `Gen`, `Matt`) |
| `reference` | Full OSIS reference (e.g., `Gen.1.1`, `Gen.1.1b`) |
| `level` | Heading level 1–6 |
| `text` | Heading text |
| `notes` | Optional notes (may be empty) |
| `setId` | Foreign key into `outlineSets.id` |
| `sortKey` | Computed sort key for canonical ordering |
| `position` | Integer position for manual ordering (optional) |
| `createdAt` | Timestamp |
| `updatedAt` | Timestamp |

## Book Codes

Standard OSIS abbreviations are used throughout.

**Old Testament:** Gen, Exod, Lev, Num, Deut, Josh, Judg, Ruth, 1Sam, 2Sam, 1Kgs, 2Kgs, 1Chr, 2Chr, Ezra, Neh, Esth, Job, Ps, Prov, Eccl, Song, Isa, Jer, Lam, Ezek, Dan, Hos, Joel, Amos, Obad, Jonah, Mic, Nah, Hab, Zeph, Hag, Zech, Mal

**New Testament:** Matt, Mark, Luke, John, Acts, Rom, 1Cor, 2Cor, Gal, Eph, Phil, Col, 1Thess, 2Thess, 1Tim, 2Tim, Titus, Phlm, Heb, Jas, 1Pet, 2Pet, 1John, 2John, 3John, Jude, Rev

## Technical Notes

### Multi-site Integration

The content script (`content.js`) detects the current hostname at load time and activates the appropriate adapter for each site:

| Site | Verse element | Reference format |
|------|--------------|-----------------|
| StepBible | `<a class="verseLink" name="Gen.1.1">` | OSIS (`Gen.1.1`) |
| YouVersion | `<span data-usfm="GEN.1.1">` | USFM → converted to OSIS |
| Bible Gateway | `<span class="text Gen-1-1">` | Hyphen class → converted to OSIS |
| Parabible | *(no verse elements)* | URL path parsed for context |

Hover events inject a floating "+ Heading" button (suppressed on Parabible); clicks send an `OPEN_HEADING_MODAL_WITH_VERSE` message directly to the side panel. All references are stored internally in OSIS format regardless of which site they were captured on.

### Navigation URL Building

When a heading is clicked, `sidepanel.js` reads the active tab's URL to determine the current site and translation, then builds the appropriate navigation URL:

- **StepBible:** `https://www.stepbible.org/?q=version=ESV|reference=Gen.1&options=NVHUG`
- **YouVersion:** `https://www.bible.com/bible/59/GEN.1.ESV` (numeric version ID preserved from URL)
- **Bible Gateway:** `https://www.biblegateway.com/passage/?search=Genesis%201&version=ESV`
- **Parabible:** `https://parabible.com/Genesis/1`

The detected version is persisted to IndexedDB settings so it is remembered when switching between tabs.

### OSIS Reference Format

References follow the OSIS standard (`Gen.1.1`). Mid-verse headings append a `b` suffix (`Gen.1.1b`); the preceding heading's end reference is automatically set to the `a` half (`Gen.1.1a`). Sort keys are zero-padded strings so lexicographic order matches canonical order, with suffixes sorting correctly: `…001` < `…001a` < `…001b` < `…002`.

### DOCX and ODT Generation

Both formats are generated entirely in JavaScript without any server calls — DOCX as a ZIP of Open XML parts, ODT as a ZIP of ODF XML files. No third-party libraries are used.

**DOCX** uses Word's built-in heading styles (Heading 1–6) with `w:qFormat` so headings appear in the Navigation pane and can drive a Table of Contents. Outline numbering (I./A./1./a./(1)/(a)) is defined in `word/numbering.xml` as a multilevel list; each book group gets its own `w:num` instance so counters restart at I. for each book. Numbers are generated by Word, not embedded as text.

**ODT** uses `text:h` elements with `text:outline-level` (the proper ODF heading element) rather than generic paragraphs. Outline numbering is defined in `styles.xml` as a `text:outline-style`, which LibreOffice applies automatically to all headings. Automatic paragraph styles inherit from LibreOffice's built-in "Heading N" styles so headings appear in the Navigator and TOC generator. Note: ODT outline numbering is continuous across books — per-book restart is not supported by the ODF `text:outline-style` mechanism.

### Cross-Browser Compatibility

Built for Brave; works in any Chromium-based browser:
- Brave
- Chrome
- Edge
- Opera

## Troubleshooting

**Side panel won't open:** Click the extension icon in the toolbar while on any supported Bible site.

**"+ Heading" button doesn't appear on hover:** Refresh the page after installing or reloading the extension. Note: Parabible does not support the hover button (no verse-level elements on that site).

**Headings not saving:** Open the browser console (F12 → Console) to check for errors. IndexedDB may be disabled in private/incognito mode.

**Navigation lands on the wrong translation:** The extension reads the version from your currently active tab URL. If the version code cannot be parsed from the URL, it falls back to the last saved version or ESV. Make sure you have visited the target site with the desired version at least once.

**Export not downloading:** Check if your browser is blocking downloads and allow them in browser settings.

## Privacy

- All outline data is stored locally in your browser's IndexedDB
- No outline data is ever sent to any server
- No activity tracking or analytics
- Optional Google Drive backup sends data only to your own Google Drive account

## License

MIT License — free to use, modify, and distribute.

## Credits

Created for biblical study and exegesis. Works with [StepBible.org](https://www.stepbible.org/), [YouVersion (bible.com)](https://www.bible.com/), [Bible Gateway](https://www.biblegateway.com/), and [Parabible](https://parabible.com/).

Heading color palettes sourced from **[Open Color](https://yeun.github.io/open-color/)** by Yeun Ju Kim — MIT License.
