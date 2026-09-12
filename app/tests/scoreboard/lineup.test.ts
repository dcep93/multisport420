import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { optimizeProjectedLineup } from "../../src/app_x/scoreboard/lineup";

const player = (id: number, projection: number, eligibleSlots: number[], lineupSlotId = 20, locked = false): any => ({
  playerId: id, lineupSlotId,
  playerPoolEntry: { lineupLocked: locked, appliedStatTotal: 0, player: {
    fullName: `Player ${id}`, eligibleSlots,
    stats: [{ seasonId: 2026, scoringPeriodId: 1, statSourceId: 1, statSplitTypeId: 1, appliedTotal: projection }],
  } },
});
const fixture = (entries: any[] = [player(1, 10, [0, 7], 0)], counts: any = { 0: 1, 20: 5, 21: 1 }) => ({
  data: { id: 203836968, scoringPeriodId: 1, settings: { rosterSettings: { lineupSlotCounts: counts } }, teams: [] } as any,
  side: { teamId: 6, totalProjectedPointsLive: 100, rosterForCurrentScoringPeriod: { entries } } as any,
});
const optimize = ({ data, side }: ReturnType<typeof fixture>) => optimizeProjectedLineup(data, side, 2026)!;
const assignments = (f: ReturnType<typeof fixture>) => optimize(f).players.map(p => [p.slotId, p.id]);

describe("projected lineup optimization", () => {
  it("scopes changes to the exact two league/team pairs", () => {
    for (const [league, team, targeted] of [[203836968, 6, true], [367176096, 1, true], [203836968, 1, false], [367176096, 6, false], [123, 6, false]] as const) {
      const f = fixture(); f.data.id = String(league); f.side.teamId = team;
      expect(optimize(f) !== null).toBe(targeted);
    }
    expect(optimizeProjectedLineup(null, null, 2026)).toBeNull();
  });

  it("solves overlapping FLEX and OP assignments globally", () => {
    const f = fixture([
      player(1, 30, [0, 7], 0), player(2, 29, [0, 7]),
      player(3, 28, [2, 7, 23], 2), player(4, 27, [2, 7, 23]),
      player(5, 26, [4, 7, 23], 4), player(6, 25, [4, 7, 23]),
    ], { 0: 1, 2: 1, 4: 1, 7: 1, 23: 1, 20: 5 });
    expect(optimize(f).players.map(p => p.id).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(assignments(f)).toEqual([[0, 1], [2, 3], [4, 5], [7, 2], [23, 4]]);
    expect(optimize(f).projected).toBe(156);
  });

  it("avoids the greedy trap of consuming the only flexible eligible player", () => {
    const f = fixture([player(1, 10, [2, 23], 2), player(2, 9, [2])], { 2: 1, 23: 1 });
    expect(assignments(f)).toEqual([[2, 2], [23, 1]]);
  });

  it("puts higher projections in dedicated slots when complete lineup totals tie", () => {
    const dak = player(1, 20, [0, 7], 0), hurts = player(2, 25, [0, 7], 7);
    dak.playerPoolEntry.player.fullName = "Dak Prescott";
    hurts.playerPoolEntry.player.fullName = "Jalen Hurts";
    const quarterbacks = fixture([dak, hurts], { 0: 1, 7: 1 });
    expect(optimize(quarterbacks).players.map(p => [p.slot, p.name])).toEqual([
      ["QB", "Jalen Hurts"], ["OP", "Dak Prescott"],
    ]);
    expect(optimize(quarterbacks).projected).toBe(100);

    const dobbins = player(3, 12, [2, 23], 2), taylor = player(4, 18, [2, 23], 23);
    dobbins.playerPoolEntry.player.fullName = "J.K. Dobbins";
    taylor.playerPoolEntry.player.fullName = "Jonathan Taylor";
    const runningBacks = fixture([dobbins, taylor], { 2: 1, 23: 1 });
    runningBacks.data.id = 367176096; runningBacks.side.teamId = 1;
    expect(optimize(runningBacks).players.map(p => [p.slot, p.name])).toEqual([
      ["RB", "Jonathan Taylor"], ["FLEX", "J.K. Dobbins"],
    ]);
    expect(optimize(runningBacks).projected).toBe(100);
    runningBacks.side.rosterForCurrentScoringPeriod.entries.reverse();
    expect(assignments(runningBacks)).toEqual([[2, 4], [23, 3]]);
  });

  it("matches an exhaustive assignment oracle on varied small rosters", () => {
    let seed = 417;
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
    const slots = [2, 2, 7, 23];
    for (let sample = 0; sample < 40; sample++) {
      const entries = Array.from({ length: 6 }, (_, i) => {
        const eligible = [2, 7, 23].filter(() => random() < 0.5);
        return player(i + 1, Math.floor(random() * 12) - 4, eligible.length ? eligible : [0]);
      });
      let oracle = { filled: 0, score: 0 };
      const enumerate = (index: number, used: Set<number>, score: number) => {
        if (index === slots.length) {
          if (used.size > oracle.filled || (used.size === oracle.filled && score > oracle.score)) oracle = { filled: used.size, score };
          return;
        }
        enumerate(index + 1, used, score);
        for (const entry of entries) {
          if (used.has(entry.playerId) || !entry.playerPoolEntry.player.eligibleSlots.includes(slots[index])) continue;
          used.add(entry.playerId);
          enumerate(index + 1, used, score + entry.playerPoolEntry.player.stats[0].appliedTotal);
          used.delete(entry.playerId);
        }
      };
      enumerate(0, new Set(), 0);
      const result = optimize(fixture(entries, { 2: 2, 7: 1, 23: 1 }));
      expect(result.warning).toBeUndefined();
      expect(result.players.length).toBe(oracle.filled);
      expect(result.players.reduce((sum, p) => sum + p.projection!, 0)).toBe(oracle.score);
      expect(new Set(result.players.map(p => p.id)).size).toBe(result.players.length);
    }
  });

  it("freezes locked FLEX starters and excludes locked bench and IR players", () => {
    const locked = player(1, 10, [2, 23], 23, true);
    locked.playerPoolEntry.appliedStatTotal = 18;
    const f = fixture([locked, player(2, 9, [2, 23], 2), player(3, 99, [2, 23], 20, true), player(4, 100, [2, 23], 21)], { 2: 1, 23: 1, 20: 5, 21: 1 });
    expect(assignments(f)).toEqual([[2, 2], [23, 1]]);
    expect(optimize(f).players[1]).toEqual({ id: 1, name: "Player 1", slotId: 23, slot: "FLEX", projection: 10, locked: true, actual: 18 });
    expect(optimize(f).projected).toBe(100);
  });

  it("preserves locked live contributions using only the unlocked projection delta", () => {
    const locked = player(1, 15, [0, 7], 0, true);
    locked.playerPoolEntry.appliedStatTotal = 32;
    const f = fixture([locked, player(2, 10, [2], 2), player(3, 20, [2])], { 0: 1, 2: 1 });
    f.side.totalProjectedPointsLive = 42;
    expect(optimize(f).projected).toBe(52);
    expect(optimize(f).players[0].projection).toBe(15);
    expect(optimize(f).players[0].actual).toBe(32);
  });

  it("keeps a locked QB in OP and supports configured defense and kicker slots", () => {
    const f = fixture([player(1, 40, [0, 7], 7, true), player(2, 30, [0, 7]), player(-3, 10, [16]), player(4, 8, [17])], { 0: 1, 7: 1, 16: 1, 17: 1 });
    expect(assignments(f)).toEqual([[0, 2], [7, 1], [16, -3], [17, 4]]);
  });

  it("does not require projections or eligibility for immovable locked starters", () => {
    const locked = player(1, 15, [0], 0, true);
    delete locked.playerPoolEntry.player.stats;
    delete locked.playerPoolEntry.player.eligibleSlots;
    const f = fixture([locked]);
    expect(optimize(f).warning).toBeUndefined();
    expect(optimize(f).players[0].projection).toBeNull();
    expect(optimize(f).projected).toBe(100);
  });

  it("prefers authoritative scoring-period roster and falls back only when absent", () => {
    const f = fixture([player(1, 10, [0], 0)]);
    f.data.teams = [{ id: 6, roster: { entries: [player(2, 20, [0], 0)] } }];
    expect(assignments(f)).toEqual([[0, 1]]);
    delete f.side.rosterForCurrentScoringPeriod;
    expect(assignments(f)).toEqual([[0, 2]]);
    f.side.rosterForCurrentScoringPeriod = {};
    expect(optimize(f).warning).toMatch(/roster/i);
  });

  it("fills slots before maximizing score, retaining zero and negative values", () => {
    const f = fixture([player(1, 0, [2]), player(2, -3, [2, 23]), player(3, -2, [23])], { 2: 1, 23: 1 });
    expect(assignments(f)).toEqual([[2, 1], [23, 3]]);
    expect(optimize(f).projected).toBe(98);
    expect(optimize(f).emptySlots).toEqual([]);
  });

  it("reports unfillable slots, including repeated slot types", () => {
    const f = fixture([player(1, 10, [0], 0)], { 0: 1, 2: 2, 23: 1 });
    expect(optimize(f).emptySlots).toEqual([2, 2, 23]);
    expect(optimize(f).projected).toBe(100);
  });

  it("uses only the requested season, scoring period, projection source and weekly split", () => {
    const p = player(1, 10, [0], 0);
    p.playerPoolEntry.player.stats.unshift(
      { seasonId: 2025, scoringPeriodId: 1, statSourceId: 1, statSplitTypeId: 1, appliedTotal: 99 },
      { seasonId: 2026, scoringPeriodId: 2, statSourceId: 1, statSplitTypeId: 1, appliedTotal: 98 },
      { seasonId: 2026, scoringPeriodId: 1, statSourceId: 0, statSplitTypeId: 1, appliedTotal: 97 },
      { seasonId: 2026, scoringPeriodId: 1, statSourceId: 1, statSplitTypeId: 0, appliedTotal: 96 },
    );
    expect(optimize(fixture([p])).players[0].projection).toBe(10);
  });

  it("has stable ties across entry order and unlocked original placements", () => {
    const f = fixture([player(2, 10, [2, 23], 2), player(1, 10, [2, 23], 23), player(3, 10, [2, 23])], { 23: 1, 2: 1 });
    const expected = optimize(f);
    f.side.rosterForCurrentScoringPeriod.entries.reverse();
    f.side.rosterForCurrentScoringPeriod.entries[0].lineupSlotId = 2;
    f.side.rosterForCurrentScoringPeriod.entries[2].lineupSlotId = 20;
    expect(optimize(f)).toEqual(expected);
    expect(assignments(f)).toEqual([[2, 1], [23, 2]]);
  });

  it("does not mutate the source or write console output", () => {
    const f = fixture(); const before = JSON.stringify(f);
    const log = vi.spyOn(console, "log");
    try { optimize(f); expect(JSON.stringify(f)).toBe(before); expect(log).not.toHaveBeenCalled(); }
    finally { log.mockRestore(); }
  });

  it.each([
    ["unknown locks", (f: any) => { delete f.side.rosterForCurrentScoringPeriod.entries[0].playerPoolEntry.lineupLocked; }],
    ["unknown eligibility", (f: any) => { delete f.side.rosterForCurrentScoringPeriod.entries[0].playerPoolEntry.player.eligibleSlots; }],
    ["empty eligibility", (f: any) => { f.side.rosterForCurrentScoringPeriod.entries[0].playerPoolEntry.player.eligibleSlots = []; }],
    ["missing projections", (f: any) => { f.side.rosterForCurrentScoringPeriod.entries[0].playerPoolEntry.player.stats = []; }],
    ["nonfinite projections", (f: any) => { f.side.rosterForCurrentScoringPeriod.entries[0].playerPoolEntry.player.stats[0].appliedTotal = Infinity; }],
    ["missing roster", (f: any) => { delete f.side.rosterForCurrentScoringPeriod; }],
    ["missing counts", (f: any) => { delete f.data.settings.rosterSettings; }],
    ["negative counts", (f: any) => { f.data.settings.rosterSettings.lineupSlotCounts[0] = -1; }],
    ["fractional counts", (f: any) => { f.data.settings.rosterSettings.lineupSlotCounts[0] = 1.5; }],
    ["string counts", (f: any) => { f.data.settings.rosterSettings.lineupSlotCounts[0] = "1"; }],
    ["unsafe slot count", (f: any) => { f.data.settings.rosterSettings.lineupSlotCounts[0] = 31; }],
    ["duplicate IDs", (f: any) => { f.side.rosterForCurrentScoringPeriod.entries.push(player(1, 20, [0])); }],
    ["invalid current slot", (f: any) => { f.side.rosterForCurrentScoringPeriod.entries[0].lineupSlotId = 99; }],
    ["ineligible current slot", (f: any) => { f.side.rosterForCurrentScoringPeriod.entries[0].playerPoolEntry.player.eligibleSlots = [2]; }],
    ["conflicting projection rows", (f: any) => { const rows = f.side.rosterForCurrentScoringPeriod.entries[0].playerPoolEntry.player.stats; rows.push({ ...rows[0], appliedTotal: 11 }); }],
    ["oversized roster", (f: any) => { f.side.rosterForCurrentScoringPeriod.entries = Array.from({ length: 65 }, (_, i) => player(i, 10, [0])); }],
    ["overfilled locked slots", (f: any) => { f.side.rosterForCurrentScoringPeriod.entries = [player(1, 10, [0], 0, true), player(2, 20, [0], 0, true)]; }],
    ["missing scoring period", (f: any) => { delete f.data.scoringPeriodId; }],
  ])("falls back explicitly for %s", (_name, change) => {
    const f = fixture(); change(f);
    expect(optimize(f)).toMatchObject({ projected: 100, players: [], emptySlots: [], warning: expect.any(String) });
  });

  it.each([undefined, null, NaN, Infinity, "100"])("does not invent an invalid baseline: %s", baseline => {
    const f = fixture(); f.side.totalProjectedPointsLive = baseline;
    expect(optimize(f)).toMatchObject({ projected: null, players: [], warning: expect.any(String) });
  });
});
