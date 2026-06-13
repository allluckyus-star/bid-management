/** Local-only drafts (never sent to server until user accepts in Preview). */

const KEYS = {
  jd: "jbhm_local_jd_source",
  resume: "jbhm_local_resume_text",
  activeResumeId: "jbhm_active_resume_id",
  activeResumeName: "jbhm_active_resume_name",
  preview: "jbhm_preview_draft",
  docxRef: "jbhm_last_docx_reference",
  previewCaptureMode: "jbhm_preview_capture_mode",
  openToPreview: "jbhm_open_to_preview",
};

function isExtensionContextInvalidatedError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("extension context invalidated") || msg.includes("context invalidated");
}

function extensionReloadUserMessage() {
  return "Extension was reloaded. Refresh this page (F5), then try again.";
}

async function storageLocalSet(items) {
  try {
    await chrome.storage.local.set(items);
  } catch (err) {
    if (isExtensionContextInvalidatedError(err)) {
      throw new Error(extensionReloadUserMessage());
    }
    throw err;
  }
}

async function storageLocalRemove(keys) {
  try {
    await chrome.storage.local.remove(keys);
  } catch (err) {
    if (isExtensionContextInvalidatedError(err)) {
      throw new Error(extensionReloadUserMessage());
    }
    throw err;
  }
}

async function storageLocalGet(defaults) {
  try {
    return await chrome.storage.local.get(defaults);
  } catch (err) {
    if (isExtensionContextInvalidatedError(err)) {
      throw new Error(extensionReloadUserMessage());
    }
    throw err;
  }
}

async function saveLocalJdSource(data) {
  await storageLocalSet({
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
  const data = await storageLocalGet({ [KEYS.jd]: null });
  return data[KEYS.jd];
}

async function clearLocalJdSource() {
  await storageLocalRemove(KEYS.jd);
}

async function saveLocalResumeText(text, meta = {}) {
  const payload = {
    text: String(text || ""),
    updatedAt: new Date().toISOString(),
  };
  if (meta.name !== undefined) payload.name = String(meta.name || "");
  if (meta.id !== undefined) payload.id = String(meta.id || "");

  const writes = { [KEYS.resume]: payload };
  if (meta.id !== undefined) writes[KEYS.activeResumeId] = String(meta.id || "");
  if (meta.name !== undefined) writes[KEYS.activeResumeName] = String(meta.name || "");
  await storageLocalSet(writes);
}

async function getLocalResumeText() {
  const data = await storageLocalGet({ [KEYS.resume]: null });
  return data[KEYS.resume]?.text || "";
}

async function getActiveResumeSelection() {
  const data = await storageLocalGet({
    [KEYS.resume]: null,
    [KEYS.activeResumeId]: "",
    [KEYS.activeResumeName]: "",
  });
  const resume = data[KEYS.resume];
  return {
    id: String(data[KEYS.activeResumeId] || resume?.id || ""),
    name: String(data[KEYS.activeResumeName] || resume?.name || ""),
    text: String(resume?.text || ""),
  };
}

async function setActiveResumeSelection({ id, name, text }) {
  await saveLocalResumeText(text, { id, name });
}

async function clearLocalResumeText() {
  await storageLocalRemove(KEYS.resume);
}

async function savePreviewDraft(draft) {
  await storageLocalSet({
    [KEYS.preview]: {
      ...draft,
      updatedAt: new Date().toISOString(),
    },
  });
}

async function getPreviewDraft() {
  const data = await storageLocalGet({ [KEYS.preview]: null });
  return data[KEYS.preview];
}

async function clearPreviewDraft() {
  await storageLocalRemove(KEYS.preview);
}

async function saveLastGeneratedDocxReference(ref) {
  await storageLocalSet({ [KEYS.docxRef]: ref });
}

async function getLastGeneratedDocxReference() {
  const data = await storageLocalGet({ [KEYS.docxRef]: null });
  return data[KEYS.docxRef];
}

async function setPreviewCaptureMode(enabled) {
  await storageLocalSet({ [KEYS.previewCaptureMode]: enabled === true });
}

async function isPreviewCaptureMode() {
  const data = await storageLocalGet({ [KEYS.previewCaptureMode]: false });
  return data[KEYS.previewCaptureMode] === true;
}

async function setOpenToPreview(enabled) {
  await storageLocalSet({ [KEYS.openToPreview]: enabled === true });
}

/** Read and clear the "open straight to Preview tab" flag. */
async function consumeOpenToPreview() {
  const data = await storageLocalGet({ [KEYS.openToPreview]: false });
  if (data[KEYS.openToPreview]) {
    await storageLocalRemove(KEYS.openToPreview);
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
