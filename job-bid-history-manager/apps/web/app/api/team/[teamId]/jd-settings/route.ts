import { NextResponse } from "next/server";

import {
  createManualJdInput,
  getTeamJdSelectionView,
  upsertTeamJdPreference,
  type JdMode,
} from "@/lib/resumes/jd-selection";
import {
  parseTeamIdFromRequest,
  requireAuthUser,
  requireTeamMember,
  TeamAccessError,
} from "@/lib/teams/access";

async function resolveUser(teamId: string) {
  await requireTeamMember(teamId);
  const { user } = await requireAuthUser();
  return user.id;
}

export async function GET(request: Request) {
  try {
    const teamId = parseTeamIdFromRequest(request);
    const userId = await resolveUser(teamId);
    const view = await getTeamJdSelectionView(teamId, userId);
    return NextResponse.json(view);
  } catch (err) {
    if (err instanceof TeamAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load JD settings" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const teamId = parseTeamIdFromRequest(request);
    const userId = await resolveUser(teamId);
    const body = (await request.json()) as {
      mode?: JdMode;
      history_job_id?: string | null;
      manual_input_id?: string | null;
    };
    const mode = body.mode;
    if (mode !== "latest" && mode !== "history" && mode !== "manual") {
      return NextResponse.json({ error: "mode must be latest, history, or manual" }, { status: 400 });
    }
    await upsertTeamJdPreference({
      teamId,
      userId,
      mode,
      historyJobId: body.history_job_id ?? null,
      manualInputId: body.manual_input_id ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof TeamAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update JD settings" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const teamId = parseTeamIdFromRequest(request);
    const userId = await resolveUser(teamId);
    const contentType = request.headers.get("content-type") || "";

    let title = "";
    let text = "";
    let file: File | null = null;
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      title = String(form.get("title") ?? "").trim();
      text = String(form.get("text") ?? "").trim();
      const f = form.get("file");
      file = f instanceof File ? f : null;
    } else {
      const body = (await request.json()) as { title?: string; text?: string };
      title = String(body.title ?? "").trim();
      text = String(body.text ?? "").trim();
    }

    const item = await createManualJdInput({
      teamId,
      userId,
      title,
      text,
      file,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    if (err instanceof TeamAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add manual JD" },
      { status: 400 },
    );
  }
}
