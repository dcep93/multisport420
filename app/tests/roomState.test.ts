import { describe, expect, it } from "vitest";
import { readRoom, reduceRoom, remotePath, roomKey, type RoomState } from "../src/app_x/lib/roomState";

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
    expect(readRoom({ focusedSlug: "old" })).toEqual({ streams: [], focusedSlug: "", displayLogs: true, command: null });
    expect(readRoom({ ...initial, streams: [a, null, a, b], focusedSlug: "missing" })?.streams).toEqual([a, b]);
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
