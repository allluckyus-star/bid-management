const PANEL_HOST_ID = "jbhm-workspace-host";
const PANEL_SHELL_CLASS = "jbhm-workspace-shell";
const PANEL_IFRAME_ID = "jbhm-workspace-iframe";
const PANEL_RAIL_ID = "jbhm-workspace-rail";
const PANEL_WIDTH_KEY = "jbhmWorkspaceWidth";
const PANEL_OPEN_KEY = "jbhmWorkspaceOpen";
const PANEL_COLLAPSED_KEY = "jbhmWorkspaceCollapsed";
const PANEL_EXPANDED_WIDTH_KEY = "jbhmWorkspaceExpandedWidth";
/** Floating circle toggle (not a full-height bar) */
const HANDLE_SIZE = 28;
const HANDLE_COLLAPSED_SHELL = 10;
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 280;
const MAX_WIDTH = 420;
const COLLAPSED_WIDTH = HANDLE_COLLAPSED_SHELL;
const LAYOUT_VERSION_KEY = "jbhmWorkspaceLayoutVersion";
const LAYOUT_VERSION = 4;
const TRANSITION =
  "width 0.32s cubic-bezier(0.4, 0, 0.2, 1), margin-right 0.32s cubic-bezier(0.4, 0, 0.2, 1)";
const PUSH_CLASS = "jbhm-workspace-push";
const PUSH_STYLE_ID = "jbhm-push-layout-styles";
const PUSH_TRANSITION = "margin-right 0.32s cubic-bezier(0.4, 0, 0.2, 1), right 0.32s cubic-bezier(0.4, 0, 0.2, 1), width 0.32s cubic-bezier(0.4, 0, 0.2, 1), max-width 0.32s cubic-bezier(0.4, 0, 0.2, 1)";

const HANDLE_ICON_COLLAPSE = `<svg class="jbhm-handle-icon" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.75 2.25 L6.25 5 L3.75 7.75" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const HANDLE_ICON_EXPAND = `<svg class="jbhm-handle-icon" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M6.25 2.25 L3.75 5 L6.25 7.75" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

let chatGptPushObserver = null;
let chatGptPushTimer = null;
let chatGptActiveWidth = 0;

function canInjectOnPage() {
  const url = location.href;
  return !(
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("chrome-extension://")
  );
}

function clampWidth(value) {
  const n = Number(value) || DEFAULT_WIDTH;
  if (n <= 80) return COLLAPSED_WIDTH;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n));
}

/** Page push width — shell plus half the handle circle that sits outside the edge. */
function pushWidthForShell(shellWidth) {
  return clampWidth(shellWidth) + Math.round(HANDLE_SIZE / 2);
}

function isCollapsedWidth(width) {
  return Number(width) <= 80;
}

async function loadWorkspaceLayout() {
  const data = await chrome.storage.local.get({
    [PANEL_WIDTH_KEY]: DEFAULT_WIDTH,
    [PANEL_COLLAPSED_KEY]: false,
    [PANEL_EXPANDED_WIDTH_KEY]: DEFAULT_WIDTH,
    [LAYOUT_VERSION_KEY]: 0,
  });

  if (Number(data[LAYOUT_VERSION_KEY]) < LAYOUT_VERSION) {
    await chrome.storage.local.set({
      [PANEL_WIDTH_KEY]: DEFAULT_WIDTH,
      [PANEL_EXPANDED_WIDTH_KEY]: DEFAULT_WIDTH,
      [LAYOUT_VERSION_KEY]: LAYOUT_VERSION,
    });
    return { collapsed: false, width: DEFAULT_WIDTH, expandedWidth: DEFAULT_WIDTH };
  }

  const collapsed = Boolean(data[PANEL_COLLAPSED_KEY]);
  const expandedWidth = clampWidth(data[PANEL_EXPANDED_WIDTH_KEY]);
  const width = collapsed ? COLLAPSED_WIDTH : clampWidth(data[PANEL_WIDTH_KEY] || expandedWidth);
  return { collapsed, width, expandedWidth };
}

function getHost() {
  return document.getElementById(PANEL_HOST_ID);
}

function getShell() {
  const host = getHost();
  const shell = host?.querySelector(`.${PANEL_SHELL_CLASS}`);
  return shell instanceof HTMLElement ? shell : null;
}

function getIframe() {
  const shell = getShell();
  const iframe = shell?.querySelector(`#${PANEL_IFRAME_ID}`);
  return iframe instanceof HTMLIFrameElement ? iframe : null;
}

function getShellWidth(shell) {
  if (!shell) return DEFAULT_WIDTH;
  return clampWidth(Number(shell.dataset.width || shell.offsetWidth || DEFAULT_WIDTH));
}

function isChatGptPage() {
  const h = location.hostname;
  return (
    h === "chatgpt.com" ||
    h === "www.chatgpt.com" ||
    h.endsWith(".chatgpt.com") ||
    h === "chat.openai.com"
  );
}

function injectPushStyles() {
  let style = document.getElementById(PUSH_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = PUSH_STYLE_ID;
    document.documentElement.appendChild(style);
  }
  style.textContent = `
    html.${PUSH_CLASS}:not(.jbhm-chatgpt-push) {
      margin-right: var(--jbhm-panel-width, 0px) !important;
      overflow-x: clip !important;
      transition: ${PUSH_TRANSITION};
    }
    html.${PUSH_CLASS}:not(.jbhm-chatgpt-push) body {
      margin-right: 0 !important;
      padding-right: 0 !important;
    }
    html.${PUSH_CLASS}.jbhm-chatgpt-push {
      margin-right: 0 !important;
      overflow-x: clip !important;
    }
    html.${PUSH_CLASS}.jbhm-chatgpt-push [data-jbhm-gpt-push] {
      transition: ${PUSH_TRANSITION};
      box-sizing: border-box !important;
    }
  `;
}

function isJbhmNode(el) {
  return el instanceof HTMLElement && (el.id === PANEL_HOST_ID || Boolean(el.closest(`#${PANEL_HOST_ID}`)));
}

function rememberInlineStyle(el) {
  if (el.dataset.jbhmGptPushSaved === "1") return;
  el.dataset.jbhmGptPushSaved = "1";
  el.dataset.jbhmGptPrevStyle = el.getAttribute("style") || "";
}

function clearChatGptPatches() {
  for (const el of document.querySelectorAll("[data-jbhm-gpt-push]")) {
    if (!(el instanceof HTMLElement)) continue;
    const prev = el.dataset.jbhmGptPrevStyle;
    if (prev) el.setAttribute("style", prev);
    else el.removeAttribute("style");
    delete el.dataset.jbhmGptPush;
    delete el.dataset.jbhmGptPushSaved;
    delete el.dataset.jbhmGptPrevStyle;
    delete el.dataset.jbhmGptPushMode;
  }
}

function findChatGptPushTarget() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let best = null;
  let bestScore = 0;

  const consider = (el) => {
    if (!(el instanceof HTMLElement) || isJbhmNode(el)) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < vw * 0.82 || rect.height < vh * 0.75) return;
    if (vw - rect.right > 12) return;
    const score = rect.width * rect.height;
    if (score > bestScore) {
      best = el;
      bestScore = score;
    }
  };

  for (const el of document.body.children) consider(el);

  if (!best) {
    for (const el of document.querySelectorAll("body *")) {
      if (!(el instanceof HTMLElement) || isJbhmNode(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed") continue;
      consider(el);
    }
  }

  return best;
}

function applyChatGptPush(panelWidthPx) {
  if (!isChatGptPage()) return;
  const w = pushWidthForShell(panelWidthPx);
  const px = `${w}px`;

  clearChatGptPatches();

  const target = findChatGptPushTarget();
  if (!target) return;

  rememberInlineStyle(target);
  target.dataset.jbhmGptPush = "1";
  target.style.setProperty("right", px, "important");
  target.style.setProperty("inset-inline-end", px, "important");
  target.style.setProperty("left", "0", "important");
  target.style.setProperty("inset-inline-start", "0", "important");
  target.style.setProperty("width", "auto", "important");
  target.style.setProperty("max-width", "none", "important");
}

function scheduleChatGptPush(width) {
  chatGptActiveWidth = clampWidth(width);
  clearTimeout(chatGptPushTimer);
  chatGptPushTimer = setTimeout(() => applyChatGptPush(chatGptActiveWidth), 60);
}

function onChatGptWindowResize() {
  if (chatGptActiveWidth > 0) scheduleChatGptPush(chatGptActiveWidth);
}

function startChatGptPush(width) {
  chatGptActiveWidth = clampWidth(width);
  applyChatGptPush(chatGptActiveWidth);

  if (!chatGptPushObserver) {
    chatGptPushObserver = new MutationObserver(() => scheduleChatGptPush(chatGptActiveWidth));
    chatGptPushObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    window.addEventListener("resize", onChatGptWindowResize);
  }
}

function stopChatGptPush() {
  chatGptPushObserver?.disconnect();
  chatGptPushObserver = null;
  window.removeEventListener("resize", onChatGptWindowResize);
  clearTimeout(chatGptPushTimer);
  chatGptPushTimer = null;
  chatGptActiveWidth = 0;
  clearChatGptPatches();
}

function notifyPanelLayout(collapsed, width) {
  const iframe = getIframe();
  try {
    iframe?.contentWindow?.postMessage(
      { source: "jbhm-panel-host", type: "JBHM_WORKSPACE_LAYOUT", collapsed, width },
      "*",
    );
  } catch {
    /* cross-origin not applicable — extension iframe is same extension origin */
  }
}

function applyPushLayout(widthPx) {
  injectPushStyles();
  const w = pushWidthForShell(widthPx);
  const root = document.documentElement;
  const body = document.body;
  const onChatGpt = isChatGptPage();

  root.style.setProperty("--jbhm-panel-width", `${w}px`);
  root.classList.add(PUSH_CLASS);
  root.classList.toggle("jbhm-chatgpt-push", onChatGpt);

  root.style.marginRight = "";
  root.style.paddingRight = "";
  if (body) {
    body.style.marginRight = "";
    body.style.paddingRight = "";
    body.style.width = "";
    body.style.maxWidth = "";
  }

  if (onChatGpt) startChatGptPush(w);
  else stopChatGptPush();
}

function clearPushLayout() {
  const root = document.documentElement;
  const body = document.body;

  stopChatGptPush();
  root.classList.remove(PUSH_CLASS, "jbhm-chatgpt-push");
  root.style.removeProperty("--jbhm-panel-width");
  root.style.marginRight = "";
  root.style.paddingRight = "";
  if (body) {
    body.style.marginRight = "";
    body.style.paddingRight = "";
    body.style.width = "";
    body.style.maxWidth = "";
  }
}

function updateHandle(collapsed) {
  const handle = document.getElementById(PANEL_RAIL_ID);
  if (!handle) return;
  handle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  handle.title = collapsed ? "Expand Job Bid Assistant" : "Collapse panel";
  handle.innerHTML = collapsed ? HANDLE_ICON_EXPAND : HANDLE_ICON_COLLAPSE;
}

function applyShellLayout(shell, width, collapsed, { animate = true } = {}) {
  const w = collapsed ? COLLAPSED_WIDTH : clampWidth(width);
  shell.dataset.width = String(w);
  shell.dataset.collapsed = collapsed ? "1" : "0";
  shell.classList.toggle("jbhm-collapsed", collapsed);

  if (animate) {
    shell.style.transition = TRANSITION.replace("margin-right", "none");
  } else {
    shell.style.transition = "none";
  }

  shell.style.width = `${w}px`;
  applyPushLayout(w);

  if (!animate) {
    requestAnimationFrame(() => {
      shell.style.transition = TRANSITION.replace("margin-right", "none");
    });
  }

  updateHandle(collapsed);
  notifyPanelLayout(collapsed, w);
}

async function setWorkspaceCollapsed(collapsed, { animate = true } = {}) {
  const shell = getShell();
  if (!shell) return { ok: false, error: "Workspace not open." };

  const stored = await chrome.storage.local.get({
    [PANEL_EXPANDED_WIDTH_KEY]: DEFAULT_WIDTH,
  });
  let expandedWidth = clampWidth(stored[PANEL_EXPANDED_WIDTH_KEY]);

  if (collapsed) {
    const current = getShellWidth(shell);
    if (!isCollapsedWidth(current)) {
      expandedWidth = current;
      await chrome.storage.local.set({ [PANEL_EXPANDED_WIDTH_KEY]: expandedWidth });
    }
    applyShellLayout(shell, COLLAPSED_WIDTH, true, { animate });
    await chrome.storage.local.set({
      [PANEL_COLLAPSED_KEY]: true,
      [PANEL_WIDTH_KEY]: COLLAPSED_WIDTH,
    });
    return { ok: true, collapsed: true, width: COLLAPSED_WIDTH, expandedWidth };
  }

  applyShellLayout(shell, expandedWidth, false, { animate });
  await chrome.storage.local.set({
    [PANEL_COLLAPSED_KEY]: false,
    [PANEL_WIDTH_KEY]: expandedWidth,
    [PANEL_EXPANDED_WIDTH_KEY]: expandedWidth,
  });
  return { ok: true, collapsed: false, width: expandedWidth, expandedWidth };
}

async function toggleWorkspaceCollapsed() {
  const shell = getShell();
  if (!shell) return { ok: false, error: "Workspace not open." };
  const collapsed = shell.dataset.collapsed === "1";
  return setWorkspaceCollapsed(!collapsed);
}

function injectHostStyles() {
  let style = document.getElementById("jbhm-workspace-styles");
  if (!style) {
    style = document.createElement("style");
    style.id = "jbhm-workspace-styles";
    document.documentElement.appendChild(style);
  }
  style.textContent = `
    .${PANEL_SHELL_CLASS} {
      position: relative;
      height: 100%;
      overflow: visible;
      will-change: width;
    }
    .${PANEL_SHELL_CLASS}.jbhm-collapsed #${PANEL_IFRAME_ID} {
      opacity: 0;
      pointer-events: none;
      width: 0 !important;
      min-width: 0 !important;
      transition: opacity 0.2s ease, width 0.28s ease;
    }
    #${PANEL_IFRAME_ID} {
      display: block;
      width: 100%;
      height: 100%;
      min-width: 0;
      border: 0;
      opacity: 1;
      transition: opacity 0.24s ease 0.04s;
    }
    #${PANEL_RAIL_ID} {
      position: absolute;
      left: ${-Math.round(HANDLE_SIZE / 2)}px;
      top: 50%;
      transform: translateY(-50%);
      width: ${HANDLE_SIZE}px;
      height: ${HANDLE_SIZE}px;
      padding: 0;
      margin: 0;
      border: 1px solid rgba(148, 163, 184, 0.65);
      border-radius: 50%;
      background: #fff;
      color: #0f172a;
      box-shadow: 0 1px 4px rgba(15, 23, 42, 0.14);
      cursor: pointer;
      z-index: 5;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
    }
    #${PANEL_RAIL_ID}:hover {
      transform: translateY(-50%) scale(1.14);
      box-shadow: 0 2px 10px rgba(15, 23, 42, 0.22);
      background: #f8fafc;
    }
    #${PANEL_RAIL_ID}:active {
      transform: translateY(-50%) scale(1.06);
    }
    #${PANEL_RAIL_ID} .jbhm-handle-icon {
      display: block;
      flex-shrink: 0;
      pointer-events: none;
    }
  `;
}

async function createWorkspace() {
  if (!canInjectOnPage()) return { ok: false, error: "Workspace cannot open on this page." };
  if (getHost()) return { ok: true };

  injectHostStyles();
  injectPushStyles();
  const layout = await loadWorkspaceLayout();

  const host = document.createElement("div");
  host.id = PANEL_HOST_ID;
  host.style.cssText =
    "position:fixed;inset:0 0 0 auto;height:100vh;z-index:2147483646;pointer-events:none;";

  const shell = document.createElement("div");
  shell.className = PANEL_SHELL_CLASS;
  shell.style.pointerEvents = "auto";
  shell.style.boxShadow = "0 0 0 1px rgba(15,23,42,0.1), -8px 0 26px rgba(2,8,23,0.28)";
  shell.style.borderLeft = "1px solid rgba(148,163,184,0.35)";
  shell.style.background = "#fff";
  shell.style.height = "100%";

  const iframe = document.createElement("iframe");
  iframe.id = PANEL_IFRAME_ID;
  iframe.src = chrome.runtime.getURL("panel.html");
  iframe.title = "Job Bid Assistant Workspace";

  const handle = document.createElement("button");
  handle.id = PANEL_RAIL_ID;
  handle.type = "button";
  handle.className = "jbhm-workspace-handle";
  handle.innerHTML = HANDLE_ICON_COLLAPSE;
  handle.addEventListener("click", (e) => {
    e.stopPropagation();
    void toggleWorkspaceCollapsed();
  });

  shell.appendChild(iframe);
  shell.appendChild(handle);
  host.appendChild(shell);
  document.documentElement.appendChild(host);

  applyShellLayout(shell, layout.width, layout.collapsed, { animate: false });
  await chrome.storage.local.set({ [PANEL_OPEN_KEY]: true });

  iframe.addEventListener("load", () => {
    notifyPanelLayout(layout.collapsed, layout.width);
  });

  return { ok: true, collapsed: layout.collapsed, width: layout.width };
}

async function closeWorkspace() {
  const host = getHost();
  if (host) host.remove();
  clearPushLayout();
  await chrome.storage.local.set({ [PANEL_OPEN_KEY]: false });
  return { ok: true };
}

async function toggleWorkspace() {
  if (getHost()) return closeWorkspace();
  return createWorkspace();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type;
  if (type === "TOGGLE_WORKSPACE") {
    toggleWorkspace().then(sendResponse);
    return true;
  }
  if (type === "OPEN_WORKSPACE") {
    createWorkspace().then(sendResponse);
    return true;
  }
  if (type === "CLOSE_WORKSPACE") {
    closeWorkspace().then(sendResponse);
    return true;
  }
  if (type === "GET_WORKSPACE_STATE") {
    const host = getHost();
    const shell = getShell();
    const collapsed = shell?.dataset.collapsed === "1";
    sendResponse({
      open: Boolean(host),
      width: shell ? getShellWidth(shell) : null,
      collapsed: Boolean(collapsed),
      injectable: canInjectOnPage(),
    });
    return true;
  }
  if (type === "SET_WORKSPACE_COLLAPSED") {
    const collapsed = message?.collapsed;
    const promise =
      typeof collapsed === "boolean"
        ? setWorkspaceCollapsed(collapsed, { animate: message?.animate !== false })
        : toggleWorkspaceCollapsed();
    promise.then(sendResponse);
    return true;
  }
  if (type === "SET_WORKSPACE_WIDTH") {
    const shell = getShell();
    if (!shell) {
      sendResponse({ ok: false, error: "Workspace not open." });
      return true;
    }
    const width = clampWidth(message?.width);
    const collapsed = isCollapsedWidth(width);
    applyShellLayout(shell, width, collapsed, { animate: message?.animate !== false });
    const writes = {
      [PANEL_WIDTH_KEY]: width,
      [PANEL_COLLAPSED_KEY]: collapsed,
    };
    if (!collapsed) writes[PANEL_EXPANDED_WIDTH_KEY] = width;
    chrome.storage.local.set(writes);
    sendResponse({ ok: true, width, collapsed });
    return true;
  }
  return false;
});

/** Re-open workspace after in-tab navigation if it was left open. */
(async () => {
  try {
    const data = await chrome.storage.local.get({ [PANEL_OPEN_KEY]: false });
    if (data[PANEL_OPEN_KEY] && canInjectOnPage() && !getHost()) {
      await createWorkspace();
    } else if (getHost()) {
      const shell = getShell();
      if (shell) {
        const layout = await loadWorkspaceLayout();
        applyShellLayout(shell, layout.width, layout.collapsed, { animate: false });
      }
    }
  } catch {
    /* ignore */
  }
})();
