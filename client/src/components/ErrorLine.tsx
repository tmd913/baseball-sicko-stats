import type { ReactNode } from 'react';

/**
 * The app's one error language: a warning triangle, in three sizes, with a
 * line of text that names what could not be read.
 *
 * It is the other half of `Loading.tsx`. A wait says "Reading the outing" and
 * a failure of the same read says "Couldn’t read the outing" — the same
 * subject in the same voice, so the reader who saw the ball knows exactly
 * which read the triangle is about. Kept out of that file on purpose: it is
 * the *loading* vocabulary, and a failure is not a kind of wait.
 *
 * ## The glyph
 *
 * A triangle with a bar and a dot, drawn in `BaseballMark`'s idiom — the same
 * `viewBox`, the same round-capped 2px stroke in `currentColor` — so the two
 * marks read as one set. It replaces the `⚠` character, which six sites drew
 * and fourteen did not: a text glyph takes whatever the font has for it (an
 * emoji on iOS, a hairline outline on Windows, and a box where the font has
 * nothing), sits on the text baseline at the text's size, and cannot be
 * colored on a platform that draws it as an emoji. An SVG is the same shape
 * on every platform, at the size the box asks for, in the box's own ink.
 *
 * ## Sizes
 *
 * Three, each belonging to one box, and the box is what `kind` picks:
 *
 * - **`banner` (18px)** — `.error-banner`: the page-level banner over a report
 *   or a board that failed, the one that stands where the table would be. Its
 *   text is 14px over two lines at phone width, and 18 is the height of the
 *   first line's box, so the triangle leads the first line rather than
 *   floating beside the paragraph.
 * - **`pane` (28px)** — `.details-status.details-error`: a tab or a page with
 *   nothing in it because its one read failed. The same 28 the `md` ball has,
 *   because it is folded onto `.loading-block`'s column and stands in the
 *   same place the ball stood a moment before.
 * - **`line` (14px)** — `.details-error.opp-status`: a one-line status inside a
 *   card, beside a "Try again". The `sm` ball's size, for the same reason.
 *
 * ## The detail
 *
 * `detail` is what the failure itself had to say — a fetch's message, a 502's
 * body — and it goes in the text's `title`, never in the line. "Couldn’t read
 * the game: Failed to fetch" was the shape of most of these, and the half after
 * the colon is a fact for whoever is debugging it that reads as noise to
 * everyone else; two sites (`OutingPage`, `PlayerDay`) printed the raw message
 * *alone*, so a failed outing said "HTTP 502" and nothing about what it was.
 * The message is kept, one hover away, for the one reader it is for.
 */
export function WarningMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 2.5 20h19L12 3z" />
      <path d="M12 9v5M12 17.5v.5" />
    </svg>
  );
}

export type ErrorKind = 'banner' | 'pane' | 'line';

const BOX: Record<ErrorKind, { className: string; size: number }> = {
  banner: { className: 'error-banner', size: 18 },
  pane: { className: 'details-status details-error', size: 28 },
  line: { className: 'details-error opp-status', size: 14 },
};

export function ErrorLine({
  kind = 'pane',
  detail,
  children,
}: {
  kind?: ErrorKind;
  detail?: string | null;
  children: ReactNode;
}) {
  const box = BOX[kind];
  return (
    <div className={box.className} role="alert">
      <span className="error-mark">
        <WarningMark size={box.size} />
      </span>
      <span title={detail ?? undefined}>{children}</span>
    </div>
  );
}
