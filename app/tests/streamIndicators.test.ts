import { describe, expect, it } from "vitest";
import { getBigPlay, getPlayKey } from "../src/app_x/lib/renderLog/indicators";

describe("football big plays", () => {
  it.each([
    ["Pass for 24 yards", 24, null], ["Pass for 25 yards", 25, "distance"],
    ["Sack for -10 yards", -10, null], ["Sack for -11 yards", -11, "distance"],
    ["60 yard field goal is GOOD", 60, "field_goal"], ["59 yard field goal is GOOD", 59, null],
    ["kicks 70 yards", 70, "kicks"], ["kicks 69 yards", 69, null],
    ["punts 40 yards", 40, "punts"], ["punts 39 yards", 39, null],
    ["kicks 75 yards, Touchback", 75, null], ["Intentional Grounding", -15, null],
    ["field goal is BLOCKED", 30, "block"], ["TOUCHDOWN", 3, "super_big_play"],
    ["FUMBLES, RECOVERED by defense", 0, "super_big_play"],
    ["INTERCEPTED by defense", 0, "super_big_play"], ["MUFFED punt", 0, "super_big_play"],
    ["SAFETY", -2, "super_big_play"], ["TOUCHDOWN NULLIFIED by penalty", 30, null],
    ["FUMBLE - No Play.", 0, null],
  ])("classifies %s (%s yards)", (text, distance, result) => {
    expect(getBigPlay({ text, distance, clock: "Q1 1:00", down: "" })).toBe(result);
  });
  it("does not invent yardage when absent", () => {
    expect(getBigPlay({ text: "Pass complete", clock: "Q1 1:00", down: "" })).toBeNull();
  });
  it("uses the final incomplete-pass ruling when the description retains an overturned interception", () => {
    expect(getBigPlay({ typeId: "3", startYardsToEndzone: 23, distance: 0, clock: "Q2 1:14", down: "3rd & 4 at CAR 23",
      text: "C.Rush pass INTERCEPTED at CAR 19. The Replay Official reviewed the interception ruling, and the play was REVERSED. C.Rush pass incomplete to O.Zaccheaus." })).toBeNull();
  });
  it.each([
    ["TOUCHDOWN", 5],
    ["INTERCEPTED and returned for 95 yards", 95],
    ["FUMBLES, RECOVERED by defense", 0],
    ["field goal is BLOCKED", 30],
    ["Sack for -15 yards", -15],
  ])("disqualifies red-zone plays before applying the %s rule", (text, distance) => {
    for (const startYardsToEndzone of [1, 5, 19, 20]) {
      expect(getBigPlay({ text, distance, startYardsToEndzone, clock: "Q1 1:00", down: "" })).toBeNull();
    }
  });
  it.each([21, 95, undefined, NaN])("preserves qualifying plays outside the red zone or with unknown position (%s)", startYardsToEndzone => {
    expect(getBigPlay({ text: "TOUCHDOWN", distance: 21, startYardsToEndzone, clock: "Q1 1:00", down: "" })).toBe("super_big_play");
  });
  it("uses stable ESPN IDs across corrected descriptions", () => {
    const play = { id: "123", text: "Pass", clock: "Q1 1:00", down: "" };
    expect(getPlayKey(play, "Team")).toBe(getPlayKey({ ...play, text: "Corrected pass" }, "Team"));
  });
});
