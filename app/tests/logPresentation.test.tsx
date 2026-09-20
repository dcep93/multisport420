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
it("leaves big plays in ordinary play-by-play without a separate timestamp block", () => {
  const { container } = render(renderSummary(summaryLog()));
  expect(container.querySelector(".multisport-log-latest-big-play")).toBeNull();
  expect(container.querySelector(".multisport-log-team-summary-row")?.nextElementSibling?.className).toBe("multisport-log-event-row");
  expect(container.querySelector(".multisport-log-event-row")?.textContent).toContain(bigPlay.text);
});
