import { resolveUserIdFromBearer } from "@/lib/auth/extension-token";
import { getExtensionMeForUser } from "@/lib/auth/extension-identity";
import { corsHeaders, optionsResponse } from "@/lib/http/cors";
import { exportOptimizedResumeToDocxBuffer } from "@/lib/resumes/docx-export";
import { buildExportFilename } from "@/lib/resumes/filename";
import { parseGptResultText } from "@/lib/resumes/gpt-result-parse";
import {
  parseTeamIdFromRequest,
  requireAuthUser,
  requireTeamMember,
  TeamAccessError,
} from "@/lib/teams/access";
import { hasServiceRoleKey } from "@/lib/supabase/admin";

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

/** Stateless DOCX render for Manual JD mode — does not write optimizations, exports, or job links. */
export async function POST(request: Request) {
  try {
    if (!hasServiceRoleKey()) {
      return new Response(JSON.stringify({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY" }), {
        status: 503,
        headers: { "Content-Type": "application/json", ...corsHeaders(request) },
      });
    }

    const teamId = parseTeamIdFromRequest(request);
    const userId = await resolveUser(request, teamId);

    const body = (await request.json()) as { text?: string; jd_label?: string };
    const text = String(body.text ?? "").trim();
    if (!text) {
      return new Response(JSON.stringify({ error: "text is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(request) },
      });
    }

    const parsed = parseGptResultText(text);
    const docxBuffer = await exportOptimizedResumeToDocxBuffer(parsed.optimized_resume);

    const me = await getExtensionMeForUser(userId);
    const jdLabel = String(body.jd_label ?? "Manual JD").trim() || "Manual JD";
    const filename = buildExportFilename({
      userName: me.display_name || me.email || "Resume",
      companyName: "Manual",
      jobTitle: jdLabel.slice(0, 80),
    });

    return new Response(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        ...corsHeaders(request),
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "X-JBHM-Filename": filename,
      },
    });
  } catch (err) {
    if (err instanceof TeamAccessError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { "Content-Type": "application/json", ...corsHeaders(request) },
      });
    }
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Failed to render DOCX",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(request) },
      },
    );
  }
}
