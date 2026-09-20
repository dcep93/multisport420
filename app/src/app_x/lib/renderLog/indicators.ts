import type { PlayType } from "./types";

export const BIG_PLAY_WARNING_MS = 40_000;
export const BIG_PLAY_DURATION_MS = 5_000;

// NFLStream's ordered rules, applied to normalized ESPN statYardage.
export function getBigPlay(play: PlayType): string | null {
  // Use the starting field position, including on touchdowns and turnovers.
  const startYards = play.startYardsToEndzone;
  if (typeof startYards === "number" && startYards > 0 && startYards <= 20) return null;
  const text = getFinalPlayText(play)?.toLowerCase();
  if (!text) return null;
  if (/touchback|no play|\bnullified\b/.test(text)) return null;
  if (text.includes("block")) return "block";
  const distance = play.distance ?? NaN;
  if (text.includes("field goal")) return distance >= 60 ? "field_goal" : null;
  if (text.includes("kicks")) return distance >= 70 ? "kicks" : null;
  if (text.includes("punts")) return distance >= 40 ? "punts" : null;
  if (text.includes("intentional grounding")) return null;
  if (distance <= -11 || distance >= 25) return "distance";
  return /touchdown|fumble|intercept|muff|safety|recover/.test(text) ? "super_big_play" : null;
}

function getFinalPlayText(play: PlayType): string | undefined {
  // ESPN can concatenate the original call, review announcement, and corrected play.
  // Only the description after the last reversal represents the surviving outcome.
  const hasReview = play.reviewReversed || /\b(?:replay|review(?:ed)?|ruling)\b/i.test(play.text);
  if (hasReview) {
    const descriptions = play.text.split(/\b(?:reversed|overturned)\b[.!:]?\s*/i);
    if (descriptions.length > 1) return descriptions.at(-1)?.trim() || play.shortText?.trim();
    if (play.reviewReversed) return play.shortText?.trim();
  }
  return play.text;
}

export function getPlayKey(play: PlayType, team: string) {
  return play.id || JSON.stringify([team, play.timestamp, play.clock, play.down, play.text]);
}
