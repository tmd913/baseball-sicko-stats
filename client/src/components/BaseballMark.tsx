/**
 * The app's baseball: a ball with its two seams.
 *
 * One component rather than a path copied into each caller, because the whole
 * point of it is that the marks are identical — the fantasy button in the
 * header, its League settings entry, and the "this player is on your watchlist"
 * indicator on the player page and the research board all draw the same ball.
 * A path duplicated five times is a path that eventually differs in one of
 * them.
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
      <path d="M4.5 7.5A7.5 7.5 0 0 1 8 15M19.5 7.5A7.5 7.5 0 0 0 16 15" />
    </svg>
  );
}
