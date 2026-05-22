import { CAPTURE_TAG_NAMES } from "@jbhm/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

const ALLOWED = new Set<string>(CAPTURE_TAG_NAMES);

/** Upsert capture tags and link to job; never throws — logs on failure. */
export async function attachCaptureTags(
  admin: SupabaseClient,
  opts: { userId: string; jobId: string; tagNames: string[] },
): Promise<void> {
  const names = [
    ...new Set(
      opts.tagNames
        .map((n) => n.trim().toLowerCase())
        .filter((n) => ALLOWED.has(n)),
    ),
  ];
  if (!names.length) return;

  try {
    for (const name of names) {
      let tagId: string | null = null;

      const { data: existing } = await admin
        .from("tags")
        .select("id")
        .eq("name", name)
        .maybeSingle();

      if (existing?.id) {
        tagId = existing.id;
      } else {
        const { data: inserted, error: insertErr } = await admin
          .from("tags")
          .insert({ user_id: opts.userId, name, color: null })
          .select("id")
          .single();

        if (insertErr) {
          const { data: retry } = await admin
            .from("tags")
            .select("id")
            .eq("name", name)
            .maybeSingle();
          tagId = retry?.id ?? null;
          if (!tagId) {
            console.warn(`attachCaptureTags: could not upsert tag "${name}":`, insertErr.message);
            continue;
          }
        } else {
          tagId = inserted?.id ?? null;
        }
      }

      if (!tagId) continue;

      const { error: linkErr } = await admin.from("job_tags").upsert(
        {
          job_id: opts.jobId,
          tag_id: tagId,
          user_id: opts.userId,
        },
        { onConflict: "job_id,tag_id" },
      );

      if (linkErr) {
        console.warn(`attachCaptureTags: job_tags link failed for "${name}":`, linkErr.message);
      }
    }
  } catch (err) {
    console.warn("attachCaptureTags failed:", err);
  }
}
