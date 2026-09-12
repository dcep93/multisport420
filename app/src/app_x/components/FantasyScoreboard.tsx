import Scoreboard, { type ScoreboardProps } from "../scoreboard/Scoreboard";

export default function FantasyScoreboard(props: ScoreboardProps & {
  indexedTitle: string;
  className: string;
  onClick?: () => void;
}) {
  return <div className={props.className}>
    {props.onClick && <button type="button" className="screen-focus-overlay"
      aria-label={`Focus screen ${props.indexedTitle}`} onClick={props.onClick} />}
    <div className="native-scoreboard-container">
      <Scoreboard onRefreshReady={props.onRefreshReady}
        refreshRequestId={props.refreshRequestId} shouldRefresh={props.shouldRefresh} />
    </div>
  </div>;
}
