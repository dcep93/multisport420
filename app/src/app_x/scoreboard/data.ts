import { guillotineSigma, headToHeadProbability, probNormalMinAll } from "./probability";
import { optimizeProjectedLineup, type ProjectedLineup } from "./lineup";

export type Team = { id: number; name: string; score: number | null; projected: number | null; projectedLineup?: ProjectedLineup };
export type ScoredTeam = Team & { score: number; projected: number };
export type Snapshot = { leagueId: string; leagueName: string; year: number; week: number; matchups: Team[][]; knockout: boolean; fetchedAt: number };
export type Mode = "head-to-head" | "guillotine";
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
export const isScored = (team: Team): team is ScoredTeam => team.score !== null && team.projected !== null;

export function parseScoreboard(data: any, year: number, fetchedAt: number): Snapshot {
  if (!data || !Array.isArray(data.teams) || !Array.isArray(data.schedule) ||
      !/^\d+$/.test(String(data.id)) || finite(data.scoringPeriodId) === null) {
    throw new Error("ESPN returned incomplete scoreboard data. Refresh your league tab and try again.");
  }
  const period = data.status?.currentMatchupPeriod ?? data.scoringPeriodId;
  const names = new Map<number, string>(data.teams.map((team: any) => [team.id,
    team.name || [team.location, team.nickname].filter(Boolean).join(" ") || `Team ${team.id}`]));
  const current = data.schedule.filter((matchup: any) => matchup.matchupPeriodId === period);
  // ESPN's native Knockout format (2026) puts all competitors in `teams`.
  // Older Guillotine leagues used the ordinary home/away schedule.
  const knockout = current.some((matchup: any) => Array.isArray(matchup.teams));
  const matchups: Team[][] = current
    .map((matchup: any) => (Array.isArray(matchup.teams) ? matchup.teams : [matchup.home, matchup.away])
      .filter((team: any) => team && finite(team.teamId) !== null &&
        !(team.eliminationMatchupPeriod > 0 && team.eliminationMatchupPeriod < period))
      .map((team: any) => {
        const projectedLineup = optimizeProjectedLineup(data, team, year);
        return { id: team.teamId, name: names.get(team.teamId) || `Team ${team.teamId}`,
          score: finite(team.totalPointsLive),
          projected: projectedLineup ? projectedLineup.projected : finite(team.totalProjectedPointsLive),
          ...(projectedLineup ? { projectedLineup } : {}) };
      }))
    .filter((teams: Team[]) => teams.length > 0);
  return { leagueId: String(data.id), leagueName: data.settings?.name || `League ${data.id}`,
    year, week: data.scoringPeriodId, matchups, knockout, fetchedAt };
}

export function headToHead(snapshot: Snapshot) {
  if (snapshot.knockout) return [];
  return snapshot.matchups.map((matchup, index) => {
    const teams = [...matchup].sort((a, b) => (b.projected ?? -Infinity) - (a.projected ?? -Infinity));
    const probability = teams.length === 2 && teams.every(isScored)
      ? headToHeadProbability(teams[0] as ScoredTeam, teams[1] as ScoredTeam) : null;
    return { teams, probability, key: index };
  }).sort((a, b) =>
    (a.probability === null ? Infinity : Math.abs(a.probability - 0.5)) -
    (b.probability === null ? Infinity : Math.abs(b.probability - 0.5)));
}

export function guillotine(snapshot: Snapshot) {
  const unique = [...new Map(snapshot.matchups.flat().map(team => [team.id, team])).values()];
  // A missing projection must not silently remove an eligible competitor.
  const incomplete = unique.some(team => team.projected === null || (team.projected > 0 && team.score === null));
  const teams = unique.filter(team => team.projected === null || team.projected > 0);
  const risks = incomplete ? teams.map(() => null) : probNormalMinAll(
    teams.map(team => team.projected!), teams.map(team => guillotineSigma(team.score!, team.projected!)));
  const all = teams.map((team, i) => ({ team, probability: risks[i] }))
    .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
  const atRisk = all.filter(team => team.probability !== null && team.probability > 0.01);
  const thunderdome = !incomplete && atRisk.length > 0 && atRisk.length <= 3;
  return { teams: thunderdome ? atRisk : all, thunderdome, incomplete, hidden: thunderdome ? all.length - atRisk.length : 0 };
}
