/**
 * JD Source tab — local only until Preview accept.
 */

function emptyJdDraft() {
  return {
    text: "",
    title: "",
    sourceUrl: "",
    sourceDomain: "",
    pageTitle: "",
    sourceMode: "manual",
    useLatestBid: false,
    textLength: 0,
    quality: "weak",
    loading: false,
  };
}

function jdSourceTabHtml() {
  const d = state.jdLocal || emptyJdDraft();
  const quality = d.quality || scoreJdQuality(d.text || "");
  const qualityClass = quality === "good" ? "ok" : quality === "partial" ? "warn" : "err";

  return `
    <section class="settings-section source-tab">
      <div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <h2 style="margin:0">JD Source</h2>
        <span class="badge local">Local only</span>
        ${d.text ? `<span class="badge ${qualityClass}">${escapeHtml(qualityLabel(quality))}</span>` : ""}
      </div>
      <label class="option-row jd-latest-option">
        <input type="checkbox" id="jdUseLatestBid" ${d.useLatestBid ? "checked" : ""} />
        <span>Use latest job bid from dashboard (for capture / ChatGPT)</span>
      </label>
      <p class="hint">When checked, prompt and save use the newest dashboard bid instead of the text below. Paste or upload anytime.</p>
      <p class="muted">${(d.textLength || 0).toLocaleString()} characters</p>
      <textarea
        id="jdText"
        class="textarea source-editor jd-editor-tall"
        placeholder="Paste or type job description…"
        ${d.loading ? "disabled" : ""}
      >${escapeHtml(d.text)}</textarea>
      <input type="file" id="jdFileInput" accept=".txt,.md,.docx,.pdf,text/plain" hidden />
      <button type="button" class="btn upload-block-btn" id="jdUploadBtn" ${d.loading ? "disabled" : ""}>
        ${d.loading ? "Loading…" : "Upload file"}
      </button>
    </section>
  `;
}

function syncJdLocalFromInputs(root) {
  const d = state.jdLocal;
  if (!d) return;
  const ta = root.querySelector("#jdText");
  if (!ta) return;
  d.text = String(ta.value || "");
  d.textLength = d.text.length;
  d.quality = scoreJdQuality(d.text);
  if (!d.useLatestBid) d.sourceMode = "manual";
}

async function persistJdLocal() {
  const d = state.jdLocal;
  if (!d) return;
  await saveLocalJdSource({
    text: d.text,
    title: d.title,
    sourceUrl: d.sourceUrl || state.page?.url,
    sourceDomain: d.sourceDomain || state.page?.domain,
    sourceMode: d.sourceMode,
    pageTitle: d.pageTitle,
    useLatestBid: d.useLatestBid,
  });
}

let jdSaveTimer = null;
function scheduleJdPersist() {
  clearTimeout(jdSaveTimer);
  jdSaveTimer = setTimeout(() => void persistJdLocal(), 400);
}

/** JD text for prompt / preview — respects “use latest bid” without changing the textarea. */
async function getEffectiveJdText() {
  if (!state.jdLocal?.useLatestBid) {
    return String(state.jdLocal?.text || "");
  }
  if (!state.status?.connected) {
    return String(state.jdLocal?.text || "");
  }
  const res = await panelApi("FETCH_JD_SETTINGS");
  if (!res.ok) return String(state.jdLocal?.text || "");
  return String(res.data?.latest_bid?.jd_text || state.jdLocal?.text || "");
}

async function readJdUploadFile(file) {
  // .docx / .pdf parsed server-side (stateless, no DB write); kept local until accept.
  return await readUploadedFileText(file);
}

function applyPageDataToJdLocal(pageData) {
  const text = String(pageData.captured_text || "");
  const fields = extractJobFieldsLocally({
    pageTitle: pageData.page_title,
    sourceUrl: pageData.source_url,
    domain: state.page?.domain || "",
    jdText: text,
    extractionSource: pageData.capture_method,
  });
  state.jdLocal = {
    ...(state.jdLocal || emptyJdDraft()),
    text,
    title: fields.title || state.jdLocal?.title || "",
    sourceUrl: pageData.source_url || state.page?.url || "",
    sourceDomain: state.page?.domain || "",
    pageTitle: pageData.page_title || state.page?.title || "",
    sourceMode: pageData.capture_method || "page",
    textLength: text.length,
    quality: scoreJdQuality(text),
    loading: false,
  };
}

async function refreshJdFromPage() {
  state.jdLocal = { ...(state.jdLocal || emptyJdDraft()), loading: true };
  await renderContent();
  const pageData = await send("GET_VISIBLE_TEXT");
  if (!pageData?.captured_text) {
    state.jdLocal = { ...(state.jdLocal || emptyJdDraft()), loading: false };
    setInlineBanner(pageData?.error || "Could not read page.", "err");
    await renderContent();
    return;
  }
  applyPageDataToJdLocal(pageData);
  await persistJdLocal();
  setInlineBanner("Captured JD from page (local only).", "ok");
  await renderContent();
}

async function handleJdFileSelected(file) {
  state.jdLocal = { ...(state.jdLocal || emptyJdDraft()), loading: true };
  await renderContent();
  try {
    const text = String(await readJdUploadFile(file)).trim();
    if (text.length < 1) throw new Error("File was empty.");
    const fields = extractJobFieldsLocally({
      pageTitle: state.page?.title,
      sourceUrl: state.page?.url,
      domain: state.page?.domain || "",
      jdText: text,
      extractionSource: "upload",
    });
    state.jdLocal = {
      ...(state.jdLocal || emptyJdDraft()),
      text,
      title: fields.title || file.name,
      sourceUrl: state.page?.url || "",
      sourceDomain: state.page?.domain || "",
      pageTitle: state.page?.title || "",
      sourceMode: "upload",
      textLength: text.length,
      quality: scoreJdQuality(text),
      loading: false,
    };
    await persistJdLocal();
    setInlineBanner("JD loaded from file (local only).", "ok");
  } catch (err) {
    state.jdLocal = { ...(state.jdLocal || emptyJdDraft()), loading: false };
    setInlineBanner(err?.message || "Upload failed.", "err");
  }
  await renderContent();
}

async function loadJdLocalFromStorage() {
  const stored = await getLocalJdSource();
  if (!stored) {
    state.jdLocal = state.jdLocal || emptyJdDraft();
    return;
  }
  state.jdLocal = {
    ...emptyJdDraft(),
    text: stored.text || "",
    title: stored.title || "",
    sourceUrl: stored.sourceUrl || "",
    sourceDomain: stored.sourceDomain || "",
    pageTitle: stored.pageTitle || "",
    sourceMode: stored.sourceMode || "manual",
    useLatestBid: Boolean(stored.useLatestBid),
    textLength: (stored.text || "").length,
    quality: scoreJdQuality(stored.text || ""),
  };
}

function wireJdTabActions() {
  document.getElementById("jdUseLatestBid")?.addEventListener("change", async (e) => {
    state.jdLocal = { ...(state.jdLocal || emptyJdDraft()), useLatestBid: Boolean(e.target.checked) };
    await persistJdLocal();
    setInlineBanner(
      state.jdLocal.useLatestBid
        ? "Will use latest dashboard bid for ChatGPT / accept (textarea stays editable)."
        : "Using local JD text for ChatGPT / accept.",
      "ok",
    );
  });

  document.getElementById("jdText")?.addEventListener("input", () => {
    syncJdLocalFromInputs(contentEl);
    scheduleJdPersist();
  });

  const input = document.getElementById("jdFileInput");
  document.getElementById("jdUploadBtn")?.addEventListener("click", () => input?.click());
  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    if (file) void handleJdFileSelected(file);
  });
}
