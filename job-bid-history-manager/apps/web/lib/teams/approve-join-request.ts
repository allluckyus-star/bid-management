import type { SupabaseClient } from "@supabase/supabase-js";

import { insertTeamMember, markPendingJoinRequestsApproved } from "@/lib/teams/add-member";

export async function approveJoinRequestAsOwner(
  admin: SupabaseClient,
  requestId: string,
  ownerUserId: string,
): Promise<{ team_id: string }> {
  const { data: joinReq, error: fetchErr } = await admin
    .from("team_join_requests")
    .select("id, team_id, owner_user_id, requester_user_id, status, expires_at")
    .eq("id", requestId)
    .maybeSingle();

  if (fetchErr || !joinReq) {
    throw new Error("Join request not found");
  }

  if (joinReq.owner_user_id !== ownerUserId) {
    throw new Error("Only the team owner can approve");
  }

  if (joinReq.status !== "pending") {
    throw new Error(`Request is ${joinReq.status}`);
  }

  if (new Date(joinReq.expires_at).getTime() < Date.now()) {
    await admin.from("team_join_requests").update({ status: "expired" }).eq("id", requestId);
    throw new Error("Join request has expired");
  }

  await insertTeamMember(admin, joinReq.team_id, joinReq.requester_user_id).catch((err) => {
    if (err instanceof Error && err.message === "Already a team member") {
      return;
    }
    throw err;
  });

  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("team_join_requests")
    .update({ status: "approved", approved_at: now })
    .eq("id", requestId);

  if (updateErr) {
    throw new Error(updateErr.message);
  }

  return { team_id: joinReq.team_id };
}
