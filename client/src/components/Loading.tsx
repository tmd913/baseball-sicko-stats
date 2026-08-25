import { useId } from 'react';
import type { ReactNode } from 'react';

/**
 * The app's one loading language: a spinning baseball, in three sizes, with a
 * line of text that names what is being read.
 *
 * Everything about it follows from the two rules the rest of the app already
 * keeps. **An empty view names its own cause in its own words** — so a wait
 * says "Reading the league leaderboard", never "Loading…", the same way an
 * emptied board says which button emptied it. And **nothing blanks while a
 * re-read is in flight** — so a ball belongs where there is genuinely nothing
 * to show yet, or *inside the control that was pressed*, and never as a curtain
 * over rows somebody is already reading.
 *
 * ## The glyph
 *
 * It is `BaseballMark`'s ball turned into a ball that turns. The rim is drawn
 * once and never moves — a sphere's silhouette doesn't — and the seams sweep
 * across it, clipped to the rim, which is the whole difference between a ball
 * rotating about an axis and a disc spinning in the page plane. Each seam is
 * placed by the projection a point on a sphere actually has: horizontal
 * position `9·sin θ` and horizontal foreshortening `cos θ`, so a seam is widest
 * face-on, narrows to a hairline as it reaches the limb, and *bunches* there
 * rather than at the center — which is the tell that separates a sphere from a
 * disc, whose marks bunch the other way. Opacity carries it round the back.
 *
 * **Four seams, 90° apart, bulging alternately left and right.** Three things
 * decide that number. A seam is on the visible half for 180° of the turn, so
 * the spacing has to be under 180 or the ball goes momentarily blank — with two
 * seams a quarter of every turn had nothing on it at all. At 90° there are
 * always two seams on the front (or one face-on and two edge-on), and the pose
 * at every odd eighth of the turn is *exactly* `BaseballMark`: one seam right
 * of center bulging left, one left of center bulging right. So the spinner
 * passes through the app's own mark four times a revolution, which is why the
 * two read as the same object.
 *
 * It is nine keyframes of `transform` and `opacity` on four paths — no layout,
 * no paint outside the element's own box, and nothing for the compositor to do
 * but move four small layers. There is no JS in it at all.
 *
 * ## Reduced motion
 *
 * `prefers-reduced-motion` stops the turn dead at the `BaseballMark` pose —
 * the two visible seams held at ±6.36 with the other two hidden behind them —
 * and pulses the whole ball's opacity between 0.45 and 1 over 1.8s instead. A
 * still ball is a logo and says nothing about whether anything is happening,
 * and the pulse is a fade rather than movement, which is what that preference
 * is asking to be spared.
 *
 * ## Sizes
 *
 * Three, and each belongs to one situation:
 *
 * - **`sm` (14px)** — inline: inside a control that was pressed (the header's
 *   Refresh, the fantasy popover's Refresh from ESPN, the ESPN page's two
 *   buttons, the sign-in form's submit), or leading a one-line status that sits
 *   beside data rather than instead of it (the "Updating" badge, the research
 *   board's count line). It is one number where the old spinner was two — 13px
 *   in the header button and forced to 15 in the popover entry — because the
 *   slot rules that held those apart hold the ball's box too.
 * - **`md` (28px)** — a block wait: a pane with genuinely nothing in it yet.
 *   The report's first read, the research board's first read, each lazily
 *   fetched tab of the player page, the highlight reel.
 * - **`lg` (44px)** — a wait that owns a whole surface with nothing behind it
 *   to protect: the boot splash, which owns the window, and the Overview's
 *   first draw, which owns the view. Both are the *only* thing on screen while
 *   they are up, and at `md` a ball with that much room around it reads as a
 *   pane still arriving rather than as the page being read.
 */
export type BallSize = 'sm' | 'md' | 'lg';

export function SpinningBaseball({ size = 'sm' }: { size?: BallSize }) {
  // One clip per instance: two balls on screen with one id would have the
  // second's seams clipped by the first's rim, wherever that rim happened to
  // be laid out.
  const clip = useId().replace(/:/g, '');
  return (
    <svg
      className={`ball-spin ball-spin-${size}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clip}>
          <circle cx="12" cy="12" r="9" />
        </clipPath>
      </defs>
      {/* The silhouette, drawn once and never transformed. */}
      <circle className="ball-rim" cx="12" cy="12" r="9" strokeWidth="2" />
      <g clipPath={`url(#${clip})`}>
        {/* Each seam runs past the rim top and bottom so the clip, rather than
            the path's own ends, is what closes it against the edge of the
            ball. Phases are a quarter turn apart; `d` alternates so the pair
            on screen at any moment curve away from each other, as the mark's
            two arcs do. */}
        <path className="ball-seam ball-seam-1" d="M12 2.4C8.2 7.4 8.2 16.6 12 21.6" strokeWidth="2.2" />
        <path className="ball-seam ball-seam-2" d="M12 2.4C15.8 7.4 15.8 16.6 12 21.6" strokeWidth="2.2" />
        <path className="ball-seam ball-seam-3" d="M12 2.4C8.2 7.4 8.2 16.6 12 21.6" strokeWidth="2.2" />
        <path className="ball-seam ball-seam-4" d="M12 2.4C15.8 7.4 15.8 16.6 12 21.6" strokeWidth="2.2" />
      </g>
    </svg>
  );
}

/**
 * A wait that sits *beside* what it is about rather than in place of it: the
 * ball at `sm` with a line of text after it.
 *
 * Used for the two states that must never blank a pane — the "Updating" badge
 * over a report being re-read, and the research board's count line while the
 * board is being read for the first time (where it is the table's caption
 * either way, so the wait and the answer arrive in the same place).
 */
export function LoadingLine({
  children,
  className,
  announce = true,
}: {
  children: ReactNode;
  className?: string;
  announce?: boolean;
}) {
  return (
    <span
      className={className ? `loading-line ${className}` : 'loading-line'}
      /* Off inside a control, which already says it is working with
         `aria-busy` and whose label a screen reader re-reads on its own — a
         live region nested in a button is the same news announced twice. */
      role={announce ? 'status' : undefined}
    >
      <SpinningBaseball size="sm" />
      {children}
    </span>
  );
}

/**
 * A pane with nothing in it yet: the ball at `md` over a line naming what is
 * being read.
 *
 * The text is the point. "Loading…" is what five of these said before, on five
 * different panes, which told the reader nothing they could not see; each now
 * names its own subject the way this app's empty states name their own cause.
 *
 * **`size` is the slot's say in it, and `md` is what every slot but one
 * wants.** A block wait is a pane's wait, and a pane has something above it —
 * a tab strip, a card head, a board's chrome — which is the scale `md` is set
 * against. The exception is a wait that owns the *whole view* with nothing
 * behind it to protect, where the same 28px ball reads as a pane still
 * arriving rather than as the page being read: the Overview's first draw takes
 * `lg`, the size the boot splash already uses for the same reason. Passed
 * rather than given its own component, which is this stylesheet's own rule —
 * two things that are the same object share a selector rather than being given
 * rules that agree today.
 */
export function LoadingBlock({
  children,
  size = 'md',
}: {
  children: ReactNode;
  size?: Extract<BallSize, 'md' | 'lg'>;
}) {
  return (
    <div className="loading-block" role="status">
      <SpinningBaseball size={size} />
      <p className="loading-what">{children}</p>
    </div>
  );
}
