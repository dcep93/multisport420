(() => {
  const HOST_HOSTNAMES = new Set(["localhost", "multisport420.web.app"]);
  const APP_MESSAGE_SOURCE = "multisport420-app";
  const SET_MUTED = "multisport420:set-muted";
  const TOGGLE_MUTE = "multisport420:toggle-mute";
  const ancestorOrigins = Array.from(window.location.ancestorOrigins ?? []);
  const isDescendantOfMultisportHost = ancestorOrigins.some((origin) =>
    HOST_HOSTNAMES.has(new URL(origin).hostname),
  );
  let currentVideo = null;
  let requestedMutedState = true;

  if (!isDescendantOfMultisportHost) {
    return;
  }

  window.addEventListener("message", (event) => {
    if (event.data?.source !== APP_MESSAGE_SOURCE) {
      return;
    }

    if (event.data?.type === SET_MUTED) {
      requestedMutedState = event.data.muted !== false;
      applyRequestedMutedState();
      return;
    }

    if (event.data?.type !== TOGGLE_MUTE) {
      return;
    }

    if (!(currentVideo instanceof HTMLVideoElement)) {
      return;
    }

    requestedMutedState = !currentVideo.muted;
    applyRequestedMutedState();
  });

  waitForVideoElement();

  function waitForVideoElement() {
    let stopped = false;

    const checkForVideo = () => {
      if (stopped) {
        return;
      }

      const video = document.querySelector("video");

      if (video instanceof HTMLVideoElement) {
        stopped = true;
        init(video);
        return;
      }

      window.requestAnimationFrame(checkForVideo);
    };

    checkForVideo();
  }

  function init(video) {
    currentVideo = video;
    video.autoplay = true;
    video.playsInline = true;
    applyRequestedMutedState();
    const playResult = video.play();

    if (!playResult || typeof playResult.then !== "function") {
      return;
    }

    void playResult.catch((error) => {
      console.log("multisport:pooembed:play-error", error);
    });
  }

  function applyRequestedMutedState() {
    if (!(currentVideo instanceof HTMLVideoElement)) {
      return;
    }

    currentVideo.muted = requestedMutedState;
  }
})();
