// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useStreamLog } from "../src/app_x/hooks/useStreamLog";
import { fetchLeagueLog } from "../src/app_x/lib/renderLog/leagues";
import type { LogType } from "../src/app_x/lib/renderLog/types";
vi.mock("../src/app_x/lib/renderLog/leagues", () => ({ leagueConfigs: { NFL: { playType: "football" }, NBA: { playType: "basketball" } }, fetchLeagueLog: vi.fn() }));
const fetchLog = vi.mocked(fetchLeagueLog);
const stream = { slug: "game", category: "NFL", espn_id: 123, title: "Away @ Home", raw_url: "url" };
function log(id = "1", timestamp = 1, text = "Pass for 30 yards"): LogType {
  return { timestamp, teams: [], boxScore: [], possession: { team: "Away", isHomeTeam: false }, redZone: true,
    playByPlay: [{ team: "Away", description: "Drive", score: "0 - 0", plays: [{ id, text, distance: 30, down: "", clock: "Q1 12:00" }] }] };
}
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
beforeEach(() => { vi.useFakeTimers(); fetchLog.mockReset(); fetchLog.mockResolvedValue(log()); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("expires the brief warning independently of the delayed log containing the big play", async () => {
  const snapshot = log();
  snapshot.playByPlay[0].plays![0].clock = "Q3 12:22";
  fetchLog.mockResolvedValue(snapshot);
  const { result } = renderHook(() => useStreamLog(stream, 30_000));
  await advance(1);
  expect(result.current.bigPlay).toBe(true);
  expect(result.current.displayedLog).toBeNull();
  await advance(5000);
  expect(result.current.bigPlay).toBe(false);
  await advance(25_000);
  expect(result.current.displayedLog).toEqual(snapshot);
});
it.each([60_000, 120_000])("warns 40 seconds before a %ims snapshot for five seconds without repeating", async delay => {
  const { result } = renderHook(() => useStreamLog(stream, delay));
  await advance(delay - 40_001); expect(result.current.bigPlay).toBe(false); expect(result.current.displayedLog).toBeNull();
  await advance(1); expect(result.current.bigPlay).toBe(true);
  await advance(5000); expect(result.current.bigPlay).toBe(false);
  await advance(35_000); expect(result.current.displayedLog?.possession?.team).toBe("Away"); expect(result.current.displayedLog?.redZone).toBe(true);
  await advance(60_000); expect(result.current.bigPlay).toBe(false);
});
it("preserves polling, expiry and dedup when the playback URL and title change", async () => {
  const { result, rerender } = renderHook(({ url }) => useStreamLog({ ...stream, raw_url: url, title: url }, 0), { initialProps: { url: "one" } });
  await advance(1); expect(result.current.bigPlay).toBe(true);
  rerender({ url: "two" }); expect(fetchLog).toHaveBeenCalledTimes(1);
  await advance(5000); expect(result.current.bigPlay).toBe(false);
});
it("baselines history and handles newly arrived duplicate play IDs once", async () => {
  const first = log("old"); first.playByPlay[0].plays!.push({ ...first.playByPlay[0].plays![0], id: "normal", text: "Run", distance: 2 });
  fetchLog.mockResolvedValue(first);
  const { result } = renderHook(() => useStreamLog(stream, 0));
  await advance(1); expect(result.current.bigPlay).toBe(false);
  const next = log("new", 2); next.playByPlay[0].plays!.push(...next.playByPlay[0].plays!); fetchLog.mockResolvedValue(next);
  await advance(10_000); expect(result.current.bigPlay).toBe(true);
  await advance(5000); expect(result.current.bigPlay).toBe(false);
});
it("manual refresh invalidates an older request finishing later and pending snapshots", async () => {
  let resolveOld!: (value: LogType) => void;
  fetchLog.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; })); fetchLog.mockResolvedValue(log("fresh", 2));
  const { result } = renderHook(() => useStreamLog(stream, 60_000));
  await act(async () => { await result.current.refresh(); }); expect(result.current.displayedLog?.timestamp).toBe(2);
  await act(async () => { resolveOld(log("old", 1)); });
  await advance(65_000); expect(result.current.displayedLog?.timestamp).toBe(2); expect(result.current.bigPlay).toBe(false);
});
it("polling cannot supersede a slow manual refresh", async () => {
  const { result } = renderHook(() => useStreamLog(stream, 60_000)); await advance(0);
  let resolveRefresh!: (value: LogType) => void; fetchLog.mockReturnValueOnce(new Promise(resolve => { resolveRefresh = resolve; }));
  let refresh!: Promise<void>; act(() => { refresh = result.current.refresh(); });
  await advance(30_000); expect(fetchLog).toHaveBeenCalledTimes(2);
  await act(async () => { resolveRefresh(log("fresh", 2)); await refresh; });
  expect(result.current.displayedLog?.timestamp).toBe(2); expect(result.current.bigPlay).toBe(false);
});
it("rejects out-of-order polls and releases every timer on unmount", async () => {
  let resolveOld!: (value: LogType) => void;
  fetchLog.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; })); fetchLog.mockResolvedValue(log("fresh", 2));
  const { result, unmount } = renderHook(() => useStreamLog(stream, 0)); await advance(10_001);
  await act(async () => { resolveOld(log("old", 1)); }); expect(result.current.displayedLog?.timestamp).toBe(2);
  unmount(); expect(vi.getTimerCount()).toBe(0);
});
it("cancels a queued warning when the same play is nullified", async () => {
  const { result } = renderHook(() => useStreamLog(stream, 60_000)); await advance(1);
  fetchLog.mockResolvedValue(log("1", 1, "Pass NULLIFIED. No Play."));
  await advance(20_000); expect(result.current.bigPlay).toBe(false);
});
it.each(["NBA", "finished"])("does not create football warnings for %s", async mode => {
  fetchLog.mockResolvedValue({ ...log(), gameFinished: mode === "finished" });
  const { result } = renderHook(() => useStreamLog({ ...stream, category: mode === "NBA" ? "NBA" : "NFL" }, 0));
  await advance(1); expect(result.current.bigPlay).toBe(false);
});
it("does not poll scoreboards or unsupported leagues", async () => {
  renderHook(() => useStreamLog({ ...stream, espn_id: -1 }, 0)); renderHook(() => useStreamLog({ ...stream, category: "unknown" }, 0));
  await advance(30_000); expect(fetchLog).not.toHaveBeenCalled();
});
it("alerts when a new play first becomes qualifying after an ESPN correction", async () => {
  fetchLog.mockResolvedValue({ ...log(), playByPlay: [{ ...log().playByPlay[0], plays: [{ ...log().playByPlay[0].plays![0], distance: 24 }] }] });
  const { result } = renderHook(() => useStreamLog(stream, 0)); await advance(1); expect(result.current.bigPlay).toBe(false);
  fetchLog.mockResolvedValue(log()); await advance(10_000); expect(result.current.bigPlay).toBe(true);
});

it("publishes the live big-play clock before delayed logs or warnings and retains it after expiry", async () => {
  const { result } = renderHook(() => useStreamLog(stream, 60_000));
  await advance(1);
  expect(result.current.latestBigPlayClock).toBe("Q1 12:00");
  expect(result.current.displayedLog).toBeNull();
  expect(result.current.bigPlay).toBe(false);
  await advance(25_000);
  expect(result.current.bigPlay).toBe(false);
  expect(result.current.latestBigPlayClock).toBe("Q1 12:00");
  expect(result.current.displayedLog).toBeNull();
});

it("does not let an older delayed log overwrite the newest live timestamp", async () => {
  const { result } = renderHook(() => useStreamLog(stream, 60_000));
  await advance(1);
  const newer = log("2", 2);
  newer.playByPlay[0].plays![0].clock = "Q1 10:22";
  fetchLog.mockResolvedValue(newer);
  await advance(10_000);
  expect(result.current.latestBigPlayClock).toBe("Q1 10:22");
  await advance(50_000);
  expect(result.current.displayedLog?.timestamp).toBe(1);
  expect(result.current.latestBigPlayClock).toBe("Q1 10:22");
});

it("finds historical big plays, ignores ordinary later plays, and updates corrected clocks immediately", async () => {
  const first = log();
  first.playByPlay[0].plays!.push({ id: "normal", text: "Run for 2 yards", distance: 2, clock: "Q1 11:00", down: "" });
  fetchLog.mockResolvedValue(first);
  const { result } = renderHook(() => useStreamLog(stream, 120_000));
  await advance(1);
  expect(result.current.bigPlay).toBe(false);
  expect(result.current.latestBigPlayClock).toBe("Q1 12:00");
  const corrected = log();
  corrected.playByPlay[0].plays![0].clock = "Q1 12:05";
  fetchLog.mockResolvedValue(corrected);
  await advance(10_000);
  expect(result.current.latestBigPlayClock).toBe("Q1 12:05");
  fetchLog.mockResolvedValue(log("1", 1, "Pass NULLIFIED. No Play."));
  await advance(10_000);
  expect(result.current.latestBigPlayClock).toBeUndefined();
  expect(result.current.displayedLog).toBeNull();
});

it("falls back to the prior big play after nullification and preserves final-game history", async () => {
  const snapshot = log();
  snapshot.playByPlay[0].plays!.push({ id: "2", text: "TOUCHDOWN", distance: 5, clock: "Q1 9:00", down: "" });
  fetchLog.mockResolvedValue(snapshot);
  const { result } = renderHook(() => useStreamLog(stream, 60_000));
  await advance(1);
  expect(result.current.latestBigPlayClock).toBe("Q1 9:00");
  fetchLog.mockResolvedValue({ ...snapshot, gameFinished: true, playByPlay: [{ ...snapshot.playByPlay[0], plays: [
    snapshot.playByPlay[0].plays![0], { ...snapshot.playByPlay[0].plays![1], text: "TOUCHDOWN NULLIFIED" },
  ] }] });
  await advance(10_000);
  expect(result.current.latestBigPlayClock).toBe("Q1 12:00");
});

it("protects the live clock from stale responses and clears it when switching games", async () => {
  let resolveOld!: (value: LogType) => void;
  fetchLog.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
  const newer = log("2", 2);
  newer.playByPlay[0].plays![0].clock = "Q1 10:00";
  fetchLog.mockResolvedValue(newer);
  const { result, rerender } = renderHook(({ game }) => useStreamLog({ ...stream, espn_id: game }, 60_000), { initialProps: { game: 123 } });
  await advance(10_001);
  await act(async () => { resolveOld(log()); });
  expect(result.current.latestBigPlayClock).toBe("Q1 10:00");
  fetchLog.mockResolvedValue({ ...log(), playByPlay: [] });
  rerender({ game: 456 });
  expect(result.current.latestBigPlayClock).toBeUndefined();
  await advance(1);
  expect(result.current.latestBigPlayClock).toBeUndefined();
});

it("keeps football clock detection out of nonfootball logs", async () => {
  const { result } = renderHook(() => useStreamLog({ ...stream, category: "NBA" }, 60_000));
  await advance(1);
  expect(result.current.latestBigPlayClock).toBeUndefined();
});
