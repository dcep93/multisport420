// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import StreamLog from "../src/app_x/lib/renderLog";
import type { LogType } from "../src/app_x/lib/renderLog/types";
HTMLElement.prototype.scrollTo = () => {};
afterEach(cleanup);
it.each(["NFL", "NBA", "NCAAB"])("renders the right summary and scoring run for %s", category => {
  const log: LogType = { timestamp: 1, boxScore: [], teams: [{ name: "Away Team", statistics: { possessionTime: "24:45", totalYards: "232", totalOffensivePlays: "45", "fieldGoalsMade-fieldGoalsAttempted": "10-20", "threePointFieldGoalsMade-threePointFieldGoalsAttempted": "4-8", totalRebounds: "22" } }],
    playByPlay: [0, 1, 2].map(index => ({ team: "Away Team", description: `Play ${index}`, score: `${index * 3} - 0`, plays: [{ down: "", text: "Shot", clock: `Q1 ${10 - index}:00` }] })) };
  const { container } = render(<StreamLog stream={{ category, espn_id: 1, slug: "game", title: "Away @ Home", raw_url: "" }} displayedLog={log} errorMessage="" refresh={async () => {}} />);
  const stats = container.querySelector(".multisport-log-team-summary-stats")!;
  if (category === "NFL") { expect(stats.textContent).toBe("24:45 = 232 / 45"); expect(container.querySelector(".multisport-log-scoring-run")).toBeNull(); }
  else { expect(container.querySelector(".multisport-log-scoring-run")?.textContent).toContain("in last"); expect(stats.textContent).not.toContain(" = "); }
});

const bigPlay = { id: "big", text: "Away pass complete for 30 yards", distance: 30, clock: "Q3 12:22", down: "1st & 10" };
const ordinaryPlay = { id: "normal", text: "Run for 2 yards", distance: 2, clock: "Q3 11:50", down: "2nd & 8" };
function summaryLog(plays = [bigPlay, ordinaryPlay]): LogType {
  return { timestamp: 1, boxScore: [], teams: [{ name: "Away", statistics: {} }, { name: "Home", statistics: {}, isHomeTeam: true }],
    playByPlay: [{ team: "Away", description: "Current drive", score: "7 - 0", plays }] };
}
function renderSummary(log: LogType, category = "NFL") {
  return <StreamLog stream={{ category, espn_id: 1, slug: "game", title: "Away @ Home", raw_url: "" }} displayedLog={log} errorMessage="" refresh={async () => {}} />;
}
it.each(["NFL", "CFB", "CFL"])("keeps the latest big play below the teams as ordinary plays arrive in %s", category => {
  const { container, rerender } = render(renderSummary(summaryLog(), category));
  const summary = () => container.querySelector(".multisport-log-latest-big-play")!;
  expect(container.querySelector(".multisport-log-team-summary-row")?.nextElementSibling).toBe(summary());
  expect(summary().textContent).toContain("Latest big play");
  expect(summary().textContent).toContain("Away");
  expect(summary().textContent).toContain("Q3 12:22");
  expect(summary().textContent).toContain(bigPlay.text);
  expect(summary().textContent).not.toContain(ordinaryPlay.text);
  rerender(renderSummary(summaryLog([bigPlay, ordinaryPlay, { ...ordinaryPlay, id: "later", clock: "Q3 11:20" }]), category));
  expect(summary().textContent).toContain(bigPlay.text);
  rerender(renderSummary({ ...summaryLog(), gameFinished: true }, category));
  expect(summary().textContent).toContain(bigPlay.text);
});
it("replaces the summary with a newer big play and retracts nullified plays", () => {
  const newer = { ...bigPlay, id: "new", text: "Home TOUCHDOWN", clock: "Q3 10:00" };
  const next = { ...summaryLog(), playByPlay: [...summaryLog().playByPlay,
    { team: "Home", description: "New drive", score: "7 - 7", plays: [newer] }] };
  const { container, rerender } = render(renderSummary(summaryLog()));
  const summary = () => container.querySelector(".multisport-log-latest-big-play");
  rerender(renderSummary(next));
  expect(summary()?.textContent).toContain("Home");
  expect(summary()?.textContent).toContain(newer.text);
  expect(summary()?.textContent).not.toContain(bigPlay.text);
  rerender(renderSummary({ ...next, playByPlay: [...summaryLog().playByPlay,
    { ...next.playByPlay[1], plays: [{ ...newer, text: "TOUCHDOWN NULLIFIED. No Play." }] }] }));
  expect(summary()?.textContent).toContain(bigPlay.text);
  rerender(renderSummary(summaryLog([ordinaryPlay])));
  expect(summary()).toBeNull();
});
it.each(["NBA", "NHL", "MLB"])("does not apply football big-play rules to %s logs", category => {
  const { container } = render(renderSummary(summaryLog(), category));
  expect(container.querySelector(".multisport-log-latest-big-play")).toBeNull();
});
it("renders an empty play history without a big-play summary", () => {
  const { container } = render(renderSummary(summaryLog([])));
  expect(container.querySelector(".multisport-log-latest-big-play")).toBeNull();
});
