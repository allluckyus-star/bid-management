/** Client-safe free-tier defaults (Vercel Hobby). Set NEXT_PUBLIC_FREE_TIER_SAFE_MODE=false to disable. */
export const FREE_TIER_SAFE_MODE =
  process.env.NEXT_PUBLIC_FREE_TIER_SAFE_MODE !== "false";

/** Manual refresh only when free-tier mode is on (no background polling). */
export const DASHBOARD_POLL_INTERVAL_MS = FREE_TIER_SAFE_MODE ? false : undefined;
