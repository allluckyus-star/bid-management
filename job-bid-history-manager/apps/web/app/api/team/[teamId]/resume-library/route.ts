import { NextResponse } from "next/server";

import { withTeamOrExtensionRoute } from "@/lib/api/with-team-or-extension";
import { corsHeaders, optionsResponse } from "@/lib/http/cors";
import { listTeamResumeLibrary, uploadTeamResumeOriginal } from "@/lib/resumes/library";

type Params = { params: Promise<{ teamId: string }> };

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function GET(request: Request, { params }: Params) {
  const { teamId: pathTeamId } = await params;
  return withTeamOrExtensionRoute(request, async (ctx) => {
    if (ctx.teamId !== pathTeamId) {
      return NextResponse.json(
        { error: "Team mismatch" },
        { status: 400, headers: corsHeaders(request) },
      );
    }
    const items = await listTeamResumeLibrary(ctx.teamId, ctx.userId);
    return NextResponse.json({ items }, { headers: corsHeaders(request) });
  });
}

export async function POST(request: Request, { params }: Params) {
  const { teamId: pathTeamId } = await params;
  return withTeamOrExtensionRoute(request, async (ctx) => {
    if (ctx.teamId !== pathTeamId) {
      return NextResponse.json(
        { error: "Team mismatch" },
        { status: 400, headers: corsHeaders(request) },
      );
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "file required" },
        { status: 400, headers: corsHeaders(request) },
      );
    }
    const setDefault = form.get("set_default") === "true" || form.get("set_default") === "1";
    const item = await uploadTeamResumeOriginal(ctx.teamId, ctx.userId, file, setDefault);
    return NextResponse.json(item, { status: 201, headers: corsHeaders(request) });
  });
}
