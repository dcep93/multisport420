(() => {
  const HOST_HOSTNAMES = new Set(["localhost", "watchwall420.web.app"]);
  const APP_MESSAGE_SOURCE = "multisport420-app";
  const SET_MUTED = "multisport420:set-muted";
  const TOGGLE_MUTE = "multisport420:toggle-mute";
  const ancestorOrigins = Array.from(window.location.ancestorOrigins ?? []);
  const isDescendantOfMultisportHost = ancestorOrigins.some((origin) =>
    HOST_HOSTNAMES.has(new URL(origin).hostname),
  );
  let hasUserInteracted = false;
  let currentVideo = null;
  let requestedMutedState = true;
  let lastKnownMutedState = null;
  let didAppMuteCurrentVideo = false;
  let detachVideoListener = null;

  if (!isDescendantOfMultisportHost) {
    return;
  }

  const markUserInteraction = () => {
    hasUserInteracted = true;
  };

  window.addEventListener("pointerdown", markUserInteraction, { capture: true });
  window.addEventListener("keydown", markUserInteraction, { capture: true });
  window.addEventListener("touchstart", markUserInteraction, { capture: true });
  window.addEventListener("click", markUserInteraction, { capture: true });

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

    if (!hasUserInteracted || !(currentVideo instanceof HTMLVideoElement)) {
      return;
    }

    currentVideo.muted = !currentVideo.muted;
    requestedMutedState = currentVideo.muted;
    lastKnownMutedState = currentVideo.muted;
    didAppMuteCurrentVideo = false;
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
    detachVideoListener?.();
    currentVideo = video;
    lastKnownMutedState = video.muted;
    didAppMuteCurrentVideo = false;
    const handleVolumeChange = () => {
      if (!(currentVideo instanceof HTMLVideoElement)) {
        return;
      }

      if (currentVideo.muted === lastKnownMutedState) {
        return;
      }

      lastKnownMutedState = currentVideo.muted;
      didAppMuteCurrentVideo = false;
    };

    video.addEventListener("volumechange", handleVolumeChange);
    detachVideoListener = () => {
      video.removeEventListener("volumechange", handleVolumeChange);
      detachVideoListener = null;
    };
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

    if (requestedMutedState) {
      if (!currentVideo.muted) {
        currentVideo.muted = true;
        lastKnownMutedState = true;
        didAppMuteCurrentVideo = true;
      }
      return;
    }

    if (didAppMuteCurrentVideo && currentVideo.muted) {
      currentVideo.muted = false;
      lastKnownMutedState = false;
    }

    didAppMuteCurrentVideo = false;
  }

})();
