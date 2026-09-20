import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const controller = readFileSync(new URL("../../../extension/pooembed.js", import.meta.url), "utf8");

test("fixed hotkeys and audio follow every numbered spotlight", async ({ context, page }) => {
  await context.route(/https:\/\/[^/]*espn\.com\//, route => route.fulfill({ json: { events: [] } }));
  await context.route("https://proxy420.appspot.com/**", async route => {
    const target = (route.request().postDataJSON() as { url: string }).url;
    if (target.includes("espn.com")) return route.fulfill({ json: { events: [] } });
    if (target.includes("/watch/")) return route.fulfill({ contentType: "text/html", body: '<iframe id="main-player" src="https://player.example.test/video"></iframe>' });
    return route.fulfill({ contentType: "text/html", body: `<div class="events-list">
      ${[1, 2, 3, 4, 5, 6, 7, 8].map(index => `<div class="event-card" data-start-ts="${Math.floor(Date.now() / 1000)}" onclick="window.location.href='/watch/${index}'">
      <span class="event-league">MLB</span><span class="event-title">Team ${index} with a very long away team name vs Another extremely long home team name ${index}</span></div>`).join("")}</div>` });
  });
  await context.route("https://player.example.test/**", route => route.fulfill({
    contentType: "text/html",
    body: `<video muted></video><script>HTMLMediaElement.prototype.play = () => Promise.resolve();</script><script>${controller}</script>`,
  }));
  // localhost is one of the extension's supported ancestor hostnames.
  await page.goto("http://localhost:4173/");
  await page.getByLabel("categories", { exact: true }).selectOption("MLB");
  for (let index = 0; index < 8; index++) await page.locator(".stream-toggle").nth(index).click();
  const cards = page.locator(".screen-card");
  await expect(cards).toHaveCount(8);
  const video = (index: number) => cards.nth(index).frameLocator(".screen-iframe").frameLocator("#multisport-player-frame").locator("video");
  const muted = (index: number) => video(index).evaluate((element: HTMLVideoElement) => element.muted);
  for (let index = 0; index < 8; index++) {
    await expect(video(index)).toHaveCount(1);
    await expect.poll(() => muted(index)).toBe(index !== 0);
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.mouse.move(0, 0);
  await page.locator(".menu-title").click();
  await page.mouse.move(0, 0);
  const viewport = cards.nth(1).locator(".screen-title-viewport");
  const hotkey = cards.nth(1).locator(".screen-title-hotkey");
  const before = await hotkey.boundingBox();
  expect(await viewport.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await expect.poll(() => viewport.evaluate(element => element.scrollLeft)).toBeGreaterThan(5);
  expect(await hotkey.boundingBox()).toEqual(before);
  await viewport.focus();
  await page.keyboard.press("End");
  expect(await hotkey.boundingBox()).toEqual(before);
  await hotkey.screenshot({ path: "test-results/fixed-hotkey.png" });
  await viewport.evaluate(element => (element as HTMLElement).blur());
  for (let index = 0; index < 8; index++) {
    if (index > 0) await page.keyboard.press(`Digit${index + 1}`);
    await expect.poll(() => muted(index)).toBe(false);
    await page.keyboard.press(`Digit${index + 1}`);
    await expect.poll(() => muted(index)).toBe(true);
    await page.keyboard.press(`Digit${index + 1}`);
    await expect.poll(() => muted(index)).toBe(false);
  }
  // Manual mute must not survive leaving and re-entering spotlight.
  await video(2).evaluate((element: HTMLVideoElement) => { element.muted = true; });
  await page.keyboard.press("Digit2");
  await expect.poll(() => muted(2)).toBe(true);
  await page.keyboard.press("Digit3");
  await expect.poll(() => muted(2)).toBe(false);
  await expect.poll(() => muted(1)).toBe(true);
  // Regression: 4 mutes the current spotlight, then 3 -> 4 must unmute it.
  await page.keyboard.press("Digit4");
  await expect.poll(() => muted(3)).toBe(false);
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.keyboard.press("Digit4");
    await expect.poll(() => muted(3)).toBe(true);
    await page.keyboard.press("Digit3");
    await expect.poll(() => muted(2)).toBe(false);
    await expect.poll(() => muted(3)).toBe(true);
    await page.keyboard.press("Digit4");
    await expect.poll(() => muted(3)).toBe(false);
    await expect.poll(() => muted(2)).toBe(true);
  }
  // Closing the spotlight should unmute its replacement, with no toggle sent.
  await cards.nth(3).locator(".screen-title-bar-shell").click();
  await expect(cards).toHaveCount(7);
  await expect.poll(() => muted(0)).toBe(false);
  await expect.poll(() => muted(1)).toBe(true);
  await page.screenshot({ path: "test-results/player-controls.png", fullPage: true });
});
