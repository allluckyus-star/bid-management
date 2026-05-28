import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { deleteLibraryResume, setDefaultLibraryResume } from "@/lib/resumes/library";
import { requireAuthUser } from "@/lib/teams/access";

type Params = { params: Promise<{ teamId: string; resumeId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { teamId: pathTeamId, resumeId } = await params;
  return withTeamRoute(request, async (teamId) => {
    if (teamId !== pathTeamId) {
      return NextResponse.json({ error: "Team mismatch" }, { status: 400 });
    }
    const { user } = await requireAuthUser();
    const body = (await request.json()) as { is_default?: boolean };
    if (body.is_default) {
      await setDefaultLibraryResume(teamId, user.id, resumeId);
    }
    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const { teamId: pathTeamId, resumeId } = await params;
  return withTeamRoute(request, async (teamId) => {
    if (teamId !== pathTeamId) {
      return NextResponse.json({ error: "Team mismatch" }, { status: 400 });
    }
    const { user } = await requireAuthUser();
    await deleteLibraryResume(teamId, user.id, resumeId);
    return new NextResponse(null, { status: 204 });
  });
}
