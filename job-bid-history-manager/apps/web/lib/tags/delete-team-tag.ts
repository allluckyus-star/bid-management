import type { SupabaseClient } from "@supabase/supabase-js";

/** Remove tag from all jobs on the team, then delete the tag row. */
export async function deleteTeamTag(
  admin: SupabaseClient,
  teamId: string,
  tagId: string,
): Promise<void> {
  const { data: tag, error: findErr } = await admin
    .from("tags")
    .select("id")
    .eq("id", tagId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (findErr) {
    throw new Error(findErr.message);
  }
  if (!tag) {
    throw new Error("Tag not found");
  }

  const { error: unlinkErr } = await admin.from("job_tags").delete().eq("tag_id", tagId);
  if (unlinkErr) {
    throw new Error(unlinkErr.message);
  }

  const { error: delErr } = await admin.from("tags").delete().eq("id", tagId).eq("team_id", teamId);
  if (delErr) {
    throw new Error(delErr.message);
  }
}
