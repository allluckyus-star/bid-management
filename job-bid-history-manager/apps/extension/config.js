/** @typedef {"production" | "local"} ApiEnvironment */

const JBHM_CONFIG = {
  EXTENSION_VERSION: "0.8.43",
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
  /** Username validation cache TTL. */
  USERNAME_VALIDATION_CACHE_TTL_MS: 10 * 60 * 1000,
  /** Block duplicate capture for the same URL within this window. */
  DUPLICATE_CAPTURE_MS: 30 * 1000,
  /** Warn when local prompt exceeds this size. */
  PROMPT_WARN_CHARS: 24000,
};
