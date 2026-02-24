// content.js - Runs on StepBible.org pages

console.log('Bible Outline Builder content script loaded');

// ── Verse element detection ──────────────────────────────────────────────────

// Returns the nearest verse element at or above `el`, or null
function findVerseElement(el) {
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

// ── Floating "+ Heading" button ──────────────────────────────────────────────

(function injectFloatingButton() {
  const style = document.createElement('style');
  style.textContent = `
    #bible-outline-float-btn {
      position: fixed;
      z-index: 2147483647;
      display: none;
      padding: 3px 9px;
      background: #7B3410;
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
    #bible-outline-float-btn:hover { background: #5C2008; }
    #bible-outline-float-btn::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 10px;
      border: 5px solid transparent;
      border-top-color: #7B3410;
    }
  `;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'bible-outline-float-btn';
  btn.textContent = '+ Heading';
  document.body.appendChild(btn);

  let hideTimer = null;

  function showBtn(verseEl, reference) {
    clearTimeout(hideTimer);
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
    hideTimer = setTimeout(() => { btn.style.display = 'none'; }, 400);
  }

  // Show on hover over any verse element
  document.addEventListener('mouseover', function(e) {
    const verseEl = findVerseElement(e.target);
    if (!verseEl) return;
    const ref = extractReference(verseEl);
    if (ref) showBtn(verseEl, ref);
  }, true);

  // Hide when mouse leaves a verse element (with delay so button is reachable)
  document.addEventListener('mouseout', function(e) {
    if (findVerseElement(e.target)) scheduleHide();
  }, true);

  // Keep visible while hovering the button itself
  btn.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  btn.addEventListener('mouseleave', scheduleHide);

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

// ── Click handling ───────────────────────────────────────────────────────────

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
    chrome.runtime.sendMessage({ type: 'VERSE_CLICKED', reference });
  }
}

// ── Page utilities ───────────────────────────────────────────────────────────

function getCurrentContext() {
  const url = window.location.href;
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
  const url = window.location.href;
  const match = url.match(/reference=([^&.]+)/);
  if (match) return decodeURIComponent(match[1]);
  const context = getCurrentContext();
  return context ? context.book : null;
}

function createHeadingFromVerse(reference) {
  chrome.runtime.sendMessage({ type: 'CREATE_HEADING_FROM_VERSE', reference });

  // Brief highlight on the verse element as visual feedback
  const link = document.querySelector(
    `[name="${reference}"], [data-verse="${reference}"], #${reference}`
  );
  if (link) {
    link.style.backgroundColor = '#f5e6d0';
    link.style.transition = 'background-color 0.3s';
    setTimeout(() => { link.style.backgroundColor = ''; }, 1000);
  }
}

function scrollToVerse(reference) {
  const selectors = [
    `[name="${reference}"]`,
    `[data-verse="${reference}"]`,
    `#${reference}`,
    `.verse[data-verse="${reference}"]`
  ];

  let verseLink = null;
  for (const selector of selectors) {
    verseLink = document.querySelector(selector);
    if (verseLink) break;
  }

  if (verseLink) {
    verseLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
    verseLink.style.backgroundColor = '#f5e6d0';
    verseLink.style.transition = 'background-color 0.5s';
    setTimeout(() => { verseLink.style.backgroundColor = ''; }, 2000);
  }
}

// ── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCROLL_TO_VERSE') {
    scrollToVerse(message.reference);
    sendResponse({ success: true });
  } else if (message.type === 'GET_CURRENT_BOOK') {
    sendResponse({ book: getCurrentBook() });
  }
  return true;
});

// ── URL change watcher ───────────────────────────────────────────────────────

let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('URL changed, new book:', getCurrentBook());
  }
}).observe(document, { subtree: true, childList: true });
