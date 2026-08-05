import { useCallback, useEffect, useRef, useState } from 'react';
import { headshotUrl } from '../lib';

// How close to the top/bottom edge of the viewport a drag has to get before the
// page starts scrolling itself, and the fastest it scrolls (px per frame at the
// very edge — it eases in across the zone).
const EDGE_ZONE = 120;
const MAX_SCROLL_STEP = 20;

/** Headshot with an initials fallback (some ids have no image on file). */
function OrderPhoto({ id, name }: { id: number; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    const initials = name
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join('');
    return (
      <span className="order-photo order-photo-empty" aria-hidden="true">
        {initials}
      </span>
    );
  }
  return (
    <img
      className="order-photo"
      src={headshotUrl(id)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * The edit screen: a plain, drag-to-reorder list of the watched players — order
 * number, headshot, name, and a remove button.
 *
 * Reordering is controlled by the parent (`onMove` swaps two players in the
 * live list as the dragged row passes over another); `onCommit` fires once, on
 * release, to persist the final order. `onRemove` drops a player outright.
 *
 * Pointer Events rather than HTML5 drag-and-drop so the same code path works
 * with a mouse and a finger, and so a drag held near the top/bottom of the
 * screen can scroll the page under it.
 */
export function PlayerOrderEditor({
  players,
  onMove,
  onCommit,
  onRemove,
}: {
  // Already narrowed to the kind being edited, in watchlist order.
  players: { id: number; key: string; name: string }[];
  onMove: (fromKey: string, toKey: string) => void;
  onCommit: () => void;
  onRemove: (key: string) => void;
}) {
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  // Removal is two taps: the first arms that row's ✕ ("Remove?"), the second
  // commits. A row this easy to brush against while dragging shouldn't delete a
  // player on one stray tap, and there's no undo.
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const dragKey = useRef<string | null>(null);
  // Latest pointer position, read by both the hit test and the auto-scroll loop.
  const point = useRef({ x: 0, y: 0 });
  const rafId = useRef<number | null>(null);

  // Reorder against whatever row currently sits under the pointer. The dragged
  // row has pointer-events: none (see .order-row.dragging), so elementFromPoint
  // resolves to the row underneath it — the drop target — not to itself.
  const hitTest = useCallback(() => {
    const from = dragKey.current;
    if (from === null) return;
    const { x, y } = point.current;
    const row = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest(
      '.order-row',
    ) as HTMLElement | null;
    const key = row?.dataset.key;
    if (key) onMove(from, key);
  }, [onMove]);

  // Auto-scroll: while the pointer is held inside the top/bottom edge zone, keep
  // scrolling the page toward it. Re-running the hit test after each scroll is
  // what lets a stationary finger keep picking up the rows sliding past it.
  const autoScroll = useCallback(() => {
    rafId.current = requestAnimationFrame(autoScroll);
    const y = point.current.y;
    const h = window.innerHeight;
    // Ease from 0 at the edge-zone boundary to full speed at (or past) the edge.
    const intensity = (d: number) => Math.min(1, Math.max(0, 1 - d / EDGE_ZONE));
    const delta =
      y < EDGE_ZONE
        ? -MAX_SCROLL_STEP * intensity(y)
        : y > h - EDGE_ZONE
          ? MAX_SCROLL_STEP * intensity(h - y)
          : 0;
    if (!delta) return;
    const before = window.scrollY;
    window.scrollBy(0, delta);
    if (window.scrollY !== before) hitTest();
  }, [hitTest]);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      point.current = { x: e.clientX, y: e.clientY };
      hitTest();
    },
    [hitTest],
  );

  const endDrag = useCallback(() => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    rafId.current = null;
    dragKey.current = null;
    setDraggingKey(null);
    onCommit();
  }, [onPointerMove, onCommit]);

  const startDrag = (e: React.PointerEvent, key: string) => {
    e.preventDefault();
    setArmedKey(null);
    dragKey.current = key;
    point.current = { x: e.clientX, y: e.clientY };
    setDraggingKey(key);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    rafId.current = requestAnimationFrame(autoScroll);
  };

  // Unmounting mid-drag (the Done button, a view switch) must still tear the
  // listeners and the scroll loop down.
  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    },
    [onPointerMove, endDrag],
  );

  return (
    <div className="order-editor">
      <p className="order-hint">
        Drag a player to change their order, or ✕ to remove them.
      </p>
      <ul className="order-list">
        {players.map((p, i) => {
          const armed = armedKey === p.key;
          return (
            <li
              key={p.key}
              data-key={p.key}
              className={`order-row${draggingKey === p.key ? ' dragging' : ''}`}
              onPointerDown={(e) => startDrag(e, p.key)}
            >
              <span className="order-num">{i + 1}</span>
              <OrderPhoto id={p.id} name={p.name} />
              <span className="order-name">{p.name}</span>
              <span className="order-grip" aria-hidden="true">
                ⠿
              </span>
              {/* stopPropagation so pressing the button never starts a drag —
                  the row's pointerdown would otherwise preventDefault the click
                  away. */}
              <button
                type="button"
                className={`order-remove${armed ? ' armed' : ''}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => (armed ? onRemove(p.key) : setArmedKey(p.key))}
                title={`Remove ${p.name} from your watchlist`}
                aria-label={
                  armed
                    ? `Confirm removing ${p.name} from your watchlist`
                    : `Remove ${p.name} from your watchlist`
                }
              >
                {armed ? (
                  'Remove?'
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
