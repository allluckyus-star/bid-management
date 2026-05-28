"use client";

import { TeamProvider } from "@/context/team-context";

export function TeamLayoutProvider({
  teamId,
  timezone,
  children,
}: {
  teamId: string;
  timezone: string;
  children: React.ReactNode;
}) {
  return (
    <TeamProvider teamId={teamId} timezone={timezone}>
      {children}
    </TeamProvider>
  );
}
