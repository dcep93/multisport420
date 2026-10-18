const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const controller = fs.readFileSync(`${__dirname}/pooembed.js`, "utf8");
const SOURCE = "multisport420-app";
const SET_MUTED = "multisport420:set-muted";
const TOGGLE_MUTE = "multisport420:toggle-mute";

function harness(options = {}) {
  const listeners = new Map();
  let onMutation = () => {};
  const logs = [];
  const parentMessages = [];
  class Video {
    constructor() {
      this.muted = options.initialMuted ?? false;
      this.playCalls = 0;
      this.listeners = new Map();
    }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    removeEventListener(type) { this.listeners.delete(type); }
    play() {
      this.playCalls += 1;
      return options.playError ? Promise.reject(options.playError) : Promise.resolve();
    }
    manuallyMute(muted) {
      this.muted = muted;
      this.listeners.get("volumechange")?.();
    }
  }
  const video = new Video();
  let attachedVideo = options.videoMissing ? null : video;
  vm.runInNewContext(controller, {
    URL,
    HTMLVideoElement: Video,
    MutationObserver: class { constructor(callback) { onMutation = callback; } observe() {} },
    console: { log(...args) { logs.push(args); } },
    document: { querySelector(selector) { assert.equal(selector, "video"); return attachedVideo; } },
    window: {
      parent: { postMessage(message) { parentMessages.push(message); } },
      location: { ancestorOrigins: options.ancestors ?? ["https://multisport420.web.app"] },
      addEventListener(type, listener) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(listener);
      },
    },
  });
  return {
    video, logs, parentMessages,
    mutate: () => onMutation(),
    replaceVideo(deliverMutation = true) {
      attachedVideo = new Video();
      if (deliverMutation) onMutation();
      return attachedVideo;
    },
    removeVideo() { attachedVideo = null; onMutation(); },
    send(type, muted, source = SOURCE) {
      for (const listener of listeners.get("message") ?? []) {
        listener({ data: { source, type, muted } });
      }
    },
    attachVideo() {
      attachedVideo = video;
      onMutation();
    },
  };
}

test("controller requests the latest audio state when it is ready", () => {
  const h = harness();
  assert.equal(h.parentMessages.length, 1);
  assert.equal(h.parentMessages[0].source, SOURCE);
  assert.equal(h.parentMessages[0].type, "multisport420:audio-ready");
  assert.equal(harness({ ancestors: [] }).parentMessages.length, 0);
});

test("independent screen players accept mute toggles without direct player interaction", () => {
  const first = harness();
  const second = harness();
  assert.equal(first.video.muted, true);
  assert.equal(second.video.muted, true);
  first.send(TOGGLE_MUTE);
  assert.equal(first.video.muted, false);
  assert.equal(second.video.muted, true);
  second.send(TOGGLE_MUTE);
  assert.equal(second.video.muted, false);
  assert.equal(first.video.muted, false);
});

test("repeated toggles invert the player's actual mute state, including manual changes", () => {
  const h = harness();
  h.send(TOGGLE_MUTE);
  assert.equal(h.video.muted, false);
  h.send(TOGGLE_MUTE);
  assert.equal(h.video.muted, true);
  h.video.manuallyMute(false);
  h.send(TOGGLE_MUTE);
  assert.equal(h.video.muted, true);
});

test("spotlight unmute overrides a manual mute and repeated explicit commands", () => {
  const h = harness();
  h.send(SET_MUTED, false);
  assert.equal(h.video.muted, false);
  h.video.manuallyMute(true);
  h.send(SET_MUTED, false);
  assert.equal(h.video.muted, false);
  h.send(SET_MUTED, false);
  assert.equal(h.video.muted, false);
  h.send(SET_MUTED, true);
  h.send(SET_MUTED, true);
  assert.equal(h.video.muted, true);
});

test("spotlight unmutes a player that was muted before the controller attached", () => {
  const h = harness({ initialMuted: true });
  h.send(SET_MUTED, false);
  assert.equal(h.video.muted, false);
});

test("set-state commands received before the video exists are remembered", () => {
  for (const finalMuted of [false, true]) {
    const h = harness({ videoMissing: true, initialMuted: !finalMuted });
    h.send(SET_MUTED, !finalMuted);
    h.send(SET_MUTED, finalMuted);
    h.send(TOGGLE_MUTE);
    assert.equal(h.video.playCalls, 0);
    h.attachVideo();
    assert.equal(h.video.muted, finalMuted);
    assert.equal(h.video.autoplay, true);
    assert.equal(h.video.playsInline, true);
    assert.equal(h.video.playCalls, 1);
  }
});

test("unsupported ancestry ignores commands and leaves the player untouched", () => {
  for (const ancestors of [[], ["https://other.example"], ["https://multisport420.web.app.evil.example"]]) {
    const h = harness({ ancestors });
    h.send(SET_MUTED, true);
    h.send(TOGGLE_MUTE);
    assert.equal(h.video.muted, false);
    assert.equal(h.video.playCalls, 0);
  }
});

test("nested localhost players accept commands but wrong sources and types are ignored", () => {
  const h = harness({ ancestors: ["https://embed.st", "http://localhost:5173"] });
  h.send(SET_MUTED, false, "other-app");
  h.send(TOGGLE_MUTE, undefined, "other-app");
  h.send("other:toggle-mute");
  assert.equal(h.video.muted, true);
  h.send(SET_MUTED, false);
  assert.equal(h.video.muted, false);
});

test("autoplay rejection is handled without preventing later audio commands", async () => {
  const error = new Error("Autoplay disallowed");
  const h = harness({ playError: error });
  await Promise.resolve();
  assert.deepEqual(h.logs, [["multisport:pooembed:play-error", error]]);
  h.send(SET_MUTED, false);
  assert.equal(h.video.muted, false);
});

test("replacement video inherits audio state and the detached video is silenced", () => {
  for (const muted of [true, false]) {
    const h = harness({ initialMuted: !muted });
    h.send(SET_MUTED, muted);
    const replacement = h.replaceVideo();
    assert.equal(replacement.muted, muted);
    assert.equal(replacement.playCalls, 1);
    assert.equal(h.video.muted, true);
    replacement.manuallyMute(!muted);
    h.mutate();
    assert.equal(replacement.muted, !muted, "unrelated DOM changes preserve native mute");
    h.send(SET_MUTED, muted);
    assert.equal(replacement.muted, muted);
  }
});

test("commands reach replacements even before observer delivery, including removal gaps", () => {
  const h = harness();
  h.send(SET_MUTED, false);
  const replacement = h.replaceVideo(false);
  h.send(SET_MUTED, false);
  assert.equal(replacement.muted, false);
  h.mutate();
  assert.equal(replacement.playCalls, 1);
  h.removeVideo();
  h.send(SET_MUTED, true);
  const next = h.replaceVideo();
  assert.equal(next.muted, true);
  assert.equal(replacement.muted, true);
});

test("real DOM replacement restores spotlight audio without another command", async () => {
  const { JSDOM } = require("../app/node_modules/jsdom");
  const dom = new JSDOM("<video muted></video>", { runScripts: "outside-only" });
  const observers = [];
  const NativeObserver = dom.window.MutationObserver;
  dom.window.MutationObserver = class extends NativeObserver {
    constructor(callback) { super(callback); observers.push(this); }
  };
  try {
    const { window } = dom;
    Object.defineProperty(window.location, "ancestorOrigins", { value: ["https://multisport420.web.app"] });
    window.HTMLMediaElement.prototype.play = () => Promise.resolve();
    window.eval(controller);
    window.dispatchEvent(new window.MessageEvent("message", { data: { source: SOURCE, type: SET_MUTED, muted: false } }));
    const original = window.document.querySelector("video");
    assert.equal(original.muted, false);
    const replacement = window.document.createElement("video");
    replacement.muted = true;
    original.replaceWith(replacement);
    await Promise.resolve();
    assert.equal(replacement.muted, false);
    assert.equal(original.muted, true);
  } finally { observers.forEach(observer => observer.disconnect()); dom.window.close(); }
});
