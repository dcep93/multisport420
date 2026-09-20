// @vitest-environment jsdom
import { useEffect } from "react";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useScreenMuted } from "../src/app_x/hooks/useScreenMuted";

afterEach(cleanup);
const initial = { focus: true, target: false, request: 0 };

it("toggles only the active targeted screen and unmutes on a new spotlight session", () => {
  const { result, rerender } = renderHook(({ focus, target, request }) => useScreenMuted(focus, target, request), { initialProps: initial });
  expect(result.current).toBe(false);
  rerender({ focus: true, target: true, request: 1 });
  expect(result.current).toBe(true);
  rerender({ focus: true, target: false, request: 2 });
  expect(result.current).toBe(true);
  rerender({ focus: true, target: true, request: 3 });
  expect(result.current).toBe(false);
  rerender({ focus: true, target: true, request: 4 });
  expect(result.current).toBe(true);
  rerender({ focus: false, target: true, request: 4 });
  expect(result.current).toBe(true);
  rerender({ focus: true, target: true, request: 4 });
  expect(result.current).toBe(false);
});

it("baselines historical commands on mount and ignores background requests", () => {
  const { result, rerender } = renderHook(({ focus, target, request }) => useScreenMuted(focus, target, request), {
    initialProps: { focus: false, target: true, request: 5 },
  });
  expect(result.current).toBe(true);
  rerender({ focus: false, target: true, request: 6 });
  expect(result.current).toBe(true);
  rerender({ focus: true, target: true, request: 7 });
  expect(result.current).toBe(false);
  const fresh = renderHook(() => useScreenMuted(true, true, 20));
  expect(fresh.result.current).toBe(false);
});

it("preserves mute on unrelated rerenders and publishes no transient state", () => {
  const sent: boolean[] = [];
  const { rerender } = renderHook(({ focus, target, request }) => {
    const muted = useScreenMuted(focus, target, request);
    useEffect(() => { sent.push(muted); }, [muted]);
    return muted;
  }, { initialProps: initial });
  rerender({ focus: true, target: true, request: 1 });
  rerender({ focus: true, target: true, request: 1 });
  rerender({ focus: false, target: true, request: 1 });
  rerender({ focus: true, target: true, request: 1 });
  expect(sent).toEqual([false, true, false]);
});
