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

const OUTPUT_PATH_INVALID_CHARS = /[<>:"|?*\x00-\x1f]/;
const DEFAULT_OUTPUT_PATH_TEMPLATE = "";

function stripDownloadsPrefix(path) {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/^Downloads\/?/i, "")
    .replace(/^\/+/, "")
    .trim();
}

function formatLocalTimeHms(date = new Date()) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}-${m}-${s}`;
}

/**
 * @param {string} template
 * @returns {{ ok: true, normalized: string } | { ok: false, error: string }}
 */
function validateOutputPathTemplate(template) {
  const normalized = stripDownloadsPrefix(template);
  if (!normalized) return { ok: true, normalized: "" };
  if (!/\.docx$/i.test(normalized)) {
    return { ok: false, error: "Path must end with .docx" };
  }
  if (OUTPUT_PATH_INVALID_CHARS.test(normalized)) {
    return { ok: false, error: "Path contains invalid characters (<> : \" | ? *)." };
  }
  if (/\.\./.test(normalized)) {
    return { ok: false, error: "Path cannot contain .." };
  }
  const segments = normalized.split("/").filter(Boolean);
  if (!segments.length) {
    return { ok: false, error: "Enter a file path." };
  }
  return { ok: true, normalized };
}

const OUTPUT_PATH_TOKEN_FIELDS = [
  { token: "{role}", label: "job title" },
  { token: "{company}", label: "company" },
  { token: "{manual}", label: "manual name" },
  { token: "{name}", label: "resume name" },
  { token: "{username}", label: "username" },
];

function isOutputPathFieldPresent(value) {
  const s = String(value ?? "").trim();
  return Boolean(s && s !== "-");
}

/**
 * @param {string} template
 * @param {{ role?: string, company?: string, manual?: string, name?: string, username?: string }} ctx
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function validateOutputPathTemplateContext(template, ctx = {}) {
  const validation = validateOutputPathTemplate(template);
  if (!validation.ok) return validation;
  if (!validation.normalized) return { ok: true };

  const missing = [];
  for (const { token, label } of OUTPUT_PATH_TOKEN_FIELDS) {
    if (!validation.normalized.includes(token)) continue;
    const key = token.slice(1, -1);
    if (!isOutputPathFieldPresent(ctx[key])) missing.push({ token, label });
  }
  if (missing.length === 1) {
    const { token, label } = missing[0];
    return {
      ok: false,
      error: `Output path uses ${token} but ${label} is empty in Preview.`,
    };
  }
  if (missing.length > 1) {
    return {
      ok: false,
      error: `Output path uses ${missing.map((m) => m.token).join(", ")} but ${missing.map((m) => m.label).join(", ")} are empty in Preview.`,
    };
  }
  return { ok: true };
}

function buildOutputPathContext(me, opts = {}) {
  return {
    name: opts.userName || resolveResumeFileName(opts),
    role: opts.jobTitle,
    company: opts.companyName,
    manual: opts.manualName,
    username:
      me?.username?.trim() ||
      me?.captured_by?.trim() ||
      me?.display_name?.trim() ||
      (me?.email ? String(me.email).split("@")[0] : "") ||
      "",
  };
}

/**
 * @param {string} template
 * @param {{ date?: string, time?: string, name?: string, role?: string, manual?: string, company?: string, username?: string }} ctx
 * @returns {string | null} Relative path under Downloads, or null to use legacy layout.
 */
function resolveOutputPathTemplate(template, ctx = {}) {
  const validation = validateOutputPathTemplate(template);
  if (!validation.ok) throw new Error(validation.error);
  if (!validation.normalized) return null;

  const date = ctx.date || formatLocalDateYmd();
  const time = ctx.time || formatLocalTimeHms();
  const name = sanitizeFilenameSegment(ctx.name) || "Resume";
  const role = sanitizeFilenameSegment(ctx.role) || "role";
  const manual = sanitizeFilenameSegment(ctx.manual) || "manual";
  const company = sanitizeFilenameSegment(ctx.company) || "company";
  const username = sanitizeDownloadFolderUser(ctx.username);

  let resolved = validation.normalized
    .split("{date}")
    .join(date)
    .split("{time}")
    .join(time)
    .split("{name}")
    .join(name)
    .split("{role}")
    .join(role)
    .split("{manual}")
    .join(manual)
    .split("{company}")
    .join(company)
    .split("{username}")
    .join(username);

  resolved = resolved.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (!/\.docx$/i.test(resolved)) resolved += ".docx";
  return resolved;
}

/**
 * @param {string} template
 * @param {{ display_name?: string | null, email?: string | null, captured_by?: string | null, username?: string | null }} me
 * @param {{ userName?: string, companyName?: string, jobTitle?: string, manualName?: string, resumeText?: string }} opts
 */
function buildResumePathFromTemplate(template, me, opts = {}) {
  const ctx = buildOutputPathContext(me, opts);
  const check = validateOutputPathTemplateContext(template, ctx);
  if (!check.ok) throw new Error(check.error);

  const relative = resolveOutputPathTemplate(template, ctx);
  if (!relative) return buildResumeRelativePath(me, opts);
  return relative;
}

/**
 * Human-readable "Current path" for the settings UI (Downloads-rooted).
 * Custom templates are used as-is under Downloads; empty template shows the default jbhm layout.
 */
function formatOutputPathForDisplay(template) {
  const raw = String(template ?? "").trim();
  if (!raw) {
    return "Downloads/jbhm/{username}-{date}/{company}-{role}/{name}.docx";
  }
  const normalized = stripDownloadsPrefix(raw);
  return `Downloads/${normalized}`;
}

/** Normalize a chrome.downloads filename into the Preview resume path display form. */
function formatDownloadsDisplayPath(path) {
  const normalized = String(path || "").replace(/\\/g, "/").trim();
  if (!normalized) return "";
  if (/^Downloads\/?/i.test(normalized)) {
    return normalized.replace(/\/+/g, "/");
  }
  return `Downloads/${normalized.replace(/^\/+/, "")}`;
}
