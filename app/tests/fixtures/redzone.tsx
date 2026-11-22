/* eslint-disable react-refresh/only-export-components */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import Multiscreen from "../../src/app_x/components/Multiscreen";
import type { ViewingLayout } from "../../src/app_x/lib/viewingLayouts";
import "../../src/index.css";
import "../../src/app_x/styles/multisport.css";
const streams = [{ title: "NFL RedZone", slug: "nfl-redzone", category: "NFL", espn_id: 999, raw_url: "fixture" },
  { title: "Other channel", slug: "other", category: "fixture", espn_id: -1, raw_url: "fixture" }];
const host = { getLeagueCategories: () => ["NFL"], getStreams: async () => streams, getIframeParams: async () => ({}),
  getIframeDocStrElement: () => <html><body style={{ background: "#18212a", color: "white", fontFamily: "sans-serif" }}>Fixture video</body></html> };
function Fixture() {
  const [focus, setFocus] = useState("nfl-redzone"), [logs, setLogs] = useState(true), [layout, setLayout] = useState<ViewingLayout>("spotlight");
  const [refresh, setRefresh] = useState(0), [target, setTarget] = useState("nfl-redzone");
  return <div className="multisport-shell" style={{ height: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
    <div><button onClick={() => setLogs(value => !value)}>Toggle logs</button>
      <button onClick={() => setLayout(value => value === "spotlight" ? "grid" : "spotlight")}>Toggle layout</button>
      <button onClick={() => { setTarget("nfl-redzone"); setRefresh(value => value + 1); }}>Refresh RedZone</button>
      <button onClick={() => { setTarget("other"); setRefresh(value => value + 1); }}>Refresh other</button>
      <span> Log delay: 60000ms</span></div>
    <Multiscreen host={host} streams={streams} layout={layout} displayLogs={logs} logDelayMs={60_000} focusedSlug={focus}
      logRefreshSlug={target} logRefreshRequestId={refresh} muteToggleRequestId={0} onRefreshStream={async () => null}
      onRemove={() => {}} onFocus={setFocus} />
  </div>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
