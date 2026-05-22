import { invoke } from "@tauri-apps/api/core";

const LOCAL_API = "http://127.0.0.1:4832";

function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI_IPC__" in window)
  );
}

export interface ClientInfo {
  is_client: boolean;
  local_api_url: string;
  upstream_url: string | null;
  proxy_listen: string;
  /** True only after local GET /health succeeds — safe to fetch from UI. */
  proxy_ready: boolean;
  proxy_http_ready: boolean;
  host_reachable: boolean | null;
  proxy_error: string | null;
}

export function isClientMode(): boolean {
  return import.meta.env.VITE_JBHM_CLIENT === "true";
}

export function getDefaultHostUrl(): string {
  return import.meta.env.VITE_DEFAULT_HOST_URL ?? "http://192.168.100.17:5123";
}

async function fetchClientInfoHttp(): Promise<ClientInfo | null> {
  try {
    const res = await fetch(`${LOCAL_API}/client/info`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as ClientInfo;
  } catch {
    try {
      const health = await fetch(`${LOCAL_API}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!health.ok) return null;
      const body = (await health.json()) as { upstream?: string | null };
      return {
        is_client: true,
        local_api_url: LOCAL_API,
        upstream_url: body.upstream ?? null,
        proxy_listen: LOCAL_API,
        proxy_ready: true,
        proxy_http_ready: true,
        host_reachable: null,
        proxy_error: null,
      };
    } catch {
      return null;
    }
  }
}

export async function fetchClientInfo(): Promise<ClientInfo | null> {
  if (!isClientMode()) return null;
  if (!isTauriRuntime()) {
    return fetchClientInfoHttp();
  }
  try {
    return await invoke<ClientInfo>("get_client_info");
  } catch {
    return fetchClientInfoHttp();
  }
}

export async function setUpstreamUrl(url: string): Promise<ClientInfo> {
  if (!isTauriRuntime()) {
    const res = await fetch(`${LOCAL_API}/client/upstream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Failed to save host URL (${res.status})`);
    }
    return (await res.json()) as ClientInfo;
  }
  return invoke<ClientInfo>("set_upstream_url", { url });
}

/** True when UI runs in Chrome via jbhm-gateway (Astrill-safe), not Tauri. */
export function isBrowserClientMode(): boolean {
  return isClientMode() && !isTauriRuntime();
}
