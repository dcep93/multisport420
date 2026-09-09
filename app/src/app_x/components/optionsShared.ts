import type { Category, Stream, StreamCategory } from "../config/types";

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
): Stream[] | null {
  if (!streams) {
    return null;
  }

  if (category === "ALL") {
    return streams;
  }

  return streams.filter((stream) => stream.category === category);
}
