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
