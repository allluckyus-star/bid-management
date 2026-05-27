const statusCardEl = document.getElementById("statusCard");
const statusLabelEl = document.getElementById("statusLabel");
const statusDetailEl = document.getElementById("statusDetail");
const toggleBtn = document.getElementById("toggleBtn");
const captureBtn = document.getElementById("captureBtn");
const promptBtn = document.getElementById("promptBtn");
const editPromptBtn = document.getElementById("editPromptBtn");
const downloadBtn = document.getElementById("downloadBtn");
const openDashboardBtn = document.getElementById("openDashboard");
const openSettingsBtn = document.getElementById("openSettings");
const statusEl = document.getElementById("status");
const hintEl = document.getElementById("hint");
const promptEditor = document.getElementById("promptEditor");
const promptLocked = document.getElementById("promptLocked");
const promptTitle = promptBtn.querySelector(".button-title");

let promptEditorExpanded = false;

const PRODUCTION_DASHBOARD = `${JBHM_CONFIG.PRODUCTION_URL}/dashboard`;

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

function setButtonsEnabled(enabled, connected) {
  captureBtn.disabled = !enabled || !connected;
  promptBtn.disabled = !enabled || !connected;
  downloadBtn.disabled = !enabled || !connected;
}

async function updateUI() {
  const [localData, syncData, status] = await Promise.all([
    chrome.storage.local.get({ enabled: true }),
    chrome.storage.sync.get("promptTemplate"),
    send("GET_EXTENSION_STATUS"),
  ]);

  const enabled = localData.enabled !== false;
  const connected = Boolean(status?.connected);

  promptLocked.value = LOCKED_PROMPT_SUFFIX_PREVIEW;
  if (!promptEditorExpanded || document.activeElement !== promptEditor) {
    promptEditor.value = String(syncData.promptTemplate || DEFAULT_PROMPT_TEMPLATE);
  }

  statusCardEl.classList.remove("ok", "warn", "err");

  if (!status?.configured) {
    statusCardEl.classList.add("warn");
    statusLabelEl.textContent = "Not configured";
    statusDetailEl.textContent = "Add your capture token in Settings.";
    setButtonsEnabled(false, false);
  } else if (connected) {
    statusCardEl.classList.add("ok");
    const who = status.captured_by || status.display_name || status.email || "Connected";
    statusLabelEl.textContent = `Connected as ${who}`;
    statusDetailEl.textContent = status.team_id
      ? `Team ${status.team_id.slice(0, 8)}… · ${status.apiEnv === "local" ? "localhost" : "production"}`
      : status.apiEnv === "local"
        ? "Dev: localhost"
        : "Production";
    setButtonsEnabled(enabled, true);
  } else {
    statusCardEl.classList.add("err");
    statusLabelEl.textContent = "Token invalid";
    statusDetailEl.textContent = status.error || "Check token in Settings.";
    setButtonsEnabled(false, false);
  }

  if (enabled) {
    toggleBtn.textContent = "Disable";
  } else {
    toggleBtn.textContent = "Enable";
  }

  hintEl.textContent = enabled
    ? connected
      ? "1) Capture job page  2) Open ChatGPT  3) ChatGPT Prompt (Alt+W). Select wrong JSON? Select text → GPT button."
      : "Add capture token in Settings."
    : "Extension is OFF.";
}

toggleBtn.addEventListener("click", async () => {
  const data = await chrome.storage.local.get({ enabled: true });
  const next = !(data.enabled !== false);
  await chrome.storage.local.set({ enabled: next });
  await send("SET_EXTENSION_ENABLED", { enabled: next });
  updateUI();
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
  setInlineStatus("Capturing page…");
  const response = await send("CAPTURE_FROM_POPUP");
  if (!response?.ok) {
    setInlineStatus(response?.error || response?.detail || "Capture failed.", "err");
    return;
  }
  const id = response.result?.job_id ?? "";
  setInlineStatus(response.result?.message || `Saved${id ? ` · ${id.slice(0, 8)}…` : ""}`, "ok");
});

promptBtn.addEventListener("click", async () => {
  promptBtn.disabled = true;
  promptTitle.textContent = "Sending…";
  setInlineStatus("Building prompt and sending to ChatGPT…");

  const res = await send("GENERATE_CHATGPT_PROMPT");
  if (res?.status === "ok") {
    setInlineStatus("Prompt sent. Auto-capture will upload DOCX when ready.", "ok");
    hintEl.textContent = "Waiting for ChatGPT… result uploads automatically.";
  } else {
    setInlineStatus(res?.detail || "Could not run ChatGPT Prompt.", "err");
  }

  promptTitle.textContent = "ChatGPT Prompt";
  updateUI();
});

editPromptBtn.addEventListener("click", async () => {
  promptEditorExpanded = !promptEditorExpanded;
  document.body.classList.toggle("expanded", promptEditorExpanded);
  editPromptBtn.textContent = promptEditorExpanded ? "Close Prompt" : "Edit Prompt";
  if (promptEditorExpanded) {
    const data = await chrome.storage.sync.get("promptTemplate");
    promptEditor.value = String(data.promptTemplate || DEFAULT_PROMPT_TEMPLATE);
  }
});

downloadBtn.addEventListener("click", async () => {
  setInlineStatus("Downloading…");
  const res = await send("DOWNLOAD_EXPORT");
  if (res?.status === "ok") setInlineStatus("Download started.", "ok");
  else setInlineStatus(res?.detail || "No export yet.", "err");
});

promptEditor.addEventListener("input", () => {
  chrome.storage.sync.set({ promptTemplate: promptEditor.value });
});

updateUI();

chrome.storage.onChanged.addListener((changes, area) => {
  if (
    (area === "local" && (changes.captureToken || changes.apiEnv || changes.enabled)) ||
    (area === "sync" && changes.promptTemplate)
  ) {
    updateUI();
  }
});
