import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

const PERIOD_MS = 10;
const EDGE_SLEEP_MS = 2500;
const END_SLEEP_MS = 1000;

export default function Autoscroller(props: {
  speed: number;
  className?: string;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let offset = 0;
    let lastWritten = 0;
    let hold = 0;
    let atEnd = false;

    const writePosition = (element: HTMLDivElement, next: number) => {
      offset = next;
      element.scrollTo({ top: Math.ceil(next) });
      lastWritten = element.scrollTop;
    };

    const helper = () => {
      const element = containerRef.current;
      if (!element) return;

      const scrollableAmount = Math.max(0, element.scrollHeight - element.clientHeight);
      if (offset > scrollableAmount) writePosition(element, scrollableAmount);
      if (atEnd && offset < scrollableAmount) atEnd = false;
      if (scrollableAmount === 0) return;

      if (Math.abs(lastWritten - element.scrollTop) > 10) {
        offset = element.scrollTop;
        lastWritten = offset;
        atEnd = scrollableAmount - offset < 5;
        hold = atEnd ? END_SLEEP_MS : EDGE_SLEEP_MS;
        return;
      }

      if (hold > 0) {
        hold = Math.max(0, hold - PERIOD_MS);
        if (hold === 0 && atEnd) {
          writePosition(element, 0);
          atEnd = false;
          hold = EDGE_SLEEP_MS;
        }
        return;
      }

      const next = offset + (props.speed * scrollableAmount * PERIOD_MS) / 1000;
      writePosition(element, Math.min(next, scrollableAmount));
      if (next >= scrollableAmount) {
        atEnd = true;
        hold = END_SLEEP_MS;
      }
    };

    const timer = window.setInterval(helper, PERIOD_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [props.speed]);

  return (
    <div ref={containerRef} className={props.className}>
      {props.children}
    </div>
  );
}
