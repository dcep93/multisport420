import type { ReactElement } from "react";
import type { IframeParams } from "./types";

function scrollLockScriptRunner() {
  const topWindow = window.top ?? window;
  const APP_MESSAGE_SOURCE = "multisport420-app";
  const SET_MUTED = "multisport420:set-muted";
  const TOGGLE_MUTE = "multisport420:toggle-mute";
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

    const forwardMessage = (message: unknown) => {
      if (!(playerFrame instanceof HTMLIFrameElement)) {
        return;
      }

      playerFrame.contentWindow?.postMessage(message, "*");
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

      forwardMessage(event.data);
    });

    playerFrame.addEventListener(
      "load",
      () => {
        if (lastSetMutedMessage) {
          forwardMessage(lastSetMutedMessage);
        }
        lockCurrentScrollPosition();
      },
      { once: true },
    );
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachLoadListener, { once: true });
    return;
  }

  attachLoadListener();
}

export function renderIstreameastPlayerDocument(iframeParams: IframeParams): ReactElement {
  const scrollLockScript = `(${scrollLockScriptRunner.toString()})();`;

  return (
    <html lang="en">
      <head>
        <base href={iframeParams._1_rawUrl} />
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: scrollLockScript }} />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          overflowY: "hidden",
          background: "#000",
        }}
      >
        <iframe
          id="multisport-player-frame"
          src={iframeParams._2_embedPageUrl}
          frameBorder="0"
          style={{
            overflow: "hidden",
            overflowX: "hidden",
            overflowY: "hidden",
            height: "100%",
            width: "100%",
            position: "absolute",
            top: 0,
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
