import { invoke } from "@tauri-apps/api/core";

const LOCAL_API = "http://127.0.0.1:4832";

export interface ExtensionInstallInfo {
  path: string;
  created: boolean;
  updated?: boolean;
}

function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI_IPC__" in window)
  );
}

async function ensureExtensionFolderHttp(): Promise<ExtensionInstallInfo> {
  const res = await fetch(`${LOCAL_API}/client/extension`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Extension prepare failed (${res.status})`);
  }
  return (await res.json()) as ExtensionInstallInfo;
}

async function openExtensionFolderHttp(): Promise<ExtensionInstallInfo> {
  const res = await fetch(`${LOCAL_API}/client/extension/open`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Open extension folder failed (${res.status})`);
  }
  return (await res.json()) as ExtensionInstallInfo;
}

export async function ensureExtensionFolder(): Promise<ExtensionInstallInfo | null> {
  if (isTauriRuntime()) {
    return invoke<ExtensionInstallInfo>("ensure_extension_folder");
  }
  return ensureExtensionFolderHttp();
}

export async function openExtensionFolder(): Promise<ExtensionInstallInfo | null> {
  if (isTauriRuntime()) {
    return invoke<ExtensionInstallInfo>("open_extension_folder");
  }
  return openExtensionFolderHttp();
}
