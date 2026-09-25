// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseStreamsFromHtml, parseStreamWatchPage } from "../src/app_x/hosts/istreameast/streams";
import { renderIstreameastPlayerDocument } from "../src/app_x/hosts/istreameast/iframe";

afterEach(() => vi.useRealTimers());
const card = `<article class="stream-card upcoming" data-starts="1790295300" data-ends="1790309700" data-live="0"><a href="https://streameasto.cx/live/nfl/2026-09-25/green-bay-packers-vs-atlanta-falcons" class="card-link"><span class="card-cat">NFL</span><h3 class="card-title">Green Bay Packers vs Atlanta Falcons</h3></a></article>`;
const list = (html: string) => `<div class="stream-grid">${html}</div>`;
const encode = (text: string) => btoa(Array.from(text, c => String.fromCharCode(c.charCodeAt(0) ^ 0x4f)).join(""));

describe("StreamEast source compatibility", () => {
  it("reads the current Packers listing, deduplicates it, and retains it beyond the old three-hour cutoff", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-25T03:45:00Z"));
    const streams = parseStreamsFromHtml(list(card + card), [], ["NFL"]);
    expect(streams).toHaveLength(1);
    expect(streams[0]).toMatchObject({ title: "Atlanta Falcons @ Green Bay Packers", category: "NFL", slug: "GreenBayPackers" });
    vi.setSystemTime(new Date("2026-09-25T04:15:00Z"));
    expect(parseStreamsFromHtml(list(card), [], ["NFL"])).toEqual([]);
  });
  it("retains the one-hour upcoming window and rejects other categories", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-24T23:30:00Z"));
    expect(parseStreamsFromHtml(list(card), [], ["NFL"])).toHaveLength(1);
    expect(parseStreamsFromHtml(list(card), [], ["MLB"])).toEqual([]);
    vi.setSystemTime(new Date("2026-09-24T22:30:00Z"));
    expect(parseStreamsFromHtml(list(card), [], ["NFL"])).toEqual([]);
  });
  it("supports legacy cards and reports unexpected source pages", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-25T00:30:00Z"));
    expect(parseStreamsFromHtml(`<div class="events-list"><div class="event-card" data-start-ts="1790295300" onclick="window.location.href='/game'"><span class="event-league">NFL</span><span class="event-title">Packers vs Falcons</span></div></div>`, [], ["NFL"])).toHaveLength(1);
    expect(() => parseStreamsFromHtml("<h1>Upstream unavailable</h1>", [], ["NFL"])).toThrow("unrecognized page");
    expect(parseStreamsFromHtml(list(""), [], ["NFL"])).toEqual([]);
  });
  it("follows the explicit Watch link and decodes the current player data", () => {
    expect(parseStreamWatchPage('<a href="https://streamseaste.cx/live/game">Watch</a>').watchPageUrl).toBe("https://streamseaste.cx/live/game");
    const encoded = "Jzs7Pzx1YGAqIi0qK2E8O2AqIi0qK2AuKyImIWA/PzliLjsjLiE7LmIpLiMsICE8Yi47Yig9KiohYi0uNmI/LiwkKj08YH4=";
    expect(parseStreamWatchPage(`<div id="player-container" data-e="${encoded}"></div>`).embedPageUrl).toBe("https://embed.st/embed/admin/ppv-atlanta-falcons-at-green-bay-packers/1");
  });
  it("extracts only an iframe URL from encoded markup and rejects executable URLs", () => {
    expect(parseStreamWatchPage(`<div id="player-container" data-e="${encode('<script>throw 1</script><iframe src="https://embed.st/embed/test"></iframe>')}"></div>`).embedPageUrl).toBe("https://embed.st/embed/test");
    expect(parseStreamWatchPage('<iframe id="main-player" src="javascript:alert(1)"></iframe>').embedPageUrl).toBe("");
    expect(parseStreamWatchPage('<div id="player-container" data-e="invalid"></div>').embedPageUrl).toBe("");
    expect(parseStreamWatchPage('<iframe id="main-player" src="/embed/test"></iframe>', "https://streamseaste.cx/live/game").embedPageUrl).toBe("https://streamseaste.cx/embed/test");
  });
  it("permits media without the sandbox rejected by the provider", () => {
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(renderIstreameastPlayerDocument({ _0_fetchedAtMs: 0, _1_rawUrl: "https://streameasto.cx/game", _2_embedPageUrl: "https://embed.st/embed/test" })), "text/html");
    const frame = doc.querySelector("iframe")!;
    expect(frame.hasAttribute("sandbox")).toBe(false);
    expect(frame.getAttribute("allow")).toContain("autoplay");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
  });
});
