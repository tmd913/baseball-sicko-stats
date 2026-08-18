import type { PlayerKind, ResearchRow } from '../types';
import type { Column } from './researchColumns';
import { OPPONENT_KEY, ROSTER_PCT_COLUMN, TREND_BY_KEY } from './researchColumns';

/**
 * **A percentile rank for every stat, on both tables built from the shared
 * column vocabulary** — the research board and the player page's Stats tab.
 *
 * A number on a research table says what a player did; it does not say whether
 * that is any good. `.265` is a fine batting average, a poor xwOBA and an
 * extraordinary barrel rate, and the reader is left to know which. The badge
 * under each value answers it in one figure: **0–100, and 100 is always the
 * good end.**
 *
 * Everything about the rule lives here and nowhere else, which is the point of
 * the file. Neither the board nor the Stats tab computes a percentile of its
 * own — each hands this module a population and a column list and gets back a
 * scale per column, so the same player's 30-day xwOBA cannot rank two ways in
 * one app. That is the argument `researchColumns.tsx` makes about the
 * vocabulary and `getPlayerWindows` makes about the rows: one definition,
 * consulted twice, rather than two that agree until somebody touches one.
 *
 * ---
 *
 * ## The population: the whole board for that kind and window
 *
 * A percentile means nothing without a stated population, and there were three
 * candidates.
 *
 * - **The board as the reader has narrowed it** — the include buttons, the
 *   position pill, the search box, the stat filters — was rejected on two
 *   counts. It *moves under the reader*: filtering to shortstops would rewrite
 *   every badge on the table, so a 62 becomes an 88 with nothing on screen
 *   saying the yardstick changed, and each is a different claim ("88th of the
 *   103 shortstops" against "62nd of the 622 batters"). And the Stats tab has
 *   no pills at all, so a narrowed population is one the two surfaces could
 *   never agree on.
 * - **A qualified subset** — the old `Qualified` rule, 3.1 PA per team game and
 *   the rest — was rejected because that toggle has been removed from the board
 *   and `ResearchRow.qualified` now has no reader on either side of the wire.
 *   Reviving it here to gate a badge would put a rule the reader cannot see
 *   back in the middle of one they can.
 * - **The whole board for that kind and window**, which is what this is: every
 *   row the leaderboard carries for that trade, before any pill or filter — the
 *   `M` in the count line's "455 of 622 batters" with all three include buttons
 *   on. It is fixed for a given board, it is the same set on both surfaces, and
 *   it is a number the reader has already been shown.
 *
 * **Nulls are out of the denominator, not at the bottom of it.** A player
 * Savant has no barrel rate for has not got a bad barrel rate, so he is not one
 * of the players a barrel rate is ranked within — the reasoning the sort
 * already applies when it sends blanks to the bottom in both directions rather
 * than treating them as zero. So each column's population is the players who
 * have a value in *that* column, and `n` is stated in every badge's tooltip
 * precisely because it differs column to column: a batting board carries a PA
 * for everybody and an exit velocity for whoever put a ball in play.
 *
 * **A row with no value gets no badge at all**, never a 0. Absence and dead
 * last are different facts, and the table already draws the first as an em
 * dash.
 *
 * ---
 *
 * ## Orientation: 100 is the good end, whichever end that is
 *
 * `Column.ascFirst` is already this table's statement of which way a column
 * points — it is why ERA opens on its smallest and HR on its largest — so the
 * percentile reads it rather than declaring the same fact twice. A column that
 * declares it is ranked from the small end up; every other column from the
 * large end up. The reader then never has to remember per-column polarity to
 * read a row across, which is the only thing that makes a badge on forty
 * columns worth having. It is the same move `PlatoonSplits` makes with
 * `lowerBetter` to decide which side of its rail a bar runs toward, and the one
 * `percentiles.ts` bakes into the card on the server.
 *
 * ## …and a column with no good end gets no badge
 *
 * Some columns decline to point anywhere, and the vocabulary already says so by
 * declaring no `ascFirst` on **either** board: launch angle and the GB/LD/FB
 * split are "a profile, not a grade", in the words of the file that defines
 * them. A percentile of a profile would be a claim that more fly balls is
 * better than fewer, which nobody who reads this table believes. `Opp` holds
 * words rather than a number. And the Fantasy group — `Ros%` and its five trend
 * columns — is a fact about a *market* rather than about a player: rostered in
 * more leagues than 94% of batters is not a stat, and "rose faster than 94% of
 * the league this week" is news rather than merit.
 *
 * Those are exactly the seven columns the Stats tab already cuts, plus the four
 * profile columns — so the rule reads the same on both surfaces.
 *
 * `NO_GOOD_END` is a set of keys rather than a flag on each column literal, on
 * the precedent `DEFAULT_OFF` sets in `researchColumns.tsx`: one block that can
 * be read at a glance beats a field threaded through forty object literals, and
 * a column added later is **rankable by default**, which is the same safe
 * direction that rule fails in.
 */
export const NO_GOOD_END: ReadonlySet<string> = new Set<string>([
  // Words, not a number — its `value` is null throughout anyway.
  OPPONENT_KEY,
  // The market, not the player.
  ROSTER_PCT_COLUMN.key,
  ...TREND_BY_KEY.keys(),
  // A profile rather than a grade — the same four that decline an `ascFirst` on
  // both boards.
  'launchAngle',
  'gbRate',
  'ldRate',
  'fbRate',
]);

/** Whether a percentile can honestly be drawn for this column. */
export const isRankable = (col: Column): boolean => !col.text && !NO_GOOD_END.has(col.key);

/**
 * **The credit columns print a dash where the value is nought, and a badge under
 * a dash is a rank of nothing.**
 *
 * `credit()` is the formatter W, L, SV, HLD and SVHD share, and it exists
 * because "a column of noughts reads as data when it isn't" — almost every row
 * of the pitching board has no saves. A percentile under that dash puts the
 * noise straight back: five hundred relievers reading `—` with a `25` beneath
 * it, which is a true statement about a distribution and an answer to a
 * question nobody asked of an empty cell.
 *
 * So the rule is the plainest one available: **where the cell prints no value,
 * the badge prints none either.** The zero is still in the column's population —
 * it is a real nought and the men who *do* have saves are ranked against it —
 * only the badge on that particular cell is dropped. Keys rather than a flag on
 * the column, for the reason `NO_GOOD_END` above is keys.
 */
const DASHES_AT_ZERO: ReadonlySet<string> = new Set(['wins', 'losses', 'saves', 'holds', 'svhd']);

/**
 * One column's yardstick: the population's values in it, sorted, and the rule
 * for turning one of them into a percentile.
 */
export interface RankScale {
  /** How many of the board have a value in this column — the denominator, and
   *  what every tooltip states, since it is not the same in every column. */
  n: number;
  /** 0–100 with 100 at the good end, or null for a value the row hasn't got. */
  of(value: number | null): number | null;
}

export type RankScales = ReadonlyMap<string, RankScale>;

/**
 * **Ties share the middle of their run rather than the top of it.**
 *
 * The usual "share of the league at or below you" reading breaks on a counting
 * column: two hundred batters have hit no home runs, and giving every one of
 * them the percentile of the *best* nought would put a man with no home runs
 * ahead of a third of the league. The midrank — half the tie run counted below
 * and half above — puts them all in the middle of it, which is where they are.
 *
 * A league leader with nobody level lands on `100 × (n − 0.5) / n`, which
 * rounds to 100 on any population this table holds; the last man with nobody
 * level lands just above 0 and rounds to it, which is honest rather than
 * awkward — a 0 means dead last, where an absent badge means no value at all.
 */
function midrank(worse: number, ties: number, n: number): number {
  return Math.max(0, Math.min(100, Math.round((100 * (worse + ties / 2)) / n)));
}

/** First index whose value is >= x, in an ascending array. */
function lowerBound(sorted: number[], x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index whose value is > x, in an ascending array. */
function upperBound(sorted: number[], x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Build a scale per rankable column over one population.
 *
 * Sorted once per column and then binary-searched per cell, rather than a
 * percentile stored per row: the board re-renders on every keystroke in the
 * search box and every tap of a pill, and the population is unaffected by both
 * — so the sorting is memoised against the rows and the columns alone, while
 * the lookups ride along with the render that was happening anyway.
 */
export function rankScales(columns: Column[], population: ResearchRow[]): RankScales {
  const out = new Map<string, RankScale>();
  for (const col of columns) {
    if (!isRankable(col)) continue;
    const values: number[] = [];
    for (const r of population) {
      const v = col.value(r);
      // `Number.isFinite` rather than a null test alone: a derived rate guards
      // its own denominator and returns null, but a stray Infinity or NaN from
      // a column added later would sort to one end and drag the whole column's
      // percentiles with it.
      if (v !== null && Number.isFinite(v)) values.push(v);
    }
    if (values.length === 0) continue;
    values.sort((a, b) => a - b);
    const n = values.length;
    const lowerIsBetter = col.ascFirst === true;
    out.set(col.key, {
      n,
      of(value) {
        if (value === null || !Number.isFinite(value)) return null;
        const lo = lowerBound(values, value);
        const hi = upperBound(values, value);
        const ties = hi - lo;
        // "Worse" is the small end for a column whose good end is the large
        // one, and the large end for a column that declares `ascFirst`.
        const worse = lowerIsBetter ? n - hi : lo;
        return midrank(worse, ties, n);
      },
    });
  }
  return out;
}

/** What the population is called in a tooltip. Plural, because it always is. */
const populationNoun = (kind: PlayerKind) => (kind === 'pitcher' ? 'pitchers' : 'batters');

/** `94th`, `1st`, `22nd` — so the badge's tooltip reads as a sentence. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * **The badge, under the value rather than beside it.**
 *
 * Beside it was the first shape and it is unaffordable on the surface that
 * matters: the board carries 23 to 44 columns, already overflows a 1920px
 * screen, and its exemption from the wider gutter clamp is argued in exactly
 * these terms — "a pixel a side is 54px of scroll on a 27-column board". An
 * inline badge is twenty-odd pixels a cell, which is five hundred across a
 * default board and two more stat columns pushed off the right edge of a phone.
 *
 * A second line costs the table almost nothing across, the value above it being
 * usually the wider of the two, and it costs the **board** nothing down either:
 * the row is 58px, set by the 42px headshot (6 + 46 + 6 against a text cell's
 * 12 + content + 12), which leaves 34px of content budget where the identity
 * block under the player's name already spends 31 and the `Opp` cell already
 * draws two lines. 16px of value over 12px of rank is 28. The Stats tab's row
 * is tighter and does grow — see the measurements in the docs.
 *
 * The value stays the primary reading: full size and full weight above, the
 * rank smaller and in `--faint`, the tone the board already gives the quieter
 * of two lines in a cell (`.research-opp-sp`).
 *
 * **Monochrome, deliberately.** A heat scale is the obvious thing to reach for
 * and this table has already refused it once: "the stat columns are monochrome
 * — OPS and ERA used to be `--accent`, which just made the eye jump between
 * columns. Color is reserved for *state*." A green 94 beside a red 12 would be
 * a second color system on the one table whose color vocabulary is already
 * spoken for by the live inning, the postponement and the trend.
 */
export function RankBadge({
  col,
  scale,
  value,
  kind,
  population,
}: {
  col: Column;
  scale: RankScale | undefined;
  /** The row's value in this column — the caller has it already. */
  value: number | null;
  kind: PlayerKind;
  /** What the population is, in words: "the Season board", "the 30-day board".
   *  Named rather than implied, because a reader has to be able to find out
   *  what they are being ranked against. */
  population: string;
}) {
  if (!scale) return null;
  if (value === 0 && DASHES_AT_ZERO.has(col.key)) return null;
  const pct = scale.of(value);
  if (pct === null) return null;
  const dir = col.ascFirst
    ? ' Lower is better in this column, so the rank is read from the small end up.'
    : '';
  return (
    <span
      className="col-rank"
      title={`${col.title}: ${ordinal(pct)} percentile of the ${scale.n} ${populationNoun(
        kind,
      )} with a figure on ${population}. 100 is best.${dir}`}
    >
      {pct}
    </span>
  );
}

/**
 * The toggle that draws them, shared by the board's tools group and the Stats
 * tab's caption row so the two cannot come to look like different controls —
 * the rule `ColumnsButton` already follows next door.
 *
 * A toggle rather than an always-on badge because this is the app's widest
 * table and a second line in every cell of every row is a great deal of ink for
 * a reading not everybody wants. It takes `.on` and never `.active`: it has no
 * panel, which is the same shape the Watchlist button beside it has.
 *
 * The **label is "Ranks"** rather than "Percentiles", and the reason is the
 * bar's line budget: the tools group is one flex item that wraps whole, and the
 * longer word takes it past the width where a 1920px window keeps the whole
 * control set on one row. The tooltip says the long version, which is where the
 * population is stated too.
 */
export function RanksButton({
  on,
  onToggle,
  population,
}: {
  on: boolean;
  onToggle: () => void;
  /** What a badge would be ranked against, for the tooltip. */
  population: string;
}) {
  return (
    <button
      type="button"
      className={`research-toggle${on ? ' on' : ''}`}
      aria-pressed={on}
      onClick={onToggle}
      title={`Show a percentile rank under every value — 0 to 100, with 100 always the good end, against ${population}`}
    >
      {/* Three bars rising to the right: a rank, drawn as one. */}
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M5 20v-5M12 20V9M19 20V4" />
      </svg>
      <span className="research-toggle-label">Ranks</span>
    </button>
  );
}
