import { createHash, randomBytes } from "crypto";

import { createAdminClient } from "@/lib/supabase/admin";

const TOKEN_PREFIX = "jbhm_";

export function generateRawToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
}

export function hashToken(raw: string): string {
  const secret = process.env.APP_CAPTURE_TOKEN_SECRET?.trim();
  if (!secret) {
    throw new Error("APP_CAPTURE_TOKEN_SECRET is not configured");
  }
  return createHash("sha256").update(`${secret}\n${raw}`).digest("hex");
}

export function parseBearerToken(header: string | null): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const raw = header.slice(7).trim();
  if (!raw.startsWith(TOKEN_PREFIX) || raw.length < 20) return null;
  return raw;
}

export async function resolveUserIdFromBearer(
  header: string | null,
): Promise<{ userId: string; tokenId: string; teamId: string } | null> {
  const raw = parseBearerToken(header);
  if (!raw) return null;

  const tokenHash = hashToken(raw);
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("extension_tokens")
    .select("id, user_id, team_id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !data) return null;
  if (!data.team_id) return null;
  return { userId: data.user_id, tokenId: data.id, teamId: data.team_id };
}
