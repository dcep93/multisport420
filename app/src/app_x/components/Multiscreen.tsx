import { useCallback, useEffect, useState, type CSSProperties, type Ref } from "react";
import ReactDomServer from "react-dom/server";
import type { Host, Stream, StreamSlug } from "../config/types";
import StreamLog from "../lib/renderLog";
import { useStreamLog } from "../hooks/useStreamLog";
import { useScreenMuted } from "../hooks/useScreenMuted";
import ScreenTitleBar from "./ScreenTitleBar";
import { isFantasyScoreboard } from "../lib/fantasyScoreboard";
import FantasyScoreboard from "./FantasyScoreboard";

export default function Multiscreen<T>(props: {
  containerRef?: Ref<HTMLElement>;
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
  const { containerRef, displayLogs, focusedSlug, host, onFocus, onRemove, streams } = props;
  const focusedStream =
    streams.find((stream) => stream.slug === focusedSlug) ?? streams[0];
  const secondaryCount = Math.max(1, streams.length - 1);

  return (
    <section ref={containerRef} className="multiscreen-column">
      <div
        className={streams.length === 1 ? "screen-layout screen-layout-solo" : "screen-layout"}
        style={
          {
            "--screen-columns": secondaryCount,
          } as CSSProperties
        }
      >
        {streams.map((stream, index) => (
          <ScreenCard
            key={stream.slug}
            host={host}
            stream={stream}
            streamIndex={index}
            displayLogs={displayLogs}
            logDelayMs={props.logDelayMs}
            isFocused={stream.slug === focusedStream?.slug}
            shouldRefreshLog={stream.slug === props.logRefreshSlug}
            logRefreshRequestId={props.logRefreshRequestId}
            shouldToggleMute={stream.slug === props.muteToggleSlug}
            muteToggleRequestId={props.muteToggleRequestId}
            isSolo={streams.length === 1}
            onRefreshStream={props.onRefreshStream}
            onFocus={() => onFocus(stream.slug)}
            onRemove={() => onRemove(stream.slug)}
          />
        ))}
      </div>
    </section>
  );
}

function ScreenCard<T>(props: {
  host: Host<T>;
  stream: Stream;
  streamIndex: number;
  displayLogs: boolean;
  logDelayMs: number;
  isFocused: boolean;
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
      className={[
        "screen-card",
        props.isFocused ? "screen-card-spotlight is-focused" : "screen-card-secondary",
        props.isFocused && props.isSolo ? "screen-card-spotlight-solo" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ScreenTitleBar
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
          indexedTitle={indexedTitle}
          className={`screen-focus ${props.isFocused ? "screen-focus-spotlight" : "screen-focus-secondary"}`}
          onClick={props.isFocused ? undefined : props.onFocus}
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
          isFocused={props.isFocused}
          shouldToggleMute={props.shouldToggleMute}
          muteToggleRequestId={props.muteToggleRequestId}
          onRefreshStream={props.onRefreshStream}
          stream={props.stream}
          onRefreshButtonStateChange={setIsRefreshing}
          onRefreshReady={handleRefreshReady}
          onClick={props.isFocused ? undefined : props.onFocus}
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
  isFocused: boolean;
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
    isFocused,
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
  const [iframeElement, setIframeElement] = useState<HTMLIFrameElement | null>(null);
  const isMuted = useScreenMuted(isFocused, shouldToggleMute, muteToggleRequestId);
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
        onRefreshButtonStateChange?.(false);
      })
      .catch((error) => {
        console.error(error);
        if (!isActive) return;
        setSrcDoc("");
        const nextErrorMessage = getStreamContentErrorMessage(error);
        setErrorMessage(nextErrorMessage);
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

  useEffect(() => {
    if (!iframeElement) {
      return;
    }

    iframeElement.contentWindow?.postMessage(
      {
        source: "multisport420-app",
        type: "multisport420:set-muted",
        muted: isMuted,
      },
      "*",
    );
  }, [iframeElement, isMuted]);

  return (
    <div className={className}>
      {onClick ? (
        <button
          type="button"
          className="screen-focus-overlay"
          aria-label={`Focus screen ${indexedTitle}`}
          onClick={onClick}
        />
      ) : null}
      {errorMessage ? (
        <pre className="screen-content-error" role="alert">
          {errorMessage}
        </pre>
      ) : (
      <iframe
          key={`${resolvedStream.slug}-${resolvedStream.raw_url}-${refreshRequestId}`}
          className="screen-iframe"
          title={indexedTitle}
          srcDoc={srcDoc}
          loading="eager"
          referrerPolicy="no-referrer"
          ref={setIframeElement}
          onLoad={(event) => event.currentTarget.contentWindow?.postMessage({
            source: "multisport420-app",
            type: "multisport420:set-muted",
            muted: isMuted,
          }, "*")}
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
