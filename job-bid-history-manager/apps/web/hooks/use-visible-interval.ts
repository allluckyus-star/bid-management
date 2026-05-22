"use client";

import { useEffect, useState } from "react";

/** True when document is visible and user is not holding interaction (modal/edit). */
export function useVisibleInterval(
  intervalMs: number | false,
  paused: boolean,
): number | false {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (!intervalMs || paused || !visible) return false;
  return intervalMs;
}
