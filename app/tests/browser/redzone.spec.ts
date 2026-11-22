import { expect, test } from "@playwright/test";

const teams = {
  a: [{ homeAway: "home", team: { id: "2", abbreviation: "BUF" } }, { homeAway: "away", team: { id: "15", abbreviation: "MIA" } }],
  b: [{ homeAway: "home", team: { id: "12", abbreviation: "KC" } }, { homeAway: "away", team: { id: "7", abbreviation: "DEN" } }],
};
const play = (id: number, game: "a" | "b") => ({ id: String(id), text: id === 80 ? "(Shotgun) J.Allen pass incomplete short right to T.Shavers." : id === 79 ? "B.Nix pass complete for 30 yards." : `Live play ${id}: PENALTY, administrative update or complete play text.`,
  statYardage: id === 79 ? 30 : 0,
  homeScore: game === "a" ? 20 : 14, awayScore: game === "a" ? 6 : 10,
  wallclock: new Date(Date.UTC(2026, 10, 22, 19, 0, id)).toISOString(), start: { downDistanceText: game === "a" ? "1st & 10 at MIA 48" : "2nd & 5 at KC 30", team: { id: game === "a" ? "2" : "7" }, yardsToEndzone: game === "a" ? 48 : 30 }, period: { number: 2 }, clock: { displayValue: "0:00" } });

test("zero-delay three-line live feed supports manual reading and preserves its anchor after polling", async ({ page }) => {
  let cycle = 0;
  await page.clock.install();
  await page.route("**/sports/football/nfl/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("scoreboard")) {
      cycle++;
      await route.fulfill({ json: { events: ["a", "b"].map(id => ({ id, status: { type: { state: "in", completed: false } } })) } });
    } else {
      const game = url.searchParams.get("event") === "a" ? "a" : "b";
      const plays = Array.from({ length: 40 }, (_, index) => play(index * 2 + (game === "a" ? 2 : 1), game));
      if (game === "a") for (let extra = 2; extra <= cycle; extra++) plays.push(play(80 + extra, game));
      await route.fulfill({ json: { header: { competitions: [{ competitors: teams[game] }] }, drives: { previous: [{ id: "drive", plays }], current: { id: "drive", plays: plays.slice(-1) } } } });
    }
  });
  await page.goto("/tests/fixtures/redzone.html?delay=0");
  const log = page.getByRole("region", { name: "Live NFL RedZone plays" });
  await expect(log.locator(".redzone-play")).toHaveCount(80);
  await expect(log.locator(".redzone-play").first()).toHaveText("BUF 20 vs MIA 6(Shotgun) J.Allen pass incomplete short right to T.Shavers.1st & 10 at MIA 48 - Q2 0:00");
  await expect(log.locator(".redzone-play").first().locator(":scope > div")).toHaveCount(3);
  await expect(log.locator(".redzone-play").first().locator(":scope > div").first()).toHaveClass("redzone-play-matchup");
  await expect(log.locator('[data-play-key="b:79"] .redzone-play-matchup')).toHaveText("DEN 10 @ KC 14");
  const highlighted = log.locator('[data-play-key="b:79"]');
  const ordinary = log.locator('[data-play-key="a:80"]');
  await expect(highlighted).toHaveClass("redzone-play redzone-play-big");
  await expect(highlighted).toHaveCSS("background-color", "rgba(102, 95, 32, 0.78)");
  await expect(highlighted.locator(":scope > div")).toHaveCount(3);
  await expect(highlighted).toHaveCSS("animation-name", "none");
  await expect(ordinary).toHaveClass("redzone-play");
  await expect(ordinary).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(log.locator("table, .multisport-log, .autoscroller")).toHaveCount(0);
  await expect(log).not.toContainText("Drive");
  await expect(log).not.toContainText("Away");
  await log.hover();
  await page.mouse.wheel(0, 650);
  await expect.poll(() => log.evaluate(element => element.scrollTop)).toBeGreaterThan(100);
  const top = await log.evaluate(element => element.scrollTop);
  await page.clock.runFor(4000);
  await expect(highlighted).toHaveCSS("background-color", "rgba(102, 95, 32, 0.78)");
  expect(await log.evaluate(element => element.scrollTop)).toBeCloseTo(top, 0);
  const anchor = await log.evaluate(element => {
    const edge = element.getBoundingClientRect().top;
    const row = [...element.querySelectorAll<HTMLElement>("[data-play-key]")].find(item => item.getBoundingClientRect().bottom > edge)!;
    return { key: row.dataset.playKey!, offset: row.getBoundingClientRect().top - edge };
  });
  await page.clock.runFor(6000);
  await expect(log.locator(".redzone-play")).toHaveCount(81);
  await expect(highlighted).toHaveCSS("background-color", "rgba(102, 95, 32, 0.78)");
  const offset = await log.locator(`[data-play-key="${anchor.key}"]`).evaluate(element => element.getBoundingClientRect().top - element.parentElement!.getBoundingClientRect().top);
  expect(offset).toBeCloseTo(anchor.offset, 0);
  await log.focus();
  await page.keyboard.press("Home");
  await page.clock.runFor(500);
  await expect.poll(() => log.evaluate(element => element.scrollTop)).toBe(0);
  await page.getByRole("button", { name: "Refresh RedZone" }).click();
  await expect.poll(() => cycle).toBe(3);
  await expect(log.locator(".redzone-play")).toHaveCount(82);
  await expect(highlighted).toHaveCSS("background-color", "rgba(102, 95, 32, 0.78)");
  await expect(ordinary).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(await log.evaluate(element => element.scrollTop)).toBe(0);
  await page.screenshot({ path: "test-results/redzone-live-log.png" });
  await page.getByRole("button", { name: "Refresh other" }).click();
  await page.clock.runFor(1000); expect(cycle).toBe(3);
  await page.getByRole("button", { name: "Toggle logs" }).click();
  await expect(log).toHaveCount(0);
  await page.clock.runFor(20_000); expect(cycle).toBe(3);
  await page.getByRole("button", { name: "Toggle logs" }).click();
  await expect(log).toBeVisible(); await expect.poll(() => cycle).toBe(4);
  await page.locator(".screen-card-secondary .screen-focus-overlay").click();
  await expect(log).toHaveCount(0);
  await page.clock.runFor(20_000); expect(cycle).toBe(4);
  await page.locator(".screen-card-secondary .screen-focus-overlay").click();
  await expect(log).toBeVisible(); await expect.poll(() => cycle).toBe(5);
  await page.getByRole("button", { name: "Toggle layout" }).click();
  await expect(log).toHaveCount(0); await page.clock.runFor(20_000); expect(cycle).toBe(5);
});


test("configured delay queues initial and automatic rows; clicking publishes cached then fresh rows", async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  let revision = 1;
  let holdSummary = false;
  let releaseSummary: (() => void) | undefined;
  let summaries = 0;
  await page.route("**/sports/football/nfl/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("scoreboard")) {
      await route.fulfill({ json: { events: [{ id: "a", status: { type: { state: "in" } } }] } });
      return;
    }
    const acceptedRevision = revision;
    summaries++;
    if (holdSummary) await new Promise<void>(resolve => { releaseSummary = resolve; });
    await route.fulfill({ json: { drives: { current: { id: "drive", plays: [{ ...play(acceptedRevision, "a"), text: `Revision ${acceptedRevision}` }] } } } });
  });
  await page.goto("/tests/fixtures/redzone.html?delay=2000");
  const log = page.getByRole("region", { name: "Live NFL RedZone plays" });
  await expect(log).toContainText("Waiting for delayed live plays");
  await page.clock.runFor(1999);
  await expect(log.locator(".redzone-play")).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(log).toContainText("Revision 1");
  revision = 2;
  const cachedResponse = page.waitForResponse(response => response.url().includes("summary") && response.status() === 200);
  await page.clock.runFor(8000);
  await expect.poll(() => summaries).toBe(2);
  await (await cachedResponse).finished();
  await expect(log).toContainText("Revision 1");
  revision = 3;
  holdSummary = true;
  await log.click();
  await expect(log).toContainText("Revision 2");
  await expect.poll(() => releaseSummary !== undefined).toBe(true);
  releaseSummary!();
  await expect(log).toContainText("Revision 3");
  holdSummary = false;
  revision = 4;
  const automaticResponse = page.waitForResponse(response => response.url().includes("summary") && response.status() === 200);
  await page.clock.runFor(10_000);
  await (await automaticResponse).finished();
  await expect.poll(() => summaries).toBe(4);
  await expect(log).toContainText("Revision 3");
  await page.clock.runFor(1999);
  await expect(log).toContainText("Revision 3");
  await page.clock.runFor(1);
  await expect(log).toContainText("Revision 4");
});
