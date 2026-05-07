export default defineBackground(() => {
  console.log("My Agent extension background ready", { id: browser.runtime.id });

  // Open side panel when extension icon is clicked
  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  });
});
