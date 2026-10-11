import { useSyncExternalStore } from "react";

export type HorizontalScrollMode = "system" | "on" | "off";
const STORAGE_KEY = "multisport420:horizontal-scroll";
const CHANGE_EVENT = "multisport420:horizontal-scroll-change";
const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
let fallback: HorizontalScrollMode = "system";

function readMode(): HorizontalScrollMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "on" || value === "off" ? value : "system";
  } catch { return fallback; }
}

export function setHorizontalScrollMode(mode: HorizontalScrollMode) {
  fallback = mode;
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* Still works during this visit. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribeMode(notify: () => void) {
  const storageChanged = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) notify();
  };
  window.addEventListener(CHANGE_EVENT, notify);
  window.addEventListener("storage", storageChanged);
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify);
    window.removeEventListener("storage", storageChanged);
  };
}

function subscribeMotion(notify: () => void) {
  const media = window.matchMedia?.(MOTION_QUERY);
  if (media?.addEventListener) media.addEventListener("change", notify);
  else media?.addListener?.(notify);
  return () => {
    if (media?.removeEventListener) media.removeEventListener("change", notify);
    else media?.removeListener?.(notify);
  };
}
const readMotion = () => window.matchMedia?.(MOTION_QUERY).matches ?? false;

// Device-local rather than room-wide: each viewer controls their own motion.
export function useHorizontalScrolling() {
  const mode = useSyncExternalStore(subscribeMode, readMode, () => "system" as const);
  const reducedMotion = useSyncExternalStore(subscribeMotion, readMotion, () => false);
  return { mode, reducedMotion, enabled: mode === "on" || (mode === "system" && !reducedMotion) };
}
