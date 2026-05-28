import type { SupabaseClient } from "@supabase/supabase-js";

export function normalizeUsername(input: string): string {
  return String(input ?? "").trim().toLowerCase();
}

export function isValidUsernameFormat(username: string): boolean {
  return /^[a-z0-9_-]{3,32}$/.test(username);
}

export async function resolveValidatedUsernameForToken(
  admin: SupabaseClient,
  userId: string,
  rawUsername: string,
): Promise<
  | { ok: true; username: string; email: string | null }
  | { ok: false; status: 400 | 403 | 404; error: string }
> {
  const username = normalizeUsername(rawUsername);
  if (!username) {
    return { ok: false, status: 400, error: "Username is required." };
  }
  if (!isValidUsernameFormat(username)) {
    return {
      ok: false,
      status: 400,
      error:
        "Invalid username format. Use 3-32 lowercase letters, numbers, underscore, or hyphen.",
    };
  }

  const { data: own, error: ownErr } = await admin
    .from("profiles")
    .select("id, username, email")
    .eq("id", userId)
    .maybeSingle();
  if (ownErr) {
    return { ok: false, status: 403, error: "Unable to validate username for this account." };
  }
  if (!own) {
    return { ok: false, status: 403, error: "Profile not found for token owner." };
  }

  const current = normalizeUsername(own.username ?? "");
  if (!current) {
    return {
      ok: false,
      status: 403,
      error:
        "No username is registered for this account. Register your username in the web dashboard first.",
    };
  }
  if (current !== username) {
    return {
      ok: false,
      status: 403,
      error:
        "Username is not registered for this account. Update extension settings with your registered username.",
    };
  }

  const { data: ownerByUsername } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (!ownerByUsername) {
    return {
      ok: false,
      status: 404,
      error: "Username is not registered for this account.",
    };
  }
  if (ownerByUsername.id !== userId) {
    return {
      ok: false,
      status: 403,
      error: "Username is not registered for this account.",
    };
  }

  return { ok: true, username, email: own.email ?? null };
}
