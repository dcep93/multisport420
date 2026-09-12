// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { extensionHelper } from "../../src/app_x/scoreboard/extension";

afterEach(() => {
  delete document.documentElement.dataset.multisport420ExtensionId;
  delete document.documentElement.dataset.fantasy420ExtensionId;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("waits for late Multisport injection and sends to its runtime ID", async () => {
  vi.useFakeTimers();
  document.documentElement.dataset.fantasy420ExtensionId = "unrelated-extension";
  const sendMessage = vi.fn((_id, _payload, reply) => reply({ fetched: 1 }));
  vi.stubGlobal("chrome", { runtime: { sendMessage } });
  const payload = { scoreboard: { action: "fetch" } };
  const pending = extensionHelper(payload);
  await vi.advanceTimersByTimeAsync(500);
  expect(sendMessage).not.toHaveBeenCalled();
  document.documentElement.dataset.multisport420ExtensionId = "native-extension";
  await vi.advanceTimersByTimeAsync(50);
  await expect(pending).resolves.toEqual({ fetched: 1 });
  expect(sendMessage).toHaveBeenCalledWith("native-extension", payload, expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
});

it("times out when only Fantasy420 is installed", async () => {
  vi.useFakeTimers();
  document.documentElement.dataset.fantasy420ExtensionId = "fantasy-extension";
  const sendMessage = vi.fn();
  vi.stubGlobal("chrome", { runtime: { sendMessage } });
  const pending = expect(extensionHelper({})).rejects.toThrow("Multisport420 extension unavailable");
  await vi.advanceTimersByTimeAsync(3000);
  await pending;
  expect(sendMessage).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("reports Chrome runtime failures and empty responses", async () => {
  document.documentElement.dataset.multisport420ExtensionId = "native-extension";
  const runtime = {
    lastError: undefined as { message: string } | undefined,
    sendMessage: vi.fn((_id, _payload, reply) => reply(undefined)),
  };
  vi.stubGlobal("chrome", { runtime });
  await expect(extensionHelper({})).rejects.toThrow("Empty extension response");
  runtime.lastError = { message: "Extension context invalidated" };
  await expect(extensionHelper({})).rejects.toThrow("Extension context invalidated");
  vi.stubGlobal("chrome", undefined);
  await expect(extensionHelper({})).rejects.toThrow("Chrome extension runtime unavailable");
});
