const sideNavEl = document.getElementById("sideNav");
const sideNavItemsEl = document.getElementById("sideNavItems");
const sideNavToggleEl = document.getElementById("sideNavToggle");
const contentEl = document.getElementById("tabContent");
const siteMetaEl = document.getElementById("siteMeta");
const connBadgeEl = document.getElementById("connBadge");
const gptPromptBtn = document.getElementById("gptPromptBtn");
const gptResultBtn = document.getElementById("gptResultBtn");
const footerDownloadBtn = document.getElementById("footerDownloadBtn");
const footerDashboardBtn = document.getElementById("footerDashboardBtn");

function setFooterActionBusy(busy) {
  if (gptPromptBtn) gptPromptBtn.disabled = busy;
  if (gptResultBtn) gptResultBtn.disabled = busy;
  if (footerDownloadBtn) footerDownloadBtn.disabled = busy;
}

const SIDE_NAV_COLLAPSED_KEY = "jbhmSideNavCollapsed";

const NAV_DEFS = [
  { id: "Resume", label: "Resume", icon: "resume" },
  { id: "JD", label: "JD", icon: "jd" },
  { id: "Output", label: "Output", icon: "output" },
  { id: "Settings", label: "Settings", icon: "settings" },
];
let activeSection = "JD";

function navIconSvg(kind) {
  const icons = {
    resume: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 4h8l4 4v12a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z" stroke="currentColor" stroke-width="1.75"/><path d="M14 4v4h4M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`,
    jd: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.75"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 12h18" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`,
    output: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h16" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><circle cx="18" cy="12" r="2" fill="currentColor"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.75"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`,
  };
  return icons[kind] || icons.settings;
}

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
  savedCaptureTokens: [],
  activeCaptureToken: "",
  tokenRevealed: {},
  tokenConfigured: false,
  registeredUsernames: [],
  serverSyncPending: false,
  settingsEnvDraft: "production",
  settingsFeedback: {
    token: { text: "", type: "" },
    connection: { text: "", type: "" },
    username: { text: "", type: "" },
    env: { text: "", type: "" },
    docxStyle: { text: "", type: "" },
    outputPath: { text: "", type: "" },
  },
  tabFeedback: {
    JD: { text: "", type: "" },
    Resume: { text: "", type: "" },
  },
  settingsBusy: {
    saveToken: false,
    testConnection: false,
    saveEnv: false,
    savePrompt: false,
    sendPrompt: false,
  },
  captureDraft: null,
  resumeLocalText: "",
  resumeLocalName: "",
  resumeActiveId: "",
  resumeLibrary: [],
  resumeLibraryLoading: false,
  resumeSaving: false,
  previewDraft: null,
  localPromptText: "",
  localPromptWarning: "",
  groqModel: JBHM_CONFIG.DEFAULT_GROQ_MODEL,
  resumeDocxStyle: JBHM_CONFIG.DEFAULT_DOCX_STYLE,
  outputPathTemplate: "",
  outputPathDraft: "",
  promptIncludeProject: true,
  outputAccordion: { style: true, path: false, prompt: false },
  settingsAccordion: { token: true, server: false },
  sideNavCollapsed: false,
};

function send(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        const raw = chrome.runtime.lastError.message || "";
        const error =
          typeof isExtensionContextInvalidatedError === "function" &&
          isExtensionContextInvalidatedError(raw)
            ? extensionReloadUserMessage()
            : raw;
        resolve({ ok: false, error });
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

function sectionLoadingLabel(section) {
  if (section === "JD") return "Loading JD…";
  if (section === "Resume") return "Loading resume…";
  if (section === "Output") return "Loading output…";
  if (section === "Settings") return "Loading settings…";
  return "Loading…";
}

function showTabLoading(label) {
  contentEl.innerHTML = tabLoadingHtml(label);
}

function setNavBusy(busy) {
  sideNavItemsEl?.querySelectorAll(".side-nav-item").forEach((btn) => {
    btn.disabled = busy;
    btn.setAttribute("aria-busy", busy ? "true" : "false");
  });
}

function applySideNavCollapsed(collapsed) {
  state.sideNavCollapsed = collapsed;
  sideNavEl?.classList.toggle("side-nav--collapsed", collapsed);
  if (sideNavToggleEl) {
    sideNavToggleEl.setAttribute("aria-expanded", collapsed ? "false" : "true");
    sideNavToggleEl.title = collapsed ? "Show menu" : "Show content";
    sideNavToggleEl.setAttribute("aria-label", collapsed ? "Show menu" : "Show content");
  }
}

async function loadSideNavCollapsed() {
  const data = await chrome.storage.local.get({ [SIDE_NAV_COLLAPSED_KEY]: false });
  return Boolean(data[SIDE_NAV_COLLAPSED_KEY]);
}

async function saveSideNavCollapsed(collapsed) {
  await chrome.storage.local.set({ [SIDE_NAV_COLLAPSED_KEY]: collapsed });
}

/** Animated top-right web toast. The panel runs in an iframe, so we ask the host page (toast.js). */
function setInlineBanner(text, type = "warn") {
  const msg = String(text || "").trim();
  if (!msg) return;
  const variant =
    type === "ok" ? "success" : type === "err" ? "error" : type === "info" ? "info" : "warning";
  try {
    window.parent?.postMessage(
      { source: "jbhm-panel", type: "JBHM_SHOW_TOAST", text: msg, variant },
      "*",
    );
  } catch {
    /* parent unavailable */
  }
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

function accordionChevronSvg() {
  return `<svg class="accordion-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function accordionItemHtml(id, title, bodyHtml, open, group) {
  const isOpen = Boolean(open);
  return `
    <div class="accordion-item ${isOpen ? "is-open" : ""}" data-accordion-group="${escapeHtml(group)}" data-accordion-id="${escapeHtml(id)}">
      <button type="button" class="accordion-trigger" aria-expanded="${isOpen ? "true" : "false"}">
        <span>${escapeHtml(title)}</span>
        ${accordionChevronSvg()}
      </button>
      <div class="accordion-panel">
        <div class="accordion-panel-inner">
          <div class="accordion-body">${bodyHtml}</div>
        </div>
      </div>
    </div>
  `;
}

function wireAccordion(root, group, openState) {
  root?.querySelectorAll(`.accordion-item[data-accordion-group="${group}"]`).forEach((item) => {
    const id = item.getAttribute("data-accordion-id");
    const trigger = item.querySelector(".accordion-trigger");
    trigger?.addEventListener("click", () => {
      const next = !item.classList.contains("is-open");
      item.classList.toggle("is-open", next);
      trigger.setAttribute("aria-expanded", next ? "true" : "false");
      if (id && openState) openState[id] = next;
    });
  });
}

function docxStylePreviewSrc(styleId) {
  const map = {
    calibri: "calibri.png",
    "chad-taylor": "chad-taylor.png",
    "chad-taylor-pdf": "chad-taylor-pdf.png",
    flowcv: "flowcv.png",
    "flowcv-source": "flowcv-source.png",
  };
  const file = map[styleId] || `${styleId}.png`;
  return `images/docx-styles/${encodeURIComponent(file)}`;
}

function describeCurrentOutputPath(template) {
  return typeof formatOutputPathForDisplay === "function"
    ? formatOutputPathForDisplay(template)
    : `Downloads/${String(template ?? "").trim() || "jbhm/{username}-{date}/{company}-{role}/{name}.docx"}`;
}

function updateOutputPathCurrentDisplay(template) {
  const el = document.getElementById("outputPathCurrent");
  if (el) el.textContent = describeCurrentOutputPath(template);
}

function updateStatusBadge() {
  const s = state.status || {};
  connBadgeEl.classList.remove("ok", "warn", "err");
  if (state.serverSyncPending && !s.connected) {
    connBadgeEl.textContent = "Syncing…";
    connBadgeEl.classList.add("warn");
    return;
  }
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
  if (state.serverSyncPending) return null;
  const s = state.status || {};
  if (!s.configured) return { text: "Set capture token in Settings.", type: "warn" };
  if (!s.connected) return { text: "Token invalid. Reconnect in Settings.", type: "err" };
  if (!s.username_validated) return { text: "Validate username in Settings before capture.", type: "warn" };
  return null;
}

/** Requirements only for Accept & send to dashboard (local DOCX/GPT flow works without these). */
function dashboardAcceptHint() {
  const s = state.status || {};
  if (!s.configured) {
    return { text: "Accept & send to dashboard needs a capture token in Settings.", type: "warn" };
  }
  if (!s.connected) {
    return { text: "Fix your capture token in Settings before sending to the dashboard.", type: "err" };
  }
  if (!s.username_validated) {
    return { text: "Validate username in Settings before sending to the dashboard.", type: "warn" };
  }
  return null;
}

function canAcceptPreviewToDashboard() {
  const s = state.status || {};
  return Boolean(s.configured && s.connected && s.username_validated && !state.previewDraft?.saving);
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
  if (activeSection !== "JD") return;
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

async function loadSavedCaptureTokens() {
  const res = await panelApi("LIST_TOKENS");
  state.savedCaptureTokens = Array.isArray(res?.items) ? res.items : [];
  state.activeCaptureToken = String(res?.active || res?.token || "").trim();
  state.tokenConfigured = Boolean(state.activeCaptureToken || state.savedCaptureTokens.length);
}

async function loadRegisteredUsernames(options = {}) {
  const fromServer = options.fromServer === true;
  const hasToken = Boolean(
    state.activeCaptureToken || state.tokenConfigured || (state.savedCaptureTokens || []).length,
  );
  if (!hasToken) {
    state.registeredUsernames = [];
    return { ok: false, usernames: [], error: "Add a capture token first." };
  }
  if (!fromServer) {
    const cached = Array.isArray(state.status?.registered_usernames) ? state.status.registered_usernames : [];
    const stored = await chrome.storage.local.get({ lastRegisteredUsernames: [] });
    const saved = Array.isArray(stored.lastRegisteredUsernames) ? stored.lastRegisteredUsernames : [];
    state.registeredUsernames = (cached.length ? cached : saved)
      .map((n) => String(n || "").trim().toLowerCase())
      .filter(Boolean);
    return { ok: true, usernames: state.registeredUsernames, cached: true };
  }
  const res = await send("FETCH_REGISTERED_USERNAMES");
  if (res?.ok && Array.isArray(res.usernames)) {
    state.registeredUsernames = res.usernames
      .map((n) => String(n || "").trim().toLowerCase())
      .filter(Boolean);
    if (state.status) {
      state.status.registered_usernames = state.registeredUsernames;
      state.status.configured = true;
      state.status.connected = true;
    }
    return res;
  }
  const fallback = Array.isArray(state.status?.registered_usernames) ? state.status.registered_usernames : [];
  state.registeredUsernames = fallback;
  return res || { ok: false, usernames: fallback, error: "Could not load usernames." };
}

async function loadLocalContext() {
  const page = await send("GET_PAGE_CONTEXT");
  const [status, syncData] = await Promise.all([
    send("GET_EXTENSION_STATUS", { cacheOnly: true }),
    chrome.storage.sync.get("promptTemplate"),
  ]);
  state.status = status;
  state.page = page;
  state.promptTemplate = String(syncData.promptTemplate || DEFAULT_PROMPT_TEMPLATE);
  await loadSavedCaptureTokens();
  await loadRegisteredUsernames({ fromServer: false });
  state.settingsEnvDraft = status?.apiEnv === "local" ? "local" : "production";
  siteMetaEl.textContent = page?.domain
    ? `${page.domain} · ${page.title || "Untitled page"}`
    : "Current page";
  updateStatusBadge();
}

async function syncContextFromServer(options = {}) {
  const forceRefresh = options.forceRefresh !== false;
  state.serverSyncPending = true;
  updateStatusBadge();
  try {
    const page = await send("GET_PAGE_CONTEXT");
    const envSync = await send("SYNC_API_ENV_FROM_PAGE", { pageUrl: page?.url || "" });
    const [status, syncData] = await Promise.all([
      send("GET_EXTENSION_STATUS", { forceRefresh: forceRefresh || envSync?.switched === true }),
      chrome.storage.sync.get("promptTemplate"),
    ]);
    state.status = status;
    state.page = page;
    state.promptTemplate = String(syncData.promptTemplate || DEFAULT_PROMPT_TEMPLATE);
    await loadSavedCaptureTokens();
    if (state.tokenConfigured) {
      await loadRegisteredUsernames({ fromServer: true });
    } else {
      state.registeredUsernames = Array.isArray(status?.registered_usernames) ? status.registered_usernames : [];
    }
    state.settingsEnvDraft = status?.apiEnv === "local" ? "local" : "production";
    if (envSync?.switched) {
      state.settingsEnvDraft = envSync.apiEnv === "local" ? "local" : "production";
    }
    siteMetaEl.textContent = page?.domain
      ? `${page.domain} · ${page.title || "Untitled page"}`
      : "Current page";
    updateStatusBadge();
    return { ok: true, envSync, status };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    state.serverSyncPending = false;
    updateStatusBadge();
  }
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

function renderSideNav() {
  if (!sideNavItemsEl) return;
  sideNavItemsEl.innerHTML = "";
  for (const item of NAV_DEFS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `side-nav-item ${item.id === activeSection ? "active" : ""}`;
    b.title = item.label;
    b.setAttribute("aria-label", item.label);
    b.setAttribute("aria-current", item.id === activeSection ? "page" : "false");
    b.innerHTML = `
      <span class="side-nav-icon">${navIconSvg(item.icon)}</span>
      <span class="side-nav-label">${escapeHtml(item.label)}</span>
    `;
    b.addEventListener("click", async () => {
      activeSection = item.id;
      if (!state.sideNavCollapsed) {
        applySideNavCollapsed(true);
        await saveSideNavCollapsed(true);
      }
      void switchSection();
    });
    sideNavItemsEl.appendChild(b);
  }
  applySideNavCollapsed(state.sideNavCollapsed);
}

/** Switch main panel section and keep the left nav highlight in sync. */
async function navigateToSection(section) {
  if (activeSection === section) {
    renderSideNav();
    await renderContent();
    return;
  }
  activeSection = section;
  await switchSection();
}

async function switchSection() {
  const section = activeSection;
  renderSideNav();
  const needsFetch = section === "JD" || section === "Resume" || section === "Output";
  if (needsFetch) {
    setNavBusy(true);
    showTabLoading(sectionLoadingLabel(section));
  }

  try {
    if (section === "JD") {
      await loadPreviewFromStorage();
    } else if (section === "Resume") {
      await loadResumeLocalTab();
    } else if (section === "Output") {
      const [template, pathTemplate, includeProject] = await Promise.all([
        loadPromptTemplate(),
        loadOutputPathTemplate(),
        loadPromptIncludeProject(),
      ]);
      state.promptTemplate = template;
      state.outputPathTemplate = pathTemplate;
      state.outputPathDraft = pathTemplate;
      state.promptIncludeProject = includeProject;
    } else if (section === "Settings") {
      await loadLocalContext();
    }
    if (activeSection === section) await renderContent();
  } catch (err) {
    if (activeSection === section) {
      contentEl.innerHTML = `<p class="page-loading">${escapeHtml(err?.message || "Something went wrong.")}</p>`;
    }
  } finally {
    setNavBusy(false);
    renderSideNav();
  }
}

function resumeLibraryItemHtml(item) {
  const selected = item.id === state.resumeActiveId;
  const updated = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "";
  return `
    <li class="resume-library-item ${selected ? "selected" : ""}" data-resume-id="${escapeHtml(item.id)}">
      <button type="button" class="resume-library-select" data-resume-id="${escapeHtml(item.id)}">
        <span class="resume-library-name">${escapeHtml(item.name)}</span>
        ${updated ? `<span class="resume-library-meta">${escapeHtml(updated)}</span>` : ""}
      </button>
      <button type="button" class="resume-library-delete btn-icon" data-resume-id="${escapeHtml(item.id)}" title="Delete resume" aria-label="Delete ${escapeHtml(item.name)}">×</button>
    </li>
  `;
}

function resumeLocalTabHtml() {
  const text = state.resumeLocalText || "";
  const name = state.resumeLocalName || "";
  const items = state.resumeLibrary || [];
  const listHtml = state.resumeLibraryLoading
    ? `<p class="muted">Loading saved resumes…</p>`
    : items.length
      ? `<ul class="resume-library-list">${items.map(resumeLibraryItemHtml).join("")}</ul>`
      : `<p class="muted">No saved resumes yet. Upload a file or enter a name and click Save.</p>`;
  return `
    <div class="content-pane content-pane--resume">
    <section class="settings-section source-tab resume-tab">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">Resume</h2>
        <span class="badge local">Local only</span>
      </div>
      <label class="label" for="resumeLocalName">Name</label>
      <input id="resumeLocalName" class="input" type="text" maxlength="120" placeholder="e.g. Chad — AI Engineer" value="${escapeHtml(name)}" />
      <label class="label" for="resumeLocalText">Resume text</label>
      <textarea id="resumeLocalText" class="textarea mono source-editor resume-editor-fixed" placeholder="Paste resume text…">${escapeHtml(text)}</textarea>
      <p class="muted">${text.length.toLocaleString()} characters</p>
      <div class="row resume-editor-actions">
        <button type="button" class="btn primary" id="resumeSaveBtn" ${state.resumeSaving ? "disabled" : ""}>${state.resumeSaving ? "Saving…" : "Save"}</button>
        <button type="button" class="btn" id="resumeUploadBtn">Upload</button>
      </div>
      <input type="file" id="resumeFileInput" accept=".txt,.md,.docx,.pdf,text/plain" hidden />
      <h3 class="resume-library-heading">Saved resumes</h3>
      ${listHtml}
    </section>
    </div>
  `;
}

async function loadResumeLocalTab() {
  state.resumeLibraryLoading = true;
  try {
    await migrateLegacyResumeToLibrary();
    const selection = await getActiveResumeSelection();
    state.resumeActiveId = selection.id || "";
    state.resumeLocalName = selection.name || "";
    state.resumeLocalText = selection.text || (await getLocalResumeText());
    state.resumeLibrary = await listSavedResumes();
    if (state.resumeActiveId && !state.resumeLibrary.some((item) => item.id === state.resumeActiveId)) {
      state.resumeActiveId = "";
    }
  } finally {
    state.resumeLibraryLoading = false;
  }
}

/** Read an uploaded file to plain text locally (no server / capture token). */
async function readUploadedFileText(file) {
  return extractTextFromUploadFile(file);
}

async function persistResumeLocal() {
  const text = state.resumeLocalText || "";
  await saveLocalResumeText(text, {
    id: state.resumeActiveId,
    name: state.resumeLocalName,
  });
}

async function saveResumeToLibrary() {
  const name = String(state.resumeLocalName || "").trim();
  const text = String(state.resumeLocalText || "");
  if (!name) {
    setInlineBanner("Enter a resume name before saving.", "err");
    return;
  }
  if (!text.trim()) {
    setInlineBanner("Resume text is empty.", "err");
    return;
  }
  state.resumeSaving = true;
  await renderContent();
  try {
    const existing = await findSavedResumeByName(name);
    const saved = await upsertSavedResume({
      id: existing?.id,
      name,
      text,
    });
    state.resumeActiveId = saved.id;
    state.resumeLocalName = saved.name;
    state.resumeLocalText = saved.text;
    await setActiveResumeSelection({
      id: saved.id,
      name: saved.name,
      text: saved.text,
    });
    state.resumeLibrary = await listSavedResumes();
    setInlineBanner(`Saved “${saved.name}”.`, "ok");
  } catch (err) {
    setInlineBanner(err?.message || "Could not save resume.", "err");
  } finally {
    state.resumeSaving = false;
    if (activeSection === "Resume") await renderContent();
  }
}

async function selectSavedResume(id) {
  const item = await getSavedResume(id);
  if (!item) {
    setInlineBanner("Resume not found.", "err");
    state.resumeLibrary = await listSavedResumes();
    if (activeSection === "Resume") await renderContent();
    return;
  }
  state.resumeActiveId = item.id;
  state.resumeLocalName = item.name;
  state.resumeLocalText = item.text;
  await setActiveResumeSelection({
    id: item.id,
    name: item.name,
    text: item.text,
  });
  if (activeSection === "Resume") await renderContent();
}

async function removeSavedResume(id) {
  const item = state.resumeLibrary.find((row) => row.id === id);
  await deleteSavedResume(id);
  state.resumeLibrary = await listSavedResumes();
  if (state.resumeActiveId === id) {
    const next = state.resumeLibrary[0];
    if (next) {
      await selectSavedResume(next.id);
      return;
    }
    state.resumeActiveId = "";
    state.resumeLocalName = "";
    state.resumeLocalText = "";
    await setActiveResumeSelection({ id: "", name: "", text: "" });
  }
  setInlineBanner(item ? `Deleted “${item.name}”.` : "Resume deleted.", "ok");
  if (activeSection === "Resume") await renderContent();
}

let resumeSaveTimer = null;
function scheduleResumePersist() {
  clearTimeout(resumeSaveTimer);
  resumeSaveTimer = setTimeout(() => void persistResumeLocal(), 400);
}

function wireResumeLocalActions() {
  const ta = document.getElementById("resumeLocalText");
  if (ta) {
    ta.style.height = "";
    ta.style.minHeight = "";
  }
  ta?.addEventListener("input", (e) => {
    state.resumeLocalText = String(e.target.value || "");
    scheduleResumePersist();
  });

  const nameInput = document.getElementById("resumeLocalName");
  nameInput?.addEventListener("input", (e) => {
    state.resumeLocalName = String(e.target.value || "");
    const selected = state.resumeLibrary.find((row) => row.id === state.resumeActiveId);
    if (selected && !resumeNamesMatch(selected.name, state.resumeLocalName)) {
      state.resumeActiveId = "";
    }
    scheduleResumePersist();
  });

  document.getElementById("resumeSaveBtn")?.addEventListener("click", () => void saveResumeToLibrary());

  const input = document.getElementById("resumeFileInput");
  document.getElementById("resumeUploadBtn")?.addEventListener("click", () => input?.click());
  input?.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const uploadBtn = document.getElementById("resumeUploadBtn");
    const prevUploadLabel = uploadBtn?.textContent;
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = "Reading…";
    }
    setInlineBanner("Reading resume file…", "warn");
    try {
      const loaded = String(await readUploadedFileText(file)).trim();
      if (!loaded) throw new Error("File had no readable text.");
      state.resumeLocalName = extractTextFromUploadFile.fileBaseName(file.name);
      state.resumeLocalText = loaded;
      state.resumeActiveId = "";
      if (uploadBtn) uploadBtn.textContent = "Saving…";
      await saveResumeToLibrary();
    } catch (err) {
      setInlineBanner(err?.message || "Could not read file.", "err");
      if (activeSection === "Resume") await renderContent();
    } finally {
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = prevUploadLabel || "Upload";
      }
    }
  });

  contentEl.querySelectorAll(".resume-library-select").forEach((btn) => {
    btn.addEventListener("click", () => void selectSavedResume(btn.getAttribute("data-resume-id")));
  });
  contentEl.querySelectorAll(".resume-library-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      void removeSavedResume(btn.getAttribute("data-resume-id"));
    });
  });
}

function jdSectionHtml() {
  return `
    <div class="content-pane content-pane--jd">
      ${previewTabHtml()}
    </div>
  `;
}

function outputSectionHtml() {
  const acc = state.outputAccordion;
  return `
    <div class="content-pane content-pane--output">
      <div class="accordion" id="outputAccordion">
        ${accordionItemHtml("style", "Style", docxStylePickerHtml(state.resumeDocxStyle), acc.style, "output")}
        ${accordionItemHtml("path", "Output path", outputPathHtml(), acc.path, "output")}
        ${accordionItemHtml("prompt", "Prompt", promptAccordionBodyHtml(), acc.prompt, "output")}
      </div>
    </div>
  `;
}

function resumeTabHtml() {
  return resumeLocalTabHtml();
}

function docxStylePickerHtml(selectedId) {
  const options = JBHM_CONFIG.DOCX_STYLE_OPTIONS || [];
  const selected = options.some((o) => o.id === selectedId)
    ? selectedId
    : JBHM_CONFIG.DEFAULT_DOCX_STYLE;
  const active = options.find((o) => o.id === selected) || options[0];
  return `
    <p class="hint">Choose how the extension formats your resume DOCX.</p>
    <div class="style-tab-picker" role="radiogroup" aria-label="Resume DOCX style">
      <div class="style-tabs" role="tablist">
        ${options
          .map((o) => {
            const isActive = o.id === selected;
            return `
              <button
                type="button"
                role="tab"
                class="style-tab${isActive ? " active" : ""}"
                data-style-id="${escapeHtml(o.id)}"
                aria-selected="${isActive ? "true" : "false"}"
                title="${escapeHtml(o.label)}"
              >${escapeHtml(o.label)}</button>
            `;
          })
          .join("")}
      </div>
      <div class="style-preview-stage" id="docxStylePreviewWrap">
        <img
          id="docxStylePreviewImg"
          class="style-preview-image"
          src="${escapeHtml(docxStylePreviewSrc(active?.id || selected))}"
          alt="${escapeHtml(active?.label || "Resume style preview")}"
          loading="lazy"
        />
      </div>
    </div>
    ${fieldFeedbackHtml("docxStyle")}
  `;
}

function outputPathHtml() {
  const draft = state.outputPathDraft ?? state.outputPathTemplate ?? "";
  const currentPath = describeCurrentOutputPath(state.outputPathTemplate);
  return `
    <p class="hint output-path-desc">
      Resumes save under your Downloads folder.
      <strong>Current path:</strong>
      <code id="outputPathCurrent" class="output-path-current-value">${escapeHtml(currentPath)}</code>
    </p>
    <div class="output-path-tokens">
      <strong>Tokens</strong><br />
      <code>{date}</code> — today (YYYY-MM-DD) ·
      <code>{time}</code> — now (HH-mm-ss)<br />
      <code>{name}</code> — name in resume ·
      <code>{role}</code> — job title<br />
      <code>{manual}</code> — manual JD name ·
      <code>{company}</code> — company ·
      <code>{username}</code> — account username
    </div>
    <label class="label" for="outputPathInput">Path template</label>
    <input
      id="outputPathInput"
      class="input mono"
      type="text"
      placeholder="{date}/{name}-{role}.docx"
      value="${escapeHtml(draft)}"
      spellcheck="false"
    />
    <div class="row" style="margin-top:8px">
      <button type="button" class="btn primary" id="saveOutputPathBtn">Save path</button>
    </div>
    ${fieldFeedbackHtml("outputPath")}
  `;
}

function promptAccordionBodyHtml() {
  const lockedSuffix = getLockedPromptSuffix(state.promptIncludeProject);
  return `
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
      <p class="hint" style="margin:0">Editable prefix — used by footer <strong>GPT Prompt</strong> on ChatGPT.</p>
      <button type="button" class="btn ghost btn-sm" id="promptResetBtn">Reset default</button>
    </div>
    <textarea id="promptEditor" class="textarea mono prompt-editor-fixed">${escapeHtml(state.promptTemplate)}</textarea>
    <h4 style="margin:14px 0 6px;font-size:13px">Locked suffix</h4>
    <textarea class="textarea mono prompt-suffix-fixed" readonly>${escapeHtml(lockedSuffix)}</textarea>
    <label class="option-row" style="margin-top:10px">
      <input type="checkbox" id="promptIncludeProject" ${state.promptIncludeProject ? "checked" : ""} />
      <span>DOCX contain Project for experience</span>
    </label>
  `;
}

function registeredUsernameItemHtml(name) {
  const username = String(name || "").trim().toLowerCase();
  if (!username) return "";
  const activeUsername = String(state.status?.username || "").trim().toLowerCase();
  const selected = username === activeUsername;
  return `
    <li class="resume-library-item ${selected ? "selected" : ""}">
      <button type="button" class="resume-library-select username-library-select" data-username="${escapeHtml(username)}">
        <span class="resume-library-name">${escapeHtml(username)}</span>
      </button>
    </li>
  `;
}

function registeredUsernamesListHtml() {
  if (!state.tokenConfigured && !(state.savedCaptureTokens || []).length) {
    return `<p class="muted">Save a valid token first.</p>`;
  }
  const names = (state.registeredUsernames || [])
    .map((n) => String(n || "").trim().toLowerCase())
    .filter(Boolean);
  if (!names.length) {
    return `<p class="muted">No usernames yet. Add one on the dashboard, then click Refresh.</p>`;
  }
  return `<ul class="resume-library-list">${names.map(registeredUsernameItemHtml).join("")}</ul>`;
}

function maskCaptureToken(token) {
  const s = String(token || "").trim();
  if (!s) return "";
  if (s.length <= 8) return "••••••••";
  return `${s.slice(0, 5)}${"•".repeat(Math.min(16, Math.max(4, s.length - 9)))}${s.slice(-4)}`;
}

function tokenEyeIconSvg(visible) {
  if (visible) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18M10.5 10.7a3 3 0 004.3 4.3M7.7 7.9C5.8 9.2 4.2 11 3 12c0 0 3.5 7 10 7 2 0 3.7-.6 5.1-1.6M14 9.2c1.3.7 2.3 1.7 3 3" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`;
  }
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" stroke-width="1.75"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.75"/></svg>`;
}

function tokenRowKey(token) {
  const s = String(token || "");
  return `${s.slice(0, 6)}:${s.slice(-6)}`;
}

function savedCaptureTokenItemHtml(item) {
  const token = String(item?.token || "").trim();
  if (!token) return "";
  const key = tokenRowKey(token);
  const active = token === String(state.activeCaptureToken || "").trim();
  const visible = state.tokenRevealed[key] === true;
  const display = visible ? token : maskCaptureToken(token);
  const toggleLabel = visible ? "Hide token" : "Show token";
  const saved = item.savedAt ? new Date(item.savedAt).toLocaleString() : "";
  return `
    <li class="resume-library-item token-library-item ${active ? "selected" : ""}" data-token-key="${escapeHtml(key)}">
      <button type="button" class="resume-library-select token-library-select" data-token="${escapeHtml(token)}" title="Use this token">
        <span class="resume-library-name mono">${escapeHtml(display)}</span>
        ${saved ? `<span class="resume-library-meta">${escapeHtml(saved)}${active ? " · Active" : ""}</span>` : active ? `<span class="resume-library-meta">Active</span>` : ""}
      </button>
      <button
        type="button"
        class="token-library-toggle btn-icon"
        data-token-key="${escapeHtml(key)}"
        title="${toggleLabel}"
        aria-label="${toggleLabel}"
      >${tokenEyeIconSvg(visible)}</button>
      <button
        type="button"
        class="token-library-delete btn-icon"
        data-token="${escapeHtml(token)}"
        title="Remove token"
        aria-label="Remove token"
      >×</button>
    </li>
  `;
}

function savedCaptureTokensListHtml() {
  const items = state.savedCaptureTokens || [];
  if (!items.length) return `<p class="muted">No saved tokens yet. Paste a token above and click Add token.</p>`;
  return `
    <h3 class="resume-library-heading">Saved tokens</h3>
    <ul class="resume-library-list token-library-list">
      ${items.map(savedCaptureTokenItemHtml).join("")}
    </ul>
  `;
}

function settingsTokenAccordionHtml() {
  return `
    <label class="label" for="settingsToken">Add token</label>
    <input
      id="settingsToken"
      class="input mono"
      type="password"
      placeholder="jbhm_…"
      value="${escapeHtml(state.settingsTokenInput)}"
      autocomplete="off"
    />
    ${savedCaptureTokensListHtml()}
    <div class="row">
      <button type="button" class="btn" id="saveTokenBtn" ${state.settingsBusy.saveToken ? "disabled" : ""}>
        ${state.settingsBusy.saveToken ? "Adding…" : "Add token"}
      </button>
      <button type="button" class="btn primary" id="testConnectionBtn" ${state.settingsBusy.testConnection ? "disabled" : ""}>
        ${state.settingsBusy.testConnection ? "Testing…" : "Test connection"}
      </button>
      <button type="button" class="btn" id="refreshStatusBtn">Refresh</button>
    </div>
    ${fieldFeedbackHtml("token")}
    ${fieldFeedbackHtml("connection")}
    <hr style="border:0;border-top:1px solid var(--border);margin:14px 0" />
    <h3 class="resume-library-heading">Username</h3>
    ${registeredUsernamesListHtml()}
    ${fieldFeedbackHtml("username")}
  `;
}

function settingsServerAccordionHtml() {
  return `
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
  `;
}

function settingsTabHtml() {
  const hint = captureReadinessHint();
  const acc = state.settingsAccordion;
  return `
    ${hint ? `<div class="banner ${hint.type}">${escapeHtml(hint.text)}</div>` : ""}
    <div class="content-pane content-pane--settings">
      <div class="accordion" id="settingsAccordion">
        ${accordionItemHtml("token", "Token", settingsTokenAccordionHtml(), acc.token, "settings")}
        ${accordionItemHtml("server", "Server", settingsServerAccordionHtml(), acc.server, "settings")}
      </div>
    </div>
  `;
}

async function renderContent() {
  contentEl.classList.toggle("content--output", activeSection === "Output");
  contentEl.classList.toggle("content--jd", activeSection === "JD");
  contentEl.classList.toggle("content--resume", activeSection === "Resume");
  if (activeSection === "JD") contentEl.innerHTML = jdSectionHtml();
  else if (activeSection === "Resume") contentEl.innerHTML = resumeTabHtml();
  else if (activeSection === "Settings") contentEl.innerHTML = settingsTabHtml();
  else if (activeSection === "Output") contentEl.innerHTML = outputSectionHtml();
  else contentEl.innerHTML = `<p class="muted">Select a section.</p>`;
  wireSectionActions();
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
  document.getElementById("promptIncludeProject")?.addEventListener("change", async (e) => {
    const enabled = Boolean(e.target?.checked);
    state.promptIncludeProject = await savePromptIncludeProject(enabled);
    if (activeSection === "Output") await renderContent();
  });
}

async function selectRegisteredUsername(username) {
  const name = String(username || "").trim().toLowerCase();
  if (!name) return;
  if (!state.tokenConfigured && !(state.savedCaptureTokens || []).length) {
    setSettingsFieldFeedback("username", "Save a valid token first.", "warn");
    if (activeSection === "Settings") await renderContent();
    return;
  }
  const known = (state.registeredUsernames || []).map((n) => String(n || "").trim().toLowerCase());
  if (known.length && !known.includes(name)) {
    setSettingsFieldFeedback("username", "Username not in cached list. Click Refresh.", "warn");
    if (activeSection === "Settings") await renderContent();
    return;
  }
  clearSettingsFieldFeedback("username");
  const res = await send("SET_ACTIVE_USERNAME", { username: name });
  if (!res?.ok) {
    setSettingsFieldFeedback("username", res?.error || "Could not select username.", "err");
    if (activeSection === "Settings") await renderContent();
    return;
  }
  if (state.status) {
    state.status.username = name;
    state.status.username_validated = true;
    state.status.username_validated_at = res.validatedAt || new Date().toISOString();
  }
  updateStatusBadge();
  setSettingsFieldFeedback("username", `Using ${name}.`, "ok");
  if (activeSection === "Settings") await renderContent();
}

function wireRegisteredUsernameActions() {
  contentEl.querySelectorAll(".username-library-select").forEach((btn) => {
    btn.addEventListener("click", () => void selectRegisteredUsername(btn.getAttribute("data-username")));
  });
}

async function selectSavedCaptureToken(token) {
  const trimmed = String(token || "").trim();
  if (!trimmed || trimmed === state.activeCaptureToken) return;
  clearSettingsFieldFeedback("token", "connection");
  const res = await panelApi("SET_ACTIVE_TOKEN", { token: trimmed });
  if (!res?.ok) {
    setSettingsFieldFeedback("token", res?.error || "Could not select token.", "err");
    if (activeSection === "Settings") await renderContent();
    return;
  }
  state.activeCaptureToken = String(res.active || trimmed);
  state.savedCaptureTokens = Array.isArray(res.items) ? res.items : state.savedCaptureTokens;
  await loadLocalContext();
  setSettingsFieldFeedback("token", "Active token updated.", "ok");
  if (activeSection === "Settings") await renderContent();
}

async function removeSavedCaptureTokenEntry(token) {
  const trimmed = String(token || "").trim();
  if (!trimmed) return;
  clearSettingsFieldFeedback("token", "connection");
  setPanelStatus("");
  const res = await panelApi("DELETE_TOKEN", { token: trimmed });
  if (!res?.ok) {
    setSettingsFieldFeedback("token", res?.error || "Could not remove token.", "err");
    if (activeSection === "Settings") await renderContent();
    return;
  }
  state.savedCaptureTokens = Array.isArray(res.items) ? res.items : [];
  state.activeCaptureToken = String(res.active || "").trim();
  delete state.tokenRevealed[tokenRowKey(trimmed)];
  state.settingsTokenInput = "";
  await loadLocalContext();
  setSettingsFieldFeedback("token", "Token removed from this browser.", "ok");
  if (activeSection === "Settings") await renderContent();
}

function wireSavedTokenActions() {
  contentEl.querySelectorAll(".token-library-select").forEach((btn) => {
    btn.addEventListener("click", () => void selectSavedCaptureToken(btn.getAttribute("data-token")));
  });
  contentEl.querySelectorAll(".token-library-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = btn.getAttribute("data-token-key");
      if (!key) return;
      state.tokenRevealed[key] = !state.tokenRevealed[key];
      void renderContent();
    });
  });
  contentEl.querySelectorAll(".token-library-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      void removeSavedCaptureTokenEntry(btn.getAttribute("data-token"));
    });
  });
}

function wireSectionActions() {
  if (activeSection === "JD") {
    wirePreviewTabActions();
    return;
  }
  if (activeSection === "Resume") {
    wireResumeLocalActions();
    return;
  }
  if (activeSection === "Output") {
    wireAccordion(document.getElementById("outputAccordion"), "output", state.outputAccordion);
    wirePromptTabActions();
    wireOutputSectionActions();
    return;
  }

  if (activeSection === "Settings") {
    wireAccordion(document.getElementById("settingsAccordion"), "settings", state.settingsAccordion);
    wireSavedTokenActions();
    wireRegisteredUsernameActions();
  }

  document.getElementById("settingsToken")?.addEventListener("input", (e) => {
    state.settingsTokenInput = String(e.target?.value || "");
    if (state.settingsFeedback.token.text || state.settingsFeedback.connection.text) {
      clearSettingsFieldFeedback("token", "connection");
      if (activeSection === "Settings") void renderContent();
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
    setSettingsFieldFeedback("token", "Adding token…", "warn");
    await renderContent();
    const res = await panelApi("SAVE_TOKEN", { token });
    state.settingsBusy.saveToken = false;
    if (!res.ok) {
      setSettingsFieldFeedback("token", res.error || "Add failed.", "err");
      await renderContent();
      return;
    }
    state.tokenConfigured = true;
    state.activeCaptureToken = String(res.active || token);
    state.savedCaptureTokens = Array.isArray(res.items) ? res.items : state.savedCaptureTokens;
    state.settingsTokenInput = "";
    await syncContextFromServer({ forceRefresh: true });
    setSettingsFieldFeedback("token", "Token added. Click Test connection.", "ok");
    await renderContent();
  });

  document.getElementById("testConnectionBtn")?.addEventListener("click", async () => {
    clearSettingsFieldFeedback("connection", "username");
    setPanelStatus("");
    state.settingsBusy.testConnection = true;
    setSettingsFieldFeedback("connection", "Testing connection…", "warn");
    await renderContent();
    const res = await send("TEST_CONNECTION");
    await syncContextFromServer({ forceRefresh: true });
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
    clearSettingsFieldFeedback("connection", "username");
    setSettingsFieldFeedback("connection", "Refreshing…", "warn");
    await renderContent();
    const userRes = await syncContextFromServer({ forceRefresh: true });
    if (userRes?.ok) {
      const count = state.registeredUsernames.length;
      setSettingsFieldFeedback(
        "connection",
        count ? `Refreshed — ${count} username${count === 1 ? "" : "s"} loaded.` : "Refreshed — no usernames on this account.",
        count ? "ok" : "warn",
      );
    } else {
      setSettingsFieldFeedback("connection", userRes?.error || state.status?.error || "Refresh failed.", "err");
    }
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
        await loadLocalContext();
        setSettingsFieldFeedback("env", res.error || "Could not save environment.", "err");
        await renderContent();
        return;
      }
      state.settingsEnvDraft = apiEnv;
      await syncContextFromServer({ forceRefresh: true });
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

function styleTabSwitchDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function switchDocxStyleTab(nextId) {
  const next = String(nextId || JBHM_CONFIG.DEFAULT_DOCX_STYLE);
  if (!next || next === state.resumeDocxStyle) return;

  const wrap = document.getElementById("docxStylePreviewWrap");
  const preview = document.getElementById("docxStylePreviewImg");
  const activeOption = (JBHM_CONFIG.DOCX_STYLE_OPTIONS || []).find((o) => o.id === next);

  clearSettingsFieldFeedback("docxStyle");
  setSettingsFieldFeedback("docxStyle", "Saving style…", "warn");

  wrap?.classList.remove("is-entering");
  wrap?.classList.add("is-leaving");
  await styleTabSwitchDelay(200);

  state.resumeDocxStyle = await saveResumeDocxStyle(next);

  if (preview) {
    preview.src = docxStylePreviewSrc(next);
    preview.alt = activeOption?.label || "Resume style preview";
  }

  contentEl.querySelectorAll(".style-tab").forEach((btn) => {
    const isActive = btn.getAttribute("data-style-id") === next;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  wrap?.classList.remove("is-leaving");
  wrap?.classList.add("is-entering");
  await styleTabSwitchDelay(320);
  wrap?.classList.remove("is-entering");

  setSettingsFieldFeedback("docxStyle", "Resume DOCX style saved.", "ok");
}

function wireOutputSectionActions() {
  contentEl.querySelectorAll(".style-tab").forEach((btn) => {
    btn.addEventListener("click", () => void switchDocxStyleTab(btn.getAttribute("data-style-id")));
  });

  document.getElementById("outputPathInput")?.addEventListener("input", (e) => {
    state.outputPathDraft = String(e.target?.value || "");
    if (state.settingsFeedback.outputPath.text) clearSettingsFieldFeedback("outputPath");
  });

  document.getElementById("saveOutputPathBtn")?.addEventListener("click", async () => {
    clearSettingsFieldFeedback("outputPath");
    const draft = String(state.outputPathDraft ?? "").trim();
    const validation = validateOutputPathTemplate(draft);
    if (!validation.ok) {
      setSettingsFieldFeedback("outputPath", validation.error, "err");
      await renderContent();
      return;
    }
    try {
      state.outputPathTemplate = await saveOutputPathTemplate(draft);
      state.outputPathDraft = state.outputPathTemplate;
      updateOutputPathCurrentDisplay(state.outputPathTemplate);
      setSettingsFieldFeedback(
        "outputPath",
        state.outputPathTemplate
          ? "Output path saved."
          : "Using default jbhm folder layout.",
        "ok",
      );
    } catch (err) {
      setSettingsFieldFeedback("outputPath", err?.message || "Could not save path.", "err");
    }
    await renderContent();
  });
}

async function openDashboard() {
  const settings = await loadExtensionSettings();
  const path = state.status?.dashboard_url || "/dashboard";
  const base = settings.apiBaseUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  chrome.tabs.create({ url: `${base}${normalizedPath}` });
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

async function buildFooterGptPromptText() {
  const editor = document.getElementById("promptEditor");
  if (editor) {
    state.promptTemplate = String(editor.value || DEFAULT_PROMPT_TEMPLATE);
    await savePromptTemplate(state.promptTemplate);
  } else {
    state.promptTemplate = await loadPromptTemplate();
  }
  state.resumeLocalText = await getLocalResumeText();
  const previewJd = String(state.previewDraft?.jd_text || "").trim();
  const jdForPrompt = previewJd === "-" ? "" : previewJd;
  return buildLocalChatGptPrompt({
    template: state.promptTemplate,
    jdText: jdForPrompt,
    resumeText: state.resumeLocalText,
    includeProject: state.promptIncludeProject,
  });
}

gptPromptBtn?.addEventListener("click", async () => {
  const prevText = gptPromptBtn.textContent;
  setFooterActionBusy(true);
  gptPromptBtn.textContent = "Sending…";
  try {
    const resumeText = String(state.resumeLocalText || (await getLocalResumeText()) || "").trim();
    if (!resumeText) {
      setInlineBanner("Add a resume in the Resume tab before sending a GPT prompt.", "err");
      await navigateToSection("Resume");
      return;
    }
    const previewJd = String(state.previewDraft?.jd_text || "").trim();
    const jdForCheck = previewJd === "-" ? "" : previewJd;
    if (!jdForCheck) {
      setInlineBanner("Add a job description in the JD tab before sending a GPT prompt.", "err");
      await navigateToSection("JD");
      return;
    }
    const text = await buildFooterGptPromptText();
    state.localPromptText = text;
    await setPreviewCaptureMode(true);
    const res = await send("PASTE_LOCAL_PROMPT", {
      text,
      autoCapture: true,
      previewOnly: true,
      requireActiveChatGpt: true,
    });
    setInlineBanner(
      res?.status === "ok" ? "Prompt sent on ChatGPT — waiting for result." : res?.detail || "Send failed.",
      res?.status === "ok" ? "ok" : "err",
    );
  } finally {
    setFooterActionBusy(false);
    gptPromptBtn.textContent = prevText || "GPT Prompt";
  }
});

gptResultBtn?.addEventListener("click", async () => {
  const prevText = gptResultBtn.textContent;
  setFooterActionBusy(true);
  gptResultBtn.textContent = "Working…";
  try {
    if (typeof syncPreviewFromInputs === "function" && contentEl?.querySelector("#prevManualName")) {
      syncPreviewFromInputs(contentEl);
      await savePreviewDraft(state.previewDraft);
    }
    const res = await send("DOWNLOAD_LATEST_GPT_RESULT", { requireActiveChatGpt: true });
    if (res?.status !== "ok") {
      setInlineBanner(res?.detail || "Could not download GPT result.", "err");
      return;
    }
    if (res.resumeError) {
      setInlineBanner(
        `GPT result loaded, but DOCX was not saved: ${res.resumeError}`,
        "err",
      );
      await loadPreviewFromStorage();
      if (activeSection === "JD") await renderContent();
      return;
    }
    const path = res.resume_path || res.downloadPath || "";
    setInlineBanner(path ? `DOCX saved to ${path}` : "GPT result processed.", "ok");
    await loadPreviewFromStorage();
    if (activeSection === "JD") await renderContent();
  } finally {
    setFooterActionBusy(false);
    gptResultBtn.textContent = prevText || "GPT Result";
  }
});

footerDownloadBtn?.addEventListener("click", async () => {
  const prevText = footerDownloadBtn.textContent;
  setFooterActionBusy(true);
  footerDownloadBtn.textContent = "Downloading…";
  try {
    if (typeof syncPreviewFromInputs === "function" && contentEl?.querySelector("#prevManualName")) {
      syncPreviewFromInputs(contentEl);
      await savePreviewDraft(state.previewDraft);
    }
    const res = await send("DOWNLOAD_EXPORT");
    if (res?.status !== "ok") {
      setInlineBanner(res?.detail || "Download failed.", "err");
      return;
    }
    const path = res.downloadPath || "";
    if (path && state.previewDraft) {
      state.previewDraft.resume_path = path;
    }
    setInlineBanner(path ? `DOCX saved to ${path}` : "Resume download started.", "ok");
    await loadPreviewFromStorage();
    if (activeSection === "JD") await renderContent();
  } finally {
    setFooterActionBusy(false);
    footerDownloadBtn.textContent = prevText || "Download";
  }
});

footerDashboardBtn?.addEventListener("click", () => void openDashboard());

async function boot() {
  await loadLocalContext();
  await syncWorkspaceLayoutFromHost();
  await Promise.all([
    getActiveResumeSelection().then((selection) => {
      state.resumeActiveId = selection.id || "";
      state.resumeLocalName = selection.name || "";
      state.resumeLocalText = selection.text || "";
    }),
    migrateLegacyResumeToLibrary().catch(() => {}),
    loadPreviewFromStorage(),
    loadGroqModel().then((model) => {
      state.groqModel = model;
    }),
    loadResumeDocxStyle().then((style) => {
      state.resumeDocxStyle = style;
    }),
    loadPromptTemplate().then((template) => {
      state.promptTemplate = template;
    }),
    loadOutputPathTemplate().then((path) => {
      state.outputPathTemplate = path;
      state.outputPathDraft = path;
    }),
    loadPromptIncludeProject().then((enabled) => {
      state.promptIncludeProject = enabled;
    }),
    loadSideNavCollapsed().then((collapsed) => {
      applySideNavCollapsed(collapsed);
    }),
  ]);
  const openedToPreview = await consumeOpenToPreview();
  if (openedToPreview) {
    activeSection = "JD";
    applySideNavCollapsed(true);
    await saveSideNavCollapsed(true);
  }
  sideNavToggleEl?.addEventListener("click", async () => {
    const next = !state.sideNavCollapsed;
    applySideNavCollapsed(next);
    await saveSideNavCollapsed(next);
  });
  renderSideNav();
  await renderContent();
  void syncContextFromServer({ forceRefresh: false }).then(() => {
    if (activeSection === "Settings") void renderContent();
  });
  // Toast survives the panel just opening (covers the message-listener race).
  if (openedToPreview) {
    setInlineBanner("Preview filled from page — review and edit before accepting.", "ok");
  }
}

void boot();

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "PREVIEW_CAPTURE_DONE") {
    void setPreviewCaptureMode(false);
    return;
  }
  if (message?.type === "GPT_CAPTION_UPDATE") {
    console.log("[IA caption] update", {
      kind: "full",
      text_changed: true,
      full_len: message.full_len ?? String(message.text || "").length,
      generating: message.generating === true,
      elapsed_ms: message.elapsed_ms,
    });
    return;
  }
  if (message?.type === "PREVIEW_DRAFT_UPDATED") {
    void setPreviewCaptureMode(false);
    void Promise.all([loadPreviewFromStorage(), consumeOpenToPreview()]).then(async () => {
      if (activeSection !== "JD") {
        activeSection = "JD";
        if (!state.sideNavCollapsed) {
          applySideNavCollapsed(true);
          void saveSideNavCollapsed(true);
        }
        renderSideNav();
      }
      await renderContent();
      if (message.skipToast) return;
      let msg = message.fillOnly
        ? message.field === "jd"
          ? "Job description updated in Preview."
          : message.field === "manual_name"
            ? "Manual name updated in Preview."
            : "Preview updated."
        : "Preview filled — review and edit before accepting.";
      let type = "ok";
      if (message.resumeError) {
        msg = `Fields filled, but resume not saved: ${message.resumeError}`;
        type = "err";
      } else if (message.resumeSaved) {
        msg = `Resume saved to ${message.resumePath} — review and Accept.`;
      }
      setInlineBanner(msg, type);
    });
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    void send("CLOSE_WORKSPACE");
  }
});
