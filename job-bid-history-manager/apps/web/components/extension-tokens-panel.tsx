"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TokenRow = {
  id: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
};

export function ExtensionTokensPanel() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/extension-tokens");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setTokens(data.tokens ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createToken = async () => {
    setBusy(true);
    setNewToken(null);
    setError(null);
    try {
      const res = await fetch("/api/extension-tokens", {
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
    if (!confirm("Revoke this capture token? The extension will stop working until you add a new one.")) {
      return;
    }
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
    await navigator.clipboard.writeText(newToken);
  };

  return (
    <section className="rounded-lg border p-4 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Chrome extension</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Create a capture token, paste it in the extension popup, and set API URL to this site
          (e.g. <code className="rounded bg-muted px-1">http://localhost:3000</code> or your Vercel
          URL). Extension sends <strong>innerText only</strong> to{" "}
          <code className="rounded bg-muted px-1">/api/capture/job</code>.
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
