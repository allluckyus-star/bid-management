"use client";

import { AppShell } from "@/components/layout/app-shell";

type Props = {
  teamId: string;
  children: React.ReactNode;
};

export function TeamAppLayout({ teamId, children }: Props) {
  return <AppShell teamId={teamId}>{children}</AppShell>;
}
