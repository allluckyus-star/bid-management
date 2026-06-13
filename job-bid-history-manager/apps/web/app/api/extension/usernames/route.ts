import { resolveUserIdFromBearer } from "@/lib/auth/extension-token";
import { listAllProfileUsernames } from "@/lib/auth/profile-usernames";
import { jsonWithCors, optionsResponse } from "@/lib/http/cors";
import { logRouteTiming } from "@/lib/http/log-route-timing";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";

const ROUTE = "/api/extension/usernames";

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function GET(request: Request) {
  const routeStart = Date.now();
  logRouteTiming(ROUTE, "start", routeStart);

  if (!hasServiceRoleKey()) {
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(request, { error: "Server missing SUPABASE_SERVICE_ROLE_KEY" }, 503);
  }

  let tokenUser: { userId: string; tokenId: string; teamId: string } | null = null;
  try {
    tokenUser = await resolveUserIdFromBearer(request.headers.get("authorization"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token configuration error";
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(request, { error: msg }, 503);
  }
  if (!tokenUser) {
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(request, { error: "Invalid or revoked capture token" }, 401);
  }

  try {
    const admin = createAdminClient();
    const usernames = await listAllProfileUsernames(admin, tokenUser.userId);
    logRouteTiming(ROUTE, "done", routeStart, { success: true, count: usernames.length });
    return jsonWithCors(request, {
      ok: true,
      usernames,
      team_id: tokenUser.teamId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load usernames";
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(request, { error: msg }, 500);
  }
}
