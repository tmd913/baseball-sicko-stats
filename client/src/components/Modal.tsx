import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { overlayAbove, useLockBodyScroll } from '../hooks';

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
 * backdrop, and whatever control opened it. Escape is declined while something
 * is stacked *above* this box (`overlayAbove`), so one press undoes one thing.
 *
 * **`pointerdown` on the backdrop, not a click** — the rule `useDismissable`
 * follows: a press that starts on the backdrop dismisses on the way down, and a
 * drag that merely *ends* out there (down on a grip, up on the backdrop, whose
 * click lands on their common ancestor) cannot close the box out from under the
 * thing it just did.
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !overlayAbove(boxRef.current)) onClose();
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
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`app-dialog-box${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
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
