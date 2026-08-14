/**
 * The padlock: a player somebody else in your ESPN league is already holding.
 *
 * The precedent is `BaseballMark` and the rule is the same one — one marker for
 * one concept, drawn from one path, because a glyph copied into two callers is a
 * glyph that eventually differs in one of them. What is different here is *how
 * much* of the mark is shared: the baseball exports the glyph alone and lets
 * each caller wrap it, because its wrappers genuinely differ (a bare mark on a
 * research row, a badge carrying the words `On roster` with a Remove button
 * beside it on the player page). The lock is the same label in both places — a
 * fact about the player, never a control — so the whole mark lives here, title
 * and all, and neither caller can give it different words.
 *
 * **Muted rather than accent.** The baseball says "this one is yours", which is
 * the loudest thing a row can say on a board read to decide who to pick up; the
 * lock says "this one isn't available", which is the reader ruling a row *out*.
 * A mark that shouted about unavailability would make the board's own answer —
 * the free agents, the rows with no mark at all — the quietest thing on it. The
 * colour is `--muted`, one step down from the accent and the same tone the
 * identity block's own sub-line takes.
 *
 * It is drawn only where a fantasy league is connected: with no league there is
 * no ownership to read, and a lock is a claim rather than a decoration.
 */
export function LockMark({
  name,
  team,
  size = 13,
  width = 2,
}: {
  name: string;
  /** The fantasy team holding him. Named in the tooltip because "somebody else
   *  has him" is the fact and "who" is the next question — and it costs nothing:
   *  the ownership payload already carries the league's team names beside the
   *  map of who holds whom. */
  team: string;
  size?: number;
  width?: number;
}) {
  const label = `${name} is on ${team} in your ESPN league`;
  return (
    <span className="name-lock" title={label}>
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
        {/* Body and shackle, balanced about the box's own centre the way the
            baseball's seams are: the ink runs 3 → 20.5 down and 4.5 → 19.5
            across, so the mark sits on the same optical middle as the ball it
            stands beside and needs no nudge of its own — it takes the
            `.research-watched` alignment wholesale. */}
        <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
        <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
