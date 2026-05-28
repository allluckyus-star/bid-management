/**
 * Capture visible page text only (no HTML/CSS).
 */
const MAX_CAPTURE_TEXT_CHARS =
  typeof JBHM_CONFIG !== "undefined" && JBHM_CONFIG.MAX_CAPTURE_TEXT_CHARS
    ? JBHM_CONFIG.MAX_CAPTURE_TEXT_CHARS
    : 30000;
const MIN_USEFUL_CHARS = 80;
const PREVIEW_CHARS = 3000;

const JOB_CONTAINER_SELECTORS = [
  "main",
  "article",
  '[class*="job"]',
  '[id*="job"]',
  '[class*="description"]',
  '[id*="description"]',
  '[data-testid*="job"]',
  '[aria-label*="job" i]',
];

function normalizeCaptureText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function selectedText() {
  return normalizeCaptureText(window.getSelection?.()?.toString?.() || "");
}

function textFromSelectors() {
  for (const selector of JOB_CONTAINER_SELECTORS) {
    try {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        const text = normalizeCaptureText(node.innerText || "");
        if (text.length >= MIN_USEFUL_CHARS) {
          return { text, method: `selector:${selector}` };
        }
      }
    } catch {
      /* ignore invalid selectors on some pages */
    }
  }
  return null;
}

function extractCaptureText() {
  const selection = selectedText();
  if (selection.length >= MIN_USEFUL_CHARS) {
    return {
      text: selection.slice(0, MAX_CAPTURE_TEXT_CHARS),
      method: "selection",
      truncated: selection.length > MAX_CAPTURE_TEXT_CHARS,
      warning: selection.length < MIN_USEFUL_CHARS ? "short_selection" : null,
    };
  }

  const fromSelector = textFromSelectors();
  if (fromSelector) {
    const text = fromSelector.text.slice(0, MAX_CAPTURE_TEXT_CHARS);
    return {
      text,
      method: fromSelector.method,
      truncated: fromSelector.text.length > MAX_CAPTURE_TEXT_CHARS,
      warning: text.length < MIN_USEFUL_CHARS ? "short_content" : null,
    };
  }

  const bodyText = normalizeCaptureText(document.body?.innerText || "");
  const text = bodyText.slice(0, MAX_CAPTURE_TEXT_CHARS);
  return {
    text,
    method: "document.body.innerText",
    truncated: bodyText.length > MAX_CAPTURE_TEXT_CHARS,
    warning: text.length < MIN_USEFUL_CHARS ? "short_content" : null,
  };
}

function capturePage() {
  const { text, method, truncated, warning } = extractCaptureText();
  return {
    captured_text: text,
    source_url: window.location.href,
    page_title: document.title || "",
    capture_method: method,
    text_length: text.length,
    truncated,
    warning,
  };
}

function pageContext() {
  const full = normalizeCaptureText(document.body?.innerText || "");
  const preview = full.slice(0, PREVIEW_CHARS);
  return {
    url: window.location.href,
    title: document.title || "",
    domain: window.location.hostname || "",
    selectedText: selectedText(),
    visibleTextPreview: preview,
    visibleTextLength: full.length,
  };
}

const PENDING_KEY = "jbhm_pending_optimization";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_VISIBLE_TEXT") {
    try {
      sendResponse(capturePage());
    } catch (err) {
      sendResponse({
        captured_text: "",
        source_url: window.location.href,
        page_title: document.title || "",
        capture_method: "document.body.innerText-fallback",
        error: String(err),
      });
    }
    return true;
  }

  if (message?.type === "GET_PENDING_OPTIMIZATION") {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      sendResponse(raw ? JSON.parse(raw) : null);
    } catch {
      sendResponse(null);
    }
    return true;
  }

  if (message?.type === "GET_PAGE_CONTEXT") {
    sendResponse(pageContext());
    return true;
  }

  if (message?.type === "GET_SELECTED_TEXT") {
    sendResponse({ selectedText: selectedText() });
    return true;
  }

  return false;
});
