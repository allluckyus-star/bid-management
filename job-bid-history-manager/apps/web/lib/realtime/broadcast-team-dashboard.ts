import { createAdminClient } from "@/lib/supabase/admin";

const BROADCAST_EVENT = "dashboard-invalidate";

/** Notify all clients on team-dashboard channel (e.g. after service-role soft delete). */
export async function broadcastTeamDashboardInvalidate(
  teamId: string,
  reason: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const channel = admin.channel(`team-dashboard-${teamId}`);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("broadcast subscribe timeout"));
      }, 5000);

      channel.subscribe((status, err) => {
        if (err) {
          clearTimeout(timeout);
          reject(err);
          return;
        }
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timeout);
          reject(new Error(`broadcast channel ${status}`));
        }
      });
    });

    await channel.send({
      type: "broadcast",
      event: BROADCAST_EVENT,
      payload: { reason },
    });

    await admin.removeChannel(channel);
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[realtime] broadcast failed", reason, err);
    }
  }
}

export { BROADCAST_EVENT };
