// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import Autoscroller from "../src/app_x/lib/Autoscroller";

let height: number;
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
beforeEach(() => {
  vi.useFakeTimers();
  height = 1200;
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(() => height);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: function (this: HTMLElement, { top }: ScrollToOptions) {
      this.scrollTop = Math.min(height - 200, Math.max(0, top ?? 0));
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
  vi.useRealTimers();
});

const advance = (time: number) => act(() => vi.advanceTimersByTime(time));
const contents = (label = "Score") => <Autoscroller speed={0.1}><span>{label}</span></Autoscroller>;
function mount() {
  const result = render(contents());
  return { ...result, strip: result.container.firstElementChild as HTMLDivElement };
}

it("starts immediately, holds one second at the end and 2.5 seconds at the loop start", () => {
  const { strip } = mount();
  advance(10);
  expect(strip.scrollTop).toBe(1);
  advance(9990);
  expect(strip.scrollTop).toBe(1000);
  advance(990);
  expect(strip.scrollTop).toBe(1000);
  advance(10);
  expect(strip.scrollTop).toBe(0);
  advance(2500);
  expect(strip.scrollTop).toBe(0);
  advance(1000);
  expect(strip.scrollTop).toBe(100);
});

it.each([
  { phase: "scrolling", elapsed: 5000, position: 500, remaining: 1000, next: 600 },
  { phase: "end hold", elapsed: 10400, position: 1000, remaining: 600, next: 0 },
  { phase: "loop start hold", elapsed: 12000, position: 0, remaining: 2500, next: 100 },
])("keeps position and the existing timer when data changes during $phase", ({ elapsed, position, remaining, next }) => {
  const { strip, rerender } = mount();
  advance(elapsed);
  expect(strip.scrollTop).toBe(position);
  rerender(contents("Updated score"));
  expect(strip.scrollTop).toBe(position);
  advance(remaining);
  expect(strip.scrollTop).toBe(next);
});

it("continues toward new content after the remaining end hold instead of wrapping", () => {
  const { strip, rerender } = mount();
  advance(10400);
  height = 2200;
  rerender(contents("Additional rows"));
  advance(600);
  expect(strip.scrollTop).toBe(1000);
  advance(1000);
  expect(strip.scrollTop).toBe(1200);
});

it("clamps to a shortened end while preserving the remaining hold", () => {
  const { strip, rerender } = mount();
  advance(10400);
  height = 800;
  rerender(contents("Fewer rows"));
  advance(590);
  expect(strip.scrollTop).toBe(600);
  advance(10);
  expect(strip.scrollTop).toBe(0);
});

it("keeps the manual interaction hold through updated data", () => {
  const { strip, rerender } = mount();
  advance(5000);
  strip.scrollTop = 700;
  advance(1010);
  rerender(contents("Updated score"));
  advance(1500);
  expect(strip.scrollTop).toBe(700);
  advance(1000);
  expect(strip.scrollTop).toBe(800);
});

it("cleans up its timer through StrictMode and unmount", () => {
  const { unmount } = render(<StrictMode>{contents()}</StrictMode>);
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
