import type { Stream } from "../config/types";

export type RoomCommand = { id: string; type: "mute" | "refresh-log"; slug: string };
export type RoomState = {
  streams: Stream[];
  focusedSlug: string;
  displayLogs: boolean;
  command: RoomCommand | null;
};

export type RoomAction =
  | { type: "select" | "focus" | "remove"; slug: string }
  | { type: "toggle-stream" | "replace-stream"; stream: Stream }
  | { type: "refresh-log" }
  | { type: "display-logs"; value: boolean }
  | { type: "clear" };

// Prefixing an encoded ID gives the empty room its own key and avoids collisions
// with named rooms, including IDs containing Firebase's forbidden characters.
export function roomKey(roomId: string) {
  const bytes = new TextEncoder().encode(roomId);
  if (bytes.length > 500) throw new Error("Please use a shorter room name.");
  return `r_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

export function remotePath(roomId: string) {
  return roomId === "" ? "/remote" : `/remote/${encodeURIComponent(roomId)}`;
}

export function readRoom(value: unknown): RoomState | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<RoomState>;
  const streams = Array.isArray(data.streams) ? data.streams.filter(isStream) : [];
  const uniqueStreams = streams.filter((stream, index) =>
    streams.findIndex((other) => other.slug === stream.slug) === index,
  );
  const command = data.command;
  return {
    streams: uniqueStreams,
    focusedSlug: uniqueStreams.some((stream) => stream.slug === data.focusedSlug)
      ? data.focusedSlug! : uniqueStreams[0]?.slug ?? "",
    displayLogs: data.displayLogs !== false,
    command: command && typeof command.id === "string" && typeof command.slug === "string"
      && (command.type === "mute" || command.type === "refresh-log") ? command : null,
  };
}

function isStream(value: unknown): value is Stream {
  if (!value || typeof value !== "object") return false;
  const stream = value as Stream;
  return typeof stream.slug === "string" && stream.slug.length > 0
    && typeof stream.title === "string" && typeof stream.raw_url === "string"
    && typeof stream.category === "string" && typeof stream.espn_id === "number";
}

// The caller creates one command ID per gesture, outside Firebase's retry loop.
export function reduceRoom(room: RoomState, action: RoomAction, commandId: string): RoomState {
  switch (action.type) {
    case "select":
    case "focus":
      if (!room.streams.some((stream) => stream.slug === action.slug)) return room;
      if (action.type === "select" && action.slug === room.focusedSlug) {
        return { ...room, command: { id: commandId, type: "mute", slug: action.slug } };
      }
      return { ...room, focusedSlug: action.slug };
    case "refresh-log":
      return room.displayLogs && room.focusedSlug
        ? { ...room, command: { id: commandId, type: "refresh-log", slug: room.focusedSlug } }
        : room;
    case "display-logs":
      return { ...room, displayLogs: action.value };
    case "clear":
      return { ...room, streams: [], focusedSlug: "", command: null };
    case "replace-stream":
      return { ...room, streams: room.streams.map((stream) =>
        stream.slug === action.stream.slug ? action.stream : stream) };
    case "toggle-stream":
      if (!room.streams.some((stream) => stream.slug === action.stream.slug)) {
        return { ...room, streams: [...room.streams, action.stream],
          focusedSlug: room.focusedSlug || action.stream.slug };
      }
      return removeStream(room, action.stream.slug);
    case "remove":
      return removeStream(room, action.slug);
  }
}

function removeStream(room: RoomState, slug: string): RoomState {
  const streams = room.streams.filter((stream) => stream.slug !== slug);
  return { ...room, streams,
    focusedSlug: room.focusedSlug === slug ? streams[0]?.slug ?? "" : room.focusedSlug };
}
