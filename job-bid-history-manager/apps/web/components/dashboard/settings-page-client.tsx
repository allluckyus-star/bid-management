"use client";

import Link from "next/link";
import { Puzzle, Users } from "lucide-react";
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
  const [username, setUsername] = useState("");
  const [locked, setLocked] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      setLoadingProfile(true);
      setUsernameError(null);
      const res = await fetch("/api/profile/username");
      const data = (await res.json().catch(() => ({}))) as {
        email?: string | null;
        username?: string | null;
        locked?: boolean;
        error?: string;
      };
      if (!mounted) return;
      if (!res.ok) {
        setUsernameError(data.error ?? "Failed to load username.");
      } else {
        setEmail(data.email ?? null);
        setUsername(data.username ?? "");
        setLocked(Boolean(data.locked));
      }
      setLoadingProfile(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const usernameFormatValid = useMemo(
    () => /^[a-z0-9_-]{3,32}$/.test(username.trim()),
    [username],
  );

  const saveUsername = async () => {
    setUsernameError(null);
    setUsernameSuccess(null);
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,32}$/.test(normalized)) {
      setUsernameError(
        "Invalid username format. Use 3-32 lowercase letters, numbers, underscore, or hyphen.",
      );
      return;
    }
    setSavingUsername(true);
    const res = await fetch("/api/profile/username", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: normalized }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      username?: string;
      locked?: boolean;
      error?: string;
    };
    setSavingUsername(false);
    if (!res.ok) {
      setUsernameError(data.error ?? "Failed to save username.");
      return;
    }
    setUsername(data.username ?? normalized);
    setLocked(Boolean(data.locked));
    setUsernameSuccess("Username registered successfully.");
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capture identity (username)</CardTitle>
            <CardDescription>
              One account can register exactly one username for extension captures.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Signed-in account: <span className="font-mono text-foreground">{email ?? "—"}</span>
            </p>
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {locked ? "Registered username" : "Choose your username"}
              </p>
              <Input
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.toLowerCase());
                  setUsernameError(null);
                  setUsernameSuccess(null);
                }}
                disabled={locked || loadingProfile || savingUsername}
                placeholder="your_name"
                className="max-w-sm font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Allowed: lowercase letters, numbers, underscore, hyphen (3-32 chars).
              </p>
              {locked ? (
                <p className="text-xs text-muted-foreground">
                  Username is locked to this account. Contact admin or update from settings if
                  supported.
                </p>
              ) : null}
              {usernameError ? <p className="text-xs text-destructive">{usernameError}</p> : null}
              {usernameSuccess ? <p className="text-xs text-emerald-600">{usernameSuccess}</p> : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void saveUsername()}
                disabled={locked || loadingProfile || savingUsername || !usernameFormatValid}
              >
                {savingUsername ? "Saving…" : "Save username"}
              </Button>
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
              Create a token on the Extension page, then validate your registered username in the
              extension settings.
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

      <TeamMembersDialog teamId={teamId} open={membersOpen} onOpenChange={setMembersOpen} />
    </PageContainer>
  );
}
