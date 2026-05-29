import type { DashboardSummary } from "@jbhm/shared";

import { endOfZonedDayMs, startOfZonedDayMs } from "@/lib/datetime/zoned";
import { createClient } from "@/lib/supabase/server";
import { getTeamTimezone } from "@/lib/teams/team-timezone";

export async function fetchDashboardSummary(teamId: string): Promise<DashboardSummary> {
  const supabase = await createClient();
  const timeZone = await getTeamTimezone(supabase, teamId);
  const now = Date.now();
  const startOfDay = startOfZonedDayMs(now, timeZone);
  const weekAgo = now - 7 * 86400000;

  const base = () =>
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .is("deleted_at", null);

  const { count: total } = await base();

  if (!total) {
    return {
      total_bids: 0,
      today_bids: 0,
      week_bids: 0,
      top_bidder: null,
      total_companies: 0,
    };
  }

  const { count: today } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .is("deleted_at", null)
    .gte("captured_at", new Date(startOfDay).toISOString())
    .lte("captured_at", new Date(endOfZonedDayMs(now, timeZone)).toISOString());

  const { count: week } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .is("deleted_at", null)
    .gte("captured_at", new Date(weekAgo).toISOString());

  const { data: topRow } = await supabase
    .from("jobs")
    .select("captured_by")
    .eq("team_id", teamId)
    .is("deleted_at", null);

  const counts = new Map<string, number>();
  for (const row of topRow ?? []) {
    const name = row.captured_by || "Unknown";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let top_bidder: string | null = null;
  let topN = 0;
  for (const [name, n] of counts) {
    if (n > topN) {
      topN = n;
      top_bidder = name;
    }
  }

  const { data: companiesRows } = await supabase
    .from("jobs")
    .select("company_name")
    .eq("team_id", teamId)
    .is("deleted_at", null);

  const uniqueCompanies = new Set(
    (companiesRows ?? []).map((r) => r.company_name).filter(Boolean),
  );

  return {
    total_bids: total ?? 0,
    today_bids: today ?? 0,
    week_bids: week ?? 0,
    top_bidder,
    total_companies: uniqueCompanies.size,
  };
}
