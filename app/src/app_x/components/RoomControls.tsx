import { useState } from "react";
import { remotePath } from "../lib/roomState";
import type useRoom from "../hooks/useRoom";

export default function RoomControls({ room, onJoin, onLeave, disabled }: {
  room: ReturnType<typeof useRoom>;
  onJoin: (roomId: string) => void;
  onLeave: () => void;
  disabled: boolean;
}) {
  const [input, setInput] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const joined = room.roomId !== null && room.room !== null;
  const path = remotePath(room.roomId ?? "");

  async function copyLink() {
    try {
      const url = new URL(path, window.location.origin).href;
      if (navigator.share) {
        await navigator.share({ title: "multisport420 remote", url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopyStatus("Link copied");
      }
    } catch {
      setCopyStatus("Open remote to copy its address.");
    }
  }

  return (
    <section className="room-card" aria-labelledby="room-heading">
      <div className="room-card-heading">
        <h3 id="room-heading">Phone remote</h3>
        {joined && <span className={`room-status ${room.status === "connected" ? "is-online" : ""}`}>
          {room.status === "connected" ? "Live" : "Disconnected"}
        </span>}
      </div>
      <form onSubmit={(event) => {
        event.preventDefault();
        setCopyStatus("");
        onJoin(input);
      }}>
        <div className="room-input-row">
          <input id="room-id" aria-label="Room ID (optional)" value={input} maxLength={120} autoComplete="off"
            autoCapitalize="none" spellCheck={false} placeholder="Room ID (optional)"
            onChange={(event) => setInput(event.target.value)} />
          <button type="submit" disabled={disabled || room.status === "connecting"}>
            {room.status === "connecting" ? "Joining…" : "Join"}
          </button>
        </div>
      </form>
      {joined && <>
        <p className="room-current">{room.roomId || "Default room"}</p>
        <div className="room-links">
          <a href={path} target="_blank" rel="noreferrer">Open remote ↗</a>
          <button type="button" onClick={() => void copyLink()}>Share link</button>
          <button type="button" onClick={onLeave}>Leave</button>
        </div>
      </>}
      <p className="room-feedback" role="status">{room.error || copyStatus}</p>
    </section>
  );
}
