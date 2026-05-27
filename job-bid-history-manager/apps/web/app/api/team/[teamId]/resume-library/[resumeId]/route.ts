import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { deleteLibraryResume, setDefaultLibraryResume } from "@/lib/resumes/library";

type Params = { params: Promise<{ teamId: string; resumeId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { teamId: pathTeamId, resumeId } = await params;
  return withTeamRoute(request, async (teamId) => {
    if (teamId !== pathTeamId) {
      return NextResponse.json({ error: "Team mismatch" }, { status: 400 });
    }
    const body = (await request.json()) as { is_default?: boolean };
    if (body.is_default) {
      await setDefaultLibraryResume(teamId, resumeId);
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
    await deleteLibraryResume(teamId, resumeId);
    return new NextResponse(null, { status: 204 });
  });
}
