import { resolveUserIdFromBearer } from "@/lib/auth/extension-token";
import { getExtensionMeForUser } from "@/lib/auth/extension-identity";
import { jsonWithCors, optionsResponse } from "@/lib/http/cors";
import { logRouteTiming } from "@/lib/http/log-route-timing";
import { hasServiceRoleKey } from "@/lib/supabase/admin";

const ROUTE = "/api/extension/me";

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function GET(request: Request) {
  const routeStart = Date.now();
  logRouteTiming(ROUTE, "start", routeStart);

  if (!hasServiceRoleKey()) {
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(
      request,
      { error: "Server missing SUPABASE_SERVICE_ROLE_KEY" },
      503,
    );
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

  try {
    const profileStep = Date.now();
    const me = await getExtensionMeForUser(tokenUser.userId);
    logRouteTiming(ROUTE, "profile_loaded", profileStep, { success: true });
    logRouteTiming(ROUTE, "done", routeStart, { success: true });
    return jsonWithCors(request, {
      connected: true,
      ...me,
      team_id: tokenUser.teamId,
      dashboard_url: "/dashboard",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load profile";
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(request, { error: msg }, 500);
  }
}
