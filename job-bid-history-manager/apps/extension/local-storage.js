/** Local-only drafts (never sent to server until user accepts in Preview). */

const KEYS = {
  jd: "jbhm_local_jd_source",
  resume: "jbhm_local_resume_text",
  preview: "jbhm_preview_draft",
  docxRef: "jbhm_last_docx_reference",
  previewCaptureMode: "jbhm_preview_capture_mode",
  openToPreview: "jbhm_open_to_preview",
};

async function saveLocalJdSource(data) {
  await chrome.storage.local.set({
    [KEYS.jd]: {
      text: String(data.text || ""),
      title: String(data.title || ""),
      sourceUrl: String(data.sourceUrl || ""),
      sourceDomain: String(data.sourceDomain || ""),
      sourceMode: String(data.sourceMode || "manual"),
      pageTitle: String(data.pageTitle || ""),
      inputMode: String(data.inputMode || "text"),
      useLatestBid: data.useLatestBid === true,
      updatedAt: new Date().toISOString(),
    },
  });
}

async function getLocalJdSource() {
  const data = await chrome.storage.local.get({ [KEYS.jd]: null });
  return data[KEYS.jd];
}

async function clearLocalJdSource() {
  await chrome.storage.local.remove(KEYS.jd);
}

async function saveLocalResumeText(text) {
  await chrome.storage.local.set({
    [KEYS.resume]: {
      text: String(text || ""),
      updatedAt: new Date().toISOString(),
    },
  });
}

async function getLocalResumeText() {
  const data = await chrome.storage.local.get({ [KEYS.resume]: null });
  return data[KEYS.resume]?.text || "";
}

async function clearLocalResumeText() {
  await chrome.storage.local.remove(KEYS.resume);
}

async function savePreviewDraft(draft) {
  await chrome.storage.local.set({
    [KEYS.preview]: {
      ...draft,
      updatedAt: new Date().toISOString(),
    },
  });
}

async function getPreviewDraft() {
  const data = await chrome.storage.local.get({ [KEYS.preview]: null });
  return data[KEYS.preview];
}

async function clearPreviewDraft() {
  await chrome.storage.local.remove(KEYS.preview);
}

async function saveLastGeneratedDocxReference(ref) {
  await chrome.storage.local.set({ [KEYS.docxRef]: ref });
}

async function getLastGeneratedDocxReference() {
  const data = await chrome.storage.local.get({ [KEYS.docxRef]: null });
  return data[KEYS.docxRef];
}

async function setPreviewCaptureMode(enabled) {
  await chrome.storage.local.set({ [KEYS.previewCaptureMode]: enabled === true });
}

async function isPreviewCaptureMode() {
  const data = await chrome.storage.local.get({ [KEYS.previewCaptureMode]: false });
  return data[KEYS.previewCaptureMode] === true;
}

async function setOpenToPreview(enabled) {
  await chrome.storage.local.set({ [KEYS.openToPreview]: enabled === true });
}

/** Read and clear the "open straight to Preview tab" flag. */
async function consumeOpenToPreview() {
  const data = await chrome.storage.local.get({ [KEYS.openToPreview]: false });
  if (data[KEYS.openToPreview]) {
    await chrome.storage.local.remove(KEYS.openToPreview);
    return true;
  }
  return false;
}

function downloadTextFile(filename, text) {
  const blob = new Blob([String(text || "")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
