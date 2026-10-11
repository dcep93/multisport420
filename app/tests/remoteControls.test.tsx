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
beforeEach(() => {
  connection.viewerCount = 1;
  connection.status = "connected";
  connection.room = { streams: [a, b, c, FANTASY_SCOREBOARD], focusedSlug: "a", displayLogs: true, command: null, layout: "dual", leftSlug: "a", rightSlug: "b", audioSlug: "a", audioMuted: false };
  connection.send.mockImplementation(async (action) => { connection.room = reduceRoom(connection.room!, action, "command"); return true; });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

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
