import { expect, test } from "@playwright/test";

test("latest big play shows only its clock below sidebar teams and outlives the blue banner", async ({ page }) => {
  await page.goto("/tests/fixtures/indicators.html");
  await page.locator(".screen-card").nth(1).locator(".screen-focus-overlay").click();
  const spotlight = page.locator(".screen-card-spotlight");
  const summary = spotlight.locator(".multisport-log-latest-big-play");
  const banner = spotlight.locator(".screen-title-bar-shell");
  await expect(summary).toHaveText("Q1 12:00");
  await expect(banner).toHaveAttribute("data-indicator", "big-play");
  await expect(banner).not.toContainText("Q1 12:00");
  await expect(banner.getByRole("img", { name: "Big play" })).toBeVisible();
  const teamsBox = await spotlight.locator(".multisport-log-team-summary-row").boundingBox();
  const summaryBox = await summary.boundingBox();
  expect(summaryBox!.y).toBeGreaterThanOrEqual(teamsBox!.y + teamsBox!.height);
  expect(await summary.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(banner).toHaveAttribute("data-indicator", "none", { timeout: 7000 });
  await expect(summary).toHaveText("Q1 12:00");
  await expect(summary).toBeVisible();
  await spotlight.locator(".log-panel").screenshot({ path: "test-results/latest-big-play-sidebar.png" });
});
