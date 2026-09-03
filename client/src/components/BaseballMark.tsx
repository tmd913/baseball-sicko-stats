/**
 * The app's baseball: a ball with its two seams.
 *
 * One component rather than a path copied into each caller, because the whole
 * point of it is that the marks are identical — the fantasy button in the
 * header, its League settings entry, and the "this player is on your roster"
 * indicator on the player page and the research board all draw the same ball.
 * A path duplicated five times is a path that eventually differs in one of
 * them.
 *
 * The two seams run from 7 to 17 — symmetric about the ball's own center, so
 * the ink is balanced top to bottom. They used to hang from the upper edge
 * (7.5 down to 15, leaving the bottom third empty), which made the mark read
 * as riding high wherever it sat beside text however well its box was aligned.
 *
 * `size` and `width` are the two things callers actually vary: 13px inside a
 * table row against 17px on a header button, and a heavier stroke at the small
 * end so the seams survive being drawn at half the size.
 */
export function BaseballMark({ size = 15, width = 2 }: { size?: number; width?: number }) {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M5 7A7.5 7.5 0 0 1 5 17M19 7A7.5 7.5 0 0 0 19 17" />
    </svg>
  );
}

/**
 * The header's ball: the one on the brand tile, drawn rather than typed.
 *
 * `.brand-mark` used to hold the ⚾ emoji, which is rendered by whichever
 * emoji font the platform has — Apple's is a white ball with red seams, Windows
 * and Android draw a different ball at a different weight, and none of them is
 * the ball on the tab, which `public/favicon.svg` draws itself for exactly this
 * reason. This is that favicon's ball with its coordinates kept verbatim (a
 * 64-unit tile, the disc at r=19, the two seams as the same two curves) and the
 * viewBox cropped to the disc, so `size` is the ball's own diameter rather than
 * the tile's.
 *
 * It is not `BaseballMark` because it is not the same mark: that one is an
 * outline in the text's color, an icon beside a label; this one is artwork on a
 * saturated tile, a filled disc with seams in their own color. The disc is
 * `--brand-ball` — a white that no theme moves, as the favicon's is not — and
 * not `--on-accent`, which is the theme's ink on a fill and is the page's
 * near-black on the four dark themes. The seams take `--strikeout`, the one red
 * every palette carries.
 */
export function BrandBall({ size = 21 }: { size?: number }) {
  return (
    <svg viewBox="13 13 38 38" width={size} height={size} aria-hidden="true">
      <circle cx="32" cy="32" r="19" fill="var(--brand-ball)" />
      <g fill="none" stroke="var(--strikeout)" strokeWidth="3.2" strokeLinecap="round">
        <path d="M19.6 20.4 C25.2 26.8 25.2 37.2 19.6 43.6" />
        <path d="M44.4 20.4 C38.8 26.8 38.8 37.2 44.4 43.6" />
      </g>
    </svg>
  );
}
