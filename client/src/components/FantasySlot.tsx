import { useFantasySlot } from '../hooks';
import type { FantasySlot } from '../hooks';
import { prettyGameDate } from '../lib';
import type { ProjectedPlayerLine } from '../types';

/**
 * Where this player sits in the user's fantasy lineup on the last day of the
 * range in view — `SS`, `UTIL`, `SP`, `BE`, `IL`.
 *
 * Renders nothing at all unless the views are reading the fantasy roster, so
 * it can be dropped in beside every name in the app and simply not be there
 * the rest of the time.
 *
 * **The distinction it exists to draw is starting versus not**, which is why
 * that is carried by color and weight rather than left to the reader to infer
 * from the slot name: a lineup spot takes the accent, the bench and the IL go
 * muted and outlined. Someone scanning their team wants to know who was
 * actually accruing stats that day, and `BE` versus `2B/SS` is not a
 * distinction the eye makes at a glance.
 *
 * A fully-round pill, per the app's rule that round is for things you read and
 * the control radius is for things you press.
 */

/**
 * **The day is named unless it is today**, and the reason is the one this doc
 * set keeps arriving at: a pill reading "today" over a range that ended last
 * Tuesday is a lie the reader has no way to catch. It was one — the chip has
 * always been anchored to a day and the wording assumed that day was today,
 * which was already wrong on the `Tomorrow` preset before a past range could
 * reach it at all. `spot.day` is null exactly when the slot really did come off
 * today's roster, failed reads included, so the word and the fact cannot part.
 */
function dayTitle(spot: FantasySlot): string {
  const when = spot.day === null ? 'today' : `on ${prettyGameDate(spot.day)}`;
  // Whose lineup, possessive — `your` unless the table is drawing somebody
  // else's team, which only the League page's Matchup tab does.
  const who = spot.owner ?? 'your';
  return spot.starting
    ? `In ${who} fantasy lineup ${when} at ${spot.slot}`
    : spot.slot === 'IL'
      ? `On ${who} fantasy injured list ${when}`
      : `On ${who} fantasy bench ${when}`;
}

/**
 * What the chip cannot say and the row needs said: the slot is one day's, and
 * over a range the numbers beside it are the days he was started on. Silent on
 * a single day, where the two are the same fact, and silent without per-day
 * lineups, where there is only the one day to report.
 */
function rangeTitle(spot: FantasySlot): string {
  const { startedDays, rangeDays } = spot;
  if (startedDays === null || rangeDays === null || rangeDays < 2) return '';
  return ` · in ${spot.owner ?? 'your'} lineup on ${startedDays} of the ${rangeDays} days in view`;
}

export function FantasySlotTag({ playerKey }: { playerKey: string }) {
  const spot = useFantasySlot(playerKey);
  if (!spot) return null;
  return (
    <span
      className={`fantasy-slot${spot.starting ? ' starting' : ''}`}
      title={dayTitle(spot) + rangeTitle(spot)}
    >
      {spot.slot}
    </span>
  );
}

/**
 * **The same chip under the `Projected` lens, saying what the projection would
 * do rather than what ESPN's lineup says today.**
 *
 * The ordinary chip names one day's slot, which is the right answer for a table
 * of days already played and the wrong one for a span of days nobody has
 * played: over five days ahead there is no single slot he is *in*, there is a
 * set of decisions. So it counts them — **`4 of 5`**, four of the five days his
 * club plays — and takes the lit state on the same rule the day chip does,
 * `starting` meaning the lineup has him at all.
 *
 * **`benched` rather than `0 of 5`**, because the one row a reader is looking
 * for here is the man the projection never starts, and a nought among counts is
 * not what the eye catches. It is the same muted, outlined shape the `BE` chip
 * has always had, so the column still reads *lit is playing, quiet is not* at a
 * glance.
 *
 * **Nothing at all where his club has no game left**, which is the honest
 * absence: there is no lineup decision to show, the row's own figures are
 * dashes beside it for the same reason, and a chip would invent a benching out
 * of an off day.
 *
 * The days themselves are the tooltip, benched ones named — which is where a
 * count has to be able to defer to, since *4 of 5* cannot say which four.
 */
export function ProjectedSlotTag({ lineup }: { lineup: ProjectedPlayerLine['lineup'] }) {
  if (!lineup || lineup.openDays.length === 0) return null;
  const seated = lineup.days.length;
  const sat = new Set(lineup.days.map((d) => d.day));
  const off = lineup.openDays.filter((d) => !sat.has(d));
  const startedPart = lineup.days
    .map((d) => `${prettyGameDate(d.day)} at ${d.slot}`)
    .join(', ');
  const benchedPart = off.map((d) => prettyGameDate(d)).join(', ');
  const title = seated
    ? `Projected in the lineup ${startedPart}` + (off.length ? ` — benched ${benchedPart}` : '')
    : `Projected on the bench every day his club plays — ${benchedPart}`;
  return (
    <span className={`fantasy-slot${seated ? ' starting' : ''}`} title={title}>
      {seated ? `${seated} of ${lineup.openDays.length}` : 'benched'}
    </span>
  );
}
