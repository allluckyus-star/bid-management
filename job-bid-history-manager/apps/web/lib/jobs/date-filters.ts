import type { JobFilters } from "@jbhm/shared";

import { endOfZonedDayFromYmd, startOfZonedDayFromYmd } from "@/lib/datetime/zoned";
import { normalizeTimeZone } from "@/lib/teams/team-timezone";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function ymdFromFilter(value: string): string | null {
  if (YMD.test(value)) return value;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T/);
  return m?.[1] ?? null;
}

/** Map calendar date filters to UTC instants for the team timezone. */
export function applyTeamDateFilters(filters: JobFilters, timeZone: string): JobFilters {
  const tz = normalizeTimeZone(timeZone);
  const fromYmd = filters.date_from ? ymdFromFilter(filters.date_from) : null;
  const toYmd = filters.date_to ? ymdFromFilter(filters.date_to) : null;
  if (!fromYmd && !toYmd) return filters;

  return {
    ...filters,
    date_from: fromYmd ? startOfZonedDayFromYmd(fromYmd, tz) : filters.date_from,
    date_to: toYmd ? endOfZonedDayFromYmd(toYmd, tz) : filters.date_to,
  };
}
