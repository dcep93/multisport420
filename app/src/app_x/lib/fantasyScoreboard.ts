import type { Stream } from "../config/types";

export const FANTASY_SCOREBOARD_ORIGIN = "https://multisport420.web.app";
export const FANTASY_SCOREBOARD_URL = `${FANTASY_SCOREBOARD_ORIGIN}/#Fantasy420Scoreboard`;
export const FANTASY_SCOREBOARD: Stream = {
  // Retained for existing saved hashes and rooms; rendering is entirely local.
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

export function hasMultisport420Extension() {
  return Boolean(document.documentElement.dataset.multisport420ExtensionId);
}

export function subscribeMultisport420Extension(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true, attributeFilter: ["data-multisport420-extension-id"],
  });
  return () => observer.disconnect();
}
