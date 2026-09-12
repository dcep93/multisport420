// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import Multiscreen from "../src/app_x/components/Multiscreen";
import { filterStreamsByCategory } from "../src/app_x/components/optionsShared";
import {
  FANTASY_SCOREBOARD,
  hasMultisport420Extension,
  subscribeMultisport420Extension, withFantasyScoreboard,
} from "../src/app_x/lib/fantasyScoreboard";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

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
    const cleanup = subscribeMultisport420Extension(() => states.push(hasMultisport420Extension()));
    expect(hasMultisport420Extension()).toBe(false);
    documentElement.dataset.multisport420ExtensionId = "installed-extension-id";
    notify();
    expect(states).toEqual([true]);
    expect(observe).toHaveBeenCalledWith(documentElement, {
      attributes: true, attributeFilter: ["data-multisport420-extension-id"],
    });
    cleanup();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});

it("renders a native scoreboard with no iframe, video-host fetch or ESPN log column", () => {
  const host = { getLeagueCategories: () => ["NFL"], getStreams: vi.fn(),
    getIframeParams: vi.fn(), getIframeDocStrElement: vi.fn() };
  const { container } = render(<Multiscreen
    host={host} streams={[FANTASY_SCOREBOARD]} displayLogs logDelayMs={120_000}
    focusedSlug={FANTASY_SCOREBOARD.slug} logRefreshRequestId={0} muteToggleRequestId={0}
    onRefreshStream={vi.fn()} onRemove={vi.fn()} onFocus={vi.fn()}
  />);
  const markup = container.innerHTML;
  expect(markup).toContain("native-scoreboard-container");
  expect(markup).not.toContain("<iframe");
  expect(markup).not.toContain("fantasy420.web.app");
  expect(markup).toContain("screen-spotlight-body-no-log");
  expect(markup).not.toContain("srcDoc=");
  expect(markup).not.toContain('class="log-panel');
  expect(markup).not.toContain("No ESPN game linked");
  expect(host.getIframeParams).not.toHaveBeenCalled();
});
