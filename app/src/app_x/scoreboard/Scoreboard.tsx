import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createScoreboardController } from "./controller";
import { guillotine, headToHead, type Mode, type Team } from "./data";
import Autoscroller from "./Autoscroller";
import { Leaderboards, MatchupRoster, Roster } from "./PlayerDetails";
import { useLiveScoreboard } from "./useLiveScoreboard";
import "./scoreboard.css";

const points = (value: number | null) => value === null ? "—" : value.toFixed(2);
const percent = (value: number) => `${(value * 100).toFixed(2)}%`;

function Points({ team }: { team: Team }) {
  return <p className="scoreboard-points">
      <strong><span className="scoreboard-sr-only">Score: </span>{points(team.score)}</strong>
      <span className="scoreboard-projection" title="Projected final">
        <span className="scoreboard-sr-only">Projected final: </span>({points(team.projected)})
      </span>
    </p>;
}

function TeamScore({ team, probability, risk = false, bye = false, spotlight = false, showRoster = false }: { team: Team; probability?: number | null; risk?: boolean; bye?: boolean; spotlight?: boolean; showRoster?: boolean }) {
  const underdog = !risk && probability !== null && probability !== undefined && probability < .5;
  const beansLabel = team.lossesIfLost === undefined ? "Loss streak unavailable"
    : `${team.lossesIfLost} consecutive fantasy ${team.lossesIfLost === 1 ? "loss" : "losses"} if ${team.name} loses this week`;
  return <section className="scoreboard-team" aria-label={team.name}>
    <div className="scoreboard-team-heading">
      <h2 className="scoreboard-team-name" title={team.name}>{team.name}</h2>
      {spotlight && team.record && <span className="scoreboard-team-record" title="Current record (wins–losses)">
        {team.record.wins}–{team.record.losses}
      </span>}
    </div>
    <Points team={team} />
    {underdog ? <p className="scoreboard-probability scoreboard-beans" aria-label={beansLabel} title={beansLabel}>
      <span aria-hidden="true">{team.lossesIfLost === undefined ? "—" : "🫘".repeat(team.lossesIfLost)}</span>
    </p> : probability !== undefined && <p className={risk ? "scoreboard-probability scoreboard-risk" : "scoreboard-probability scoreboard-win"}>
      {probability === null ? "—" : percent(probability)}<span className="scoreboard-probability-label"> {risk ? "elimination" : "win"}</span>
    </p>}
    {bye && <p className="scoreboard-probability">Bye</p>}
    {showRoster && <Roster team={team} />}
  </section>;
}

function CompactMatchup({ teams, probability }: { teams: Team[]; probability: number | null }) {
  return <div className="scoreboard-compact-matchup">
    <h2 className="scoreboard-team-name" title={teams[0].name}>{teams[0].name}</h2>
    <Points team={teams[0]} />
    <p className="scoreboard-probability scoreboard-win" aria-label={`${teams[0].name} win probability`}>
      {probability === null ? "—" : percent(probability)}<span className="scoreboard-probability-label"> win</span>
    </p>
    <Points team={teams[1]} />
    <h2 className="scoreboard-team-name" title={teams[1].name}>{teams[1].name}</h2>
  </div>;
}

export type ScoreboardProps = {
  spotlight?: boolean;
  onRefreshReady?: (refresh: () => Promise<void>) => void;
  refreshRequestId?: number;
  shouldRefresh?: boolean;
};

export default function Scoreboard({ spotlight = true, onRefreshReady, refreshRequestId = 0, shouldRefresh = false }: ScoreboardProps) {
  const [query] = useState(() => new URLSearchParams(window.location.search));
  const [controller] = useState(() => createScoreboardController({
    ...(query.has("leagueId") ? { leagueId: query.get("leagueId")! } : {}),
    ...(query.has("year") ? { year: Number(query.get("year")) } : {}),
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const live = useLiveScoreboard(state.snapshot);
  const snapshot = live.snapshot;
  const [selectedMode, setSelectedMode] = useState<Mode | null>(() => {
    const mode = query.get("mode");
    return mode === "head-to-head" || mode === "guillotine" ? mode : null;
  });
  const [scrollPaused, setScrollPaused] = useState(false);
  const mode = selectedMode ?? (state.snapshot?.knockout || state.snapshot?.leagueId === "367176096" ? "guillotine" : "head-to-head");
  const matchups = useMemo(() => snapshot ? headToHead(snapshot) : [], [snapshot]);
  const elimination = useMemo(() => snapshot && mode === "guillotine" ? guillotine(snapshot) : null, [snapshot, mode]);

  const lastRefreshRequest = useRef(refreshRequestId);
  const refresh = useCallback(async () => { await controller.refresh(); }, [controller]);
  useEffect(() => { onRefreshReady?.(refresh); }, [onRefreshReady, refresh]);
  useEffect(() => {
    controller.start();
    const timer = window.setInterval(() => void controller.refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [controller]);
  useEffect(() => {
    if (lastRefreshRequest.current === refreshRequestId) return;
    lastRefreshRequest.current = refreshRequestId;
    if (shouldRefresh) void refresh();
  }, [refreshRequestId, shouldRefresh, refresh]);

  return <main className={`scoreboard-page ${spotlight ? "scoreboard-spotlight" : "scoreboard-compact"}`}>
    {snapshot && state.extensionAvailable && <div className="scoreboard-workspace">
      <Autoscroller paused={scrollPaused} resetKey={mode}>
        {mode === "head-to-head" ? matchups.map(({ teams, probability, key }) =>
          <article className={`scoreboard-card${spotlight && teams.length === 2 ? " scoreboard-paired" : ""}`} key={key} aria-label={teams.map(team => team.name).join(" versus ")}>
            {!spotlight && teams.length === 2 ? <CompactMatchup teams={teams} probability={probability} /> : <div className={`scoreboard-teams${teams.length === 1 ? " scoreboard-single" : ""}`}>
              {teams.map((team, i) => <TeamScore key={team.id} team={team} bye={teams.length === 1}
                spotlight={spotlight} showRoster={spotlight && teams.length === 1}
                probability={teams.length === 1 ? undefined : probability === null ? null : i === 0 ? probability : 1 - probability} />)}
            </div>}
            {spotlight && teams.length === 2 && <MatchupRoster left={teams[0]} right={teams[1]} />}
          </article>) : elimination?.teams.map(({ team, probability }) =>
          <article className="scoreboard-card scoreboard-elimination" key={team.id} aria-label={team.name}>
            <div className="scoreboard-teams scoreboard-single"><TeamScore team={team} probability={probability} risk spotlight={spotlight} showRoster={spotlight} /></div>
          </article>)}
        {mode === "head-to-head" && !matchups.length && <p className="scoreboard-empty">{snapshot.knockout ? "No head-to-head pairings. Select Guillotine below to see elimination risk." : "No matchups available this week."}</p>}
        {mode === "guillotine" && !elimination?.teams.length && <p className="scoreboard-empty">No teams with a positive projection this week.</p>}
      </Autoscroller>
      {spotlight && <Leaderboards snapshot={snapshot} />}
    </div>}
    {!state.snapshot && <section className="scoreboard-empty">
      <h2>{state.loading ? "Connecting to your league…" : "Scoreboard unavailable"}</h2>
      {!state.error && <p>Open your ESPN league in Chrome with the Multisport420 extension enabled.</p>}
    </section>}
    <footer className="scoreboard-toolbar">
      <div className="scoreboard-context">
        <h1>{state.snapshot?.leagueName ?? "Multisport420 Scoreboard"}</h1>
        {state.snapshot && <span>{state.snapshot.year} · Week {state.snapshot.week}</span>}
      </div>
      <div className="scoreboard-controls">
        <label>Mode <select value={mode} onChange={event => setSelectedMode(event.target.value as Mode)}>
          <option value="head-to-head">Head to head</option><option value="guillotine">Guillotine</option>
        </select></label>
        <button type="button" disabled={state.loading} onClick={() => void controller.refresh()}>{state.loading ? "Fetching…" : "Refresh"}</button>
        {state.snapshot && <button type="button" aria-pressed={scrollPaused} onClick={() => setScrollPaused(paused => !paused)}>
          {scrollPaused ? "Resume scrolling" : "Pause scrolling"}
        </button>}
      </div>
      <div className="scoreboard-status" aria-live="polite">
        {state.snapshot && <span>Updated {new Date(state.snapshot.fetchedAt).toLocaleTimeString()}</span>}
        {state.error && state.snapshot && <strong>Showing previous data</strong>}
        {live.error && <span>{live.error}</span>}
        {mode === "guillotine" && elimination?.thunderdome && <strong className="scoreboard-thunderdome">THUNDERDOME · {elimination.teams.length} at risk{elimination.hidden ? ` · ${elimination.hidden} below 1%` : ""}</strong>}
      </div>
      {mode === "guillotine" && elimination?.incomplete && <p className="scoreboard-error" role="status">Missing scores or projections. Elimination risk is unavailable.</p>}
      {state.error && <div className="scoreboard-error" role="alert">{state.error}</div>}
    </footer>
  </main>;
}
