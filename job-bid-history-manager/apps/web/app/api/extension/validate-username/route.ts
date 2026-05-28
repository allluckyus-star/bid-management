import { resolveUserIdFromBearer } from "@/lib/auth/extension-token";
import { resolveValidatedUsernameForToken } from "@/lib/auth/username";
import { jsonWithCors, optionsResponse } from "@/lib/http/cors";
import { logRouteTiming } from "@/lib/http/log-route-timing";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";

const ROUTE = "/api/extension/validate-username";

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function POST(request: Request) {
  const routeStart = Date.now();
  logRouteTiming(ROUTE, "start", routeStart);

  if (!hasServiceRoleKey()) {
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(request, { error: "Server missing SUPABASE_SERVICE_ROLE_KEY" }, 503);
  }

  const tokenStep = Date.now();
  let tokenUser: { userId: string; tokenId: string; teamId: string } | null = null;
  try {
    tokenUser = await resolveUserIdFromBearer(request.headers.get("authorization"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token configuration error";
    logRouteTiming(ROUTE, "token_validated", tokenStep, { success: false });
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(request, { error: msg }, 503);
  }
  if (!tokenUser) {
    logRouteTiming(ROUTE, "token_validated", tokenStep, { success: false });
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(request, { error: "Invalid or revoked capture token" }, 401);
  }
  logRouteTiming(ROUTE, "token_validated", tokenStep, { success: true });

  const body = (await request.json().catch(() => ({}))) as { username?: string };
  const admin = createAdminClient();
  const validateStep = Date.now();
  const check = await resolveValidatedUsernameForToken(admin, tokenUser.userId, body.username ?? "");
  if (!check.ok) {
    logRouteTiming(ROUTE, "username_validated", validateStep, { success: false });
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(request, { error: check.error }, check.status);
  }

  logRouteTiming(ROUTE, "username_validated", validateStep, { success: true });
  logRouteTiming(ROUTE, "done", routeStart, { success: true });

  return jsonWithCors(request, {
    ok: true,
    username: check.username,
    team_id: tokenUser.teamId,
  });
}
