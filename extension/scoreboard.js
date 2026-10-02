// Dedicated, uncached scoreboard bridge. It never accepts a caller-supplied URL.
(() => {
  const pending = new Map();
  const prefix = "multisport420:scoreboard:";
  const fail = (error, fetched = 0) => ({ error, fetched });
  const lastLeagueKey = "scoreboardLastOpenedLeague";
  let remembering = Promise.resolve();

  function leagueFromTab(tab) {
    try {
      const url = new URL(tab.url);
      const leagueId = url.searchParams.get("leagueId");
      if (tab.id === undefined || url.origin !== "https://fantasy.espn.com" ||
          !url.pathname.startsWith("/football/") || !/^\d+$/.test(leagueId || "")) return;
      const year = Number(url.searchParams.get("seasonId"));
      return { leagueId, ...(Number.isInteger(year) && year >= 2000 && year <= 2100 ? { year } : {}) };
    } catch { return; }
  }

  function rememberTab(tab, visitedAt = Date.now()) {
    const league = leagueFromTab(tab);
    if (!league || tab.incognito) return remembering;
    remembering = remembering.catch(() => {}).then(async () => {
      const previous = (await chrome.storage.local.get(lastLeagueKey))[lastLeagueKey];
      if (!previous || visitedAt >= previous.visitedAt) await chrome.storage.local.set({
        [lastLeagueKey]: { ...league, visitedAt },
      });
    });
    return remembering;
  }
  chrome.tabs.onUpdated.addListener((_id, change, tab) => {
    if (change.url) void rememberTab(tab).catch(() => {});
  });
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    const visitedAt = Date.now();
    void chrome.tabs.get(tabId).then(tab => rememberTab(tab, visitedAt)).catch(() => {});
  });

  function allowedSender(sender) {
    try {
      const url = new URL(sender.url);
      return url.origin === "https://multisport420.web.app" ||
        (url.hostname === "localhost" && ["http:", "https:"].includes(url.protocol));
    } catch {
      return false;
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type !== `${prefix}started`) return false;
    const request = pending.get(message.requestId);
    const matches = request && (request.frameUrl
      ? !sender.tab && sender.url === request.frameUrl
      : sender.tab?.id === request.tabId && sender.frameId === 0);
    if (!matches) {
      reply(false);
      return false;
    }
    request.fetched = 1;
    reply(true);
    return false;
  });

  chrome.runtime.onMessageExternal.addListener((message, sender, reply) => {
    if (!message?.scoreboard) return false;
    if (!allowedSender(sender)) {
      reply(fail("Scoreboard requests must come from Multisport420."));
      return false;
    }
    const options = message.scoreboard;
    if (options.action !== "fetch" ||
        (options.leagueId !== undefined && !/^\d+$/.test(String(options.leagueId))) ||
        (options.year !== undefined && (!Number.isInteger(options.year) || options.year < 2000 || options.year > 2100))) {
      reply(fail("Invalid scoreboard request."));
      return false;
    }

    (async () => {
      const tabs = await chrome.tabs.query({ url: "https://fantasy.espn.com/football/*" });
      const candidates = tabs.filter((tab) => {
        try {
          const leagueId = new URL(tab.url).searchParams.get("leagueId");
          return tab.id !== undefined && /^\d+$/.test(leagueId || "") &&
            (options.leagueId === undefined || leagueId === String(options.leagueId));
        } catch {
          return false;
        }
      }).sort((a, b) => Number(b.active) - Number(a.active) || (b.lastAccessed || 0) - (a.lastAccessed || 0));
      const tab = candidates[0];
      if (tab) {
        await rememberTab(tab, tab.lastAccessed || Date.now());
        return fetchFromTarget({ tabId: tab.id, send: message => chrome.tabs.sendMessage(tab.id, message, { frameId: 0 }) }, options);
      }
      await remembering;
      const saved = (await chrome.storage.local.get(lastLeagueKey))[lastLeagueKey];
      if (!saved || !/^\d+$/.test(saved.leagueId || "") ||
          (options.leagueId !== undefined && String(options.leagueId) !== saved.leagueId)) {
        return fail("Open your ESPN Fantasy football league once in Chrome, then refresh. The extension will remember it after you close the tab.");
      }
      const url = new URL("https://fantasy.espn.com/football/league");
      url.searchParams.set("leagueId", saved.leagueId);
      const year = options.year ?? saved.year;
      if (Number.isInteger(year) && year >= 2000 && year <= 2100) url.searchParams.set("seasonId", year);
      return withScoreboardFrame(url.href, target => fetchFromTarget(target, options));
    })().then(reply, error => reply(fail(error.message || "Unable to connect to ESPN. Reload the Multisport420 extension and try again.")));
    return true;
  });

  async function fetchFromTarget(target, options) {
    const requestId = crypto.randomUUID();
    const request = { tabId: target.tabId, frameUrl: target.frameUrl, fetched: 0 };
    pending.set(requestId, request);
    let timer;
    try {
      const result = await Promise.race([
        target.send({
          type: `${prefix}fetch`, requestId,
          leagueId: options.leagueId, year: options.year,
        }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("ESPN took too long to respond. Refresh your ESPN tab and try again.")), 15_000);
        }),
      ]);
      if (!result || typeof result !== "object") throw new Error("No scoreboard response from ESPN.");
      return { ...result, fetched: request.fetched };
    } catch (error) {
      return fail(request.fetched
        ? (error.message || "The ESPN tab closed before the request finished.")
        : target.frameUrl ? "Could not connect to your saved ESPN league. Open it once in Chrome, then refresh."
          : "Reload your ESPN league tab to activate the updated Multisport420 extension, then try again.", request.fetched);
    } finally {
      clearTimeout(timer);
      pending.delete(requestId);
    }
  }
})();
