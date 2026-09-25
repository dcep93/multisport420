const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const guard = fs.readFileSync(`${__dirname}/popup_guard.js`, "utf8");

function harness(ancestors = ["https://multisport420.web.app"]) {
  const listeners = new Map();
  const originalOpen = () => "opened";
  const window = { location: { ancestorOrigins: ancestors }, open: originalOpen,
    addEventListener(type, listener, capture) { assert.equal(capture, true); listeners.set(type, listener); } };
  class Anchor { constructor(target) { this.target = target; } getAttribute(name) { return name === "target" ? this.target : null; } }
  vm.runInNewContext(guard, { window, URL, HTMLAnchorElement: Anchor });
  return { window, originalOpen, click(target, type = "click") {
    let prevented = false, stopped = false;
    const path = target === null ? [{}] : [{}, new Anchor(target)];
    listeners.get(type)?.({ composedPath: () => path, preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } });
    return { prevented, stopped };
  } };
}

test("blocks scripted player popups before click handlers and resists reassignment", () => {
  const h = harness();
  assert.equal(h.window.open("https://ad.example"), null);
  h.window.open = () => "bypass";
  assert.equal(h.window.open("https://ad.example"), null);
  assert.equal(Reflect.defineProperty(h.window, "open", { value: () => "bypass" }), false);
});
test("blocks new-window, top, parent and named-window links including middle clicks", () => {
  const h = harness(["https://embed.st", "http://localhost:4173"]);
  for (const target of ["_blank", "_TOP", "_parent", "advertisement"]) {
    for (const type of ["click", "auxclick"]) assert.deepEqual(h.click(target, type), { prevented: true, stopped: true });
  }
});
test("preserves play, mute, fullscreen buttons and same-frame links", () => {
  const h = harness();
  for (const target of [null, "", "_self"]) assert.deepEqual(h.click(target), { prevented: false, stopped: false });
});
test("leaves standalone player sites and unrelated parent sites unchanged", () => {
  for (const ancestors of [[], ["https://other.example"], ["https://multisport420.web.app.evil.example"], ["null"]]) {
    const h = harness(ancestors);
    assert.equal(h.window.open, h.originalOpen);
    assert.equal(h.window.open(), "opened");
    assert.deepEqual(h.click("_blank"), { prevented: false, stopped: false });
  }
});
