import Link from "next/link";

import { ExtensionTokensPanel } from "@/components/extension-tokens-panel";
import { Button } from "@/components/ui/button";

export default function ExtensionPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Chrome extension</h1>
            <p className="text-sm text-muted-foreground">
              Capture tokens for the Job Bid History Manager extension
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[900px] px-6 py-6">
        <ExtensionTokensPanel />
      </main>
    </div>
  );
}
