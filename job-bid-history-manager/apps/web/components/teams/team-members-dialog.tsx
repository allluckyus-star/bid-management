"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addTeamMemberByEmail,
  approveJoinRequestAsOwner,
  fetchTeamMembers,
  rejectJoinRequest,
  removeTeamMember,
  renameTeam,
  updateTeamTimezone,
  type TeamMembersResponse,
} from "@/lib/api/client";
import { TEAM_TIMEZONE_OPTIONS } from "@/lib/datetime/timezone-options";

type Props = {
  teamId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TeamMembersDialog({ teamId, open, onOpenChange }: Props) {
  const router = useRouter();
  const [data, setData] = useState<TeamMembersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rename, setRename] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [addEmail, setAddEmail] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchTeamMembers(teamId);
      setData(res);
      setRename(res.team_name);
      setTimezone(res.timezone);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleRemove = async (userId: string) => {
    if (!confirm("Remove this member from the team?")) return;
    setBusy(true);
    try {
      await removeTeamMember(teamId, userId);
      toast.success("Member removed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    setBusy(true);
    try {
      await approveJoinRequestAsOwner(requestId);
      toast.success("Member approved");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (requestId: string) => {
    setBusy(true);
    try {
      await rejectJoinRequest(requestId);
      toast.success("Request rejected");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async () => {
    const name = rename.trim();
    if (!name) return;
    setBusy(true);
    try {
      await renameTeam(teamId, name);
      toast.success("Team renamed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  };

  const handleTimezoneSave = async () => {
    setBusy(true);
    try {
      await updateTeamTimezone(teamId, timezone);
      toast.success("Team timezone updated");
      router.refresh();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Timezone update failed");
    } finally {
      setBusy(false);
    }
  };

  const handleAddMember = async () => {
    const email = addEmail.trim();
    if (!email) return;
    setBusy(true);
    try {
      const res = await addTeamMemberByEmail(teamId, email);
      toast.success(res.message ?? "Member added");
      setAddEmail("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add member");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Team members</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : data ? (
          <div className="space-y-6">
            {data.is_owner ? (
              <div className="space-y-2 rounded-md border p-3">
                <Label htmlFor="team-rename">Team name</Label>
                <div className="flex gap-2">
                  <Input
                    id="team-rename"
                    value={rename}
                    onChange={(e) => setRename(e.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={busy || rename.trim() === data.team_name}
                    onClick={() => void handleRename()}
                  >
                    Save
                  </Button>
                </div>
                <div className="space-y-2 pt-2 border-t">
                  <Label htmlFor="team-timezone">Team timezone</Label>
                  <p className="text-xs text-muted-foreground">
                    Table dates, chart buckets, and date filters use this timezone for everyone on
                    the team.
                  </p>
                  <div className="flex gap-2">
                    <select
                      id="team-timezone"
                      className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                    >
                      {TEAM_TIMEZONE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label} ({opt.value})
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      disabled={busy || timezone === data.timezone}
                      onClick={() => void handleTimezoneSave()}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Team: <strong>{data.team_name}</strong>
                <span className="block text-xs">Timezone: {data.timezone}</span>
              </p>
            )}

            {data.is_owner ? (
              <div className="space-y-2 rounded-md border border-dashed p-3">
                <Label htmlFor="add-member-email">Add teammate by email</Label>
                <p className="text-xs text-muted-foreground">
                  They must already have an account (same email as sign-up). No email confirmation
                  needed.
                </p>
                <div className="flex gap-2">
                  <Input
                    id="add-member-email"
                    type="email"
                    placeholder="teammate@example.com"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleAddMember();
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={busy || !addEmail.trim()}
                    onClick={() => void handleAddMember()}
                  >
                    Add
                  </Button>
                </div>
              </div>
            ) : null}

            {data.is_owner && data.pending_requests.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Pending join requests</h3>
                <ul className="space-y-2 text-sm">
                  {data.pending_requests.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2"
                    >
                      <span>{r.requester_email}</span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleApprove(r.id)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void handleReject(r.id)}
                        >
                          Reject
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Members</h3>
              <ul className="space-y-2 text-sm">
                {data.members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded border px-3 py-2"
                  >
                    <span>
                      {m.email ?? m.display_name ?? m.user_id}
                      {m.role === "owner" ? (
                        <span className="ml-2 text-xs text-muted-foreground">(owner)</span>
                      ) : null}
                    </span>
                    {data.is_owner && m.role !== "owner" ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => void handleRemove(m.user_id)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
