import { useEffect, useState } from "react";
import useRoom from "../hooks/useRoom";
import { presentationOf, type RoomAction } from "../lib/roomState";
import { VIEWING_LAYOUTS, type ViewingLayout } from "../lib/viewingLayouts";
import { isFantasyScoreboard } from "../lib/fantasyScoreboard";

export default function Remote({ roomId }: { roomId: string }) {
  const room = useRoom();
  const { connect, leave } = room;
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    void connect(roomId);
    return leave;
  }, [connect, leave, roomId]);

  const streams = room.room?.streams ?? [];
  const focused = room.room?.focusedSlug;
  const viewing = presentationOf(room.room ?? { streams: [], focusedSlug: "", displayLogs: true, command: null });
  const dual = viewing.layout === "dual";
  const audible = viewing.audioMuted ? "" : viewing.audioSlug;
  const audioStream = streams.find((stream) => stream.slug === audible);
  const online = room.status === "connected";
  const ready = online && room.viewerCount > 0;
  const status = room.status === "connecting" ? "Connecting…"
    : !online ? "Disconnected" : room.viewerCount ? "Viewer connected" : "Waiting for viewer";

  async function send(action: RoomAction, message: string) {
    setPending(true);
    setFeedback("");
    if (await room.send(action)) setFeedback(message);
    setPending(false);
  }

  return (
    <main className="remote-shell">
      <div className="remote-content">
        <header className="remote-header">
          <a className="remote-brand" href="/">multisport420</a>
          <span className={`room-status ${ready ? "is-online" : ""}`}>{status}</span>
        </header>
        <div className="remote-title">
          <p className="remote-eyebrow">PHONE REMOTE</p>
          <h1>{roomId || "Default room"}</h1>
          <p>{dual ? "Choose a side with the arrows. Tap 🔊 to listen." : "Tap to spotlight. Tap again to mute."}</p>
        </div>
        {room.status === "error" || room.status === "offline" ? (
          <div className="remote-notice">
            <p>{room.error || "Connection lost. Controls will return when you reconnect."}</p>
            <button type="button" onClick={() => void connect(roomId)}>Reconnect</button>
          </div>
        ) : !ready && room.status !== "connecting" ? (
          <div className="remote-notice">
            <p>Open multisport420 on your viewing screen and join <strong>{roomId || "the default room"}</strong>.</p>
            <span>Your controls will appear here automatically.</span>
          </div>
        ) : null}
        {online && room.viewerCount > 0 && streams.length === 0 && (
          <div className="remote-notice"><p>No streams yet.</p><span>Add a stream on your viewing screen to get started.</span></div>
        )}
        <fieldset className="remote-settings" disabled={!ready || pending}>
          <legend>Viewing controls</legend>
          <label className="remote-layout-label">Layout
            <select value={viewing.layout} onChange={(event) => void send({ type: "layout", layout: event.target.value as ViewingLayout }, "Layout updated")}>
              {VIEWING_LAYOUTS.map((layout) => <option key={layout.id} value={layout.id}>{layout.label}</option>)}
            </select>
          </label>
          <p className="remote-audio-status" role="status">{audioStream ? `🔊 ${audioStream.title}` : "🔇 Muted"}</p>
          <button type="button" className="remote-refresh" disabled={!viewing.audioSlug}
            onClick={() => void send({ type: "audio-muted", value: !viewing.audioMuted }, viewing.audioMuted ? "Unmuted" : "Muted")}>
            {viewing.audioMuted ? "Unmute" : "Mute all"}
          </button>
          <div className="remote-setting-toggles">
            <label><input type="checkbox" checked={viewing.showStreamSelector}
              onChange={(event) => void send({ type: "stream-selector", value: event.target.checked }, "Stream selector updated")} /> Show stream selector</label>
            <label><input type="checkbox" checked={room.room?.displayLogs !== false}
              onChange={(event) => void send({ type: "display-logs", value: event.target.checked }, "Log preference updated")} /> Spotlight logs</label>
          </div>
        </fieldset>
        {dual && <section className="remote-dual" aria-label="Dual spotlight">
          {(["left", "right"] as const).map((side) => {
            const stream = streams.find((stream) => stream.slug === viewing[side === "left" ? "leftSlug" : "rightSlug"]);
            const hasSound = Boolean(stream && stream.slug === audible);
            return <div key={side} className={`remote-side ${hasSound ? "has-sound" : ""}`}>
              <h2>{side === "left" ? "Left" : "Right"}</h2>
              <p>{stream?.title ?? "Add another stream"}</p>
              <button type="button" aria-label={`Sound on ${side}`} title={`Listen to ${side}`} aria-pressed={hasSound} disabled={!ready || pending || !stream || isFantasyScoreboard(stream)}
                onClick={() => stream && void send({ type: "audio", slug: stream.slug }, `🔊 ${stream.title}`)}><span aria-hidden="true">{hasSound ? "🔊" : "🔇"}</span></button>
            </div>;
          })}
          <button className="remote-swap" type="button" disabled={!ready || pending || !viewing.rightSlug}
            onClick={() => void send({ type: "swap-sides" }, "Left and right swapped")}>⇄ Swap sides</button>
        </section>}
        <div className="remote-bubbles" aria-label="Streams" aria-busy={room.status === "connecting"}>
          {streams.map((stream, index) => {
            const active = stream.slug === (dual ? audible : focused);
            const side = stream.slug === viewing.leftSlug ? "Left" : stream.slug === viewing.rightSlug ? "Right" : "Preview";
            return (
              <div key={stream.slug} className="remote-stream-card">
              <button type="button"
                className={`remote-bubble ${active ? "is-active" : ""}`}
                aria-pressed={active}
                aria-label={dual ? `Sound on ${stream.title}` : active ? `Toggle mute for ${stream.title}` : `Spotlight ${stream.title}`}
                disabled={!ready || pending || (dual && isFantasyScoreboard(stream))}
                onClick={() => void send({ type: dual ? "audio" : "select", slug: stream.slug },
                  dual ? `🔊 ${stream.title}` : active ? "Mute toggled" : `Spotlighting ${stream.title}`)}>
                <span className="remote-number">{index + 1}</span>
                <span className="remote-stream-name">{stream.title}</span>
                <span className="remote-bubble-caption">{dual ? `${side} · ${stream.slug === audible ? "🔊" : "🔇"}` : active ? "Spotlight" : ""}</span>
              </button>
              {dual && <div className="remote-promote">
                {(["left", "right"] as const).map((target) => <button key={target} type="button"
                  aria-label={`Promote ${stream.title} to ${target}`}
                  disabled={!ready || pending || stream.slug === viewing[target === "left" ? "leftSlug" : "rightSlug"]}
                  onClick={() => void send({ type: "promote", side: target, slug: stream.slug }, `${stream.title} moved to ${target}`)}>
                  {target === "left" ? "← Left" : "Right →"}
                </button>)}
              </div>}
              </div>
            );
          })}
        </div>
        <div className="remote-footer">
          <button className="remote-refresh" type="button"
            disabled={!ready || !focused || !room.room?.displayLogs || viewing.layout !== "spotlight" || pending}
            onClick={() => void send({ type: "refresh-log" }, "Log refresh sent")}>
            <span aria-hidden="true">↻</span> Refresh spotlight log
          </button>
          {ready && room.room?.displayLogs === false && <p className="room-hint">Enable logs on your viewing screen to refresh them.</p>}
          <p className="remote-feedback" role="status">{room.error || feedback || (pending ? "Sending…" : "")}</p>
        </div>
      </div>
    </main>
  );
}
