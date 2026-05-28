import { NextResponse } from "next/server";

import { withTeamOrExtensionRoute } from "@/lib/api/with-team-or-extension";
import { corsHeaders, optionsResponse } from "@/lib/http/cors";
import {
  createManualJdInput,
  getTeamJdSelectionView,
  upsertTeamJdPreference,
  type JdMode,
} from "@/lib/resumes/jd-selection";

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function GET(request: Request) {
  return withTeamOrExtensionRoute(request, async (ctx) => {
    const view = await getTeamJdSelectionView(ctx.teamId, ctx.userId);
    return NextResponse.json(view, { headers: corsHeaders(request) });
  });
}

export async function PATCH(request: Request) {
  return withTeamOrExtensionRoute(request, async (ctx) => {
    const body = (await request.json()) as {
      mode?: JdMode;
      history_job_id?: string | null;
      manual_input_id?: string | null;
    };
    const mode = body.mode;
    if (mode !== "latest" && mode !== "history" && mode !== "manual") {
      return NextResponse.json(
        { error: "mode must be latest, history, or manual" },
        { status: 400, headers: corsHeaders(request) },
      );
    }
    await upsertTeamJdPreference({
      teamId: ctx.teamId,
      userId: ctx.userId,
      mode,
      historyJobId: body.history_job_id ?? null,
      manualInputId: body.manual_input_id ?? null,
    });
    return NextResponse.json({ ok: true }, { headers: corsHeaders(request) });
  });
}

export async function POST(request: Request) {
  return withTeamOrExtensionRoute(request, async (ctx) => {
    const contentType = request.headers.get("content-type") || "";

    let title = "";
    let text = "";
    let file: File | null = null;
    let sourceOrigin = "dashboard";
    let pageUrl: string | null = null;
    let localFilePath: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      title = String(form.get("title") ?? "").trim();
      text = String(form.get("text") ?? "").trim();
      const f = form.get("file");
      file = f instanceof File ? f : null;
      sourceOrigin = String(form.get("source_origin") ?? "dashboard").trim() || "dashboard";
      pageUrl = String(form.get("page_url") ?? "").trim() || null;
      localFilePath = String(form.get("local_file_path") ?? "").trim() || null;
    } else {
      const body = (await request.json()) as {
        title?: string;
        text?: string;
        source_origin?: string;
        page_url?: string;
        local_file_path?: string;
      };
      title = String(body.title ?? "").trim();
      text = String(body.text ?? "").trim();
      sourceOrigin = String(body.source_origin ?? "dashboard").trim() || "dashboard";
      pageUrl = String(body.page_url ?? "").trim() || null;
      localFilePath = String(body.local_file_path ?? "").trim() || null;
    }

    const origin =
      sourceOrigin === "extension"
        ? "extension"
        : sourceOrigin === "page_selection"
          ? "page_selection"
          : sourceOrigin === "upload"
            ? "upload"
            : "dashboard";

    const item = await createManualJdInput({
      teamId: ctx.teamId,
      userId: ctx.userId,
      title,
      text,
      file,
      origin,
      pageUrl,
      localFilePath: localFilePath || (file?.name ? file.name : null),
    });
    return NextResponse.json({ item }, { status: 201, headers: corsHeaders(request) });
  });
}
