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
const USERNAME_VALIDATION_CACHE_KEY = "usernameValidationCache";
const USERNAME_VALIDATION_CACHE_AT_KEY = "usernameValidationCacheAt";
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
    await clearUsernameValidationCache();
  }
}

function usernameValidationTtlMs() {
  return JBHM_CONFIG.USERNAME_VALIDATION_CACHE_TTL_MS ?? 10 * 60 * 1000;
}

/** Non-reversible short fingerprint — never store raw token in cache keys. */
async function tokenFingerprint(token) {
  const t = String(token || "");
  if (t.length < 8) return "none";
  let h = 0;
  for (let i = 0; i < t.length; i += 1) {
    h = (Math.imul(31, h) + t.charCodeAt(i)) | 0;
  }
  return `fp_${(h >>> 0).toString(16)}`;
}

async function getUsernameValidationCache(settings) {
  const fp = await tokenFingerprint(settings.captureToken);
  const data = await chrome.storage.local.get({
    [USERNAME_VALIDATION_CACHE_KEY]: null,
    [USERNAME_VALIDATION_CACHE_AT_KEY]: 0,
  });
  const cache = data[USERNAME_VALIDATION_CACHE_KEY];
  const at = Number(data[USERNAME_VALIDATION_CACHE_AT_KEY]) || 0;
  if (!cache || cache.fingerprint !== fp || cache.username !== settings.username) return null;
  if (Date.now() - at > usernameValidationTtlMs()) return null;
  return cache;
}

async function setUsernameValidationCache(settings) {
  const fp = await tokenFingerprint(settings.captureToken);
  await chrome.storage.local.set({
    [USERNAME_VALIDATION_CACHE_KEY]: {
      fingerprint: fp,
      username: settings.username,
      validated: true,
    },
    [USERNAME_VALIDATION_CACHE_AT_KEY]: Date.now(),
  });
}

async function clearUsernameValidationCache() {
  await chrome.storage.local.remove([
    USERNAME_VALIDATION_CACHE_KEY,
    USERNAME_VALIDATION_CACHE_AT_KEY,
  ]);
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

async function getUsername() {
  const { username = "", usernameValidatedAt = null } = await chrome.storage.local.get({
    username: "",
    usernameValidatedAt: null,
  });
  return {
    username: String(username || "").trim().toLowerCase(),
    usernameValidatedAt: usernameValidatedAt || null,
  };
}

async function setUsername(username) {
  await chrome.storage.local.set({
    username: String(username || "").trim().toLowerCase(),
  });
}

async function markUsernameValidated() {
  await chrome.storage.local.set({ usernameValidatedAt: new Date().toISOString() });
}

async function clearUsernameValidation() {
  await chrome.storage.local.set({ usernameValidatedAt: null });
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
