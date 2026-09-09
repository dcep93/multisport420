import "./styles/multisport.css";
import "./styles/remote.css";
import { lazy, Suspense } from "react";

const MultisportApp = lazy(() => import("./components/MultisportApp"));
const Remote = lazy(() => import("./components/Remote"));

export default function AppX() {
  const match = window.location.pathname.match(/^\/remote(?:\/([^/]*))?\/?$/);
  let roomId = "";
  try { roomId = decodeURIComponent(match?.[1] ?? ""); } catch { roomId = match?.[1] ?? ""; }
  return (
    <Suspense fallback={<main className="remote-shell" role="status">Loading…</main>}>
      {match ? <Remote roomId={roomId} /> : <MultisportApp />}
    </Suspense>
  );
}
