import { NextResponse } from "next/server";

import { withTeamOrExtensionRoute } from "@/lib/api/with-team-or-extension";
import { corsHeaders, optionsResponse } from "@/lib/http/cors";
import { applyManualJdFromSelection } from "@/lib/resumes/jd-selection";

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function POST(request: Request) {
  return withTeamOrExtensionRoute(request, async (ctx) => {
    const body = (await request.json()) as {
      field?: string;
      value?: string;
      page_url?: string;
      captured_by?: string;
    };
    const field = body.field === "name" ? "name" : body.field === "text" ? "text" : null;
    if (!field) {
      return NextResponse.json(
        { error: "field must be name or text" },
        { status: 400, headers: corsHeaders(request) },
      );
    }

    const result = await applyManualJdFromSelection({
      teamId: ctx.teamId,
      userId: ctx.userId,
      field,
      value: String(body.value ?? ""),
      pageUrl: body.page_url ?? null,
      capturedBy: body.captured_by ?? null,
    });

    return NextResponse.json(result, { headers: corsHeaders(request) });
  });
}
