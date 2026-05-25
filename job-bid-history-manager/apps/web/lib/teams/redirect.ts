import { createClient } from "@/lib/supabase/server";

/** Post-login path: single team → dashboard; otherwise team picker. */
export async function resolvePostLoginPath(userId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);

  if (error) {
    return "/teams";
  }

  const ids = [...new Set((data ?? []).map((r) => r.team_id))];
  if (ids.length === 1) {
    return `/team/${ids[0]}/dashboard`;
  }
  return "/teams";
}

/** Legacy /dashboard redirect. */
export async function resolveDashboardRedirect(userId: string): Promise<string> {
  return resolvePostLoginPath(userId);
}
