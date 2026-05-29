/**
 * Preview tab — edit fields before sending accepted data to server.
 * Fields are filled by AI extraction (right-click "Capture this page" or the
 * selection "Extract to Preview" button). The JD textarea here is independent
 * from the JD Source tab. Accept unlocks after a ChatGPT result exists.
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
    gpt_text: "",
    notes: "",
    status: "applied",
    source_url: "",
    page_title: "",
    saving: false,
  };
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
  const hint = captureReadinessHint();
  const backendDown = state.status?.configured && !state.status?.connected;
  const hasGpt = (p.gpt_text || "").trim().length > 0;
  const canSave = !p.saving && !backendDown && state.status?.username_validated && hasGpt;

  return `
    ${hint ? `<div class="banner ${hint.type}">${escapeHtml(hint.text)}</div>` : ""}
    ${backendDown ? `<div class="banner err">Backend unavailable — fix token in Settings.</div>` : ""}
    <section class="settings-section">
      ${groqModelSelectHtml(state.groqModel)}
      <div class="row" style="justify-content:space-between;align-items:center;margin-top:12px">
        <h2 style="margin:0">Preview before saving</h2>
        <span class="badge warn">Edit then accept</span>
      </div>
      <p class="hint">Right-click a job page → <strong>Capture this page</strong>, or select text → <strong>Extract to Preview</strong>. Empty fields are filled with "-". Accept unlocks after you build the ChatGPT prompt. Use <strong>Dashboard</strong> in the footer to open the web app.</p>
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
      <label class="label" for="prevJdText">Job description (extracted)</label>
      <p class="muted">${jdLen.toLocaleString()} characters</p>
      <textarea id="prevJdText" class="textarea source-editor jd-editor-tall" placeholder="Extracted job description appears here…">${escapeHtml(jdText)}</textarea>
      <button type="button" class="btn primary upload-block-btn" id="previewAcceptBtn" ${canSave ? "" : "disabled"}>
        ${p.saving ? "Saving…" : "Accept & send to dashboard"}
      </button>
      ${hasGpt ? "" : `<p class="muted" style="text-align:center">Accept enables once a ChatGPT result is captured.</p>`}
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
  set("#prevJdText", "jd_text");
}

function cleanedPreviewValue(value) {
  const s = String(value ?? "").trim();
  return s === "-" ? "" : s;
}

async function acceptPreviewToDashboard(force = false) {
  syncPreviewFromInputs(contentEl);
  const p = state.previewDraft;
  await savePreviewDraft(p);

  const jdText = cleanedPreviewValue(p.jd_text);
  const gptText = String(p.gpt_text || "").trim();
  const capturedText = (gptText.length >= 80 ? gptText : jdText).slice(
    0,
    JBHM_CONFIG.MAX_CAPTURE_TEXT_CHARS || 30000,
  );

  if (capturedText.length < 80) {
    setInlineBanner("Need a job description or ChatGPT result (80+ chars) before saving.", "err");
    return;
  }

  p.saving = true;
  await renderContent();

  const res = await send("CAPTURE_REVIEWED_SAVE", {
    forceCapture: force,
    reviewed: {
      client_reviewed: true,
      captured_text: capturedText,
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
    setInlineBanner(res?.error || "Save failed.", "err");
    await renderContent();
    return;
  }
  state.previewDraft = emptyPreviewDraft();
  await clearPreviewDraft();
  await renderContent();
  setInlineBanner(res.result?.message || "Saved to dashboard. Preview cleared.", "ok");
}

async function loadPreviewFromStorage() {
  const stored = await getPreviewDraft();
  if (stored) {
    state.previewDraft = { ...emptyPreviewDraft(), ...stored, saving: false };
  } else {
    state.previewDraft = state.previewDraft || emptyPreviewDraft();
  }
  if (!state.resumeLocalText) {
    state.resumeLocalText = await getLocalResumeText();
  }
}

function wirePreviewTabActions() {
  contentEl
    .querySelectorAll(
      "#prevTitle, #prevCompany, #prevLocation, #prevSalary, #prevTags, #prevResumePath, #prevSourceUrl, #prevNotes, #prevJdText",
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

  document.getElementById("previewGroqModel")?.addEventListener("change", (e) => {
    const next = normalizeGroqModel(e.target.value);
    state.groqModel = next;
    void saveGroqModel(next);
  });
}
