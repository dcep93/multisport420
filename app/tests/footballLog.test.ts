import { afterEach, describe, expect, it, vi } from "vitest";
import { getFootballLog } from "../src/app_x/lib/renderLog/football";

afterEach(() => vi.unstubAllGlobals());

describe("ESPN football references", () => {
  it.each([false, true])("keeps drives and plays chronological for newest-first rendering (summary fallback: %s)", async (fallback) => {
    const makePlay = (text: string, clock: string, score: number, wallclock: string) => ({
      text, clock: { displayValue: clock }, period: { number: 1 }, participants: [],
      awayScore: score, homeScore: 0, wallclock,
    });
    const oldDrive = { id: "old", description: "Opening drive", team: { shortDisplayName: "Seahawks" }, plays: [
      makePlay("Opening kickoff", "15:00", 0, "2026-09-10T00:20:00Z"),
      makePlay("Opening drive punt", "11:42", 0, "2026-09-10T00:25:00Z"),
    ] };
    const newDrive = { id: "new", description: "Latest drive", team: { shortDisplayName: "Patriots" }, plays: [
      makePlay("Latest drive run", "11:30", 0, "2026-09-10T00:26:00Z"),
      makePlay("Touchdown", "10:00", 6, "2026-09-10T00:30:00Z"),
    ] };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      let data: unknown;
      if (url.includes("/summary?")) data = { drives: { current: newDrive, previous: [oldDrive] } };
      else if (url.endsWith("/drives?limit=1000")) data = { items: fallback ? [] : [oldDrive, newDrive].map(d => ({ id: d.id, $ref: `http://sports.core.api.espn.com/${d.id}` })) };
      else if (url.endsWith("/team")) data = { shortDisplayName: "Team" };
      else {
        const drive = url.endsWith("/old") ? oldDrive : newDrive;
        data = { ...drive, team: { $ref: "http://sports.core.api.espn.com/team" }, plays: { items: drive.plays } };
      }
      return { ok: true, json: async () => data };
    }));
    const log = await getFootballLog({ category: "NFL", espn_id: 401872656, title: "Patriots @ Seahawks", raw_url: "", slug: "game" }, {
      sport: "football", espnLeague: "nfl", playType: "football", boxScoreKeys: [],
    });
    expect(log?.playByPlay.map(drive => drive.description)).toEqual(["Opening drive", "Latest drive"]);
    expect(log?.playByPlay.flatMap(drive => drive.plays?.map(play => play.text))).toEqual([
      "Opening kickoff", "Opening drive punt", "Latest drive run", "Touchdown",
    ]);
    expect(log?.playByPlay[1].score).toBe("6 - 0");
    expect(log?.timestamp).toBe(Date.parse("2026-09-10T00:30:00Z"));
  });

  it.each(["nfl", "college-football", "cfl"])("loads %s plays when ESPN returns HTTP drive and team refs", async (espnLeague) => {
    const base = `sports.core.api.espn.com/v2/sports/football/leagues/${espnLeague}`;
    const drivePath = `${base}/events/401872656/competitions/401872656/drives/4018726561?lang=en&region=us`;
    const teamPath = `${base}/seasons/2026/teams/26?lang=en&region=us`;
    const fetch = vi.fn(async (url: string) => {
      // Model an HTTPS browser refusing insecure subrequests.
      if (!url.startsWith("https://")) throw new TypeError("Mixed content blocked");
      let data: unknown;
      if (url.includes("/summary?")) data = { boxscore: { teams: [], players: [] } };
      else if (url.endsWith("/drives?limit=1000")) data = { items: [{ id: "4018726561", $ref: `http://${drivePath}` }] };
      else if (url === `https://${drivePath}`) data = {
        description: "5 plays, 25 yards", displayResult: "Punt", team: { $ref: `http://${teamPath}` },
        plays: { items: [{ text: "Seattle punts to New England.", participants: [], awayScore: 0, homeScore: 0,
          period: { number: 1 }, clock: { displayValue: "11:42" }, wallclock: 1789000115000 }] },
      };
      else if (url === `https://${teamPath}`) data = { shortDisplayName: "Seahawks" };
      else throw new Error(`Unexpected request: ${url}`);
      return { ok: true, json: async () => data };
    });
    vi.stubGlobal("fetch", fetch);
    const log = await getFootballLog({ category: "NFL", espn_id: 401872656,
      title: "New England Patriots @ Seattle Seahawks", raw_url: "", slug: "game" }, {
      sport: "football", espnLeague, playType: "football", boxScoreKeys: [],
    });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(log?.playByPlay[0]).toMatchObject({ team: "Seahawks", result: "Punt",
      plays: [{ text: "Seattle punts to New England.", clock: "Q1 11:42" }] });
  });
});

it.each([
  { yards: 20, team: "1", red: true, home: false },
  { yards: 21, team: "1", red: false, home: false },
  { yards: 0, team: "1", red: false, home: false },
  { yards: undefined, team: "1", red: false, home: false },
  { yards: 5, team: "2", red: true, home: true },
  { yards: 5, team: "unknown", red: false, home: undefined },
  { yards: 5, team: "1", result: "Touchdown", red: false, home: undefined },
  { yards: 5, team: "1", status: "STATUS_HALFTIME", red: false, home: undefined },
  { yards: 5, team: "1", status: "STATUS_FINAL", red: false, home: undefined },
])("normalizes possession and red-zone boundaries: %j", async ({ yards, team, result, status, red, home }) => {
  const play = { id: "p1", statYardage: 30, text: "Pass for 30 yards", participants: [], wallclock: "2026-09-13T17:00:00Z",
    period: { number: 1 }, clock: { displayValue: "12:00" }, end: { team: { $ref: `http://sports.core.api.espn.com/teams/${team}?lang=en` }, yardsToEndzone: yards } };
  const drive = { id: "d1", team: { id: "1", shortDisplayName: "Away" }, plays: [play], displayResult: result };
  const summary = { drives: { current: drive }, header: { competitions: [{ status: { type: { name: status ?? "STATUS_IN_PROGRESS", state: status === "STATUS_FINAL" ? "post" : "in" } },
    competitors: [{ homeAway: "away", team: { id: "1", shortDisplayName: "Away" } }, { homeAway: "home", team: { id: "2", shortDisplayName: "Home" } }] }] } };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("/summary?") ? summary : { items: [] } })));
  const log = await getFootballLog({ category: "NFL", espn_id: 1, title: "Away @ Home", raw_url: "", slug: "game" }, { sport: "football", espnLeague: "nfl", playType: "football", boxScoreKeys: [] });
  expect(log?.redZone).toBe(red);
  expect(log?.possession?.isHomeTeam).toBe(home);
  expect(log?.gameFinished).toBe(status === "STATUS_FINAL");
  expect(log?.playByPlay[0].plays?.[0]).toMatchObject({ id: "p1", distance: 30, timestamp: Date.parse("2026-09-13T17:00:00Z") });
});
