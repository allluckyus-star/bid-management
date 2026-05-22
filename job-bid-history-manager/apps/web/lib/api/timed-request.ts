const DEFAULT_TIMEOUT_MS = 20_000;

export async function timedRequest<T>(
  label: string,
  path: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const dev = process.env.NODE_ENV === "development";
  if (dev) console.time(label);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string>),
    };
    if (!(init?.body instanceof FormData)) {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    }
    const res = await fetch(path, { ...init, headers, signal: controller.signal });
    if (!res.ok) {
      let detail = await res.text();
      try {
        const json = JSON.parse(detail) as { error?: string; detail?: string };
        detail = json.error ?? json.detail ?? detail;
      } catch {
        /* keep */
      }
      throw new Error(detail || `Request failed: ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    const data = (await res.json()) as T;
    if (dev) {
      const rows =
        data && typeof data === "object" && "items" in data
          ? (data as { items: unknown[] }).items.length
          : data && typeof data === "object" && "series" in data
            ? (data as { series: unknown[] }).series.length
            : undefined;
      console.timeEnd(label);
      if (rows !== undefined) console.info(`[${label}] rows=${rows}`);
    }
    return data;
  } catch (err) {
    if (dev) console.timeEnd(label);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
