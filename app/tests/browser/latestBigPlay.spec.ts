import { expect, test } from "@playwright/test";

for (const delay of [0, 60_000]) {
  test(`latest big-play clock is live and spotlight-only with ${delay}ms log delay`, async ({ page }) => {
    await page.goto(`/tests/fixtures/indicators.html?delay=${delay}`);
    await page.locator(".screen-card").nth(1).locator(".screen-focus-overlay").click();
    const spotlight = page.locator(".screen-card-spotlight");
    const banner = spotlight.locator(".screen-title-bar-shell");
    const clock = banner.locator(".screen-title-clock");
    await expect(clock).toHaveText("Q1 10:00");
    await expect(page.locator(".screen-card-secondary .screen-title-clock")).toHaveCount(0);
    await expect(page.locator(".multisport-log-latest-big-play")).toHaveCount(0);
    if (delay > 0) {
      await expect(spotlight.locator(".multisport-log-empty")).toContainText("Loading log...");
      await expect(banner).toHaveAttribute("data-indicator", "none");
    } else {
      await expect(banner).toHaveAttribute("data-indicator", "big-play");
      await expect(banner).toHaveAttribute("data-indicator", "none", { timeout: 7000 });
      await expect(clock).toHaveText("Q1 10:00");
    }
    const before = await clock.boundingBox();
    const viewport = banner.locator(".screen-title-viewport");
    await viewport.focus();
    await page.keyboard.press("End");
    expect(await clock.boundingBox()).toEqual(before);
    await page.locator(".screen-card").nth(0).locator(".screen-focus-overlay").click();
    await expect(clock).toHaveText("Q1 11:00");
    await expect(page.locator(".screen-card-secondary .screen-title-clock")).toHaveCount(0);
    await page.getByRole("button", { name: "Toggle logs" }).click();
    await expect(clock).toHaveText("Q1 11:00");
    await expect(clock).toBeVisible();
    await banner.screenshot({ path: `test-results/latest-big-play-banner-${delay}.png` });
  });
}
