import { expect, it } from "vitest";
import { lossesIfThisWeekLost, winsIfThisWeekWon } from "../../src/app_x/scoreboard/lossStreak";

const game = (week: number, winner: string, reverse = false) => ({ matchupPeriodId: week, winner,
  home: { teamId: reverse ? 2 : 1 }, away: { teamId: reverse ? 1 : 2 } });
const league = (schedule: ReturnType<typeof game>[]) => ({ teams: [{ id: 1 }, { id: 2 }], schedule });

it("adds the hypothetical loss to the trailing losses only, from either home/away side", () => {
  const data = league([game(1, "HOME"), game(2, "AWAY"), game(3, "HOME", true), game(4, "UNDECIDED")]);
  expect(lossesIfThisWeekLost(data, 1, 4)).toBe(3);
  expect(lossesIfThisWeekLost(data, 2, 4)).toBe(1);
  expect(lossesIfThisWeekLost(data, 1, 1)).toBe(1);
});

it("breaks streaks on wins/ties, skips byes, and does not double-count current or duplicate results", () => {
  const data = league([game(1, "AWAY"), game(2, "TIE"), game(3, "AWAY"), game(3, "AWAY"), game(4, "AWAY")]);
  expect(lossesIfThisWeekLost(data, 1, 4)).toBe(2);
  const bye = { matchupPeriodId: 3, home: { teamId: 1 } };
  const withBye = { ...data, schedule: [game(1, "AWAY"), game(2, "AWAY"), bye] };
  expect(lossesIfThisWeekLost(withBye, 1, 4)).toBe(3);
});

it("uses standings when history is incomplete, but never invents a streak or includes a completed current week", () => {
  const data = { teams: [{ id: 1, record: { overall: { streakType: "LOSS", streakLength: 2 } } }],
    schedule: [game(4, "UNDECIDED")] };
  expect(lossesIfThisWeekLost(data, 1, 4)).toBe(3);
  data.schedule[0].winner = "AWAY";
  expect(lossesIfThisWeekLost(data, 1, 4)).toBeUndefined();
  expect(lossesIfThisWeekLost(league([]), 1, 4)).toBeUndefined();
});

it("adds a hypothetical win to trailing wins, excluding current and duplicate results", () => {
  const data = league([game(1, "AWAY"), game(2, "HOME"), game(3, "AWAY", true), game(3, "AWAY", true), game(4, "HOME")]);
  expect(winsIfThisWeekWon(data, 1, 4)).toBe(3);
  expect(winsIfThisWeekWon(data, 2, 4)).toBe(1);
  expect(winsIfThisWeekWon(data, 1, 1)).toBe(1);
  data.schedule[1].winner = "TIE";
  expect(winsIfThisWeekWon(data, 1, 4)).toBe(2);
  const withBye = { ...data, schedule: [game(1, "HOME"), game(2, "HOME"), { matchupPeriodId: 3, home: { teamId: 1 } }] };
  expect(winsIfThisWeekWon(withBye, 1, 4)).toBe(3);
});

it("falls back to the win record only while the current matchup is undecided", () => {
  const data = { teams: [{ id: 1, record: { overall: { streakType: "WIN", streakLength: 2 } } }],
    schedule: [game(4, "UNDECIDED")] };
  expect(winsIfThisWeekWon(data, 1, 4)).toBe(3);
  data.teams[0].record.overall.streakType = "LOSS";
  expect(winsIfThisWeekWon(data, 1, 4)).toBe(1);
  data.schedule[0].winner = "HOME";
  expect(winsIfThisWeekWon(data, 1, 4)).toBeUndefined();
  expect(winsIfThisWeekWon(league([]), 1, 4)).toBeUndefined();
});
