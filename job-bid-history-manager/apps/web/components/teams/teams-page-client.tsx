"use client";

import { Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  createTeam,
  fetchTeams,
  requestJoinTeam,
  type TeamsListResponse,
} from "@/lib/api/client";

export function TeamsPageClient() {
  const router = useRouter();
  const [data, setData] = useState<TeamsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchTeams();
      setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load teams");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    const name = teamName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const { team } = await createTeam(name);
      toast.success("Team created");
      setCreateOpen(false);
      setTeamName("");
      router.push(`/team/${team.id}/dashboard`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (teamId: string) => {
    setBusy(true);
    try {
      const res = await requestJoinTeam(teamId);
      toast.success(res.message);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Your teams</h1>
            <p className="text-sm text-muted-foreground">
              Each team has its own isolated bid history.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>Create new team</Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-8">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading teams…</p>
        ) : (
          <>
            <section className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Users className="h-5 w-5" />
                My teams
              </h2>
              {!data?.my_teams.length ? (
                <p className="text-sm text-muted-foreground">
                  You are not a member of any team yet. Create one or request to join below.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {data.my_teams.map((t) => (
                    <Card key={t.id}>
                      <CardHeader>
                        <CardTitle>{t.name}</CardTitle>
                        <CardDescription>Owner: {t.owner_email ?? "—"}</CardDescription>
                      </CardHeader>
                      <CardFooter>
                        <Button asChild>
                          <Link href={`/team/${t.id}/dashboard`}>Open dashboard</Link>
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {data?.other_teams.length ? (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold">Other teams</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {data.other_teams.map((t) => (
                    <Card key={t.id}>
                      <CardHeader>
                        <CardTitle>{t.name}</CardTitle>
                        <CardDescription>Owner: {t.owner_email ?? "—"}</CardDescription>
                      </CardHeader>
                      <CardFooter>
                        {t.join_status === "pending" ? (
                          <Button variant="outline" disabled>
                            Request pending
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => void handleJoin(t.id)}
                          >
                            Request to join
                          </Button>
                        )}
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create team</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="team-name">Team name</Label>
            <Input
              id="team-name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. Acme Bidders"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !teamName.trim()} onClick={() => void handleCreate()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
