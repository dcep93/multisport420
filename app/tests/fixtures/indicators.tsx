/* eslint-disable react-refresh/only-export-components */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import Multiscreen from "../../src/app_x/components/Multiscreen";
import ScreenTitleBar from "../../src/app_x/components/ScreenTitleBar";
import "../../src/index.css";
import "../../src/app_x/styles/multisport.css";
const streams = ["New England Patriots @ Seattle Seahawks", "Minnesota Vikings @ Green Bay Packers", "Las Vegas Raiders @ Miami Dolphins", "Philadelphia Eagles @ New York Giants"].map((title, index) => ({ title, category: "NFL", espn_id: index + 1, slug: String(index), raw_url: "fixture" }));
window.fetch = async (input) => {
  const url = String(input), id = Number(new URL(url).searchParams.get("event"));
  const summary = { header: { competitions: [{ status: { type: { state: "in" } }, competitors: [{ homeAway: "away", team: { id: "1", shortDisplayName: "Away" } }, { homeAway: "home", team: { id: "2", shortDisplayName: "Home" } }] }] },
    boxscore: { teams: ["Away", "Home"].map(name => ({ team: { name }, statistics: [{ name: "possessionTime", displayValue: "24:45" }, { name: "totalYards", displayValue: "232" }, { name: "totalOffensivePlays", displayValue: "45" }] })),
      players: [{ statistics: [{ name: "receiving", labels: ["REC", "YDS", "AVG", "TD", "LONG", "TGTS"], athletes: [
        { athlete: { displayName: "Travis Kelce" }, stats: ["7", "104", "14.9", "1", "32", "10"] },
        { athlete: { displayName: "Courtland Sutton" }, stats: ["5", "82", "16.4", "1", "35", "8"] },
      ] }] }] },
    drives: { current: { id: "d1", team: { id: "1", shortDisplayName: "Away" }, description: "Fixture drive", plays: [{ id: "p1", text: "Pass for 30 yards", statYardage: 30, participants: [], wallclock: "2026-09-13T17:00:00Z", period: { number: 1 }, clock: { displayValue: "12:00" }, end: { team: { id: id % 2 ? "1" : "2" }, yardsToEndzone: id % 2 ? 15 : 50 } }] } } };
  return new Response(JSON.stringify(url.includes("/summary?") ? summary : { items: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
};
const host = { getLeagueCategories: () => ["NFL"], getStreams: async () => streams, getIframeParams: async () => ({}), getIframeDocStrElement: () => <html><body style={{ background: "#18212a", color: "white", fontFamily: "sans-serif" }}>Fixture video</body></html> };
function Fixture() {
  const [focus, setFocus] = useState("0"), [logs, setLogs] = useState(true);
  return <div className="multisport-shell" style={{ height: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 12 }}>
    <div><button onClick={() => setLogs(value => !value)}>Toggle logs</button><span> Deterministic fixture: maroon takes priority</span></div>
    <div style={{ width: 300 }}><ScreenTitleBar className="" label="Long title verification: New England Patriots @ Seattle Seahawks — every word remains reachable" redZone bigPlay possession={{ team: "Away", isHomeTeam: false }} onRefresh={async () => {}} /></div>
    <div style={{ width: 600 }}><ScreenTitleBar className="" label="Denver Broncos @ Kansas City Chiefs" screenNumber={1} bigPlay /></div>
    <Multiscreen host={host} streams={streams} displayLogs={logs} logDelayMs={0} focusedSlug={focus} logRefreshRequestId={0} muteToggleRequestId={0} onRefreshStream={async () => null} onRemove={() => {}} onFocus={setFocus} />
  </div>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
