import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { HOST } from "../config/data";
import type { Category, Stream, StreamSlug } from "../config/types";
import useSelectedStreamIds from "../hooks/useSelectedStreamIds";
import useRoom from "../hooks/useRoom";
import { getInitialAuthorized, unlock } from "../lib/auth";
import Menu from "./Menu";
import Multiscreen from "./Multiscreen";
import { filterStreamsByCategory, getDefaultCategory } from "./optionsShared";
import PasswordGate from "./PasswordGate";
import RoomControls from "./RoomControls";
import ViewingControls from "./ViewingControls";
import { useViewingPreferences } from "../hooks/useViewingPreferences";
import { presentationOf, reduceRoom, type Presentation, type RoomAction } from "../lib/roomState";
import { hasMultisport420Extension, subscribeMultisport420Extension, withFantasyScoreboard } from "../lib/fantasyScoreboard";

const IS_DEV = import.meta.env.DEV;

export default function MultisportApp() {
  const hostCategories = HOST.getLeagueCategories();
  const defaultCategory = getDefaultCategory(hostCategories);
  const [isAuthorized, setIsAuthorized] = useState(() => (IS_DEV ? true : getInitialAuthorized()));
  const [category, setCategory] = useState<Category>(defaultCategory);
  const [hostStreams, setAllStreams] = useState<Stream[] | null>(null);
  // Keep built-in descriptors available for hash/room restoration. Menu visibility
  // depends on the extension; the scoreboard itself also enforces its requirement.
  const allStreams = useMemo(() => withFantasyScoreboard(hostStreams), [hostStreams]);
  const multisport420Installed = useSyncExternalStore(subscribeMultisport420Extension, hasMultisport420Extension, () => false);
  const [streamReloadKey, setStreamReloadKey] = useState(0);
  const [streamError, setStreamError] = useState<Error | null>(null);
  const [focusedSlug, setFocusedSlug] = useState<StreamSlug>("");
  const [localPresentation, setLocalPresentation] = useState<Partial<Presentation>>({});
  const [logRefreshSlug, setLogRefreshSlug] = useState<StreamSlug>("");
  const [logRefreshRequestId, setLogRefreshRequestId] = useState(0);
  const [localDisplayLogs, setDisplayLogs] = useState(true);
  const [viewing, setViewing] = useViewingPreferences();
  const [logDelayMs, setLogDelayMs] = useState(30_000);
  const streams = filterStreamsByCategory(allStreams, category, multisport420Installed);
  const room = useRoom((command) => {
    if (command.type === "refresh-log") {
      setLogRefreshSlug(command.slug);
      setLogRefreshRequestId((current) => current + 1);
    }
  });
  const { send: sendRoomAction } = room;
  useEffect(() => {
    if (!room.room) return;
    const shared = presentationOf(room.room);
    setViewing((current) => current.layout === shared.layout && current.showStreamSelector === shared.showStreamSelector
      ? current : { layout: shared.layout, showStreamSelector: shared.showStreamSelector });
  }, [room.room, setViewing]);
  const roomId = room.room ? room.roomId : null;
  const displayLogs = room.room?.displayLogs ?? localDisplayLogs;
  const {
    hadHashSelectionOnLoad,
    selectedSlugs: localSelectedSlugs,
    selectedStreams: localSelectedStreams,
    setSelectedSlugs,
    replaceSelectedStream,
    restoreSelection,
  } =
    useSelectedStreamIds(allStreams, room.room?.streams);
  const selectedStreams = room.room?.streams ?? localSelectedStreams;
  const selectedSlugs = room.room ? room.room.streams.map((stream) => stream.slug) : localSelectedSlugs;
  const multiscreenRef = useRef<HTMLElement | null>(null);
  const hasScrolledFromInitialHashRef = useRef(false);

  useEffect(() => {
    let isActive = true;

    HOST.getStreams(streamReloadKey > 0 ? { maxAgeMs: 0 } : undefined)
      .then((fetchedStreams) => {
        if (!isActive) return;
        setAllStreams(fetchedStreams);
        setStreamError(null);
      })
      .catch((error) => {
        console.error(error);
        if (!isActive) return;
        setAllStreams([]);
        setStreamError(error instanceof Error ? error : new Error("Unable to load streams. Please retry."));
      });

    return () => {
      isActive = false;
    };
  }, [streamReloadKey]);

  const resolvedFocusedSlug =
    room.room?.focusedSlug ?? (selectedStreams.find((stream) => stream.slug === focusedSlug)?.slug ?? selectedStreams[0]?.slug);
  const currentRoom = useMemo(() => room.room ?? {
    ...viewing, ...localPresentation, streams: selectedStreams, focusedSlug: resolvedFocusedSlug ?? "", displayLogs, command: null,
  }, [room.room, viewing, localPresentation, selectedStreams, resolvedFocusedSlug, displayLogs]);
  const presentation = presentationOf(currentRoom);
  const keepPresentation = useCallback((value: Presentation) => {
    setLocalPresentation({ leftSlug: value.leftSlug, rightSlug: value.rightSlug, audioSlug: value.audioSlug, audioMuted: value.audioMuted });
    setViewing({ layout: value.layout, showStreamSelector: value.showStreamSelector });
  }, [setViewing]);
  const actOnRoom = useCallback((action: RoomAction) => {
    if (roomId !== null) { void sendRoomAction(action); return; }
    const next = reduceRoom(currentRoom, action, crypto.randomUUID());
    setFocusedSlug(next.focusedSlug);
    setDisplayLogs(next.displayLogs);
    keepPresentation(presentationOf(next));
    if (action.type === "remove" || action.type === "toggle-stream") setSelectedSlugs(next.streams.map((stream) => stream.slug));
    if (action.type === "refresh-log" && next.command?.type === "refresh-log") {
      setLogRefreshSlug(next.command.slug);
      setLogRefreshRequestId((current) => current + 1);
    }
  }, [roomId, sendRoomAction, currentRoom, keepPresentation, setSelectedSlugs]);
  const shouldScrollToMultiscreenOnLoad = hadHashSelectionOnLoad && selectedStreams.length > 0;

  useEffect(() => {
    if (!shouldScrollToMultiscreenOnLoad || hasScrolledFromInitialHashRef.current) {
      return;
    }

    const multiscreenRect = multiscreenRef.current?.getBoundingClientRect();
    if (multiscreenRect) {
      window.scrollTo({
        top: window.scrollY + multiscreenRect.top,
        left: window.scrollX + multiscreenRect.left,
        behavior: "smooth",
      });
    }

    hasScrolledFromInitialHashRef.current = true;
  }, [shouldScrollToMultiscreenOnLoad]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (/^(?:Digit|Numpad)0$/.test(event.code)) {
        if (!displayLogs || !resolvedFocusedSlug) {
          return;
        }

        if (roomId !== null) {
          void sendRoomAction({ type: "refresh-log" });
          return;
        }
        setLogRefreshSlug(resolvedFocusedSlug);
        setLogRefreshRequestId((current) => current + 1);
        return;
      }

      const match = event.code.match(/^(?:Digit|Numpad)([1-9])$/);
      if (!match) {
        return;
      }

      const nextIndex = Number(match[1]) - 1;
      const nextStream = selectedStreams[nextIndex];
      if (!nextStream) {
        return;
      }

      actOnRoom({ type: "select", slug: nextStream.slug });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [displayLogs, resolvedFocusedSlug, selectedStreams, roomId, sendRoomAction, actOnRoom]);

  function handleToggle(streamSlug: StreamSlug) {
    const stream = allStreams?.find((stream) => stream.slug === streamSlug);
    if (stream) actOnRoom({ type: "toggle-stream", stream });
  }

  function handleRemove(streamSlug: StreamSlug) {
    actOnRoom({ type: "remove", slug: streamSlug });
  }

  async function handleRefreshStreams() {
    try {
      const fetchedStreams = await HOST.getStreams({ maxAgeMs: 0 });
      setAllStreams(fetchedStreams);
      setStreamError(null);
    } catch (error) {
      setStreamError(error instanceof Error ? error : new Error("Unable to load streams. Please retry."));
    }
  }

  async function handleRefreshStream(streamSlug: StreamSlug) {
    const fetchedStreams = await HOST.getStreams();
    const refreshedStream = fetchedStreams.find((stream) => stream.slug === streamSlug) ?? null;
    setAllStreams(fetchedStreams);

    if (refreshedStream) {
      replaceSelectedStream(refreshedStream);
      if (roomId !== null) await sendRoomAction({ type: "replace-stream", stream: refreshedStream });
    }

    return refreshedStream;
  }

  async function handleClearCache() {
    if (roomId !== null) await sendRoomAction({ type: "clear" });
    room.leave();
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState(null, "", url);

    setIsAuthorized(IS_DEV);
    setCategory(defaultCategory);
    setAllStreams(null);
    setStreamReloadKey((current) => current + 1);
    setFocusedSlug("");
    setLocalPresentation({});
    setDisplayLogs(true);
    setViewing({ layout: "spotlight", showStreamSelector: false });
    setSelectedSlugs([]);
    hasScrolledFromInitialHashRef.current = false;
  }

  if (!isAuthorized) {
    return (
      <PasswordGate
        onUnlock={() => {
          unlock();
          setIsAuthorized(true);
        }}
      />
    );
  }

  return (
    <main className="multisport-shell">
      <Menu
        viewingControls={<ViewingControls {...presentation}
          onLayoutChange={(layout) => actOnRoom({ type: "layout", layout })}
          onShowStreamSelectorChange={(value) => actOnRoom({ type: "stream-selector", value })} />}
        roomControls={<RoomControls room={room} disabled={allStreams === null}
          onJoin={(id) => {
            // Keep the current players mounted while switching rooms, and keep
            // local viewing usable if Firebase cannot be reached.
            restoreSelection(selectedStreams);
            setFocusedSlug(resolvedFocusedSlug ?? "");
            setDisplayLogs(displayLogs);
            keepPresentation(presentation);
            void room.connect(id, { ...currentRoom, ...presentation });
          }}
          onLeave={() => {
            restoreSelection(selectedStreams);
            setFocusedSlug(resolvedFocusedSlug ?? "");
            setDisplayLogs(displayLogs);
            keepPresentation(presentation);
            room.leave();
          }} />}
        category={category}
        categories={hostCategories}
        displayLogs={displayLogs}
        isLoadingStreams={allStreams === null}
        streamError={streamError}
        onRetryStreams={() => { setStreamError(null); setAllStreams(null); setStreamReloadKey((key) => key + 1); }}
        logDelayMs={logDelayMs}
        streams={streams ?? []}
        selectedSlugs={selectedSlugs}
        onCategoryChange={setCategory}
        onToggle={handleToggle}
        onDisplayLogsChange={(value) => {
          if (roomId !== null) void sendRoomAction({ type: "display-logs", value });
          else setDisplayLogs(value);
        }}
        onLogDelayMsChange={setLogDelayMs}
        onClearCache={handleClearCache}
        onRefreshStreams={handleRefreshStreams}
      />
      {selectedStreams.length > 0 ? (
        <Multiscreen
          layout={presentation.layout}
          showStreamSelector={presentation.showStreamSelector}
          presentation={presentation}
          onPresentationAction={actOnRoom}
          containerRef={multiscreenRef}
          host={HOST}
          streams={selectedStreams}
          displayLogs={displayLogs}
          logDelayMs={logDelayMs}
          focusedSlug={resolvedFocusedSlug}
          logRefreshSlug={logRefreshSlug}
          logRefreshRequestId={logRefreshRequestId}
          muteToggleRequestId={0}
          onRefreshStream={handleRefreshStream}
          onRemove={handleRemove}
          onFocus={(slug) => actOnRoom({ type: "focus", slug })}
        />
      ) : null}
    </main>
  );
}
