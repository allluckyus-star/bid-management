import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_TEAM_TIMEZONE, normalizeTimeZone } from "@/lib/datetime/zoned";

export async function getTeamTimezone(
  supabase: SupabaseClient,
  teamId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("teams")
    .select("timezone")
    .eq("id", teamId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return normalizeTimeZone(data?.timezone ?? DEFAULT_TEAM_TIMEZONE);
}

export { normalizeTimeZone, DEFAULT_TEAM_TIMEZONE };
