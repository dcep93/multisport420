export type PlayType = {
  id?: string;
  distance?: number;
  startYardsToEndzone?: number;
  timestamp?: number;
  down: string;
  text: string;
  clock: string;
};

export type DriveType = {
  team: string;
  description: string;
  score: string;
  result?: string;
  meta?: string;
  plays?: PlayType[];
};

export type BoxScoreType = {
  key: string;
  labels: string[];
  players?: { name: string; stats: string[]; isHomeTeam?: boolean }[];
};

export type WinProbabilityType = {
  team: string;
  probability: number;
  isHomeTeam: boolean;
};

export type LogType = {
  timestamp: number;
  teams: { name: string; statistics: Record<string, string>; isHomeTeam?: boolean }[];
  winProbability?: WinProbabilityType | null;
  playByPlay: DriveType[];
  boxScore: BoxScoreType[];
  possession?: { team: string; isHomeTeam: boolean };
  redZone?: boolean;
  gameFinished?: boolean;
};

export type LeagueConfig = {
  sport: string;
  espnLeague: string;
  playType: "football" | "basketball" | "baseball" | "hockey";
  boxScoreKeys: readonly string[];
};

export type FootballLeagueConfig = LeagueConfig & {
  playType: "football";
};

export type BasketballLeagueConfig = LeagueConfig & {
  playType: "basketball";
};

export type BaseballLeagueConfig = LeagueConfig & {
  playType: "baseball";
};

export type HockeyLeagueConfig = LeagueConfig & {
  playType: "hockey";
};
