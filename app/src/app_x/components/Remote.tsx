import { useEffect, useState } from "react";
import useRoom from "../hooks/useRoom";
import type { RoomAction } from "../lib/roomState";

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
          <p>Tap a stream to spotlight it.<br />Tap the spotlight again to mute or unmute.</p>
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
        <div className="remote-bubbles" aria-label="Streams" aria-busy={room.status === "connecting"}>
          {streams.map((stream, index) => {
            const active = stream.slug === focused;
            return (
              <button key={stream.slug} type="button"
                className={`remote-bubble ${active ? "is-active" : ""}`}
                aria-pressed={active} disabled={!ready || pending}
                aria-label={active ? `Toggle mute for ${stream.title}` : `Spotlight ${stream.title}`}
                onClick={() => void send({ type: "select", slug: stream.slug },
                  active ? "Mute toggle sent" : `Spotlighting ${stream.title}`)}>
                <span className="remote-number">{index + 1}</span>
                <span className="remote-stream-name">{stream.title}</span>
                <span className="remote-bubble-caption">{active ? "Spotlight · mute / unmute" : "Tap to spotlight"}</span>
              </button>
            );
          })}
        </div>
        <div className="remote-footer">
          <button className="remote-refresh" type="button"
            disabled={!ready || !focused || !room.room?.displayLogs || pending}
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
