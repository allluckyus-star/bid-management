import Link from "next/link";

import { ExtensionInstallPanel } from "@/components/extension-install-panel";
import { ExtensionPageToaster } from "@/components/extension-page-toaster";
import { ExtensionTokensPanel } from "@/components/extension-tokens-panel";
import { Button } from "@/components/ui/button";

type Props = { params: Promise<{ teamId: string }> };

export default async function TeamExtensionPage({ params }: Props) {
  const { teamId } = await params;
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Chrome extension</h1>
            <p className="text-sm text-muted-foreground">
              Team-scoped capture token — jobs save to this team only
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/team/${teamId}/dashboard`}>Back to dashboard</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[900px] space-y-6 px-6 py-6">
        <ExtensionInstallPanel />
        <ExtensionTokensPanel />
      </main>
      <ExtensionPageToaster />
    </div>
  );
}
