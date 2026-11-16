// @vitest-environment jsdom
import { useRef } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import usePlayerFocusGuard from "../src/app_x/hooks/usePlayerFocusGuard";

function Harness({ enabled = true }) {
  const ref = useRef<HTMLElement | null>(null);
  usePlayerFocusGuard(ref, enabled);
  return <>
    <main ref={ref} tabIndex={-1}>
      <iframe className="screen-iframe" title="Player" />
      <iframe title="Unrelated embed" />
      <input aria-label="Text" />
      <textarea aria-label="Notes" />
      <select aria-label="Choice"><option>One</option></select>
      <button>Control</button>
      <div contentEditable tabIndex={0} aria-label="Editable" />
    </main>
    <iframe className="screen-iframe" title="Outside viewer" />
  </>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

it("recovers repeated frame focus without lifecycle events and without scrolling", () => {
  const view = render(<Harness />);
  advance(0);
  const focus = vi.spyOn(view.getByRole("main"), "focus");
  for (let count = 0; count < 3; count++) {
    view.getByTitle("Player").focus();
    expect(document.activeElement).toBe(view.getByTitle("Player"));
    advance(250);
    expect(document.activeElement).toBe(view.getByRole("main"));
  }
  expect(focus).toHaveBeenCalledTimes(3);
  expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
});

it.each(["blur", "focus", "pageshow", "visibilitychange", "load"])("recovers on %s before the fallback interval", (type) => {
  const view = render(<Harness />);
  advance(0);
  // The event can arrive before activeElement is updated by the browser.
  const target = type === "load" ? view.getByTitle("Player") : type === "visibilitychange" ? document : window;
  fireEvent(target, new Event(type));
  view.getByTitle("Player").focus();
  advance(0);
  expect(document.activeElement).toBe(view.getByRole("main"));
});

it.each(["hidden", "unfocused"])("does not reclaim focus while the document is %s", (state) => {
  const view = render(<Harness />);
  if (state === "hidden") vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  else vi.spyOn(document, "hasFocus").mockReturnValue(false);
  const frame = view.getByTitle("Player");
  frame.focus();
  fireEvent(window, new Event("blur"));
  advance(1000);
  expect(document.activeElement).toBe(frame);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  fireEvent(window, new Event("focus"));
  advance(0);
  expect(document.activeElement).toBe(view.getByRole("main"));
});

it.each(["Text", "Notes", "Choice", "Editable"])("preserves focus in %s", (label) => {
  const view = render(<Harness />);
  const control = view.getByLabelText(label);
  control.focus();
  fireEvent(view.getByTitle("Player"), new Event("load"));
  fireEvent(window, new Event("focus"));
  advance(1000);
  expect(document.activeElement).toBe(control);
});

it("preserves button focus and ignores unrelated frames", () => {
  const view = render(<Harness />);
  for (const target of [view.getByRole("button"), view.getByTitle("Unrelated embed"), view.getByTitle("Outside viewer")]) {
    target.focus();
    advance(500);
    expect(document.activeElement).toBe(target);
  }
});

it("cancels pending work when disabled and restarts when enabled", () => {
  const view = render(<Harness />);
  view.getByTitle("Player").focus();
  view.rerender(<Harness enabled={false} />);
  fireEvent(window, new Event("focus"));
  advance(500);
  expect(document.activeElement).toBe(view.getByTitle("Player"));
  view.rerender(<Harness />);
  advance(0);
  expect(document.activeElement).toBe(view.getByRole("main"));
});

it("removes listeners and timers on unmount", () => {
  const setInterval = vi.spyOn(window, "setInterval");
  const clearInterval = vi.spyOn(window, "clearInterval");
  const setTimeout = vi.spyOn(window, "setTimeout");
  const clearTimeout = vi.spyOn(window, "clearTimeout");
  const view = render(<Harness />);
  const focus = vi.spyOn(view.getByRole("main"), "focus");
  view.getByTitle("Player").focus();
  fireEvent(window, new Event("blur"));
  const interval = setInterval.mock.results[0].value;
  const pendingCheck = setTimeout.mock.results[0].value;
  view.unmount();
  expect(clearInterval).toHaveBeenCalledWith(interval);
  expect(clearTimeout).toHaveBeenCalledWith(pendingCheck);
  setTimeout.mockClear();
  for (const type of ["blur", "focus", "pageshow"]) fireEvent(window, new Event(type));
  fireEvent(document, new Event("visibilitychange"));
  expect(setTimeout).not.toHaveBeenCalled();
  advance(1000);
  expect(focus).not.toHaveBeenCalled();
});
