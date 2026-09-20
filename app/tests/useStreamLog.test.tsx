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
