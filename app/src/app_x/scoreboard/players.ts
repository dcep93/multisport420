import type { ProjectedLineup } from "./lineup";
import type { PlayerActivity } from "./liveGames";

export type PlayerScore = {
  id: number; name: string; position: string; score: number | null;
  seasonScore: number | null; projected: number | null; completed: boolean;
  proTeamId?: number; activity?: PlayerActivity;
};
export type RosterPlayer = PlayerScore & { slot: string; slotId: number; optimizedSlot?: string };
export type Leaders = { positions: { position: string; players: PlayerScore[] }[]; unowned: PlayerScore[] };

type Stat = { seasonId?: number; scoringPeriodId?: number; statSourceId?: number; statSplitTypeId?: number; appliedTotal?: number };
type RawPlayer = { id?: number; fullName?: string; defaultPositionId?: number; proTeamId?: number; onTeamId?: number; stats?: Stat[] };
type PoolEntry = { id?: number; onTeamId?: number; appliedStatTotal?: number; player?: RawPlayer };
type Entry = { playerId?: number; lineupSlotId?: number; playerPoolEntry?: PoolEntry };
type Side = { teamId?: number; rosterForCurrentScoringPeriod?: { entries?: Entry[] } };
type ProTeam = { id?: number; proGamesByScoringPeriod?: Record<string, { statsOfficial?: boolean }[]> };
type League = {
  scoringPeriodId: number;
  status?: { currentMatchupPeriod?: number };
  teams: { id: number; roster?: { entries?: Entry[] } }[];
  schedule: { matchupPeriodId?: number; home?: Side; away?: Side; teams?: Side[] }[];
  scoreboardDetails?: { players?: PoolEntry[]; proTeams?: ProTeam[]; warning?: string };
};
const POSITIONS: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 6: "P",
  7: "DT", 8: "DE", 9: "LB", 10: "CB", 11: "S", 12: "DB", 13: "DL", 14: "DP", 16: "D/ST" };
const SLOTS: Record<number, string> = { 0: "QB", 1: "TQB", 2: "RB", 3: "RB/WR", 4: "WR", 5: "WR/TE", 6: "TE", 7: "OP",
  8: "DT", 9: "DE", 10: "LB", 11: "DL", 12: "CB", 13: "S", 14: "DB", 15: "DP", 16: "D/ST", 17: "K", 18: "P", 19: "HC", 20: "Bench", 21: "IR", 23: "FLEX" };
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

function pointsFor(player: RawPlayer, year: number, week: number, source: number) {
  const rows = player.stats?.filter(stat => stat.seasonId === year && stat.scoringPeriodId === week && stat.statSourceId === source
    && (stat.statSplitTypeId === undefined || stat.statSplitTypeId === (week === 0 ? 0 : 1))) ?? [];
  const value = finite(rows[0]?.appliedTotal);
  return rows.length && rows.every(row => finite(row.appliedTotal) === value) ? value : null;
}

/** Normalize detail data once per snapshot, keeping roster totals separate from team totals. */
export function playerDetails(data: League, year: number) {
  const details = data.scoreboardDetails;
  const week = data.scoringPeriodId;
  const pools = new Map((details?.players ?? []).flatMap(pool => {
    const id = pool.player?.id ?? pool.id;
    return Number.isSafeInteger(id) ? [[id!, pool] as const] : [];
  }));
  const proTeams = new Map((details?.proTeams ?? []).map(team => [team.id, team]));
  const rosterFor = (side: Side) => side.rosterForCurrentScoringPeriod?.entries
    ?? data.teams.find(team => team.id === side.teamId)?.roster?.entries;
  const normalize = (pool: PoolEntry, id: number): PlayerScore => {
    const player = pool.player ?? {};
    const games = proTeams.get(player.proTeamId)?.proGamesByScoringPeriod?.[week];
    return { id, name: player.fullName || `Player ${id}`,
      ...(Number.isSafeInteger(player.proTeamId) ? { proTeamId: player.proTeamId } : {}),
      position: POSITIONS[player.defaultPositionId ?? 0] ?? (player.defaultPositionId ? `Position ${player.defaultPositionId}` : "—"),
      score: pointsFor(player, year, week, 0), seasonScore: pointsFor(player, year, 0, 0),
      projected: pointsFor(player, year, week, 1),
      completed: Boolean(games?.length && games.every(game => game.statsOfficial === true)) };
  };
  const roster = (side: Side, optimized?: ProjectedLineup | null): RosterPlayer[] | undefined => {
    const entries = rosterFor(side);
    if (!entries) return undefined;
    return entries.map(entry => {
      const id = entry.playerId ?? entry.playerPoolEntry?.player?.id ?? entry.playerPoolEntry?.id ?? 0;
      const pool = entry.playerPoolEntry;
      const supplemental = pools.get(id);
      const merged = { ...supplemental, ...pool, player: { ...supplemental?.player, ...pool?.player,
        stats: [...(pool?.player?.stats ?? []), ...(supplemental?.player?.stats ?? [])] } };
      // Roster stats may be newer than supplemental cards. Prefer a complete
      // weekly/season row from the roster, falling back to cards per metric.
      const main = normalize(pool ?? {}, id), backup = normalize(supplemental ?? {}, id);
      const record = normalize(merged, id);
      const slotId = entry.lineupSlotId ?? -1;
      const pick = optimized?.players.find(player => player.id === id);
      return { ...record, score: finite(pool?.appliedStatTotal) ?? main.score ?? backup.score,
        projected: main.projected ?? backup.projected, seasonScore: main.seasonScore ?? backup.seasonScore,
        slotId, slot: SLOTS[slotId] ?? "—", ...(pick ? { optimizedSlot: pick.slot } : {}) };
    }).sort((a, b) => Number(a.slotId === 20 || a.slotId === 21) - Number(b.slotId === 20 || b.slotId === 21)
      || a.slotId - b.slotId || a.id - b.id);
  };

  let leaders: Leaders | undefined;
  if (Array.isArray(details?.players)) {
    const owned = new Set<number>();
    const markOwned = (entries?: Entry[]) => entries?.forEach(entry => {
      const id = entry.playerId ?? entry.playerPoolEntry?.player?.id ?? entry.playerPoolEntry?.id;
      if (id !== undefined) owned.add(id);
    });
    data.teams.forEach(team => markOwned(team.roster?.entries));
    // Only current scoring-period rosters establish ownership; historical
    // schedule rosters must not hide players subsequently released.
    data.schedule.filter(matchup => matchup.matchupPeriodId === (data.status?.currentMatchupPeriod ?? week))
      .forEach(matchup => (matchup.teams ?? [matchup.home, matchup.away]).forEach(side => {
      if (side) markOwned(side.rosterForCurrentScoringPeriod?.entries);
    }));
    const sorted = [...pools].map(([id, pool]) => normalize(pool, id)).filter(player => player.score !== null)
      .sort((a, b) => b.score! - a.score! || a.name.localeCompare(b.name) || a.id - b.id);
    const groups = new Map<string, PlayerScore[]>();
    // Always include standard fantasy positions, even before their games start.
    ["QB", "RB", "WR", "TE", "K", "D/ST"].forEach(position => groups.set(position, []));
    sorted.forEach(player => {
      const group = groups.get(player.position) ?? [];
      if (group.length < 5) group.push(player);
      groups.set(player.position, group);
    });
    leaders = { positions: [...groups].map(([position, players]) => ({ position, players })),
      unowned: sorted.filter(player => {
        const pool = pools.get(player.id)!;
        return !owned.has(player.id) && (pool.onTeamId ?? pool.player?.onTeamId) === 0;
      }).slice(0, 5) };
  }
  return { roster, leaders, warning: details?.warning };
}
