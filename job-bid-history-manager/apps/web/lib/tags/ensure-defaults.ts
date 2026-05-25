import type { SupabaseClient } from "@supabase/supabase-js";
import { CAPTURE_TAG_NAMES } from "@jbhm/shared";

import { DEFAULT_TAG_COLORS } from "@/lib/tags/constants";

/** Seed suggested capture tags for a team if missing. Does not remove user-created tags. */
export async function ensureDefaultTags(
  supabase: SupabaseClient,
  teamId: string,
  userId: string,
) {
  for (const name of CAPTURE_TAG_NAMES) {
    const { data: existing } = await supabase
      .from("tags")
      .select("id")
      .eq("team_id", teamId)
      .ilike("name", name)
      .maybeSingle();

    if (!existing) {
      await supabase.from("tags").insert({
        team_id: teamId,
        user_id: userId,
        name,
        color: DEFAULT_TAG_COLORS[name] ?? "#64748b",
      });
    }
  }
}
