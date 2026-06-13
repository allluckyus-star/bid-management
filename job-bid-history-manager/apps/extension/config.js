/** @typedef {"production" | "local"} ApiEnvironment */

const JBHM_CONFIG = {
  EXTENSION_VERSION: "0.8.75",
  PRODUCTION_URL: "https://velvety-naiad-90a2b9.netlify.app",
  LOCAL_URL: "http://localhost:3000",
  DEFAULT_ENV: "production",
  CONTEXT_MENU_TITLE: "Capture this page → extract to Preview",
  /**
   * Free-tier safe mode (recommended on Netlify/Vercel free tiers):
   * review-first capture, local prompt, cached status, no auto server AI on capture.
   */
  FREE_TIER_SAFE_MODE: true,
  /** Max characters sent to /api/capture/job from the extension. */
  MAX_CAPTURE_TEXT_CHARS: 30000,
  /** Extension status cache TTL (popup/panel). */
  STATUS_CACHE_TTL_MS: 5 * 60 * 1000,
  /** Block duplicate capture for the same URL within this window. */
  DUPLICATE_CAPTURE_MS: 30 * 1000,
  /** Warn when local prompt exceeds this size. */
  PROMPT_WARN_CHARS: 24000,
  /** Groq models (Preview tab picker; keys still rotate from groq-keys.local.js). */
  DEFAULT_GROQ_MODEL: "llama-3.1-8b-instant",
  /** Background polls ChatGPT caption while Preview capture is active (ms). */
  CAPTION_POLL_MS: 150,
  CAPTION_POLL_MAX_MS: 180_000,
  DEFAULT_DOCX_STYLE: "calibri",
  DOCX_STYLE_OPTIONS: [
    { id: "calibri", label: "Calibri (default)" },
    { id: "chad-taylor", label: "Professional Times" },
    { id: "chad-taylor-pdf", label: "Roboto" },
    { id: "flowcv", label: "FlowCV Modern" },
    { id: "flowcv-source", label: "FlowCV Source Sans" },
  ],
  GROQ_MODEL_OPTIONS: [
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
    { id: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B" },
    { id: "openai/gpt-oss-20b", label: "GPT OSS 20B" },
    { id: "qwen/qwen3-32b", label: "Qwen3 32B" },
  ],
};
