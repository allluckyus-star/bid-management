import type { SupabaseClient } from "@supabase/supabase-js";

import { ALLOWED_TAG_NAMES, DEFAULT_TAG_COLORS } from "@/lib/tags/constants";

export async function ensureDefaultTags(
  supabase: SupabaseClient,
  teamId: string,
  userId: string,
) {
  for (const name of ALLOWED_TAG_NAMES) {
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

  const { data: all } = await supabase
    .from("tags")
    .select("id, name")
    .eq("team_id", teamId);
  const allowed = new Set(ALLOWED_TAG_NAMES);
  const stale = (all ?? []).filter((t) => !allowed.has(t.name.toLowerCase()));
  for (const tag of stale) {
    await supabase.from("job_tags").delete().eq("tag_id", tag.id);
    await supabase.from("tags").delete().eq("id", tag.id);
  }
}
