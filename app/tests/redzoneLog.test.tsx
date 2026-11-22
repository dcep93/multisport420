// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activeRedzoneGames, isRedzoneStream, normalizeRedzonePlays, sortRedzonePlays } from "../src/app_x/lib/redzone";
import { useRedzoneLog } from "../src/app_x/hooks/useRedzoneLog";
import { useStreamLog } from "../src/app_x/hooks/useStreamLog";
import { fetchLeagueLog } from "../src/app_x/lib/renderLog/leagues";
vi.mock("../src/app_x/lib/renderLog/leagues", () => ({ leagueConfigs: { NFL: {} }, fetchLeagueLog: vi.fn() }));
const stream = { title: "NFL RedZone", slug: "nfl-red-zone-hd", category: "NFL", espn_id: 123, raw_url: "fixture" };
const play = (id = "1", wallclock: string | number | null = "2026-11-22T19:35:01Z", text = "(Shotgun) J.Allen pass incomplete") => ({ id, wallclock, text, start: { downDistanceText: "1st & 10 at MIA 48" }, period: { number: 2 }, clock: { displayValue: "0:00" } });
const summary = (id = "1") => ({ drives: { current: { id: "d1", plays: [play(id)] } } });
const board = (...ids: string[]) => ({ events: ids.map(id => ({ id, status: { type: { state: "in", completed: false } } })) });
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const competitors = [
  { homeAway: "home", score: "35", team: { id: "2", abbreviation: "BUF" } },
  { homeAway: "away", score: "28", team: { id: "15", abbreviation: "MIA" } },
];
const scoredPlay = (teamId: string | number = "2") => ({ ...play(), homeScore: 20, awayScore: 6, start: { ...play().start, team: { id: teamId } } });
const matchupSummary = (plays: unknown[], teams: unknown[] = competitors, driveTeam?: unknown) => ({
  header: { competitions: [{ competitors: teams }] }, drives: { current: { id: "d1", team: driveTeam, plays } },
});
const fetchMock = vi.fn<typeof fetch>();
async function advance(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); vi.mocked(fetchLeagueLog).mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it.each(["NFL RedZone", "nfl red zone HD", "NFL-RED-ZONE-2", "RedZone"])('detects %s without relying on an ESPN ID', title => {
  expect(isRedzoneStream({ ...stream, title, slug: "other", espn_id: -1 })).toBe(true);
  expect(isRedzoneStream({ ...stream, title: "Live channel", slug: title.toLowerCase().replaceAll(" ", "-") })).toBe(true);
});
it("does not confuse a game or red-zone possession with the channel", () => {
  expect(isRedzoneStream({ ...stream, title: "RedZone", slug: "red-zone", category: "Other" })).toBe(false);
  expect(isRedzoneStream({ ...stream, title: "NFL RedZone", category: "Other" })).toBe(true);
  expect(isRedzoneStream({ ...stream, title: "Bills @ Dolphins", slug: "bills-dolphins" })).toBe(false);
  expect(isRedzoneStream({ ...stream, title: "Bills in the red zone", slug: "bills-red-zone" })).toBe(false);
});
it("selects only active games including halftime and removes duplicate IDs", () => {
  expect(activeRedzoneGames({ events: [...board("a", "a").events,
    { id: "half", competitions: [{ status: { type: { state: "in", name: "STATUS_HALFTIME" } } }] },
    { id: "scheduled", status: { type: { state: "pre" } } },
    { id: "final", status: { type: { state: "in", completed: true } } },
    { id: "post", status: { type: { state: "post" } } },
  ] })).toEqual(["a", "half"]);
});
it("deduplicates previous/current corrections, keeps penalties, and globally orders real wallclocks", () => {
  const old = play("1", 1000, "old text");
  const rows = normalizeRedzonePlays("a", { drives: {
    previous: [{ id: "d1", plays: [old, play("penalty", null, "PENALTY"), play("empty", 1, " ")] }],
    current: { id: "d1", plays: [{ ...old, text: "corrected" }, play("admin", null, "End of quarter")] },
  } });
  expect(rows).toHaveLength(3);
  expect(rows.find(row => row.key === "a:1")?.text).toBe("corrected");
  expect(rows.find(row => row.key === "a:1")?.detail).toBe("1st & 10 at MIA 48 - Q2 0:00");
  const sorted = sortRedzonePlays([...rows, ...normalizeRedzonePlays("b", summary())]);
  expect(sorted.map(row => row.key)).toEqual(["b:1", "a:1", "a:admin", "a:penalty"]);
});
it("keeps missing IDs stable across drive movement/corrections and missing wallclocks unknown", () => {
  const anonymous = { ...play(), id: undefined, wallclock: undefined };
  const before = normalizeRedzonePlays("a", { drives: { current: { id: "d1", plays: [anonymous] } } });
  const after = normalizeRedzonePlays("a", { drives: { previous: [{ id: "d1", plays: [{ ...anonymous, text: "corrected" }] }] } });
  expect(before[0].key).toBe(after[0].key); expect(before[0].timestamp).toBeNull();
});
it.each([["2", "BUF 20 vs MIA 6"], ["15", "MIA 6 @ BUF 20"]])("puts starting possession %s first with the correct home/away separator", (id, expected) => {
  expect(normalizeRedzonePlays("a", matchupSummary([scoredPlay(id)]))[0].matchup).toBe(expected);
});
it("uses starting possession for turnovers instead of the ending or current team", () => {
  const data = matchupSummary([{ ...scoredPlay("15"), end: { team: { id: "2" } } }], competitors, { id: "2" });
  expect(normalizeRedzonePlays("a", { ...data, situation: { possession: "2" } })[0].matchup).toBe("MIA 6 @ BUF 20");
});
it("uses each historical event's scores instead of the latest header scores", () => {
  const rows = normalizeRedzonePlays("a", matchupSummary([
    { ...scoredPlay(), id: "old", homeScore: 0, awayScore: 0 },
    { ...scoredPlay(), id: "new", homeScore: 20, awayScore: 6 },
  ]));
  expect(rows.map(row => row.matchup)).toEqual(["BUF 0 vs MIA 0", "BUF 20 vs MIA 6"]);
});
it.each([undefined, null, "", "  ", "invalid", NaN, Infinity, -1, false])("shows an em dash for invalid event score %s while retaining zero", score => {
  expect(normalizeRedzonePlays("a", matchupSummary([{ ...scoredPlay(), homeScore: 0, awayScore: score }]))[0].matchup).toBe("BUF 0 vs MIA —");
});
it("accepts numeric/string team IDs and scores", () => {
  const teams = competitors.map(item => ({ ...item, team: { ...item.team, id: Number(item.team.id) } }));
  expect(normalizeRedzonePlays("a", matchupSummary([{ ...scoredPlay("2"), homeScore: "20", awayScore: "6" }], teams))[0].matchup).toBe("BUF 20 vs MIA 6");
  expect(normalizeRedzonePlays("a", matchupSummary([scoredPlay(15)]))[0].matchup).toBe("MIA 6 @ BUF 20");
});
it.each([undefined, "unknown"])("falls back to drive possession when starting team %s cannot be resolved", id => {
  const event = { ...scoredPlay(), start: { team: { id } } };
  expect(normalizeRedzonePlays("a", matchupSummary([event], competitors, { id: 15 }))[0].matchup).toBe("MIA 6 @ BUF 20");
});
it.each(["shortDisplayName", "displayName", "name"])("falls back to %s when abbreviation is unavailable", field => {
  const teams = competitors.map(item => ({ ...item, team: { id: item.team.id, abbreviation: " ", [field]: item.homeAway === "home" ? "Bills" : "Dolphins" } }));
  expect(normalizeRedzonePlays("a", matchupSummary([scoredPlay()], teams))[0].matchup).toBe("Bills 20 vs Dolphins 6");
});
it("omits the label when possession or either team identity/name is unavailable", () => {
  expect(normalizeRedzonePlays("a", matchupSummary([scoredPlay("unknown")]))[0].matchup).toBeUndefined();
  expect(normalizeRedzonePlays("a", summary())[0].matchup).toBeUndefined();
  for (const homeAway of ["home", "away"]) {
    for (const team of [{ abbreviation: "BUF" }, { id: homeAway === "home" ? "2" : "15" }, { id: undefined }]) {
      const teams = competitors.map(item => item.homeAway === homeAway ? { ...item, team } : item);
      const event = { ...scoredPlay(), start: {} };
      expect(normalizeRedzonePlays("a", matchupSummary([event], teams))[0].matchup).toBeUndefined();
      expect(normalizeRedzonePlays("a", matchupSummary([scoredPlay()], teams))[0].matchup).toBeUndefined();
    }
  }
});
it("updates corrected matchup labels under the existing deduplication key", () => {
  const data = matchupSummary([{ ...scoredPlay("15"), homeScore: 21 }]);
  const rows = normalizeRedzonePlays("a", { ...data, drives: { ...data.drives, previous: [{ id: "d1", plays: [scoredPlay()] }] } });
  expect(rows).toHaveLength(1);
  expect(rows[0].key).toBe("a:1");
  expect(rows[0].matchup).toBe("MIA 6 @ BUF 21");
});
it("skips the ordinary delayed pipeline for RedZone even with a positive ESPN ID", async () => {
  renderHook(() => useStreamLog(stream, 60_000)); await advance(60_000); expect(fetchLeagueLog).not.toHaveBeenCalled();
});
it("publishes each game immediately while another is pending, using uncached requests", async () => {
  let resolveSlow!: (value: Response) => void;
  fetchMock.mockImplementation(async input => String(input).includes("scoreboard") ? response(board("a", "b")) : String(input).endsWith("a") ? response(summary()) : new Promise(resolve => { resolveSlow = resolve; }));
  const { result } = renderHook(() => useRedzoneLog()); await advance();
  expect(result.current.rows.map(row => row.key)).toEqual(["a:1"]);
  for (const [, options] of fetchMock.mock.calls) { expect(options?.cache).toBe("no-store"); expect(options?.signal).toBeInstanceOf(AbortSignal); }
  await act(async () => { resolveSlow(response(summary("2"))); }); expect(result.current.rows).toHaveLength(2);
});
it("polls every ten seconds, retains failed games, retries, and handles games joining/leaving", async () => {
  let cycle = 0;
  fetchMock.mockImplementation(async input => {
    const url = String(input);
    if (url.includes("scoreboard")) { cycle++; return response(cycle < 3 ? board("a", "b") : board("b", "c")); }
    if (url.endsWith("a") && cycle === 2) throw new Error("temporary");
    return response(summary(String(cycle)));
  });
  const { result } = renderHook(() => useRedzoneLog()); await advance(); expect(result.current.rows).toHaveLength(2);
  await advance(9999); expect(cycle).toBe(1);
  await advance(1); expect(cycle).toBe(2); expect(result.current.rows.map(row => row.key)).toContain("a:1"); expect(result.current.errorMessage).not.toBe("");
  await advance(10_000); expect(result.current.rows.map(row => row.key)).toEqual(["b:3", "c:3"]); expect(result.current.errorMessage).toBe("");
});
it("retains rows on discovery errors and reports a successful empty discovery", async () => {
  fetchMock.mockImplementation(async input => response(String(input).includes("scoreboard") ? board("a") : summary()));
  const { result } = renderHook(() => useRedzoneLog()); await advance();
  fetchMock.mockRejectedValue(new Error("offline")); await advance(10_000); expect(result.current.rows).toHaveLength(1);
  fetchMock.mockImplementation(async () => response(board())); await advance(10_000); expect(result.current.rows).toHaveLength(0); expect(result.current.activeGameCount).toBe(0); expect(result.current.errorMessage).toBe("");
});
it("coalesces targeted refreshes during a cycle without overlapping requests", async () => {
  let resolveSlow!: (value: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise(resolve => { resolveSlow = resolve; }));
  fetchMock.mockImplementation(async input => response(String(input).includes("scoreboard") ? board("a") : summary()));
  const { result, rerender } = renderHook(({ refresh }) => useRedzoneLog(refresh), { initialProps: { refresh: 0 } });
  rerender({ refresh: 1 }); rerender({ refresh: 2 }); await advance(1000); expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => { resolveSlow(response(board("a"))); });
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("scoreboard"))).toHaveLength(2); expect(result.current.rows).toHaveLength(1);
});
it("times out stalled requests, retries and aborts on unmount", async () => {
  fetchMock.mockImplementation(() => new Promise(() => {}));
  const { result, unmount } = renderHook(() => useRedzoneLog()); const signal = fetchMock.mock.calls[0][1]!.signal!;
  await advance(8000); expect(signal.aborted).toBe(true); expect(result.current.errorMessage).not.toBe("");
  await advance(2000); expect(fetchMock).toHaveBeenCalledTimes(2); const nextSignal = fetchMock.mock.calls[1][1]!.signal!;
  unmount(); expect(nextSignal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
});
it("retries a failed summary while keeping its previous successful rows", async () => {
  let cycle = 0;
  fetchMock.mockImplementation(async input => {
    if (String(input).includes("scoreboard")) { cycle++; return response(board("a")); }
    if (cycle === 2) return new Response("Unavailable", { status: 503 });
    return response(summary(String(cycle)));
  });
  const { result } = renderHook(() => useRedzoneLog()); await advance();
  expect(result.current.rows[0].key).toBe("a:1");
  await advance(10_000); expect(result.current.rows[0].key).toBe("a:1"); expect(result.current.errorMessage).not.toBe("");
  await advance(10_000); expect(result.current.rows[0].key).toBe("a:3"); expect(result.current.errorMessage).toBe("");
});
it("skips the polling tick while discovery plus summaries are still in flight", async () => {
  let resolveBoard!: (value: Response) => void;
  let resolveGame!: (value: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise(resolve => { resolveBoard = resolve; }));
  fetchMock.mockReturnValueOnce(new Promise(resolve => { resolveGame = resolve; }));
  const { result } = renderHook(() => useRedzoneLog());
  await advance(7000);
  await act(async () => { resolveBoard(response(board("a"))); });
  await advance(3000); expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => { resolveGame(response(summary())); });
  expect(result.current.rows).toHaveLength(1);
});
it("aborts every active summary and prevents late results after unmount", async () => {
  fetchMock.mockImplementation(async input => String(input).includes("scoreboard") ? response(board("a", "b")) : new Promise(() => {}));
  const { unmount } = renderHook(() => useRedzoneLog()); await advance();
  const signals = fetchMock.mock.calls.slice(1).map(([, options]) => options!.signal!);
  expect(signals).toHaveLength(2); expect(signals.every(signal => !signal.aborted)).toBe(true);
  unmount(); expect(signals.every(signal => signal.aborted)).toBe(true); expect(vi.getTimerCount()).toBe(0);
});
it("orders missing and invalid wallclocks last with stable ties regardless of input order", () => {
  const rows = normalizeRedzonePlays("a", { drives: { current: { plays: [play("z", "invalid"), play("a", null), play("b", "1000"), play("c", 2000)] } } });
  expect(sortRedzonePlays(rows).map(row => row.key)).toEqual(["a:c", "a:b", "a:a", "a:z"]);
  expect(sortRedzonePlays(rows.reverse()).map(row => row.key)).toEqual(["a:c", "a:b", "a:a", "a:z"]);
});
