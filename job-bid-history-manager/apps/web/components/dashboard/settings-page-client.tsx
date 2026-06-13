"use client";

import Link from "next/link";
import { Puzzle, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PageActions } from "@/components/layout/page-actions";
import { PageContainer } from "@/components/layout/page-container";
import { TeamMembersDialog } from "@/components/teams/team-members-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTeamTimezone } from "@/context/team-context";

export function SettingsPageClient({ teamId }: { teamId: string }) {
  const timezone = useTeamTimezone();
  const [membersOpen, setMembersOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [usernames, setUsernames] = useState<string[]>([]);
  const [draftUsername, setDraftUsername] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingUsername, setSavingUsername] = useState(false);
  const [removingUsername, setRemovingUsername] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState<string | null>(null);

  const loadUsernames = async () => {
    setLoadingProfile(true);
    setUsernameError(null);
    const res = await fetch("/api/profile/usernames");
    const data = (await res.json().catch(() => ({}))) as {
      email?: string | null;
      usernames?: string[];
      error?: string;
    };
    if (!res.ok) {
      setUsernameError(data.error ?? "Failed to load usernames.");
      setLoadingProfile(false);
      return;
    }
    setEmail(data.email ?? null);
    setUsernames(Array.isArray(data.usernames) ? data.usernames : []);
    setLoadingProfile(false);
  };

  useEffect(() => {
    void loadUsernames();
  }, []);

  const usernameFormatValid = useMemo(
    () => /^[a-z0-9_-]{3,32}$/.test(draftUsername.trim()),
    [draftUsername],
  );

  const addUsername = async () => {
    setUsernameError(null);
    setUsernameSuccess(null);
    const normalized = draftUsername.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,32}$/.test(normalized)) {
      setUsernameError(
        "Invalid username format. Use 3-32 lowercase letters, numbers, underscore, or hyphen.",
      );
      return;
    }
    setSavingUsername(true);
    const res = await fetch("/api/profile/usernames", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: normalized }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      username?: string;
      usernames?: string[];
      error?: string;
    };
    setSavingUsername(false);
    if (!res.ok) {
      setUsernameError(data.error ?? "Failed to add username.");
      return;
    }
    setUsernames(Array.isArray(data.usernames) ? data.usernames : usernames);
    setDraftUsername("");
    setUsernameSuccess(`Added “${data.username ?? normalized}”.`);
  };

  const deleteUsername = async (username: string) => {
    setUsernameError(null);
    setUsernameSuccess(null);
    setRemovingUsername(username);
    const res = await fetch("/api/profile/usernames", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      usernames?: string[];
      error?: string;
    };
    setRemovingUsername(null);
    if (!res.ok) {
      setUsernameError(data.error ?? "Failed to remove username.");
      return;
    }
    setUsernames(Array.isArray(data.usernames) ? data.usernames : []);
    setUsernameSuccess(`Removed “${username}”.`);
  };

  return (
    <PageContainer>
      <PageActions>
        <Button size="sm" onClick={() => setMembersOpen(true)}>
          <Users className="mr-1.5 h-4 w-4" />
          Manage team
        </Button>
      </PageActions>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team & timezone</CardTitle>
            <CardDescription>
              All members see dates, charts, and filters in the same timezone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              Current timezone:{" "}
              <span className="font-mono font-medium text-foreground">{timezone}</span>
            </p>
            <Button variant="outline" size="sm" onClick={() => setMembersOpen(true)}>
              Change in team settings
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Chrome extension</CardTitle>
            <CardDescription>Capture jobs from job boards into this team.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/team/${teamId}/dashboard/extension`}>
                <Puzzle className="mr-2 h-4 w-4" />
                Extension setup
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Capture identities (usernames)</CardTitle>
            <CardDescription>
              One Gmail account can register multiple usernames. Validate each one in the
              extension and pick which identity to use for captures.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Signed-in account: <span className="font-mono text-foreground">{email ?? "—"}</span>
            </p>

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1 space-y-2">
                <p className="text-sm font-medium">Add username</p>
                <Input
                  value={draftUsername}
                  onChange={(e) => {
                    setDraftUsername(e.target.value.toLowerCase());
                    setUsernameError(null);
                    setUsernameSuccess(null);
                  }}
                  disabled={loadingProfile || savingUsername}
                  placeholder="your_name"
                  className="max-w-sm font-mono"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void addUsername()}
                disabled={loadingProfile || savingUsername || !usernameFormatValid}
              >
                {savingUsername ? "Adding…" : "Add username"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Allowed: lowercase letters, numbers, underscore, hyphen (3-32 chars). Each username
              must be unique across all accounts.
            </p>

            {usernameError ? <p className="text-xs text-destructive">{usernameError}</p> : null}
            {usernameSuccess ? (
              <p className="text-xs text-emerald-600">{usernameSuccess}</p>
            ) : null}

            <div className="space-y-2">
              <p className="text-sm font-medium">Registered usernames</p>
              {loadingProfile ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : usernames.length ? (
                <ul className="divide-y rounded-md border">
                  {usernames.map((name) => (
                    <li
                      key={name}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <span className="font-mono">{name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={removingUsername === name}
                        onClick={() => void deleteUsername(name)}
                        aria-label={`Remove ${name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No usernames yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capture API</CardTitle>
            <CardDescription>
              Jobs are saved via your team capture token and Supabase backend.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Endpoint:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">POST /api/capture/job</code>
            </p>
            <p className="mt-2">
              Create a token on the Extension page, register usernames here, then validate and pick
              one in the extension settings.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Workspace</CardTitle>
            <CardDescription>Switch teams or manage membership.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/teams">All teams</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMembersOpen(true)}>
              Team members
            </Button>
          </CardContent>
        </Card>
      </div>

      <TeamMembersDialog open={membersOpen} onOpenChange={setMembersOpen} teamId={teamId} />
    </PageContainer>
  );
}
