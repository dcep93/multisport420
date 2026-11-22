import { useCallback, useLayoutEffect, useRef } from "react";
import { useRedzoneLog } from "../hooks/useRedzoneLog";

type Anchor = { key: string; offset: number };

export default function RedzoneLog({ delayMs = 0, refreshRequestId = 0, visible = true }: { delayMs?: number; refreshRequestId?: number; visible?: boolean }) {
  const { rows, loading, waitingForDelay, activeGameCount, errorMessage, refresh } = useRedzoneLog(delayMs, refreshRequestId);
  const region = useRef<HTMLDivElement>(null);
  const anchor = useRef<Anchor | null>(null);
  const scrollTop = useRef(0);
  const capture = useCallback(() => {
    const element = region.current;
    if (!element || !visible) return;
    scrollTop.current = element.scrollTop;
    const top = element.getBoundingClientRect().top;
    const firstVisible = [...element.querySelectorAll<HTMLElement>("[data-play-key]")].find(row => row.getBoundingClientRect().bottom > top);
    anchor.current = element.scrollTop > 1 && firstVisible
      ? { key: firstVisible.dataset.playKey!, offset: firstVisible.getBoundingClientRect().top - top } : null;
  }, [visible]);
  useLayoutEffect(() => {
    const element = region.current;
    if (!element || !visible) return;
    if (scrollTop.current <= 1) element.scrollTop = 0;
    else {
      const previous = anchor.current;
      const row = previous && [...element.querySelectorAll<HTMLElement>("[data-play-key]")].find(row => row.dataset.playKey === previous.key);
      if (row && previous) element.scrollTop += row.getBoundingClientRect().top - element.getBoundingClientRect().top - previous.offset;
      else element.scrollTop = scrollTop.current;
    }
    capture();
  }, [rows, errorMessage, loading, activeGameCount, visible, capture]);

  const emptyMessage = waitingForDelay ? "Waiting for delayed live plays… Click to show latest." : loading ? "Loading live plays…" : activeGameCount === 0 ? "No NFL games are live." : "Waiting for live plays…";
  return <div ref={region} className="redzone-log" role="region" aria-label="Live NFL RedZone plays" tabIndex={0} onScroll={capture} onClick={refresh}
    onKeyDown={event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); refresh(); }
    }}>
    {rows.map(row => <div className={row.bigPlay ? "redzone-play redzone-play-big" : "redzone-play"} data-play-key={row.key} key={row.key}>
      {row.matchup && <div className="redzone-play-matchup">{row.matchup}</div>}
      <div className="redzone-play-text">{row.text}</div>
      {row.detail && <div className="redzone-play-detail">{row.detail}</div>}
    </div>)}
    {errorMessage && <p className="multisport-log-empty" role="status">{errorMessage}</p>}
    {!rows.length && !errorMessage && <p className="multisport-log-empty" role="status">{emptyMessage}</p>}
  </div>;
}
