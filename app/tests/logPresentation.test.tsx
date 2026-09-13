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
