import { useFantasySlot } from '../hooks';
import { espnInjuryBadge } from '../lib';

/**
 * Where this player sits in the user's fantasy lineup today — `SS`, `UTIL`,
 * `SP`, `BE`, `IL`.
 *
 * Renders nothing at all unless the views are reading the fantasy roster, so
 * it can be dropped in beside every name in the app and simply not be there
 * the rest of the time.
 *
 * **The distinction it exists to draw is starting versus not**, which is why
 * that is carried by colour and weight rather than left to the reader to infer
 * from the slot name: a lineup spot takes the accent, the bench and the IL go
 * muted and outlined. Someone scanning their team wants to know who is
 * actually accruing stats today, and `BE` versus `2B/SS` is not a distinction
 * the eye makes at a glance.
 *
 * A fully-round pill, per the app's rule that round is for things you read and
 * the control radius is for things you press.
 */
export function FantasySlotTag({ playerKey }: { playerKey: string }) {
  const spot = useFantasySlot(playerKey);
  if (!spot) return null;
  return (
    <span
      className={`fantasy-slot${spot.starting ? ' starting' : ''}`}
      title={
        spot.starting
          ? `In your fantasy lineup today at ${spot.slot}`
          : spot.slot === 'IL'
            ? 'On your fantasy injured list'
            : 'On your fantasy bench today'
      }
    >
      {spot.slot}
    </span>
  );
}

/**
 * ESPN's injury designation — `DTD`, `OUT` — beside the name.
 *
 * It exists because **MLB's roster status cannot say either**: a day-to-day
 * player is still on the active roster, so `rosterStatusBadge` correctly draws
 * nothing for him, and the row was a name with no hint that he is hurt. ESPN's
 * league roster is the only payload in the app that carries it (its cookie-free
 * season-wide list does not), which is why this rides on the fantasy roster
 * context and, like the slot chip, is simply absent the rest of the time.
 *
 * Takes the same `.roster-status` chip MLB's own badge uses rather than a chip
 * of its own: they occupy one slot on the row, they never appear together, and
 * two shapes for one idea would only invite the reader to look for a difference
 * that isn't there.
 */
export function FantasyInjuryTag({ playerKey }: { playerKey: string }) {
  const spot = useFantasySlot(playerKey);
  const badge = espnInjuryBadge(spot?.injuryStatus);
  if (!badge) return null;
  return (
    <span className={`roster-status roster-status-${badge.tone}`} title={badge.title}>
      {badge.label}
    </span>
  );
}
