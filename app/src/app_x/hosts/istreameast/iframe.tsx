import type { ReactElement } from "react";
import type { IframeParams } from "./types";

function scrollLockScriptRunner() {
  const topWindow = window.top ?? window;
  const APP_MESSAGE_SOURCE = "multisport420-app";
  const SET_MUTED = "multisport420:set-muted";
  const TOGGLE_MUTE = "multisport420:toggle-mute";
  const AUDIO_READY = "multisport420:audio-ready";
  let lastSetMutedMessage: unknown = null;

  const lockCurrentScrollPosition = () => {
    const lockedX = topWindow.scrollX;
    const lockedY = topWindow.scrollY;

    const restoreScrollPosition = () => {
      if (topWindow.scrollX !== lockedX || topWindow.scrollY !== lockedY) {
        topWindow.scrollTo(lockedX, lockedY);
        return;
      }

      topWindow.requestAnimationFrame(restoreScrollPosition);
    };

    restoreScrollPosition();
  };

  const attachLoadListener = () => {
    const playerFrame = document.getElementById("multisport-player-frame");

    if (!playerFrame) {
      return;
    }

    if (playerFrame instanceof HTMLIFrameElement) {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button[data-stream-url]"));
      const storageKey = document.body.dataset.streamPreferenceKey ?? "";
      const selectSource = (button: HTMLButtonElement) => {
        const url = button.dataset.streamUrl;
        if (!url) return;
        buttons.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
        if (playerFrame.getAttribute("src") !== url) playerFrame.src = url;
        try { localStorage.setItem(storageKey, url); } catch { /* Playback also works when storage is unavailable. */ }
      };
      buttons.forEach((button) => button.addEventListener("click", () => selectSource(button)));
      try {
        const savedSource = localStorage.getItem(storageKey);
        const savedButton = buttons.find((button) => button.dataset.streamUrl === savedSource);
        if (savedButton) selectSource(savedButton);
      } catch { /* Keep the provider's default stream. */ }
    }

    const forwardMessage = (message: unknown) => {
      if (!(playerFrame instanceof HTMLIFrameElement)) {
        return;
      }

      playerFrame.contentWindow?.postMessage(message, "*");
    };

    window.addEventListener("message", (event) => {
      // document_idle controllers may start after the promotion/load command.
      if (event.data?.source === APP_MESSAGE_SOURCE && event.data?.type === AUDIO_READY) {
        if (playerFrame instanceof HTMLIFrameElement && event.source === playerFrame.contentWindow && lastSetMutedMessage) {
          forwardMessage(lastSetMutedMessage);
        }
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

      forwardMessage(event.data);
    });

    playerFrame.addEventListener(
      "load",
      () => {
        if (lastSetMutedMessage) {
          forwardMessage(lastSetMutedMessage);
        }
      },
    );
    playerFrame.addEventListener("load", lockCurrentScrollPosition, { once: true });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachLoadListener, { once: true });
    return;
  }

  attachLoadListener();
}

export function renderIstreameastPlayerDocument(iframeParams: IframeParams): ReactElement {
  const scrollLockScript = `(${scrollLockScriptRunner.toString()})();`;
  const sources = iframeParams._3_embedSources ?? [];
  const hasAlternatives = sources.length > 1;
  const watchUrl = new URL(iframeParams._1_rawUrl);
  const preferenceKey = `multisport420:stream:${watchUrl.origin}${watchUrl.pathname}`;

  return (
    <html lang="en">
      <head>
        <base href={iframeParams._1_rawUrl} />
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: scrollLockScript }} />
        {hasAlternatives && <style>{`
          .stream-options { height:36px; display:flex; align-items:center; gap:6px; padding:0 8px; box-sizing:border-box; overflow-x:auto; white-space:nowrap; font:12px system-ui,sans-serif; color:#ddd; background:#181818; }
          .stream-options button { border:1px solid #555; border-radius:4px; padding:3px 9px; background:#292929; color:#fff; cursor:pointer; white-space:nowrap; }
          .stream-options button[aria-pressed="true"] { background:#725c16; border-color:#d7b645; }
          .stream-options button:focus-visible { outline:2px solid #fff; outline-offset:1px; }
        `}</style>}
      </head>
      <body
        data-stream-preference-key={preferenceKey}
        style={{
          margin: 0,
          padding: 0,
          overflowY: "hidden",
          background: "#000",
        }}
      >
        {hasAlternatives && <nav className="stream-options" aria-label="Stream choices">
          {sources.map((source) => <button
            key={source.url}
            type="button"
            data-stream-url={source.url}
            aria-pressed={source.url === iframeParams._2_embedPageUrl}
          >{source.label}</button>)}
          <span>If video buffers, try another stream.</span>
        </nav>}
        <iframe
          id="multisport-player-frame"
          src={iframeParams._2_embedPageUrl}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="no-referrer"
          frameBorder="0"
          style={{
            overflow: "hidden",
            overflowX: "hidden",
            overflowY: "hidden",
            height: hasAlternatives ? "calc(100% - 36px)" : "100%",
            width: "100%",
            position: "absolute",
            top: hasAlternatives ? 36 : 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
          height="100%"
          width="100%"
          allowFullScreen
          scrolling="no"
          allowTransparency
        />
      </body>
    </html>
  );
}
