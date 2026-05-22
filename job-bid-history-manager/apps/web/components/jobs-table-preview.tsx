import type { JobListItem } from "@jbhm/shared";

type Props = {
  items: JobListItem[];
  total: number;
};

export function JobsTablePreview({ items, total }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No jobs yet. Phase 2 will add Chrome extension capture to this shared board.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Shared team board · {total} job{total === 1 ? "" : "s"}
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Captured</th>
              <th className="px-3 py-2">By</th>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Salary</th>
              <th className="px-3 py-2">Tags</th>
              <th className="px-3 py-2">JD</th>
            </tr>
          </thead>
          <tbody>
            {items.map((job) => (
              <tr key={job.id} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">
                  {new Date(job.captured_at).toLocaleString()}
                </td>
                <td className="px-3 py-2">{job.captured_by || "—"}</td>
                <td className="px-3 py-2">{job.company_name || "—"}</td>
                <td className="px-3 py-2">{job.job_title || "—"}</td>
                <td className="px-3 py-2">{job.location || "—"}</td>
                <td className="px-3 py-2">{job.salary_text || "—"}</td>
                <td className="px-3 py-2">
                  {job.tags.length
                    ? job.tags.map((t) => t.name).join(", ")
                    : "—"}
                </td>
                <td className="px-3 py-2">{job.has_jd ? "Yes" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
