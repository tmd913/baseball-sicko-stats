import { InfoKey } from './InfoKey';
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
 * radius-5 cap concentric inside the rail's radius-8 one: both caps centre on the
 * same point, so the track shows exactly 3px of itself all the way around that
 * end. The **inner** end takes none of it and never did: the horizontal inset is
 * spent by being subtracted from the *length*, while the inner edge is pinned to
 * the rail's centre by the inline `left: 50%` / `right: 50%`.
 *
 * **The outer ends took a bigger inset than the sides for a while**
 * (`--spl-inset-x`, 5px) and no longer do, because the thing it was written for
 * is gone. That token existed for the **square** outer end a clamped bar used to
 * draw: a square corner sits at the fill's extreme height, 5px off the rail's
 * centre line, where the cap's ink has already receded 1.76px, so at 3px it had
 * 1.24px of rail beside it against its own midline's 3px and read as a bar
 * running out of its rail with the corner cut off. **Every outer cap is round
 * now** (see `over` below), and a round cap is the case the 3px was chosen for in
 * the first place — so the exception is retired, the two tokens are one again,
 * and every bar is 2px longer than it was. The inset is the stylesheet's, so the
 * geometry and the length written here cannot drift apart.
 *
 * **The inner end is flat**, which is a later round and the opposite end of the
 * bar rather than a reversal of the one above. A bar anchored at a centre has to
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
 * centres exactly where the percentile card's does — the button is in flow and
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
      <p>
        Each bar runs from the centre toward the side he is <strong>stronger</strong> against — the
        further it runs, the bigger the split.
      </p>
      <p>
        A full bar is a gap bigger than nine players in ten have in that stat. It carries a
        <span className="spl-key-chevron" aria-hidden="true" /> at its end when the real gap is
        bigger still than the rail can draw.
      </p>
    </InfoKey>
  );
}

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
  const frac = railFraction(gap, stat.full);
  // Clamped, and so marked. Read off `frac` rather than off `gap > stat.full`
  // again, so the mark and the length can never disagree about whether the bar
  // ran out of rail — and so an input `railFraction` refused cannot mark a bar
  // of no length. What the mark *is* changed: it used to be a squared-off outer
  // end, and is now a chevron knocked out of the fill just inside its tip. The
  // **outer** cap stays round on every bar, which is what lets the inset go back
  // to the sides' own — see the note at the top of this file. (The *inner* cap is
  // flat, and is no business of the clamp's: that end is the zero, not the tip.)
  const over = frac === 1 && gap > stat.full;
  // The rail's half, less the inset the fill is nested by: a full bar then lands
  // inside the rail's cap rather than on its box, which is a different place.
  // One token for the two long sides and the outer end, which is only correct
  // because that cap is round — a radius-5 cap 3px inside a radius-8 one is
  // concentric with it. The inner end takes none of it: it is pinned to the
  // rail's centre by the `left`/`right` below and meets it flat.
  const width = `calc(${frac} * (50% - var(--spl-inset)))`;
  const strong = both && gap > 0;

  const title = both
    ? `${stat.title} — ${stat.format(l)} ${leftLabel}, ${stat.format(r)} ${rightLabel}` +
      (gap === 0
        ? ': dead even.'
        : `: ${stat.gapText(gap)} better ${leftStronger ? leftLabel : rightLabel}` +
          (stat.lowerBetter ? ' (lower is better).' : '.')) +
      // A clamped row says so in words as well as with the chevron, which is a
      // mark a reader meets before they have read the key behind the ⓘ.
      (bars && over ? " Bigger than the rail's full scale, so the bar stops at the end." : '') +
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

/**
 * One of the two column heads: the side, its sample size, and — only when a
 * caller has named a half — a marker line saying which of the two the reader
 * came about.
 *
 * **The marker line is rendered on both sides whenever it is rendered at all**,
 * hidden on the unmarked one rather than blank. The heads are a grid row with
 * `align-items: center`, so a third line on one side alone would push its label
 * and sample off the baseline its twin sits on. A blank `\u00a0` reserves one
 * line and would be wrong the moment a caller's phrase wrapped to two in a 54px
 * column, which `this game` does at 46px inside a dialog on a phone — so the
 * reservation is *the same string*, laid out and made
 * `visibility: hidden`: the Columns hint's own ghost, which reserves its taller
 * sentence by rendering it rather than by declaring a height. `visibility`
 * rather than `aria-hidden` alone, since that is what keeps the copy out of the
 * accessibility tree as well as out of the picture.
 */
function SplitHead({
  label,
  sample,
  unit,
  marked,
  note,
  title,
}: {
  label: string;
  sample: number;
  unit: string;
  marked: boolean;
  /** Present on both heads or on neither — see above. */
  note?: string;
  title?: string;
}) {
  return (
    <span className={`spl-head-side${marked ? ' spl-head-side--on' : ''}`} title={title}>
      {label}
      <small>
        {sample} {unit}
      </small>
      {note !== undefined && (
        <small className={`spl-head-mark${marked ? '' : ' spl-head-mark--ghost'}`}>{note}</small>
      )}
    </span>
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
  highlight = null,
  highlightNote,
  highlightTitle,
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
  /** Which half the reader came here about, when a caller has one in mind — the
   *  feed's Upcoming row opens this card because a particular starter is
   *  announced, and the whole comparison is what makes his half mean anything
   *  (`.750 vs LHP` is nothing until you know the other side reads `.587`). So
   *  the card is unchanged and the head *says which column is his*: absent
   *  everywhere else, which is why the marker line is drawn only when a caller
   *  asks for one. */
  highlight?: 'left' | 'right' | null;
  /** What the marked column is marked *as*, in two words at most — the head
   *  column is 54px wide. Deliberately not a temporal phrase: the Upcoming
   *  section reaches future days as well as tonight. */
  highlightNote?: string;
  /** The whole sentence, for the head's tooltip, where there is room to name the
   *  pitcher the mark is about. */
  highlightTitle?: string;
}) {
  const smaller = Math.min(leftSample, rightSample);
  const thinSide = leftSample <= rightSample ? leftLabel : rightLabel;
  const bars = smaller >= MIN_SAMPLE;
  const thin = bars && smaller < THIN_SAMPLE;
  const oneSided = smaller === 0;
  return (
    <div className="pct-card">
      {/* `.spl-card-head` adds the flex row and the containing block the key's
          popover anchors to. The ⓘ is laid out **immediately after the title**,
          where a key belongs — it sat at the far right of the card for a while,
          240px from the words it explains — and gives its own width back in a
          negative margin, so the title still centres exactly where the
          percentile card's does. `.pct-card-head` is untouched for that card. */}
      <div className="pct-card-head spl-card-head">
        <span className="pct-card-title">Platoon splits</span>
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
            note={highlight ? highlightNote : undefined}
            title={highlight === 'left' ? highlightTitle : undefined}
          />
          <span />
          <SplitHead
            label={rightLabel}
            sample={rightSample}
            unit={sampleUnit}
            marked={highlight === 'right'}
            note={highlight ? highlightNote : undefined}
            title={highlight === 'right' ? highlightTitle : undefined}
          />
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
          bars should be read. **It is the one caption left in the body**, the key
          above it having moved behind the ⓘ on the title row (see `SplitsKey`,
          which argues why this one did not follow it): a key is instructions,
          true of every player and read once, where this is a caveat about *these*
          numbers that fires only when a side is thin — and a warning nobody can
          see they could have asked for is a warning nobody reads. */}
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
  highlightNote,
  highlightTitle,
}: {
  vsLeft: SeasonStats | null;
  vsRight: SeasonStats | null;
  /** 'left' is vs LHP — see `SplitCard`. */
  highlight?: 'left' | 'right' | null;
  highlightNote?: string;
  highlightTitle?: string;
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
      highlight={highlight}
      highlightNote={highlightNote}
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
