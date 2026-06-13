import { NextResponse } from "next/server";

import {
  addProfileUsername,
  listAllProfileUsernames,
  removeProfileUsername,
} from "@/lib/auth/profile-usernames";
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

  try {
    const usernames = await listAllProfileUsernames(supabase, user.id);
    return NextResponse.json({
      email: user.email ?? null,
      usernames,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load usernames.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { username?: string };
  const result = await addProfileUsername(supabase, user.id, body.username ?? "");
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const usernames = await listAllProfileUsernames(supabase, user.id);
  return NextResponse.json({
    username: result.username,
    usernames,
  });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { username?: string };
  const result = await removeProfileUsername(supabase, user.id, body.username ?? "");
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const usernames = await listAllProfileUsernames(supabase, user.id);
  return NextResponse.json({ usernames });
}
