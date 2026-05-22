const capturedByEl = document.getElementById("capturedBy");
const apiBaseUrlEl = document.getElementById("apiBaseUrl");
const captureTokenEl = document.getElementById("captureToken");
const saveSettingsBtn = document.getElementById("saveSettings");
const captureBtn = document.getElementById("captureBtn");
const statusEl = document.getElementById("status");

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get({
    apiBaseUrl: "http://localhost:3000",
    capturedBy: "",
    captureToken: "",
  });
  capturedByEl.value = stored.capturedBy;
  apiBaseUrlEl.value = stored.apiBaseUrl;
  captureTokenEl.value = stored.captureToken;
}

async function saveAll() {
  await chrome.storage.sync.set({
    capturedBy: capturedByEl.value.trim(),
    apiBaseUrl: apiBaseUrlEl.value.trim() || "http://localhost:3000",
    captureToken: captureTokenEl.value.trim(),
  });
}

saveSettingsBtn.addEventListener("click", async () => {
  await saveAll();
  setStatus("Settings saved.", "ok");
});

captureBtn.addEventListener("click", async () => {
  await saveAll();

  captureBtn.disabled = true;
  setStatus("Capturing…", "");

  chrome.runtime.sendMessage({ type: "CAPTURE_FROM_POPUP" }, (response) => {
    captureBtn.disabled = false;
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message, "err");
      return;
    }
    if (!response?.ok) {
      setStatus(response?.error || "Capture failed.", "err");
      return;
    }
    const id = response.result?.job_id ?? "";
    setStatus(`Saved${id ? ` · ${id.slice(0, 8)}…` : ""}`, "ok");
  });
});

loadSettings();
