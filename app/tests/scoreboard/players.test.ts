import { describe, expect, it } from "vitest";
import { parseScoreboard } from "../../src/app_x/scoreboard/data";

const stat = (value: number, week = 4, source = 0, year = 2026) => ({
  seasonId: year, scoringPeriodId: week, statSourceId: source,
  statSplitTypeId: week === 0 ? 0 : 1, appliedTotal: value,
});
export const player = (id: number, score: number, position = 1, owner = 0) => ({
  id, onTeamId: owner, player: { id, fullName: `Player ${id}`, defaultPositionId: position,
    proTeamId: id, stats: [stat(score), stat(score + 40, 0), stat(20, 4, 1)] },
});
export function detailLeague() {
  const roster = [
    { playerId: 1, lineupSlotId: 0, playerPoolEntry: { ...player(1, 12, 1, 1), lineupLocked: true, appliedStatTotal: 13 } },
    { playerId: 2, lineupSlotId: 20, playerPoolEntry: { ...player(2, 25, 2, 1), lineupLocked: true, appliedStatTotal: 25 } },
    { playerId: 3, lineupSlotId: 21, playerPoolEntry: player(3, 0, 3, 1) },
  ];
  return {
    id: 123, scoringPeriodId: 4, teams: [{ id: 1, name: "Alpha", roster: { entries: roster } }, { id: 2, name: "Bravo" }],
    schedule: [{ matchupPeriodId: 4, home: { teamId: 1, totalPointsLive: 13, totalProjectedPointsLive: 20,
      rosterForCurrentScoringPeriod: { entries: roster } }, away: { teamId: 2, totalPointsLive: 0, totalProjectedPointsLive: 10 } }],
    scoreboardDetails: {
      players: [player(1, 12, 1, 1), player(2, 25, 2, 1), player(3, 0, 3, 1),
        ...Array.from({ length: 7 }, (_, i) => player(i + 4, 30 - i))],
      proTeams: [{ id: 1, proGamesByScoringPeriod: { 4: [{ statsOfficial: false }] } },
        { id: 2, proGamesByScoringPeriod: { 4: [{ statsOfficial: true }] } }],
    },
  };
}

describe("roster detail and weekly leaders", () => {
  it("includes bench and IR, uses live actuals and distinguishes a locked live game from a completed game", () => {
    const snapshot = parseScoreboard(detailLeague(), 2026, 1000);
    expect(snapshot.matchups[0][0].players).toMatchObject([
      { id: 1, score: 13, projected: 20, completed: false, slot: "QB" },
      { id: 2, score: 25, projected: 20, completed: true, slot: "Bench" },
      { id: 3, score: 0, slot: "IR" },
    ]);
    expect(snapshot.matchups[0][0].score).toBe(13);
  });

  it("ranks five per position by weekly actual, with season actuals and league-specific free agents", () => {
    const snapshot = parseScoreboard(detailLeague(), 2026, 1000);
    expect(snapshot.leaders?.positions.find(group => group.position === "QB")?.players.map(p => p.id)).toEqual([4, 5, 6, 7, 8]);
    expect(snapshot.leaders?.unowned.map(p => p.id)).toEqual([4, 5, 6, 7, 8]);
    expect(snapshot.leaders?.unowned[0]).toMatchObject({ score: 30, seasonScore: 70 });
  });

  it("excludes rostered players even with stale free-agent metadata and excludes unknown ownership", () => {
    const data = detailLeague();
    data.teams.push({ id: 3, name: "Eliminated", roster: { entries: [
      { playerId: 4, lineupSlotId: 20, playerPoolEntry: player(4, 30) },
    ] } } as any);
    delete (data.scoreboardDetails.players.find(p => p.id === 5) as any).onTeamId;
    const snapshot = parseScoreboard(data, 2026, 1000);
    expect(snapshot.leaders?.unowned.map(p => p.id)).toEqual([6, 7, 8, 9, 10]);
  });

  it("does not let a prior matchup's roster hide a currently unowned player", () => {
    const data = detailLeague();
    data.schedule.push({ matchupPeriodId: 3, home: { teamId: 1, rosterForCurrentScoringPeriod: { entries: [
      { playerId: 4, lineupSlotId: 20, playerPoolEntry: player(4, 30) },
    ] } } } as any);
    expect(parseScoreboard(data, 2026, 1000).leaders?.unowned[0].id).toBe(4);
  });

  it("ignores wrong-year, projected and missing stats without turning missing into zero", () => {
    const data = detailLeague();
    data.scoreboardDetails.players[3].player.stats = [stat(1000, 4, 0, 2025), stat(900, 4, 1)];
    data.scoreboardDetails.players[4].player.stats = [stat(0)];
    const snapshot = parseScoreboard(data, 2026, 1000);
    expect(snapshot.leaders?.unowned.some(p => p.id === 4)).toBe(false);
    const zero = snapshot.leaders?.positions.find(group => group.position === "QB")?.players;
    expect(zero?.some(p => p.id === 4)).toBe(false);
    data.scoreboardDetails.players = [data.scoreboardDetails.players[4]];
    expect(parseScoreboard(data, 2026, 1000).leaders?.unowned[0]).toMatchObject({ score: 0, seasonScore: null });
  });

  it("deduplicates pool entries and retains core scores when optional details fail", () => {
    const data = detailLeague();
    data.scoreboardDetails.players.push(data.scoreboardDetails.players[3]);
    expect(parseScoreboard(data, 2026, 1000).leaders?.unowned.map(p => p.id)).toEqual([4, 5, 6, 7, 8]);
    (data as any).scoreboardDetails = { warning: "Player pool unavailable" };
    const snapshot = parseScoreboard(data, 2026, 1000);
    expect(snapshot.leaders).toBeUndefined();
    expect(snapshot.detailsWarning).toBe("Player pool unavailable");
    expect(snapshot.matchups[0][0].players).toHaveLength(3);
  });
});
