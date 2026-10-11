import { useEffect, useState } from "react";
import { isViewingLayout, type ViewingLayout } from "../lib/viewingLayouts";

const STORAGE_KEY = "multisport420:viewing";
function readPreferences(): { layout: ViewingLayout; showStreamSelector: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return { layout: isViewingLayout(saved?.layout) ? saved.layout : "spotlight", showStreamSelector: saved?.showStreamSelector === true };
  } catch { return { layout: "spotlight", showStreamSelector: false }; }
}

export function useViewingPreferences() {
  const [preferences, setPreferences] = useState(readPreferences);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch { /* Settings still work for this visit. */ }
  }, [preferences]);
  return [preferences, setPreferences] as const;
}
