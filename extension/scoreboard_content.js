(() => {
  const prefix = "multisport420:scoreboard:";
  const playerPageSize = 500;
  const maxPlayerPages = 20;

  async function fetchDetails(endpoint, year, request) {
    const details = {};
    const warnings = [];
    // A partial pool must never masquerade as league-wide leaders. Publish it
    // only after count/short-page termination confirms that pagination finished.
    await Promise.all([
      (async () => {
        const url = new URL(endpoint);
        url.search = "?view=kona_playercard";
        const players = [];
        const seen = new Set();
        let expectedCount;
        for (let page = 0; page < maxPlayerPages; page += 1) {
          request.signal.throwIfAborted();
          const response = await fetch(url.href, {
            ...request,
            headers: {
              accept: "application/json",
              "x-fantasy-filter": JSON.stringify({ players: {
                limit: playerPageSize, offset: page * playerPageSize,
                sortPercOwned: { sortPriority: 1, sortAsc: false },
                filterStatsForTopScoringPeriodIds: {
                  value: 18, additionalValue: [`00${year}`, `10${year}`],
                },
              } }),
            },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          if (!Array.isArray(data?.players)) throw new Error("invalid player data");
          if (Number.isInteger(data.totalPlayers) && data.totalPlayers >= 0) {
            expectedCount = Math.max(expectedCount ?? 0, data.totalPlayers);
          }
          const batch = data.players;
          for (const entry of batch) {
            const id = entry?.id ?? entry?.player?.id;
            if (id === undefined || id === null) throw new Error("missing player IDs");
            if (seen.has(String(id))) throw new Error("overlapping player pages");
            seen.add(String(id));
            players.push(entry);
          }
          if (expectedCount !== undefined && players.length >= expectedCount) {
            details.players = players;
            return;
          }
          if (batch.length < playerPageSize) {
            if (expectedCount !== undefined && players.length < expectedCount) {
              throw new Error("ESPN returned fewer players than its total");
            }
            details.players = players;
            return;
          }
        }
        throw new Error("player page limit reached");
      })().catch(error => warnings.push(`Player pool incomplete (${error.name === "AbortError" ? "request timed out" : error.message}). Player leaders are unavailable.`)),
      (async () => {
        const url = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}?view=proTeamSchedules_wl`);
        const response = await fetch(url.href, request);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data?.settings?.proTeams)) throw new Error("invalid NFL schedule data");
        details.proTeams = data.settings.proTeams;
      })().catch(error => warnings.push(`NFL game completion unavailable (${error.name === "AbortError" ? "request timed out" : error.message}).`)),
    ]);
    if (warnings.length) details.warning = warnings.join(" ");
    return details;
  }

  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type !== `${prefix}fetch`) return false;
    if (sender.id !== chrome.runtime.id) return false;
    (async () => {
      const page = new URL(location.href);
      const leagueId = page.searchParams.get("leagueId");
      if (page.origin !== "https://fantasy.espn.com" || !/^\d+$/.test(leagueId || "") ||
          (message.leagueId !== undefined && String(message.leagueId) !== leagueId)) {
        return { error: "The ESPN tab no longer shows the requested league." };
      }
      const now = new Date();
      const pageYear = Number(page.searchParams.get("seasonId"));
      const year = message.year ?? (pageYear >= 2000 && pageYear <= 2100
        ? pageYear : now.getFullYear() - (now.getMonth() < 2 ? 1 : 0));
      if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: "Invalid NFL season." };
      const endpoint = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leagues/${leagueId}`);
      for (const view of ["mMatchup", "mMatchupScore", "mRoster", "mScoreboard", "mSettings", "mStatus", "mTeam", "modular", "mNav"]) endpoint.searchParams.append("view", view);

      const acknowledged = await chrome.runtime.sendMessage({ type: `${prefix}started`, requestId: message.requestId });
      if (!acknowledged) return { error: "Scoreboard request expired. Please refresh." };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      try {
        const request = {
          credentials: "include", cache: "no-store", signal: controller.signal,
        };
        const response = await fetch(endpoint.href, request);
        if (!response.ok) {
          return { error: [401, 403].includes(response.status)
            ? "Sign in to ESPN and open your league, then refresh the scoreboard."
            : `ESPN returned HTTP ${response.status}. Try refreshing your league tab.` };
        }
        const data = await response.json();
        if (!data || !Array.isArray(data.teams) || !Array.isArray(data.schedule)) {
          return { error: "ESPN did not return a league scoreboard. Check that you are signed in to the correct league." };
        }
        data.scoreboardDetails = await fetchDetails(endpoint.href, year, request);
        return { data, year, leagueId, fetchedAt: Date.now() };
      } catch (error) {
        return { error: error.name === "AbortError"
          ? "ESPN took too long to respond. Try again."
          : "Could not fetch ESPN data. Check your ESPN login and try again." };
      } finally {
        clearTimeout(timer);
      }
    })().then(reply, () => reply({ error: "Reload the ESPN tab and Multisport420 extension, then try again." }));
    return true;
  });
})();
