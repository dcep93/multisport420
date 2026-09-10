/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BoxScoreType, WinProbabilityType } from "./types";

type TeamSummary = {
  name: string;
  statistics: Record<string, string>;
  isHomeTeam?: boolean;
};

export async function fetchJson(url: string) {
  // ESPN's HTTPS responses still contain HTTP $refs for drives and teams.
  // Follow those references over HTTPS to avoid mixed-content blocking.
  const requestUrl = url.replace(/^http:\/\/sports\.core\.api\.espn\.com\//, "https://sports.core.api.espn.com/");
  const response = await fetch(requestUrl, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status} for ${requestUrl}`);
  }

  return response.json();
}

export function buildTeamSummaries(summaryObj: any, streamTitle = "") {
  const teamSummaries = ((((summaryObj as any).boxscore?.teams as any[]) ?? []).slice()).map(
    (teamObj: any, teamIndex: number) => ({
      name: teamObj.team?.name ?? "",
      statistics: Object.fromEntries(
        ((teamObj.statistics as any[]) ?? []).flatMap((stat) => {
          if (Array.isArray(stat?.stats)) {
            return stat.stats.map((nestedStat: any) => [nestedStat.name, nestedStat.displayValue]);
          }

          return stat?.name ? [[stat.name, stat.displayValue]] : [];
        }),
      ),
      isHomeTeam: isHomeTeamBoxScoreTeam(teamIndex),
    }),
  );

  return orderTeamSummariesByTitle(teamSummaries, streamTitle);
}

export function buildDefaultBoxScore(players: any[], keys: readonly string[]): BoxScoreType[] {
  return keys.map((key) => ({
    key,
    labels: players?.[0]?.statistics?.find((stat: any) => stat.name === key)?.labels || [],
    players: (players || [])
      .flatMap((team: any, teamIndex: number) => {
        const statBlock = team.statistics?.find((stat: any) => stat.name === key);
        if (!statBlock) {
          return [];
        }

        const isHomeTeam = isHomeTeamBoxScoreTeam(teamIndex);
        return (statBlock.athletes || []).map((athlete: any) => ({
          name: athlete.athlete?.displayName ?? "",
          stats: athlete.stats ?? [],
          isHomeTeam,
          rank:
            athlete.stats
              ?.map((stat: string) => parseFloat(String(stat).split("/")[0]))
              .find((stat: number) => !Number.isNaN(stat)) || 0,
        }));
      })
      .sort((left, right) => right.rank - left.rank),
  }));
}

export function findStatIndex(keys: string[], aliases: readonly string[]) {
  return keys.findIndex((key) => aliases.includes(key));
}

export function isHomeTeamBoxScoreTeam(teamIndex: number) {
  return teamIndex === 1;
}

export function buildWinProbability(summaryObj: any): WinProbabilityType | null {
  const winProbabilities = ((summaryObj as any).winprobability as any[]) ?? [];
  const latestProbability = winProbabilities[winProbabilities.length - 1];
  const competitors = (((summaryObj as any).header?.competitions?.[0]?.competitors as any[]) ?? []);
  const homeCompetitor = competitors.find((competitor) => competitor?.homeAway === "home");
  const awayCompetitor = competitors.find((competitor) => competitor?.homeAway === "away");
  const homeWinPercentage = Number(latestProbability?.homeWinPercentage);
  const tiePercentage = Number(latestProbability?.tiePercentage || 0);

  if (!Number.isFinite(homeWinPercentage) || !homeCompetitor || !awayCompetitor) {
    return null;
  }

  const awayWinPercentage = 1 - homeWinPercentage - (Number.isFinite(tiePercentage) ? tiePercentage : 0);
  const isHomeTeam = homeWinPercentage >= awayWinPercentage;
  const teamCompetitor = isHomeTeam ? homeCompetitor : awayCompetitor;

  return {
    team:
      teamCompetitor.team?.shortDisplayName ||
      teamCompetitor.team?.displayName ||
      teamCompetitor.team?.name ||
      "",
    probability: Math.max(homeWinPercentage, awayWinPercentage),
    isHomeTeam,
  };
}

function orderTeamSummariesByTitle(teamSummaries: TeamSummary[], streamTitle: string) {
  const titleTeams = parseTitleTeams(streamTitle).map(normalizeTeamName).filter(Boolean);
  if (titleTeams.length < 2 || teamSummaries.length < 2) {
    return teamSummaries;
  }

  return teamSummaries
    .map((teamSummary, index) => ({
      teamSummary,
      index,
      titleIndex: getTitleIndex(teamSummary.name, titleTeams),
    }))
    .sort((left, right) => {
      if (left.titleIndex !== right.titleIndex) {
        return left.titleIndex - right.titleIndex;
      }

      return left.index - right.index;
    })
    .map(({ teamSummary }) => teamSummary);
}

function getTitleIndex(teamName: string, titleTeams: string[]) {
  const normalizedTeamName = normalizeTeamName(teamName);
  const matchedIndex = titleTeams.findIndex((titleTeam) =>
    teamNamesMatch(normalizedTeamName, titleTeam),
  );

  return matchedIndex === -1 ? Number.MAX_SAFE_INTEGER : matchedIndex;
}

function parseTitleTeams(title: string) {
  for (const separator of [/\s+vs\s+/i, /\s+@\s+/i, /\s+at\s+/i]) {
    const parts = title.split(separator).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return parts.slice(0, 2);
    }
  }

  return [title];
}

function normalizeTeamName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bsaint\b/g, "st")
    .replace(/\bstate\b/g, "st")
    .replace(/\buniversity\b/g, "")
    .replace(/\bfc\b/g, "")
    .replace(/\bcf\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function teamNamesMatch(left: string, right: string) {
  if (left === right) {
    return true;
  }

  const leftCompact = left.replaceAll(" ", "");
  const rightCompact = right.replaceAll(" ", "");

  if (leftCompact === rightCompact) {
    return true;
  }

  return leftCompact.includes(rightCompact) || rightCompact.includes(leftCompact);
}
