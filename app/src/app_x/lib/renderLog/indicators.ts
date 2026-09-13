import type { PlayType } from "./types";

export const BIG_PLAY_WARNING_MS = 40_000;
export const BIG_PLAY_DURATION_MS = 5_000;

// NFLStream's ordered rules, applied to normalized ESPN statYardage.
export function getBigPlay(play: PlayType): string | null {
  const text = play.text.toLowerCase();
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

export function getPlayKey(play: PlayType, team: string) {
  return play.id || JSON.stringify([team, play.timestamp, play.clock, play.down, play.text]);
}
