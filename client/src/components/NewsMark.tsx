import { useRecentNews } from '../hooks';
import type { RecentNews } from '../types';

/**
 * The mark for one player, or nothing — which is what all three callers want.
 *
 * The map is absent before its one request lands and holds only the players
 * inside the window, so "draw the mark if there is one" is a line every caller
 * would otherwise write for itself; three copies of it is three places for the
 * `?.` to be forgotten. Reading the context here rather than in each caller is
 * also what keeps the two tables from having to thread a map through the two
 * components between App and the row — the reason `EligibilityContext` exists.
 */
export function PlayerNewsMark({ id, name, size }: { id: number; name: string; size?: number }) {
  const news = useRecentNews(id);
  return news ? <NewsMark name={name} news={news} size={size} /> : null;
}

/**
 * The newspaper: this player has been in the news, and how recently.
 *
 * The precedent is `LockMark` and the shape is deliberately the same one —
 * a labelled component that owns its own words, plus the bare path beside it
 * for a caller that supplies its own name and its own colour. A glyph copied
 * into three callers is a glyph that eventually differs in one of them, and
 * this one is drawn in three: a research row, a summary row and the player
 * page's `<h1>`.
 *
 * **A mark, not a control.** It is a `<span>` with a title and a screen-reader
 * label, and pressing it does nothing — which is the app's own vocabulary said
 * in geometry: a round pill is something you read, a 12px corner is something
 * you press. The thing it points at is the News tab on the player page the name
 * beside it already opens, so a control here would be a second door onto a room
 * the door next to it already opens.
 *
 * ## Two tones, and the red one is the app's own
 *
 * `--strikeout` for news filed today and `--faint` for yesterday, and the pair
 * carries the whole meaning: this is *recency*, so the mark that means "since
 * you last looked" has to be the one that catches the eye and the mark that
 * means "the day before" has to be the one that doesn't. Red is the app's red —
 * the same token the arsenal tables spend on a delta going the wrong way — and
 * grey is the tone the identity block's own sub-line takes, one step quieter
 * than the lock's `--muted` because a day-old note is a quieter fact than a man
 * being unavailable.
 *
 * **No third state.** Anything older than yesterday is not in the map at all
 * (see `recentNews.ts`), so there is no "old news" tone to draw and no row
 * carrying a mark that says nothing.
 */
export function NewsMark({ name, news, size = 13 }: { name: string; news: RecentNews; size?: number }) {
  // The headline is in the title because it is what turns the mark from "go and
  // look" into "he is on the IL" — and it is free, the map having had to carry
  // *something* to date and the newest item's own words being the honest thing
  // to carry. The day is named beside it so a reader can check the colour
  // against a date rather than having to trust it.
  const when = news.level === 'today' ? 'today' : 'yesterday';
  const label = `${name} was in the news ${when} — ${news.headline}`;
  return (
    <span className={`name-news level-${news.level}`} title={label}>
      <NewsGlyph size={size} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** The newspaper alone, in `currentColor` and saying nothing — for a caller
 *  that supplies its own name and its own colour, the split `BaseballMark` and
 *  `LockMark` both have. Nothing needs it yet; it exists so that the day a
 *  control has to wear this mark, it wears *this* mark. */
export function NewsGlyph({ size = 13, width = 2 }: { size?: number; width?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* A page with two lines of type on it. The ink runs 4.5 → 19.5 down and
          3.5 → 20.5 across — the same box the lock's does, so the two sit on
          one optical middle and share `.research-watched`'s baseline nudge
          without a correction of their own.

          **Two lines of type rather than three**, and it is a legibility figure
          rather than a taste: at 13px a viewBox unit is 0.54px, so the three
          lines a newspaper wants would sit 1.9px apart under a stroke that
          paints 1.08px, and would read as a grey block. Two lines 5 units apart
          clear each other by 2.7px, and the short second line is what says
          "text" rather than "two rules". */}
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M7.5 9.5h9M7.5 14.5h5.5" />
    </svg>
  );
}
