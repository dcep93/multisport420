// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Scoreboard from "../../src/app_x/scoreboard/Scoreboard";
import { extensionHelper } from "../../src/app_x/scoreboard/extension";
import { Leaderboards, MatchupRoster, Roster } from "../../src/app_x/scoreboard/PlayerDetails";
import type { RosterPlayer } from "../../src/app_x/scoreboard/players";

vi.mock("../../src/app_x/scoreboard/extension", () => ({ extensionHelper: vi.fn() }));
vi.mock("../../src/app_x/scoreboard/useLiveScoreboard", () => ({ useLiveScoreboard: (snapshot: unknown) => ({ snapshot }) }));
const send = vi.mocked(extensionHelper);
const originalParent = window.parent;
const response = () => ({ fetched: 1, year: 2026, fetchedAt: Date.now(), data: {
  id: 367176096, scoringPeriodId: 1, teams: [{ id: 1, name: "Alpha" }, { id: 2, name: "Bravo" }],
  schedule: [{ matchupPeriodId: 1, home: { teamId: 1, totalPointsLive: 80, totalProjectedPointsLive: 120 }, away: { teamId: 2, totalPointsLive: 75, totalProjectedPointsLive: 110 } }],
} });
beforeEach(() => { send.mockReset(); send.mockResolvedValue(response()); window.history.replaceState({}, "", "/scoreboard"); });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  Object.defineProperty(window, "parent", { configurable: true, value: originalParent });
});

it.each([
  { phase: "initial hold", elapsed: 4000, position: 0, remaining: 2000, next: 100 },
  { phase: "scrolling", elapsed: 10000, position: 500, remaining: 1000, next: 600 },
  { phase: "end hold", elapsed: 15400, position: 1000, remaining: 600, next: 0 },
  { phase: "loop start hold", elapsed: 17000, position: 0, remaining: 5000, next: 100 },
  { phase: "automatic refresh", elapsed: 30000, position: 900, remaining: 1000, next: 1000 },
])("preserves position and remaining time through a data refresh during $phase", async ({ elapsed, position, remaining, next }) => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(1200);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
  send.mockImplementation(async () => response());
  const ready = vi.fn();
  render(<Scoreboard onRefreshReady={ready} />);
  await act(async () => {});
  const strip = screen.getByRole("region", { name: "Scoreboard matchups" });
  await act(async () => { await vi.advanceTimersByTimeAsync(elapsed); });
  expect(strip.scrollLeft).toBeCloseTo(position);

  const refreshed = response();
  refreshed.data.schedule[0].home.totalPointsLive = 82;
  send.mockResolvedValueOnce(refreshed);
  await act(async () => { await ready.mock.lastCall![0](); });
  expect(screen.getByText("82.00")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Scoreboard matchups" })).toBe(strip);
  expect(strip.scrollLeft).toBeCloseTo(position);
  await act(async () => { await vi.advanceTimersByTimeAsync(remaining); });
  expect(strip.scrollLeft).toBeCloseTo(next);
});

it("fetches once in StrictMode and switches modes without fetching", async () => {
  render(<StrictMode><Scoreboard /></StrictMode>);
  await screen.findByRole("heading", { name: "Alpha" });
  expect(send).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/THUNDERDOME/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "head-to-head" } });
  expect(screen.getByLabelText("1 consecutive fantasy win if Alpha wins this week")).toHaveTextContent("👑");
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
  expect(screen.getByLabelText("1 consecutive fantasy win if Alpha wins this week")).toHaveTextContent("👑");
  expect(screen.queryByText("31.93%")).not.toBeInTheDocument();
  expect(screen.getByLabelText("1 consecutive fantasy loss if Bravo loses this week")).toHaveTextContent("🫘");
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
  expect(screen.getAllByText("—")).toHaveLength(1);
  expect(screen.getByText("(—)")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Charlie" }).closest("article")!.querySelectorAll(".scoreboard-team")).toHaveLength(1);
});

it("shows hypothetical winning and losing streaks in expanded matchups", async () => {
  window.history.replaceState({}, "", "/scoreboard?mode=head-to-head");
  const result: any = response();
  result.data.scoringPeriodId = 4;
  result.data.schedule[0].matchupPeriodId = 4;
  result.data.schedule.push(...[1, 2, 3].map(week => ({ matchupPeriodId: week, winner: week === 1 ? "AWAY" : "HOME",
    home: { teamId: 1 }, away: { teamId: 2 } })));
  send.mockResolvedValue(result);
  render(<Scoreboard />);
  expect(await screen.findByLabelText("3 consecutive fantasy losses if Bravo loses this week")).toHaveTextContent("🫘🫘🫘");
  expect(screen.getByLabelText("3 consecutive fantasy wins if Alpha wins this week")).toHaveTextContent("👑👑👑");
  expect(screen.getByLabelText("Alpha win probability")).toHaveTextContent("68.07% win");
  expect(screen.queryByText("31.93%")).not.toBeInTheDocument();
});

it("uses exactly five compact matchup rows and switches to paired spotlight without refetching", async () => {
  window.history.replaceState({}, "", "/scoreboard?mode=head-to-head");
  const mounted = render(<Scoreboard spotlight={false} />);
  const name = await screen.findByRole("heading", { name: "Alpha" });
  const rows = name.parentElement!.children;
  expect(Array.from(rows).map(row => row.textContent)).toEqual([
    "Alpha", "Score: 80.00Projected final: (120.00)", "68.07% win",
    "Score: 75.00Projected final: (110.00)", "Bravo",
  ]);
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  mounted.rerender(<Scoreboard spotlight />);
  expect(screen.getByRole("complementary", { name: "Weekly player leaders" })).toBeInTheDocument();
  expect(name.closest("article")).toBeNull(); // compact nodes were replaced
  expect(document.querySelectorAll(".scoreboard-teams > .scoreboard-team")).toHaveLength(2);
  expect(send).toHaveBeenCalledTimes(1);
});

it.each(["head-to-head", "guillotine"])("renders all roster rows and final-game scores without optimization copy in %s", async mode => {
  window.history.replaceState({}, "", `/scoreboard?mode=${mode}`);
  const data: any = response();
  data.data.id = 203836968;
  data.data.teams[0].id = 6;
  data.data.settings = { rosterSettings: { lineupSlotCounts: { 0: 1, 20: 2 } } };
  data.data.schedule[0].home.teamId = 6;
  const entry = (id: number, name: string, slot: number, locked: boolean, score: number, projection: number) => ({
    playerId: id, lineupSlotId: slot, playerPoolEntry: { appliedStatTotal: score, lineupLocked: locked,
      player: { id, fullName: name, defaultPositionId: 1, proTeamId: id, eligibleSlots: [0, 20], stats: [
        { seasonId: 2026, scoringPeriodId: 1, statSourceId: 1, statSplitTypeId: 1, appliedTotal: projection },
      ] } },
  });
  data.data.schedule[0].home.rosterForCurrentScoringPeriod = { entries: [
    entry(101, "Starter", 0, false, 0, 10), entry(102, "Better bench", 20, false, 0, 20),
    entry(103, "Finished bench", 20, true, 30, 15),
  ] };
  data.data.scoreboardDetails = { players: [], proTeams: [
    { id: 103, proGamesByScoringPeriod: { 1: [{ statsOfficial: true }] } },
  ] };
  send.mockResolvedValue(data);
  render(<Scoreboard />);
  const table = await screen.findByRole("table", { name: mode === "head-to-head" ? "Alpha versus Bravo players" : "Alpha players" });
  expect(within(table).getAllByRole("row")).toHaveLength(4);
  const finished = within(table).getByRole("row", { name: /Finished bench/ });
  expect(finished).toHaveTextContent("Bench");
  expect(finished).toHaveTextContent("30.00");
  expect(within(finished).queryByTitle("Player projection")).not.toBeInTheDocument();
  const selected = within(table).getByRole("row", { name: /Better bench/ });
  expect(selected).toHaveTextContent("Bench");
  expect(selected).toHaveTextContent("Better bench");
  expect(screen.queryByText(/Included in optimized projection/)).not.toBeInTheDocument();
  expect(document.body.textContent).not.toContain("★");
  expect(screen.getByText("(130.00)")).toBeInTheDocument();
  expect(within(selected).getByTitle("Player projection")).toHaveTextContent("(20.00)");
});

it("pairs roster players by position in score/name/position/name/score order, retaining unequal benches", () => {
  const player = (id: number, name: string, slotId: number, slot: string, position = slot): RosterPlayer => ({
    id, name, slotId, slot, position, score: id, projected: id + 10, seasonScore: id + 20, completed: id === 1,
  });
  const left = { id: 1, name: "Alpha", score: 10, projected: 20, players: [
    player(1, "Left QB", 0, "QB"), player(2, "Left RB", 2, "RB"), player(3, "Extra RB", 2, "RB"),
    { ...player(4, "Bench WR", 20, "Bench", "WR"), optimizedSlot: "FLEX" },
  ] };
  const right = { id: 2, name: "Bravo", score: 10, projected: 20, players: [
    player(5, "Right RB", 2, "RB"), player(6, "Right QB", 0, "QB"),
    player(7, "Bench RB", 20, "Bench", "RB"), player(8, "Other bench WR", 20, "Bench", "WR"),
    player(9, "Injured", 21, "IR", "TE"),
  ] };
  left.players[1].activity = "playing";
  right.players[0].activity = "red-zone";
  render(<MatchupRoster left={left} right={right} />);
  const table = screen.getByRole("table", { name: "Alpha versus Bravo players" });
  const rows = Array.from(table.querySelectorAll("tbody tr"));
  const cells = rows.map(row => Array.from(row.children).map(cell => cell.textContent));
  expect(cells).toEqual([
    ["1.00", "Left QB", "QB", "Right QB", "6.00 (16.00)"],
    ["2.00 (12.00)", "Left RB", "RB", "Right RB", "5.00 (15.00)"],
    ["3.00 (13.00)", "Extra RB", "RB", "—", "—"],
    ["—", "—", "Bench · RB", "Bench RB", "7.00 (17.00)"],
    ["4.00 (14.00)", "Bench WR", "Bench · WR", "Other bench WR", "8.00 (18.00)"],
    ["—", "—", "IR · TE", "Injured", "9.00 (19.00)"],
  ]);
  expect(table.textContent).not.toContain("★");
  expect(rows[1].children[0]).toHaveClass("scoreboard-player-playing");
  expect(rows[1].children[1]).toHaveClass("scoreboard-player-playing");
  expect(rows[1].children[2]).not.toHaveAttribute("class");
  expect(rows[1].children[3]).toHaveClass("scoreboard-player-red-zone");
  expect(rows[1].children[4]).toHaveClass("scoreboard-player-red-zone");
});

it("links starters, reserves, and both leaderboards to player stats in a separate tab", () => {
  const player: RosterPlayer = { id: 1, name: "Ja'Marr Chase", position: "WR", slot: "Bench", slotId: 20,
    score: 12, projected: 20, seasonScore: 50, completed: false };
  const team = { id: 1, name: "Alpha", score: 12, projected: 20, players: [player] };
  render(<>
    <MatchupRoster left={team} right={{ ...team, id: 2, name: "Bravo" }} />
    <Roster team={team} />
    <Leaderboards snapshot={{ leagueId: "123", leagueName: "League", year: 2026, week: 4,
      fetchedAt: 0, knockout: false, matchups: [[team]],
      leaders: { unowned: [player], positions: [{ position: "WR", players: [player] }] } }} />
  </>);
  const links = screen.getAllByRole("link", { name: /Ja'Marr Chase/ });
  expect(links).toHaveLength(5);
  for (const link of links) {
    expect(link).toHaveAttribute("href", "https://fantasy420.web.app/#PlayerStats?nameFilter=Ja%27Marr_Chase");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
});
