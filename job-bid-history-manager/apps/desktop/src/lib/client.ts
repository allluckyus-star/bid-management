import { invoke } from "@tauri-apps/api/core";

export interface ClientInfo {
  is_client: boolean;
  local_api_url: string;
  upstream_url: string | null;
  proxy_listen: string;
}

export function isClientMode(): boolean {
  return import.meta.env.VITE_JBHM_CLIENT === "true";
}

export async function fetchClientInfo(): Promise<ClientInfo | null> {
  if (!isClientMode()) return null;
  try {
    return await invoke<ClientInfo>("get_client_info");
  } catch {
    return null;
  }
}

export async function setUpstreamUrl(url: string): Promise<ClientInfo> {
  return invoke<ClientInfo>("set_upstream_url", { url });
}
