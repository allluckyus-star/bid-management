"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { teamNavItems, type NavItem } from "@/lib/layout/nav-config";
import { cn } from "@/lib/utils";

type Props = {
  teamId: string;
};

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function MobileNav({ teamId }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const items = teamNavItems(teamId);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </Button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 flex w-[min(280px,85vw)] flex-col border-r bg-card shadow-xl">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <span className="text-sm font-semibold">Menu</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {items.map((item) => {
                const active = isActive(pathname, item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t p-3">
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link href="/teams">Switch team</Link>
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
