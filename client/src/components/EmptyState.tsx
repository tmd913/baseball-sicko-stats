import type { ReactNode } from 'react';
import { BaseballMark } from './BaseballMark';

/**
 * The app's empty pane: one box, one title, one mark.
 *
 * There were eighteen class families and some thirty bare lines saying "there
 * is nothing here" — `.empty-state`, `.feed-empty`, `.reel-empty`,
 * `.news-empty`, `.details-status` pressed into service as an empty — and no
 * two of them agreed on a padding, a font size or whether the box had an edge.
 * The title alone was written two ways: twelve sites gave it
 * `<p class="empty-title">` and fifteen a bare `<h3>`, and there was no
 * `.empty-state h3` rule, so those fifteen took the user agent's metrics
 * (1.17em, a 1em margin either side) and drew a smaller title with air over it
 * the other twelve did not have. This component ends that by construction:
 * the title is an `h3.empty-title` and there is no other way to write one.
 *
 * ## The mark is the still ball
 *
 * A dimmed, motionless `BaseballMark` — not a new glyph. The ball is already
 * the app's identity mark (the header, the roster indicator, the loader), and
 * `Loading.tsx` says of its reduced-motion pose that "a still ball is a logo
 * and says nothing about whether anything is happening." That is precisely
 * what an empty pane should say. The loader's ball turns because something is
 * in flight; this one stands still and drawn in `--faint` because nothing is,
 * for a reason the title then gives. Turning means waiting; still and dim
 * means empty on purpose. One glyph, two states, and the reader learns the
 * difference once.
 *
 * ## Compact
 *
 * The whole-tab empties inside a details page and the feed's own — `No games
 * played this season`, `No plays of that kind today` — are the same object at
 * a smaller scale: less padding, a 15px title, and no mark by default, since
 * a box inside a page that already carries the player's head does not need
 * to announce whose app it is. `mark` can still be asked for.
 *
 * ## What is not one of these
 *
 * A line inside a card, a row, a cell or an SVG (`.ovw-none`, `.split-empty`,
 * `.sz-empty`, `.rlay-empty`, `.ov-day-empty`, `.opp-status`) stays a line.
 * The stylesheet argues it beside `.ovw-none`: a bordered card inside a
 * bordered card is two edges a few pixels apart.
 *
 * The root element carries `.empty-state` itself, no wrapper: `.app >
 * .empty-state` and the research board's five `.research-scroll >
 * .empty-state` rules all use the child combinator, and a wrapper would take
 * every one of them off.
 */
export function EmptyState({
  title,
  children,
  action,
  compact = false,
  mark = !compact,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  mark?: boolean;
}) {
  return (
    <div className={`empty-state${compact ? ' is-compact' : ''}`}>
      {mark && (
        <span className="empty-mark">
          <BaseballMark size={28} width={1.5} />
        </span>
      )}
      <h3 className="empty-title">{title}</h3>
      {children}
      {action && <div className="empty-actions">{action}</div>}
    </div>
  );
}
