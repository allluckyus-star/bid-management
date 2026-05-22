import { NextResponse } from "next/server";

import { generateRawToken, hashToken } from "@/lib/auth/extension-token";
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

  const { data, error } = await supabase
    .from("extension_tokens")
    .select("id, name, created_at, last_used_at, revoked_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tokens: data ?? [] });
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

  if (!process.env.APP_CAPTURE_TOKEN_SECRET?.trim()) {
    return NextResponse.json(
      { error: "APP_CAPTURE_TOKEN_SECRET is not configured on the server" },
      { status: 503 },
    );
  }

  let name = "Chrome extension";
  try {
    const body = (await request.json()) as { name?: string };
    if (body?.name?.trim()) name = body.name.trim().slice(0, 80);
  } catch {
    /* default name */
  }

  const raw = generateRawToken();
  const tokenHash = hashToken(raw);

  const { data, error } = await supabase
    .from("extension_tokens")
    .insert({
      user_id: user.id,
      token_hash: tokenHash,
      name,
    })
    .select("id, name, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({
    token: raw,
    id: data.id,
    name: data.name,
    created_at: data.created_at,
    message: "Copy this token now — it will not be shown again.",
  });
}
