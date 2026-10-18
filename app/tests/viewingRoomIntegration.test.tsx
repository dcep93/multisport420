// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { RoomState } from "../src/app_x/lib/roomState";
import { reduceRoom } from "../src/app_x/lib/roomState";
import MultisportApp from "../src/app_x/components/MultisportApp";

const fixture = vi.hoisted(() => {
  const streams = ["A", "B", "C"].map((title) => ({ title: `Game ${title}`, slug: title, category: "NFL", espn_id: -1, raw_url: `https://example.com/${title}` }));
  return { streams, getStreams: vi.fn(async () => streams), connection: { room: null as RoomState | null, roomId: null as string | null, status: "idle", viewerCount: 0, connect: vi.fn(), leave: vi.fn(), send: vi.fn() } };
});
vi.mock("../src/app_x/config/data", () => ({ HOST: { getStreams: fixture.getStreams, getLeagueCategories: () => ["NFL"], getIframeParams: async () => ({}), getIframeDocStrElement: () => <html><body>Player</body></html> } }));
vi.mock("../src/app_x/hooks/useRoom", () => ({ default: () => fixture.connection }));
vi.mock("../src/app_x/hooks/useStreamLog", () => ({ useStreamLog: () => ({}) }));
beforeEach(() => { fixture.getStreams.mockReset().mockResolvedValue(fixture.streams); window.history.replaceState(null, "", "/"); localStorage.clear(); fixture.connection.room = null; fixture.connection.roomId = null; fixture.connection.status = "idle"; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("publishes layout, explicit sides and actual audio choice on joining, then retains remote changes on leave", async () => {
  const view = render(<MultisportApp />);
  await waitFor(() => expect(view.getByRole("button", { name: "Game A", exact: true })).toBeTruthy());
  for (const title of ["A", "B", "C"]) fireEvent.click(view.getByRole("button", { name: `Game ${title}`, exact: true }));
  fireEvent.change(view.getByRole("combobox", { name: "Layout" }), { target: { value: "dual" } });
  expect(view.queryByRole("button", { name: /Promote Game C/ })).toBeNull();
  const players = Array.from(view.container.querySelectorAll("iframe"));
  fireEvent.click(view.getByRole("button", { name: "Sound on right: Game B" }));
  fireEvent.click(view.getByRole("button", { name: "Focus screen (3) Game C" }));
  expect(Array.from(view.container.querySelectorAll("iframe"))).toEqual(players);
  expect(view.container.querySelectorAll('[data-audible="true"]')).toHaveLength(1);
  fireEvent.change(view.getByRole("textbox", { name: "Room ID (optional)" }), { target: { value: "layout-test" } });
  fireEvent.click(view.getByRole("button", { name: "Join", exact: true }));
  const published = fixture.connection.connect.mock.calls[0][1] as RoomState;
  expect(published).toMatchObject({ layout: "dual", leftSlug: "A", rightSlug: "C", audioSlug: "C", audioMuted: false });
  fixture.connection.roomId = "layout-test";
  fixture.connection.status = "connected";
  fixture.connection.room = reduceRoom(published, { type: "audio-muted", value: true }, "mute");
  view.rerender(<MultisportApp />);
  expect(view.container.querySelectorAll('[data-audible="true"]')).toHaveLength(0);
  fireEvent.change(view.getByRole("combobox", { name: "Layout" }), { target: { value: "triple" } });
  expect(fixture.connection.send).toHaveBeenLastCalledWith({ type: "layout", layout: "triple" });
  fixture.connection.room = reduceRoom(fixture.connection.room, { type: "layout", layout: "triple" }, "layout");
  view.rerender(<MultisportApp />);
  expect(view.container.querySelector(".screen-layout-triple")).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Leave", exact: true }));
  fixture.connection.room = null; fixture.connection.roomId = null;
  view.rerender(<MultisportApp />);
  expect(view.container.querySelector(".screen-layout-triple")).toBeTruthy();
  expect(view.container.querySelectorAll('[data-audible="true"]')).toHaveLength(0);
  expect(JSON.parse(localStorage.getItem("multisport420:viewing")!).layout).toBe("triple");
});

it("refreshes B and C with incomplete listings without removing A or losing spotlight audio", async () => {
  const view = render(<MultisportApp />);
  await waitFor(() => expect(view.getByRole("button", { name: "Game A", exact: true })).toBeTruthy());
  for (const title of ["A", "B", "C"]) fireEvent.click(view.getByRole("button", { name: `Game ${title}`, exact: true }));
  await waitFor(() => expect(view.getByRole("button", { name: "Refresh screen (2) Game B" }).hasAttribute("disabled")).toBe(false));
  const frameA = view.getByTitle("(1) Game A");
  for (const [index, slug] of [[1, "B"], [2, "C"]] as const) {
    const previous = view.getByTitle(`(${index + 1}) Game ${slug}`);
    fixture.getStreams.mockResolvedValueOnce([{ ...fixture.streams[index], raw_url: `https://example.com/${slug}?fresh=1` }]);
    fireEvent.click(view.getByRole("button", { name: `Refresh screen (${index + 1}) Game ${slug}` }));
    await waitFor(() => expect(previous.isConnected).toBe(false));
    await waitFor(() => expect(view.getByRole("button", { name: `Refresh screen (${index + 1}) Game ${slug}` }).hasAttribute("disabled")).toBe(false));
    expect(view.container.querySelectorAll(".screen-card")).toHaveLength(3);
    expect(view.getByTitle("(1) Game A")).toBe(frameA);
    fireEvent.click(view.getByRole("button", { name: `Focus screen (${index + 1}) Game ${slug}` }));
    const player = view.getByTitle(`(${index + 1}) Game ${slug}`) as HTMLIFrameElement;
    const messages = vi.spyOn(player.contentWindow!, "postMessage");
    fireEvent(window, new MessageEvent("message", { source: player.contentWindow,
      data: { source: "multisport420-app", type: "multisport420:audio-ready" } }));
    expect(messages).toHaveBeenCalledWith({ source: "multisport420-app", type: "multisport420:set-muted", muted: false }, "*");
    expect(view.container.querySelectorAll('[data-audible="true"]')).toHaveLength(1);
  }
  // Refresh the audible stream while explicitly muted, with an empty catalogue.
  fireEvent.keyDown(window, { code: "Digit3" });
  const previous = view.getByTitle("(3) Game C") as HTMLIFrameElement;
  const staleWindow = previous.contentWindow;
  fixture.getStreams.mockResolvedValueOnce([]);
  fireEvent.click(view.getByRole("button", { name: "Refresh screen (3) Game C" }));
  await waitFor(() => expect(previous.isConnected).toBe(false));
  const current = view.getByTitle("(3) Game C") as HTMLIFrameElement;
  const messages = vi.spyOn(current.contentWindow!, "postMessage");
  fireEvent(window, new MessageEvent("message", { source: staleWindow,
    data: { source: "multisport420-app", type: "multisport420:audio-ready" } }));
  expect(messages).not.toHaveBeenCalled();
  fireEvent(window, new MessageEvent("message", { source: current.contentWindow,
    data: { source: "multisport420-app", type: "multisport420:audio-ready" } }));
  expect(messages).toHaveBeenCalledWith({ source: "multisport420-app", type: "multisport420:set-muted", muted: true }, "*");
  expect(view.container.querySelectorAll(".screen-card")).toHaveLength(3);
  expect(view.container.querySelectorAll('[data-audible="true"]')).toHaveLength(0);
});
