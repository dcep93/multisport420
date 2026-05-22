(() => {
  const APP_MESSAGE_SOURCE = "multisport420-app";
  const SET_MUTED = "multisport420:set-muted";
  const TOGGLE_MUTE = "multisport420:toggle-mute";
  let lastSetMutedMessage = null;
  const hideDontfoid = () => {
    const dontfoid = document.querySelector("#dontfoid");

    if (dontfoid instanceof HTMLElement) {
      dontfoid.style.display = "none";
      return;
    }

    window.requestAnimationFrame(hideDontfoid);
  };

  hideDontfoid();

  const forwardToChildIframes = (message) => {
    document.querySelectorAll("iframe").forEach((iframe) => {
      iframe.contentWindow?.postMessage(message, "*");
    });
  };

  window.addEventListener("message", (event) => {
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
})();
