function parseApiErrorBody(text, status) {
  const raw = String(text || "").trim();
  if (raw.startsWith("<!DOCTYPE") || raw.startsWith("<html") || raw.includes("__next_error__")) {
    return `Server error (${status}). Redeploy the app and run Supabase migration 009_jd_source_selection.sql.`;
  }
  try {
    const json = JSON.parse(raw);
    return json.error || json.detail || `Request failed (${status})`;
  } catch {
    return raw.slice(0, 240) || `Request failed (${status})`;
  }
}

function debugNetwork(route, startedAt, extra = {}) {
  if (typeof console === "undefined" || !console.debug) return;
  console.debug("[jbhm-network]", {
    route,
    durationMs: Date.now() - startedAt,
    ...extra,
  });
}

/**
 * @param {string} baseUrl
 * @param {string} token
 */
async function fetchExtensionMe(baseUrl, token) {
  const route = "extension/me";
  const startedAt = Date.now();
  const res = await fetch(`${baseUrl}/api/extension/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  debugNetwork(route, startedAt, { success: res.ok, status: res.status });
  if (!res.ok) {
    throw new Error(parseApiErrorBody(text, res.status));
  }
  return text ? JSON.parse(text) : {};
}

/**
 * @param {string} baseUrl
 * @param {string} token
 */
async function fetchExtensionUsernames(baseUrl, token) {
  const route = "extension/usernames";
  const startedAt = Date.now();
  const res = await fetch(`${baseUrl}/api/extension/usernames`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  debugNetwork(route, startedAt, { success: res.ok, status: res.status });
  if (!res.ok) {
    throw new Error(parseApiErrorBody(text, res.status));
  }
  return text ? JSON.parse(text) : {};
}

/**
 * @param {string} baseUrl
 * @param {string} token
 * @param {object} pageData
 */
async function postCaptureJob(baseUrl, token, pageData, username, reviewed = null) {
  const route = "capture/job";
  const startedAt = Date.now();
  const textLength = (pageData.captured_text || reviewed?.captured_text || "").length;
  const payload = {
    source_url: pageData?.source_url ?? reviewed?.source_url,
    page_title: pageData?.page_title ?? reviewed?.page_title,
    captured_text: pageData?.captured_text || reviewed?.captured_text || "",
    captured_at: new Date().toISOString(),
    extension_version: JBHM_CONFIG.EXTENSION_VERSION,
    capture_method: pageData?.capture_method || reviewed?.capture_method || "document.body.innerText",
    extraction_source: reviewed?.extraction_source,
    username: String(username || ""),
    ...(reviewed || {}),
  };

  const res = await fetch(`${baseUrl}/api/capture/job`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  debugNetwork(route, startedAt, {
    success: res.ok,
    status: res.status,
    textLength,
  });
  if (!res.ok) {
    throw new Error(parseApiErrorBody(text, res.status));
  }
  return text ? JSON.parse(text) : {};
}

/**
 * AI extraction only (Groq) — returns structured fields without saving anything.
 * @param {string} baseUrl
 * @param {string} token
 * @param {{ captured_text: string, page_title?: string, source_url?: string }} pageData
 */
async function postExtractJob(baseUrl, token, pageData) {
  const route = "extension/extract";
  const startedAt = Date.now();
  const res = await fetch(`${baseUrl}/api/extension/extract`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      captured_text: pageData?.captured_text || "",
      page_title: pageData?.page_title || "",
      source_url: pageData?.source_url || "",
    }),
  });
  const text = await res.text();
  debugNetwork(route, startedAt, { success: res.ok, status: res.status });
  if (!res.ok) {
    throw new Error(parseApiErrorBody(text, res.status));
  }
  return text ? JSON.parse(text) : {};
}

/**
 * Stateless .docx/.pdf → text extraction (resume + JD). Server stores nothing.
 * @param {string} baseUrl
 * @param {string} token
 * @param {{ fileBase64: string, fileName: string, mimeType?: string }} fileData
 */
async function postExtractDoc(baseUrl, token, fileData) {
  const route = "extension/extract-doc";
  const startedAt = Date.now();
  const res = await fetch(`${baseUrl}/api/extension/extract-doc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      file_base64: fileData?.fileBase64 || "",
      file_name: fileData?.fileName || "",
      mime_type: fileData?.mimeType || "",
    }),
  });
  const text = await res.text();
  debugNetwork(route, startedAt, { success: res.ok, status: res.status });
  if (!res.ok) {
    throw new Error(parseApiErrorBody(text, res.status));
  }
  return text ? JSON.parse(text) : {};
}

/**
 * Build prompt from server using user's editable prefix + latest/default resume + job JD.
 * @param {string} baseUrl
 * @param {string} token
 * @param {string} teamId
 * @param {{ job_id?: string, prompt_prefix?: string }} opts
 */
async function postChatGptPrompt(baseUrl, token, teamId, opts = {}) {
  const route = "extension/chatgpt-prompt";
  const startedAt = Date.now();
  const res = await fetch(`${baseUrl}/api/team/${teamId}/extension/chatgpt-prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      job_id: opts.job_id || undefined,
      prompt_prefix: opts.prompt_prefix || undefined,
    }),
  });
  const text = await res.text();
  debugNetwork(route, startedAt, { success: res.ok, status: res.status });
  if (!res.ok) {
    throw new Error(parseApiErrorBody(text, res.status));
  }
  return text ? JSON.parse(text) : {};
}

function parseDocxRenderResponse(res, buffer) {
  const u8 = new Uint8Array(buffer);
  const isZip =
    u8.length >= 4 &&
    u8[0] === 0x50 &&
    u8[1] === 0x4b &&
    (u8[2] === 0x03 || u8[2] === 0x05) &&
    (u8[3] === 0x04 || u8[3] === 0x06);
  if (!isZip) {
    const preview = new TextDecoder().decode(u8.slice(0, 200));
    throw new Error(
      preview.trimStart().startsWith("{")
        ? `DOCX render failed: ${parseApiErrorBody(preview, res.status)}`
        : "Server did not return a valid DOCX file.",
    );
  }
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const filename =
    res.headers.get("X-JBHM-Filename") ||
    parseFilenameFromContentDisposition(res.headers.get("Content-Disposition")) ||
    "resume.docx";
  return { blob, filename };
}

function docxApiUnreachableMessage(baseUrl, err) {
  const root = String(baseUrl || "").replace(/\/$/, "");
  const isLocal = /localhost|127\.0\.0\.1/.test(root);
  const detail = err?.message ? ` (${err.message})` : "";
  if (isLocal) {
    return `Cannot reach ${root} to build DOCX${detail}. Start the web app (apps/web) or switch to Production in Settings → Server.`;
  }
  return `Cannot reach ${root} to build DOCX${detail}. Deploy the latest web app or check your network.`;
}

/**
 * Stateless DOCX render — no capture token (local download only).
 * @param {string} baseUrl
 * @param {string} gptText
 * @param {{ jd_label?: string; docx_style?: string }} opts
 */
async function postRenderDocxStateless(baseUrl, gptText, opts = {}) {
  const route = "extension/render-docx";
  const startedAt = Date.now();
  const url = `${baseUrl}/api/extension/render-docx`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: gptText,
        jd_label: opts.jd_label || undefined,
        docx_style: opts.docx_style || undefined,
      }),
    });
  } catch (err) {
    debugNetwork(route, startedAt, { success: false });
    throw new Error(docxApiUnreachableMessage(baseUrl, err));
  }
  debugNetwork(route, startedAt, { success: res.ok, status: res.status });
  if (res.status === 404) {
    throw new Error(
      "DOCX API not found on server. Deploy the latest web app (route /api/extension/render-docx).",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiErrorBody(text, res.status));
  }
  return parseDocxRenderResponse(res, await res.arrayBuffer());
}

/**
 * Team DOCX render when a capture token is configured.
 * @param {string} baseUrl
 * @param {string} token
 * @param {string} teamId
 * @param {string} gptText
 * @param {{ jd_label?: string; docx_style?: string }} opts
 */
async function postRenderDocx(baseUrl, token, teamId, gptText, opts = {}) {
  const route = "team/extension/render-docx";
  const startedAt = Date.now();
  const res = await fetch(`${baseUrl}/api/team/${teamId}/extension/render-docx`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      text: gptText,
      jd_label: opts.jd_label || undefined,
      docx_style: opts.docx_style || undefined,
    }),
  });

  debugNetwork(route, startedAt, { success: res.ok, status: res.status });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiErrorBody(text, res.status));
  }
  return parseDocxRenderResponse(res, await res.arrayBuffer());
}

function parseFilenameFromContentDisposition(header) {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      return star[1].trim();
    }
  }
  const plain = /filename="([^"]+)"/i.exec(header);
  return plain?.[1]?.trim() || null;
}

function teamApiHeaders(token, json = true) {
  const headers = { Authorization: `Bearer ${token}` };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

function teamApiUrl(baseUrl, teamId, path) {
  return `${baseUrl}/api/team/${teamId}${path}?teamId=${encodeURIComponent(teamId)}`;
}

async function fetchTeamJdSettings(baseUrl, token, teamId) {
  const route = "team/jd-settings";
  const startedAt = Date.now();
  const res = await fetch(teamApiUrl(baseUrl, teamId, "/jd-settings"), {
    method: "GET",
    headers: teamApiHeaders(token, false),
  });
  const text = await res.text();
  debugNetwork(route, startedAt, { success: res.ok, status: res.status });
  if (!res.ok) throw new Error(parseApiErrorBody(text, res.status));
  return text ? JSON.parse(text) : {};
}

async function postApplyJdFromSelection(baseUrl, token, teamId, { field, value, page_url, captured_by }) {
  const route = "team/jd-settings/apply-selection";
  const startedAt = Date.now();
  const res = await fetch(teamApiUrl(baseUrl, teamId, "/jd-settings/apply-selection"), {
    method: "POST",
    headers: teamApiHeaders(token),
    body: JSON.stringify({ field, value, page_url, captured_by }),
  });
  const text = await res.text();
  debugNetwork(route, startedAt, { success: res.ok, status: res.status });
  if (!res.ok) throw new Error(parseApiErrorBody(text, res.status));
  return text ? JSON.parse(text) : {};
}

async function patchTeamJdSettings(baseUrl, token, teamId, payload) {
  const route = "team/jd-settings-patch";
  const startedAt = Date.now();
  const res = await fetch(teamApiUrl(baseUrl, teamId, "/jd-settings"), {
    method: "PATCH",
    headers: teamApiHeaders(token),
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  debugNetwork(route, startedAt, { success: res.ok, status: res.status });
  if (!res.ok) throw new Error(parseApiErrorBody(text, res.status));
  return text ? JSON.parse(text) : {};
}

async function postManualJdSource(baseUrl, token, teamId, { text, file, title, source_origin, local_file_path }) {
  const route = "team/jd-settings-post";
  const startedAt = Date.now();
  const form = new FormData();
  if (title) form.append("title", title);
  if (text) form.append("text", text);
  if (file) form.append("file", file);
  if (source_origin) form.append("source_origin", source_origin);
  if (local_file_path) form.append("local_file_path", local_file_path);
  const res = await fetch(teamApiUrl(baseUrl, teamId, "/jd-settings"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const bodyText = await res.text();
  debugNetwork(route, startedAt, { success: res.ok, status: res.status });
  if (!res.ok) throw new Error(parseApiErrorBody(bodyText, res.status));
  const json = bodyText ? JSON.parse(bodyText) : {};
  return json.item;
}

async function fetchResumeLibrary(baseUrl, token, teamId) {
  const route = "team/resume-library";
  const startedAt = Date.now();
  const res = await fetch(teamApiUrl(baseUrl, teamId, "/resume-library"), {
    method: "GET",
    headers: teamApiHeaders(token, false),
  });
  const text = await res.text();
  debugNetwork(route, startedAt, { success: res.ok, status: res.status });
  if (!res.ok) throw new Error(parseApiErrorBody(text, res.status));
  return text ? JSON.parse(text) : { items: [] };
}

async function uploadResumeLibrary(baseUrl, token, teamId, file, setDefault) {
  const route = "team/resume-library-upload";
  const startedAt = Date.now();
  const form = new FormData();
  form.append("file", file);
  if (setDefault) form.append("set_default", "1");
  const res = await fetch(teamApiUrl(baseUrl, teamId, "/resume-library"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  debugNetwork(route, startedAt, { success: res.ok, status: res.status });
  if (!res.ok) throw new Error(parseApiErrorBody(text, res.status));
  return text ? JSON.parse(text) : {};
}

async function patchResumeLibraryItem(baseUrl, token, teamId, resumeId) {
  const route = "team/resume-library-patch";
  const startedAt = Date.now();
  const res = await fetch(teamApiUrl(baseUrl, teamId, `/resume-library/${resumeId}`), {
    method: "PATCH",
    headers: teamApiHeaders(token),
    body: JSON.stringify({ is_default: true }),
  });
  const text = await res.text();
  debugNetwork(route, startedAt, { success: res.ok, status: res.status });
  if (!res.ok) throw new Error(parseApiErrorBody(text, res.status));
}

async function deleteResumeLibraryItem(baseUrl, token, teamId, resumeId) {
  const route = "team/resume-library-delete";
  const startedAt = Date.now();
  const res = await fetch(teamApiUrl(baseUrl, teamId, `/resume-library/${resumeId}`), {
    method: "DELETE",
    headers: teamApiHeaders(token, false),
  });
  debugNetwork(route, startedAt, { success: res.ok, status: res.status });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiErrorBody(text, res.status));
  }
}

async function postGptResult(baseUrl, token, teamId, optimizationId, gptText) {
  const route = "team/gpt-result";
  const startedAt = Date.now();
  const res = await fetch(
    `${baseUrl}/api/team/${teamId}/resume-optimizations/${optimizationId}/gpt-result`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text: gptText }),
    },
  );
  const text = await res.text();
  debugNetwork(route, startedAt, { success: res.ok, status: res.status });
  if (!res.ok) {
    throw new Error(parseApiErrorBody(text, res.status));
  }
  return text ? JSON.parse(text) : {};
}
