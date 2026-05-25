import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { requireAuthUser } from "@/lib/teams/access";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string; tagId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id: jobId, tagId } = await params;
  return withTeamRoute(request, async () => {
    const { supabase, user } = await requireAuthUser();
    const { error } = await supabase.from("job_tags").upsert({
      job_id: jobId,
      tag_id: tagId,
      user_id: user.id,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return new NextResponse(null, { status: 204 });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const { id: jobId, tagId } = await params;
  return withTeamRoute(request, async () => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("job_tags")
      .delete()
      .eq("job_id", jobId)
      .eq("tag_id", tagId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return new NextResponse(null, { status: 204 });
  });
}
