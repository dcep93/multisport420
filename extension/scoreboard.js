// Dedicated, uncached scoreboard bridge. It never accepts a caller-supplied URL.
(() => {
  const pending = new Map();
  const prefix = "multisport420:scoreboard:";
  const fail = (error, fetched = 0) => ({ error, fetched });

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
    if (!request || sender.tab?.id !== request.tabId || sender.frameId !== 0) {
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
      if (!tab) return fail("Open your ESPN Fantasy football league in another tab, then refresh the scoreboard.");

      const requestId = crypto.randomUUID();
      const request = { tabId: tab.id, fetched: 0 };
      pending.set(requestId, request);
      let timer;
      try {
        const result = await Promise.race([
          chrome.tabs.sendMessage(tab.id, {
            type: `${prefix}fetch`, requestId,
            leagueId: options.leagueId, year: options.year,
          }, { frameId: 0 }),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("ESPN took too long to respond. Refresh your ESPN tab and try again.")), 15_000);
          }),
        ]);
        if (!result || typeof result !== "object") throw new Error("No scoreboard response from ESPN.");
        return { ...result, fetched: request.fetched };
      } catch (error) {
        return fail(request.fetched
          ? (error.message || "The ESPN tab closed before the request finished.")
          : "Reload your ESPN league tab to activate the updated Multisport420 extension, then try again.", request.fetched);
      } finally {
        clearTimeout(timer);
        pending.delete(requestId);
      }
    })().then(reply, () => reply(fail("Unable to find your ESPN league tab. Reload the Multisport420 extension and try again.")));
    return true;
  });
})();
