/** @typedef {import('./config.js').ApiEnvironment} ApiEnvironment */

/**
 * @typedef {object} ExtensionSettings
 * @property {string} captureToken
 * @property {ApiEnvironment} apiEnv
 * @property {string} username
 * @property {string|null} usernameValidatedAt
 */

const EXTENSION_STATUS_CACHE_KEY = "extensionStatusCache";
const EXTENSION_STATUS_CACHE_AT_KEY = "extensionStatusCacheAt";
const LAST_CAPTURE_URL_KEY = "lastCaptureUrl";
const LAST_CAPTURE_AT_KEY = "lastCaptureAt";
const PROMPT_TEMPLATE_LOCAL_KEY = "promptTemplateLocal";

function statusCacheTtlMs() {
  return JBHM_CONFIG.STATUS_CACHE_TTL_MS ?? 5 * 60 * 1000;
}

function getApiBaseUrl(apiEnv) {
  return apiEnv === "local"
    ? JBHM_CONFIG.LOCAL_URL
    : JBHM_CONFIG.PRODUCTION_URL;
}

async function migrateLegacySyncSettings() {
  const local = await chrome.storage.local.get(["captureToken"]);
  if (local.captureToken) return;

  const legacy = await chrome.storage.sync.get({
    captureToken: "",
    apiUrl: "",
    capturedBy: "",
  });
  if (!legacy.captureToken) return;

  const apiUrl = String(legacy.apiUrl || "").replace(/\/$/, "");
  const apiEnv =
    apiUrl.includes("localhost") || apiUrl.includes("127.0.0.1")
      ? "local"
      : "production";

  await chrome.storage.local.set({
    captureToken: String(legacy.captureToken).trim(),
    apiEnv,
  });
}

async function loadExtensionSettings() {
  await migrateLegacySyncSettings();
  const stored = await chrome.storage.local.get({
    captureToken: "",
    apiEnv: JBHM_CONFIG.DEFAULT_ENV,
    username: "",
    usernameValidatedAt: null,
  });
  const apiEnv = stored.apiEnv === "local" ? "local" : "production";
  return {
    captureToken: String(stored.captureToken || "").trim(),
    username: String(stored.username || "").trim().toLowerCase(),
    usernameValidatedAt: stored.usernameValidatedAt || null,
    apiEnv,
    apiBaseUrl: getApiBaseUrl(apiEnv).replace(/\/$/, ""),
  };
}

async function saveExtensionSettings(patch) {
  const next = {};
  let clearStatusCache = false;
  if (patch.captureToken !== undefined) {
    next.captureToken = patch.captureToken.trim();
    clearStatusCache = true;
  }
  if (patch.apiEnv !== undefined) {
    next.apiEnv = patch.apiEnv === "local" ? "local" : "production";
    clearStatusCache = true;
  }
  if (patch.username !== undefined) {
    next.username = String(patch.username || "").trim().toLowerCase();
    clearStatusCache = true;
  }
  if (patch.usernameValidatedAt !== undefined) {
    next.usernameValidatedAt = patch.usernameValidatedAt || null;
    clearStatusCache = true;
  }
  await chrome.storage.local.set(next);
  if (clearStatusCache) {
    await clearExtensionStatusCache();
  }
}

const SAVED_CAPTURE_TOKENS_KEY = "savedCaptureTokens";

async function listSavedCaptureTokens() {
  await migrateLegacyCaptureTokenToList();
  const data = await chrome.storage.local.get({ [SAVED_CAPTURE_TOKENS_KEY]: [] });
  const items = Array.isArray(data[SAVED_CAPTURE_TOKENS_KEY]) ? data[SAVED_CAPTURE_TOKENS_KEY] : [];
  return items
    .map((item) => ({
      token: String(item?.token || "").trim(),
      savedAt: item?.savedAt || null,
    }))
    .filter((item) => item.token);
}

async function migrateLegacyCaptureTokenToList() {
  const stored = await chrome.storage.local.get({
    captureToken: "",
    [SAVED_CAPTURE_TOKENS_KEY]: [],
  });
  const legacyToken = String(stored.captureToken || "").trim();
  const items = Array.isArray(stored[SAVED_CAPTURE_TOKENS_KEY]) ? stored[SAVED_CAPTURE_TOKENS_KEY] : [];
  if (!legacyToken || items.some((item) => String(item?.token || "").trim() === legacyToken)) return;
  await chrome.storage.local.set({
    [SAVED_CAPTURE_TOKENS_KEY]: [{ token: legacyToken, savedAt: new Date().toISOString() }, ...items],
  });
}

async function upsertSavedCaptureToken(token, savedAt = null) {
  const trimmed = String(token || "").trim();
  if (!trimmed) return listSavedCaptureTokens();
  const at = savedAt || new Date().toISOString();
  const items = (await listSavedCaptureTokens()).filter((item) => item.token !== trimmed);
  items.unshift({ token: trimmed, savedAt: at });
  await chrome.storage.local.set({ [SAVED_CAPTURE_TOKENS_KEY]: items });
  await saveExtensionSettings({ captureToken: trimmed });
  return items;
}

async function setActiveCaptureToken(token) {
  const trimmed = String(token || "").trim();
  const items = await listSavedCaptureTokens();
  if (!items.some((item) => item.token === trimmed)) {
    throw new Error("Token not in saved list.");
  }
  await saveExtensionSettings({ captureToken: trimmed });
  return trimmed;
}

async function removeSavedCaptureToken(token) {
  const trimmed = String(token || "").trim();
  const items = (await listSavedCaptureTokens()).filter((item) => item.token !== trimmed);
  await chrome.storage.local.set({ [SAVED_CAPTURE_TOKENS_KEY]: items });
  const settings = await loadExtensionSettings();
  if (settings.captureToken === trimmed) {
    await saveExtensionSettings({ captureToken: items[0]?.token || "" });
  }
  return items;
}

async function getCachedExtensionStatus() {
  const data = await chrome.storage.local.get({
    [EXTENSION_STATUS_CACHE_KEY]: null,
    [EXTENSION_STATUS_CACHE_AT_KEY]: 0,
  });
  return {
    status: data[EXTENSION_STATUS_CACHE_KEY],
    cachedAt: Number(data[EXTENSION_STATUS_CACHE_AT_KEY]) || 0,
  };
}

async function setCachedExtensionStatus(status) {
  await chrome.storage.local.set({
    [EXTENSION_STATUS_CACHE_KEY]: status,
    [EXTENSION_STATUS_CACHE_AT_KEY]: Date.now(),
  });
}

function isExtensionStatusCacheFresh(cachedAt) {
  const at = Number(cachedAt) || 0;
  if (!at) return false;
  return Date.now() - at < statusCacheTtlMs();
}

async function clearExtensionStatusCache() {
  await chrome.storage.local.remove([
    EXTENSION_STATUS_CACHE_KEY,
    EXTENSION_STATUS_CACHE_AT_KEY,
  ]);
}

async function getLastCapture() {
  const data = await chrome.storage.local.get({
    [LAST_CAPTURE_URL_KEY]: "",
    [LAST_CAPTURE_AT_KEY]: 0,
  });
  return {
    url: String(data[LAST_CAPTURE_URL_KEY] || ""),
    at: Number(data[LAST_CAPTURE_AT_KEY]) || 0,
  };
}

async function setLastCapture(url) {
  await chrome.storage.local.set({
    [LAST_CAPTURE_URL_KEY]: String(url || ""),
    [LAST_CAPTURE_AT_KEY]: Date.now(),
  });
}

async function isDuplicateCaptureUrl(url, windowMs) {
  const ms = windowMs ?? JBHM_CONFIG.DUPLICATE_CAPTURE_MS ?? 30_000;
  const normalized = String(url || "").trim();
  if (!normalized) return false;
  const { url: lastUrl, at } = await getLastCapture();
  if (!lastUrl || lastUrl !== normalized) return false;
  return Date.now() - at < ms;
}

async function loadPromptTemplate() {
  const local = await chrome.storage.local.get({ [PROMPT_TEMPLATE_LOCAL_KEY]: "" });
  if (local[PROMPT_TEMPLATE_LOCAL_KEY]) {
    return String(local[PROMPT_TEMPLATE_LOCAL_KEY]).trim() || DEFAULT_PROMPT_TEMPLATE;
  }
  const { promptTemplate } = await chrome.storage.sync.get("promptTemplate");
  const value = String(promptTemplate || DEFAULT_PROMPT_TEMPLATE).trim();
  return value || DEFAULT_PROMPT_TEMPLATE;
}

async function savePromptTemplate(text) {
  const value = String(text || DEFAULT_PROMPT_TEMPLATE);
  await chrome.storage.local.set({ [PROMPT_TEMPLATE_LOCAL_KEY]: value });
  await chrome.storage.sync.set({ promptTemplate: value });
}

/**
 * @typedef {object} ActiveJobContext
 * @property {string} teamId
 * @property {string} jobId
 * @property {string} [companyName]
 * @property {string} [jobTitle]
 */

/** @returns {Promise<ActiveJobContext | null>} */
async function loadActiveJobContext() {
  const { activeJobContext } = await chrome.storage.local.get("activeJobContext");
  if (!activeJobContext?.jobId || !activeJobContext?.teamId) return null;
  return activeJobContext;
}

/** @param {ActiveJobContext | null} ctx */
async function saveActiveJobContext(ctx) {
  if (!ctx?.jobId) {
    await chrome.storage.local.remove("activeJobContext");
    return;
  }
  await chrome.storage.local.set({ activeJobContext: ctx });
}

/**
 * @typedef {object} ActiveOptimization
 * @property {string} teamId
 * @property {string} jobId
 * @property {string} optimizationId
 * @property {string} promptText
 * @property {string} [lastExportId]
 * @property {string} [lastDownloadUrl]
 * @property {string} [lastFilename]
 */

/** @returns {Promise<ActiveOptimization | null>} */
async function loadActiveOptimization() {
  const { activeOptimization } = await chrome.storage.local.get("activeOptimization");
  if (!activeOptimization?.optimizationId) return null;
  return activeOptimization;
}

/** @param {ActiveOptimization | null} opt */
async function saveActiveOptimization(opt) {
  if (!opt) {
    await chrome.storage.local.remove("activeOptimization");
    return;
  }
  await chrome.storage.local.set({ activeOptimization: opt });
}

async function isExtensionEnabled() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  return enabled !== false;
}

const GROQ_MODEL_STORAGE_KEY = "groqModel";

function normalizeGroqModel(modelId) {
  const id = String(modelId || "").trim();
  const options = JBHM_CONFIG.GROQ_MODEL_OPTIONS || [];
  if (options.some((o) => o.id === id)) return id;
  return JBHM_CONFIG.DEFAULT_GROQ_MODEL || "llama-3.1-8b-instant";
}

async function loadGroqModel() {
  const stored = await chrome.storage.local.get({ [GROQ_MODEL_STORAGE_KEY]: "" });
  return normalizeGroqModel(stored[GROQ_MODEL_STORAGE_KEY]);
}

async function saveGroqModel(modelId) {
  const value = normalizeGroqModel(modelId);
  await chrome.storage.local.set({ [GROQ_MODEL_STORAGE_KEY]: value });
  return value;
}

const DOCX_STYLE_STORAGE_KEY = "resumeDocxStyle";

function normalizeDocxStyle(styleId) {
  const id = String(styleId || "").trim().toLowerCase();
  const options = JBHM_CONFIG.DOCX_STYLE_OPTIONS || [];
  if (options.some((o) => o.id === id)) return id;
  return JBHM_CONFIG.DEFAULT_DOCX_STYLE || "calibri";
}

async function loadResumeDocxStyle() {
  const stored = await chrome.storage.local.get({ [DOCX_STYLE_STORAGE_KEY]: "" });
  return normalizeDocxStyle(stored[DOCX_STYLE_STORAGE_KEY]);
}

async function saveResumeDocxStyle(styleId) {
  const value = normalizeDocxStyle(styleId);
  await chrome.storage.local.set({ [DOCX_STYLE_STORAGE_KEY]: value });
  return value;
}

const OUTPUT_PATH_TEMPLATE_KEY = "outputPathTemplate";
const PROMPT_INCLUDE_PROJECT_KEY = "promptIncludeProject";

async function loadOutputPathTemplate() {
  const stored = await chrome.storage.local.get({
    [OUTPUT_PATH_TEMPLATE_KEY]: DEFAULT_OUTPUT_PATH_TEMPLATE,
  });
  return String(stored[OUTPUT_PATH_TEMPLATE_KEY] ?? DEFAULT_OUTPUT_PATH_TEMPLATE);
}

async function saveOutputPathTemplate(template) {
  const validation = validateOutputPathTemplate(template);
  if (!validation.ok) throw new Error(validation.error);
  await chrome.storage.local.set({ [OUTPUT_PATH_TEMPLATE_KEY]: validation.normalized });
  return validation.normalized;
}

async function loadPromptIncludeProject() {
  const stored = await chrome.storage.local.get({ [PROMPT_INCLUDE_PROJECT_KEY]: true });
  return stored[PROMPT_INCLUDE_PROJECT_KEY] !== false;
}

async function savePromptIncludeProject(enabled) {
  const value = enabled !== false;
  await chrome.storage.local.set({ [PROMPT_INCLUDE_PROJECT_KEY]: value });
  return value;
}
