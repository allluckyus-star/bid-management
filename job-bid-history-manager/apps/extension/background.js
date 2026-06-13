importScripts("config.js", "prompt-defaults.js", "groq-keys.js");
try {
  importScripts("groq-keys.local.js");
} catch (_e) {
  // groq-keys.local.js is optional (gitignored). Copy groq-keys.local.example.js to enable AI.
}
importScripts(
  "groq-router.js",
  "groq-client.js",
  "storage.js",
  "local-storage.js",
  "api.js",
  "download-path.js",
  "vendor/jszip.min.js",
  "file-text-extract.js",
  "vendor/docx-render.bundle.js",
);

const CHATGPT_URL_PATTERNS = [
  "https://chatgpt.com/*",
  "https://www.chatgpt.com/*",
  "https://chat.openai.com/*",
];
const HISTORY_KEY = "captureHistory";
const MAX_CAPTURE_HISTORY = 5;
const CAPTION_POLL_MS =
  typeof JBHM_CONFIG !== "undefined" && JBHM_CONFIG.CAPTION_POLL_MS
    ? JBHM_CONFIG.CAPTION_POLL_MS
    : 150;
const CAPTION_POLL_MAX_MS =
  typeof JBHM_CONFIG !== "undefined" && JBHM_CONFIG.CAPTION_POLL_MAX_MS
    ? JBHM_CONFIG.CAPTION_POLL_MAX_MS
    : 180_000;

/** Polls ChatGPT tab; forwards to panel only when caption text changes. */
let captionPollState = null;

function stopCaptionPoll() {
  if (!captionPollState) return;
  if (captionPollState.timer) clearTimeout(captionPollState.timer);
  captionPollState = null;
}

async function tickCaptionPoll() {
  const state = captionPollState;
  if (!state) return;

  const elapsed = Date.now() - state.startedAt;
  if (elapsed > CAPTION_POLL_MAX_MS) {
    stopCaptionPoll();
    void setPreviewCaptureMode(false);
    chrome.runtime.sendMessage({ type: "PREVIEW_CAPTURE_DONE", ok: false, reason: "timeout" }).catch(() => {});
    return;
  }

  try {
    const res = await sendToChatGptTab(state.tabId, { type: "GET_ASSISTANT_CAPTION_RAW" });
    if (res?.status === "ok") {
      const text = String(res.text || "");
      if (text !== state.lastCaption) {
        state.lastCaption = text;
        chrome.runtime
          .sendMessage({
            type: "GPT_CAPTION_UPDATE",
            text,
            full_len: text.length,
            generating: res.generating === true,
            elapsed_ms: elapsed,
          })
          .catch(() => {});
      }
    }
  } catch {
    /* ChatGPT tab closed or script unavailable */
  }

  state.timer = setTimeout(tickCaptionPoll, CAPTION_POLL_MS);
}

function startCaptionPoll(tabId) {
  if (!tabId) return;
  stopCaptionPoll();
  captionPollState = {
    tabId,
    lastCaption: "",
    startedAt: Date.now(),
    timer: null,
  };
  void tickCaptionPoll();
}

const GENERIC_TOAST_TITLES = new Set([
  "job bid history",
  "job bid assistant",
  "chatgpt",
  "jd source",
  "manual jd",
  "download",
]);

function toastVariantFor(text) {
  const t = String(text || "").toLowerCase();
  if (/(fail|error|not saved|disabled|not available|missing|no active|too short|invalid|rejected|could not)/.test(t)) {
    return "error";
  }
  if (/(ready|saved|captured|downloaded|download started|sent|finished|success|updated|done)/.test(t)) {
    return "success";
  }
  return "info";
}

/** Show an animated top-right web toast on the active tab (replaces system notifications). */
function notify(title, message = "") {
  const t = String(title || "").trim();
  const m = String(message || "").trim();
  const isGeneric = GENERIC_TOAST_TITLES.has(t.toLowerCase());
  const text = (!m ? t : isGeneric ? m : `${t}: ${m}`).slice(0, 280);
  if (!text) return;
  const variant = toastVariantFor(`${t} ${m}`);
  try {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      void chrome.runtime.lastError;
      const tab = tabs && tabs[0];
      if (!tab || tab.id == null) return;
      chrome.tabs.sendMessage(tab.id, { type: "SHOW_TOAST", text, variant }, () => {
        void chrome.runtime.lastError;
      });
    });
  } catch {
    /* tabs API unavailable */
  }
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

async function reloadWorkspacePanelsInTabs() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }
  for (const tab of tabs) {
    if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const iframe = document.getElementById("jbhm-workspace-iframe");
          if (!(iframe instanceof HTMLIFrameElement)) return;
          try {
            iframe.src = chrome.runtime.getURL("panel.html");
          } catch {
            /* stale content script — user must refresh the tab */
          }
        },
      });
    } catch {
      /* tab may not allow injection */
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();
  migratePromptTemplate();
  void reloadWorkspacePanelsInTabs();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenu();
  migratePromptTemplate();
  void reloadWorkspacePanelsInTabs();
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
  "moz-extension://",
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

async function applyJdFromSelection(field, value, pageUrl) {
  const settings = await loadExtensionSettings();
  if (!settings.captureToken) {
    throw new Error("Add a capture token in extension Settings.");
  }
  const status = await getExtensionStatus();
  if (!status.connected || !status.team_id) {
    throw new Error(status.error || "Extension not connected.");
  }
  await postApplyJdFromSelection(settings.apiBaseUrl, settings.captureToken, status.team_id, {
    field,
    value,
    page_url: field === "text" ? pageUrl || null : null,
    captured_by: status.captured_by || status.username || null,
  });
  const label = field === "name" ? "Manual JD name set." : "Manual JD text set.";
  notify("JD source", label);
  chrome.runtime.sendMessage({ type: "JD_SETTINGS_UPDATED" }).catch(() => {});
  return { ok: true };
}

function dashIfEmpty(value) {
  const s = String(value ?? "").trim();
  return s || "-";
}

function isPreviewFieldBlank(value) {
  const s = String(value ?? "").trim();
  return !s || s === "-";
}

function extractedPreviewFields(ex, capturedText) {
  const tags = Array.isArray(ex?.tag_names) ? ex.tag_names.filter(Boolean).join(", ") : "";
  return {
    job_title: dashIfEmpty(ex?.job_title),
    company_name: dashIfEmpty(ex?.company_name),
    location: dashIfEmpty(ex?.location),
    salary_text: dashIfEmpty(ex?.salary_text),
    employment_type: dashIfEmpty(ex?.employment_type),
    tags: dashIfEmpty(tags),
    jd_text: String(ex?.cleaned_job_description || capturedText || "").trim() || "-",
  };
}

/**
 * Run Groq extraction locally (direct API key) and write into Preview — never sends JD to JBHM server.
 * @param {{ mergeMode?: "replace" | "merge_empty" | "jd_only" }} opts
 */
async function extractAndFillPreview({
  tabId,
  capturedText,
  sourceUrl,
  pageTitle,
  captureMethod,
  mergeMode = "replace",
}) {
  if (!groqHasKeys()) {
    return {
      ok: false,
      error: "Groq keys not configured. Copy groq-keys.local.example.js to groq-keys.local.js and add API keys.",
    };
  }

  const text = String(capturedText || "").trim();
  if (text.length < 40) {
    return { ok: false, error: "Not enough text to extract." };
  }

  let res;
  try {
    const groqModel = await loadGroqModel();
    res = await groqExtractJobDirect(text, pageTitle || "", sourceUrl || "", groqModel);
  } catch (err) {
    return { ok: false, error: err?.message || "Extraction failed." };
  }

  const extracted = extractedPreviewFields(res?.extraction || {}, text);
  const existing = (await getPreviewDraft()) || {};
  const mode = mergeMode === "jd_only" || mergeMode === "merge_empty" ? mergeMode : "replace";

  let previewFields;
  if (mode === "jd_only") {
    previewFields = {
      ...existing,
      jd_text: extracted.jd_text,
      source_url: sourceUrl || existing.source_url || "",
      page_title: pageTitle || existing.page_title || "",
      capture_method: captureMethod || existing.capture_method || "selection-jd",
    };
  } else if (mode === "merge_empty") {
    previewFields = {
      ...existing,
      job_title: isPreviewFieldBlank(existing.job_title) ? extracted.job_title : existing.job_title,
      company_name: isPreviewFieldBlank(existing.company_name)
        ? extracted.company_name
        : existing.company_name,
      location: isPreviewFieldBlank(existing.location) ? extracted.location : existing.location,
      salary_text: isPreviewFieldBlank(existing.salary_text)
        ? extracted.salary_text
        : existing.salary_text,
      employment_type: isPreviewFieldBlank(existing.employment_type)
        ? extracted.employment_type
        : existing.employment_type,
      tags: isPreviewFieldBlank(existing.tags) ? extracted.tags : existing.tags,
      jd_text: extracted.jd_text,
      source_url: sourceUrl || existing.source_url || "",
      page_title: pageTitle || existing.page_title || "",
      capture_method: captureMethod || existing.capture_method || "upload",
    };
  } else {
    previewFields = {
      ...extracted,
      resume_path: "",
      notes: "",
      gpt_text: "",
      status: "applied",
      source_url: sourceUrl || "",
      page_title: pageTitle || "",
      capture_method: captureMethod || "capture",
    };
  }

  await savePreviewDraft(previewFields);

  const jdSaved = String(previewFields.jd_text || "").replace(/^-$/, "").trim();
  if (jdSaved) {
    const jdLocal = (await getLocalJdSource()) || {};
    await saveLocalJdSource({
      text: jdSaved,
      title: String(previewFields.manual_name || existing.manual_name || jdLocal.title || "").trim(),
      sourceUrl: previewFields.source_url || jdLocal.sourceUrl || "",
      sourceDomain: jdLocal.sourceDomain || "",
      sourceMode: captureMethod || jdLocal.sourceMode || "extract",
      pageTitle: previewFields.page_title || jdLocal.pageTitle || "",
      inputMode: jdLocal.inputMode || "text",
      useLatestBid: jdLocal.useLatestBid === true,
    });
  }

  await setOpenToPreview(true);
  if (tabId) {
    try {
      await sendWorkspaceMessage(tabId, { type: "OPEN_WORKSPACE" });
    } catch {
      /* ignore — panel may already be open or page not injectable */
    }
  }
  await sleep(350);
  chrome.runtime.sendMessage({ type: "PREVIEW_DRAFT_UPDATED" }).catch(() => {});
  return { ok: true, model: res?.model };
}

/** Write selected text into the Preview tab (JD body or manual name). */
async function fillPreviewFromSelection({ field, text, sourceUrl, pageTitle, tabId }) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { ok: false, error: "Empty selection." };

  const existing = (await getPreviewDraft()) || {};
  const maxChars = JBHM_CONFIG.MAX_CAPTURE_TEXT_CHARS || 30000;
  const jdLocal = (await getLocalJdSource()) || {};

  if (field === "jd") {
    const jdText = trimmed.slice(0, maxChars);
    await savePreviewDraft({
      ...existing,
      jd_text: jdText,
      source_url: sourceUrl || existing.source_url || "",
      page_title: pageTitle || existing.page_title || "",
    });
    await saveLocalJdSource({
      text: jdText,
      title: String(existing.manual_name || jdLocal.title || "").trim(),
      sourceUrl: sourceUrl || jdLocal.sourceUrl || "",
      sourceDomain: jdLocal.sourceDomain || "",
      sourceMode: "selection",
      pageTitle: pageTitle || jdLocal.pageTitle || "",
      inputMode: jdLocal.inputMode || "text",
      useLatestBid: jdLocal.useLatestBid === true,
    });
  } else if (field === "manual_name") {
    const name = trimmed.slice(0, 120);
    await savePreviewDraft({
      ...existing,
      manual_name: name,
    });
    await saveLocalJdSource({
      text: String(existing.jd_text || jdLocal.text || "").trim(),
      title: name,
      sourceUrl: jdLocal.sourceUrl || sourceUrl || "",
      sourceDomain: jdLocal.sourceDomain || "",
      sourceMode: jdLocal.sourceMode || "manual",
      pageTitle: jdLocal.pageTitle || pageTitle || "",
      inputMode: jdLocal.inputMode || "text",
      useLatestBid: jdLocal.useLatestBid === true,
    });
  } else {
    return { ok: false, error: "Invalid field." };
  }

  await setOpenToPreview(true);
  if (tabId) {
    try {
      await sendWorkspaceMessage(tabId, { type: "OPEN_WORKSPACE" });
    } catch {
      /* panel may already be open */
    }
  }
  chrome.runtime.sendMessage({
    type: "PREVIEW_DRAFT_UPDATED",
    fillOnly: true,
    field,
  }).catch(() => {});
  return { ok: true };
}

async function captureActiveTab(tabId, options = {}) {
  const setJdToLatest = options.setJdToLatest === true;
  const forceCapture = options.forceCapture === true;
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
  const captureStartedAt = Date.now();

  try {
    const pageData = await chrome.tabs.sendMessage(tabId, { type: "GET_VISIBLE_TEXT" });
    if (!hasContent(pageData)) {
      throw new Error("No job content found on this page.");
    }

    const sourceUrl = String(pageData.source_url || "").trim();
    if (!forceCapture && (await isDuplicateCaptureUrl(sourceUrl))) {
      const msg = "This page was captured recently. Wait 30 seconds or capture again to confirm.";
      notify("Job Bid History", msg);
      return { ok: false, error: msg, duplicate: true };
    }

    if (pageData.warning === "short_content") {
      notify("Job Bid History", "Captured text looks short — saving anyway.");
    }

    const result = await postCaptureJob(
      settings.apiBaseUrl,
      settings.captureToken,
      pageData,
      settings.username,
    );

    if (sourceUrl) {
      await setLastCapture(sourceUrl);
    }

    console.debug("[jbhm-capture]", {
      action: "capture/job",
      durationMs: Date.now() - captureStartedAt,
      textLength: (pageData.captured_text || "").length,
      success: true,
    });

    const status = await getExtensionStatus({ forceRefresh: true });
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
    console.debug("[jbhm-capture]", {
      action: "capture/job",
      durationMs: Date.now() - captureStartedAt,
      success: false,
      failure: msg.slice(0, 120),
    });
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

async function mergeRegisteredUsernames(...sources) {
  const seen = new Set();
  const out = [];
  for (const src of sources) {
    const list = Array.isArray(src) ? src : src ? [src] : [];
    for (const raw of list) {
      const name = String(raw || "").trim().toLowerCase();
      if (name && !seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
  }
  return out;
}

function inferApiEnvFromPageUrl(pageUrl) {
  const raw = String(pageUrl || "").trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return "local";
    const prodHost = new URL(JBHM_CONFIG.PRODUCTION_URL).hostname.toLowerCase();
    if (host === prodHost) return "production";
  } catch (_) {
    /* ignore invalid URLs */
  }
  return null;
}

function alternateApiBaseUrl(baseUrl) {
  const normalized = String(baseUrl || "").replace(/\/$/, "");
  const localUrl = JBHM_CONFIG.LOCAL_URL.replace(/\/$/, "");
  const prodUrl = JBHM_CONFIG.PRODUCTION_URL.replace(/\/$/, "");
  if (normalized === localUrl) return prodUrl;
  if (normalized === prodUrl) return localUrl;
  return null;
}

async function fetchUsernamesFromServer(baseUrl, token) {
  const parts = [];
  try {
    const data = await fetchExtensionUsernames(baseUrl, token);
    parts.push(...(Array.isArray(data.usernames) ? data.usernames : []));
  } catch (_) {
    /* optional route on older servers */
  }
  try {
    const me = await fetchExtensionMe(baseUrl, token);
    parts.push(...(Array.isArray(me.usernames) ? me.usernames : []));
    if (me.username) parts.push(me.username);
  } catch (err) {
    if (!parts.length) throw err;
  }
  return mergeRegisteredUsernames(parts);
}

/** Load all usernames; if primary server returns too few, also try the alternate (local vs production). */
async function fetchAllRegisteredUsernames(baseUrl, token) {
  let primary = [];
  try {
    primary = await fetchUsernamesFromServer(baseUrl, token);
  } catch (_) {
    primary = [];
  }
  if (primary.length > 1) return primary;
  const alt = alternateApiBaseUrl(baseUrl);
  if (!alt) return primary;
  try {
    const secondary = await fetchUsernamesFromServer(alt, token);
    return mergeRegisteredUsernames(primary, secondary);
  } catch (_) {
    return primary;
  }
}

async function syncApiEnvFromPageUrl(pageUrl) {
  const inferred = inferApiEnvFromPageUrl(pageUrl);
  const settings = await loadExtensionSettings();
  if (!inferred || settings.apiEnv === inferred) {
    return { switched: false, apiEnv: settings.apiEnv };
  }
  await saveExtensionSettings({ apiEnv: inferred });
  await clearExtensionStatusCache();
  return { switched: true, apiEnv: inferred };
}

async function buildExtensionStatusFromNetwork(settings) {
  const me = await fetchExtensionMe(settings.apiBaseUrl, settings.captureToken);
  const registeredUsernames = await fetchAllRegisteredUsernames(settings.apiBaseUrl, settings.captureToken);
  const username = settings.username || "";
  const registered = new Set(registeredUsernames);
  const usernameValid = isValidUsernameFormat(username) && registered.has(username);
  return {
    configured: true,
    connected: true,
    apiBaseUrl: settings.apiBaseUrl,
    apiEnv: settings.apiEnv,
    team_id: me.team_id,
    display_name: me.display_name,
    email: me.email,
    username,
    username_registered: me.username || null,
    registered_usernames: registeredUsernames,
    username_validated: usernameValid,
    username_validated_at: settings.usernameValidatedAt || null,
    captured_by: me.captured_by,
    dashboard_url: me.dashboard_url || "/dashboard",
  };
}

const LAST_REGISTERED_USERNAMES_KEY = "lastRegisteredUsernames";

async function buildStatusFromSettingsOnly(settings) {
  const stored = await chrome.storage.local.get({ [LAST_REGISTERED_USERNAMES_KEY]: [] });
  const registeredUsernames = Array.isArray(stored[LAST_REGISTERED_USERNAMES_KEY])
    ? stored[LAST_REGISTERED_USERNAMES_KEY]
    : [];
  const username = settings.username || "";
  const registered = new Set(registeredUsernames.map((u) => String(u || "").trim().toLowerCase()));
  return {
    configured: Boolean(settings.captureToken),
    connected: false,
    apiBaseUrl: settings.apiBaseUrl,
    apiEnv: settings.apiEnv,
    username,
    registered_usernames: registeredUsernames,
    username_validated:
      Boolean(username && settings.usernameValidatedAt) ||
      (Boolean(username) && registered.has(username)),
    username_validated_at: settings.usernameValidatedAt || null,
  };
}

async function getExtensionStatus(options = {}) {
  const forceRefresh = options.forceRefresh === true;
  const cacheOnly = options.cacheOnly === true;
  const settings = await loadExtensionSettings();
  if (!settings.captureToken) {
    return {
      configured: false,
      apiBaseUrl: settings.apiBaseUrl,
      apiEnv: settings.apiEnv,
    };
  }

  if (cacheOnly) {
    const { status } = await getCachedExtensionStatus();
    if (status) return status;
    return buildStatusFromSettingsOnly(settings);
  }

  if (!forceRefresh) {
    const { status, cachedAt } = await getCachedExtensionStatus();
    if (status && isExtensionStatusCacheFresh(cachedAt)) {
      return status;
    }
  }

  try {
    const status = await buildExtensionStatusFromNetwork(settings);
    await setCachedExtensionStatus(status);
    if (Array.isArray(status.registered_usernames) && status.registered_usernames.length) {
      await chrome.storage.local.set({ [LAST_REGISTERED_USERNAMES_KEY]: status.registered_usernames });
    }
    return status;
  } catch (err) {
    const disconnected = {
      configured: true,
      connected: false,
      apiBaseUrl: settings.apiBaseUrl,
      apiEnv: settings.apiEnv,
      error: err?.message || String(err),
    };
    await setCachedExtensionStatus(disconnected);
    return disconnected;
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

function isValidDocxBuffer(buffer) {
  const u8 = new Uint8Array(buffer);
  // DOCX is a ZIP archive — must start with PK\x03\x04
  return (
    u8.length >= 4 &&
    u8[0] === 0x50 &&
    u8[1] === 0x4b &&
    (u8[2] === 0x03 || u8[2] === 0x05 || u8[2] === 0x07) &&
    (u8[3] === 0x04 || u8[3] === 0x06 || u8[3] === 0x08)
  );
}

/** Base64 encode without spread (spread corrupts large DOCX binaries in service workers). */
function uint8ArrayToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < u8.length; i += chunkSize) {
    const slice = u8.subarray(i, Math.min(i + chunkSize, u8.length));
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

async function downloadBlobToPath(blob, filename) {
  const buffer = await blob.arrayBuffer();
  if (!isValidDocxBuffer(buffer)) {
    const head = new TextDecoder().decode(new Uint8Array(buffer).slice(0, 240));
    const hint = head.trimStart().startsWith("{") || head.includes('"error"')
      ? "Server returned JSON instead of a DOCX file."
      : "File is not a valid DOCX (ZIP header missing).";
    throw new Error(`${hint} Check GPT JSON and try again.`);
  }

  const docxBlob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  // Prefer blob URL — avoids data-URL size limits and base64 corruption.
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    const objectUrl = URL.createObjectURL(docxBlob);
    try {
      await chrome.downloads.download({ url: objectUrl, filename, saveAs: false });
    } finally {
      setTimeout(() => {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          /* ignore */
        }
      }, 120_000);
    }
    return;
  }

  const dataUrl = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${uint8ArrayToBase64(new Uint8Array(buffer))}`;
  await chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
}

/** Full Resume-sender style flow: server prompt → paste/send → auto capture → upload → download */
async function runGenerateChatGptPrompt(tabOverride) {
  const tab = tabOverride || (await getActiveTab());
  if (!(await isExtensionEnabled())) {
    throw new Error("Extension is OFF. Turn it ON in Settings.");
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
    username: status.username,
    display_name: status.display_name,
    email: status.email,
    captured_by: status.captured_by,
  };
  return resolveDownloadFilename(me, leafFilename);
}

function parseResumeNameFromGptText(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return "";
    const data = JSON.parse(raw.slice(start, end + 1));
    const resume = data.optimized_resume || data.optimizedResume || data.resume;
    return String(resume?.header?.name || "").trim();
  } catch {
    return "";
  }
}

/** Build DOCX locally in the extension (no server round-trip). */
async function requestRenderDocx(gptText, opts = {}) {
  if (typeof JBHM_DOCX_RENDER?.renderGptTextToDocx !== "function") {
    throw new Error(
      "DOCX renderer not loaded. Rebuild the extension (npm run build:extension-docx).",
    );
  }

  const docxStyle = opts.docx_style || (await loadResumeDocxStyle());
  const { arrayBuffer, filename } = await JBHM_DOCX_RENDER.renderGptTextToDocx(gptText, {
    jd_label: opts.jd_label,
    docx_style: docxStyle,
  });

  const u8 = new Uint8Array(arrayBuffer);
  const isZip =
    u8.length >= 4 &&
    u8[0] === 0x50 &&
    u8[1] === 0x4b &&
    (u8[2] === 0x03 || u8[2] === 0x05) &&
    (u8[3] === 0x04 || u8[3] === 0x06);
  if (!isZip) {
    throw new Error("DOCX generation produced an invalid file.");
  }

  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  return { blob, filename };
}

function buildLocalDownloadMe(settings, status, gptText) {
  const resumeName = parseResumeNameFromGptText(gptText);
  return {
    username: settings.username || status?.username || "local",
    display_name: resumeName || status?.display_name || "Resume",
    email: status?.email || null,
    captured_by: settings.username || status?.captured_by || null,
  };
}

/**
 * Render the optimized resume DOCX from the GPT result and download it to:
 *   Downloads/jbhm/username-YYYY-MM-DD/Company-Role/Resume Name.docx
 * Returns the Downloads-rooted display path (for the Preview "resume path" field).
 */
async function renderAndSaveResumeFromGptText(gptText, previewFields) {
  const settings = await loadExtensionSettings();
  const status = settings.captureToken ? await getExtensionStatus().catch(() => ({})) : {};

  const company = previewFields?.company_name === "-" ? "" : previewFields?.company_name || "";
  const role = previewFields?.job_title === "-" ? "" : previewFields?.job_title || "";
  const manualFromPreview =
    previewFields?.manual_name === "-" ? "" : String(previewFields?.manual_name || "").trim();

  const me = buildLocalDownloadMe(settings, status, gptText);
  const resumeName = parseResumeNameFromGptText(gptText);
  const resumeText = await getLocalResumeText();
  const outputTemplate = await loadOutputPathTemplate();
  const opts = {
    userName: resumeName,
    companyName: company,
    jobTitle: role,
    resumeText,
    manualName: manualFromPreview,
  };

  const ctx = buildOutputPathContext(me, opts);
  const pathCheck = validateOutputPathTemplateContext(outputTemplate, ctx);
  if (!pathCheck.ok) throw new Error(pathCheck.error);

  const { blob } = await requestRenderDocx(gptText, {
    jd_label: [company, role].filter(Boolean).join(" - ") || "resume",
  });

  const relativePath = buildResumePathFromTemplate(outputTemplate, me, opts);
  await downloadBlobToPath(blob, relativePath);
  return outputTemplate ? `Downloads/${relativePath}` : buildResumeDownloadPath(me, opts);
}

async function downloadManualDocxFromGptText(text, tabId) {
  const settings = await loadExtensionSettings();
  const chatTabId = tabId || (await findChatGptTabId());
  if (chatTabId) {
    await showTabToast({ id: chatTabId }, "GPT done — building DOCX…", "success");
  }
  notify("Manual JD", "Building DOCX…");

  const modeData = await chrome.storage.local.get({ manualJdLabel: "Manual JD" });
  const { blob, filename } = await requestRenderDocx(text, {
    jd_label: modeData.manualJdLabel,
  });

  const downloadPath = await downloadFilenameWithUserFolder(filename);
  await downloadBlobToPath(blob, downloadPath);

  notify("Manual JD", `Downloaded to ${downloadPath}`);
  if (chatTabId) {
    await showTabToast({ id: chatTabId }, `DOCX downloaded: ${filename}`, "success");
  }

  return { filename, manual: true };
}

async function submitGptResultText(text, opts = {}) {
  if (opts.previewOnly || (await isPreviewCaptureMode())) {
    stopCaptionPoll();
    await setPreviewCaptureMode(false);
    // Merge GPT result into the existing preview draft so extracted fields are kept.
    const existing = (await getPreviewDraft()) || {};
    let resume_path = existing.resume_path || "";
    let resumeError = "";
    try {
      // Build the optimized resume DOCX and save it to the per-job folder.
      resume_path = await renderAndSaveResumeFromGptText(text, existing);
    } catch (err) {
      resumeError = err?.message || String(err);
    }
    await savePreviewDraft({
      ...existing,
      gpt_text: text,
      resume_path,
    });
    if (!resumeError && !opts.skipNotify) {
      notify("Resume ready", `Saved to ${resume_path}`);
    } else if (resumeError && !opts.skipNotify) {
      notify("Resume not saved", resumeError);
    }
    chrome.runtime
      .sendMessage({
        type: "PREVIEW_DRAFT_UPDATED",
        resumeSaved: !resumeError,
        resumePath: resume_path,
        resumeError,
        skipToast: opts.skipPanelToast === true,
      })
      .catch(() => {});
    return { preview: true, resume_path, resumeError };
  }

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
    } catch (dlErr) {
      const msg = dlErr?.message || String(dlErr);
      notify("Download failed", msg);
      return { ...result, download_error: msg };
    }
  }

  return result;
}

async function persistPreviewResumePath(resume_path) {
  const trimmed = String(resume_path || "").trim();
  if (!trimmed) return;
  const existing = (await getPreviewDraft()) || {};
  await savePreviewDraft({ ...existing, resume_path: trimmed });
  chrome.runtime
    .sendMessage({
      type: "PREVIEW_DRAFT_UPDATED",
      resumeSaved: true,
      resumePath: trimmed,
      skipToast: true,
    })
    .catch(() => {});
}

async function downloadLastExport() {
  const settings = await loadExtensionSettings();
  const opt = await loadActiveOptimization();
  const exportId = opt?.lastExportId;
  const teamId = opt?.teamId;

  let resume_path = "";

  if (settings.captureToken && exportId && teamId) {
    const url = `${settings.apiBaseUrl}/api/team/${teamId}/resume-exports/${exportId}/download`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${settings.captureToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(parseApiErrorBody(text, res.status));
    }
    const out = await downloadExportResponse(res, opt);
    resume_path = formatDownloadsDisplayPath(out.filename);
  } else {
    const preview = (await getPreviewDraft()) || {};
    const gptText = String(preview.gpt_text || "").trim();
    if (!gptText) {
      throw new Error("No export ready yet. Run GPT Prompt / GPT Result first.");
    }
    resume_path = await renderAndSaveResumeFromGptText(gptText, preview);
  }

  await persistPreviewResumePath(resume_path);
  return { downloadPath: resume_path, resume_path };
}

async function downloadExportResponse(res, opt) {

  const blob = await res.blob();
  const leaf =
    parseFilenameFromContentDisposition(res.headers.get("Content-Disposition")) ||
    opt.lastFilename ||
    "resume.docx";
  const downloadPath = await downloadFilenameWithUserFolder(leaf);
  await downloadBlobToPath(blob, downloadPath);
  return { ok: true, filename: downloadPath };
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "jbhm-capture" || !tab?.id) return;
  if (!tabUrlInjectable(tab.url)) {
    notify("Job Bid History", "Capture is not available on this page.");
    return;
  }
  if (tabIsChatGpt(tab)) {
    notify("Job Bid History", "Capture is disabled on the ChatGPT page.");
    return;
  }
  notify("Job Bid History", "Reading page and extracting with AI…");
  try {
    const pageData = await chrome.tabs.sendMessage(tab.id, { type: "GET_VISIBLE_TEXT" });
    const out = await extractAndFillPreview({
      tabId: tab.id,
      capturedText: pageData?.captured_text || "",
      sourceUrl: pageData?.source_url || tab.url || "",
      pageTitle: pageData?.page_title || tab.title || "",
      captureMethod: pageData?.capture_method || "page",
    });
    if (!out.ok) notify("Capture failed", out.error || "Could not extract job data.");
  } catch (err) {
    notify("Capture failed", err?.message || String(err));
  }
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
    getExtensionStatus({
      forceRefresh: message.forceRefresh === true,
      cacheOnly: message.cacheOnly === true,
    }).then(sendResponse);
    return true;
  }

  if (type === "APPLY_JD_FROM_SELECTION") {
    const field = message.field === "name" ? "name" : message.field === "text" ? "text" : null;
    if (!field) {
      sendResponse({ ok: false, error: "Invalid field." });
      return true;
    }
    applyJdFromSelection(field, String(message.value || ""), String(message.pageUrl || ""))
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true;
  }

  if (type === "EXTRACT_DOC") {
    (async () => {
      try {
        const fileBase64 = String(message.fileBase64 || "");
        const fileName = String(message.fileName || "");
        if (!fileBase64 || !fileName) {
          sendResponse({ ok: false, error: "Missing file data." });
          return;
        }
        const bytes = base64ToUint8Array(fileBase64);
        const file = new File([bytes], fileName, {
          type: message.mimeType || "application/octet-stream",
        });
        const text = String(await extractTextFromUploadFile(file)).trim();
        sendResponse({ ok: true, text });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (type === "GENERATE_RESUME_PROMPT") {
    (async () => {
      try {
        if (!groqHasKeys()) {
          sendResponse({ ok: false, error: "Groq keys not configured." });
          return;
        }
        const prompt = String(message.prompt || "").trim();
        if (prompt.length < 40) {
          sendResponse({ ok: false, error: "Final prompt is too short." });
          return;
        }
        const groqModel = await loadGroqModel();
        const gen = await groqGenerateDirect(
          prompt,
          String(message.purpose || "resume_optimization"),
          groqModel,
        );
        const gptText = String(gen?.text || "").trim();
        if (!gptText) {
          sendResponse({ ok: false, error: "Empty response from model." });
          return;
        }
        const meta = {
          model: gen.modelLabel || "groq",
          latency_ms: gen.latencyMs,
          strategy: gen.strategy || "direct",
          fallback_count: gen.fallbackCount ?? 0,
          prompt_strategy: "final-prompt",
        };
        const existing = (await getPreviewDraft()) || {};
        let resume_path = existing.resume_path || "";
        let resumeError = "";
        try {
          resume_path = await renderAndSaveResumeFromGptText(gptText, existing);
        } catch (err) {
          resumeError = err?.message || String(err);
        }
        await savePreviewDraft({
          ...existing,
          gpt_text: gptText,
          resume_path,
          generation_meta: meta,
        });
        await setOpenToPreview(true);
        chrome.runtime
          .sendMessage({
            type: "PREVIEW_DRAFT_UPDATED",
            resumeSaved: !resumeError,
            resumePath: resume_path,
            resumeError,
            generationMeta: meta,
          })
          .catch(() => {});
        sendResponse({ ok: true, meta, resume_path, resumeError });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (type === "AI_ANALYZE_JD_FOR_PROMPT") {
    (async () => {
      try {
        if (!groqHasKeys()) {
          sendResponse({ ok: false, error: "Groq keys not configured." });
          return;
        }
        const jdText = String(message.jd_text || "").trim();
        if (jdText.length < 40) {
          sendResponse({ ok: false, error: "JD text is too short for AI analysis." });
          return;
        }
        const groqModel = await loadGroqModel();
        const gen = await groqAnalyzeJdDirect(jdText, groqModel);
        const parsed = parseJsonObject(gen.text);
        if (parsed && typeof parsed === "object") {
          sendResponse({ ok: true, analysis: parsed, formatted: JSON.stringify(parsed, null, 2), meta: gen });
        } else {
          sendResponse({ ok: false, error: "Could not parse JD analysis JSON." });
        }
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (type === "EXTRACT_TO_PREVIEW" || type === "EXTRACT_JD_WITH_AI") {
    (async () => {
      let tabId = message.tabId || null;
      let sourceUrl = String(message.sourceUrl || "");
      let pageTitle = String(message.pageTitle || "");
      if (!message.fromPanel) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        tabId = tab?.id || tabId;
        sourceUrl = sourceUrl || String(tab?.url || "");
        pageTitle = pageTitle || String(tab?.title || "");
      }
      const mergeMode =
        message.mergeMode ||
        (type === "EXTRACT_JD_WITH_AI" ? "jd_only" : "replace");
      const out = await extractAndFillPreview({
        tabId,
        capturedText: String(message.text || ""),
        sourceUrl,
        pageTitle,
        captureMethod: String(message.captureMethod || "selection"),
        mergeMode,
      });
      sendResponse(out);
    })();
    return true;
  }

  if (type === "FILL_PREVIEW_FROM_SELECTION") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      const field = message.field === "manual_name" ? "manual_name" : message.field === "jd" ? "jd" : null;
      if (!field) {
        sendResponse({ ok: false, error: "Invalid field." });
        return;
      }
      try {
        const out = await fillPreviewFromSelection({
          field,
          text: String(message.text || ""),
          sourceUrl: String(message.sourceUrl || tab?.url || ""),
          pageTitle: String(message.pageTitle || tab?.title || ""),
          tabId: tab?.id,
        });
        sendResponse(out);
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    });
    return true;
  }

  if (type === "CAPTURE_REVIEWED_SAVE") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab." });
        return;
      }
      const settings = await loadExtensionSettings();
      if (!settings.captureToken) {
        sendResponse({ ok: false, error: "Add capture token in Settings." });
        return;
      }
      if (
        !settings.username ||
        !settings.usernameValidatedAt ||
        !isValidUsernameFormat(settings.username)
      ) {
        sendResponse({ ok: false, error: "Validate username in Settings first." });
        return;
      }
      const reviewed = message.reviewed || {};
      const sourceUrl = String(reviewed.source_url || "").trim();
      if (!message.forceCapture && (await isDuplicateCaptureUrl(sourceUrl))) {
        sendResponse({
          ok: false,
          error: "This page was captured recently. Wait 30 seconds or save again to confirm.",
          duplicate: true,
        });
        return;
      }
      if (capturingTabIds.has(tab.id)) {
        sendResponse({ ok: false, error: "Capture already in progress." });
        return;
      }
      capturingTabIds.add(tab.id);
      const startedAt = Date.now();
      try {
        const pageData = {
          captured_text: reviewed.captured_text,
          source_url: reviewed.source_url,
          page_title: reviewed.page_title,
          capture_method: reviewed.capture_method,
        };
        const result = await postCaptureJob(
          settings.apiBaseUrl,
          settings.captureToken,
          pageData,
          settings.username,
          reviewed,
        );
        if (sourceUrl) await setLastCapture(sourceUrl);
        console.debug("[jbhm-capture]", {
          action: "capture/job",
          durationMs: Date.now() - startedAt,
          textLength: (reviewed.captured_text || "").length,
          extractionSource: reviewed.extraction_source || "client-reviewed",
          success: true,
        });
        await getExtensionStatus({ forceRefresh: true });
        sendResponse({ ok: true, result });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      } finally {
        capturingTabIds.delete(tab.id);
      }
    });
    return true;
  }

  if (type === "DOWNLOAD_LATEST_GPT_RESULT") {
    (async () => {
      try {
        const tab = await getActiveTab();
        if (!tabIsChatGpt(tab)) {
          throw new Error("Open ChatGPT in the active tab first.");
        }
        const gptRes = await sendToChatGptTab(tab.id, { type: "GET_LATEST_GPT_TEXT" });
        if (gptRes?.status !== "ok") {
          throw new Error(gptRes?.detail || "No valid GPT JSON in the latest message.");
        }
        const result = await submitGptResultText(String(gptRes.text || ""), {
          previewOnly: true,
          tabId: tab.id,
          skipPanelToast: true,
          skipNotify: true,
        });
        sendResponse({
          status: "ok",
          resume_path: result?.resume_path || "",
          resumeError: result?.resumeError || "",
        });
      } catch (err) {
        sendResponse({ status: "error", detail: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (type === "PASTE_LOCAL_PROMPT") {
    (async () => {
      try {
        let tab = await getActiveTab();
        if (message.requireActiveChatGpt) {
          if (!tabIsChatGpt(tab)) {
            throw new Error("Open ChatGPT in the active tab first.");
          }
        } else if (!tabIsChatGpt(tab)) {
          const chatId = await findChatGptTabId();
          if (!chatId) throw new Error("Open ChatGPT in a tab first.");
          tab = { id: chatId };
        }
        if (message.previewOnly) {
          await setPreviewCaptureMode(true);
        }
        await pasteAndSubmitOnTab(
          tab.id,
          String(message.text || ""),
          message.autoCapture !== false,
          message.manualOnly === true,
        );
        if (message.previewOnly) {
          startCaptionPoll(tab.id);
        }
        sendResponse({ status: "ok" });
      } catch (err) {
        sendResponse({ status: "error", detail: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (type === "CAPTURE_FROM_POPUP") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab." });
        return;
      }
      if (!tabUrlInjectable(tab.url)) {
        sendResponse({
          ok: false,
          error: "Capture is not available on browser internal pages.",
        });
        return;
      }
      if (JBHM_CONFIG.FREE_TIER_SAFE_MODE) {
        try {
          await sendWorkspaceMessage(tab.id, { type: "OPEN_WORKSPACE" });
          sendResponse({
            ok: true,
            message: "Workspace opened — review in Preview tab, then Accept & send to dashboard.",
          });
        } catch (err) {
          sendResponse({ ok: false, error: err?.message || "Could not open workspace." });
        }
        return;
      }
      const out = await captureActiveTab(tab.id, {
        forceCapture: message.forceCapture === true,
      });
      sendResponse(out);
    });
    return true;
  }

  if (type === "CAPTURE_FROM_PANEL") {
    sendResponse({
      ok: false,
      error: "Use Capture tab → Save to Dashboard (review-first).",
    });
    return true;
  }

  if (type === "SYNC_API_ENV_FROM_PAGE") {
    syncApiEnvFromPageUrl(message.pageUrl)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
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
        await clearExtensionStatusCache();
        const status = await buildExtensionStatusFromNetwork(settings);
        await setCachedExtensionStatus(status);
        sendResponse({ ok: true, me });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err?.message || String(err) });
      });
    return true;
  }

  if (type === "FETCH_REGISTERED_USERNAMES") {
    (async () => {
      try {
        const settings = await loadExtensionSettings();
        if (!settings.captureToken) {
          sendResponse({ ok: false, error: "Add a capture token first.", usernames: [] });
          return;
        }
        const usernames = await fetchAllRegisteredUsernames(settings.apiBaseUrl, settings.captureToken);
        await chrome.storage.local.set({ [LAST_REGISTERED_USERNAMES_KEY]: usernames });
        sendResponse({ ok: true, usernames });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err), usernames: [] });
      }
    })();
    return true;
  }

  if (type === "SET_ACTIVE_USERNAME") {
    (async () => {
      try {
        const username = String(message.username || "").trim().toLowerCase();
        if (!/^[a-z0-9_-]{3,32}$/.test(username)) {
          sendResponse({
            ok: false,
            error: "Invalid username format. Use 3-32 lowercase letters, numbers, underscore, or hyphen.",
          });
          return;
        }
        const validatedAt = new Date().toISOString();
        const { status: priorStatus } = await getCachedExtensionStatus();
        await saveExtensionSettings({ username, usernameValidatedAt: validatedAt });
        const nextStatus = {
          ...(priorStatus || (await buildStatusFromSettingsOnly(await loadExtensionSettings()))),
          username,
          username_validated: true,
          username_validated_at: validatedAt,
        };
        await setCachedExtensionStatus(nextStatus);
        sendResponse({ ok: true, username, validatedAt });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
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

  if (type === "RENDER_PREVIEW_DOCX") {
    (async () => {
      try {
        const result = await downloadManualDocxFromGptText(String(message.text || ""), null);
        await saveLastGeneratedDocxReference({ filename: result.filename, at: new Date().toISOString() });
        sendResponse({ status: "ok", filename: result.filename });
      } catch (err) {
        sendResponse({ status: "error", detail: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (type === "PREVIEW_CAPTURE_DONE") {
    stopCaptionPoll();
    void setPreviewCaptureMode(false);
    sendResponse({ ok: true });
    return true;
  }

  if (type === "SEND_GPT_RESULT") {
    (async () => {
      try {
        // Local-first: every GPT result goes to the Preview tab (builds the optimized
        // resume DOCX with the new path and fills the resume path), never straight to server.
        const result = await submitGptResultText(String(message.text || ""), {
          autoDownload: false,
          previewOnly: true,
          tabId: _sender?.tab?.id,
        });
        sendResponse({ status: "ok", result, manual: result?.manual === true, preview: result?.preview === true });
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
        const out = await downloadLastExport();
        sendResponse({
          status: "ok",
          downloadPath: out?.downloadPath || out?.resume_path || out?.filename || "",
        });
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
          const items = await upsertSavedCaptureToken(token);
          sendResponse({ ok: true, token, items, active: token });
          return;
        }
        if (action === "LIST_TOKENS") {
          const items = await listSavedCaptureTokens();
          const active = (await loadExtensionSettings()).captureToken || "";
          sendResponse({ ok: true, items, active, token: active });
          return;
        }
        if (action === "SET_ACTIVE_TOKEN") {
          const token = String(message.token || "").trim();
          if (!token) {
            sendResponse({ ok: false, error: "Select a token first." });
            return;
          }
          const active = await setActiveCaptureToken(token);
          sendResponse({ ok: true, active, items: await listSavedCaptureTokens() });
          return;
        }
        if (action === "GET_TOKEN") {
          const items = await listSavedCaptureTokens();
          const active = settings.captureToken || "";
          sendResponse({ ok: true, token: active, items, active });
          return;
        }
        if (action === "DELETE_TOKEN") {
          const token = String(message.token || settings.captureToken || "").trim();
          if (!token) {
            sendResponse({ ok: false, error: "No token to remove." });
            return;
          }
          const items = await removeSavedCaptureToken(token);
          const active = (await loadExtensionSettings()).captureToken || "";
          sendResponse({ ok: true, items, active });
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
            source_origin: file ? "upload" : "extension",
            local_file_path: file?.name || message.local_file_path || "",
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
