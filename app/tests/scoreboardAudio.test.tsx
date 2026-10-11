// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import Multiscreen from "../src/app_x/components/Multiscreen";
import { FANTASY_SCOREBOARD } from "../src/app_x/lib/fantasyScoreboard";
import { VIEWING_LAYOUTS } from "../src/app_x/lib/viewingLayouts";
import { presentationOf, reduceRoom, type RoomState } from "../src/app_x/lib/roomState";

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

it("switches all twelve layouts and selectors without reloading players or changing audio", async () => {
  const { rerender, frameA, frameB, audioA, audioB, container } = await setup();
  const src = frameA.srcdoc;
  for (const { id: layout } of VIEWING_LAYOUTS) {
    audioA.mockClear(); audioB.mockClear();
    rerender(<Multiscreen {...base} layout={layout} focusedSlug={a.slug} />);
    expect(container.querySelectorAll("iframe")[0]).toBe(frameA);
    expect(container.querySelectorAll("iframe")[1]).toBe(frameB);
    expect(frameA.srcdoc).toBe(src);
    expect(audioA).not.toHaveBeenCalled();
    expect(audioB).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[data-audio-focused="true"]')).toHaveLength(1);
    if (layout === "dual") expect(container.querySelectorAll('[data-prominent="true"]')).toHaveLength(2);
  }
  rerender(<Multiscreen {...base} layout="dual" showStreamSelector focusedSlug={a.slug} />);
  expect(audioA).toHaveBeenLastCalledWith({ source: "multisport420-app", type: "multisport420:set-stream-selector", visible: true }, "*");
  expect(frameA.srcdoc).toBe(src);
  fireEvent.load(frameA);
  expect(audioA).toHaveBeenLastCalledWith(...muteMessage(false));
  fireEvent.load(frameB);
  expect(audioB).toHaveBeenLastCalledWith(...muteMessage(true));
});

it("keeps dual sides pinned when sound changes, shows mute state, and retains players on swap", async () => {
  const { rerender, frameA, frameB, audioA, audioB, container, getByRole } = await setup();
  let state: RoomState = { streams: base.streams, focusedSlug: "a", displayLogs: false, command: null,
    layout: "dual", leftSlug: "a", rightSlug: "b", audioSlug: "a", audioMuted: false };
  const show = () => rerender(<Multiscreen {...base} layout="dual" focusedSlug={state.focusedSlug}
    presentation={presentationOf(state)} onPresentationAction={(action) => { state = reduceRoom(state, action, "test"); show(); }} />);
  show();
  const leftPlacement = frameA.closest("article")!.style.gridColumn;
  const rightPlacement = frameB.closest("article")!.style.gridColumn;
  audioA.mockClear(); audioB.mockClear();
  fireEvent.click(getByRole("button", { name: "Sound on right: Screen B" }));
  expect(frameA.closest("article")!.style.gridColumn).toBe(leftPlacement);
  expect(frameB.closest("article")!.style.gridColumn).toBe(rightPlacement);
  expect(audioA).toHaveBeenLastCalledWith(...muteMessage(true));
  expect(audioB).toHaveBeenLastCalledWith(...muteMessage(false));
  expect(container.querySelectorAll('[data-audible="true"]')).toHaveLength(1);
  fireEvent.click(getByRole("button", { name: "Mute right sound" }));
  expect(container.querySelectorAll('[data-audible="true"]')).toHaveLength(0);
  expect(audioB).toHaveBeenLastCalledWith(...muteMessage(true));
  state = reduceRoom(state, { type: "swap-sides" }, "swap"); show();
  expect(frameA.closest("article")!.style.gridColumn).toBe(rightPlacement);
  expect(frameB.closest("article")!.style.gridColumn).toBe(leftPlacement);
  expect(container.querySelectorAll("iframe")[0]).toBe(frameA);
  expect(container.querySelectorAll("iframe")[1]).toBe(frameB);
});

it.each(VIEWING_LAYOUTS)("mutes before transferring audio in $label, including reverse tile order", async ({ id: layout }) => {
  const { rerender, audioA, audioB, container } = await setup();
  for (const slug of [b.slug, a.slug]) {
    audioA.mockClear(); audioB.mockClear();
    rerender(<Multiscreen {...base} layout={layout} displayLogs focusedSlug={slug} />);
    const muted = slug === a.slug ? audioB : audioA;
    const audible = slug === a.slug ? audioA : audioB;
    expect(muted).toHaveBeenLastCalledWith(...muteMessage(true));
    expect(audible).toHaveBeenLastCalledWith(...muteMessage(false));
    expect(muted.mock.invocationCallOrder[0]).toBeLessThan(audible.mock.invocationCallOrder[0]);
    expect(container.querySelectorAll('[data-audio-focused="true"]')).toHaveLength(1);
    if (layout !== "spotlight") expect(container.querySelector(".log-panel")).toBeNull();
  }
});
