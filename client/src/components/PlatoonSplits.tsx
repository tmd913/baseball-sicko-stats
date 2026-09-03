import { InfoKey } from './InfoKey';
import type { PitcherSeasonStats, SeasonStats } from '../types';
import { EmptyState } from './EmptyState';

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
 * The track's **center is zero and means no split at all**. The fill grows from
 * it toward the side he is *better* against, and its length is the size of that
 * edge measured against `full` — **the 90th percentile of that stat's real
 * platoon gaps**, measured rather than guessed (see the two tables below). So a
 * full bar means one thing on every row — *one of the biggest splits in the
 * league in this stat* — and two rows of different stats are readable against
 * each other, which is the whole reason the rail is not scaled to each player's
 * own numbers.
 *
 * **The key says that in those words rather than in the percentile's.** It used
 * to read *"a gap bigger than nine players in ten have in that stat"*, which is
 * the same fact stated as the statistic it is drawn from and lands as a riddle:
 * a reader wants to know whether a long bar is a big split, not what quantile
 * the rail's end sits at. Nothing about `full` moved — the two tables below are
 * the same measured numbers — only the sentence explaining them.
 *
 * ### The fill can never exceed its half of the rail
 *
 * That is the invariant, and it is held in two places because a gap has no upper
 * bound at all: a .750 OPS against righties and a 1.900 against lefties over a
 * dozen trips is a 1.15 gap against a `full` of .300, and the league has rows
 * running to **five times** the scale. `railFraction` is what makes the length
 * total — it answers in [0,1] for *every* input, the absurd ratios and the
 * NaN/Infinity/negative/zero-denominator ones alike — and the stylesheet's
 * `max-width` on `.spl-fill` says the same thing again in the one place a bad
 * length could still arrive from.
 *
 * **The rail is a pill, so a full bar is measured against the rail's ink rather
 * than its box**, which is where this went wrong: the fill was inset 3px top and
 * bottom and nothing at all at the ends, so a bar drawn to the rail's *box* had
 * its outer corners outside the rail's own rounded cap — 2.47px of ink beyond
 * it on Willson Contreras's clamped K% row, where every unclamped row on the
 * card sat 2.25px inside. The fill is inset for that reason — **`--spl-inset`
 * (3px), one number for the two long sides and the outer end** — which makes a
 * radius-5 cap concentric inside the rail's radius-8 one: both caps center on the
 * same point, so the track shows exactly 3px of itself all the way around that
 * end. The **inner** end takes none of it and never did: the horizontal inset is
 * spent by being subtracted from the *length*, while the inner edge is pinned to
 * the rail's center by the inline `left: 50%` / `right: 50%`.
 *
 * **The outer ends took a bigger inset than the sides for a while**
 * (`--spl-inset-x`, 5px) and no longer do, because the thing it was written for
 * is gone. That token existed for the **square** outer end a clamped bar used to
 * draw: a square corner sits at the fill's extreme height, 5px off the rail's
 * center line, where the cap's ink has already receded 1.76px, so at 3px it had
 * 1.24px of rail beside it against its own midline's 3px and read as a bar
 * running out of its rail with the corner cut off. **Every outer cap is round
 * now** — a clamped bar draws exactly like one at full scale (see `over` below)
 * — and a round cap is the case the 3px was chosen for in the first place, so
 * the exception is retired, the two tokens are one again, and every bar is 2px
 * longer than it was. The inset is the stylesheet's, so the geometry and the
 * length written here cannot drift apart.
 *
 * **The inner end is flat**, which is a later round and the opposite end of the
 * bar rather than a reversal of the one above. A bar anchored at a center has to
 * *look* anchored at it, and a round cap there pulled the ink up to 3px back from
 * the zero at the rows a reader takes the shape from — a lozenge sitting near the
 * middle of the rail instead of a quantity measured from it. It costs the clamp
 * mark nothing (that is the outer end's), it costs the length nothing (only
 * `border-radius` moved), and it needs no key, a flat edge on a zero being the
 * shape of the measurement rather than a claim about it. `.spl-fill--r` /
 * `.spl-fill--l` carry the two cap sets; see `docs/claude/client-player-page.md`,
 * *The inner end is flat*, for the measurements.
 *
 * **Direction carries the polarity, and nothing else does.** A row where less is
 * better (`lowerBetter` — a pitcher's FIP, a batter's K%) is not drawn with a
 * reversed scale or a differently-colored fill; it points at whichever side the
 * *smaller* number belongs to, which is the same sentence as every other row:
 * "he is stronger against this side". That is the whole reason the bar is
 * anchored at a center rather than at an end. A fill anchored left and scaled to
 * a share of L+R — the shape `RateBar` already draws — inverts its meaning on
 * exactly those rows, and flattens every other one: .900 against .700 is a 56/44
 * bar, which is not what a .200 OPS gap looks like.
 *
 * The two figures are printed either side of the track, the stronger one in the
 * text color and the weaker one muted, so the direction is stated twice and the
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

/**
 * One comparable stat, in whichever kind's line it lives on.
 *
 * **It carries no `full` any more, and that is what lets one row definition
 * serve four cards.** The scale a gap is drawn against is a property of the
 * *comparison*, not of the stat: a .100 OPS gap is an ordinary platoon split, a
 * large home-road one and a huge gap between a man and the league. Those three
 * distributions were each measured off the 2026 league (see the scale tables
 * below), so the row says what the number is and the card says what a full bar
 * of it means.
 */
interface SplitStat<T, K extends string = string> {
  key: K;
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
  lowerBetter?: boolean;
}

/** Which rows a batter's cards draw, and so which keys every batter scale has
 *  to fill. A union rather than `string` so a scale that forgets a row is a
 *  build error rather than a rail that silently never fills. */
type BatterKey = 'ops' | 'avg' | 'obp' | 'slg' | 'iso' | 'hrRate' | 'kRate' | 'bbRate';
type PitcherKey = 'ops' | 'avg' | 'fip' | 'whip' | 'kRate' | 'bbRate' | 'hrRate';

/** The gap that fills the rail end to end, per row — one table per comparison. */
type Scale<K extends string> = Record<K, number>;

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
 * **How much of its half of the rail a gap fills — in [0,1], for any input.**
 *
 * A platoon gap has no upper bound: the sweep behind `full` turns up drawn rows
 * at 3.2× the scale on the batting side (Josh Smith's 44.4% / 16.9% K% over 27
 * PA) and 5.7× on the pitching one (Joe Ross's 2.90 / 16.65 FIP over 27 BF), and
 * a side thin enough to be all noise is exactly where the huge ones live. So the
 * length has to be clamped, and the clamp has to be **total** rather than a bare
 * `Math.min(1, gap / full)`: that one is right for every ordinary number and
 * returns `NaN` the moment its argument is one — and `NaN` is not a length, so
 * the width would have been dropped as invalid and the bar would size itself.
 *
 * Nothing upstream can hand it one today — `num` rejects anything non-finite and
 * `share` refuses a zero denominator, so every gap reaching here is a finite
 * non-negative number — and that is the argument for guarding rather than
 * against it: this is the one function standing between a stat's arithmetic and
 * a length in pixels, and the next stat added to either table gets its
 * denominator checked here whether or not its author thought to.
 */
function railFraction(gap: number, full: number): number {
  if (!Number.isFinite(gap) || !Number.isFinite(full) || full <= 0) return 0;
  return Math.max(0, Math.min(1, gap / full));
}

/**
 * **The batter's rows.** The slash line and its headline first, because that is
 * the order a batting line is read in and OPS is the number a platoon split gets
 * argued about in; then power net of average, then the two three-true-outcome
 * rates, which is where a platoon split usually *comes from* — a right-handed
 * hitter's trouble with a right-handed slider shows up in K% long before it
 * shows up in OPS. K% is also the batter side's one `lowerBetter` row, which is
 * the case the center anchor exists for.
 *
 * **The scale each gap is drawn against is the card's, not the row's** — see
 * `SplitStat`, and the four `BATTER_*_FULL` tables below, each measured off its
 * own comparison's own distribution.
 */
const BATTER_STATS: SplitStat<SeasonStats, BatterKey>[] = [
  {
    key: 'ops',
    label: 'OPS',
    title: 'On-base plus slugging',
    value: (s) => num(s.ops),
    format: rate3,
    gapText: rate3,
  },
  {
    key: 'avg',
    label: 'AVG',
    title: 'Batting average',
    value: (s) => num(s.avg),
    format: rate3,
    gapText: rate3,
  },
  {
    key: 'obp',
    label: 'OBP',
    title: 'On-base percentage',
    value: (s) => num(s.obp),
    format: rate3,
    gapText: rate3,
  },
  {
    key: 'slg',
    label: 'SLG',
    title: 'Slugging percentage',
    value: (s) => num(s.slg),
    format: rate3,
    gapText: rate3,
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
  },
  {
    key: 'hrRate',
    label: 'HR%',
    title: 'Home runs per plate appearance',
    value: (s) => share(s.hr, s.pa),
    format: pct1,
    gapText: pts1,
  },
  {
    key: 'kRate',
    label: 'K%',
    title: 'Strikeouts per plate appearance',
    value: (s) => share(s.strikeOuts, s.pa),
    format: pct1,
    gapText: pts1,
    lowerBetter: true,
  },
  {
    key: 'bbRate',
    label: 'BB%',
    title: 'Walks per plate appearance',
    value: (s) => share(s.baseOnBalls, s.pa),
    format: pct1,
    gapText: pts1,
  },
];

/**
 * **The pitcher's rows** — the same shape from the other side of the plate, and
 * five of the seven are `lowerBetter`. On his card almost every bar points at
 * the *smaller* number and still means "he handles this side better", which is
 * the whole argument for a center-anchored rail rather than a left-anchored one.
 *
 * ERA is absent because MLB does not split it. FIP is not: it is computed from
 * the split's own home runs, walks, hit batsmen, strikeouts and outs by the same
 * `leagueRates.ts::fipLike` the pitcher card and the research board use, so it
 * is a real ERA-scale reading of a platoon half — null under three innings,
 * where it dashes rather than reporting one afternoon as a season.
 *
 * The scales live below, one table per comparison, and are deliberately not
 * shared with the batter's: a gap is measured against the population it was
 * drawn from, and a pitcher's OPS-against spreads a little tighter than a
 * hitter's OPS.
 */
const PITCHER_STATS: SplitStat<PitcherSeasonStats, PitcherKey>[] = [
  {
    key: 'ops',
    label: 'OPS',
    title: 'On-base plus slugging against',
    value: (s) => num(s.opsAgainst),
    format: rate3,
    gapText: rate3,
    lowerBetter: true,
  },
  {
    key: 'avg',
    label: 'AVG',
    title: 'Batting average against',
    value: (s) => num(s.avgAgainst),
    format: rate3,
    gapText: rate3,
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
    lowerBetter: true,
  },
  {
    key: 'whip',
    label: 'WHIP',
    title: 'Walks and hits per inning pitched',
    value: (s) => num(s.whip),
    format: dec2,
    gapText: dec2,
    lowerBetter: true,
  },
  {
    key: 'kRate',
    label: 'K%',
    title: 'Strikeouts per batter faced',
    value: (s) => share(s.strikeOuts, s.battersFaced),
    format: pct1,
    gapText: pts1,
  },
  {
    key: 'bbRate',
    label: 'BB%',
    title: 'Walks per batter faced',
    value: (s) => share(s.baseOnBalls, s.battersFaced),
    format: pct1,
    gapText: pts1,
    lowerBetter: true,
  },
  {
    key: 'hrRate',
    label: 'HR%',
    title: 'Home runs per batter faced',
    value: (s) => share(s.homeRuns, s.battersFaced),
    format: pct1,
    gapText: pts1,
    lowerBetter: true,
  },
];

/**
 * **The four scales, and every one of them was measured rather than chosen.**
 *
 * `full` — the gap that fills the rail end to end — is the **90th percentile**
 * of that comparison's own gap distribution across the 2026 league, rounded. So
 * a bar that reaches the end of the rail means one thing on every row of every
 * card: *one of the biggest gaps in the league for that stat*, in that
 * comparison. And two rows of different stats are readable against each other,
 * which is the whole reason the rail is not scaled to each player's own
 * numbers.
 *
 * **Each population is the men for whom the comparison is a comparison** — 100
 * PA (or 100 BF) on *each* side, which is the bar the platoon table was
 * measured against and the same one applied to the parks and the halves. The
 * league card is the exception and says why below.
 *
 * The medians are given beside the p90s because they are what an *ordinary* row
 * looks like: an ordinary gap fills about a third of the rail, so the rail's end
 * is a real place rather than a decoration. A gap past `full` clamps — about one
 * player in ten on any given row, by construction — and says so in that row's
 * own tooltip and nowhere else; see `over` in `SplitRow`.
 *
 * **Platoon** — 2026 batters with ≥100 PA against each hand, **167** of them:
 * OPS .283 → **.300**, AVG .087 → .090, OBP .091 → .090, SLG .204 → .200, ISO
 * .140, HR% 3.34 → 3.5, K% 8.51 → 8.5, BB% 6.61 → 6.5. Medians .101 of OPS and
 * 3.3 points of K%.
 */
const BATTER_PLATOON_FULL: Scale<BatterKey> = {
  ops: 0.3,
  avg: 0.09,
  obp: 0.09,
  slg: 0.2,
  iso: 0.14,
  hrRate: 3.5,
  kRate: 8.5,
  bbRate: 6.5,
};

/**
 * **Home and away** — 2026 batters with ≥100 PA at home *and* ≥100 away,
 * **313** of them (a much larger population than the platoon one, every
 * regular having both): OPS .2414 → **.240**, AVG .0748 → .075, OBP .0790 →
 * .080, SLG .1718 → .170, ISO .1186 → .120, HR% 3.127 → 3.0, K% 8.206 → 8.0,
 * BB% 5.135 → 5.0. Medians .103 of OPS and 3.2 points of K%.
 *
 * **It is a hair tighter than the platoon scale and that is a real finding
 * rather than rounding**: the ordinary home-road gap is the same size as the
 * ordinary platoon gap (.103 against .101 of OPS) but the *tail* is shorter —
 * park effects are bounded where a genuine platoon weakness is not. A shared
 * scale would have drawn every extreme home-road split a little short.
 */
const BATTER_PARK_FULL: Scale<BatterKey> = {
  ops: 0.24,
  avg: 0.075,
  obp: 0.08,
  slg: 0.17,
  iso: 0.12,
  hrRate: 3,
  kRate: 8,
  bbRate: 5,
};

/**
 * **The two halves** — 2026 batters with ≥100 PA in each half, **213** of them:
 * OPS .2308 → **.230**, AVG .0808 → .080, OBP .0858 → .085, SLG .1588 → .160,
 * ISO .1126 → .110, HR% 2.834 → 2.8, K% 7.869 → 8.0, BB% 5.189 → 5.0. Medians
 * .083 of OPS and 2.6 points of K% — the *smallest* ordinary gap of the four
 * comparisons, which is what you would expect of one man against himself with
 * nothing but time between the two lines.
 */
const BATTER_HALF_FULL: Scale<BatterKey> = {
  ops: 0.23,
  avg: 0.08,
  obp: 0.085,
  slg: 0.16,
  iso: 0.11,
  hrRate: 2.8,
  kRate: 8,
  bbRate: 5,
};

/**
 * **Against the league** — the one comparison whose population is not a pair of
 * halves, so its bar is **≥200 PA on the season**, which is the same amount of
 * evidence the other three ask for (100 a side) asked of one line. **327**
 * batters: OPS .1364 → **.135**, AVG .0444 → .045, OBP .0524 → .050, SLG .1020
 * → .100, ISO .0840 → .085, HR% 2.172 → 2.2, K% 10.293 → 10, BB% 4.951 → 5.0.
 *
 * **It is much the tightest scale of the four, and that is the point of the
 * card.** The ordinary gap between a regular and the league is .055 of OPS
 * against .103 between his own two halves — a man differs from himself, half to
 * half, twice as much as he differs from the average major-leaguer. Drawn on
 * the platoon scale, every league bar would be a stub and the card would say
 * that nobody is far from average, which is false and is exactly what a scale
 * borrowed from another distribution buys.
 *
 * **K% is the row that breaks the pattern** and is worth naming: its league gap
 * (p90 10.3 points) is *wider* than its platoon, park or half gap. Strikeout
 * rate is the most spread-out thing a hitter has — the league runs from about
 * 10% to 35% — so the distance from the average is genuinely larger than the
 * distance between any two cuts of one man.
 */
const BATTER_LEAGUE_FULL: Scale<BatterKey> = {
  ops: 0.135,
  avg: 0.045,
  obp: 0.05,
  slg: 0.1,
  iso: 0.085,
  hrRate: 2.2,
  kRate: 10,
  bbRate: 5,
};

/**
 * **Platoon, the pitcher's** — 2026 pitchers who faced ≥100 batters of each
 * hand, **202** of them: OPS .255 → **.260**, AVG .080, FIP 2.38 → 2.40, WHIP
 * 0.61 → 0.60, K% 8.81 → 9, BB% 6.69 → 6.5, HR% 3.10 → 3.
 */
const PITCHER_PLATOON_FULL: Scale<PitcherKey> = {
  ops: 0.26,
  avg: 0.08,
  fip: 2.4,
  whip: 0.6,
  kRate: 9,
  bbRate: 6.5,
  hrRate: 3,
};

/**
 * **Home and away, the pitcher's** — ≥100 BF at home and away, **269** of them:
 * OPS .2494 → **.250**, AVG .0900 → .090, FIP 2.116 → 2.10, WHIP .5060 → .50,
 * K% 8.423 → 8.5, BB% 4.958 → 5.0, HR% 3.035 → 3.0. Medians .108 of OPS and
 * 0.80 of FIP.
 */
const PITCHER_PARK_FULL: Scale<PitcherKey> = {
  ops: 0.25,
  avg: 0.09,
  fip: 2.1,
  whip: 0.5,
  kRate: 8.5,
  bbRate: 5,
  hrRate: 3,
};

/**
 * **The two halves, the pitcher's** — ≥100 BF in each half, **134** of them:
 * OPS .2012 → **.200**, AVG .0750 → .075, FIP 2.057 → 2.05, WHIP .4540 → .45,
 * K% 8.198 → 8.0, BB% 4.215 → 4.2, HR% 2.560 → 2.6. The smallest population of
 * the seven, a pitcher needing a hundred batters faced on each side of July to
 * be in it, and the tightest pitching scale — the same "one man against
 * himself" reading the batter's halves give.
 */
const PITCHER_HALF_FULL: Scale<PitcherKey> = {
  ops: 0.2,
  avg: 0.075,
  fip: 2.05,
  whip: 0.45,
  kRate: 8,
  bbRate: 4.2,
  hrRate: 2.6,
};

/**
 * **Against the league, the pitcher's** — ≥200 BF on the season, **301** of
 * them: OPS .1493 → **.150**, AVG .0573 → .055, FIP 1.572 → 1.55, WHIP .3237 →
 * .32, K% 7.825 → 8.0, BB% 3.911 → 4.0, HR% 1.828 → 1.8. Half the platoon
 * scale on almost every row, for the reason the batter's league table gives.
 */
const PITCHER_LEAGUE_FULL: Scale<PitcherKey> = {
  ops: 0.15,
  avg: 0.055,
  fip: 1.55,
  whip: 0.32,
  kRate: 8,
  bbRate: 4,
  hrRate: 1.8,
};

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

/**
 * **The key to how a bar is drawn, behind an ⓘ on the card's title row.**
 *
 * It was a paragraph in the card body — over the bars first, then under them —
 * and both placements were paying the same rent: at 390 the sentence wraps to
 * **four lines, 70px**, spent on a tab whose whole content is eight bars, to say
 * something a reader needs **once** and then never again. A key is the definition
 * of a thing you can already see; the second time you open this tab it is 70px of
 * something you have read.
 *
 * ### Why a popover rather than a `title`, a modal, or an inline reveal
 *
 * **A bare `title` is invisible on a phone**, and roughly half of this app's
 * traffic has no hover to give — the rule the research board's `WatchStar`
 * already follows by drawing on every row rather than on hover. So the tooltip
 * is not the whole answer; it rides along on the button for a pointer, and the
 * press is what everybody else gets.
 *
 * **A `Modal` is the wrong size**, and the app has already recorded why. The
 * Columns dialog left the research board's control row for one stated reason —
 * *volume*: it holds an order row and 48 checkboxes, several hundred pixels, and
 * a strip of chrome could not carry it. Two sentences is the other end of that
 * scale, and dimming the page, pinning the body and portalling a box out to a
 * dialog layer to deliver them would be ceremony the content cannot pay for.
 *
 * **An inline reveal in the card body** is what this used to be with a switch on
 * it, and it fails on distance: the control is at the top of the card and the key
 * would appear at the foot of it, a press whose effect is 300px away and, on a
 * phone, below the fold. A disclosure has to reveal something beside itself.
 *
 * So: the app's **popover**, the shape the header's settings gear and fantasy
 * button already open — and literally that shape, `.settings-popover` on the
 * panel, rather than a second box that resembles it. `useDismissable` is the same
 * hook those two use, so it dismisses on an outside press and on Escape
 * identically. The button is a real `<button>` with a real accessible name, so it
 * is reachable and pressable from a keyboard, and it takes `.app-dialog-close`'s
 * size and shape — the app's 30px icon button — so a touch target exists rather
 * than a bare glyph nobody can tell is pressable.
 *
 * **It sits immediately after the title**, where it once hung off the card's
 * right edge, 228px from the words it belongs to at 1200px wide. The title still
 * centers exactly where the percentile card's does — the button is in flow and
 * gives its own width back in a negative margin — and the panel opens from the
 * *card's* right edge rather than the button's, which is the only anchor that
 * stays on screen at 390 now the button is near the middle. `.spl-card-head` owns
 * both of those rules; see `docs/claude/client-player-page.md`, *The ⓘ sits
 * beside the title*.
 *
 * **The sample-size caveat deliberately stays in the body**, and the two are not
 * the same kind of thing. This is a *key*: instructions for reading any chart on
 * this tab, true of every player, read once. That one is a *caveat about this
 * player's numbers* — it fires only when a side is thin, it is amber precisely to
 * be caught sight of, and it changes how the bars **on screen** should be read.
 * Hiding a conditional warning behind an icon that gives no hint it is holding
 * one is how a warning goes unread; and a reader who has not pressed the ⓘ has no
 * way to learn there was anything to press it for. So the general note is behind
 * the button and the particular one is on the card, which is also the order they
 * were already in when both were captions.
 */
function SplitsKey() {
  return (
    <InfoKey className="spl-key" label="How to read these bars">
      {/* **It says "column" rather than "the side he is stronger against"**,
          which is what it read while this card only ever drew the two hands. It
          draws four comparisons now — the hands, the parks, the two halves and
          the league — and *against* is wrong on three of them: a hitter is not
          stronger "against" home. The sentence lost one preposition and gained
          nothing else. */}
      <p>
        Each bar runs from the center toward the <strong>stronger</strong> of the two columns — the
        further it runs, the bigger the gap.
      </p>
      <p>
        A full bar is one of the biggest gaps in the league for that stat. Each stat, and each
        comparison, has its own scale — so a long OPS bar and a long K% bar mean the same thing.
      </p>
    </InfoKey>
  );
}

/** One row: the label, the two figures, and the bar between them. */
function SplitRow<T, K extends string>({
  stat,
  full,
  left,
  right,
  leftLabel,
  rightLabel,
  bars,
  thin,
}: {
  stat: SplitStat<T, K>;
  /** The gap that fills the rail, for this row *in this comparison* — see
   *  `SplitStat`, which no longer carries one. */
  full: number;
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
  // color — so "the bar points left" means the same thing on a FIP row as on an
  // OPS row.
  const leftStronger = both ? (stat.lowerBetter ? l < r : l > r) : false;
  const gap = both ? Math.abs(l - r) : 0;
  const frac = railFraction(gap, full);
  // Clamped, and so said in the row's own tooltip — and nowhere else. Read off
  // `frac` rather than off `gap > stat.full` again, so the sentence and the
  // length can never disagree about whether the bar ran out of rail, and so an
  // input `railFraction` refused cannot flag a bar of no length.
  //
  // **It is not drawn.** A clamped bar used to square its outer end off, and
  // then to carry a chevron knocked out just inside the tip; both were the same
  // claim — *this bar is not the real number* — and both were complained about.
  // The reason the mark loses is the two figures printed either side of the
  // rail: the precision the picture gives up is spelled out ten pixels away, so
  // the mark was decorating a loss the reader could already read off the row.
  // And what a full bar *says* is true of a clamped one too — one of the
  // biggest splits in the league for that stat — so the two reading alike is
  // not a lie the reader has to be warned about. See
  // `docs/claude/client-player-page.md`, *The clamp is a sentence, not a mark*.
  const over = frac === 1 && gap > full;
  // The rail's half, less the inset the fill is nested by: a full bar then lands
  // inside the rail's cap rather than on its box, which is a different place.
  // One token for the two long sides and the outer end, which is only correct
  // because that cap is round — a radius-5 cap 3px inside a radius-8 one is
  // concentric with it. The inner end takes none of it: it is pinned to the
  // rail's center by the `left`/`right` below and meets it flat.
  const width = `calc(${frac} * (50% - var(--spl-inset)))`;
  const strong = both && gap > 0;

  const title = both
    ? `${stat.title} — ${stat.format(l)} ${leftLabel}, ${stat.format(r)} ${rightLabel}` +
      (gap === 0
        ? ': dead even.'
        : `: ${stat.gapText(gap)} better ${leftStronger ? leftLabel : rightLabel}` +
          (stat.lowerBetter ? ' (lower is better).' : '.')) +
      // A clamped row says so here and nowhere else — see `over` above. Plainer
      // than the rail it used to name: the reader has the two figures beside
      // the bar, so what they need is that the picture stopped, not what it
      // stopped against.
      (bars && over ? ' Bigger than the bar can show, so it stops at the end.' : '') +
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
              `spl-fill spl-fill--${leftStronger ? 'l' : 'r'}` + (thin ? ' spl-fill--thin' : '')
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

/**
 * One of the two column heads: the side and its sample size. When a caller has
 * named a half (`marked`) the head takes the accent color, and `title` — the
 * whole sentence, e.g. "Andrew Alvarez throws left-handed, so this is the half
 * that applies to this game." — carries the reason on hover or tap. That used
 * to be restated as a two-word line under the sample (`this game`), which said
 * nothing the color and the tooltip didn't already say and cost the head a
 * reserved line on both sides to hold it; it's gone, and the mark is the
 * color alone.
 */
function SplitHead({
  label,
  sample,
  unit,
  sampleText,
  marked,
  title,
}: {
  label: string;
  sample: number;
  unit: string;
  /** **What to print under the label instead of the count**, where the count is
   *  not a thing a reader acts on. One caller: the league column of `Player vs
   *  League`, which reads `AVG`. See `SplitCard`'s `rightSampleText`. */
  sampleText?: string;
  marked: boolean;
  title?: string;
}) {
  return (
    <span className={`spl-head-side${marked ? ' spl-head-side--on' : ''}`} title={title}>
      {label}
      <small>
        {/* **Grouped**, for the samples that are printed: every sample on a
            split of one man is three figures at most, so `1,247 PA` on a
            five-year-old's card is the same string it always was. */}
        {sampleText ?? `${sample.toLocaleString()} ${unit}`}
      </small>
    </span>
  );
}

/**
 * The card: a head naming the two sides with their sample sizes, the rows, and
 * whatever those samples oblige it to say underneath them.
 *
 * **One card, four comparisons.** It was the platoon card and is now the shape
 * every comparison on the Splits tab takes — the two hands, the two parks, the
 * two halves of the season, and his season against the league's. What differs
 * between them is four strings and a scale, so they are props: the title, the
 * two column labels, the two *phrases* those labels read as inside a sentence,
 * the noun a thin sample is not enough of, and the `full` table the bars are
 * drawn against. Nothing about the rail, the clamp, the two sample gates or the
 * geometry differs at all, which is the whole reason to have made it one card
 * rather than four that resemble each other.
 */
function SplitCard<T, K extends string>({
  title,
  left,
  right,
  leftLabel,
  rightLabel,
  leftPhrase,
  rightPhrase,
  leftSample,
  rightSample,
  rightSampleText,
  sampleUnit,
  sampleNoun,
  comparisonNoun,
  stats,
  full,
  highlight = null,
  highlightTitle,
}: {
  /** What this card compares, in the card's own head. */
  title: string;
  left: T | null;
  right: T | null;
  leftLabel: string;
  rightLabel: string;
  /** The same side inside a sentence — *`.163` better **at home***, *no plate
   *  appearances **in the second half***. A pill is a label and wants to be
   *  short; a sentence wants the preposition, which is the split `cutOf` makes
   *  in `lib.ts` for the same words. Defaults to the label, which is right for
   *  the platoon pair (`vs LHP` reads correctly in both). */
  leftPhrase?: string;
  rightPhrase?: string;
  leftSample: number;
  rightSample: number;
  /**
   * **What the right-hand head prints in place of its sample**, for the one
   * column whose sample is not a fact about a player.
   *
   * `Player vs League`'s right column is everybody, and its count is **156,399
   * plate appearances** — a figure no reader acts on, three times the width of
   * every other head on the tab, and one that reads as a *sample* when what it
   * is is the whole league. So the head says `AVG`: that column is an average
   * and saying so is the useful half.
   *
   * **The number is still what the card is drawn against**, which is why this is
   * a label and not a smaller `rightSample`: the two sample gates take
   * `Math.min(left, right)`, so a league column of 156,399 is what makes the
   * thin-sample rules on this card answer for *his* line alone, which is the
   * only side of it that can be thin.
   */
  rightSampleText?: string;
  /** "PA" / "BF" — what the sample is counted in. */
  sampleUnit: string;
  /** How that unit reads in a sentence. */
  sampleNoun: string;
  /** What a thin side is not enough of — *a handful of plate appearances is not
   *  a **platoon split***. */
  comparisonNoun: string;
  stats: SplitStat<T, K>[];
  /** The 90th-percentile gap table for *this* comparison. See the scales above:
   *  a .100 OPS gap is an ordinary platoon split and a large one against the
   *  league, so the scale is the card's rather than the row's. */
  full: Scale<K>;
  /** Which half the reader came here about, when a caller has one in mind — the
   *  feed's Upcoming row opens this card because a particular starter is
   *  announced, and the whole comparison is what makes his half mean anything
   *  (`.750 vs LHP` is nothing until you know the other side reads `.587`). So
   *  the card is unchanged and the head *says which column is his*: absent
   *  everywhere else, which is why the accent color is drawn only when a
   *  caller asks for one. */
  highlight?: 'left' | 'right' | null;
  /** The whole sentence, for the head's tooltip, where there is room to name the
   *  pitcher the mark is about — the tooltip and the accent color are the
   *  whole of the mark now; see `SplitHead`. */
  highlightTitle?: string;
}) {
  const lPhrase = leftPhrase ?? leftLabel;
  const rPhrase = rightPhrase ?? rightLabel;
  const smaller = Math.min(leftSample, rightSample);
  const thinSide = leftSample <= rightSample ? lPhrase : rPhrase;
  const bars = smaller >= MIN_SAMPLE;
  const thin = bars && smaller < THIN_SAMPLE;
  const oneSided = smaller === 0;
  return (
    <div className="pct-card">
      {/* `.spl-card-head` adds the flex row and the containing block the key's
          popover anchors to. The ⓘ is laid out **immediately after the title**,
          where a key belongs — it sat at the far right of the card for a while,
          240px from the words it explains — and gives its own width back in a
          negative margin, so the title still centers exactly where the
          percentile card's does. `.pct-card-head` is untouched for that card. */}
      <div className="pct-card-head spl-card-head">
        <span className="pct-card-title">{title}</span>
        <SplitsKey />
      </div>
      <div className="spl-table">
        <div className="spl-heads">
          <span className="spl-label" />
          <SplitHead
            label={leftLabel}
            sample={leftSample}
            unit={sampleUnit}
            marked={highlight === 'left'}
            title={highlight === 'left' ? highlightTitle : undefined}
          />
          <span />
          <SplitHead
            label={rightLabel}
            sample={rightSample}
            unit={sampleUnit}
            sampleText={rightSampleText}
            marked={highlight === 'right'}
            title={highlight === 'right' ? highlightTitle : undefined}
          />
        </div>
        {stats.map((s) => (
          <SplitRow
            key={s.key}
            stat={s}
            full={full[s.key]}
            left={left}
            right={right}
            leftLabel={lPhrase}
            rightLabel={rPhrase}
            bars={bars}
            thin={thin}
          />
        ))}
      </div>
      {/* The sample is on the card whatever it is — in the heads — and gets a
          sentence of its own the moment it is small enough to change how the
          bars should be read. **It is the one caption left in the body**, the key
          above it having moved behind the ⓘ on the title row (see `SplitsKey`,
          which argues why this one did not follow it): a key is instructions,
          true of every player and read once, where this is a caveat about *these*
          numbers that fires only when a side is thin — and a warning nobody can
          see they could have asked for is a warning nobody reads. */}
      {oneSided ? (
        <p className="spl-note spl-note--warn">
          No {sampleNoun} {leftSample === 0 ? lPhrase : rPhrase} this season, so there is nothing to
          compare against.
        </p>
      ) : !bars ? (
        <p className="spl-note spl-note--warn">
          Only {smaller} {sampleUnit} {thinSide} — a handful of {sampleNoun} is not a{' '}
          {comparisonNoun}, so the figures are here and the bars are not.
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
  return <EmptyState compact title={<>No {what} against either hand this season</>} />;
}

/**
 * The batter's card: vs LHP against vs RHP, measured in plate appearances.
 *
 * **It has two callers and they arrive with different questions**, which is what
 * `highlight` is for. The player page's Splits tab asks *is he a different
 * hitter against each hand*, and marks neither column. The feed's **Upcoming**
 * row asks *how does he do against the man announced for tonight* — one half —
 * and gets the same whole card with that half marked, because the comparison is
 * what makes the half readable: the old row printed six pills of his line
 * against one hand and left the reader with no way to tell a platoon edge from
 * an ordinary season. Marking rather than narrowing is also the only honest
 * shape here, the bar between the two halves *being* the drawing.
 */
export function BatterSplitsTab({
  vsLeft,
  vsRight,
  highlight,
  highlightTitle,
}: {
  vsLeft: SeasonStats | null;
  vsRight: SeasonStats | null;
  /** 'left' is vs LHP — see `SplitCard`. */
  highlight?: 'left' | 'right' | null;
  highlightTitle?: string;
}) {
  const lp = vsLeft?.pa ?? 0;
  const rp = vsRight?.pa ?? 0;
  if (lp === 0 && rp === 0) return <NoSplits what="plate appearances" />;
  return (
    <SplitCard
      title="Platoon"
      left={vsLeft}
      right={vsRight}
      leftLabel="vs LHP"
      rightLabel="vs RHP"
      leftSample={lp}
      rightSample={rp}
      sampleUnit="PA"
      sampleNoun="plate appearances"
      comparisonNoun="platoon split"
      stats={BATTER_STATS}
      full={BATTER_PLATOON_FULL}
      highlight={highlight}
      highlightTitle={highlightTitle}
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
      title="Platoon"
      left={vsLeft}
      right={vsRight}
      leftLabel="vs LHB"
      rightLabel="vs RHB"
      leftSample={lb}
      rightSample={rb}
      sampleUnit="BF"
      sampleNoun="batters faced"
      comparisonNoun="platoon split"
      stats={PITCHER_STATS}
      full={PITCHER_PLATOON_FULL}
    />
  );
}

/**
 * **The other three comparisons, in the order the tab asks them.**
 *
 * Home against away, his season against the league's, and the first half
 * against the second. Every one is the same card the platoon comparison is —
 * see `SplitCard`, which is where the argument for that lives — and every one
 * is drawn or not drawn on its own: the tab has four cards and a man missing a
 * second half still gets the other three.
 *
 * **The league card is the odd one and is deliberately shaped like the rest.**
 * Its right-hand column is not a cut of him at all, it is everybody, and what
 * makes that legible is the head — `League · 156,399 PA` beside `Season · 582
 * PA` says in one line both what it is and how much of it there is. (One word
 * each, measured: `His season` and `League avg` both wrapped inside a column
 * sized for `vs LHP`, and a card whose heads are two and three lines tall where
 * the other three cards' are one reads as a different kind of card — it cost
 * this one 25px of height and a ragged head row.) The
 * percentile card one tab over asks the same question as a **rank**; this asks
 * it as a **gap**, in the units the stat prints in. A reader wanting to know
 * whether .280 is good gets *where he stands among the men who play* there and
 * *how far above the average line he is* here, and the two are different
 * questions.
 *
 * **Nothing is drawn where nothing was read.** Every field on the payload is
 * independently nullable — the server fetches the platoon pair, the four cuts
 * and the league line in three separate reads, each failing on its own — so a
 * card whose two sides are both absent is absent, rather than a rail of dashes
 * claiming he never played at home.
 */
export function BatterComparisonCards({
  season,
  home,
  away,
  firstHalf,
  secondHalf,
  league,
}: {
  season: SeasonStats | null;
  home: SeasonStats | null;
  away: SeasonStats | null;
  firstHalf: SeasonStats | null;
  secondHalf: SeasonStats | null;
  league: SeasonStats | null;
}) {
  const pa = (s: SeasonStats | null) => s?.pa ?? 0;
  return (
    <>
      {(home || away) && (
        <SplitCard
          title="Home vs Away"
          left={home}
          right={away}
          leftLabel="Home"
          rightLabel="Away"
          leftPhrase="at home"
          rightPhrase="on the road"
          leftSample={pa(home)}
          rightSample={pa(away)}
          sampleUnit="PA"
          sampleNoun="plate appearances"
          comparisonNoun="home-road split"
          stats={BATTER_STATS}
          full={BATTER_PARK_FULL}
        />
      )}
      {season && league && (
        <SplitCard
          title="Player vs League"
          left={season}
          right={league}
          leftLabel="Season"
          rightLabel="League"
          leftPhrase="for him"
          rightPhrase="for the league"
          leftSample={pa(season)}
          rightSample={pa(league)}
          rightSampleText="AVG"
          sampleUnit="PA"
          sampleNoun="plate appearances"
          comparisonNoun="season worth comparing"
          stats={BATTER_STATS}
          full={BATTER_LEAGUE_FULL}
        />
      )}
      {(firstHalf || secondHalf) && (
        <SplitCard
          title="1st Half vs 2nd Half"
          left={firstHalf}
          right={secondHalf}
          leftLabel="First"
          rightLabel="Second"
          leftPhrase="in the first half"
          rightPhrase="in the second half"
          leftSample={pa(firstHalf)}
          rightSample={pa(secondHalf)}
          sampleUnit="PA"
          sampleNoun="plate appearances"
          comparisonNoun="half of a season"
          stats={BATTER_STATS}
          full={BATTER_HALF_FULL}
        />
      )}
    </>
  );
}

/** The pitcher's three, measured in batters faced. */
export function PitcherComparisonCards({
  season,
  home,
  away,
  firstHalf,
  secondHalf,
  league,
}: {
  season: PitcherSeasonStats | null;
  home: PitcherSeasonStats | null;
  away: PitcherSeasonStats | null;
  firstHalf: PitcherSeasonStats | null;
  secondHalf: PitcherSeasonStats | null;
  league: PitcherSeasonStats | null;
}) {
  const bf = (s: PitcherSeasonStats | null) => s?.battersFaced ?? 0;
  return (
    <>
      {(home || away) && (
        <SplitCard
          title="Home vs Away"
          left={home}
          right={away}
          leftLabel="Home"
          rightLabel="Away"
          leftPhrase="at home"
          rightPhrase="on the road"
          leftSample={bf(home)}
          rightSample={bf(away)}
          sampleUnit="BF"
          sampleNoun="batters faced"
          comparisonNoun="home-road split"
          stats={PITCHER_STATS}
          full={PITCHER_PARK_FULL}
        />
      )}
      {season && league && (
        <SplitCard
          title="Player vs League"
          left={season}
          right={league}
          leftLabel="Season"
          rightLabel="League"
          leftPhrase="for him"
          rightPhrase="for the league"
          leftSample={bf(season)}
          rightSample={bf(league)}
          rightSampleText="AVG"
          sampleUnit="BF"
          sampleNoun="batters faced"
          comparisonNoun="season worth comparing"
          stats={PITCHER_STATS}
          full={PITCHER_LEAGUE_FULL}
        />
      )}
      {(firstHalf || secondHalf) && (
        <SplitCard
          title="1st Half vs 2nd Half"
          left={firstHalf}
          right={secondHalf}
          leftLabel="First"
          rightLabel="Second"
          leftPhrase="in the first half"
          rightPhrase="in the second half"
          leftSample={bf(firstHalf)}
          rightSample={bf(secondHalf)}
          sampleUnit="BF"
          sampleNoun="batters faced"
          comparisonNoun="half of a season"
          stats={PITCHER_STATS}
          full={PITCHER_HALF_FULL}
        />
      )}
    </>
  );
}
