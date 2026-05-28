import { resolveUserIdFromBearer } from "@/lib/auth/extension-token";
import { resolveValidatedUsernameForToken } from "@/lib/auth/username";
import { jsonWithCors, optionsResponse } from "@/lib/http/cors";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function POST(request: Request) {
  if (!hasServiceRoleKey()) {
    return jsonWithCors(request, { error: "Server missing SUPABASE_SERVICE_ROLE_KEY" }, 503);
  }

  let tokenUser: { userId: string; tokenId: string; teamId: string } | null = null;
  try {
    tokenUser = await resolveUserIdFromBearer(request.headers.get("authorization"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token configuration error";
    return jsonWithCors(request, { error: msg }, 503);
  }
  if (!tokenUser) {
    return jsonWithCors(request, { error: "Invalid or revoked capture token" }, 401);
  }

  const body = (await request.json().catch(() => ({}))) as { username?: string };
  const admin = createAdminClient();
  const check = await resolveValidatedUsernameForToken(admin, tokenUser.userId, body.username ?? "");
  if (!check.ok) {
    return jsonWithCors(request, { error: check.error }, check.status);
  }

  return jsonWithCors(request, {
    ok: true,
    username: check.username,
    team_id: tokenUser.teamId,
    email: check.email,
  });
}
