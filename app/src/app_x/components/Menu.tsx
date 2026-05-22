import { useEffect, useState } from "react";
import { formatShaTooltip } from "../config/sha_x";
import type { Category, Stream, StreamCategory, StreamSlug } from "../config/types";
import Guide from "./Guide";
import Options from "./Options";

const MOBILE_MENU_BREAKPOINT_PX = 960;

export default function Menu(props: {
  category: Category;
  categories: readonly StreamCategory[];
  streams: Stream[];
  isLoadingStreams: boolean;
  selectedSlugs: StreamSlug[];
  onToggle: (streamSlug: StreamSlug) => void;
  onCategoryChange: (value: Category) => void;
  displayLogs: boolean;
  logDelayMs: number;
  onDisplayLogsChange: (value: boolean) => void;
  onLogDelayMsChange: (value: number) => void;
  onClearCache: () => void;
}) {
  const shaTooltip = formatShaTooltip();
  const isMobile = useIsMobileMenu();

  return (
    <aside className="menu-column">
      <div className="menu-title-wrap">
        <h1
          className="menu-title"
          title={shaTooltip}
        >
          multisport420
        </h1>
        {isMobile ? (
          <button
            type="button"
            className="menu-title-overlay-button"
            aria-label="Show build details"
            onClick={() => alert(shaTooltip)}
          />
        ) : null}
      </div>

      <div className="stream-list">
        {props.isLoadingStreams ? (
          <div className="stream-list-loading" aria-live="polite" aria-busy="true">
            <span className="stream-list-loading-spinner" aria-hidden="true" />
            <span className="stream-list-loading-label">Fetching links...</span>
          </div>
        ) : null}
        {props.streams.map((stream) => (
          <StreamToggle
            key={stream.slug}
            isSelected={props.selectedSlugs.includes(stream.slug)}
            label={stream.title}
            rawUrl={stream.raw_url}
            onClick={() => props.onToggle(stream.slug)}
          />
        ))}
      </div>

      <Guide />
      <Options
        category={props.category}
        categories={props.categories}
        displayLogs={props.displayLogs}
        logDelayMs={props.logDelayMs}
        onCategoryChange={props.onCategoryChange}
        onDisplayLogsChange={props.onDisplayLogsChange}
        onLogDelayMsChange={props.onLogDelayMsChange}
        onClearCache={props.onClearCache}
      />
    </aside>
  );
}

function StreamToggle(props: {
  isSelected: boolean;
  label: string;
  rawUrl: string;
  onClick: () => void;
}) {
  function handleActivate(event: { metaKey?: boolean; preventDefault?: () => void }) {
    if (event.metaKey) {
      event.preventDefault?.();
      window.open(props.rawUrl, "_blank", "noopener,noreferrer");
      return;
    }

    props.onClick();
  }

  return (
    <div className="stream-toggle-row">
      <div
        role="button"
        tabIndex={0}
        className={`stream-toggle ${props.isSelected ? "is-selected" : ""}`}
        onClick={handleActivate}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleActivate(event);
          }
        }}
      >
        <span className="stream-name">{props.label}</span>
      </div>
      <button
        type="button"
        className="stream-raw-link-button"
        aria-label={`Open raw stream URL for ${props.label}`}
        title={`Open raw stream URL for ${props.label}`}
        onClick={() => window.location.assign(props.rawUrl)}
      >
        🔗
      </button>
    </div>
  );
}

function useIsMobileMenu() {
  const [isMobile, setIsMobile] = useState(() =>
    window.innerWidth <= MOBILE_MENU_BREAKPOINT_PX,
  );

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= MOBILE_MENU_BREAKPOINT_PX);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return isMobile;
}
