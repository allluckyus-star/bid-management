importScripts("config.js", "prompt-defaults.js", "storage.js", "api.js", "download-path.js");

const CHATGPT_URL_PATTERNS = [
  "https://chatgpt.com/*",
  "https://www.chatgpt.com/*",
  "https://chat.openai.com/*",
];
const HISTORY_KEY = "captureHistory";
const MAX_CAPTURE_HISTORY = 5;

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

const NON_INJECTABLE_URL_PREFIXES = [
  "chrome://",
  "edge://",
  "about:",
  "chrome-extension://",
];

function tabUrlInjectable(url) {
  const u = String(url || "");
  return u && !NON_INJECTABLE_URL_PREFIXES.some((prefix) => u.startsWith(prefix));
}

async function ensurePanelHost(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "GET_WORKSPACE_STATE" });
  } catch (err) {
    if (!isNoReceiverError(err)) throw err;
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["panel-host.js"],
    });
    await sleep(200);
    return await chrome.tabs.sendMessage(tabId, { type: "GET_WORKSPACE_STATE" });
  }
}

async function sendWorkspaceMessage(tabId, message) {
  await ensurePanelHost(tabId);
  return chrome.tabs.sendMessage(tabId, message);
}

async function toggleWorkspaceOnTab(tab) {
  if (!tab?.id) {
    notify("Job Bid Assistant", "No active tab.");
    return { ok: false, error: "No active tab." };
  }
  if (!tabUrlInjectable(tab.url)) {
    notify(
      "Job Bid Assistant",
      "Open a job site in a normal tab first (not chrome:// or the extensions page).",
    );
    return { ok: false, error: "Workspace cannot open on this page." };
  }
  try {
    return await sendWorkspaceMessage(tab.id, { type: "TOGGLE_WORKSPACE" });
  } catch (err) {
    const msg = err?.message || String(err);
    notify("Job Bid Assistant", msg);
    return { ok: false, error: msg };
  }
}

chrome.action.onClicked.addListener((tab) => {
  void toggleWorkspaceOnTab(tab);
});

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

function base64ToUint8Array(base64) {
  const bin = atob(String(base64 || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
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

function isValidUsernameFormat(username) {
  return /^[a-z0-9_-]{3,32}$/.test(String(username || "").trim().toLowerCase());
}

async function applyJdFromSelection(field, value) {
  const settings = await loadExtensionSettings();
  if (!settings.captureToken) {
    throw new Error("Add a capture token in extension Settings.");
  }
  const status = await getExtensionStatus();
  if (!status.connected || !status.team_id) {
    throw new Error(status.error || "Extension not connected.");
  }
  await applyJdFromSelection(settings.apiBaseUrl, settings.captureToken, status.team_id, {
    field,
    value,
  });
  const label = field === "name" ? "Manual JD name set." : "Manual JD text set.";
  notify("JD source", label);
  chrome.runtime.sendMessage({ type: "JD_SETTINGS_UPDATED" }).catch(() => {});
  return { ok: true };
}

async function captureActiveTab(tabId, options = {}) {
  const setJdToLatest = options.setJdToLatest === true;
  if (capturingTabIds.has(tabId)) {
    return { ok: false, error: "Capture already in progress." };
  }

  const settings = await loadExtensionSettings();
  if (!settings.captureToken) {
    notify("Job Bid History", "Open extension Settings and add your capture token.");
    return { ok: false, error: "Not configured" };
  }
  if (!settings.username || !settings.usernameValidatedAt || !isValidUsernameFormat(settings.username)) {
    notify("Job Bid History", "Set and validate your username in extension Settings.");
    return { ok: false, error: "Username missing or unvalidated. Open Settings and validate it." };
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
      settings.username,
    );

    const status = await getExtensionStatus();
    await appendCaptureHistory({
      title: pageData?.page_title || "",
      company: result?.company_name || "",
      url: pageData?.source_url || "",
      capturedAt: new Date().toISOString(),
      jobId: result?.job_id || null,
    });
    if (result.job_id && status.team_id) {
      await saveActiveJobContext({
        teamId: status.team_id,
        jobId: result.job_id,
      });
      await saveActiveOptimization(null);
    }

    if (setJdToLatest && status.team_id) {
      try {
        await patchTeamJdSettings(settings.apiBaseUrl, settings.captureToken, status.team_id, {
          mode: "latest",
        });
        chrome.runtime.sendMessage({ type: "JD_SETTINGS_UPDATED" }).catch(() => {});
      } catch (jdErr) {
        notify("Job captured", `${result.message || "Saved."} (JD source not updated: ${jdErr?.message || jdErr})`);
        return { ok: true, result, jdSourceWarning: jdErr?.message };
      }
    }

    notify(
      "Job captured",
      setJdToLatest
        ? `${result.message || "Saved."} JD source set to latest job bid.`
        : result.message || "Saved to Job Bid History.",
    );
    return { ok: true, result };
  } catch (err) {
    const msg = err?.message || String(err);
    notify("Capture failed", msg);
    return { ok: false, error: msg };
  } finally {
    capturingTabIds.delete(tabId);
  }
}

async function appendCaptureHistory(row) {
  const data = await chrome.storage.local.get({ [HISTORY_KEY]: [] });
  const list = Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [];
  const next = [row, ...list].slice(0, MAX_CAPTURE_HISTORY);
  await chrome.storage.local.set({ [HISTORY_KEY]: next });
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
    const username = settings.username || "";
    const usernameValid =
      Boolean(settings.usernameValidatedAt) &&
      isValidUsernameFormat(username) &&
      username === String(me.username || "").trim().toLowerCase();
    return {
      configured: true,
      connected: true,
      apiBaseUrl: settings.apiBaseUrl,
      apiEnv: settings.apiEnv,
      team_id: me.team_id,
      display_name: me.display_name,
      email: me.email,
      username: username,
      username_registered: me.username || null,
      username_validated: usernameValid,
      username_validated_at: settings.usernameValidatedAt || null,
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

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const base64 = btoa(binary);
  const mime = blob.type || "application/octet-stream";
  return `data:${mime};base64,${base64}`;
}

async function downloadBlobToPath(blob, filename) {
  // MV3 service workers may not expose URL.createObjectURL reliably.
  const dataUrl = await blobToDataUrl(blob);
  await chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
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

  const downloadPath = await downloadFilenameWithUserFolder(filename);
  await downloadBlobToPath(blob, downloadPath);

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
  await captureActiveTab(tab.id, { setJdToLatest: true });
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

  if (
    type === "OPEN_WORKSPACE" ||
    type === "CLOSE_WORKSPACE" ||
    type === "TOGGLE_WORKSPACE" ||
    type === "GET_WORKSPACE_STATE" ||
    type === "SET_WORKSPACE_WIDTH" ||
    type === "SET_WORKSPACE_COLLAPSED"
  ) {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      const tabId = tab?.id;
      if (!tabId) {
        sendResponse({ ok: false, error: "No active tab." });
        return;
      }
      if (!tabUrlInjectable(tab.url)) {
        sendResponse({ ok: false, error: "Workspace cannot open on this page." });
        return;
      }
      try {
        const out = await sendWorkspaceMessage(tabId, message);
        sendResponse(out || { ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Workspace message failed." });
      }
    });
    return true;
  }

  if (type === "GET_EXTENSION_STATUS") {
    getExtensionStatus().then(sendResponse);
    return true;
  }

  if (type === "APPLY_JD_FROM_SELECTION") {
    const field = message.field === "name" ? "name" : message.field === "text" ? "text" : null;
    if (!field) {
      sendResponse({ ok: false, error: "Invalid field." });
      return true;
    }
    applyJdFromSelection(field, String(message.value || ""))
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
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

  if (type === "CAPTURE_FROM_PANEL") {
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

  if (type === "GET_PAGE_CONTEXT" || type === "GET_SELECTED_TEXT") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        sendResponse({ status: "error", detail: "No active tab." });
        return;
      }
      try {
        const out = await chrome.tabs.sendMessage(tab.id, { type });
        sendResponse(out || {});
      } catch (err) {
        sendResponse({ status: "error", detail: err?.message || "Could not read page context." });
      }
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

  if (type === "VALIDATE_USERNAME") {
    (async () => {
      try {
        const settings = await loadExtensionSettings();
        if (!settings.captureToken) {
          sendResponse({ ok: false, error: "Add a capture token first." });
          return;
        }
        const username = String(message.username || "").trim().toLowerCase();
        if (!/^[a-z0-9_-]{3,32}$/.test(username)) {
          sendResponse({
            ok: false,
            error: "Invalid username format. Use 3-32 lowercase letters, numbers, underscore, or hyphen.",
          });
          return;
        }
        await validateExtensionUsername(settings.apiBaseUrl, settings.captureToken, username);
        await saveExtensionSettings({ username, usernameValidatedAt: new Date().toISOString() });
        sendResponse({ ok: true, username });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Username validation failed." });
      }
    })();
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
        const downloadPath = await downloadFilenameWithUserFolder(leaf);
        await downloadBlobToPath(blob, downloadPath);
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

  if (type === "PANEL_API") {
    (async () => {
      try {
        const settings = await loadExtensionSettings();
        const action = message.action;

        if (action === "SAVE_TOKEN") {
          const token = String(message.token || "").trim();
          if (!token) {
            sendResponse({ ok: false, error: "Paste a capture token first." });
            return;
          }
          await saveExtensionSettings({ captureToken: token });
          sendResponse({ ok: true });
          return;
        }
        if (action === "SAVE_ENV") {
          const apiEnv = message.apiEnv === "local" ? "local" : "production";
          await saveExtensionSettings({ apiEnv });
          sendResponse({ ok: true, apiEnv });
          return;
        }

        const status = await getExtensionStatus();
        if (!settings.captureToken) {
          sendResponse({ ok: false, error: "Add capture token in Settings." });
          return;
        }
        if (!status.connected) {
          sendResponse({ ok: false, error: status.error || "Extension not connected." });
          return;
        }
        const teamId = status.team_id;
        if (!teamId) {
          sendResponse({ ok: false, error: "No team on token." });
          return;
        }

        const base = settings.apiBaseUrl;
        const token = settings.captureToken;

        if (action === "FETCH_JD_SETTINGS") {
          const data = await fetchTeamJdSettings(base, token, teamId);
          sendResponse({ ok: true, data });
          return;
        }
        if (action === "PATCH_JD_SETTINGS") {
          await patchTeamJdSettings(base, token, teamId, message.payload || {});
          sendResponse({ ok: true });
          return;
        }
        if (action === "CREATE_MANUAL_JD") {
          let file = null;
          if (message.fileBase64 && message.fileName) {
            const bytes = base64ToUint8Array(message.fileBase64);
            file = new File([bytes], message.fileName, {
              type: message.mimeType || "application/octet-stream",
            });
          } else if (message.buffer && message.fileName) {
            file = new File([message.buffer], message.fileName, {
              type: message.mimeType || "application/octet-stream",
            });
          }
          const item = await postManualJdSource(base, token, teamId, {
            text: message.text || "",
            file,
            title: message.title || "",
          });
          sendResponse({ ok: true, item });
          return;
        }
        if (action === "FETCH_RESUME_LIBRARY") {
          const data = await fetchResumeLibrary(base, token, teamId);
          sendResponse({ ok: true, data });
          return;
        }
        if (action === "UPLOAD_RESUME") {
          if ((!message.fileBase64 && !message.buffer) || !message.fileName) {
            sendResponse({ ok: false, error: "Missing file data." });
            return;
          }
          const fileBits = message.fileBase64 ? base64ToUint8Array(message.fileBase64) : message.buffer;
          const file = new File([fileBits], message.fileName, {
            type:
              message.mimeType ||
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          });
          const item = await uploadResumeLibrary(base, token, teamId, file, message.setDefault === true);
          sendResponse({ ok: true, item });
          return;
        }
        if (action === "SET_RESUME_DEFAULT") {
          await patchResumeLibraryItem(base, token, teamId, String(message.resumeId || ""));
          sendResponse({ ok: true });
          return;
        }
        if (action === "DELETE_RESUME") {
          await deleteResumeLibraryItem(base, token, teamId, String(message.resumeId || ""));
          sendResponse({ ok: true });
          return;
        }
        sendResponse({ ok: false, error: `Unknown action: ${action}` });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }

  return false;
});
