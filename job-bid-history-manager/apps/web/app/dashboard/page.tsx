import { redirect } from "next/navigation";

import { ExtensionTokensPanel } from "@/components/extension-tokens-panel";
import { JobsTablePreview } from "@/components/jobs-table-preview";
import { listJobs } from "@/lib/jobs/list-jobs";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/auth/login");
  }

  let jobs;
  let loadError: string | null = null;

  try {
    jobs = await listJobs({ page: 1, pageSize: 50 });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load jobs";
    jobs = { items: [], total: 0, page: 1, page_size: 50 };
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bid history</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Shared team board — all signed-in users see the same jobs.
        </p>
      </div>

      <ExtensionTokensPanel />

      {loadError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <p className="font-medium">Database not ready</p>
          <p className="mt-1 text-muted-foreground">{loadError}</p>
          <p className="mt-2 text-muted-foreground">
            Run{" "}
            <code className="rounded bg-muted px-1">
              apps/web/supabase/migrations/001_jbhm_shared_team.sql
            </code>{" "}
            in your Supabase SQL editor, then refresh.
          </p>
        </div>
      ) : null}

      <JobsTablePreview items={jobs.items} total={jobs.total} />
    </div>
  );
}
