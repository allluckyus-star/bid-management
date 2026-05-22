const EXTENSION_VERSION = "0.3.3";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "jbhm-capture",
    title: "Capture job to Bid History",
    contexts: ["page"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "jbhm-capture" || !tab?.id) return;
  await captureActiveTab(tab.id);
});

async function getSettings() {
  const stored = await chrome.storage.sync.get({
    apiBaseUrl: "http://127.0.0.1:5123",
    capturedBy: "",
  });
  return stored;
}

function hasContent(pageData) {
  return Boolean(pageData?.captured_html?.trim());
}

async function captureActiveTab(tabId) {
  const settings = await getSettings();
  if (!settings.capturedBy?.trim()) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Job Bid History",
      message: "Set your name in the extension popup first.",
    });
    return;
  }

  try {
    const pageData = await chrome.tabs.sendMessage(tabId, { type: "GET_VISIBLE_TEXT" });
    if (!hasContent(pageData)) {
      throw new Error("No job content found on this page.");
    }
    await postCapture(settings, pageData);
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Job captured",
      message: "Saved to Job Bid History Manager.",
    });
  } catch (err) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Capture failed",
      message: err?.message || String(err),
    });
  }
}

async function postCapture(settings, pageData) {
  const payload = {
    source_url: pageData.source_url,
    page_title: pageData.page_title,
    captured_html: pageData.captured_html || "",
    captured_at: new Date().toISOString(),
    captured_by: settings.capturedBy.trim(),
    extension_version: EXTENSION_VERSION,
    capture_method: pageData.capture_method || "structured-dom+html",
  };

  const res = await fetch(`${settings.apiBaseUrl.replace(/\/$/, "")}/capture/job`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `API error ${res.status}`);
  }
  return res.json();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CAPTURE_FROM_POPUP") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab." });
        return;
      }
      try {
        const settings = await getSettings();
        if (!settings.capturedBy?.trim()) {
          sendResponse({ ok: false, error: "Enter your name (captured by) in settings." });
          return;
        }
        const pageData = await chrome.tabs.sendMessage(tab.id, { type: "GET_VISIBLE_TEXT" });
        if (!hasContent(pageData)) {
          sendResponse({ ok: false, error: "No job content on this page." });
          return;
        }
        const result = await postCapture(settings, pageData);
        sendResponse({ ok: true, result });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    });
    return true;
  }
});
