import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

test("closed-tab scoreboard uses credentialed worker requests and durable IndexedDB without extra permissions", async () => {
  test.setTimeout(60_000);
  const extension = path.resolve("../extension");
  const profile = await mkdtemp(path.join(tmpdir(), "scoreboard-background-"));
  const launch = () => chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  let context = await launch();
  const fetchedLeagues: string[] = [];
  const requestCookies: string[] = [];
  const logo = "https://mystique-api.fantasy.espn.com/apis/v1/domains/lm/images/fixture";
  const setup = async () => {
    await context.route("https://site.api.espn.com/**", route => route.fulfill({ json: { events: [] } }));
    await context.route("https://fantasy.espn.com/football/**", route => route.fulfill({
      contentType: "text/html", headers: { "content-security-policy": "frame-ancestors 'self'" },
      body: "<h1>ESPN league fixture</h1>",
    }));
    await context.route("https://mystique-api.fantasy.espn.com/**", async route => {
      requestCookies.push((await route.request().allHeaders()).cookie ?? "");
      await route.fulfill({ contentType: "image/jpg", body: Buffer.from("fixture") });
    });
    await context.route("https://lm-api-reads.fantasy.espn.com/**", async route => {
      const url = new URL(route.request().url());
      requestCookies.push((await route.request().allHeaders()).cookie ?? "");
      if (url.searchParams.get("view") === "kona_playercard") return route.fulfill({ json: { players: [{ id: 1 }], totalPlayers: 1 } });
      if (url.searchParams.get("view") === "proTeamSchedules_wl") return route.fulfill({ json: { settings: { proTeams: [{ id: 1 }] } } });
      const id = url.pathname.split("/").at(-1)!;
      fetchedLeagues.push(id);
      return route.fulfill({ json: { id: Number(id), teams: [{ id: 1, logo }], schedule: [] } });
    });
  };
  try {
    await setup();
    // Synthetic auth verifies Chrome sends existing cookies without a cookies API.
    await context.addCookies([{ name: "scoreboard_fixture_auth", value: "signed-in", domain: ".fantasy.espn.com", path: "/", secure: true, httpOnly: true, sameSite: "None", expires: Math.floor(Date.now() / 1000) + 3600 }]);
    let worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const savedLeague = () => worker.evaluate(() => (globalThis as any).scoreboardLeagueStore.get());
    for (const id of ["123", "456"]) {
      const tab = await context.newPage();
      await tab.goto(`https://fantasy.espn.com/football/team?leagueId=${id}&seasonId=2026`);
      await expect.poll(async () => (await savedLeague())?.leagueId).toBe(id);
      await tab.close();
    }
    const saved = await savedLeague();
    // An older visit must not overwrite the latest selection in a real transaction.
    await worker.evaluate(() => (globalThis as any).scoreboardLeagueStore.remember({ leagueId: "999", year: 2026, visitedAt: 1 }));
    expect(await savedLeague()).toEqual(saved);
    const page = await context.newPage();
    await page.goto("http://localhost:4173/");
    const request = () => page.evaluate(() => new Promise<any>(resolve => {
      (window as any).chrome.runtime.sendMessage(document.documentElement.dataset.multisport420ExtensionId,
        { scoreboard: { action: "fetch" } }, resolve);
    }));
    const result = await request();
    expect(result.error).toBeUndefined();
    expect(result.leagueId).toBe("456");
    expect(result.data.scoreboardDetails.players).toEqual([{ id: 1 }]);
    expect(result.data.scoreboardDetails.proTeams).toEqual([{ id: 1 }]);
    expect(result.data.scoreboardDetails.teamLogos[1]).toBe("data:image/jpeg;base64,Zml4dHVyZQ==");
    expect(requestCookies.length).toBe(4);
    expect(requestCookies.every(cookie => cookie.includes("scoreboard_fixture_auth=signed-in"))).toBe(true);
    expect(fetchedLeagues).toEqual(["456"]);
    expect(await savedLeague()).toEqual(saved);
    const state = await worker.evaluate(async () => {
      const chrome = (globalThis as any).chrome;
      return { permissions: chrome.runtime.getManifest().permissions ?? [],
        tabs: await chrome.tabs.query({ url: "https://fantasy.espn.com/*" }),
        offscreen: await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] }) };
    });
    expect(state).toEqual({ permissions: [], tabs: [], offscreen: [] });

    // Persist across an actual browser/worker restart, with no ESPN page reopened.
    await context.close();
    context = await launch();
    await setup();
    worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    expect(await savedLeague()).toEqual(saved);
    expect(context.pages().some(tab => tab.url().startsWith("https://fantasy.espn.com"))).toBe(false);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
