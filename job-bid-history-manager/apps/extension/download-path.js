/** Subfolder under the browser default Downloads directory: jbhm/username-YYYY-MM-DD/... */

const DOWNLOADS_ROOT_FOLDER = "jbhm";

function downloadRootPrefix() {
  return DOWNLOADS_ROOT_FOLDER;
}

function withDownloadRoot(relativePath) {
  const path = String(relativePath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  return `${downloadRootPrefix()}/${path}`;
}

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
 * @param {{ display_name?: string | null, email?: string | null, captured_by?: string | null, username?: string | null }} me
 */
function buildDownloadSubfolder(me) {
  const fromEmail = me?.email ? String(me.email).split("@")[0] : "";
  const user =
    me?.username?.trim() ||
    me?.captured_by?.trim() ||
    me?.display_name?.trim() ||
    fromEmail.trim() ||
    "User";
  return `${sanitizeDownloadFolderUser(user)}-${formatLocalDateYmd()}`;
}

function sanitizeFilenameSegment(value, maxLen = 88) {
  let raw = String(value ?? "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .split(/\s+/)
    .join(" ")
    .trim();
  raw = raw.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  raw = raw.replace(/\s+/g, " ").trim();
  if (!raw || raw === "-") return "";
  return raw.slice(0, maxLen);
}

/** Subfolder per job: "Company-Role" (e.g. "CreatorIQ-ML Engineer"). */
function buildResumeJobSubfolder(companyName, jobTitle) {
  const company = sanitizeFilenameSegment(companyName);
  const role = sanitizeFilenameSegment(jobTitle);
  const parts = [company, role].filter(Boolean);
  if (!parts.length) return "job";
  return sanitizeFilenameSegment(parts.join("-")) || "job";
}

/** First plausible full name near the top of pasted resume text. */
function guessNameFromResumeText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines.slice(0, 10)) {
    if (line.length < 3 || line.length > 60) continue;
    if (/^(experience|education|skills|summary|profile|contact|phone|email|linkedin|work history)/i.test(line)) {
      continue;
    }
    if (/@|https?:|^\+?\d|[|]/.test(line)) continue;
    if (/^[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,3}$/.test(line)) return line;
  }
  return "";
}

/**
 * Resume file name = the name written in the optimized resume (NOT the account
 * username/email). Falls back to a name guessed from the local resume text.
 */
function resolveResumeFileName(opts = {}) {
  return (
    sanitizeFilenameSegment(opts.userName) ||
    guessNameFromResumeText(opts.resumeText) ||
    "Resume"
  );
}

/**
 * Relative path under the Downloads folder (what the downloads API expects):
 *   jbhm/username-YYYY-MM-DD/Company-Role/Resume Name.docx
 */
function buildResumeRelativePath(me, opts = {}) {
  const folder = buildDownloadSubfolder(me);
  const sub = buildResumeJobSubfolder(opts.companyName, opts.jobTitle);
  const name = resolveResumeFileName(opts);
  return withDownloadRoot(`${folder}/${sub}/${name}.docx`);
}

/**
 * Human-readable path shown in the Preview tab (Downloads-rooted):
 *   Downloads/jbhm/username-YYYY-MM-DD/Company-Role/Resume Name.docx
 */
function buildResumeDownloadPath(me, opts = {}) {
  return `Downloads/${buildResumeRelativePath(me, opts)}`;
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
  return withDownloadRoot(`${folder}/${leaf}`);
}
