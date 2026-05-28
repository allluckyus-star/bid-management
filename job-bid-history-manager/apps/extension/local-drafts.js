/**
 * Extension-local drafts (JD, resume, preview). Not sent to server until user accepts in Preview.
 */

const KEYS = {
  jd: "jbhm_local_jd",
  resume: "jbhm_local_resume",
  preview: "jbhm_preview_draft",
  lastDocx: "jbhm_last_docx_ref",
};

async function saveLocalJdSource(draft) {
  await chrome.storage.local.set({
    [KEYS.jd]: {
      text: String(draft.text || ""),
      title: String(draft.title || ""),
      sourceMode: String(draft.sourceMode || "manual"),
      sourceUrl: String(draft.sourceUrl || ""),
      updatedAt: new Date().toISOString(),
    },
  });
}

async function getLocalJdSource() {
  const data = await chrome.storage.local.get({ [KEYS.jd]: null });
  const jd = data[KEYS.jd];
  if (!jd) {
    return { text: "", title: "", sourceMode: "manual", sourceUrl: "", updatedAt: null };
  }
  return jd;
}

async function saveLocalResumeText(text, meta = {}) {
  await chrome.storage.local.set({
    [KEYS.resume]: {
      text: String(text || ""),
      label: String(meta.label || "Master resume"),
      updatedAt: new Date().toISOString(),
    },
  });
}

async function getLocalResumeText() {
  const data = await chrome.storage.local.get({ [KEYS.resume]: null });
  const r = data[KEYS.resume];
  if (!r) return { text: "", label: "Master resume", updatedAt: null };
  return r;
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
  return (
    data[KEYS.preview] || {
      title: "",
      company: "",
      location: "",
      salary: "",
      employmentType: "",
      tags: "",
      jdText: "",
      gptOutput: "",
      notes: "",
      sourceUrl: "",
      extractionSource: "",
      weakConfirmed: false,
    }
  );
}

async function clearPreviewDraft() {
  await chrome.storage.local.remove(KEYS.preview);
}

async function clearLocalDrafts() {
  await chrome.storage.local.remove([KEYS.jd, KEYS.resume, KEYS.preview]);
}

async function saveLastGeneratedDocxReference(ref) {
  await chrome.storage.local.set({
    [KEYS.lastDocx]: {
      path: String(ref.path || ""),
      filename: String(ref.filename || ""),
      at: new Date().toISOString(),
    },
  });
}

async function getLastGeneratedDocxReference() {
  const data = await chrome.storage.local.get({ [KEYS.lastDocx]: null });
  return data[KEYS.lastDocx] || null;
}

function downloadTextFile(filename, text) {
  const blob = new Blob([String(text || "")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
