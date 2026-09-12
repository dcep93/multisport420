import { extensionHelper } from "./extension";
import { parseScoreboard, type Snapshot } from "./data";

export type Options = { leagueId?: string; year?: number };
type State = { snapshot: Snapshot | null; loading: boolean; error: string | null; fetchCount: number; extensionAvailable: boolean };
type Result = { ok: boolean; fetchCount: number };
type Transport = (payload: any) => Promise<any>;

export function createScoreboardController(options: Options, transport: Transport = extensionHelper) {
  let state: State = { snapshot: null, loading: false, error: null, fetchCount: 0, extensionAvailable: true };
  const listeners = new Set<() => void>();
  let inFlight: Promise<Result> | null = null;
  let started = false;
  const update = (patch: Partial<State>) => {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  };
  function refresh(): Promise<Result> {
    if (inFlight) return inFlight;
    started = true;
    update({ loading: true, error: null });
    inFlight = Promise.resolve().then(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        let response: any;
        try {
          response = await Promise.race([
            transport({ scoreboard: { action: "fetch", ...options } }),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Extension timed out")), 22_000); }),
          ]);
        } catch {
          update({ extensionAvailable: false, snapshot: null });
          throw new Error("Install or reload the Multisport420 Chrome extension (version 0.3.0 or later), then reload this page and your ESPN league tab.");
        } finally {
          clearTimeout(timer);
        }
        if (!response || ![0, 1].includes(response.fetched)) {
          update({ extensionAvailable: false, snapshot: null });
          throw new Error("Update the Multisport420 Chrome extension to version 0.3.0 or later, then reload this page and your ESPN league tab.");
        }
        update({ fetchCount: state.fetchCount + response.fetched, extensionAvailable: true });
        if (response.error) throw new Error(String(response.error));
        const snapshot = parseScoreboard(response.data, response.year, response.fetchedAt);
        update({ snapshot });
        for (const team of new Map(snapshot.matchups.flat().map(team => [team.id, team])).values()) {
          const lineup = team.projectedLineup;
          if (!lineup) continue;
          const context = { leagueId: snapshot.leagueId, teamId: team.id, week: snapshot.week };
          if (lineup.warning) {
            console.warn("[Multisport420] Projected roster unchanged", { ...context, reason: lineup.warning });
          } else {
            console.log("[Multisport420] Projected roster", lineup.players.map(player => `${player.slot}: ${player.name}`).join("; "), {
              ...context, projected: team.projected, players: lineup.players, emptySlots: lineup.emptySlots,
            });
          }
        }
        return { ok: true, fetchCount: state.fetchCount };
      } catch (error) {
        update({ error: error instanceof Error ? error.message : "Could not load the scoreboard. Try again." });
        return { ok: false, fetchCount: state.fetchCount };
      } finally {
        inFlight = null;
        update({ loading: false });
      }
    });
    return inFlight;
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start: () => { if (!started) void refresh(); },
    refresh,
  };
}
