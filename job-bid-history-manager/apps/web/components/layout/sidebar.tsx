"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { teamNavItems, type NavItem } from "@/lib/layout/nav-config";
import { cn } from "@/lib/utils";

const SIDEBAR_EXPANDED = "15rem"; /* w-60 */
const SIDEBAR_COLLAPSED = "4.5rem"; /* 72px */
const NAV_TRANSITION = "duration-300 ease-in-out";

type Props = {
  teamId: string;
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
};

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function Sidebar({ teamId, collapsed, onToggle, className }: Props) {
  const pathname = usePathname();
  const items = teamNavItems(teamId);

  return (
    <aside
      style={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED }}
      className={cn(
        "hidden h-screen min-h-0 shrink-0 flex-col border-r bg-card",
        `transition-[width] ${NAV_TRANSITION}`,
        "md:flex",
        className,
      )}
    >
      <div
        className={cn(
          "relative flex h-14 shrink-0 items-center overflow-hidden border-b px-3",
          collapsed ? "justify-center" : "justify-between gap-2",
        )}
      >
        <Link
          href={`/team/${teamId}/dashboard`}
          className={cn(
            "flex min-w-0 items-center gap-2",
            collapsed ? "justify-center" : "",
          )}
          title="Job Bid History Manager"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
            J
          </span>
          <span
            className={cn(
              "min-w-0 overflow-hidden whitespace-nowrap transition-all",
              NAV_TRANSITION,
              collapsed ? "max-w-0 opacity-0" : "max-w-[8rem] opacity-100",
            )}
          >
            <span className="block text-sm font-semibold tracking-tight">JBHM</span>
            <span className="block truncate text-[10px] text-muted-foreground">Bid Manager</span>
          </span>
        </Link>
        {!collapsed ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onToggle}
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <nav className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto p-2">
        {items.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 overflow-hidden rounded-lg py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                collapsed ? "justify-center px-2" : "px-3",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span
                className={cn(
                  "truncate transition-all",
                  NAV_TRANSITION,
                  collapsed ? "max-w-0 opacity-0" : "max-w-[9rem] opacity-100",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div
        className={cn(
          "mt-auto shrink-0 overflow-hidden border-t bg-card p-2",
          collapsed ? "flex flex-col items-center gap-2" : "",
        )}
      >
        {collapsed ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onToggle}
            aria-label="Expand sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="w-full" asChild>
            <Link href="/teams">Switch team</Link>
          </Button>
        )}
      </div>
    </aside>
  );
}
