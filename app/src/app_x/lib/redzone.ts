import type { Stream } from "../config/types";

export const REDZONE_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100";
export const redzoneSummaryUrl = (gameId: string) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(gameId)}`;

export function isRedzoneStream(stream: Pick<Stream, "title" | "slug" | "category">) {
  const channel = /^(?:nfl[\s_-]*)?red[\s_-]*zone(?:$|[\s_-])/i;
  return [stream.title, stream.slug].some(value => channel.test(value.trim())
    && (/^nfl[\s_-]*/i.test(value.trim()) || stream.category.toLowerCase() === "nfl"));
}

type EspnStatus = { type?: { state?: string; completed?: boolean } };
type EspnScoreboard = { events?: { id?: string | number; status?: EspnStatus; competitions?: { status?: EspnStatus }[] }[] };
type EspnPlay = {
  id?: string | number;
  text?: string;
  wallclock?: string | number | null;
  start?: { downDistanceText?: string };
  period?: { number?: number };
  clock?: { displayValue?: string };
};
type EspnDrive = { id?: string | number; plays?: EspnPlay[] };
type EspnSummary = { drives?: { previous?: EspnDrive[]; current?: EspnDrive } };
export type RedzonePlay = { key: string; text: string; detail: string; timestamp: number | null };

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

export function normalizeRedzonePlays(gameId: string, data: unknown): RedzonePlay[] {
  const summary = data as EspnSummary | null;
  if (!summary || typeof summary !== "object" || !("drives" in summary || "header" in summary)) throw new Error("Invalid NFL summary");
  const drives = summary.drives;
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
      plays.set(key, { key, text: play.text, detail: [down, clock].filter(Boolean).join(" - "), timestamp: timestamp(play.wallclock) });
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
