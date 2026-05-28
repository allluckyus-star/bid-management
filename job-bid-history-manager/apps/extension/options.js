const captureTokenEl = document.getElementById("captureToken");
const usernameEl = document.getElementById("username");
const saveTokenBtn = document.getElementById("saveToken");
const testConnectionBtn = document.getElementById("testConnection");
const validateUsernameBtn = document.getElementById("validateUsername");
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
    username: "",
    usernameValidatedAt: null,
    apiEnv: JBHM_CONFIG.DEFAULT_ENV,
  });
  captureTokenEl.value = stored.captureToken || "";
  usernameEl.value = String(stored.username || "");
  const env = stored.apiEnv === "local" ? "local" : "production";
  const radio = document.querySelector(`input[name="apiEnv"][value="${env}"]`);
  if (radio) radio.checked = true;
}

saveTokenBtn.addEventListener("click", async () => {
  await saveExtensionSettings({
    captureToken: captureTokenEl.value,
    usernameValidatedAt: null,
  });
  setStatus("Token saved. Revalidate username.", "ok");
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

validateUsernameBtn.addEventListener("click", async () => {
  const username = usernameEl.value.trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,32}$/.test(username)) {
    setStatus(
      "Invalid username format. Use 3-32 lowercase letters, numbers, underscore, or hyphen.",
      "err",
    );
    return;
  }

  validateUsernameBtn.disabled = true;
  setStatus("Validating username…", "");
  try {
    const settings = await loadExtensionSettings();
    if (!settings.captureToken) {
      setStatus("Save capture token first.", "err");
      return;
    }
    await validateExtensionUsername(settings.apiBaseUrl, settings.captureToken, username);
    await saveExtensionSettings({
      username,
      usernameValidatedAt: new Date().toISOString(),
    });
    setStatus(`Username "${username}" validated.`, "ok");
  } catch (e) {
    setStatus(e instanceof Error ? e.message : "Username validation failed.", "err");
  } finally {
    validateUsernameBtn.disabled = false;
  }
});

loadForm();
