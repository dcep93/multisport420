import { useCallback, useEffect, useRef, useState } from "react";
import { goOffline, goOnline, onDisconnect, onValue, push, ref, runTransaction, serverTimestamp, set,
  type Database, type DatabaseReference } from "firebase/database";
import { getRoomDatabase } from "../lib/firebase";
import { readRoom, reduceRoom, roomKey, type RoomAction, type RoomCommand, type RoomState } from "../lib/roomState";

type Status = "idle" | "connecting" | "connected" | "offline" | "error";
type View = { roomId: string | null; room: RoomState | null; status: Status;
  error: string; viewerCount: number };
type Session = { active: boolean; online: boolean; ready: boolean; roomRef?: DatabaseReference; database?: Database;
  stop: (() => void)[]; seenCommands: Set<string>; baseline: boolean; failed?: boolean };
const EMPTY: View = { roomId: null, room: null, status: "idle", error: "", viewerCount: 0 };

export default function useRoom(onCommand?: (command: RoomCommand) => void) {
  const [view, setView] = useState<View>(EMPTY);
  const sessionRef = useRef<Session | null>(null);
  const commandHandler = useRef(onCommand);
  useEffect(() => { commandHandler.current = onCommand; }, [onCommand]);

  const disconnect = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.active = false;
    session.stop.forEach((stop) => stop());
    // onDisconnect removes this tab's presence on the server. Explicitly close
    // the socket as well, so Leave/unmount cannot keep sending SDK keepalives.
    if (session.database) goOffline(session.database);
    sessionRef.current = null;
  }, []);

  useEffect(() => disconnect, [disconnect]);

  const leave = useCallback(() => {
    disconnect();
    setView(EMPTY);
  }, [disconnect]);

  const connect = useCallback(async (roomId: string, publish?: RoomState) => {
    disconnect();
    const session: Session = { active: true, online: false, ready: false, stop: [], baseline: true, seenCommands: new Set() };
    sessionRef.current = session;
    setView({ ...EMPTY, roomId, status: "connecting" });
    const fail = (error: unknown) => {
      if (!session.active) return;
      session.failed = true;
      session.ready = false;
      session.stop.forEach((stop) => stop());
      if (session.database) goOffline(session.database);
      setView((current) => ({ ...current, status: "error", error: roomError(error) }));
    };
    try {
      const key = roomKey(roomId);
      const database = await getRoomDatabase();
      if (!session.active) return;
      session.database = database;
      goOnline(database);
      const roomRef = ref(database, `remoteRooms/${key}/state`);
      session.roomRef = roomRef;
      await waitForConnection(database, session);
      if (!session.active) return;
      if (publish) {
        // Joining deliberately replaces the room, including old one-shot commands.
        await runTransaction(roomRef, () => ({ ...publish, command: null }), { applyLocally: false });
        if (!session.active) return;
      }
      session.stop.push(onValue(roomRef, (snapshot) => {
        if (!session.active || session.failed) return;
        const room = readRoom(snapshot.val());
        const command = room?.command;
        if (session.online && !session.baseline && command && !session.seenCommands.has(command.id)) {
          commandHandler.current?.(command);
        }
        rememberCommand(session, command?.id);
        setView((current) => ({ ...current, room, error: "",
          status: !session.online ? "offline" : session.ready ? "connected" : "connecting" }));
      }, fail));
      session.stop.push(onValue(ref(database, `remoteRooms/${key}/viewers`), (snapshot) => {
        if (session.active) setView((current) => ({ ...current, viewerCount: snapshot.size }));
      }, fail));
      let connectionVersion = 0;
      session.stop.push(onValue(ref(database, ".info/connected"), (snapshot) => {
        const version = ++connectionVersion;
        session.online = snapshot.val() === true;
        if (!session.active || session.failed) return;
        session.baseline = true;
        session.ready = false;
        setView((current) => ({ ...current, status: session.online ? "connecting" : "offline" }));
        if (!session.online) return;
        // Use a server read: SDK get() may return the active listener's stale
        // cache. onValue alone may emit nothing when reconnecting unchanged.
        void fetchRoomBaseline(roomRef).then(async (baseline) => {
          if (!session.active || !session.online || version !== connectionVersion || session.failed) return;
          rememberCommand(session, baseline?.command?.id);
          session.baseline = false;
          session.ready = true;
          setView((current) => ({ ...current, status: "connected" }));
          if (publish) {
            const presence = push(ref(database, `remoteRooms/${key}/viewers`));
            await onDisconnect(presence).remove();
            if (session.active && session.online && version === connectionVersion) {
              await set(presence, { joinedAt: serverTimestamp() });
            }
          }
        }).catch((error: unknown) => {
          if (session.online && version === connectionVersion) fail(error);
        });
      }));
    } catch (error) { fail(error); }
  }, [disconnect]);

  const send = useCallback(async (action: RoomAction) => {
    const session = sessionRef.current;
    if (!session?.active || !session.ready || !session.online || !session.roomRef) {
      setView((current) => ({ ...current, error: "Reconnect before using the remote." }));
      return false;
    }
    const commandId = crypto.randomUUID();
    try {
      const result = await runTransaction(session.roomRef, (value) => {
        if (!session.active || !session.online) return;
        const room = readRoom(value);
        // null may be the SDK's initially empty cache, so allow a server retry.
        return room ? reduceRoom(room, action, commandId) : value;
      }, { applyLocally: false });
      if (!session.active) return false;
      setView((current) => ({ ...current, error: "" }));
      return result.committed && result.snapshot.exists();
    } catch (error) {
      if (session.active) setView((current) => ({ ...current, error: roomError(error) }));
      return false;
    }
  }, []);

  return { ...view, connect, leave, send };
}

function roomError(error: unknown) {
  if (error instanceof Error && /permission.denied/i.test(error.message)) {
    return "This room could not be accessed. Check the Firebase room rules.";
  }
  return error instanceof Error ? error.message : "Could not connect to this room. Try again.";
}

function rememberCommand(session: Session, id?: string) {
  if (!id) return;
  session.seenCommands.add(id);
  if (session.seenCommands.size > 100) {
    session.seenCommands.delete(session.seenCommands.values().next().value!);
  }
}

async function fetchRoomBaseline(roomRef: DatabaseReference) {
  const url = new URL(roomRef.toString());
  url.pathname += ".json";
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(response.status === 401 || response.status === 403
      ? "permission_denied" : "Could not sync this room. Try reconnecting.");
  }
  return readRoom(await response.json());
}

function waitForConnection(database: Database, session: Session) {
  return new Promise<void>((resolve, reject) => {
    let stop = () => {};
    const timer = setTimeout(() => {
      stop();
      reject(new Error("Could not connect. Check your connection and try again."));
    }, 10_000);
    stop = onValue(ref(database, ".info/connected"), (snapshot) => {
      if (snapshot.val() === true) {
        session.online = true;
        clearTimeout(timer);
        queueMicrotask(() => stop());
        resolve();
      }
    });
    session.stop.push(() => { clearTimeout(timer); stop(); resolve(); });
  });
}
