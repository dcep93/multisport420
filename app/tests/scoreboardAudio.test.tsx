// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import Multiscreen from "../src/app_x/components/Multiscreen";
import { FANTASY_SCOREBOARD } from "../src/app_x/lib/fantasyScoreboard";

vi.mock("../src/app_x/hooks/useStreamLog", () => ({ useStreamLog: () => ({}) }));
vi.mock("../src/app_x/components/FantasyScoreboard", () => ({ default: () => <div>Scoreboard</div> }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const a = { slug: "a", title: "Screen A", category: "NFL", espn_id: -1, raw_url: "https://example.com/a" };
const b = { ...a, slug: "b", title: "Screen B", raw_url: "https://example.com/b" };
const host = {
  getLeagueCategories: () => ["NFL"], getStreams: async () => [a, b],
  getIframeParams: async () => ({}), getIframeDocStrElement: () => <html><body>Video</body></html>,
};
const base = {
  host, streams: [a, b, FANTASY_SCOREBOARD], displayLogs: false, logDelayMs: 0,
  logRefreshRequestId: 0, muteToggleRequestId: 0,
  onRefreshStream: async () => null, onRemove: vi.fn(), onFocus: vi.fn(),
};
const muteMessage = (muted: boolean) => [{ source: "multisport420-app", type: "multisport420:set-muted", muted }, "*"];

async function setup(focusedSlug = a.slug) {
  const view = render(<Multiscreen {...base} focusedSlug={focusedSlug} />);
  const frameA = view.getByTitle("(1) Screen A") as HTMLIFrameElement;
  const frameB = view.getByTitle("(2) Screen B") as HTMLIFrameElement;
  await waitFor(() => expect(frameA.srcdoc).toContain("Video"));
  const audioA = vi.spyOn(frameA.contentWindow!, "postMessage");
  const audioB = vi.spyOn(frameB.contentWindow!, "postMessage");
  return { ...view, frameA, frameB, audioA, audioB };
}

it("keeps A playing through scoreboard promotion, then transfers audio to B without remounting videos", async () => {
  const { rerender, frameA, frameB, audioA, audioB, container } = await setup();
  fireEvent.load(frameA);
  fireEvent.load(frameB);
  expect(audioA).toHaveBeenLastCalledWith(...muteMessage(false));
  expect(audioB).toHaveBeenLastCalledWith(...muteMessage(true));
  audioA.mockClear(); audioB.mockClear();

  rerender(<Multiscreen {...base} focusedSlug={FANTASY_SCOREBOARD.slug} />);
  expect(container.querySelector(".screen-card-spotlight")?.textContent).toContain("Scoreboard");
  expect(audioA).not.toHaveBeenCalled();
  expect(audioB).not.toHaveBeenCalled();
  expect(container.querySelectorAll("iframe")[0]).toBe(frameA);
  // Reloading a video while reading the scoreboard retains its audio state too.
  fireEvent.load(frameA);
  expect(audioA).toHaveBeenLastCalledWith(...muteMessage(false));
  audioA.mockClear();

  rerender(<Multiscreen {...base} focusedSlug={b.slug} />);
  expect(audioA.mock.calls).toEqual([muteMessage(true)]);
  expect(audioB.mock.calls).toEqual([muteMessage(false)]);
  expect(container.querySelectorAll("iframe")[1]).toBe(frameB);
});

it("preserves explicit mute while visiting the scoreboard and ignores mute commands addressed to it", async () => {
  const { rerender, frameA, audioA, audioB } = await setup();
  const muted = { ...base, muteToggleSlug: a.slug, muteToggleRequestId: 1 };
  rerender(<Multiscreen {...muted} focusedSlug={a.slug} />);
  expect(audioA).toHaveBeenLastCalledWith(...muteMessage(true));
  audioA.mockClear(); audioB.mockClear();
  rerender(<Multiscreen {...muted} focusedSlug={FANTASY_SCOREBOARD.slug} />);
  rerender(<Multiscreen {...base} muteToggleSlug={FANTASY_SCOREBOARD.slug} muteToggleRequestId={2} focusedSlug={FANTASY_SCOREBOARD.slug} />);
  rerender(<Multiscreen {...base} muteToggleRequestId={2} focusedSlug={a.slug} />);
  expect(audioA).not.toHaveBeenCalled();
  expect(audioB).not.toHaveBeenCalled();
  fireEvent.load(frameA);
  expect(audioA).toHaveBeenLastCalledWith(...muteMessage(true));
});

it("starts silently with the scoreboard and does not choose another audio source when the previous video closes", async () => {
  const { rerender, frameA, frameB, audioB } = await setup(FANTASY_SCOREBOARD.slug);
  fireEvent.load(frameB);
  expect(audioB).toHaveBeenLastCalledWith(...muteMessage(true));
  rerender(<Multiscreen {...base} focusedSlug={a.slug} />);
  rerender(<Multiscreen {...base} focusedSlug={FANTASY_SCOREBOARD.slug} />);
  audioB.mockClear();
  rerender(<Multiscreen {...base} streams={[b, FANTASY_SCOREBOARD]} focusedSlug={FANTASY_SCOREBOARD.slug} />);
  expect(frameA.isConnected).toBe(false);
  expect(audioB).not.toHaveBeenCalled();
  fireEvent.load(frameB);
  expect(audioB).toHaveBeenLastCalledWith(...muteMessage(true));
});
