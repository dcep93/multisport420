const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");

function harness(options = {}) {
  const external = [], internal = [];
  let content;
  const calls = [];
  const tabs = options.tabs ?? [{ id: 10, active: true, url: "https://fantasy.espn.com/football/team?leagueId=123&seasonId=2025" }];
  const background = vm.createContext({ URL, crypto: { randomUUID }, setTimeout, clearTimeout, console: { log() {} }, chrome: {
    runtime: {
      onMessage: { addListener(fn) { internal.push(fn); } },
      onMessageExternal: { addListener(fn) { external.push(fn); } },
    },
    tabs: {
      async query(query) { assert.equal(query.url, "https://fantasy.espn.com/football/*"); return tabs; },
      async sendMessage(id, message, target) {
        calls.push({ id, message, target });
        if (options.disconnected) throw new Error("Receiving end does not exist");
        return new Promise(resolve => content(message, { id: "extension" }, resolve));
      },
    },
  } });
  background.importScripts = filename => vm.runInContext(fs.readFileSync(`${__dirname}/${filename}`, "utf8"), background);
  vm.runInContext(fs.readFileSync(`${__dirname}/background.js`, "utf8"), background);
  const context = vm.createContext({ URL, Date, AbortController, setTimeout, clearTimeout,
    location: { href: options.page ?? tabs[0]?.url },
    fetch: async (url, request) => {
      calls.push({ url, request });
      if (options.fetchError) throw new TypeError("Failed to fetch");
      return options.response ?? { ok: true, json: async () => ({ id: 123, teams: [], schedule: [] }) };
    },
    chrome: { runtime: { id: "extension", onMessage: { addListener(fn) { content = fn; } },
      sendMessage: message => new Promise(resolve => internal[0](message, { tab: { id: options.senderTab ?? calls.find(call => call.id)?.id }, frameId: options.frameId ?? 0 }, resolve)),
    } },
  });
  vm.runInContext(fs.readFileSync(`${__dirname}/scoreboard_content.js`, "utf8"), context);
  return { calls, internal, content, send: (request = { scoreboard: { action: "fetch" } }, url = "https://multisport420.web.app/scoreboard") => new Promise(resolve => {
    external.forEach(listener => listener(request, { url }, resolve));
  }) };
}

test("extension fetches the original ESPN views once, from the league tab with cookies and no cache", async () => {
  const h = harness();
  const result = await h.send();
  assert.equal(result.fetched, 1);
  assert.equal(result.year, 2025);
  assert.equal(result.leagueId, "123");
  const request = h.calls.find(call => call.url);
  const url = new URL(request.url);
  assert.equal(url.origin, "https://lm-api-reads.fantasy.espn.com");
  assert.equal(url.pathname, "/apis/v3/games/ffl/seasons/2025/segments/0/leagues/123");
  assert.deepEqual(url.searchParams.getAll("view"), ["mMatchup", "mMatchupScore", "mRoster", "mScoreboard", "mSettings", "mStatus", "mTeam", "modular", "mNav"]);
  assert.equal(request.request.credentials, "include");
  assert.equal(request.request.cache, "no-store");
  assert.equal(h.calls[0].target.frameId, 0);
});

test("league/year options select the matching tab and requested season", async () => {
  const h = harness({ tabs: [
    { id: 1, active: true, url: "https://fantasy.espn.com/football/team?leagueId=456" },
    { id: 2, active: false, url: "https://fantasy.espn.com/football/team?leagueId=123&seasonId=2025" },
  ], page: "https://fantasy.espn.com/football/team?leagueId=123&seasonId=2025" });
  const result = await h.send({ scoreboard: { action: "fetch", leagueId: "123", year: 2026 } });
  assert.equal(h.calls[0].id, 2);
  assert.equal(result.year, 2026);
});

test("no tab, disconnected content script, and navigation count zero fetches", async () => {
  for (const options of [{ tabs: [] }, { disconnected: true }, { page: "https://fantasy.espn.com/football/" }]) {
    const h = harness(options);
    const result = await h.send();
    assert.equal(result.fetched, 0);
    assert.ok(result.error);
    assert.equal(h.calls.filter(call => call.url).length, 0);
  }
});

test("HTTP, network and invalid JSON shape failures still count a started request", async () => {
  for (const options of [
    { response: { ok: false, status: 403 } },
    { response: { ok: false, status: 503 } },
    { fetchError: true },
    { response: { ok: true, json: async () => ({ error: "not a league" }) } },
  ]) {
    const h = harness(options);
    const result = await h.send();
    assert.equal(result.fetched, 1);
    assert.ok(result.error);
    assert.equal(h.calls.filter(call => call.url).length, 1);
  }
});

test("rejects untrusted origins and malformed options before accessing ESPN", async () => {
  const h = harness();
  for (const [request, origin] of [
    [{ scoreboard: { action: "fetch" } }, "https://evil.example/"],
    [{ scoreboard: { action: "fetch" } }, "https://fantasy420.web.app/"],
    [{ scoreboard: { action: "fetch" } }, "https://multisport420.web.app.evil.example/"],
    [{ scoreboard: { action: "fetch", leagueId: "../123" } }, "https://multisport420.web.app/"],
    [{ scoreboard: { action: "fetch", year: 1 } }, "https://multisport420.web.app/"],
  ]) {
    const result = await h.send(request, origin);
    assert.equal(result.fetched, 0);
    assert.ok(result.error);
  }
  assert.equal(h.calls.length, 0);
});

test("only the selected top-level ESPN tab can acknowledge a network start", async () => {
  for (const options of [{ senderTab: 99 }, { frameId: 2 }]) {
    const h = harness(options);
    const result = await h.send();
    assert.equal(result.fetched, 0);
    assert.match(result.error, /expired/);
    assert.equal(h.calls.filter(call => call.url).length, 0);
  }
});


test("localhost can request the scoreboard", async () => {
  const h = harness();
  const result = await h.send({ scoreboard: { action: "fetch" } }, "http://localhost:5173/");
  assert.equal(result.fetched, 1);
});

test("the website marker exposes only this extension ID", () => {
  const document = { documentElement: { dataset: {} } };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/content_script.js`, "utf8"), {
    document, chrome: { runtime: { id: "multisport-extension-id" } },
  });
  assert.deepEqual(document.documentElement.dataset, { multisport420ExtensionId: "multisport-extension-id" });
});
