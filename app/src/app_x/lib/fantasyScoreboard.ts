import type { Stream } from "../config/types";

export const FANTASY_SCOREBOARD_ORIGIN = "https://fantasy420.web.app";
export const FANTASY_SCOREBOARD_URL = `${FANTASY_SCOREBOARD_ORIGIN}/scoreboard`;
export const FANTASY_SCOREBOARD: Stream = {
  slug: "Fantasy420Scoreboard",
  title: "Fantasy scoreboard",
  category: "NFL",
  espn_id: -1,
  raw_url: FANTASY_SCOREBOARD_URL,
};

export function isFantasyScoreboard(stream: Stream) {
  return stream.slug === FANTASY_SCOREBOARD.slug;
}

export function withFantasyScoreboard(streams: Stream[] | null): Stream[] | null {
  return streams === null ? null : [...streams.filter(stream => !isFantasyScoreboard(stream)), FANTASY_SCOREBOARD];
}

export function hasFantasy420Extension() {
  return Boolean(document.documentElement.dataset.fantasy420ExtensionId);
}

export function subscribeFantasy420Extension(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true, attributeFilter: ["data-fantasy420-extension-id"],
  });
  return () => observer.disconnect();
}

type ScoreboardWindow = Pick<Window, "postMessage">;

export function refreshFantasyScoreboard(target: ScoreboardWindow | null | undefined) {
  target?.postMessage({ type: "fantasy420:scoreboard:refresh" }, FANTASY_SCOREBOARD_ORIGIN);
}

export function startFantasyScoreboardRefresh(getTarget: () => ScoreboardWindow | null | undefined) {
  const timer = setInterval(() => refreshFantasyScoreboard(getTarget()), 30_000);
  return () => clearInterval(timer);
}
