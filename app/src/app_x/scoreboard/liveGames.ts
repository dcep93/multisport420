import type { Snapshot } from "./data";
import type { PlayerScore } from "./players";

export type PlayerActivity = "playing" | "possession" | "red-zone";
export type LiveTeam = { completed: boolean; activity?: PlayerActivity };
export type NflScoreboard = {
  season?: { year?: number; type?: number }; week?: { number?: number };
  events?: Array<{
    season?: { year?: number; type?: number }; week?: { number?: number };
    competitions?: Array<{
      status?: { type?: { state?: string; completed?: boolean; name?: string } };
      competitors?: Array<{ team?: { id?: string | number } }>;
      situation?: { possession?: string | number; isRedZone?: boolean };
    }>;
  }>;
};

export function parseLiveTeams(data: NflScoreboard, year: number, week: number): Map<number, LiveTeam> {
  const teams = new Map<number, LiveTeam>();
  for (const event of data.events ?? []) {
    if ((event.season?.year ?? data.season?.year) !== year
      || (event.week?.number ?? data.week?.number) !== week
      || (event.season?.type ?? data.season?.type) !== 2) continue;
    for (const competition of event.competitions ?? []) {
      const status = competition.status?.type;
      const completed = status?.completed === true || status?.state === "post";
      const playing = !completed && status?.state === "in";
      const atBreak = /HALFTIME|END_OF_HALF|DELAYED|SUSPENDED/i.test(status?.name ?? "");
      for (const competitor of competition.competitors ?? []) {
        const id = Number(competitor.team?.id);
        if (!Number.isSafeInteger(id) || id <= 0) continue;
        const possession = playing && !atBreak && String(competition.situation?.possession) === String(id);
        const activity = !playing ? undefined : possession
          ? competition.situation?.isRedZone === true ? "red-zone" : "possession" : "playing";
        teams.set(id, { completed, ...(activity ? { activity } : {}) });
      }
    }
  }
  return teams;
}

export function withLivePlayers(snapshot: Snapshot, teams: Map<number, LiveTeam>): Snapshot {
  const update = <T extends PlayerScore>(player: T): T => {
    const team = player.proTeamId === undefined ? undefined : teams.get(player.proTeamId);
    const completed = player.completed || team?.completed === true;
    return { ...player, completed, activity: completed ? undefined : team?.activity };
  };
  return { ...snapshot,
    matchups: snapshot.matchups.map(matchup => matchup.map(team => ({ ...team,
      ...(team.players ? { players: team.players.map(update) } : {}) }))),
    ...(snapshot.leaders ? { leaders: {
      positions: snapshot.leaders.positions.map(group => ({ ...group, players: group.players.map(update) })),
      unowned: snapshot.leaders.unowned.map(update),
    } } : {}),
  };
}

export function activityLabel(activity?: PlayerActivity) {
  return activity === "red-zone" ? "Team has the ball in the red zone"
    : activity === "possession" ? "Team has the ball" : activity === "playing" ? "Game in progress" : undefined;
}

export function activityClass(player?: PlayerScore) {
  return player?.activity ? `scoreboard-player-${player.activity}` : undefined;
}
