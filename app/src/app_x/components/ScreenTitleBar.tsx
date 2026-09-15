import { useEffect, useId, useRef } from "react";

export default function ScreenTitleBar(props: {
  label: string;
  screenNumber?: number;
  className: string;
  onRefresh?: () => Promise<void>;
  onClose?: () => void;
  refreshDisabled?: boolean;
  title?: string;
  possession?: { team: string; isHomeTeam: boolean };
  redZone?: boolean;
  bigPlay?: boolean;
  bigPlayClock?: string;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const possessionId = useId();
  const indexedLabel = props.screenNumber === undefined ? props.label : `(${props.screenNumber}) ${props.label}`;
  const showBigPlay = Boolean(props.bigPlay && !props.redZone);

  useEffect(() => {
    const shell = shellRef.current;
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!shell || !viewport || !text) return;
    if (showBigPlay) viewport.scrollLeft = 0;

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let frame: number | undefined;
    let maximum = 0;
    let direction = 1;
    let previousTime: number | undefined;
    let holdUntil: number | undefined;
    let hovered = shell.matches(":hover");
    let focused = shell.contains(document.activeElement);

    const stop = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      previousTime = undefined;
      holdUntil = undefined;
    };
    const tick = (time: number) => {
      if (holdUntil === undefined) holdUntil = time + 1800;
      if (previousTime !== undefined && time >= holdUntil) {
        // Use the DOM scroll position so manual scrolling remains the source of truth.
        const distance = Math.min(time - previousTime, 50) * 0.018;
        const next = Math.max(0, Math.min(maximum, viewport.scrollLeft + direction * distance));
        viewport.scrollLeft = next;
        if (next >= maximum || next <= 0) {
          direction *= -1;
          holdUntil = time + 1800;
        }
      }
      previousTime = time;
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (frame === undefined && maximum > 1 && !hovered && !focused && !reducedMotion?.matches) {
        frame = requestAnimationFrame(tick);
      }
    };
    const measure = () => {
      stop();
      maximum = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      viewport.dataset.overflow = String(maximum > 1);
      viewport.scrollLeft = Math.min(viewport.scrollLeft, maximum);
      start();
    };
    const enter = () => { hovered = true; stop(); };
    const leave = () => { hovered = false; start(); };
    const focus = () => { focused = true; stop(); };
    const blur = (event: FocusEvent) => {
      focused = event.relatedTarget instanceof Node && shell.contains(event.relatedTarget);
      if (!focused) start();
    };
    const motionChange = () => { stop(); start(); };
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(viewport);
    observer?.observe(text);
    shell.addEventListener("pointerenter", enter);
    shell.addEventListener("pointerleave", leave);
    shell.addEventListener("focusin", focus);
    shell.addEventListener("focusout", blur);
    window.addEventListener("resize", measure);
    reducedMotion?.addEventListener("change", motionChange);
    measure();
    return () => {
      stop();
      observer?.disconnect();
      shell.removeEventListener("pointerenter", enter);
      shell.removeEventListener("pointerleave", leave);
      shell.removeEventListener("focusin", focus);
      shell.removeEventListener("focusout", blur);
      window.removeEventListener("resize", measure);
      reducedMotion?.removeEventListener("change", motionChange);
    };
  }, [indexedLabel, props.possession?.team, props.possession?.isHomeTeam, showBigPlay, props.bigPlayClock]);

  const possession = props.possession ? (
    <span id={possessionId} className="screen-title-possession" role="img" aria-label={`${props.possession.team} in possession`}>
      🏈
    </span>
  ) : null;

  return (
    <div
      ref={shellRef}
      className={`screen-title-bar-shell ${props.className}`}
      data-indicator={props.redZone ? "red-zone" : props.bigPlay ? "big-play" : "none"}
      title={props.title}
      role="button"
      tabIndex={0}
      aria-label={`Close screen ${indexedLabel}`}
      aria-describedby={!showBigPlay && props.possession ? possessionId : undefined}
      onClick={props.onClose}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onClose?.();
        }
      }}
    >
      <div className="screen-title-inner">
        <div
          ref={viewportRef}
          className="screen-title-viewport"
          tabIndex={0}
          role="group"
          aria-label={indexedLabel}
          onKeyDown={(event) => {
            const viewport = event.currentTarget;
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              event.stopPropagation();
              if (event.key === "Home") viewport.scrollLeft = 0;
              else if (event.key === "End") viewport.scrollLeft = viewport.scrollWidth;
              else viewport.scrollLeft += event.key === "ArrowRight" ? 60 : -60;
            }
          }}
        >
          <span ref={textRef} className="screen-letter">
            {props.screenNumber !== undefined ? <span>({props.screenNumber})</span> : null}
            {showBigPlay ? <>
              {props.bigPlayClock ? <span>{props.bigPlayClock}</span> : null}
              <span className="screen-title-possession" role="img" aria-label="Big play">🏈</span>
            </> : props.possession && !props.possession.isHomeTeam ? possession : null}
            <span>{props.label}</span>
            {!showBigPlay && props.possession?.isHomeTeam ? possession : null}
          </span>
        </div>
        {props.onRefresh ? (
          <button
            type="button"
            className="screen-title-action"
            aria-label={`Refresh screen ${indexedLabel}`}
            onClick={(event) => {
              event.stopPropagation();
              void props.onRefresh?.();
            }}
            disabled={props.refreshDisabled}
            title="Refresh stream"
          >
            🔄
          </button>
        ) : null}
      </div>
    </div>
  );
}
