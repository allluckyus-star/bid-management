/**
 * Capture job posting as sanitized HTML (forms/nav stripped).
 */
const SKIP_TAGS = new Set([
  "script",
  "style",
  "nav",
  "footer",
  "header",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "noscript",
  "svg",
  "iframe",
  "aside",
]);

function findMainRoot() {
  const selectors = [
    "main",
    '[role="main"]',
    "article",
    '[class*="job-description" i]',
    '[class*="jobDescription" i]',
    '[id*="job-description" i]',
    '[data-testid*="job" i]',
    ".jobs-description",
    ".job-view-layout",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && (el.innerText || "").trim().length > 200) return el;
  }
  return document.body;
}

function cloneAndSanitize(root) {
  const clone = root.cloneNode(true);
  const remove = clone.querySelectorAll([...SKIP_TAGS].join(","));
  remove.forEach((el) => el.remove());
  clone.querySelectorAll('[aria-hidden="true"]').forEach((el) => el.remove());
  clone.querySelectorAll('[class*="cookie" i], [id*="cookie" i]').forEach((el) => el.remove());
  clone.querySelectorAll('[class*="similar" i], [class*="recommended" i]').forEach((el) => el.remove());
  return clone;
}

function capturePage() {
  const root = findMainRoot();
  const sanitized = cloneAndSanitize(root);
  let captured_html = sanitized.innerHTML || "";
  if (captured_html.length > 200000) {
    captured_html = captured_html.slice(0, 200000);
  }
  return {
    captured_html,
    source_url: window.location.href,
    page_title: document.title || "",
    capture_method: "sanitized-html",
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_VISIBLE_TEXT") {
    return;
  }
  try {
    sendResponse(capturePage());
  } catch (err) {
    sendResponse({
      captured_html: document.body?.innerHTML?.slice(0, 200000) || "",
      source_url: window.location.href,
      page_title: document.title || "",
      capture_method: "document.body.html-fallback",
      error: String(err),
    });
  }
  return true;
});
