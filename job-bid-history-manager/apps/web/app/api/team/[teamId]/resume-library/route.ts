import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { listTeamResumeLibrary, uploadTeamResumeOriginal } from "@/lib/resumes/library";
import { requireAuthUser } from "@/lib/teams/access";

type Params = { params: Promise<{ teamId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { teamId: pathTeamId } = await params;
  return withTeamRoute(request, async (teamId) => {
    if (teamId !== pathTeamId) {
      return NextResponse.json({ error: "Team mismatch" }, { status: 400 });
    }
    const items = await listTeamResumeLibrary(teamId);
    return NextResponse.json({ items });
  });
}

export async function POST(request: Request, { params }: Params) {
  const { teamId: pathTeamId } = await params;
  return withTeamRoute(request, async (teamId) => {
    if (teamId !== pathTeamId) {
      return NextResponse.json({ error: "Team mismatch" }, { status: 400 });
    }
    const { user } = await requireAuthUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    const setDefault = form.get("set_default") === "true" || form.get("set_default") === "1";
    const item = await uploadTeamResumeOriginal(teamId, user.id, file, setDefault);
    return NextResponse.json(item, { status: 201 });
  });
}
