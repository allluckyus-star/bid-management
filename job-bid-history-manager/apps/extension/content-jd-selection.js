/**
 * Floating actions when the user selects text on non-ChatGPT pages.
 * Orbit arm rotates; inner jbhm-fab counter-rotates (icon stays upright) — same live style as ChatGPT GPT button.
 */
(function () {
  const MIN_SELECTION_LEN = 12;
  const MAX_SELECTION_LEN = 50000;
  const HIDE_DELAY_MS = 120;
  const ORBIT_RADIUS = 52;

  let toolbar = null;
  let hideTimer = null;
  let lastRange = null;
  let pendingSelectionText = "";
  let lastPointer = null;
  let animGeneration = 0;

  const ICONS = {
    extract: `<svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 2.4l1.85 4.55L18.4 8.8l-3.7 3.05 1.15 4.75L12 13.9l-3.85 2.7 1.15-4.75L5.6 8.8l4.55-1.85L12 2.4z"/><circle cx="19.2" cy="4.8" r="1.35"/><circle cx="5" cy="18.8" r="1.05"/></svg>`,
    jd: `<svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6" stroke="white" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M8 12h8M8 16h8M8 20h5" stroke="white" stroke-width="1.75" stroke-linecap="round"/></svg>`,
    name: `<svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" stroke="white" stroke-width="1.75" fill="none"/><circle cx="7.5" cy="7.5" r="1.5" fill="white"/></svg>`,
  };

  const ACTIONS = [
    { action: "extract", title: "Extract with AI → Preview", startAngle: 0 },
    { action: "jd", title: "Send selection to JD → Preview", startAngle: 120 },
    { action: "name", title: "Send to manual name", startAngle: 240 },
  ];

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
    toolbar.innerHTML = ACTIONS.map(
      (def) => `
      <div class="jbhm-orbit-arm" data-action="${def.action}" data-start-angle="${def.startAngle}">
        <button
          type="button"
          class="jbhm-fab"
          data-variant="${def.action}"
          title="${def.title}"
          aria-label="${def.title}"
        >${ICONS[def.action]}</button>
      </div>`,
    ).join("");
    document.documentElement.appendChild(toolbar);

    toolbar.addEventListener("mousedown", (e) => {
      e.preventDefault();
      pendingSelectionText = selectedText();
    });
    toolbar.addEventListener("click", (e) => {
      const fab = e.target.closest("button.jbhm-fab");
      if (!fab || fab.disabled) return;
      const arm = fab.closest(".jbhm-orbit-arm");
      const action = arm?.getAttribute("data-action");
      if (action === "extract") void extractSelection(fab);
      else if (action === "jd") void fillPreviewField("jd", fab);
      else if (action === "name") void fillPreviewField("manual_name", fab);
    });
  }

  function showToast(message, isError = false) {
    if (typeof window.__jbhmToast === "function") {
      window.__jbhmToast(message, isError ? "error" : "info");
    }
  }

  function hideToolbar() {
    if (!toolbar) return;
    toolbar.classList.remove("jbhm-visible");
    toolbar.querySelectorAll(".jbhm-orbit-arm").forEach((arm) => {
      arm.classList.remove("jbhm-landed");
      arm.querySelector(".jbhm-fab")?.classList.remove("jbhm-live");
    });
    toolbar.querySelectorAll(".jbhm-fab").forEach((fab) => {
      fab.disabled = false;
    });
  }

  function positionToolbar(anchor) {
    if (!toolbar || !anchor) return;
    toolbar.style.left = `${anchor.x}px`;
    toolbar.style.top = `${anchor.y}px`;
  }

  function playOrbitAnimation() {
    const gen = ++animGeneration;
    toolbar.style.setProperty("--jbhm-r", `${ORBIT_RADIUS}px`);
    toolbar.querySelectorAll(".jbhm-orbit-arm").forEach((arm) => {
      arm.classList.remove("jbhm-landed");
      arm.querySelector(".jbhm-fab")?.classList.remove("jbhm-live");
      const start = Number(arm.getAttribute("data-start-angle")) || 0;
      arm.style.setProperty("--jbhm-start", `${start}deg`);
      arm.style.setProperty("--jbhm-end", `${start + 180}deg`);
      void arm.offsetWidth;
      requestAnimationFrame(() => {
        if (gen !== animGeneration) return;
        arm.classList.add("jbhm-landed");
        const fab = arm.querySelector(".jbhm-fab");
        if (fab) {
          setTimeout(() => fab.classList.add("jbhm-live"), 850);
        }
      });
    });
  }

  function currentAnchor() {
    if (lastPointer) return lastPointer;
    const rect = selectionRect();
    if (rect) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
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
    playOrbitAnimation();
  }

  function scheduleShow() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(showToolbar, HIDE_DELAY_MS);
  }

  async function runAction(btn, label, work) {
    const text = pendingSelectionText || selectedText();
    pendingSelectionText = "";
    if (!text) {
      showToast("Select some text first.", true);
      return;
    }
    if (btn) btn.disabled = true;
    showToast(label);
    try {
      const res = await work(text);
      if (!res?.ok) throw new Error(res?.error || "Action failed.");
      hideToolbar();
      window.getSelection?.()?.removeAllRanges?.();
    } catch (err) {
      showToast(err?.message || "Action failed.", true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function sendMessage(payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  async function extractSelection(btn) {
    await runAction(btn, "Extracting with AI…", (text) =>
      sendMessage({
        type: "EXTRACT_TO_PREVIEW",
        text,
        sourceUrl: window.location.href,
        pageTitle: document.title || "",
        captureMethod: "selection",
      }),
    );
    showToast("Extracted → opening Preview");
  }

  async function fillPreviewField(field, btn) {
    const isJd = field === "jd";
    const label = isJd ? "Sending to JD…" : "Sending to manual name…";
    await runAction(btn, label, (text) =>
      sendMessage({
        type: "FILL_PREVIEW_FROM_SELECTION",
        field,
        text,
        sourceUrl: window.location.href,
        pageTitle: document.title || "",
      }),
    );
    showToast(isJd ? "JD updated → opening Preview" : "Manual name updated.");
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

  window.addEventListener(
    "scroll",
    () => {
      if (toolbar?.classList.contains("jbhm-visible")) hideToolbar();
    },
    true,
  );

  document.addEventListener("mousedown", (e) => {
    if (toolbar?.contains(e.target)) return;
    if (!selectedText()) hideToolbar();
  });
})();
