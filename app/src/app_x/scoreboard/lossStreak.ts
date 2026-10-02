type Matchup = { id?: number; matchupPeriodId?: number; winner?: string;
  home?: { teamId?: number }; away?: { teamId?: number } };
type League = { teams: { id: number; record?: { overall?: { streakType?: string; streakLength?: number } } }[];
  schedule: Matchup[] };

/** The hypothetical streak if this matchup is lost, never counting it twice. */
export function lossesIfThisWeekLost(data: League, teamId: number, period: number): number | undefined {
  if (period === 1) return 1;
  const history = data.schedule.filter(matchup => (matchup.matchupPeriodId ?? Infinity) < period
    && (matchup.home?.teamId === teamId || matchup.away?.teamId === teamId));
  const periods = new Map<number, Matchup[]>();
  history.forEach(matchup => {
    const week = matchup.matchupPeriodId!;
    const games = periods.get(week) ?? [];
    if (!games.some(game => game.home?.teamId === matchup.home?.teamId && game.away?.teamId === matchup.away?.teamId)) games.push(matchup);
    periods.set(week, games);
  });
  let count = 1;
  // Walk backwards so wins/ties break the streak and byes do not add a loss.
  for (let week = period - 1; week >= 1; week--) {
    const games = periods.get(week);
    if (!games?.length) return fromRecord();
    const played = games.filter(game => game.home?.teamId !== undefined && game.away?.teamId !== undefined);
    if (!played.length) continue;
    if (played.some(game => !["HOME", "AWAY", "TIE"].includes(game.winner ?? ""))) return fromRecord();
    if (played.some(game => game.winner === "TIE"
      || (game.winner === "HOME" ? game.home?.teamId : game.away?.teamId) === teamId)) return count;
    count++;
  }
  return count;

  function fromRecord() {
    // ESPN standings are a safe fallback only before the current result exists.
    const currentIsFinal = data.schedule.some(game => game.matchupPeriodId === period
      && (game.home?.teamId === teamId || game.away?.teamId === teamId)
      && ["HOME", "AWAY", "TIE"].includes(game.winner ?? ""));
    if (currentIsFinal) return undefined;
    const record = data.teams.find(team => team.id === teamId)?.record?.overall;
    if (record?.streakType === "WIN" || record?.streakType === "TIE") return 1;
    if (record?.streakType === "LOSS" && Number.isInteger(record.streakLength) && record.streakLength! >= 0
      && record.streakLength! < period) return record.streakLength! + 1;
    return undefined;
  }
}
