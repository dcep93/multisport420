import type { Snapshot, Team } from "./data";
import type { PlayerScore, RosterPlayer } from "./players";
import { matchupRows } from "./matchupRows";
import { activityClass, activityLabel } from "./liveGames";
import type { ReactNode } from "react";

const points = (value: number | null) => value === null ? "—" : value.toFixed(2);

function PlayerLink({ player, className, children }: { player: PlayerScore; className: string; children?: ReactNode }) {
  const query = new URLSearchParams({ nameFilter: player.name.replace(/\s+/g, "_") });
  return <a className={`${className} scoreboard-player-link`} href={`https://fantasy420.web.app/#PlayerStats?${query}`}
    target="_blank" rel="noopener noreferrer" title={`${player.name} stats (opens in a new tab)`}>
    {children ?? player.name}
  </a>;
}

function PlayerPoints({ player }: { player?: PlayerScore }) {
  return player ? <>{points(player.score)}{!player.completed && <span className="scoreboard-player-projection" title="Player projection"> ({points(player.projected)})</span>}</> : <>—</>;
}

function PlayerName({ player }: { player?: RosterPlayer }) {
  return player ? <span className="scoreboard-player-label">
    <PlayerLink player={player} className="scoreboard-player-name" />
  </span> : <>—</>;
}

export function MatchupRoster({ left, right }: { left: Team; right: Team }) {
  const rows = matchupRows(left.players, right.players);
  return <div className="scoreboard-matchup-roster">
    {!left.players?.length && <p className="scoreboard-detail-empty">{left.name}: roster unavailable.</p>}
    {!right.players?.length && <p className="scoreboard-detail-empty">{right.name}: roster unavailable.</p>}
    {rows.length > 0 && <table aria-label={`${left.name} versus ${right.name} players`}>
      <colgroup><col className="scoreboard-matchup-score-col" /><col /><col className="scoreboard-matchup-position-col" /><col /><col className="scoreboard-matchup-score-col" /></colgroup>
      <thead><tr>
        <th scope="col" aria-label={`${left.name} score and projection`}>Score (proj)</th>
        <th scope="col" aria-label={`${left.name} player`}>Player</th><th scope="col">Position</th><th scope="col" aria-label={`${right.name} player`}>Player</th>
        <th scope="col" aria-label={`${right.name} score and projection`}>Score (proj)</th>
      </tr></thead>
      <tbody>{rows.map((row, index) => <tr key={row.key} className={row.reserve
        ? `scoreboard-bench${!rows[index - 1]?.reserve ? " scoreboard-reserve-start" : ""}` : undefined}>
        <td className={activityClass(row.left)} title={activityLabel(row.left?.activity)}><PlayerPoints player={row.left} /></td>
        <td className={activityClass(row.left)} title={activityLabel(row.left?.activity)}><PlayerName player={row.left} /></td>
        <th scope="row">{row.position}</th>
        <td className={activityClass(row.right)} title={activityLabel(row.right?.activity)}><PlayerName player={row.right} /></td>
        <td className={activityClass(row.right)} title={activityLabel(row.right?.activity)}><PlayerPoints player={row.right} /></td>
      </tr>)}</tbody>
    </table>}
  </div>;
}

export function Roster({ team }: { team: Team }) {
  if (!team.players?.length) return <p className="scoreboard-detail-empty">Roster unavailable.</p>;
  return <div className="scoreboard-roster">
    <table aria-label={`${team.name} players`}>
      <thead><tr><th scope="col">Player</th><th scope="col">Score <span>(proj)</span></th></tr></thead>
      <tbody>{team.players.map((player, index) => <tr key={player.id} title={activityLabel(player.activity)} className={[
        activityClass(player), player.slotId === 20 || player.slotId === 21
          ? `scoreboard-bench${![20, 21].includes(team.players![index - 1]?.slotId) ? " scoreboard-reserve-start" : ""}` : "",
      ].filter(Boolean).join(" ")}>
        <th scope="row"><span className="scoreboard-player-label">
          <span className="scoreboard-player-slot" title={`${player.position} · ${player.slot}`}>{player.slot}</span>
          <PlayerLink player={player} className="scoreboard-player-name" />
          </span>
        </th>
        <td><PlayerPoints player={player} /></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function Ranking({ title, players, showPosition = false }: { title: string; players: PlayerScore[]; showPosition?: boolean }) {
  return <section className="scoreboard-ranking" aria-label={title}>
    <h3>{title}</h3>
    {players.length ? <ol>{players.map((player, index) => <li key={player.id} className={activityClass(player)} title={activityLabel(player.activity)}>
      <span className="scoreboard-ranking-rank" aria-hidden="true">{index + 1}</span>
      <PlayerLink player={player} className="scoreboard-ranking-name">{player.name}{showPosition && <small>{player.position}</small>}</PlayerLink>
      <span className="scoreboard-ranking-points">{points(player.score)} <span>({points(player.seasonScore)})</span></span>
    </li>)}</ol> : <p className="scoreboard-detail-empty">No scored players yet.</p>}
  </section>;
}

export function Leaderboards({ snapshot }: { snapshot: Snapshot }) {
  return <aside className="scoreboard-leaderboards" aria-label="Weekly player leaders">
    <header><p className="scoreboard-eyebrow">Week {snapshot.week}</p><h2>Top performers</h2><p>Week points <span>(season total)</span></p></header>
    {snapshot.detailsWarning && <p className="scoreboard-detail-warning" role="status">{snapshot.detailsWarning}</p>}
    {snapshot.leaders ? <>
      <Ranking title="Unowned · All positions" players={snapshot.leaders.unowned} showPosition />
      {snapshot.leaders.positions.map(group => <Ranking key={group.position} title={group.position} players={group.players} />)}
    </> : <p className="scoreboard-detail-empty">Player leaders unavailable. Reload the updated Multisport420 extension and ESPN league tab, then refresh.</p>}
  </aside>;
}
