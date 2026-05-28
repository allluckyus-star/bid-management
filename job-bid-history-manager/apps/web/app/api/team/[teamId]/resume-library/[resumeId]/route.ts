import { NextResponse } from "next/server";

import { withTeamOrExtensionRoute } from "@/lib/api/with-team-or-extension";
import { corsHeaders, optionsResponse } from "@/lib/http/cors";
import { deleteLibraryResume, setDefaultLibraryResume } from "@/lib/resumes/library";

type Params = { params: Promise<{ teamId: string; resumeId: string }> };

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function PATCH(request: Request, { params }: Params) {
  const { teamId: pathTeamId, resumeId } = await params;
  return withTeamOrExtensionRoute(request, async (ctx) => {
    if (ctx.teamId !== pathTeamId) {
      return NextResponse.json(
        { error: "Team mismatch" },
        { status: 400, headers: corsHeaders(request) },
      );
    }
    const body = (await request.json()) as { is_default?: boolean };
    if (body.is_default) {
      await setDefaultLibraryResume(ctx.teamId, ctx.userId, resumeId);
    }
    return NextResponse.json({ ok: true }, { headers: corsHeaders(request) });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const { teamId: pathTeamId, resumeId } = await params;
  return withTeamOrExtensionRoute(request, async (ctx) => {
    if (ctx.teamId !== pathTeamId) {
      return NextResponse.json(
        { error: "Team mismatch" },
        { status: 400, headers: corsHeaders(request) },
      );
    }
    await deleteLibraryResume(ctx.teamId, ctx.userId, resumeId);
    return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
  });
}
