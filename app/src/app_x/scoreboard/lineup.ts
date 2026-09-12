export type ProjectedPlayer = {
  id: number;
  name: string;
  slotId: number;
  slot: string;
  projection: number | null;
  locked: boolean;
  actual: number | null;
};

export type ProjectedLineup = {
  projected: number | null;
  players: ProjectedPlayer[];
  emptySlots: number[];
  warning?: string;
};

const BENCH = 20, IR = 21;
// Occupancy DP is exponential in starting slots. These bounds keep malformed
// feeds from causing unbounded browser work (normal football lineups use 9–11).
const MAX_SLOTS = 16, MAX_ENTRIES = 64;
const SLOT_NAMES: Record<number, string> = {
  0: "QB", 1: "TQB", 2: "RB", 3: "RB/WR", 4: "WR", 5: "WR/TE", 6: "TE", 7: "OP",
  8: "DT", 9: "DE", 10: "LB", 11: "DL", 12: "CB", 13: "S", 14: "DB", 15: "DP",
  16: "D/ST", 17: "K", 18: "P", 19: "HC", 23: "FLEX",
};
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const slotId = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

type Candidate = Omit<ProjectedPlayer, "slotId" | "slot"> & { currentSlot: number; eligible: number[] };
type State = { score: number; filled: number; picks: Array<Candidate | undefined> };

function projectionFor(player: any, year: number, week: number): number | null {
  if (!Array.isArray(player?.stats)) return null;
  const matches = player.stats.filter((stat: any) => stat?.seasonId === year && stat.scoringPeriodId === week
    && stat.statSourceId === 1 && stat.statSplitTypeId === 1);
  // Conflicting duplicate rows are ambiguous; identical repeated rows are safe.
  if (!matches.length || !matches.every((stat: any) => finite(stat.appliedTotal) && stat.appliedTotal === matches[0].appliedTotal)) return null;
  return matches[0].appliedTotal;
}

function better(a: State, b: State): boolean {
  if (a.filled !== b.filled) return a.filled > b.filled;
  if (a.score !== b.score) return a.score > b.score;
  // Among equally good complete lineups, put higher projections in earlier
  // dedicated slots before OP/FLEX. Compare all projections before player IDs;
  // neither entry order nor current unlocked placements affect the tie-break.
  for (let i = 0; i < a.picks.length; i++) {
    const left = a.picks[i]?.projection ?? -Infinity, right = b.picks[i]?.projection ?? -Infinity;
    if (left !== right) return left > right;
  }
  for (let i = 0; i < a.picks.length; i++) {
    const left = a.picks[i]?.id ?? Infinity, right = b.picks[i]?.id ?? Infinity;
    if (left !== right) return left < right;
  }
  return false;
}

function selected(player: Candidate, slot: number): ProjectedPlayer {
  return { id: player.id, name: player.name, slotId: slot, slot: SLOT_NAMES[slot] ?? `Slot ${slot}`,
    projection: player.projection, locked: player.locked, actual: player.actual };
}

/** Compute a local projection only; ESPN lineups and actual scores are untouched. */
export function optimizeProjectedLineup(data: any, side: any, year: number): ProjectedLineup | null {
  if (!((String(data?.id) === "203836968" && String(side?.teamId) === "6")
    || (String(data?.id) === "367176096" && String(side?.teamId) === "1"))) return null;

  const baseline = finite(side.totalProjectedPointsLive) ? side.totalProjectedPointsLive : null;
  const fallback = (reason: string): ProjectedLineup => ({ projected: baseline, players: [], emptySlots: [], warning: reason });
  if (baseline === null) return fallback("Missing finite ESPN live projection.");
  if (!Number.isInteger(year) || !Number.isInteger(data.scoringPeriodId) || data.scoringPeriodId < 1) {
    return fallback("Missing valid season or scoring period.");
  }

  const counts = data?.settings?.rosterSettings?.lineupSlotCounts;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return fallback("Missing lineup slot counts.");
  const slots: number[] = [];
  for (const [key, count] of Object.entries(counts)) {
    const id = Number(key);
    if (!slotId(id) || String(id) !== key || !Number.isInteger(count) || (count as number) < 0 || (count as number) > MAX_ENTRIES) {
      return fallback("Invalid lineup slot counts.");
    }
    if (id === BENCH || id === IR) continue;
    if (slots.length + (count as number) > MAX_SLOTS) return fallback("Lineup exceeds the supported starting-slot limit.");
    for (let i = 0; i < (count as number); i++) slots.push(id);
  }
  if (!slots.length) return fallback("Missing starting lineup slots.");
  slots.sort((a, b) => a - b);

  const team = Array.isArray(data.teams) ? data.teams.find((item: any) => String(item?.id) === String(side.teamId)) : undefined;
  const roster = side.rosterForCurrentScoringPeriod ?? team?.roster;
  const entries = roster?.entries;
  if (!Array.isArray(entries)) return fallback("Missing current roster entries.");
  if (entries.length > MAX_ENTRIES) return fallback("Roster exceeds the supported entry limit.");
  const seen = new Set<number>();
  const candidates: Candidate[] = [], locked: Candidate[] = [];
  let originalUnlocked = 0;
  for (const entry of entries) {
    const id = entry?.playerId, currentSlot = entry?.lineupSlotId;
    if (!Number.isSafeInteger(id) || seen.has(id)) return fallback("Invalid or duplicate roster player IDs.");
    seen.add(id);
    if (!slotId(currentSlot) || (currentSlot !== BENCH && currentSlot !== IR && !slots.includes(currentSlot))) {
      return fallback("Invalid current roster slot.");
    }
    if (currentSlot === IR) continue;
    const pool = entry?.playerPoolEntry, player = pool?.player;
    if (typeof pool?.lineupLocked !== "boolean") return fallback(`Missing explicit lineup lock for player ${id}.`);
    if (pool.lineupLocked && currentSlot === BENCH) continue;
    if (typeof player?.fullName !== "string" || !player.fullName.trim()) return fallback(`Missing roster player name for ${id}.`);
    const projection = projectionFor(player, year, data.scoringPeriodId);
    const eligible = player.eligibleSlots;
    if (!pool.lineupLocked && (!Array.isArray(eligible) || !eligible.length || !eligible.every(slotId))) {
      return fallback(`Missing or invalid slot eligibility for ${player.fullName}.`);
    }
    if (!pool.lineupLocked && projection === null) return fallback(`Missing weekly projection for ${player.fullName}.`);
    if (!pool.lineupLocked && currentSlot !== BENCH && !eligible.includes(currentSlot)) {
      return fallback(`Current slot is ineligible for ${player.fullName}.`);
    }
    const candidate: Candidate = { id, name: player.fullName, projection, locked: pool.lineupLocked,
      actual: finite(pool.appliedStatTotal) ? pool.appliedStatTotal : null, currentSlot,
      eligible: Array.isArray(eligible) ? eligible : [] };
    if (candidate.locked) locked.push(candidate);
    else {
      candidates.push(candidate);
      if (currentSlot !== BENCH) originalUnlocked += projection!;
    }
  }

  locked.sort((a, b) => a.id - b.id);
  candidates.sort((a, b) => a.id - b.id);
  const frozen: Array<Candidate | undefined> = Array(slots.length).fill(undefined);
  for (const player of locked) {
    const index = slots.findIndex((slot, i) => slot === player.currentSlot && !frozen[i]);
    if (index < 0) return fallback("Locked starters exceed configured slot counts.");
    frozen[index] = player;
  }
  const available = slots.map((slot, index) => ({ slot, index })).filter(({ index }) => !frozen[index]);
  const initial: State = { score: 0, filled: 0, picks: Array(available.length).fill(undefined) };
  let states = new Map<number, State>([[0, initial]]);
  for (const player of candidates) {
    const next = new Map(states);
    // Read only the previous player pass, so each player is used at most once.
    for (const [mask, state] of states) {
      for (let i = 0; i < available.length; i++) {
        if ((mask & (1 << i)) || !player.eligible.includes(available[i].slot)) continue;
        const picks = state.picks.slice(); picks[i] = player;
        const proposal = { score: state.score + player.projection!, filled: state.filled + 1, picks };
        const newMask = mask | (1 << i), incumbent = next.get(newMask);
        if (!incumbent || better(proposal, incumbent)) next.set(newMask, proposal);
      }
    }
    states = next;
  }
  let best = initial;
  for (const state of states.values()) if (better(state, best)) best = state;
  const projected = baseline + best.score - originalUnlocked;
  if (!finite(projected) || !finite(originalUnlocked)) return fallback("Projection arithmetic is not finite.");
  const picks = frozen.slice();
  available.forEach(({ index }, i) => { picks[index] = best.picks[i]; });
  return {
    projected,
    players: picks.flatMap((player, i) => player ? [selected(player, slots[i])] : []),
    emptySlots: slots.filter((_slot, i) => !picks[i]),
  };
}
