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
    await context.route("https://proxy420.appspot.com/**", route => route.fulfill({
      contentType: "text/html", body: '<div class="events-list"></div>',
    }));
    await context.route("https://fantasy.espn.com/football/**", route => route.fulfill({
      contentType: "text/html", body: "<h1>ESPN league fixture</h1>",
    }));
    await context.route("https://lm-api-reads.fantasy.espn.com/**", route => {
      fetches++;
      return route.fulfill({ json: {
        id: 123, scoringPeriodId: 1, settings: { name: "Native scoreboard fixture" },
        teams: ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"].map((name, i) => ({ id: i + 1, name })),
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
    await panel.evaluate(element => {
      element.style.width = "640px";
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
    await panel.screenshot({ path: "test-results/native-scoreboard-110px.png" });
    await page.mouse.move(0, 0);
    await expect.poll(() => page.locator(".scoreboard-strip").evaluate(element => element.scrollLeft), { timeout: 9000 }).toBeGreaterThan(0);

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
