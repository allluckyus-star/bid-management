/** Timezone-aware calendar helpers (Intl only — works in Node and browser). */

export const DEFAULT_TEAM_TIMEZONE = "UTC";

export function normalizeTimeZone(tz: string | null | undefined): string {
  const candidate = (tz ?? DEFAULT_TEAM_TIMEZONE).trim() || DEFAULT_TEAM_TIMEZONE;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TEAM_TIMEZONE;
  }
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function getZonedParts(ms: number, timeZone: string): ZonedParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(ms))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function zonedPartsCompare(
  a: ZonedParts,
  b: Pick<ZonedParts, "year" | "month" | "day" | "hour" | "minute" | "second">,
): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  if (a.day !== b.day) return a.day - b.day;
  if (a.hour !== b.hour) return a.hour - b.hour;
  if (a.minute !== b.minute) return a.minute - b.minute;
  return a.second - b.second;
}

/** UTC ms for a wall-clock instant in `timeZone`. */
export function zonedTimeToUtc(
  target: Pick<ZonedParts, "year" | "month" | "day" | "hour" | "minute" | "second">,
  timeZone: string,
): number {
  const anchor = Date.UTC(target.year, target.month - 1, target.day, 12, 0, 0);
  let lo = anchor - 48 * 3600_000;
  let hi = anchor + 48 * 3600_000;

  for (let i = 0; i < 40; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const z = getZonedParts(mid, timeZone);
    const cmp = zonedPartsCompare(z, target);
    if (cmp < 0) lo = mid + 1;
    else hi = mid;
  }
  return hi;
}

export function startOfZonedDayMs(ms: number, timeZone: string): number {
  const p = getZonedParts(ms, timeZone);
  return zonedTimeToUtc(
    { year: p.year, month: p.month, day: p.day, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
}

export function endOfZonedDayMs(ms: number, timeZone: string): number {
  const p = getZonedParts(ms, timeZone);
  return (
    zonedTimeToUtc(
      { year: p.year, month: p.month, day: p.day, hour: 23, minute: 59, second: 59 },
      timeZone,
    ) + 999
  );
}

/** `YYYY-MM-DD` calendar date in team zone → UTC ISO start of that day. */
export function startOfZonedDayFromYmd(ymd: string, timeZone: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date(ymd).toISOString();
  const ms = zonedTimeToUtc(
    {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
  return new Date(ms).toISOString();
}

/** `YYYY-MM-DD` calendar date in team zone → UTC ISO end of that day. */
export function endOfZonedDayFromYmd(ymd: string, timeZone: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date(ymd).toISOString();
  const ms =
    zonedTimeToUtc(
      {
        year: Number(m[1]),
        month: Number(m[2]),
        day: Number(m[3]),
        hour: 23,
        minute: 59,
        second: 59,
      },
      timeZone,
    ) + 999;
  return new Date(ms).toISOString();
}

export function startOfZonedMonthMs(ms: number, timeZone: string): number {
  const p = getZonedParts(ms, timeZone);
  return zonedTimeToUtc(
    { year: p.year, month: p.month, day: 1, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
}

export function endOfZonedMonthMs(monthStartMs: number, timeZone: string): number {
  const p = getZonedParts(monthStartMs, timeZone);
  let nextMonth = p.month + 1;
  let year = p.year;
  if (nextMonth > 12) {
    nextMonth = 1;
    year += 1;
  }
  const nextStart = zonedTimeToUtc(
    { year, month: nextMonth, day: 1, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
  return nextStart - 1;
}

export function addZonedMonths(monthStartMs: number, months: number, timeZone: string): number {
  const p = getZonedParts(monthStartMs, timeZone);
  let m = p.month - 1 + months;
  let y = p.year + Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return zonedTimeToUtc(
    { year: y, month: m + 1, day: 1, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
}

export function addZonedDays(dayStartMs: number, days: number, timeZone: string): number {
  const p = getZonedParts(dayStartMs, timeZone);
  const utc = zonedTimeToUtc(
    { year: p.year, month: p.month, day: p.day, hour: 12, minute: 0, second: 0 },
    timeZone,
  );
  return startOfZonedDayMs(utc + days * 86400_000, timeZone);
}

export function formatDateInTimeZone(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function zonedDayBucketKey(ms: number, timeZone: string): string {
  const p = getZonedParts(ms, timeZone);
  const m = String(p.month).padStart(2, "0");
  const d = String(p.day).padStart(2, "0");
  return `${p.year}-${m}-${d}T00:00:00`;
}

export function zonedHourBucketKey(ms: number, timeZone: string): string {
  const p = getZonedParts(ms, timeZone);
  const m = String(p.month).padStart(2, "0");
  const d = String(p.day).padStart(2, "0");
  const h = String(p.hour).padStart(2, "0");
  return `${p.year}-${m}-${d}T${h}:00:00`;
}
