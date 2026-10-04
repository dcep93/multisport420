(() => {
  const APP_MESSAGE_SOURCE = "multisport420-app";
  const SET_MUTED = "multisport420:set-muted";
  const TOGGLE_MUTE = "multisport420:toggle-mute";
  const AUDIO_READY = "multisport420:audio-ready";
  let lastSetMutedMessage = null;

  const forwardToChildIframes = (message) => {
    document.querySelectorAll("iframe").forEach((iframe) => {
      iframe.contentWindow?.postMessage(message, "*");
    });
  };

  window.addEventListener("message", (event) => {
    if (event.data?.source === APP_MESSAGE_SOURCE && event.data?.type === AUDIO_READY) {
      // Only reply to the child that became ready; don't reset other players.
      const child = Array.from(document.querySelectorAll("iframe"))
        .find(iframe => iframe.contentWindow === event.source);
      if (child && lastSetMutedMessage) child.contentWindow.postMessage(lastSetMutedMessage, "*");
      return;
    }
    if (
      event.data?.source !== APP_MESSAGE_SOURCE ||
      ![TOGGLE_MUTE, SET_MUTED].includes(event.data?.type)
    ) {
      return;
    }

    if (event.data.type === SET_MUTED) {
      lastSetMutedMessage = event.data;
    }

    forwardToChildIframes(event.data);
  });

  window.addEventListener(
    "load",
    (event) => {
      if (!lastSetMutedMessage) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLIFrameElement)) {
        return;
      }

      target.contentWindow?.postMessage(lastSetMutedMessage, "*");
    },
    true,
  );
  window.parent.postMessage({ source: APP_MESSAGE_SOURCE, type: AUDIO_READY }, "*");
})();
