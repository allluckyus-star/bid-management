import { API_DEFAULT_BASE_URL } from "@jbhm/shared";
import { isClientMode } from "./client";

const STORAGE_KEY = "JBHM_API_BASE_URL";

/** Set by Tauri when the local proxy binds (client .exe); may differ from :4832 if port is busy. */
let clientLocalApiOverride: string | null = null;

export function setClientLocalApiUrl(url: string | null): void {
  clientLocalApiOverride = url?.trim() ? normalizeApiBaseUrl(url) : null;
}

export function normalizeApiBaseUrl(raw?: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return API_DEFAULT_BASE_URL;
  return trimmed.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  if (isClientMode()) {
    if (clientLocalApiOverride) return clientLocalApiOverride;
    return normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL ?? API_DEFAULT_BASE_URL);
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && stored.trim()) {
      return normalizeApiBaseUrl(stored);
    }
  } catch {
    // ignore localStorage failures
  }

  return import.meta.env.VITE_API_BASE_URL ?? API_DEFAULT_BASE_URL;
}

export function setApiBaseUrl(url: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, normalizeApiBaseUrl(url));
  } catch {
    // ignore localStorage failures
  }
}

export function clearApiBaseUrl(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore localStorage failures
  }
}
