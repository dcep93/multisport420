import { type ReactNode, useLayoutEffect, useRef } from "react";

const START_HOLD_MS = 5000;
const HOLD_MS = 2500;
const TICK_MS = 20;

export default function Autoscroller({ children, paused, resetKey }: {
  children: ReactNode;
  paused: boolean;
  resetKey: string;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useLayoutEffect(() => {
    const strip = stripRef.current!;
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let reducedMotion = media?.matches ?? false;
    let hovered = strip.matches(":hover");
    let focused = strip.contains(document.activeElement);
    let dragging = false;
    let position = 0;
    let lastWritten = 0;
    let hold = START_HOLD_MS;
    let atEnd = false;
    let previousTime = Date.now();

    const writePosition = (next: number) => {
      position = next;
      strip.scrollLeft = next;
      // Preserve fractional progress even when a browser rounds scrollLeft.
      lastWritten = strip.scrollLeft;
    };
    writePosition(0);

    const interact = () => {
      position = strip.scrollLeft;
      lastWritten = position;
      hold = position === 0 ? START_HOLD_MS : HOLD_MS;
      atEnd = false;
    };
    const onScroll = () => {
      if (Math.abs(strip.scrollLeft - lastWritten) > 0.01) interact();
    };
    const onEnter = () => { hovered = true; };
    const onLeave = () => { hovered = false; interact(); };
    const onFocus = () => { focused = true; };
    const onBlur = (event: FocusEvent) => {
      if (!strip.contains(event.relatedTarget as Node | null)) {
        focused = false;
        interact();
      }
    };
    const onPointerDown = () => { dragging = true; interact(); };
    const onPointerUp = () => {
      if (dragging) { dragging = false; interact(); }
    };
    const onMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
    };
    const reconcileSize = () => {
      const maximum = Math.max(0, strip.scrollWidth - strip.clientWidth);
      if (position > maximum) writePosition(maximum);
      if (atEnd && position < maximum) atEnd = false;
      return maximum;
    };

    const tick = () => {
      const now = Date.now();
      // A background tab should resume gently rather than skip an entire lap.
      let elapsed = Math.min(100, now - previousTime);
      previousTime = now;
      const maximum = reconcileSize();
      if (pausedRef.current || reducedMotion || hovered || focused || dragging || maximum === 0) return;
      onScroll();
      if (hold > 0) {
        const consumed = Math.min(hold, elapsed);
        hold -= consumed;
        elapsed -= consumed;
        if (hold > 0) return;
        if (atEnd) {
          writePosition(0);
          atEnd = false;
          hold = START_HOLD_MS;
          return;
        }
      }
      if (elapsed === 0) return;
      const speed = maximum / 10000;
      const next = position + speed * elapsed;
      if (next >= maximum - 0.000001) {
        const unusedTime = Math.max(0, (next - maximum) / speed);
        writePosition(maximum);
        atEnd = true;
        hold = HOLD_MS - unusedTime;
      } else {
        writePosition(next);
      }
    };

    strip.addEventListener("mouseenter", onEnter);
    strip.addEventListener("mouseleave", onLeave);
    strip.addEventListener("focusin", onFocus);
    strip.addEventListener("focusout", onBlur);
    strip.addEventListener("wheel", interact, { passive: true });
    strip.addEventListener("touchmove", interact, { passive: true });
    strip.addEventListener("keydown", interact);
    strip.addEventListener("pointerdown", onPointerDown);
    strip.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("resize", reconcileSize);
    if (media?.addEventListener) media.addEventListener("change", onMotionChange);
    else media?.addListener(onMotionChange);
    const timer = window.setInterval(tick, TICK_MS);

    return () => {
      window.clearInterval(timer);
      strip.removeEventListener("mouseenter", onEnter);
      strip.removeEventListener("mouseleave", onLeave);
      strip.removeEventListener("focusin", onFocus);
      strip.removeEventListener("focusout", onBlur);
      strip.removeEventListener("wheel", interact);
      strip.removeEventListener("touchmove", interact);
      strip.removeEventListener("keydown", interact);
      strip.removeEventListener("pointerdown", onPointerDown);
      strip.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("resize", reconcileSize);
      if (media?.removeEventListener) media.removeEventListener("change", onMotionChange);
      else media?.removeListener(onMotionChange);
    };
  }, [resetKey]);

  return <div ref={stripRef} className="scoreboard-strip" role="region" aria-label="Scoreboard matchups" tabIndex={0}>{children}</div>;
}
