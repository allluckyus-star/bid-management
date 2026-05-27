import { resolveUserIdFromBearer } from "@/lib/auth/extension-token";
import { jsonWithCors, optionsResponse } from "@/lib/http/cors";
import { processGptOptimizationResult } from "@/lib/resumes/optimization";
import {
  parseTeamIdFromRequest,
  requireAuthUser,
  requireTeamMember,
  TeamAccessError,
} from "@/lib/teams/access";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";

type Params = { params: Promise<{ teamId: string; optimizationId: string }> };

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}

async function readGptText(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { text?: string; gpt_result?: string };
    return String(body.text ?? body.gpt_result ?? "").trim();
  }
  return (await request.text()).trim();
}

async function resolveAuth(request: Request): Promise<{
  userId: string;
  teamId: string;
  viaExtension: boolean;
}> {
  const teamId = parseTeamIdFromRequest(request);
  const bearer = await resolveUserIdFromBearer(request.headers.get("authorization"));
  if (bearer) {
    if (bearer.teamId !== teamId) throw new Error("Token team does not match request team");
    return { userId: bearer.userId, teamId, viaExtension: true };
  }
  await requireTeamMember(teamId);
  const { user } = await requireAuthUser();
  return { userId: user.id, teamId, viaExtension: false };
}

export async function POST(request: Request, { params }: Params) {
  const { optimizationId } = await params;

  try {
    if (!hasServiceRoleKey()) {
      return jsonWithCors(request, { error: "Server missing SUPABASE_SERVICE_ROLE_KEY" }, 503);
    }

    const ctx = await resolveAuth(request);
    const text = await readGptText(request);
    if (!text) {
      return jsonWithCors(request, { error: "GPT result is empty" }, 400);
    }

    const result = await processGptOptimizationResult(
      ctx.teamId,
      ctx.userId,
      optimizationId,
      text,
    );

    if (ctx.viaExtension) {
      const admin = createAdminClient();
      await admin
        .from("extension_tokens")
        .update({ last_used_at: new Date().toISOString() })
        .eq("user_id", ctx.userId)
        .eq("team_id", ctx.teamId)
        .is("revoked_at", null);
    }

    return jsonWithCors(request, {
      status: "ok",
      export_id: result.export_id,
      display_filename: result.display_filename,
      download_url: result.download_path,
      job_id: result.job_id,
    });
  } catch (err) {
    if (err instanceof TeamAccessError) {
      return jsonWithCors(request, { error: err.message }, err.status);
    }

    const msg = err instanceof Error ? err.message : "Failed to process GPT result";
    try {
      const teamId = parseTeamIdFromRequest(request);
      const admin = createAdminClient();
      await admin
        .from("resume_optimizations")
        .update({
          status: "failed",
          error_message: msg.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", optimizationId)
        .eq("team_id", teamId);
    } catch {
      /* ignore */
    }
    return jsonWithCors(request, { error: msg }, 400);
  }
}
