import { resolveUserIdFromBearer } from "@/lib/auth/extension-token";
import { getExtensionMeForUser } from "@/lib/auth/extension-identity";
import { jsonWithCors, optionsResponse } from "@/lib/http/cors";
import { hasServiceRoleKey } from "@/lib/supabase/admin";

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function GET(request: Request) {
  if (!hasServiceRoleKey()) {
    return jsonWithCors(
      request,
      { error: "Server missing SUPABASE_SERVICE_ROLE_KEY" },
      503,
    );
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

  try {
    const me = await getExtensionMeForUser(tokenUser.userId);
    return jsonWithCors(request, {
      connected: true,
      ...me,
      team_id: tokenUser.teamId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load profile";
    return jsonWithCors(request, { error: msg }, 500);
  }
}
