import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createScoreboardController } from "../../src/app_x/scoreboard/controller";
import { guillotine, headToHead, parseScoreboard } from "../../src/app_x/scoreboard/data";
import { guillotineSigma, headToHeadProbability, probNormalMinAll } from "../../src/app_x/scoreboard/probability";

export const league = () => ({
  id: 123, scoringPeriodId: 15, status: { currentMatchupPeriod: 14 }, settings: { name: "Sunday league" },
  teams: [{ id: 1, name: "Alpha" }, { id: 2, name: "Bravo" }, { id: 3, name: "Charlie" }],
  schedule: [
    { matchupPeriodId: 13, home: { teamId: 1, totalPointsLive: 999, totalProjectedPointsLive: 999 } },
    { matchupPeriodId: 14, home: { teamId: 1, totalPointsLive: 80, totalProjectedPointsLive: 120 }, away: { teamId: 2, totalPointsLive: 75, totalProjectedPointsLive: 110 } },
    { matchupPeriodId: 14, home: { teamId: 3, totalPointsLive: 0, totalProjectedPointsLive: 90 } },
  ],
});
const response = () => ({ data: league(), fetched: 1, year: 2026, fetchedAt: 1000 });

describe("recovered NFLStream probability models", () => {
  it("matches known head-to-head results and complementary odds", () => {
    const a = { score: 80, projected: 120 }, b = { score: 75, projected: 110 };
    // Independent high-precision CDF references; recovered erf is ~1e-7 accurate.
    expect(headToHeadProbability(a, b)).toBeCloseTo(0.680703961, 6);
    expect(headToHeadProbability(b, a)).toBeCloseTo(1 - 0.680703961, 6);
    expect(headToHeadProbability({ score: 110, projected: 120 }, { score: 105, projected: 110 })).toBeCloseTo(0.8067618846, 6);
  });
  it("handles ties, finished teams and projections below actual without NaN", () => {
    expect(headToHeadProbability({ score: 100, projected: 100 }, { score: 100, projected: 100 })).toBe(0.5);
    expect(headToHeadProbability({ score: 100, projected: 100 }, { score: 90, projected: 90 })).toBe(1);
    expect(headToHeadProbability({ score: 110, projected: 100 }, { score: 90, projected: 90 })).toBe(1);
    expect(guillotineSigma(100, 100)).toBe(0.01);
  });
  it("gives exchangeable teams equal elimination risk, including 18 teams", () => {
    expect(probNormalMinAll([], [])).toEqual([]);
    expect(probNormalMinAll([100], [10])).toEqual([1]);
    const probabilities = probNormalMinAll(Array(18).fill(110), Array(18).fill(12));
    probabilities.forEach(value => expect(value).toBeCloseTo(1 / 18, 7));
    expect(probabilities.reduce((a, b) => a + b)).toBeCloseTo(1, 12);
  });
  it("agrees with the two-normal closed form and resolves nearly finished teams", () => {
    expect(probNormalMinAll([100, 110], [10, 10])[0]).toBeCloseTo(0.76024994, 6);
    const risks = probNormalMinAll([90, 100, 110], [0.01, 0.01, 0.01]);
    expect(risks[0]).toBeCloseTo(1, 8);
    expect(risks[1]).toBeCloseTo(0, 8);
    const mixed = probNormalMinAll([100, 100, 100], [0.01, 10, 10]);
    expect(mixed[0]).toBeCloseTo(0.25, 5);
    expect(mixed[1]).toBeCloseTo(0.375, 5);
  });
  it("is invariant under shifting/scaling and permutation", () => {
    const means = [90, 105, 110, 140], sigmas = [0.01, 14, 20, 30];
    const base = probNormalMinAll(means, sigmas);
    const transformed = probNormalMinAll(means.map(x => 5 * x + 200), sigmas.map(x => 5 * x));
    base.forEach((p, i) => expect(transformed[i]).toBeCloseTo(p, 7));
    const reversed = probNormalMinAll([...means].reverse(), [...sigmas].reverse()).reverse();
    base.forEach((p, i) => expect(reversed[i]).toBeCloseTo(p, 12));
  });
});

describe("ESPN mapping", () => {
  it("supports ESPN's native Knockout teams array and excludes teams eliminated in earlier periods", () => {
    const data = { ...league(), scoringPeriodId: 2, status: { currentMatchupPeriod: 2 }, schedule: [{
      matchupPeriodId: 2, teams: [
        { teamId: 1, totalPointsLive: 2.2, totalProjectedPointsLive: 76.95, eliminationMatchupPeriod: 0 },
        { teamId: 2, totalPointsLive: 0, totalProjectedPointsLive: 87.75, eliminationMatchupPeriod: 0 },
        { teamId: 3, totalPointsLive: 0, totalProjectedPointsLive: 50, eliminationMatchupPeriod: 1 },
      ],
    }] };
    const snapshot = parseScoreboard(data, 2026, 1000);
    expect(snapshot.knockout).toBe(true);
    expect(snapshot.matchups[0].map(team => team.id)).toEqual([1, 2]);
    expect(guillotine(snapshot).teams).toHaveLength(2);
    expect(headToHead(snapshot)).toEqual([]);
  });
  it("uses current matchup period, live team totals, valid zero scores, and byes", () => {
    const snapshot = parseScoreboard(league(), 2026, 1000);
    expect(snapshot.matchups).toHaveLength(2);
    expect(snapshot.matchups[1][0].score).toBe(0);
    expect(headToHead(snapshot)[0].probability).toBeCloseTo(0.680703961, 6);
    expect(headToHead(snapshot)[1].probability).toBeNull();
  });
  it("falls back to scoring period and does not invent missing projections", () => {
    const data: any = league();
    delete data.status;
    data.scoringPeriodId = 14;
    delete data.schedule[1].home.totalProjectedPointsLive;
    const snapshot = parseScoreboard(data, 2026, 1000);
    expect(headToHead(snapshot)[0].probability).toBeNull();
    expect(guillotine(snapshot).incomplete).toBe(true);
    expect(guillotine(snapshot).teams.every(team => team.probability === null)).toBe(true);
  });
  it("shows head-to-head matchups closest to 50% first and unavailable probabilities last", () => {
    const matchups = [[120, 60], [120, 118], [null, 100], [100, 100]].map((pair, i) =>
      pair.map((projected, j) => ({ id: i * 2 + j, name: `Team ${i * 2 + j}`, score: 30, projected })));
    const result = headToHead({ leagueId: "123", leagueName: "League", year: 2026,
      week: 1, matchups, knockout: false, fetchedAt: 1000 });
    expect(result.map(matchup => matchup.key)).toEqual([3, 1, 0, 2]);
    expect(result[0].probability).toBeCloseTo(0.5);
    expect(result[3].probability).toBeNull();
  });
  it("deduplicates teams and applies the original zero-projection/THUNDERDOME rules", () => {
    const data = league();
    data.schedule.push(data.schedule[1]);
    const result = guillotine(parseScoreboard(data, 2026, 1000));
    expect(result.teams).toHaveLength(3);
    expect(result.thunderdome).toBe(true);
    expect(result.teams.reduce((sum, t) => sum + t.probability!, 0)).toBeCloseTo(1, 8);
    data.schedule[2].home.totalProjectedPointsLive = 0;
    expect(guillotine(parseScoreboard(data, 2026, 1000)).teams).toHaveLength(2);
  });
  it.each([3, 4])("shows highest elimination risk first with %i competing teams", (count) => {
    const teams = [110, 95, 105, 100].slice(0, count).map((projected, i) => ({
      id: i + 1, name: `Team ${i + 1}`, score: 50, projected,
    }));
    const result = guillotine({ leagueId: "123", leagueName: "League", year: 2026,
      week: 1, matchups: [teams], knockout: true, fetchedAt: 1000 });
    expect(result.thunderdome).toBe(count === 3);
    expect(result.teams.map(row => row.team.id)).toEqual(count === 3 ? [2, 3, 1] : [2, 4, 3, 1]);
  });
});

describe("refresh lifecycle", () => {
  it("coalesces refreshes and starts only once under effect replay", async () => {
    let resolve!: (result: any) => void;
    const transport = vi.fn(() => new Promise(r => { resolve = r; }));
    const controller = createScoreboardController({}, transport);
    controller.start(); controller.start();
    const a = controller.refresh(), b = controller.refresh();
    expect(a).toBe(b);
    await Promise.resolve();
    expect(transport).toHaveBeenCalledTimes(1);
    resolve(response());
    expect(await a).toEqual({ ok: true, fetchCount: 1 });
    expect(controller.getSnapshot().loading).toBe(false);
  });
  it("counts failed requests, retains stale data, and clears data if extension disappears", async () => {
    const transport = vi.fn().mockResolvedValueOnce(response())
      .mockResolvedValueOnce({ error: "ESPN returned HTTP 503", fetched: 1 })
      .mockResolvedValueOnce({ error: "Open your ESPN league", fetched: 0 })
      .mockRejectedValueOnce("extension unavailable");
    const controller = createScoreboardController({}, transport);
    await controller.refresh();
    await controller.refresh();
    expect(controller.getSnapshot().snapshot).not.toBeNull();
    expect(controller.getSnapshot().fetchCount).toBe(2);
    await controller.refresh();
    expect(controller.getSnapshot().fetchCount).toBe(2);
    await controller.refresh();
    expect(controller.getSnapshot().snapshot).toBeNull();
    expect(controller.getSnapshot().extensionAvailable).toBe(false);
  });
  it("bounds requests to older extensions which never reply", async () => {
    vi.useFakeTimers();
    try {
      const controller = createScoreboardController({}, () => new Promise(() => {}));
      const request = controller.refresh();
      await vi.advanceTimersByTimeAsync(22_000);
      expect(await request).toEqual({ ok: false, fetchCount: 0 });
      expect(controller.getSnapshot().loading).toBe(false);
      expect(controller.getSnapshot().error).toMatch(/extension/);
    } finally { vi.useRealTimers(); }
  });
});

function optimizationLeague(knockout = false) {
  const teamId = knockout ? 1 : 6;
  const entry = (id: number, slot: number, projection: number, locked = false) => ({
    playerId: id, lineupSlotId: slot, playerPoolEntry: { lineupLocked: locked, appliedStatTotal: locked ? 4 : 0,
      player: { fullName: `Player ${id}`, eligibleSlots: [2, 23, 20, 21], stats: [
        { seasonId: 2026, scoringPeriodId: 1, statSourceId: 1, statSplitTypeId: 1, appliedTotal: projection },
      ] } },
  });
  const side = { teamId, totalPointsLive: 4, totalProjectedPointsLive: 14,
    rosterForCurrentScoringPeriod: { entries: [entry(101, 23, 15, true), entry(102, 2, 10), entry(103, 20, 20)] } };
  const opponent = { teamId: 2, totalPointsLive: 0, totalProjectedPointsLive: 25 };
  return {
    id: knockout ? 367176096 : 203836968, scoringPeriodId: 1, status: { currentMatchupPeriod: 1 },
    settings: { name: 'Optimized league', rosterSettings: { lineupSlotCounts: { 2: 1, 23: 1, 20: 5, 21: 1 } } },
    teams: [{ id: teamId, name: 'Target' }, { id: 2, name: 'Opponent' }],
    schedule: [knockout ? { matchupPeriodId: 1, teams: [side, opponent] }
      : { matchupPeriodId: 1, home: side, away: opponent }],
  };
}

describe('optimized projected-roster integration', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('reproduces the observed Week 1 team 6 lineup while keeping completed starters and Deebo locked', () => {
    // Minimal data from the authenticated ESPN scoreboard on September 11, 2026.
    const rows: [number, string, number, number[], number, boolean, number][] = [
      [4429795, 'Jahmyr Gibbs', 20, [2, 23, 7], 22.43170392, false, 0],
      [4426502, 'Drake London', 20, [4, 23, 7], 13.82377896, false, 0],
      [4040715, 'Jalen Hurts', 0, [0, 7], 21.06553192, false, 0],
      [4870808, 'Jeremiyah Love', 20, [2, 23, 7], 13.86436638, false, 0],
      [2577417, 'Dak Prescott', 20, [0, 7], 16.74869081, false, 0],
      [4239993, 'Tee Higgins', 4, [4, 23, 7], 12.96375007, false, 0],
      [16800, 'Davante Adams', 23, [4, 23, 7], 13.82096676, true, 5.6],
      [16737, 'Mike Evans', 4, [4, 23, 7], 10.64994671, true, 16.9],
      [4038815, 'Rico Dowdle', 2, [2, 23, 7], 12.49457602, false, 0],
      [4035687, 'Michael Pittman Jr.', 23, [4, 23, 7], 12.31315342, false, 0],
      [3040151, 'George Kittle', 6, [6, 23, 7], 8.37113432, true, 3.2],
      [4371733, 'Kenny Gainwell', 7, [2, 23, 7], 12.02627838, false, 0],
      [4047365, 'Josh Jacobs', 2, [2, 23, 7], 0, false, 0],
      [-16023, 'Steelers D/ST', 16, [16], 7.19670025, false, 0],
      [2971573, "Ka'imi Fairbairn", 17, [17], 9.77014412, false, 0],
      [3126486, 'Deebo Samuel Sr.', 20, [4, 23, 7], 8.91619953, true, 18],
    ];
    const data: any = optimizationLeague();
    data.settings.rosterSettings.lineupSlotCounts = { 0: 1, 2: 2, 4: 2, 6: 1, 7: 1, 16: 1, 17: 1, 20: 5, 21: 1, 23: 2 };
    Object.assign(data.schedule[0].home, {
      totalPointsLive: 25.7, totalProjectedPointsLive: 113.53013418,
      rosterForCurrentScoringPeriod: { entries: rows.map(([playerId, fullName, lineupSlotId, eligibleSlots, projection, lineupLocked, appliedStatTotal]) => ({
        playerId, lineupSlotId, playerPoolEntry: { lineupLocked, appliedStatTotal,
          player: { fullName, eligibleSlots: [...eligibleSlots, 20, 21], stats: [
            { seasonId: 2026, scoringPeriodId: 1, statSourceId: 1, statSplitTypeId: 1, appliedTotal: projection },
          ] } },
      })) },
    });
    const team = parseScoreboard(data, 2026, 1000).matchups[0][0];
    expect(team.projected).toBeCloseTo(143.56466643, 8);
    expect(team.score).toBe(25.7);
    const starters = team.projectedLineup!.players;
    expect(starters.map(player => player.name).sort()).toEqual([
      'Jahmyr Gibbs', 'Drake London', 'Jalen Hurts', 'Jeremiyah Love', 'Dak Prescott',
      'Tee Higgins', 'Davante Adams', 'Mike Evans', 'George Kittle', 'Steelers D/ST', "Ka'imi Fairbairn",
    ].sort());
    expect(starters.find(player => player.name === 'Davante Adams')).toMatchObject({ slotId: 23, locked: true });
    expect(starters.find(player => player.name === 'Mike Evans')).toMatchObject({ slotId: 4, locked: true });
    expect(starters.find(player => player.name === 'George Kittle')).toMatchObject({ slotId: 6, locked: true });
    expect(starters.filter(player => [0, 7].includes(player.slotId)).map(player => player.name).sort())
      .toEqual(['Dak Prescott', 'Jalen Hurts']);
    expect(starters.find(player => player.name === 'Jalen Hurts')).toMatchObject({ slotId: 0 });
    expect(starters.find(player => player.name === 'Dak Prescott')).toMatchObject({ slotId: 7 });
    expect(starters.find(player => player.name === 'Drake London')).toMatchObject({ slotId: 4 });
  });

  it.each([false, true])('corrects only the target and feeds the projected total into probabilities (knockout=%s)', knockout => {
    const data = optimizationLeague(knockout);
    const snapshot = parseScoreboard(data, 2026, 1000);
    const [target, opponent] = snapshot.matchups[0];
    expect(target.score).toBe(4);
    expect(target.projected).toBe(24);
    expect(target.projectedLineup?.players.map(player => player.name).sort()).toEqual(['Player 101', 'Player 103']);
    expect(opponent).toEqual({ id: 2, name: 'Opponent', score: 0, projected: 25 });
    if (knockout) {
      const targetRisk = guillotine(snapshot).teams.find(row => row.team.id === 1)!.probability;
      expect(targetRisk).toBeCloseTo(probNormalMinAll([24, 25], [guillotineSigma(4, 24), guillotineSigma(0, 25)])[0], 8);
    } else {
      expect(headToHead(snapshot)[0].probability).toBeCloseTo(headToHeadProbability(opponent as any, target as any), 8);
    }
  });

  it('publishes the updated snapshot before logging each selected player once per coalesced fetch', async () => {
    const data = optimizationLeague();
    data.schedule.push(data.schedule[0]);
    const controller = createScoreboardController({}, vi.fn().mockResolvedValue({ data, year: 2026, fetchedAt: 1000, fetched: 1 }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {
      expect(controller.getSnapshot().snapshot!.matchups[0][0].projected).toBe(24);
    });
    const a = controller.refresh(), b = controller.refresh();
    expect(a).toBe(b);
    await a;
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('[Multisport420] Projected roster', expect.stringContaining('RB: Player 103'), expect.objectContaining({
      leagueId: '203836968', teamId: 6, week: 1, projected: 24,
      players: expect.arrayContaining([
        expect.objectContaining({ name: 'Player 101', slotId: 23, locked: true }),
        expect.objectContaining({ name: 'Player 103', slotId: 2, locked: false }),
      ]),
    }));
    await controller.refresh();
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('retains ESPN projection and explains missing optimization metadata without claiming a selected lineup', async () => {
    const data: any = optimizationLeague();
    delete data.settings.rosterSettings;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const controller = createScoreboardController({}, vi.fn().mockResolvedValue({ data, year: 2026, fetchedAt: 1000, fetched: 1 }));
    expect((await controller.refresh()).ok).toBe(true);
    expect(controller.getSnapshot().snapshot!.matchups[0][0].projected).toBe(14);
    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[Multisport420] Projected roster unchanged', expect.objectContaining({ teamId: 6, reason: expect.any(String) }));
  });

  it('does not log selected players for untargeted leagues or failed fetches', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const controller = createScoreboardController({}, vi.fn().mockResolvedValueOnce(response())
      .mockResolvedValueOnce({ error: 'Fetch failed', fetched: 1 }));
    await controller.refresh();
    await controller.refresh();
    expect(log).not.toHaveBeenCalled();
  });
});
