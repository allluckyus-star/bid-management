import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string; tagId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id: jobId, tagId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase.from("job_tags").upsert({
    job_id: jobId,
    tag_id: tagId,
    user_id: user.id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id: jobId, tagId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("job_tags")
    .delete()
    .eq("job_id", jobId)
    .eq("tag_id", tagId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
