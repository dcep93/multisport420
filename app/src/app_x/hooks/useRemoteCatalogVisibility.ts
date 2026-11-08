import { useSyncExternalStore } from "react";

const STORAGE_KEY = "multisport420:remote:show-loaded-streams";
const CHANGE_EVENT = "multisport420:remote:loaded-streams-change";
let unsaved: boolean | undefined;

function readVisibility() {
  if (unsaved !== undefined) return unsaved;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setRemoteCatalogVisibility(visible: boolean) {
  unsaved = visible;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(visible));
    unsaved = undefined;
  } catch {
    // Keep the preference in memory when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(notify: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    try {
      if (event.storageArea !== window.localStorage) return;
    } catch {
      return;
    }
    unsaved = undefined;
    notify();
  }
  window.addEventListener(CHANGE_EVENT, notify);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify);
    window.removeEventListener("storage", onStorage);
  };
}

export function useRemoteCatalogVisibility() {
  return useSyncExternalStore(subscribe, readVisibility, () => true);
}
