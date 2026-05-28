/**
 * Floating actions when user selects text on non-ChatGPT pages.
 * Sets manual JD name or paste text and switches JD source to manual.
 */
(function () {
  const MIN_SELECTION_LEN = 2;
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
      <button type="button" data-field="name">Set JD name</button>
      <button type="button" data-field="text">Set JD text</button>
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
      const btn = e.target.closest("button[data-field]");
      if (!btn) return;
      const field = btn.getAttribute("data-field");
      void applySelection(field);
    });
  }

  function showToast(message, isError = false) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("jbhm-err", isError);
    toast.classList.add("jbhm-visible");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove("jbhm-visible"), 2600);
  }

  function hideToolbar() {
    if (!toolbar) return;
    toolbar.classList.remove("jbhm-visible");
  }

  function positionToolbar(rect) {
    if (!toolbar) return;
    const width = toolbar.offsetWidth || 220;
    const height = toolbar.offsetHeight || 34;
    let left = rect.left + rect.width / 2 - width / 2;
    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - 8) top = rect.top - height - 8;
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

  async function applySelection(field) {
    const text = pendingSelectionText || selectedText();
    pendingSelectionText = "";
    if (!text) {
      ensureUi();
      showToast("Select some text first.", true);
      return;
    }

    const buttons = toolbar.querySelectorAll("button");
    buttons.forEach((b) => {
      b.disabled = true;
    });

    try {
      const res = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: "APPLY_JD_FROM_SELECTION",
            field,
            value: text,
            pageUrl: field === "text" ? window.location.href : null,
          },
          (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      });
      if (!res?.ok) throw new Error(res?.error || "Failed to apply selection.");
      showToast(
        field === "name"
          ? "JD name set · Manual JD source selected"
          : "JD text set · Manual JD source selected",
      );
      hideToolbar();
      window.getSelection?.()?.removeAllRanges?.();
    } catch (err) {
      ensureUi();
      showToast(err?.message || "Could not update JD source.", true);
    } finally {
      buttons.forEach((b) => {
        b.disabled = false;
      });
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
