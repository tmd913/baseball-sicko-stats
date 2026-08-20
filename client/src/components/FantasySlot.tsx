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
 * **What the plan did with this man over the span**, read once and read by both
 * the things that report it — the chip beside his name, which says *where* he
 * plays, and the `Starts` column, which says *how often*. Two readings of one
 * plan written twice is two readings that will one day disagree about a
 * Saturday, which is the argument the projection engine itself is shared on.
 *
 * `slots` is **his main one first**: a man at third all week with one day at
 * UTIL reads `3B/UTIL` rather than whichever he happened to fill on the Monday,
 * so they are ordered by how many days he spends there and by first appearance
 * where two are level. `lineup.days` arrives in date order, which is what makes
 * that second key stable.
 *
 * `title` is the days themselves, benched ones named — what neither a chip nor
 * a count can carry, since `3B` cannot say which days and `4` cannot say which
 * four. That sentence keeps the word **benched**: it is prose rather than a
 * label, and the two letters that read best on a chip read worst in the middle
 * of a sentence.
 */
export function readLineup(lineup: NonNullable<ProjectedPlayerLine['lineup']>): {
  slots: string[];
  /** Days the plan seats him. */
  seated: number;
  /** Days it could have — his club's games, or a starter's turns. */
  open: number;
  title: string;
} {
  const seated = lineup.days.length;
  const sat = new Set(lineup.days.map((d) => d.day));
  const off = lineup.openDays.filter((d) => !sat.has(d));

  const byCount = new Map<string, { n: number; first: number }>();
  lineup.days.forEach((d, i) => {
    const got = byCount.get(d.slot);
    if (got) got.n += 1;
    else byCount.set(d.slot, { n: 1, first: i });
  });
  const slots = [...byCount.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first)
    .map(([slot]) => slot);

  const startedPart = lineup.days.map((d) => `${prettyGameDate(d.day)} at ${d.slot}`).join(', ');
  const benchedPart = off.map((d) => prettyGameDate(d)).join(', ');
  const title = seated
    ? `Projected in the lineup ${startedPart}` + (off.length ? ` — benched ${benchedPart}` : '')
    : `Projected on the bench every day his club plays — ${benchedPart}`;
  return { slots, seated, open: lineup.openDays.length, title };
}

/**
 * **The same chip under the `Projected` lens, saying what the projection would
 * do rather than what ESPN's lineup says today.**
 *
 * The ordinary chip names one day's slot, which is the right answer for a table
 * of days already played and the wrong one for a span of days nobody has
 * played: over five days ahead there is no single slot he is *in*, there is a
 * set of decisions.
 *
 * **So it says where the plan puts him, and nothing else** — `2B`, `3B/UTIL`.
 * It carried the count of those days too (`2B 5/5`), and that is a column now:
 * see `SummaryTable.tsx::ProjectedStartsHead`. A chip is read in the name
 * column, which is the one column on this table with slack and the one every
 * other fact about the *player* already lives in; how many days he starts is a
 * fact about the *span*, and every other fact about the span on this row is a
 * figure in a column you can scan down and add up. It was neither here — no
 * two rows' counts lined up to be compared, and the `Total` row had no cell to
 * carry the seat-days in.
 *
 * It takes the lit state on the day chip's own rule, `starting` meaning the
 * lineup has him at all.
 *
 * **`BE` when it never starts him**, which is the vocabulary the rest of this
 * column already speaks rather than a word of its own: the day chip draws
 * ESPN's own slot names and `BE` is one of them, so a bench under the lens and
 * a bench without it are the same two letters. It keeps the muted outlined
 * shape that chip has always had, so the column still reads *lit is playing,
 * quiet is not* at a glance — and the `Starts` cell beside it reads `0`, which
 * is the same fact in the arithmetic the column keeps.
 *
 * **Nothing at all where his club has no game left**, which is the honest
 * absence: there is no lineup decision to show, the row's own figures are
 * dashes beside it for the same reason, and a chip would invent a benching out
 * of an off day.
 *
 * The days themselves are the tooltip — `readLineup`'s, the same sentence the
 * `Starts` cell carries.
 */
export function ProjectedSlotTag({ lineup }: { lineup: ProjectedPlayerLine['lineup'] }) {
  if (!lineup || lineup.openDays.length === 0) return null;
  const { slots, seated, title } = readLineup(lineup);
  return (
    <span className={`fantasy-slot${seated ? ' starting' : ''}`} title={title}>
      {/* **`BE` rather than a word**, which is the vocabulary the rest of this
          column already speaks: the day chip has always drawn ESPN's own slot
          names and `BE` is one of them, so a bench under the lens and a bench
          without it are the same two letters rather than two spellings of one
          fact. */}
      {seated ? slots.join('/') : 'BE'}
    </span>
  );
}
