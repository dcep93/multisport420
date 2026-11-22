import type { Stream } from "../config/types";
import { getBigPlay } from "./renderLog/indicators";

export const REDZONE_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100";
export const redzoneSummaryUrl = (gameId: string) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(gameId)}`;

export function isRedzoneStream(stream: Pick<Stream, "title" | "slug" | "category">) {
  const channel = /^(?:nfl[\s_-]*)?red[\s_-]*zone(?:$|[\s_-])/i;
  return [stream.title, stream.slug].some(value => channel.test(value.trim())
    && (/^nfl[\s_-]*/i.test(value.trim()) || stream.category.toLowerCase() === "nfl"));
}

type EspnStatus = { type?: { state?: string; completed?: boolean } };
type EspnScoreboard = { events?: { id?: string | number; status?: EspnStatus; competitions?: { status?: EspnStatus }[] }[] };
type EspnTeam = { id?: string | number; abbreviation?: string; shortDisplayName?: string; displayName?: string; name?: string };
type EspnPlay = {
  id?: string | number;
  text?: string;
  shortText?: string;
  review?: { upheld?: boolean };
  statYardage?: number;
  wallclock?: string | number | null;
  start?: { downDistanceText?: string; team?: EspnTeam; yardsToEndzone?: number };
  homeScore?: string | number | null;
  awayScore?: string | number | null;
  period?: { number?: number };
  clock?: { displayValue?: string };
};
type EspnDrive = { id?: string | number; team?: EspnTeam; plays?: EspnPlay[] };
type EspnSummary = {
  header?: { competitions?: { competitors?: { homeAway?: string; team?: EspnTeam }[] }[] };
  drives?: { previous?: EspnDrive[]; current?: EspnDrive };
};
export type RedzonePlay = { key: string; text: string; detail: string; timestamp: number | null; matchup?: string; bigPlay: boolean };

export function activeRedzoneGames(data: unknown): string[] {
  const scoreboard = data as EspnScoreboard | null;
  if (!scoreboard || !Array.isArray(scoreboard.events)) throw new Error("Invalid NFL scoreboard");
  return [...new Set(scoreboard.events.flatMap(event => {
    const status = event.status?.type ?? event.competitions?.[0]?.status?.type;
    return event.id != null && status?.state === "in" && !status.completed ? [String(event.id)] : [];
  }))];
}

function timestamp(value: EspnPlay["wallclock"]): number | null {
  if (value == null || value === "") return null;
  const numeric = typeof value === "number" || /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : Date.parse(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function teamId(team?: EspnTeam): string | undefined {
  const id = team?.id;
  if (typeof id === "number") return Number.isFinite(id) ? String(id) : undefined;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

function teamLabel(team?: EspnTeam): string | undefined {
  return [team?.abbreviation, team?.shortDisplayName, team?.displayName, team?.name]
    .find(value => typeof value === "string" && value.trim())?.trim();
}

function eventScore(value: EspnPlay["homeScore"]): string {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return "—";
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 ? String(score) : "—";
}

function matchupLabel(play: EspnPlay, drive: EspnDrive, home?: EspnTeam, away?: EspnTeam): string | undefined {
  const homeId = teamId(home), awayId = teamId(away);
  const homeLabel = teamLabel(home), awayLabel = teamLabel(away);
  if (!homeId || !awayId || homeId === awayId || !homeLabel || !awayLabel) return undefined;
  // Possession belongs to the start of this play, even when it ends in a turnover.
  const possession = [teamId(play.start?.team), teamId(drive.team)].find(id => id === homeId || id === awayId);
  if (!possession) return undefined;
  const homeText = `${homeLabel} ${eventScore(play.homeScore)}`;
  const awayText = `${awayLabel} ${eventScore(play.awayScore)}`;
  return possession === homeId ? `${homeText} vs ${awayText}` : `${awayText} @ ${homeText}`;
}

export function normalizeRedzonePlays(gameId: string, data: unknown): RedzonePlay[] {
  const summary = data as EspnSummary | null;
  if (!summary || typeof summary !== "object" || !("drives" in summary || "header" in summary)) throw new Error("Invalid NFL summary");
  const drives = summary.drives;
  const competitors = summary.header?.competitions?.[0]?.competitors;
  const home = Array.isArray(competitors) ? competitors.find(team => team.homeAway === "home")?.team : undefined;
  const away = Array.isArray(competitors) ? competitors.find(team => team.homeAway === "away")?.team : undefined;
  const previous = Array.isArray(drives?.previous) ? drives.previous : [];
  const all = [...previous, ...(drives?.current ? [drives.current] : [])];
  const plays = new Map<string, RedzonePlay>();
  for (const drive of all) {
    if (!Array.isArray(drive.plays)) continue;
    // A drive ID survives the current -> previous transition. Without one, the
    // first play's clock is a stable fallback; never use a fetch-time timestamp.
    const first = drive.plays[0];
    const driveKey = drive.id ?? `${first?.period?.number ?? ""}:${first?.clock?.displayValue ?? ""}:${first?.wallclock ?? ""}`;
    drive.plays.forEach((play, index) => {
      if (typeof play.text !== "string" || !play.text.trim()) return;
      const key = `${gameId}:${play.id ?? `missing:${driveKey}:${index}`}`;
      const down = play.start?.downDistanceText ?? "";
      const time = play.clock?.displayValue;
      const clock = time ? [play.period?.number ? `Q${play.period.number}` : "", time].filter(Boolean).join(" ") : "";
      const bigPlay = Boolean(getBigPlay({
        text: play.text, shortText: play.shortText, reviewReversed: play.review?.upheld === false,
        distance: play.statYardage, startYardsToEndzone: play.start?.yardsToEndzone, down, clock,
      }));
      plays.set(key, { key, text: play.text, detail: [down, clock].filter(Boolean).join(" - "), timestamp: timestamp(play.wallclock), matchup: matchupLabel(play, drive, home, away), bigPlay });
    });
  }
  return [...plays.values()];
}

export function sortRedzonePlays(plays: RedzonePlay[]) {
  return [...plays].sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      if (a.timestamp === null) return 1;
      if (b.timestamp === null) return -1;
      return b.timestamp - a.timestamp;
    }
    return a.key.localeCompare(b.key);
  });
}
