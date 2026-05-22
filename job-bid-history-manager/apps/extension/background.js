const EXTENSION_VERSION = "0.4.0";

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
  return chrome.storage.sync.get({
    apiBaseUrl: "http://localhost:3000",
    capturedBy: "",
    captureToken: "",
  });
}

function hasContent(pageData) {
  return Boolean(pageData?.captured_text?.trim());
}

async function captureActiveTab(tabId) {
  const settings = await getSettings();
  if (!settings.capturedBy?.trim()) {
    notify("Job Bid History", "Set your name in the extension popup first.");
    return;
  }
  if (!settings.captureToken?.trim()) {
    notify(
      "Job Bid History",
      "Add a capture token from the web dashboard (Extension section).",
    );
    return;
  }

  try {
    const pageData = await chrome.tabs.sendMessage(tabId, { type: "GET_VISIBLE_TEXT" });
    if (!hasContent(pageData)) {
      throw new Error("No job content found on this page.");
    }
    await postCapture(settings, pageData);
    notify("Job captured", "Saved to Job Bid History.");
  } catch (err) {
    notify("Capture failed", err?.message || String(err));
  }
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
  });
}

async function postCapture(settings, pageData) {
  const base = settings.apiBaseUrl.replace(/\/$/, "");
  const payload = {
    source_url: pageData.source_url,
    page_title: pageData.page_title,
    captured_text: pageData.captured_text || "",
    captured_at: new Date().toISOString(),
    captured_by: settings.capturedBy.trim(),
    extension_version: EXTENSION_VERSION,
    capture_method: pageData.capture_method || "document.body.innerText",
  };

  const res = await fetch(`${base}/api/capture/job`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.captureToken.trim()}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let detail = await res.text();
    try {
      const j = JSON.parse(detail);
      detail = j.error || detail;
    } catch {
      /* plain text */
    }
    throw new Error(detail || `API error ${res.status}`);
  }
  return res.json();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CAPTURE_FROM_POPUP") return;

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
      if (!settings.captureToken?.trim()) {
        sendResponse({
          ok: false,
          error: "Paste your capture token from the web dashboard.",
        });
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
});
