const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("../app/node_modules/jsdom");
const manifest = require("./manifest.json");

// Exercise the shipped registrations, not just a controller loaded by hand.
function player(slug, ancestors = ["https://multisport420.web.app"]) {
  const url = `https://taifood-blog.asia/embed/nfl/2026-11-01/${slug}`;
  const dom = new JSDOM("<video></video>", { url, runScripts: "outside-only" });
  const { window } = dom;
  const observers = [];
  const NativeObserver = window.MutationObserver;
  window.MutationObserver = class extends NativeObserver {
    constructor(callback) { super(callback); observers.push(this); }
  };
  Object.defineProperty(window.location, "ancestorOrigins", { value: ancestors });
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  const messages = [];
  window.postMessage = message => messages.push(message);
  for (const registration of manifest.content_scripts) {
    const matches = registration.matches.some(pattern => {
      const regex = pattern.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
      return new RegExp(`^${regex}$`).test(url);
    });
    if (matches) for (const script of registration.js ?? []) {
      window.eval(fs.readFileSync(`${__dirname}/${script}`, "utf8"));
    }
  }
  return {
    video: window.document.querySelector("video"), messages,
    mute(muted) {
      window.dispatchEvent(new window.MessageEvent("message", {
        data: { source: "multisport420-app", type: "multisport420:set-muted", muted },
      }));
    },
    close() { observers.forEach(observer => observer.disconnect()); window.close(); },
  };
}

test("live provider registrations keep only the selected game audible", () => {
  const bills = player("bal-buf");
  const bengals = player("ten-cin_540p");
  try {
    for (const stream of [bills, bengals]) {
      assert.equal(stream.video.muted, true, "new embedded streams must start muted");
      assert.ok(stream.messages.some(message => message.type === "multisport420:audio-ready"));
    }
    bills.mute(false);
    assert.equal(bills.video.muted, false);
    assert.equal(bengals.video.muted, true);
    bills.mute(true);
    bengals.mute(false);
    assert.equal(bills.video.muted, true);
    assert.equal(bengals.video.muted, false);
    bengals.mute(true);
    assert.equal(bengals.video.muted, true);
  } finally {
    bills.close();
    bengals.close();
  }
});

test("new provider registration leaves standalone player audio unchanged", () => {
  const standalone = player("bal-buf", []);
  try {
    standalone.mute(true);
    assert.equal(standalone.video.muted, false);
    assert.equal(standalone.messages.length, 0);
  } finally { standalone.close(); }
});
