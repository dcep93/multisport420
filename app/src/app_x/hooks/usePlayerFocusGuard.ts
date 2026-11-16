import { useEffect, type RefObject } from "react";

export default function usePlayerFocusGuard(shellRef: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let pendingCheck: number | undefined;

    const recoverFocus = () => {
      const shell = shellRef.current;
      const active = document.activeElement;
      // hasFocus includes descendant frames, but excludes another app/window.
      // Never activate a background viewer or disturb the app's own controls.
      if (document.visibilityState !== "visible" || !document.hasFocus() || !shell
        || !(active instanceof HTMLIFrameElement) || !active.matches(".screen-iframe")
        || !shell.contains(active)) return;
      shell.focus({ preventScroll: true });
    };

    const scheduleCheck = () => {
      if (pendingCheck !== undefined) return;
      // On blur, activeElement may not reflect the new frame until the next task.
      pendingCheck = window.setTimeout(() => {
        pendingCheck = undefined;
        recoverFocus();
      }, 0);
    };
    const onLoad = (event: Event) => {
      if (event.target instanceof HTMLIFrameElement) scheduleCheck();
    };

    window.addEventListener("blur", scheduleCheck);
    window.addEventListener("focus", scheduleCheck);
    window.addEventListener("pageshow", scheduleCheck);
    document.addEventListener("visibilitychange", scheduleCheck);
    document.addEventListener("load", onLoad, true);
    // Cross-origin nested reloads and focus changes need not notify this window.
    const interval = window.setInterval(recoverFocus, 250);
    scheduleCheck();

    return () => {
      window.clearTimeout(pendingCheck);
      window.clearInterval(interval);
      window.removeEventListener("blur", scheduleCheck);
      window.removeEventListener("focus", scheduleCheck);
      window.removeEventListener("pageshow", scheduleCheck);
      document.removeEventListener("visibilitychange", scheduleCheck);
      document.removeEventListener("load", onLoad, true);
    };
  }, [shellRef, enabled]);
}
