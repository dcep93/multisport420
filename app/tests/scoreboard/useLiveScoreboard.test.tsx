// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useLiveScoreboard } from "../../src/app_x/scoreboard/useLiveScoreboard";
import type { Snapshot } from "../../src/app_x/scoreboard/data";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const snapshot: Snapshot = { leagueId: "123", leagueName: "Test", year: 2026, week: 4, knockout: false, fetchedAt: 1,
  matchups: [[{ id: 1, name: "A", score: 5, projected: 20, players: [{ id: 1, proTeamId: 1, name: "Player", position: "QB",
    score: 5, projected: 20, completed: false, seasonScore: 50, slotId: 0, slot: "QB" }] }]],
};
const response = () => ({ ok: true, json: async () => ({ season: { year: 2026, type: 2 }, week: { number: 4 },
  events: [{ competitions: [{ status: { type: { state: "in" } }, competitors: [{ team: { id: "1" } }],
    situation: { possession: "1", isRedZone: true } }] }],
}) });

it("refreshes live colors every 15 seconds, clears stale status on failure, and stops when unmounted", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error("offline"));
  vi.stubGlobal("fetch", fetch);
  const hook = renderHook(() => useLiveScoreboard(snapshot));
  await act(async () => {});
  expect(hook.result.current.snapshot?.matchups[0][0].players?.[0].activity).toBe("red-zone");
  const url = new URL(String(fetch.mock.calls[0][0]));
  expect(Object.fromEntries(url.searchParams)).toEqual({ dates: "2026", week: "4", seasontype: "2", limit: "100" });
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(hook.result.current.snapshot?.matchups[0][0].players?.[0].activity).toBeUndefined();
  expect(hook.result.current.error).toBe("Live player status unavailable");
  hook.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it("does not fetch before league data is available, and aborts an outstanding request on cleanup", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetch);
  const hook = renderHook(({ data }) => useLiveScoreboard(data), { initialProps: { data: null as Snapshot | null } });
  expect(fetch).not.toHaveBeenCalled();
  hook.rerender({ data: snapshot });
  expect(fetch).toHaveBeenCalledOnce();
  const signal = (fetch.mock.calls[0] as unknown as [URL, RequestInit])[1].signal!;
  hook.unmount();
  expect(signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("retains confirmed final results through a status outage so player projections stay hidden", async () => {
  vi.useFakeTimers();
  const final = response();
  const payload = await final.json();
  payload.events[0].competitions[0].status.type.state = "post";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => payload })
    .mockRejectedValueOnce(new Error("offline")));
  const hook = renderHook(() => useLiveScoreboard(snapshot));
  await act(async () => {});
  expect(hook.result.current.snapshot?.matchups[0][0].players?.[0].completed).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(hook.result.current.snapshot?.matchups[0][0].players?.[0]).toMatchObject({ completed: true, activity: undefined });
});
