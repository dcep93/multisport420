/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Stream } from "../config/types";
import Autoscroller from "./Autoscroller";
import { fetchLeagueLog, leagueConfigs } from "./renderLog/leagues";
import type { LogType, WinProbabilityType } from "./renderLog/types";

const POLL_INTERVAL_MS = 10 * 1000;

export default function renderLog(
  stream: Stream,
  logDelayMs: number,
  refreshRequestId = 0,
): ReactNode {
  return (
    <StreamLog
      stream={stream}
      logDelayMs={logDelayMs}
      refreshRequestId={refreshRequestId}
    />
  );
}

function StreamLog(props: { stream: Stream; logDelayMs: number; refreshRequestId: number }) {
  const config = leagueConfigs[props.stream.category];
  const [displayedLog, setDisplayedLog] = useState<LogType | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const espnGameUrl = getEspnGameUrl(props.stream, config);
  const pendingTimeoutIdsRef = useRef<number[]>([]);
  const isMountedRef = useRef(false);

  const clearPendingLogTimeouts = useCallback(() => {
    for (const timeoutId of pendingTimeoutIdsRef.current) {
      window.clearTimeout(timeoutId);
    }

    pendingTimeoutIdsRef.current = [];
  }, []);

  const queueDelayedLogUpdate = useCallback((nextLog: LogType) => {
    const timeoutId = window.setTimeout(() => {
      pendingTimeoutIdsRef.current = pendingTimeoutIdsRef.current.filter(
        (pendingTimeoutId) => pendingTimeoutId !== timeoutId,
      );

      if (!isMountedRef.current) {
        return;
      }

      setDisplayedLog(nextLog);
    }, Math.max(0, props.logDelayMs));

    pendingTimeoutIdsRef.current.push(timeoutId);
  }, [props.logDelayMs]);

  const fetchAndHandleLog = useCallback((shouldRenderImmediately = false) => {
    if (!config || !hasEspnGame(props.stream)) {
      return Promise.resolve();
    }

    return fetchLeagueLog(props.stream, config)
      .then((nextLog) => {
        if (!isMountedRef.current || !nextLog) {
          return;
        }

        if (shouldRenderImmediately) {
          clearPendingLogTimeouts();
          setDisplayedLog(nextLog);
        } else {
          queueDelayedLogUpdate(nextLog);
        }

        setErrorMessage("");
      })
      .catch((error: unknown) => {
        console.error("multisport:fetchLog", error);

        if (!isMountedRef.current) {
          return;
        }

        setErrorMessage("Unable to load play-by-play.");
      });
  }, [clearPendingLogTimeouts, config, props.stream, queueDelayedLogUpdate]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      clearPendingLogTimeouts();
    };
  }, [clearPendingLogTimeouts]);

  useEffect(() => {
    if (!config || !hasEspnGame(props.stream)) {
      return;
    }

    void fetchAndHandleLog();
    const interval = window.setInterval(() => {
      void fetchAndHandleLog();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [config, fetchAndHandleLog, props.logDelayMs, props.stream]);

  useEffect(() => {
    if (props.refreshRequestId === 0) {
      return;
    }

    void fetchAndHandleLog(true);
  }, [fetchAndHandleLog, props.refreshRequestId]);

  if (!props.stream.espn_id || props.stream.espn_id < 0) {
    return <div className="multisport-log-empty">No ESPN game linked.</div>;
  }

  if (!config) {
    return <div className="multisport-log-empty">Play-by-play is not supported for this league yet.</div>;
  }

  if (!displayedLog) {
    return (
      <div
        className="multisport-log-empty multisport-log-empty-refreshable"
        role="button"
        tabIndex={0}
        onClick={() => {
          void fetchAndHandleLog(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.currentTarget.click();
          }
        }}
      >
        <LogActions espnGameUrl={espnGameUrl} />
        <div>{errorMessage || "Loading log..."}</div>
      </div>
    );
  }

  return (
    <LogView
      log={displayedLog}
      espnGameUrl={espnGameUrl}
      leagueCategory={props.stream.category}
      onClick={() => {
        void fetchAndHandleLog(true);
      }}
    />
  );
}

function hasEspnGame(stream: Stream) {
  return Boolean(stream.espn_id && stream.espn_id > 0);
}

function LogView(props: {
  log: LogType;
  espnGameUrl: string | null;
  leagueCategory: string;
  onClick: () => void;
}) {
  const playByPlay = useMemo(() => {
    const drives = [...(props.log.playByPlay || [])];
    if (drives.length > 1 && drives[0].description === drives[1].description) {
      drives.shift();
    }
    return drives;
  }, [props.log.playByPlay]);
  const scoringRuns = useMemo(
    () => getScoringRunLabels(playByPlay, props.leagueCategory),
    [playByPlay, props.leagueCategory],
  );

  return (
    <div
      className="multisport-log"
      role="button"
      tabIndex={0}
      onClick={props.onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onClick();
        }
      }}
    >
      <div className="multisport-log-content multisport-log-top">
        <div className="multisport-log-topbar">
          <span>{new Date(props.log.timestamp).toLocaleTimeString()}</span>
          <LogWinProbability winProbability={props.log.winProbability} />
          <LogActions espnGameUrl={props.espnGameUrl} />
        </div>
        <div className="multisport-log-team-summary-row">
          {props.log.teams.map((team) => (
            <div
              key={team.name}
              className={team.isHomeTeam ? "multisport-log-team-summary-card multisport-log-team-summary-card-home" : "multisport-log-team-summary-card"}
              title={JSON.stringify(team.statistics, null, 2)}
            >
              <div className="multisport-log-team-summary-name">{team.name}</div>
              <div className="multisport-log-team-summary-stats">
                {renderTeamStatistics(team.statistics)}
              </div>
            </div>
          ))}
        </div>
        {scoringRuns.length > 0 ? (
          <div className="multisport-log-scoring-run">
            {scoringRuns.map((scoringRun) => (
              <span key={scoringRun} className="multisport-log-scoring-run-item">
                {scoringRun}
              </span>
            ))}
          </div>
        ) : null}
        <div className="multisport-log-spacer" />
        {playByPlay.slice().reverse().map((drive, index) => (
          <div key={`${drive.team}-${drive.description}-${index}`} className="multisport-log-event-row">
            <div className="multisport-log-header">
              <div className="multisport-log-event-meta">
                <span>{drive.team || "Update"}</span>
                {drive.score ? (
                  <span className="multisport-log-topbar-muted">{drive.score}</span>
                ) : null}
              </div>
              <div className="multisport-log-event-description">{drive.description}</div>
              {drive.meta ? <div className="multisport-log-topbar-muted">{drive.meta}</div> : null}
            </div>
            <div>
              {(drive.plays || []).slice().reverse().map((play, playIndex) => {
                const hideText = play.text === drive.description;
                const hasPlayMeta = Boolean(play.clock || play.down);
                return (
                  <div key={`${play.clock}-${playIndex}`} className="multisport-log-play-content">
                    {!hideText ? <div>{play.text}</div> : null}
                    {hasPlayMeta ? (
                      <div className="multisport-log-play-meta">
                        {play.down ? <span>{play.down}</span> : null}
                        {play.clock ? <span>{play.clock}</span> : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="multisport-log-content multisport-log-bottom">
        <Autoscroller className="multisport-log-autoscroller" speed={0.1}>
          <>
            {(props.log.boxScore || []).map((boxScore) => (
              <div key={boxScore.key} className="multisport-log-box-score">
                <div className="multisport-log-header">{boxScore.key}</div>
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      {boxScore.labels.map((label) => (
                        <th key={label}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(boxScore.players || []).map((player) => (
                      <tr
                        key={player.name}
                        className={player.isHomeTeam ? "multisport-log-box-score-row multisport-log-box-score-row-home" : "multisport-log-box-score-row"}
                      >
                        <td className="multisport-log-player-name">{player.name}</td>
                        {player.stats.map((stat, index) => (
                          <td key={`${player.name}-${index}`}>{stat}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>
        </Autoscroller>
      </div>
    </div>
  );
}

function LogActions(props: { espnGameUrl: string | null }) {
  if (!props.espnGameUrl) {
    return null;
  }

  return (
    <a
      className="multisport-log-link"
      href={props.espnGameUrl}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      open in espn
    </a>
  );
}

function LogWinProbability(props: { winProbability?: WinProbabilityType | null }) {
  if (!props.winProbability?.team || !Number.isFinite(props.winProbability.probability)) {
    return <span className="multisport-log-topbar-probability" />;
  }

  const probabilityLabel = `${Math.round(props.winProbability.probability * 100)}%`;

  return (
    <span className="multisport-log-topbar-probability">
      {props.winProbability.isHomeTeam ? `${probabilityLabel} \u2192` : `\u2190 ${probabilityLabel}`}
    </span>
  );
}

function renderTeamStatistics(statistics: Record<string, string>) {
  const fieldGoals = statistics["fieldGoalsMade-fieldGoalsAttempted"];
  const threePointers = statistics["threePointFieldGoalsMade-threePointFieldGoalsAttempted"];
  const freeThrows = statistics["freeThrowsMade-freeThrowsAttempted"];
  const runs = statistics.runs;
  const hits = statistics.hits;
  const errors = statistics.errors;
  const shots = statistics.shots || statistics.shotsOnGoal;
  const powerPlays = statistics.powerPlayGoals || statistics.powerPlays;

  if (statistics.possessionTime && statistics.totalYards && statistics.totalOffensivePlays) {
    return renderStatRows([
      ["TOP", statistics.possessionTime],
      ["YDS", statistics.totalYards],
      ["PLAYS", statistics.totalOffensivePlays],
    ]);
  }

  if (fieldGoals && threePointers && statistics.totalRebounds) {
    return renderStatRows([
      ["FG", fieldGoals],
      ["REB", statistics.totalRebounds],
      ["3PT", threePointers],
      ["TO", statistics.totalTurnovers || statistics.turnovers || ""],
      ["FT", freeThrows || ""],
      ["LP", statistics.leadPercentage ? `${statistics.leadPercentage}%` : ""],
    ]);
  }

  if (runs && hits && errors) {
    return renderStatRows([
      ["R", runs],
      ["H", hits],
      ["E", errors],
      ["LOB", statistics.leftOnBase || ""],
    ]);
  }

  if (shots && statistics.hits && statistics.penaltyMinutes) {
    return renderStatRows([
      ["SOG", shots],
      ["HIT", statistics.hits],
      ["PIM", statistics.penaltyMinutes],
      ["PP", powerPlays || ""],
    ]);
  }

  return renderStatRows(
    Object.entries(statistics)
      .slice(0, 4)
      .map(([key, value]) => [key, value]),
  );
}

function getEspnGameUrl(
  stream: Stream,
  config: { sport: string; espnLeague: string } | null | undefined,
) {
  if (!hasEspnGame(stream) || !config) {
    return null;
  }

  return `https://www.espn.com/${config.espnLeague}/game?gameId=${stream.espn_id}`;
}

function renderStatRows(lines: string[][]) {
  const rows = [];
  for (let index = 0; index < lines.length; index += 2) {
    rows.push(lines.slice(index, index + 2));
  }

  return (
    <>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="multisport-log-team-summary-stat-row">
          {row.map(([label, value]) => (
            <div key={label} className="multisport-log-team-summary-stat-line">
              <span className="multisport-log-team-summary-stat-label">{label}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

type ParsedScoreType = [number, number];

type ScoringRunCandidate = {
  startIndex: number;
  latestIndex: number;
  startClock: string;
  endClock: string;
  durationSeconds: number | null;
  scoreDelta: ParsedScoreType;
};

function getScoringRunLabels(playByPlay: LogType["playByPlay"], leagueCategory: string) {
  const scoringSnapshots = buildScoringSnapshots(playByPlay);
  if (scoringSnapshots.length === 0) {
    return [];
  }

  const latestSnapshot = scoringSnapshots[scoringSnapshots.length - 1];
  const latestClock = getLatestClockLabel(playByPlay) || latestSnapshot.clock;
  const rankedRuns: { candidate: ScoringRunCandidate; interestScore: number; label: string }[] = [];

  for (let index = 0; index < scoringSnapshots.length; index += 1) {
    const startSnapshot = scoringSnapshots[index];
    const baseScore = getCandidateBaseScore(index, scoringSnapshots);
    const startClock = index > 0 ? scoringSnapshots[index - 1].clock : startSnapshot.clock;
    const scoreDelta = subtractScores(latestSnapshot.score, baseScore);

    const candidate: ScoringRunCandidate = {
      startIndex: index,
      latestIndex: scoringSnapshots.length - 1,
      startClock,
      endClock: latestClock,
      durationSeconds: getRunDurationSeconds(startClock, latestClock, leagueCategory),
      scoreDelta,
    };

    const interestScore = scoreLatestRunInterest(candidate);
    if (interestScore === null) {
      continue;
    }

    const timingLabel = formatRunTiming(candidate);
    if (!timingLabel) {
      continue;
    }

    const label = `${candidate.scoreDelta[0]}-${candidate.scoreDelta[1]} ${timingLabel}`;

    rankedRuns.push({
      candidate,
      interestScore,
      label,
    });
  }

  return rankedRuns
    .sort((left, right) => {
      if (right.interestScore !== left.interestScore) {
        return right.interestScore - left.interestScore;
      }

      const leftTotal = left.candidate.scoreDelta[0] + left.candidate.scoreDelta[1];
      const rightTotal = right.candidate.scoreDelta[0] + right.candidate.scoreDelta[1];
      return rightTotal - leftTotal;
    })
    .filter((run, index, runs) => runs.findIndex((candidate) => candidate.label === run.label) === index)
    .slice(0, 2)
    .map((run) => run.label);
}

function buildScoringSnapshots(playByPlay: LogType["playByPlay"]) {
  const snapshots: { score: ParsedScoreType; clock: string }[] = [];
  let previousScore: ParsedScoreType | null = null;

  for (const drive of playByPlay) {
    const score = parseScore(drive.score);
    if (!score) {
      continue;
    }

    if (!previousScore) {
      previousScore = score;
      if (score[0] === 0 && score[1] === 0) {
        continue;
      }

      snapshots.push({
        score,
        clock: getDriveClockLabel(drive),
      });
      continue;
    }

    if (previousScore && score[0] === previousScore[0] && score[1] === previousScore[1]) {
      continue;
    }

    snapshots.push({
      score,
      clock: getDriveClockLabel(drive),
    });
    previousScore = score;
  }

  return snapshots;
}

function parseScore(score: string): ParsedScoreType | null {
  const parts = score.split("-").map((part) => parseInt(part.trim(), 10));
  if (parts.length !== 2 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  return [parts[0], parts[1]];
}

function subtractScores(left: ParsedScoreType, right: ParsedScoreType): ParsedScoreType {
  return [left[0] - right[0], left[1] - right[1]];
}

function getCandidateBaseScore(
  startIndex: number,
  scoringSnapshots: { score: ParsedScoreType; clock: string }[],
) {
  return startIndex > 0 ? scoringSnapshots[startIndex - 1].score : ([0, 0] as ParsedScoreType);
}

function scoreLatestRunInterest(candidate: ScoringRunCandidate) {
  if (candidate.durationSeconds === null) {
    return null;
  }

  const scoringTeamIndex = getScoringTeamIndex(candidate.scoreDelta);
  if (scoringTeamIndex === null) {
    return null;
  }

  const scoreDifferential =
    candidate.scoreDelta[scoringTeamIndex] - candidate.scoreDelta[1 - scoringTeamIndex];
  if (scoreDifferential <= 0) {
    return null;
  }

  return scoreDifferential / Math.pow(candidate.durationSeconds + 1, 1 / 1.5);
}

function getScoringTeamIndex(scoreDelta: ParsedScoreType): 0 | 1 | null {
  if (scoreDelta[0] === scoreDelta[1]) {
    return null;
  }

  return scoreDelta[0] > scoreDelta[1] ? 0 : 1;
}

function getDriveClockLabel(drive: LogType["playByPlay"][number]) {
  const plays = drive.plays || [];
  for (let index = plays.length - 1; index >= 0; index -= 1) {
    if (plays[index].clock) {
      return plays[index].clock;
    }
  }

  return "";
}

function getLatestClockLabel(playByPlay: LogType["playByPlay"]) {
  for (let driveIndex = playByPlay.length - 1; driveIndex >= 0; driveIndex -= 1) {
    const clock = getDriveClockLabel(playByPlay[driveIndex]);
    if (clock) {
      return clock;
    }
  }

  return "";
}

function getRunDurationSeconds(startClock: string, endClock: string, leagueCategory: string) {
  const startSeconds = parseGameClockToElapsedSeconds(startClock, leagueCategory);
  const endSeconds = parseGameClockToElapsedSeconds(endClock, leagueCategory);
  if (startSeconds === null || endSeconds === null || endSeconds <= startSeconds) {
    return null;
  }

  return endSeconds - startSeconds;
}

function formatRunTiming(candidate: ScoringRunCandidate) {
  return candidate.durationSeconds !== null ? `in last ${formatSeconds(candidate.durationSeconds)}` : null;
}

function parseGameClockToElapsedSeconds(clockLabel: string, leagueCategory: string) {
  const clockConfig = getClockConfig(leagueCategory);
  const match = clockLabel
    .trim()
    .match(/^[A-Z]+(\d+)\s+(?:(\d+):)?(\d{1,2})(?:\.(\d+))?$/i);
  if (!match) {
    return null;
  }

  const period = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const seconds = parseInt(match[3], 10);
  const fractionalSeconds = match[4] ? parseFloat(`0.${match[4]}`) : 0;
  if (!Number.isFinite(period) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  if (seconds >= 60 || fractionalSeconds >= 1) {
    return null;
  }

  if (!clockConfig) {
    return null;
  }

  let elapsedSeconds = 0;
  for (let currentPeriod = 1; currentPeriod < period; currentPeriod += 1) {
    elapsedSeconds += getPeriodDurationSeconds(currentPeriod, clockConfig);
  }

  const periodDurationSeconds = getPeriodDurationSeconds(period, clockConfig);
  const remainingSeconds = minutes * 60 + seconds + fractionalSeconds;
  return elapsedSeconds + Math.max(0, periodDurationSeconds - remainingSeconds);
}

function getClockConfig(leagueCategory: string) {
  if (["NFL", "CFB", "CFL"].includes(leagueCategory)) {
    return { regulationPeriods: 4, regulationPeriodSeconds: 15 * 60, overtimePeriodSeconds: 10 * 60 };
  }

  if (leagueCategory === "NBA") {
    return { regulationPeriods: 4, regulationPeriodSeconds: 12 * 60, overtimePeriodSeconds: 5 * 60 };
  }

  if (leagueCategory === "NCAAB") {
    return { regulationPeriods: 2, regulationPeriodSeconds: 20 * 60, overtimePeriodSeconds: 5 * 60 };
  }

  if (leagueCategory === "NHL") {
    return { regulationPeriods: 3, regulationPeriodSeconds: 20 * 60, overtimePeriodSeconds: 5 * 60 };
  }

  return null;
}

function getPeriodDurationSeconds(
  period: number,
  config: { regulationPeriods: number; regulationPeriodSeconds: number; overtimePeriodSeconds: number },
) {
  return period <= config.regulationPeriods
    ? config.regulationPeriodSeconds
    : config.overtimePeriodSeconds;
}

function formatSeconds(totalSeconds: number) {
  const roundedSeconds = Math.max(1, Math.round(totalSeconds));
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
