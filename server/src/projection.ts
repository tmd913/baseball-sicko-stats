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

import { addDays, baseballToday } from './etDate';
import { getSeasonPlayers } from './mlbStats';
import { getResearch } from './research';
import { getScheduleWindow } from './schedule';
import { getTeamHitting } from './teamHitting';
import {
  getMatchupWindow,
  getOwnership,
  getScoreboard,
  tallyCategories,
  withAddedComponents,
  type EspnCategory,
  type EspnCreds,
  type EspnRosterPlayer,
} from './espn';
import type {
  ResearchRow,
  RotationProjection,
  ScheduleGame,
  TeamHittingSplit,
} from './types';

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
 * **reliever** per *appearance*, which is his club's remaining games times how
 * often he has actually been used. Both are per **out** underneath, because
 * outs are what a pitcher's rates are over and what ERA and WHIP divide by.
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
): void {
  const outs = num(row.outs);
  const games = num(row.games);
  const gs = num(row.gamesStarted);
  const denom = starterView ? gs : games;
  if (outs <= 0 || denom <= 0 || mults.length === 0) return;

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
  const wPer = num(row.wins) / denom;
  const lPer = num(row.losses) / denom;
  const svPer = num(row.saves) / denom;
  const hdPer = num(row.holds) / denom;

  for (const m of mults) {
    const km = inverse(m);
    const o = outsPer;
    add(into, PIT.gp, 1);
    if (starterView) add(into, PIT.gs, 1);
    add(into, PIT.outs, o);
    add(into, PIT.tbf, tbfRate * o * m);
    add(into, PIT.h, hRate * o * m);
    add(into, PIT.bb, bbRate * o * m);
    add(into, PIT.hbp, hbpRate * o * m);
    add(into, PIT.hr, hrRate * o * m);
    add(into, PIT.er, erRate * o * m);
    add(into, PIT.r, rRate * o * m);
    add(into, PIT.k, kRate * o * km);
    add(into, PIT.w, wPer * km);
    add(into, PIT.l, lPer * m);
    add(into, PIT.sv, svPer * km);
    add(into, PIT.hd, hdPer * km);
    add(into, PIT.svhd, (svPer + hdPer) * km);
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
 * A club's remaining games in the period.
 *
 * **Today counts only where its game has not started**, which is the one rule
 * that keeps this from double-counting: the live scoreboard's own figure already
 * holds today's production (`withAddedComponents` adds it), so a game that is
 * `live` or `final` is spoken for. A **postponement is not a game he gets**,
 * which is `schedule.ts`'s own rule and the one error that would make a game
 * count lie.
 */
function remainingGames(games: ScheduleGame[], today: string, end: string): Map<number, ScheduleGame[]> {
  const out = new Map<number, ScheduleGame[]>();
  for (const g of games) {
    if (g.date < today || g.date > end) continue;
    if (g.state === 'postponed') continue;
    if (g.date === today && g.state !== 'scheduled') continue;
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
 * **How often a player is actually in his club's game**, as a share of it.
 *
 * The *recent* window where there is one, and that is the point rather than a
 * refinement: a season ratio is wrong in the one direction that matters most for
 * a projection, because a **call-up** has thirty games of a club's hundred and
 * twenty and would be projected to play a quarter of the week — when he is the
 * everyday shortstop now. `getTeamHitting(30)` already carries each club's games
 * over the same span, so the numerator and the denominator are the same month.
 *
 * The season ratio is the fallback for a man who has not appeared in the last
 * thirty days at all, where it is the only evidence there is; and 1 is the
 * fallback under both, since a player nothing can be said about is better
 * projected as an everyday one than as absent.
 *
 * **Measured on the live league**, this is what the first version was missing:
 * projecting every hitter into every remaining club game put the twelve teams'
 * runs at 0.58 per player-game against the 0.41 the same period had actually
 * produced, a 40% over-count that this share is very nearly all of.
 */
function playShareOf(
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

/** One team's expected remaining production, and what it was made of. */
function projectTeam(
  roster: EspnRosterPlayer[],
  pools: Pools,
  remaining: Map<number, ScheduleGame[]>,
  starters: Map<number, Set<number>>,
  clubGames: Map<number, number>,
  clubGamesRecent: Map<number, number>,
): { bucket: Bucket; hitterGames: number; starts: number; reliefGames: number; skipped: number } {
  const bucket: Bucket = {};
  let hitterGames = 0;
  let starts = 0;
  let reliefGames = 0;
  let skipped = 0;

  for (const p of roster) {
    // A bench or IL slot accrues nothing, which is `NON_ACCRUING_SLOTS`' own
    // rule one level up — and the assumption this whole file rests on: the
    // lineup a manager has set today stands for the rest of the week.
    if (!p.starting || p.mlbId === null) continue;
    const id = p.mlbId;
    const isPitcher = p.kinds.includes('pitcher') && !p.kinds.includes('batter');
    const twoWay = p.kinds.includes('pitcher') && p.kinds.includes('batter');

    if (!isPitcher) {
      const row = pools.batSeason.get(id);
      if (!row || row.teamId === null) {
        skipped += 1;
      } else {
        const games = remaining.get(row.teamId) ?? [];
        const mults = games.map((g) => {
          const oppSide = g.homeId === row.teamId ? g.awayId : g.homeId;
          const named = [...(starters.get(g.gamePk) ?? [])].find((sid) => {
            const sp = pools.pitSeason.get(sid);
            return sp ? sp.teamId === oppSide : false;
          });
          return batterGameMult(pools, id, named ?? null);
        });
        const recent = pools.batRecent.get(id) ?? null;
        const share = playShareOf(
          row,
          recent,
          clubGames.get(row.teamId) ?? 0,
          clubGamesRecent.get(row.teamId) ?? 0,
        );
        // What the projection is actually built on, which is what the reader is
        // told: his club's remaining games times the share of them he plays.
        hitterGames += mults.length * share;
        projectBatter(row, recent, mults, share, bucket);
      }
    }

    if (isPitcher || twoWay) {
      const row = pools.pitSeason.get(id);
      if (!row || row.teamId === null) {
        if (!twoWay) skipped += 1;
        continue;
      }
      const games = remaining.get(row.teamId) ?? [];
      const oppOf = (g: ScheduleGame): number => (g.homeId === row.teamId ? g.awayId : g.homeId);
      // His own turns: every remaining game he is named for or projected into.
      const his = games.filter((g) => starters.get(g.gamePk)?.has(id) === true);
      // A **majority of his appearances are starts** is the app's one definition
      // of a rotation starter (`isRotationStarter`), and it is what decides which
      // of the two shapes he is projected in.
      const isStarter = num(row.gamesStarted) * 2 > num(row.games);
      if (isStarter) {
        const mults = his.map((g) => pitcherGameMult(pools, id, oppOf(g)));
        starts += mults.length;
        projectPitcher(row, pools.pitRecent.get(id) ?? null, mults, true, bucket);
      } else {
        // A reliever's chances are his club's games times how often he has
        // actually been used — `playShareOf`'s own figure, which reads the last
        // thirty days where it can for the reason that function gives: a man
        // just brought up out of the bullpen is being used now rather than at
        // his season rate.
        const rate = playShareOf(
          row,
          pools.pitRecent.get(id) ?? null,
          clubGames.get(row.teamId) ?? 0,
          clubGamesRecent.get(row.teamId) ?? 0,
        );
        const count = Math.round(games.length * rate);
        const mults = games.slice(0, count).map((g) => pitcherGameMult(pools, id, oppOf(g)));
        reliefGames += mults.length;
        projectPitcher(row, pools.pitRecent.get(id) ?? null, mults, false, bucket);
      }
    }
  }
  return { bucket, hitterGames, starts, reliefGames, skipped };
}

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

  const [ownership, schedule, batSeason, batRecent, pitSeason, pitRecent, players] =
    await Promise.all([
      getOwnership(creds),
      getScheduleWindow(),
      getResearch('batter', 'season'),
      getResearch('batter', RECENT_WINDOW),
      getResearch('pitcher', 'season'),
      getResearch('pitcher', RECENT_WINDOW),
      getSeasonPlayers().catch(() => []),
    ]);

  // Every club that still has a game, so the two hitting boards are read for
  // the clubs that matter rather than all thirty regardless.
  const remaining = remainingGames(schedule.games, today, window.end);
  const clubs = [...new Set([...remaining.keys()])];
  const [recentSplits, seasonSplits] = await Promise.all([
    Promise.all(clubs.map(async (id) => [id, await getTeamHitting(id, RECENT_WINDOW)] as const)),
    Promise.all(clubs.map(async (id) => [id, await getTeamHitting(id, 'season')] as const)),
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

  const starters = startersByGame(schedule.games, schedule.rotations);
  const perTeam = new Map<number, ReturnType<typeof projectTeam>>();
  const project = (teamId: number): ReturnType<typeof projectTeam> => {
    const hit = perTeam.get(teamId);
    if (hit) return hit;
    const made = projectTeam(
      ownership.rosters[teamId] ?? [],
      pools,
      remaining,
      starters,
      clubGames,
      clubGamesRecent,
    );
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

  // How many days are still to be played, today included where its games have
  // not started — which is the same test `remainingGames` applies.
  let daysLeft = 0;
  for (let d = today; d <= window.end; d = addDays(d, 1)) {
    const any = schedule.games.some(
      (g) => g.date === d && g.state !== 'postponed' && (d !== today || g.state === 'scheduled'),
    );
    if (any) daysLeft += 1;
  }

  return {
    matchupPeriod: board.matchupPeriod,
    ok: true,
    note: null,
    end: window.end,
    daysLeft,
    matchups,
    fetchedAt: Date.now(),
  };
}
