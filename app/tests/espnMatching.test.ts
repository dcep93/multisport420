import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEspnScheduleEventsForCategories, resolveEspnEventId, type EspnScheduleEvent } from "../src/app_x/lib/espn";

const kickoff = Date.parse("2026-10-11T17:00Z");
// ESPN's October 11 matchups, with the unrelated game appearing first.
const events = [
  { id: "401872986", date: "2026-10-11T17:00Z", competitions: [{ competitors: [
    { team: { displayName: "New England Patriots", shortDisplayName: "Patriots", abbreviation: "NE", location: "New England", name: "Patriots" } },
    { team: { displayName: "Las Vegas Raiders", shortDisplayName: "Raiders", abbreviation: "LV", location: "Las Vegas", name: "Raiders" } },
  ] }] },
  { id: "401872987", date: "2026-10-11T17:00Z", competitions: [{ competitors: [
    { team: { displayName: "New Orleans Saints", shortDisplayName: "Saints", abbreviation: "NO", location: "New Orleans", name: "Saints" } },
    { team: { displayName: "Minnesota Vikings", shortDisplayName: "Vikings", abbreviation: "MIN", location: "Minnesota", name: "Vikings" } },
  ] }] },
];
let schedule: EspnScheduleEvent[];

beforeEach(async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events }) }));
  schedule = await fetchEspnScheduleEventsForCategories("ALL", ["NFL"]);
});
afterEach(() => vi.unstubAllGlobals());

describe("ESPN matchup identity", () => {
  it("matches Vikings–Saints instead of finding NE inside Minnesota and New Orleans", () => {
    expect(resolveEspnEventId("Minnesota Vikings @ New Orleans Saints", kickoff, schedule)).toBe(401872987);
    expect(resolveEspnEventId("Minnesota Vikings @ New Orleans Saints", kickoff, schedule.slice(0, 1))).toBe(-1);
  });
  it.each(["Saints vs Vikings", "MIN @ NO", "Minnesota at New Orleans", "MinnesotaVikings @ NewOrleansSaints"])("recognizes complete aliases in %s", title => {
    expect(resolveEspnEventId(title, kickoff, schedule)).toBe(401872987);
  });
  it("still recognizes Patriots abbreviations when they are the actual teams", () => {
    expect(resolveEspnEventId("LV @ NE", kickoff, schedule)).toBe(401872986);
  });
  it("does not substitute a game that matches only one team", () => {
    expect(resolveEspnEventId("Minnesota Vikings @ Dallas Cowboys", kickoff, schedule)).toBe(-1);
  });
  it("requires two distinct competitors, not two aliases of the same team", () => {
    expect(resolveEspnEventId("Saints @ New Orleans", kickoff, schedule)).toBe(-1);
  });
  it("keeps the kickoff window and rejects missing kickoff times", () => {
    expect(resolveEspnEventId("Vikings @ Saints", kickoff + 13 * 60 * 60 * 1000, schedule)).toBe(-1);
    expect(resolveEspnEventId("Vikings @ Saints", null, schedule)).toBe(-1);
  });
});
