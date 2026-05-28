import { NextResponse } from "next/server";

import { isValidUsernameFormat, normalizeUsername } from "@/lib/auth/username";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("username, email")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    email: user.email ?? profile?.email ?? null,
    username: profile?.username ?? null,
    locked: Boolean(profile?.username),
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { username?: string };
  const username = normalizeUsername(body.username ?? "");
  if (!username) {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }
  if (!isValidUsernameFormat(username)) {
    return NextResponse.json(
      {
        error:
          "Invalid username format. Use 3-32 lowercase letters, numbers, underscore, or hyphen.",
      },
      { status: 400 },
    );
  }

  const { data: own, error: ownErr } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  if (ownErr) {
    return NextResponse.json({ error: ownErr.message }, { status: 500 });
  }

  const existing = normalizeUsername(own?.username ?? "");
  if (existing && existing !== username) {
    return NextResponse.json(
      {
        error:
          "Username is locked to this account. Contact admin or use a dedicated profile edit flow if enabled.",
      },
      { status: 409 },
    );
  }

  if (!existing) {
    const { data: taken } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .neq("id", user.id)
      .maybeSingle();
    if (taken) {
      return NextResponse.json({ error: "Username is already taken." }, { status: 409 });
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ username })
    .eq("id", user.id);
  if (error) {
    const message = error.code === "23505" ? "Username is already taken." : error.message;
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({ username, locked: true });
}
