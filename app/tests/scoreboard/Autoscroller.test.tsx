// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import Autoscroller from "../../src/app_x/scoreboard/Autoscroller";

let width: number;
let viewport: number;
let motionListeners: Set<(event: MediaQueryListEvent) => void>;
let reduced: boolean;

beforeEach(() => {
  vi.useFakeTimers();
  width = 1200;
  viewport = 200;
  reduced = false;
  motionListeners = new Set();
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => viewport);
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: reduced,
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => motionListeners.add(listener),
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => motionListeners.delete(listener),
  })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const advance = (time: number) => act(() => vi.advanceTimersByTime(time));
const contents = <span>Matchup</span>;
function mount(paused = false) {
  const result = render(<Autoscroller paused={paused} resetKey="first">{contents}</Autoscroller>);
  return { ...result, strip: screen.getByRole("region", { name: "Scoreboard matchups" }) };
}

it("holds five seconds at the start and 2.5 seconds at the end, then jumps and repeats", () => {
  const { strip } = mount();
  expect(strip).toHaveAttribute("tabindex", "0");
  advance(4980);
  expect(strip.scrollLeft).toBe(0);
  advance(20);
  expect(strip.scrollLeft).toBe(0);
  advance(5000);
  expect(strip.scrollLeft).toBeCloseTo(500);
  advance(5000);
  expect(strip.scrollLeft).toBe(1000);
  advance(2480);
  expect(strip.scrollLeft).toBe(1000);
  advance(20);
  expect(strip.scrollLeft).toBe(0);
  advance(5000);
  expect(strip.scrollLeft).toBe(0);
  advance(1000);
  expect(strip.scrollLeft).toBeCloseTo(100);
});

it("resets position and the initial hold only when resetKey changes", () => {
  const { strip, rerender } = mount();
  advance(10000);
  rerender(<Autoscroller paused={false} resetKey="first"><span>Updated score</span></Autoscroller>);
  expect(strip.scrollLeft).toBeCloseTo(500);
  rerender(<Autoscroller paused={false} resetKey="second">{contents}</Autoscroller>);
  expect(strip.scrollLeft).toBe(0);
  advance(5000);
  expect(strip.scrollLeft).toBe(0);
  advance(1000);
  expect(strip.scrollLeft).toBeCloseTo(100);
});

it("does not move without overflow and detects newly overflowing content", () => {
  width = viewport;
  const { strip } = mount();
  advance(20000);
  expect(strip.scrollLeft).toBe(0);
  width = 1200;
  advance(6000);
  expect(strip.scrollLeft).toBeCloseTo(100);
});

it("pauses and resumes the same position and remaining hold through the prop", () => {
  const { strip, rerender } = mount();
  advance(1000);
  rerender(<Autoscroller paused resetKey="first">{contents}</Autoscroller>);
  advance(10000);
  rerender(<Autoscroller paused={false} resetKey="first">{contents}</Autoscroller>);
  advance(4000);
  expect(strip.scrollLeft).toBe(0);
  advance(1000);
  expect(strip.scrollLeft).toBeCloseTo(100);
  rerender(<Autoscroller paused resetKey="first">{contents}</Autoscroller>);
  advance(10000);
  expect(strip.scrollLeft).toBeCloseTo(100);
  rerender(<Autoscroller paused={false} resetKey="first">{contents}</Autoscroller>);
  advance(1000);
  expect(strip.scrollLeft).toBeCloseTo(200);
});

it("pauses for hover and focus, then leaves time to read before resuming", () => {
  const { strip } = mount();
  advance(6000);
  fireEvent.mouseEnter(strip);
  advance(10000);
  expect(strip.scrollLeft).toBeCloseTo(100);
  fireEvent.mouseLeave(strip);
  advance(2500);
  expect(strip.scrollLeft).toBeCloseTo(100);
  advance(1000);
  fireEvent.focusIn(strip);
  advance(10000);
  expect(strip.scrollLeft).toBeCloseTo(200);
  fireEvent.focusOut(strip);
  advance(3500);
  expect(strip.scrollLeft).toBeCloseTo(300);
});

it.each(["wheel", "keydown", "touchmove", "scroll"])("respects manual %s with a fresh reading hold", (eventName) => {
  const { strip } = mount();
  advance(6000);
  strip.scrollLeft = 600;
  fireEvent(strip, new Event(eventName, { bubbles: true }));
  advance(2500);
  expect(strip.scrollLeft).toBe(600);
  advance(1000);
  expect(strip.scrollLeft).toBeCloseTo(700);
});

it("pauses throughout a pointer drag and resumes after release outside the strip", () => {
  const { strip } = mount();
  advance(6000);
  fireEvent.pointerDown(strip);
  strip.scrollLeft = 500;
  advance(10000);
  expect(strip.scrollLeft).toBe(500);
  fireEvent.pointerUp(window);
  advance(3500);
  expect(strip.scrollLeft).toBeCloseTo(600);
});

it("updates speed and clamps position when the available width changes", () => {
  const { strip } = mount();
  advance(10000);
  width = 2200;
  fireEvent.resize(window);
  advance(1000);
  expect(strip.scrollLeft).toBeCloseTo(700);
  width = 500;
  fireEvent.resize(window);
  expect(strip.scrollLeft).toBe(300);
  advance(2520);
  expect(strip.scrollLeft).toBe(0);
});

it("keeps fractional progress when the browser rounds native scroll offsets", () => {
  width = 201;
  const { strip } = mount();
  let nativePosition = 0;
  Object.defineProperty(strip, "scrollLeft", {
    get: () => nativePosition,
    set: (value: number) => { nativePosition = Math.round(Math.min(1, Math.max(0, value))); },
  });
  advance(15000);
  expect(strip.scrollLeft).toBe(1);
  advance(2500);
  expect(strip.scrollLeft).toBe(0);
});

it("honors reduced motion on mount and when the preference changes", () => {
  reduced = true;
  const { strip } = mount();
  advance(20000);
  expect(strip.scrollLeft).toBe(0);
  act(() => motionListeners.forEach(listener => listener({ matches: false } as MediaQueryListEvent)));
  advance(6000);
  expect(strip.scrollLeft).toBeCloseTo(100);
  act(() => motionListeners.forEach(listener => listener({ matches: true } as MediaQueryListEvent)));
  advance(20000);
  expect(strip.scrollLeft).toBeCloseTo(100);
});

it("cleans up timers and listeners through StrictMode and unmount", () => {
  const removeWindow = vi.spyOn(window, "removeEventListener");
  const removeElement = vi.spyOn(HTMLElement.prototype, "removeEventListener");
  const { unmount } = render(<StrictMode><Autoscroller paused={false} resetKey="first">{contents}</Autoscroller></StrictMode>);
  expect(vi.getTimerCount()).toBe(1);
  expect(motionListeners.size).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  expect(motionListeners.size).toBe(0);
  for (const event of ["pointerup", "pointercancel", "resize"]) {
    expect(removeWindow).toHaveBeenCalledWith(event, expect.any(Function));
  }
  for (const event of ["mouseenter", "mouseleave", "focusin", "focusout", "wheel", "touchmove", "keydown", "pointerdown", "scroll"]) {
    expect(removeElement).toHaveBeenCalledWith(event, expect.any(Function));
  }
});
