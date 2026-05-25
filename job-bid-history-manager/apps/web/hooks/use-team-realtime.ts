"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  scheduleDashboardInvalidation,
  clearDashboardInvalidationTimers,
  type DashboardChangedArea,
} from "@/lib/dashboard/realtime-invalidation";
import { BROADCAST_EVENT } from "@/lib/realtime/broadcast-team-dashboard";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type RowWithId = { id?: string; team_id?: string };

function logRealtime(table: string, payload: RealtimePostgresChangesPayload<RowWithId>) {
  if (process.env.NODE_ENV !== "development") return;
  const row = (payload.new ?? payload.old) as RowWithId | undefined;
  console.debug(`[realtime] ${table} changed`, payload.eventType, row?.id);
}

/**
 * Team-scoped Supabase Realtime → debounced React Query invalidation.
 * Call once inside the team dashboard shell.
 */
export function useTeamRealtime(teamId: string) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!teamId) return;

    const supabase = createBrowserSupabaseClient();
    const teamFilter = `team_id=eq.${teamId}`;

    const onChange =
      (table: string, area: DashboardChangedArea) =>
      (payload: RealtimePostgresChangesPayload<RowWithId>) => {
        logRealtime(table, payload);
        scheduleDashboardInvalidation(qc, teamId, area);
      };

    const channel = supabase
      .channel(`team-dashboard-${teamId}`)
      .on("broadcast", { event: BROADCAST_EVENT }, (payload) => {
        if (process.env.NODE_ENV === "development") {
          console.debug("[realtime] broadcast", payload);
        }
        scheduleDashboardInvalidation(qc, teamId, "jobs");
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs", filter: teamFilter },
        onChange("jobs", "jobs"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_descriptions",
          filter: teamFilter,
        },
        onChange("job_descriptions", "jd"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "resume_files",
          filter: teamFilter,
        },
        onChange("resume_files", "resume"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tags", filter: teamFilter },
        onChange("tags", "tags"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notes", filter: teamFilter },
        onChange("notes", "notes"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_tags" },
        onChange("job_tags", "tags"),
      )
      .subscribe((status, err) => {
        if (process.env.NODE_ENV === "development") {
          console.debug("[realtime] channel status", teamId, status, err?.message);
        }
      });

    return () => {
      clearDashboardInvalidationTimers(teamId);
      void supabase.removeChannel(channel);
    };
  }, [teamId, qc]);
}
