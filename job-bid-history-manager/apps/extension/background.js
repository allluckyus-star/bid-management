importScripts("config.js", "storage.js", "api.js");

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message: message.slice(0, 240),
  });
}

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "jbhm-capture",
      title: JBHM_CONFIG.CONTEXT_MENU_TITLE,
      contexts: ["page"],
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenu();
});

function hasContent(pageData) {
  return Boolean(pageData?.captured_text?.trim());
}

const capturingTabIds = new Set();

async function captureActiveTab(tabId) {
  if (capturingTabIds.has(tabId)) {
    return { ok: false, error: "Capture already in progress." };
  }

  const settings = await loadExtensionSettings();
  if (!settings.captureToken) {
    notify("Job Bid History", "Open extension Settings and add your capture token.");
    return { ok: false, error: "Not configured" };
  }

  capturingTabIds.add(tabId);
  notify("Job Bid History", "Capturing page…");

  try {
    const pageData = await chrome.tabs.sendMessage(tabId, { type: "GET_VISIBLE_TEXT" });
    if (!hasContent(pageData)) {
      throw new Error("No job content found on this page.");
    }
    const result = await postCaptureJob(
      settings.apiBaseUrl,
      settings.captureToken,
      pageData,
    );
    notify("Job captured", result.message || "Saved to Job Bid History.");
    return { ok: true, result };
  } catch (err) {
    const msg = err?.message || String(err);
    notify("Capture failed", msg);
    return { ok: false, error: msg };
  } finally {
    capturingTabIds.delete(tabId);
  }
}

async function getExtensionStatus() {
  const settings = await loadExtensionSettings();
  if (!settings.captureToken) {
    return {
      configured: false,
      apiBaseUrl: settings.apiBaseUrl,
      apiEnv: settings.apiEnv,
    };
  }
  try {
    const me = await fetchExtensionMe(settings.apiBaseUrl, settings.captureToken);
    return {
      configured: true,
      connected: true,
      apiBaseUrl: settings.apiBaseUrl,
      apiEnv: settings.apiEnv,
      display_name: me.display_name,
      email: me.email,
      captured_by: me.captured_by,
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      apiBaseUrl: settings.apiBaseUrl,
      apiEnv: settings.apiEnv,
      error: err?.message || String(err),
    };
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "jbhm-capture" || !tab?.id) return;
  await captureActiveTab(tab.id);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type;

  if (type === "GET_EXTENSION_STATUS") {
    getExtensionStatus().then(sendResponse);
    return true;
  }

  if (type === "CAPTURE_FROM_POPUP") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab." });
        return;
      }
      const out = await captureActiveTab(tab.id);
      sendResponse(out);
    });
    return true;
  }

  if (type === "TEST_CONNECTION") {
    loadExtensionSettings()
      .then(async (settings) => {
        if (!settings.captureToken) {
          sendResponse({ ok: false, error: "Add a capture token first." });
          return;
        }
        const me = await fetchExtensionMe(settings.apiBaseUrl, settings.captureToken);
        sendResponse({ ok: true, me });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err?.message || String(err) });
      });
    return true;
  }

  return false;
});
