import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import { hasMultisport420Extension, subscribeMultisport420Extension, withFantasyScoreboard } from "../lib/fantasyScoreboard";

const IS_DEV = import.meta.env.DEV;

function removeStreamSlug(slugs: StreamSlug[], streamSlug: StreamSlug) {
  return slugs.filter((slug) => slug !== streamSlug);
}

function focusReplacementStream(
  remainingSlugs: StreamSlug[],
  setFocusedSlug: (value: StreamSlug) => void,
  setMuteToggleSlug: (value: StreamSlug) => void,
  setMuteToggleRequestId: (updater: (current: number) => number) => void,
) {
  const nextFocusedSlug = remainingSlugs[0] ?? "";
  setFocusedSlug(nextFocusedSlug);

  if (!nextFocusedSlug) {
    return;
  }

  setMuteToggleSlug(nextFocusedSlug);
  setMuteToggleRequestId((current) => current + 1);
}

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
  const [focusedSlug, setFocusedSlug] = useState<StreamSlug>("");
  const [muteToggleSlug, setMuteToggleSlug] = useState<StreamSlug>("");
  const [muteToggleRequestId, setMuteToggleRequestId] = useState(0);
  const [logRefreshSlug, setLogRefreshSlug] = useState<StreamSlug>("");
  const [logRefreshRequestId, setLogRefreshRequestId] = useState(0);
  const [localDisplayLogs, setDisplayLogs] = useState(true);
  const [logDelayMs, setLogDelayMs] = useState(120_000);
  const streams = filterStreamsByCategory(allStreams, category, multisport420Installed);
  const room = useRoom((command) => {
    if (command.type === "mute") {
      setMuteToggleSlug(command.slug);
      setMuteToggleRequestId((current) => current + 1);
    } else {
      setLogRefreshSlug(command.slug);
      setLogRefreshRequestId((current) => current + 1);
    }
  });
  const { send: sendRoomAction } = room;
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

    HOST.getStreams()
      .then((fetchedStreams) => {
        if (!isActive) return;
        setAllStreams(fetchedStreams);
      })
      .catch((error) => {
        console.error(error);
        if (!isActive) return;
        setAllStreams([]);
      });

    return () => {
      isActive = false;
    };
  }, [streamReloadKey]);

  const resolvedFocusedSlug =
    room.room?.focusedSlug ?? (selectedStreams.find((stream) => stream.slug === focusedSlug)?.slug ?? selectedStreams[0]?.slug);
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

      if (roomId !== null) {
        void sendRoomAction({ type: "select", slug: nextStream.slug });
        return;
      }

      if (nextStream.slug === resolvedFocusedSlug) {
        setMuteToggleSlug(nextStream.slug);
        setMuteToggleRequestId((current) => current + 1);
        return;
      }

      setFocusedSlug(nextStream.slug);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [displayLogs, resolvedFocusedSlug, selectedStreams, roomId, sendRoomAction]);

  function handleToggle(streamSlug: StreamSlug) {
    if (roomId !== null) {
      const stream = allStreams?.find((stream) => stream.slug === streamSlug);
      if (stream) void sendRoomAction({ type: "toggle-stream", stream });
      return;
    }
    if (selectedSlugs.includes(streamSlug)) {
      const remainingSlugs = removeStreamSlug(selectedSlugs, streamSlug);
      setSelectedSlugs(remainingSlugs);
      if (resolvedFocusedSlug === streamSlug) {
        focusReplacementStream(
          remainingSlugs,
          setFocusedSlug,
          setMuteToggleSlug,
          setMuteToggleRequestId,
        );
      }
      return;
    }

    setSelectedSlugs(selectedSlugs.concat(streamSlug));
    if (!resolvedFocusedSlug) {
      setFocusedSlug(streamSlug);
    }
  }

  function handleRemove(streamSlug: StreamSlug) {
    if (roomId !== null) {
      void sendRoomAction({ type: "remove", slug: streamSlug });
      return;
    }
    const remainingSlugs = removeStreamSlug(selectedSlugs, streamSlug);
    setSelectedSlugs(remainingSlugs);
    if (resolvedFocusedSlug === streamSlug) {
      focusReplacementStream(
        remainingSlugs,
        setFocusedSlug,
        setMuteToggleSlug,
        setMuteToggleRequestId,
      );
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
    setDisplayLogs(true);
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
        roomControls={<RoomControls room={room} disabled={allStreams === null}
          onJoin={(id) => {
            // Keep the current players mounted while switching rooms, and keep
            // local viewing usable if Firebase cannot be reached.
            restoreSelection(selectedStreams);
            setFocusedSlug(resolvedFocusedSlug ?? "");
            setDisplayLogs(displayLogs);
            void room.connect(id, {
              streams: selectedStreams, focusedSlug: resolvedFocusedSlug ?? "", displayLogs, command: null,
            });
          }}
          onLeave={() => {
            restoreSelection(selectedStreams);
            setFocusedSlug(resolvedFocusedSlug ?? "");
            setDisplayLogs(displayLogs);
            room.leave();
          }} />}
        category={category}
        categories={hostCategories}
        displayLogs={displayLogs}
        isLoadingStreams={allStreams === null}
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
      />
      {selectedStreams.length > 0 ? (
        <Multiscreen
          containerRef={multiscreenRef}
          host={HOST}
          streams={selectedStreams}
          displayLogs={displayLogs}
          logDelayMs={logDelayMs}
          focusedSlug={resolvedFocusedSlug}
          logRefreshSlug={logRefreshSlug}
          logRefreshRequestId={logRefreshRequestId}
          muteToggleSlug={muteToggleSlug}
          muteToggleRequestId={muteToggleRequestId}
          onRefreshStream={handleRefreshStream}
          onRemove={handleRemove}
          onFocus={(slug) => {
            if (roomId !== null) void sendRoomAction({ type: "focus", slug });
            else setFocusedSlug(slug);
          }}
        />
      ) : null}
    </main>
  );
}
