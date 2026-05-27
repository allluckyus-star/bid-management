import { NextResponse } from "next/server";

import { resolveUserIdFromBearer } from "@/lib/auth/extension-token";
import { parseTeamIdFromRequest, requireTeamMember, TeamAccessError } from "@/lib/teams/access";
import { createAdminClient } from "@/lib/supabase/admin";

type Params = { params: Promise<{ teamId: string; exportId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { exportId } = await params;

  try {
    const teamId = parseTeamIdFromRequest(request);
    const bearer = await resolveUserIdFromBearer(request.headers.get("authorization"));
    if (bearer) {
      if (bearer.teamId !== teamId) {
        return NextResponse.json({ error: "Token team mismatch" }, { status: 403 });
      }
    } else {
      await requireTeamMember(teamId);
    }

    const admin = createAdminClient();
    const { data: row } = await admin
      .from("resume_exports")
      .select("storage_path, display_filename")
      .eq("id", exportId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: blob, error } = await admin.storage.from("resumes").download(row.storage_path);
    if (error || !blob) {
      return NextResponse.json({ error: error?.message ?? "Download failed" }, { status: 500 });
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(row.display_filename)}"`,
      },
    });
  } catch (err) {
    if (err instanceof TeamAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Download failed" },
      { status: 500 },
    );
  }
}
