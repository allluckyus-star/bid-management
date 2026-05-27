import { NextResponse } from "next/server";

import { resolveUserIdFromBearer } from "@/lib/auth/extension-token";
import { createResumeOptimization } from "@/lib/resumes/optimization";
import { parseTeamIdFromRequest, requireAuthUser, requireTeamMember, TeamAccessError } from "@/lib/teams/access";
import { hasServiceRoleKey } from "@/lib/supabase/admin";

type Params = { params: Promise<{ teamId: string; jobId: string }> };

async function resolveUser(request: Request, teamId: string): Promise<string> {
  const bearer = await resolveUserIdFromBearer(request.headers.get("authorization"));
  if (bearer) {
    if (bearer.teamId !== teamId) throw new Error("Token team does not match request team");
    return bearer.userId;
  }
  await requireTeamMember(teamId);
  const { user } = await requireAuthUser();
  return user.id;
}

export async function POST(request: Request, { params }: Params) {
  const { jobId } = await params;

  try {
    if (!hasServiceRoleKey()) {
      return NextResponse.json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
    }

    const teamId = parseTeamIdFromRequest(request);
    const userId = await resolveUser(request, teamId);

    let libraryResumeId: string | null = null;
    let promptPrefix: string | null = null;
    try {
      const body = (await request.json()) as {
        library_resume_id?: string;
        prompt_prefix?: string;
      };
      libraryResumeId = body.library_resume_id ?? null;
      promptPrefix = body.prompt_prefix ?? null;
    } catch {
      /* empty body ok */
    }

    const result = await createResumeOptimization(
      teamId,
      userId,
      jobId,
      libraryResumeId,
      promptPrefix,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof TeamAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 },
    );
  }
}
