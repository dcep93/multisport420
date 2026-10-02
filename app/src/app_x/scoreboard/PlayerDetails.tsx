import type { Snapshot, Team } from "./data";
import type { PlayerScore } from "./players";

const points = (value: number | null) => value === null ? "—" : value.toFixed(2);

export function Roster({ team }: { team: Team }) {
  if (!team.players?.length) return <p className="scoreboard-detail-empty">Roster unavailable.</p>;
  return <div className="scoreboard-roster">
    {team.projectedLineup && !team.projectedLineup.warning && <p className="scoreboard-detail-note">★ Included in optimized projection</p>}
    {team.projectedLineup?.warning && <p className="scoreboard-detail-note">Using ESPN projection: {team.projectedLineup.warning}</p>}
    <table aria-label={`${team.name} players`}>
      <thead><tr><th scope="col">Player</th><th scope="col">Score <span>(proj)</span></th></tr></thead>
      <tbody>{team.players.map(player => <tr key={player.id} className={player.slotId === 20 || player.slotId === 21 ? "scoreboard-bench" : undefined}>
        <th scope="row"><span className="scoreboard-player-label">
          <span className="scoreboard-player-slot" title={`${player.position} · ${player.slot}`}>{player.slot}</span>
          <span className="scoreboard-player-name" title={player.name}>{player.name}</span>
          {player.optimizedSlot && <span className="scoreboard-optimized" title={`Included in optimized projection at ${player.optimizedSlot}`}>★</span>}
          </span>
        </th>
        <td>{points(player.score)}{!player.completed && <span className="scoreboard-player-projection" title="Player projection"> ({points(player.projected)})</span>}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function Ranking({ title, players }: { title: string; players: PlayerScore[] }) {
  return <section className="scoreboard-ranking" aria-label={title}>
    <h3>{title}</h3>
    {players.length ? <ol>{players.map(player => <li key={player.id}>
      <span className="scoreboard-ranking-name" title={`${player.name} · ${player.position}`}>{player.name}<small>{player.position}</small></span>
      <span className="scoreboard-ranking-points">{points(player.score)} <span>({points(player.seasonScore)})</span></span>
    </li>)}</ol> : <p className="scoreboard-detail-empty">No scored players yet.</p>}
  </section>;
}

export function Leaderboards({ snapshot }: { snapshot: Snapshot }) {
  return <aside className="scoreboard-leaderboards" aria-label="Weekly player leaders">
    <header><h2>Week {snapshot.week} leaders</h2><p>Top 5 · Week score (season score)</p></header>
    {snapshot.detailsWarning && <p className="scoreboard-detail-warning" role="status">{snapshot.detailsWarning}</p>}
    {snapshot.leaders ? <>
      <Ranking title="Unowned · All positions" players={snapshot.leaders.unowned} />
      {snapshot.leaders.positions.map(group => <Ranking key={group.position} title={group.position} players={group.players} />)}
    </> : <p className="scoreboard-detail-empty">Player leaders unavailable. Reload the updated Multisport420 extension and ESPN league tab, then refresh.</p>}
  </aside>;
}
