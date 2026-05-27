/** @typedef {import('./config.js').ApiEnvironment} ApiEnvironment */

/**
 * @typedef {object} ExtensionSettings
 * @property {string} captureToken
 * @property {ApiEnvironment} apiEnv
 */

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
  });
  const apiEnv = stored.apiEnv === "local" ? "local" : "production";
  return {
    captureToken: String(stored.captureToken || "").trim(),
    apiEnv,
    apiBaseUrl: getApiBaseUrl(apiEnv).replace(/\/$/, ""),
  };
}

async function saveExtensionSettings(patch) {
  const next = {};
  if (patch.captureToken !== undefined) {
    next.captureToken = patch.captureToken.trim();
  }
  if (patch.apiEnv !== undefined) {
    next.apiEnv = patch.apiEnv === "local" ? "local" : "production";
  }
  await chrome.storage.local.set(next);
}

async function loadPromptTemplate() {
  const { promptTemplate } = await chrome.storage.sync.get("promptTemplate");
  const value = String(promptTemplate || DEFAULT_PROMPT_TEMPLATE).trim();
  return value || DEFAULT_PROMPT_TEMPLATE;
}

async function savePromptTemplate(text) {
  await chrome.storage.sync.set({ promptTemplate: String(text || DEFAULT_PROMPT_TEMPLATE) });
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
