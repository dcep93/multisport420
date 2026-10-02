const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");

function harness(options = {}) {
  const external = [], internal = [];
  let content;
  const calls = [];
  const storage = { ...(options.storage || {}) };
  const updated = [], activated = [];
  const tabs = options.tabs ?? [{ id: 10, active: true, url: "https://fantasy.espn.com/football/team?leagueId=123&seasonId=2025" }];
  const background = vm.createContext({ URL, crypto: { randomUUID }, setTimeout, clearTimeout, console: { log() {} }, chrome: {
    runtime: {
      onConnect: { addListener() {} },
      onMessage: { addListener(fn) { internal.push(fn); } },
      onMessageExternal: { addListener(fn) { external.push(fn); } },
    },
    tabs: {
      onUpdated: { addListener(fn) { updated.push(fn); } },
      onActivated: { addListener(fn) { activated.push(fn); } },
      async get(id) { return tabs.find(tab => tab.id === id); },
      async query(query) { assert.equal(query.url, "https://fantasy.espn.com/football/*"); return tabs; },
      async sendMessage(id, message, target) {
        calls.push({ id, message, target });
        if (options.disconnected) throw new Error("Receiving end does not exist");
        return new Promise(resolve => content(message, { id: "extension" }, resolve));
      },
    },
    storage: { local: {
      async get(key) { return { [key]: storage[key] }; },
      async set(values) { Object.assign(storage, values); },
    } },
  } });
  background.importScripts = (...filenames) => filenames.forEach(filename => vm.runInContext(fs.readFileSync(`${__dirname}/${filename}`, "utf8"), background));
  vm.runInContext(fs.readFileSync(`${__dirname}/background.js`, "utf8"), background);
  const context = vm.createContext({ URL, Date, AbortController,
    FileReader: class {
      readAsDataURL(blob) {
        blob.arrayBuffer().then(bytes => { this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`; this.onload(); });
      }
    },
    setTimeout: options.setTimeout ?? setTimeout, clearTimeout,
    location: { href: options.page ?? tabs[0]?.url },
    fetch: async (url, request) => {
      calls.push({ url, request });
      if (options.fetch) return options.fetch(url, request);
      if (options.fetchError) throw new TypeError("Failed to fetch");
      if (options.response) return options.response;
      const view = new URL(url).searchParams.get("view");
      return { ok: true, json: async () => view === "kona_playercard" ? { players: [] }
        : view === "proTeamSchedules_wl" ? { settings: { proTeams: [] } }
          : { id: 123, teams: [], schedule: [] } };
    },
    chrome: { runtime: { id: "extension", onMessage: { addListener(fn) { content = fn; } },
      sendMessage: message => new Promise(resolve => internal.forEach(listener => listener(message, { tab: { id: options.senderTab ?? calls.find(call => call.id)?.id }, frameId: options.frameId ?? 0 }, resolve))),
    } },
  });
  vm.runInContext(fs.readFileSync(`${__dirname}/scoreboard_content.js`, "utf8"), context);
  if (options.hiddenFrame) background.withScoreboardFrame = options.hiddenFrame;
  return { calls, internal, content, storage, updated, activated, send: (request = { scoreboard: { action: "fetch" } }, url = "https://multisport420.web.app/scoreboard") => new Promise(resolve => {
    external.forEach(listener => listener(request, { url }, resolve));
  }) };
}

test("extension keeps the original scoreboard views and one logical refresh with optional details", async () => {
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
  assert.equal(h.calls.filter(call => call.url).length, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.scoreboardDetails)), { players: [], proTeams: [] });
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

test("remembers only real ESPN league visits and falls back without overwriting them", async () => {
  const saved = { leagueId: "456", year: 2026, visitedAt: Date.now() };
  const h = harness({ tabs: [], storage: { scoreboardLastOpenedLeague: saved },
    hiddenFrame: async (url) => { assert.equal(url, "https://fantasy.espn.com/football/league?leagueId=456&seasonId=2026"); return { fetched: 1, data: {} }; } });
  assert.equal((await h.send()).fetched, 1);
  assert.equal(h.storage.scoreboardLastOpenedLeague, saved);
  const mismatch = await h.send({ scoreboard: { action: "fetch", leagueId: "789" } });
  assert.equal(mismatch.fetched, 0);
  assert.match(mismatch.error, /once in Chrome/);
  const observed = { id: 20, url: "https://fantasy.espn.com/football/team?leagueId=789&seasonId=2025" };
  h.updated[0](20, { url: observed.url }, observed);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.storage.scoreboardLastOpenedLeague.leagueId, "789");
  assert.equal(h.storage.scoreboardLastOpenedLeague.year, 2025);
  h.updated[0](20, { url: "https://evil.example/?leagueId=999" }, { id: 20, url: "https://evil.example/?leagueId=999" });
  h.updated[0](21, { url: observed.url }, { ...observed, incognito: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.storage.scoreboardLastOpenedLeague.leagueId, "789");
});

test("an older matching tab cannot replace the more recently visited saved league", async () => {
  const saved = { leagueId: "456", year: 2026, visitedAt: Date.now() };
  const h = harness({ tabs: [{ id: 10, active: false, lastAccessed: 1,
    url: "https://fantasy.espn.com/football/team?leagueId=123&seasonId=2025" }],
    storage: { scoreboardLastOpenedLeague: saved } });
  assert.equal((await h.send()).leagueId, "123");
  assert.equal(h.storage.scoreboardLastOpenedLeague, saved);
});

test("the website marker exposes only this extension ID", () => {
  const document = { documentElement: { dataset: {} } };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/content_script.js`, "utf8"), {
    document, chrome: { runtime: { id: "multisport-extension-id" } },
  });
  assert.deepEqual(document.documentElement.dataset, { multisport420ExtensionId: "multisport-extension-id" });
});

test("custom ESPN logos use the authenticated ESPN connection and tolerate missing images", async () => {
  const logo = "https://mystique-api.fantasy.espn.com/apis/v1/domains/lm/images/custom-image";
  const badLogo = `${logo}-missing`;
  const h = harness({ fetch: async (url, request) => {
    if (url === logo) {
      assert.equal(request.credentials, "include");
      return { ok: true, blob: async () => new Blob(["fixture"], { type: "image/png" }) };
    }
    if (url === badLogo) return { ok: false, status: 404 };
    const view = new URL(url).searchParams.get("view");
    return ok(view === "kona_playercard" ? { players: [] } : view === "proTeamSchedules_wl" ? { settings: { proTeams: [] } }
      : { id: 123, schedule: [], teams: [{id:1, logo}, {id:2, logo}, {id:3, logo:badLogo}, {id:4, logo:"https://evil.example/logo.png"}] });
  } });
  const result = await h.send();
  assert.equal(result.data.scoreboardDetails.teamLogos[1], "data:image/png;base64,Zml4dHVyZQ==");
  assert.equal(result.data.scoreboardDetails.teamLogos[2], result.data.scoreboardDetails.teamLogos[1]);
  assert.equal(result.data.scoreboardDetails.teamLogos[3], undefined);
  assert.equal(h.calls.filter(call => call.url === logo).length, 1);
  assert.equal(h.calls.some(call => call.url?.includes("evil.example")), false);
});

const ok = data => ({ ok: true, json: async () => data });
const league = { id: 123, teams: [{ id: 1 }], schedule: [] };
const proTeams = [{ id: 1, proGamesByScoringPeriod: { 4: [{ statsOfficial: true }] } }];
const playerBatch = (offset, length) => Array.from({ length }, (_, index) => ({
  id: offset + index + 1, onTeamId: index % 2,
  player: { id: offset + index + 1, stats: [{ appliedTotal: index, scoringPeriodId: 4 }] },
}));
function detailFetch(players, schedules = () => ok({ settings: { proTeams } })) {
  return (url, request) => {
    const view = new URL(url).searchParams.get("view");
    return view === "kona_playercard" ? players(JSON.parse(request.headers["x-fantasy-filter"]).players, request)
      : view === "proTeamSchedules_wl" ? schedules(request) : ok({ ...league });
  };
}

test("complete player pool uses authenticated league-scored pages, stats filters and raw schedule data", async () => {
  const h = harness({ fetch: detailFetch(filter => ok({
    players: playerBatch(filter.offset, filter.offset ? 2 : 500), totalPlayers: 502,
  })) });
  const result = await h.send({ scoreboard: { action: "fetch", year: 2026, url: "https://evil.example/players" } });
  assert.equal(result.fetched, 1);
  assert.equal(result.data.scoreboardDetails.players.length, 502);
  assert.deepEqual(result.data.scoreboardDetails.proTeams, proTeams);
  assert.equal(result.data.scoreboardDetails.warning, undefined);
  const requests = h.calls.filter(call => call.url);
  assert.equal(requests.length, 4);
  for (const call of requests) {
    const url = new URL(call.url);
    assert.equal(url.origin, "https://lm-api-reads.fantasy.espn.com");
    assert.equal(call.request.credentials, "include");
    assert.equal(call.request.cache, "no-store");
    assert.equal(call.request.signal, requests[0].request.signal);
    if (url.searchParams.get("view") === "kona_playercard") {
      assert.equal(url.pathname, "/apis/v3/games/ffl/seasons/2026/segments/0/leagues/123");
      const filter = JSON.parse(call.request.headers["x-fantasy-filter"]).players;
      assert.equal(filter.limit, 500);
      assert.deepEqual(filter.filterStatsForTopScoringPeriodIds, { value: 18, additionalValue: ["002026", "102026"] });
      assert.equal(filter.filterStatus, undefined);
      assert.deepEqual(filter.sortPercOwned, { sortPriority: 1, sortAsc: false });
    }
    if (url.searchParams.get("view") === "proTeamSchedules_wl") {
      assert.equal(url.pathname, "/apis/v3/games/ffl/seasons/2026");
    }
  }
  assert.deepEqual(requests.filter(call => call.request.headers).map(call =>
    JSON.parse(call.request.headers["x-fantasy-filter"]).players.offset), [0, 500]);
});

test("pool pagination terminates on a short page or the advertised count", async () => {
  for (const totalPlayers of [undefined, 1000]) {
    let pageCount = 0;
    const h = harness({ fetch: detailFetch(filter => {
      pageCount += 1;
      return ok({ players: playerBatch(filter.offset, filter.offset === 1000 ? 1 : 500), totalPlayers });
    }) });
    const result = await h.send();
    assert.equal(pageCount, totalPlayers ? 2 : 3);
    assert.equal(result.data.scoreboardDetails.players.length, totalPlayers ?? 1001);
    assert.equal(result.data.scoreboardDetails.warning, undefined);
  }
});

test("optional endpoint failures preserve the base scoreboard and independent successful detail", async () => {
  for (const failure of [() => ({ ok: false, status: 403 }), () => { throw new TypeError("Failed to fetch"); },
    () => ok({ wrong: [] }), () => ({ ok: true, json: async () => { throw new SyntaxError("Bad JSON"); } })]) {
    for (const failedEndpoint of ["pool", "schedule"]) {
      const h = harness({ fetch: detailFetch(failedEndpoint === "pool" ? failure : () => ok({ players: playerBatch(0, 2) }),
        failedEndpoint === "schedule" ? failure : undefined) });
      const result = await h.send();
      assert.equal(result.fetched, 1);
      assert.equal(result.error, undefined);
      assert.deepEqual(result.data.teams, league.teams);
      const detail = result.data.scoreboardDetails;
      assert.ok(detail.warning);
      if (failedEndpoint === "pool") {
        assert.equal(detail.players, undefined);
        assert.deepEqual(detail.proTeams, proTeams);
      } else {
        assert.equal(detail.players.length, 2);
        assert.equal(detail.proTeams, undefined);
      }
    }
  }
});

test("truncated, overlapping and unbounded pages cannot be presented as a complete player pool", async () => {
  for (const players of [
    () => ok({ players: playerBatch(0, 2), totalPlayers: 502 }),
    () => ok({ players: playerBatch(0, 500) }),
    filter => ok({ players: playerBatch(filter.offset, 500), totalPlayers: 10001 }),
    () => ok({ players: [{}] }),
  ]) {
    const h = harness({ fetch: detailFetch(players) });
    const result = await h.send();
    assert.equal(result.error, undefined);
    assert.equal(result.fetched, 1);
    assert.equal(result.data.scoreboardDetails.players, undefined);
    assert.match(result.data.scoreboardDetails.warning, /Player pool incomplete/);
    assert.deepEqual(result.data.scoreboardDetails.proTeams, proTeams);
    assert.ok(h.calls.filter(call => call.request?.headers).length <= 20);
  }
});

test("a failed later player page discards the earlier subset and preserves schedules", async () => {
  const h = harness({ fetch: detailFetch(filter => filter.offset === 0
    ? ok({ players: playerBatch(0, 500), totalPlayers: 700 })
    : { ok: false, status: 503 }) });
  const result = await h.send();
  assert.equal(result.error, undefined);
  assert.equal(result.fetched, 1);
  assert.equal(result.data.scoreboardDetails.players, undefined);
  assert.deepEqual(result.data.scoreboardDetails.proTeams, proTeams);
  assert.match(result.data.scoreboardDetails.warning, /Player pool incomplete.*503/);
  assert.equal(h.calls.filter(call => call.request?.headers).length, 2);
});

test("one 12-second deadline aborts optional details without dropping the scoreboard", async () => {
  let expire;
  const signals = [];
  const pending = request => new Promise((_, reject) => {
    signals.push(request.signal);
    request.signal.addEventListener("abort", () => {
      const error = new Error("Aborted"); error.name = "AbortError"; reject(error);
    }, { once: true });
    if (signals.length === 2) queueMicrotask(expire);
  });
  const h = harness({ setTimeout(fn, ms) { assert.equal(ms, 12000); expire = fn; return undefined; },
    fetch: detailFetch((_, request) => pending(request), pending) });
  const result = await h.send();
  assert.equal(signals.length, 2);
  assert.equal(signals[0], signals[1]);
  assert.equal(signals[0].aborted, true);
  assert.equal(result.error, undefined);
  assert.equal(result.fetched, 1);
  assert.deepEqual(result.data.teams, league.teams);
  assert.equal(result.data.scoreboardDetails.players, undefined);
  assert.equal(result.data.scoreboardDetails.proTeams, undefined);
  assert.match(result.data.scoreboardDetails.warning, /Player pool incomplete.*timed out.*NFL game completion unavailable.*timed out/);
});

test("base request abort remains a failed logical refresh without requesting details", async () => {
  let expire;
  const h = harness({ setTimeout(fn, ms) { assert.equal(ms, 12000); expire = fn; },
    fetch: (_, request) => new Promise((_, reject) => {
      request.signal.addEventListener("abort", () => {
        const error = new Error("Aborted"); error.name = "AbortError"; reject(error);
      });
      queueMicrotask(expire);
    }) });
  const result = await h.send();
  assert.equal(result.fetched, 1);
  assert.match(result.error, /too long/);
  assert.equal(h.calls.filter(call => call.url).length, 1);
});

test("content script rejects forged extension senders and navigated origins before details", async () => {
  const h = harness();
  assert.equal(h.content({ type: "multisport420:scoreboard:fetch" }, { id: "other-extension" }, () => {
    assert.fail("must not reply to another extension");
  }), false);
  assert.equal(h.calls.length, 0);
  for (const page of ["https://evil.example/?leagueId=123", "https://fantasy.espn.com.evil.example/?leagueId=123"]) {
    const navigated = harness({ page });
    const result = await navigated.send();
    assert.equal(result.fetched, 0);
    assert.ok(result.error);
    assert.equal(navigated.calls.filter(call => call.url).length, 0);
  }
});
