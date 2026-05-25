import fs from "fs";
import path from "path";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const DOWNLOAD_PATH = "/downloads/job-bid-capture-extension.zip";
const META_PATH = "public/downloads/extension-meta.json";

type ExtensionMeta = {
  version?: string;
  filename?: string;
  folderName?: string;
};

function loadMeta(): ExtensionMeta | null {
  try {
    const file = path.join(process.cwd(), META_PATH);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as ExtensionMeta;
  } catch {
    return null;
  }
}

function zipAvailable(): boolean {
  const file = path.join(process.cwd(), "public/downloads/job-bid-capture-extension.zip");
  return fs.existsSync(file);
}

export function ExtensionInstallPanel() {
  const meta = loadMeta();
  const available = zipAvailable();
  const version = meta?.version ?? "0.5.0";
  const folderName = meta?.folderName ?? "job-bid-capture-extension";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Install the Chrome extension</CardTitle>
        <CardDescription>
          Download once, load in Chrome, then connect with your capture token below. Version{" "}
          {version}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {available ? (
          <Button asChild size="lg">
            <a href={DOWNLOAD_PATH} download="job-bid-capture-extension.zip">
              <Download className="size-4" aria-hidden />
              Download extension (.zip)
            </a>
          </Button>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Extension package not built yet. Run{" "}
            <code className="rounded bg-muted px-1">npm run pack:extension</code> from the repo
            root (production deploys build this automatically).
          </p>
        )}

        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Download and unzip to a folder (e.g. <code className="rounded bg-muted px-1">{folderName}</code>
            ).
          </li>
          <li>
            In Chrome, open <code className="rounded bg-muted px-1">chrome://extensions</code>, turn on{" "}
            <strong>Developer mode</strong>, then <strong>Load unpacked</strong> and select that folder.
          </li>
          <li>
            Right-click the extension icon → <strong>Options</strong> (or open Settings from the popup).
            Paste your capture token and click <strong>Test connection</strong>.
          </li>
          <li>
            Capture jobs from the toolbar popup or right-click the page →{" "}
            <strong>Capture this page to Job Bid History</strong>.
          </li>
        </ol>

        <p className="text-xs text-muted-foreground">
          This is an unpacked developer install (not the Chrome Web Store). Your team uses the same
          zip; each person signs in here and creates their own token.
        </p>
      </CardContent>
    </Card>
  );
}
