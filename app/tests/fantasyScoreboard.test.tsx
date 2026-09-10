import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Multiscreen from "../src/app_x/components/Multiscreen";
import { filterStreamsByCategory } from "../src/app_x/components/optionsShared";
import {
  FANTASY_SCOREBOARD, FANTASY_SCOREBOARD_ORIGIN, FANTASY_SCOREBOARD_URL,
  hasFantasy420Extension, refreshFantasyScoreboard, startFantasyScoreboardRefresh,
  subscribeFantasy420Extension, withFantasyScoreboard,
} from "../src/app_x/lib/fantasyScoreboard";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Fantasy scoreboard availability", () => {
  const game = { slug: "game", category: "NFL", title: "Patriots @ Seahawks", espn_id: 1, raw_url: "https://example.com/game" };
  it("lists the scoreboard only for NFL with the extension installed", () => {
    const streams = withFantasyScoreboard([game])!;
    expect(filterStreamsByCategory(streams, "NFL", true)).toEqual([game, FANTASY_SCOREBOARD]);
    expect(filterStreamsByCategory(streams, "NFL", false)).toEqual([game]);
    expect(filterStreamsByCategory(streams, "ALL", true)).toEqual([game]);
    expect(filterStreamsByCategory(streams, "NBA", true)).toEqual([]);
    expect(withFantasyScoreboard(null)).toBeNull();
    expect(withFantasyScoreboard([])).toEqual([FANTASY_SCOREBOARD]);
  });
  it("retains a stable descriptor for restored selections without duplicating host entries", () => {
    expect(withFantasyScoreboard([FANTASY_SCOREBOARD, FANTASY_SCOREBOARD])).toEqual([FANTASY_SCOREBOARD]);
  });
  it("observes late content-script injection and disconnects on cleanup", () => {
    const documentElement = { dataset: {} as Record<string, string> };
    vi.stubGlobal("document", { documentElement });
    let notify!: () => void;
    const observe = vi.fn(), disconnect = vi.fn();
    vi.stubGlobal("MutationObserver", class {
      constructor(callback: () => void) { notify = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    const states: boolean[] = [];
    const cleanup = subscribeFantasy420Extension(() => states.push(hasFantasy420Extension()));
    expect(hasFantasy420Extension()).toBe(false);
    documentElement.dataset.fantasy420ExtensionId = "installed-extension-id";
    notify();
    expect(states).toEqual([true]);
    expect(observe).toHaveBeenCalledWith(documentElement, {
      attributes: true, attributeFilter: ["data-fantasy420-extension-id"],
    });
    cleanup();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});

describe("iframe refresh lifecycle", () => {
  it("sends exact-origin refresh messages every 30 seconds and stops after removal", () => {
    vi.useFakeTimers();
    const target = { postMessage: vi.fn() };
    const stop = startFantasyScoreboardRefresh(() => target);
    vi.advanceTimersByTime(29_999);
    expect(target.postMessage).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(target.postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: "fantasy420:scoreboard:refresh" }, FANTASY_SCOREBOARD_ORIGIN);
    vi.advanceTimersByTime(60_000);
    expect(target.postMessage).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(90_000);
    expect(target.postMessage).toHaveBeenCalledTimes(3);
  });
  it("supports manual refresh and remounting without an extra timer", () => {
    vi.useFakeTimers();
    const target = { postMessage: vi.fn() };
    refreshFantasyScoreboard(null);
    refreshFantasyScoreboard(target);
    const cleanup = startFantasyScoreboardRefresh(() => target);
    cleanup();
    const stop = startFantasyScoreboardRefresh(() => target);
    vi.advanceTimersByTime(30_000);
    expect(target.postMessage).toHaveBeenCalledTimes(2);
    stop();
  });
});

it("renders a direct scoreboard iframe with no video-host fetch or ESPN log column", () => {
  const host = { getLeagueCategories: () => ["NFL"], getStreams: vi.fn(),
    getIframeParams: vi.fn(), getIframeDocStrElement: vi.fn() };
  const markup = renderToStaticMarkup(<Multiscreen
    host={host} streams={[FANTASY_SCOREBOARD]} displayLogs logDelayMs={120_000}
    focusedSlug={FANTASY_SCOREBOARD.slug} logRefreshRequestId={0} muteToggleRequestId={0}
    onRefreshStream={vi.fn()} onRemove={vi.fn()} onFocus={vi.fn()}
  />);
  expect(markup).toContain(`src="${FANTASY_SCOREBOARD_URL}"`);
  expect(markup).toContain("screen-spotlight-body-no-log");
  expect(markup).not.toContain("srcDoc=");
  expect(markup).not.toContain('class="log-panel');
  expect(markup).not.toContain("No ESPN game linked");
  expect(host.getIframeParams).not.toHaveBeenCalled();
});
