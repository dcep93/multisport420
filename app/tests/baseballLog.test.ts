import { afterEach, expect, it, vi } from "vitest";
import { getBaseballLog } from "../src/app_x/lib/renderLog/baseball";
import fixture from "./fixtures/mlb-401908031-fifth-inning.json";

afterEach(() => vi.unstubAllGlobals());

async function loadLog(plays = fixture.plays) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({ ...fixture, plays }),
  })));
  return (await getBaseballLog(
    { category: "MLB", espn_id: 401908031, title: "Dodgers @ Brewers", raw_url: "", slug: "game" },
    { sport: "baseball", espnLeague: "mlb", playType: "baseball", boxScoreKeys: [] },
  ))!;
}

it("labels Pratt's at-bat with the Brewers despite a Dodgers pitching change", async () => {
  const log = await loadLog();
  expect(log.playByPlay[0]).toMatchObject({
    team: "Brewers",
    description: "Pratt reached on infield single to second, Mitchell to second, Yelich to third.",
    meta: "Bot 5 | 1B, 2B, 3B | 2 outs",
    score: "4 - 4",
  });
  expect(log.playByPlay[0].plays?.[0].text).toBe("Stewart relieved Bubic");
});

it("keeps the inning-ending strikeout and its state separate from the inning marker", async () => {
  const log = await loadLog();
  expect(log.playByPlay).toHaveLength(3);
  expect(log.playByPlay[1]).toMatchObject({
    team: "Brewers", description: "Frelick struck out looking.",
    meta: "Bot 5 | 1B, 2B, 3B | 3 outs", score: "4 - 4",
  });
  expect(log.playByPlay[1].plays?.map(play => play.text)).toEqual([
    "Brock Stewart pitches to Sal Frelick",
    "Pitch 1 : Strike 1 Looking", "Pitch 2 : Strike 2 Swinging",
    "Pitch 3 : Strike 3 Looking", "Frelick struck out looking.",
  ]);
  expect(log.playByPlay[2]).toMatchObject({ description: "End of the 5th inning", meta: "End 5" });
});

it.each(["Top", "Bottom"])("uses the batting side for partial %s at-bats containing only pitches", async half => {
  const pitch = fixture.plays.find(play => play.text === "Pitch 1 : Ball 1")!;
  const log = await loadLog([{ ...pitch, period: { ...pitch.period, type: half }, team: { id: half === "Top" ? "8" : "19" } }]);
  expect(log.playByPlay[0].team).toBe(half === "Top" ? "Dodgers" : "Brewers");
});

it.each(["Mid", "End"])("retains a standalone %s marker even without an at-bat ID", async half => {
  const marker = fixture.plays.at(-1)!;
  const log = await loadLog([{ ...marker, atBatId: "", period: { ...marker.period, type: half } }]);
  expect(log.playByPlay).toHaveLength(1);
  expect(log.playByPlay[0].meta).toBe(`${half} 5`);
});

it("preserves the current at-bat when no result has arrived", async () => {
  const plays = fixture.plays.filter(play => play.atBatId === "4019080310907").slice(0, 3);
  const log = await loadLog(plays);
  expect(log.playByPlay[0]).toMatchObject({ team: "Brewers", description: "Pitch 2 : Strike 2 Swinging" });
  expect(log.playByPlay[0].plays).toHaveLength(3);
});

it("retains inning starts and text events without an at-bat ID", async () => {
  const first = fixture.plays[0];
  const start = { ...first, type: { type: "start-inning" }, text: "Bottom of the 5th inning" };
  const update = { ...first, atBatId: "", text: "Pitching change" };
  const log = await loadLog([start, ...fixture.plays, update]);
  expect(log.playByPlay[0]).toMatchObject({ description: start.text, meta: "Bot 5" });
  expect(log.playByPlay.at(-1)?.description).toBe(update.text);
  const renderedTexts = log.playByPlay.flatMap(group => group.plays?.map(play => play.text));
  expect(renderedTexts).toEqual([start, ...fixture.plays, update].flatMap(play => play.text ? [play.text] : []));
});
