/**
 * Preview tab — edit fields before sending accepted data to server.
 * Fields are filled by AI extraction (right-click "Capture this page" or the
 * selection "Extract to Preview" button). The JD textarea here is independent
 * from the JD Source tab. Accept stays disabled until a ChatGPT result exists.
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
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">Preview before saving</h2>
        <span class="badge warn">Edit then accept</span>
      </div>
      <p class="hint">Right-click a job page → <strong>Capture this page</strong>, or select text → <strong>Extract to Preview</strong>. Empty fields are filled with "-". Accept unlocks after you build the ChatGPT prompt.</p>
      <div class="capture-grid">
        <label class="label" for="prevTitle">Job title</label>
        <input id="prevTitle" class="input" value="${escapeHtml(p.job_title)}" />
        <label class="label" for="prevCompany">Company</label>
        <input id="prevCompany" class="input" value="${escapeHtml(p.company_name)}" />
        <label class="label" for="prevLocation">Location</label>
        <input id="prevLocation" class="input" value="${escapeHtml(p.location)}" />
        <label class="label" for="prevSalary">Salary</label>
        <input id="prevSalary" class="input" value="${escapeHtml(p.salary_text)}" />
        <label class="label" for="prevEmployment">Employment</label>
        <input id="prevEmployment" class="input" value="${escapeHtml(p.employment_type)}" />
        <label class="label" for="prevTags">Tags</label>
        <input id="prevTags" class="input" value="${escapeHtml(p.tags)}" placeholder="remote, full-time" />
        <label class="label" for="prevResumePath">Resume path</label>
        <input id="prevResumePath" class="input" value="${escapeHtml(p.resume_path)}" placeholder="e.g. C:\\resumes\\acme.docx" />
      </div>
      <label class="label" for="prevNotes">Notes</label>
      <textarea id="prevNotes" class="textarea" style="min-height:56px">${escapeHtml(p.notes)}</textarea>
      <label class="label" for="prevJdText">Job description (extracted)</label>
      <p class="muted">${jdLen.toLocaleString()} characters · independent from JD Source tab</p>
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
  p.job_title = String(root.querySelector("#prevTitle")?.value || "");
  p.company_name = String(root.querySelector("#prevCompany")?.value || "");
  p.location = String(root.querySelector("#prevLocation")?.value || "");
  p.salary_text = String(root.querySelector("#prevSalary")?.value || "");
  p.employment_type = String(root.querySelector("#prevEmployment")?.value || "");
  p.tags = String(root.querySelector("#prevTags")?.value || "");
  p.resume_path = String(root.querySelector("#prevResumePath")?.value || "");
  p.notes = String(root.querySelector("#prevNotes")?.value || "");
  p.jd_text = String(root.querySelector("#prevJdText")?.value || "");
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
  setInlineBanner(res.result?.message || "Accepted result saved to dashboard.", "ok");
  await renderContent();
}

async function loadPreviewFromStorage() {
  const stored = await getPreviewDraft();
  if (stored) {
    state.previewDraft = { ...emptyPreviewDraft(), ...stored, saving: false };
  } else {
    state.previewDraft = state.previewDraft || emptyPreviewDraft();
  }
}

function wirePreviewTabActions() {
  contentEl
    .querySelectorAll(
      "#prevTitle, #prevCompany, #prevLocation, #prevSalary, #prevEmployment, #prevTags, #prevResumePath, #prevNotes, #prevJdText",
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
}
