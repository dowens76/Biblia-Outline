# Bible Outline Builder - Browser Extension

A powerful Brave/Chrome extension for creating hierarchical outlines of Bible books with verse references. Features a side panel interface that integrates seamlessly with StepBible.org.

## Features

✨ **Hierarchical Outlines** - Create headings at 6 levels (H1-H6)  
📖 **StepBible Integration** - Click verses at StepBible.org to add headings  
🎯 **Smart Navigation** - Click headings to jump to verses in StepBible  
📊 **Automatic Ranges** - Verse ranges calculated based on heading hierarchy  
💾 **Persistent Storage** - Data stored in IndexedDB (browser database)  
📤 **Multiple Export Formats** - Export to HTML, XML, and JSON  
🎨 **Beautiful UI** - Clean, professional side panel design  
🔄 **Real-time Sync** - Side panel highlights current verse location

## Installation

### For Brave/Chrome

1. **Download the extension files** to a folder on your computer

2. **Open Extension Management:**
   - Brave: `brave://extensions`
   - Chrome: `chrome://extensions`

3. **Enable Developer Mode:**
   - Toggle "Developer mode" in the top-right corner

4. **Load the Extension:**
   - Click "Load unpacked"
   - Select the folder containing the extension files
   - The extension icon should appear in your toolbar

5. **Create Icons (Optional):**
   - The extension needs icon files in an `icons` folder
   - Create simple 16x16, 48x48, and 128x128 PNG icons
   - Or download free Bible icons from sites like [Flaticon](https://www.flaticon.com/)

## Usage

### Opening the Side Panel

1. Navigate to [StepBible.org](https://www.stepbible.org/)
2. Click the "Bible Outline Builder" extension icon
3. The side panel will open on the right side

### Creating Headings

**Method 1: Manual Entry**
1. Click the "**+ Add Heading**" button in the side panel
2. Select the book from the dropdown (66 books in canonical order)
3. Enter the chapter and verse numbers
4. Choose a heading level (H1-H6)
5. Type your heading text
6. Click "Save Heading"

**Method 2: From StepBible (Future Enhancement)**
- Click on any verse link at StepBible.org
- The side panel will highlight the corresponding heading
- *(Note: Direct heading creation from verse clicks requires additional development)*

### Navigating with Headings

- **Click any heading** in the side panel to navigate to that verse in StepBible
- The StepBible page will scroll to the verse automatically
- The current heading is highlighted with a **yellow background**

### Verse Ranges

Verse ranges are calculated automatically:
- A heading's range starts at its verse
- The range continues until the next heading of **equal or higher level**
- Ranges are displayed in parentheses: `(1:1–2:5)`

### Exporting Outlines

1. Click the "**Export**" button
2. Choose your format:
   - **HTML** - Formatted webpage with nested headings
   - **XML** - Structured data with metadata
   - **JSON** - Machine-readable format with references

#### Export Format Examples

**JSON:**
```json
[
  {
    "text": "Creation of the World",
    "level": 1,
    "reference": "Gen.1.1",
    "book": "Gen",
    "startRef": "Gen.1.1",
    "endRef": "Gen.2.3"
  }
]
```

**XML:**
```xml
<heading level="1" book="Gen" start="Gen.1.1" end="Gen.2.3">
  <text>Creation of the World</text>
  <reference>Gen.1.1</reference>
</heading>
```

## File Structure

```
bible-outline-extension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker for message passing
├── content.js            # Runs on StepBible.org pages
├── content.css           # Styles for StepBible integration
├── sidepanel.html        # Side panel UI
├── sidepanel.css         # Side panel styles
├── sidepanel.js          # Side panel logic
├── db.js                 # IndexedDB database operations
└── icons/                # Extension icons (create these)
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Database Schema

The extension uses IndexedDB with the following structure:

**Headings Table:**
- `id` - Auto-incrementing unique identifier
- `book` - Book code (e.g., "Gen", "Matt")
- `reference` - Full reference (e.g., "Gen.1.1")
- `level` - Heading level (1-6)
- `text` - Heading text
- `sortKey` - Computed sort key for ordering
- `createdAt` - Timestamp
- `updatedAt` - Timestamp

## Book Codes

The extension uses standard book abbreviations:

**Old Testament:** Gen, Exod, Lev, Num, Deut, Josh, Judg, Ruth, 1Sam, 2Sam, 1Kgs, 2Kgs, 1Chr, 2Chr, Ezra, Neh, Esth, Job, Ps, Prov, Eccl, Song, Isa, Jer, Lam, Ezek, Dan, Hos, Joel, Amos, Obad, Jonah, Mic, Nah, Hab, Zeph, Hag, Zech, Mal

**New Testament:** Matt, Mark, Luke, John, Acts, Rom, 1Cor, 2Cor, Gal, Eph, Phil, Col, 1Thess, 2Thess, 1Tim, 2Tim, Titus, Phlm, Heb, Jas, 1Pet, 2Pet, 1John, 2John, 3John, Jude, Rev

## Technical Notes

### Why IndexedDB instead of SQLite?

Browser extensions cannot use SQLite directly. IndexedDB is the browser's native database system and provides:
- Persistent storage that survives browser restarts
- Fast indexed queries
- Transaction support
- Async API for non-blocking operations

### StepBible Integration

The extension looks for `<a class="verseLink">` elements with `name` attributes in the format `"Book.Chapter.Verse"`. This matches StepBible's current HTML structure.

### Cross-Browser Compatibility

While built for Brave, this extension works in any Chromium-based browser:
- ✅ Brave
- ✅ Chrome
- ✅ Edge
- ✅ Opera

## Future Enhancements

- 🎯 Direct heading creation by clicking verse links
- 📝 Inline editing of headings
- 🔍 Search/filter headings
- 📋 Copy heading structure
- 🌐 Sync across devices
- 📱 Mobile support (if browsers support side panels)
- 🎨 Custom color schemes
- 📖 Support for other Bible websites

## Troubleshooting

**Side panel won't open:**
- Make sure you're on stepbible.org
- Click the extension icon in the toolbar
- Try refreshing the page

**Headings not saving:**
- Check browser console for errors (F12 → Console)
- IndexedDB may be disabled in private/incognito mode

**StepBible navigation not working:**
- Ensure the content script is running (check console)
- StepBible may have changed their HTML structure

**Export not downloading:**
- Check if your browser is blocking downloads
- Allow downloads in browser settings

## Privacy

This extension:
- ✅ Stores all data locally in your browser
- ✅ Does NOT send data to any server
- ✅ Does NOT track your activity
- ✅ Works completely offline (after StepBible page loads)

## License

MIT License - Free to use, modify, and distribute.

## Credits

Created for biblical study and exegesis. Designed to work seamlessly with [StepBible.org](https://www.stepbible.org/), an excellent free online Bible study tool.

---

**Happy Bible studying!** 📖✨
