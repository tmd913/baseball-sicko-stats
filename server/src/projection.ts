/**
 * **Where a live matchup is heading** — each side's projected final total in
 * every category the league scores, and the tally that falls out of comparing
 * them.
 *
 * A live scoreboard says who is ahead **now**, which on the Tuesday of a
 * seven-day week is a question nobody is really asking: `R 12–9` with five days
 * left says almost nothing, and the thing a manager wants to know is whether the
 * two saves he is behind by are two he is going to get. So every figure here is
 * `what has already happened` + `what the rest of the week is worth`, and the
 * second half is the whole of this file.
 *
 * ---
 *
 * ## The shape of it
 *
 * **Project the components, derive the rates.** A counting stat adds and a rate
 * does not, so nothing here ever projects an ERA: it projects earned runs and
 * outs and lets `espn.ts::withAddedComponents` rebuild the ERA from them — the
 * same function, and so the same `DERIVED` table, that adds today's day to
 * ESPN's through-yesterday score. That is what makes a projected rate consistent
 * with the projected counts beside it, and it is why a category the side is
 * *ineligible* for stays absent rather than appearing as a zero (which in a
 * `lowerBetter` category would read as the best score in the league).
 *
 * **Everything is per remaining chance.** For a batter a chance is a plate
 * appearance in a game his club has left; for a starting pitcher it is a start
 * his rotation slot puts him in; for a reliever it is an appearance. Each is
 * multiplied by a **rate** and then by an **opponent adjustment**, and the three
 * are the three things the reader is told about in the tooltip.
 *
 * ## The four inputs, and that every one of them is already in the app
 *
 * Nothing here adds an upstream. Each of these is a read the app already makes,
 * already caches and (for three of the four) already warms nightly:
 *
 * - **How many chances are left** — `schedule.ts`'s league-wide 28-day window,
 *   which carries every club's fixtures *and* `rotations`, the projected turn
 *   for every pitcher with a rotation slot. That map is what makes "his starts"
 *   answerable past the three days MLB names probables for, and it is the same
 *   map the Schedule view's grid draws, so the projection and that grid cannot
 *   disagree about whether he pitches on Saturday.
 * - **How he has been going** — `research.ts`'s season board and its 30-day
 *   board, blended (below). Two reads of a blob that is cached six hours and
 *   pulled warm nightly.
 * - **How strong the opposition is** — for a **pitcher**, `teamHitting.ts`'s
 *   nine cuts of how every club has hit, taken at 30 days and **against his own
 *   hand**; for a **batter**, the opposing club's announced or projected
 *   *starter* and how he has actually pitched. A named pitcher is a far sharper
 *   answer than a club average, and it is the one the reader would give.
 * - **Which way each of them swings** — `bats`/`throws` off
 *   `getSeasonPlayers`, for the platoon adjustment.
 *
 * ## What it deliberately does not do
 *
 * - **It does not project today's games that are already under way.** A live or
 *   final game is counted as it stands, because the current total already holds
 *   it; only a game still `scheduled` is projected. So a matchup read at nine in
 *   the morning projects the whole day and one read at nine at night projects
 *   almost none of it, which is the honest reading either way.
 * - **It does not guess at lineup changes.** It projects the players a manager
 *   has in a lineup slot **right now**, which is the same assumption
 *   `scoringPeriodTotals` already makes for today. A bench player he starts
 *   tomorrow is not in it, and neither is anybody on his IL.
 * - **It is not a probability.** There is no distribution here and no confidence
 *   interval; it is one expected value per category, and a category it says is
 *   going to be won by a run is a category nobody should be sure of.
 */

import { addDays, baseballToday } from './etDate.js';
import { mapLimit } from './limit.js';
import { getAllRosterMembers, getSeasonPlayers } from './mlbStats.js';
import { getResearch } from './research.js';
import { getScheduleWindow, getSeasonRead } from './schedule.js';
import { dayCounts, windowDates } from './statcastWindow.js';
import { getTeamHitting } from './teamHitting.js';
import {
  DERIVED,
  LINEUP_SLOTS as LINEUP_SLOT_NAMES,
  PITCHING_SLOTS,
  getMatchupWindow,
  getOwnership,
  getPlayerPool,
  getScoreboard,
  lineupSlotsFor,
  tallyCategories,
  withAddedComponents,
  type EspnCategory,
  type EspnCreds,
  type EspnRosterPlayer,
} from './espn.js';
import type {
  BattingLine,
  PitchingLine,
  PlayerKind,
  ResearchRow,
  RotationProjection,
  ScheduleGame,
  TeamHittingSplit,
  WatchPlayer,
} from './types.js';

// ---- The measured constants -------------------------------------------------

/**
 * **The platoon advantage, measured rather than taken from a book.**
 *
 * Every wOBA event of the 2026 season is in the per-date Savant exports
 * `savant.ts` downloads and keeps forever, and each row carries the batter's
 * `stand` and the pitcher's `p_throws` — so the league's own same-hand and
 * opposite-hand wOBA is a sum over files already on disk. Over **140,889 plate
 * appearances across 143 days**:
 *
 * | | wOBA | PA |
 * | --- | --- | --- |
 * | same hand | **.3138** | 59,008 |
 * | opposite hands | **.3311** | 81,881 |
 * | league | .3238 | 140,889 |
 *
 * which is a **5.5%** advantage to the batter with the better of it, and the two
 * figures below as multipliers on the league. Broken out, batter-vs-hand:
 * `L vs LHP .3057`, `L vs RHP .3325`, `R vs LHP .3281`, `R vs RHP .3163`.
 *
 * **A league figure rather than the player's own**, and that is a real
 * limitation stated plainly: a genuine platoon monster loses more against a
 * same-handed pitcher than 3% and a reverse-split hitter loses nothing. Doing
 * better needs each player's own vs-L/vs-R split, which is one MLB request per
 * player (`getPlayerStats`) and so ~28 per team per matchup — the thing this
 * whole file is written to avoid. It is `FIP_CONSTANT`'s own bargain: a measured
 * league constant, named, with the method recorded beside it.
 *
 * A **switch hitter** always has the better of it, which is what switch hitting
 * is for, so he takes the opposite-hand figure whichever hand is on the mound.
 */
const PLATOON_SAME = 0.969;
const PLATOON_OPP = 1.022;

/**
 * Which research window stands for "lately".
 *
 * Thirty days rather than seven: seven is a handful of starts for a pitcher and
 * a bad week for a hitter, and a projection that swung on it would be reporting
 * noise as news. Thirty is the board's own middle window and about a month of
 * play, which is the span a manager means by "how has he been going".
 */
const RECENT_WINDOW = 30 as const;

/**
 * **How much the recent window is allowed to move a projection, and why it is
 * capped twice.**
 *
 * `RECENT_MAX` is the most weight it can ever have — 40%, so the season is
 * always the larger half. And that weight is **earned in proportion to how much
 * he actually played**: a hitter with a full month behind him reaches it, and one
 * who has had 20 plate appearances in it gets 20/`RECENT_FULL_PA` of it. Without
 * the second cap a man just off the IL would have his whole projection set by one
 * good series, which is exactly the noise the 30-day window was chosen to avoid.
 *
 * The two full-sample figures are what a month of ordinary use looks like: about
 * 100 plate appearances for a everyday hitter, and 90 outs — thirty innings — for
 * a starting pitcher on a five-man turn.
 */
const RECENT_MAX = 0.4;
const RECENT_FULL_PA = 100;
const RECENT_FULL_OUTS = 90;

/**
 * **How many of his club's games in a row a man has to miss before the stretch
 * reads as an absence rather than as bench time.**
 *
 * This is the whole of the difference between *hurt* and *rested*, and it is
 * measured rather than picked. Over the thirty days ending 2026-08-17, the
 * longest run of consecutive club games missed is **2** for the 144 batters who
 * were in 90% or more of them and **4** for the 84 who were in 75-90% — so at
 * six, a regular's day off, a catcher's weekly rest and a platoon bat's weekend
 * against two left-handers are all bench time, and nothing that fires on them
 * can fire on this.
 *
 * **A reliever's is twice that**, and the two are two numbers because the two
 * are two facts. A batter who misses six straight was not available; a reliever
 * who does may simply not have been needed — a mop-up man in a quiet week, a
 * closer in a run of blowouts — so the same rule applied to him is selection
 * bias with a threshold on it. Measured over 28,021 reliever cases, truncating
 * at six on its own **costs** accuracy: mean error 0.1486 against the plain
 * share's 0.1443, over-projecting his appearances by 6.2 points of share. With
 * the availability signal beside it the two thresholds are within two
 * ten-thousandths of each other on error (0.1070 against 0.1072) and twelve
 * halves what is left of the over-projection, +1.2 points against +2.0 — so
 * twelve, which is also about the length of the shortest stint that would have
 * put him on the list.
 */
const ABSENCE_GAMES: Record<PlayerKind, number> = { batter: 6, pitcher: 12 };

/**
 * **What a man who has just come back is projected on.**
 *
 * The stretch since his return is the evidence, and eight games of it is not
 * much: `RETURN_FULL` is how many club games earn that stretch its own rate in
 * full, on the same shape `recentWeight` already uses for the season/recent
 * blend. Under it the rest is filled in by the stretch **before** the absence —
 * his own rate in the same role, which is the honest prior for a man who has
 * just been activated and the reason a projection can answer for one who has
 * played no games at all since.
 *
 * Where there is no stretch before it either — a call-up, or a man traded in
 * this month — a thin sample is shrunk toward `RETURN_PRIOR` with the weight of
 * `RETURN_PRIOR_GAMES` club games, so one start off the plane reads as 0.78
 * rather than as a claim that he plays every day. The figure is the middle of
 * the measured distribution rather than an everyday share: it is what a man
 * nobody can say anything about plays, and moving it between 0.4 and 0.7 moves
 * the season's mean error by four ten-thousandths.
 */
const RETURN_FULL = 12;
const RETURN_PRIOR = 0.55;
const RETURN_PRIOR_GAMES = 3;

/** The fewest club games of appearance record worth reading. Under it — the
 *  opening week of a season, a club whose days the day exports have missed —
 *  the share falls back to the ratio off the boards. */
const MIN_LINEUP_DAYS = 10;

/**
 * How much of a batter's game the *announced starter* accounts for.
 *
 * A starter faces the top of the order three times and the bottom twice, and the
 * bullpen covers the rest — so about three of a hitter's four or five trips are
 * against the man whose quality we know, and the other one or two are against a
 * relief corps this file makes no claim about. Every batter-side adjustment is
 * therefore damped through this: a start against the league's best pitcher moves
 * his line by 60% of what facing him all afternoon would.
 */
const STARTER_SHARE = 0.6;

/**
 * **No single input may move a projection by more than this**, either way.
 *
 * Every multiplier here — the opposing starter's quality, the opposing lineup's,
 * the platoon — is clamped into `[1 - ADJ_CLAMP, 1 + ADJ_CLAMP]` before it is
 * used, and the product of them is clamped again. The reason is that each is a
 * ratio of two measured figures and a ratio has no upper bound: a pitcher with
 * six innings and a .190 xwOBA-against would otherwise halve a hitter's week on
 * the strength of one start. Twenty per cent is about the largest honest
 * matchup effect there is, and it keeps the projection's shape decided by *how
 * much a player plays* — which is the thing this can actually know — rather than
 * by whom he plays.
 */
const ADJ_CLAMP = 0.2;

/** A pitcher needs this many batters faced before his line is worth reading as
 *  a matchup adjustment; under it he takes no adjustment at all rather than a
 *  wild one. */
const MIN_BF_FOR_ADJUST = 100;

/** The league's own wOBA over the season measured above — the fallback baseline
 *  for a pitcher's xwOBA-against when the board cannot supply a mean. */
const LEAGUE_WOBA = 0.3238;

// ---- The wire ---------------------------------------------------------------

/** What one side is expected to finish the matchup period on. */
export interface EspnProjectedSide {
  teamId: number;
  /** Projected final total in each category, keyed by stat id — the current
   *  figure plus the rest of the week, with every rate rebuilt from its own
   *  projected components. A category the side is ineligible for is absent, as
   *  it is on the live scoreboard. */
  scores: Record<number, number>;
  /** Categories this side is projected to win, lose and tie. `tallyCategories`'
   *  own arithmetic — the same function the live scoreboard's tally uses, which
   *  was checked against ESPN's on 1,080 comparisons. */
  wins: number;
  losses: number;
  ties: number;
  /** What the projection is made of, for the reader: how many player-games of
   *  batting and how many starts it found, and how many men it could not place
   *  (no MLB id, or no line on the board). */
  hitterGames: number;
  starts: number;
  reliefGames: number;
  skipped: number;
}

export interface EspnProjectedMatchup {
  id: number;
  home: EspnProjectedSide;
  /** Null is a bye, which is a real shape — and one there is nothing to project
   *  a *result* for, though the side's own total is projected all the same. */
  away: EspnProjectedSide | null;
  /** Who the projection has winning. Never null, unlike the live scoreboard's:
   *  this is a claim about the end of the week, and the whole point of it is to
   *  make one. */
  winner: 'home' | 'away' | 'tie';
}

export interface EspnProjection {
  matchupPeriod: number;
  /** True where there was something to project. A settled period is `false`
   *  with a `note` saying so, rather than an error: nothing is wrong, the week
   *  is simply over. */
  ok: boolean;
  /** Why not, where not — shown on screen rather than swallowed. */
  note: string | null;
  /** The period's own last ET day, and how many days of it are still to be
   *  played (today included where its games have not started). */
  end: string | null;
  daysLeft: number;
  matchups: EspnProjectedMatchup[];
  fetchedAt: number;
}

// ---- Small helpers ----------------------------------------------------------

const clampAdj = (m: number): number =>
  !Number.isFinite(m) ? 1 : Math.min(1 + ADJ_CLAMP, Math.max(1 - ADJ_CLAMP, m));

/** A ratio's inverse around 1 — what a pitching-quality multiplier does to a
 *  batter's strikeouts, which move the other way from everything else on his
 *  line. Clamped like the figure it mirrors. */
const inverse = (m: number): number => clampAdj(2 - m);

const num = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** A string figure off a `TeamHittingLine` (`".759"`), or null. */
const dec = (v: string | null | undefined): number | null => {
  if (typeof v !== 'string' || v === '' || v === '-') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * **The season/recent blend**, for one rate.
 *
 * `w` is the weight the recent figure has earned (see `RECENT_MAX`), so this is
 * the whole of the "how he has been going lately, as well as over the season"
 * half of the projection. A missing recent figure falls back to the season one
 * rather than to zero, which is what a player who has not appeared in the last
 * month needs: his season line is all there is, and it is not evidence that he
 * has stopped hitting.
 */
const blend = (season: number, recent: number | null, w: number): number =>
  recent === null || !Number.isFinite(recent) ? season : season * (1 - w) + recent * w;

/** How much weight a recent sample has earned, from how much of it there is. */
const recentWeight = (units: number, full: number): number =>
  Math.max(0, Math.min(1, units / full)) * RECENT_MAX;

// ---- The per-player projections --------------------------------------------

/** The component ids this file produces, so a reader of the code can see the
 *  vocabulary in one place. They are ESPN's own — see `STAT_META`. */
const BAT = { ab: 0, h: 1, d2: 3, d3: 4, hr: 5, bb: 10, hbp: 12, sf: 13, pa: 16, r: 20, rbi: 21, sb: 23, cs: 24, k: 31 };
const PIT = { gp: 32, gs: 33, outs: 34, tbf: 35, h: 37, bb: 39, hbp: 42, r: 44, er: 45, hr: 46, k: 48, w: 53, l: 54, sv: 57, hd: 60, svhd: 83 };

type Bucket = Record<number, number>;

const add = (into: Bucket, id: number, v: number): void => {
  if (!Number.isFinite(v) || v === 0) return;
  into[id] = (into[id] ?? 0) + v;
};

/**
 * **One batter's expected line over his remaining games.**
 *
 * `mults` is one multiplier per remaining game — the opposing starter's quality
 * and the platoon, already damped and clamped — so a hitter with a soft
 * three-game set and a brutal two-game one is projected on both rather than on
 * their average.
 *
 * `playShare` is **how often he is actually in his club's game** — a catcher
 * plays five of six and a platoon bat four — so a projection cannot credit him
 * with a week he was never going to get all of. See `playShareOf`.
 *
 * The arithmetic holds **plate appearances per game fixed** and scales the rates
 * inside them, which is the right way round: how often he comes up is a fact
 * about his lineup slot and how well he does when he gets there is what the
 * matchup decides. `AB` is then derived rather than projected
 * (`PA − BB − (HBP + SF + SH)`), so a matchup that walks him more takes at-bats
 * away exactly as it does in a real game.
 *
 * **`HBP` is backed out of his own OBP** rather than projected from a league
 * rate, which is what makes the projected OBP *be* his blended OBP by
 * construction: with `hbp = obp × PA − H − BB` and the denominator equal to
 * `PA`, the `DERIVED` table's own OBP recomputes to the figure it came from.
 * The residue (`HBP + SF + SH`) is his season share of PA and the split between
 * its members is where the one loose approximation in this function lives — it
 * moves a projected OBP by about a thousandth.
 */
function projectBatter(
  row: ResearchRow,
  recent: ResearchRow | null,
  mults: number[],
  playShare: number,
  into: Bucket,
): void {
  const pa = num(row.pa);
  const games = num(row.games);
  if (pa <= 0 || games <= 0 || mults.length === 0 || playShare <= 0) return;

  const w = recentWeight(num(recent?.pa), RECENT_FULL_PA);
  const per = (s: number | null, r: number | null | undefined): number =>
    blend(num(s) / pa, recent && num(recent.pa) > 0 ? num(r) / num(recent.pa) : null, w);

  const paPerGame = blend(pa / games, recent && num(recent.games) > 0 ? num(recent.pa) / num(recent.games) : null, w);
  const hRate = per(row.hits, recent?.hits);
  const d2Rate = per(row.doubles, recent?.doubles);
  const d3Rate = per(row.triples, recent?.triples);
  const hrRate = per(row.hr, recent?.hr);
  const bbRate = per(row.walks, recent?.walks);
  const rRate = per(row.runs, recent?.runs);
  const rbiRate = per(row.rbi, recent?.rbi);
  const sbRate = per(row.sb, recent?.sb);
  const csRate = per(row.cs, recent?.cs);
  const kRate = per(row.strikeouts, recent?.strikeouts);
  const abRate = per(row.ab, recent?.ab);
  const obp = blend(num(row.obp), recent && num(recent.pa) > 0 ? recent.obp : null, w);
  // Everything that is neither an at-bat nor a walk: hit by pitch, sacrifice
  // flies, sacrifice hits. His own season share of it, which is what keeps a
  // bunter's at-bats from being over-counted.
  const otherRate = Math.max(0, 1 - abRate - bbRate);

  for (const m of mults) {
    const km = inverse(m);
    // **His club's game scaled by how often he is in it.** `paPerGame` is per
    // game *he played*, so a projection that assumed he played every one of his
    // club's remaining games would over-count a catcher's week by the day he
    // sits and a platoon bat's by half of it — see `playShareOf`.
    const g = paPerGame * playShare;
    const h = hRate * g * m;
    const bb = bbRate * g * m;
    const other = otherRate * g;
    const ab = Math.max(0, g - bb - other);
    // Pinned to his own OBP, so the rate the card shows is the rate he has.
    const onBase = obp * m * g;
    const hbp = Math.min(other, Math.max(0, onBase - h - bb));
    add(into, BAT.pa, g);
    add(into, BAT.ab, ab);
    add(into, BAT.h, h);
    add(into, BAT.d2, d2Rate * g * m);
    add(into, BAT.d3, d3Rate * g * m);
    add(into, BAT.hr, hrRate * g * m);
    add(into, BAT.bb, bb);
    add(into, BAT.hbp, hbp);
    add(into, BAT.sf, other - hbp);
    add(into, BAT.r, rRate * g * m);
    add(into, BAT.rbi, rbiRate * g * m);
    add(into, BAT.sb, sbRate * g);
    add(into, BAT.cs, csRate * g);
    add(into, BAT.k, kRate * g * km);
  }
}

/**
 * **One pitcher's expected line over his remaining appearances.**
 *
 * A **starter** is projected per *start* — `mults` is one multiplier per start
 * his rotation slot or his club's own announcement puts him in — and a
 * **reliever** per *club game*, each worth `appearanceShare` of an outing,
 * which is how often he has actually been used. Both are per **out**
 * underneath, because outs are what a pitcher's rates are over and what ERA and
 * WHIP divide by.
 *
 * **Outs themselves take no matchup adjustment**, which is a deliberate
 * omission: a tough lineup shortens an outing and a soft one lengthens it, and
 * putting that in would move the *denominator* of every rate as well as its
 * numerator, so a projection would get worse in a way that is hard to see. He
 * pitches as long as he has been pitching.
 *
 * **Wins move the other way from runs**, so they take the inverse multiplier: a
 * start against a weak lineup is a start he is more likely to win.
 */
function projectPitcher(
  row: ResearchRow,
  recent: ResearchRow | null,
  mults: number[],
  starterView: boolean,
  into: Bucket,
  /**
   * **He is the one starting the game**, which is a fact about the outing
   * rather than about the player and settles three of the four decision
   * categories by rule rather than by his record.
   *
   * - **A save and a hold are relief statistics.** Neither can be earned by the
   *   pitcher who starts the game, at all, ever — so both are zero here whoever
   *   he is. For a genuine starter his record's figures are near zero anyway
   *   and this changes nothing; for the swingman it is the difference between a
   *   real projection and one crediting him with the holds he gets on his
   *   *other* days.
   * - **A starter must complete five innings to be credited with the win**, so
   *   an **opener** — a reliever's workload, on the day he happens to start —
   *   cannot qualify for one, and the wins on his record were earned in relief
   *   where no such rule applies. Zeroed only in that case (`!starterView`),
   *   because a genuine starter's win rate is `wins / starts` off his own
   *   record and already carries how often he goes the five: docking him again
   *   would be charging him twice for the same fact.
   *
   * This is why an opener is worth so much less than either a starter or a
   * reliever, and the seat ordering sees it through the value it computes off
   * this projection rather than through a rule of its own.
   */
  startsGame = false,
  /**
   * **How much of an appearance each entry in `mults` is worth**, and it is
   * `projectBatter`'s `playShare` arriving on the pitching side.
   *
   * A starter passes the default 1: `mults` is one entry per *turn*, and a turn
   * is a whole outing. A **reliever** passes his appearance rate, `mults` being
   * one entry per club game — because he is not in a whole game, he is in about
   * two fifths of one, and which two fifths nobody knows. So every remaining
   * game contributes its own share, which is the arithmetic a batter's line has
   * always been built on and the one `pitcherCandidate` one screen down has
   * always used for the same man (`day.set(g.date, rate)`).
   *
   * The alternative — rounding the span to a whole number of appearances and
   * projecting those — is what this replaced, and it is wrong in three ways
   * measured on the live board: it **rounds a short span to nothing** (on
   * 2026-08-21 alone, 5 of the 12 busiest relievers in baseball projected `0`
   * chances and a null line, drawn as a row of dashes beside a batter who got
   * a fractional one on the same day), it **throws the fraction away on every
   * span** (Sam Moll over three days: 3 games × 0.44 = 1.32 appearances, filed
   * as 1), and it took the **first** N games of the span rather than a share of
   * each, so a reliever's opponent-quality multipliers came off the front of
   * the week and none of the back of it.
   */
  appearanceShare = 1,
): void {
  const outs = num(row.outs);
  const games = num(row.games);
  const gs = num(row.gamesStarted);
  const denom = starterView ? gs : games;
  if (outs <= 0 || denom <= 0 || mults.length === 0 || appearanceShare <= 0) return;

  const w = recentWeight(num(recent?.outs), RECENT_FULL_OUTS);
  const per = (s: number | null | undefined, r: number | null | undefined): number =>
    blend(num(s) / outs, recent && num(recent.outs) > 0 ? num(r) / num(recent.outs) : null, w);

  const recentDenom = starterView ? num(recent?.gamesStarted) : num(recent?.games);
  const outsPer = blend(
    outs / denom,
    recent && recentDenom > 0 ? num(recent.outs) / recentDenom : null,
    w,
  );
  const hRate = per(row.hits, recent?.hits);
  const bbRate = per(row.walks, recent?.walks);
  const kRate = per(row.strikeouts, recent?.strikeouts);
  const hrRate = per(row.hr, recent?.hr);
  const erRate = per(row.earnedRuns, recent?.earnedRuns);
  const rRate = per(row.runs, recent?.runs);
  const hbpRate = per(row.hitBatsmen, recent?.hitBatsmen);
  const tbfRate = per(row.battersFaced, recent?.battersFaced);
  // Per appearance rather than per out — a decision and a save are things that
  // happen to an outing, not to an inning.
  // A loss is the one decision an opener can still take, so it keeps his rate.
  const wPer = startsGame && !starterView ? 0 : num(row.wins) / denom;
  const lPer = num(row.losses) / denom;
  const svPer = startsGame ? 0 : num(row.saves) / denom;
  const hdPer = startsGame ? 0 : num(row.holds) / denom;

  for (const m of mults) {
    const km = inverse(m);
    // **His outing scaled by how often he is in one**, which is `projectBatter`'s
    // `paPerGame * playShare` on this side of the ball: every rate below is per
    // out, so scaling the outs scales the whole line and nothing else has to
    // know. The four per-*appearance* figures below it are not per out and take
    // the share explicitly.
    const o = outsPer * appearanceShare;
    add(into, PIT.gp, appearanceShare);
    if (starterView) add(into, PIT.gs, appearanceShare);
    add(into, PIT.outs, o);
    add(into, PIT.tbf, tbfRate * o * m);
    add(into, PIT.h, hRate * o * m);
    add(into, PIT.bb, bbRate * o * m);
    add(into, PIT.hbp, hbpRate * o * m);
    add(into, PIT.hr, hrRate * o * m);
    add(into, PIT.er, erRate * o * m);
    add(into, PIT.r, rRate * o * m);
    add(into, PIT.k, kRate * o * km);
    add(into, PIT.w, wPer * km * appearanceShare);
    add(into, PIT.l, lPer * m * appearanceShare);
    add(into, PIT.sv, svPer * km * appearanceShare);
    add(into, PIT.hd, hdPer * km * appearanceShare);
    add(into, PIT.svhd, (svPer + hdPer) * km * appearanceShare);
  }
}

// ---- The engine ------------------------------------------------------------

interface Pools {
  batSeason: Map<number, ResearchRow>;
  batRecent: Map<number, ResearchRow>;
  pitSeason: Map<number, ResearchRow>;
  pitRecent: Map<number, ResearchRow>;
  /** Batter's hand and pitcher's, by MLB id — off the season roster list. */
  bats: Map<number, string>;
  throws: Map<number, string>;
  /** How each club has hit over the last 30 days, and its games played. */
  hitting: Map<number, TeamHittingSplit>;
  seasonHitting: Map<number, TeamHittingSplit>;
  leagueTeamOps: number;
  leaguePitcherWoba: number;
}

const byId = (rows: ResearchRow[]): Map<number, ResearchRow> =>
  new Map(rows.map((r) => [r.id, r]));

/**
 * **Is this game still ahead of the clock?** — the test `remainingGames` asks of
 * today, and it asks it of **two** things because one of them goes stale.
 *
 * `state` is the honest answer and the one that was here alone: `live` or
 * `final` means the game is spoken for. But it rides on the league-wide
 * schedule window, which is cached for **thirty minutes** (`schedule.ts`'s
 * `WINDOW_TTL`, set by how often *probables* move, which is the slowest thing
 * in that blob) — so for up to half an hour after a first pitch the window
 * still says `scheduled`, and a projection built on it goes on projecting a
 * game whose runs are already coming in on the report beside it. That is
 * exactly the double count this function exists to prevent, arriving through
 * the cache rather than through the rule.
 *
 * **The first pitch cannot go stale**, so it is read too: a `scheduled` game
 * whose `startTime` is behind the clock is a game under way that this process
 * has not been told about yet. The two together make "has it started" a
 * question about *now* rather than about when the window was fetched, which is
 * what lets the reader watch a projection come down through an evening.
 *
 * It fails toward *not* projecting: a delayed game reads as started and is left
 * out, which understates by one game where the alternative overstates by one
 * that is already on the report — and understating is the direction the whole
 * of this file errs in. No `startTime` at all (the schedule gives none) leaves
 * `state` to answer alone, which is where this began.
 */
function yetToStart(g: ScheduleGame, now: number): boolean {
  if (g.state !== 'scheduled') return false;
  if (!g.startTime) return true;
  const first = Date.parse(g.startTime);
  return Number.isNaN(first) || first > now;
}

/**
 * A club's remaining games in the period.
 *
 * **Today counts only where its game has not started**, which is the one rule
 * that keeps this from double-counting: the live scoreboard's own figure already
 * holds today's production (`withAddedComponents` adds it), so a game that is
 * `live` or `final` is spoken for — and so is one whose first pitch has passed
 * while the cached window still calls it `scheduled`, which is `yetToStart`'s
 * whole subject. A **postponement is not a game he gets**, which is
 * `schedule.ts`'s own rule and the one error that would make a game count lie.
 */
function remainingGames(
  games: ScheduleGame[],
  today: string,
  end: string,
  now = Date.now(),
): Map<number, ScheduleGame[]> {
  const out = new Map<number, ScheduleGame[]>();
  for (const g of games) {
    if (g.date < today || g.date > end) continue;
    if (g.state === 'postponed') continue;
    if (g.date === today && !yetToStart(g, now)) continue;
    for (const id of [g.homeId, g.awayId]) {
      const list = out.get(id);
      if (list) list.push(g);
      else out.set(id, [g]);
    }
  }
  return out;
}

/**
 * Who is projected to start each remaining game, by `gamePk` and side.
 *
 * The **announced** probable where there is one, and the rotation map's own
 * projection past the three days clubs name them for — which is the same pair the
 * Schedule view's grid draws, read the other way round: it asks "which of this
 * pitcher's turns fall here" and this asks "who has this game".
 */
function startersByGame(
  games: ScheduleGame[],
  rotations: Record<string, RotationProjection>,
): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  const put = (pk: number, id: number): void => {
    const s = out.get(pk);
    if (s) s.add(id);
    else out.set(pk, new Set([id]));
  };
  for (const g of games) {
    if (g.homeProbableId) put(g.gamePk, g.homeProbableId);
    if (g.awayProbableId) put(g.gamePk, g.awayProbableId);
  }
  for (const [id, rot] of Object.entries(rotations)) {
    const pid = Number(id);
    if (!Number.isFinite(pid)) continue;
    for (const pk of rot.starts) put(pk, pid);
  }
  return out;
}

/**
 * **How much a batter's line moves in one game** — the opposing starter's
 * quality and the platoon, damped through `STARTER_SHARE` and clamped.
 *
 * The quality figure is the starter's **xwOBA allowed** against the league mean,
 * because that is the one number on the pitching board that is a direct
 * statement about what a hitter is likely to do against him; `avgAgainst` stands
 * in where Savant has no row for him, scaled to the same league mean so the two
 * are the same kind of ratio. A pitcher with under `MIN_BF_FOR_ADJUST` batters
 * faced takes **no** quality adjustment rather than a wild one, and an unnamed
 * starter takes none at all.
 */
function batterGameMult(pools: Pools, batterId: number, oppStarterId: number | null): number {
  const bats = pools.bats.get(batterId) ?? 'R';
  let quality = 1;
  let platoon = 1;
  if (oppStarterId !== null) {
    const p = pools.pitSeason.get(oppStarterId);
    if (p && num(p.battersFaced) >= MIN_BF_FOR_ADJUST) {
      const x = p.xwoba ?? null;
      if (typeof x === 'number' && x > 0) quality = x / pools.leaguePitcherWoba;
      else if (typeof p.avgAgainst === 'number' && p.avgAgainst > 0) {
        // A batting average against is on a different scale from a wOBA, so it
        // is compared to *its* own league figure rather than to the wOBA's —
        // .245 being about what the league hits.
        quality = p.avgAgainst / 0.245;
      }
    }
    const thr = pools.throws.get(oppStarterId);
    if (thr === 'L' || thr === 'R') {
      platoon = bats === 'S' || bats !== thr ? PLATOON_OPP : PLATOON_SAME;
    }
  }
  // Damped to the share of his game the named starter actually accounts for,
  // then clamped — so no one matchup can decide his week.
  const full = clampAdj(quality) * clampAdj(platoon);
  return clampAdj(1 + STARTER_SHARE * (full - 1));
}

/**
 * **How much a pitcher's line moves in one appearance** — the opposing lineup's
 * strength against his own hand.
 *
 * `teamHitting.ts`'s 30-day board rather than the season's, so a club that has
 * gone cold counts as cold; `vsLeft`/`vsRight` by the hand he throws with, which
 * is what makes this a *matchup* rather than a club average, falling back to the
 * `all` cut where nobody has started that hand against them lately. Compared to
 * the mean team OPS on the same board, so the ratio is against the same
 * population it came from.
 */
function pitcherGameMult(pools: Pools, pitcherId: number, oppTeamId: number | null): number {
  if (oppTeamId === null) return 1;
  const split = pools.hitting.get(oppTeamId) ?? pools.seasonHitting.get(oppTeamId);
  if (!split) return 1;
  const thr = pools.throws.get(pitcherId);
  const line = (thr === 'L' ? split.vsLeft : thr === 'R' ? split.vsRight : null) ?? split.all;
  const ops = dec(line?.ops);
  if (ops === null || pools.leagueTeamOps <= 0) return 1;
  return clampAdj(ops / pools.leagueTeamOps);
}

/** The mean of a board's own `all` OPS, so a ratio against it is a ratio within
 *  the population it came from rather than against a constant that drifts. */
function meanTeamOps(board: Map<number, TeamHittingSplit>): number {
  let sum = 0;
  let n = 0;
  for (const split of board.values()) {
    const ops = dec(split.all?.ops);
    if (ops !== null) {
      sum += ops;
      n += 1;
    }
  }
  return n > 0 ? sum / n : 0.72;
}

/** The mean xwOBA allowed over the pitchers with enough work to be measured —
 *  the baseline a starter's own figure is a ratio of. Falls back to the league
 *  wOBA measured off the day exports, the two being the same quantity. */
function meanPitcherWoba(rows: ResearchRow[]): number {
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    if (num(r.battersFaced) < MIN_BF_FOR_ADJUST) continue;
    if (typeof r.xwoba === 'number' && r.xwoba > 0) {
      sum += r.xwoba;
      n += 1;
    }
  }
  return n >= 20 ? sum / n : LEAGUE_WOBA;
}

/**
 * **Who was in his club's lineup, day by day**, and who is off the roster now.
 *
 * The play share used to be a ratio off the boards — his games in the last
 * thirty days over his club's — and a ratio cannot tell *hurt* from *rested*,
 * which is the whole of what it is being asked. A man who missed three weeks
 * and has started every game since he was activated read 0.21 and was projected
 * for a fifth of the week he is going to play all of; a man placed on the IL
 * yesterday read 0.89 and was projected for a week he will play none of. This is
 * the record that answers both.
 *
 * **It costs no upstream, which is the reason it can be read at all.** The
 * per-day appearance map is `statcastWindow.ts`'s own `dayCounts`, and
 * `buildContext` has already awaited `getResearch(kind, 30)`, whose window is
 * assembled from exactly those thirty days — so on any server that has built the
 * board they are in memory, and on one that read the board off its blob they are
 * thirty 25KB blobs beside it. The club's own games come off `getSeasonRead`,
 * which is the same cache entry `getScheduleWindow` is served from. And the
 * roster statuses are the thirty 40-man rosters `/api/statuses`, every roster
 * badge and `schedule.ts`'s own rotation projections already share, on their own
 * thirty-minute cache.
 */
interface LineupRecord {
  /** club id → the days it played inside the window, oldest first and **one
   *  entry per day**: the appearance record is per date, so a doubleheader is
   *  one entry rather than two. It costs the share a little precision on the
   *  handful of days a club plays twice and it is the only unit the day export
   *  can answer in. */
  days: Map<number, string[]>;
  /** day → who saw a pitch that day, per kind. A batter with no plate
   *  appearance — a pinch runner, a defensive replacement — is not in it, which
   *  is the right answer for a projection: no trip to the plate, no production
   *  to project. */
  seen: Record<PlayerKind, Map<string, Set<number>>>;
  /** Who is off the active roster **now** — the IL, the minors, a suspension, a
   *  DFA. Empty where the roster read failed, which leaves every share exactly
   *  as it would have been without it. */
  offRoster: Set<number>;
}

/** Assemble it. A day that cannot be read is **skipped, not fatal** — the rule
 *  `windowStatcast` already follows for the same files — and a day with no
 *  export at all is skipped rather than counted, since an empty day would
 *  otherwise read as every man in the league sitting out. */
async function buildLineupRecord(runs: Map<number, { date: string }[]>): Promise<LineupRecord> {
  const seen: Record<PlayerKind, Map<string, Set<number>>> = {
    batter: new Map(),
    pitcher: new Map(),
  };
  const read = new Set<string>();
  const perDay = await mapLimit(windowDates(RECENT_WINDOW), 4, async (date) => {
    try {
      return [date, await dayCounts(date)] as const;
    } catch (err) {
      console.error(`projection: ${date} appearances unavailable:`, err);
      return null;
    }
  });
  for (const entry of perDay) {
    if (!entry) continue;
    const [date, counts] = entry;
    const batters = new Set(Object.keys(counts.batter).map(Number));
    const pitchers = new Set(Object.keys(counts.pitcher).map(Number));
    if (batters.size === 0 && pitchers.size === 0) continue;
    seen.batter.set(date, batters);
    seen.pitcher.set(date, pitchers);
    read.add(date);
  }

  const days = new Map<number, string[]>();
  for (const [club, run] of runs) {
    const out: string[] = [];
    for (const g of run) {
      if (!read.has(g.date)) continue;
      if (out[out.length - 1] !== g.date) out.push(g.date);
    }
    if (out.length > 0) days.set(club, out);
  }

  const offRoster = new Set<number>();
  try {
    for (const [id, m] of await getAllRosterMembers()) {
      if (m.status.code !== 'A') offRoster.add(id);
    }
  } catch (err) {
    console.error('projection: roster status unavailable:', err);
  }
  return { days, seen, offRoster };
}

/** His club's days inside the window, each flagged with whether he was in it —
 *  or null where there is no record worth reading, which is a club the day
 *  exports could not answer for and a man who has not appeared in a month. */
function lineupFlags(
  rec: LineupRecord,
  kind: PlayerKind,
  id: number,
  teamId: number,
): boolean[] | null {
  const days = rec.days.get(teamId);
  if (!days || days.length < MIN_LINEUP_DAYS) return null;
  const seen = rec.seen[kind];
  const flags = days.map((d) => seen.get(d)?.has(id) === true);
  return flags.some(Boolean) ? flags : null;
}

/**
 * **How often he plays when he is there**, read off that record.
 *
 * One sentence: *his appearance rate over his club's games since his last
 * absence ended*. An absence is `ABSENCE_GAMES` or more of his club's games in a
 * row that he was not in, which is longer than any rest a regular takes and is
 * measured to be so; the games before one belong to a month he was not part of,
 * and holding them against him is the whole of what was being complained about.
 *
 * Three properties are worth stating because each is a case that used to be
 * wrong:
 *
 * - **A healthy player is untouched.** No run of that length means no
 *   truncation, so this returns his plain rate over the window, the factor it is
 *   read as comes out at 1, and a catcher's five-of-six and a platoon bat's
 *   four-of-seven are exactly the ratio they always were — measured through the
 *   engine on the live board, 437 of 708 batters come out identical to the
 *   digit.
 * - **An absence that has not ended truncates nothing.** A man who is out is
 *   answered by the roster status above; one who is on the roster and has not
 *   played is a bench player, and his whole window is the evidence for that.
 *   Without this the rule would read a deep reserve's fortnight off as an
 *   injury and project him on the one week he happened to get in.
 * - **A man traded in this month falls out for free.** His appearances are under
 *   his old club's days and his new club's run has none of them, which reads as
 *   an absence that ended when he arrived — so he is projected on his time here,
 *   which is `clubFor`'s own answer to the same question one file over.
 */
function shareOfFlags(flags: boolean[], kind: PlayerKind): number {
  const n = flags.length;
  const absence = ABSENCE_GAMES[kind];
  const plain = flags.filter(Boolean).length / n;

  let trailing = 0;
  for (let i = n - 1; i >= 0 && !flags[i]; i--) trailing += 1;
  if (trailing >= absence) return plain;

  // The last absence that ended, walking forward: `end` is the last game of it.
  let end = -1;
  let run = 0;
  for (let i = 0; i < n; i++) {
    if (!flags[i]) {
      run += 1;
      continue;
    }
    if (run >= absence) end = i - 1;
    run = 0;
  }
  if (end < 0) return plain;

  let start = end;
  while (start >= 0 && !flags[start]) start -= 1;
  const since = flags.slice(end + 1);
  const before = flags.slice(0, start + 1);
  const sinceShare = since.filter(Boolean).length / since.length;
  if (before.length > 0) {
    // His own rate in the same role before it, which is what a thin stretch
    // since is filled in with — `blend`'s own shape, and the reason a man
    // activated this morning has an answer at all.
    return blend(
      before.filter(Boolean).length / before.length,
      sinceShare,
      Math.min(1, since.length / RETURN_FULL),
    );
  }
  return (
    (since.filter(Boolean).length + RETURN_PRIOR_GAMES * RETURN_PRIOR) /
    (since.length + RETURN_PRIOR_GAMES)
  );
}

/**
 * **How often a player is actually in his club's game**, as a share of it.
 *
 * Three answers in order, and the order is the point:
 *
 * 1. **He is off the active roster, so he plays none of them.** The IL, the
 *    minors, a suspension — the feed's own Upcoming rule (*"someone off the
 *    active roster is in none of them"*) and `projectStarts`' `projectable`,
 *    which is what a rotation slot is already gated on. It is the sharpest of
 *    the three and it was missing entirely: measured on the live board, 87
 *    batters are off the roster today and **26 of them read a share over 0.40**,
 *    Dansby Swanson at 0.89 and Vladimir Guerrero Jr. at 0.79 — a full week
 *    projected for men who will play no part of it.
 * 2. **The ratio off the boards, corrected by the lineup record.** The ratio is
 *    what this function was: his games over his club's, recent where the recent
 *    window has any and the season where it does not. The record then says how
 *    much of it is an absence, as the factor `shareOfFlags / plain` — his rate
 *    since he was last available over his rate across the whole window — and 1
 *    is the fallback for a club the day exports could not answer for and for a
 *    man who has not appeared in a month.
 *
 *    **A factor rather than a share, and the units are why.** The day export
 *    sees a man who came to the plate; the board's `games` counts an appearance
 *    of any kind, a pinch-runner's and a defensive replacement's included — and
 *    `projectBatter` divides his plate appearances by *that* count to get his
 *    per-game rate. Read as a share outright the record would answer in the
 *    wrong unit and quietly dock a utility man for every game he was run for:
 *    measured, Nick Allen is in 84% of his club's games and at the plate on 44%
 *    of its days, with no absence anywhere in the record. So the record is read
 *    for its **shape** — where the gaps are — and the board keeps the level.
 *
 * **Measured against what actually happened, over the whole season.** Every
 * player and every day of it, asking each rule for his share and comparing it
 * with the share of his club's next six games he really did play — 40,013
 * batter cases and 28,021 reliever ones. The mean absolute error goes
 * **0.2087 → 0.1245** for batters and **0.1443 → 0.1070** for relievers, a
 * 40% and a 26% reduction; on the 5,485 batter cases where he was genuinely
 * unavailable, the old rule was off by **0.371** and this one by nothing. What
 * it costs is a little calibration — the projection now runs **+1.8 points of
 * share high** on a mean of 0.654 where the old rule ran +0.6 — which is inside
 * the 3.1% the whole projection is already measured to sit at, and is the price
 * of being right about two populations rather than wrong about both in
 * directions that cancelled.
 *
 * **The back-test measures the rule in appearance space** — it asks each rule
 * for the share of his club's next six days he will be at the plate in, which is
 * what the record can be scored against. What is shipped applies that rule's
 * answer as a *factor* on the board's own ratio, for the units reason above; the
 * two are the same number for every player whose board games and plate-appearing
 * days agree, which is everyone who starts.
 */
function playShareOf(
  ctx: ProjectionContext,
  kind: PlayerKind,
  id: number,
  teamId: number,
  season: ResearchRow | null,
  recent: ResearchRow | null,
): number {
  if (ctx.lineup.offRoster.has(id)) return 0;
  const board = boardShare(
    season,
    recent,
    ctx.clubGames.get(teamId) ?? 0,
    ctx.clubGamesRecent.get(teamId) ?? 0,
  );
  const flags = lineupFlags(ctx.lineup, kind, id, teamId);
  if (flags === null) return board;
  const plain = flags.filter(Boolean).length / flags.length;
  if (plain <= 0) return board;
  return Math.min(1, board * (shareOfFlags(flags, kind) / plain));
}

/** The ratio the play share was, and is the fallback under. */
function boardShare(
  season: ResearchRow | null,
  recent: ResearchRow | null,
  clubGamesSeason: number,
  clubGamesRecent: number,
): number {
  if (recent && clubGamesRecent > 0 && num(recent.games) > 0) {
    return Math.min(1, num(recent.games) / clubGamesRecent);
  }
  if (season && clubGamesSeason > 0 && num(season.games) > 0) {
    return Math.min(1, num(season.games) / clubGamesSeason);
  }
  return 1;
}

/**
 * **Everything the per-player projections read, assembled once.**
 *
 * The engine below is written against this rather than against a matchup,
 * because it has two callers now and they know different things: a matchup
 * knows two ESPN rosters and a week, and the roster page knows a saved list and
 * whatever range the reader has picked. What they share is *the rest of the
 * schedule and how everybody has been going*, which is this — four cached
 * boards, the league-wide schedule window and the two team-hitting cuts, none of
 * which is a new upstream and three of which the warmer pulls nightly.
 */
export interface ProjectionContext {
  pools: Pools;
  remaining: Map<number, ScheduleGame[]>;
  starters: Map<number, Set<number>>;
  /**
   * **Everybody holding a rotation slot**, turn inside this window or not.
   *
   * `starters` above answers *who has this game*, which goes quiet for a man
   * whose next turn falls the day after the span ends — and a six-man rotation
   * over a five-day week has several of those. This is the other question, and
   * it is what stops such a pitcher being read as a reliever and projected for
   * relief he is never going to make. It is `buildRotations`' own key set, so
   * it is already gated on MLB's active roster.
   */
  rotationIds: Set<number>;
  clubGames: Map<number, number>;
  clubGamesRecent: Map<number, number>;
  /** Who was in his club's lineup day by day, and who is off the roster now —
   *  what the play share is read off. See `LineupRecord`. */
  lineup: LineupRecord;
  /** The span it was built for, and how many days of it still have a game to be
   *  played — today included only where its games have not started, which is
   *  `remainingGames`' own rule and the one that keeps a total from being
   *  counted twice. */
  from: string;
  to: string;
  daysLeft: number;
}

/**
 * **How few recent appearances is too few to read a role off.** Three: a
 * starter makes one turn a week, so three is about a fortnight of him and two
 * would let a single spot start outvote a month in the bullpen. Below it the
 * window says nothing and the rules underneath answer instead.
 */
const ROLE_MIN_GAMES = 3;

/**
 * **Which job a pitcher is doing *now*** — which is a different question from
 * the one `isRotationStarter` answers, and the difference is the whole reason
 * this exists.
 *
 * That helper is the app's one definition of who *works out of a rotation*, and
 * it reads a whole season: a majority of his appearances are starts. It is right
 * for labelling a player, and it is wrong for projecting one, because the men it
 * is most wrong about are exactly the ones a manager is making decisions over —
 * the starter moved to the bullpen in July, whose season still says starter; the
 * long man given a rotation spot a fortnight ago, whose season still says
 * reliever; and the swingman ESPN lists as **both SP and RP**, who has a real
 * role this week and two eligibilities that cannot say which.
 *
 * **Eligibility is not role, and this is the file that has to keep them apart.**
 * `eligibleSlots` says which chairs he may sit in — a swingman may sit in either
 * — and says nothing whatever about what he is going to do. This decides what he
 * is going to do; the chair is the assignment's business.
 *
 * Four rules, in order, and the first two are facts about now rather than
 * inferences:
 *
 * 1. **He has a turn in this window** — announced or projected, off the same
 *    rotation map the Schedule view's grid draws. A man starting on Thursday is
 *    a starter, whatever his season line says.
 * 2. **He holds a rotation slot** whose turn happens to fall outside the window.
 *    Without this a six-man rotation over a five-day week reads half its members
 *    as relievers and projects them for relief appearances nobody is going to
 *    ask them for.
 * 3. **The last thirty days**, where there are `ROLE_MIN_GAMES` of them to read
 *    — the same window and the same reasoning as `RECENT_WINDOW` everywhere
 *    else here: what he has been doing lately is what he is doing.
 * 4. **The season**, which is `isRotationStarter`'s own test and this file's
 *    behavior for its whole life before now.
 */
function currentRole(
  ctx: ProjectionContext,
  id: number,
  season: ResearchRow | null,
  recent: ResearchRow | null,
  teamId: number,
): 'starter' | 'reliever' {
  for (const g of ctx.remaining.get(teamId) ?? []) {
    if (ctx.starters.get(g.gamePk)?.has(id) === true) return 'starter';
  }
  if (ctx.rotationIds.has(id)) return 'starter';
  if (recent && num(recent.games) >= ROLE_MIN_GAMES) {
    return num(recent.gamesStarted) * 2 > num(recent.games) ? 'starter' : 'reliever';
  }
  return season && num(season.gamesStarted) * 2 > num(season.games) ? 'starter' : 'reliever';
}

/** One batter's expected line over the context's remaining games, and how many
 *  of his club's games he is expected to be in. */
function projectOneBatter(
  ctx: ProjectionContext,
  id: number,
  into: Bucket,
  /** The days he is in a lineup on — `null` for every day his club plays, which
   *  is the roster page's question and was this file's only one. See
   *  `planLineups`. */
  allow: ReadonlySet<string> | null = null,
): { games: number; placed: boolean } {
  const { pools } = ctx;
  const row = pools.batSeason.get(id);
  if (!row || row.teamId === null) return { games: 0, placed: false };
  const all = ctx.remaining.get(row.teamId) ?? [];
  const games = allow ? all.filter((g) => allow.has(g.date)) : all;
  const mults = games.map((g) => {
    const oppSide = g.homeId === row.teamId ? g.awayId : g.homeId;
    const named = [...(ctx.starters.get(g.gamePk) ?? [])].find((sid) => {
      const sp = pools.pitSeason.get(sid);
      return sp ? sp.teamId === oppSide : false;
    });
    return batterGameMult(pools, id, named ?? null);
  });
  const recent = pools.batRecent.get(id) ?? null;
  const share = playShareOf(ctx, 'batter', id, row.teamId, row, recent);
  projectBatter(row, recent, mults, share, into);
  // What the projection is actually built on, which is what the reader is
  // told: his club's remaining games times the share of them he plays.
  return { games: mults.length * share, placed: true };
}

/** One pitcher's expected line, and the chances it was drawn over — his turns
 *  where he starts, his club's games times how often he is used where he
 *  relieves. */
function projectOnePitcher(
  ctx: ProjectionContext,
  id: number,
  into: Bucket,
  /** As `projectOneBatter`'s — the days he has a lineup slot, or `null` for all
   *  of them. A start he is not started for is not a start he gets. */
  allow: ReadonlySet<string> | null = null,
): { starts: number; reliefGames: number; placed: boolean } {
  const { pools } = ctx;
  const row = pools.pitSeason.get(id);
  if (!row || row.teamId === null) return { starts: 0, reliefGames: 0, placed: false };
  const all = ctx.remaining.get(row.teamId) ?? [];
  const games = allow ? all.filter((g) => allow.has(g.date)) : all;
  const oppOf = (g: ScheduleGame): number => (g.homeId === row.teamId ? g.awayId : g.homeId);
  // His own turns: every remaining game he is named for or projected into.
  const his = games.filter((g) => ctx.starters.get(g.gamePk)?.has(id) === true);
  // **The role says when he pitches; his own record says how much.** Two
  // questions that look like one, and conflating them is a measured disaster
  // rather than a tidiness point: `projectPitcher`'s starter view divides his
  // season *outs* by his season *starts*, which is only a per-start rate when
  // the starts are where the outs came from. Bryan King is 50 appearances, one
  // start and 155 outs — read as a starter he projects **155 outs in a single
  // outing**, and an opener named as tomorrow's probable is exactly the man
  // `currentRole` newly gets right about the day and would have got absurdly
  // wrong about the workload.
  //
  // So the shape stays on the old majority test, which is the one thing that
  // test is genuinely good for: it is the condition under which `outs / gs` is
  // a number about starts at all. A mixed-role pitcher is projected per
  // appearance on the day he starts — under his real workload, and by a long
  // way the safer of the two directions to be wrong in.
  if (currentRole(ctx, id, row, pools.pitRecent.get(id) ?? null, row.teamId) === 'starter') {
    const mults = his.map((g) => pitcherGameMult(pools, id, oppOf(g)));
    const startsAreHisRecord = num(row.gamesStarted) * 2 > num(row.games);
    projectPitcher(row, pools.pitRecent.get(id) ?? null, mults, startsAreHisRecord, into, true);
    return { starts: mults.length, reliefGames: 0, placed: true };
  }
  // A reliever's chances are his club's games times how often he has actually
  // been used — `playShareOf`'s own figure, which reads the last thirty days
  // where it can for the reason that function gives: a man just brought up out
  // of the bullpen is being used now rather than at his season rate.
  //
  // **Every remaining game at a share of an appearance, not a whole number of
  // them.** A batter's line has always been built this way (`projectOneBatter`
  // hands `projectBatter` its `share` and gets a fractional `games` back) and so
  // has the lineup planner's reading of this very man (`pitcherCandidate` sets
  // `day.set(g.date, rate)`), so this is the one place in the file that
  // disagreed with the other two. Rounding a span to whole appearances rounded
  // a **one-day span to none** — the whole of the "relievers get no projection
  // on individual dates" fault, since a rate near 0.4 is the ordinary bullpen
  // arm and `Math.round(0.4)` is 0 — and threw the fraction away on every
  // longer one besides. See `projectPitcher`'s `appearanceShare`.
  const rate = playShareOf(ctx, 'pitcher', id, row.teamId, row, pools.pitRecent.get(id) ?? null);
  const mults = games.map((g) => pitcherGameMult(pools, id, oppOf(g)));
  projectPitcher(row, pools.pitRecent.get(id) ?? null, mults, false, into, false, rate);
  return { starts: 0, reliefGames: mults.length * rate, placed: true };
}


// ---- The lineup, filled a day at a time --------------------------------------

/** ESPN's bench and injured-reserve slots — the two that are not a lineup. */
const BENCH_SLOT = 16;
const IL_SLOT = 17;

/* `PITCHING_SLOTS` — ESPN's `P`, `SP` and `RP` — was declared here and is now
   `espn.ts`'s, imported above. It gained a second reader when the per-day
   lineup map began saying which *side of the ball* a seat is (`seatKinds`), and
   the same three numbers written down in two files is two lists that can come
   to disagree about a slot ESPN adds. Nothing about the rule moved: everything
   else a league starts is a batting slot, the fail-safe direction
   `NON_ACCRUING_SLOTS` also takes. */

/**
 * One rostered player as the lineup planner sees him: which seats he may sit
 * in, what he brings on each day, and what one day of him is worth.
 */
interface Candidate {
  key: string;
  mlbId: number;
  kind: PlayerKind;
  /** The lineup slots ESPN has him eligible for, filtered to the side of the
   *  ball this candidate is — a two-way player is two candidates and each
   *  competes only for its own seats. */
  slots: number[];
  /** Day to the units he brings that day: a batter's or a reliever's play
   *  share, and **1** on the day a starter's turn falls. A day he brings
   *  nothing is not in the map, so he never takes a seat he cannot use. */
  day: Map<string, number>;
  units: number;
  /** What one of those units is worth, which is how a scarce seat is settled. */
  value: number;
  /**
   * **Superseded, and kept only because the reasoning is worth reading against
   * what replaced it.** It was 0 for a starting pitcher on the day his turn
   * fell and 1 for everybody else, on the argument that a manager does not
   * weigh a start against a relief appearance — he starts the man who is
   * starting and fills what is left.
   *
   * That is *usually* true and it is not a rule, which is the correction:
   * an **opener** cannot win, save or hold, and a bad start is a real cost to
   * ERA and WHIP that a good reliever's inning is not. A hard tier made those
   * cases impossible to express. What replaced it is the ordering doing the job
   * honestly — **expected value that day** (`units × value`, where the value now
   * carries the rate categories as a marginal), under which a start outranks a
   * relief appearance in the ordinary case *because it is worth more*, and does
   * not when it genuinely is not.
   *
   * Left on the interface at 0 for everybody. It costs nothing and the next
   * person to reach for a hard priority should read the paragraph above first.
   */
  tier: number;
}

/**
 * **What one day of a player is worth**, for the one question the planner has
 * to answer that "fill as many spots as possible" does not: when more players
 * are available than there are seats, who sits.
 *
 * **The league's own counting categories, each normalized by what the rest of
 * this roster does per day.** A home run is worth a home run against the other
 * bats being considered, so the sum is dimensionless and a 5×5 league and a
 * 12-category one both come out on the same scale, with no constant here to
 * drift from the league's actual settings.
 *
 * **Rate categories are deliberately not in it**, and that is a limitation
 * worth stating rather than hiding: a rate is not additive, so a player's
 * effect on a team ERA depends on the innings underneath it, and ranking on his
 * own ERA would seat a one-inning specialist above a workhorse who is worth far
 * more of the same category. They are still *projected* — every category the
 * league scores is in the answer — it is only the seating order that ignores
 * them. A league that scores nothing but rates falls back to `units`, which is
 * the request read literally: fill the seats with whoever plays most.
 */
function seatValues(
  cands: Candidate[],
  categories: EspnCategory[],
  buckets: Map<string, Bucket>,
): void {
  const counting = categories.filter((c) => c.format === 'count');
  const rates = categories.filter((c) => c.format !== 'count' && DERIVED[c.statId]);
  if (counting.length === 0 && rates.length === 0) {
    for (const c of cands) c.value = 1;
    return;
  }

  /** One unit of him — his whole projected line over the units it was drawn
   *  over, which is what a single seat-day of him is worth. */
  const per = (c: Candidate): Bucket | null => {
    const b = buckets.get(c.key);
    if (!b || c.units <= 0) return null;
    const out: Bucket = {};
    for (const [k, v] of Object.entries(b)) out[Number(k)] = v / c.units;
    return out;
  };
  const units = new Map<string, Bucket>();
  for (const c of cands) {
    const u = per(c);
    if (u) units.set(c.key, u);
  }

  // The counting half, unchanged: what he does per day against what the rest of
  // this roster does per day, so the sum is dimensionless.
  const mean = new Map<number, number>();
  for (const cat of counting) {
    let sum = 0;
    let n = 0;
    for (const c of cands) {
      const u = units.get(c.key);
      if (!u) continue;
      sum += num(u[cat.statId]);
      n += 1;
    }
    mean.set(cat.statId, n > 0 && sum > 0 ? sum / n : 0);
  }

  /**
   * **The rate half, as a marginal rather than as his own figure** — which is
   * the whole of what makes a rate rankable at all.
   *
   * A rate is not additive, so "his ERA" says nothing about what he is worth to
   * a team: a one-inning specialist at 1.50 and a workhorse at 3.10 are not
   * comparable figures, and ranking on them seats the specialist. What *is*
   * comparable is what one more outing of him would do to the side's own rate —
   * so this adds one unit of him to the roster's whole projected line and asks
   * `DERIVED` what the category becomes. A man better than the side he is on
   * improves it in proportion to the innings he throws, which is exactly the
   * quantity a manager is trading against a start's strikeouts and win.
   *
   * `DERIVED` is `espn.ts`' own table, the one every score on the board is
   * rebuilt from, rather than a second copy of the same nine formulas.
   */
  const base: Bucket = {};
  for (const c of cands) {
    const b = buckets.get(c.key);
    if (!b) continue;
    for (const [k, v] of Object.entries(b)) add(base, Number(k), v);
  }
  const credit = new Map<string, Map<number, number>>();
  for (const c of cands) {
    const u = units.get(c.key);
    if (!u) continue;
    const mine = new Map<number, number>();
    for (const cat of rates) {
      const rule = DERIVED[cat.statId];
      const before = rule.of(base as Record<number, number>);
      if (before === null) continue;
      const withOne: Record<number, number> = { ...(base as Record<number, number>) };
      for (const n of rule.needs) withOne[n] = num(withOne[n]) + num(u[n]);
      const after = rule.of(withOne);
      if (after === null) continue;
      // Better is up unless the league says down, which is `lowerBetter` — the
      // same flag `rankBy` reads, so ERA and WHIP need no case of their own.
      mine.set(cat.statId, cat.lowerBetter ? before - after : after - before);
    }
    credit.set(c.key, mine);
  }
  // Each rate category on the same scale as a counting one: a typical swing is
  // worth about a typical day's production of a category, which is the only
  // claim being made and the only one that has to hold for the ordering.
  const rateScale = new Map<number, number>();
  for (const cat of rates) {
    let sum = 0;
    let n = 0;
    for (const c of cands) {
      const v = credit.get(c.key)?.get(cat.statId);
      if (v === undefined) continue;
      sum += Math.abs(v);
      n += 1;
    }
    rateScale.set(cat.statId, n > 0 && sum > 0 ? sum / n : 0);
  }

  for (const c of cands) {
    const u = units.get(c.key);
    if (!u) {
      c.value = 0;
      continue;
    }
    let v = 0;
    for (const cat of counting) {
      const scale = mean.get(cat.statId) ?? 0;
      if (scale > 0) v += (num(u[cat.statId]) / scale) * (cat.lowerBetter ? -1 : 1);
    }
    for (const cat of rates) {
      const scale = rateScale.get(cat.statId) ?? 0;
      const got = credit.get(c.key)?.get(cat.statId);
      if (scale > 0 && got !== undefined) v += got / scale;
    }
    c.value = v;
  }
}

/**
 * **Fill every seat, every day, with the best available player** — the
 * assignment, for one day and one side of the ball.
 *
 * A player may sit in any of several slots and is worth the same in all of
 * them, which is what makes this simpler than it looks: with the weight on the
 * *player* rather than on the pairing, taking them in descending order and
 * keeping each one that still fits is **optimal**, not a heuristic. (It is the
 * greedy algorithm on a transversal matroid; the seats are the ground set the
 * matching is over.) "Still fits" is the ordinary augmenting search — a player
 * whose slots are all taken may still get in if one of the sitting players can
 * shuffle to another seat he is eligible for.
 *
 * Returns, for each index of `order` that got a seat, **which slot** he is
 * sitting in — the roster table's projected chip names it, so the assignment
 * has to hand it back rather than merely saying yes.
 */
function seatDay(order: Candidate[], seats: number[]): Map<number, number> {
  const owner = new Array<number>(seats.length).fill(-1);
  const fits = (ci: number, si: number): boolean => order[ci].slots.includes(seats[si]);
  const place = (ci: number, seen: boolean[]): boolean => {
    for (let si = 0; si < seats.length; si += 1) {
      if (seen[si] || !fits(ci, si)) continue;
      seen[si] = true;
      if (owner[si] === -1 || place(owner[si], seen)) {
        owner[si] = ci;
        return true;
      }
    }
    return false;
  };
  for (let ci = 0; ci < order.length; ci += 1) {
    place(ci, new Array<boolean>(seats.length).fill(false));
  }
  // Read off the seats rather than off the attempts: the augmenting search
  // shuffles men between chairs as it goes, so who ended up where is only true
  // at the end.
  const seated = new Map<number, number>();
  for (let si = 0; si < seats.length; si += 1) {
    if (owner[si] !== -1) seated.set(owner[si], seats[si]);
  }
  return seated;
}

/**
 * **Which days each rostered player is in a lineup on.**
 *
 * This replaces the assumption the whole file used to rest on — *the lineup a
 * manager has set today stands for the rest of the week* — with the one a
 * manager actually plays by: **the lineup is set again every morning**, and it
 * is set to whoever is playing. ESPN says as much in the league's own settings
 * (`lineupLocktimeType: INDIVIDUAL_GAME` on the live league: a slot locks when
 * that player's game starts, not when the day does), so a manager who looks
 * once a day has every one of these choices in front of him.
 *
 * Three rules, which are the three the reader asked for and fall out of one
 * mechanism rather than being three cases:
 *
 * - **A starting pitcher is in the lineup on the day he starts.** His turn is
 *   the rotation map's, the same one the Schedule view's grid draws — so he
 *   brings 1 unit on that day and nothing on the six around it, and a seat on a
 *   day he does not pitch is a seat someone else gets.
 * - **A reliever is in the lineup when he pitches**, benched today or not. He
 *   cannot be known to pitch on a given day, so he brings his appearance rate,
 *   which is exactly what that seat is worth in expectation.
 * - **The batting order fills as far as it will go.** Every seat is open every
 *   day; a man on the bench today because eleven better bats are playing is in
 *   on Thursday when four of them are idle.
 *
 * **Who is a regular is measured rather than assumed**, and it is measured off
 * *MLB* lineups, not fantasy ones: `playShareOf` is how often he is in his
 * club's game over the last thirty days **of the games he was available for**,
 * which is the availability-corrected share this file already back-tests at
 * 0.1245 mean error over 40,013 cases. So an everyday shortstop brings ~1 unit
 * a day, a strong-side platoon bat brings ~0.6, and a backup catcher brings
 * ~0.25 — and the seats go to the everyday players without anybody having to
 * write down who they are.
 *
 * **The fantasy IL is the one slot that does not compete.** A player parked
 * there cannot be moved into a lineup without a roster move, which is a
 * transaction rather than a lineup decision — the same line the rest of this
 * file draws at *it does not guess at a return date*. The bench is another
 * matter and is the whole point of this function.
 *
 * Null when the league published no slot counts, which is the honest failure:
 * with no idea what a lineup holds there is nothing to fill, and the caller
 * falls back to the rule this file always had.
 */
/**
 * One man's week as the plan settled it: **which day he is in the lineup and at
 * what slot**, and how many days he could have been.
 *
 * The seats are what the projection is cut by. `openDays` is what the roster
 * table's chip reads against — *4 of 5* means four of the five days his club
 * plays, not four of the span's days, since a day his club is idle is not a day
 * anybody benched him.
 */
export interface PlanEntry {
  /** Day → the ESPN lineup slot id he holds that day. Empty for a man the plan
   *  seats nowhere, which is a real answer and the one the chip draws as
   *  `benched`. */
  seats: Map<string, number>;
  /** Every day he could have been started on — his club's games, or a starter's
   *  turns. Carried as the days rather than as a count so the chip's tooltip can
   *  name the ones he sits out; *4 of 5* is `seats.size` of this. */
  open: string[];
}

function planLineups(
  roster: EspnRosterPlayer[],
  ctx: ProjectionContext,
  slotCounts: Record<number, number> | null,
  eligible: Record<number, number[]>,
  categories: EspnCategory[],
): Map<string, PlanEntry> | null {
  if (!slotCounts) return null;
  // The seats, expanded one per body, split by side of the ball: a hitter and a
  // pitcher never compete for the same chair, so this is two small assignments
  // rather than one twice the size.
  const batSeats: number[] = [];
  const pitSeats: number[] = [];
  for (const [id, n] of Object.entries(slotCounts)) {
    const slot = Number(id);
    if (slot === BENCH_SLOT || slot === IL_SLOT) continue;
    for (let i = 0; i < n; i += 1) (PITCHING_SLOTS.has(slot) ? pitSeats : batSeats).push(slot);
  }
  if (batSeats.length === 0 && pitSeats.length === 0) return null;

  const cands: Candidate[] = [];
  const buckets = new Map<string, Bucket>();

  for (const p of roster) {
    if (p.mlbId === null || p.slotId === IL_SLOT) continue;
    const id = p.mlbId;
    // ESPN's own eligibility, falling back to the slot he is standing in today
    // — which can only ever be a slot he is eligible for, so a player the pool
    // has no row for is never worse off than the old rule left him.
    const slots = eligible[id] ?? (p.slotId === BENCH_SLOT ? [] : [p.slotId]);
    const isPitcher = p.kinds.includes('pitcher') && !p.kinds.includes('batter');
    const twoWay = p.kinds.includes('pitcher') && p.kinds.includes('batter');

    if (!isPitcher) {
      const c = batterCandidate(ctx, id, slots.filter((s) => !PITCHING_SLOTS.has(s)));
      if (c) {
        cands.push(c);
        const b: Bucket = {};
        projectOneBatter(ctx, id, b);
        buckets.set(c.key, b);
      }
    }
    if (isPitcher || twoWay) {
      const c = pitcherCandidate(ctx, id, slots.filter((s) => PITCHING_SLOTS.has(s)));
      if (c) {
        cands.push(c);
        const b: Bucket = {};
        projectOnePitcher(ctx, id, b);
        buckets.set(c.key, b);
      }
    }
  }

  seatValues(cands, categories, buckets);

  const days = new Set<string>();
  for (const c of cands) for (const d of c.day.keys()) days.add(d);

  // Every candidate gets an entry, seated or not: a man the plan benches all
  // week is exactly the row the chip has something to say about, and an absent
  // key would be indistinguishable from a man it never considered.
  const out = new Map<string, PlanEntry>();
  for (const c of cands) out.set(c.key, { seats: new Map(), open: [...c.day.keys()].sort() });
  for (const day of [...days].sort()) {
    for (const [side, seats] of [
      ['batter', batSeats],
      ['pitcher', pitSeats],
    ] as const) {
      if (seats.length === 0) continue;
      // **Expected value *that day*, which is the units times the worth of one
      // of them** — and the units are the half that was missing. A starter
      // brings a whole outing and a reliever brings his appearance rate, so
      // comparing per-outing worth alone let a 0.4-of-an-appearance reliever be
      // ranked as though he were certain to pitch. See `Candidate.tier`, which
      // this replaced.
      const worth = (c: Candidate): number => (c.day.get(day) ?? 0) * c.value;
      const order = cands
        .filter((c) => c.kind === side && (c.day.get(day) ?? 0) > 0 && c.slots.length > 0)
        .sort((a, b) => worth(b) - worth(a) || b.units - a.units);
      for (const [ci, slot] of seatDay(order, seats)) {
        out.get(order[ci].key)?.seats.set(day, slot);
      }
    }
  }
  return out;
}

/** A batter's day-by-day demand: every remaining game his club plays, at the
 *  share of them he is expected to be in. */
function batterCandidate(ctx: ProjectionContext, id: number, slots: number[]): Candidate | null {
  const row = ctx.pools.batSeason.get(id);
  if (!row || row.teamId === null || slots.length === 0) return null;
  const share = playShareOf(ctx, 'batter', id, row.teamId, row, ctx.pools.batRecent.get(id) ?? null);
  const day = new Map<string, number>();
  for (const g of ctx.remaining.get(row.teamId) ?? []) if (share > 0) day.set(g.date, share);
  let units = 0;
  for (const v of day.values()) units += v;
  return { key: `batter-${id}`, mlbId: id, kind: 'batter', slots, day, units, value: 0, tier: 0 };
}

/** A pitcher's, which is the one place the two shapes genuinely differ: a
 *  starter's days are his **turns** and a reliever's are all of them at his
 *  appearance rate. */
function pitcherCandidate(ctx: ProjectionContext, id: number, slots: number[]): Candidate | null {
  const row = ctx.pools.pitSeason.get(id);
  if (!row || row.teamId === null || slots.length === 0) return null;
  const games = ctx.remaining.get(row.teamId) ?? [];
  const recent = ctx.pools.pitRecent.get(id) ?? null;
  const day = new Map<string, number>();
  // **The role decides the shape and the tier alike**, which is what keeps the
  // two answers from ever disagreeing: a starter's days are his turns and he is
  // asked first on them; a reliever's are all of them, at his appearance rate,
  // and he is asked after every starter going that day.
  const starter = currentRole(ctx, id, row, recent, row.teamId) === 'starter';
  if (starter) {
    for (const g of games) if (ctx.starters.get(g.gamePk)?.has(id) === true) day.set(g.date, 1);
  } else {
    const rate = playShareOf(ctx, 'pitcher', id, row.teamId, row, recent);
    for (const g of games) if (rate > 0) day.set(g.date, rate);
  }
  let units = 0;
  for (const v of day.values()) units += v;
  return {
    key: `pitcher-${id}`,
    mlbId: id,
    kind: 'pitcher',
    slots,
    day,
    units,
    value: 0,
    tier: 0,
  };
}

/** One team's expected remaining production, and what it was made of. */
function projectTeam(
  roster: EspnRosterPlayer[],
  ctx: ProjectionContext,
  /** The days each man has a lineup slot on, from `planLineups` — or **null**,
   *  which is this file's own older rule: whoever is in a lineup slot today is
   *  in one all week and nobody else is in one at all. Null is what a league
   *  that published no slot counts gets, and it is what every measurement
   *  before this change was taken under. */
  plan: Map<string, PlanEntry> | null,
): { bucket: Bucket; hitterGames: number; starts: number; reliefGames: number; skipped: number } {
  const bucket: Bucket = {};
  let hitterGames = 0;
  let starts = 0;
  let reliefGames = 0;
  let skipped = 0;

  for (const p of roster) {
    if (p.mlbId === null) continue;
    // **With a plan, the bench is in play and the fantasy IL is not** — a
    // benched man is one lineup decision away and an IL'd one is a roster move
    // away, which is the line this file already draws. Without a plan it is the
    // old rule, `NON_ACCRUING_SLOTS`' own: today's lineup, all week.
    if (plan ? p.slotId === IL_SLOT : !p.starting) continue;
    const id = p.mlbId;
    const isPitcher = p.kinds.includes('pitcher') && !p.kinds.includes('batter');
    const twoWay = p.kinds.includes('pitcher') && p.kinds.includes('batter');

    if (!isPitcher) {
      const allow = plan ? daysOf(plan.get(`batter-${id}`)) : null;
      const made = projectOneBatter(ctx, id, bucket, allow);
      hitterGames += made.games;
      if (!made.placed) skipped += 1;
    }

    if (isPitcher || twoWay) {
      const allow = plan ? daysOf(plan.get(`pitcher-${id}`)) : null;
      const made = projectOnePitcher(ctx, id, bucket, allow);
      starts += made.starts;
      reliefGames += made.reliefGames;
      if (!made.placed && !twoWay) skipped += 1;
    }
  }
  return { bucket, hitterGames, starts, reliefGames, skipped };
}

/** The days a plan entry seats him on — and a man it seated nowhere, or never
 *  considered, plays nowhere. That has to be an **empty set** rather than
 *  `null`, `null` meaning "every day" one function down. */
const daysOf = (e: PlanEntry | undefined): ReadonlySet<string> =>
  e ? new Set(e.seats.keys()) : EMPTY_DAYS;
const EMPTY_DAYS: ReadonlySet<string> = new Set<string>();

/**
 * **The league's own categories, rounded where a count is one** — the whole of
 * what goes on the wire.
 *
 * **Rounded, which is the one place in this app a `count` is not naturally an
 * integer.** A projection is a real number by construction, and a side does not
 * finish a week on 23.6 home runs — the client's `fmtValue` says as much in its
 * own comment (`count` is deliberately not `toFixed(0)`, "a count is an integer
 * already"), so the rounding has to happen here or the card prints a decimal
 * beside a whole number.
 *
 * **The rates are derived before the rounding and the tally after it**, and both
 * halves of that are deliberate. Before, because the rate should be the best
 * estimate rather than one that inherits the rounding of up to four components:
 * measured on the live league, deriving OPS from the *rounded* home-run count
 * instead moves it by up to **3.1 thousandths** and changes the printed figure on
 * 11 of 36 cells. After, because the reader can add up a **tally** and cannot
 * derive an OPS — so the headline `6-3-1` is computed from exactly the figures
 * the cells show, and was checked to be (0 disagreements). ERA and WHIP are
 * *exact* either way, their components not being categories this league scores
 * and so never rounded.
 *
 * **Only the categories go out.** `scoreByStat` carries all 23 stats ESPN
 * tracks, and the scoreboard ships them because they arrive free in ESPN's own
 * payload; every component here is a number this file *computed*, and nothing
 * reads them — the rule `teamProbablePitcher`'s removal sets. Measured: 6,948
 * bytes to **3,370**, and 2,868 gzipped to **1,032**.
 */
function categoryScores(
  scores: Record<number, number>,
  categories: EspnCategory[],
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const cat of categories) {
    const v = scores[cat.statId];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[cat.statId] = cat.format === 'count' ? Math.round(v) : v;
  }
  return out;
}

/**
 * **The projection for one matchup period** — the live one unless another is
 * named, and only the live one has anything to project.
 *
 * Memory-cached per league and period on the scoreboard's own minute
 * (`LIVE_TTL_MS` there), because that is what it is built on: a projection whose
 * "already happened" half was a minute stale would be a minute stale itself. An
 * `inFlight` guard so a cold container serving three tabs sends one set of
 * reads rather than three.
 */
const cache = new Map<string, { at: number; value: EspnProjection }>();
const inFlight = new Map<string, Promise<EspnProjection>>();
const TTL_MS = 60_000;

export async function getProjection(
  creds: EspnCreds,
  period?: number | null,
  force = false,
): Promise<EspnProjection> {
  const board = await getScoreboard(creds, period ?? null, force);
  const key = `${creds.leagueId}:${board.matchupPeriod}`;
  if (!force) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    const flight = inFlight.get(key);
    if (flight) return flight;
  }
  const run = build(creds, board)
    .then((value) => {
      cache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

/** Drop a league's projections — what `?refresh=1` reaches, the same statement
 *  about a league rather than about a week that `getOwnership` makes. */
export function dropProjections(leagueId: number): void {
  for (const k of [...cache.keys()]) if (k.startsWith(`${leagueId}:`)) cache.delete(k);
  for (const k of [...inFlight.keys()]) if (k.startsWith(`${leagueId}:`)) inFlight.delete(k);
}

/**
 * **The context the two projections share**, assembled from reads the app
 * already makes: the league-wide schedule window (30 min), the season and
 * 30-day research boards for both kinds (6h each, pulled warm nightly), the two
 * team-hitting cuts for every club that still has a game (6h), and the season
 * roster list for the two handedness maps (1h). Nothing here is a new upstream.
 *
 * `from`/`to` are the days to project, inclusive. **Today counts only where its
 * games have not started** — `remainingGames`' own rule, which is what keeps a
 * figure that already holds today's production from holding it twice.
 */
async function buildContext(from: string, to: string): Promise<ProjectionContext> {
  const [schedule, seasonRead, batSeason, batRecent, pitSeason, pitRecent, players] =
    await Promise.all([
      getScheduleWindow(),
      // The same cache entry the window is served from, for the clubs' own runs
      // — which are what the lineup record's denominator is.
      getSeasonRead(),
      getResearch('batter', 'season'),
      getResearch('batter', RECENT_WINDOW),
      getResearch('pitcher', 'season'),
      getResearch('pitcher', RECENT_WINDOW),
      getSeasonPlayers().catch(() => []),
    ]);

  // Every club that still has a game, so the two hitting boards are read for
  // the clubs that matter rather than all thirty regardless.
  // One clock for the whole assembly, so the games counted as still to come and
  // the days counted as still to play cannot fall either side of a first pitch.
  const now = Date.now();
  const remaining = remainingGames(schedule.games, from, to, now);
  const clubs = [...new Set([...remaining.keys()])];
  const [recentSplits, seasonSplits, lineup] = await Promise.all([
    Promise.all(clubs.map(async (id) => [id, await getTeamHitting(id, RECENT_WINDOW)] as const)),
    Promise.all(clubs.map(async (id) => [id, await getTeamHitting(id, 'season')] as const)),
    // Every one of the thirty days behind this is one `getResearch` above has
    // already assembled its window from, so on a warm server it is memory.
    buildLineupRecord(seasonRead.season.runs),
  ]);
  const hitting = new Map<number, TeamHittingSplit>();
  const clubGamesRecent = new Map<number, number>();
  for (const [id, v] of recentSplits) {
    if (!v) continue;
    hitting.set(id, v.all);
    const g = v.all.all?.games;
    if (typeof g === 'number' && g > 0) clubGamesRecent.set(id, g);
  }
  const seasonHitting = new Map<number, TeamHittingSplit>();
  const clubGames = new Map<number, number>();
  for (const [id, v] of seasonSplits) {
    if (!v) continue;
    seasonHitting.set(id, v.all);
    const g = v.all.all?.games;
    if (typeof g === 'number' && g > 0) clubGames.set(id, g);
  }

  const bats = new Map<number, string>();
  const throws = new Map<number, string>();
  for (const p of players) {
    if (p.bats) bats.set(p.id, p.bats);
    if (p.throws) throws.set(p.id, p.throws);
  }

  const pools: Pools = {
    batSeason: byId(batSeason.rows),
    batRecent: byId(batRecent.rows),
    pitSeason: byId(pitSeason.rows),
    pitRecent: byId(pitRecent.rows),
    bats,
    throws,
    hitting,
    seasonHitting,
    leagueTeamOps: meanTeamOps(seasonHitting),
    leaguePitcherWoba: meanPitcherWoba(pitSeason.rows),
  };

  // How many days of the span still have a game to be played — the same test
  // `remainingGames` applies, down to `yetToStart`'s reading of the clock,
  // counted rather than assumed so a span running past the schedule window's
  // own reach says how far it actually got. Written through the same helper
  // rather than repeated inline, which is how the two came to disagree about a
  // game already under way in the first place.
  const today = baseballToday();
  let daysLeft = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const any = schedule.games.some(
      (g) => g.date === d && g.state !== 'postponed' && (d !== today || yetToStart(g, now)),
    );
    if (any) daysLeft += 1;
  }

  return {
    pools,
    remaining,
    starters: startersByGame(schedule.games, schedule.rotations),
    rotationIds: new Set(
      Object.keys(schedule.rotations)
        .map(Number)
        .filter((n) => Number.isFinite(n)),
    ),
    clubGames,
    clubGamesRecent,
    lineup,
    from,
    to,
    daysLeft,
  };
}

async function build(
  creds: EspnCreds,
  board: Awaited<ReturnType<typeof getScoreboard>>,
): Promise<EspnProjection> {
  const empty = (note: string): EspnProjection => ({
    matchupPeriod: board.matchupPeriod,
    ok: false,
    note,
    end: null,
    daysLeft: 0,
    matchups: [],
    fetchedAt: Date.now(),
  });

  if (!board.live) return empty('settled');
  if (board.categories.length === 0) return empty('no-categories');

  const window = await getMatchupWindow(creds).catch(() => null);
  if (!window || window.period !== board.matchupPeriod) return empty('no-window');

  const today = baseballToday();
  if (window.end < today) return empty('over');

  const ownership = await getOwnership(creds);
  const ctx = await buildContext(today, window.end);

  // The league's lineup shape and ESPN's own eligibility, both off reads that
  // have already landed: the counts were stashed by the `mSettings` half of the
  // roster read above, and the slot ids ride on the cookie-free player pool the
  // same read already asked for. Neither is a new upstream and neither is on
  // the wire. A pool that failed leaves eligibility empty, which costs the plan
  // its shuffling and not the projection — every man then competes for the slot
  // he is standing in.
  const slotCounts = lineupSlotsFor(creds.leagueId);
  const eligibleSlots = await getPlayerPool()
    .then((pool) => pool.slots)
    .catch(() => ({}) as Record<number, number[]>);

  const perTeam = new Map<number, ReturnType<typeof projectTeam>>();
  const project = (teamId: number): ReturnType<typeof projectTeam> => {
    const hit = perTeam.get(teamId);
    if (hit) return hit;
    const roster = ownership.rosters[teamId] ?? [];
    const plan = planLineups(roster, ctx, slotCounts, eligibleSlots, board.categories);
    const made = projectTeam(roster, ctx, plan);
    perTeam.set(teamId, made);
    return made;
  };

  const matchups: EspnProjectedMatchup[] = [];
  for (const m of board.matchups) {
    const sideOf = (side: { teamId: number; scores: Record<number, number> }): EspnProjectedSide => {
      const made = project(side.teamId);
      return {
        teamId: side.teamId,
        scores: categoryScores(
          withAddedComponents(side.scores, made.bucket, board.categories),
          board.categories,
        ),
        wins: 0,
        losses: 0,
        ties: 0,
        hitterGames: Math.round(made.hitterGames),
        starts: made.starts,
        reliefGames: made.reliefGames,
        skipped: made.skipped,
      };
    };
    const home = sideOf(m.home);
    const away = m.away ? sideOf(m.away) : null;
    if (away) {
      const t = tallyCategories(home.scores, away.scores, board.categories);
      home.wins = t.wins;
      home.losses = t.losses;
      home.ties = t.ties;
      away.wins = t.losses;
      away.losses = t.wins;
      away.ties = t.ties;
    }
    matchups.push({
      id: m.id,
      home,
      away,
      winner: !away
        ? 'home'
        : home.wins > away.wins
          ? 'home'
          : away.wins > home.wins
            ? 'away'
            : 'tie',
    });
  }

  return {
    matchupPeriod: board.matchupPeriod,
    ok: true,
    note: null,
    end: window.end,
    daysLeft: ctx.daysLeft,
    matchups,
    fetchedAt: Date.now(),
  };
}

// ---- The roster page's own projection ---------------------------------------

/**
 * **One player's expected line over a span**, which is the same engine the
 * matchup runs and a different question asked of it.
 *
 * A matchup asks *where is this week heading*, and its answer is a team's total
 * added to what ESPN has already scored. The roster page asks *what are my
 * players going to do over these days*, which is a line per man — so the same
 * per-player buckets are kept apart rather than merged, and each is turned into
 * the very `BattingLine` / `PitchingLine` the summary table already draws. That
 * is what makes this cost the client no new vocabulary: a projected row is the
 * table's own row over different numbers, exactly as a projected matchup card is
 * the scoreboard's own card over different numbers (`asProjected`).
 *
 * **Only the games still to be played are in it.** The client adds the report's
 * own lines for the days already played, which is the same `already happened +
 * what is left` shape the matchup card has — and it is what makes an arbitrary
 * range work with no case of its own: a past range projects nothing and reads as
 * it always did, a future one is projection alone, and a range straddling today
 * is the two halves added together.
 */
export interface ProjectedPlayerLine {
  key: string;
  id: number;
  kind: PlayerKind;
  /** What the line was drawn over — a batter's expected games, a pitcher's
   *  starts plus relief appearances. **Zero is the honest absence**: a club with
   *  no game left in the span, a starter whose turn does not fall in it, a man
   *  off the active roster, or a man neither board has a row for. The client
   *  draws that as dashes rather than as a line of noughts, which would claim he
   *  plays and does nothing.
   *
   *  **A fraction is not an absence**, and that is the distinction this used to
   *  lose on the pitching side: a reliever's chances are a share of every game
   *  his club has left, so a one-day span is `0.4` of an appearance rather than
   *  zero of one — the honest answer to *is he pitching tonight*, which is
   *  *probably not, and here is what it is worth if he does*. See
   *  `projectPitcher`'s `appearanceShare`. */
  chances: number;
  batting: BattingLine | null;
  pitching: PitchingLine | null;
  /**
   * **What the projection would actually start him for**, or null where there
   * is no lineup to fill — a watchlist rather than a fantasy team, a league
   * that published no slot counts, or a read that failed.
   *
   * **The line above is what he would do if he plays and this is what he is
   * projected to be given**, and the table draws both: the row keeps the first,
   * because *what would this man give me* is the question a roster is read to
   * answer and cutting it by a seat allocation would make the row about the
   * allocation instead; the `Total` sums the second, because a column that adds
   * up twenty players who cannot all be in the lineup at once is a team figure
   * nobody can act on. Two arithmetics on one table, and the caption says so.
   */
  lineup: {
    /** Day, and the slot he holds that day — `[{ day: '2026-08-21', slot: 'SS' }]`,
     *  in date order. Empty is a real answer: the plan benches him all span. */
    days: { day: string; slot: string }[];
    /** Every day he could have been started on — his club's games, or a
     *  starter's turns — so an idle club never reads as a benching, and the
     *  chip's tooltip can name the days he sits out. */
    openDays: string[];
    chances: number;
    batting: BattingLine | null;
    pitching: PitchingLine | null;
  } | null;
}

export interface RosterProjection {
  /** The span actually projected — `start` clamped forward to today, since a
   *  day that has been played is not a day anybody projects. */
  start: string;
  end: string;
  /** Days of it that still have a game to be played. Zero means there was
   *  nothing to project, which the client says in words rather than drawing a
   *  table of noughts. */
  daysLeft: number;
  players: ProjectedPlayerLine[];
  fetchedAt: number;
}

/** A projected count, to a tenth. **Rounded here rather than on screen** so the
 *  reader can add a column up and get the figure at the foot of it: the client
 *  sums these, so what it totals is what it printed. A tenth rather than a whole
 *  number because a per-player projection of 0.4 home runs over three days is a
 *  real answer and `0` is not. */
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The precision an unprinted component keeps — see `battingOf`. Four places
 *  rather than none: `0.15960384659945423` is seventeen characters of wire for a
 *  number nobody prints, and six of them ride on every player twice over (the
 *  line and the lineup's half of it). It is four rather than three because the
 *  only reader is a rate written to three, and rounding an input to the width of
 *  its own answer is how a thousandth comes to move. Measured on the same
 *  Grisham row: identical to the last digit of `.655 / .662 / .748` against
 *  `.690`, and 1,108 bytes off a 20KB response. */
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * **A component is rounded where it is a column and left exact where it is only
 * an input to a rate**, and that split is the whole of this function's
 * arithmetic.
 *
 * The table prints `H/AB`, `R`, `HR`, `RBI`, `SB`, `BB` and `K`
 * (`SummaryTable.tsx::StatCells`); it never prints `1B`, `2B`, `3B`, `HBP`, `SF`
 * or `TB`. Rounding the first set is what `round1` above is for. Rounding the
 * second set buys a reader nothing — there is no column to add up — and it
 * costs the one *rate* on the row, because over a short span a tenth is an
 * enormous quantum next to the values it is applied to and `TB` multiplies the
 * worst of them by four.
 *
 * **Measured, on the live league, team 6's Trent Grisham on 2026-08-21 with the
 * matchup running to the 23rd.** The projection is exactly additive — the three
 * days' unrounded hits are 0.704 + 0.717 + 0.831 and the range's are 2.252, to
 * the last digit — so a range OPS must land between the lowest and the highest
 * day's, `OBP` and `SLG` each being a weighted mean of the daily figures. With
 * every component rounded it did not: the days printed **.692 / .692 / .744**
 * against a range of **.681**, *below all three*, which is arithmetically
 * impossible and is what was reported. The unrounded figures are .644 / .657 /
 * .767 against .689. Leaving `TB`, `HBP` and `SF` exact prints **.655 / .662 /
 * .748** against **.690** — the range back between its days, and not one
 * printed count changed.
 *
 * `PA` is rounded with the columns although it is not one: it is the row's own
 * blank test (`line.pa === 0` is the man with nothing to project, drawn as
 * dashes rather than noughts), and an exact 0.0001 would draw him a line of
 * zeroes claiming he plays and does nothing.
 */
function battingOf(b: Bucket): BattingLine {
  const hitsExact = b[BAT.h] ?? 0;
  const doubles = round4(b[BAT.d2] ?? 0);
  const triples = round4(b[BAT.d3] ?? 0);
  const hrExact = b[BAT.hr] ?? 0;
  const singles = round4(Math.max(0, hitsExact - doubles - triples - hrExact));
  return {
    pa: round1(b[BAT.pa] ?? 0),
    ab: round1(b[BAT.ab] ?? 0),
    hits: round1(hitsExact),
    singles,
    doubles,
    triples,
    hr: round1(hrExact),
    bb: round1(b[BAT.bb] ?? 0),
    so: round1(b[BAT.k] ?? 0),
    hbp: round4(b[BAT.hbp] ?? 0),
    // **The sacrifice residue, not sacrifice flies alone**, and that is what
    // makes a projected OPS honest rather than a lie of a thousandth: this
    // function's own `projectBatter` splits `1 − AB% − BB%` into `hbp` and this,
    // so `AB + BB + HBP + SF` here comes back to **PA** — the denominator the
    // blended OBP was pinned to two hundred lines up. The client divides by it
    // (`lib.ts::lineOps`), so a projected slash line now recomputes to the OBP
    // it was built from instead of running a hair high the way a measured one
    // used to.
    sf: round4(b[BAT.sf] ?? 0),
    runs: round1(b[BAT.r] ?? 0),
    rbi: round1(b[BAT.rbi] ?? 0),
    sb: round1(b[BAT.sb] ?? 0),
    cs: round1(b[BAT.cs] ?? 0),
    totalBases: round4(singles + 2 * doubles + 3 * triples + 4 * hrExact),
    // Statcast has nothing to say about a game nobody has played, and the
    // summary table reads none of these — an absence rather than a zero, which
    // is what every other unmeasured field in this app carries.
    avgExitVelo: null,
    maxExitVelo: null,
    maxDistance: null,
    hardHits: 0,
    runValue: null,
  };
}

/**
 * **The split above does not reach this line, and that is a property of the
 * table rather than an oversight.** ERA and WHIP divide `earnedRuns`, `hits`
 * and `walks` by `outs`, and the pitching run prints **every one of those four**
 * (`SummaryTable.tsx::PitchStatCells` draws IP, H, R, ER, BB, K, HR and then the
 * two rates) — so there is no unprinted input here to leave exact, and the rate
 * on screen is the rate of the numbers beside it. Where a batting `TB` was a
 * hidden component multiplied by four, a pitcher's worst case is his own `ER`
 * against his own `IP`, both of them on the row.
 */
function pitchingOf(b: Bucket): PitchingLine {
  const walks = round1(b[PIT.bb] ?? 0);
  const hbp = round1(b[PIT.hbp] ?? 0);
  const tbf = round1(b[PIT.tbf] ?? 0);
  return {
    outs: round1(b[PIT.outs] ?? 0),
    hits: round1(b[PIT.h] ?? 0),
    runs: round1(b[PIT.r] ?? 0),
    earnedRuns: round1(b[PIT.er] ?? 0),
    walks,
    strikeouts: round1(b[PIT.k] ?? 0),
    hr: round1(b[PIT.hr] ?? 0),
    battersFaced: tbf,
    // Nothing projects a pitch count, a called strike or a wild pitch, and
    // nothing on the summary table reads one.
    pitchesThrown: 0,
    strikes: 0,
    balls: 0,
    doubles: 0,
    triples: 0,
    hitBatsmen: hbp,
    atBats: round1(Math.max(0, tbf - walks - hbp)),
    intentionalWalks: 0,
    wildPitches: 0,
    inheritedRunners: 0,
    inheritedRunnersScored: 0,
    wins: round1(b[PIT.w] ?? 0),
    saves: round1(b[PIT.sv] ?? 0),
    holds: round1(b[PIT.hd] ?? 0),
  };
}

/**
 * The context is memoized on the matchup's own minute, keyed by the span.
 *
 * Everything under it is cached for hours already, so what this saves is the
 * *assembly* — five map builds and a pass over the league's schedule — on a page
 * whose date control changes the span a press at a time. A rejected read is
 * dropped rather than remembered, so a failed board is retried by the next
 * reader instead of being wrong for a minute.
 */
const ctxCache = new Map<string, { at: number; value: Promise<ProjectionContext> }>();

function contextFor(from: string, to: string): Promise<ProjectionContext> {
  const key = `${from}|${to}`;
  const hit = ctxCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = buildContext(from, to);
  ctxCache.set(key, { at: Date.now(), value });
  value.catch(() => ctxCache.delete(key));
  return value;
}

/**
 * **What a roster is expected to do over a span** — one line per player, over
 * the games of that span that have not been played.
 *
 * It needs **no fantasy league at all**, which is worth stating: every input is
 * a league-wide board this app already holds, so a reader with a saved roster
 * and no ESPN connection gets the same answer. What a connected league adds is
 * only the span the toggle *opens* on (the rest of this matchup period) and the
 * roster it is asked about.
 */
export async function getRosterProjection(
  players: WatchPlayer[],
  start: string,
  end: string,
  /** The reader's own fantasy team, where the views are reading one — what the
   *  lineup is filled from. Null for a saved watchlist, which has no lineup and
   *  so gets no `lineup` on any row. */
  fantasy: { roster: EspnRosterPlayer[]; leagueId: number; categories: EspnCategory[] } | null = null,
): Promise<RosterProjection> {
  const today = baseballToday();
  // A day that has been played is not a day anybody projects — and the client
  // is drawing the report's own lines over those days anyway, so clamping here
  // is what keeps the two halves from overlapping. **Never past `end`**: a range
  // wholly in the past would otherwise answer with a span running backwards,
  // which is a caption nobody can read; it answers with its own last day and
  // `daysLeft: 0`, which is the honest "there is nothing here to project".
  const from = start < today ? (today > end ? end : today) : start;
  const empty: RosterProjection = {
    start: from,
    end,
    daysLeft: 0,
    players: [],
    fetchedAt: Date.now(),
  };
  if (end < from) return empty;

  const ctx = await contextFor(from, end);
  if (ctx.daysLeft === 0) return { ...empty, fetchedAt: Date.now() };

  // The same fill the matchup runs, over the reader's own team — so the two
  // cannot disagree about who starts on Saturday. Absent for a watchlist, and
  // absent rather than guessed at where the league published no slot counts.
  const plan = fantasy
    ? planLineups(
        fantasy.roster,
        ctx,
        lineupSlotsFor(fantasy.leagueId),
        await getPlayerPool()
          .then((pool) => pool.slots)
          .catch(() => ({}) as Record<number, number[]>),
        fantasy.categories,
      )
    : null;

  const out: ProjectedPlayerLine[] = [];
  for (const p of players) {
    const key = `${p.kind}-${p.id}`;
    const entry = plan?.get(key) ?? null;
    /** The seated half, projected a second time over the days he holds a seat
     *  — a second pass rather than the first one scaled, because the days are
     *  not interchangeable: each carries its own opponent-quality multiplier,
     *  and a factor would quietly average them. */
    const seatedOf = (): ProjectedPlayerLine['lineup'] => {
      if (!plan) return null;
      const allow = daysOf(entry ?? undefined);
      const b: Bucket = {};
      let chances = 0;
      if (p.kind === 'pitcher') {
        const m = projectOnePitcher(ctx, p.id, b, allow);
        chances = m.starts + m.reliefGames;
      } else {
        chances = projectOneBatter(ctx, p.id, b, allow).games;
      }
      return {
        days: [...(entry?.seats ?? new Map<string, number>())]
          .sort(([a], [c]) => (a < c ? -1 : a > c ? 1 : 0))
          .map(([day, slot]) => ({ day, slot: LINEUP_SLOT_NAMES[slot] ?? String(slot) })),
        openDays: entry?.open ?? [],
        chances: round1(chances),
        batting: p.kind === 'pitcher' || chances <= 0 ? null : battingOf(b),
        pitching: p.kind === 'pitcher' && chances > 0 ? pitchingOf(b) : null,
      };
    };
    const bucket: Bucket = {};
    if (p.kind === 'pitcher') {
      const made = projectOnePitcher(ctx, p.id, bucket);
      const chances = made.starts + made.reliefGames;
      out.push({
        key,
        id: p.id,
        kind: p.kind,
        chances: round1(chances),
        batting: null,
        pitching: chances > 0 ? pitchingOf(bucket) : null,
        lineup: seatedOf(),
      });
    } else {
      const made = projectOneBatter(ctx, p.id, bucket);
      out.push({
        key,
        id: p.id,
        kind: p.kind,
        chances: round1(made.games),
        batting: made.games > 0 ? battingOf(bucket) : null,
        pitching: null,
        lineup: seatedOf(),
      });
    }
  }

  return {
    start: from,
    end,
    daysLeft: ctx.daysLeft,
    players: out,
    fetchedAt: Date.now(),
  };
}
