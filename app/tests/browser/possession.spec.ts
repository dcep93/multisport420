import { expect, test } from "@playwright/test";

test("highlights the owning team's name and moves it across a completed drive", async ({ page }) => {
  await page.goto("/tests/fixtures/indicators.html");
  const banner = page.locator(".screen-card-spotlight .screen-title-bar-shell");
  const owner = banner.locator(".screen-title-team-owning");
  await expect(owner).toHaveText("New England Patriots");
  await expect(banner).toHaveAttribute("data-indicator", "red-zone");
  expect(await owner.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgba(235, 202, 108, 0.26)");
  await banner.screenshot({ path: "test-results/possession-red-zone.png" });

  await page.locator(".screen-card").nth(1).locator(".screen-focus-overlay").click();
  await expect(owner).toHaveText("Green Bay Packers");
  await expect(banner).toHaveAttribute("data-indicator", "big-play");
  await banner.screenshot({ path: "test-results/possession-big-play.png" });

  await page.goto("/tests/fixtures/indicators.html?handoff=Downs");
  await expect(owner).toHaveText("Seattle Seahawks");
  await expect(banner).toHaveAttribute("data-indicator", "none");
  await expect(banner.getByRole("img", { name: "Home in possession" })).toBeVisible();
  const hotkey = banner.locator(".screen-title-hotkey");
  const before = await hotkey.boundingBox();
  await banner.locator(".screen-title-viewport").focus();
  await page.keyboard.press("End");
  expect(await hotkey.boundingBox()).toEqual(before);
  await banner.screenshot({ path: "test-results/possession-after-downs.png" });
});
