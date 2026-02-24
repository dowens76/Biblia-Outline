// background.js - Service worker for the extension

// Toggle side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Listen for messages from content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'NAVIGATE_TO_VERSE') {
    // Navigate StepBible to specific verse
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SCROLL_TO_VERSE',
          reference: message.reference
        });
      }
    });
  } else if (message.type === 'GET_CURRENT_BOOK') {
    // Get current book from StepBible page
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url.includes('stepbible.org')) {
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
