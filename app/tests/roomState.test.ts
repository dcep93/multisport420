import { describe, expect, it } from "vitest";
import { presentationOf, readRoom, reduceRoom, remotePath, roomKey, type RoomState } from "../src/app_x/lib/roomState";
import { FANTASY_SCOREBOARD } from "../src/app_x/lib/fantasyScoreboard";
import { VIEWING_LAYOUTS } from "../src/app_x/lib/viewingLayouts";

const a = { slug: "a", title: "Away @ Home", category: "MLB", espn_id: 1, raw_url: "https://example.com/a" };
const b = { ...a, slug: "b", title: "Second game" };
const initial: RoomState = { streams: [a, b], focusedSlug: "a", displayLogs: true, command: null };

describe("room identity and persisted data", () => {
  it("keeps the empty room separate from every named room", () => {
    const ids = ["", "default", "r_", "a/b", "a.b", "a#b", "a$b", "[a]", "🏀", " room "];
    expect(new Set(ids.map(roomKey)).size).toBe(ids.length);
    ids.forEach((id) => expect(roomKey(id)).not.toMatch(/[.#$[\]/]/));
    expect(remotePath("")).toBe("/remote");
    expect(remotePath("a/b 🏀")).toBe("/remote/a%2Fb%20%F0%9F%8F%80");
  });
  it("normalizes Firebase's missing empty arrays and null values", () => {
    expect(readRoom(null)).toBeNull();
    expect(readRoom({ focusedSlug: "old" })).toMatchObject({ streams: [], focusedSlug: "", displayLogs: true, command: null, layout: "spotlight", audioSlug: "", audioMuted: false });
    expect(readRoom({ ...initial, streams: [a, null, a, b], focusedSlug: "missing" })?.streams).toEqual([a, b]);
  });
});

describe("shared layout, placement, and audio", () => {
  const c = { ...a, slug: "c", title: "Third game" };
  const dual: RoomState = { ...initial, streams: [a, b, c, FANTASY_SCOREBOARD], layout: "dual", leftSlug: "a", rightSlug: "b", audioSlug: "a", audioMuted: false };
  it.each(VIEWING_LAYOUTS)("synchronizes $label without changing streams or audio", ({ id }) => {
    const next = reduceRoom(dual, { type: "layout", layout: id }, "1");
    expect(readRoom(next)).toMatchObject({ layout: id, audioSlug: "a", audioMuted: false, leftSlug: "a", rightSlug: "b" });
    expect(next.streams).toBe(dual.streams);
  });
  it("promotes either side independently and follows the audible side when replacing its game", () => {
    const right = reduceRoom(dual, { type: "promote", side: "right", slug: "c" }, "1");
    expect(right).toMatchObject({ leftSlug: "a", rightSlug: "c", audioSlug: "a" });
    const left = reduceRoom(right, { type: "promote", side: "left", slug: "b" }, "2");
    expect(left).toMatchObject({ leftSlug: "b", rightSlug: "c", audioSlug: "b" });
    const swap = reduceRoom(left, { type: "promote", side: "left", slug: "c" }, "3");
    expect(swap).toMatchObject({ leftSlug: "c", rightSlug: "b", audioSlug: "b" });
  });
  it("changes and mutes sound without moving either main game", () => {
    const rightAudio = reduceRoom(dual, { type: "audio", slug: "b" }, "1");
    expect(rightAudio).toMatchObject({ leftSlug: "a", rightSlug: "b", audioSlug: "b", audioMuted: false });
    const muted = reduceRoom(rightAudio, { type: "audio-muted", value: true }, "2");
    expect(readRoom(muted)?.audioMuted).toBe(true);
    expect(reduceRoom(muted, { type: "audio", slug: "a" }, "3")).toMatchObject({ audioSlug: "a", audioMuted: false });
    expect(reduceRoom(rightAudio, { type: "focus", slug: "b" }, "4")).toMatchObject({ leftSlug: "a", rightSlug: "b" });
  });
  it.each(["focus", "select"] as const)("%s promotes a preview into the side selected for audio", (type) => {
    for (const audioSlug of ["a", "b"]) {
      const next = reduceRoom({ ...dual, audioSlug }, { type, slug: "c" }, "preview");
      expect(next).toMatchObject({ leftSlug: audioSlug === "a" ? "c" : "a", rightSlug: audioSlug === "b" ? "c" : "b", focusedSlug: "c", audioSlug: "c", audioMuted: false });
      expect(next.streams).toBe(dual.streams);
    }
  });
  it("uses the last audio side while muted and keeps video audio when promoting the scoreboard", () => {
    expect(reduceRoom({ ...dual, audioSlug: "b", audioMuted: true }, { type: "focus", slug: "c" }, "preview"))
      .toMatchObject({ leftSlug: "a", rightSlug: "c", audioSlug: "c", audioMuted: false });
    expect(reduceRoom({ ...dual, audioSlug: "b" }, { type: "focus", slug: FANTASY_SCOREBOARD.slug }, "scoreboard"))
      .toMatchObject({ leftSlug: "a", rightSlug: FANTASY_SCOREBOARD.slug, audioSlug: "b" });
  });
  it("swaps without duplicating players and preserves scoreboard audio behavior", () => {
    expect(reduceRoom(dual, { type: "swap-sides" }, "1")).toMatchObject({ leftSlug: "b", rightSlug: "a", audioSlug: "a" });
    const scoreboard = reduceRoom(dual, { type: "promote", side: "left", slug: FANTASY_SCOREBOARD.slug }, "2");
    expect(scoreboard.audioSlug).toBe("a");
    expect(reduceRoom(scoreboard, { type: "audio", slug: FANTASY_SCOREBOARD.slug }, "3")).toBe(scoreboard);
  });
  it("repairs missing or duplicate sides and ignores stale remote actions", () => {
    expect(presentationOf({ ...dual, leftSlug: "gone", rightSlug: "a", audioSlug: "gone" })).toMatchObject({ leftSlug: "a", rightSlug: "b", audioSlug: "" });
    expect(reduceRoom(dual, { type: "promote", side: "right", slug: "gone" }, "1")).toBe(dual);
    const removed = reduceRoom(dual, { type: "remove", slug: "a" }, "2");
    expect(removed.leftSlug).not.toBe(removed.rightSlug);
    expect(removed.audioSlug).toBe("");
    const restored = readRoom(JSON.parse(JSON.stringify({ ...dual, audioMuted: true })))!;
    expect(presentationOf(restored)).toMatchObject({ leftSlug: "a", rightSlug: "b", audioSlug: "a", audioMuted: true });
  });
});

describe("shared keyboard and remote actions", () => {
  it("shares a validated catalog and applies desired load state idempotently across concurrent edits", () => {
    const c = { ...a, slug: "c" };
    const catalog = reduceRoom(initial, { type: "catalog", streams: [a, b, c, c] }, "catalog");
    expect(catalog.availableStreams).toEqual([a, b, c]);
    expect(catalog.streams).toBe(initial.streams);
    expect(readRoom({ ...catalog, availableStreams: [a, null, c, c] })?.availableStreams).toEqual([a, c]);
    const add = { type: "set-stream-loaded", slug: "c", loaded: true } as const;
    const loaded = reduceRoom(catalog, add, "add");
    expect(loaded.streams.map(s => s.slug)).toEqual(["a", "b", "c"]);
    expect(reduceRoom(loaded, add, "retry")).toBe(loaded);
    const concurrent = reduceRoom(loaded, { type: "layout", layout: "grid" }, "layout");
    const removed = reduceRoom(concurrent, { type: "set-stream-loaded", slug: "b", loaded: false }, "remove");
    expect(removed.streams.map(s => s.slug)).toEqual(["a", "c"]);
    expect(removed.layout).toBe("grid");
    expect(reduceRoom(removed, { type: "set-stream-loaded", slug: "unknown", loaded: true }, "stale")).toBe(removed);
    expect(reduceRoom(removed, { type: "set-stream-loaded", slug: "b", loaded: false }, "retry")).toBe(removed);
  });
  it("mutes the audible grid game after reordering even when spotlight focus belongs to another game", () => {
    const grid: RoomState = { ...initial, layout: "grid", audioSlug: "b", audioMuted: false };
    const moved = reduceRoom(grid, { type: "reorder", slug: "b", targetSlug: "a" }, "reorder");
    const muted = reduceRoom(moved, { type: "select", slug: "b" }, "mute");
    expect(muted).toMatchObject({ focusedSlug: "b", audioSlug: "b", audioMuted: true });
    expect(muted.streams.map(s => s.slug)).toEqual(["b", "a"]);
    expect(reduceRoom(muted, { type: "select", slug: "b" }, "unmute").audioMuted).toBe(false);
  });
  it("reorders grid positions without changing sound, focus, or concurrent streams", () => {
    const c = { ...a, slug: "c" };
    const grid: RoomState = { ...initial, streams: [a, b, c], layout: "grid", audioSlug: "b", audioMuted: true };
    const moved = reduceRoom(grid, { type: "reorder", slug: "a", targetSlug: "c" }, "order");
    expect(moved.streams.map((stream) => stream.slug)).toEqual(["b", "c", "a"]);
    expect({ ...moved, streams: grid.streams }).toEqual(grid);
    const added = reduceRoom(moved, { type: "toggle-stream", stream: { ...a, slug: "d" } }, "add");
    expect(reduceRoom(added, { type: "reorder", slug: "a", targetSlug: "b" }, "order2").streams.map((stream) => stream.slug)).toEqual(["a", "b", "c", "d"]);
    for (const action of [{ type: "reorder", slug: "gone", targetSlug: "b" }, { type: "reorder", slug: "a", targetSlug: "gone" }, { type: "reorder", slug: "a", targetSlug: "a" }] as const) {
      expect(reduceRoom(grid, action, "stale")).toBe(grid);
    }
    expect(reduceRoom(initial, { type: "reorder", slug: "a", targetSlug: "b" }, "wrong-layout")).toBe(initial);
  });
  it("selects another stream, then toggles mute when selected again", () => {
    const selected = reduceRoom(initial, { type: "select", slug: "b" }, "1");
    expect(selected.focusedSlug).toBe("b");
    expect(selected.command).toBeNull();
    const muted = reduceRoom(selected, { type: "select", slug: "b" }, "2");
    expect(muted.command).toEqual({ id: "2", type: "mute", slug: "b" });
    expect(reduceRoom(muted, { type: "select", slug: "b" }, "3").command?.id).toBe("3");
  });
  it("refreshes the current spotlight only while logs are enabled", () => {
    expect(reduceRoom(initial, { type: "refresh-log" }, "r").command)
      .toEqual({ id: "r", type: "refresh-log", slug: "a" });
    const hidden = { ...initial, displayLogs: false };
    expect(reduceRoom(hidden, { type: "refresh-log" }, "r")).toBe(hidden);
  });
  it("preserves stream order and falls back when the spotlight is removed", () => {
    const next = reduceRoom(initial, { type: "remove", slug: "a" }, "1");
    expect(next.streams).toEqual([b]);
    expect(next.focusedSlug).toBe("b");
    const empty = reduceRoom(next, { type: "remove", slug: "b" }, "2");
    expect(empty.focusedSlug).toBe("");
    expect(reduceRoom(empty, { type: "toggle-stream", stream: a }, "3").focusedSlug).toBe("a");
  });
  it("ignores stale selections and preserves simultaneous lineup changes on retry", () => {
    expect(reduceRoom(initial, { type: "select", slug: "gone" }, "1")).toBe(initial);
    const added = reduceRoom(initial, { type: "toggle-stream", stream: { ...a, slug: "c" } }, "2");
    expect(reduceRoom(added, { type: "select", slug: "b" }, "3").streams.map((s) => s.slug)).toEqual(["a", "b", "c"]);
    expect(initial.focusedSlug).toBe("a");
  });
});
