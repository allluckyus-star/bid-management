importScripts("config.js", "prompt-defaults.js", "storage.js", "api.js", "download-path.js");

const CHATGPT_URL_PATTERNS = [
  "https://chatgpt.com/*",
  "https://www.chatgpt.com/*",
  "https://chat.openai.com/*",
];

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

const OLD_PROMPT_MARKER = "Target company: {company_name}";

function migratePromptTemplate() {
  chrome.storage.sync.get(["promptTemplate", "promptTemplateVersion"], (data) => {
    const version = Number(data.promptTemplateVersion) || 0;
    const stored = String(data.promptTemplate || "");
    const hasOldDefault = stored.includes(OLD_PROMPT_MARKER);
    const needsDefault = !stored.trim();
    const needsMigration = version < PROMPT_TEMPLATE_VERSION;

    if (needsDefault || (needsMigration && hasOldDefault)) {
      chrome.storage.sync.set({
        promptTemplate: DEFAULT_PROMPT_TEMPLATE,
        promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
      });
      return;
    }

    if (needsMigration) {
      chrome.storage.sync.set({ promptTemplateVersion: PROMPT_TEMPLATE_VERSION });
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();
  migratePromptTemplate();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenu();
  migratePromptTemplate();
});

function hasContent(pageData) {
  return Boolean(pageData?.captured_text?.trim());
}

const CHATGPT_HOSTS = new Set(["chatgpt.com", "www.chatgpt.com", "chat.openai.com"]);

function isChatGptHostname(hostname) {
  if (!hostname) return false;
  if (CHATGPT_HOSTS.has(hostname)) return true;
  if (hostname === "chatgpt.com" || hostname.endsWith(".chatgpt.com")) return true;
  if (hostname === "chat.openai.com") return true;
  return false;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

function tabIsChatGpt(tab) {
  try {
    return isChatGptHostname(new URL(tab?.url || "").hostname);
  } catch {
    return false;
  }
}

async function findChatGptTabId() {
  const tabs = await chrome.tabs.query({ url: CHATGPT_URL_PATTERNS });
  return tabs[0]?.id ?? null;
}

async function showTabToast(tab, text, variant = "warning") {
  if (!tab?.id) return;
  try {
    await sendToChatGptTab(tab.id, { type: "SHOW_TOAST", text, variant }, { tryInject: false });
  } catch {
    /* ignore */
  }
}

function isNoReceiverError(err) {
  const msg = String(err?.message || err || "");
  return (
    msg.includes("Receiving end does not exist") ||
    msg.includes("Could not establish connection") ||
    msg.includes("The message port closed")
  );
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tryInjectChatGptContentScript(tabId) {
  // MV3: if the content script didn't load yet, inject and retry.
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["chatgpt-content.js"],
  });
}

async function sendToChatGptTab(tabId, message, opts = {}) {
  const tryInject = opts.tryInject !== false;
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    if (!tryInject || !isNoReceiverError(err)) throw err;
    await tryInjectChatGptContentScript(tabId);
    await sleep(200);
    return await chrome.tabs.sendMessage(tabId, message);
  }
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

    const status = await getExtensionStatus();
    if (result.job_id && status.team_id) {
      await saveActiveJobContext({
        teamId: status.team_id,
        jobId: result.job_id,
      });
      await saveActiveOptimization(null);
    }

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
      team_id: me.team_id,
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

async function fetchPromptFromServer(settings, status, jobId) {
  const teamId = status.team_id;
  if (!teamId) {
    throw new Error("Extension token has no team. Create a new token on the team dashboard.");
  }
  const promptPrefix = await loadPromptTemplate();
  const activeJob = await loadActiveJobContext();
  const resolvedJobId = jobId || activeJob?.jobId || undefined;

  const created = await postChatGptPrompt(settings.apiBaseUrl, settings.captureToken, teamId, {
    job_id: resolvedJobId,
    prompt_prefix: promptPrefix,
  });

  const manualOnly = created.manual_only === true || created.jd_mode === "manual";
  if (manualOnly) {
    await saveActiveOptimization(null);
    await chrome.storage.local.set({
      manualOnlyJdMode: true,
      manualJdLabel: String(created.jd_label || "Manual JD"),
    });
    return {
      teamId,
      jobId: null,
      optimizationId: null,
      promptText: created.prompt_text,
      manualOnly: true,
      jdLabel: String(created.jd_label || "Manual JD"),
    };
  }

  const opt = {
    teamId,
    jobId: created.job_id,
    optimizationId: created.optimization_id,
    promptText: created.prompt_text,
    manualOnly: false,
  };
  await saveActiveOptimization(opt);
  await chrome.storage.local.set({ manualOnlyJdMode: false });
  await saveActiveJobContext({ teamId, jobId: created.job_id });
  return opt;
}

async function pasteAndSubmitOnTab(tabId, promptText, autoCapture = true, manualOnly = false) {
  await chrome.tabs.update(tabId, { active: true });
  const response = await sendToChatGptTab(tabId, {
    type: "PASTE_AND_SUBMIT_PROMPT",
    text: promptText,
    autoCapture,
    manualOnly,
  });
  if (response?.status !== "ok") {
    const detail = response?.detail || "Could not paste and send prompt.";
    throw new Error(detail);
  }
}

async function blobToDownloadDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${btoa(binary)}`;
}

/** Full Resume-sender style flow: server prompt → paste/send → auto capture → upload → download */
async function runGenerateChatGptPrompt(tabOverride) {
  const tab = tabOverride || (await getActiveTab());
  if (!(await isExtensionEnabled())) {
    throw new Error("Extension is OFF. Turn it ON in the popup.");
  }

  if (!tabIsChatGpt(tab)) {
    throw new Error("Open ChatGPT (chatgpt.com) in the active tab first.");
  }

  await showTabToast(tab, "Building prompt and sending to ChatGPT…", "success");
  notify("ChatGPT", "Building prompt…");

  const settings = await loadExtensionSettings();
  const status = await getExtensionStatus();
  if (!status.connected) {
    throw new Error(status.error || "Extension not connected.");
  }

  const opt = await fetchPromptFromServer(settings, status);
  try {
    await pasteAndSubmitOnTab(tab.id, opt.promptText, true, opt.manualOnly === true);
  } catch (err) {
    if (isNoReceiverError(err)) {
      throw new Error(
        "ChatGPT tab wasn’t ready (content script not loaded). Refresh ChatGPT and press Alt+W again.",
      );
    }
    throw err;
  }
  if (opt.manualOnly) {
    notify("ChatGPT", "Prompt sent — DOCX will download when GPT finishes.");
    await showTabToast(
      tab,
      "Prompt sent. When GPT finishes, DOCX will be built and downloaded to your PC.",
      "success",
    );
  } else {
    notify("ChatGPT", "Prompt sent — waiting for model output…");
    await showTabToast(tab, "Prompt sent. Auto-capturing result when ready…", "success");
  }
  return opt;
}

async function downloadFilenameWithUserFolder(leafFilename) {
  const status = await getExtensionStatus();
  const me = {
    display_name: status.display_name,
    email: status.email,
    captured_by: status.captured_by,
  };
  return resolveDownloadFilename(me, leafFilename);
}

async function downloadManualDocxFromGptText(text, tabId) {
  const settings = await loadExtensionSettings();
  if (!settings.captureToken) throw new Error("Add capture token in Settings.");

  const status = await getExtensionStatus();
  if (!status.connected) throw new Error(status.error || "Extension not connected.");
  const teamId = status.team_id;
  if (!teamId) throw new Error("Extension token has no team.");

  const chatTabId = tabId || (await findChatGptTabId());
  if (chatTabId) {
    await showTabToast({ id: chatTabId }, "GPT done — building DOCX on server…", "success");
  }
  notify("Manual JD", "Building DOCX…");

  const modeData = await chrome.storage.local.get({ manualJdLabel: "Manual JD" });
  const { blob, filename } = await postRenderDocx(
    settings.apiBaseUrl,
    settings.captureToken,
    teamId,
    text,
    { jd_label: modeData.manualJdLabel },
  );

  const dataUrl = await blobToDownloadDataUrl(blob);
  const downloadPath = await downloadFilenameWithUserFolder(filename);
  await chrome.downloads.download({ url: dataUrl, filename: downloadPath, saveAs: false });

  notify("Manual JD", `Downloaded to ${downloadPath}`);
  if (chatTabId) {
    await showTabToast({ id: chatTabId }, `DOCX downloaded: ${filename}`, "success");
  }

  return { filename, manual: true };
}

async function submitGptResultText(text, opts = {}) {
  const settings = await loadExtensionSettings();
  if (!settings.captureToken) throw new Error("Add capture token in Settings.");

  const status = await getExtensionStatus();
  if (!status.connected) throw new Error(status.error || "Extension not connected.");

  const modeData = await chrome.storage.local.get({ manualOnlyJdMode: false });
  const isManual = opts.manualOnly === true || modeData.manualOnlyJdMode === true;
  if (isManual) {
    return downloadManualDocxFromGptText(text, opts.tabId);
  }

  let opt = await loadActiveOptimization();
  if (!opt?.optimizationId) {
    opt = await fetchPromptFromServer(settings, status);
  }
  if (!opt?.optimizationId) {
    throw new Error("No optimization session found. Run ChatGPT Prompt first.");
  }

  const result = await postGptResult(
    settings.apiBaseUrl,
    settings.captureToken,
    opt.teamId,
    opt.optimizationId,
    text,
  );

  await saveActiveOptimization({
    ...opt,
    lastExportId: result.export_id,
    lastDownloadUrl: result.download_url,
    lastFilename: result.display_filename,
  });

  if (opts.autoDownload !== false) {
    try {
      await downloadLastExport();
    } catch {
      /* user can click Download manually */
    }
  }

  return result;
}

async function downloadLastExport() {
  const settings = await loadExtensionSettings();
  const opt = await loadActiveOptimization();
  const exportId = opt?.lastExportId;
  const teamId = opt?.teamId;
  if (!exportId || !teamId) {
    throw new Error("No export ready yet. Run ChatGPT Prompt or send a GPT result first.");
  }

  const leaf = opt.lastFilename || "resume.docx";
  const downloadPath = await downloadFilenameWithUserFolder(leaf);
  const url = `${settings.apiBaseUrl}/api/team/${teamId}/resume-exports/${exportId}/download`;
  await chrome.downloads.download({
    url,
    filename: downloadPath,
    headers: [{ name: "Authorization", value: `Bearer ${settings.captureToken}` }],
  });
  return { ok: true, filename: downloadPath };
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "jbhm-capture" || !tab?.id) return;
  await captureActiveTab(tab.id);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "generate-chatgpt-prompt") {
    try {
      await runGenerateChatGptPrompt();
    } catch (err) {
      notify("ChatGPT Prompt failed", err?.message || String(err));
    }
    return;
  }
  if (command === "download-resume-export") {
    try {
      await downloadLastExport();
      notify("Download", "Resume DOCX download started.");
    } catch (err) {
      notify("Download failed", err?.message || String(err));
    }
  }
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

  if (type === "GENERATE_CHATGPT_PROMPT") {
    (async () => {
      try {
        const opt = await runGenerateChatGptPrompt();
        sendResponse({ status: "ok", optimizationId: opt.optimizationId, jobId: opt.jobId });
      } catch (err) {
        sendResponse({ status: "error", detail: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (type === "SEND_GPT_RESULT") {
    (async () => {
      try {
        const result = await submitGptResultText(String(message.text || ""), {
          autoDownload: true,
          manualOnly: message.manualOnly === true,
          tabId: _sender?.tab?.id,
        });
        sendResponse({ status: "ok", result, manual: result?.manual === true });
      } catch (err) {
        sendResponse({ status: "error", detail: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (type === "DOWNLOAD_BLOB") {
    (async () => {
      try {
        const buffer = message.buffer;
        if (!buffer) {
          sendResponse({ status: "error", detail: "Missing file data" });
          return;
        }
        const leaf = message.leafFilename || "resume.docx";
        const mimeType =
          message.mimeType ||
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        const blob = new Blob([buffer], { type: mimeType });
        const dataUrl = await blobToDownloadDataUrl(blob);
        const downloadPath = await downloadFilenameWithUserFolder(leaf);
        await chrome.downloads.download({ url: dataUrl, filename: downloadPath, saveAs: false });
        sendResponse({ status: "ok", downloadPath });
      } catch (err) {
        sendResponse({ status: "error", detail: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (type === "DOWNLOAD_EXPORT") {
    (async () => {
      try {
        await downloadLastExport();
        sendResponse({ status: "ok" });
      } catch (err) {
        sendResponse({ status: "error", detail: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (type === "SET_ACTIVE_OPTIMIZATION") {
    saveActiveOptimization(message.optimization).then(() => sendResponse({ status: "ok" }));
    return true;
  }

  if (type === "SET_EXTENSION_ENABLED") {
    chrome.storage.local.set({ enabled: message.enabled !== false }).then(() => {
      sendResponse({ status: "ok" });
    });
    return true;
  }

  return false;
});
