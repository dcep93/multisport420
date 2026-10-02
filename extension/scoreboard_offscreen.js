let idleTimer;
function touch() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    void chrome.runtime.sendMessage({ type: "multisport420:scoreboard:idle" }).catch(() => {});
  }, 60000);
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (message?.type === "multisport420:scoreboard:touch") {
    touch(); reply(true); return false;
  }
  if (message?.type !== "multisport420:scoreboard:mount") return false;
  const url = new URL(message.url);
  if (url.origin !== "https://fantasy.espn.com" || url.pathname !== "/football/league" ||
      !/^\d+$/.test(url.searchParams.get("leagueId") || "")) return false;
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.title = "Last opened ESPN Fantasy league";
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
  frame.src = url.href;
  document.body.replaceChildren(frame);
  touch();
  reply(true);
  return false;
});
