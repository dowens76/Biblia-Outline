// content.js - Runs on StepBible.org pages

console.log('Bible Outline Builder content script loaded');

// Returns a verse element at or above `el`, or null
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

// Use event delegation to handle dynamically loaded verse links
// Option/Alt+click or Ctrl+click → open Add Heading modal
// Plain click → highlight heading in side panel
document.addEventListener('click', function(e) {
  const verseEl = findVerseElement(e.target);
  if (verseEl) handleVerseClick(verseEl, e);
}, true); // Use capture phase to catch events early

// Handle verse link click
function handleVerseClick(element, event) {
  console.log('Verse clicked:', element);
  
  // Try multiple ways to get the verse reference
  let reference = null;
  
  // Method 1: name attribute (e.g., name="Gen.1.1")
  reference = element.getAttribute('name');
  
  // Method 2: data-verse attribute
  if (!reference) {
    reference = element.getAttribute('data-verse');
  }
  
  // Method 3: id attribute
  if (!reference) {
    const id = element.getAttribute('id');
    if (id && id.includes('.')) {
      reference = id;
    }
  }
  
  // Method 4: Parse from text content (e.g., "1", "2", etc. with context)
  if (!reference) {
    const verseNum = element.textContent.trim();
    const context = getCurrentContext();
    if (context && verseNum.match(/^\d+$/)) {
      reference = `${context.book}.${context.chapter}.${verseNum}`;
    }
  }
  
  console.log('Extracted reference:', reference);
  
  if (!reference) {
    console.log('Could not extract verse reference');
    return;
  }
  
  // Alt/Option+click or Ctrl+click → open Add Heading modal
  if (event.altKey || event.ctrlKey) {
    event.preventDefault();
    event.stopPropagation();
    console.log('Creating heading from verse:', reference);
    createHeadingFromVerse(reference);
  } else {
    // Regular click - just notify side panel
    console.log('Notifying side panel of verse click:', reference);
    chrome.runtime.sendMessage({
      type: 'VERSE_CLICKED',
      reference: reference
    });
  }
}


// Get current book and chapter from page context
function getCurrentContext() {
  // Try to extract from URL
  const url = window.location.href;
  const match = url.match(/reference=([^&]+)/);
  
  if (match) {
    const ref = decodeURIComponent(match[1]);
    const parts = ref.split('.');
    if (parts.length >= 2) {
      return {
        book: parts[0],
        chapter: parts[1]
      };
    }
  }
  
  // Try to find from page content
  const headings = document.querySelectorAll('h1, h2, .chapterHeading, .passageReference');
  for (const heading of headings) {
    const text = heading.textContent;
    const match = text.match(/([1-3]?\s*[A-Za-z]+)\s+(\d+)/);
    if (match) {
      return {
        book: match[1].replace(/\s/g, ''),
        chapter: match[2]
      };
    }
  }
  
  return null;
}

// Create heading from verse reference
function createHeadingFromVerse(reference) {
  console.log('Sending CREATE_HEADING_FROM_VERSE message:', reference);
  
  // Send message to background script
  chrome.runtime.sendMessage({
    type: 'CREATE_HEADING_FROM_VERSE',
    reference: reference
  });
  
  // Visual feedback
  const link = document.querySelector(`[name="${reference}"], [data-verse="${reference}"], #${reference}`);
  if (link) {
    link.style.backgroundColor = '#c8e6c9';
    link.style.transition = 'background-color 0.3s';
    setTimeout(() => {
      link.style.backgroundColor = '';
    }, 1000);
  }
}

// Scroll to specific verse
function scrollToVerse(reference) {
  console.log('Scrolling to verse:', reference);
  
  // Try multiple selectors
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
    console.log('Found verse element, scrolling...');
    verseLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Highlight the verse temporarily
    verseLink.style.backgroundColor = '#ffeb3b';
    verseLink.style.transition = 'background-color 0.5s';
    setTimeout(() => {
      verseLink.style.backgroundColor = '';
    }, 2000);
  } else {
    console.log('Verse element not found, selectors tried:', selectors);
  }
}

// Get current book from URL or page
function getCurrentBook() {
  // Try to extract from URL
  const url = window.location.href;
  const match = url.match(/reference=([^&.]+)/);
  
  if (match) {
    return decodeURIComponent(match[1]);
  }
  
  // Try to get from context
  const context = getCurrentContext();
  return context ? context.book : null;
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  if (message.type === 'SCROLL_TO_VERSE') {
    scrollToVerse(message.reference);
    sendResponse({ success: true });
  } else if (message.type === 'GET_CURRENT_BOOK') {
    const book = getCurrentBook();
    console.log('Current book:', book);
    sendResponse({ book: book });
  }
  return true;
});

// Log when page changes
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('StepBible page loaded, Bible Outline Builder ready');
    console.log('Current book:', getCurrentBook());
  });
} else {
  console.log('StepBible page already loaded, Bible Outline Builder ready');
  console.log('Current book:', getCurrentBook());
}

// Watch for URL changes (for single-page navigation)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('URL changed, new book:', getCurrentBook());
  }
}).observe(document, { subtree: true, childList: true });

