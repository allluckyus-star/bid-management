"use client";

import { TeamProvider } from "@/context/team-context";

export function TeamLayoutProvider({
  teamId,
  children,
}: {
  teamId: string;
  children: React.ReactNode;
}) {
  return <TeamProvider teamId={teamId}>{children}</TeamProvider>;
}
