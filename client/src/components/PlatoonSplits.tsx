import type { PitcherSeasonStats, SeasonStats } from '../types';

/**
 * **The Splits tab: the two halves of the platoon, read against each other.**
 *
 * The platoon card this replaces printed three blocks of stat pills — Overall,
 * vs LHP, vs RHP — and left the comparison to the reader's own subtraction. That
 * is the one thing a platoon split is *for*: nobody opens it to learn a hitter's
 * OPS against lefties, they open it to learn whether he is a different hitter
 * against them. So every stat here is drawn **once**, as a bar saying which side
 * he is stronger against and by how much.
 *
 * ### What the bar means
 *
 * The track's **centre is zero and means no split at all**. The fill grows from
 * it toward the side he is *better* against, and its length is the size of that
 * edge measured against `full` — **the 90th percentile of that stat's real
 * platoon gaps**, measured rather than guessed (see the two tables below). So a
 * full bar means one thing on every row — *a top-decile split in this stat* —
 * and two rows of different stats are readable against each other, which is the
 * whole reason the rail is not scaled to each player's own numbers.
 *
 * **Direction carries the polarity, and nothing else does.** A row where less is
 * better (`lowerBetter` — a pitcher's FIP, a batter's K%) is not drawn with a
 * reversed scale or a differently-coloured fill; it points at whichever side the
 * *smaller* number belongs to, which is the same sentence as every other row:
 * "he is stronger against this side". That is the whole reason the bar is
 * anchored at a centre rather than at an end. A fill anchored left and scaled to
 * a share of L+R — the shape `RateBar` already draws — inverts its meaning on
 * exactly those rows, and flattens every other one: .900 against .700 is a 56/44
 * bar, which is not what a .200 OPS gap looks like.
 *
 * The two figures are printed either side of the track, the stronger one in the
 * text colour and the weaker one muted, so the direction is stated twice and the
 * exact numbers are never hidden behind the picture. Each row's tooltip spells
 * the whole thing out in a sentence, gap and all.
 *
 * ### What is not here
 *
 * **Counting stats.** HR, RBI, AB, hits — every one of them scales with how
 * often he faced that hand, and a right-handed hitter takes about 70% of his
 * plate appearances against right-handers. A raw count says which side he *saw
 * more of*, which is a fact about the schedule rather than about him. Everything
 * worth comparing is therefore a rate; power is here as ISO and as home runs per
 * PA rather than as a home-run count. Runs and steals are doubly out — see the
 * note in `PlayerDetails`: MLB returns both as 0 on every platoon split, for
 * every player.
 *
 * **A pitcher's ERA**, which MLB does not split (earned runs aren't charged by
 * the batter's hand), so the pitcher's headline row is OPS against and its
 * ERA-scale row is FIP, which *is* computable from a split's own counts.
 */

/** One comparable stat, in whichever kind's line it lives on. */
interface SplitStat<T> {
  key: string;
  label: string;
  /** What the stat is — the first half of the row's tooltip. */
  title: string;
  /** The figure on one side, or null where the source can't answer for it: a
   *  split with under three innings has no FIP, and dashes rather than guessing. */
  value: (s: T) => number | null;
  /** How the figure prints. */
  format: (v: number) => string;
  /** How a *difference* of that size reads. A rate's gap is another rate, but a
   *  gap between two percentages is a number of points and must not print a `%`
   *  after it, which would read as a percentage of a percentage. */
  gapText: (v: number) => string;
  /** The gap that fills the rail end to end. See the tables below. */
  full: number;
  lowerBetter?: boolean;
}

/** A rate in baseball's own leading-dot form — ".947". */
const rate3 = (v: number): string => {
  const t = v.toFixed(3);
  return t.startsWith('0.') ? t.slice(1) : t;
};
const pct1 = (v: number): string => `${v.toFixed(1)}%`;
const pts1 = (v: number): string => `${v.toFixed(1)} pts`;
const dec2 = (v: number): string => v.toFixed(2);

/** MLB hands these down as pre-formatted strings — ".947", "1.19" — and the
 *  server's own em-dash where it has nothing. `Number('')` is 0 and
 *  `Number('—')` is NaN, so the empty and the missing case both have to be
 *  caught rather than parsed. */
function num(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A rate that exists only as a count over a denominator this object carries. */
function share(count: number, of: number): number | null {
  return of > 0 ? (count / of) * 100 : null;
}

/**
 * **The batter's rows.** The slash line and its headline first, because that is
 * the order a batting line is read in and OPS is the number a platoon split gets
 * argued about in; then power net of average, then the two three-true-outcome
 * rates, which is where a platoon split usually *comes from* — a right-handed
 * hitter's trouble with a right-handed slider shows up in K% long before it
 * shows up in OPS. K% is also the batter side's one `lowerBetter` row, which is
 * the case the centre anchor exists for.
 *
 * **The `full` figures were measured off the league rather than chosen.** Every
 * 2026 batter with at least 100 PA against each hand (167 of them) had his gap
 * in each of these eight stats computed, and `full` is the 90th percentile of
 * that distribution, rounded: OPS **.283 → .300**, AVG .087 → .090, OBP .091 →
 * .090, SLG .204 → .200, ISO .140, HR% 3.34 → 3.5, K% 8.51 → 8.5, BB% 6.61 →
 * 6.5. (The medians, for scale, are .101 of OPS and 3.3 points of K% — so the
 * ordinary platoon split fills about a third of the rail and the rail's end is
 * a real place rather than a decoration.) A gap past `full` clamps and squares
 * off its outer end to say it has: about one qualified hitter in ten does that
 * on any given row, by construction.
 */
const BATTER_STATS: SplitStat<SeasonStats>[] = [
  {
    key: 'ops',
    label: 'OPS',
    title: 'On-base plus slugging',
    value: (s) => num(s.ops),
    format: rate3,
    gapText: rate3,
    full: 0.3,
  },
  {
    key: 'avg',
    label: 'AVG',
    title: 'Batting average',
    value: (s) => num(s.avg),
    format: rate3,
    gapText: rate3,
    full: 0.09,
  },
  {
    key: 'obp',
    label: 'OBP',
    title: 'On-base percentage',
    value: (s) => num(s.obp),
    format: rate3,
    gapText: rate3,
    full: 0.09,
  },
  {
    key: 'slg',
    label: 'SLG',
    title: 'Slugging percentage',
    value: (s) => num(s.slg),
    format: rate3,
    gapText: rate3,
    full: 0.2,
  },
  {
    key: 'iso',
    label: 'ISO',
    title: 'Isolated power — extra bases per at-bat (SLG − AVG)',
    value: (s) => {
      const slg = num(s.slg);
      const avg = num(s.avg);
      return slg === null || avg === null ? null : slg - avg;
    },
    format: rate3,
    gapText: rate3,
    full: 0.14,
  },
  {
    key: 'hrRate',
    label: 'HR%',
    title: 'Home runs per plate appearance',
    value: (s) => share(s.hr, s.pa),
    format: pct1,
    gapText: pts1,
    full: 3.5,
  },
  {
    key: 'kRate',
    label: 'K%',
    title: 'Strikeouts per plate appearance',
    value: (s) => share(s.strikeOuts, s.pa),
    format: pct1,
    gapText: pts1,
    full: 8.5,
    lowerBetter: true,
  },
  {
    key: 'bbRate',
    label: 'BB%',
    title: 'Walks per plate appearance',
    value: (s) => share(s.baseOnBalls, s.pa),
    format: pct1,
    gapText: pts1,
    full: 6.5,
  },
];

/**
 * **The pitcher's rows** — the same shape from the other side of the plate, and
 * five of the seven are `lowerBetter`. On his card almost every bar points at
 * the *smaller* number and still means "he handles this side better", which is
 * the whole argument for a centre-anchored rail rather than a left-anchored one.
 *
 * ERA is absent because MLB does not split it. FIP is not: it is computed from
 * the split's own home runs, walks, hit batsmen, strikeouts and outs by the same
 * `leagueRates.ts::fipLike` the pitcher card and the research board use, so it
 * is a real ERA-scale reading of a platoon half — null under three innings,
 * where it dashes rather than reporting one afternoon as a season.
 *
 * The `full` figures are the same 90th-percentile measurement as the batter's,
 * taken over its own population — every 2026 pitcher who faced 100 batters of
 * each hand, 202 of them: OPS **.255 → .260**, AVG .080, FIP 2.38 → 2.40, WHIP
 * 0.61 → 0.60, K% 8.81 → 9, BB% 6.69 → 6.5, HR% 3.10 → 3. They are close to the
 * batter's and deliberately not shared with them: a platoon gap is measured
 * against the population it was drawn from, and a pitcher's OPS-against spreads
 * a little tighter than a hitter's OPS.
 */
const PITCHER_STATS: SplitStat<PitcherSeasonStats>[] = [
  {
    key: 'ops',
    label: 'OPS',
    title: 'On-base plus slugging against',
    value: (s) => num(s.opsAgainst),
    format: rate3,
    gapText: rate3,
    full: 0.26,
    lowerBetter: true,
  },
  {
    key: 'avg',
    label: 'AVG',
    title: 'Batting average against',
    value: (s) => num(s.avgAgainst),
    format: rate3,
    gapText: rate3,
    full: 0.08,
    lowerBetter: true,
  },
  {
    key: 'fip',
    label: 'FIP',
    title:
      'Fielding-independent pitching — ERA scale, from home runs, walks, hit batsmen and strikeouts alone. MLB publishes no ERA for a platoon half',
    value: (s) => num(s.fip),
    format: dec2,
    gapText: dec2,
    full: 2.4,
    lowerBetter: true,
  },
  {
    key: 'whip',
    label: 'WHIP',
    title: 'Walks and hits per inning pitched',
    value: (s) => num(s.whip),
    format: dec2,
    gapText: dec2,
    full: 0.6,
    lowerBetter: true,
  },
  {
    key: 'kRate',
    label: 'K%',
    title: 'Strikeouts per batter faced',
    value: (s) => share(s.strikeOuts, s.battersFaced),
    format: pct1,
    gapText: pts1,
    full: 9,
  },
  {
    key: 'bbRate',
    label: 'BB%',
    title: 'Walks per batter faced',
    value: (s) => share(s.baseOnBalls, s.battersFaced),
    format: pct1,
    gapText: pts1,
    full: 6.5,
    lowerBetter: true,
  },
  {
    key: 'hrRate',
    label: 'HR%',
    title: 'Home runs per batter faced',
    value: (s) => share(s.homeRuns, s.battersFaced),
    format: pct1,
    gapText: pts1,
    full: 3,
    lowerBetter: true,
  },
];

/**
 * **The two sample-size gates**, and they are two rather than one because the
 * two failures are different. A side with a handful of trips has no split worth
 * *drawing* — a .400 average over 15 PA is one good week — so under
 * `MIN_SAMPLE` no bar is drawn at all and the tab is two columns of figures with
 * a line saying why. Between there and `THIN_SAMPLE` the comparison is worth
 * showing and not worth leaning on, so the fill is **hatched** rather than solid:
 * this card's version of the dotted percentile bubble one tab over, where a
 * dotted mark has meant "our estimate, not a measurement" since it was written.
 *
 * 100 plate appearances is about a third of a full-time hitter's short side and
 * roughly where a rate stops moving fifty points on one good series; 100 batters
 * faced is about 25 innings. Neither is a stabilisation point — none of these
 * stabilises at 100 — and neither is claimed as one. The point is that the
 * reader is told which side is thin, and how thin, in the same glance as the
 * bar: the sizes are in the column heads whatever they are, the fill changes
 * texture, and a line under the table says it in words.
 */
const MIN_SAMPLE = 25;
const THIN_SAMPLE = 100;

/** One row: the label, the two figures, and the bar between them. */
function SplitRow<T>({
  stat,
  left,
  right,
  leftLabel,
  rightLabel,
  bars,
  thin,
}: {
  stat: SplitStat<T>;
  left: T | null;
  right: T | null;
  leftLabel: string;
  rightLabel: string;
  /** False when a side is too thin to draw a comparison from at all. */
  bars: boolean;
  /** True when the comparison is drawn but shouldn't be leaned on. */
  thin: boolean;
}) {
  const l = left ? stat.value(left) : null;
  const r = right ? stat.value(right) : null;
  const both = l !== null && r !== null;
  // Which side is *better*, which is the only question the direction answers.
  // `lowerBetter` flips this test and nothing else — not the scale, not the
  // colour — so "the bar points left" means the same thing on a FIP row as on an
  // OPS row.
  const leftStronger = both ? (stat.lowerBetter ? l < r : l > r) : false;
  const gap = both ? Math.abs(l - r) : 0;
  const frac = Math.min(1, gap / stat.full);
  const over = gap > stat.full;
  const width = `${frac * 50}%`;
  const strong = both && gap > 0;

  const title = both
    ? `${stat.title} — ${stat.format(l)} ${leftLabel}, ${stat.format(r)} ${rightLabel}` +
      (gap === 0
        ? ': dead even.'
        : `: ${stat.gapText(gap)} better ${leftStronger ? leftLabel : rightLabel}` +
          (stat.lowerBetter ? ' (lower is better).' : '.')) +
      (bars ? (thin ? ' Sample too thin to lean on.' : '') : ' Sample too thin to draw a bar.')
    : // Two different absences, and the row says which. A side with no split
      // object at all is a man who has not faced that hand; a side that has one
      // and no figure is a stat MLB (or `fipLike`'s three-inning floor) declines
      // to publish for it.
      !left || !right
      ? `${stat.title} — nothing ${left ? rightLabel : leftLabel} this season.`
      : `${stat.title} — not published for one of these halves.`;

  return (
    <div className="spl-row" title={title}>
      <span className="spl-label">{stat.label}</span>
      <span
        className={`spl-val${strong ? (leftStronger ? ' spl-val--strong' : ' spl-val--weak') : ''}`}
      >
        {l === null ? '–' : stat.format(l)}
      </span>
      <span className="spl-track">
        {both && bars && (
          <span
            className={
              `spl-fill spl-fill--${leftStronger ? 'l' : 'r'}` +
              (thin ? ' spl-fill--thin' : '') +
              (over ? ' spl-fill--over' : '')
            }
            style={leftStronger ? { right: '50%', width } : { left: '50%', width }}
          />
        )}
      </span>
      <span
        className={`spl-val${strong ? (leftStronger ? ' spl-val--weak' : ' spl-val--strong') : ''}`}
      >
        {r === null ? '–' : stat.format(r)}
      </span>
    </div>
  );
}

/** The card: a head naming the two sides with their sample sizes, the rows, and
 *  whatever those samples oblige it to say underneath them. */
function SplitCard<T>({
  left,
  right,
  leftLabel,
  rightLabel,
  leftSample,
  rightSample,
  sampleUnit,
  sampleNoun,
  stats,
}: {
  left: T | null;
  right: T | null;
  leftLabel: string;
  rightLabel: string;
  leftSample: number;
  rightSample: number;
  /** "PA" / "BF" — what the sample is counted in. */
  sampleUnit: string;
  /** How that unit reads in a sentence. */
  sampleNoun: string;
  stats: SplitStat<T>[];
}) {
  const smaller = Math.min(leftSample, rightSample);
  const thinSide = leftSample <= rightSample ? leftLabel : rightLabel;
  const bars = smaller >= MIN_SAMPLE;
  const thin = bars && smaller < THIN_SAMPLE;
  const oneSided = smaller === 0;
  return (
    <div className="pct-card">
      <div className="pct-card-head">
        <span className="pct-card-title">Platoon splits</span>
      </div>
      {/* The one sentence that keeps the bars honest. Every row is drawn the
          same way round, the ones where the smaller number is the better one
          included, and a reader who hasn't been told that reads the FIP row
          backwards. */}
      <p className="spl-intro">
        Each bar runs from the centre toward the side he is <strong>stronger</strong> against — the
        further it runs, the bigger the split. A full bar is a gap bigger than nine players in ten
        have in that stat.
      </p>
      <div className="spl-table">
        <div className="spl-heads">
          <span className="spl-label" />
          <span className="spl-head-side">
            {leftLabel}
            <small>
              {leftSample} {sampleUnit}
            </small>
          </span>
          <span />
          <span className="spl-head-side">
            {rightLabel}
            <small>
              {rightSample} {sampleUnit}
            </small>
          </span>
        </div>
        {stats.map((s) => (
          <SplitRow
            key={s.key}
            stat={s}
            left={left}
            right={right}
            leftLabel={leftLabel}
            rightLabel={rightLabel}
            bars={bars}
            thin={thin}
          />
        ))}
      </div>
      {/* The sample is on the card whatever it is — in the heads — and gets a
          sentence of its own the moment it is small enough to change how the
          bars should be read. */}
      {oneSided ? (
        <p className="spl-note spl-note--warn">
          No {sampleNoun} {leftSample === 0 ? leftLabel : rightLabel} this season, so there is
          nothing to compare against.
        </p>
      ) : !bars ? (
        <p className="spl-note spl-note--warn">
          Only {smaller} {sampleUnit} {thinSide} — a handful of {sampleNoun} is not a platoon split,
          so the figures are here and the bars are not.
        </p>
      ) : thin ? (
        <p className="spl-note spl-note--warn">
          Only {smaller} {sampleUnit} {thinSide}, which one good week moves a long way — the bars
          are hatched rather than solid to say so.
        </p>
      ) : null}
    </div>
  );
}

/** Nothing on either side — a call-up with no season yet. Named rather than
 *  blank, the way every emptied view in the app is. */
function NoSplits({ what }: { what: string }) {
  return <div className="details-status">No {what} against either hand this season.</div>;
}

/** The batter's tab: vs LHP against vs RHP, measured in plate appearances. */
export function BatterSplitsTab({
  vsLeft,
  vsRight,
}: {
  vsLeft: SeasonStats | null;
  vsRight: SeasonStats | null;
}) {
  const lp = vsLeft?.pa ?? 0;
  const rp = vsRight?.pa ?? 0;
  if (lp === 0 && rp === 0) return <NoSplits what="plate appearances" />;
  return (
    <SplitCard
      left={vsLeft}
      right={vsRight}
      leftLabel="vs LHP"
      rightLabel="vs RHP"
      leftSample={lp}
      rightSample={rp}
      sampleUnit="PA"
      sampleNoun="plate appearances"
      stats={BATTER_STATS}
    />
  );
}

/** The pitcher's: vs LHB against vs RHB, measured in batters faced. */
export function PitcherSplitsTab({
  vsLeft,
  vsRight,
}: {
  vsLeft: PitcherSeasonStats | null;
  vsRight: PitcherSeasonStats | null;
}) {
  const lb = vsLeft?.battersFaced ?? 0;
  const rb = vsRight?.battersFaced ?? 0;
  if (lb === 0 && rb === 0) return <NoSplits what="batters faced" />;
  return (
    <SplitCard
      left={vsLeft}
      right={vsRight}
      leftLabel="vs LHB"
      rightLabel="vs RHB"
      leftSample={lb}
      rightSample={rb}
      sampleUnit="BF"
      sampleNoun="batters faced"
      stats={PITCHER_STATS}
    />
  );
}
