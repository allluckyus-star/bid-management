const capturedByEl = document.getElementById("capturedBy");
const apiBaseUrlEl = document.getElementById("apiBaseUrl");
const saveSettingsBtn = document.getElementById("saveSettings");
const captureBtn = document.getElementById("captureBtn");
const statusEl = document.getElementById("status");

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get({
    apiBaseUrl: "http://127.0.0.1:5123",
    capturedBy: "",
  });
  capturedByEl.value = stored.capturedBy;
  apiBaseUrlEl.value = stored.apiBaseUrl;
}

saveSettingsBtn.addEventListener("click", async () => {
  await chrome.storage.sync.set({
    capturedBy: capturedByEl.value.trim(),
    apiBaseUrl: apiBaseUrlEl.value.trim() || "http://127.0.0.1:5123",
  });
  setStatus("Settings saved.", "ok");
});

captureBtn.addEventListener("click", async () => {
  await chrome.storage.sync.set({
    capturedBy: capturedByEl.value.trim(),
    apiBaseUrl: apiBaseUrlEl.value.trim() || "http://127.0.0.1:5123",
  });

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
    setStatus(`Saved job ${response.result?.job_id?.slice(0, 8) ?? ""}…`, "ok");
  });
});

loadSettings();
