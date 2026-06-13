const captureTokenEl = document.getElementById("captureToken");
const saveTokenBtn = document.getElementById("saveToken");
const testConnectionBtn = document.getElementById("testConnection");
const saveEnvBtn = document.getElementById("saveEnv");
const statusEl = document.getElementById("status");

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function selectedEnv() {
  const checked = document.querySelector('input[name="apiEnv"]:checked');
  return checked?.value === "local" ? "local" : "production";
}

async function loadForm() {
  const stored = await chrome.storage.local.get({
    captureToken: "",
    apiEnv: JBHM_CONFIG.DEFAULT_ENV,
  });
  captureTokenEl.value = stored.captureToken || "";
  const env = stored.apiEnv === "local" ? "local" : "production";
  const radio = document.querySelector(`input[name="apiEnv"][value="${env}"]`);
  if (radio) radio.checked = true;
}

saveTokenBtn.addEventListener("click", async () => {
  await saveExtensionSettings({
    captureToken: captureTokenEl.value,
    usernameValidatedAt: null,
  });
  setStatus("Token saved. Open the workspace Settings tab to refresh usernames.", "ok");
});

saveEnvBtn.addEventListener("click", async () => {
  await saveExtensionSettings({ apiEnv: selectedEnv() });
  setStatus(`Environment: ${selectedEnv()}.`, "ok");
});

testConnectionBtn.addEventListener("click", async () => {
  await saveExtensionSettings({
    captureToken: captureTokenEl.value,
    apiEnv: selectedEnv(),
  });
  testConnectionBtn.disabled = true;
  setStatus("Testing…", "");

  chrome.runtime.sendMessage({ type: "TEST_CONNECTION" }, (response) => {
    testConnectionBtn.disabled = false;
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message, "err");
      return;
    }
    if (!response?.ok) {
      setStatus(response?.error || "Connection failed.", "err");
      return;
    }
    const who = response.me?.captured_by || response.me?.email || "OK";
    setStatus(`Connected as ${who}`, "ok");
  });
});

loadForm();
