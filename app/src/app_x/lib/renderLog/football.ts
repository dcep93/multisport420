/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Stream } from "../../config/types";
import { buildDefaultBoxScore, buildTeamSummaries, buildWinProbability, fetchJson } from "./shared";
import type { DriveType, FootballLeagueConfig, LogType } from "./types";

type FootballCoreDriveItem = {
  $ref: string;
  id: string;
};

type FootballDrivePlay = {
  id?: string;
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
  };
  end?: {
    yardsToEndzone?: number;
    team?: { id?: string; $ref?: string };
  };
};

type FootballDriveResponse = {
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
    ...getFootballIndicators(summaryObj, drives[0]),
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
  if (gameFinished || atBreak || !drive || drive.displayResult) return { redZone: false, gameFinished };

  // Core API returns a team $ref; the summary API returns an id.
  const endTeam = latest?.end?.team;
  const teamId = endTeam?.id || endTeam?.$ref?.match(/\/teams\/([^/?]+)/)?.[1] || drive.team?.id;
  const competitor = competition?.competitors?.find((entry: any) => teamId && String(entry.team?.id) === String(teamId));
  if (!competitor || !["home", "away"].includes(competitor.homeAway)) return { redZone: false, gameFinished };
  const yards = latest?.end?.yardsToEndzone;
  return {
    possession: {
      team: competitor.team.shortDisplayName || competitor.team.displayName || competitor.team.name,
      isHomeTeam: competitor.homeAway === "home",
    },
    redZone: typeof yards === "number" && Number.isFinite(yards) && yards > 0 && yards <= 20,
    gameFinished,
  };
}
