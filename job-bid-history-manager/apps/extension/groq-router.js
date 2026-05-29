/**
 * Hidden Groq key pool — random rotation + fallback on rate limit.
 * No UI; keys loaded from groq-keys.local.js only.
 */

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MAX_PROMPT_CHARS = 120_000;

function activeGroqKeys() {
  const pool = Array.isArray(GROQ_KEY_POOL) ? GROQ_KEY_POOL : [];
  return pool.map((k) => String(k || "").trim()).filter((k) => k.startsWith("gsk_"));
}

function shuffleArray(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function defaultGroqModel() {
  return String(typeof GROQ_DEFAULT_MODEL !== "undefined" ? GROQ_DEFAULT_MODEL : "llama-3.1-8b-instant").trim();
}

function cleanGroqText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function groqChatOnce({ apiKey, model, messages, temperature, maxTokens, responseFormat }) {
  const body = {
    model,
    messages,
    temperature: temperature ?? 0.15,
    max_tokens: maxTokens ?? 8192,
  };
  if (responseFormat) body.response_format = responseFormat;

  const res = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(detail || `Groq HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const payload = await res.json();
  return String(payload?.choices?.[0]?.message?.content ?? "").trim();
}

/**
 * Run Groq chat with shuffled key pool. Retries on 429/401 with next key.
 * @returns {{ text: string, modelLabel: string, latencyMs: number, fallbackCount: number, strategy: string }}
 */
async function groqRunWithKeyPool({
  messages,
  model,
  temperature,
  maxTokens,
  responseFormat,
}) {
  const keys = activeGroqKeys();
  if (!keys.length) {
    throw new Error(
      "Groq keys not configured. Copy groq-keys.local.example.js to groq-keys.local.js and add your API keys.",
    );
  }

  const activeModel = model || defaultGroqModel();
  const order = shuffleArray(keys);
  let fallbackCount = 0;
  let lastErr = null;

  for (let i = 0; i < order.length; i += 1) {
    try {
      const started = Date.now();
      const text = await groqChatOnce({
        apiKey: order[i],
        model: activeModel,
        messages,
        temperature,
        maxTokens,
        responseFormat,
      });
      if (!text) throw new Error("Groq returned an empty response.");
      return {
        text,
        modelLabel: `groq:${activeModel}`,
        latencyMs: Date.now() - started,
        fallbackCount,
        strategy: fallbackCount > 0 ? "key-fallback" : "direct",
      };
    } catch (err) {
      lastErr = err;
      if (err.status === 429 || err.status === 401) {
        fallbackCount += 1;
        continue;
      }
      throw err;
    }
  }

  throw lastErr || new Error("All Groq API keys are rate-limited. Try again shortly.");
}

function groqHasKeys() {
  return activeGroqKeys().length > 0;
}
