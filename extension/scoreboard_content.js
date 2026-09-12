(() => {
  const prefix = "multisport420:scoreboard:";
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
        const response = await fetch(endpoint.href, {
          credentials: "include", cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) {
          return { error: [401, 403].includes(response.status)
            ? "Sign in to ESPN and open your league, then refresh the scoreboard."
            : `ESPN returned HTTP ${response.status}. Try refreshing your league tab.` };
        }
        const data = await response.json();
        if (!data || !Array.isArray(data.teams) || !Array.isArray(data.schedule)) {
          return { error: "ESPN did not return a league scoreboard. Check that you are signed in to the correct league." };
        }
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
