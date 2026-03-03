// background.js - Service worker for the extension

// Allow content scripts to read/write chrome.storage.session.
// By default the session store is restricted to trusted extension pages only;
// this call opens it to untrusted contexts (content scripts) as well so that
// the floating "+ Heading" button can signal the side panel via storage changes.
chrome.storage.session.setAccessLevel({
  accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'
});

// Toggle side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Listen for messages from the side panel
// (content-script → side-panel actions now go via chrome.storage.session)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'NAVIGATE_TO_VERSE') {
    // Navigate the active Bible-site tab to a specific verse
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SCROLL_TO_VERSE',
          reference: message.reference
        });
      }
    });
  } else if (message.type === 'GET_CURRENT_BOOK') {
    // Ask the active Bible-site tab which book is currently displayed
    const SUPPORTED_HOSTS = ['stepbible.org', 'bible.com', 'biblegateway.com', 'parabible.com'];
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && SUPPORTED_HOSTS.some(s => (tabs[0].url || '').includes(s))) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CURRENT_BOOK' }, (response) => {
          sendResponse(response);
        });
        return true; // Keep message channel open
      }
    });
    return true;
  }
});

// Initialize extension on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Bible Outline Builder installed');
});
