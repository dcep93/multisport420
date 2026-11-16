import { expect, test, type Page } from "@playwright/test";

const playerControl = (page: Page) => page.locator(".screen-card").first()
  .frameLocator(".screen-iframe").frameLocator("#multisport-player-frame")
  .frameLocator("#nested-player").getByRole("button", { name: "Player control" });

test.beforeEach(async ({ context, page }) => {
  await context.route(/https:\/\/[^/]*espn\.com\//, route => route.fulfill({ json: { events: [] } }));
  await context.route("https://proxy420.appspot.com/**", route => {
    const target = (route.request().postDataJSON() as { url: string }).url;
    if (target.includes("espn.com")) return route.fulfill({ json: { events: [] } });
    if (target.includes("/watch/")) return route.fulfill({ contentType: "text/html", body: '<iframe id="main-player" src="https://player.example.test/player"></iframe>' });
    return route.fulfill({ contentType: "text/html", body: `<div class="events-list">${[1, 2].map(index => `<div class="event-card" data-start-ts="${Math.floor(Date.now() / 1000)}" onclick="window.location.href='/watch/${index}'"><span class="event-league">MLB</span><span class="event-title">Away ${index} vs Home ${index}</span></div>`).join("")}</div>` });
  });
  await context.route("https://player.example.test/**", route => route.fulfill({ contentType: "text/html", body: '<iframe id="nested-player" src="https://video.example.test/video"></iframe>' }));
  await context.route("https://video.example.test/**", route => route.fulfill({
    contentType: "text/html",
    body: '<button onclick="this.dataset.clicked = String(Number(this.dataset.clicked || 0) + 1)">Player control</button><script>document.querySelector("button").focus();</script>',
  }));
  await page.goto("/");
  await page.getByLabel("categories", { exact: true }).selectOption("MLB");
  for (let index = 0; index < 2; index++) await page.locator(".stream-toggle").nth(index).click();
  await expect(playerControl(page)).toBeVisible();
});

test("restores selection and mute shortcuts after repeated nested player focus grabs", async ({ page }) => {
  const cards = page.locator(".screen-card");
  for (let cycle = 0; cycle < 3; cycle++) {
    await playerControl(page).focus();
    await expect(page.locator(".multisport-shell")).toBeFocused();
    await page.keyboard.press("Digit2");
    await expect(cards.nth(1)).toHaveClass(/is-focused/);
    await expect(cards.nth(1)).toHaveAttribute("data-audible", "true");
    // Focus the currently visible player while testing its mute toggle.
    const focusedControl = cards.nth(1).frameLocator(".screen-iframe")
      .frameLocator("#multisport-player-frame").frameLocator("#nested-player").getByRole("button");
    await focusedControl.focus();
    await expect(page.locator(".multisport-shell")).toBeFocused();
    await page.keyboard.press("Digit2");
    await expect(cards.nth(1)).toHaveAttribute("data-audible", "false");
    await page.keyboard.press("Digit1");
    await expect(cards.first()).toHaveAttribute("data-audible", "true");
  }
});

test("recovers after nested player navigation and complete stream refresh", async ({ page }) => {
  const wrapper = page.locator(".screen-card").first().frameLocator(".screen-iframe").frameLocator("#multisport-player-frame");
  await wrapper.locator("#nested-player").evaluate((frame: HTMLIFrameElement) => { frame.src = "https://video.example.test/video?reloaded=1"; });
  await expect.poll(() => playerControl(page).evaluate(() => location.search)).toBe("?reloaded=1");
  await expect(page.locator(".multisport-shell")).toBeFocused();
  await page.keyboard.press("Digit2");
  await expect(page.locator(".screen-card").nth(1)).toHaveClass(/is-focused/);
  const originalFrame = await page.locator(".screen-iframe").first().elementHandle();
  await page.locator(".screen-card").first().getByRole("button", { name: /^Refresh screen/ }).click();
  await expect.poll(() => originalFrame!.evaluate(frame => frame.isConnected)).toBe(false);
  await expect(playerControl(page)).toBeVisible();
  await expect(page.locator(".multisport-shell")).toBeFocused();
  await page.keyboard.press("Digit1");
  await expect(page.locator(".screen-card").first()).toHaveClass(/is-focused/);
});

test("keeps mouse player controls usable, preserves scroll and leaves app typing alone", async ({ page }) => {
  await playerControl(page).click();
  await expect(playerControl(page)).toHaveAttribute("data-clicked", "1");
  await expect(page.locator(".multisport-shell")).toBeFocused();
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(document.body.scrollWidth, 0); });
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  expect(scroll.x).toBeGreaterThan(0);
  await playerControl(page).evaluate(button => button.focus({ preventScroll: true }));
  await expect(page.locator(".multisport-shell")).toBeFocused();
  expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(scroll);
  const input = page.getByRole("textbox", { name: "Room ID (optional)" });
  await input.fill("room-");
  await input.pressSequentially("120", { delay: 150 });
  // Observe across several fallback checks, not just immediately after typing.
  await expect(async () => {
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("room-120");
    await expect(page.locator(".screen-card").first()).toHaveAttribute("data-audible", "true");
  }).toPass();
  expect(await page.locator(".multisport-shell").getAttribute("tabindex")).toBe("-1");
});

test("recovers when returning to a browser tab without pulling focus from another tab", async ({ context, page }) => {
  const other = await context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  // Background player scripts can request focus while the user is elsewhere.
  await playerControl(page).evaluate(button => button.focus());
  await expect.poll(() => other.evaluate(() => document.hasFocus())).toBe(true);
  await page.bringToFront();
  await expect(page.locator(".multisport-shell")).toBeFocused();
  await page.keyboard.press("Digit2");
  await expect(page.locator(".screen-card").nth(1)).toHaveClass(/is-focused/);
  await other.close();
});
