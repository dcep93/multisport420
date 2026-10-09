// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
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
  it("retains provider alternatives, removes duplicates, and rejects unsafe sources", () => {
    const first = "https://embed.st/embed/game/1";
    const second = "https://embed.st/embed/game/2";
    const page = parseStreamWatchPage(`<div id="player-container" data-e="${encode(first)}"></div>
      <button class="stream-btn" data-e="${encode(first)}">Stream 1</button>
      <button class="stream-btn" data-e="${encode(second)}">Stream 2</button>
      <button class="stream-btn" data-e="${encode(second)}">Duplicate</button>
      <button class="server-btn" data-src="javascript:alert(1)">Unsafe</button>
      <button class="stream-btn" data-e="invalid">Invalid</button>`);
    expect(page.embedSources).toEqual([{ label: "Stream 1", url: first }, { label: "Stream 2", url: second }]);
  });
  it("switches only the player, remembers the choice across refresh, and retains mute forwarding", () => {
    const first = "https://embed.st/embed/game/1";
    const second = "https://embed.st/embed/game/2";
    const html = renderToStaticMarkup(renderIstreameastPlayerDocument({
      _0_fetchedAtMs: 0, _1_rawUrl: "https://streamseaste.cx/game?fetchTimeMs=1", _2_embedPageUrl: first,
      _3_embedSources: [{ label: "Stream 1", url: first }, { label: "Stream 2", url: second }],
    }));
    const dom = new JSDOM(html, { url: "https://multisport420.web.app/", runScripts: "outside-only", pretendToBeVisual: true });
    try {
      const { window } = dom;
      const document = window.document;
      window.eval(document.querySelector("script")!.textContent!);
      document.dispatchEvent(new window.Event("DOMContentLoaded"));
      const frame = document.querySelector("iframe")!;
      const buttons = document.querySelectorAll("button");
      buttons[1].click();
      expect(frame.src).toBe(second);
      expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
      expect(buttons[0].getAttribute("aria-pressed")).toBe("false");
      const preferenceKey = "multisport420:stream:https://streamseaste.cx/game";
      expect(window.localStorage.getItem(preferenceKey)).toBe(second);
      const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
      const message = { source: "multisport420-app", type: "multisport420:set-muted", muted: true };
      window.dispatchEvent(new window.MessageEvent("message", { data: message }));
      frame.dispatchEvent(new window.Event("load"));
      expect(postMessage).toHaveBeenLastCalledWith(message, "*");
      const reloaded = new JSDOM(html.replace("fetchTimeMs=1", "fetchTimeMs=2"), { url: "https://multisport420.web.app/", runScripts: "outside-only" });
      try {
        reloaded.window.localStorage.setItem(preferenceKey, window.localStorage.getItem(preferenceKey)!);
        reloaded.window.eval(reloaded.window.document.querySelector("script")!.textContent!);
        reloaded.window.document.dispatchEvent(new reloaded.window.Event("DOMContentLoaded"));
        expect(reloaded.window.document.querySelector("iframe")!.src).toBe(second);
      } finally { reloaded.window.close(); }
    } finally { dom.window.close(); }
  });
});
