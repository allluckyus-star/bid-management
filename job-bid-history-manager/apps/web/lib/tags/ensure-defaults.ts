import type { SupabaseClient } from "@supabase/supabase-js";

import { ALLOWED_TAG_NAMES, DEFAULT_TAG_COLORS } from "@/lib/tags/constants";

export async function ensureDefaultTags(supabase: SupabaseClient, userId: string) {
  for (const name of ALLOWED_TAG_NAMES) {
    const { data: existing } = await supabase
      .from("tags")
      .select("id")
      .ilike("name", name)
      .maybeSingle();

    if (!existing) {
      await supabase.from("tags").insert({
        user_id: userId,
        name,
        color: DEFAULT_TAG_COLORS[name] ?? "#64748b",
      });
    }
  }

  const { data: all } = await supabase.from("tags").select("id, name");
  const stale = (all ?? []).filter(
    (t) => !ALLOWED_TAG_NAMES.includes(t.name.toLowerCase() as (typeof ALLOWED_TAG_NAMES)[number]),
  );
  for (const tag of stale) {
    await supabase.from("job_tags").delete().eq("tag_id", tag.id);
    await supabase.from("tags").delete().eq("id", tag.id);
  }
}
