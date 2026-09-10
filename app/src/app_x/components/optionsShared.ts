import type { Category, Stream, StreamCategory } from "../config/types";
import { isFantasyScoreboard } from "../lib/fantasyScoreboard";

const PREFERRED_DEFAULT_CATEGORY: StreamCategory = "NFL";

export function getDefaultCategory(categories: readonly StreamCategory[]): Category {
  if (categories.includes(PREFERRED_DEFAULT_CATEGORY)) {
    return PREFERRED_DEFAULT_CATEGORY;
  }

  return categories[0] ?? "ALL";
}

export function filterStreamsByCategory(
  streams: Stream[] | null,
  category: Category,
  fantasy420Installed = false,
): Stream[] | null {
  if (!streams) {
    return null;
  }

  return streams.filter((stream) => isFantasyScoreboard(stream)
    ? category === "NFL" && fantasy420Installed
    : category === "ALL" || stream.category === category);
}
