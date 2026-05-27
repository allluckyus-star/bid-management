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

/**
 * @param {string} baseUrl
 * @param {string} token
 */
async function fetchExtensionMe(baseUrl, token) {
  const res = await fetch(`${baseUrl}/api/extension/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
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
async function postCaptureJob(baseUrl, token, pageData) {
  const payload = {
    source_url: pageData.source_url,
    page_title: pageData.page_title,
    captured_text: pageData.captured_text || "",
    captured_at: new Date().toISOString(),
    extension_version: JBHM_CONFIG.EXTENSION_VERSION,
    capture_method: pageData.capture_method || "document.body.innerText",
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
  if (!res.ok) {
    throw new Error(parseApiErrorBody(text, res.status));
  }
  return text ? JSON.parse(text) : {};
}

/**
 * Manual JD mode: render DOCX in memory only (no optimization/export DB rows).
 * @param {string} baseUrl
 * @param {string} token
 * @param {string} teamId
 * @param {string} gptText
 * @param {{ jd_label?: string }} opts
 */
async function postRenderDocx(baseUrl, token, teamId, gptText, opts = {}) {
  const res = await fetch(`${baseUrl}/api/team/${teamId}/extension/render-docx`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      text: gptText,
      jd_label: opts.jd_label || undefined,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiErrorBody(text, res.status));
  }

  const blob = await res.blob();
  const filename =
    res.headers.get("X-JBHM-Filename") ||
    parseFilenameFromContentDisposition(res.headers.get("Content-Disposition")) ||
    "resume.docx";
  return { blob, filename };
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

async function postGptResult(baseUrl, token, teamId, optimizationId, gptText) {
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
  if (!res.ok) {
    throw new Error(parseApiErrorBody(text, res.status));
  }
  return text ? JSON.parse(text) : {};
}
