// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { RoomState } from "../src/app_x/lib/roomState";
import { reduceRoom } from "../src/app_x/lib/roomState";
import MultisportApp from "../src/app_x/components/MultisportApp";

const fixture = vi.hoisted(() => {
  const streams = ["A", "B", "C"].map((title) => ({ title: `Game ${title}`, slug: title, category: "NFL", espn_id: -1, raw_url: `https://example.com/${title}` }));
  return { streams, connection: { room: null as RoomState | null, roomId: null as string | null, status: "idle", viewerCount: 0, connect: vi.fn(), leave: vi.fn(), send: vi.fn() } };
});
vi.mock("../src/app_x/config/data", () => ({ HOST: { getStreams: async () => fixture.streams, getLeagueCategories: () => ["NFL"], getIframeParams: async () => ({}), getIframeDocStrElement: () => <html><body>Player</body></html> } }));
vi.mock("../src/app_x/hooks/useRoom", () => ({ default: () => fixture.connection }));
vi.mock("../src/app_x/hooks/useStreamLog", () => ({ useStreamLog: () => ({}) }));
beforeEach(() => { window.history.replaceState(null, "", "/"); localStorage.clear(); fixture.connection.room = null; fixture.connection.roomId = null; fixture.connection.status = "idle"; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("publishes layout, explicit sides and actual audio choice on joining, then retains remote changes on leave", async () => {
  const view = render(<MultisportApp />);
  await waitFor(() => expect(view.getByRole("button", { name: "Game A", exact: true })).toBeTruthy());
  for (const title of ["A", "B", "C"]) fireEvent.click(view.getByRole("button", { name: `Game ${title}`, exact: true }));
  fireEvent.change(view.getByRole("combobox", { name: "Layout" }), { target: { value: "dual" } });
  fireEvent.click(view.getByRole("button", { name: "Promote Game C to right" }));
  fireEvent.click(view.getByRole("button", { name: "Sound on right: Game C" }));
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
