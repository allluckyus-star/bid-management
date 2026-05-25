"use client";

import { createContext, useContext } from "react";

const TeamContext = createContext<string | null>(null);

export function TeamProvider({
  teamId,
  children,
}: {
  teamId: string;
  children: React.ReactNode;
}) {
  return <TeamContext.Provider value={teamId}>{children}</TeamContext.Provider>;
}

export function useTeamId(): string {
  const teamId = useContext(TeamContext);
  if (!teamId) {
    throw new Error("useTeamId must be used within TeamProvider");
  }
  return teamId;
}
