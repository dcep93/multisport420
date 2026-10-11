import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties, type Ref } from "react";
import ReactDomServer from "react-dom/server";
import type { Host, Stream, StreamSlug } from "../config/types";
import StreamLog from "../lib/renderLog";
import { useStreamLog } from "../hooks/useStreamLog";
import { useScreenMuted } from "../hooks/useScreenMuted";
import ScreenTitleBar from "./ScreenTitleBar";
import { isFantasyScoreboard } from "../lib/fantasyScoreboard";
import FantasyScoreboard from "./FantasyScoreboard";
import StreamProviderAccess from "./StreamProviderAccess";
import { StreamProviderBlockedError } from "../lib/streamProviderAccess";
import { arrangeScreens, type ViewingLayout } from "../lib/viewingLayouts";
import type { Presentation, RoomAction } from "../lib/roomState";

export default function Multiscreen<T>(props: {
  containerRef?: Ref<HTMLElement>;
  layout?: ViewingLayout;
  showStreamSelector?: boolean;
  presentation?: Presentation;
  onPresentationAction?: (action: RoomAction) => void;
  host: Host<T>;
  streams: Stream[];
  displayLogs: boolean;
  logDelayMs: number;
  focusedSlug?: StreamSlug;
  logRefreshSlug?: StreamSlug;
  logRefreshRequestId: number;
  muteToggleSlug?: StreamSlug;
  muteToggleRequestId: number;
  onRefreshStream: (streamSlug: StreamSlug) => Promise<Stream | null>;
  onRemove: (streamSlug: StreamSlug) => void;
  onFocus: (streamSlug: StreamSlug) => void;
}) {
  const { containerRef, focusedSlug, host, onFocus, onRemove, streams, layout = "spotlight" } = props;
  const displayLogs = props.displayLogs && layout === "spotlight";
  const focusedStream =
    streams.find((stream) => stream.slug === focusedSlug) ?? streams[0];
  const [lastAudioSlug, setLastAudioSlug] = useState<StreamSlug>();
  // The scoreboard changes the layout without taking audio from the last video.
  const audioStream = focusedStream && !isFantasyScoreboard(focusedStream)
    ? focusedStream
    : streams.find((stream) => stream.slug === lastAudioSlug && !isFantasyScoreboard(stream));
  const audioSlug = props.presentation?.audioSlug ?? audioStream?.slug;
  if (lastAudioSlug !== audioSlug) setLastAudioSlug(audioSlug);
  const [pair, setPair] = useState({ primary: focusedStream?.slug, companion: streams.find((stream) => stream !== focusedStream)?.slug });
  let companionSlug = pair.companion;
  if (pair.primary !== focusedStream?.slug) {
    companionSlug = pair.primary;
    setPair({ primary: focusedStream?.slug, companion: companionSlug });
  }
  const companion = streams.find((stream) => stream.slug === companionSlug && stream !== focusedStream)
    ?? streams.find((stream) => stream !== focusedStream);
  const left = streams.find((stream) => stream.slug === props.presentation?.leftSlug) ?? focusedStream;
  const right = streams.find((stream) => stream.slug === props.presentation?.rightSlug && stream !== left) ?? companion;
  const fixedOrder = ["grid", "columns", "stack"].includes(layout);
  const main = layout === "dual" ? left : focusedStream;
  const ordered = fixedOrder ? streams : [main, ...(layout === "dual" && right ? [right] : []),
    ...streams.filter((stream) => stream !== main && (layout !== "dual" || stream !== right))];
  const arrangement = arrangeScreens(layout, streams.length);
  // Move grid cells with CSS, not iframe DOM nodes: moving an iframe reloads it.
  const [mountOrder, setMountOrder] = useState(() => streams.map((stream) => stream.slug));
  const stableOrder = [...mountOrder.filter((slug) => streams.some((stream) => stream.slug === slug)),
    ...streams.filter((stream) => !mountOrder.includes(stream.slug)).map((stream) => stream.slug)];
  if (stableOrder.length !== mountOrder.length || stableOrder.some((slug, index) => slug !== mountOrder[index])) setMountOrder(stableOrder);

  return (
    <section ref={containerRef} className="multiscreen-column">
      <div
        className={`screen-layout screen-layout-${layout}${streams.length === 1 ? " screen-layout-solo" : ""}`}
        style={arrangement.grid}
      >
        {stableOrder.map((slug) => {
          const index = streams.findIndex((stream) => stream.slug === slug);
          const stream = streams[index];
          return (
          <ScreenCard
            key={stream.slug}
            host={host}
            stream={stream}
            streamIndex={index}
            placement={arrangement.cells[ordered.indexOf(stream)]}
            isProminent={layout === "dual" ? stream === left || stream === right : ordered.indexOf(stream) < (layout === "triple" ? 3 : layout === "quad" ? 4 : 1)}
            dualSide={layout === "dual" ? stream === left ? "Left" : stream === right ? "Right" : "Preview" : undefined}
            onPresentationAction={props.onPresentationAction}
            audioMuted={props.presentation?.audioMuted}
            showStreamSelector={props.showStreamSelector ?? false}
            displayLogs={displayLogs}
            logDelayMs={props.logDelayMs}
            isFocused={stream.slug === focusedStream?.slug}
            isAudioFocused={stream.slug === audioSlug}
            shouldRefreshLog={stream.slug === props.logRefreshSlug}
            logRefreshRequestId={props.logRefreshRequestId}
            shouldToggleMute={stream.slug === props.muteToggleSlug}
            muteToggleRequestId={props.muteToggleRequestId}
            isSolo={streams.length === 1}
            onRefreshStream={props.onRefreshStream}
            onFocus={() => onFocus(stream.slug)}
            onRemove={() => onRemove(stream.slug)}
          />
        ); })}
      </div>
    </section>
  );
}

function ScreenCard<T>(props: {
  host: Host<T>;
  stream: Stream;
  streamIndex: number;
  placement: CSSProperties;
  isProminent: boolean;
  dualSide?: "Left" | "Right" | "Preview";
  audioMuted?: boolean;
  onPresentationAction?: (action: RoomAction) => void;
  showStreamSelector: boolean;
  displayLogs: boolean;
  logDelayMs: number;
  isFocused: boolean;
  isAudioFocused: boolean;
  shouldRefreshLog: boolean;
  logRefreshRequestId: number;
  shouldToggleMute: boolean;
  muteToggleRequestId: number;
  isSolo: boolean;
  onRefreshStream: (streamSlug: StreamSlug) => Promise<Stream | null>;
  onFocus: () => void;
  onRemove: () => void;
}) {
  const [titleTooltip, setTitleTooltip] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshScreen, setRefreshScreen] = useState<(() => Promise<void>) | null>(null);
  const handleRefreshReady = useCallback((refresh: () => Promise<void>) => {
    setRefreshScreen(() => refresh);
  }, []);
  const indexedTitle = formatIndexedStreamTitle(props.stream.title, props.streamIndex);
  const isScoreboard = isFantasyScoreboard(props.stream);
  const log = useStreamLog(props.stream, props.logDelayMs,
    props.shouldRefreshLog ? props.logRefreshRequestId : 0);
  const screenBodyClassName = [
    "screen-spotlight-body",
    props.isFocused && props.displayLogs && !isScoreboard ? "" : "screen-spotlight-body-no-log",
  ]
    .filter(Boolean)
    .join(" ");
  const showLogPanel = props.isFocused && props.displayLogs;

  return (
    <article
      style={props.placement}
      data-audio-focused={props.isAudioFocused}
      data-prominent={props.isProminent}
      data-dual-side={props.dualSide}
      data-audible={props.isAudioFocused && !props.audioMuted}
      className={[
        "screen-card",
        props.isFocused ? "screen-card-spotlight is-focused" : "screen-card-secondary",
        props.isFocused && props.isSolo ? "screen-card-spotlight-solo" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ScreenTitleBar
        controls={props.dualSide && (props.dualSide !== "Preview" || props.isAudioFocused) && <span className="dual-title-controls" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="dual-audio-button"
            disabled={isScoreboard || !props.onPresentationAction}
            title={isScoreboard ? "No audio" : props.isAudioFocused && !props.audioMuted ? `Mute ${props.dualSide.toLowerCase()}` : `Listen to ${props.dualSide.toLowerCase()}`}
            aria-label={isScoreboard ? `${props.dualSide} scoreboard has no audio` : props.isAudioFocused && !props.audioMuted ? `Mute ${props.dualSide.toLowerCase()} sound` : `Sound on ${props.dualSide.toLowerCase()}: ${props.stream.title}`}
            aria-pressed={props.isAudioFocused && !props.audioMuted}
            onClick={() => props.onPresentationAction?.(props.isAudioFocused && !props.audioMuted
              ? { type: "audio-muted", value: true } : { type: "audio", slug: props.stream.slug })}>
            <span aria-hidden="true">{props.isAudioFocused && !props.audioMuted ? "🔊" : "🔇"}</span>
          </button>
        </span>}
        className={[
          "spotlight-title-bar",
          props.isFocused ? "" : "spotlight-title-bar-secondary",
        ]
          .filter(Boolean)
          .join(" ")}
        label={props.stream.title}
        screenNumber={props.streamIndex + 1}
        possession={log.displayedLog?.possession}
        redZone={log.displayedLog?.redZone}
        bigPlay={log.bigPlay}
        latestBigPlayClock={props.isFocused ? log.latestBigPlayClock : undefined}
        onRefresh={refreshScreen ?? undefined}
        onClose={props.onRemove}
        refreshDisabled={!refreshScreen || isRefreshing}
        title={titleTooltip}
      />
      <div className={screenBodyClassName}>
        {props.displayLogs && !isScoreboard ? (
          <div
            className={[
              "log-panel",
              "log-panel-spotlight",
              showLogPanel ? "" : "log-panel-hidden",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden={!showLogPanel}
          >
            <div className="log-entry">
              <StreamLog stream={props.stream} displayedLog={log.displayedLog}
                errorMessage={log.errorMessage} refresh={log.refresh} />
            </div>
          </div>
        ) : null}
        {isScoreboard ? <FantasyScoreboard
          spotlight={props.isProminent}
          indexedTitle={indexedTitle}
          className={`screen-focus ${props.isFocused ? "screen-focus-spotlight" : "screen-focus-secondary"}`}
          onClick={props.isFocused && props.dualSide !== "Preview" ? undefined : props.onFocus}
          onRefreshReady={handleRefreshReady}
          refreshRequestId={props.logRefreshRequestId}
          shouldRefresh={props.shouldRefreshLog}
        /> : <ScreenContent
          host={props.host}
          indexedTitle={indexedTitle}
          className={[
            "screen-focus",
            props.isFocused ? "screen-focus-spotlight" : "screen-focus-secondary",
          ].join(" ")}
          isAudioFocused={props.isAudioFocused}
          controlledMuted={props.audioMuted === undefined ? undefined : !props.isAudioFocused || props.audioMuted}
          showStreamSelector={props.showStreamSelector}
          shouldToggleMute={props.shouldToggleMute}
          muteToggleRequestId={props.muteToggleRequestId}
          onRefreshStream={props.onRefreshStream}
          stream={props.stream}
          onRefreshButtonStateChange={setIsRefreshing}
          onRefreshReady={handleRefreshReady}
          onClick={props.isFocused && props.dualSide !== "Preview" ? undefined : props.onFocus}
          onDebugTitleChange={setTitleTooltip}
        />}
      </div>
    </article>
  );
}

function ScreenContent<T>(props: {
  host: Host<T>;
  stream: Stream;
  indexedTitle: string;
  className: string;
  isAudioFocused: boolean;
  controlledMuted?: boolean;
  showStreamSelector: boolean;
  shouldToggleMute: boolean;
  muteToggleRequestId: number;
  onRefreshStream: (streamSlug: StreamSlug) => Promise<Stream | null>;
  onRefreshReady?: (refresh: () => Promise<void>) => void;
  onRefreshButtonStateChange?: (isRefreshing: boolean) => void;
  onClick?: () => void;
  onDebugTitleChange?: (value: string) => void;
}) {
  const {
    className,
    host,
    indexedTitle,
    isAudioFocused,
    muteToggleRequestId,
    onClick,
    onDebugTitleChange,
    onRefreshStream,
    onRefreshButtonStateChange,
    onRefreshReady,
    shouldToggleMute,
    stream,
  } = props;
  const [srcDoc, setSrcDoc] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [accessError, setAccessError] = useState<StreamProviderBlockedError | null>(null);
  const [iframeElement, setIframeElement] = useState<HTMLIFrameElement | null>(null);
  const localMuted = useScreenMuted(isAudioFocused, shouldToggleMute, muteToggleRequestId);
  const isMuted = props.controlledMuted ?? localMuted;
  const [refreshRequestId, setRefreshRequestId] = useState(0);
  const [refreshOverride, setRefreshOverride] = useState<{
    sourceStreamKey: string;
    stream: Stream;
  } | null>(null);
  const streamKey = getStreamKey(stream);
  const resolvedStream = refreshOverride?.sourceStreamKey === streamKey ? refreshOverride.stream : stream;

  useEffect(() => {
    onRefreshReady?.(async () => {
      onRefreshButtonStateChange?.(true);
      const nextStream =
        (await onRefreshStream(stream.slug).catch((error: unknown) => {
          console.error(error);
          return null;
        })) ?? stream;
      setRefreshOverride({
        sourceStreamKey: getStreamKey(stream),
        stream: nextStream,
      });
      setRefreshRequestId((currentValue) => currentValue + 1);
    });
  }, [onRefreshButtonStateChange, onRefreshReady, onRefreshStream, stream]);

  useEffect(() => {
    let isActive = true;
    const streamForRequest: Stream = {
      category: resolvedStream.category,
      espn_id: resolvedStream.espn_id,
      raw_url: resolvedStream.raw_url,
      slug: resolvedStream.slug,
      title: resolvedStream.title,
    };

    onDebugTitleChange?.("");
    onRefreshButtonStateChange?.(true);

    host
      .getIframeParams(streamForRequest, refreshRequestId > 0 ? { maxAgeMs: 0 } : undefined)
      .then((iframeParams) => {
        onDebugTitleChange?.(JSON.stringify(iframeParams, null, 2));

        return ReactDomServer.renderToStaticMarkup(host.getIframeDocStrElement(iframeParams));
      })
      .then((renderedSrcDoc) => {
        if (!isActive) return;
        setSrcDoc(renderedSrcDoc);
        setErrorMessage("");
        setAccessError(null);
        onRefreshButtonStateChange?.(false);
      })
      .catch((error) => {
        console.error(error);
        if (!isActive) return;
        setSrcDoc("");
        const nextErrorMessage = getStreamContentErrorMessage(error);
        setErrorMessage(nextErrorMessage);
        setAccessError(error instanceof StreamProviderBlockedError ? error : null);
        onDebugTitleChange?.(nextErrorMessage);
        onRefreshButtonStateChange?.(false);
      });

    return () => {
      isActive = false;
      onRefreshButtonStateChange?.(false);
    };
  }, [
    host,
    onDebugTitleChange,
    onRefreshButtonStateChange,
    refreshRequestId,
    resolvedStream.category,
    resolvedStream.espn_id,
    resolvedStream.raw_url,
    resolvedStream.slug,
    resolvedStream.title,
  ]);

  // Mute the previous player before any passive effect unmutes the next one,
  // independent of tile order or which layout is currently visible.
  useLayoutEffect(() => {
    if (isMuted) iframeElement?.contentWindow?.postMessage({
      source: "multisport420-app", type: "multisport420:set-muted", muted: true,
    }, "*");
  }, [iframeElement, isMuted]);
  useEffect(() => {
    if (!isMuted) iframeElement?.contentWindow?.postMessage({
      source: "multisport420-app", type: "multisport420:set-muted", muted: false,
    }, "*");
  }, [iframeElement, isMuted]);

  useEffect(() => {
    iframeElement?.contentWindow?.postMessage({
      source: "multisport420-app", type: "multisport420:set-stream-selector", visible: props.showStreamSelector,
    }, "*");
  }, [iframeElement, props.showStreamSelector]);

  return (
    <div className={className}>
      {onClick && !accessError ? (
        <button
          type="button"
          className="screen-focus-overlay"
          aria-label={`Focus screen ${indexedTitle}`}
          onClick={onClick}
        />
      ) : null}
      {errorMessage ? (
        <div className="screen-content-error" role="alert">
          <p>{errorMessage}</p>
          <StreamProviderAccess error={accessError} />
        </div>
      ) : (
      <iframe
          key={`${resolvedStream.slug}-${resolvedStream.raw_url}-${refreshRequestId}`}
          className="screen-iframe"
          title={indexedTitle}
          srcDoc={srcDoc}
          loading="eager"
          referrerPolicy="no-referrer"
          ref={setIframeElement}
          onLoad={(event) => {
            const player = event.currentTarget.contentWindow;
            player?.postMessage({ source: "multisport420-app", type: "multisport420:set-stream-selector", visible: props.showStreamSelector }, "*");
            player?.postMessage({ source: "multisport420-app", type: "multisport420:set-muted", muted: isMuted }, "*");
          }}
        />
      )}
    </div>
  );
}

function getStreamContentErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "Unable to load stream.";
}

function getStreamKey(stream: Stream) {
  return [
    stream.category,
    stream.espn_id,
    stream.raw_url,
    stream.slug,
    stream.title,
  ].join("\u0000");
}

function formatIndexedStreamTitle(title: string, index: number) {
  return `(${index + 1}) ${title}`;
}
