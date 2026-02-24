# StepBible Integration Testing Guide

## New Features

### 1. ✨ Smart Chapter Navigation
**What it does:** Clicking a heading now navigates to the correct chapter AND highlights the verse, even if the chapter isn't currently displayed.

**How it works:**
- Clicking a heading sends the browser to: `https://www.stepbible.org/?q=version=ESV|reference=Book.Chapter&options=NVHUG`
- After page loads (1.5 seconds), it scrolls to and highlights the specific verse
- Uses ESV version by default

**Test it:**
1. Open side panel at StepBible
2. Create headings in different chapters (e.g., Gen 1:1, Gen 2:5, Gen 3:15)
3. Click on Gen 2:5 heading
4. Browser should navigate to Genesis 2 and highlight verse 5

### 2. ✨ Improved Verse Click Detection
**What it does:** Much better detection of verse clicks using multiple methods and event delegation.

**How it works:**
- Uses event delegation (no need to attach listeners to each verse)
- Tries multiple ways to find verse references:
  - `name` attribute
  - `data-verse` attribute
  - `id` attribute
  - Text content with context
- Works with dynamically loaded content
- Extensive console logging for debugging

**Test it:**
1. Go to https://www.stepbible.org/?q=version=ESV|reference=Gen.1&options=NVHUG
2. Open browser console (F12)
3. Look for: "Bible Outline Builder content script loaded"
4. **Alt + Click** any verse number
5. Console should show: "Verse clicked:", "Creating heading from verse:"
6. Modal should open with that verse pre-filled

---

## Testing Checklist

### Test 1: Verse Click Detection

**Preparation:**
- Load extension
- Go to StepBible Genesis 1
- Open browser console (F12)
- Open side panel

**Steps:**
1. Look for console message: `Bible Outline Builder content script loaded`
2. Look for: `Current book: Gen`
3. **Alt + Click** on verse 1
4. Check console for: `Verse clicked: [element]`
5. Check console for: `Extracted reference: Gen.1.1`
6. Check console for: `Creating heading from verse: Gen.1.1`
7. Modal should open with Gen 1:1 pre-filled
8. Verse should flash green

**If it doesn't work:**
- Check console for errors
- Check if the verse element was detected: Look for "Verse clicked" message
- Try **Shift + Right-Click** instead

### Test 2: Chapter Navigation

**Preparation:**
- Have some headings in different chapters
- Example: Gen 1:1, Gen 2:5, Gen 3:15

**Steps:**
1. Make sure you're on Genesis 1
2. Click heading for Gen 3:15 in side panel
3. Browser should navigate to: `https://www.stepbible.org/?q=version=ESV|reference=Gen.3&options=NVHUG`
4. After 1.5 seconds, page should scroll to verse 15
5. Verse 15 should be highlighted in yellow

**What to check:**
- URL changes to correct chapter
- Page actually loads
- After delay, verse is highlighted
- Console shows: `Navigating to verse: Gen.3.15`
- Console shows: `Navigating to: https://www.stepbible.org/...`

### Test 3: Different Verse Link Formats

StepBible might use different HTML structures. Test these scenarios:

**Scenario A: Standard links**
```html
<a class="verseLink" name="Gen.1.1">1</a>
```

**Scenario B: Data attributes**
```html
<span class="v" data-verse="Gen.1.1">1</span>
```

**Scenario C: ID attribute**
```html
<span id="Gen.1.1" class="verse">1</span>
```

The content script should handle all three!

### Test 4: Console Debugging

**What to look for in console:**

**On page load:**
```
Bible Outline Builder content script loaded
StepBible page already loaded, Bible Outline Builder ready
Current book: Gen
```

**On Alt + Click:**
```
Verse clicked: <element>
Extracted reference: Gen.1.5
Creating heading from verse: Gen.1.5
Sending CREATE_HEADING_FROM_VERSE message: Gen.1.5
```

**On heading click in panel:**
```
Navigating to verse: Gen.2.5
Navigating to: https://www.stepbible.org/?q=version=ESV|reference=Gen.2&options=NVHUG
```

**After navigation:**
```
Content script received message: {type: "SCROLL_TO_VERSE", reference: "Gen.2.5"}
Scrolling to verse: Gen.2.5
Found verse element, scrolling...
```

---

## Troubleshooting

### Issue: Alt + Click doesn't work

**Possible causes:**
1. Content script not loaded
2. Verse links use different HTML structure
3. JavaScript error

**Debug steps:**
1. Check console for "Bible Outline Builder content script loaded"
2. If not present, extension didn't inject properly
3. Reload extension and refresh StepBible page
4. Check console for any errors (red text)

**Manual test:**
Open console and run:
```javascript
document.addEventListener('click', (e) => {
  if (e.altKey) {
    console.log('Alt+Click detected on:', e.target);
    console.log('Parent:', e.target.parentElement);
    console.log('Classes:', e.target.className);
  }
}, true);
```

Then Alt+Click a verse and see what element is detected.

### Issue: Navigation doesn't change chapter

**Possible causes:**
1. Missing tabs permission
2. Chrome blocking navigation
3. Wrong URL format

**Debug steps:**
1. Check manifest has "tabs" and "activeTab" permissions
2. Look for error in console: "Cannot access tabs"
3. Check the constructed URL in console
4. Try manually visiting the URL to see if it works

### Issue: Verse doesn't highlight after navigation

**Possible causes:**
1. Timing issue (page not loaded yet)
2. Verse selector not matching
3. Content script not receiving message

**Debug steps:**
1. Increase the timeout from 1500ms to 3000ms:
   ```javascript
   setTimeout(async () => { ... }, 3000);
   ```
2. Check console for "Scrolling to verse:" message
3. Check console for "Verse element not found" message
4. If not found, inspect the verse HTML to see what selector to use

---

## How to Get Verse HTML Structure

To see what HTML StepBible actually uses:

1. Go to StepBible
2. Right-click on a verse number → Inspect
3. Look at the HTML
4. Note the class names, attributes, etc.
5. Share with me so I can update the selectors

Example:
```html
<a class="verseLink" name="Gen.1.1" id="v-Gen.1.1">
  <span class="verseNumber">1</span>
</a>
```

---

## Quick Diagnostic

Run this in the console on StepBible:

```javascript
// Test 1: Find verse links
console.log('Verse links found:', document.querySelectorAll('.verseLink, .v, .verse, [data-verse]').length);

// Test 2: Find first verse
const first = document.querySelector('.verseLink, .v, .verse, [data-verse]');
console.log('First verse element:', first);
console.log('Attributes:', {
  name: first?.getAttribute('name'),
  dataVerse: first?.getAttribute('data-verse'),
  id: first?.id,
  classes: first?.className
});

// Test 3: Check if content script loaded
console.log('Content script loaded:', typeof getCurrentBook === 'function');
```

This will tell us exactly what selectors to use!

---

## Expected Behavior Summary

| Action | Expected Result |
|--------|----------------|
| Alt + Click verse | Modal opens with verse pre-filled, verse flashes green |
| Shift + Right-Click verse | Same as Alt + Click |
| Regular click verse | Side panel highlights corresponding heading (if exists) |
| Click heading (same chapter) | Scrolls to verse, highlights yellow |
| Click heading (different chapter) | Navigates to chapter, then scrolls and highlights |
| Click heading when side panel closed | Still navigates to verse |

---

## Next Steps

1. **Test** on actual StepBible.org
2. **Open console** and look for log messages
3. **Try Alt + Click** on a verse
4. **Share** any errors or unexpected behavior
5. **Inspect** a verse element and share the HTML if clicks don't work

I've added extensive logging so we can see exactly where things fail! 🔍
