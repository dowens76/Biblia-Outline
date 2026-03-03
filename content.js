// content.js - Runs on supported Bible sites

console.log('Bible Outline Builder content script loaded');

// ── Site detection ────────────────────────────────────────────────────────────

const CURRENT_SITE = (() => {
  const h = window.location.hostname;
  if (h.includes('stepbible.org'))    return 'stepbible';
  if (h.includes('biblegateway.com')) return 'biblegateway';
  // Check parabible.com before bible.com — "parabible.com" contains "bible.com" as a substring
  if (h.includes('parabible.com'))    return 'parabible';
  if (h.includes('bible.com'))        return 'youversion';
  return 'unknown';
})();

// ── Book code maps ────────────────────────────────────────────────────────────

// YouVersion uses USFM 3-letter codes; OSIS uses different abbreviations
const USFM_TO_OSIS = {
  GEN:'Gen', EXO:'Exod', LEV:'Lev', NUM:'Num', DEU:'Deut',
  JOS:'Josh', JDG:'Judg', RUT:'Ruth', '1SA':'1Sam', '2SA':'2Sam',
  '1KI':'1Kgs', '2KI':'2Kgs', '1CH':'1Chr', '2CH':'2Chr',
  EZR:'Ezra', NEH:'Neh', EST:'Esth', JOB:'Job', PSA:'Ps',
  PRO:'Prov', ECC:'Eccl', SNG:'Song', ISA:'Isa', JER:'Jer',
  LAM:'Lam', EZK:'Ezek', DAN:'Dan', HOS:'Hos', JOL:'Joel',
  AMO:'Amos', OBA:'Obad', JON:'Jonah', MIC:'Mic', NAM:'Nah',
  HAB:'Hab', ZEP:'Zeph', HAG:'Hag', ZEC:'Zech', MAL:'Mal',
  MAT:'Matt', MRK:'Mark', LUK:'Luke', JHN:'John', ACT:'Acts',
  ROM:'Rom', '1CO':'1Cor', '2CO':'2Cor', GAL:'Gal', EPH:'Eph',
  PHP:'Phil', COL:'Col', '1TH':'1Thess', '2TH':'2Thess',
  '1TI':'1Tim', '2TI':'2Tim', TIT:'Titus', PHM:'Phlm',
  HEB:'Heb', JAS:'Jas', '1PE':'1Pet', '2PE':'2Pet',
  '1JN':'1John', '2JN':'2John', '3JN':'3John', JUD:'Jude', REV:'Rev'
};

// Reverse: OSIS → USFM (used for scrollToVerse on YouVersion)
const OSIS_TO_USFM = Object.fromEntries(
  Object.entries(USFM_TO_OSIS).map(([u, o]) => [o, u])
);

// Full English name → OSIS (used for getCurrentContext on Parabible URL parsing)
const NAME_TO_OSIS = {
  'Genesis':'Gen', 'Exodus':'Exod', 'Leviticus':'Lev', 'Numbers':'Num',
  'Deuteronomy':'Deut', 'Joshua':'Josh', 'Judges':'Judg', 'Ruth':'Ruth',
  '1 Samuel':'1Sam', '2 Samuel':'2Sam', '1 Kings':'1Kgs', '2 Kings':'2Kgs',
  '1 Chronicles':'1Chr', '2 Chronicles':'2Chr', 'Ezra':'Ezra', 'Nehemiah':'Neh',
  'Esther':'Esth', 'Job':'Job', 'Psalms':'Ps', 'Psalm':'Ps', 'Proverbs':'Prov',
  'Ecclesiastes':'Eccl', 'Song of Solomon':'Song', 'Isaiah':'Isa', 'Jeremiah':'Jer',
  'Lamentations':'Lam', 'Ezekiel':'Ezek', 'Daniel':'Dan', 'Hosea':'Hos',
  'Joel':'Joel', 'Amos':'Amos', 'Obadiah':'Obad', 'Jonah':'Jonah', 'Micah':'Mic',
  'Nahum':'Nah', 'Habakkuk':'Hab', 'Zephaniah':'Zeph', 'Haggai':'Hag',
  'Zechariah':'Zech', 'Malachi':'Mal', 'Matthew':'Matt', 'Mark':'Mark',
  'Luke':'Luke', 'John':'John', 'Acts':'Acts', 'Romans':'Rom',
  '1 Corinthians':'1Cor', '2 Corinthians':'2Cor', 'Galatians':'Gal',
  'Ephesians':'Eph', 'Philippians':'Phil', 'Colossians':'Col',
  '1 Thessalonians':'1Thess', '2 Thessalonians':'2Thess',
  '1 Timothy':'1Tim', '2 Timothy':'2Tim', 'Titus':'Titus', 'Philemon':'Phlm',
  'Hebrews':'Heb', 'James':'Jas', '1 Peter':'1Pet', '2 Peter':'2Pet',
  '1 John':'1John', '2 John':'2John', '3 John':'3John', 'Jude':'Jude',
  'Revelation':'Rev'
};

// ── Verse element detection ───────────────────────────────────────────────────

// Returns the nearest verse element at or above `el`, or null
function findVerseElement(el) {
  if (CURRENT_SITE === 'parabible') return null;

  if (CURRENT_SITE === 'youversion') {
    // Walk up the DOM looking for an element with data-usfm
    let node = el;
    for (let i = 0; i < 8; i++) {
      if (!node) break;
      if (node.dataset && node.dataset.usfm) return node;
      node = node.parentElement;
    }
    return null;
  }

  if (CURRENT_SITE === 'biblegateway') {
    // Walk up looking for a span whose class includes "text Book-Ch-V"
    let node = el;
    for (let i = 0; i < 8; i++) {
      if (!node) break;
      if (node.tagName === 'SPAN' && node.className &&
          /\btext [\w]+-\d+-\d+/.test(node.className)) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  // stepbible (default)
  for (let i = 0; i < 6; i++) {
    if (!el) break;
    if (el.classList && (
        el.classList.contains('verseLink') ||
        el.classList.contains('verseStart') ||
        el.classList.contains('verseNum') ||
        el.classList.contains('v') ||
        el.classList.contains('verse') ||
        el.hasAttribute('data-verse') ||
        el.hasAttribute('data-ref') ||
        (el.getAttribute && el.getAttribute('name') && /^\w+\.\d+\.\d+$/.test(el.getAttribute('name')))
    )) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

// Extract an OSIS verse reference from a verse element
function extractReference(element) {
  if (CURRENT_SITE === 'youversion') {
    const usfm = element.dataset.usfm; // e.g. "GEN.1.1"
    if (!usfm) return null;
    const parts = usfm.split('.');
    if (parts.length < 3) return null;
    const osisBook = USFM_TO_OSIS[parts[0].toUpperCase()] || parts[0];
    return `${osisBook}.${parts[1]}.${parts[2]}`;
  }

  if (CURRENT_SITE === 'biblegateway') {
    // class looks like "text Gen-1-1" (may have other classes too)
    const m = element.className.match(/\btext ([\w]+-\d+-\d+)\b/);
    if (!m) return null;
    // "Gen-1-1" → split on last two hyphens
    const m2 = m[1].match(/^(.+)-(\d+)-(\d+)$/);
    if (!m2) return null;
    return `${m2[1]}.${m2[2]}.${m2[3]}`; // "Gen.1.1"
  }

  if (CURRENT_SITE === 'parabible') return null;

  // stepbible (default)

  // Method 1: name attribute (e.g. name="Gen.1.1")
  let ref = element.getAttribute('name');

  // Method 2: data-verse attribute
  if (!ref) ref = element.getAttribute('data-verse');

  // Method 3: data-ref attribute
  if (!ref) ref = element.getAttribute('data-ref');

  // Method 4: id attribute that looks like an OSIS ref
  if (!ref) {
    const id = element.getAttribute('id');
    if (id && /^\w+\.\d+\.\d+$/.test(id)) ref = id;
  }

  // Method 5: numeric text content + current chapter context
  if (!ref) {
    const verseNum = element.textContent.trim();
    const context = getCurrentContext();
    if (context && /^\d+$/.test(verseNum)) {
      ref = `${context.book}.${context.chapter}.${verseNum}`;
    }
  }

  return ref || null;
}

// ── Floating "+ Heading" button ───────────────────────────────────────────────

(function injectFloatingButton() {
  // Parabible has no verse elements — skip entirely
  if (CURRENT_SITE === 'parabible') return;

  const style = document.createElement('style');
  style.textContent = `
    #bible-outline-float-btn {
      position: fixed;
      z-index: 2147483647;
      display: none;
      padding: 3px 9px;
      background: #0f2040;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      line-height: 1.5;
      pointer-events: auto;
      transition: background 0.15s;
    }
    #bible-outline-float-btn:hover { background: #0f2040; }
    #bible-outline-float-btn::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 10px;
      border: 5px solid transparent;
      border-top-color: #0f2040;
    }
  `;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'bible-outline-float-btn';
  btn.textContent = '+ Heading';
  document.body.appendChild(btn);

  let hideTimer = null;
  let lockedVerseEl = null;  // the verse element the button is currently shown for
  let hoveringBtn = false;

  function showBtn(verseEl, reference) {
    clearTimeout(hideTimer);
    lockedVerseEl = verseEl;
    btn.dataset.ref = reference;

    const rect = verseEl.getBoundingClientRect();
    const ARROW  = 5;   // ::after arrow height
    const HEIGHT = 26;  // approximate button height
    const GAP    = 4;

    let top = rect.top - HEIGHT - ARROW - GAP;
    if (top < 4) top = rect.bottom + GAP; // flip below if too close to top

    btn.style.left = `${Math.max(4, rect.left)}px`;
    btn.style.top  = `${top}px`;
    btn.style.display = 'block';
  }

  function scheduleHide() {
    hideTimer = setTimeout(() => {
      btn.style.display = 'none';
      lockedVerseEl = null;
    }, 400);
  }

  // Show on hover — but only if button is not already visible for another verse.
  // This prevents the button from jumping when the mouse passes over an adjacent
  // verse on the way from the original verse up to the button.
  document.addEventListener('mouseover', function(e) {
    if (hoveringBtn) return;
    const verseEl = findVerseElement(e.target);
    if (!verseEl) return;
    if (verseEl === lockedVerseEl) {
      // Still on the same verse — cancel any pending hide
      clearTimeout(hideTimer);
      return;
    }
    // Only show for a new verse when the button is fully hidden
    if (!lockedVerseEl) {
      const ref = extractReference(verseEl);
      if (ref) showBtn(verseEl, ref);
    }
  }, true);

  // Start hide timer when mouse leaves the locked verse element
  document.addEventListener('mouseout', function(e) {
    if (hoveringBtn) return;
    if (findVerseElement(e.target) === lockedVerseEl) scheduleHide();
  }, true);

  // Keep visible while hovering the button itself
  btn.addEventListener('mouseenter', () => { hoveringBtn = true; clearTimeout(hideTimer); });
  btn.addEventListener('mouseleave', () => { hoveringBtn = false; scheduleHide(); });

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ref = btn.dataset.ref;
    if (ref) {
      createHeadingFromVerse(ref);
      btn.style.display = 'none';
    }
  });
})();

// ── Click handling ────────────────────────────────────────────────────────────

// Alt/Option+click or Ctrl+click → open Add Heading modal
// Plain click → highlight heading in side panel
document.addEventListener('click', function(e) {
  const verseEl = findVerseElement(e.target);
  if (verseEl) handleVerseClick(verseEl, e);
}, true);

function handleVerseClick(element, event) {
  const reference = extractReference(element);
  if (!reference) return;

  if (event.altKey || event.ctrlKey) {
    event.preventDefault();
    event.stopPropagation();
    createHeadingFromVerse(reference);
  } else {
    try {
      chrome.storage.session.set({ pendingHighlightRef: { reference, ts: Date.now() } });
    } catch (e) { /* extension context invalidated — page needs refresh */ }
  }
}

// ── Page utilities ────────────────────────────────────────────────────────────

function getCurrentContext() {
  const url = window.location.href;

  if (CURRENT_SITE === 'youversion') {
    // URL: https://www.bible.com/bible/59/GEN.1.ESV
    const m = url.match(/\/bible\/\d+\/([A-Z0-9]+)\.(\d+)/i);
    if (m) {
      const book = USFM_TO_OSIS[m[1].toUpperCase()] || m[1];
      return { book, chapter: m[2] };
    }
    return null;
  }

  if (CURRENT_SITE === 'biblegateway') {
    // Scan the first verse span on the page for context
    const span = document.querySelector('span[class*="text "]');
    if (span) {
      const ref = extractReference(span);
      if (ref) {
        const parts = ref.split('.');
        return { book: parts[0], chapter: parts[1] };
      }
    }
    // Fallback: parse search= URL param  e.g. search=Genesis+1
    const searchM = url.match(/[?&]search=([^&]+)/);
    if (searchM) {
      const decoded = decodeURIComponent(searchM[1]).replace(/\+/g, ' ');
      // "Genesis 1" or "Genesis 1:1"
      const nm = decoded.match(/^(.+?)\s+(\d+)/);
      if (nm) {
        const osis = NAME_TO_OSIS[nm[1]] || nm[1];
        return { book: osis, chapter: nm[2] };
      }
    }
    return null;
  }

  if (CURRENT_SITE === 'parabible') {
    // URL: https://parabible.com/Genesis/1  or  https://parabible.com/1-Corinthians/13
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const bookName = parts[0].replace(/-/g, ' '); // "1-Corinthians" → "1 Corinthians"
      const osis = NAME_TO_OSIS[bookName] || bookName;
      return { book: osis, chapter: parts[1] };
    }
    return null;
  }

  // stepbible (default)
  const match = url.match(/reference=([^&]+)/);
  if (match) {
    const ref = decodeURIComponent(match[1]);
    const parts = ref.split('.');
    if (parts.length >= 2) return { book: parts[0], chapter: parts[1] };
  }

  const headings = document.querySelectorAll('h1, h2, .chapterHeading, .passageReference');
  for (const heading of headings) {
    const m = heading.textContent.match(/([1-3]?\s*[A-Za-z]+)\s+(\d+)/);
    if (m) return { book: m[1].replace(/\s/g, ''), chapter: m[2] };
  }

  return null;
}

function getCurrentBook() {
  const context = getCurrentContext();
  if (context) return context.book;

  // StepBible fallback: parse reference= directly for just the book portion
  if (CURRENT_SITE === 'stepbible') {
    const url = window.location.href;
    const match = url.match(/reference=([^&.]+)/);
    if (match) return decodeURIComponent(match[1]);
  }

  return null;
}

function createHeadingFromVerse(reference) {
  // Write to session storage so the side panel picks it up via onChanged.
  // This is far more reliable than chrome.runtime.sendMessage in MV3 —
  // storage changes are broadcast to all extension contexts directly,
  // with no dependency on the service worker being alive.
  // The timestamp makes every click a distinct event, even on the same verse.
  try {
    chrome.storage.session.set({ pendingHeadingRef: { reference, ts: Date.now() } });
  } catch (e) { /* extension context invalidated — page needs refresh */ }

  // Brief highlight on the verse element as visual feedback
  highlightVerseElement(reference);
}

function highlightVerseElement(reference) {
  let el = null;

  if (CURRENT_SITE === 'youversion') {
    const parts = reference.split('.');
    const usfmBook = OSIS_TO_USFM[parts[0]] || parts[0].toUpperCase();
    el = document.querySelector(`[data-usfm="${usfmBook}.${parts[1]}.${parts[2]}"]`);
  } else if (CURRENT_SITE === 'biblegateway') {
    const parts = reference.split('.');
    el = document.querySelector(`span[class*="text ${parts[0]}-${parts[1]}-${parts[2]}"]`);
  } else {
    el = document.querySelector(
      `[name="${reference}"], [data-verse="${reference}"], [id="${reference}"]`
    );
  }

  if (el) {
    el.style.backgroundColor = '#f5e6d0';
    el.style.transition = 'background-color 0.3s';
    setTimeout(() => { el.style.backgroundColor = ''; }, 1000);
  }
}

function scrollToVerse(reference) {
  let el = null;

  if (CURRENT_SITE === 'youversion') {
    const parts = reference.split('.');
    const usfmBook = OSIS_TO_USFM[parts[0]] || parts[0].toUpperCase();
    el = document.querySelector(`[data-usfm="${usfmBook}.${parts[1]}.${parts[2]}"]`);
  } else if (CURRENT_SITE === 'biblegateway') {
    const parts = reference.split('.');
    el = document.querySelector(`span[class*="text ${parts[0]}-${parts[1]}-${parts[2]}"]`);
  } else if (CURRENT_SITE === 'parabible') {
    // Parabible has no individual verse elements — nothing to scroll to
    return;
  } else {
    // stepbible (default)
    const selectors = [
      `[name="${reference}"]`,
      `[data-verse="${reference}"]`,
      `[id="${reference}"]`,
      `.verse[data-verse="${reference}"]`
    ];
    for (const selector of selectors) {
      el = document.querySelector(selector);
      if (el) break;
    }
  }

  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.backgroundColor = '#f5e6d0';
    el.style.transition = 'background-color 0.5s';
    setTimeout(() => { el.style.backgroundColor = ''; }, 2000);
  }
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCROLL_TO_VERSE') {
    scrollToVerse(message.reference);
    sendResponse({ success: true });
  } else if (message.type === 'GET_CURRENT_BOOK') {
    sendResponse({ book: getCurrentBook() });
  }
  return true;
});

// ── URL change watcher ────────────────────────────────────────────────────────

let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('URL changed, new book:', getCurrentBook());
  }
}).observe(document, { subtree: true, childList: true });
