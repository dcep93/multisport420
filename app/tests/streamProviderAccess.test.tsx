// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { checkStreamProviderAccess, StreamProviderBlockedError } from "../src/app_x/lib/streamProviderAccess";
import { fetchIstreameastHtml, fetchIstreameastPageText } from "../src/app_x/hosts/istreameast/proxy";
import Menu from "../src/app_x/components/Menu";

const provider = "https://streameasto.cx/";
const warning = '<title>Suspected Malware | Cloudflare</title><div id="cf-wrapper"><h2>Suspected Malware</h2></div>';
const challenge = '<title>Just a moment...</title><form id="challenge-form"></form>';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Cloudflare handoff", () => {
  it.each([warning, challenge, '<title>Attention Required! | Cloudflare</title><div id="cf-wrapper"></div>'])(
    "recognizes a Cloudflare interstitial and preserves the requested page URL", (html) => {
      try {
        checkStreamProviderAccess(html, provider);
        expect.fail("Expected a blocked-provider error");
      } catch (error) {
        expect(error).toBeInstanceOf(StreamProviderBlockedError);
        expect((error as StreamProviderBlockedError).providerUrl).toBe(provider);
      }
    },
  );

  it("preserves the actual malware warning", () => {
    expect(() => checkStreamProviderAccess(warning, provider)).toThrow("suspected malware");
  });

  it("does not classify ordinary pages mentioning Cloudflare as blocked", () => {
    expect(() => checkStreamProviderAccess('<title>Sports</title><div class="stream-grid">Cloudflare</div><script src="/cdn-cgi/challenge-platform/script.js"></script>', provider)).not.toThrow();
  });

  it.each([200, 403, 503])("detects HTTP %s warnings before writing them to cache", async status => {
    const open = vi.fn(() => { throw new Error("Unexpected cache access"); });
    vi.stubGlobal("indexedDB", { open });
    const fetch = vi.fn().mockResolvedValue(new Response(warning, { status }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchIstreameastHtml(0, 0)).rejects.toBeInstanceOf(StreamProviderBlockedError);
    expect(open).not.toHaveBeenCalled();
    expect(JSON.parse(fetch.mock.calls[0][1].body).maxAgeMs).toBe(0);
  });

  it("links a blocked watch page to that exact provider page", async () => {
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(challenge)));
    await expect(fetchIstreameastPageText(provider + "live/game", 0, 0)).rejects.toMatchObject({ providerUrl: provider + "live/game" });
  });

  it("allows a fresh request to succeed after an upstream block is resolved", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const fetch = vi.fn().mockResolvedValueOnce(new Response(warning))
      .mockResolvedValueOnce(new Response('<div class="stream-grid"></div>'));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchIstreameastHtml(0, 0)).rejects.toThrow("suspected malware");
    await expect(fetchIstreameastHtml(0, 0)).resolves.toContain("stream-grid");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["javascript:alert(1)", "https://user:secret@example.com/"])("rejects unsafe handoff URLs: %s", url => {
    expect(() => new StreamProviderBlockedError("blocked", url)).toThrow("Invalid stream provider URL");
  });

  it("offers user-controlled provider navigation and refresh, without opening popups automatically", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const retry = vi.fn();
    const props = { category: "NFL", categories: ["NFL"], streams: [], isLoadingStreams: false,
      selectedSlugs: [], onToggle: vi.fn(), onCategoryChange: vi.fn(), displayLogs: false,
      logDelayMs: 30000, onDisplayLogsChange: vi.fn(), onLogDelayMsChange: vi.fn(),
      onClearCache: vi.fn(), onRefreshStreams: vi.fn(), onRetryStreams: retry };
    const { rerender } = render(<Menu {...props} streamError={new StreamProviderBlockedError("Cloudflare has flagged the stream provider for suspected malware.", provider)} />);
    const link = screen.getByRole("link", { name: "Open stream provider" });
    expect(link.getAttribute("href")).toBe(provider);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText(/return here and refresh streams/)).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry streams" }));
    expect(retry).toHaveBeenCalledOnce();
    rerender(<Menu {...props} streamError={new Error("Network unavailable")} />);
    expect(screen.queryByRole("link", { name: "Open stream provider" })).toBeNull();
  });
});
