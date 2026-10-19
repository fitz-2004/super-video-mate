// Service worker: only routes the toolbar button and keyboard command to the tab.
// All Claude calls happen in the sidebar page, so nothing long-running lives here.
const toggle = (tab) => {
  if (tab?.id && tab.url?.startsWith('https://www.youtube.com/')) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE' }).catch(() => {});
  }
};

chrome.action.onClicked.addListener(toggle);
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-mate') return;
  toggle(tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]);
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
