// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import Remote from "../src/app_x/components/Remote";
import { reduceRoom, type RoomState } from "../src/app_x/lib/roomState";
import { FANTASY_SCOREBOARD } from "../src/app_x/lib/fantasyScoreboard";

const connection = vi.hoisted(() => ({ connect: vi.fn(), leave: vi.fn(), send: vi.fn(), viewerCount: 1, status: "connected", room: null as RoomState | null }));
vi.mock("../src/app_x/hooks/useRoom", () => ({ default: () => connection }));
const a = { slug: "a", title: "Game A", category: "NFL", espn_id: -1, raw_url: "https://example.com/a" };
const b = { ...a, slug: "b", title: "Game B" };
const c = { ...a, slug: "c", title: "Game C" };
const d = { ...a, slug: "d", title: "Game D" };
beforeEach(() => {
  connection.viewerCount = 1;
  connection.status = "connected";
  connection.room = { streams: [a, b, c, FANTASY_SCOREBOARD], focusedSlug: "a", displayLogs: true, command: null, layout: "dual", leftSlug: "a", rightSlug: "b", audioSlug: "a", audioMuted: false };
  connection.send.mockImplementation(async (action) => { connection.room = reduceRoom(connection.room!, action, "command"); return true; });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("loads and removes games using the viewer catalog without changing other streams", async () => {
  connection.room!.availableStreams = [a, b, c, d];
  const view = render(<Remote roomId="test" />);
  fireEvent.click(view.getByRole("checkbox", { name: "Game D NFL" }));
  await waitFor(() => expect(connection.room!.streams.map((stream) => stream.slug)).toEqual(["a", "b", "c", FANTASY_SCOREBOARD.slug, "d"]));
  expect(connection.send).toHaveBeenLastCalledWith({ type: "set-stream-loaded", slug: "d", loaded: true });
  expect(connection.room).toMatchObject({ focusedSlug: "a", audioSlug: "a" });
  fireEvent.click(view.getByRole("checkbox", { name: "Game B NFL" }));
  await waitFor(() => expect(connection.room!.streams.some((stream) => stream.slug === "b")).toBe(false));
  fireEvent.change(view.getByRole("searchbox", { name: "Find a stream" }), { target: { value: "Game D" } });
  expect(view.queryByRole("checkbox", { name: "Game A NFL" })).toBeNull();
  expect((view.getByRole("checkbox", { name: "Game D NFL" }) as HTMLInputElement).checked).toBe(true);
  connection.viewerCount = 0;
  view.rerender(<Remote roomId="test" />);
  expect(view.getByRole("checkbox", { name: "Game D NFL" }).closest("fieldset")?.disabled).toBe(true);
  expect(view.container.querySelector("iframe")).toBeNull();
});

it("controls layout, both positions, sound, and mute through shared room state", async () => {
  const view = render(<Remote roomId="test" />);
  expect(view.getAllByRole("option")).toHaveLength(12);
  fireEvent.click(view.getByRole("button", { name: "Promote Game C to right" }));
  await waitFor(() => expect(connection.room).toMatchObject({ leftSlug: "a", rightSlug: "c", audioSlug: "a" }));
  fireEvent.click(view.getByRole("button", { name: "Sound on right", exact: true }));
  await waitFor(() => expect(view.container.querySelector(".remote-audio-status")?.textContent).toBe("🔊 Game C"));
  expect(connection.room).toMatchObject({ leftSlug: "a", rightSlug: "c", audioSlug: "c" });
  fireEvent.click(view.getByRole("button", { name: "Promote Game B to left" }));
  await waitFor(() => expect(connection.room).toMatchObject({ leftSlug: "b", rightSlug: "c", audioSlug: "c" }));
  fireEvent.click(view.getByRole("button", { name: /Swap sides/ }));
  await waitFor(() => expect(connection.room).toMatchObject({ leftSlug: "c", rightSlug: "b", audioSlug: "c" }));
  fireEvent.click(view.getByRole("button", { name: "Mute all", exact: true }));
  await waitFor(() => expect(view.getByText("🔇 Muted")).toBeTruthy());
  fireEvent.click(view.getByRole("button", { name: "Sound on left", exact: true }));
  await waitFor(() => expect(connection.room).toMatchObject({ audioSlug: "c", audioMuted: false }));
  fireEvent.change(view.getByRole("combobox", { name: "Layout" }), { target: { value: "quad" } });
  await waitFor(() => expect(connection.room?.layout).toBe("quad"));
  expect(view.queryByRole("region", { name: "Dual spotlight" })).toBeNull();
});

it("never enables controls while disconnected and prevents sound selection for the scoreboard", () => {
  connection.viewerCount = 0;
  const view = render(<Remote roomId="test" />);
  expect((view.getByRole("button", { name: "Sound on left", exact: true }) as HTMLButtonElement).disabled).toBe(true);
  expect((view.getByRole("combobox", { name: "Layout" }) as HTMLSelectElement).closest("fieldset")?.disabled).toBe(true);
  expect((view.getByRole("button", { name: `Sound on ${FANTASY_SCOREBOARD.title}` }) as HTMLButtonElement).disabled).toBe(true);
});

it("offers grid-only keyboard reordering without selecting or muting a game", async () => {
  const view = render(<Remote roomId="test" />);
  expect(view.queryByRole("button", { name: "Reorder Game A" })).toBeNull();
  fireEvent.change(view.getByRole("combobox", { name: "Layout" }), { target: { value: "grid" } });
  await waitFor(() => expect(view.getByRole("button", { name: "Reorder Game A" })).toBeTruthy());
  connection.send.mockClear();
  fireEvent.keyDown(view.getByRole("button", { name: "Reorder Game A" }), { key: "ArrowDown" });
  await waitFor(() => expect(connection.room?.streams.map((s) => s.slug)).toEqual(["b", "c", "a", FANTASY_SCOREBOARD.slug]));
  expect(connection.send).toHaveBeenCalledExactlyOnceWith({ type: "reorder", slug: "a", targetSlug: "c" });
  expect(connection.room).toMatchObject({ focusedSlug: "a", audioSlug: "a", audioMuted: false });
  connection.viewerCount = 0;
  view.rerender(<Remote roomId="test" />);
  expect((view.getByRole("button", { name: "Reorder Game A" }) as HTMLButtonElement).disabled).toBe(true);
});

it("highlights and toggles the audio game after a grid reorder, independently of old spotlight focus", async () => {
  connection.room = { ...connection.room!, layout: "grid", audioSlug: "b", focusedSlug: "a" };
  const view = render(<Remote roomId="test" />);
  expect(view.getByRole("button", { name: "Toggle mute for Game B" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.keyDown(view.getByRole("button", { name: "Reorder Game B" }), { key: "ArrowLeft" });
  await waitFor(() => expect(connection.room?.streams[0].slug).toBe("b"));
  fireEvent.click(view.getByRole("button", { name: "Toggle mute for Game B" }));
  await waitFor(() => expect(connection.room?.audioMuted).toBe(true));
  fireEvent.click(view.getByRole("button", { name: "Toggle mute for Game B" }));
  await waitFor(() => expect(connection.room?.audioMuted).toBe(false));
  expect(connection.room?.audioSlug).toBe("b");
});

it.each(["mouse", "touch"])("reorders with a %s drag and cancels an outside drop", async (pointerType) => {
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerId = 1; isPrimary = true; pointerType = pointerType;
  });
  connection.room!.layout = "grid";
  const view = render(<Remote roomId="test" />);
  const handle = view.getByRole("button", { name: "Reorder Game C" });
  Object.defineProperty(handle, "setPointerCapture", { value: vi.fn() });
  const hit = vi.fn(() => view.container.querySelector('[data-reorder-slug="a"]'));
  const original = document.elementFromPoint;
  document.elementFromPoint = hit;
  try {
    fireEvent.pointerDown(handle, { button: 0, clientX: 250, clientY: 300 });
    fireEvent.pointerMove(handle, { clientX: 50, clientY: 150 });
    expect(view.container.querySelector('[data-reorder-slug="a"]')?.classList.contains("is-drop-target")).toBe(true);
    fireEvent.pointerUp(handle, { clientX: 50, clientY: 150 });
    await waitFor(() => expect(connection.room?.streams[0].slug).toBe("c"));
    expect(connection.send).toHaveBeenCalledExactlyOnceWith({ type: "reorder", slug: "c", targetSlug: "a" });
    connection.send.mockClear();
    hit.mockReturnValue(null);
    fireEvent.pointerDown(handle, { button: 0, clientX: 50, clientY: 150 });
    fireEvent.pointerMove(handle, { clientX: 500, clientY: 150 });
    fireEvent.pointerUp(handle, { clientX: 500, clientY: 150 });
    expect(connection.send).not.toHaveBeenCalled();
    hit.mockReturnValue(view.container.querySelector('[data-reorder-slug="a"]'));
    fireEvent.pointerDown(handle, { button: 0, clientX: 50, clientY: 150 });
    fireEvent.pointerMove(handle, { clientX: 100, clientY: 150 });
    fireEvent.pointerCancel(handle);
    fireEvent.pointerUp(handle, { clientX: 100, clientY: 150 });
    expect(connection.send).not.toHaveBeenCalled();
  } finally { document.elementFromPoint = original; }
});
