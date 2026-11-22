import { useCallback, useEffect, useRef, useState } from "react";
import { activeRedzoneGames, normalizeRedzonePlays, REDZONE_SCOREBOARD_URL, redzoneSummaryUrl, sortRedzonePlays, type RedzonePlay } from "../lib/redzone";

const POLL_INTERVAL_MS = 10_000;
const REQUEST_TIMEOUT_MS = 8_000;
type Snapshot = { rows: RedzonePlay[]; loading: boolean; activeGameCount: number | null; errorMessage: string };
type State = Snapshot & { delay: number; waitingForDelay: boolean };
const emptySnapshot: Snapshot = { rows: [], loading: true, activeGameCount: null, errorMessage: "" };

// Mount only while the RedZone spotlight log is visible.
export function useRedzoneLog(delayMs = 0, refreshRequestId = 0) {
  const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;
  const [state, setState] = useState<State>({ ...emptySnapshot, delay, waitingForDelay: false });
  // Reset on every scope transition so returning to an earlier delay cannot reuse its rows.
  if (state.delay !== delay) setState({ ...emptySnapshot, delay, waitingForDelay: false });
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let active = true;
    let running = false;
    let epoch = 0;
    let discovered = false;
    let loading = true;
    let discoveryError = false;
    let latestSnapshot = emptySnapshot;
    const games = new Map<string, RedzonePlay[]>();
    const failedGames = new Set<string>();
    const requests = new Set<AbortController>();
    const publications = new Set<ReturnType<typeof setTimeout>>();
    const clearPublications = () => {
      for (const timer of publications) clearTimeout(timer);
      publications.clear();
    };
    const publish = (snapshot: Snapshot) => {
      if (active) setState({ ...snapshot, delay, waitingForDelay: false });
    };
    const accept = (immediate: boolean) => {
      // Capture now: a queued publication must never read the later mutable map.
      const snapshot: Snapshot = { rows: sortRedzonePlays([...games.values()].flat()), loading,
        activeGameCount: discovered ? games.size : null,
        errorMessage: discoveryError ? "Unable to refresh NFL games. Retrying…"
          : failedGames.size ? "Some live plays could not be refreshed. Retrying…" : "" };
      latestSnapshot = snapshot;
      if (immediate || delay === 0) { publish(snapshot); return; }
      // Status remains useful while rows are waiting behind the viewing delay.
      setState(previous => ({ ...(previous.delay === delay ? previous : { ...emptySnapshot, delay }),
        loading, errorMessage: snapshot.errorMessage, waitingForDelay: snapshot.rows.length > 0 }));
      const timer = setTimeout(() => {
        publications.delete(timer);
        if (!active) return;
        setState(previous => ({ ...previous, rows: snapshot.rows, activeGameCount: snapshot.activeGameCount,
          waitingForDelay: false }));
      }, delay);
      publications.add(timer);
    };
    const request = async (url: string): Promise<unknown> => {
      const controller = new AbortController();
      requests.add(controller);
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let onAbort: () => void = () => {};
      try {
        const aborted = new Promise<never>((_, reject) => {
          onAbort = () => { clearTimeout(timeout); reject(new Error("Request aborted")); };
          controller.signal.addEventListener("abort", onAbort, { once: true });
        });
        return await Promise.race([aborted, (async () => {
          const response = await fetch(url, { cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error(`ESPN HTTP ${response.status}`);
          return response.json() as Promise<unknown>;
        })()]);
      } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener("abort", onAbort);
        requests.delete(controller);
      }
    };
    const cycle = async (immediate = false) => {
      if (!active || running) return;
      running = true;
      const cycleEpoch = epoch;
      const current = () => active && cycleEpoch === epoch;
      try {
        const data = await request(REDZONE_SCOREBOARD_URL);
        if (!current()) return;
        const ids = activeRedzoneGames(data);
        discovered = true;
        discoveryError = false;
        for (const id of games.keys()) if (!ids.includes(id)) { games.delete(id); failedGames.delete(id); }
        for (const id of ids) if (!games.has(id)) games.set(id, []);
        if (ids.length === 0) loading = false;
        accept(immediate);
        await Promise.all(ids.map(async id => {
          try {
            const data = await request(redzoneSummaryUrl(id));
            if (!current()) return;
            games.set(id, normalizeRedzonePlays(id, data));
            failedGames.delete(id);
            loading = false;
            accept(immediate); // Publish each game without waiting for the slowest summary.
          } catch {
            if (!current()) return;
            failedGames.add(id);
            accept(immediate);
          }
        }));
      } catch {
        if (current()) discoveryError = true;
      } finally {
        // An aborted cycle must not clear the running flag or publish over its replacement.
        if (current()) {
          running = false;
          loading = false;
          accept(immediate);
        }
      }
    };
    refreshRef.current = () => {
      epoch += 1;
      clearPublications();
      for (const request of requests) request.abort();
      running = false;
      publish(latestSnapshot);
      void cycle(true);
    };
    void cycle();
    const poll = setInterval(() => { void cycle(); }, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(poll);
      clearPublications();
      for (const request of requests) request.abort();
      refreshRef.current = () => {};
    };
  }, [delay]);

  const previousRefresh = useRef(refreshRequestId);
  useEffect(() => {
    if (previousRefresh.current === refreshRequestId) return;
    previousRefresh.current = refreshRequestId;
    if (refreshRequestId !== 0) refresh();
  }, [refresh, refreshRequestId]);
  const current = state.delay === delay ? state : { ...emptySnapshot, waitingForDelay: false };
  return { ...current, refresh };
}
