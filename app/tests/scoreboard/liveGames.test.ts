import { expect, it } from "vitest";
import { parseLiveTeams, withLivePlayers, type NflScoreboard } from "../../src/app_x/scoreboard/liveGames";
import type { Snapshot } from "../../src/app_x/scoreboard/data";

function feed(state = "in", redZone = false, possession: string | undefined = "1"): NflScoreboard {
  return { season: { year: 2026, type: 2 }, week: { number: 4 }, events: [{ competitions: [{
    status: { type: { state, completed: state === "post", name: "STATUS_IN_PROGRESS" } },
    situation: { possession, isRedZone: redZone }, competitors: [{ team: { id: "1" } }, { team: { id: "2" } }],
  }] }] };
}

it("highlights only the possessing team's players, with pink taking precedence over yellow and grey", () => {
  expect([...parseLiveTeams(feed(), 2026, 4)]).toEqual([
    [1, { completed: false, activity: "possession" }], [2, { completed: false, activity: "playing" }],
  ]);
  expect(parseLiveTeams(feed("in", true), 2026, 4).get(1)?.activity).toBe("red-zone");
  const handoff = parseLiveTeams(feed("in", false, "2"), 2026, 4);
  expect(handoff.get(1)?.activity).toBe("playing");
  expect(handoff.get(2)?.activity).toBe("possession");
});

it("clears possession during halftime and ignores stale situations before/after games", () => {
  const halftime = feed("in", true);
  halftime.events![0].competitions![0].status!.type!.name = "STATUS_HALFTIME";
  expect([...parseLiveTeams(halftime, 2026, 4).values()].every(team => team.activity === "playing")).toBe(true);
  for (const state of ["pre", "post"]) {
    expect([...parseLiveTeams(feed(state, true), 2026, 4).values()].every(team => team.activity === undefined)).toBe(true);
  }
  expect(parseLiveTeams(feed(), 2025, 4).size).toBe(0);
  expect(parseLiveTeams(feed(), 2026, 3).size).toBe(0);
  const unknown = feed("in", true, "999");
  expect([...parseLiveTeams(unknown, 2026, 4).values()].every(team => team.activity === "playing")).toBe(true);
});

it("applies the same live status to bench players and leaders and preserves completed-game projection suppression", () => {
  const players = [1, 2, 3].map(id => ({ id, proTeamId: id, name: `Player ${id}`, position: "QB", score: 10,
    seasonScore: 40, projected: 20, completed: id === 2, slot: "Bench", slotId: 20 }));
  const snapshot: Snapshot = { leagueId: "123", leagueName: "Test", year: 2026, week: 4, knockout: false, fetchedAt: 1,
    matchups: [[{ id: 1, name: "Team", score: 10, projected: 20, players }]],
    leaders: { positions: [{ position: "QB", players }], unowned: players },
  };
  const live = withLivePlayers(snapshot, parseLiveTeams(feed("in", true), 2026, 4));
  expect(live.matchups[0][0].players?.map(p => p.activity)).toEqual(["red-zone", undefined, undefined]);
  expect(live.leaders?.unowned.map(p => p.activity)).toEqual(["red-zone", undefined, undefined]);
  expect(snapshot.matchups[0][0].players?.[0]).not.toHaveProperty("activity");
  const finished = withLivePlayers(snapshot, parseLiveTeams(feed("post"), 2026, 4));
  expect(finished.matchups[0][0].players?.[0]).toMatchObject({ completed: true, activity: undefined });
});
