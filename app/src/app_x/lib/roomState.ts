import type { Stream } from "../config/types";
import { isFantasyScoreboard } from "./fantasyScoreboard";
import { isViewingLayout, type ViewingLayout } from "./viewingLayouts";

export type Presentation = {
  layout: ViewingLayout;
  leftSlug: string;
  rightSlug: string;
  audioSlug: string;
  audioMuted: boolean;
  showStreamSelector: boolean;
};

export type RoomCommand = { id: string; type: "mute" | "refresh-log"; slug: string };
export type RoomState = Partial<Presentation> & {
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
  | { type: "layout"; layout: ViewingLayout }
  | { type: "promote"; side: "left" | "right"; slug: string }
  | { type: "audio"; slug: string }
  | { type: "audio-muted" | "stream-selector"; value: boolean }
  | { type: "swap-sides" }
  | { type: "clear" };

export function presentationOf(room: RoomState): Presentation {
  const has = (slug: unknown): slug is string => typeof slug === "string" && room.streams.some((stream) => stream.slug === slug);
  const leftSlug = has(room.leftSlug) ? room.leftSlug : has(room.focusedSlug) ? room.focusedSlug : room.streams[0]?.slug ?? "";
  const rightSlug = has(room.rightSlug) && room.rightSlug !== leftSlug ? room.rightSlug : room.streams.find((stream) => stream.slug !== leftSlug)?.slug ?? "";
  const audioSlug = room.audioSlug === undefined ? room.focusedSlug : room.audioSlug;
  return {
    layout: isViewingLayout(room.layout) ? room.layout : "spotlight", leftSlug, rightSlug,
    audioSlug: room.streams.some((stream) => stream.slug === audioSlug && !isFantasyScoreboard(stream)) ? audioSlug : "",
    audioMuted: room.audioMuted === true, showStreamSelector: room.showStreamSelector === true,
  };
}

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
  const focusedSlug = uniqueStreams.some((stream) => stream.slug === data.focusedSlug)
    ? data.focusedSlug! : uniqueStreams[0]?.slug ?? "";
  const room: RoomState = {
    ...presentationOf({ ...data, streams: uniqueStreams, focusedSlug, displayLogs: data.displayLogs !== false, command: null }),
    streams: uniqueStreams,
    focusedSlug,
    displayLogs: data.displayLogs !== false,
    command: command && typeof command.id === "string" && typeof command.slug === "string"
      && (command.type === "mute" || command.type === "refresh-log") ? command : null,
  };
  return room;
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
  const presentation = presentationOf(room);
  const video = (slug: string) => room.streams.some((stream) => stream.slug === slug && !isFantasyScoreboard(stream));
  switch (action.type) {
    case "layout":
      return isViewingLayout(action.layout) ? { ...room, ...presentation, layout: action.layout } : room;
    case "stream-selector":
      return { ...room, showStreamSelector: action.value };
    case "audio-muted":
      return { ...room, ...presentation, audioMuted: action.value };
    case "audio":
      return video(action.slug) ? { ...room, ...presentation, audioSlug: action.slug, audioMuted: false } : room;
    case "swap-sides":
      return { ...room, ...presentation, leftSlug: presentation.rightSlug || presentation.leftSlug, rightSlug: presentation.rightSlug ? presentation.leftSlug : "" };
    case "promote": {
      if (!room.streams.some((stream) => stream.slug === action.slug)) return room;
      const target = action.side === "left" ? "leftSlug" : "rightSlug";
      const other = action.side === "left" ? "rightSlug" : "leftSlug";
      const displaced = presentation[target];
      return { ...room, ...presentation, [target]: action.slug,
        [other]: presentation[other] === action.slug ? displaced : presentation[other],
        // Replacing the audible side follows that side; swapping sides keeps
        // sound on the same game. Promotion on the silent side never steals it.
        audioSlug: presentation.audioSlug === displaced && presentation[other] !== action.slug && video(action.slug) ? action.slug : presentation.audioSlug,
      };
    }
    case "select":
    case "focus":
      if (!room.streams.some((stream) => stream.slug === action.slug)) return room;
      if (action.type === "select" && action.slug === room.focusedSlug && action.slug === presentation.audioSlug) {
        return { ...room, ...presentation, audioMuted: !presentation.audioMuted, command: { id: commandId, type: "mute", slug: action.slug } };
      }
      return { ...room, ...presentation, focusedSlug: action.slug,
        ...(presentation.layout === "dual" && action.slug !== presentation.leftSlug && action.slug !== presentation.rightSlug
          ? { [presentation.audioSlug === presentation.rightSlug ? "rightSlug" : "leftSlug"]: action.slug } : {}),
        ...(video(action.slug) ? { audioSlug: action.slug, audioMuted: action.slug === presentation.audioSlug ? presentation.audioMuted : false } : {}),
      };
    case "refresh-log":
      return room.displayLogs && room.focusedSlug
        ? { ...room, command: { id: commandId, type: "refresh-log", slug: room.focusedSlug } }
        : room;
    case "display-logs":
      return { ...room, displayLogs: action.value };
    case "clear":
      return { ...room, streams: [], focusedSlug: "", leftSlug: "", rightSlug: "", audioSlug: "", audioMuted: false, command: null };
    case "replace-stream":
      return { ...room, streams: room.streams.map((stream) =>
        stream.slug === action.stream.slug ? action.stream : stream) };
    case "toggle-stream":
      if (!room.streams.some((stream) => stream.slug === action.stream.slug)) {
        return { ...room, streams: [...room.streams, action.stream],
          ...(room.streams.length === 0 ? { audioSlug: isFantasyScoreboard(action.stream) ? "" : action.stream.slug, audioMuted: false } : {}),
          focusedSlug: room.focusedSlug || action.stream.slug };
      }
      return removeStream(room, action.stream.slug);
    case "remove":
      return removeStream(room, action.slug);
  }
}

function removeStream(room: RoomState, slug: string): RoomState {
  const streams = room.streams.filter((stream) => stream.slug !== slug);
  const next = { ...room, streams,
    focusedSlug: room.focusedSlug === slug ? streams[0]?.slug ?? "" : room.focusedSlug };
  return { ...next, ...presentationOf(next) };
}
