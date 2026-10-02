// One invisible extension document owns one ESPN frame. Requests for different
// leagues serialize; simultaneous requests for the same league share the work.
globalThis.withScoreboardFrame = (() => {
  const prefix = "multisport420:scoreboard:";
  const inflight = new Map();
  let queue = Promise.resolve();
  let frame;
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type !== `${prefix}idle` || sender.url !== chrome.runtime.getURL("scoreboard_offscreen.html")) return false;
    if (!inflight.size) queue = queue.catch(() => {}).then(async () => {
      frame = undefined;
      await chrome.offscreen.closeDocument().catch(() => {});
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [4201] });
    }).catch(() => {});
    else void chrome.runtime.sendMessage({ type: `${prefix}touch` }).catch(() => {});
    reply(true);
    return false;
  });

  chrome.runtime.onConnect.addListener(port => {
    if (!port.name.startsWith(prefix)) return;
    if (!frame || port.name !== `${prefix}${frame.token}` || port.sender?.tab ||
        port.sender?.url !== frame.url) {
      port.disconnect();
      return;
    }
    frame.port = port;
    frame.resolve(port);
    port.onDisconnect.addListener(() => {
      if (frame?.port === port) frame = undefined;
    });
  });

  async function connect(url) {
    if (frame?.baseUrl === url && frame.port) {
      await chrome.runtime.sendMessage({ type: `${prefix}touch` });
      return frame.port;
    }
    const documentUrl = chrome.runtime.getURL("scoreboard_offscreen.html");
    const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [documentUrl] });
    // ESPN's frame restriction is changed only for this exact league page in
    // our offscreen document, never for normal tabs or website embeds.
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [4201], addRules: [{
      id: 4201, priority: 1,
      action: { type: "modifyHeaders", responseHeaders: [
        { header: "content-security-policy", operation: "set", value: `frame-ancestors 'self' chrome-extension://${chrome.runtime.id}` },
        { header: "x-frame-options", operation: "remove" },
      ] },
      condition: { regexFilter: `^${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(#multisport420-scoreboard=[a-f0-9-]+)?$`,
        initiatorDomains: [chrome.runtime.id], resourceTypes: ["sub_frame"], tabIds: [-1] },
    }] });
    if (!contexts.length) await chrome.offscreen.createDocument({ url: "scoreboard_offscreen.html",
      reasons: ["IFRAME_SCRIPTING"], justification: "Fetch the last manually opened fantasy league inside a hidden ESPN frame when its tab is closed." });
    const token = crypto.randomUUID();
    let timer;
    try {
      const ready = new Promise((resolve, reject) => {
        frame = { baseUrl: url, url: `${url}#multisport420-scoreboard=${token}`, token, resolve };
        timer = setTimeout(() => reject(new Error("Could not open your saved ESPN league in the background. Open the league once in Chrome, then refresh.")), 5000);
      });
      const [, port] = await Promise.all([chrome.runtime.sendMessage({ type: `${prefix}mount`, url: frame.url }), ready]);
      return port;
    } catch (error) {
      frame = undefined;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return (url, useTarget) => {
    if (inflight.has(url)) return inflight.get(url);
    const job = queue.catch(() => {}).then(async () => {
      const port = await connect(url);
      return useTarget({ frameUrl: port.sender.url, send(message) {
        return new Promise((resolve, reject) => {
          const onMessage = result => {
            if (result.requestId !== message.requestId) return;
            cleanup();
            resolve(result.response);
          };
          const onDisconnect = () => { cleanup(); reject(new Error("The background ESPN connection closed. Try refreshing.")); };
          const timer = setTimeout(() => { cleanup(); reject(new Error("ESPN took too long to respond. Try refreshing.")); }, 15000);
          const cleanup = () => { clearTimeout(timer); port.onMessage.removeListener(onMessage); port.onDisconnect.removeListener(onDisconnect); };
          port.onMessage.addListener(onMessage);
          port.onDisconnect.addListener(onDisconnect);
          try { port.postMessage(message); } catch (error) { cleanup(); reject(error); }
        });
      } });
    });
    inflight.set(url, job);
    queue = job;
    job.finally(() => {
      inflight.delete(url);
    }).catch(() => {});
    return job;
  };
})();
