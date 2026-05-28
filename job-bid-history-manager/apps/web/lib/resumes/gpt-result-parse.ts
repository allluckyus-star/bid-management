export type OptimizedResume = {
  header: Record<string, unknown>;
  sections: Array<Record<string, unknown>>;
};

export type ParsedGptResult = {
  optimized_resume: OptimizedResume;
  raw_json: Record<string, unknown>;
};

function cleanString(value: string): string {
  return String(value ?? "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .split(/\s+/)
    .join(" ")
    .trim();
}

function sanitizeJsonStrings(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeJsonStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitizeJsonStrings(v)]),
    );
  }
  if (typeof value === "string") return cleanString(value);
  return value;
}

/** Decode common HTML entities from ChatGPT DOM copy. */
export function decodeHtmlEntitiesInText(raw: string): string {
  return String(raw ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** Escape raw newlines/tabs inside JSON string literals (matches extension content script). */
export function escapeControlCharsInsideJsonStrings(s: string): string {
  const input = String(s || "");
  let out = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inString) {
      if (escape) {
        out += ch;
        escape = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escape = true;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inString = false;
        continue;
      }
      if (ch === "\n") {
        out += "\\n";
        continue;
      }
      if (ch === "\r") {
        out += "\\r";
        continue;
      }
      if (ch === "\t") {
        out += "\\t";
        continue;
      }
      out += ch;
      continue;
    }
    out += ch;
    if (ch === '"') inString = true;
  }
  return out;
}

export function normalizeJsonTextForParse(raw: string): string {
  return escapeControlCharsInsideJsonStrings(
    decodeHtmlEntitiesInText(raw)
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*([}\]])/g, "$1"),
  );
}

/** Largest `{...}` slice by brace depth (extension uses the same heuristic). */
export function extractLargestJsonObjectString(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";

  let depth = 0;
  let start = -1;
  let best = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch !== "}" || depth <= 0) continue;
    depth -= 1;
    if (depth === 0 && start >= 0) {
      const candidate = text.slice(start, i + 1).trim();
      if (candidate.length > best.length) best = candidate;
      start = -1;
    }
  }
  return best;
}

function tryParseObject(candidate: string): Record<string, unknown> | null {
  const trimmed = String(candidate ?? "").trim();
  if (!trimmed) return null;

  const variants = [trimmed, normalizeJsonTextForParse(trimmed)];
  for (const variant of variants) {
    try {
      const parsed = JSON.parse(variant) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* next variant */
    }
  }
  return null;
}

function collectJsonCandidates(text: string): string[] {
  const raw = decodeHtmlEntitiesInText(text);
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (s: string) => {
    const t = String(s ?? "").trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  push(raw);

  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(raw))) {
    push(String(m[1] ?? ""));
  }

  const largest = extractLargestJsonObjectString(raw);
  if (largest) push(largest);

  let depth = 0;
  let start = -1;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        push(raw.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return out.sort((a, b) => b.length - a.length);
}

export function looksLikeOptimizedResume(payload: Record<string, unknown>): boolean {
  let candidate: unknown = payload;
  for (const key of ["optimized_resume", "optimizedResume", "resume"]) {
    if (payload[key] && typeof payload[key] === "object") {
      candidate = payload[key];
      break;
    }
  }
  if (!candidate || typeof candidate !== "object") return false;
  const c = candidate as Record<string, unknown>;
  if (c.header && c.sections) return true;
  const sections = c.sections;
  if (!Array.isArray(sections) || !sections.length) return false;
  const types = new Set(
    sections
      .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
      .map((s) => String(s.type ?? "").toLowerCase()),
  );
  return ["summary", "experience", "skills", "education"].some((t) => types.has(t));
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const candidates = collectJsonCandidates(text);
  for (const candidate of candidates) {
    const parsed = tryParseObject(candidate);
    if (parsed) return parsed;
  }
  return null;
}

export function normalizeOptimizedResumePayload(
  payload: Record<string, unknown>,
): ParsedGptResult {
  const sanitized = sanitizeJsonStrings(payload) as Record<string, unknown>;
  if (!looksLikeOptimizedResume(sanitized)) {
    const keys = Object.keys(sanitized).slice(0, 12);
    throw new Error(
      `Unrecognized GPT JSON shape. Send one object with optimized_resume. Keys: ${keys.join(", ")}`,
    );
  }

  let root: Record<string, unknown> = sanitized;
  for (const key of ["optimized_resume", "optimizedResume", "resume"]) {
    if (sanitized[key] && typeof sanitized[key] === "object") {
      root = sanitized[key] as Record<string, unknown>;
      break;
    }
  }

  return {
    optimized_resume: {
      header: (root.header as Record<string, unknown>) ?? {},
      sections: Array.isArray(root.sections) ? (root.sections as Array<Record<string, unknown>>) : [],
    },
    raw_json: { optimized_resume: root },
  };
}

export function parseGptResultText(text: string): ParsedGptResult {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    throw new Error("GPT result is empty");
  }

  const json = extractJsonObject(trimmed);
  if (!json) {
    const preview = normalizeJsonTextForParse(trimmed).slice(0, 120);
    throw new Error(
      `Could not parse resume JSON (check for trailing commas or unescaped line breaks in strings). Preview: ${preview}${trimmed.length > 120 ? "…" : ""}`,
    );
  }
  return normalizeOptimizedResumePayload(json);
}
