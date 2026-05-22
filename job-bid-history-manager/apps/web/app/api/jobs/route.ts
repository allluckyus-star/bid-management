import { NextResponse } from "next/server";

import { listJobs } from "@/lib/jobs/list-jobs";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getUser();

  if (authError || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("page_size") ?? "50");

  try {
    const result = await listJobs({ page, pageSize });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load jobs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
