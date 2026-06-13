import type { SupabaseClient } from "@supabase/supabase-js";

import { isValidUsernameFormat, normalizeUsername } from "@/lib/auth/username";

export type ProfileUsernameRow = {
  id: string;
  username: string;
  created_at: string;
};

const PROFILE_USERNAMES_MIGRATION =
  "Run Supabase migration apps/web/supabase/migrations/016_profile_usernames.sql";

function isMissingProfileUsernamesTable(error: { message?: string; code?: string } | null) {
  const msg = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST205" ||
    (msg.includes("profile_usernames") && msg.includes("schema cache"))
  );
}

export async function listProfileUsernames(
  client: SupabaseClient,
  userId: string,
): Promise<ProfileUsernameRow[]> {
  const { data, error } = await client
    .from("profile_usernames")
    .select("id, username, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingProfileUsernamesTable(error)) return [];
    throw error;
  }
  return (data ?? []) as ProfileUsernameRow[];
}

/** All capture usernames for a user: profile_usernames rows + legacy profiles.username. */
export async function listAllProfileUsernames(
  client: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const rows = await listProfileUsernames(client, userId);
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const n = normalizeUsername(raw);
    if (n && !seen.has(n)) {
      seen.add(n);
      ordered.push(n);
    }
  };
  for (const row of rows) add(row.username);
  const { data: profile } = await client
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  add(profile?.username ?? "");
  return ordered;
}

export async function usernameOwnedByUser(
  admin: SupabaseClient,
  userId: string,
  rawUsername: string,
): Promise<boolean> {
  const username = normalizeUsername(rawUsername);
  if (!username) return false;

  const { data: rows, error } = await admin
    .from("profile_usernames")
    .select("username")
    .eq("user_id", userId);
  if (error) {
    if (!isMissingProfileUsernamesTable(error)) throw error;
  } else {
    const owned = new Set((rows ?? []).map((row) => normalizeUsername(row.username)));
    if (owned.has(username)) return true;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  return normalizeUsername(profile?.username ?? "") === username;
}

export async function addProfileUsername(
  client: SupabaseClient,
  userId: string,
  rawUsername: string,
): Promise<{ username: string } | { error: string; status: number }> {
  const username = normalizeUsername(rawUsername);
  if (!username) {
    return { error: "Username is required.", status: 400 };
  }
  if (!isValidUsernameFormat(username)) {
    return {
      error:
        "Invalid username format. Use 3-32 lowercase letters, numbers, underscore, or hyphen.",
      status: 400,
    };
  }

  const { data: taken, error: takenError } = await client
    .from("profile_usernames")
    .select("id, user_id")
    .eq("username", username)
    .maybeSingle();
  if (takenError && isMissingProfileUsernamesTable(takenError)) {
    return { error: PROFILE_USERNAMES_MIGRATION, status: 503 };
  }
  if (takenError) {
    return { error: takenError.message, status: 500 };
  }
  if (taken && taken.user_id !== userId) {
    return { error: "Username is already taken.", status: 409 };
  }
  if (taken) {
    return { username };
  }

  const { error } = await client.from("profile_usernames").insert({
    user_id: userId,
    username,
  });
  if (error) {
    if (isMissingProfileUsernamesTable(error)) {
      return { error: PROFILE_USERNAMES_MIGRATION, status: 503 };
    }
    const message = error.code === "23505" ? "Username is already taken." : error.message;
    return { error: message, status: 409 };
  }

  const { data: profile } = await client
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  if (!normalizeUsername(profile?.username ?? "")) {
    await client.from("profiles").update({ username }).eq("id", userId);
  }

  return { username };
}

export async function removeProfileUsername(
  client: SupabaseClient,
  userId: string,
  rawUsername: string,
): Promise<{ ok: true } | { error: string; status: number }> {
  const username = normalizeUsername(rawUsername);
  if (!username) {
    return { error: "Username is required.", status: 400 };
  }

  const { data: rows, error: listErr } = await client
    .from("profile_usernames")
    .select("id, username")
    .eq("user_id", userId);
  if (listErr) {
    if (isMissingProfileUsernamesTable(listErr)) {
      return { error: PROFILE_USERNAMES_MIGRATION, status: 503 };
    }
    return { error: listErr.message, status: 500 };
  }

  const match = (rows ?? []).find((row) => normalizeUsername(row.username) === username);
  if (!match) {
    return { error: "Username not found on this account.", status: 404 };
  }

  const { error } = await client.from("profile_usernames").delete().eq("id", match.id);
  if (error) {
    return { error: error.message, status: 500 };
  }

  const remaining = (rows ?? []).filter((row) => row.id !== match.id);
  const { data: profile } = await client
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  const primary = normalizeUsername(profile?.username ?? "");
  if (primary === username) {
    const next = remaining[0]?.username ? normalizeUsername(remaining[0].username) : null;
    await client.from("profiles").update({ username: next }).eq("id", userId);
  }

  return { ok: true };
}
