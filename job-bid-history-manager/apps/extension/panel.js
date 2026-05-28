const tabsEl = document.getElementById("tabs");
const contentEl = document.getElementById("tabContent");
const siteMetaEl = document.getElementById("siteMeta");
const connBadgeEl = document.getElementById("connBadge");
const saveCaptureBtn = document.getElementById("saveCaptureBtn");
const promptSendFooterBtn = document.getElementById("promptSendBtn");
const resumeDownloadBtn = document.getElementById("resumeDownloadBtn");

const TABS = ["JD", "Resume", "Settings", "Prompt"];
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
  if (tab === "Resume") return "Loading resumes…";
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
  for (const item of view?.manual_items || []) {
    if (item.source_type === "text" && !pasteId) pasteId = item.id;
    else if (item.source_type !== "text" && !uploadId) {
      uploadId = item.id;
      uploadLabel = item.label;
    }
  }

  let active = null;
  let pasteText = state.jdManualText;
  let selectedLabel = state.jdManualTitleInput;
  const selected = view?.selected_manual;
  if (view?.selection?.mode === "manual" && selected) {
    active = selected.source_type === "text" ? "paste" : "upload";
    selectedLabel = String(selected.label || "");
    if (selected.source_type === "text") {
      pasteId = selected.id;
      pasteText = String(selected.extracted_text ?? "");
    } else {
      uploadId = selected.id;
      uploadLabel = selected.label;
    }
  } else if (pasteId) {
    const pasteItem = (view?.manual_items || []).find((item) => item.id === pasteId);
    pasteText = String(pasteItem?.extracted_text ?? pasteText);
  }

  return { pasteId, uploadId, uploadLabel, active, pasteText, selectedLabel };
}

function modeCardClass(mode) {
  const selected = (state.jdDraft?.mode || "latest") === mode;
  return `section-card ${selected ? "selected" : "dim"}`;
}

function manualPaneClass(kind) {
  const selected = state.jdDraft?.mode === "manual" && state.jdManualSource === kind;
  return kind === "paste" ? `manual-pane ${selected ? "selected" : ""}` : `upload-zone ${selected ? "selected" : ""}`;
}

async function refreshContext() {
  const [status, page, syncData] = await Promise.all([
    send("GET_EXTENSION_STATUS"),
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
  state.jdManualTitleInput = manual.selectedLabel ?? state.jdManualTitleInput;
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
  for (const tab of TABS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `tab ${tab === activeTab ? "active" : ""}`;
    b.textContent = tab;
    b.addEventListener("click", () => {
      activeTab = tab;
      void switchTab();
    });
    tabsEl.appendChild(b);
  }
}

async function switchTab() {
  const tab = activeTab;
  renderTabs();
  const needsFetch = tab === "JD" || tab === "Resume" || tab === "Settings";
  if (needsFetch) {
    setTabsBusy(true);
    showTabLoading(tabLoadingLabel(tab));
  }

  try {
    if (tab === "JD") await loadJdView();
    else if (tab === "Resume") await loadResumeLibrary();
    else if (tab === "Settings") await refreshContext();
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

function jdTabHtml() {
  if (!state.status?.connected) {
    return `<p class="page-loading">Connect in Settings (capture token) to manage JD source.</p>`;
  }
  if (state.jdBusy && !state.jdView) {
    return `<p class="page-loading">Loading JD source…</p>`;
  }

  const manual = syncManualSourcesFromView(state.jdView);
  const mode = state.jdDraft?.mode === "history" ? "latest" : state.jdDraft?.mode || "latest";
  const uploadLabel =
    state.jdPendingFile?.name || manual.uploadLabel || "Drag or upload JD (.docx / .pdf)";

  return `
    ${tabFeedbackHtml("JD")}
    <section class="${modeCardClass("manual")}" data-mode="manual">
      <h2>Manual JD</h2>
      <p class="hint">Paste text or upload a file — same as dashboard JD Source.</p>
      <label class="label" for="jdManualTitle">Manual JD name (used in DOCX filename)</label>
      <input id="jdManualTitle" class="input" type="text" maxlength="120" placeholder="e.g. Google - Senior Engineer JD" value="${escapeHtml(state.jdManualTitleInput)}" ${state.jdSaving ? "disabled" : ""} />
      <div class="manual-grid">
        <div class="${manualPaneClass("paste")}" data-manual="paste">
          ${mode === "manual" && state.jdManualSource === "paste" ? '<span class="pane-badge">Selected</span>' : ""}
          <textarea id="jdManualText" class="textarea borderless" placeholder="Paste JD text…" ${state.jdSaving ? "disabled" : ""}>${escapeHtml(state.jdManualText)}</textarea>
        </div>
        <div class="${manualPaneClass("upload")}" data-manual="upload" id="jdUploadZone">
          ${mode === "manual" && state.jdManualSource === "upload" ? '<span class="pane-badge">Selected</span>' : ""}
          <span aria-hidden="true">↑</span>
          <span>${escapeHtml(uploadLabel)}</span>
          <input type="file" id="jdFileInput" class="hidden-input" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
        </div>
      </div>
    </section>

    <section class="${modeCardClass("latest")}" data-mode="latest">
      <h2>Latest job bid JD</h2>
      <p class="muted">Uses the most recently captured job description for ChatGPT prompts.</p>
    </section>

    <div class="sticky-footer-actions row">
      <button type="button" class="btn primary" id="jdSaveBtn" ${state.jdSaving ? "disabled" : ""}>
        ${state.jdSaving ? "Saving…" : "Save JD source"}
      </button>
      <button type="button" class="btn" id="jdRefreshBtn" ${state.jdBusy ? "disabled" : ""}>Refresh</button>
    </div>
  `;
}

function resumeTabHtml() {
  if (!state.status?.connected) {
    return `<p class="page-loading">Connect in Settings to manage your resume library.</p>`;
  }
  if (state.resumeLoading) {
    return `<p class="page-loading">Loading resumes…</p>`;
  }

  const list =
    state.resumeItems.length === 0
      ? `<div class="empty-state">No resumes yet. Upload your master .docx for ChatGPT optimization.</div>`
      : `<ul class="resume-list">${state.resumeItems
          .map(
            (item) => `
        <li class="resume-item">
          <div class="resume-item-info">
            <p class="resume-item-title">${escapeHtml(item.original_filename)}</p>
            <p class="resume-item-meta">${item.is_default ? "Default" : "Library"} · ${new Date(item.uploaded_at).toLocaleString()}</p>
          </div>
          <div class="resume-item-actions">
            ${
              !item.is_default
                ? `<button type="button" class="btn sm" data-resume-default="${escapeHtml(item.id)}">Set default</button>
                   <button type="button" class="btn sm ghost" data-resume-delete="${escapeHtml(item.id)}">Remove</button>`
                : ""
            }
          </div>
        </li>`,
          )
          .join("")}</ul>`;

  return `
    ${tabFeedbackHtml("Resume")}
    <p class="hint">Upload and set your default resume — matches the dashboard Resumes page.</p>
    <div class="row">
      <button type="button" class="btn primary" id="resumeUploadBtn" ${state.resumeBusy ? "disabled" : ""}>${state.resumeBusy ? "Uploading..." : "Upload .docx"}</button>
      <input type="file" id="resumeFileInput" class="hidden-input" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
    </div>
    ${list}
  `;
}

function settingsTabHtml() {
  const s = state.status || {};
  const hint = captureReadinessHint();
  return `
    ${hint ? `<div class="banner ${hint.type}">${escapeHtml(hint.text)}</div>` : ""}

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
    <section class="settings-section">
      <h3>Editable prompt template</h3>
      <p class="hint">Prepended to the server-controlled suffix when sending to ChatGPT.</p>
      <textarea id="promptEditor" class="textarea mono" style="min-height:200px">${escapeHtml(state.promptTemplate)}</textarea>
      <div class="row">
        <button type="button" class="btn" id="promptResetBtn" ${state.settingsBusy.savePrompt || state.settingsBusy.sendPrompt ? "disabled" : ""}>Reset default</button>
        <button type="button" class="btn" id="promptSaveBtn" ${state.settingsBusy.savePrompt ? "disabled" : ""}>
          ${state.settingsBusy.savePrompt ? "Saving…" : "Save prompt"}
        </button>
        <button type="button" class="btn primary" id="promptSendTabBtn" ${state.settingsBusy.sendPrompt ? "disabled" : ""}>
          ${state.settingsBusy.sendPrompt ? "Sending…" : "Send to ChatGPT"}
        </button>
      </div>
    </section>
    <section class="settings-section">
      <h3>Locked suffix (server controlled)</h3>
      <textarea class="textarea mono" readonly style="min-height:120px">${escapeHtml(LOCKED_PROMPT_SUFFIX_PREVIEW)}</textarea>
    </section>
  `;
}

async function renderContent() {
  if (activeTab === "JD") contentEl.innerHTML = jdTabHtml();
  else if (activeTab === "Resume") contentEl.innerHTML = resumeTabHtml();
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
            title: String(state.jdManualTitleInput || "").trim() || undefined,
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
    state.jdManualTitleInput = manual.selectedLabel ?? state.jdManualTitleInput;
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

function wireTabActions() {
  contentEl.querySelectorAll("[data-mode]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-skip-mode-select], button, input, textarea, label, table, a")) return;
      selectJdMode(el.getAttribute("data-mode"));
      void renderContent();
    });
  });

  contentEl.querySelectorAll("[data-manual]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("textarea")) return;
      selectManualSource(el.getAttribute("data-manual"));
      void renderContent();
    });
  });

  const jdManual = document.getElementById("jdManualText");
  const jdManualTitle = document.getElementById("jdManualTitle");
  jdManualTitle?.addEventListener("input", (e) => {
    state.jdManualTitleInput = String(e.target.value || "");
  });
  jdManual?.addEventListener("input", (e) => {
    state.jdManualText = String(e.target.value || "");
    selectManualSource("paste");
  });
  jdManual?.addEventListener("focus", () => {
    selectManualSource("paste");
    void renderContent();
  });

  const jdUploadZone = document.getElementById("jdUploadZone");
  const jdFileInput = document.getElementById("jdFileInput");
  jdUploadZone?.addEventListener("click", (e) => {
    if (e.target.closest("textarea")) return;
    selectManualSource("upload");
    jdFileInput?.click();
  });
  jdFileInput?.addEventListener("change", () => {
    const file = jdFileInput.files?.[0];
    if (!file) return;
    state.jdPendingFile = file;
    selectManualSource("upload");
    void renderContent();
  });

  document.getElementById("jdSaveBtn")?.addEventListener("click", () => void saveJdSelection());
  document.getElementById("jdRefreshBtn")?.addEventListener("click", async () => {
    await loadJdView();
    await renderContent();
  });

  const resumeFileInput = document.getElementById("resumeFileInput");
  document.getElementById("resumeUploadBtn")?.addEventListener("click", () => resumeFileInput?.click());
  resumeFileInput?.addEventListener("change", async () => {
    const file = resumeFileInput.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setInlineBanner("Only .docx files are allowed.", "err");
      return;
    }
    state.resumeBusy = true;
    await renderContent();
    try {
      const buffer = await fileToBuffer(file);
      const res = await panelApi("UPLOAD_RESUME", {
        fileBase64: arrayBufferToBase64(buffer),
        fileName: file.name,
        mimeType: file.type,
        setDefault: state.resumeItems.length === 0,
      });
      if (!res.ok) throw new Error(res.error);
      await loadResumeLibrary();
      setInlineBanner("Resume uploaded.", "ok");
    } catch (err) {
      setInlineBanner(err?.message || "Upload failed.", "err");
    } finally {
      state.resumeBusy = false;
      resumeFileInput.value = "";
      await renderContent();
    }
  });

  contentEl.querySelectorAll("[data-resume-default]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.resumeBusy = true;
      await renderContent();
      const res = await panelApi("SET_RESUME_DEFAULT", { resumeId: btn.getAttribute("data-resume-default") });
      state.resumeBusy = false;
      if (!res.ok) setInlineBanner(res.error || "Update failed.", "err");
      else {
        await loadResumeLibrary();
        setInlineBanner("Default resume updated.", "ok");
      }
      await renderContent();
    });
  });

  contentEl.querySelectorAll("[data-resume-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.resumeBusy = true;
      await renderContent();
      const res = await panelApi("DELETE_RESUME", { resumeId: btn.getAttribute("data-resume-delete") });
      state.resumeBusy = false;
      if (!res.ok) setInlineBanner(res.error || "Delete failed.", "err");
      else {
        await loadResumeLibrary();
        setInlineBanner("Resume removed.", "ok");
      }
      await renderContent();
    });
  });

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
    await refreshContext();
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
    await refreshContext();
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

  const bindPromptSend = async () => {
    const editor = document.getElementById("promptEditor");
    state.settingsBusy.sendPrompt = true;
    await renderContent();
    try {
      if (editor) await savePromptTemplate(String(editor.value || DEFAULT_PROMPT_TEMPLATE));
      const res = await send("GENERATE_CHATGPT_PROMPT");
      setInlineBanner(
        res?.status === "ok" ? "Prompt sent to ChatGPT." : res?.detail || res?.error || "Prompt failed.",
        res?.status === "ok" ? "ok" : "err",
      );
    } finally {
      state.settingsBusy.sendPrompt = false;
      await renderContent();
    }
  };

  document.getElementById("promptResetBtn")?.addEventListener("click", () => {
    const editor = document.getElementById("promptEditor");
    if (editor) editor.value = DEFAULT_PROMPT_TEMPLATE;
  });
  document.getElementById("promptSaveBtn")?.addEventListener("click", async () => {
    const editor = document.getElementById("promptEditor");
    state.settingsBusy.savePrompt = true;
    await renderContent();
    try {
      await savePromptTemplate(String(editor?.value || DEFAULT_PROMPT_TEMPLATE));
      setInlineBanner("Prompt saved.", "ok");
    } finally {
      state.settingsBusy.savePrompt = false;
      await renderContent();
    }
  });
  document.getElementById("promptSendTabBtn")?.addEventListener("click", () => void bindPromptSend());
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

saveCaptureBtn.addEventListener("click", async () => {
  const prevText = saveCaptureBtn.textContent;
  saveCaptureBtn.disabled = true;
  saveCaptureBtn.textContent = "Capturing…";
  const res = await send("CAPTURE_FROM_PANEL");
  setInlineBanner(
    res?.ok ? "Capture saved." : res?.error || res?.detail || "Capture failed.",
    res?.ok ? "ok" : "err",
  );
  if (res?.ok && activeTab === "JD") {
    await loadJdView();
    await renderContent();
  }
  saveCaptureBtn.disabled = false;
  saveCaptureBtn.textContent = prevText || "Capture job";
});

promptSendFooterBtn.addEventListener("click", async () => {
  const prevText = promptSendFooterBtn.textContent;
  promptSendFooterBtn.disabled = true;
  promptSendFooterBtn.textContent = "Sending…";
  const res = await send("GENERATE_CHATGPT_PROMPT");
  setInlineBanner(
    res?.status === "ok" ? "Prompt sent to ChatGPT." : res?.detail || res?.error || "Prompt failed.",
    res?.status === "ok" ? "ok" : "err",
  );
  promptSendFooterBtn.disabled = false;
  promptSendFooterBtn.textContent = prevText || "ChatGPT";
});

resumeDownloadBtn.addEventListener("click", async () => {
  const prevText = resumeDownloadBtn.textContent;
  resumeDownloadBtn.disabled = true;
  resumeDownloadBtn.textContent = "Preparing…";
  const res = await send("DOWNLOAD_EXPORT");
  setInlineBanner(
    res?.status === "ok" ? "Download started." : res?.detail || res?.error || "Download failed.",
    res?.status === "ok" ? "ok" : "err",
  );
  resumeDownloadBtn.disabled = false;
  resumeDownloadBtn.textContent = prevText || "DOCX";
});

async function boot() {
  showTabLoading("Connecting…");
  await refreshContext();
  await syncWorkspaceLayoutFromHost();
  renderTabs();
  if (state.status?.connected) {
    showTabLoading(tabLoadingLabel(activeTab));
    await Promise.all([loadJdView(), loadResumeLibrary()]);
  }
  await renderContent();
}

void boot();

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    void send("CLOSE_WORKSPACE");
  }
});
