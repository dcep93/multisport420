// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Multiscreen from "../src/app_x/components/Multiscreen";
import { fetchLeagueLog } from "../src/app_x/lib/renderLog/leagues";
import type { LogType } from "../src/app_x/lib/renderLog/types";

vi.mock("../src/app_x/lib/renderLog/leagues", () => ({
  leagueConfigs: { NFL: { sport: "football", espnLeague: "nfl", playType: "football" } },
  fetchLeagueLog: vi.fn(),
}));
vi.mock("../src/app_x/lib/Autoscroller", () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../src/app_x/components/FantasyScoreboard", () => ({ default: () => null }));

const a = { slug: "a", title: "Away A @ Home A", category: "NFL", espn_id: 1, raw_url: "https://example.com/a" };
const b = { ...a, slug: "b", title: "Away B @ Home B", espn_id: 2 };
const base = {
  host: {
    getLeagueCategories: () => ["NFL"], getStreams: async () => [a, b],
    getIframeParams: async () => ({}), getIframeDocStrElement: () => <html><body>Video</body></html>,
  },
  streams: [a, b], displayLogs: true, logDelayMs: 30_000, focusedSlug: a.slug,
  logRefreshRequestId: 0, muteToggleRequestId: 0,
  onRefreshStream: async () => null, onRemove: vi.fn(), onFocus: vi.fn(),
};
const fetchLog = vi.mocked(fetchLeagueLog);
let revision = 1;
function snapshot(slug: string): LogType {
  return { timestamp: revision, teams: [], boxScore: [],
    playByPlay: [{ team: slug, description: `${slug} play ${revision}`, score: "0 - 0", plays: [] }] };
}
async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
beforeEach(() => {
  vi.useFakeTimers();
  revision = 1;
  fetchLog.mockReset().mockImplementation(async stream => snapshot(stream.slug));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("clicking a log fetches only its stream and preserves other streams' delayed rendering", async () => {
  const { container } = render(<Multiscreen {...base} />);
  await advance(30_000);
  const panels = container.querySelectorAll(".multisport-log");
  expect(panels[0].textContent).toContain("a play 1");
  expect(panels[1].textContent).toContain("b play 1");
  revision = 2;
  await advance(10_000); // Both streams have newer data queued behind the delay.
  const otherHtml = panels[1].innerHTML;
  fetchLog.mockClear();
  await act(async () => { fireEvent.click(panels[0]); });
  expect(fetchLog.mock.calls.map(([stream]) => stream.slug)).toEqual(["a"]);
  expect(panels[0].textContent).toContain("a play 2");
  expect(panels[1].innerHTML).toBe(otherHtml);
  await advance(29_999);
  expect(panels[1].textContent).toContain("b play 1");
  await advance(1);
  expect(panels[1].textContent).toContain("b play 2");
});

it("successive targeted refresh commands do not refresh the previously targeted stream", async () => {
  const view = render(<Multiscreen {...base} />);
  await advance(30_000);
  const panels = view.container.querySelectorAll(".multisport-log");
  revision = 2;
  fetchLog.mockClear();
  await act(async () => {
    view.rerender(<Multiscreen {...base} logRefreshSlug={a.slug} logRefreshRequestId={1} />);
  });
  expect(fetchLog.mock.calls.map(([stream]) => stream.slug)).toEqual(["a"]);
  expect(panels[0].textContent).toContain("a play 2");
  expect(panels[1].textContent).toContain("b play 1");
  revision = 3;
  fetchLog.mockClear();
  await act(async () => {
    view.rerender(<Multiscreen {...base} focusedSlug={b.slug} logRefreshSlug={b.slug} logRefreshRequestId={2} />);
  });
  expect(fetchLog.mock.calls.map(([stream]) => stream.slug)).toEqual(["b"]);
  expect(panels[0].textContent).toContain("a play 2");
  expect(panels[1].textContent).toContain("b play 3");
});
