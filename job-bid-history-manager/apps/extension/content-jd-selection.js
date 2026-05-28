/**
 * Floating action when the user selects text on non-ChatGPT pages.
 * Shows a small icon button to the left of the selection. Clicking it sends the
 * selected text to the background for Groq extraction, which fills the Preview tab.
 */
(function () {
  const MIN_SELECTION_LEN = 12;
  const MAX_SELECTION_LEN = 50000;
  const HIDE_DELAY_MS = 120;

  let toolbar = null;
  let toast = null;
  let hideTimer = null;
  let lastRange = null;
  let pendingSelectionText = "";

  function selectedText() {
    const text = String(window.getSelection?.()?.toString?.() || "").trim();
    if (text.length < MIN_SELECTION_LEN) return "";
    return text.slice(0, MAX_SELECTION_LEN);
  }

  function selectionRect() {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    lastRange = range.cloneRange();
    return rect;
  }

  function ensureUi() {
    if (toolbar) return;

    toolbar = document.createElement("div");
    toolbar.id = "jbhm-jd-selection-toolbar";
    toolbar.innerHTML = `
      <button type="button" data-action="extract" title="Extract job info with AI → Preview">
        <span class="jbhm-ico" aria-hidden="true">✨</span>
        <span class="jbhm-label">Extract to Preview</span>
      </button>
    `;
    document.documentElement.appendChild(toolbar);

    toast = document.createElement("div");
    toast.id = "jbhm-jd-selection-toast";
    toast.setAttribute("role", "status");
    document.documentElement.appendChild(toast);

    toolbar.addEventListener("mousedown", (e) => {
      e.preventDefault();
      pendingSelectionText = selectedText();
    });
    toolbar.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      void extractSelection();
    });
  }

  function showToast(message, isError = false) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("jbhm-err", isError);
    toast.classList.add("jbhm-visible");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove("jbhm-visible"), 2800);
  }

  function hideToolbar() {
    if (!toolbar) return;
    toolbar.classList.remove("jbhm-visible");
  }

  function positionToolbar(rect) {
    if (!toolbar) return;
    const width = toolbar.offsetWidth || 150;
    const height = toolbar.offsetHeight || 34;
    // Place to the LEFT of the selection start, vertically centered on the selection.
    let left = rect.left - width - 8;
    if (left < 8) left = rect.right + 8; // not enough room on the left → put on the right
    let top = rect.top + rect.height / 2 - height / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
  }

  function showToolbar() {
    const text = selectedText();
    const rect = selectionRect();
    if (!text || !rect) {
      hideToolbar();
      return;
    }
    ensureUi();
    positionToolbar(rect);
    toolbar.classList.add("jbhm-visible");
  }

  function scheduleShow() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(showToolbar, HIDE_DELAY_MS);
  }

  async function extractSelection() {
    const text = pendingSelectionText || selectedText();
    pendingSelectionText = "";
    if (!text) {
      ensureUi();
      showToast("Select some job text first.", true);
      return;
    }

    const btn = toolbar.querySelector("button[data-action]");
    if (btn) btn.disabled = true;
    showToast("Extracting with AI…");

    try {
      const res = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: "EXTRACT_TO_PREVIEW",
            text,
            sourceUrl: window.location.href,
            pageTitle: document.title || "",
            captureMethod: "selection",
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(response);
          },
        );
      });
      if (!res?.ok) throw new Error(res?.error || "Extraction failed.");
      showToast("Extracted → opening Preview");
      hideToolbar();
      window.getSelection?.()?.removeAllRanges?.();
    } catch (err) {
      ensureUi();
      showToast(err?.message || "Could not extract.", true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  document.addEventListener(
    "mouseup",
    (e) => {
      if (toolbar?.contains(e.target)) return;
      scheduleShow();
    },
    true,
  );

  document.addEventListener("keyup", () => scheduleShow());

  document.addEventListener("selectionchange", () => {
    if (!selectedText()) hideToolbar();
  });

  window.addEventListener(
    "scroll",
    () => {
      if (!toolbar?.classList.contains("jbhm-visible") || !lastRange) return;
      const rect = lastRange.getBoundingClientRect();
      if (rect.width || rect.height) positionToolbar(rect);
    },
    true,
  );

  document.addEventListener("mousedown", (e) => {
    if (toolbar?.contains(e.target)) return;
    const text = selectedText();
    if (!text) hideToolbar();
  });
})();
