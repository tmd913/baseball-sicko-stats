/**
 * **What one player's day was worth in the categories your league actually
 * scores** — the arithmetic behind the Overview's top-performer lists.
 *
 * A categories league is won category by category, so *who had the best day*
 * has no answer until somebody says which categories count. A home run is worth
 * a great deal in a league scoring HR and nothing at all in one scoring OBP and
 * total bases; a seven-inning shutout with two strikeouts is a fine day in a
 * league scoring ERA and WHIP and an ordinary one in a league scoring K. So the
 * ranking is built from `EspnScoreboard.categories` — the league's own list, in
 * the league's own order — rather than from a fixed idea of what a good day is.
 *
 * **Three steps, and each is a decision worth stating.**
 *
 * 1. **A contribution per category**, in that category's own units. For a
 *    counting category that is simply his count: three RBI is three. For a
 *    **rate** category it is not — a rate is not additive, and a man's own OPS
 *    tells you nothing about what he did to his team's. So a rate contribution
 *    is *numerator above baseline*: `H − lgAVG × AB` for AVG, `TB − lgSLG × AB`
 *    for SLG, `lgERA × IP / 9 − ER` for ERA, `lgWHIP × IP − (H + BB)` for WHIP.
 *    Those read as "hits above average", "earned runs saved", "baserunners
 *    saved" — they are additive, they are signed the right way round, and a day
 *    with no plate appearance and no out recorded is zero rather than a
 *    division by nought.
 *
 * 2. **Divided by that category's own scale**, so a home run and a strikeout
 *    are comparable. The scale is the **standard deviation of a single
 *    player-day** in that category, measured rather than declared — see
 *    `BATTING_SCALE` and `PITCHING_SCALE` below for the sample. A day is
 *    therefore in units of *per-day standard deviations*, which is the only
 *    unit that means the same thing in two categories.
 *
 * 3. **Averaged over the categories his side of the ball can score**, which is
 *    what makes a batter's day and a pitcher's day comparable at all. A league
 *    scoring six batting categories and four pitching ones would otherwise rank
 *    every hitter above every arm by construction, the hitter having six chances
 *    to accumulate and the arm four. Dividing by the count of his own side's
 *    scored categories is the fix, and it is why one list can hold both.
 *
 * **A category this file cannot compute is not scored, and is not counted in
 * the divisor either.** `GIDP`, `CG`, `QS` and the rest are absent from a
 * combined line, and quality starts in particular cannot be recovered from one
 * — six innings and three earned runs is a quality start over one game and says
 * nothing at all summed over two. A league scoring them gets a ranking over the
 * categories that *are* computable and the Overview says how many those were.
 * A join fails to null, never to a guess.
 */
import type { BattingLine, EspnCategory, PitchingLine, PlayerKind, ResearchRow } from './types';

/**
 * **League baselines, and the scale of a single player-day in each category** —
 * measured off MLB's own boxscores rather than declared, in the spirit
 * `leagueRates.ts` sets out for the FIP constant: a handful of numbers that
 * move a little year to year and are not worth a second data source.
 *
 * **The sample: ten dates spread evenly across the 2026 season** — Apr 10,
 * Apr 25, May 9, May 23, Jun 6, Jun 20, Jul 4, Jul 18, Aug 1, Aug 15 — every
 * final game on each, giving **3,008 batter-days** (every man with a plate
 * appearance) and **1,252 pitcher-days** (every man who recorded an out or
 * faced a batter). The baselines off that sample: `.2414 / .3169 / .3979`
 * AVG/OBP/SLG, a `4.1331` ERA, a `1.2844` WHIP, a `.2383` opponent average and
 * `8.8225` K/9 — all within a hundredth or two of the season's own published
 * figures, which is what a ten-date sample of ~150 games should give.
 *
 * **The four rate scales are the standard deviation of the contribution rather
 * than of the rate**, which is why they are stated here and not derived: an
 * OPS contribution has a mean of exactly 0 by construction and a spread of
 * `2.4066` over a player-day, and neither number is recoverable from `.7147`.
 *
 * **Refresh these when the season rolls over**, alongside the season pins
 * `CLAUDE.md` lists. Nothing breaks if they drift — a scale a few percent stale
 * reorders nothing, the numbers being a *ranking* rather than a published stat
 * — which is exactly why they are a constant table and not a request.
 */
const LG = {
  avg: 0.2414,
  obp: 0.3169,
  slg: 0.3979,
  era: 4.1331,
  whip: 1.2844,
  oba: 0.2383,
  k9: 8.8225,
} as const;

/**
 * How a category is turned into a number, per ESPN stat id. `raw` reads a count
 * straight off the line and takes its sign from the league's own
 * `lowerBetter`; `oriented` is a rate contribution, already computed so that
 * **positive is good on both sides of the ball** — an ERA contribution is runs
 * *saved* — and so must never be negated a second time.
 *
 * `scale` is the measured per-player-day standard deviation. A stat id absent
 * from this table, or carrying a scale of zero, is not scored: `GP` is the
 * degenerate case that makes the second half of that sentence necessary, a
 * pitcher-day being one appearance 1,252 times out of 1,252 and its standard
 * deviation therefore exactly 0.
 */
type Term = {
  scale: number;
  oriented?: true;
  of: (v: DayLine) => number;
};

/** What a day comes to, on one side of the ball or both. `games` and `starts`
 *  ride alongside the lines because two categories are facts about appearances
 *  rather than about a line, and a combined line has forgotten how many games
 *  it was combined from. */
export interface DayLine {
  batting: BattingLine | null;
  pitching: PitchingLine | null;
  games: number;
  starts: number;
}

const b = (v: DayLine) => v.batting;
const p = (v: DayLine) => v.pitching;
/** Innings, as the rate contributions want them. */
const ip = (v: DayLine) => (p(v)?.outs ?? 0) / 3;

const TERMS: Record<number, Term> = {
  // ---- Batting -----------------------------------------------------------
  0: { scale: 1.1371, of: (v) => b(v)?.ab ?? 0 }, // AB
  1: { scale: 0.8709, of: (v) => b(v)?.hits ?? 0 }, // H
  2: { scale: 0.7993, oriented: true, of: (v) => (b(v) ? b(v)!.hits - LG.avg * b(v)!.ab : 0) }, // AVG
  3: { scale: 0.3895, of: (v) => b(v)?.doubles ?? 0 }, // 2B
  4: { scale: 0.1145, of: (v) => b(v)?.triples ?? 0 }, // 3B
  5: { scale: 0.3457, of: (v) => b(v)?.hr ?? 0 }, // HR
  6: { scale: 0.5324, of: (v) => (b(v) ? b(v)!.doubles + b(v)!.triples + b(v)!.hr : 0) }, // XBH
  7: { scale: 0.712, of: (v) => b(v)?.singles ?? 0 }, // 1B
  8: { scale: 1.7533, of: (v) => b(v)?.totalBases ?? 0 }, // TB
  9: { scale: 1.6551, oriented: true, of: (v) => (b(v) ? b(v)!.totalBases - LG.slg * b(v)!.ab : 0) }, // SLG
  10: { scale: 0.572, of: (v) => b(v)?.bb ?? 0 }, // BB
  12: { scale: 0.2315, of: (v) => b(v)?.hbp ?? 0 }, // HBP
  13: { scale: 0.1651, of: (v) => b(v)?.sf ?? 0 }, // SF
  16: { scale: 1.1312, of: (v) => b(v)?.pa ?? 0 }, // PA
  17: { scale: 0.9241, oriented: true, of: (v) => onBaseAbove(b(v)) }, // OBP
  // **OPS is its two halves added, not a rate of its own**, which is the only
  // reading that stays additive: OBP and SLG have different denominators, so
  // `(hisOPS − lgOPS) × PA` would be an average of two things measured against
  // two different counts. Times on base above average plus total bases above
  // average is what OPS is made of, and its spread was measured as the sum.
  18: {
    scale: 2.4066,
    oriented: true,
    of: (v) => onBaseAbove(b(v)) + (b(v) ? b(v)!.totalBases - LG.slg * b(v)!.ab : 0),
  }, // OPS
  20: { scale: 0.675, of: (v) => b(v)?.runs ?? 0 }, // R
  21: { scale: 0.8189, of: (v) => b(v)?.rbi ?? 0 }, // RBI
  23: { scale: 0.2604, of: (v) => b(v)?.sb ?? 0 }, // SB
  24: { scale: 0.1466, of: (v) => b(v)?.cs ?? 0 }, // CS
  25: { scale: 0.291, of: (v) => (b(v) ? b(v)!.sb - b(v)!.cs : 0) }, // SB-CS
  31: { scale: 0.8625, of: (v) => b(v)?.so ?? 0 }, // K, batting
  // ---- Pitching ----------------------------------------------------------
  32: { scale: 0, of: (v) => v.games }, // GP — scale 0, so never scored; see above.
  33: { scale: 0.4259, of: (v) => v.starts }, // GS
  34: { scale: 5.7285, of: (v) => p(v)?.outs ?? 0 }, // OUTS
  35: { scale: 7.937, of: (v) => p(v)?.battersFaced ?? 0 }, // TBF
  36: { scale: 30.8127, of: (v) => p(v)?.pitchesThrown ?? 0 }, // P
  37: { scale: 2.2734, of: (v) => p(v)?.hits ?? 0 }, // H allowed
  38: { scale: 1.2972, oriented: true, of: (v) => (p(v) ? LG.oba * p(v)!.atBats - p(v)!.hits : 0) }, // OBA
  39: { scale: 1.066, of: (v) => p(v)?.walks ?? 0 }, // BB allowed
  40: { scale: 0.1674, of: (v) => p(v)?.intentionalWalks ?? 0 }, // IBB allowed
  41: {
    scale: 2.0479,
    oriented: true,
    of: (v) => (p(v) ? LG.whip * ip(v) - (p(v)!.hits + p(v)!.walks) : 0),
  }, // WHIP
  42: { scale: 0.3688, of: (v) => p(v)?.hitBatsmen ?? 0 }, // HBP
  44: { scale: 1.6356, of: (v) => p(v)?.runs ?? 0 }, // R allowed
  45: { scale: 1.5795, of: (v) => p(v)?.earnedRuns ?? 0 }, // ER
  46: { scale: 0.5858, of: (v) => p(v)?.hr ?? 0 }, // HR allowed
  47: { scale: 1.469, oriented: true, of: (v) => (p(v) ? (LG.era * ip(v)) / 9 - p(v)!.earnedRuns : 0) }, // ERA
  48: { scale: 2.246, of: (v) => p(v)?.strikeouts ?? 0 }, // K
  49: { scale: 1.3052, oriented: true, of: (v) => (p(v) ? p(v)!.strikeouts - (LG.k9 * ip(v)) / 9 : 0) }, // K/9
  50: { scale: 0.2648, of: (v) => p(v)?.wildPitches ?? 0 }, // WP
  53: { scale: 0.3238, of: (v) => p(v)?.wins ?? 0 }, // W
  57: { scale: 0.2313, of: (v) => p(v)?.saves ?? 0 }, // SV
  60: { scale: 0.3321, of: (v) => p(v)?.holds ?? 0 }, // HD
  83: { scale: 0.3866, of: (v) => (p(v) ? p(v)!.saves + p(v)!.holds : 0) }, // SVHD
};

/** Times on base above what the league's own rate would have produced over the
 *  same OBP denominator — `AB + BB + HBP + SF`, the one rate in baseball whose
 *  denominator is not the obvious one, which is why `BattingLine` carries `sf`
 *  at all. */
function onBaseAbove(line: BattingLine | null): number {
  if (!line) return 0;
  const denom = line.ab + line.bb + line.hbp + line.sf;
  return line.hits + line.bb + line.hbp - LG.obp * denom;
}

/** One category's share of a day's value. */
export interface ValuePart {
  statId: number;
  label: string;
  /** In the category's own units — three RBI, or 1.4 earned runs saved. */
  contribution: number;
  /** The same thing in per-day standard deviations, signed so that positive is
   *  always good. This is what the total is a mean of. */
  scaled: number;
}

export interface DayValue {
  /** The mean of `parts`, in per-day standard deviations. Null where the
   *  league scores nothing this file can compute on his side of the ball. */
  total: number | null;
  parts: ValuePart[];
  /** How many of his side's categories were scored, and how many it has. The
   *  two differ only in a league scoring something a combined line cannot
   *  carry, and the Overview says so when they do. */
  scored: number;
  possible: number;
}

/**
 * Score one player's day against one league's categories.
 *
 * **Only his own side of the ball counts.** A batter is ranked over the batting
 * categories and a pitcher over the pitching ones; a two-way player is two rows
 * under one id in this app and each is scored on the side it is a row for,
 * which is the same rule his fantasy seat already follows (`lib.ts::seatKinds`).
 * A category the league scores on neither side — an id `STAT_META` has never
 * been read against, which the League view files under `Other` — is scored by
 * nobody and lowers nobody's divisor.
 */
export function dayValue(kind: PlayerKind, line: DayLine, categories: EspnCategory[]): DayValue {
  const side = kind === 'pitcher' ? 'pitching' : 'batting';
  const mine = categories.filter((c) => c.side === side);
  const parts: ValuePart[] = [];
  for (const cat of mine) {
    const term = TERMS[cat.statId];
    if (!term || term.scale <= 0) continue;
    const contribution = term.of(line);
    // A raw count takes its sign from the league — walks allowed are a category
    // you want fewer of. A rate contribution is signed already, and negating it
    // here would turn every earned run saved into an earned run given up.
    const signed = term.oriented ? contribution : cat.lowerBetter ? -contribution : contribution;
    parts.push({
      statId: cat.statId,
      label: cat.label,
      contribution,
      scaled: signed / term.scale,
    });
  }
  const total = parts.length === 0 ? null : parts.reduce((n, x) => n + x.scaled, 0) / parts.length;
  return { total, parts, scored: parts.length, possible: mine.length };
}

/**
 * **The default 5×5, for a reader with no league connected.** The Overview's
 * day blocks stand without one — a watchlist has days and top performers like
 * any roster — and something has to say what "top" means. This is the set every
 * standard league has scored since rotisserie was invented, and it is drawn as
 * itself rather than as a claim about anybody's league: the block says
 * `standard 5×5` where a connected reader's says the league's name.
 *
 * The shape is `EspnCategory`'s so that one function scores both, which is the
 * whole reason it is spelled out here rather than special-cased in `dayValue`.
 */
export const STANDARD_5X5: EspnCategory[] = [
  { statId: 20, label: 'R', name: 'Runs', lowerBetter: false, format: 'count', side: 'batting', order: 10 },
  { statId: 5, label: 'HR', name: 'Home runs', lowerBetter: false, format: 'count', side: 'batting', order: 15 },
  { statId: 21, label: 'RBI', name: 'Runs batted in', lowerBetter: false, format: 'count', side: 'batting', order: 18 },
  { statId: 23, label: 'SB', name: 'Stolen bases', lowerBetter: false, format: 'count', side: 'batting', order: 19 },
  { statId: 2, label: 'AVG', name: 'Batting average', lowerBetter: false, format: 'avg', side: 'batting', order: 40 },
  { statId: 53, label: 'W', name: 'Wins', lowerBetter: false, format: 'count', side: 'pitching', order: 11 },
  { statId: 57, label: 'SV', name: 'Saves', lowerBetter: false, format: 'count', side: 'pitching', order: 50 },
  { statId: 48, label: 'K', name: 'Strikeouts', lowerBetter: false, format: 'count', side: 'pitching', order: 10 },
  { statId: 47, label: 'ERA', name: 'Earned run average', lowerBetter: true, format: 'rate', side: 'pitching', order: 40 },
  { statId: 41, label: 'WHIP', name: 'Walks and hits per inning', lowerBetter: true, format: 'rate', side: 'pitching', order: 41 },
];

/**
 * **What a whole day came to in one category** — the figure the Overview's day
 * blocks print, in the category's own units rather than in standard deviations.
 *
 * This is a different question from `dayValue`'s and needs its own arithmetic
 * for exactly one reason: a **rate over an aggregate is not the sum of the
 * rates**. Nine men's OPS added together is nothing at all; the day's OPS is
 * the day's times on base over the day's OBP denominator plus the day's total
 * bases over the day's at-bats, which is what this computes. The counting
 * categories really are sums, and take the same `TERMS` entry `dayValue` uses
 * so the two cannot come to disagree about what `SVHD` means.
 *
 * Null where the category is one this file cannot compute, and null where the
 * denominator is nought — a day with no at-bat has no batting average, and
 * drawing `.000` would claim nine hitless at-bats where there were none.
 */
export function categoryTotal(cat: EspnCategory, line: DayLine): number | null {
  const bl = line.batting;
  const pl = line.pitching;
  const innings = (pl?.outs ?? 0) / 3;
  switch (cat.statId) {
    case 2: // AVG
      return bl && bl.ab > 0 ? bl.hits / bl.ab : null;
    case 9: // SLG
      return bl && bl.ab > 0 ? bl.totalBases / bl.ab : null;
    case 17: // OBP
      return bl ? obpOf(bl) : null;
    case 18: // OPS
      return bl && bl.ab > 0 && obpOf(bl) !== null ? obpOf(bl)! + bl.totalBases / bl.ab : null;
    case 38: // OBA
      return pl && pl.atBats > 0 ? pl.hits / pl.atBats : null;
    case 41: // WHIP
      return innings > 0 ? (pl!.hits + pl!.walks) / innings : null;
    case 47: // ERA
      return innings > 0 ? (pl!.earnedRuns * 9) / innings : null;
    case 49: // K/9
      return innings > 0 ? (pl!.strikeouts * 9) / innings : null;
    default: {
      const term = TERMS[cat.statId];
      return term ? term.of(line) : null;
    }
  }
}

/** On-base percentage over an aggregate line, or null with an empty
 *  denominator. Its own function because two of the four cases above want it
 *  and OPS wants it twice. */
function obpOf(line: BattingLine): number | null {
  const denom = line.ab + line.bb + line.hbp + line.sf;
  return denom > 0 ? (line.hits + line.bb + line.hbp) / denom : null;
}

/* ---- Scoring a *projection* --------------------------------------------
   The Overview ranks a day that has been played, and the two projected
   surfaces — the roster's lens and the research board's — rank days that have
   not. It is the same arithmetic over the same categories, so it is
   `dayValue` with an adapter in front of it rather than a second scorer.

   **What the number means differs, and only in its span.** The Overview's is
   one day, so its figure is a player-day. A projection covers the days the
   reader picked, so its figure is **the whole span, undivided** — six games of
   a good hitter outscore three of an equal one, which is the question a
   projected board is read to answer. `dayValue` needs no divisor for that: its
   scales are per-player-day and its terms are counts, so a line covering six
   games already produces six games' worth.
   ------------------------------------------------------------------------ */

/**
 * A projected `ResearchRow` as a line the scorer can read.
 *
 * **Three of the counts are derived rather than carried**, because they fall
 * out of what the row has and a field the server need not send is a field that
 * cannot go stale: singles are hits less the extra-base hits, and total bases
 * are the four of them weighted. `hbp` and `sf` are carried, being the two the
 * OBP denominator needs and the two nothing else implies — see `ResearchRow`.
 *
 * **Two counts are zero and it is worth naming them.** Intentional walks and
 * wild pitches are not projected, so a league scoring either gets nought from
 * every row — which lowers everybody by the same amount and so changes no
 * ranking, where a guess at them would change one. The Statcast fields on
 * `BattingLine` are nulled for the plain reason that the scorer never reads
 * them.
 */
export function projectedRowLine(row: ResearchRow): DayLine {
  const hits = row.hits ?? 0;
  const doubles = row.doubles ?? 0;
  const triples = row.triples ?? 0;
  const hr = row.hr ?? 0;
  const walks = row.walks ?? 0;
  const hbp = row.hbp ?? 0;
  const outs = row.outs ?? 0;
  const battersFaced = row.battersFaced ?? 0;
  const batting: BattingLine | null =
    row.kind === 'pitcher'
      ? null
      : {
          pa: row.pa ?? 0,
          ab: row.ab ?? 0,
          hits,
          singles: Math.max(0, hits - doubles - triples - hr),
          doubles,
          triples,
          hr,
          bb: walks,
          so: row.strikeouts ?? 0,
          hbp,
          sf: row.sf ?? 0,
          runs: row.runs ?? 0,
          rbi: row.rbi ?? 0,
          sb: row.sb ?? 0,
          cs: row.cs ?? 0,
          totalBases: hits + doubles + 2 * triples + 3 * hr,
          avgExitVelo: null,
          maxExitVelo: null,
          maxDistance: null,
          hardHits: 0,
          runValue: null,
        };
  const pitching: PitchingLine | null =
    row.kind === 'pitcher'
      ? {
          outs,
          hits,
          runs: row.runs ?? 0,
          earnedRuns: row.earnedRuns ?? 0,
          walks,
          strikeouts: row.strikeouts ?? 0,
          hr,
          battersFaced,
          pitchesThrown: row.pitches ?? 0,
          strikes: row.strikes ?? 0,
          balls: 0,
          doubles,
          triples,
          hitBatsmen: hbp,
          // The projection's own derivation, word for word — batters faced less
          // the two that are not at-bats. It ignores sacrifices, which it does
          // on the server too, so the two agree.
          atBats: Math.max(0, battersFaced - walks - hbp),
          intentionalWalks: 0,
          wildPitches: 0,
          inheritedRunners: 0,
          inheritedRunnersScored: 0,
          wins: row.wins ?? 0,
          saves: row.saves ?? 0,
          holds: row.holds ?? 0,
        }
      : null;
  return { batting, pitching, games: row.games ?? 0, starts: row.gamesStarted ?? 0 };
}

/**
 * What a projected row is worth over the span, or null where the league scores
 * nothing this file can compute on his side of the ball.
 *
 * The same figure the Overview ranks its top performers by, over the span the
 * projection covers rather than over one day — see the section note above.
 */
export function projectedRowValue(row: ResearchRow, categories: EspnCategory[]): number | null {
  return dayValue(row.kind, projectedRowLine(row), categories).total;
}

/**
 * **…and the same figure divided by the appearances it is made of** — *how good
 * is he on a day he plays*, where the one above is *how much will he give me
 * this week*.
 *
 * The two are different questions and neither subsumes the other. A hitter with
 * eleven games beats an equal one with eight on the total and ties him here; a
 * starter with three turns beats one with two on the total and may lose here.
 * Which of them a reader wants depends on what he is deciding — a streamer for
 * one open day wants this, and a man to hold all week wants the total — so the
 * Overview's value rail offers both and says which is in force.
 *
 * **It divides by `games`, which for a pitcher is appearances**: a starter's
 * turns and a reliever's outings, the same quantity the board's own `G` column
 * prints and the same one `projectedPlayerValue` reads as `chances`. So this is
 * per *appearance* rather than per club-game, which is the only reading that
 * means anything for a man who does not play every day.
 *
 * **Null under one projected appearance** (`PER_GAME_MIN_GAMES`), and that is a
 * correction — the first pass had no floor at all and measured the wrong
 * population to justify it.
 *
 * The worry is a tiny denominator: a man projected for a tenth of an appearance
 * dividing his way to the top. Measured over the **whole** board (984 scored
 * rows, 149 of them under one game) it looked like a non-issue — the best thin
 * row ranked 24th among batters — because the projection is **linear in
 * chances**, so `value / games` recovers something close to a stable
 * per-appearance rate at any count.
 *
 * **But the Overview's rail is free agents only, and that pool is far thinner.**
 * Re-measured over the 722 rows nobody in the league has rostered, **five of the
 * batters' per-game top ten had under one game** and the leader was Davis
 * Wendzel at **0.1 G for a total of 0.0** — a card reading *he is excellent when
 * he plays, and he is not going to play*. The first measurement was not wrong
 * about the arithmetic; it was answering about a list nobody is shown.
 *
 * **So the floor is on the figure rather than on any one caller**, which is what
 * makes every surface agree: the rail drops the row (it already drops a null
 * value), the board's `VAL/G` cell prints a dash, and the `See more` door
 * therefore lands on a board whose top ten *is* the rail's top ten — the
 * row-by-row match that door is held to. A floor in the rail alone was tried
 * first and broke exactly that: the rail read `Tolbert · Durbin · Bell` and the
 * board it opened read `Wendzel · Tolbert · Kingery`.
 *
 * **And a dash is the honest cell, not a hidden one.** Dividing by less than one
 * projected appearance does not produce a per-appearance figure — it produces
 * his rate with no appearance under it, a number that says nothing about the
 * span the board is set to. The board already prints a dash on `G` where there
 * is nothing to project rather than a `0` claiming a measurement; this is that
 * rule one column over.
 *
 * **One is where the effect saturates and the last point that costs nothing.**
 * The sweep on the batters' row: unfloored **5** of the top ten are under a
 * game, at 0.5 **4**, at 1 **none**, and at 2 the list is *identical* to 1 — so
 * nothing above one buys anything. Meanwhile the starters' row is untouched at
 * 1 and loses Randy Vásquez — a legitimate single-turn starter at exactly 1.0 G
 * — at 1.5. The relievers' row has no row under 3.3 G and never moves.
 *
 * Null where the total is null, and null on a row with no appearance to divide
 * by — `0` games is *there is nothing here to project* rather than a
 * measurement of nothing, which is the reading the board's own `Games` column
 * takes.
 */
/** The fewest projected appearances a per-appearance figure is drawn over — see
 *  the block above for the sweep that sets it at one. */
const PER_GAME_MIN_GAMES = 1;

export function projectedRowValuePerGame(
  row: ResearchRow,
  categories: EspnCategory[],
): number | null {
  const total = projectedRowValue(row, categories);
  if (total === null) return null;
  const games = typeof row.games === 'number' && Number.isFinite(row.games) ? row.games : 0;
  return games >= PER_GAME_MIN_GAMES ? total / games : null;
}

/**
 * …and the roster lens's own rows, which need no adapter worth the name:
 * `ProjectedPlayerLine` already carries a whole `BattingLine` and
 * `PitchingLine`, being built by the same engine from the same stat ids this
 * file's terms are keyed by. Only `chances` has to be read as two fields, the
 * scorer wanting games and starts where the projection carries one number for
 * "times he is expected to take the field".
 */
export function projectedPlayerValue(
  kind: PlayerKind,
  line: { chances: number; batting: BattingLine | null; pitching: PitchingLine | null },
  categories: EspnCategory[],
): number | null {
  return dayValue(
    kind,
    {
      batting: line.batting,
      pitching: line.pitching,
      games: line.chances,
      // **A batter's chances are all games and a pitcher's are not**, and only
      // the pitching side has a category that counts starts (`GS`). The board's
      // own projection carries no start/relief split on the line, so a starter's
      // chances are his turns and a reliever's are appearances — which is what
      // `GS` means for each of them.
      starts: kind === 'pitcher' ? line.chances : 0,
    },
    categories,
  ).total;
}
