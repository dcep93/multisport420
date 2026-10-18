const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(`${__dirname}/embedsports.js`, "utf8");
const ready = { source: "multisport420-app", type: "multisport420:audio-ready" };

test("uncached child readiness requests upstream state; cached replies target only that child", () => {
  let receive;
  const upstream = [];
  const childMessages = [[], []];
  const children = childMessages.map(messages => ({ contentWindow: { postMessage: message => messages.push(message) } }));
  vm.runInNewContext(source, {
    document: { querySelectorAll: () => children },
    window: {
      parent: { postMessage: message => upstream.push(message) },
      addEventListener(type, listener) { if (type === "message") receive = listener; },
    },
  });
  assert.equal(upstream.length, 1);
  receive({ source: {}, data: ready });
  assert.equal(upstream.length, 1);
  receive({ source: children[0].contentWindow, data: ready });
  assert.equal(upstream.length, 2);
  assert.equal(upstream[1].type, ready.type);
  const mute = { source: "multisport420-app", type: "multisport420:set-muted", muted: true };
  receive({ data: mute });
  const unmute = { ...mute, muted: false };
  receive({ data: unmute });
  childMessages.forEach(messages => { messages.length = 0; });
  receive({ source: children[1].contentWindow, data: ready });
  assert.equal(upstream.length, 2);
  assert.deepEqual(childMessages, [[], [unmute]]);
});
