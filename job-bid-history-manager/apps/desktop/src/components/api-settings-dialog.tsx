import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fetchClientInfo, getDefaultHostUrl, isClientMode, setUpstreamUrl } from "@/lib/client";
import { clearApiBaseUrl, getApiBaseUrl, setApiBaseUrl } from "@/lib/settings";

interface ApiSettingsDialogProps {
  onSaved: () => void;
}

export function ApiSettingsDialog({ onSaved }: ApiSettingsDialogProps) {
  const clientMode = isClientMode();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (clientMode) {
      void fetchClientInfo().then((info) => {
        setValue(info?.upstream_url ?? getDefaultHostUrl());
      });
      return;
    }
    setValue(getApiBaseUrl());
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      if (clientMode) {
        await setUpstreamUrl(value);
        setStatus("Saved host server. Local proxy will forward requests.");
      } else {
        setApiBaseUrl(value);
        setStatus("Saved API host.");
      }
      onSaved();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (clientMode) {
      setValue("");
      setStatus("Enter your host PC address (e.g. http://192.168.1.50:5123).");
      return;
    }
    clearApiBaseUrl();
    setValue(getApiBaseUrl());
    setStatus("Reset to default API host.");
    onSaved();
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {clientMode ? "Host Server" : "API Host"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{clientMode ? "Team host server" : "API host"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {clientMode
              ? "This app runs a local server on your PC and forwards all requests to the host machine. The UI and Chrome extension always use http://127.0.0.1:4832 (see header)."
              : "Set the host address for the remote API server."}
          </p>
        </DialogHeader>
        <div className="grid gap-2 py-4">
          <label className="grid gap-2 text-sm">
            <span>{clientMode ? "Host API URL (on team lead PC)" : "API base URL"}</span>
            <Input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={clientMode ? getDefaultHostUrl() : "http://127.0.0.1:5123"}
              type="url"
            />
          </label>
          {clientMode ? (
            <p className="text-xs text-muted-foreground">
              Host IP is enough (port <code>:5123</code> is added on the host automatically). Local proxy:{" "}
              <code>http://127.0.0.1:4832</code> — use that in the Chrome extension popup.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Leave blank to use the built-in default:{" "}
              <code>{import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:5123"}</code>
            </p>
          )}
          {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => void handleReset()} type="button">
            {clientMode ? "Clear" : "Reset"}
          </Button>
          <Button onClick={() => void handleSave()} type="button" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
