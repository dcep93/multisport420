// Runs before player scripts in their MAIN world. Only active inside Multisport420.
(() => {
  const hosts = new Set(["multisport420.web.app", "localhost"]);
  const inApp = Array.from(window.location.ancestorOrigins ?? []).some((origin) => {
    try { return hosts.has(new URL(origin).hostname); } catch { return false; }
  });
  if (!inApp) return;

  // Returning null matches a browser-blocked popup. Do not affect media controls.
  try {
    Object.defineProperty(window, "open", { value: () => null, writable: false, configurable: false });
  } catch { /* Best effort if a player has already made this property non-configurable. */ }
  const blockExternalNavigation = (event) => {
    const anchor = event.composedPath().find((node) => node instanceof HTMLAnchorElement);
    if (!anchor) return;
    const target = (anchor.getAttribute("target") || "").toLowerCase();
    if (target && target !== "_self") {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  window.addEventListener("click", blockExternalNavigation, true);
  window.addEventListener("auxclick", blockExternalNavigation, true);
})();
