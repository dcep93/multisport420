// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ScreenTitleBar from "../src/app_x/components/ScreenTitleBar";

let notifyResize: () => void;
let disconnect: ReturnType<typeof vi.fn>;
let frames: Map<number, FrameRequestCallback>;
let motion: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };

beforeEach(() => {
  frames = new Map();
  let nextFrame = 0;
  disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { notifyResize = callback; }
    observe = vi.fn();
    disconnect = disconnect;
  });
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => { frames.delete(id); }));
  motion = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", vi.fn(() => motion));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function overflow(container: HTMLElement) {
  const viewport = container.querySelector<HTMLDivElement>(".screen-title-viewport")!;
  Object.defineProperties(viewport, { clientWidth: { value: 100 }, scrollWidth: { value: 200 } });
  notifyResize();
  return viewport;
}

function tick(time: number) {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(time));
}

describe("Screen title bar", () => {
  it("gives red zone precedence and places the named possession icon on the correct side", () => {
    const { container, rerender } = render(<ScreenTitleBar className="" label="Away @ Home" redZone bigPlay possession={{ team: "Away", isHomeTeam: false }} />);
    expect(container.firstElementChild?.getAttribute("data-indicator")).toBe("red-zone");
    const icon = screen.getByRole("img", { name: "Away in possession" });
    expect(icon.parentElement?.firstElementChild).toBe(icon);
    rerender(<ScreenTitleBar className="" label="Away @ Home" possession={{ team: "Home", isHomeTeam: true }} />);
    expect(container.firstElementChild?.getAttribute("data-indicator")).toBe("none");
    const homeIcon = screen.getByRole("img", { name: "Home in possession" });
    expect(homeIcon.parentElement?.lastElementChild).toBe(homeIcon);
  });

  it("keeps the blue alert football without a timestamp after the fixed screen number", () => {
    const label = "Denver Broncos @ Kansas City Chiefs";
    const { container, rerender } = render(<ScreenTitleBar className="" label={label} screenNumber={1} bigPlay />);
    const title = () => [container.querySelector(".screen-title-hotkey")?.textContent, ...[...container.querySelector(".screen-letter")!.children].map(child => child.textContent)].join(" ");
    expect(title()).toBe("(1) 🏈 Denver Broncos @ Kansas City Chiefs");
    expect(container.firstElementChild?.getAttribute("data-indicator")).toBe("big-play");
    rerender(<ScreenTitleBar className="" label={label} screenNumber={1} bigPlay redZone />);
    expect(title()).toBe(`(1) ${label}`);
    rerender(<ScreenTitleBar className="" label={label} screenNumber={1} />);
    expect(title()).toBe(`(1) ${label}`);
  });

  it("never closes the screen when using the nested refresh button with the keyboard", () => {
    const close = vi.fn(), refresh = vi.fn(async () => {});
    render(<ScreenTitleBar className="" label="Game" onClose={close} onRefresh={refresh} />);
    const button = screen.getByRole("button", { name: "Refresh screen Game" });
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: " " });
    fireEvent.click(button);
    expect(close).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
    fireEvent.keyDown(screen.getByRole("button", { name: "Close screen Game" }), { key: "Enter" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("animates only overflowing text, pauses at both ends and on hover, and releases its observer and frame", () => {
    const { container, unmount } = render(<ScreenTitleBar className="" label="A long game title" />);
    expect(frames.size).toBe(0);
    const viewport = overflow(container);
    tick(0);
    tick(1000);
    expect(viewport.scrollLeft).toBe(0);
    for (let time = 1800; time <= 7400; time += 50) tick(time);
    expect(viewport.scrollLeft).toBe(100);
    tick(8000);
    expect(viewport.scrollLeft).toBe(100);
    tick(9300);
    expect(viewport.scrollLeft).toBeLessThan(100);
    fireEvent.pointerEnter(container.firstElementChild!);
    expect(frames.size).toBe(0);
    fireEvent.pointerLeave(container.firstElementChild!);
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(motion.removeEventListener).toHaveBeenCalledOnce();
  });

  it("keeps the full title manually reachable with reduced motion and pauses while focused", () => {
    motion.matches = true;
    const { container } = render(<ScreenTitleBar className="" label="A long game title" />);
    const viewport = overflow(container);
    expect(frames.size).toBe(0);
    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    expect(viewport.scrollLeft).toBe(60);
    fireEvent.keyDown(viewport, { key: "Home" });
    expect(viewport.scrollLeft).toBe(0);
    motion.matches = false;
    notifyResize();
    expect(frames.size).toBe(1);
    fireEvent.focusIn(viewport);
    expect(frames.size).toBe(0);
  });
});

it("stays paused when possession changes while the title is hovered", () => {
  const { container, rerender } = render(<ScreenTitleBar className="" label="A long game title" />);
  overflow(container);
  const shell = container.firstElementChild!;
  fireEvent.pointerEnter(shell);
  vi.spyOn(shell, "matches").mockImplementation(selector => selector === ":hover");
  rerender(<ScreenTitleBar className="" label="A long game title" possession={{ team: "Away", isHomeTeam: false }} />);
  expect(frames.size).toBe(0);
});


it("keeps the screen hotkey outside both automatic and manual title scrolling", () => {
  const label = "Denver Broncos @ Kansas City Chiefs with a very long title";
  const { container } = render(<ScreenTitleBar className="" label={label} screenNumber={2} />);
  const viewport = overflow(container);
  const hotkey = screen.getByText("(2)");
  expect(viewport.contains(hotkey)).toBe(false);
  expect(hotkey.parentElement).toBe(viewport.parentElement);
  expect(screen.getByRole("button", { name: `Close screen (2) ${label}` })).toBeTruthy();
  tick(0);
  for (let time = 1800; time <= 4000; time += 50) tick(time);
  expect(viewport.scrollLeft).toBeGreaterThan(0);
  fireEvent.keyDown(viewport, { key: "End" });
  expect(viewport.scrollLeft).toBe(viewport.scrollWidth);
  expect(viewport.contains(hotkey)).toBe(false);
  fireEvent.keyDown(viewport, { key: "Home" });
  expect(viewport.scrollLeft).toBe(0);
});


it("accumulates subpixel movement when the browser rounds scroll positions", () => {
  const { container } = render(<ScreenTitleBar className="" label="A long game title" />);
  const viewport = overflow(container);
  let position = 0;
  Object.defineProperty(viewport, "scrollLeft", {
    get: () => position,
    set: (value: number) => { position = Math.round(value); },
  });
  tick(0);
  for (let time = 1800; time <= 2800; time += 8) tick(time);
  expect(viewport.scrollLeft).toBeGreaterThan(15);
});
