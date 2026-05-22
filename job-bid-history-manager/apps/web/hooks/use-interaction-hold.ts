import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pauses background table refresh while the user edits cells or has dialogs open.
 * Queues one silent refresh when hold ends.
 */
export function useInteractionHold() {
  const sourcesRef = useRef(new Set<string>());
  const [held, setHeld] = useState(false);
  const pendingSilentRef = useRef(false);

  const syncHeld = useCallback(() => {
    setHeld(sourcesRef.current.size > 0);
  }, []);

  const setHold = useCallback(
    (key: string, active: boolean) => {
      if (active) sourcesRef.current.add(key);
      else sourcesRef.current.delete(key);
      syncHeld();
    },
    [syncHeld],
  );

  const queueSilentRefresh = useCallback(() => {
    pendingSilentRef.current = true;
  }, []);

  const consumePendingSilent = useCallback(() => {
    const pending = pendingSilentRef.current;
    pendingSilentRef.current = false;
    return pending;
  }, []);

  const isHeld = useCallback(() => sourcesRef.current.size > 0, []);

  return {
    held,
    setHold,
    queueSilentRefresh,
    consumePendingSilent,
    isHeld,
  };
}

/** Register hold while `active` is true (e.g. dialog open). */
export function useHoldKey(
  setHold: (key: string, active: boolean) => void,
  key: string,
  active: boolean,
) {
  useEffect(() => {
    setHold(key, active);
    return () => setHold(key, false);
  }, [setHold, key, active]);
}
