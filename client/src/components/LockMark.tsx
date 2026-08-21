/**
 * The padlock: a player somebody else in your ESPN league is already holding.
 *
 * The precedent is `BaseballMark` and the rule is the same one — one marker for
 * one concept, drawn from one path, because a glyph copied into two callers is a
 * glyph that eventually differs in one of them.
 *
 * **Two exports, because the mark has two kinds of caller.** `LockMark` is the
 * labeled mark on a row: a fact about a player, never a control, and the same
 * label in both places it appears, so the title lives here and neither caller
 * can give it different words. `LockGlyph` is the path alone, which is what the
 * research board's `Other Rosters` button draws — a *control*, whose accessible
 * name is its own label and whose color is the button's `.on` state rather
 * than this file's. That split is the one `BaseballMark` has always had (it
 * exports the glyph and lets each caller wrap it); the lock only needed it once
 * a button had to wear the same mark as the rows it selects.
 *
 * **Muted rather than accent.** The baseball says "this one is yours", which is
 * the loudest thing a row can say on a board read to decide who to pick up; the
 * lock says "this one isn't available", which is the reader ruling a row *out*.
 * A mark that shouted about unavailability would make the board's own answer —
 * the free agents, the rows with no mark at all — the quietest thing on it. The
 * color is `--muted`, one step down from the accent and the same tone the
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
      <LockGlyph size={size} width={width} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** The padlock alone, in `currentColor` and saying nothing — for a caller that
 *  supplies its own name and its own color. */
export function LockGlyph({
  size = 13,
  width = 2,
  open = false,
}: {
  size?: number;
  width?: number;
  /** **The shackle swung clear** — the mark for a player *nobody* has, which is
   *  the same statement as the closed one with its subject negated. The board's
   *  Free Agents button is the only caller: it had a two-letter `FA` where the
   *  two beside it had glyphs, and `FA Free Agents` is a label saying itself
   *  twice. Drawn from the same body so the set of three reads as one
   *  vocabulary — a ball, a lock, and that lock undone. */
  open?: boolean;
}) {
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
      {/* Body and shackle, balanced about the box's own center the way the
          baseball's seams are: the ink runs 3 → 20.5 down and 4.5 → 19.5
          across, so the mark sits on the same optical middle as the ball it
          stands beside and needs no nudge of its own — it takes the
          `.research-watched` alignment wholesale. */}
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      {/* Closed, the shackle comes down on both sides of the body; open, its
          right leg is missing and the arc stops at the top. Same start point
          and same radius either way, so the two marks share a silhouette and
          differ only where it matters. */}
      <path d={open ? 'M8 10.5V7a4 4 0 0 1 7.9-0.9' : 'M8 10.5V7a4 4 0 0 1 8 0v3.5'} />
    </svg>
  );
}
