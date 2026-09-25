import type { Stream, StreamCategory } from "../../config/types";
import { resolveEspnEventId, type EspnScheduleEvent } from "../../lib/espn";
import { ISTREAMEAST_URL, LIVE_WINDOW_SECONDS, UPCOMING_WINDOW_SECONDS } from "./constants";
import { buildStreamSlug, escapeForRegex, resolveUrl } from "./utils";

export function parseStreamsFromHtml(
  streamListHtml: string,
  espnEvents: EspnScheduleEvent[],
  supportedLeagueCategories: readonly StreamCategory[],
): Stream[] {
  const document = new DOMParser().parseFromString(streamListHtml, "text/html");
  const seenRawUrls = new Set<string>();

  const cards = Array.from(document.querySelectorAll(".stream-grid .stream-card, .events-list .event-card"));
  if (!cards.length && !document.querySelector(".stream-grid, .events-list")) {
    throw new Error("The stream source returned an unrecognized page. Please retry shortly.");
  }
  return cards
    .map((eventCard) => {
      const leagueElement = eventCard.querySelector(".card-cat, .event-league");
      const titleElement = eventCard.querySelector(".card-title, .event-title");

      if (!leagueElement || !titleElement) {
        return null;
      }

      const strippedLeague = leagueElement.textContent?.trim() ?? "";
      const resolvedCategory = resolveCategory(strippedLeague, supportedLeagueCategories);
      if (!resolvedCategory) {
        return null;
      }

      if (!hasRelevantStatus(eventCard)) {
        return null;
      }

      const rawTitle = titleElement.textContent?.trim() ?? "";
      const title = rawTitle.split(/ vs /i).reverse().join(" @ ");
      const rawUrl = getRawUrl(eventCard);
      if (!title || !rawUrl || seenRawUrls.has(rawUrl)) {
        return null;
      }
      seenRawUrls.add(rawUrl);

      const startTimeMs = getEventStartTimeMs(eventCard);

      return {
        category: resolvedCategory,
        espn_id: resolveEspnEventId(title, startTimeMs, espnEvents),
        raw_url: rawUrl,
        title,
        slug: buildStreamSlug(title, rawUrl),
      } satisfies Stream;
    })
    .filter((stream): stream is Stream => stream !== null);
}

export function parseStreamWatchPage(streamWatchPageHtml: string, pageUrl = ISTREAMEAST_URL) {
  const document = new DOMParser().parseFromString(streamWatchPageHtml, "text/html");
  const embedPageUrlCandidate = [
    document.querySelector("#main-player")?.getAttribute("src"),
    document.querySelector(".server-btn.active")?.getAttribute("data-src"),
    document.querySelector(".server-btn")?.getAttribute("data-src"),
    document.querySelector("#player-container iframe")?.getAttribute("src"),
    decodePlayerUrl(document.querySelector("#player-container")?.getAttribute("data-e") ?? ""),
  ]
    .map((candidateUrl) => candidateUrl?.trim() ?? "")
    .find(Boolean);

  return {
    embedPageUrl: resolveUrl(embedPageUrlCandidate ?? "", pageUrl),
    // The new listing links to a match-info page; its Watch link leads to the player page.
    watchPageUrl: resolveUrl(Array.from(document.querySelectorAll("a[href]"))
      .find((link) => link.textContent?.trim().toLowerCase() === "watch")?.getAttribute("href") ?? "", pageUrl),
  };
}

function decodePlayerUrl(encoded: string) {
  if (!encoded) return "";
  try {
    // Source's stream.js encodes player data with base64 and XOR 0x4f.
    // Decode only data; never execute scripts or insert remote HTML into our document.
    const decoded = Array.from(atob(encoded), (char) => String.fromCharCode(char.charCodeAt(0) ^ 0x4f)).join("").trim();
    if (/^(https?:)?\/\//i.test(decoded)) return decoded;
    return new DOMParser().parseFromString(decoded, "text/html").querySelector("iframe[src]")?.getAttribute("src") ?? "";
  } catch {
    return "";
  }
}

function resolveCategory(
  leagueLabel: string,
  supportedLeagueCategories: readonly StreamCategory[],
): StreamCategory | null {
  for (const supportedCategory of supportedLeagueCategories) {
    if (hasLeagueMatch(leagueLabel, supportedCategory)) {
      return supportedCategory;
    }
  }

  return null;
}

function hasLeagueMatch(leagueLabel: string, category: StreamCategory) {
  const leaguePattern = new RegExp(`\\b${escapeForRegex(category)}\\b`, "i");
  return leaguePattern.test(leagueLabel);
}

function getRawUrl(eventCard: Element) {
  const onclick = eventCard.getAttribute("onclick") ?? "";
  const match = onclick.match(/window\.location\.href='([^']+)'/);
  return resolveUrl(eventCard.querySelector("a.card-link[href]")?.getAttribute("href") ?? match?.[1]?.trim() ?? "", ISTREAMEAST_URL);
}

function hasRelevantStatus(eventCard: Element) {
  if (eventCard.getAttribute("data-live") === "1") return true;
  const startTs = getEventStartTimeMs(eventCard);
  if (startTs === null) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const secondsUntilStart = startTs / 1000 - nowSeconds;
  const liveElapsedSeconds = nowSeconds - startTs / 1000;
  const endTs = Number(eventCard.getAttribute("data-ends"));

  if (secondsUntilStart > 0 && secondsUntilStart <= UPCOMING_WINDOW_SECONDS) {
    return true;
  }

  if (liveElapsedSeconds >= 0 && (endTs > startTs / 1000 ? nowSeconds < endTs : liveElapsedSeconds < LIVE_WINDOW_SECONDS)) {
    return true;
  }

  return false;
}

function getEventStartTimeMs(eventCard: Element) {
  const startTs = parseInt(eventCard.getAttribute("data-starts") ?? eventCard.getAttribute("data-start-ts") ?? "", 10);
  if (!Number.isFinite(startTs)) {
    return null;
  }

  return startTs * 1000;
}
