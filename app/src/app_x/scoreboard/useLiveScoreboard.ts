import { useEffect, useMemo, useState } from "react";
import type { Snapshot } from "./data";
import { parseLiveTeams, withLivePlayers, type LiveTeam } from "./liveGames";

/** Public NFL status is independent of the authenticated fantasy extension. */
export function useLiveScoreboard(snapshot: Snapshot | null) {
  const year = snapshot?.year, week = snapshot?.week;
  const key = `${year}:${week}`;
  const [live, setLive] = useState<{ key: string; teams: Map<number, LiveTeam>; error?: string } | null>(null);
  useEffect(() => {
    if (year === undefined || week === undefined) return;
    let active = true;
    let inFlight = false;
    let controller: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      controller = new AbortController();
      timeout = setTimeout(() => controller?.abort(), 8000);
      try {
        const url = new URL("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard");
        url.search = new URLSearchParams({ dates: String(year), seasontype: "2", week: String(week), limit: "100" }).toString();
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("NFL status unavailable");
        const data = await response.json();
        if (!Array.isArray(data?.events)) throw new Error("Invalid NFL status");
        const teams = parseLiveTeams(data, year, week);
        if (active) setLive({ key, teams });
      } catch {
        // Do not retain stale possession or red-zone colors after a failed poll.
        if (active) setLive(previous => ({ key,
          teams: new Map(previous?.key === key ? [...previous.teams].filter(([, team]) => team.completed) : []),
          error: "Live player status unavailable",
        }));
      } finally {
        clearTimeout(timeout);
        inFlight = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 15_000);
    return () => { active = false; clearInterval(timer); clearTimeout(timeout); controller?.abort(); };
  }, [year, week, key]);
  return useMemo(() => ({
    snapshot: snapshot && live?.key === key ? withLivePlayers(snapshot, live.teams) : snapshot,
    error: live?.key === key ? live.error : undefined,
  }), [snapshot, live, key]);
}
