import { invoke } from "@tauri-apps/api/core";

export interface ExtensionInstallInfo {
  path: string;
  created: boolean;
}

function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI_IPC__" in window)
  );
}

export async function ensureExtensionFolder(): Promise<ExtensionInstallInfo | null> {
  if (!isTauriRuntime()) return null;
  return invoke<ExtensionInstallInfo>("ensure_extension_folder");
}

export async function openExtensionFolder(): Promise<ExtensionInstallInfo | null> {
  if (!isTauriRuntime()) return null;
  return invoke<ExtensionInstallInfo>("open_extension_folder");
}
