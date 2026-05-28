"use client";

import Link from "next/link";
import { Puzzle, Users } from "lucide-react";
import { useState } from "react";

import { PageActions } from "@/components/layout/page-actions";
import { PageContainer } from "@/components/layout/page-container";
import { TeamMembersDialog } from "@/components/teams/team-members-dialog";
import { Button } from "@/components/ui/button";
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
            <p className="mt-2">Create a token on the Extension page and paste it in the extension popup.</p>
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
