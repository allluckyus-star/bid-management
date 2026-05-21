import { API_DEFAULT_BASE_URL } from "@jbhm/shared";
import { isClientMode } from "./client";

const STORAGE_KEY = "JBHM_API_BASE_URL";

export function normalizeApiBaseUrl(raw?: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return API_DEFAULT_BASE_URL;
  return trimmed.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  if (isClientMode()) {
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
