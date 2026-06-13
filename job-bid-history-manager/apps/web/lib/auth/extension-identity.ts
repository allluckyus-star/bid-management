import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

import { listAllProfileUsernames } from "@/lib/auth/profile-usernames";

/** Label stored on jobs.captured_by — never trust extension payload. */
export async function resolveCapturedByForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name, email")
    .eq("id", userId)
    .maybeSingle();

  const displayName = profile?.display_name?.trim();
  if (displayName) return displayName.slice(0, 200);

  const profileEmail = profile?.email?.trim();
  if (profileEmail) return profileEmail.slice(0, 200);

  const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId);
  if (!authError) {
    const authEmail = authData.user?.email?.trim();
    if (authEmail) return authEmail.slice(0, 200);
  }

  return "Unknown";
}

export type ExtensionMePayload = {
  user_id: string;
  team_id: string | null;
  display_name: string | null;
  email: string | null;
  username: string | null;
  usernames: string[];
  captured_by: string;
};

export async function getExtensionMeForUser(userId: string): Promise<ExtensionMePayload> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name, email, username")
    .eq("id", userId)
    .maybeSingle();

  const usernames = await listAllProfileUsernames(admin, userId);
  const display_name = profile?.display_name?.trim() || null;
  const email = profile?.email?.trim() || null;
  const username = profile?.username?.trim() || usernames[0] || null;
  const captured_by = await resolveCapturedByForUser(admin, userId);

  let resolvedEmail = email;
  if (!resolvedEmail) {
    const { data: authData } = await admin.auth.admin.getUserById(userId);
    resolvedEmail = authData.user?.email?.trim() || null;
  }

  return {
    user_id: userId,
    team_id: null,
    display_name,
    email: resolvedEmail,
    username,
    usernames,
    captured_by,
  };
}
