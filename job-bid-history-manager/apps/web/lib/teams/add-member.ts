import type { SupabaseClient } from "@supabase/supabase-js";

export function normalizeMemberEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findProfileByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<{ id: string; email: string | null }> {
  const normalized = normalizeMemberEmail(email);
  if (!normalized.includes("@")) {
    throw new Error("Enter a valid email address");
  }

  const { data, error } = await admin
    .from("profiles")
    .select("id, email")
    .eq("email", normalized)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("No account found with that email. They must sign up first.");
  }
  return data;
}

export async function insertTeamMember(
  admin: SupabaseClient,
  teamId: string,
  userId: string,
): Promise<void> {
  const { data: existing } = await admin
    .from("team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    throw new Error("Already a team member");
  }

  const { error } = await admin.from("team_members").insert({
    team_id: teamId,
    user_id: userId,
    role: "member",
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function markPendingJoinRequestsApproved(
  admin: SupabaseClient,
  teamId: string,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await admin
    .from("team_join_requests")
    .update({ status: "approved", approved_at: now })
    .eq("team_id", teamId)
    .eq("requester_user_id", userId)
    .eq("status", "pending");
}
