"use client";

import { createContext, useContext } from "react";

import { DEFAULT_TEAM_TIMEZONE } from "@/lib/datetime/zoned";

type TeamContextValue = {
  teamId: string;
  timezone: string;
};

const TeamContext = createContext<TeamContextValue | null>(null);

export function TeamProvider({
  teamId,
  timezone,
  children,
}: {
  teamId: string;
  timezone: string;
  children: React.ReactNode;
}) {
  return (
    <TeamContext.Provider value={{ teamId, timezone }}>{children}</TeamContext.Provider>
  );
}

export function useTeamId(): string {
  const ctx = useContext(TeamContext);
  if (!ctx) {
    throw new Error("useTeamId must be used within TeamProvider");
  }
  return ctx.teamId;
}

export function useTeamTimezone(): string {
  const ctx = useContext(TeamContext);
  if (!ctx) {
    throw new Error("useTeamTimezone must be used within TeamProvider");
  }
  return ctx.timezone || DEFAULT_TEAM_TIMEZONE;
}
