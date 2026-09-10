import { afterEach, describe, expect, it, vi } from "vitest";
import { getFootballLog } from "../src/app_x/lib/renderLog/football";

afterEach(() => vi.unstubAllGlobals());

describe("ESPN football references", () => {
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
