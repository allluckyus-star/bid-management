/** Named resume library in IndexedDB (panel iframe). Active draft synced via local-storage.js. */

const RESUME_DB_NAME = "jbhm-resume-library";
const RESUME_DB_VERSION = 1;
const RESUME_STORE = "resumes";
const MAX_SAVED_RESUMES = 50;

function resumeUid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `resume-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function openResumeDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(RESUME_DB_NAME, RESUME_DB_VERSION);
    req.onerror = () => reject(req.error || new Error("Could not open resume database."));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(RESUME_STORE)) {
        const store = db.createObjectStore(RESUME_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
        store.createIndex("name", "name", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Resume database request failed."));
  });
}

function normalizeResumeName(name) {
  const trimmed = String(name ?? "").trim().slice(0, 120);
  return trimmed || "Untitled resume";
}

function resumeNamesMatch(a, b) {
  return normalizeResumeName(a).toLowerCase() === normalizeResumeName(b).toLowerCase();
}

/**
 * @param {string} name
 * @returns {Promise<{ id: string, name: string, text: string, createdAt: string, updatedAt: string } | null>}
 */
async function findSavedResumeByName(name) {
  const target = normalizeResumeName(name).toLowerCase();
  const items = await listSavedResumes();
  return items.find((item) => normalizeResumeName(item.name).toLowerCase() === target) || null;
}

/**
 * @returns {Promise<Array<{ id: string, name: string, text: string, createdAt: string, updatedAt: string }>>}
 */
async function listSavedResumes() {
  const db = await openResumeDb();
  try {
    const tx = db.transaction(RESUME_STORE, "readonly");
    const items = await idbRequest(tx.objectStore(RESUME_STORE).getAll());
    return (items || []).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  } finally {
    db.close();
  }
}

/**
 * @param {string} id
 */
async function getSavedResume(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  const db = await openResumeDb();
  try {
    const tx = db.transaction(RESUME_STORE, "readonly");
    const item = await idbRequest(tx.objectStore(RESUME_STORE).get(key));
    return item || null;
  } finally {
    db.close();
  }
}

/**
 * @param {{ id?: string, name: string, text: string }} input
 */
async function upsertSavedResume(input) {
  const now = new Date().toISOString();
  const name = normalizeResumeName(input.name);
  const text = String(input.text || "");
  const id = String(input.id || "").trim() || resumeUid();

  const db = await openResumeDb();
  try {
    const tx = db.transaction(RESUME_STORE, "readwrite");
    const store = tx.objectStore(RESUME_STORE);
    let createdAt = now;
    if (input.id) {
      const existing = await idbRequest(store.get(id));
      if (existing?.createdAt) createdAt = existing.createdAt;
    }
    const record = { id, name, text, createdAt, updatedAt: now };
    await idbRequest(store.put(record));

    const all = await idbRequest(store.getAll());
    if (all.length > MAX_SAVED_RESUMES) {
      const sorted = all.sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)));
      const excess = sorted.length - MAX_SAVED_RESUMES;
      for (let i = 0; i < excess; i += 1) {
        await idbRequest(store.delete(sorted[i].id));
      }
    }

    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Resume save aborted."));
    });

    return record;
  } finally {
    db.close();
  }
}

/**
 * @param {string} id
 */
async function deleteSavedResume(id) {
  const key = String(id || "").trim();
  if (!key) return false;
  const db = await openResumeDb();
  try {
    const tx = db.transaction(RESUME_STORE, "readwrite");
    await idbRequest(tx.objectStore(RESUME_STORE).delete(key));
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } finally {
    db.close();
  }
}

/** If library is empty but chrome.storage has resume text, create one saved entry. */
async function migrateLegacyResumeToLibrary() {
  const items = await listSavedResumes();
  if (items.length) return null;

  const text = String((await getLocalResumeText()) || "").trim();
  if (!text) return null;

  const sel = await getActiveResumeSelection();
  const name = normalizeResumeName(sel.name || "Master resume");
  const saved = await upsertSavedResume({ name, text });
  await setActiveResumeSelection({ id: saved.id, name: saved.name, text: saved.text });
  return saved;
}
