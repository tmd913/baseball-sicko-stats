import { getPlayerSeasonCut } from './playerSplits.js';
import { getResearch, SEASON } from './research.js';
import {
  formatValue,
  leaguePercentile,
  PITCHER_SECTIONS,
  PITCHER_SUMMARY_SECTIONS,
  SECTIONS,
  SUMMARY_SECTIONS,
} from './percentiles.js';
import type { MetricDef, SectionDef } from './percentiles.js';
import type {
  PercentileMetric,
  PercentileSection,
  PlayerCut,
  PlayerKind,
  PlayerPercentiles,
  ResearchRow,
} from './types.js';

/**
 * **The percentile card, asked about a cut of the season instead of all of it.**
 *
 * The reader's question is *is he a different hitter against left-handers*, and
 * the answer that makes it comparable to anything is the one this module
 * computes: take his value **in the cut** and place it where that value would
 * put him **among all qualified players over the full season**. Both halves are
 * deliberate and neither is the obvious alternative:
 *
 * - It is **not** ranked within a population of left-handed splits. There is no
 *   such board — Savant publishes no split leaderboard — and there is a better
 *   reason than availability: a reader comparing platoon splits wants to know
 *   whether the man is *good* against left-handers, on the one scale every
 *   other number on this page is drawn to. Ranked among split lines, a hitter
 *   who is merely average against left-handers scores 50 twice over and the
 *   card says nothing.
 * - It is **not** a season card re-scraped with a filter. Savant's
 *   `percent_rank_` fields exist for the season and for nothing else, so every
 *   bar here is **ours**. Every metric on a cut card is therefore marked
 *   `estimated` and the client draws it broken — the app's standing rule that
 *   an estimate never wears the same clothes as a measurement, applied to a
 *   whole card rather than to a row.
 *
 * ### One arithmetic on both sides of the comparison
 *
 * The cut's values and the population's values come off **the same board**,
 * which is the property that makes the ranking honest rather than approximately
 * honest. `playerSplits.ts` reduces one player's season of pitches to a
 * `ResearchRow` using `statcastWindow.ts`'s own `tally`/`toStatcast`; the
 * season board is built by `research.ts` from Savant's leaderboards. Where the
 * two could disagree, they have been measured not to (see `data-sources.md` on
 * the custom board reconciling row for row) — but the point stands regardless:
 * a barrel rate on a cut row and a barrel rate on a board row are the same
 * quantity computed by the same code, so the percentile is a rank inside a
 * distribution the value genuinely belongs to.
 *
 * **This is why a cut card is drawn in board units and never mixes with the
 * scraped one.** The season card's `Avg Exit Velocity` is Savant's
 * `exit_velocity_avg` off the player page; a cut's is `exitVelocity` off the
 * board. Ranking the first inside a distribution of the second would be
 * comparing two numbers that mean the same thing and are computed by two
 * different parties, which is exactly the kind of join this codebase fails to
 * null rather than guessing at.
 *
 * ### The one thing this comparison overstates, measured
 *
 * A season value and a cut value are not equally noisy, and the ranking does
 * not know that. A qualified player's season figure is an average over hundreds
 * of events; a cut of it is an average over dozens — so the cut's *sampling*
 * spread is wider than the population's *true* spread, and cut values land
 * nearer the ends of the distribution than the player's real ability does. The
 * effect is proportional to how tight the league is relative to the noise.
 *
 * Measured on the 2026 boards (247 qualified batters, 354 qualified pitchers —
 * which is Savant's own 246 and 354, so the population is the right one):
 *
 * - **Batter bat speed** spans 62.5 → 79.7 mph, p10–p90 68.5 → 75.6. Seventeen
 *   mph of real spread; a cut moves a man a few points and no more.
 * - **Pitcher bat speed against** spans 70.5 → 73.5, p10–p90 **71.4 → 72.6**.
 *   One and a fifth mph holds eighty per cent of the league, which is narrower
 *   than the swing-to-swing noise in a 150-pitch cut — so Sánchez reads 50th
 *   against left-handers at 72.0 and **0th** against right-handers at 73.3, off
 *   1.3 mph. Both bars are arithmetically correct and neither is a finding.
 *
 * This is not a fault to be corrected — the reader asked where a cut value
 * falls among season values, and that is what is drawn. It is a fault to be
 * *disclosed*, so two things do the disclosing: every bar is `estimated` and
 * drawn broken, and `cutSample` rides on the card so the client can print how
 * many plate appearances it rests on. A reader who can see `76 PA` under a
 * hundredth-percentile bar has what they need; one who cannot, does not.
 *
 * ### What a cut cannot carry
 *
 * A cut row is built from pitch rows, so it knows what happened in the plate
 * appearance and nothing else — `playerSplits.ts`'s header sets out the whole
 * list. On this card that costs the **run values** (batting, baserunning,
 * fielding, and the pitcher's by pitch group), everything **fielding** and
 * **catching**, **sprint speed**, and the handful of Savant rows with no board
 * column behind them (squared-up %, strike-zone judgment, fastball spin and
 * extension, the vs-pitch-type splits).
 *
 * They are **dropped rather than dashed**, which is a departure from how the
 * season card treats a missing value and the right one: a dash on the season
 * card means *Savant has no number for this man*, a fact about him. A row that
 * no cut of anybody could ever fill is a fact about the shape of the card, and
 * thirty players' worth of identical empty tracks says nothing thirty times.
 * `CUT_SOURCE` is the whole of that filter: a metric with an entry is drawn, a
 * metric without one is not, and the sections and their order are otherwise the
 * season card's own — so flipping the cut control keeps the reader on a card
 * they recognize with fewer rows on it, rather than moving them to a new one.
 */

/** How one card metric is read off a board row, by the metric's key on the
 *  season card. A key with no entry here is a row a cut cannot carry. */
type CutSource = (row: ResearchRow, kind: PlayerKind) => number | null;

/** A rate as a percent, from a count and its denominator — the shape K% and BB%
 *  arrive in on a board row, where the card wants them the way Savant prints
 *  them. Null on a zero denominator rather than 0, which would rank a man with
 *  no plate appearances at the bottom of the league instead of nowhere. */
function ratePercent(count: number | null, den: number | null): number | null {
  if (count === null || den === null || den <= 0) return null;
  return (count / den) * 100;
}

/** The plate appearances a rate is taken over — his on a batter row, the
 *  batters he faced on a pitcher's. One name for the denominator every
 *  discipline rate on either board shares. */
function faced(row: ResearchRow, kind: PlayerKind): number | null {
  return kind === 'pitcher' ? row.battersFaced : row.pa;
}

/**
 * Every card metric a cut can carry, keyed by the key it wears on the season
 * card — which is what keeps the two cards the same card.
 *
 * Units are the season card's, because they are what the labels and the
 * formats in `SECTIONS` were written for: a rate the board stores as a percent
 * stays a percent, and the two the board stores as counts are turned into one.
 */
const CUT_SOURCE: Record<string, CutSource> = {
  // The slash line and its expected twins. `woba` is absent on purpose: the
  // board carries xwOBA and not wOBA, so there is no column to rank it in.
  //
  // **A batting average is on two different fields depending on whose row it
  // is** — `avg` is what he hit, `avgAgainst` is what he allowed, and a board
  // row carries exactly one of them (see `ResearchRow`, where the batting half
  // is null on a pitcher). Reading `avg` alone cost the pitcher card its BA row
  // silently: the metric resolved to null and the drop rule took it away, which
  // is the failure mode that looks like a design decision.
  //
  // The three below it have no pitcher-side field at all — the board publishes
  // no OBP, SLG or BABIP against — so they stay batter-only and a pitcher's cut
  // card genuinely has no row for them.
  ba: (r, kind) => (kind === 'pitcher' ? r.avgAgainst : r.avg),
  xba: (r) => r.xba,
  obp: (r) => r.obp,
  slg: (r) => r.slg,
  xslg: (r) => r.xslg,
  xwoba: (r) => r.xwoba,
  babip: (r) => r.babip,
  // ISO is slugging over batting average, which both boards carry and neither
  // publishes — the one derived slash-line figure, and it is exact rather than
  // estimated.
  iso: (r) => (r.slg === null || r.avg === null ? null : r.slg - r.avg),

  // Batted ball.
  exit_velo: (r) => r.exitVelocity,
  launch_angle: (r) => r.launchAngle,
  barrel: (r) => r.barrelRate,
  hard_hit: (r) => r.hardHitRate,
  sweet_spot: (r) => r.sweetSpotRate,
  gb: (r) => r.gbRate,

  // The swing itself, and the discipline around it.
  bat_speed: (r) => r.batSpeed,
  chase: (r) => r.chaseRate,
  whiff: (r) => r.whiffRate,
  k: (r, kind) => ratePercent(r.strikeouts, faced(r, kind)),
  bb: (r, kind) => ratePercent(r.walks, faced(r, kind)),
};

/**
 * The league's qualified values for one metric, ascending — the distribution a
 * cut value is placed inside.
 *
 * **The population is `qualified`**, the flag the research board already uses
 * for its own rank badges, which is Savant's bar rather than MLB's: 2.1 plate
 * appearances per team game for a batter, 1.25 batters faced for a pitcher (see
 * `research.ts::qualifies`, where both figures are measured against Savant's
 * own ranked set). Using the same population as the badges is what stops a
 * reader meeting two different percentiles for one number on two surfaces of
 * this app.
 */
function distributionsFor(rows: ResearchRow[], kind: PlayerKind): Record<string, number[]> {
  const qualified = rows.filter((r) => r.qualified);
  const out: Record<string, number[]> = {};
  for (const [key, read] of Object.entries(CUT_SOURCE)) {
    const values: number[] = [];
    for (const row of qualified) {
      const v = read(row, kind);
      if (v !== null && Number.isFinite(v)) values.push(v);
    }
    out[key] = values.sort((a, b) => a - b);
  }
  return out;
}

/** One section of the season card, reduced to the rows a cut can fill and
 *  ranked. Returns null when nothing in it survives, which is what keeps
 *  `Fielding` and `Running` off a cut card without naming them. */
function cutSection(
  def: SectionDef,
  row: ResearchRow,
  kind: PlayerKind,
  dists: Record<string, number[]>,
): PercentileSection | null {
  const metrics: PercentileMetric[] = [];
  for (const m of def.metrics) {
    const metric = cutMetric(m, row, kind, dists);
    if (metric) metrics.push(metric);
  }
  return metrics.length > 0 ? { title: def.title, metrics } : null;
}

function cutMetric(
  m: MetricDef,
  row: ResearchRow,
  kind: PlayerKind,
  dists: Record<string, number[]>,
): PercentileMetric | null {
  const read = CUT_SOURCE[m.key];
  if (!read) return null;
  const value = read(row, kind);
  if (value === null || !Number.isFinite(value)) return null;
  const percentile = leaguePercentile(value, dists[m.key] ?? [], !!m.lowerBetter);
  return {
    key: m.key,
    label: m.label,
    percentile,
    value: formatValue(value, m.fmt),
    // **Every row, always.** The bar is this app's rank of a value Savant never
    // ranked, which is the definition `estimated` carries on the season card;
    // that it happens to be a share of an exact distribution rather than a
    // z-score does not make it Savant's. The client draws the whole card
    // broken, and that is the honest reading of a card built here.
    estimated: true,
  };
}

function build(
  defs: SectionDef[],
  row: ResearchRow,
  kind: PlayerKind,
  dists: Record<string, number[]>,
): PercentileSection[] {
  const out: PercentileSection[] = [];
  for (const def of defs) {
    const section = cutSection(def, row, kind, dists);
    if (section) out.push(section);
  }
  return out;
}

/**
 * A player's percentile card for one cut of the season.
 *
 * **No cache of its own, and it does not need one.** Both halves are already
 * cached where they are built: the cut row comes from `playerSplits.ts`'s
 * six-hour blob (one fetch serving all five cuts) and the population from
 * `research.ts`'s season board, which the warmer keeps hot and every other
 * board on this page reads. What is left here is a filter and a sort over rows
 * already in memory — measured in milliseconds against the 1.07s Savant scrape
 * the season card pays — so a third blob would be a third thing to version for
 * no round trip saved.
 *
 * **An empty card is an answer, not a failure**, exactly as it is on the season
 * card: a player with no plate appearance in the cut has no row, and the client
 * draws a sentence naming the cut rather than an error. The population failing
 * is different and is *not* swallowed — without the board there is no
 * distribution, and a card of bar-less rows would be a card that has quietly
 * stopped answering the question it was opened for.
 */
export async function getCutPercentiles(
  playerId: number,
  kind: PlayerKind,
  cut: PlayerCut,
): Promise<PlayerPercentiles> {
  // **The current season, and only ever the current season.** Both halves of
  // this card are pinned to it — `playerSplits.ts` asks Savant for `hfSea` and
  // `research.ts`'s board is this year's — so there is no `year` parameter to
  // take. The route declines to cut a past season's card rather than serving
  // one labeled with a year it is not, which is the same direction every join
  // in this codebase fails in. The season is imported rather than pinned a
  // twelfth time; see the note in `playerSplits.ts`.
  const year = SEASON;
  const [row, board] = await Promise.all([
    getPlayerSeasonCut(playerId, kind, cut),
    getResearch(kind, 'season'),
  ]);
  const empty: PlayerPercentiles = {
    playerId,
    year,
    sections: [],
    summary: [],
    cut,
    cutSample: null,
    updatedAt: new Date().toISOString(),
  };
  if (!row) return empty;

  const dists = distributionsFor(board.rows, kind);
  const detailed = kind === 'pitcher' ? PITCHER_SECTIONS : SECTIONS;
  const summary = kind === 'pitcher' ? PITCHER_SUMMARY_SECTIONS : SUMMARY_SECTIONS;
  return {
    playerId,
    year,
    sections: build(detailed, row, kind, dists),
    summary: build(summary, row, kind, dists),
    cut,
    cutSample: faced(row, kind),
    updatedAt: new Date().toISOString(),
  };
}
