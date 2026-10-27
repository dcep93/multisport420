// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Snapshot } from "../../src/app_x/scoreboard/data";
import { useDelayedScoreboard } from "../../src/app_x/scoreboard/useDelayedScoreboard";

const snapshot = (score: number, week = 1): Snapshot => ({
  leagueId: "123", leagueName: "League", year: 2026, week, fetchedAt: Date.now(), knockout: false,
  matchups: [[{ id: 1, name: "Alpha", score, projected: 100 }]],
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
const advance = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

it("delays every observation without starving when updates arrive faster than the delay", async () => {
  const first = snapshot(10);
  const hook = renderHook(({ value }) => useDelayedScoreboard(value, 60_000), {
    initialProps: { value: first }, wrapper: StrictMode,
  });
  expect(hook.result.current).toBeNull();
  await advance(15_000);
  const second = snapshot(20);
  hook.rerender({ value: second });
  await advance(15_000);
  const third = snapshot(30);
  hook.rerender({ value: third });
  await advance(29_999);
  expect(hook.result.current).toBeNull();
  await advance(1);
  expect(hook.result.current).toBe(first);
  await advance(15_000);
  expect(hook.result.current).toBe(second);
  await advance(15_000);
  expect(hook.result.current).toBe(third);
});

it("discards pending observations when delay or week changes and cleans up on unmount", async () => {
  const first = snapshot(10);
  const hook = renderHook(({ value, delay }) => useDelayedScoreboard(value, delay), {
    initialProps: { value: first, delay: 30_000 },
  });
  await advance(20_000);
  hook.rerender({ value: first, delay: 60_000 });
  await advance(10_000);
  expect(hook.result.current).toBeNull();
  const nextWeek = snapshot(90, 2);
  hook.rerender({ value: nextWeek, delay: 60_000 });
  await advance(50_000);
  expect(hook.result.current).toBeNull();
  await advance(10_000);
  expect(hook.result.current).toBe(nextWeek);
  hook.rerender({ value: snapshot(100, 2), delay: 60_000 });
  hook.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("shows current data immediately at zero delay and cancels the old queue", async () => {
  const first = snapshot(10);
  const hook = renderHook(({ delay }) => useDelayedScoreboard(first, delay), { initialProps: { delay: 30_000 } });
  hook.rerender({ delay: 0 });
  expect(hook.result.current).toBe(first);
  expect(vi.getTimerCount()).toBe(0);
  hook.rerender({ delay: 30_000 });
  expect(hook.result.current).toBeNull();
  await advance(30_000);
  expect(hook.result.current).toBe(first);
});
