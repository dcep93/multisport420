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
      syncVideoElement();
      applyRequestedMutedState();
      return;
    }

    if (event.data?.type !== TOGGLE_MUTE) {
      return;
    }

    syncVideoElement();
    if (!(currentVideo instanceof HTMLVideoElement)) {
      return;
    }

    requestedMutedState = !currentVideo.muted;
    applyRequestedMutedState();
  });

  // Providers may replace the video after initial playback or during recovery.
  new MutationObserver(syncVideoElement).observe(document, { childList: true, subtree: true });
  syncVideoElement();
  // Ask for the current state after our listener exists, even if load already fired.
  window.parent.postMessage({ source: APP_MESSAGE_SOURCE, type: "multisport420:audio-ready" }, "*");

  function syncVideoElement() {
    const element = document.querySelector("video");
    const video = element instanceof HTMLVideoElement ? element : null;
    if (video === currentVideo) return;
    if (currentVideo) currentVideo.muted = true;
    currentVideo = video;
    if (video) init(video);
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
