/**
 * Capture visible page text only (no HTML/CSS).
 */
const MAX_CHARS = 200000;
const PREVIEW_CHARS = 3000;

function capturePage() {
  const captured_text = (document.body?.innerText || "").trim().slice(0, MAX_CHARS);
  return {
    captured_text,
    source_url: window.location.href,
    page_title: document.title || "",
    capture_method: "document.body.innerText",
  };
}

function selectedText() {
  return String(window.getSelection?.()?.toString?.() || "").trim();
}

function pageContext() {
  const full = (document.body?.innerText || "").trim();
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
