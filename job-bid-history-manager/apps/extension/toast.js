/**
 * Shared web toast — top-right, animated. Single implementation used across the
 * extension (background notifications, selection scripts, and the side panel).
 *
 * - Exposes window.__jbhmToast(message, variant, duration).
 * - Listens for runtime SHOW_TOAST messages (from the background service worker).
 * - Listens for window postMessage { source: "jbhm-panel", type: "JBHM_SHOW_TOAST" }
 *   so the panel iframe can raise a page-level toast on its parent page.
 *
 * variant: "success" | "error" | "warning" | "info"
 */
(() => {
  if (window.__jbhmToastReady) return;
  window.__jbhmToastReady = true;

  const CONTAINER_ID = "jbhm-toast-container";

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function iconStyle(color) {
    return [
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "width:18px",
      "height:18px",
      "min-width:18px",
      "border-radius:999px",
      `background:${color}`,
      "color:#fff",
      "font-size:12px",
      "font-weight:700",
      "line-height:18px",
    ].join(";");
  }

  function getTheme(variant) {
    if (variant === "success") {
      return { background: "#ecfdf5", border: "#86efac", color: "#14532d", icon: "\u2713", iconStyle: iconStyle("#16a34a") };
    }
    if (variant === "error") {
      return { background: "#fef2f2", border: "#fca5a5", color: "#7f1d1d", icon: "\u00d7", iconStyle: iconStyle("#dc2626") };
    }
    if (variant === "info") {
      return { background: "#eff6ff", border: "#93c5fd", color: "#1e3a8a", icon: "i", iconStyle: iconStyle("#2563eb") };
    }
    return { background: "#fffbeb", border: "#fcd34d", color: "#713f12", icon: "!", iconStyle: iconStyle("#d97706") };
  }

  function getContainer() {
    let container = document.getElementById(CONTAINER_ID);
    if (container) return container;
    container = document.createElement("div");
    container.id = CONTAINER_ID;
    Object.assign(container.style, {
      position: "fixed",
      top: "18px",
      right: "18px",
      zIndex: "2147483647",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: "10px",
      pointerEvents: "none",
    });
    (document.body || document.documentElement).appendChild(container);
    return container;
  }

  function showToast(message, variant = "warning", duration = 4200) {
    const text = String(message || "").trim();
    if (!text) return;
    const container = getContainer();
    const theme = getTheme(variant);
    const toast = document.createElement("div");
    toast.innerHTML = `<span style="${theme.iconStyle}">${theme.icon}</span><span>${escapeHtml(text)}</span>`;
    Object.assign(toast.style, {
      display: "flex",
      alignItems: "flex-start",
      gap: "9px",
      background: theme.background,
      color: theme.color,
      border: `1px solid ${theme.border}`,
      padding: "11px 13px",
      borderRadius: "12px",
      fontSize: "13px",
      fontFamily: "Arial, sans-serif",
      lineHeight: "1.35",
      maxWidth: "320px",
      wordBreak: "break-word",
      whiteSpace: "pre-line",
      boxShadow: "0 14px 35px rgba(0,0,0,0.18)",
      opacity: "0",
      transform: "translateX(34px)",
      transition: "opacity 260ms ease, transform 260ms ease",
      pointerEvents: "auto",
    });

    container.prepend(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(0)";
    });
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(34px)";
    }, duration);
    setTimeout(() => toast.remove(), duration + 320);
  }

  window.__jbhmToast = showToast;

  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "SHOW_TOAST") {
        showToast(message.text || "", message.variant || "warning", message.duration || 4200);
      }
      return false;
    });
  } catch {
    /* runtime not available */
  }

  window.addEventListener("message", (event) => {
    const data = event?.data;
    if (data && data.source === "jbhm-panel" && data.type === "JBHM_SHOW_TOAST") {
      showToast(data.text || "", data.variant || "warning", data.duration || 4200);
    }
  });
})();
