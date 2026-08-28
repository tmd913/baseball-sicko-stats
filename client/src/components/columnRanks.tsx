import type { CSSProperties } from 'react';
import type { PlayerKind, ResearchRow } from '../types';
import type { Column } from './researchColumns';
import { ordinal } from '../lib';
import { OPPONENT_KEY, ROSTER_PCT_COLUMN, TREND_BY_KEY } from './researchColumns';
import { TURN_KEY } from './schedule';

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
 * ## The population: the qualified players on that board, and Savant's bar
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
 * - **Everyone on the board for that kind and window** — every row the
 *   leaderboard carries for that trade, before any pill or filter. This is what
 *   it used to be, and it is wrong for the reason a leaderboard has a qualifier
 *   at all: a man with forty plate appearances and a fluke .450 xwOBA is a
 *   *rung on the ladder* every real hitter is then measured against. That is
 *   not a rounding error — measured on the live season board, ranking the 634
 *   batters who have an xwOBA against all 634 rather than against the 247 who
 *   clear the bar moves a qualified batter's badge by a **mean of 16.8 points
 *   and as much as 27** (a pitcher's by 8.6 and 18). Masyn Winn's xwOBA reads
 *   **49** against everyone and **23** against the qualified; Savant says 22.
 *   Keibert Ruiz reads 33 and 6; Savant says 6.
 * - **The qualified players on that board**, which is what this is, and the bar
 *   is **Savant's own** rather than MLB's: 2.1 plate appearances per team game
 *   for a batter, 1.25 batters faced for a pitcher, measured per span. Both
 *   figures were reproduced off Savant's own `percentile-rankings` export
 *   before anything was built on them — see `qualifies` in `research.ts`, which
 *   carries the measurement and the boundary cases. `ResearchRow.qualified` is
 *   where it arrives, computed once on the server against the standings, since
 *   the client has no way to know how many games a club has played.
 *
 * **An unqualified player is not dropped and not blanked — he is placed on the
 * qualified players' scale**, and the badge says so with a dashed underline.
 * Only
 * the population that *defines* the scale changes; every row on the board still
 * carries a reading, which is the whole reason this board exists. That answers
 * the objection that retired the old `Qualified` toggle — reviving a subset
 * "would put a rule the reader cannot see back in the middle of one they can" —
 * on both halves: nobody is hidden, and the rule is stated in the badge's own
 * tooltip, in the toggle's, and in the expanded table's chrome.
 *
 * **The broken line is not a second meaning for a broken border; it is the
 * same one arriving on a second surface.** This app's standing rule is that
 * solid means measured and broken means ours, and the percentile card one tab
 * over already breaks its outline on **exactly these men**
 * (`.pct-bubble--est`): Savant publishes no `percent_rank_` for a player under
 * its bar, so the card ranks him itself and marks the bar as ours. That is the
 * same set of players and the same sentence — *the league publishes no standing
 * for this man, so this placement is ours* — so it speaks in the same
 * vocabulary: the same `dashed`, the same `--faint`.
 *
 * **The shape differs, and only the shape.** *(This paragraph claimed the
 * stronger thing for a while — that the two wear the same clothes and "agree
 * mark for mark" — and the badge was a dashed ring for exactly that reason. It
 * is an underline now.)* A ring round a colored bubble is a mark on a bubble;
 * there is no bubble in a table cell, and a closed ring there is a second
 * *box* under a full-size value, on the app's widest table, in a column where
 * qualification alternates row to row. An underline is the least that can carry
 * the same claim, in the one place the reader is already looking. See
 * `.col-rank--outside` in the stylesheet, which holds the measurement.
 *
 * **What a badge that was both projected and unqualified would draw** was asked
 * before the mark went on, and the answer is: one mark. Neither surface that
 * draws a `.col-rank` percentile has a projected reading today — the board and
 * the Stats tab hold measured stats only, and the League Rankings table's
 * `.col-rank` is a rank of *teams*, which this modifier is scoped away from.
 * If one ever arrives, the two claims are the same claim in different words
 * ("this figure is ours rather than the league's"), and a second broken outline
 * over the first would be two ways of saying one thing — the argument that took
 * the third mark off a projected start row. The chrome says `Projected` once
 * for the whole table, as the matchup card does, and the mark keeps its single
 * meaning.
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
  // **The day he starts is not a grade.** The turn filter's `Start` column
  // orders on where his turn sits in the window, which is what lets the reader
  // put Friday's men above Sunday's; a percentile of it would say Friday is
  // better than Sunday, which is a claim about the schedule and not about him.
  // Its `value` is an ordinal rather than a measurement, which is the same
  // thing `Opp` says by holding words.
  TURN_KEY,
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
  /** How many of the **qualified** players have a value in this column — the
   *  denominator, and what every tooltip states, since it is not the same in
   *  every column. */
  n: number;
  /** False when nobody on this board cleared the bar and the scale fell back to
   *  the whole population — see `rankScales`. The tooltip changes its noun
   *  rather than lying about a qualified population of everybody. */
  qualifiedScale: boolean;
  /** 0–100 with 100 at the good end, or null for a value the row hasn't got. */
  of(value: number | null): number | null;
  /** **1 at the good end, `n` at the other** — the same scale read as a
   *  standing rather than as a share. What the board's team reading draws, and
   *  what a thirty-row population can honestly say where a percentile of thirty
   *  would be a share to the nearest 3.3 points wearing two significant
   *  figures. Null for a value the row hasn't got, as `of` is. */
  rankOf(value: number | null): number | null;
}

export type RankScales = ReadonlyMap<string, RankScale>;

/** The bar in the reader's own terms, for the tooltips that state it. Kept
 *  beside the scale rather than beside the qualifier on the server, because the
 *  server ships a boolean and this is the sentence that boolean means. */
export const QUALIFIER_WORDS: Record<PlayerKind, string> = {
  batter: '2.1 plate appearances per team game',
  pitcher: '1.25 batters faced per team game',
};

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

/** The rows a scale is built from — the qualified ones. Exported so the toggle
 *  and the expanded table's chrome can say how many of the board they are,
 *  rather than counting the same thing twice with two rules. */
export const rankPopulation = (population: ResearchRow[]): ResearchRow[] =>
  population.filter((r) => r.qualified);

/**
 * Build a scale per rankable column over the **qualified** part of one
 * population.
 *
 * Sorted once per column and then binary-searched per cell, rather than a
 * percentile stored per row: the board re-renders on every keystroke in the
 * search box and every tap of a pill, and the population is unaffected by both
 * — so the sorting is memoised against the rows and the columns alone, while
 * the lookups ride along with the render that was happening anyway.
 *
 * **A board on which nobody qualifies keeps its badges**, ranked against
 * everybody, and every tooltip on it says "of the N batters" rather than "of
 * the N qualified batters". It is the standing rule that a failure costs its
 * own column and never the request, applied to the one input that can go empty:
 * `qualifies` returns false for the whole league when the window contains no
 * finished team game at all, and losing every badge on the table would be a
 * worse answer than ranking against the field and saying so. It is not reachable
 * on any window the board offers — the shortest is 7 days, where a club has
 * finished five to seven games and the measured bar is 12 to 14 PA, clearing
 * 271 of 406 batters — but the failure it guards is a table that silently
 * empties, which is the one this app least wants.
 */
export function rankScales(columns: Column[], population: ResearchRow[]): RankScales {
  const out = new Map<string, RankScale>();
  const qualified = rankPopulation(population);
  const qualifiedScale = qualified.length > 0;
  const pool = qualifiedScale ? qualified : population;
  for (const col of columns) {
    if (!isRankable(col)) continue;
    const values: number[] = [];
    for (const r of pool) {
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
      qualifiedScale,
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
      rankOf(value) {
        if (value === null || !Number.isFinite(value)) return null;
        // How many are strictly better, plus one. `lowerBound` is the count
        // strictly below and `n - upperBound` the count strictly above, so
        // **the direction is read off `ascFirst` and nowhere else** — the same
        // field that decides which way the header opens and which end the
        // percentile counts from. There is deliberately no second table of
        // which-way-is-good: a column that declares `ascFirst` is ranked 1st at
        // its smallest (a club 1st in ERA has the lowest ERA), every other
        // column 1st at its largest.
        const better = lowerIsBetter ? lowerBound(values, value) : n - upperBound(values, value);
        // **Ties share the top of their run**, which is the competition
        // convention `teamHitting.ts::rankAll` and `espn.ts::rankAll` already
        // use and the one the League table's own badge is drawn from: two clubs
        // level for 4th are both 4th and the next distinct figure is 6th. It is
        // deliberately *not* the midrank the percentile uses — that one exists
        // to stop two hundred batters with no home run reading as the best
        // nought, a problem thirty clubs with thirty distinct totals have not
        // got, and "joint 4th" is what a reader of a thirty-row table expects.
        return better + 1;
      },
    });
  }
  return out;
}

/**
 * **The fill under a rank chip** — 1st at one end of a diverging scale, last at
 * the other, the middle a plain neutral.
 *
 * Lifted here from `LeagueRankings.tsx`, which had it, when the research
 * board's **team** reading needed the same chip: a rank of clubs drawn under a
 * value is one object in this app, and two copies of a scale is how two
 * surfaces come to disagree about what 15th of 30 looks like. The tokens the
 * two ends resolve to are declared per surface in the stylesheet (`--rank-hot`
 * / `--rank-cold`), so this computes the *strength* and the sheet owns the
 * color — the split that rule already had.
 *
 * `n` is the rows ranked **in that column**, not the rows on the table: a club
 * with no figure is out of the ranking rather than at the bottom of it, and
 * gets no chip at all.
 */
const BADGE_MAX = 48;

export function rankFill(rank: number | undefined, n: number): CSSProperties | undefined {
  if (typeof rank !== 'number' || !Number.isFinite(rank) || n < 2) return undefined;
  // 0 at the best rank, 1 at the worst; `d` is the distance from the middle, so
  // the scale passes through the neutral chip where a row is neither.
  const t = Math.min(1, Math.max(0, (rank - 1) / (n - 1)));
  const d = Math.abs(t - 0.5) * 2;
  const pct = Math.round(d * BADGE_MAX * 10) / 10;
  return {
    '--rank-bg': `color-mix(in srgb, var(${t < 0.5 ? '--rank-hot' : '--rank-cold'}) ${pct}%, var(--panel-2))`,
  } as CSSProperties;
}

/**
 * What the population is called in a tooltip. Plural, because it always is.
 *
 * **The board's team reading passes its own** (`clubs`), and that is the whole
 * of what this module needed to serve thirty aggregates instead of six hundred
 * players. Everything else falls out of the population it is handed: `qualified`
 * is false on every club row — there is no bar to clear when all thirty have
 * played the span — so `rankScales` takes its already-written nobody-qualifies
 * path, the scale is built over all thirty, no row wears the broken line (a
 * mark every row would carry marks nothing), and the tooltip says the plain
 * noun. What must never happen is a percentile against six hundred *players*
 * rendering under a club's aggregate; a separate population is what prevents
 * it, and it is the same argument the file's head makes for not ranking a
 * qualified batter against the unqualified.
 */
const populationNoun = (kind: PlayerKind) => (kind === 'pitcher' ? 'pitchers' : 'batters');

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
 *
 * **The one mark it does carry is the dashed underline on a player outside the
 * population** — argued at the head of this file, and drawn as a
 * `text-decoration` for the reason `.pct-bubble--est` gives for its `outline`:
 * both are *painted* rather than laid out, so a mark that comes and goes down a
 * column cannot change a row's height or a table's width, which is the
 * `.sched-vs-estimated` argument about the same choice. Measured: neither moves
 * by a pixel.
 *
 * ---
 *
 * ## `asRank` — the same slot, a standing instead of a share
 *
 * The board's **team reading** draws `1st` … `30th` where the player reading
 * draws 0–100, and it is the same badge in the same slot rather than a second
 * one, because it is the same object: a place on this column's scale, under
 * the value, on a table of the board's own rows.
 *
 * **A percentile of thirty is a share to the nearest 3.3 points wearing two
 * significant figures.** The player badge's whole argument is that a percentile
 * is what a *sample* of six hundred can honestly say; a complete population of
 * thirty can say the thing itself, and `4th of 30` is both shorter and true in
 * a way `88` over thirty clubs is not.
 *
 * **And it is the League Rankings' badge, folded onto rather than copied.**
 * That table draws a rank of *teams* under a value in exactly this slot and in
 * exactly this class, and the stylesheet's note on it already says so: "the
 * rank under the value, in the slot and the type the research board's own
 * percentile badge takes — `.col-rank`, folded onto rather than restyled, so a
 * second line under a number is one object in this app." Two tables ranking
 * clubs 1-to-N under a number are the *same* object, not two that resemble each
 * other, so the fill comes from one `rankFill` above and the two ends of the
 * scale from one pair of tokens in the sheet.
 *
 * **The color is the League table's argument, arriving on a surface where the
 * objection to it has gone.** The monochrome rule two paragraphs up rests on
 * this table's color vocabulary being spoken for — "the live inning, the
 * postponement and the trend" — and on the *player* reading it still is. On the
 * team reading every one of those is off the board: `Opp` is not drawn (a club
 * has no per-player status map), the five trend columns are not drawn, and
 * there are no roster tints, no lineup pips and no IL codes, because there are
 * no players. So the scale is the only color on the table and it is spent on
 * the one thing this reading is *for* — where each club stands. It colors the
 * rank and never the value, which is the rule the League badge already carries.
 *
 * **Direction is `Column.ascFirst` and nothing else** — see `rankOf`. A column
 * that declares it is ranked 1st at its smallest, so a club 1st in ERA has the
 * league's lowest, and a column with no good end (`NO_GOOD_END`) draws no badge
 * at all on either reading.
 *
 * **No broken line, ever, on this reading.** There is no bar for a club to be
 * short of; `qualified` is false on all thirty, which is what makes
 * `qualifiedScale` false and the underline unreachable — it marks a row
 * *outside* a population, and a mark every row or no row would carry marks
 * nothing.
 */
export function RankBadge({
  col,
  scale,
  value,
  kind,
  population,
  qualified,
  noun,
  asRank = false,
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
  /** Whether this row is *in* that population — `ResearchRow.qualified`, which
   *  is Savant's bar measured over this span. False draws the dashed underline
   *  and
   *  adds the sentence explaining it; the number itself is the same either way,
   *  because he is placed on the same scale. */
  qualified: boolean;
  /** What the population is called, where "batters" and "pitchers" is not what
   *  it is — the team reading's thirty `clubs`. */
  noun?: string;
  /** Draw a standing (`4th`) rather than a percentile (`88`) — see the section
   *  on it above. The board's team reading, and nothing else. */
  asRank?: boolean;
}) {
  if (!scale) return null;
  if (value === 0 && DASHES_AT_ZERO.has(col.key)) return null;
  if (asRank) {
    const rank = scale.rankOf(value);
    if (rank === null) return null;
    const which = col.ascFirst
      ? ` Lower is better in this column, so 1st is the smallest ${col.label}.`
      : ` Higher is better in this column, so 1st is the largest ${col.label}.`;
    return (
      <span
        className="col-rank"
        style={rankFill(rank, scale.n)}
        title={`${col.title}: ${ordinal(rank)} of the ${scale.n} ${
          noun ?? populationNoun(kind)
        } with a figure on ${population}. 1 is best.${which}`}
      >
        {ordinal(rank)}
      </span>
    );
  }
  const pct = scale.of(value);
  if (pct === null) return null;
  const dir = col.ascFirst
    ? ' Lower is better in this column, so the rank is read from the small end up.'
    : '';
  // Only call them qualified where they are: a board on which nobody cleared
  // the bar is ranked against the field, and says the plain noun instead.
  const outside = scale.qualifiedScale && !qualified;
  const plain = noun ?? populationNoun(kind);
  const who = scale.qualifiedScale ? `qualified ${plain}` : plain;
  const short = outside
    ? ` He is short of that bar himself (${QUALIFIER_WORDS[kind]}), so this is his place on` +
      ' their scale rather than a standing among them — which is what the dashed underline says.'
    : '';
  return (
    <span
      className={`col-rank${outside ? ' col-rank--outside' : ''}`}
      title={`${col.title}: ${ordinal(
        pct,
      )} percentile of the ${scale.n} ${who} with a figure on ${population}. 100 is best.${dir}${short}`}
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
 * population is stated too — **including the qualifier**, since a scale built
 * over a subset owes the reader the rule that made the subset. The caller
 * supplies the population's words because only it knows the board and the span;
 * what is added here is the half that is true on both surfaces, that nobody is
 * dropped for missing the bar.
 */
export function RanksButton({
  on,
  onToggle,
  population,
  asRank = false,
  disabled = false,
}: {
  on: boolean;
  onToggle: () => void;
  /** What a badge would be ranked against, for the tooltip. */
  population: string;
  /** The badges are standings rather than percentiles — the board's team
   *  reading. The sentence changes with the badge, since 1-is-best and
   *  100-is-best are opposite instructions. */
  asRank?: boolean;
  /**
   * There is no population to rank against right now.
   *
   * The player page's Stats tab is the one caller: a **cut** of a span has no
   * board behind it — Savant ranks whole spans, not spans against left-handers
   * — so the toggle would be a control offering something the table cannot
   * draw. Off and inert rather than absent, because a control that vanishes
   * takes its own explanation with it; the caller wraps it in the element that
   * carries the reason, a disabled button showing no `title` of its own.
   */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`research-toggle${on && !disabled ? ' on' : ''}`}
      aria-pressed={on && !disabled}
      disabled={disabled}
      onClick={onToggle}
      title={
        asRank
          ? `Show each club's rank under every value — 1st to 30th, with 1st always the good end, among ${population}.`
          : `Show a percentile rank under every value — 0 to 100, with 100 always the good end, against ${population}. Anyone short of the bar is still placed on that scale, with a dashed underline under the badge.`
      }
    >
      {/* Three bars rising to the right: a rank, drawn as one. */}
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M5 20v-5M12 20V9M19 20V4" />
      </svg>
      <span className="research-toggle-label">Ranks</span>
    </button>
  );
}
