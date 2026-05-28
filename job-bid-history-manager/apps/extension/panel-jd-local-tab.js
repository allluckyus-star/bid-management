/**
 * JD Source tab — local only until accepted in Preview.
 */

async function loadLocalJdIntoState() {
  const jd = await getLocalJdSource();
  state.jdLocalText = jd.text || "";
  state.jdLocalTitle = jd.title || "";
  state.jdLocalMode = jd.sourceMode || "manual";
  state.jdLocalUrl = jd.sourceUrl || "";
}

function jdSourceTabHtml() {
  const text = state.jdLocalText ?? "";
  const mode = state.jdLocalMode || "manual";
  const chars = text.length;

  return `
    <section class="settings-section">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">JD Source</h2>
        <span class="badge ok">Local only</span>
      </div>
      <p class="hint">Stays in this browser until you accept in Preview. Not uploaded as a draft.</p>
      <p class="muted">Source: ${escapeHtml(mode)} · ${chars.toLocaleString()} characters</p>
      <label class="label" for="jdLocalTitle">Label (optional)</label>
      <input id="jdLocalTitle" class="input" maxlength="120" value="${escapeHtml(state.jdLocalTitle || "")}" placeholder="e.g. senior-engineer-acme" />
      <label class="label" for="jdLocalText">Job description text</label>
      <textarea id="jdLocalText" class="textarea" style="min-height:200px" placeholder="Paste JD, or use buttons below…">${escapeHtml(text)}</textarea>
      <div class="row sticky-footer-actions">
        <button type="button" class="btn" id="jdPullPageBtn">From page</button>
        <button type="button" class="btn" id="jdPullSelectionBtn">Selected text</button>
        <button type="button" class="btn primary" id="jdSaveLocalBtn">Save locally</button>
        <button type="button" class="btn ghost" id="jdClearLocalBtn">Clear</button>
      </div>
    </section>
  `;
}

async function pullJdFromPage() {
  const pageData = await send("GET_VISIBLE_TEXT");
  if (!pageData?.captured_text) {
    setPanelStatus("Could not read page.", "err");
    return;
  }
  state.jdLocalText = pageData.captured_text;
  state.jdLocalMode = pageData.capture_method || "page";
  state.jdLocalUrl = pageData.source_url || state.page?.url || "";
  setPanelStatus("Loaded from page.", "ok");
  await renderContent();
}

async function pullJdFromSelection() {
  const sel = await send("GET_SELECTED_TEXT");
  const text = String(sel?.selectedText || "").trim();
  if (text.length < 40) {
    setPanelStatus("Select more text on the page.", "warn");
    return;
  }
  state.jdLocalText = text.slice(0, JBHM_CONFIG.MAX_CAPTURE_TEXT_CHARS || 30000);
  state.jdLocalMode = "selection";
  setPanelStatus("Using selection.", "ok");
  await renderContent();
}

async function saveJdLocal() {
  const text = String(document.getElementById("jdLocalText")?.value || "").trim();
  const title = String(document.getElementById("jdLocalTitle")?.value || "").trim();
  await saveLocalJdSource({
    text,
    title,
    sourceMode: state.jdLocalMode || "manual",
    sourceUrl: state.jdLocalUrl || state.page?.url || "",
  });
  state.jdLocalText = text;
  state.jdLocalTitle = title;
  setPanelStatus("JD saved locally.", "ok");
}

function wireJdSourceTabActions() {
  document.getElementById("jdLocalText")?.addEventListener("input", (e) => {
    state.jdLocalText = String(e.target.value || "");
  });
  document.getElementById("jdLocalTitle")?.addEventListener("input", (e) => {
    state.jdLocalTitle = String(e.target.value || "");
  });
  document.getElementById("jdPullPageBtn")?.addEventListener("click", () => void pullJdFromPage());
  document.getElementById("jdPullSelectionBtn")?.addEventListener("click", () => void pullJdFromSelection());
  document.getElementById("jdSaveLocalBtn")?.addEventListener("click", () => void saveJdLocal());
  document.getElementById("jdClearLocalBtn")?.addEventListener("click", async () => {
    state.jdLocalText = "";
    state.jdLocalTitle = "";
    await saveLocalJdSource({ text: "", title: "", sourceMode: "manual", sourceUrl: "" });
    setPanelStatus("JD cleared.", "ok");
    await renderContent();
  });
}
