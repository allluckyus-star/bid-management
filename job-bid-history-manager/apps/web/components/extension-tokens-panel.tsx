"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTeamId } from "@/context/team-context";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";

type TokenRow = {
  id: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
};

export function ExtensionTokensPanel() {
  const teamId = useTeamId();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const teamQuery = `?teamId=${encodeURIComponent(teamId)}`;
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/extension-tokens${teamQuery}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setTokens(data.tokens ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }, [teamQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const createToken = async () => {
    setBusy(true);
    setNewToken(null);
    setError(null);
    try {
      const res = await fetch(`/api/extension-tokens${teamQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Chrome extension" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setNewToken(data.token);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create token");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    const ok = await confirm({
      title: "Revoke capture token?",
      description:
        "The extension will stop working until you create a new token and paste it in Settings.",
      confirmLabel: "Revoke",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/extension-tokens/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke");
    } finally {
      setBusy(false);
    }
  };

  const copyToken = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy", {
        description: "Select the token field and copy manually.",
      });
    }
  };

  return (
    <section className="rounded-lg border p-4 space-y-4">
      {confirmDialog}
      <div>
        <h2 className="text-lg font-semibold">Capture token</h2>
        <p className="text-sm text-muted-foreground mt-1">
          After installing the extension, open its <strong>Settings</strong>, paste this token once,
          and use <strong>Test connection</strong>. Production API URL is preconfigured; developers can
          switch to localhost in Settings only.
        </p>
      </div>

      <Button type="button" onClick={() => void createToken()} disabled={busy}>
        {busy ? "Working…" : "Create capture token"}
      </Button>

      {newToken ? (
        <div className="rounded-md bg-muted/60 p-3 space-y-2 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            Copy now — this token is shown only once.
          </p>
          <Input readOnly value={newToken} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          <Button type="button" size="sm" variant="outline" onClick={() => void copyToken()}>
            Copy to clipboard
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading tokens…</p>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active tokens.</p>
      ) : (
        <ul className="text-sm space-y-2">
          {tokens.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0"
            >
              <span>
                {t.name ?? "Token"} · created {new Date(t.created_at).toLocaleString()}
                {t.last_used_at
                  ? ` · last used ${new Date(t.last_used_at).toLocaleString()}`
                  : ""}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void revoke(t.id)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
