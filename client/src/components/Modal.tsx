import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { answersEscape, useLockBodyScroll, useOverlayFocus } from '../hooks';

/**
 * The z-index of the box a dialog opened *from here* would have to clear.
 *
 * A `Modal` is portalled to the body, so the DOM cannot tell it what it was
 * opened out of — but the React tree can, and that is exactly the question:
 * the board's Columns picker is opened from the page and belongs at the app's
 * ordinary dialog layer, while the Game Log's per-game popup is opened from
 * inside the **player page**, a fixed box at 50, and at 46 would render behind
 * the very thing that opened it. A pitcher's full breakdown, opened from inside
 * *that* popup, has to clear it in turn.
 *
 * So a host declares its layer once and every dialog anywhere inside it is
 * right without knowing where it is — which is the property that matters, since
 * `GameLog` has no business knowing it sits in an overlay. `Modal` provides its
 * own layer to its children, so the ladder extends itself.
 *
 * Null at the page level, where the stylesheet's own 46 applies and nothing is
 * written inline.
 */
export const DialogLayerContext = createContext<number | null>(null);

/** `.app-dialog`'s own z-index, as declared in the stylesheet. */
const BASE_LAYER = 46;

/** `.details-view`'s, for the three overlays that ride on it. */
export const OVERLAY_LAYER = 50;

/**
 * The app's modal: a dimmed fixed box over everything, holding a `--panel` card
 * with a fixed head and one scrolling body.
 *
 * Extracted from the research board's Columns dialog when a second one was
 * needed (a pitcher's full breakdown), and extracted rather than copied for the
 * reason this codebase folds `.settings-toggle` into `.sim-toggle`'s selector
 * lists rather than restyling it to match: two modals that merely resemble each
 * other are two modals that will one day differ. The stylesheet's
 * `.research-columns-*` rules were renamed to `.app-dialog-*` in place, so the
 * board's dialog is unchanged by construction rather than by inspection; the
 * Columns picker takes the default width and passes no modifier at all.
 *
 * It owes a modal four ways out and has them: the ✕, Escape, a press on the
 * backdrop, and whatever control opened it. **And it owes the keyboard the same
 * thing it owes the pointer**, which for a long time it did not: the backdrop
 * has always covered the page — measured, nine points including all four
 * corners hit it, and a press aimed at a sort header behind the board lands on
 * the dialog — but Tab walked straight out of the box and Enter then worked
 * whatever it found. `useOverlayFocus` is the whole of that fix: the background
 * inert, the box focused on open, the opener focused again on close. See the
 * hook, which carries the measurement.
 *
 * Escape goes through `answersEscape`,
 * which asks both halves of "one press undoes one thing": is anything stacked
 * *above* this box, and has this very press already been answered by somebody
 * else. The second half is not belt-and-braces — see the hook, which records
 * the measurement that the stacking test alone lets the whole ladder unwind on
 * one key.
 *
 * **The backdrop is armed on `pointerdown` and dismisses on the `click`**, and
 * that pair is one rule rather than two: the press decides *whether* this
 * gesture may dismiss, the click decides *when*. Each half answers a bug the
 * other cannot.
 *
 * Arming is what keeps a drag that merely *ends* out here from closing the box
 * out from under the thing it just did — down on a Columns chip, up on the
 * backdrop, whose click lands on their common ancestor, which **is** this
 * element. Judged on the click alone that reads as a press on the backdrop; the
 * press says it was not one. (A press that starts here and releases inside the
 * box still closes, the click still targeting this element, which is what
 * dismissing on the way down already did.)
 *
 * Dismissing on the click rather than on the press is what stops the gesture
 * reaching the page underneath. **On a touch device the compatibility mouse
 * events and the `click` are dispatched at `touchend` and hit-test the document
 * as it stands then** — so a backdrop torn out at `pointerdown` left the click
 * to land on whatever the box had been covering, one tap both dismissing this
 * dialog and pressing something behind it. Measured at 390×844 with the
 * Overview tab's `Today` dialog open and a tap on the backdrop over the
 * `Last 5 games` table: the dialog closed at `touchStart` and a game-log row's
 * own popup (`Salvador Perez — Aug 11`) opened at `touchEnd`. Holding the
 * backdrop to the click means the click is spent *on* it — `inert` having
 * already taken the page out of hit-testing for as long as the box is there, so
 * the two together leave no instant at which a press can reach behind. It is
 * a touch-only fault: with a mouse the click is dispatched to the common
 * ancestor of the down and up targets, so a detached backdrop yields nothing
 * (measured at 1200×900 — no popup opened either way).
 *
 * `z-index` lives in the stylesheet, at **46** — over the pinned chrome that
 * opens these (41) and the full-page table box (45), under the player page (50)
 * and the reel and how-to pages (60), those being pages rather than panels. A
 * dialog opened from inside one of those boxes climbs above it instead, which
 * is `DialogLayerContext`'s whole job and the one case the number is written
 * inline rather than declared.
 */
export function Modal({
  title,
  titleId,
  onClose,
  className,
  children,
}: {
  title: ReactNode;
  /** Ties the box to its heading for `aria-labelledby`. */
  titleId: string;
  onClose: () => void;
  /** A modifier on the box, for a dialog that needs its own width. */
  className?: string;
  children: ReactNode;
}) {
  useLockBodyScroll();
  // One step above whatever this was opened out of — see `DialogLayerContext`.
  // Written inline only when it differs from the stylesheet's own value, so the
  // ordinary case stays declared in CSS and `overlayAbove` reads one number
  // either way.
  const host = useContext(DialogLayerContext);
  const layer = host === null ? BASE_LAYER : host + 1;
  const boxRef = useRef<HTMLDivElement | null>(null);
  // Did *this* gesture start on the backdrop? See the note above: the click is
  // what dismisses, and this is what says the click belongs to a press out here
  // rather than to a drag that wandered out of the box.
  const fromBackdrop = useRef(false);
  // The card, not the backdrop: it carries `role="dialog"` and the title, so a
  // screen reader opens on what this box *is*. The backdrop is what stays live
  // (it is the portal's root, and the press that dismisses lands on it), which
  // is why the two refs are different — see `useOverlayFocus`.
  const cardRef = useRef<HTMLDivElement | null>(null);
  useOverlayFocus(boxRef, cardRef);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (answersEscape(e, boxRef.current)) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="app-dialog"
      style={layer === BASE_LAYER ? undefined : { zIndex: layer }}
      ref={boxRef}
      onPointerDown={(e) => {
        fromBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && fromBackdrop.current) onClose();
      }}
    >
      <div
        className={`app-dialog-box${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={cardRef}
        tabIndex={-1}
      >
        <div className="app-dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="app-dialog-close"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {/* The one scroller, which is the whole point of a modal here: the
            content scrolls in the box rather than growing the page behind.
            The provider is what lets a dialog opened from in here clear this
            one — a pitcher's full breakdown inside the Game Log's popup. */}
        <div className="app-dialog-body">
          <DialogLayerContext.Provider value={layer}>{children}</DialogLayerContext.Provider>
        </div>
      </div>
    </div>,
    document.body,
  );
}
