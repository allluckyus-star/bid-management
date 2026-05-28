"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Puzzle, RefreshCw, Sun, Users } from "lucide-react";

import { MobileNav } from "@/components/layout/mobile-nav";
import type { PageMeta } from "@/lib/layout/nav-config";
import { Button } from "@/components/ui/button";

type Props = {
  teamId: string;
  meta: PageMeta;
  dark: boolean;
  onToggleDark: () => void;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenTeam: () => void;
};

export function Topbar({
  teamId,
  meta,
  dark,
  onToggleDark,
  refreshing,
  onRefresh,
  onOpenTeam,
}: Props) {
  const pathname = usePathname();
  const onExtensionPage = pathname.includes("/dashboard/extension");

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
      <MobileNav teamId={teamId} />

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold tracking-tight md:text-lg">{meta.title}</h1>
        {meta.subtitle ? (
          <p className="hidden truncate text-xs text-muted-foreground sm:block">{meta.subtitle}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {!onExtensionPage ? (
          <Button variant="outline" size="sm" className="hidden h-8 sm:inline-flex" asChild>
            <Link href={`/team/${teamId}/dashboard/extension`}>
              <Puzzle className="mr-1.5 h-3.5 w-3.5" />
              Extension
            </Link>
          </Button>
        ) : null}
        <Button variant="outline" size="sm" className="hidden h-8 md:inline-flex" onClick={onOpenTeam}>
          <Users className="mr-1.5 h-3.5 w-3.5" />
          Team
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => void onRefresh()}
          disabled={refreshing}
        >
          <RefreshCw className={`h-3.5 w-3.5 sm:mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleDark}>
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </div>
    </header>
  );
}
