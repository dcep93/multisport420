/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Stream } from "../../config/types";
import { buildDefaultBoxScore, buildTeamSummaries, buildWinProbability, fetchJson } from "./shared";
import type { DriveType, FootballLeagueConfig, LogType } from "./types";

type FootballCoreDriveItem = {
  $ref: string;
  id: string;
};

type FootballDriveStart = { period?: { number?: number }; clock?: { displayValue?: string } };

type FootballDrivePlay = {
  id?: string;
  shortText?: string;
  review?: { upheld?: boolean };
  isTurnover?: boolean;
  statYardage?: number;
  awayScore?: number;
  homeScore?: number;
  wallclock?: number | string;
  participants?: unknown[];
  text?: string;
  period?: {
    number?: number;
  };
  clock?: {
    displayValue?: string;
  };
  start?: {
    downDistanceText?: string;
    yardsToEndzone?: number;
    team?: { id?: string; $ref?: string };
  };
  end?: {
    yardsToEndzone?: number;
    team?: { id?: string; $ref?: string };
  };
};

type FootballDriveResponse = {
  start?: FootballDriveStart;
  description?: string;
  displayResult?: string;
  team?: {
    $ref?: string;
  };
  plays?: {
    items?: FootballDrivePlay[];
  };
};

type FootballTeamResponse = {
  id?: string;
  shortDisplayName?: string;
};

type FootballResolvedDrive = {
  id: string;
  description: string;
  displayResult?: string;
  team: FootballTeamResponse | null;
  plays: FootballDrivePlay[];
  start?: FootballDriveStart;
};

export async function getFootballLog(
  stream: Stream,
  config: FootballLeagueConfig,
): Promise<LogType | null> {
  const [summaryObj, coreObj] = await Promise.all([
    fetchJson(
      `https://site.web.api.espn.com/apis/site/v2/sports/${config.sport}/${config.espnLeague}/summary?region=us&lang=en&contentorigin=espn&event=${stream.espn_id}`,
    ),
    fetchJson(
      `https://sports.core.api.espn.com/v2/sports/${config.sport}/leagues/${config.espnLeague}/events/${stream.espn_id}/competitions/${stream.espn_id}/drives?limit=1000`,
    ),
  ]);

  const driveItems = ((coreObj as { items?: FootballCoreDriveItem[] }).items ?? []).slice().reverse();

  const driveObjs: FootballResolvedDrive[] = await Promise.all(
    driveItems.map(async (coreItem) => {
      const driveObj = (await fetchJson(coreItem.$ref)) as FootballDriveResponse;
      const teamRef = driveObj.team?.$ref;
      const teamObj = teamRef ? ((await fetchJson(teamRef)) as FootballTeamResponse) : null;
      return {
        id: coreItem.id,
        description: driveObj.description ?? "",
        start: driveObj.start,
        displayResult: driveObj.displayResult,
        team: teamObj,
        plays: driveObj.plays?.items ?? [],
      };
    }),
  );

  const filteredDriveObjs = driveObjs.filter((driveObj) => driveObj.plays.length > 0);

  const summaryWithDrives = summaryObj as {
    drives?: {
      current?: FootballResolvedDrive;
      previous?: FootballResolvedDrive[];
    };
    boxscore?: {
      teams?: any[];
      players?: any[];
    };
  };

  // A new drive already identifies the receiving offense before its first play.
  // Keep it for possession even while the log displays the last completed drive.
  const coreDrive = driveObjs[0];
  const summaryDrive = summaryWithDrives.drives?.current;
  const coreOrder = getDriveOrder(coreDrive);
  const summaryIsNewer = Number.isFinite(coreOrder) && getDriveOrder(summaryDrive) > coreOrder;
  const possessionDrive = !coreDrive || summaryIsNewer
    ? summaryDrive ?? coreDrive
    : coreDrive;

  if (filteredDriveObjs.length > 0) {
    summaryWithDrives.drives = {
      current: filteredDriveObjs[0],
      previous: filteredDriveObjs.slice(1).reverse(),
    };
  }

  if (!summaryWithDrives.drives?.current) {
    return null;
  }

  const drives = [summaryWithDrives.drives.current]
    .concat(
      (summaryWithDrives.drives.previous ?? [])
        .slice()
        .reverse()
        .filter((drive) => drive?.id !== summaryWithDrives.drives?.current?.id),
    )
    .filter((drive) => drive?.team);

  // The shared log renderer reverses chronological data for newest-first display.
  // `drives` is newest-first here; ESPN's plays within a drive are chronological.
  const playByPlay = drives.slice().reverse().map((drive) => {
    const plays = drive.plays;
    const latestPlay = plays[plays.length - 1];
    return {
      team: drive.team?.shortDisplayName ?? "",
      result: drive.displayResult,
      plays: plays
        .filter((play) => play.participants)
        .map((play) => ({
          id: play.id,
          shortText: play.shortText,
          reviewReversed: play.review?.upheld === false,
          distance: play.statYardage,
          startYardsToEndzone: play.start?.yardsToEndzone,
          timestamp: parseWallclock(play.wallclock),
          down: play.start?.downDistanceText ?? "",
          text: play.text ?? "",
          clock: `Q${play.period?.number ?? ""} ${play.clock?.displayValue ?? ""}`.trim(),
        })),
      description: drive.description,
      score: `${latestPlay?.awayScore ?? ""} - ${latestPlay?.homeScore ?? ""}`,
    } satisfies DriveType;
  });

  const latestWallclock = (summaryWithDrives.drives.current?.plays ?? [])
    .slice().reverse().map((play) => play.wallclock).find(Boolean);
  const latestTimestamp = typeof latestWallclock === "string" ? Date.parse(latestWallclock) : latestWallclock;
  const timestamp = latestTimestamp !== undefined && Number.isFinite(latestTimestamp) ? latestTimestamp : Date.now();

  return {
    timestamp,
    teams: buildTeamSummaries(summaryObj, stream.title),
    winProbability: buildWinProbability(summaryObj),
    playByPlay,
    boxScore: buildDefaultBoxScore(summaryWithDrives.boxscore?.players ?? [], config.boxScoreKeys),
    ...getFootballIndicators(summaryObj, possessionDrive),
  };
}

function parseWallclock(value: number | string | undefined) {
  const timestamp = typeof value === "string" ? Date.parse(value) : value;
  return typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp : undefined;
}

function getFootballIndicators(summary: any, drive?: FootballResolvedDrive): Pick<LogType, "possession" | "redZone" | "gameFinished"> {
  const competition = summary.header?.competitions?.[0];
  const status = competition?.status;
  const latest = drive?.plays.at(-1);
  const gameFinished = status?.type?.completed === true || status?.type?.state === "post";
  const atBreak = /halftime|end of half|end of game/i.test(`${status?.type?.name ?? ""} ${status?.type?.description ?? ""} ${latest?.text ?? ""}`)
    || (latest?.clock?.displayValue === "0:00" && [2, 4].includes(latest.period?.number ?? 0));
  const scoringBreak = /touchdown|safety|^field goal$/i.test(drive?.displayResult ?? "");
  if (gameFinished || atBreak || scoringBreak || !drive) return { redZone: false, gameFinished };

  // A drive's team is the offense that STARTED it. The final play's end.team
  // identifies who owns the ball after punts, downs, fumbles, and interceptions.
  const endTeam = latest?.end?.team;
  const endTeamId = getTeamId(endTeam);
  const driveTeamId = drive.team?.id;
  const changedPossession = latest?.isTurnover === true
    || /^(?:punt|downs|turnover on downs|interception|fumble|missed field goal|field goal missed)$/i.test(drive.displayResult ?? "");
  const competitors = competition?.competitors ?? [];
  const startingTeamId = getTeamId(latest?.start?.team) || driveTeamId;
  const opponent = competitors.some((entry: any) => String(entry.team?.id) === startingTeamId)
    ? competitors.find((entry: any) => String(entry.team?.id) !== startingTeamId)
    : undefined;
  // Only infer a handoff when the feed omits the final owner. A same-team recovery
  // (muffed punt, onside kick, own fumble) must retain the explicit end.team.
  const teamId = endTeamId || (changedPossession ? opponent?.team?.id : driveTeamId);
  const competitor = competitors.find((entry: any) => teamId && String(entry.team?.id) === String(teamId));
  if (!competitor || !["home", "away"].includes(competitor.homeAway)) return { redZone: false, gameFinished };
  // Field position is meaningful only for the team associated with that end state.
  const yards = endTeamId === String(teamId) ? latest?.end?.yardsToEndzone : undefined;
  return {
    possession: {
      team: competitor.team.shortDisplayName || competitor.team.displayName || competitor.team.name,
      isHomeTeam: competitor.homeAway === "home",
    },
    redZone: typeof yards === "number" && Number.isFinite(yards) && yards > 0 && yards <= 20,
    gameFinished,
  };
}

function getTeamId(team?: { id?: string; $ref?: string }) {
  return team?.id || team?.$ref?.match(/\/teams\/([^/?]+)/)?.[1];
}

function getDriveOrder(drive?: FootballResolvedDrive) {
  const period = drive?.start?.period?.number;
  const clock = drive?.start?.clock?.displayValue?.match(/^(\d+):(\d{2})$/);
  if (!period || !clock) return -Infinity;
  return period * 3600 - Number(clock[1]) * 60 - Number(clock[2]);
}
