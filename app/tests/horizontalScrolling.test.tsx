// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import HorizontalScrollControls from "../src/app_x/components/HorizontalScrollControls";
import { useHorizontalScrolling } from "../src/app_x/hooks/useHorizontalScrolling";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

it("explains why system mode is stopped and lets a user enable both scrollers for this browser", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const view = render(<HorizontalScrollControls />);
  const observer = renderHook(useHorizontalScrolling);
  expect(observer.result.current).toEqual({ mode: "system", enabled: false, reducedMotion: true });
  expect(view.getByText(/Your device requests reduced motion/)).toBeTruthy();
  fireEvent.change(view.getByRole("combobox", { name: "Horizontal scrolling" }), { target: { value: "on" } });
  expect(observer.result.current.enabled).toBe(true);
  expect(localStorage.getItem("multisport420:horizontal-scroll")).toBe("on");
  view.unmount(); observer.unmount();
  expect(renderHook(useHorizontalScrolling).result.current.enabled).toBe(true);
});

it("synchronizes changes from another tab and keeps Off separate from the system preference", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const { result } = renderHook(useHorizontalScrolling);
  expect(result.current.enabled).toBe(true);
  localStorage.setItem("multisport420:horizontal-scroll", "off");
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: "multisport420:horizontal-scroll" })));
  expect(result.current.enabled).toBe(false);
  localStorage.clear();
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
  expect(result.current.mode).toBe("system");
  expect(result.current.enabled).toBe(true);
});

it("subscribes to older matchMedia APIs and cleans up", () => {
  const media = { matches: true, addListener: vi.fn(), removeListener: vi.fn() };
  vi.stubGlobal("matchMedia", () => media);
  const { result, unmount } = renderHook(useHorizontalScrolling);
  expect(result.current.enabled).toBe(false);
  media.matches = false;
  act(() => media.addListener.mock.calls[0][0]());
  expect(result.current.enabled).toBe(true);
  unmount();
  expect(media.removeListener).toHaveBeenCalledOnce();
});
