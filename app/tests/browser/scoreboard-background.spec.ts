import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

test("reopens the last real ESPN league in an invisible extension frame", async () => {
  test.setTimeout(60_000);
  const extension = path.resolve("../extension");
  const profile = await mkdtemp(path.join(tmpdir(), "scoreboard-background-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--remote-debugging-port=0", "--enable-unsafe-extension-debugging", ...(process.env.ESPN_LIVE_FRAME ? ["--ignore-certificate-errors"] : [])],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    await context.route("https://site.api.espn.com/**", route => route.fulfill({ json: { events: [] } }));
    await context.route("https://fantasy.espn.com/football/**", route => route.fulfill({
      contentType: "text/html", headers: { "content-security-policy": "frame-ancestors 'self'" },
      body: "<h1>ESPN league fixture</h1>",
    }));
    const fetchedLeagues: string[] = [];
    const apiData = (url: URL) => {
      if (url.searchParams.get("view") === "kona_playercard") return { players: [] };
      if (url.searchParams.get("view") === "proTeamSchedules_wl") return { settings: { proTeams: [] } };
      const id = url.pathname.split("/").at(-1)!;
      fetchedLeagues.push(id);
      return { id: Number(id), scoringPeriodId: 1,
        teams: [{ id: 1, name: `League ${id} team` }, { id: 2, name: "Opponent" }],
        schedule: [{ matchupPeriodId: 1, home: { teamId: 1, totalPointsLive: 80, totalProjectedPointsLive: 120 },
          away: { teamId: 2, totalPointsLive: 75, totalProjectedPointsLive: 110 } }],
      };
    };
    await context.route("https://lm-api-reads.fantasy.espn.com/**", route => route.fulfill({ json: apiData(new URL(route.request().url())) }));
    // Playwright does not attach to offscreen extension targets. Use a separate
    // CDP connection for fixtures there. Fetch.fulfillRequest bypasses Chrome's
    // response-header rules, so use the resulting CSP here and test rule matching
    // independently below. The real network smoke check can use ESPN_LIVE_FRAME=1.
    const port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0];
    const { webSocketDebuggerUrl } = await (await fetch(`http://localhost:${port}/json/version`)).json() as { webSocketDebuggerUrl: string };
    const socket = new WebSocket(webSocketDebuggerUrl);
    await new Promise<void>(resolve => socket.addEventListener("open", () => resolve(), { once: true }));
    let sequence = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (reason: unknown) => void }>();
    const send = (method: string, params: any = {}, sessionId?: string): Promise<any> => new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
    const fixtureErrors: string[] = [];
    let offscreenSession: string | undefined;
    socket.addEventListener("message", event => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const waiter = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) waiter?.reject(message.error); else waiter?.resolve(message.result);
        return;
      }
      void (async () => {
        if (message.method === "Target.attachedToTarget") {
          const session = message.params.sessionId;
          if (message.params.targetInfo.type === "other") offscreenSession = session;
          await send("Fetch.enable", { patterns: [{ urlPattern: "*fantasy.espn.com/*" }] }, session);
          await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{type: "iframe"}, {exclude: true}] }, session);
          await send("Runtime.runIfWaitingForDebugger", {}, session);
        }
        if (message.method === "Fetch.requestPaused") {
          const { requestId, request } = message.params;
          const url = new URL(request.url);
          const api = url.hostname === "lm-api-reads.fantasy.espn.com";
          if (!api && process.env.ESPN_LIVE_FRAME) { await send("Fetch.continueRequest", {requestId}, message.sessionId); return; }
          await send("Fetch.fulfillRequest", { requestId, responseCode: 200,
            responseHeaders: [{ name: "content-type", value: api ? "application/json" : "text/html" },
              { name: "access-control-allow-origin", value: "https://fantasy.espn.com" },
              { name: "access-control-allow-credentials", value: "true" },
              { name: "access-control-allow-headers", value: "x-fantasy-filter" },
              ...(!api ? [{ name: "content-security-policy", value: `frame-ancestors 'self' ${worker.url().split("/").slice(0,3).join("/")}` }] : [])],
            body: Buffer.from(api ? JSON.stringify(apiData(url)) : "<h1>Hidden ESPN league fixture</h1>").toString("base64"),
          }, message.sessionId);
        }
      })().catch(error => fixtureErrors.push(JSON.stringify(error)));
    });
    await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
      filter: [{ type: "other" }, { type: "background_page" }, { type: "iframe" }, { exclude: true }] });
    const first = await context.newPage();
    await first.goto("https://fantasy.espn.com/football/team?leagueId=123&seasonId=2026");
    const recent = await context.newPage();
    await recent.goto("https://fantasy.espn.com/football/team?leagueId=456&seasonId=2026");
    const savedLeague = () => worker.evaluate(async () => {
      const chrome = (globalThis as any).chrome;
      return (await chrome.storage.local.get("scoreboardLastOpenedLeague")).scoreboardLastOpenedLeague;
    });
    await expect.poll(async () => (await savedLeague())?.leagueId).toBe("456");
    await first.close();
    await recent.close();
    const saved = await savedLeague();
    const page = await context.newPage();
    await page.goto("http://localhost:4173/#Fantasy420Scoreboard");
    await expect(page.getByRole("heading", { name: "League 456 team", exact: true })).toBeVisible({ timeout: 12000 });
    expect(fetchedLeagues).toEqual(["456"]);
    const ruleMatches = await worker.evaluate(async () => {
      const chrome = (globalThis as any).chrome;
      const request = { url: "https://fantasy.espn.com/football/league?leagueId=456&seasonId=2026", type: "sub_frame", tabId: -1, initiator: chrome.runtime.getURL("") };
      return Promise.all([request, {...request, url:`${request.url}#multisport420-scoreboard=1234-abcd`},
        {...request, initiator:"https://multisport420.web.app"}, {...request, type:"main_frame"},
        {...request, url:request.url.replace("456", "999")}].map(async input =>
          (await chrome.declarativeNetRequest.testMatchOutcome(input)).matchedRules.map((rule: any) => rule.ruleId)));
    });
    expect(ruleMatches).toEqual([[4201], [4201], [], [], []]);
    if (process.env.ESPN_LIVE_FRAME) { socket.close(); return; }
    await expect(page.locator("iframe")).toHaveCount(0);
    const background = () => worker.evaluate(async () => {
      const chrome = (globalThis as any).chrome;
      return { tabs: await chrome.tabs.query({ url: "https://fantasy.espn.com/*" }),
        contexts: await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] }) };
    });
    expect((await background()).tabs).toHaveLength(0);
    expect((await background()).contexts).toHaveLength(1);
    await page.getByRole("button", { name: "Refresh screen (1) Fantasy scoreboard" }).click();
    await expect.poll(() => fetchedLeagues.length).toBe(2);
    expect((await background()).contexts).toHaveLength(1);
    expect(await savedLeague()).toEqual(saved);

    // A real tab takes precedence and changes the remembered league.
    const reopened = await context.newPage();
    await reopened.goto("https://fantasy.espn.com/football/team?leagueId=123&seasonId=2026");
    await expect.poll(async () => (await savedLeague())?.leagueId).toBe("123");
    await page.getByRole("button", { name: "Refresh screen (1) Fantasy scoreboard" }).click();
    await expect(page.getByRole("heading", { name: "League 123 team", exact: true })).toBeVisible();
    await reopened.close();
    await page.getByRole("button", { name: "Refresh screen (1) Fantasy scoreboard" }).click();
    await expect.poll(() => fetchedLeagues.length).toBe(4);
    expect(fetchedLeagues).toEqual(["456", "456", "123", "123"]);
    expect((await background()).tabs).toHaveLength(0);
    expect((await background()).contexts).toHaveLength(1);
    const beforeConcurrent = fetchedLeagues.length;
    const responses = await page.evaluate(async () => {
      const chrome = (window as any).chrome;
      const id = document.documentElement.dataset.multisport420ExtensionId!;
      return Promise.all([1, 2].map(() => new Promise<any>(resolve => chrome.runtime.sendMessage(id, {scoreboard:{action:"fetch"}}, resolve))));
    });
    expect(responses.every(response => response.fetched === 1 && !response.error)).toBe(true);
    expect(fetchedLeagues.length).toBe(beforeConcurrent + 1);
    // Trigger the offscreen idle callback without waiting a real minute.
    await send("Runtime.evaluate", { expression: 'chrome.runtime.sendMessage({type:"multisport420:scoreboard:idle"})' }, offscreenSession);
    await expect.poll(async () => (await background()).contexts.length).toBe(0);
    expect(await worker.evaluate(() => (globalThis as any).chrome.declarativeNetRequest.getSessionRules())).toEqual([]);
    expect((await savedLeague()).leagueId).toBe("123");
    expect(fixtureErrors).toEqual([]);
    socket.close();
  } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
});
