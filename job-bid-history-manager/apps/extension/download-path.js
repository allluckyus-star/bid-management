/** Subfolder under the browser default Downloads directory: username-YYYY-MM-DD */

function sanitizeDownloadFolderUser(value) {
  let raw = String(value ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 64);
  return raw || "User";
}

function formatLocalDateYmd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * @param {{ display_name?: string | null, email?: string | null, captured_by?: string | null }} me
 */
function buildDownloadSubfolder(me) {
  const fromEmail = me?.email ? String(me.email).split("@")[0] : "";
  const user = me?.display_name?.trim() || fromEmail.trim() || me?.captured_by?.trim() || "User";
  return `${sanitizeDownloadFolderUser(user)}-${formatLocalDateYmd()}`;
}

/**
 * Chrome creates missing parent folders under the default download directory.
 * @param {{ display_name?: string | null, email?: string | null, captured_by?: string | null }} me
 * @param {string} filename
 */
function resolveDownloadFilename(me, filename) {
  const folder = buildDownloadSubfolder(me);
  const leaf =
    String(filename || "resume.docx")
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean)
      .pop() || "resume.docx";
  return `${folder}/${leaf}`;
}
