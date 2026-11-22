import { useCallback, useEffect, useRef, useState } from "react";
import { activeRedzoneGames, normalizeRedzonePlays, REDZONE_SCOREBOARD_URL, redzoneSummaryUrl, sortRedzonePlays, type RedzonePlay } from "../lib/redzone";

const POLL_INTERVAL_MS = 10_000;
const REQUEST_TIMEOUT_MS = 8_000;
type State = { rows: RedzonePlay[]; loading: boolean; activeGameCount: number | null; errorMessage: string };

// Mount only while the RedZone spotlight log is visible. This feed has no delay.
export function useRedzoneLog(refreshRequestId = 0) {
  const [state, setState] = useState<State>({ rows: [], loading: true, activeGameCount: null, errorMessage: "" });
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let active = true;
    let running = false;
    let queuedRefresh = false;
    let discovered = false;
    let loading = true;
    let discoveryError = false;
    const games = new Map<string, RedzonePlay[]>();
    const failedGames = new Set<string>();
    const requests = new Set<AbortController>();
    const publish = () => {
      if (!active) return;
      setState({ rows: sortRedzonePlays([...games.values()].flat()), loading,
        activeGameCount: discovered ? games.size : null,
        errorMessage: discoveryError ? "Unable to refresh NFL games. Retrying…"
          : failedGames.size ? "Some live plays could not be refreshed. Retrying…" : "" });
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
    const cycle = async () => {
      if (!active || running) return;
      running = true;
      try {
        const ids = activeRedzoneGames(await request(REDZONE_SCOREBOARD_URL));
        if (!active) return;
        discovered = true;
        discoveryError = false;
        for (const id of games.keys()) if (!ids.includes(id)) { games.delete(id); failedGames.delete(id); }
        for (const id of ids) if (!games.has(id)) games.set(id, []);
        if (ids.length === 0) loading = false;
        publish();
        await Promise.all(ids.map(async id => {
          try {
            const rows = normalizeRedzonePlays(id, await request(redzoneSummaryUrl(id)));
            if (!active) return;
            games.set(id, rows);
            failedGames.delete(id);
            loading = false;
            publish(); // Do not wait for the slowest game before showing this one.
          } catch {
            if (!active) return;
            failedGames.add(id);
            publish();
          }
        }));
      } catch {
        if (active) discoveryError = true;
      } finally {
        running = false;
        loading = false;
        publish();
        if (active && queuedRefresh) { queuedRefresh = false; void cycle(); }
      }
    };
    refreshRef.current = () => {
      if (running) queuedRefresh = true;
      else void cycle();
    };
    void cycle();
    const poll = setInterval(() => { void cycle(); }, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(poll);
      for (const request of requests) request.abort();
      refreshRef.current = () => {};
    };
  }, []);

  const previousRefresh = useRef(refreshRequestId);
  useEffect(() => {
    if (previousRefresh.current === refreshRequestId) return;
    previousRefresh.current = refreshRequestId;
    if (refreshRequestId !== 0) refresh();
  }, [refresh, refreshRequestId]);
  return { ...state, refresh };
}
