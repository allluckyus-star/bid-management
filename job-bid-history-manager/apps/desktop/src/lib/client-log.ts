import { invoke } from "@tauri-apps/api/core";

import { isClientMode } from "./client";



export async function getClientLogPath(): Promise<string | null> {

  if (!isClientMode()) return null;

  try {

    return await invoke<string>("get_client_log_path");

  } catch {

    return null;

  }

}



export type ClientLogLevel = "info" | "warn" | "error" | "debug";



export function logClient(level: ClientLogLevel, message: string): void {

  if (!isClientMode()) return;

  void invoke("log_client_message", { level, message }).catch(() => {

    /* ignore if tauri not ready */

  });

}



export function logClientApi(

  method: string,

  path: string,

  baseUrl: string,

  ms: number,

  ok: boolean,

  detail?: string,

): void {

  const status = ok ? "ok" : "fail";

  const extra = detail ? ` — ${detail}` : "";

  logClient(

    ok ? "debug" : "error",

    `api ${method} ${path} @ ${baseUrl} ${status} (${ms}ms)${extra}`,

  );

}



export function installClientFrontendLogging(): void {

  if (!isClientMode()) return;



  logClient(

    "info",

    `frontend boot — api default ${import.meta.env.VITE_API_BASE_URL ?? "(none)"} host default ${import.meta.env.VITE_DEFAULT_HOST_URL ?? "(none)"}`,

  );



  window.addEventListener("error", (event) => {

    logClient(

      "error",

      `window.error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,

    );

  });



  window.addEventListener("unhandledrejection", (event) => {

    const reason =

      event.reason instanceof Error

        ? `${event.reason.name}: ${event.reason.message}\n${event.reason.stack ?? ""}`

        : String(event.reason);

    logClient("error", `unhandledrejection: ${reason}`);

  });



  logClient("info", "frontend loaded");



  document.addEventListener("visibilitychange", () => {

    logClient("info", `visibilitychange: ${document.visibilityState}`);

  });



  window.addEventListener("pagehide", () => {

    logClient("warn", "pagehide (page unloading)");

  });

}


