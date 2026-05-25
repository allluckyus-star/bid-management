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

/**
 * @returns {Promise<ExtensionSettings & { apiBaseUrl: string }>}
 */
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
  const apiEnv =
    stored.apiEnv === "local" ? "local" : "production";
  return {
    captureToken: String(stored.captureToken || "").trim(),
    apiEnv,
    apiBaseUrl: getApiBaseUrl(apiEnv).replace(/\/$/, ""),
  };
}

/**
 * @param {Partial<ExtensionSettings>} patch
 */
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
