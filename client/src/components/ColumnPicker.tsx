import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from './Modal';
import { columnGroups, withColumn } from './researchColumns';
import type { Column } from './researchColumns';
import type { PlayerKind } from '../types';

/**
 * **The app's column picker — one implementation, two tables.**
 *
 * It was the research board's and lived inside `ResearchTable.tsx` for as long
 * as that board was the only table with columns worth choosing. The player
 * page's **Stats** tab is the second — the same board transposed, five spans
 * down the side instead of six hundred names — and a second picker would have
 * been a second drag gesture, a second set of group headings and a second
 * answer to "what happens when you turn the last column off", every one of them
 * free to drift from the first. So the picker moved here whole and both tables
 * import it, the way `researchColumns.tsx` already holds the vocabulary the two
 * of them share.
 *
 * What did **not** move is where a selection is *kept*. The board saves per
 * board and writes `cols=` into the URL; the Stats tab saves its own set and
 * writes nothing. Those are policy about a preference rather than parts of a
 * picker, so each caller keeps its own and this component only ever hands back
 * a list of keys.
 */


/**
 * The Columns picker, as a modal over the page rather than a panel in the row.
 *
 * Search and Filters stay inline and this one does not, and the difference is
 * volume: those two are a field and a three-part sentence, one line of the
 * wrapping tab row each, where this holds the order row **and** every column
 * the board has in four labelled runs — 39 of them on the batting board and 44
 * on the pitching one. Opened inline that is a block of chips several hundred
 * pixels tall wedged into the chrome, pushing the table it describes down the
 * page and, on a phone, taking the screen outright while pretending to be a
 * strip of controls. A picker that costs you sight of the thing it is picking
 * for is the wrong shape; a dialog is the right one, and it can carry a
 * scroller of its own so a 44-column board scrolls *inside* it rather than
 * growing the page.
 *
 * It takes the app's overlay conventions rather than a second visual language:
 * a dimmed backdrop over a `--panel` box on the app's own radius and shadow,
 * the body pinned by `useLockBodyScroll` and `overscroll-behavior: contain` on
 * the scroller, exactly as `.details-view` and `.reel-view` do. Four ways out,
 * which is what a modal owes: the ✕, Escape, a press on the backdrop, and the
 * Columns button itself — the state is still `ui.panels.columns`, so that
 * button keeps its `.active` fill and its count badge unchanged and pressing it
 * again shuts this exactly as it shut the panel.
 *
 * **Portalled to the body**, not left in the chrome the rest of the control set
 * is portalled into: that box is `position: sticky` with a `z-index`, so it
 * opens a stacking context and a fixed child of it could never rise past its
 * 41. At the root it takes 46 — over the pinned chrome that opened it and over
 * the full-page table box (45), under the player page (50) and the reel and
 * how-to pages (60), which are pages where this is a control's panel. Neither
 * of those can be on screen with it in practice (the full-page mode covers the
 * whole control set, and this backdrop swallows the click that would open a
 * player), but Escape is written for the stacking anyway: it declines the key
 * while one of those is above it, and it is itself in the list they consult, so
 * one press undoes one thing whichever way round they end up.
 */
/**
 * The dialog shell. Portal, body lock, Escape, backdrop, head and one scrolling
 * body are the app's shared `Modal`; what is left here is the title and the
 * width, this box being sized for four labelled runs of chips where the pitcher
 * breakdown next door is sized for an arsenal table.
 *
 * The heading id is fixed rather than per-caller because only one of these can
 * be on screen at a time: the board's picker lives in the pinned chrome and the
 * Stats tab's inside an overlay that covers it.
 */
function ColumnsDialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <Modal
      title="Columns"
      titleId="app-columns-title"
      onClose={onClose}
    >
      {children}
    </Modal>
  );
}

/**
 * How close to the top or bottom of the picker's own scroller a drag has to get
 * before the box starts scrolling itself, and the fastest it goes (px per frame
 * at the very edge, eased in across the zone).
 *
 * Both are smaller than the edit screen's 120/20, and for the plainest reason:
 * those are measured against a whole viewport, where this scroller is 620px of
 * an 844px phone — 120px at each end would arm the auto-scroll over a third of
 * the box a reader is trying to drop a chip into.
 */
const EDGE_ZONE = 56;
const MAX_SCROLL_STEP = 12;

/**
 * How far a **mouse** has to travel from a chip before the press is read as a
 * drag rather than a press. Only a mouse drags these chips (see `ColumnOrder`),
 * so this no longer arbitrates between a drag and a scroll — it separates the
 * drag from the click that would otherwise pick the same chip up on release.
 */
const DRAG_SLOP = 4;

/**
 * The nearest ancestor that actually scrolls, which is what a drag near the
 * edge of a box has to move. Walked for rather than named (`.app-dialog-body`)
 * so the block goes on working in whatever holds it — a panel, a page, the
 * dialog it happens to live in today.
 */
function scrollingParent(el: HTMLElement | null): HTMLElement | null {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}

/**
 * The columns in the order they are drawn, rearrangeable — the board's answer
 * to "I want ERA next to the name, not past nine counting stats".
 *
 * It is a row of its own at the top of the Columns dialog rather than a handle
 * on the chips below, and the reason is that those chips are grouped: they are
 * cut into Counting, Slash line, Rates and Statcast, which is the right shape
 * for *choosing* columns and no shape at all for arranging them, an
 * arrangement being one flat sequence that crosses every one of those
 * headings. So the picker answers its two questions in two blocks — what
 * order, then which columns — and each is drawn the way its own question wants.
 *
 * **The gesture is a press and a press, and a drag is the mouse's shortcut for
 * it.** Press a chip to pick a column up, press another to drop it there; the
 * picked chip is marked and the hint line above says whose it is and how to
 * cancel. A mouse may instead hold the press and drag, which is the same move
 * with the release doing the placing.
 *
 * That split is the third answer this block has had and the first that is
 * measured against the thing it is *for*. The first was `touch-action: none` on
 * a grip, which Chrome's **touch adjustment** — a touch landing near a small
 * target is snapped onto it — widened over half the chip, so 40 of 85 sample
 * flicks scrolled the picker 0px. The second was `pan-y` on that grip plus a
 * matching axis test here: a move that was not predominantly sideways was the
 * scroller's, everything else was a drag. That did fix the scrolling — 0 of 450
 * flicks dead, re-measured — and it could not fix the reordering, because **the
 * chips wrap**. Twenty-five of them come to six rows on a 390px phone and
 * twenty-six to seven, so the commonest move there — pick a column off row one
 * and drop it on row three — *is* a downward drag, and the axis test threw
 * exactly those away: measured, **22 of 30** drags landed the chip where it was
 * dragged on a six-row board and **10 of 30** on a seven-row one, and every
 * single failure crossed a row. Press-and-press is 30 of 30 at both.
 *
 * There is no axis left to separate the two gestures with, and no element
 * either: the drop target may be anywhere in a two-dimensional block inside a
 * box that scrolls the same way. So the drag is not asked to fight the scroll
 * at all — **on touch there is no drag**, `touch-action` is not declared
 * anywhere in this block, and every pixel of the picker scrolls from every
 * pixel of a chip. What is left for a finger is a press, which no scroller
 * competes for. Touch adjustment stops mattering for a second reason as well:
 * a snap can only move the press from one part of a chip to another, and every
 * part of a chip now does the same thing.
 *
 * Reordering by mouse is by **Pointer Events**, with the drop target found
 * using `elementFromPoint` — `PlayerOrderEditor`'s method, one code path for a
 * press and a drag, where HTML5 drag-and-drop is mouse-only and gives no live
 * reorder.
 *
 * **Auto-scroll while dragging** (`EDGE_ZONE`) because a mouse drag's drop
 * target is whatever is under the pointer: a chip that has scrolled out of the
 * box is unreachable without it, and once a drag is under way the browser will
 * not scroll for us. It scrolls the **dialog's own scroller**, not the window —
 * the window is pinned by `useLockBodyScroll` while a modal is up — found by
 * walking up for the nearest scrolling ancestor rather than naming
 * `.app-dialog-body`, so the block would work in any box that holds it. A
 * press-and-press needs none of it: the reader scrolls the picker with a
 * finger, which is now unobstructed, and then presses.
 *
 * A drag's order is held locally while it is live and **committed on release**,
 * unlike the editor's row list, which moves the real list as it goes. The
 * difference is what is downstream: there it is twenty rows, here it is six
 * hundred players by twenty-five columns, and re-rendering fifteen thousand
 * cells on every pointer move is a drag that stutters. The chips themselves
 * reorder live, which is the feedback the gesture actually needs. A press
 * commits once, on the press that places.
 */
function ColumnOrder({
  columns,
  onReorder,
}: {
  columns: Column[];
  onReorder: (keys: string[]) => void;
}) {
  const keys = columns.map((c) => c.key);
  const signature = keys.join(',');
  const [order, setOrder] = useState<string[]>(keys);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  /** The column that has been picked up and is waiting for somewhere to go. */
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const dragKey = useRef<string | null>(null);
  // The order as the drag last left it — read by the release handler, which
  // cannot see the state it has been setting through a closure.
  const liveOrder = useRef<string[]>(keys);

  // The board's own list is the truth whenever it changes under us — a column
  // ticked on or off, a board switch, a reset. Keyed on the joined keys rather
  // than the array, which is a new object every render.
  useEffect(() => {
    setOrder(signature.split(','));
    liveOrder.current = signature.split(',');
  }, [signature]);

  // A pick-up survives a *reorder* and not a change of membership. The two are
  // one signature apart and the difference is load-bearing: every commit this
  // block makes changes the order, so clearing on `signature` would drop the
  // chip the reader is still holding — measured, the arrow keys moved it one
  // place and then let go. A column ticked off, a board switch or a reset is a
  // different list and there is nothing left to be holding.
  const membership = [...keys].sort().join(',');
  useEffect(() => {
    setPickedKey(null);
  }, [membership]);

  const labels = new Map(columns.map((c) => [c.key, c.label]));

  const moved = (list: string[], from: string, to: string) => {
    const i = list.indexOf(from);
    const j = list.indexOf(to);
    if (i === -1 || j === -1 || i === j) return list;
    const next = [...list];
    next.splice(i, 1);
    next.splice(j, 0, from);
    return next;
  };

  const move = (from: string, to: string) => {
    if (from === to) return;
    setOrder((prev) => {
      const next = moved(prev, from, to);
      liveOrder.current = next;
      return next;
    });
  };

  /** Drop the picked-up column where the pressed one sits, and commit. */
  const place = (to: string) => {
    const from = pickedKey;
    setPickedKey(null);
    if (from === null || from === to) return;
    const next = moved(order, from, to);
    setOrder(next);
    liveOrder.current = next;
    onReorder(next);
  };

  /** One place along, for the arrow keys a picked-up chip answers. */
  const nudge = (key: string, dir: 1 | -1) => {
    const i = order.indexOf(key);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= order.length) return;
    const next = moved(order, key, order[j]);
    setOrder(next);
    liveOrder.current = next;
    onReorder(next);
  };

  // Whatever the live drag has bound to the window, so an unmount mid-gesture
  // (the dialog closed, a board switch) tears it down rather than leaving a
  // pointer listener holding a dead component's setState.
  const teardown = useRef<(() => void) | null>(null);
  useEffect(() => () => teardown.current?.(), []);

  // Escape cancels a pick-up rather than closing the dialog, which is the app's
  // standing rule that one press undoes one thing. `Modal` answers the key on
  // `window` in the bubble phase, so this one is **capture** and stops the
  // event there — the two listeners are on the same object and only the phase
  // orders them.
  useEffect(() => {
    if (pickedKey === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setPickedKey(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pickedKey]);

  // The chips row, which is only ever read to find the box it scrolls inside.
  const chipsRef = useRef<HTMLDivElement | null>(null);
  // That box, and the latest pointer position — read by the hit test and by the
  // auto-scroll loop alike.
  const scroller = useRef<HTMLElement | null>(null);
  const point = useRef({ x: 0, y: 0 });
  const rafId = useRef<number | null>(null);
  // A mouse drag ends in a `click` on whatever its two ends have in common, so
  // a drag that begins and ends on one chip would otherwise pick that chip up
  // on the way out. Set when a drag actually starts, read by the press that
  // follows it, and cleared by the *next* `pointerdown` rather than by that
  // read — see `armDrag`, where the difference is measured.
  const dragged = useRef(false);

  // Reorder against whatever chip currently sits under the pointer. The dragged
  // chip has `pointer-events: none` (see `.research-order-chip.dragging`), so
  // this resolves to the chip underneath it — the drop target — not to itself.
  const hitTest = () => {
    const from = dragKey.current;
    if (from === null) return;
    const { x, y } = point.current;
    const chip = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest(
      '.research-order-chip',
    ) as HTMLElement | null;
    const to = chip?.dataset.key;
    if (to) move(from, to);
  };

  // Keep scrolling the picker toward a drag held inside its top/bottom edge
  // zone, and re-run the hit test after each step — that is what lets a
  // stationary pointer keep picking up the chips sliding past it.
  const autoScroll = () => {
    rafId.current = requestAnimationFrame(autoScroll);
    const box = scroller.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    const y = point.current.y;
    // Ease from 0 at the edge-zone boundary to full speed at (or past) the edge.
    const intensity = (d: number) => Math.min(1, Math.max(0, 1 - d / EDGE_ZONE));
    const top = y - r.top;
    const bottom = r.bottom - y;
    const delta =
      top < EDGE_ZONE
        ? -MAX_SCROLL_STEP * intensity(top)
        : bottom < EDGE_ZONE
          ? MAX_SCROLL_STEP * intensity(bottom)
          : 0;
    if (!delta) return;
    const before = box.scrollTop;
    box.scrollTop += delta;
    if (box.scrollTop !== before) hitTest();
  };

  /**
   * A **mouse** press arms a drag; the first move past `DRAG_SLOP` starts it.
   *
   * Nothing is bound for a finger or a pen, which is the whole of the fix
   * above: with no listener and no `touch-action`, a swipe that starts on a
   * chip is the scroller's without anything here having to decide that it is,
   * and a press that stays put arrives as an ordinary `click`. The browser
   * separates the two, which it is better at than any slop and axis test —
   * there is nothing left here for the two halves to disagree about.
   */
  const armDrag = (e: React.PointerEvent, key: string) => {
    // Cleared here rather than by the press that reads it: a drag's trailing
    // `click` lands on whatever the two ends have in common, which for any
    // drag that actually moved the chip is the row and not the chip — so a
    // flag cleared on read stayed set and swallowed the next genuine press.
    // Measured: after seventeen drags, a click picked nothing up.
    dragged.current = false;
    if (e.pointerType !== 'mouse') return;
    // Deliberately no `preventDefault()` here. It reads as the right thing —
    // cancel the browser's own text drag — and it also **suppresses the
    // `click`**, which is now how a press picks a column up: measured, a bare
    // mouse click on a chip did nothing at all. The native drag is stopped by
    // `onDragStart` instead, and `user-select: none` on the block is what
    // keeps a drag from painting a selection across it.
    const from = { x: e.clientX, y: e.clientY };
    point.current = from;
    let started = false;

    const onMove = (ev: PointerEvent) => {
      point.current = { x: ev.clientX, y: ev.clientY };
      if (!started) {
        const dx = ev.clientX - from.x;
        const dy = ev.clientY - from.y;
        if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
        started = true;
        dragged.current = true;
        dragKey.current = key;
        setDraggingKey(key);
        setPickedKey(null);
        scroller.current = scrollingParent(chipsRef.current);
        rafId.current = requestAnimationFrame(autoScroll);
      }
      hitTest();
    };
    const unbind = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      rafId.current = null;
      teardown.current = null;
    };
    const end = () => {
      unbind();
      if (!started) return; // a plain click, which `press` answers
      dragKey.current = null;
      setDraggingKey(null);
      onReorder(liveOrder.current);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    teardown.current = unbind;
  };

  /** Pick up, drop, or put back down — the whole gesture on a touch device. */
  const press = (key: string) => {
    // The click a mouse drag leaves behind on its way out. Not cleared here:
    // `armDrag` clears it, because a drag that moved the chip leaves its click
    // on the row rather than on any chip, so a flag cleared on read would stay
    // set and swallow the next genuine press.
    if (dragged.current) return;
    if (pickedKey === null) setPickedKey(key);
    else place(key);
  };

  const movingLabel = pickedKey === null ? null : (labels.get(pickedKey) ?? pickedKey);

  return (
    <div className="research-colgroup research-order">
      <div className="research-colgroup-head">
        <span>Order</span>
      </div>
      {/* The hint is the only thing on screen that says what a picked-up chip
          is waiting for, so it is the live region as well as the instruction. */}
      <p className="research-order-hint" aria-live="polite">
        {movingLabel === null
          ? 'Press a column to pick it up, then press where it should go. The table reads left to right in this order.'
          : `Moving ${movingLabel} — press a column to drop it there, or Esc to cancel.`}
      </p>
      <div className="research-order-chips" ref={chipsRef}>
        {order.map((k) => {
          const label = labels.get(k) ?? k;
          const picked = pickedKey === k;
          const target = pickedKey !== null && !picked;
          return (
            /* A real button, so a press is the browser's own and the keyboard
               and a screen reader get it for nothing. The whole chip is the
               target rather than the grip alone: a 9×13 glyph is a fifth the
               width of a fingertip, and with no `touch-action` to be snapped
               into there is no longer any reason for the press to be aimed. */
            <button
              key={k}
              type="button"
              data-key={k}
              className={`research-order-chip${picked ? ' picked' : ''}${
                target ? ' target' : ''
              }${draggingKey === k ? ' dragging' : ''}`}
              aria-pressed={picked}
              title={
                target ? `Drop ${movingLabel} here` : picked ? `Put ${label} back` : `Move ${label}`
              }
              onPointerDown={(e) => armDrag(e, k)}
              onDragStart={(e) => e.preventDefault()}
              onClick={() => press(k)}
              onKeyDown={(e) => {
                if (!picked) return;
                if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  nudge(k, -1);
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  nudge(k, 1);
                }
              }}
            >
              {label}
              {/* The mark that says a column can be moved, and a mouse's cue
                  that it can be dragged. It starts nothing of its own — the
                  chip around it answers the press. */}
              <span className="research-order-grip" aria-hidden="true">
                ⠿
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The picker itself: the order row, then the columns in their labelled runs,
 * then the way back to the defaults — inside the dialog above.
 *
 * **It takes the vocabulary and the selection, and hands back a selection.**
 * `all` is every column the table on screen *has* (which for the board is
 * already narrowed at runtime — Ros% drops out without a league, a trend window
 * without a baseline), and `keys` is the saved arrangement, which may name
 * columns `all` has no answer for right now. Everything the reader can do here
 * is a rearrangement of `keys`, so the mutations live here rather than in each
 * table: `withColumn` for a tick, a `filter` for an untick, and for a reorder
 * the threading rule below, which is the only one of the three that is subtle.
 *
 * `onChange` is never handed an empty list — see `commit`. Whether a list that
 * has come back to the defaults is stored as such or as *nothing* is the
 * caller's business, since that is the difference between a saved preference
 * and a link, and the two tables answer it differently.
 */
export function ColumnPicker({
  kind,
  all,
  keys,
  onChange,
  onReset,
  canReset,
  onClose,
}: {
  kind: PlayerKind;
  /** Every column this table has, in canonical order — what the runs list. */
  all: Column[];
  /** The current selection, in the reader's own order. May name a column `all`
   *  cannot resolve today; those are kept and never shown. */
  keys: string[];
  onChange: (keys: string[]) => void;
  /** Back to this table's defaults, stored as the absence of a selection. */
  onReset: () => void;
  /** Whether there is anything to reset — a selection of the caller's own. */
  canReset: boolean;
  onClose: () => void;
}) {
  const byKey = new Map(all.map((c) => [c.key, c]));
  // The columns actually drawn, in order. `filter(Boolean)` rather than a
  // fallback: a key with no column on this table is one the table doesn't have
  // today, and it is kept in `keys` so that connecting a league (or a baseline
  // arriving) puts the column back exactly where the reader had it.
  const shown = keys.map((k) => byKey.get(k)).filter((c): c is Column => c !== undefined);
  const visibleKeys = new Set(keys);

  /** Never let the last one go: an empty table has no headers left to click,
   *  so there would be no way back except the Reset button beside it. */
  const commit = (next: string[]) => {
    if (next.length === 0) return;
    onChange(next);
  };

  /**
   * Take the arrangement back from the order row.
   *
   * It cannot simply be committed as it comes, and the reason is the gap
   * between `keys` and `shown`: a saved list can name a column this table has
   * no answer for right now — `rosterPct` before the ESPN status lands or with
   * no league at all, a trend window with no baseline yet — and those are
   * filtered out of `shown` and so never reach the order row. Committing what
   * the row hands back would drop them from the saved list outright, so
   * connecting a league later would find Ros% gone from a set the reader never
   * touched.
   *
   * So the new order is threaded back through the saved list: each key the
   * table *can* resolve takes the next place in the new arrangement, and each
   * one it can't stays exactly where it was.
   */
  const reorder = (nextShown: string[]) => {
    const resolvable = new Set(shown.map((c) => c.key));
    let i = 0;
    commit(keys.map((k) => (resolvable.has(k) ? (nextShown[i++] ?? k) : k)));
  };

  /** Show or hide one column. Switching one on puts it at its canonical place
   *  among the ones already there (`withColumn`) rather than at the end, and
   *  switching one off moves nothing else. */
  const setColumn = (key: string, on: boolean) =>
    commit(on ? withColumn(kind, keys, key) : keys.filter((k) => k !== key));

  const setGroup = (group: Column[], on: boolean) => {
    const inGroup = new Set(group.map((c) => c.key));
    if (!on) {
      commit(keys.filter((k) => !inGroup.has(k)));
      return;
    }
    commit(group.reduce((ks, c) => withColumn(kind, ks, c.key), keys));
  };

  return (
    <ColumnsDialog onClose={onClose}>
      {/* Which order, then which columns. The two questions this picker
          answers are different shapes — one flat sequence against four
          labelled runs — and each is drawn the way its own wants; see
          `ColumnOrder`. */}
      <ColumnOrder columns={shown} onReorder={reorder} />
      {columnGroups(all).map((g) => {
        const allOn = g.columns.every((c) => visibleKeys.has(c.key));
        return (
          <div key={g.title} className="research-colgroup">
            <div className="research-colgroup-head">
              <span>{g.title}</span>
              {/* One click for a whole run — checking off fifteen Statcast
                  boxes by hand is the reason a picker gets abandoned. */}
              <button type="button" onClick={() => setGroup(g.columns, !allOn)}>
                {allOn ? 'None' : 'All'}
              </button>
            </div>
            <div className="research-colgroup-items">
              {g.columns.map((c) => (
                <label
                  key={c.key}
                  className={`research-col-chip${visibleKeys.has(c.key) ? ' on' : ''}`}
                  title={c.title}
                >
                  <input
                    type="checkbox"
                    checked={visibleKeys.has(c.key)}
                    onChange={(e) => setColumn(c.key, e.target.checked)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="research-clear research-cols-reset"
        onClick={onReset}
        disabled={!canReset}
      >
        Reset to defaults
      </button>
    </ColumnsDialog>
  );
}

/**
 * The button that opens it, wherever it is put.
 *
 * It is the board's own `.research-toggle` — the same glyph, the same `.active`
 * fill while the dialog is up, the same count badge — shared rather than drawn
 * twice, for the reason the stylesheet folds `.settings-toggle` into
 * `.sim-toggle`'s selector lists: two controls that merely resemble each other
 * are two controls that will one day differ. The `.on` tint means the reader
 * has a selection of their own, which is exactly what `canReset` says one line
 * down in the dialog.
 */
export function ColumnsButton({
  open,
  count,
  customised,
  onToggle,
}: {
  open: boolean;
  /** How many columns are showing — the badge, which is what a control that
   *  holds something owes the reader with its panel shut. */
  count: number;
  customised: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`research-toggle${open ? ' active' : ''}${customised ? ' on' : ''}`}
      aria-expanded={open}
      onClick={onToggle}
      title="Choose which columns to show"
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16M15 4v16" />
      </svg>
      <span className="research-toggle-label">Columns</span>
      <span className="research-toggle-count">{count}</span>
    </button>
  );
}
