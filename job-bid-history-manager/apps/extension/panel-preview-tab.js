/**
 * Preview tab — edit fields before sending accepted data to server.
 * Fields are filled by local Groq AI extraction (no JBHM server). Accept sends
 * the reviewed result to the dashboard only when the user clicks Accept.
 */

function emptyPreviewDraft() {
  return {
    job_title: "",
    company_name: "",
    location: "",
    salary_text: "",
    employment_type: "",
    tags: "",
    resume_path: "",
    jd_text: "",
    manual_name: "",
    gpt_text: "",
    notes: "",
    status: "applied",
    source_url: "",
    page_title: "",
    saving: false,
  };
}

function previewAcceptMissingFields(draft) {
  const missing = [];
  if (!cleanedPreviewValue(draft?.job_title)) missing.push("Job title");
  if (!cleanedPreviewValue(draft?.company_name)) missing.push("Company");
  if (!cleanedPreviewValue(draft?.jd_text)) missing.push("Job description");
  return missing;
}

function groqModelSelectHtml(selectedId) {
  const selected = normalizeGroqModel(selectedId);
  const options = (JBHM_CONFIG.GROQ_MODEL_OPTIONS || [])
    .map(
      (o) =>
        `<option value="${escapeHtml(o.id)}"${o.id === selected ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
    )
    .join("");
  return `
    <label class="label" for="previewGroqModel">Groq model (extract / analyze)</label>
    <select id="previewGroqModel" class="input groq-model-select" title="Used for capture and JD analysis. Keys rotate automatically.">
      ${options}
    </select>
  `;
}

function previewTabHtml() {
  const p = state.previewDraft || emptyPreviewDraft();
  const jdText = p.jd_text || "";
  const jdLen = jdText.replace(/^-$/, "").trim().length;
  const acceptHint = dashboardAcceptHint();
  const acceptDisabled = Boolean(p.saving);

  return `
    <section class="settings-section">
      ${groqModelSelectHtml(state.groqModel)}
      <div class="row" style="justify-content:space-between;align-items:center;margin-top:12px">
        <h2 style="margin:0">Preview before saving</h2>
        <span class="badge warn">Edit then accept</span>
      </div>
      <p class="hint">AI extract/clean uses <strong>Groq directly in the extension</strong> (your API keys) — JD text is not sent to the JBHM server until you Accept. Right-click <strong>Capture this page</strong>, or select text → <strong>Extract</strong> / <strong>JD</strong> / <strong>Name</strong>.</p>
      <div class="capture-grid">
        <label class="label" for="prevTitle">Job title</label>
        <input id="prevTitle" class="input" value="${escapeHtml(p.job_title)}" />
        <label class="label" for="prevCompany">Company</label>
        <input id="prevCompany" class="input" value="${escapeHtml(p.company_name)}" />
        <label class="label" for="prevLocation">Location</label>
        <input id="prevLocation" class="input" value="${escapeHtml(p.location)}" />
        <label class="label" for="prevSalary">Salary</label>
        <input id="prevSalary" class="input" value="${escapeHtml(p.salary_text)}" />
        <label class="label" for="prevTags">Tags</label>
        <input id="prevTags" class="input" value="${escapeHtml(p.tags)}" placeholder="remote, full-time" />
        <label class="label" for="prevResumePath">Resume path (local download)</label>
        <input id="prevResumePath" class="input" value="${escapeHtml(p.resume_path)}" placeholder="Filled when DOCX is saved to Downloads" readonly />
        <p class="hint" style="margin-top:4px">DOCX stays on your PC only. To store a copy on the dashboard, use <strong>Attach to dashboard</strong> in the history table after saving.</p>
        <label class="label" for="prevSourceUrl">Source URL</label>
        <input id="prevSourceUrl" class="input" value="${escapeHtml(p.source_url)}" placeholder="https://… (captured automatically)" />
      </div>
      <label class="label" for="prevNotes">Notes</label>
      <textarea id="prevNotes" class="textarea" style="min-height:56px">${escapeHtml(p.notes)}</textarea>
      <label class="label" for="prevManualName">Manual name</label>
      <input id="prevManualName" class="input manual-name-input" value="${escapeHtml(p.manual_name || "")}" placeholder="Label for this JD (filename / dashboard)" />
      <label class="label" for="prevJdText">Job description (extracted)</label>
      <p class="muted">${jdLen.toLocaleString()} characters</p>
      <textarea id="prevJdText" class="textarea source-editor jd-editor-tall" placeholder="Extracted job description appears here…">${escapeHtml(jdText)}</textarea>
      <input type="file" id="previewJdFileInput" accept=".txt,.md,.docx,.pdf,text/plain" hidden />
      <button type="button" class="btn upload-block-btn" id="previewJdUploadBtn">Upload JD</button>
      <button type="button" class="btn primary upload-block-btn" id="previewAcceptBtn" ${acceptDisabled ? "disabled" : ""}>
        ${p.saving ? "Saving…" : "Accept & send to dashboard"}
      </button>
      ${acceptHint ? `<p class="muted" style="text-align:center;margin-top:8px">${escapeHtml(acceptHint.text)}</p>` : ""}
    </section>
  `;
}

function syncPreviewFromInputs(root) {
  const p = state.previewDraft;
  if (!p) return;
  const set = (sel, key) => {
    const el = root?.querySelector(sel);
    if (el) p[key] = String(el.value || "");
  };
  set("#prevTitle", "job_title");
  set("#prevCompany", "company_name");
  set("#prevLocation", "location");
  set("#prevSalary", "salary_text");
  set("#prevTags", "tags");
  set("#prevResumePath", "resume_path");
  set("#prevSourceUrl", "source_url");
  set("#prevNotes", "notes");
  set("#prevManualName", "manual_name");
  set("#prevJdText", "jd_text");
}

function cleanedPreviewValue(value) {
  const s = String(value ?? "").trim();
  return s === "-" ? "" : s;
}

async function acceptPreviewToDashboard(force = false) {
  try {
    syncPreviewFromInputs(contentEl);
    const p = state.previewDraft;

    const missing = previewAcceptMissingFields(p);
    if (missing.length) {
      setInlineBanner(`Cannot send — missing: ${missing.join(", ")}.`, "err");
      return;
    }

    const jdText = cleanedPreviewValue(p.jd_text);
    const manualName = cleanedPreviewValue(p.manual_name);
    const maxChars = JBHM_CONFIG.MAX_CAPTURE_TEXT_CHARS || 30000;
    const jdForSave = jdText.slice(0, maxChars);
    const capturedText = jdForSave;

    const s = state.status || {};
    if (!s.configured || !s.connected) {
      setInlineBanner("Add a valid capture token in Settings before sending to the dashboard.", "err");
      await navigateToSection("Settings");
      return;
    }
    if (!s.username_validated) {
      setInlineBanner("Validate username in Settings before sending to the dashboard.", "err");
      await navigateToSection("Settings");
      return;
    }

    try {
      await savePreviewDraft(p);
    } catch (err) {
      if (!isExtensionContextInvalidatedError(err)) throw err;
    }

    if (manualName) {
      try {
        const jdLocal = await getLocalJdSource();
        await saveLocalJdSource({
          text: jdText || jdLocal?.text || "",
          title: manualName,
          sourceUrl: p.source_url || jdLocal?.sourceUrl || "",
          sourceDomain: jdLocal?.sourceDomain || "",
          sourceMode: jdLocal?.sourceMode || "manual",
          pageTitle: p.page_title || jdLocal?.pageTitle || "",
          inputMode: jdLocal?.inputMode || "text",
          useLatestBid: jdLocal?.useLatestBid === true,
        });
      } catch (err) {
        if (!isExtensionContextInvalidatedError(err)) throw err;
      }
    }

    p.saving = true;
    await renderContent();

    const res = await send("CAPTURE_REVIEWED_SAVE", {
      forceCapture: force,
      reviewed: {
        client_reviewed: true,
        captured_text: jdForSave.length >= 80 ? jdForSave : capturedText,
        jd_text: jdForSave,
        source_url: p.source_url || state.page?.url || "",
        page_title: p.page_title || cleanedPreviewValue(p.job_title) || state.page?.title || "",
        capture_method: p.capture_method || "preview-accept",
        extraction_source: "preview-accept",
        job_title: cleanedPreviewValue(p.job_title),
        company_name: cleanedPreviewValue(p.company_name),
        location: cleanedPreviewValue(p.location),
        salary_text: cleanedPreviewValue(p.salary_text),
        employment_type: cleanedPreviewValue(p.employment_type),
        tags: cleanedPreviewValue(p.tags),
        notes: cleanedPreviewValue(p.notes),
        resume_path: cleanedPreviewValue(p.resume_path),
      },
    });

    p.saving = false;
    if (!res?.ok) {
      if (res?.duplicate && !force) {
        const retry = window.confirm(`${res.error}\n\nSave again anyway?`);
        if (retry) return acceptPreviewToDashboard(true);
      }
      setInlineBanner(res?.error || res?.detail || "Save failed.", "err");
      await renderContent();
      return;
    }

    state.previewDraft = emptyPreviewDraft();
    try {
      await clearPreviewDraft();
    } catch (err) {
      if (!isExtensionContextInvalidatedError(err)) throw err;
    }
    await renderContent();
    setInlineBanner("Saved to dashboard. Preview cleared.", "ok");
  } catch (err) {
    if (state.previewDraft) state.previewDraft.saving = false;
    setInlineBanner(err?.message || "Accept failed.", "err");
    await renderContent();
  }
}

async function loadPreviewFromStorage() {
  const stored = await getPreviewDraft();
  if (stored) {
    state.previewDraft = { ...emptyPreviewDraft(), ...stored, saving: false };
  } else {
    state.previewDraft = state.previewDraft || emptyPreviewDraft();
  }
  const previewJd = String(state.previewDraft.jd_text || "").replace(/^-$/, "").trim();
  if (!previewJd) {
    const jdLocal = await getLocalJdSource();
    if (String(jdLocal?.text || "").trim()) {
      state.previewDraft.jd_text = jdLocal.text;
    }
  }
  if (!state.resumeLocalText) {
    state.resumeLocalText = await getLocalResumeText();
  }
}

async function handlePreviewJdFileUpload(file) {
  const btn = document.getElementById("previewJdUploadBtn");
  const prevLabel = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Reading…";
  }
  try {
    const text = String(await readUploadedFileText(file)).trim();
    if (!text) throw new Error("File had no readable text.");
    const maxChars = JBHM_CONFIG.MAX_CAPTURE_TEXT_CHARS || 30000;
    const clipped = text.slice(0, maxChars);
    const title = extractTextFromUploadFile.fileBaseName(file.name);
    if (!state.previewDraft) state.previewDraft = emptyPreviewDraft();
    state.previewDraft.jd_text = clipped;
    await saveLocalJdSource({
      text: clipped,
      title,
      sourceMode: "upload",
      sourceUrl: state.page?.url || "",
      sourceDomain: state.page?.domain || "",
      pageTitle: state.page?.title || "",
    });
    await savePreviewDraft(state.previewDraft);
    setInlineBanner("Job description replaced from file.", "ok");
    await renderContent();
  } catch (err) {
    setInlineBanner(err?.message || "Upload failed.", "err");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevLabel || "Upload JD";
    }
  }
}

function wirePreviewTabActions() {
  contentEl
    .querySelectorAll(
      "#prevTitle, #prevCompany, #prevLocation, #prevSalary, #prevTags, #prevResumePath, #prevSourceUrl, #prevNotes, #prevManualName, #prevJdText",
    )
    .forEach((el) => {
      el.addEventListener("input", () => {
        syncPreviewFromInputs(contentEl);
        void savePreviewDraft(state.previewDraft);
      });
    });

  document
    .getElementById("previewAcceptBtn")
    ?.addEventListener("click", () => void acceptPreviewToDashboard(false));

  const jdFileInput = document.getElementById("previewJdFileInput");
  document.getElementById("previewJdUploadBtn")?.addEventListener("click", () => jdFileInput?.click());
  jdFileInput?.addEventListener("change", () => {
    const file = jdFileInput.files?.[0];
    jdFileInput.value = "";
    if (file) void handlePreviewJdFileUpload(file);
  });

  document.getElementById("previewGroqModel")?.addEventListener("change", (e) => {
    const next = normalizeGroqModel(e.target.value);
    state.groqModel = next;
    void saveGroqModel(next);
  });
}
