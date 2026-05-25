import { createClient } from "@/lib/supabase/server";

export class TeamAccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type TeamMembership = {
  userId: string;
  email: string | undefined;
  role: "owner" | "member";
};

export function parseTeamIdFromRequest(request: Request): string {
  const teamId = new URL(request.url).searchParams.get("teamId");
  if (!teamId?.trim()) {
    throw new TeamAccessError(400, "teamId query parameter is required");
  }
  return teamId.trim();
}

export async function requireAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new TeamAccessError(401, "Unauthorized");
  }
  return { supabase, user };
}

export async function requireTeamMember(teamId: string): Promise<TeamMembership> {
  const { supabase, user } = await requireAuthUser();
  const { data, error } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new TeamAccessError(500, error.message);
  }
  if (!data) {
    throw new TeamAccessError(403, "Not a member of this team");
  }

  return {
    userId: user.id,
    email: user.email,
    role: data.role as "owner" | "member",
  };
}

export async function requireTeamOwner(teamId: string): Promise<TeamMembership> {
  const membership = await requireTeamMember(teamId);
  if (membership.role !== "owner") {
    throw new TeamAccessError(403, "Team owner access required");
  }
  return membership;
}

export function teamAccessToResponse(err: unknown) {
  if (err instanceof TeamAccessError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return null;
}
