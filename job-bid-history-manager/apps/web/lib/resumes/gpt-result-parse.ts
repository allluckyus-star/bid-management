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
  const raw = String(text ?? "").trim();
  if (!raw) return null;

  const candidates: string[] = [raw];
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(raw))) {
    const inner = String(m[1] ?? "").trim();
    if (inner) candidates.push(inner);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* try brace extraction */
    }

    let depth = 0;
    let start = -1;
    for (let i = 0; i < candidate.length; i += 1) {
      const ch = candidate[i];
      if (ch === "{") {
        if (depth === 0) start = i;
        depth += 1;
      } else if (ch === "}" && depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          const slice = candidate.slice(start, i + 1);
          try {
            const parsed = JSON.parse(slice) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              return parsed as Record<string, unknown>;
            }
          } catch {
            /* continue */
          }
          start = -1;
        }
      }
    }
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
  const json = extractJsonObject(text);
  if (!json) {
    throw new Error("GPT result is empty or not valid JSON");
  }
  return normalizeOptimizedResumePayload(json);
}
