const tabsEl = document.getElementById("tabs");
const contentEl = document.getElementById("tabContent");
const siteMetaEl = document.getElementById("siteMeta");
const connBadgeEl = document.getElementById("connBadge");
const previewTabBtn = document.getElementById("previewTabBtn");
const promptSendFooterBtn = document.getElementById("promptSendBtn");
const resumeDownloadBtn = document.getElementById("resumeDownloadBtn");

const TAB_DEFS = [
  { id: "JD", label: "JD Source", icon: "📋" },
  { id: "Resume", label: "Resume", icon: "📄" },
  { id: "Prompt", label: "Prompt", icon: "✏️" },
  { id: "Preview", label: "Preview", icon: "👁" },
  { id: "Settings", label: "Settings", icon: "⚙" },
];
let activeTab = "JD";

let state = {
  status: null,
  page: null,
  promptTemplate: "",
  jdView: null,
  jdDraft: null,
  jdManualSource: null,
  jdManualText: "",
  jdManualTitleInput: "",
  jdPendingFile: null,
  jdBusy: false,
  jdSaving: false,
  resumeItems: [],
  resumeLoading: false,
  resumeBusy: false,
  settingsTokenInput: "",
  tokenConfigured: false,
  settingsUsernameInput: "",
  settingsEnvDraft: "production",
  settingsFeedback: {
    token: { text: "", type: "" },
    connection: { text: "", type: "" },
    username: { text: "", type: "" },
    env: { text: "", type: "" },
  },
  tabFeedback: {
    JD: { text: "", type: "" },
    Resume: { text: "", type: "" },
  },
  settingsBusy: {
    saveToken: false,
    testConnection: false,
    validateUsername: false,
    saveEnv: false,
    savePrompt: false,
    sendPrompt: false,
  },
  captureDraft: null,
  jdLocal: null,
  resumeLocalText: "",
  previewDraft: null,
  localPromptText: "",
  localPromptWarning: "",
};

function send(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response ?? { ok: false, error: "No response" });
    });
  });
}

function panelApi(action, payload = {}) {
  return send("PANEL_API", { action, ...payload });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setPanelStatus(text, type = "warn") {
  const el = document.getElementById("panelStatus");
  if (!el) return;
  if (!text) {
    el.textContent = "";
    el.className = "panel-status";
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = String(text);
  el.className = `panel-status ${type}`.trim();
}

function tabLoadingHtml(label = "Loading…") {
  return `
    <div class="tab-loading" role="status" aria-live="polite" aria-busy="true">
      <div class="tab-loading-spinner" aria-hidden="true"></div>
      <p class="tab-loading-text">${escapeHtml(label)}</p>
    </div>
  `;
}

function tabLoadingLabel(tab) {
  if (tab === "JD") return "Loading JD source…";
  if (tab === "Resume") return "Loading resume…";
  if (tab === "Preview") return "Loading preview…";
  if (tab === "Settings") return "Loading settings…";
  return "Loading…";
}

function showTabLoading(label) {
  contentEl.innerHTML = tabLoadingHtml(label);
}

function setTabsBusy(busy) {
  tabsEl.querySelectorAll(".tab").forEach((btn) => {
    btn.disabled = busy;
    btn.setAttribute("aria-busy", busy ? "true" : "false");
  });
}

function setInlineBanner(text, type = "warn") {
  if (activeTab === "JD" || activeTab === "Resume") {
    state.tabFeedback[activeTab] = text ? { text: String(text), type } : { text: "", type: "" };
    setPanelStatus("");
    return;
  }
  setPanelStatus(text, type);
}

function tabFeedbackHtml(tab) {
  const fb = state.tabFeedback[tab];
  if (!fb?.text) return '<div class="tab-feedback-slot" aria-hidden="true"></div>';
  const type = fb.type || "ok";
  return `<div class="tab-feedback-slot"><div class="banner ${type}" role="status">${escapeHtml(fb.text)}</div></div>`;
}

function setSettingsFieldFeedback(field, text, type = "ok") {
  if (!state.settingsFeedback[field]) return;
  state.settingsFeedback[field] = text ? { text: String(text), type } : { text: "", type: "" };
}

function clearSettingsFieldFeedback(...fields) {
  for (const field of fields) {
    setSettingsFieldFeedback(field, "", "");
  }
}

function fieldFeedbackHtml(field) {
  const fb = state.settingsFeedback[field];
  if (!fb?.text) return "";
  const type = fb.type || "ok";
  return `<p class="field-feedback ${type}" role="status">${escapeHtml(fb.text)}</p>`;
}

function updateStatusBadge() {
  const s = state.status || {};
  connBadgeEl.classList.remove("ok", "warn", "err");
  if (!s.configured) {
    connBadgeEl.textContent = "Not configured";
    connBadgeEl.classList.add("warn");
    return;
  }
  if (!s.connected) {
    connBadgeEl.textContent = "Token invalid";
    connBadgeEl.classList.add("err");
    return;
  }
  if (!s.username_validated) {
    connBadgeEl.textContent = "Username invalid";
    connBadgeEl.classList.add("warn");
    return;
  }
  connBadgeEl.textContent = "Connected";
  connBadgeEl.classList.add("ok");
}

function captureReadinessHint() {
  const s = state.status || {};
  if (!s.configured) return { text: "Set capture token in Settings.", type: "warn" };
  if (!s.connected) return { text: "Token invalid. Reconnect in Settings.", type: "err" };
  if (!s.username_validated) return { text: "Validate username in Settings before capture.", type: "warn" };
  return null;
}

function emptyJdSelection() {
  return { mode: "latest", history_job_id: null, manual_input_id: null, updated_at: null };
}

function syncManualSourcesFromView(view) {
  let pasteId = null;
  let uploadId = null;
  let uploadLabel = null;
  let pasteText = state.jdManualText;
  for (const item of view?.manual_items || []) {
    if (item.source_type === "text" && !pasteId) pasteId = item.id;
    else if (item.source_type !== "text" && !uploadId) {
      uploadId = item.id;
      uploadLabel = item.label;
    }
  }

  const pasteItem = (view?.manual_items || []).find((item) => item.source_type === "text");
  if (pasteItem) {
    pasteId = pasteItem.id;
    pasteText = String(pasteItem.extracted_text ?? "");
  }

  let active = null;
  let pasteName = String(pasteItem?.title || pasteItem?.label || "");
  const selected = view?.selected_manual;
  if (view?.selection?.mode === "manual" && selected) {
    active = selected.source_type === "text" ? "paste" : "upload";
    if (selected.source_type === "text") {
      pasteId = selected.id;
      pasteText = String(selected.extracted_text ?? "");
      pasteName = String(selected.label || "");
    } else {
      uploadId = selected.id;
      uploadLabel = selected.label;
    }
  }

  return { pasteId, uploadId, uploadLabel, active, pasteText, pasteName };
}

function modeCardClass(mode) {
  const selected = (state.jdDraft?.mode || "latest") === mode;
  return `section-card ${selected ? "selected" : "dim"}`;
}

function manualPaneClass(kind) {
  const selected = state.jdDraft?.mode === "manual" && state.jdManualSource === kind;
  return kind === "paste" ? `manual-pane ${selected ? "selected" : ""}` : `upload-zone ${selected ? "selected" : ""}`;
}

function jdSelectionMode() {
  return state.jdDraft?.mode === "history" ? "latest" : state.jdDraft?.mode || "latest";
}

/** Update JD mode / manual pane highlights without re-rendering inputs (keeps focus). */
function refreshJdSelectionUi() {
  if (activeTab !== "JD") return;
  const mode = jdSelectionMode();

  contentEl.querySelectorAll("section[data-mode]").forEach((el) => {
    const cardMode = el.getAttribute("data-mode");
    el.className = modeCardClass(cardMode);
  });

  contentEl.querySelectorAll("[data-manual]").forEach((el) => {
    const kind = el.getAttribute("data-manual");
    el.className = manualPaneClass(kind);
    const showBadge = mode === "manual" && state.jdManualSource === kind;
    let badge = el.querySelector(".pane-badge");
    if (showBadge && !badge) {
      badge = document.createElement("span");
      badge.className = "pane-badge";
      badge.textContent = "Selected";
      el.prepend(badge);
    } else if (!showBadge && badge) {
      badge.remove();
    }
  });
}

async function refreshContext(options = {}) {
  const forceRefresh = options.forceRefresh === true;
  const [status, page, syncData] = await Promise.all([
    send("GET_EXTENSION_STATUS", { forceRefresh }),
    send("GET_PAGE_CONTEXT"),
    chrome.storage.sync.get("promptTemplate"),
  ]);
  state.status = status;
  state.page = page;
  state.promptTemplate = String(syncData.promptTemplate || DEFAULT_PROMPT_TEMPLATE);
  state.tokenConfigured = Boolean(status?.configured);
  const storedUsername = String(status?.username || "").trim().toLowerCase();
  if (storedUsername && !state.settingsUsernameInput) {
    state.settingsUsernameInput = storedUsername;
  }
  state.settingsEnvDraft = status?.apiEnv === "local" ? "local" : "production";
  siteMetaEl.textContent = page?.domain
    ? `${page.domain} · ${page.title || "Untitled page"}`
    : "Current page";
  updateStatusBadge();
}

async function loadJdView() {
  if (!state.status?.connected) {
    state.jdView = null;
    state.jdDraft = emptyJdSelection();
    return;
  }
  state.jdBusy = true;
  const res = await panelApi("FETCH_JD_SETTINGS");
  state.jdBusy = false;
  if (!res.ok) {
    setInlineBanner(res.error || "Failed to load JD settings.", "err");
    return;
  }
  state.jdView = res.data;
  state.jdDraft = { ...(res.data.selection || emptyJdSelection()) };
  const manual = syncManualSourcesFromView(res.data);
  state.jdManualSource = manual.active ?? state.jdManualSource ?? "paste";
  state.jdManualText = manual.pasteText ?? "";
  state.jdManualTitleInput = manual.pasteName ?? "";
}

async function loadResumeLibrary() {
  if (!state.status?.connected) {
    state.resumeItems = [];
    return;
  }
  state.resumeLoading = true;
  const res = await panelApi("FETCH_RESUME_LIBRARY");
  state.resumeLoading = false;
  if (!res.ok) {
    setInlineBanner(res.error || "Failed to load resumes.", "err");
    return;
  }
  state.resumeItems = res.data?.items || [];
}

async function fileToBuffer(file) {
  return file.arrayBuffer();
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function renderTabs() {
  tabsEl.innerHTML = "";
  for (const tab of TAB_DEFS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `tab ${tab.id === activeTab ? "active" : ""}`;
    b.title = tab.label;
    b.setAttribute("aria-label", tab.label);
    b.innerHTML = `<span class="tab-glyph" aria-hidden="true">${tab.icon}</span>`;
    b.addEventListener("click", () => {
      activeTab = tab.id;
      void switchTab();
    });
    tabsEl.appendChild(b);
  }
}

async function switchTab() {
  const tab = activeTab;
  renderTabs();
  const needsFetch = tab === "Settings";
  if (needsFetch) {
    setTabsBusy(true);
    showTabLoading(tabLoadingLabel(tab));
  }

  try {
    if (tab === "JD") {
      if (!state.jdLocal) await loadJdLocalFromStorage();
    } else if (tab === "Resume") {
      state.resumeLocalText = await getLocalResumeText();
    } else if (tab === "Preview") {
      await loadPreviewFromStorage();
    } else if (tab === "Settings") {
      await refreshContext({ forceRefresh: false });
    } else if (tab === "Prompt") {
      state.promptTemplate = await loadPromptTemplate();
    }
    if (activeTab === tab) await renderContent();
  } catch (err) {
    if (activeTab === tab) {
      contentEl.innerHTML = `<p class="page-loading">${escapeHtml(err?.message || "Something went wrong.")}</p>`;
    }
  } finally {
    setTabsBusy(false);
    renderTabs();
  }
}

function resumeLocalTabHtml() {
  const text = state.resumeLocalText || "";
  return `
    <section class="settings-section source-tab">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">Resume</h2>
        <span class="badge local">Local only</span>
      </div>
      <p class="muted">${text.length.toLocaleString()} characters</p>
      <textarea id="resumeLocalText" class="textarea mono source-editor resume-editor-tall" placeholder="Paste resume text…">${escapeHtml(text)}</textarea>
      <input type="file" id="resumeFileInput" accept=".txt,.md,text/plain" hidden />
      <button type="button" class="btn upload-block-btn" id="resumeUploadBtn">Upload file</button>
    </section>
  `;
}

async function persistResumeLocal() {
  const text = state.resumeLocalText || "";
  await saveLocalResumeText(text);
}

let resumeSaveTimer = null;
function scheduleResumePersist() {
  clearTimeout(resumeSaveTimer);
  resumeSaveTimer = setTimeout(() => void persistResumeLocal(), 400);
}

function wireResumeLocalActions() {
  const ta = document.getElementById("resumeLocalText");
  ta?.addEventListener("input", (e) => {
    state.resumeLocalText = String(e.target.value || "");
    scheduleResumePersist();
  });

  const input = document.getElementById("resumeFileInput");
  document.getElementById("resumeUploadBtn")?.addEventListener("click", () => input?.click());
  input?.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const loaded = await file.text();
      state.resumeLocalText = loaded;
      await persistResumeLocal();
      setInlineBanner("Resume loaded from file (local only).", "ok");
      await renderContent();
    } catch {
      setInlineBanner("Could not read file.", "err");
    }
  });
}

function jdTabHtml() {
  return jdSourceTabHtml();
}

function resumeTabHtml() {
  return resumeLocalTabHtml();
}

function settingsTabHtml() {
  const s = state.status || {};
  const hint = captureReadinessHint();
  const apiBase = s.apiBaseUrl || JBHM_CONFIG.PRODUCTION_URL;
  const validatedAt = s.username_validated_at
    ? new Date(s.username_validated_at).toLocaleString()
    : "Never";
  return `
    ${hint ? `<div class="banner ${hint.type}">${escapeHtml(hint.text)}</div>` : ""}

    <section class="settings-section">
      <h3>Connection</h3>
      <p class="muted">API: <code>${escapeHtml(apiBase)}</code></p>
      <p class="muted">Environment: ${escapeHtml(s.apiEnv === "local" ? "localhost" : "production")}</p>
      <p class="muted">Token: ${s.configured ? (s.connected ? "valid" : "invalid") : "not set"}</p>
      <p class="muted">Username: ${s.username_validated ? escapeHtml(s.username || "") : "not validated"}</p>
      <p class="muted">Last validated: ${escapeHtml(validatedAt)}</p>
      ${JBHM_CONFIG.FREE_TIER_SAFE_MODE ? '<p class="muted">Free-tier safe mode is ON.</p>' : ""}
    </section>

    <section class="settings-section">
      <h3>Capture token</h3>
      <p class="hint">Create a token in Dashboard → Chrome extension. Stored only in this browser.</p>
      <label class="label" for="settingsToken">Token</label>
      <input
        id="settingsToken"
        class="input"
        type="password"
        placeholder="${state.tokenConfigured ? "Token saved — paste to replace" : "jbhm_…"}"
        value="${escapeHtml(state.settingsTokenInput)}"
        autocomplete="off"
      />
      ${state.tokenConfigured ? '<p class="muted">Capture token is saved in this browser.</p>' : ""}
      <div class="row">
        <button type="button" class="btn" id="saveTokenBtn" ${state.settingsBusy.saveToken ? "disabled" : ""}>
          ${state.settingsBusy.saveToken ? "Saving…" : "Save token"}
        </button>
        <button type="button" class="btn primary" id="testConnectionBtn" ${state.settingsBusy.testConnection ? "disabled" : ""}>
          ${state.settingsBusy.testConnection ? "Testing…" : "Test connection"}
        </button>
        <button type="button" class="btn" id="refreshStatusBtn">Refresh status</button>
      </div>
      ${fieldFeedbackHtml("token")}
      ${fieldFeedbackHtml("connection")}
    </section>

    <section class="settings-section">
      <h3>Capture username</h3>
      <p class="hint">Must match a username registered in the dashboard for this token's account.</p>
      <label class="label" for="settingsUsername">Username</label>
      <input
        id="settingsUsername"
        class="input"
        type="text"
        placeholder="your_name"
        value="${escapeHtml(state.settingsUsernameInput)}"
        autocomplete="off"
      />
      ${s.username_validated ? `<p class="muted">Validated as ${escapeHtml(s.username || state.settingsUsernameInput)}.</p>` : ""}
      <div class="row">
        <button type="button" class="btn primary" id="validateUserBtn" ${state.settingsBusy.validateUsername ? "disabled" : ""}>
          ${state.settingsBusy.validateUsername ? "Validating…" : "Validate username"}
        </button>
      </div>
      ${fieldFeedbackHtml("username")}
    </section>

    <section class="settings-section">
      <h3>Environment</h3>
      <p class="hint">Tap to switch API target (saved immediately).</p>
      <div class="env-options">
        <button
          type="button"
          class="env-chip ${state.settingsEnvDraft !== "local" ? "selected" : ""}"
          data-env="production"
          ${state.settingsBusy.saveEnv ? "disabled" : ""}
        >
          <span class="env-chip-title">Production</span>
          <code>${escapeHtml(JBHM_CONFIG.PRODUCTION_URL)}</code>
        </button>
        <button
          type="button"
          class="env-chip ${state.settingsEnvDraft === "local" ? "selected" : ""}"
          data-env="local"
          ${state.settingsBusy.saveEnv ? "disabled" : ""}
        >
          <span class="env-chip-title">Localhost</span>
          <code>${escapeHtml(JBHM_CONFIG.LOCAL_URL)}</code>
        </button>
      </div>
      ${fieldFeedbackHtml("env")}
    </section>
  `;
}

function promptTabHtml() {
  return `
    <div class="prompt-tab-layout">
      <section class="settings-section prompt-template-section">
        <div class="row" style="justify-content:space-between;align-items:center">
          <h3 style="margin:0">Prompt template</h3>
          <button type="button" class="btn ghost btn-sm" id="promptResetBtn">Reset default</button>
        </div>
        <p class="hint">Uses local JD + resume when you send from the footer ChatGPT button.</p>
        <textarea id="promptEditor" class="textarea mono prompt-editor-tall">${escapeHtml(state.promptTemplate)}</textarea>
      </section>
      <section class="settings-section prompt-suffix-section">
        <h3>Locked suffix</h3>
        <textarea class="textarea mono prompt-suffix-tall" readonly>${escapeHtml(LOCKED_PROMPT_SUFFIX_PREVIEW)}</textarea>
      </section>
    </div>
  `;
}

async function renderContent() {
  contentEl.classList.toggle("content--prompt", activeTab === "Prompt");
  contentEl.classList.toggle("content--jd", activeTab === "JD");
  contentEl.classList.toggle("content--resume", activeTab === "Resume");
  if (activeTab === "JD") contentEl.innerHTML = jdTabHtml();
  else if (activeTab === "Resume") contentEl.innerHTML = resumeTabHtml();
  else if (activeTab === "Preview") contentEl.innerHTML = previewTabHtml();
  else if (activeTab === "Settings") contentEl.innerHTML = settingsTabHtml();
  else contentEl.innerHTML = promptTabHtml();
  wireTabActions();
}

function selectJdMode(mode) {
  state.jdDraft = {
    ...state.jdDraft,
    mode,
    history_job_id: mode === "history" ? state.jdDraft.history_job_id : null,
    manual_input_id: mode === "manual" ? state.jdDraft.manual_input_id : null,
  };
  if (mode === "manual" && !state.jdManualSource) state.jdManualSource = "paste";
  if (mode !== "manual") state.jdManualSource = null;
}

function selectManualSource(kind) {
  state.jdManualSource = kind;
  const manual = syncManualSourcesFromView(state.jdView);
  state.jdDraft = {
    ...state.jdDraft,
    mode: "manual",
    history_job_id: null,
    manual_input_id: kind === "paste" ? manual.pasteId : manual.uploadId,
  };
}

async function saveJdSelection() {
  if (!state.jdDraft) return;
  state.jdSaving = true;
  await renderContent();

  try {
    let manualInputId = null;
    if (state.jdDraft.mode === "manual") {
      const manual = syncManualSourcesFromView(state.jdView);
      if (state.jdManualSource === "upload") {
        if (state.jdPendingFile) {
          const buffer = await fileToBuffer(state.jdPendingFile);
          const res = await panelApi("CREATE_MANUAL_JD", {
            fileBase64: arrayBufferToBase64(buffer),
            fileName: state.jdPendingFile.name,
            mimeType: state.jdPendingFile.type,
            local_file_path: state.jdPendingFile.name,
          });
          if (!res.ok) throw new Error(res.error);
          manualInputId = res.item.id;
          state.jdPendingFile = null;
        } else {
          manualInputId = manual.uploadId;
        }
        if (!manualInputId) throw new Error("Upload a JD file first.");
      } else {
        const text = state.jdManualText.trim();
        if (!text) throw new Error("Paste JD text first.");
        const res = await panelApi("CREATE_MANUAL_JD", {
          text,
          title: String(state.jdManualTitleInput || "").trim() || undefined,
        });
        if (!res.ok) throw new Error(res.error);
        manualInputId = res.item.id;
      }
    }

    const res = await panelApi("PATCH_JD_SETTINGS", {
      payload: {
        mode: state.jdDraft.mode,
        history_job_id: state.jdDraft.mode === "history" ? state.jdDraft.history_job_id : null,
        manual_input_id: state.jdDraft.mode === "manual" ? manualInputId : null,
      },
    });
    if (!res.ok) throw new Error(res.error);

    await loadJdView();
    const manual = syncManualSourcesFromView(state.jdView);
    state.jdManualSource = manual.active ?? state.jdManualSource;
    state.jdManualText = manual.pasteText ?? state.jdManualText;
    state.jdManualTitleInput = manual.pasteName ?? state.jdManualTitleInput;
    setInlineBanner("JD source saved.", "ok");
  } catch (err) {
    setInlineBanner(err?.message || "Failed to save JD source.", "err");
  } finally {
    state.jdSaving = false;
    await renderContent();
  }
}

function showJdPreview(text) {
  const backdrop = document.createElement("div");
  backdrop.className = "dialog-backdrop";
  backdrop.innerHTML = `
    <div class="dialog" role="dialog">
      <h3>JD preview</h3>
      <pre>${escapeHtml(text || "(empty)")}</pre>
      <div class="row"><button type="button" class="btn primary" id="jdDialogClose">Close</button></div>
    </div>`;
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
  document.body.appendChild(backdrop);
  backdrop.querySelector("#jdDialogClose")?.addEventListener("click", () => backdrop.remove());
}

function wirePromptTabActions() {
  document.getElementById("promptResetBtn")?.addEventListener("click", () => {
    const editor = document.getElementById("promptEditor");
    if (editor) editor.value = DEFAULT_PROMPT_TEMPLATE;
    void savePromptTemplate(DEFAULT_PROMPT_TEMPLATE);
    state.promptTemplate = DEFAULT_PROMPT_TEMPLATE;
  });
  document.getElementById("promptEditor")?.addEventListener("input", (e) => {
    state.promptTemplate = String(e.target.value || "");
    clearTimeout(wirePromptTabActions._saveTimer);
    wirePromptTabActions._saveTimer = setTimeout(() => {
      void savePromptTemplate(state.promptTemplate);
    }, 500);
  });
}

function wireTabActions() {
  if (activeTab === "JD") {
    wireJdTabActions();
    return;
  }
  if (activeTab === "Resume") {
    wireResumeLocalActions();
    return;
  }
  if (activeTab === "Preview") {
    wirePreviewTabActions();
    return;
  }
  if (activeTab === "Prompt") {
    wirePromptTabActions();
    return;
  }

  document.getElementById("settingsToken")?.addEventListener("input", (e) => {
    state.settingsTokenInput = String(e.target?.value || "");
    if (state.settingsFeedback.token.text || state.settingsFeedback.connection.text) {
      clearSettingsFieldFeedback("token", "connection");
      if (activeTab === "Settings") void renderContent();
    }
  });

  document.getElementById("settingsUsername")?.addEventListener("input", (e) => {
    state.settingsUsernameInput = String(e.target?.value || "").trim().toLowerCase();
    if (state.settingsFeedback.username.text) {
      clearSettingsFieldFeedback("username");
      if (activeTab === "Settings") void renderContent();
    }
  });

  document.getElementById("saveTokenBtn")?.addEventListener("click", async () => {
    const token = String(state.settingsTokenInput || "").trim();
    clearSettingsFieldFeedback("token", "connection");
    setPanelStatus("");
    if (!token) {
      setSettingsFieldFeedback("token", "Paste your capture token first.", "warn");
      await renderContent();
      return;
    }
    state.settingsBusy.saveToken = true;
    setSettingsFieldFeedback("token", "Saving token…", "warn");
    await renderContent();
    const res = await panelApi("SAVE_TOKEN", { token });
    state.settingsBusy.saveToken = false;
    if (!res.ok) {
      setSettingsFieldFeedback("token", res.error || "Save failed.", "err");
      await renderContent();
      return;
    }
    state.tokenConfigured = true;
    await refreshContext();
    setSettingsFieldFeedback("token", "Token saved. Click Test connection.", "ok");
    await renderContent();
  });

  document.getElementById("testConnectionBtn")?.addEventListener("click", async () => {
    clearSettingsFieldFeedback("connection");
    setPanelStatus("");
    state.settingsBusy.testConnection = true;
    setSettingsFieldFeedback("connection", "Testing connection…", "warn");
    await renderContent();
    const res = await send("TEST_CONNECTION");
    await refreshContext({ forceRefresh: true });
    state.settingsBusy.testConnection = false;
    if (res?.ok) {
      const who = res.me?.display_name || res.me?.email || "your account";
      const team = res.me?.team_id ? ` · team ${String(res.me.team_id).slice(0, 8)}…` : "";
      setSettingsFieldFeedback("connection", `Connected as ${who}${team}.`, "ok");
    } else {
      setSettingsFieldFeedback("connection", res?.error || res?.detail || "Connection failed.", "err");
    }
    await renderContent();
  });

  document.getElementById("refreshStatusBtn")?.addEventListener("click", async () => {
    clearSettingsFieldFeedback("connection");
    setSettingsFieldFeedback("connection", "Refreshing status…", "warn");
    await renderContent();
    await refreshContext({ forceRefresh: true });
    updateStatusBadge();
    setSettingsFieldFeedback("connection", "Status refreshed.", "ok");
    await renderContent();
  });

  document.getElementById("validateUserBtn")?.addEventListener("click", async () => {
    const username = String(state.settingsUsernameInput || "").trim().toLowerCase();
    clearSettingsFieldFeedback("username");
    setPanelStatus("");
    if (!username) {
      setSettingsFieldFeedback("username", "Enter a username first.", "warn");
      await renderContent();
      return;
    }
    state.settingsBusy.validateUsername = true;
    setSettingsFieldFeedback("username", "Validating username…", "warn");
    await renderContent();
    const res = await send("VALIDATE_USERNAME", { username });
    if (res?.ok) {
      state.settingsUsernameInput = username;
    }
    await refreshContext({ forceRefresh: true });
    state.settingsUsernameInput = username;
    state.settingsBusy.validateUsername = false;
    setSettingsFieldFeedback(
      "username",
      res?.ok ? `Username "${username}" validated.` : res?.error || res?.detail || "Validation failed.",
      res?.ok ? "ok" : "err",
    );
    await renderContent();
  });

  contentEl.querySelectorAll(".env-chip[data-env]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const apiEnv = btn.getAttribute("data-env") === "local" ? "local" : "production";
      if (apiEnv === state.settingsEnvDraft || state.settingsBusy.saveEnv) return;
      clearSettingsFieldFeedback("env");
      setPanelStatus("");
      state.settingsBusy.saveEnv = true;
      setSettingsFieldFeedback("env", "Saving environment…", "warn");
      await renderContent();
      const res = await panelApi("SAVE_ENV", { apiEnv });
      if (!res.ok) {
        state.settingsBusy.saveEnv = false;
        await refreshContext();
        setSettingsFieldFeedback("env", res.error || "Could not save environment.", "err");
        await renderContent();
        return;
      }
      state.settingsEnvDraft = apiEnv;
      await refreshContext();
      state.settingsEnvDraft = apiEnv;
      state.settingsBusy.saveEnv = false;
      setSettingsFieldFeedback(
        "env",
        apiEnv === "local" ? "Using localhost (http://localhost:3000)." : "Using production.",
        "ok",
      );
      await renderContent();
    });
  });
}

async function openDashboard(path = "/dashboard") {
  const settings = await loadExtensionSettings();
  const url =
    settings.apiEnv === "local"
      ? `http://localhost:3000${path}`
      : `${JBHM_CONFIG.PRODUCTION_URL}${path}`;
  chrome.tabs.create({ url });
}

function applyCollapsedUi(collapsed) {
  document.body.classList.toggle("is-collapsed", collapsed);
}

async function syncWorkspaceLayoutFromHost() {
  const ws = await send("GET_WORKSPACE_STATE");
  if (ws?.open) applyCollapsedUi(Boolean(ws.collapsed));
}

window.addEventListener("message", (event) => {
  const data = event.data;
  if (data?.source !== "jbhm-panel-host" || data?.type !== "JBHM_WORKSPACE_LAYOUT") return;
  applyCollapsedUi(Boolean(data.collapsed));
});

previewTabBtn.addEventListener("click", async () => {
  activeTab = "Preview";
  await switchTab();
});

promptSendFooterBtn.addEventListener("click", async () => {
  const prevText = promptSendFooterBtn.textContent;
  promptSendFooterBtn.disabled = true;
  promptSendFooterBtn.textContent = "Sending…";
  try {
    const editor = document.getElementById("promptEditor");
    if (editor) {
      state.promptTemplate = String(editor.value || DEFAULT_PROMPT_TEMPLATE);
      await savePromptTemplate(state.promptTemplate);
    } else {
      state.promptTemplate = await loadPromptTemplate();
    }
    const text = buildLocalChatGptPrompt({
      template: state.promptTemplate,
      jdText: await getEffectiveJdText(),
      jobTitle: state.jdLocal?.title,
      company: state.previewDraft?.company_name,
      resumeLabel: state.resumeLocalText
        ? `${state.resumeLocalText.length} chars local resume`
        : "local resume",
      username: state.status?.username,
    });
    state.localPromptText = text;
    await setPreviewCaptureMode(true);
    const res = await send("PASTE_LOCAL_PROMPT", {
      text,
      autoCapture: true,
      previewOnly: true,
    });
    setInlineBanner(
      res?.status === "ok" ? "Sent to ChatGPT — check Preview tab." : res?.detail || "Send failed.",
      res?.status === "ok" ? "ok" : "err",
    );
    if (res?.status === "ok" && activeTab !== "Preview") {
      activeTab = "Preview";
      await switchTab();
    }
  } finally {
    promptSendFooterBtn.disabled = false;
    promptSendFooterBtn.textContent = prevText || "ChatGPT";
  }
});

resumeDownloadBtn.addEventListener("click", async () => {
  const prevText = resumeDownloadBtn.textContent;
  resumeDownloadBtn.disabled = true;
  resumeDownloadBtn.textContent = "Preparing…";
  try {
    await loadPreviewFromStorage();
    const text = state.previewDraft?.gpt_text || "";
    const res = text.trim()
      ? await send("RENDER_PREVIEW_DOCX", {
          text,
          jd_label: state.jdLocal?.title || state.previewDraft?.job_title || "resume",
        })
      : await send("DOWNLOAD_EXPORT");
    setInlineBanner(
      res?.status === "ok" ? "Download started." : res?.detail || res?.error || "Download failed.",
      res?.status === "ok" ? "ok" : "err",
    );
  } finally {
    resumeDownloadBtn.disabled = false;
    resumeDownloadBtn.textContent = prevText || "DOCX";
  }
});

async function boot() {
  showTabLoading("Connecting…");
  await refreshContext({ forceRefresh: false });
  await syncWorkspaceLayoutFromHost();
  await Promise.all([
    loadJdLocalFromStorage(),
    getLocalResumeText().then((text) => {
      state.resumeLocalText = text;
    }),
    loadPreviewFromStorage(),
    loadPromptTemplate().then((template) => {
      state.promptTemplate = template;
    }),
  ]);
  if (await consumeOpenToPreview()) {
    activeTab = "Preview";
  }
  renderTabs();
  await renderContent();
}

void boot();

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "PREVIEW_DRAFT_UPDATED") {
    void Promise.all([loadPreviewFromStorage(), consumeOpenToPreview()]).then(async () => {
      if (activeTab !== "Preview") {
        activeTab = "Preview";
        renderTabs();
      }
      await renderContent();
      setInlineBanner("Preview updated — review and edit before accepting.", "ok");
    });
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    void send("CLOSE_WORKSPACE");
  }
});
