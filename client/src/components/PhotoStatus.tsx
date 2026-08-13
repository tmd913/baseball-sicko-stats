import { useFantasySlot } from '../hooks';
import { espnInjuryBadge, rosterStatusBadge } from '../lib';
import type { Corner, RosterTone } from '../lib';
import type { RosterStatus } from '../types';

/**
 * The two things a headshot in this app says about the player rather than
 * about what he did: where today's game has him, and why he might not be in
 * one.
 *
 * They started on the summary table, which is the view that most needed the
 * name column back. They belong on the research board and the details view for
 * a different reason: those two open on players the user has never watchlisted,
 * so the row is the *first* thing he learns about a man, and "batting 3rd" or
 * "IL10" is most of what he is deciding on. One definition of both, drawn from
 * one place, so the board can't come to read differently from the table beside
 * it — each caller supplies only the class that sizes and pins it, since a 42px
 * row circle and a 64px header portrait want the same marks at different sizes.
 */

export interface StatusBadge {
  label: string;
  short: string;
  title: string;
  tone: RosterTone;
}

/**
 * The player's status, from whichever source has one — **MLB's leads and
 * ESPN's fills only the gap it leaves**.
 *
 * That `??` is the whole of the rule, and it is here rather than at three call
 * sites so it stays one rule. Where ESPN says `TEN_DAY_DL` MLB has already said
 * a 10-day stint, and one absence stated twice reads as two problems; what
 * ESPN is here for is day-to-day and out, which MLB's roster status has no code
 * for at all. The ESPN half is naturally absent without a connected league, and
 * for anyone in one who isn't on a roster in it.
 */
export function useStatusBadge(
  playerKey: string,
  rosterStatus: RosterStatus | null,
): StatusBadge | null {
  const spot = useFantasySlot(playerKey);
  return rosterStatusBadge(rosterStatus) ?? espnInjuryBadge(spot?.injuryStatus);
}

/**
 * The lineup-spot pip on the headshot's top corner: a batting-order number,
 * "SP" for a starting pitcher, a reliever's entry inning, or "!" for a
 * postponed game or a lineup that left him out.
 */
export function PhotoSpot({ corner, className }: { corner: Corner; className: string }) {
  if (!corner) return null;
  return (
    <span
      className={`lineup-spot ${className} spot-${corner.tone}`}
      title={corner.title}
      aria-label={corner.title}
    >
      {corner.text}
    </span>
  );
}

/**
 * The status as a short code on the headshot's bottom edge — `IL10`, `RA`,
 * `DTD`, `OUT`, `DFA`. The opposite pole of the circle from the pip above, so
 * the two never collide however many characters each takes.
 */
export function PhotoStatus({
  badge,
  className,
}: {
  badge: StatusBadge | null;
  className: string;
}) {
  if (!badge) return null;
  return (
    <span className={`${className} status-${badge.tone}`} title={badge.title} aria-label={badge.title}>
      {badge.short}
    </span>
  );
}
