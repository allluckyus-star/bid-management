const statusCardEl = document.getElementById("statusCard");
const statusLabelEl = document.getElementById("statusLabel");
const statusDetailEl = document.getElementById("statusDetail");
const openWorkspaceBtn = document.getElementById("openWorkspaceBtn");
const captureBtn = document.getElementById("captureBtn");
const promptBtn = document.getElementById("promptBtn");
const downloadBtn = document.getElementById("downloadBtn");
const openDashboardBtn = document.getElementById("openDashboard");
const openSettingsBtn = document.getElementById("openSettings");
const statusEl = document.getElementById("status");
const hintEl = document.getElementById("hint");

const PRODUCTION_DASHBOARD = `${JBHM_CONFIG.PRODUCTION_URL}/dashboard`;
let captureInProgress = false;

function setInlineStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function send(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ status: "error", detail: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { status: "error", detail: "No response" });
    });
  });
}

function setButtonsEnabled(enabled, connected, usernameReady) {
  const busy = captureInProgress;
  captureBtn.disabled = !enabled || !connected || !usernameReady || busy;
  promptBtn.disabled = !enabled || !connected || busy;
  downloadBtn.disabled = !enabled || !connected || busy;
  openWorkspaceBtn.disabled = !enabled || !connected || busy;
}

function renderStatus(status, fromCache = false) {
  const enabled = true;
  const connected = Boolean(status?.connected);
  const usernameReady = Boolean(status?.username_validated);

  statusCardEl.classList.remove("ok", "warn", "err");

  if (!status?.configured) {
    statusCardEl.classList.add("warn");
    statusLabelEl.textContent = "Not configured";
    statusDetailEl.textContent = "Add your capture token in Settings.";
    setButtonsEnabled(false, false, false);
  } else if (connected) {
    statusCardEl.classList.add("ok");
    const who = status.captured_by || status.display_name || "Connected";
    statusLabelEl.textContent = `Connected as ${who}`;
    const envLine = status.team_id
      ? `Team ${status.team_id.slice(0, 8)}… · ${status.apiEnv === "local" ? "localhost" : "production"}`
      : status.apiEnv === "local"
        ? "Dev: localhost"
        : "Production";
    const usernameLine = usernameReady
      ? `Username: ${status.username}`
      : "Username missing/unvalidated. Open Settings.";
    const cacheNote = fromCache ? " · cached status" : "";
    statusDetailEl.textContent = `${envLine} · ${usernameLine}${cacheNote}`;
    setButtonsEnabled(enabled, true, usernameReady);
  } else {
    statusCardEl.classList.add("err");
    statusLabelEl.textContent = "Token invalid";
    statusDetailEl.textContent = status.error || "Check token in Settings.";
    setButtonsEnabled(false, false, false);
  }

  chrome.storage.local.get({ enabled: true }, (localData) => {
    const extensionOn = localData.enabled !== false;
    hintEl.textContent = extensionOn
      ? connected
        ? usernameReady
          ? "Popup launcher — open Workspace for full tools."
          : "Validate username in Settings."
        : "Set capture token in Settings."
      : "Extension is OFF.";
  });
}

async function updateUI(options = {}) {
  const forceRefresh = options.forceRefresh === true;
  const status = await send("GET_EXTENSION_STATUS", { forceRefresh });
  const { extensionStatusCacheAt: cachedAt = 0 } = await chrome.storage.local.get({
    extensionStatusCacheAt: 0,
  });
  const fromCache =
    !forceRefresh &&
    cachedAt &&
    Date.now() - Number(cachedAt) < (JBHM_CONFIG.STATUS_CACHE_TTL_MS || 300000);
  renderStatus(status, fromCache);

  if (!forceRefresh && status?.configured && !fromCache) {
    void send("GET_EXTENSION_STATUS", { forceRefresh: true }).then((fresh) => {
      if (fresh) renderStatus(fresh, false);
    });
  }
}

openWorkspaceBtn.addEventListener("click", async () => {
  const res = await send("OPEN_WORKSPACE");
  if (res?.ok === false) {
    setInlineStatus(res?.error || "Workspace could not open on this page.", "err");
    return;
  }
  setInlineStatus("Workspace opened.", "ok");
  window.close();
});

openSettingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

openDashboardBtn.addEventListener("click", () => {
  chrome.storage.local.get({ apiEnv: "production" }, (stored) => {
    const url =
      stored.apiEnv === "local" ? "http://localhost:3000/dashboard" : PRODUCTION_DASHBOARD;
    chrome.tabs.create({ url });
  });
});

captureBtn.addEventListener("click", async () => {
  if (JBHM_CONFIG.FREE_TIER_SAFE_MODE) {
    const res = await send("OPEN_WORKSPACE");
    if (res?.ok === false) {
      setInlineStatus(res?.error || "Open a normal web page first.", "err");
      return;
    }
    setInlineStatus("Workspace opened — review on Capture tab, then Save.", "ok");
    window.close();
    return;
  }

  if (captureInProgress) return;
  captureInProgress = true;
  captureBtn.disabled = true;
  setInlineStatus("Capturing page…");
  const response = await send("CAPTURE_FROM_POPUP");
  captureInProgress = false;
  await updateUI();
  if (!response?.ok) {
    setInlineStatus(response?.error || response?.detail || "Capture failed.", "err");
    return;
  }
  const id = response.result?.job_id ?? "";
  setInlineStatus(response.result?.message || `Saved${id ? ` · ${id.slice(0, 8)}…` : ""}`, "ok");
});

promptBtn.addEventListener("click", async () => {
  promptBtn.disabled = true;
  setInlineStatus("Building prompt and sending to ChatGPT…");

  const res = await send("GENERATE_CHATGPT_PROMPT");
  if (res?.status === "ok") {
    setInlineStatus("Prompt sent. Auto-capture will upload DOCX when ready.", "ok");
    hintEl.textContent = "Waiting for ChatGPT… result uploads automatically.";
  } else {
    setInlineStatus(res?.detail || "Could not run ChatGPT Prompt.", "err");
  }

  updateUI();
});

downloadBtn.addEventListener("click", async () => {
  setInlineStatus("Downloading…");
  const res = await send("DOWNLOAD_EXPORT");
  if (res?.status === "ok") setInlineStatus("Download started.", "ok");
  else setInlineStatus(res?.detail || "No export yet.", "err");
});

void updateUI({ forceRefresh: false });

chrome.storage.onChanged.addListener((changes, area) => {
  if (
    (area === "local" &&
      (changes.captureToken ||
        changes.apiEnv ||
        changes.enabled ||
        changes.extensionStatusCache ||
        changes.extensionStatusCacheAt)) ||
    (area === "sync" && changes.promptTemplate)
  ) {
    void updateUI({ forceRefresh: false });
  }
});
