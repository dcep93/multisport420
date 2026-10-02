import { chromium, expect, test } from "@playwright/test";
import path from "node:path";

test("native scoreboard uses the Multisport extension and fits a compact panel", async () => {
  test.setTimeout(60_000);
  const extension = path.resolve("../extension");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1280, height: 900 },
  });
  context.setDefaultTimeout(10_000);
  try {
    let fetches = 0;
    const requests: string[] = [];
    context.on("request", request => requests.push(request.url()));
    await context.route("https://site.api.espn.com/**", route => route.fulfill({ json: { events: [] } }));
    await context.route("https://proxy420.appspot.com/**", route => {
      const target = (route.request().postDataJSON() as { url: string }).url;
      return route.fulfill({ contentType: "text/html", body: target.includes("/watch/")
        ? '<iframe id="main-player" src="https://player.example.test/video"></iframe>'
        : `<div class="events-list"><div class="event-card" data-start-ts="${Math.floor(Date.now() / 1000)}" onclick="window.location.href='/watch/1'">
          <span class="event-league">NFL</span><span class="event-title">Fixture game</span></div></div>` });
    });
    await context.route("https://player.example.test/**", route => route.fulfill({ contentType: "text/html", body: "Fixture stream" }));
    await context.route("https://fantasy.espn.com/football/**", route => route.fulfill({
      contentType: "text/html", body: "<h1>ESPN league fixture</h1>",
    }));
    const names = ["Jalen Hurts", "Jahmyr Gibbs", "Drake London", "George Kittle", "Ka’imi Fairbairn", "Steelers D/ST"];
    const positions = [1, 2, 3, 4, 5, 16];
    const players = Array.from({ length: 48 }, (_, i) => ({
      id: i + 1, onTeamId: i < 16 ? 1 : 0,
      player: { id: i + 1, proTeamId: i + 1, defaultPositionId: positions[i % 6],
        fullName: i < 6 ? names[i] : `Player ${i + 1}`, stats: [
          { seasonId: 2026, scoringPeriodId: 1, statSourceId: 0, statSplitTypeId: 1, appliedTotal: 30 - i / 2 },
          { seasonId: 2026, scoringPeriodId: 1, statSourceId: 1, statSplitTypeId: 1, appliedTotal: 32 - i / 2 },
          { seasonId: 2026, scoringPeriodId: 0, statSourceId: 0, statSplitTypeId: 0, appliedTotal: 80 - i / 2 },
        ] },
    }));
    const entries = players.slice(0, 16).map((pool, i) => ({ playerId: pool.id,
      lineupSlotId: i < 10 ? [0, 2, 4, 6, 17, 16][i % 6] : i === 15 ? 21 : 20,
      playerPoolEntry: { ...pool, lineupLocked: i === 0, appliedStatTotal: 30 - i / 2 },
    }));
    await context.route("https://lm-api-reads.fantasy.espn.com/**", route => {
      const view = new URL(route.request().url()).searchParams.get("view");
      if (view === "kona_playercard") return route.fulfill({ json: { players, totalPlayers: players.length } });
      if (view === "proTeamSchedules_wl") return route.fulfill({ json: { settings: { proTeams: [
        { id: 1, proGamesByScoringPeriod: { 1: [{ statsOfficial: false }] } },
        { id: 2, proGamesByScoringPeriod: { 1: [{ statsOfficial: true }] } },
      ] } } });
      fetches++;
      return route.fulfill({ json: {
        id: 123, scoringPeriodId: 1, settings: { name: "Native scoreboard fixture" },
        teams: ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"].map((name, i) => ({ id: i + 1, name, roster: { entries } })),
        schedule: [0, 1, 2].map(i => ({ matchupPeriodId: 1,
          home: { teamId: i * 2 + 1, totalPointsLive: 80 + fetches, totalProjectedPointsLive: 120 + i },
          away: { teamId: i * 2 + 2, totalPointsLive: 75, totalProjectedPointsLive: 110 + i },
        })),
      } });
    });
    const espn = await context.newPage();
    await espn.goto("https://fantasy.espn.com/football/team?leagueId=123&seasonId=2026");
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://localhost:4173/#Fantasy420Scoreboard");
    await expect(page.getByRole("heading", { name: "Alpha", exact: true })).toBeVisible();
    expect(fetches).toBe(1);
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.locator(".scoreboard-page")).toHaveCSS("scrollbar-width", "none");
    expect(await page.evaluate(() => document.documentElement.dataset.multisport420ExtensionId)).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.dataset.fantasy420ExtensionId)).toBeUndefined();

    const panel = page.locator(".native-scoreboard-container");
    await expect(page.locator(".scoreboard-spotlight")).toHaveCount(1);
    const roster = page.getByRole("table", { name: "Alpha players" });
    await expect(roster.locator("tbody tr")).toHaveCount(16);
    await expect(roster.getByRole("row", { name: /Jalen Hurts/ }).getByTitle("Player projection")).toBeVisible();
    await expect(roster.getByRole("row", { name: /Jahmyr Gibbs/ }).getByTitle("Player projection")).toHaveCount(0);
    await expect(roster.getByRole("row", { name: /Player 11/ })).toContainText("Bench");
    await expect(page.getByRole("complementary", { name: "Weekly player leaders" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Unowned · All positions" }).locator("li")).toHaveCount(5);
    await expect(page.getByRole("region", { name: "QB", exact: true }).locator("li")).toHaveCount(5);
    const paired = await page.locator(".scoreboard-teams").first().locator(".scoreboard-team").evaluateAll(teams => {
      const [a, b] = teams.map(team => team.getBoundingClientRect());
      return a.top === b.top && a.right <= b.left;
    });
    expect(paired).toBe(true);
    await panel.screenshot({ path: "test-results/native-scoreboard-spotlight.png" });
    // Narrow spotlight keeps teams horizontal and puts rankings below them.
    await panel.evaluate(element => { element.style.width = "640px"; element.style.height = "500px"; });
    expect(await page.locator(".scoreboard-workspace").evaluate(element => {
      const strip = element.querySelector(".scoreboard-strip")!.getBoundingClientRect();
      const leaders = element.querySelector(".scoreboard-leaderboards")!.getBoundingClientRect();
      return leaders.top >= strip.bottom && element.scrollWidth <= element.clientWidth;
    })).toBe(true);
    expect(await roster.evaluate(element => {
      const table = element.getBoundingClientRect();
      return Array.from(element.querySelectorAll("td")).every(cell => cell.getBoundingClientRect().right <= table.right + 1);
    })).toBe(true);
    await panel.screenshot({ path: "test-results/native-scoreboard-narrow.png" });
    await panel.evaluate(element => { element.style.removeProperty("width"); element.style.removeProperty("height"); });

    // A second actual screen makes the scoreboard secondary; verify the prop
    // transition through Multiscreen rather than only overriding CSS classes.
    await page.getByLabel("categories", { exact: true }).selectOption("NFL");
    await page.locator(".stream-toggle").filter({ hasText: "Fixture game" }).click();
    await page.getByRole("button", { name: /Focus screen .*Fixture game/ }).click();
    await expect(page.locator(".scoreboard-compact")).toHaveCount(1);
    await expect(page.locator(".scoreboard-leaderboards")).toHaveCount(0);
    await panel.evaluate(element => {
      element.style.width = "400px";
      element.style.height = "110px";
    });
    await expect(page.locator(".scoreboard-strip")).toHaveCSS("height", "110px");
    const geometry = await page.locator(".scoreboard-strip").evaluate(element => {
      const strip = element.getBoundingClientRect();
      return { overflow: element.scrollWidth > element.clientWidth,
        textFits: Array.from(element.querySelectorAll("h2, p")).every(item => {
          const box = item.getBoundingClientRect();
          return box.top >= strip.top && box.bottom <= strip.bottom;
        }),
      };
    });
    expect(geometry).toEqual({ overflow: true, textFits: true });
    await expect(page.locator(".scoreboard-compact-matchup").first().locator(":scope > *")).toHaveCount(5);
    await panel.screenshot({ path: "test-results/native-scoreboard-110px.png" });
    await page.mouse.move(0, 0);
    await expect.poll(() => page.locator(".scoreboard-strip").evaluate(element => element.scrollLeft), { timeout: 9000 }).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Focus screen (1) Fantasy scoreboard" }).click();
    await panel.evaluate(element => { element.style.removeProperty("width"); element.style.removeProperty("height"); });
    await page.getByRole("button", { name: "Refresh screen (1) Fantasy scoreboard" }).click();
    await expect.poll(() => fetches).toBe(2);
    await page.locator(".scoreboard-controls").scrollIntoViewIfNeeded();
    await page.getByLabel("Mode").selectOption("guillotine");
    await expect(page.locator(".scoreboard-elimination")).toHaveCount(6);
    expect(fetches).toBe(2);
    await page.getByRole("button", { name: "Pause scrolling", exact: true }).click();
    await expect(page.getByRole("button", { name: "Resume scrolling", exact: true })).toBeVisible();
    // Verify the actual polling cadence through the installed extension bridge.
    await expect.poll(() => fetches, { timeout: 32_000 }).toBeGreaterThanOrEqual(3);
    expect(requests.some(url => url.includes("fantasy420.web.app"))).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
