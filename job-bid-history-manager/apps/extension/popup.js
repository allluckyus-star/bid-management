const statusCardEl = document.getElementById("statusCard");
const statusLabelEl = document.getElementById("statusLabel");
const statusDetailEl = document.getElementById("statusDetail");
const captureBtn = document.getElementById("captureBtn");
const openDashboardBtn = document.getElementById("openDashboard");
const openSettingsBtn = document.getElementById("openSettings");
const statusEl = document.getElementById("status");

const PRODUCTION_DASHBOARD = `${JBHM_CONFIG.PRODUCTION_URL}/dashboard`;

function setInlineStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function renderConnection(status) {
  statusCardEl.classList.remove("ok", "warn", "err");

  if (!status.configured) {
    statusCardEl.classList.add("warn");
    statusLabelEl.textContent = "Not configured";
    statusDetailEl.textContent = "Add your capture token in Settings.";
    captureBtn.disabled = true;
    return;
  }

  if (status.connected) {
    statusCardEl.classList.add("ok");
    const who = status.captured_by || status.display_name || status.email || "Connected";
    statusLabelEl.textContent = `Connected as ${who}`;
    statusDetailEl.textContent = status.apiEnv === "local" ? "Dev: localhost" : "Production";
    captureBtn.disabled = false;
    return;
  }

  statusCardEl.classList.add("err");
  statusLabelEl.textContent = "Token invalid";
  statusDetailEl.textContent = status.error || "Check token in Settings.";
  captureBtn.disabled = true;
}

async function refreshStatus() {
  setInlineStatus("");
  statusLabelEl.textContent = "Checking…";
  statusDetailEl.textContent = "";

  chrome.runtime.sendMessage({ type: "GET_EXTENSION_STATUS" }, (response) => {
    if (chrome.runtime.lastError) {
      statusCardEl.classList.add("err");
      statusLabelEl.textContent = "Error";
      statusDetailEl.textContent = chrome.runtime.lastError.message;
      captureBtn.disabled = true;
      return;
    }
    renderConnection(response || { configured: false });
  });
}

openSettingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

openDashboardBtn.addEventListener("click", () => {
  chrome.storage.local.get({ apiEnv: "production" }, (stored) => {
    const url =
      stored.apiEnv === "local"
        ? "http://localhost:3000/dashboard"
        : PRODUCTION_DASHBOARD;
    chrome.tabs.create({ url });
  });
});

let captureInFlight = false;

captureBtn.addEventListener("click", () => {
  if (captureInFlight) return;
  captureInFlight = true;
  captureBtn.disabled = true;
  setInlineStatus("Capturing page…", "");

  chrome.runtime.sendMessage({ type: "CAPTURE_FROM_POPUP" }, (response) => {
    captureInFlight = false;
    captureBtn.disabled = false;
    if (chrome.runtime.lastError) {
      setInlineStatus(chrome.runtime.lastError.message, "err");
      return;
    }
    if (!response?.ok) {
      setInlineStatus(response?.error || "Capture failed.", "err");
      return;
    }
    const id = response.result?.job_id ?? "";
    setInlineStatus(
      response.result?.message || `Saved${id ? ` · ${id.slice(0, 8)}…` : ""}`,
      "ok",
    );
  });
});

refreshStatus();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.captureToken || changes.apiEnv)) {
    refreshStatus();
  }
});
