/**
 * Review-first Capture tab (free-tier safe mode). Loaded after panel.js; uses panel globals.
 */

function emptyCaptureDraft() {
  return {
    title: "",
    company: "",
    location: "",
    salary: "",
    employmentType: "",
    tags: "",
    jdText: "",
    sourceUrl: "",
    sourceDomain: "",
    pageTitle: "",
    extractionSource: "",
    captureMethod: "",
    textLength: 0,
    quality: "weak",
    weakConfirmed: false,
    confidence: "low",
    warnings: [],
    loading: false,
    saving: false,
    localPrompt: "",
    localPromptChars: 0,
    localPromptWarning: "",
  };
}

function captureTabHtml() {
  const d = state.captureDraft || emptyCaptureDraft();
  const hint = captureReadinessHint();
  const backendDown = state.status?.configured && !state.status?.connected;
  const quality = d.quality || "weak";
  const qualityClass =
    quality === "good" ? "ok" : quality === "partial" ? "warn" : "err";
  const saveDisabled =
    d.loading ||
    d.saving ||
    backendDown ||
    !state.status?.username_validated ||
    (quality === "weak" && !d.weakConfirmed);

  return `
    ${hint ? `<div class="banner ${hint.type}">${escapeHtml(hint.text)}</div>` : ""}
    ${backendDown ? `<div class="banner err">Backend unavailable — fix token in Settings. Local preview and prompt still work.</div>` : ""}
    <section class="settings-section">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">Review capture</h2>
        <span class="badge ${qualityClass}">JD quality: ${escapeHtml(qualityLabel(quality))}</span>
      </div>
      <p class="hint">Read the page locally first. Edit fields, then save once to the dashboard.</p>
      <p class="muted">Source: ${escapeHtml(d.extractionSource || "not loaded")} · ${d.textLength.toLocaleString()} chars</p>
      ${
        quality === "weak"
          ? `<div class="banner warn">This capture looks short. Select job description text or paste manually before saving.</div>
             <label class="row"><input type="checkbox" id="captureWeakConfirm" ${d.weakConfirmed ? "checked" : ""} /> Save anyway (short JD)</label>`
          : ""
      }
      <div class="capture-grid">
        <label class="label" for="capTitle">Job title</label>
        <input id="capTitle" class="input" value="${escapeHtml(d.title)}" ${d.loading ? "disabled" : ""} />
        <label class="label" for="capCompany">Company</label>
        <input id="capCompany" class="input" value="${escapeHtml(d.company)}" ${d.loading ? "disabled" : ""} />
        <label class="label" for="capLocation">Location</label>
        <input id="capLocation" class="input" value="${escapeHtml(d.location)}" ${d.loading ? "disabled" : ""} />
        <label class="label" for="capSalary">Salary (optional)</label>
        <input id="capSalary" class="input" value="${escapeHtml(d.salary)}" ${d.loading ? "disabled" : ""} />
        <label class="label" for="capEmployment">Employment type</label>
        <input id="capEmployment" class="input" placeholder="full-time, contract…" value="${escapeHtml(d.employmentType)}" ${d.loading ? "disabled" : ""} />
        <label class="label" for="capTags">Tags (comma-separated)</label>
        <input id="capTags" class="input" value="${escapeHtml(d.tags)}" ${d.loading ? "disabled" : ""} />
        <label class="label" for="capUrl">Source URL</label>
        <input id="capUrl" class="input" readonly value="${escapeHtml(d.sourceUrl)}" />
        <label class="label" for="capDomain">Domain</label>
        <input id="capDomain" class="input" readonly value="${escapeHtml(d.sourceDomain)}" />
      </div>
      <label class="label" for="capJdText">JD text</label>
      <textarea id="capJdText" class="textarea" style="min-height:160px" ${d.loading ? "disabled" : ""}>${escapeHtml(d.jdText)}</textarea>
      <div class="row sticky-footer-actions">
        <button type="button" class="btn" id="capRefreshPageBtn" ${d.loading ? "disabled" : ""}>Refresh from page</button>
        <button type="button" class="btn" id="capUseSelectionBtn" ${d.loading ? "disabled" : ""}>Use selected text</button>
        <button type="button" class="btn primary" id="capSaveBtn" ${saveDisabled ? "disabled" : ""}>
          ${d.saving ? "Saving…" : "Save to Dashboard"}
        </button>
      </div>
    </section>
  `;
}

function syncCaptureDraftFromInputs(root) {
  const d = state.captureDraft;
  if (!d) return;
  d.title = String(root.querySelector("#capTitle")?.value || "");
  d.company = String(root.querySelector("#capCompany")?.value || "");
  d.location = String(root.querySelector("#capLocation")?.value || "");
  d.salary = String(root.querySelector("#capSalary")?.value || "");
  d.employmentType = String(root.querySelector("#capEmployment")?.value || "");
  d.tags = String(root.querySelector("#capTags")?.value || "");
  d.jdText = String(root.querySelector("#capJdText")?.value || "");
  d.textLength = d.jdText.length;
  d.quality = scoreJdQuality(d.jdText);
  d.weakConfirmed = Boolean(root.querySelector("#captureWeakConfirm")?.checked);
}

function applyPageDataToCaptureDraft(pageData) {
  const jdText = String(pageData.captured_text || "");
  const fields = extractJobFieldsLocally({
    pageTitle: pageData.page_title,
    sourceUrl: pageData.source_url,
    domain: state.page?.domain || "",
    jdText,
    extractionSource: pageData.capture_method,
  });

  state.captureDraft = {
    ...emptyCaptureDraft(),
    ...state.captureDraft,
    title: fields.title,
    company: fields.company,
    location: fields.location,
    salary: fields.salary,
    employmentType: fields.employmentType,
    jdText,
    sourceUrl: pageData.source_url || state.page?.url || "",
    sourceDomain: state.page?.domain || "",
    pageTitle: pageData.page_title || state.page?.title || "",
    extractionSource: pageData.capture_method || "page",
    captureMethod: pageData.capture_method || "",
    textLength: jdText.length,
    quality: scoreJdQuality(jdText),
    confidence: fields.confidence,
    warnings: fields.warnings,
    weakConfirmed: false,
    loading: false,
  };
}

async function refreshCaptureFromPage() {
  state.captureDraft = { ...emptyCaptureDraft(), loading: true };
  await renderContent();
  const pageData = await send("GET_VISIBLE_TEXT");
  if (!pageData?.captured_text) {
    state.captureDraft = emptyCaptureDraft();
    setInlineBanner(pageData?.error || "Could not read page text.", "err");
    await renderContent();
    return;
  }
  applyPageDataToCaptureDraft(pageData);
  setInlineBanner("Loaded from page (no server call).", "ok");
  await renderContent();
}

async function useSelectedTextForCapture() {
  const sel = await send("GET_SELECTED_TEXT");
  const text = String(sel?.selectedText || "").trim();
  if (text.length < 80) {
    setInlineBanner("Select more job description text on the page first.", "warn");
    return;
  }
  const max = JBHM_CONFIG.MAX_CAPTURE_TEXT_CHARS || 30000;
  const jdText = text.slice(0, max);
  const fields = extractJobFieldsLocally({
    pageTitle: state.page?.title,
    sourceUrl: state.page?.url,
    domain: state.page?.domain,
    jdText,
    extractionSource: "selection",
  });
  state.captureDraft = {
    ...state.captureDraft,
    jdText,
    title: fields.title || state.captureDraft?.title,
    company: fields.company || state.captureDraft?.company,
    location: fields.location || state.captureDraft?.location,
    salary: fields.salary || state.captureDraft?.salary,
    employmentType: fields.employmentType || state.captureDraft?.employmentType,
    extractionSource: "selection",
    textLength: jdText.length,
    quality: scoreJdQuality(jdText),
    weakConfirmed: false,
  };
  setInlineBanner("Using selected text.", "ok");
  await renderContent();
}

async function saveReviewedCaptureToDashboard(forceCapture = false) {
  syncCaptureDraftFromInputs(contentEl);
  const d = state.captureDraft;
  if (!d?.jdText || d.jdText.length < 80) {
    setInlineBanner("JD text must be at least ~80 characters.", "err");
    return;
  }
  if (d.quality === "weak" && !d.weakConfirmed) {
    setInlineBanner("Confirm short JD or add more text before saving.", "warn");
    return;
  }

  d.saving = true;
  await renderContent();

  const res = await send("CAPTURE_REVIEWED_SAVE", {
    forceCapture,
    reviewed: {
      client_reviewed: true,
      captured_text: d.jdText.slice(0, JBHM_CONFIG.MAX_CAPTURE_TEXT_CHARS || 30000),
      source_url: d.sourceUrl,
      page_title: d.pageTitle || d.title,
      capture_method: d.captureMethod || d.extractionSource,
      extraction_source: d.extractionSource,
      job_title: d.title,
      company_name: d.company,
      location: d.location,
      salary_text: d.salary,
      employment_type: d.employmentType,
      tags: d.tags,
    },
  });

  d.saving = false;

  if (!res?.ok) {
    if (res?.duplicate && !forceCapture) {
      const retry = window.confirm(
        `${res.error || "Duplicate URL."}\n\nSave again anyway?`,
      );
      if (retry) return saveReviewedCaptureToDashboard(true);
    }
    setInlineBanner(res?.error || "Save failed.", "err");
    await renderContent();
    return;
  }

  setInlineBanner(res.result?.message || "Saved to dashboard.", "ok");
  await renderContent();
}

function wireCaptureTabActions() {
  contentEl.querySelectorAll("#capTitle, #capCompany, #capLocation, #capSalary, #capEmployment, #capTags, #capJdText").forEach((el) => {
    el.addEventListener("input", () => syncCaptureDraftFromInputs(contentEl));
  });
  document.getElementById("captureWeakConfirm")?.addEventListener("change", () => {
    syncCaptureDraftFromInputs(contentEl);
    void renderContent();
  });
  document.getElementById("capRefreshPageBtn")?.addEventListener("click", () => void refreshCaptureFromPage());
  document.getElementById("capUseSelectionBtn")?.addEventListener("click", () => void useSelectedTextForCapture());
  document.getElementById("capSaveBtn")?.addEventListener("click", () => void saveReviewedCaptureToDashboard(false));
}
