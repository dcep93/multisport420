import { expect, test } from "@playwright/test";

const play = (id: number) => ({ id: String(id), text: id === 80 ? "(Shotgun) J.Allen pass incomplete short right to T.Shavers." : `Live play ${id}: PENALTY, administrative update or complete play text.`,
  wallclock: new Date(Date.UTC(2026, 10, 22, 19, 0, id)).toISOString(), start: { downDistanceText: "1st & 10 at MIA 48" }, period: { number: 2 }, clock: { displayValue: "0:00" } });

test("immediate two-line live feed supports manual reading and preserves its anchor after polling", async ({ page }) => {
  let cycle = 0;
  await page.clock.install();
  await page.route("**/sports/football/nfl/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("scoreboard")) {
      cycle++;
      await route.fulfill({ json: { events: ["a", "b"].map(id => ({ id, status: { type: { state: "in", completed: false } } })) } });
    } else {
      const game = url.searchParams.get("event");
      const plays = Array.from({ length: 40 }, (_, index) => play(index * 2 + (game === "a" ? 2 : 1)));
      if (game === "a") for (let extra = 2; extra <= cycle; extra++) plays.push(play(80 + extra));
      await route.fulfill({ json: { drives: { previous: [{ id: "drive", plays }], current: { id: "drive", plays: plays.slice(-1) } } } });
    }
  });
  await page.goto("/tests/fixtures/redzone.html");
  const log = page.getByRole("region", { name: "Live NFL RedZone plays" });
  await expect(log.locator(".redzone-play")).toHaveCount(80);
  await expect(log.locator(".redzone-play").first()).toHaveText("(Shotgun) J.Allen pass incomplete short right to T.Shavers.1st & 10 at MIA 48 - Q2 0:00");
  await expect(log.locator(".redzone-play").first().locator(":scope > div")).toHaveCount(2);
  await expect(log.locator("table, .multisport-log, .autoscroller")).toHaveCount(0);
  await expect(log).not.toContainText("Drive");
  await expect(log).not.toContainText("Away");
  await log.hover();
  await page.mouse.wheel(0, 650);
  await expect.poll(() => log.evaluate(element => element.scrollTop)).toBeGreaterThan(100);
  const top = await log.evaluate(element => element.scrollTop);
  await page.clock.runFor(4000);
  expect(await log.evaluate(element => element.scrollTop)).toBeCloseTo(top, 0);
  const anchor = await log.evaluate(element => {
    const edge = element.getBoundingClientRect().top;
    const row = [...element.querySelectorAll<HTMLElement>("[data-play-key]")].find(item => item.getBoundingClientRect().bottom > edge)!;
    return { key: row.dataset.playKey!, offset: row.getBoundingClientRect().top - edge };
  });
  await page.clock.runFor(6000);
  await expect(log.locator(".redzone-play")).toHaveCount(81);
  const offset = await log.locator(`[data-play-key="${anchor.key}"]`).evaluate(element => element.getBoundingClientRect().top - element.parentElement!.getBoundingClientRect().top);
  expect(offset).toBeCloseTo(anchor.offset, 0);
  await log.focus();
  await page.keyboard.press("Home");
  await page.clock.runFor(500);
  await expect.poll(() => log.evaluate(element => element.scrollTop)).toBe(0);
  await page.getByRole("button", { name: "Refresh RedZone" }).click();
  await expect.poll(() => cycle).toBe(3);
  await expect(log.locator(".redzone-play")).toHaveCount(82);
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
