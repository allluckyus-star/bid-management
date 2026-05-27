/**
 * Capture visible page text only (no HTML/CSS).
 */
const MAX_CHARS = 200000;

function capturePage() {
  const captured_text = (document.body?.innerText || "").trim().slice(0, MAX_CHARS);
  return {
    captured_text,
    source_url: window.location.href,
    page_title: document.title || "",
    capture_method: "document.body.innerText",
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

  return false;
});
