/**
 * Captures only visible readable page text — never HTML/CSS/JS.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_VISIBLE_TEXT") {
    return;
  }

  const body = document.body;
  const captured_text = body ? body.innerText : "";

  sendResponse({
    captured_text,
    source_url: window.location.href,
    page_title: document.title || "",
    capture_method: "document.body.innerText",
  });
  return true;
});
