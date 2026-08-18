import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { useDismissable, usePopoverFit } from '../hooks';

/**
 * An **ⓘ beside a heading that opens a small popover** — the app's disclosure for
 * a *key*: the sentence or two that says how to read the thing underneath, which
 * a reader needs exactly once and then never again.
 *
 * Extracted from the Splits tab's own `SplitsKey`, which was the first of these,
 * when the Charts tab wanted the same affordance for the note under its chart.
 * Extracted rather than copied, which is this codebase's standing rule — the one
 * that folds `.settings-toggle` into `.sim-toggle`'s selector lists and pulled
 * `Modal` out of the Columns dialog when a second dialog appeared: two keys that
 * merely resemble each other are two keys that will one day differ, and this one
 * has a lot of argued detail in it to keep in step.
 *
 * ### Why a popover rather than a `title`, a modal, or an inline reveal
 *
 * The whole of that argument is `PlatoonSplits.tsx`'s and is worth reading there.
 * In short: a bare `title` is **invisible on a phone**, and roughly half this
 * app's traffic has no hover to give; a `Modal` is the wrong size, dimming the
 * page and pinning the body to deliver two sentences, where the Columns dialog
 * earned its box on *volume*; and an inline reveal in the body fails on
 * **distance**, the control being at the top and the text appearing hundreds of
 * pixels below it, under the fold on a phone. A disclosure has to reveal
 * something beside itself.
 *
 * So it is the app's **popover** — `.settings-popover` on the panel, literally
 * the shape the header's settings gear and fantasy button open, rather than a
 * second box that resembles it — and `useDismissable` is the same hook those two
 * use, so it dismisses on an outside press and on Escape identically to them.
 * That hook is also what spends the dismissing press on the dismissal alone, so
 * closing a key cannot press whatever was behind it.
 *
 * The button is a real `<button>` with a real accessible name, so it is reachable
 * and pressable from a keyboard, and it takes `.app-dialog-close`'s size and
 * shape — the app's 30px icon button — so there is a touch target rather than a
 * bare glyph nobody can tell is pressable.
 *
 * **What is *not* here is where it sits.** Anchoring is the caller's, through
 * `className`: the two callers hang their key off different things, and the
 * panel has to open *into* the card rather than off the edge of the screen, which
 * is a fact about each caller's own layout. See `.info-key*` in the stylesheet
 * for the shared half.
 */
export function InfoKey({
  label,
  className,
  drop = 'down',
  children,
}: {
  /** The button's accessible name and its tooltip — say what the key explains. */
  label: string;
  /** The caller's own anchor class, which owns where the panel opens. */
  className?: string;
  /**
   * **Which way it opens, for the cap alone** — the anchoring itself is still
   * the caller's CSS, and the two have to agree.
   *
   * A key near the foot of a long page has almost no room under it: measured on
   * the matchup page's projection key, whose button sits above `Moves` at the
   * bottom of the comparison, the panel came out at the hook's own 120px floor
   * and read as a scroller. Told it opens upward it is capped against the room
   * *above* its own bottom edge instead, which there is a page of.
   */
  drop?: 'up' | 'down';
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  /**
   * **Capped against the window and scrolling, like the settings popover it is.**
   *
   * The panel already carries `.settings-popover`, whose `max-height` reads
   * `--popover-max-h` — and nothing was publishing one, so it fell back to
   * `calc(100dvh - 70px)`, a cap measured from the *top of the viewport* for a box
   * that opens part-way down it. Measured on the League page's projection key at
   * 390×620, that put a 537px panel at y=265 and let it run **182px past the
   * bottom of the window**; at 320×900 the same panel is 641px tall and ran 54px
   * past. `usePopoverFit` is the hook the gear's own menu uses for exactly this,
   * and giving it to every key completes the pattern rather than changing it.
   */
  const panelRef = useRef<HTMLDivElement | null>(null);
  usePopoverFit(open, panelRef, drop === 'up');
  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, ref, close);
  // Generated rather than passed: `aria-controls` only has to be unique in the
  // document, and making each caller invent an id is one more thing for a second
  // key on one page to collide over.
  const panelId = useId();
  return (
    <span className={`info-key${className ? ` ${className}` : ''}`} ref={ref}>
      <button
        type="button"
        className={`app-dialog-close info-key-btn${open ? ' active' : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11.5v4.5" />
          <path d="M12 7.75h.01" />
        </svg>
      </button>
      {open && (
        <div className="settings-popover info-key-panel" id={panelId} ref={panelRef}>
          {children}
        </div>
      )}
    </span>
  );
}
