import { useEffect, useRef, useState } from "react";

/** Tick interval for live elapsed clocks (ms). */
const TICK_MS = 200;

/**
 * Live elapsed milliseconds while `active` is true.
 *
 * Starts counting when `active` becomes true (keyed by `id` so remounts of a new
 * call reset the clock). Returns `null` until elapsed reaches `thresholdMs`.
 */
export function useLiveElapsedMs(id: string, active: boolean, thresholdMs = 0): number | null {
  const startedAtRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!active || !id) {
      startedAtRef.current = null;
      setElapsedMs(0);
      return;
    }

    if (startedAtRef.current == null) {
      startedAtRef.current = Date.now();
    }

    const tick = () => {
      const start = startedAtRef.current;
      if (start == null) return;
      setElapsedMs(Date.now() - start);
    };

    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [id, active]);

  if (!active || elapsedMs < thresholdMs) return null;
  return elapsedMs;
}
