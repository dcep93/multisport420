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
    expect(getBigPlay({ reviewReversed: true, startYardsToEndzone: 23, distance: 0, clock: "Q2 1:14", down: "3rd & 4 at CAR 23",
      text: "C.Rush pass INTERCEPTED at CAR 19. The Replay Official reviewed the interception ruling, and the play was REVERSED. C.Rush pass incomplete to O.Zaccheaus." })).toBeNull();
  });
  it.each([
    ["TOUCHDOWN", "Runner out of bounds for 8 yards.", 8, null],
    ["FUMBLES, RECOVERED by defense", "Runner down by contact for 2 yards.", 2, null],
    ["Pass incomplete", "Pass complete for 32 yards.", 32, "distance"],
    ["Runner out of bounds", "Runner scores a TOUCHDOWN.", 8, "super_big_play"],
    ["Pass INTERCEPTED", "Pass complete for 30 yards.", 30, "distance"],
    ["TOUCHDOWN", "Penalty, No Play.", 35, null],
    ["No Play", "Pass complete for 30 yards.", 30, "distance"],
  ])("classifies the corrected outcome instead of the original %s", (original, final, distance, expected) => {
    expect(getBigPlay({ text: `${original}. The Replay Official reviewed the ruling, and the play was REVERSED.\n${final}`,
      reviewReversed: true, distance, startYardsToEndzone: 40, clock: "Q2 1:14", down: "" })).toBe(expected);
  });
  it("uses the last reversal and supports descriptions without review metadata", () => {
    expect(getBigPlay({ text: "TOUCHDOWN. Ruling REVERSED. FUMBLE. After further review, ruling OVERTURNED. Runner down for 2 yards.",
      distance: 2, clock: "Q2 1:14", down: "" })).toBeNull();
  });
  it.each([
    ["Pass incomplete", null],
    ["Rushing TOUCHDOWN", "super_big_play"],
    [undefined, null],
  ])("uses the current short description when a reversed play has no appended outcome (%s)", (shortText, expected) => {
    expect(getBigPlay({ text: "FUMBLE recovered by defense", reviewReversed: true,
      shortText, distance: 8, clock: "Q2 1:14", down: "" })).toBe(expected);
  });
  it("does not retain stale yardage while waiting for a corrected outcome", () => {
    expect(getBigPlay({ text: "Pass complete for 50 yards. Replay ruling REVERSED.", reviewReversed: true,
      distance: 50, clock: "Q2 1:14", down: "" })).toBeNull();
  });
  it("keeps a big play when a review upholds the original ruling", () => {
    expect(getBigPlay({ text: "Pass INTERCEPTED. The Replay Official reviewed the interception ruling, and the play was Upheld.",
      reviewReversed: false, distance: 0, clock: "Q2 1:14", down: "" })).toBe("super_big_play");
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
