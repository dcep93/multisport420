(() => {
  const prefix = "multisport420:scoreboard:";
  function handleMessage(message, sender, reply) {
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
      const acknowledged = await chrome.runtime.sendMessage({ type: `${prefix}started`, requestId: message.requestId });
      if (!acknowledged) return { error: "Scoreboard request expired. Please refresh." };
      return fetchScoreboardData({ leagueId, year });
    })().then(reply, () => reply({ error: "Reload the ESPN tab and Multisport420 extension, then try again." }));
    return true;
  }
  chrome.runtime.onMessage.addListener(handleMessage);
  if (typeof window !== "undefined" && window.top === window) {
    void chrome.runtime.sendMessage({ type: `${prefix}visited` }).catch(() => {});
  }
})();
