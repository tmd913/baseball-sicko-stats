import { parse } from 'csv-parse/sync';
import { readGzipBlob, writeGzipBlob, readJsonBlob, writeJsonBlob } from './storage.js';
import { downloadDayCsv } from './savant.js';
import { addDays, baseballToday, daysBetween } from './etDate.js';
import { mapLimit } from './limit.js';
import { getTeamAbbrevs } from './mlbStats.js';
import type {
  TeamHitting,
  TeamHittingLine,
  TeamHittingRanks,
  TeamHittingSplit,
  TeamHittingVenue,
  TeamHittingWindow,
} from './types.js';

/**
 * How every team has hit — over one of the research board's five windows, at
 * home or away or both, and against each hand on the mound. The nine cuts a
 * watched pitcher's opponent table is made of.
 *
 * **Why this is computed rather than read.** MLB publishes a team's season
 * line, its `vl`/`vr` platoon splits and its `h`/`a` home-road splits, each
 * exactly and for free — and it publishes **no combination and no window**.
 * Probed rather than assumed: `stats=byDateRange` answers for a team over a
 * range and **ignores `sitCodes` entirely** (the same 30 unsplit rows come
 * back), while `stats=statSplits` accepts a `startDate`/`endDate` and **ignores
 * the range** (109 games on a 14-day query, i.e. the whole season). There is no
 * compound situation code either: the 602 codes MLB lists include `h`, `a`,
 * `vl` and `vr` and nothing that crosses them, and the `vls`/`vrs` starter
 * splits return nothing at all for a team. So a windowed or home-only platoon
 * split cannot be asked for, only summed.
 *
 * **So it is summed a day at a time from the per-date Savant export**, which is
 * the same file `statcastWindow.ts` already reduces for the research board and
 * the same rule: everything stored per day is a **count**, never a rate, and
 * the rates are computed once at the end from the summed counts. Each day is
 * reduced to at most 30 × 4 buckets — team, hand on the mound, home or away —
 * from which all nine cuts fall out by addition, so the four leaves cannot come
 * to disagree with the three rows drawn from them.
 *
 * **Checked against MLB's own published numbers rather than spot-checked.**
 * Reconstructing the whole season from the cached daily exports and comparing
 * every team against MLB's season line and its `vl`, `vr`, `h` and `a` splits:
 * **0 mismatches over 30 teams × 5 cuts × 8 fields — 1,200 cells** — on plate
 * appearances, at-bats, hits, home runs, walks, strikeouts, total bases and
 * runs alike, with all 30 clubs present on both sides and Savant's
 * abbreviations identical to MLB's.
 */

// ---- Counts ----------------------------------------------------------------

/** One bucket. Rates are never stored; see the note above. */
interface HitCounts {
  pa: number;
  ab: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  walks: number;
  hitByPitch: number;
  strikeOuts: number;
  sacFlies: number;
  totalBases: number;
  runs: number;
  /** Distinct `game_pk`s in **this leaf** — games in which the club faced this
   *  hand at this venue. It is a count rather than a set because two days never
   *  share a game, so it adds; what it deliberately cannot do is add across the
   *  *hand* axis, almost every game featuring both. See `DayHitting.games`. */
  games: number;
}

function empty(): HitCounts {
  return {
    pa: 0, ab: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, walks: 0,
    hitByPitch: 0, strikeOuts: 0, sacFlies: 0, totalBases: 0, runs: 0, games: 0,
  };
}

function add(a: HitCounts, b: HitCounts): void {
  a.pa += b.pa; a.ab += b.ab; a.hits += b.hits; a.doubles += b.doubles;
  a.triples += b.triples; a.homeRuns += b.homeRuns; a.walks += b.walks;
  a.hitByPitch += b.hitByPitch; a.strikeOuts += b.strikeOuts;
  a.sacFlies += b.sacFlies; a.totalBases += b.totalBases; a.runs += b.runs;
  a.games += b.games;
}

// ---- Classifying one plate appearance ---------------------------------------
//
// `events` is set on the pitch that ended something. Most of those somethings
// are plate appearances and a few are not, so the not-a-PA list is what decides
// the denominator of every rate below. It is a **denylist**, the same direction
// `QUIET_ACTIONS` fails in: an event kind MLB adds later counts as a plate
// appearance and shows up as a number being slightly off, where an allowlist
// would silently drop it and read as a quiet season.

const BASES: Record<string, number> = { single: 1, double: 2, triple: 3, home_run: 4 };

/** Reached base or made an out without an official at-bat. */
const NOT_AT_BAT = new Set([
  'walk', 'intent_walk', 'hit_by_pitch', 'catcher_interf',
  'sac_fly', 'sac_fly_double_play', 'sac_bunt', 'sac_bunt_double_play',
]);

/** Ended something other than a plate appearance — a runner's business, or the
 *  inning ending underneath one (`truncated_pa`, which MLB does not count). */
const NOT_A_PA = new Set([
  'caught_stealing_2b', 'caught_stealing_3b', 'caught_stealing_home',
  'pickoff_1b', 'pickoff_2b', 'pickoff_3b',
  'pickoff_caught_stealing_2b', 'pickoff_caught_stealing_3b',
  'pickoff_caught_stealing_home',
  'stolen_base_2b', 'stolen_base_3b', 'stolen_base_home',
  'wild_pitch', 'passed_ball', 'balk', 'other_out', 'runner_double_play',
  'game_advisory', 'truncated_pa', 'ejection', 'defensive_switch',
  'pitcher_switch', 'runner_placed',
]);

const num = (v: string | undefined): number => {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ---- One day ----------------------------------------------------------------
//
// Keyed `ABBR|hand|venue`, where hand is the `p_throws` of the man who threw
// the pitch and venue is H or A **for the batting team**. Four leaves per club
// per day; the nine cuts are sums of them.

interface DayHitting {
  /** `ABBR|hand|venue` — the four leaves everything but the game count is
   *  summed out of. */
  leaves: Record<string, HitCounts>;
  /**
   * `ABBR|venue` → distinct games, which is the one quantity that does **not**
   * fall out of the leaves: nearly every game features both hands, so adding
   * the two leaves' counts would tell a club it had played twice as often as it
   * has. A game is at exactly one venue and belongs to one day, so this adds
   * across both of the axes it is asked to.
   */
  games: Record<string, number>;
}

/** `-v1`. A stored blob holds sums, so this is bumped whenever `HitCounts`
 *  gains a field, exactly as the Statcast day counts beside it are. A bump
 *  costs a re-parse off the day CSVs `savant.ts` keeps forever, not a
 *  re-download. */
const dayKey = (date: string) => `team-hitting-${date}-v1.json`;

const dayMem = new Map<string, DayHitting>();
const dayInFlight = new Map<string, Promise<DayHitting>>();

function parseDay(csv: string): DayHitting {
  const leaves: Record<string, HitCounts> = {};
  // Distinct `game_pk`s rather than a per-day 1, so a doubleheader counts twice.
  const seen = new Map<string, Set<string>>();
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  // Sorted, because runs are read off the **score progression** rather than off
  // each pitch's own delta, and a progression needs an order. `at_bat_number`
  // is game-wide and sequential across both sides, so this is scorebook order.
  rows.sort(
    (a, b) =>
      (a.game_pk ?? '').localeCompare(b.game_pk ?? '') ||
      num(a.at_bat_number) - num(b.at_bat_number) ||
      num(a.pitch_number) - num(b.pitch_number),
  );
  /** The batting side's score after the last pitch it saw, per game. */
  const lastScore = new Map<string, number>();

  for (const r of rows) {
    const top = r.inning_topbot === 'Top';
    const bat = top ? r.away_team : r.home_team;
    if (!bat) continue;
    const venue = top ? 'A' : 'H';
    const hand = r.p_throws === 'L' ? 'L' : r.p_throws === 'R' ? 'R' : '';
    if (!hand) continue;
    const key = `${bat}|${hand}|${venue}`;
    const c = (leaves[key] ??= empty());

    const gp = r.game_pk;
    if (gp) {
      // Two tallies of the same games: one per leaf, which is "games in which
      // this club faced this hand here", and one per venue, which is the club's
      // own games. The second is not derivable from the first.
      for (const sk of [key, `${bat}|${venue}`]) {
        let set = seen.get(sk);
        if (!set) { set = new Set(); seen.set(sk, set); }
        set.add(gp);
      }
    }

    // Runs, off the batting side's own running score. **The progression rather
    // than each pitch's own delta**, which is what makes this exact: a run that
    // scores on a play with no pitch — a balk, a steal of home, defensive
    // indifference — is in no row of a pitch-level export, so summing
    // `post_bat_score − bat_score` loses it. Measured before the fix, that was
    // 30 runs league-wide (0.2%), always short and never over. Taking the score
    // *since this side's last pitch* picks those up on the next pitch thrown,
    // which is also the right leaf: whoever was on the mound gave them up.
    const gk = `${gp}|${bat}`;
    const post = num(r.post_bat_score);
    const before = lastScore.get(gk) ?? num(r.bat_score);
    if (post > before) c.runs += post - before;
    lastScore.set(gk, post);

    const e = r.events;
    if (!e || NOT_A_PA.has(e)) continue;
    c.pa++;
    if (!NOT_AT_BAT.has(e)) c.ab++;
    const tb = BASES[e];
    if (tb !== undefined) {
      c.hits++;
      c.totalBases += tb;
      if (e === 'double') c.doubles++;
      else if (e === 'triple') c.triples++;
      else if (e === 'home_run') c.homeRuns++;
    }
    if (e === 'walk' || e === 'intent_walk') c.walks++;
    else if (e === 'hit_by_pitch') c.hitByPitch++;
    else if (e === 'strikeout' || e === 'strikeout_double_play') c.strikeOuts++;
    else if (e.startsWith('sac_fly')) c.sacFlies++;
  }

  const games: Record<string, number> = {};
  for (const [k, set] of seen) {
    if (leaves[k]) leaves[k].games = set.size;
    else games[k] = set.size;
  }
  return { leaves, games };
}

async function dayHitting(date: string): Promise<DayHitting> {
  const mem = dayMem.get(date);
  if (mem) return mem;
  const flight = dayInFlight.get(date);
  if (flight) return flight;

  const p = (async () => {
    const stored = await readGzipBlob(dayKey(date));
    if (stored) {
      const parsed = JSON.parse(stored) as DayHitting;
      dayMem.set(date, parsed);
      return parsed;
    }
    const counts = parseDay(await downloadDayCsv(date));
    dayMem.set(date, counts);
    await writeGzipBlob(dayKey(date), JSON.stringify(counts));
    return counts;
  })();
  dayInFlight.set(date, p);
  try {
    return await p;
  } finally {
    dayInFlight.delete(date);
  }
}

// ---- A window ---------------------------------------------------------------

/**
 * Where the `season` window starts: **1 March of the end date's own year**,
 * which is deliberately a few weeks before any opening day rather than the day
 * itself. That is what keeps this file off the list of places a season rolls
 * over in — `savant.ts` already asks Savant for `hfGT=R|`, so a spring-training
 * date comes back with no regular-season rows at all and reduces to an empty
 * day. The cost is one headers-only request per pre-season date, paid **once
 * ever**: `dayHitting` writes its counts blob whether or not the day held
 * anything, so the second build reads `{}` off disk and asks Savant nothing.
 */
function seasonStart(end: string): string {
  return `${end.slice(0, 4)}-03-01`;
}

/** The dates a window covers, ending **yesterday**: today's games are mid-flight
 *  and Savant lags the live feed by a day, which is `statcastWindow`'s own rule
 *  and has to be the same one or the board and this table would disagree about
 *  what "the last 7 days" is. */
function windowDates(window: TeamHittingWindow): string[] {
  const end = addDays(baseballToday(), -1);
  const days = window === 'season' ? daysBetween(seasonStart(end), end) + 1 : window;
  const out: string[] = [];
  for (let i = Math.max(0, days) - 1; i >= 0; i--) out.push(addDays(end, -i));
  return out;
}

const rate3 = (x: number): string => {
  const t = x.toFixed(3);
  return t.startsWith('0.') ? t.slice(1) : t;
};

function toLine(c: HitCounts): TeamHittingLine | null {
  if (c.pa === 0) return null;
  const onBaseDen = c.ab + c.walks + c.hitByPitch + c.sacFlies;
  const obp = onBaseDen > 0 ? (c.hits + c.walks + c.hitByPitch) / onBaseDen : 0;
  const slg = c.ab > 0 ? c.totalBases / c.ab : 0;
  return {
    pa: c.pa,
    games: c.games,
    runs: c.runs,
    runsPerGame: c.games > 0 ? (c.runs / c.games).toFixed(2) : null,
    avg: c.ab > 0 ? rate3(c.hits / c.ab) : '—',
    obp: rate3(obp),
    slg: rate3(slg),
    ops: rate3(obp + slg),
    homeRuns: c.homeRuns,
    strikeOuts: c.strikeOuts,
    baseOnBalls: c.walks,
    kRate: rate3(c.strikeOuts / c.pa),
    bbRate: rate3(c.walks / c.pa),
    ranks: null,
  };
}

/** Which categories get a rank, and which end of each is the better offence. */
const RANKED: {
  key: keyof TeamHittingRanks;
  of: (l: TeamHittingLine) => number | null;
  lowIsBest?: boolean;
}[] = [
  { key: 'runsPerGame', of: (l) => (l.runsPerGame === null ? null : Number(l.runsPerGame)) },
  { key: 'avg', of: (l) => Number(l.avg) },
  { key: 'obp', of: (l) => Number(l.obp) },
  { key: 'slg', of: (l) => Number(l.slg) },
  { key: 'ops', of: (l) => Number(l.ops) },
  { key: 'homeRuns', of: (l) => l.homeRuns },
  // Striking out less is the better offence, so 1st here is the *fewest* K.
  { key: 'kRate', of: (l) => Number(l.kRate), lowIsBest: true },
  { key: 'bbRate', of: (l) => Number(l.bbRate) },
];

const EMPTY_RANKS: TeamHittingRanks = {
  runsPerGame: null, avg: null, obp: null, slg: null, ops: null,
  homeRuns: null, kRate: null, bbRate: null,
};

/**
 * Rank one comparable population in place — all 30 teams' *same* cut. Ties
 * share a rank the standard competition way: two teams tied for 4th are both
 * 4th and the next distinct figure is 6th, which is `espn.ts::rankAll`'s
 * convention and the research board's.
 *
 * A team with no line in this cut is out of the ranking entirely rather than at
 * the bottom of it, which is the rule `sideFrom` already follows: a fortnight
 * in which nobody started a lefty against them is an absence, not an 0-for.
 */
function rankAll(lines: TeamHittingLine[]): void {
  for (const line of lines) line.ranks = { ...EMPTY_RANKS };
  for (const cat of RANKED) {
    const scored = lines
      .map((line) => ({ line, value: cat.of(line) }))
      .filter((x): x is { line: TeamHittingLine; value: number } =>
        x.value !== null && Number.isFinite(x.value))
      .sort((a, b) => (cat.lowIsBest ? a.value - b.value : b.value - a.value));
    scored.forEach((x, i) => {
      const tied = i > 0 && scored[i - 1].value === x.value;
      x.line.ranks![cat.key] = tied ? scored[i - 1].line.ranks![cat.key] : i + 1;
    });
  }
}

/** Every team's nine cuts for one window, keyed by MLB team id. */
type Board = Record<string, TeamHitting>;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const boardMem = new Map<TeamHittingWindow, { data: Board; fetchedAt: number }>();
const boardInFlight = new Map<TeamHittingWindow, Promise<Board>>();

/** `-v1`, and bumped on the same rule the research board's own key follows: a
 *  stored blob deserializes with every field added since it missing. */
const boardKey = (window: TeamHittingWindow) => `team-hitting-board-${window}-v1.json`;

/** How many days are read at once. The same bound `statcastWindow` uses, and
 *  for the same reason: 140 concurrent 3MB downloads is not a thing to do to
 *  Savant or to the heap. Almost always a no-op — a day parsed once is a blob
 *  for ever. */
const DAY_CONCURRENCY = 6;

async function buildBoard(window: TeamHittingWindow): Promise<Board> {
  const dates = windowDates(window);
  const totals = new Map<string, HitCounts>();
  const venueGames = new Map<string, number>();
  let missed = 0;

  await mapLimit(dates, DAY_CONCURRENCY, async (date) => {
    let day: DayHitting;
    try {
      day = await dayHitting(date);
    } catch {
      // A day that can't be read is skipped, not fatal — an off day (the
      // All-Star break, a washed-out Monday) legitimately has no export at all.
      missed++;
      return;
    }
    for (const [key, counts] of Object.entries(day.leaves)) {
      const into = totals.get(key) ?? empty();
      add(into, counts);
      totals.set(key, into);
    }
    for (const [key, n] of Object.entries(day.games)) {
      venueGames.set(key, (venueGames.get(key) ?? 0) + n);
    }
  });
  if (missed) console.log(`team hitting ${window}: ${missed} of ${dates.length} days unread`);

  const abbrevs = await getTeamAbbrevs();
  const idByAbbr = new Map<string, number>();
  for (const [id, abbr] of abbrevs) idByAbbr.set(abbr, id);

  // Fold the four leaves into the nine cuts. Each cut is its own sum, so
  // `home.all` is the two hands at home rather than a third stored number.
  const cuts = new Map<string, Map<string, HitCounts>>(); // abbr -> cut -> counts
  const cutKey = (venue: TeamHittingVenue, row: keyof TeamHittingSplit) => `${venue}|${row}`;
  for (const [key, counts] of totals) {
    const [abbr, hand, leafVenue] = key.split('|');
    const row: keyof TeamHittingSplit = hand === 'L' ? 'vsLeft' : 'vsRight';
    const venue: TeamHittingVenue = leafVenue === 'H' ? 'home' : 'away';
    const forTeam = cuts.get(abbr) ?? new Map<string, HitCounts>();
    cuts.set(abbr, forTeam);
    for (const k of [
      cutKey('all', 'all'), cutKey('all', row),
      cutKey(venue, 'all'), cutKey(venue, row),
    ]) {
      const into = forTeam.get(k) ?? empty();
      add(into, counts);
      forTeam.set(k, into);
    }
  }

  // The game count on an `all`-hand row is the club's **own** games, not the
  // sum of the two leaves it was otherwise built from — see `DayHitting.games`
  // for why those cannot be added. The hand rows keep the leaf count they
  // arrived with, which is "games in which they faced this hand" and is exactly
  // what their runs-per-game divides by.
  for (const [abbr, forTeam] of cuts) {
    let played = 0;
    for (const leafVenue of ['H', 'A'] as const) {
      const n = venueGames.get(`${abbr}|${leafVenue}`) ?? 0;
      played += n;
      const venue: TeamHittingVenue = leafVenue === 'H' ? 'home' : 'away';
      const line = forTeam.get(cutKey(venue, 'all'));
      if (line) line.games = n;
    }
    const all = forTeam.get(cutKey('all', 'all'));
    if (all) all.games = played;
  }

  const board: Board = {};
  const populations = new Map<string, TeamHittingLine[]>();
  for (const [abbr, forTeam] of cuts) {
    const teamId = idByAbbr.get(abbr);
    if (teamId === undefined) continue;
    const split = (venue: TeamHittingVenue): TeamHittingSplit => {
      const one = (row: keyof TeamHittingSplit) => {
        const k = cutKey(venue, row);
        const line = toLine(forTeam.get(k) ?? empty());
        if (line) {
          const pop = populations.get(k) ?? [];
          pop.push(line);
          populations.set(k, pop);
        }
        return line;
      };
      return { all: one('all'), vsLeft: one('vsLeft'), vsRight: one('vsRight') };
    };
    board[teamId] = {
      teamId,
      window,
      all: split('all'),
      home: split('home'),
      away: split('away'),
    };
  }
  // Each cut ranks within itself: a 30-day home line against the other 29
  // teams' 30-day home lines, never against the season board.
  for (const lines of populations.values()) rankAll(lines);
  return board;
}

async function getBoard(window: TeamHittingWindow): Promise<Board> {
  const mem = boardMem.get(window);
  if (mem && Date.now() - mem.fetchedAt < CACHE_TTL_MS) return mem.data;
  const flight = boardInFlight.get(window);
  if (flight) return flight;

  const p = (async () => {
    const stored = await readJsonBlob<Board>(
      boardKey(window),
      (_v, cachedAt) => Date.now() - cachedAt < CACHE_TTL_MS,
    );
    if (stored) {
      boardMem.set(window, { data: stored, fetchedAt: Date.now() });
      return stored;
    }
    const data = await buildBoard(window);
    boardMem.set(window, { data, fetchedAt: Date.now() });
    await writeJsonBlob(boardKey(window), data);
    return data;
  })();
  boardInFlight.set(window, p);
  try {
    return await p;
  } finally {
    boardInFlight.delete(window);
  }
}

/**
 * One team's nine cuts over one window, with every number's league rank.
 *
 * **Failures resolve to null rather than throwing**, the rule this file has
 * always followed: the opponent's line is context on a pitcher's game, and a
 * report that already has the outing itself must not 502 because a day export
 * timed out.
 */
export async function getTeamHitting(
  teamId: number,
  window: TeamHittingWindow = 'season',
): Promise<TeamHitting | null> {
  try {
    return (await getBoard(window))[teamId] ?? null;
  } catch (err) {
    console.error('team hitting build failed:', err);
    return null;
  }
}

/** Pre-build a window's board — what `warmer.ts` calls so the first reader of
 *  the day pays for nothing. */
export async function warmTeamHitting(window: TeamHittingWindow): Promise<void> {
  await getBoard(window);
}
