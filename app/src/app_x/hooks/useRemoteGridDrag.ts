import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

type Drag = { slug: string; target: string | null };

export function useRemoteGridDrag(enabled: boolean, slugs: string[], move: (slug: string, target: string) => void) {
  const container = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; slug: string; x: number; y: number; moved: boolean } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  if (!enabled && drag) setDrag(null);
  useEffect(() => { if (!enabled) pointer.current = null; }, [enabled]);

  function cancel() { pointer.current = null; setDrag(null); }
  function targetAt(x: number, y: number) {
    const card = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-reorder-slug]");
    return card && container.current?.contains(card) ? card.dataset.reorderSlug ?? null : null;
  }
  function start(event: PointerEvent<HTMLButtonElement>, slug: string) {
    if (!enabled || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = { id: event.pointerId, slug, x: event.clientX, y: event.clientY, moved: false };
  }
  function track(event: PointerEvent<HTMLButtonElement>) {
    const current = pointer.current;
    if (!enabled || !current || current.id !== event.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return;
    current.moved = true;
    setDrag({ slug: current.slug, target: targetAt(event.clientX, event.clientY) });
    // The handle owns the touch gesture; the rest of the remote scrolls normally.
    if (event.clientY < 70) window.scrollBy(0, -18);
    else if (event.clientY > window.innerHeight - 70) window.scrollBy(0, 18);
  }
  function drop(event: PointerEvent<HTMLButtonElement>) {
    const current = pointer.current;
    if (!current || current.id !== event.pointerId) return;
    const target = targetAt(event.clientX, event.clientY);
    cancel();
    if (enabled && current.moved && target && target !== current.slug) move(current.slug, target);
  }
  function key(event: KeyboardEvent<HTMLButtonElement>, slug: string) {
    if (event.key === "Escape") { cancel(); return; }
    const delta = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 } as Record<string, number>)[event.key];
    if (!enabled || !delta) return;
    event.preventDefault();
    const target = slugs[slugs.indexOf(slug) + delta];
    if (target) move(slug, target);
  }
  return { container, drag: enabled ? drag : null, handle: (slug: string) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => start(event, slug),
    onPointerMove: track, onPointerUp: drop, onPointerCancel: cancel, onLostPointerCapture: cancel,
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => key(event, slug),
    onClick: (event: MouseEvent<HTMLButtonElement>) => event.stopPropagation(),
  }) };
}
