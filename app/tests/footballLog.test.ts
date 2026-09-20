import { afterEach, describe, expect, it, vi } from "vitest";
import { getFootballLog } from "../src/app_x/lib/renderLog/football";
import { getBigPlay } from "../src/app_x/lib/renderLog/indicators";

afterEach(() => vi.unstubAllGlobals());

it.each([
  { result: "Punt", endTeam: "2", yards: 80, home: true },
  { result: "Downs", endTeam: "2", yards: 98, home: true },
  { result: "Interception", endTeam: "2", yards: 15, home: true, red: true },
  { result: "Fumble", endTeam: "2", yards: 60, home: true },
  { result: "Missed Field Goal", endTeam: "2", yards: 65, home: true },
  { result: "Punt", endTeam: "1", yards: 30, home: false },
  { result: undefined, endTeam: "1", yards: 40, home: false },
  { result: "Punt", endTeam: undefined, yards: 5, home: true },
  { result: "Downs", endTeam: undefined, yards: 5, home: true },
  { result: "Fumble", endTeam: undefined, yards: 5, home: true },
  { result: undefined, endTeam: undefined, turnover: true, yards: 5, home: true },
  { result: "Interception Touchdown", endTeam: "2", yards: 0, home: undefined },
  { result: "Safety", endTeam: "2", yards: 0, home: undefined },
  { result: "Punt", endTeam: "unknown", yards: 5, home: undefined },
])("keeps possession through drive endings and honors the final owner: %j", async ({ result, endTeam, turnover, yards, home, red }) => {
  const latest = { id: "last", text: "Final play", participants: [], isTurnover: turnover,
    period: { number: 3 }, clock: { displayValue: "4:00" },
    start: { team: { id: "1" } }, end: { team: endTeam ? { id: endTeam } : undefined, yardsToEndzone: yards } };
  const summary = { drives: { current: { id: "drive", team: { id: "1" }, displayResult: result, plays: [latest] } },
    header: { competitions: [{ status: { type: { state: "in" } }, competitors: [
      { homeAway: "away", team: { id: "1", shortDisplayName: "Away" } },
      { homeAway: "home", team: { id: "2", shortDisplayName: "Home" } },
    ] }] } };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("/summary?") ? summary : { items: [] } })));
  const log = await getFootballLog({ category: "NFL", espn_id: 1, title: "Away @ Home", raw_url: "", slug: "game" },
    { sport: "football", espnLeague: "nfl", playType: "football", boxScoreKeys: [] });
  expect(log?.possession?.isHomeTeam).toBe(home);
  expect(log?.redZone).toBe(red ?? false);
});

it.each(["core-empty", "summary-ahead", "summary-stale"])("uses the newest drive's owner before its first snap (%s)", async mode => {
  const newDrive = { id: "new", team: { id: "2" }, start: { period: { number: 3 }, clock: { displayValue: "10:00" } }, plays: [] };
  const oldDrive = { id: "old", team: { id: "1" }, start: { period: { number: 3 }, clock: { displayValue: "12:00" } },
    displayResult: "Touchdown", plays: [{ text: "TOUCHDOWN", participants: [], period: { number: 3 }, clock: { displayValue: "10:00" }, end: { team: { id: "1" }, yardsToEndzone: 0 } }] };
  const summary = { drives: { current: mode === "summary-stale" ? oldDrive : newDrive }, header: { competitions: [{
    status: { type: { state: "in" } }, competitors: [
      { homeAway: "away", team: { id: "1", shortDisplayName: "Away" } },
      { homeAway: "home", team: { id: "2", shortDisplayName: "Home" } },
    ],
  }] } };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    let data: unknown;
    if (url.includes("/summary?")) data = summary;
    else if (url.endsWith("/drives?limit=1000")) data = { items: (mode === "summary-ahead" ? [oldDrive] : [oldDrive, newDrive]).map(d => ({ id: d.id, $ref: `https://example.test/${d.id}` })) };
    else if (url.includes("/team/")) data = { id: url.split("/").at(-1), shortDisplayName: "Team" };
    else {
      const drive = url.endsWith("/old") ? oldDrive : newDrive;
      data = { ...drive, team: { $ref: `https://example.test/team/${drive.team.id}` }, plays: { items: drive.plays } };
    }
    return { ok: true, json: async () => data };
  }));
  const log = await getFootballLog({ category: "NFL", espn_id: 1, title: "Away @ Home", raw_url: "", slug: "game" },
    { sport: "football", espnLeague: "nfl", playType: "football", boxScoreKeys: [] });
  expect(log?.possession).toEqual({ team: "Home", isHomeTeam: true });
  expect(log?.redZone).toBe(false);
  expect(log?.playByPlay[0].plays?.[0].text).toBe("TOUCHDOWN");
});

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
      { ...makePlay("Latest drive run", "11:30", 0, "2026-09-10T00:26:00Z"), statYardage: 30, start: { yardsToEndzone: 40 }, end: { yardsToEndzone: 10 } },
      { ...makePlay("Touchdown", "10:00", 6, "2026-09-10T00:30:00Z"), shortText: "Touchdown", review: { upheld: false }, start: { yardsToEndzone: 10 }, end: { yardsToEndzone: 0 } },
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
    const latestPlays = log!.playByPlay[1].plays!;
    expect(latestPlays.map(play => play.startYardsToEndzone)).toEqual([40, 10]);
    expect(latestPlays[1]).toMatchObject({ shortText: "Touchdown", reviewReversed: true });
    expect(getBigPlay(latestPlays[0])).toBe("distance");
    expect(getBigPlay(latestPlays[1])).toBeNull();
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
