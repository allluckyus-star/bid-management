import { resolveUserIdFromBearer } from "@/lib/auth/extension-token";
import { jsonWithCors, optionsResponse } from "@/lib/http/cors";
import { createResumeOptimization } from "@/lib/resumes/optimization";
import { resolveJdSourceForPrompt } from "@/lib/resumes/jd-selection";
import {
  parseTeamIdFromRequest,
  requireAuthUser,
  requireTeamMember,
  TeamAccessError,
} from "@/lib/teams/access";
import { hasServiceRoleKey } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}

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

export async function POST(request: Request) {
  try {
    if (!hasServiceRoleKey()) {
      return jsonWithCors(request, { error: "Server missing SUPABASE_SERVICE_ROLE_KEY" }, 503);
    }

    const teamId = parseTeamIdFromRequest(request);
    const userId = await resolveUser(request, teamId);

    let body: { job_id?: string; prompt_prefix?: string; library_resume_id?: string } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      /* empty body ok */
    }

    const jdSource = await resolveJdSourceForPrompt(teamId, userId);
    if (jdSource.mode === "manual") {
      if (!jdSource.jobId) {
        return jsonWithCors(
          request,
          {
            error:
              "Manual JD is too short to add to bid history. Paste at least ~40 characters, then save.",
          },
          400,
        );
      }

      const result = await createResumeOptimization(
        teamId,
        userId,
        jdSource.jobId,
        body.library_resume_id ?? null,
        body.prompt_prefix ?? null,
      );

      return jsonWithCors(request, {
        optimization_id: result.optimization_id,
        prompt_text: result.prompt_text,
        job_id: jdSource.jobId,
        jd_mode: "manual",
        manual_only: false,
        jd_label: jdSource.label,
      });
    }

    const effectiveJobId = jdSource.jobId || String(body.job_id ?? "").trim();
    if (!effectiveJobId) {
      return jsonWithCors(
        request,
        { error: "No captured job found. Capture a job page first (extension or dashboard)." },
        400,
      );
    }

    const result = await createResumeOptimization(
      teamId,
      userId,
      effectiveJobId,
      body.library_resume_id ?? null,
      body.prompt_prefix ?? null,
    );

    return jsonWithCors(request, {
      optimization_id: result.optimization_id,
      prompt_text: result.prompt_text,
      job_id: effectiveJobId,
      jd_mode: jdSource.mode,
      manual_only: false,
    });
  } catch (err) {
    if (err instanceof TeamAccessError) {
      return jsonWithCors(request, { error: err.message }, err.status);
    }
    const message = err instanceof Error ? err.message : "Failed to build prompt";
    console.error("[chatgpt-prompt]", message, err);
    return jsonWithCors(request, { error: message }, 400);
  }
}
