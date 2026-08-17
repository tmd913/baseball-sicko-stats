import type {
  ProjectionRefusal,
  RotationProjection,
  ScheduleGame,
  StartTier,
} from './types.js';

/**
 * ---------------------------------------------------------------------------
 * Rotation slots: reading a club's turn off its own schedule
 * ---------------------------------------------------------------------------
 *
 * Everything here is a **pure function over a parsed season schedule**. It owns
 * no fetch and no cache: `schedule.ts` makes the one league-wide read (see
 * `getScheduleWindow`) and hands the games to this file, which is what lets the
 * Schedule view's grid and the player page's Projected Starts block share one
 * definition of a rotation slot rather than each computing its own.
 *
 * **One engine, because two would drift.** The grid draws six hundred rows at
 * once and cannot read a game log per pitcher; the player page reads one man
 * and could. Two sources would mean a reader seeing a projected start on 8/21
 * on the board and 8/22 on the page it opens — the exact "two answers to one
 * question" this codebase spends its comments avoiding. So both read the same
 * games, through the same `projectStarts`, on the same constants.
 *
 * ### Who started a game, without a game log
 *
 * The whole method rests on one measurement: **MLB keeps `probablePitcher` on a
 * game that has already been played**, for both sides. Checked league-wide over
 * the 2026 season, **1,866 of 1,868 finals carry both** (the two exceptions
 * carry one side and no more). So one schedule read names the starter of every
 * game of the season — which is the *only* league-scale source there is, the
 * alternative being one game-log call per pitcher.
 *
 * **It is the announced probable rather than the man who actually took the
 * ball**, and the difference is a scratch. Measured against the game logs of 40
 * starters over **608 real starts: 7 games announced to somebody who did not
 * start, and 1 start by somebody who was not announced** — 98.7% agreement.
 * That is immaterial to what it is used for, a **median** over twenty-odd gaps
 * being unmoved by one game either way, and it was checked end to end rather
 * than argued: against the player page's own game-log-driven route, the two
 * agree on the projected `gamePk` list for **58 of 60** starters, and both
 * differences are the improvement below rather than a disagreement (a
 * `too-few-starts` refusal became a five-row projection).
 *
 * ### What it is worth
 *
 * Back-tested against real announcements — blinding every future probable and
 * re-deriving the next turn — a pitcher's **own** cadence lands his next start
 * **41 of 51 exact (80.4%) and 51 of 51 within a day**, and his **club's** stands
 * in for it **9 of 9**. Every miss is a calendar day either side, which is what a
 * turn counted in club games does around an off day.
 *
 * And the two surfaces provably agree: over 40 sampled pitchers, every projected
 * row the player page draws inside the Schedule view's window is on the grid, at
 * the same tier and the same cadence — **40 of 40** — and an independent
 * re-implementation of this file reproduces the whole league-wide map, **335 of
 * 335** pitchers.
 */

/** One game of a club's run, as a rotation is read off it. */
export interface RunGame {
  gamePk: number;
  /** The ET day it counts on. */
  date: string;
  /** Whoever this club was announced to start — null where nobody was named. */
  starter: number | null;
}

/**
 * The season, reduced to what a rotation is read from.
 *
 * `runs` is the load-bearing one: a club's games in order, which is the
 * coordinate system the whole file works in. See `cadenceOf` for why a turn is
 * counted in club games rather than in days.
 */
export interface SeasonRuns {
  /** club id → its games in order, postponements dropped. */
  runs: Map<number, RunGame[]>;
  /** club id → how many of its games a rotation turn takes there. */
  cadences: Map<number, number>;
  /** player id → the club he has most recently been named to start for. */
  clubs: Map<number, number>;
  /** player id → how many games he has started anywhere this season, which is
   *  what tells a man with no slot at this club from a man with no slot at all. */
  startsAnywhere: Map<number, number>;
}

/**
 * The fewest starts we will read a pitcher's **own** cadence off. Two
 * consecutive gaps is a thin median and it is what a mid-season call-up has
 * after three turns; measured against the season, raising the bar to five starts
 * moves the next-start hit rate by three tenths of a point (80.7% against
 * 81.0%), so the stricter rule buys nothing.
 *
 * Under it he is not refused any more — he takes **his club's** cadence and the
 * row says so. See `clubCadence`.
 */
const MIN_STARTS = 3;

/**
 * The widest gap between two starts we will treat as **consecutive turns**. A
 * rotation turn is four to seven club games; anything longer is an IL stint, a
 * demotion or a spell in the bullpen, and folding it into the median would
 * invent a cadence nobody pitches on. Nine leaves room for a six-man stretch and
 * an off-day week without letting a fortnight in.
 */
const MAX_TURN_GAP = 9;

/**
 * How many turns he may have missed and still be placed. His slot is a fact
 * about the rotation *as it stands*, and a man whose last start was two turns
 * ago is a man something has happened to. An announcement re-anchors him and
 * this guard never applies; without one, refusing is the honest answer —
 * measured on the live board, this is what keeps **164 of the 335 pitchers with
 * a start to their name** off the grid, and every one of them is an opener, a
 * spot starter or a long reliever whose one start was months ago.
 */
const MAX_TURNS_MISSED = 2;

/**
 * How many club games in a row may have somebody else announced before we stop
 * projecting. One is an ordinary shuffle (a bullpen game, a spot start, a
 * doubleheader); three in a row past his own slot means the rotation has been
 * re-ordered and we no longer know his phase — at which point a shorter list is
 * better than a longer wrong one.
 */
const MAX_SLIP = 3;

/**
 * How many of a club's most recent games its own cadence is read off.
 *
 * **Recent rather than the whole season, and that is a measurement.** Pooling
 * every gap of the season gives 29 clubs a turn of 5 and one of 6; pooling the
 * last thirty gives **two** clubs a 6 — and the second of them (Milwaukee, whose
 * season figure is 5 and whose last thirty, forty and twenty games all read 6)
 * is a club that has gone to a six-man since the summer. A club that changes its
 * rotation is exactly the case this number exists to catch, and the season pool
 * cannot see it.
 *
 * Thirty is about six turns and yields **~21 pooled gaps** per club, which is
 * plenty for a stable median: at twenty games the pool thins to ~13 and one club
 * flips against both wider windows.
 */
const CLUB_WINDOW = 30;

/** The middle of an odd list, the mean of the middle two of an even one. */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The gaps between consecutive starts, dropped where one is too wide to be a
 *  turn — see `MAX_TURN_GAP`. */
function turnGaps(positions: number[]): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < positions.length; i += 1) {
    const gap = positions[i] - positions[i - 1];
    if (gap >= 1 && gap <= MAX_TURN_GAP) gaps.push(gap);
  }
  return gaps;
}

/**
 * How many club games **this pitcher's** turn takes, off the gaps between the
 * starts he has actually made — 5 for an ordinary five-man rotation, 6 for a
 * club running six, 4 for a club that has been leaning on four.
 *
 * **Counted in team games rather than days**, which is the whole trick: an off
 * day, a rain-out and the All-Star break all push a rotation back by exactly the
 * days they take out of the calendar, and none of them takes a turn out of the
 * run of games. Days would have to model every one of those; an index into the
 * club's own schedule models none of them and gets them all right.
 *
 * **The median rather than the mean**, because the outliers are the interesting
 * half of a pitcher's season: one IL stint of a month is a single gap of twenty
 * team games, which drags a mean off any real rotation and leaves the median
 * where it was.
 *
 * **No plausibility floor**, which was measured rather than assumed. A reliever
 * who makes two spot starts in a week reads a cadence of 2, and a clamp to a
 * believable 3–7 looked worth having until it was counted: across the whole
 * league exactly **one** pitcher's own cadence falls outside 3–7, and he is
 * refused by `MAX_TURNS_MISSED` before it could matter. Among the 149 pitchers
 * who actually get rows the distribution is 4:1, 5:135, 6:11, 7:2 — so the
 * clamp would fire for nobody, and a guard that fires for nobody is a number
 * that cannot be checked.
 */
export function cadenceOf(positions: number[]): number | null {
  const gaps = turnGaps(positions);
  if (gaps.length < MIN_STARTS - 1) return null;
  return Math.max(1, Math.round(median(gaps)));
}

/**
 * How many games a turn takes **at this club**, pooled over everybody who has
 * started for it lately.
 *
 * This is the answer for a pitcher with no cadence of his own — a call-up, a man
 * traded in last week, a fifth starter who has made two turns — and it is what
 * makes the grid able to place him at all. Every one of the club's recent
 * starters contributes his own gaps to one pool, so a club gets ~21 gaps where
 * a single pitcher gets two.
 *
 * **It is a good proxy, measured two ways.** Where a pitcher has both, the
 * club's figure equals his own for **207 of 225** (92.0%); and back-testing
 * against real announcements — blinding every future probable and re-deriving —
 * the club cadence lands on his actual next start **9 of 9**, against the own
 * cadence's **41 of 51 exact and 51 of 51 within a day**.
 */
export function clubCadence(run: RunGame[], today: string): number | null {
  const past: number[] = [];
  const byStarter = new Map<number, number[]>();
  for (let i = 0; i < run.length; i += 1) {
    const g = run[i];
    if (g.date > today || g.starter === null) continue;
    past.push(i);
  }
  // The last `CLUB_WINDOW` games it has played, which is what makes a club that
  // has changed its rotation read as the rotation it is running now.
  for (const i of past.slice(-CLUB_WINDOW)) {
    const id = run[i].starter as number;
    const list = byStarter.get(id);
    if (list) list.push(i);
    else byStarter.set(id, [i]);
  }
  const pool: number[] = [];
  for (const positions of byStarter.values()) pool.push(...turnGaps(positions));
  if (pool.length === 0) return null;
  return Math.max(1, Math.round(median(pool)));
}

/**
 * A postponement is not a turn: nobody pitched, so it consumed nobody's slot, and
 * counting it would put a phantom game in the club's run and shift every slot
 * after it by one.
 *
 * **The makeup is the same game under the same id**, which is worth stating
 * because the obvious assumption is the other one: MLB reuses the `gamePk` and
 * lists the entry twice, once under the original date marked `Postponed` and once
 * under the makeup date. `schedule.ts::dedupe` collapses that pair before this
 * file sees it, keeping the copy that is not postponed — so a made-up game is one
 * game in the run, on the day it was actually played, and only a game called off
 * with no makeup yet reaches this filter.
 */
function countsAsTurn(g: ScheduleGame): boolean {
  return g.state !== 'postponed';
}

/**
 * The season, reduced to a run of games per club plus the two lookups a
 * projection needs.
 *
 * **A pitcher's club is the club he was most recently named to start for**,
 * future announcements included, which is what makes a trade fall out rather
 * than needing a rule: a pitcher traded a fortnight ago has his recent starts in
 * his new club's run and is placed there, on that club's cadence, because his
 * own gaps for it are too few. Where he has not yet pitched *or* been named for
 * the new club there is nothing in this payload that says he has moved, and the
 * two readers fail differently and both safely — see `projectStarts`.
 */
export function buildSeasonRuns(games: ScheduleGame[], today: string): SeasonRuns {
  const runs = new Map<number, RunGame[]>();
  const clubs = new Map<number, number>();
  const latest = new Map<number, string>();
  const startsAnywhere = new Map<number, number>();
  // `games` arrives in date-and-gamePk order from `schedule.ts`, which is the
  // order the whole method is an index into.
  for (const g of games) {
    if (!countsAsTurn(g)) continue;
    for (const [teamId, starter] of [
      [g.homeId, g.homeProbableId],
      [g.awayId, g.awayProbableId],
    ] as const) {
      if (!teamId) continue;
      const run = runs.get(teamId);
      if (run) run.push({ gamePk: g.gamePk, date: g.date, starter });
      else runs.set(teamId, [{ gamePk: g.gamePk, date: g.date, starter }]);
      if (starter === null) continue;
      const seen = latest.get(starter);
      if (seen === undefined || g.date > seen) {
        latest.set(starter, g.date);
        clubs.set(starter, teamId);
      }
      if (g.date <= today) startsAnywhere.set(starter, (startsAnywhere.get(starter) ?? 0) + 1);
    }
  }
  const cadences = new Map<number, number>();
  for (const [teamId, run] of runs) {
    const cadence = clubCadence(run, today);
    if (cadence !== null) cadences.set(teamId, cadence);
  }
  return { runs, cadences, clubs, startsAnywhere };
}

/**
 * Which club's schedule to project him against.
 *
 * **The roster's answer wins where we have a schedule for it**: it is the app's
 * own answer to "whose club is he on" and it is right about a trade *before* he
 * has pitched for the new club, where the schedule cannot be. Anything else falls
 * back to the club he was most recently named to start for — a **minor-league**
 * club on a rehab assignment (checked on the live season: Edward Cabrera's
 * `currentTeam` is the Knoxville Smokies, which has no major-league schedule at
 * all), an unreadable roster, a pitcher no roster lists.
 *
 * **One function because two readers had two rules and drifted.** The grid used
 * the appearance club and the player page the roster club, and on the one pitcher
 * where those differed — Miles Mikolas, on Washington's roster with his starts
 * behind him at St. Louis — the page drew five projected starts and the grid drew
 * none. That is the "two answers to one question" this whole file exists to
 * prevent, and it is only prevented while the club is chosen in one place.
 */
export function clubFor(
  season: SeasonRuns,
  playerId: number,
  rosterTeam: number | null,
): number | null {
  if (rosterTeam !== null && season.runs.has(rosterTeam)) return rosterTeam;
  return season.clubs.get(playerId) ?? null;
}

/** Where in a club's run he has started, past games only. */
export function startPositions(run: RunGame[], playerId: number, today: string): number[] {
  const positions: number[] = [];
  for (let i = 0; i < run.length; i += 1) {
    if (run[i].starter === playerId && run[i].date <= today) positions.push(i);
  }
  return positions;
}

/** One projected turn: where in the club's run, and how much of a guess it is. */
export interface ProjectedTurn {
  index: number;
  tier: StartTier;
}

export interface Projection {
  /** In run order — announced first where they are first, since they are. */
  turns: ProjectedTurn[];
  /** The cadence the projected turns were stepped on, null where none ran. */
  cadence: number | null;
  /** Which cadence that was: `projected` off his own record, `estimated` off
   *  his club's. Meaningless where `turns` holds nothing but announcements. */
  tier: StartTier;
  refusal: ProjectionRefusal | null;
}

/**
 * A pitcher's next turns: the ones his club has named him for, and, past those,
 * the ones his rotation slot puts him in.
 *
 * **The method, in one paragraph.** Take the club's run of games. Find the
 * positions in it of the games he has started; the median gap between
 * consecutive ones is his cadence, and where he has too few starts of his own
 * his club's pooled cadence stands in. Anchor on the latest start we know of —
 * an announced future one if there is one, **today's included**, otherwise his
 * last actual start — and step forward a cadence at a time over the games still
 * to be played. A slot MLB has already given to somebody else is not his, so it
 * is skipped and the rest re-phased from wherever he lands, because a missed
 * turn shifts everything after it.
 *
 * **Three tiers, never mixed on one row.** `announced` is MLB's fact;
 * `projected` is his own measured pace; `estimated` is his club's rotation
 * standing in where his own record is too thin to read. The two readers draw all
 * three differently, which is the app's standing rule that an estimate is marked
 * as one.
 *
 * **What it still refuses.** A pitcher who has started nothing has no slot
 * (`not-a-starter`); a pitcher whose starts all belong to the club that traded
 * him and whom this one has not named has no slot here yet (`new-club`); a
 * pitcher **off the active roster** is not making a start whatever his slot says
 * (`off-roster`); a pitcher whose last start was more than two turns ago is a
 * pitcher something has happened to (`out-of-rotation`); and a club too early in
 * its season to have a turn to read has none to lend (`too-few-starts`).
 * Whatever *is* announced still comes back in every one of those, because an
 * announcement is a fact whatever can or cannot be inferred around it.
 */
export function projectStarts({
  run,
  playerId,
  today,
  positions,
  clubTurn,
  startedElsewhere,
  projectable = true,
  want,
  through = null,
}: {
  run: RunGame[];
  playerId: number;
  today: string;
  /** His start positions in *this* club's run — `startPositions`. */
  positions: number[];
  /** His club's own cadence, for the `estimated` tier. */
  clubTurn: number | null;
  /** Has he started anywhere else this season? — what tells `new-club` from
   *  `not-a-starter`. */
  startedElsewhere: boolean;
  /**
   * Is he available to be projected at all? — false for a pitcher **off the
   * active roster**, which is the feed's Upcoming rule arriving here: a man on
   * the IL or in the minors is not making a start his rotation slot happens to
   * fall on. Measured on the live board, 10 of the 170 pitchers with a slot
   * (6%) are in that state — 5 on the 15-day IL and 5 in the minors — so it is
   * a small correction and a wrong claim without it.
   *
   * **Announced turns are unaffected**, a club naming a returning starter before
   * the transaction posts being ordinary. And it defaults true, so a caller who
   * cannot read a roster keeps projecting rather than emptying the grid.
   *
   * **Only a *positive* answer holds him back.** A pitcher on no 40-man roster at
   * all is ambiguous — released, or a club whose roster read failed — and those
   * two cannot be told apart from here, so he stays projectable: a failed read
   * for one club must not silently drop that club's whole rotation from the grid,
   * and a pitcher who really has gone falls out inside two turns by
   * `MAX_TURNS_MISSED` anyway. It is the direction every join in this app fails
   * in, and getting it backwards is a mistake this once made: treating absence as
   * "off the roster" dropped Miles Mikolas — eleven starts for Washington, on
   * nobody's 40-man — from the grid while the player page went on projecting him.
   */
  projectable?: boolean;
  /** At most this many turns. */
  want: number;
  /** And none past this day, for a caller drawing a fixed window of columns. */
  through?: string | null;
}): Projection {
  // **Everything his club has named him for, today's start included** — which
  // is a wider set than the rows, and the distinction is load-bearing. A start
  // *today* is the most recent thing known about his slot and the one the anchor
  // most needs; it is also invisible in `positions`, which comes off games
  // already played. Reading only future announcements anchored a pitcher on his
  // previous turn and placed his next one days early — measured over all 29
  // announced starters on one afternoon, 24 of them wrong.
  const namedAt: number[] = [];
  for (let i = 0; i < run.length; i += 1) {
    if (run[i].date >= today && run[i].starter === playerId) namedAt.push(i);
  }
  const inWindow = (i: number) => through === null || run[i].date <= through;
  // **The rows are the future ones alone.** A start today belongs to the day the
  // caller is already drawing, not to a list of what is coming.
  const turns: ProjectedTurn[] = namedAt
    .filter((i) => run[i].date > today && inWindow(i))
    .slice(0, want)
    .map((index) => ({ index, tier: 'announced' as StartTier }));

  const own = cadenceOf(positions);
  // His own pace where he has one, his club's where he hasn't — and the tier
  // says which, so a reader is never told a club's rotation is his record.
  const cadence = own ?? clubTurn;
  const tier: StartTier = own !== null ? 'projected' : 'estimated';
  const lastPlayed = run.reduce((acc, g, i) => (g.date <= today ? i : acc), -1);

  let refusal: ProjectionRefusal | null = null;
  if (positions.length === 0 && namedAt.length === 0) {
    refusal = startedElsewhere ? 'new-club' : 'not-a-starter';
  } else if (!projectable) {
    // He has a slot and is not available to fill it. Whatever his club has
    // already named him for still stands above this.
    refusal = 'off-roster';
  } else if (cadence === null) {
    // Neither his own record nor his club's is long enough to read a turn off,
    // which past the first week of a season means a club whose games this
    // schedule does not carry.
    refusal = 'too-few-starts';
  } else {
    // The latest start we know of. An announcement outranks his own history: it
    // is his club saying where he is in the rotation *now*, which is the very
    // thing the cadence is being used to infer. A name of any date therefore
    // clears the missed-turns guard too — that guard is for a pitcher nobody has
    // named at all, whose last start is the only evidence there is.
    const anchor = namedAt.length ? namedAt[namedAt.length - 1] : positions[positions.length - 1];
    const missed = namedAt.length ? 0 : Math.max(0, lastPlayed - anchor) / cadence;
    if (missed > MAX_TURNS_MISSED) {
      refusal = 'out-of-rotation';
    } else {
      let pos = anchor + cadence;
      let slips = 0;
      while (turns.length < want && pos < run.length && inWindow(pos)) {
        const g = run[pos];
        // Only games still to be played: one today is the caller's own day, and
        // one already behind us is not a start.
        if (g.date <= today) {
          pos += 1;
          continue;
        }
        if (g.starter !== null && g.starter !== playerId) {
          // Somebody else has the ball. His turn slid rather than vanished, so
          // step one game on and re-phase from wherever he actually lands —
          // until it is clear the rotation has been re-ordered under us.
          if (slips >= MAX_SLIP) break;
          slips += 1;
          pos += 1;
          continue;
        }
        slips = 0;
        turns.push({ index: pos, tier: g.starter === playerId ? 'announced' : tier });
        pos += cadence;
      }
    }
  }

  turns.sort((a, b) => a.index - b.index);
  return {
    turns: turns.slice(0, want),
    cadence: refusal === null ? cadence : null,
    tier,
    refusal,
  };
}

/**
 * Every pitcher in the league's projected turns, keyed by player id — what the
 * Schedule view's grid marks its cells from.
 *
 * **One pass over the season, no upstream of its own, and no per-player read.**
 * That is the whole reason this is possible at all: the grid draws six hundred
 * rows, and the answer for each is a function of his club's schedule and his own
 * place in it, both of which are already in the payload `schedule.ts` has
 * fetched.
 *
 * **Only the turns nobody has announced are sent.** An announced start is
 * already on the wire — it is `ScheduleGame.homeProbableId` — so repeating it
 * here would be the same fact in two places, free to disagree the day one of
 * them is filtered differently. The client marks a cell `announced` off the game
 * and `projected`/`estimated` off this map, and the two cannot overlap because
 * `projectStarts` never places a projected turn on a game somebody is named for.
 *
 * `through` bounds it to the window the client will actually draw: a grid is a
 * fixed run of columns and every day in it should be marked, where a count of
 * turns would run out early on a four-man cadence and over-reach on a six.
 *
 * A pitcher with nothing to project is **absent from the map** rather than
 * present and empty, which is the rule `/api/statuses` follows for a player with
 * nothing true of him: on the live board that is 165 of the 335 pitchers who
 * have started a game, and sending them would be a payload saying nothing. A
 * pitcher off the active roster is absent for the same reason and a different
 * cause — see `projectable`.
 */
export function buildRotations(
  season: SeasonRuns,
  today: string,
  through: string,
  /** The players MLB has **positively off** an active roster — on the IL, in the
   *  minors, on a paternity list. A pitcher merely absent from it is not held
   *  back; see `projectStarts`'s `projectable` for why absence has to mean
   *  "unknown" rather than "off". */
  offRoster: Set<number> | null = null,
  /** Player id → the club his 40-man roster spot is on, which is what
   *  `clubFor` prefers. Null where the rosters could not be read. */
  rosterClubs: Map<number, number> | null = null,
): Map<number, RotationProjection> {
  const out = new Map<number, RotationProjection>();
  // Everybody who has been named to start anywhere this season, which is every
  // pitcher who could have a slot — a man who has never been named for one has
  // no rotation to read and nothing to project.
  for (const playerId of season.clubs.keys()) {
    const teamId = clubFor(season, playerId, rosterClubs?.get(playerId) ?? null);
    const run = teamId === null ? undefined : season.runs.get(teamId);
    if (teamId === null || !run) continue;
    const positions = startPositions(run, playerId, today);
    const p = projectStarts({
      run,
      playerId,
      today,
      positions,
      clubTurn: season.cadences.get(teamId) ?? null,
      startedElsewhere: (season.startsAnywhere.get(playerId) ?? 0) > positions.length,
      projectable: !offRoster?.has(playerId),
      // A generous cap rather than the page's five: the window is 28 days and a
      // four-game cadence fits seven turns in it. It is a runaway guard, not a
      // count — `through` is what actually ends the walk.
      want: 12,
      through,
    });
    const starts = p.turns.filter((t) => t.tier !== 'announced').map((t) => run[t.index].gamePk);
    if (starts.length === 0 || p.cadence === null) continue;
    out.set(playerId, { cadence: p.cadence, estimated: p.tier === 'estimated', starts });
  }
  return out;
}
