import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id: jobId } = await params;
  return withTeamRoute(request, async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("job_descriptions")
      .select("cleaned_text, extracted_json, extracted_at, model_name, confidence")
      .eq("job_id", jobId)
      .order("extracted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Job description not found" }, { status: 404 });

    return NextResponse.json({
      cleaned_text: data.cleaned_text,
      extracted_json: data.extracted_json,
      extracted_at: data.extracted_at,
      model_name: data.model_name,
    });
  });
}
