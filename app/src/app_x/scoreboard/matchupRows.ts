import type { RosterPlayer } from "./players";

export type MatchupRow = { key: string; position: string; reserve: boolean; left?: RosterPlayer; right?: RosterPlayer };

/** Pair matching lineup slots, retaining unmatched players on either roster. */
export function matchupRows(left: RosterPlayer[] = [], right: RosterPlayer[] = []): MatchupRow[] {
  const groups = new Map<string, { slotId: number; position: string; reserve: boolean; sides: RosterPlayer[][] }>();
  [left, right].forEach((players, side) => players.forEach(player => {
    const reserve = player.slotId === 20 || player.slotId === 21;
    const key = `${player.slotId}${reserve ? `:${player.position}` : ""}`;
    const group = groups.get(key) ?? { slotId: player.slotId,
      position: reserve ? `${player.slot} · ${player.position}` : player.slot, reserve, sides: [[], []] };
    group.sides[side].push(player);
    groups.set(key, group);
  }));
  return [...groups].sort(([, a], [, b]) => Number(a.reserve) - Number(b.reserve)
    || a.slotId - b.slotId || a.position.localeCompare(b.position)).flatMap(([key, group]) =>
    Array.from({ length: Math.max(group.sides[0].length, group.sides[1].length) }, (_, index) => ({
      key: `${key}:${index}`, position: group.position, reserve: group.reserve,
      left: group.sides[0][index], right: group.sides[1][index],
    })));
}
