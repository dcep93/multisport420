import { expect, test, type BrowserContext, type WebSocket } from "@playwright/test";
import { roomKey } from "../../src/app_x/lib/roomState";

const database = "http://127.0.0.1:9000";
const namespace = "demo-multisport420-default-rtdb";
const stateUrl = (id: string) => `${database}/remoteRooms/${roomKey(id)}/state.json?ns=${namespace}`;

async function mockStreams(context: BrowserContext) {
  await context.route(/https:\/\/[^/]*espn\.com\//, (route) => route.fulfill({ json: { events: [] } }));
  await context.route("https://proxy420.appspot.com/**", async (route) => {
    const target = (route.request().postDataJSON() as { url: string }).url;
    if (target.includes("espn.com")) {
      await route.fulfill({ json: { events: [] } });
    } else if (target.includes("/watch/")) {
      await route.fulfill({ contentType: "text/html", body: '<iframe id="main-player" src="https://player.example.test/video"></iframe>' });
    } else {
      await route.fulfill({ contentType: "text/html", body: `<div class="events-list">
        ${["Red Sox vs Yankees", "Cubs vs Dodgers", "Mets vs Phillies"].map((title, index) =>
          `<div class="event-card" data-start-ts="${Math.floor(Date.now() / 1000)}" onclick="window.location.href='/watch/${index}'">
            <span class="event-league">MLB</span><span class="event-title">${title}</span></div>`).join("")}</div>` });
    }
  });
  await context.route("https://player.example.test/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>window.addEventListener('message', e => {
      if (e.data?.source === 'multisport420-app') top.postMessage({source:'test-player', command:e.data}, '*');
    });</script>Mock player`,
  }));
  await context.addInitScript(() => {
    const target = window as typeof window & { muteCommands: unknown[] };
    target.muteCommands = [];
    window.addEventListener("message", (event) => {
      if (event.data?.source === "test-player" && event.data.command?.type === "multisport420:toggle-mute") {
        target.muteCommands.push(event.data.command);
      }
    });
  });
}

test.beforeEach(async ({ request }) => {
  // Only the demo emulator namespace is ever written by this suite.
  await request.put(`${database}/.settings/rules.json?ns=${namespace}`, {
    headers: { Authorization: "Bearer owner" },
    data: { rules: { remoteRooms: { ".read": true, ".write": true } } },
  });
  await request.delete(`${database}/remoteRooms.json?ns=${namespace}`);
});

test("default room: publish, spotlight, mute, keyboard sync, logs, leave and reconnect", async ({ context, page, request }) => {
  const databaseSockets: WebSocket[] = [];
  page.on("websocket", (socket) => {
    if (socket.url().includes("127.0.0.1:9000")) databaseSockets.push(socket);
  });
  await mockStreams(context);
  await page.goto("/");
  await page.locator(".stream-toggle").nth(0).click();
  await page.locator(".stream-toggle").nth(1).click();
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open remote" })).toHaveAttribute("href", "/remote");
  await page.locator(".room-card").screenshot({ path: "test-results/viewer-room-controls.png" });

  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  const mediaRequests: string[] = [];
  phone.on("request", (request) => {
    if (/proxy420|espn.com|player.example/.test(request.url())) mediaRequests.push(request.url());
  });
  await phone.goto("/remote");
  await expect(phone.getByText("Viewer connected", { exact: true })).toBeVisible();
  await expect(phone.locator(".remote-bubble")).toHaveCount(2);
  await expect(phone.locator("iframe")).toHaveCount(0);
  expect(mediaRequests).toEqual([]);
  await phone.locator(".remote-bubble").nth(1).click();
  await expect(page.locator(".screen-card-spotlight .screen-letter")).toContainText("Dodgers");
  await expect(phone.locator(".remote-bubble").nth(1)).toHaveAttribute("aria-pressed", "true");
  await phone.locator(".remote-bubble").nth(1).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { muteCommands: unknown[] }).muteCommands.length)).toBe(1);
  await phone.getByRole("button", { name: "Refresh spotlight log" }).click();
  await expect.poll(async () => (await (await request.get(stateUrl(""))).json()).command.type).toBe("refresh-log");

  await page.locator(".menu-title").click();
  await page.keyboard.press("Digit1");
  await expect(phone.locator(".remote-bubble").nth(0)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Digit1");
  await expect.poll(() => page.evaluate(() => (window as typeof window & { muteCommands: unknown[] }).muteCommands.length)).toBe(2);
  await phone.reload();
  await expect(phone.getByText("Viewer connected", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { muteCommands: unknown[] }).muteCommands.length)).toBe(2);
  await phone.screenshot({ path: "test-results/remote-phone.png", fullPage: true });
  expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", { name: "Leave", exact: true }).click();
  expect(databaseSockets.length).toBeGreaterThan(0);
  await expect.poll(() => databaseSockets.every((socket) => socket.isClosed())).toBe(true);
  await expect(phone.getByText("Waiting for viewer", { exact: true })).toBeVisible();
  await expect(phone.locator(".remote-bubble").first()).toBeDisabled();
  await expect(page.locator(".screen-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(phone.getByText("Viewer connected", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { muteCommands: unknown[] }).muteCommands.length)).toBe(2);

  // Disconnect just the viewer's Firebase connection, keeping the page mounted.
  await page.evaluate(async () => {
    const appModule = "/src/app_x/lib/firebase.ts";
    const sdkModule = "/node_modules/.vite/deps/firebase_database.js";
    const [{ getRoomDatabase }, { goOffline }] = await Promise.all([import(appModule), import(sdkModule)]);
    goOffline(await getRoomDatabase());
  });
  await expect(page.getByText("Disconnected", { exact: true })).toBeVisible();
  await expect(phone.getByText("Waiting for viewer", { exact: true })).toBeVisible();
  const state = await (await request.get(stateUrl(""))).json();
  await request.patch(stateUrl(""), { data: { command: { id: "while-offline", type: "mute", slug: state.focusedSlug } } });
  await page.evaluate(async () => {
    const appModule = "/src/app_x/lib/firebase.ts";
    const sdkModule = "/node_modules/.vite/deps/firebase_database.js";
    const [{ getRoomDatabase }, { goOnline }] = await Promise.all([import(appModule), import(sdkModule)]);
    goOnline(await getRoomDatabase());
  });
  await expect(phone.getByText("Viewer connected", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { muteCommands: unknown[] }).muteCommands.length)).toBe(2);
  await phone.locator(".remote-bubble").nth(0).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { muteCommands: unknown[] }).muteCommands.length)).toBe(3);
  // Reconnecting without a state change must still arm the next live gesture.
  await page.evaluate(async () => {
    const appModule = "/src/app_x/lib/firebase.ts";
    const sdkModule = "/node_modules/.vite/deps/firebase_database.js";
    const [{ getRoomDatabase }, { goOffline, goOnline }] = await Promise.all([import(appModule), import(sdkModule)]);
    const db = await getRoomDatabase();
    goOffline(db);
    goOnline(db);
  });
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await phone.locator(".remote-bubble").nth(0).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { muteCommands: unknown[] }).muteCommands.length)).toBe(4);
});

test("joining an existing named room replaces its lineup; other rooms stay independent", async ({ context, page, request }) => {
  await mockStreams(context);
  await request.put(stateUrl("a/b 🏀"), { data: {
    streams: [{ slug: "old", title: "Old stream", category: "MLB", raw_url: "https://example.test/old", espn_id: 0 }],
    focusedSlug: "old", command: { id: "old-command", type: "mute", slug: "old" },
  } });
  await page.goto("/");
  await page.locator(".stream-toggle").nth(2).click();
  await page.getByLabel(/Room ID/).fill("a/b 🏀");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  const saved = await (await request.get(stateUrl("a/b 🏀"))).json();
  expect(saved.streams).toHaveLength(1);
  expect(saved.streams[0].title).toContain("Phillies");
  expect(saved.command).toBeUndefined();
  expect(await (await request.get(stateUrl(""))).json()).toBeNull();
  const phone = await context.newPage();
  await phone.goto("/remote/a%2Fb%20%F0%9F%8F%80");
  await expect(phone.getByRole("heading", { name: "a/b 🏀" })).toBeVisible();
  await expect(phone.locator(".remote-bubble")).toHaveCount(1);

  const viewer2 = await context.newPage();
  await viewer2.goto("/");
  await viewer2.locator(".stream-toggle").nth(0).click();
  await viewer2.getByLabel(/Room ID/).fill("a/b 🏀");
  await viewer2.getByRole("button", { name: "Join", exact: true }).click();
  await expect(phone.locator(".remote-bubble")).toContainText("Yankees");
  await expect(page.locator(".screen-card-spotlight")).toContainText("Yankees");
  await viewer2.locator(".stream-toggle").nth(1).click();
  await expect(phone.locator(".remote-bubble")).toHaveCount(2);
  await expect(page.locator(".screen-card")).toHaveCount(2);
  await request.patch(stateUrl("a/b 🏀"), { data: { displayLogs: false } });
  await expect(phone.getByRole("button", { name: "Refresh spotlight log" })).toBeDisabled();
});

test("an empty room waits for a viewer, and failed Join leaves local controls usable", async ({ context, page, request }) => {
  await mockStreams(context);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/remote");
  await expect(page.getByText("Waiting for viewer", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh spotlight log" })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/remote-waiting.png", fullPage: true });

  await request.put(`${database}/.settings/rules.json?ns=${namespace}`, {
    headers: { Authorization: "Bearer owner" },
    data: { rules: { remoteRooms: { ".read": true, ".write": false } } },
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.locator(".stream-toggle").nth(0).click();
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText("This room could not be accessed. Check the Firebase room rules.")).toBeVisible();
  await page.locator(".stream-toggle").nth(1).click();
  await expect(page.locator(".screen-card")).toHaveCount(2);
  await page.locator(".stream-toggle").nth(0).click();
  await expect(page.locator(".screen-card")).toHaveCount(1);
});
