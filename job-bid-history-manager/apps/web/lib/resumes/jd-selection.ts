import { createAdminClient } from "@/lib/supabase/admin";

function isMissingRelationError(error: { message?: string; code?: string } | null) {
  const msg = String(error?.message ?? "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("could not find the table")
  );
}

async function extractDocxText(bytes: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const parsed = await mammoth.extractRawText({ buffer: bytes });
  return String(parsed.value ?? "").trim();
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: bytes });
  try {
    const parsed = await parser.getText();
    return String(parsed.text ?? "").trim();
  } finally {
    await parser.destroy();
  }
}

export type JdMode = "latest" | "history" | "manual";

export type JdSelectionResolved =
  | { mode: "manual"; jdText: string; jobId: null; label: string }
  | { mode: "latest" | "history"; jdText: string; jobId: string; label: string };

export async function upsertTeamJdPreference(input: {
  teamId: string;
  userId: string;
  mode: JdMode;
  historyJobId?: string | null;
  manualInputId?: string | null;
}) {
  const admin = createAdminClient();
  const payload = {
    mode: input.mode,
    history_job_id: input.historyJobId ?? null,
    manual_input_id: input.manualInputId ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: readErr } = await admin
    .from("team_jd_preferences")
    .select("id")
    .eq("team_id", input.teamId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);

  if (existing?.id) {
    const { error } = await admin.from("team_jd_preferences").update(payload).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await admin.from("team_jd_preferences").insert({
    team_id: input.teamId,
    user_id: input.userId,
    ...payload,
  });
  if (error) throw new Error(error.message);
}

export async function createManualJdInput(input: {
  teamId: string;
  userId: string;
  title?: string | null;
  text?: string | null;
  file?: File | null;
}) {
  const admin = createAdminClient();
  let extractedText = String(input.text ?? "").trim();
  let sourceType: "text" | "docx" | "pdf" = "text";
  let originalFilename: string | null = null;
  let mimeType: string | null = null;
  let storagePath: string | null = null;

  if (input.file) {
    const file = input.file;
    const filename = String(file.name || "").trim();
    const lower = filename.toLowerCase();
    const bytes = Buffer.from(await file.arrayBuffer());
    originalFilename = filename || null;
    mimeType = file.type || null;

    if (lower.endsWith(".docx")) {
      sourceType = "docx";
      extractedText = await extractDocxText(bytes);
    } else if (lower.endsWith(".pdf")) {
      sourceType = "pdf";
      extractedText = await extractPdfText(bytes);
    } else {
      throw new Error("Only .docx or .pdf files are supported for JD upload.");
    }

    const id = crypto.randomUUID();
    storagePath = `${input.teamId}/jd-manual/${id}-${filename || "jd-source"}`;
    const { error: upErr } = await admin.storage.from("resumes").upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
    if (upErr) throw new Error(upErr.message);
  }

  if (!extractedText) {
    throw new Error("No JD text found. Paste text or upload a readable .docx/.pdf file.");
  }

  const { data, error } = await admin
    .from("team_jd_manual_inputs")
    .insert({
      team_id: input.teamId,
      user_id: input.userId,
      source_type: sourceType,
      title: String(input.title ?? "").trim() || null,
      original_filename: originalFilename,
      mime_type: mimeType,
      storage_path: storagePath,
      extracted_text: extractedText.slice(0, 500000),
    })
    .select("id, source_type, title, original_filename, created_at")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getTeamJdSelectionView(teamId: string, userId: string) {
  const admin = createAdminClient();
  const { data: pref } = await admin
    .from("team_jd_preferences")
    .select("mode, history_job_id, manual_input_id, updated_at")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();

  const { data: manualItems, error: manualErr } = await admin
    .from("team_jd_manual_inputs")
    .select("id, source_type, title, original_filename, created_at")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (manualErr) throw new Error(manualErr.message);

  const { data: jobs, error: jobsErr } = await admin
    .from("jobs")
    .select("id, company_name, job_title, captured_by, captured_at")
    .eq("team_id", teamId)
    .is("deleted_at", null)
    .order("captured_at", { ascending: false })
    .limit(100);
  if (jobsErr) throw new Error(jobsErr.message);

  const jobIds = (jobs ?? []).map((j) => j.id);
  let jdByJobId: Record<string, string> = {};
  if (jobIds.length) {
    const { data: jds } = await admin
      .from("job_descriptions")
      .select("job_id, cleaned_text, extracted_at")
      .eq("team_id", teamId)
      .in("job_id", jobIds)
      .order("extracted_at", { ascending: false });
    for (const row of jds ?? []) {
      if (!jdByJobId[row.job_id]) {
        jdByJobId[row.job_id] = String(row.cleaned_text ?? "");
      }
    }
  }

  return {
    selection: {
      mode: (pref?.mode as JdMode | undefined) ?? "latest",
      history_job_id: pref?.history_job_id ?? null,
      manual_input_id: pref?.manual_input_id ?? null,
      updated_at: pref?.updated_at ?? null,
    },
    manual_items: (manualItems ?? []).map((x) => ({
      ...x,
      label: x.title || x.original_filename || `${x.source_type.toUpperCase()} JD`,
    })),
    history_items: (jobs ?? []).map((j) => ({
      id: j.id,
      company_name: j.company_name,
      captured_by: j.captured_by,
      job_title: j.job_title,
      captured_at: j.captured_at,
      jd_preview: String(jdByJobId[j.id] ?? "").slice(0, 200),
      has_jd: Boolean(String(jdByJobId[j.id] ?? "").trim()),
    })),
  };
}

export async function resolveJdSourceForPrompt(teamId: string, userId: string): Promise<JdSelectionResolved> {
  const admin = createAdminClient();
  const { data: pref, error: prefError } = await admin
    .from("team_jd_preferences")
    .select("mode, history_job_id, manual_input_id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();

  if (prefError) {
    if (!isMissingRelationError(prefError)) {
      throw new Error(prefError.message);
    }
    throw new Error(
      "JD settings tables are missing. Run Supabase migration 009_jd_source_selection.sql on production.",
    );
  }

  const mode = (pref?.mode as JdMode | undefined) ?? "latest";
  if (mode === "manual") {
    if (!pref?.manual_input_id) throw new Error("No manual JD selected.");
    const { data: manual } = await admin
      .from("team_jd_manual_inputs")
      .select("id, extracted_text, title, original_filename")
      .eq("id", pref.manual_input_id)
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .maybeSingle();
    const jdText = String(manual?.extracted_text ?? "").trim();
    if (!jdText) throw new Error("Selected manual JD is empty.");
    return {
      mode: "manual",
      jdText,
      jobId: null,
      label: manual?.title || manual?.original_filename || "Manual JD",
    };
  }

  let jobId = pref?.history_job_id ?? null;
  if (mode === "latest" || !jobId) {
    const { data: latest } = await admin
      .from("jobs")
      .select("id")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    jobId = latest?.id ?? null;
  }
  if (!jobId) throw new Error("No captured job found for JD source.");

  const { data: jd } = await admin
    .from("job_descriptions")
    .select("cleaned_text")
    .eq("team_id", teamId)
    .eq("job_id", jobId)
    .order("extracted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const jdText = String(jd?.cleaned_text ?? "").trim();
  if (!jdText) throw new Error("Selected JD history row has no cleaned JD text.");

  return {
    mode: mode === "history" ? "history" : "latest",
    jdText,
    jobId,
    label: mode === "history" ? "JD history" : "Latest captured JD",
  };
}
