import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "./data";

/** Queue every update so polling faster than the delay cannot starve the display. */
export function useDelayedScoreboard(snapshot: Snapshot | null, delayMs: number) {
  const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;
  const key = snapshot ? JSON.stringify([snapshot.leagueId, snapshot.year, snapshot.week, delay]) : null;
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [displayed, setDisplayed] = useState<{ key: string; snapshot: Snapshot } | null>(null);

  useEffect(() => {
    setDisplayed(null);
    const pending = timers.current;
    return () => { pending.forEach(clearTimeout); pending.clear(); };
  }, [key]);

  useEffect(() => {
    if (!snapshot || key === null || delay === 0) return;
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setDisplayed({ key, snapshot });
    }, delay);
    timers.current.add(timer);
    // Do not cancel on a newer snapshot: each observation gets its full delay.
    // The scope effect above clears the queue on delay/league/week changes or unmount.
  }, [snapshot, key, delay]);

  return delay === 0 ? snapshot : displayed?.key === key ? displayed.snapshot : null;
}
