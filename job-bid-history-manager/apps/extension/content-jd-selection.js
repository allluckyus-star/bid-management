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
  let lastPointer = null;

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
      <button type="button" data-action="extract" title="Extract job info with AI → Preview" aria-label="Extract to Preview">
        <span class="jbhm-spark" aria-hidden="true"></span>
        <svg class="jbhm-ico" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M3.4 20.4 21 12 3.4 3.6l.01 6.53L16 12 3.41 13.87z" fill="currentColor"/>
        </svg>
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
    if (typeof window.__jbhmToast === "function") {
      window.__jbhmToast(message, isError ? "error" : "info");
      return;
    }
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

  function positionToolbar(anchor) {
    if (!toolbar || !anchor) return;
    const width = toolbar.offsetWidth || 36;
    const height = toolbar.offsetHeight || 36;
    const GAP = 10;
    // Anchor the icon just to the RIGHT of the cursor, vertically centered on it.
    let left = anchor.x + GAP;
    let top = anchor.y - height / 2;
    if (left + width > window.innerWidth - 6) left = anchor.x - width - GAP;
    left = Math.max(6, Math.min(left, window.innerWidth - width - 6));
    top = Math.max(6, Math.min(top, window.innerHeight - height - 6));
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
  }

  function currentAnchor() {
    if (lastPointer) return lastPointer;
    const rect = selectionRect();
    if (rect) return { x: rect.right, y: rect.top + rect.height / 2 };
    return null;
  }

  function showToolbar() {
    const text = selectedText();
    const anchor = currentAnchor();
    if (!text || !anchor) {
      hideToolbar();
      return;
    }
    ensureUi();
    positionToolbar(anchor);
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
      lastPointer = { x: e.clientX, y: e.clientY };
      scheduleShow();
    },
    true,
  );

  document.addEventListener("keyup", () => {
    lastPointer = null;
    scheduleShow();
  });

  document.addEventListener("selectionchange", () => {
    if (!selectedText()) hideToolbar();
  });

  // Cursor-anchored button does not follow scroll; hide it instead.
  window.addEventListener(
    "scroll",
    () => {
      if (toolbar?.classList.contains("jbhm-visible")) hideToolbar();
    },
    true,
  );

  document.addEventListener("mousedown", (e) => {
    if (toolbar?.contains(e.target)) return;
    const text = selectedText();
    if (!text) hideToolbar();
  });
})();
