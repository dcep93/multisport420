/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Stream } from "../../config/types";
import { buildTeamSummaries, buildWinProbability, fetchJson, findStatIndex, isHomeTeamBoxScoreTeam } from "./shared";
import type { BaseballLeagueConfig, DriveType, LogType } from "./types";

type BaseballRenderedPlay = {
  atBatId: string;
  playType: string;
  team: string;
  meta: string;
  text: string;
  score: string;
};

export async function getBaseballLog(
  stream: Stream,
  config: BaseballLeagueConfig,
): Promise<LogType | null> {
  const summaryObj = await fetchJson(
    `https://site.web.api.espn.com/apis/site/v2/sports/${config.sport}/${config.espnLeague}/summary?region=us&lang=en&contentorigin=espn&event=${stream.espn_id}`,
  );

  const plays = (((summaryObj as any).plays as any[]) ?? []).slice();
  if (plays.length === 0) {
    return null;
  }

  const timestamp =
    Date.parse(
      (summaryObj as any).meta?.lastPlayWallClock ||
      plays[plays.length - 1]?.wallclock ||
      (summaryObj as any).header?.competitions?.[0]?.date ||
      "",
    ) || Date.now();

  const teamsById = buildBaseballTeamsById(summaryObj);
  const battingTeams = Object.fromEntries(
    ((summaryObj as any).header?.competitions?.[0]?.competitors ?? []).map((competitor: any) => [
      competitor.homeAway === "away" ? "top" : "bottom",
      teamsById[competitor.team?.id],
    ]),
  );

  return {
    timestamp,
    teams: buildTeamSummaries(summaryObj, stream.title),
    winProbability: buildWinProbability(summaryObj),
    playByPlay: buildBaseballPlayByPlay(plays, teamsById, battingTeams),
    boxScore: buildBaseballBoxScore((summaryObj as any).boxscore?.players ?? [], config.boxScoreKeys),
  };
}

function buildBaseballPlayByPlay(
  plays: any[], teamsById: Record<string, string>, battingTeams: Record<string, string>,
) {
  const normalizedPlays = plays
    .map((play) => normalizeBaseballPlay(play, teamsById, battingTeams))
    .filter((play) => play.text);

  const groups = new Map<string, typeof normalizedPlays>();
  normalizedPlays.forEach((play, index) => {
    // Inning markers reuse the last/next at-bat ID. Keep them independent so
    // their reset counts cannot replace an at-bat's result or disappear.
    const groupId = isBaseballInningMarker(play.playType) || !play.atBatId
      ? `event-${index}` : play.atBatId;
    const currentGroup = groups.get(groupId) ?? [];
    currentGroup.push(play);
    groups.set(groupId, currentGroup);
  });

  return Array.from(groups.values())
    .map(buildBaseballGroup)
    .filter((group): group is DriveType => group !== null);
}

function buildBaseballGroup(plays: BaseballRenderedPlay[]): DriveType | null {
  const visiblePlays = filterBaseballGroupPlays(plays);
  if (visiblePlays.length === 0) {
    return null;
  }

  const renderedOrderPlays = visiblePlays.slice().reverse();
  const summaryPlay =
    renderedOrderPlays.find((play) => isPrimaryBaseballSummaryPlay(play.playType)) || renderedOrderPlays[0];
  const latestPlay = renderedOrderPlays[0];

  return {
    team: plays.find((play) => play.playType === "start-batterpitcher")?.team || summaryPlay.team || latestPlay.team,
    meta: latestPlay.meta || plays[0]?.meta || undefined,
    plays: visiblePlays.map((play) => ({
      down: "",
      text: play.text,
      clock: "",
    })),
    description: summaryPlay.text,
    score: latestPlay.score,
  } satisfies DriveType;
}

function normalizeBaseballPlay(
  play: any, teamsById: Record<string, string>, battingTeams: Record<string, string>,
): BaseballRenderedPlay {
  const awayScore = play.awayScore ?? play.scoreValue?.away;
  const homeScore = play.homeScore ?? play.scoreValue?.home;

  return {
    atBatId: String(play.atBatId ?? ""),
    playType: play.type?.type || "",
    team:
      battingTeams[String(play.period?.type || "").toLowerCase()] ||
      teamsById[play.team?.id] ||
      play.team?.shortDisplayName ||
      play.team?.displayName ||
      play.team?.abbreviation ||
      play.team?.name ||
      "",
    meta: formatBaseballStateMeta(play),
    text: play.text || play.shortText || "",
    score:
      awayScore !== undefined || homeScore !== undefined ? `${awayScore ?? ""} - ${homeScore ?? ""}` : "",
  };
}

function filterBaseballGroupPlays(plays: BaseballRenderedPlay[]) {
  const meaningfulPlays = plays.filter((play) => !isAdministrativeBaseballPlay(play.playType) && play.text);
  return meaningfulPlays.length > 0 ? meaningfulPlays : plays.filter((play) => play.text);
}

function buildBaseballTeamsById(summaryObj: any): Record<string, string> {
  return Object.fromEntries(
    [
      ...(((summaryObj as any).header?.competitions?.[0]?.competitors ?? []).map((competitor: any) => [
        competitor.team?.id,
        competitor.team?.shortDisplayName ||
        competitor.team?.displayName ||
        competitor.team?.name ||
        "",
      ])),
      ...((((summaryObj as any).boxscore?.teams as any[]) ?? []).map((teamObj: any) => [
        teamObj.team?.id,
        teamObj.team?.shortDisplayName || teamObj.team?.displayName || teamObj.team?.name || "",
      ])),
      ...((((summaryObj as any).boxscore?.players as any[]) ?? []).map((teamObj: any) => [
        teamObj.team?.id,
        teamObj.team?.shortDisplayName || teamObj.team?.displayName || teamObj.team?.name || "",
      ])),
    ].filter(([teamId]) => Boolean(teamId)),
  );
}

function isPrimaryBaseballSummaryPlay(playType: string) {
  return !["start-batterpitcher", "start-inning"].includes(playType.toLowerCase());
}

function isAdministrativeBaseballPlay(playType: string) {
  return playType.toLowerCase() === "end-batterpitcher";
}

function isBaseballInningMarker(playType: string) {
  return ["start-inning", "end-inning"].includes(playType.toLowerCase());
}

function formatBaseballStateMeta(play: any) {
  const inning = formatBaseballInning(play);
  if (isBaseballInningMarker(play.type?.type || "")) return inning;
  const bases = formatBaseballBases(play);
  const outs = formatBaseballOuts(play);
  return [inning, bases, outs].filter(Boolean).join(" | ");
}

function formatBaseballInning(play: any) {
  const inning = play.period?.number ?? play.period ?? play.inning;
  const halfInning =
    play.homeAway ||
    play.period?.type ||
    play.period?.displayValue ||
    play.clock?.displayValue ||
    play.inningHalf;
  const normalizedHalfInning = String(halfInning || "").trim().toLowerCase();
  const inningLabel =
    normalizedHalfInning === "top" || normalizedHalfInning === "top of the inning"
      ? "Top"
      : normalizedHalfInning === "bottom" || normalizedHalfInning === "bottom of the inning"
        ? "Bot"
        : normalizedHalfInning === "mid" ? "Mid"
          : normalizedHalfInning === "end" ? "End" : normalizedHalfInning;

  return [inningLabel, inning ? String(inning) : ""].filter(Boolean).join(" ").trim();
}

function formatBaseballBases(play: any) {
  const onFirst =
    play.onFirst || play.runnersOn?.first || play.baseRunners?.first || play.situation?.onFirst;
  const onSecond =
    play.onSecond || play.runnersOn?.second || play.baseRunners?.second || play.situation?.onSecond;
  const onThird =
    play.onThird || play.runnersOn?.third || play.baseRunners?.third || play.situation?.onThird;
  const occupiedBases = [
    onFirst ? "1B" : "",
    onSecond ? "2B" : "",
    onThird ? "3B" : "",
  ].filter(Boolean);
  return occupiedBases.length > 0 ? occupiedBases.join(", ") : "Bases empty";
}

function formatBaseballOuts(play: any) {
  const outs = play.outs ?? play.count?.outs ?? play.situation?.outs;
  return Number.isFinite(outs) ? `${outs} out${outs === 1 ? "" : "s"}` : "";
}

function buildBaseballBoxScore(players: any[], keys: readonly string[]) {
  const statConfig: Record<
    string,
    {
      rankKeys: readonly string[];
      columns: readonly string[][];
    }
  > = {
    batting: {
      rankKeys: ["hits", "RBIs", "RBI", "rbis", "runs", "totalBases"],
      columns: [
        ["atBats", "AB"],
        ["runs", "R"],
        ["hits", "H"],
        ["RBIs", "RBI", "rbis"],
        ["walks", "BB"],
        ["strikeouts", "SO"],
      ],
    },
    pitching: {
      rankKeys: ["strikeouts", "fullInnings.partInnings", "innings", "outs"],
      columns: [
        ["fullInnings.partInnings", "innings", "IP"],
        ["hits", "H"],
        ["runs", "R"],
        ["earnedRuns", "ER"],
        ["walks", "BB"],
        ["strikeouts", "SO"],
      ],
    },
  };

  return keys.map((key) => {
    const config = statConfig[key];
    const athletes = (players || []).flatMap((team: any, teamIndex: number) => {
      const statBlock = (team.statistics || []).find(
        (stat: any) => stat.name === key || stat.type === key,
      );
      if (!statBlock || !config) return [];

      const blockKeys = statBlock.keys || [];
      const labels = config.columns.map((aliases) => {
        const index = findStatIndex(blockKeys, aliases);
        return index >= 0 ? statBlock.labels?.[index] || aliases[aliases.length - 1] : aliases[aliases.length - 1];
      });
      const rankIndex = findStatIndex(blockKeys, config.rankKeys);
      const columnIndexes = config.columns.map((aliases) => findStatIndex(blockKeys, aliases));

      return (statBlock.athletes || [])
        .filter((athlete: any) => (athlete.stats || []).length > 0)
        .map((athlete: any) => ({
          name: athlete.athlete?.displayName ?? "",
          stats: columnIndexes.map((columnIndex) =>
            columnIndex >= 0 ? athlete.stats[columnIndex] || "" : "",
          ),
          isHomeTeam: isHomeTeamBoxScoreTeam(teamIndex),
          rank: rankIndex >= 0 ? parseFloat(String(athlete.stats?.[rankIndex] || "0")) || 0 : 0,
          labels,
        }));
    });

    return {
      key,
      labels: athletes[0]?.labels || [],
      players: athletes
        .sort((left, right) => right.rank - left.rank)
        .map(({ name, stats, isHomeTeam }) => ({ name, stats, isHomeTeam })),
    };
  });
}
