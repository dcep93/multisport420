import { useId } from "react";
import { setHorizontalScrollMode, useHorizontalScrolling, type HorizontalScrollMode } from "../hooks/useHorizontalScrolling";

export default function HorizontalScrollControls() {
  const { mode, reducedMotion } = useHorizontalScrolling();
  const descriptionId = useId();
  return <>
    <label className="option-row">
      <span>Horizontal scrolling</span>
      <select className="option-input layout-select" value={mode} aria-describedby={descriptionId}
        onChange={(event) => setHorizontalScrollMode(event.target.value as HorizontalScrollMode)}>
        <option value="system">System</option>
        <option value="on">On</option>
        <option value="off">Off</option>
      </select>
    </label>
    <p className="viewing-description" id={descriptionId}>
      {mode === "system" && reducedMotion
        ? "Your device requests reduced motion, so titles and fantasy matchups are not scrolling. Choose On to enable them here."
        : mode === "off" ? "Automatic title and fantasy matchup scrolling is off. You can still scroll manually."
          : "Titles and fantasy matchups scroll automatically, pausing while you interact. Saved for this browser."}
    </p>
  </>;
}
