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
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text || `HTTP ${res.status}` };
  }
  if (!res.ok) {
    throw new Error(body.error || `Connection failed (${res.status})`);
  }
  return body;
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
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text || `HTTP ${res.status}` };
  }
  if (!res.ok) {
    throw new Error(body.error || `Capture failed (${res.status})`);
  }
  return body;
}
