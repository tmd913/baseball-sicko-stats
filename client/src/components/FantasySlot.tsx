import { useFantasySlot } from '../hooks';

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
