import { useCallback, useEffect, useRef } from "react";
import { FANTASY_SCOREBOARD_URL, refreshFantasyScoreboard, startFantasyScoreboardRefresh } from "../lib/fantasyScoreboard";

export default function FantasyScoreboard(props: {
  indexedTitle: string;
  className: string;
  onClick?: () => void;
  onRefreshReady: (refresh: () => Promise<void>) => void;
  refreshRequestId: number;
  shouldRefresh: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const lastRefreshRequest = useRef(props.refreshRequestId);
  const refresh = useCallback(async () => { refreshFantasyScoreboard(frame.current?.contentWindow); }, []);

  useEffect(() => {
    props.onRefreshReady(refresh);
  }, [props.onRefreshReady, refresh]);

  useEffect(() => startFantasyScoreboardRefresh(() => frame.current?.contentWindow), []);

  useEffect(() => {
    if (lastRefreshRequest.current === props.refreshRequestId) return;
    lastRefreshRequest.current = props.refreshRequestId;
    if (props.shouldRefresh) void refresh();
  }, [props.refreshRequestId, props.shouldRefresh, refresh]);

  return <div className={props.className}>
    {props.onClick && <button type="button" className="screen-focus-overlay"
      aria-label={`Focus screen ${props.indexedTitle}`} onClick={props.onClick} />}
    <iframe ref={frame} className="screen-iframe" title={props.indexedTitle}
      src={FANTASY_SCOREBOARD_URL} loading="eager" />
  </div>;
}
