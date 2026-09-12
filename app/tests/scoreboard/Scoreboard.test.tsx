// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Scoreboard from "../../src/app_x/scoreboard/Scoreboard";
import { extensionHelper } from "../../src/app_x/scoreboard/extension";

vi.mock("../../src/app_x/scoreboard/extension", () => ({ extensionHelper: vi.fn() }));
const send = vi.mocked(extensionHelper);
const originalParent = window.parent;
const response = () => ({ fetched: 1, year: 2026, fetchedAt: Date.now(), data: {
  id: 367176096, scoringPeriodId: 1, teams: [{ id: 1, name: "Alpha" }, { id: 2, name: "Bravo" }],
  schedule: [{ matchupPeriodId: 1, home: { teamId: 1, totalPointsLive: 80, totalProjectedPointsLive: 120 }, away: { teamId: 2, totalPointsLive: 75, totalProjectedPointsLive: 110 } }],
} });
beforeEach(() => { send.mockReset(); send.mockResolvedValue(response()); window.history.replaceState({}, "", "/scoreboard"); });
afterEach(() => { cleanup(); Object.defineProperty(window, "parent", { configurable: true, value: originalParent }); });

it("fetches once in StrictMode and switches modes without fetching", async () => {
  render(<StrictMode><Scoreboard /></StrictMode>);
  await screen.findByRole("heading", { name: "Alpha" });
  expect(send).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/THUNDERDOME/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "head-to-head" } });
  expect(screen.getByText("68.07%")).toBeInTheDocument();
  expect(send).toHaveBeenCalledTimes(1);
  const refreshed = response();
  refreshed.data.schedule[0].home.totalPointsLive = 82;
  send.mockResolvedValueOnce(refreshed);
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("82.00");
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());
});

it("refreshes every 30 seconds, accepts native/remote refresh and stops after unmount", async () => {
  vi.useFakeTimers();
  const ready = vi.fn();
  const mounted = render(<StrictMode><Scoreboard onRefreshReady={ready} refreshRequestId={0} /></StrictMode>);
  await act(async () => {});
  expect(send).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(29_999); });
  expect(send).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(send).toHaveBeenCalledTimes(2);
  await act(async () => { await ready.mock.lastCall![0](); });
  expect(send).toHaveBeenCalledTimes(3);
  mounted.rerender(<StrictMode><Scoreboard onRefreshReady={ready} refreshRequestId={1} shouldRefresh /></StrictMode>);
  await act(async () => {});
  expect(send).toHaveBeenCalledTimes(4);
  mounted.rerender(<StrictMode><Scoreboard onRefreshReady={ready} refreshRequestId={2} shouldRefresh={false} /></StrictMode>);
  await act(async () => {});
  expect(send).toHaveBeenCalledTimes(4);
  mounted.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
  expect(send).toHaveBeenCalledTimes(4);
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

it("honors URL options and displays actionable extension failures with zero fetches", async () => {
  window.history.replaceState({}, "", "/scoreboard?leagueId=123&year=2025&mode=head-to-head");
  send.mockRejectedValue("no chrome runtime");
  render(<Scoreboard />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Install or reload the Multisport420 Chrome extension");
  expect(screen.queryByText(/Fetches:/)).not.toBeInTheDocument();
  expect(send).toHaveBeenCalledWith({ scoreboard: { action: "fetch", leagueId: "123", year: 2025 } });
  expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
});

it("keeps matchup statistics together, with controls after the strip", async () => {
  window.history.replaceState({}, "", "/scoreboard?mode=head-to-head");
  render(<Scoreboard />);
  const first = await screen.findByRole("heading", { name: "Alpha" });
  const second = screen.getByRole("heading", { name: "Bravo" });
  expect(first.closest("article")).toBe(second.closest("article"));
  expect(screen.queryByText("Alpha +5.00")).not.toBeInTheDocument();
  expect(screen.getAllByTitle("Projected final")).toHaveLength(2);
  expect(screen.getByText("(120.00)")).toBeInTheDocument();
  expect(screen.getByText("68.07%")).toBeInTheDocument();
  expect(screen.getByText("31.93%")).toBeInTheDocument();
  expect(screen.queryByText(/Fetches:/)).not.toBeInTheDocument();
  const strip = screen.getByRole("region", { name: "Scoreboard matchups" });
  const footer = screen.getByRole("contentinfo");
  expect(strip.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Pause scrolling" }));
  expect(screen.getByRole("button", { name: "Resume scrolling" })).toHaveAttribute("aria-pressed", "true");
  expect(send).toHaveBeenCalledTimes(1);
});

it("preserves zero scores, missing projections, and byes", async () => {
  window.history.replaceState({}, "", "/scoreboard?mode=head-to-head");
  const data = response();
  data.data.schedule[0].home.totalPointsLive = 0;
  data.data.schedule[0].away.totalPointsLive = 0;
  // ESPN can omit live projections and the away side of a bye.
  delete (data.data.schedule[0].home as any).totalProjectedPointsLive;
  data.data.teams.push({ id: 3, name: "Charlie" });
  data.data.schedule.push({ matchupPeriodId: 1, home: { teamId: 3, totalPointsLive: 0, totalProjectedPointsLive: 90 } } as any);
  send.mockResolvedValue(data);
  render(<Scoreboard />);
  await screen.findByRole("heading", { name: "Charlie" });
  expect(screen.queryByText("Tied")).not.toBeInTheDocument();
  expect(screen.getByText("Bye")).toBeInTheDocument();
  expect(screen.getAllByText("0.00")).toHaveLength(3);
  expect(screen.getAllByText("—")).toHaveLength(2);
  expect(screen.getByText("(—)")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Charlie" }).closest("article")!.querySelectorAll(".scoreboard-team")).toHaveLength(1);
});
