import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { LoadingLine } from './Loading';

/**
 * **A long table that grows as you reach the foot of it** — the research
 * board's mechanism, extracted so the game log is the same object rather than
 * a second one that resembles it.
 *
 * It was the board's alone and the game log had a `Load more · 125 earlier
 * games` button. Two paging mechanisms in one app is the drift this codebase
 * spends its comments avoiding — one of them would gain a beat, or a guard
 * against a stale timer, and the other would go on without it, with nothing on
 * screen to say which table you were looking at. The board's is the one with
 * the reasoning behind it, so the board's is the one both use; what stays with
 * each caller is the **page size**, which is genuinely theirs (see each).
 *
 * The parts, in the order they matter:
 *
 * - **A scroll handler on the pane, not an `IntersectionObserver` on a sentinel
 *   row.** Both of these panes scroll in *two* directions — they are the app's
 *   wide tables — so a marker element sits outside the horizontal viewport
 *   whenever the reader is out at the far columns, and an observer would
 *   quietly stop loading exactly there. `scrollHeight − scrollTop −
 *   clientHeight` asks the vertical question alone and cannot be confused by
 *   the other axis. It is three layout reads on an event the browser is
 *   dispatching anyway, against the rows it saves mounting.
 * - **A beat before the rows land** (`PAGE_BEAT`). Nothing is being fetched —
 *   the rows are already in memory and a page is a `slice` — so a flag set and
 *   cleared in one commit is a spinner that never paints and a reader who gets
 *   fifty rows out of nowhere.
 * - **One beat at a time.** A scroll fires the handler every frame; the timer
 *   is its own guard, so forty frames of scrolling to the bottom add one page
 *   rather than forty.
 * - **And a check after each page lands**, for the case a scroll event cannot
 *   cover: a pane taller than the page it was given. A guard rather than a
 *   mechanism — each caller's page size is picked so that cannot happen — and
 *   it terminates either way, the handler stopping dead once every row is
 *   drawn.
 */

/**
 * How far off the foot of the pane the next page is asked for.
 *
 * **Deliberately short — the mark below has to be on screen when it fires.**
 * The instinct is to prefetch early and never let the reader see the end of the
 * list, and it is the wrong instinct here for a reason particular to these
 * tables: the rows are already in hand, so the next page appears in the frame
 * after it is asked for, and a page asked for ten rows early lands 600px below
 * the fold — the reader gets a page of rows with nothing anywhere to say where
 * they came from. Two hundred is the footer strip and a row or two.
 */
export const LOAD_AHEAD = 200;

/**
 * How long the mark at the foot of the table stays up before the rows land.
 *
 * `MIN_SPIN`'s own argument applied to a scroll rather than to a press: a mark
 * that goes up holds a floor so that the thing that raised it leaves a trace.
 * It is the same number, 450ms, and it costs nothing in reach — `LOAD_AHEAD`
 * fires while there are still rows under the fold, so the beat is spent on rows
 * the reader has not got to yet rather than on a table that has stopped.
 */
export const PAGE_BEAT = 450;

/**
 * The growing half of a paged table: a scroll handler, a beat, and the flag the
 * mark below the table is drawn from.
 *
 * `shown` is **handed in rather than held here**, and that is the one thing a
 * caller cannot delegate: it decides how tall the table is, so on the board it
 * lives in App (a reader who had scrolled to row 300, looked at the Roster tab
 * and come back would otherwise find fifty rows and an offset that page had no
 * room for — the one way a scroll memory can be exactly right and still land
 * wrong). The game log's lives in its own component, and that is correct there
 * for the mirror of the same reason: nothing restores that pane's offset, the
 * player page puts the overlay back to the top on every tab change, and the
 * component is unmounted when the tab leaves — so there is no memory for a
 * remembered count to disagree with.
 */
export function usePagedRows({
  scrollRef,
  total,
  shown,
  pageSize,
  onShown,
}: {
  /** The pane that scrolls — the table's own box, in both callers. */
  scrollRef: RefObject<HTMLElement | null>;
  /** How many rows there are altogether, once every filter has had its say. */
  total: number;
  /** How many are drawn now. */
  shown: number;
  /** How many more each page adds. The board's 50 and the log's 20 are argued
   *  where they are declared: a leaderboard is scanned and a log is read. */
  pageSize: number;
  /** Asked for the next page. The caller writes it wherever it keeps the
   *  count, and takes the guard with it — this is called from a timer, so it
   *  passes the value it wants rather than a new count computed here. */
  onShown: (next: number) => void;
}) {
  const [loadingMore, setLoadingMore] = useState(false);
  const beat = useRef<number | null>(null);

  /** Stop a beat that is about a table which has just been replaced. The board
   *  calls it when its signature changes: left to fire, the timer would add a
   *  page to the table that replaced the one it was raised for. */
  const cancelBeat = () => {
    if (beat.current === null) return;
    clearTimeout(beat.current);
    beat.current = null;
    setLoadingMore(false);
  };

  // A beat outlives nothing — it is canceled when the table changes under it
  // and when the component goes away.
  useEffect(
    () => () => {
      if (beat.current !== null) clearTimeout(beat.current);
    },
    [],
  );

  const wantMore = () => {
    const el = scrollRef.current;
    if (!el) return;
    // One beat at a time: a scroll fires this every frame, and re-arming on
    // each of them would collapse the beat and stack a page per frame.
    if (beat.current !== null) return;
    if (shown >= total) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > LOAD_AHEAD) return;
    setLoadingMore(true);
    beat.current = window.setTimeout(() => {
      beat.current = null;
      setLoadingMore(false);
      onShown(shown + pageSize);
    }, PAGE_BEAT);
  };

  // And once after each page lands — see the header, the pane-taller-than-a-page
  // guard.
  useEffect(wantMore, [shown, total]);

  return { onScroll: wantMore, loadingMore, cancelBeat, hasMore: shown < total };
}

/**
 * The strip at the foot of a paged table, and the mark it holds.
 *
 * **Its height is reserved from the moment there is a next page** rather than
 * arriving with the mark. On the board that is because it lives *inside* the
 * scroller, where a box that came and went would take its own height out of
 * `scrollHeight` under a reader sitting at the very bottom of it — a jolt on
 * every page. On the game log it sits under the pane in a flex column, where
 * the same appearance would resize the pane instead; the rule is the same and
 * so is the answer. It goes for good on the last page, where it would be a
 * strip promising something that isn't coming.
 *
 * **Sticky on the inline axis**, which the pinned columns beside it already
 * are and for the same reason: a block child of a scroller is only ever as
 * wide as the pane, so on a table twice that it would sit off the left of the
 * screen exactly when the reader is out at the far columns — which is where a
 * mark about the foot of the list is least use and most needed.
 */
export function PageMore({ loading, what }: { loading: boolean; what: string }) {
  return (
    <div className="page-more">
      {loading && <LoadingLine>Loading more {what}</LoadingLine>}
    </div>
  );
}
