import type {
  MlbStandings,
  StandingsRecord,
  StandingsSpan,
  StandingsTeam,
} from './types.js';
import { addDays, baseballToday } from './etDate.js';
import { getTeamList } from './mlbStats.js';
import { SEASON } from './research.js';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/**
 * # Where the thirty clubs stand — over the season, or over the last N days
 *
 * The MLB view's Standings tab. One board, five spans, and **two arithmetics
 * behind it**, which is the whole of what there is to understand here.
 *
 * ## The season is MLB's answer; a window is ours
 *
 * The season board is `/api/v1/standings` — MLB's own totals, and the only
 * authority on them. It is also the only place several of these columns exist
 * at all: games behind, the wild-card race, the magic number, a Pythagorean
 * record, and the split records (home, away, one-run, last ten, and **vs .500
 * or better**, which MLB calls `winners`).
 *
 * A window has no such upstream. `/api/v1/standings` takes a `date=` — which
 * gives the standings *as of* that day, not the record *since* it — so a
 * seven-day board is computed here, from the season's own schedule, plus one
 * lookup into the season board for the division each club is in.
 *
 * ## The two agree exactly, which was measured before anything was built on it
 *
 * Every club's wins, losses, runs scored and runs allowed, computed from
 * `/api/v1/schedule`'s final games and compared against `/api/v1/standings` on
 * 2026-08-25: **all thirty clubs match on all four figures**. So a window is
 * the same arithmetic MLB does, run over fewer days, rather than a second
 * opinion about a club's record.
 *
 * **That match depends on one line and it is worth stating why.** MLB's season
 * schedule lists a rescheduled game **under both dates**, the same `gamePk`
 * twice — 28 of them in the 2026 season, 2,458 entries for 2,430 games. Naive
 * first-wins deduplication is *worse than none*: the first entry of a postponed
 * game is the `Postponed` one, so dropping the second drops the game that was
 * actually played, and **22 of 30 clubs came out wrong**. The rule is
 * `keepPlayed` below: a final entry always displaces a non-final one.
 *
 * ## The window ends **today**, where every other window in this app ends
 * yesterday
 *
 * `statcastWindow.ts::windowDates` stops at yesterday, and the reason it gives
 * is Savant's one-day lag plus a partial day polluting a *rate*. Neither
 * applies here: this reads MLB's own schedule, which has today's games the
 * moment they end, and a won-lost record is made of finished games — a game
 * either counts or is not there, so there is nothing partial to pollute.
 * Ending yesterday would instead mean a standings board that does not know
 * about the fifteen games a reader has just watched, which is the one thing a
 * standings board must not be.
 */

/**
 * How long a board stays fresh — **one span rather than a live one and a
 * settled one**, which is the difference between this and the scoreboard
 * beside it.
 *
 * A scoreboard changes by the pitch and takes `mlbScoreboard.ts`'s minute. A
 * standings board changes only when a game **ends**: a club that is winning
 * 4-1 in the sixth stands exactly where it stood this morning. Five minutes is
 * therefore not a compromise between the two — it is the resolution the data
 * actually has, and on the busiest evening of the season it is a handful of
 * transitions a reader sees within five minutes of the final out.
 */
const TTL = 5 * 60 * 1000;

/** Division names come off MLB rather than out of the bundle — six strings that
 *  change about once a generation, which is exactly long enough for a copy to
 *  be wrong and nobody to notice. A day, because that is how often it could
 *  conceivably matter. */
const DIVISIONS_TTL = 24 * 60 * 60 * 1000;

// ---- MLB's own standings ----------------------------------------------

interface SplitRecord {
  wins?: number;
  losses?: number;
  type?: string;
}

interface TeamRecord {
  team?: { id?: number };
  wins?: number;
  losses?: number;
  winningPercentage?: string;
  gamesBack?: string;
  wildCardGamesBack?: string;
  runsScored?: number;
  runsAllowed?: number;
  runDifferential?: number;
  gamesPlayed?: number;
  divisionRank?: string;
  leagueRank?: string;
  divisionLeader?: boolean;
  clinched?: boolean;
  magicNumber?: string;
  eliminationNumber?: string;
  streak?: { streakCode?: string };
  records?: {
    splitRecords?: SplitRecord[];
    expectedRecords?: SplitRecord[];
  };
}

interface StandingsResponse {
  records?: {
    standingsType?: string;
    league?: { id?: number };
    division?: { id?: number };
    teamRecords?: TeamRecord[];
  }[];
}

interface DivisionsResponse {
  divisions?: {
    id?: number;
    name?: string;
    nameShort?: string;
    league?: { id?: number };
  }[];
}

let divisionsCache: { rows: MlbStandings['divisions']; at: number } | null = null;

async function getDivisions(): Promise<MlbStandings['divisions']> {
  if (divisionsCache && Date.now() - divisionsCache.at < DIVISIONS_TTL) return divisionsCache.rows;
  const res = await fetch('https://statsapi.mlb.com/api/v1/divisions?sportId=1', { headers: UA });
  if (!res.ok) throw new Error(`MLB divisions returned ${res.status}`);
  const data = (await res.json()) as DivisionsResponse;
  const rows: MlbStandings['divisions'] = [];
  for (const d of data.divisions ?? []) {
    if (typeof d.id !== 'number' || !d.name || typeof d.league?.id !== 'number') continue;
    rows.push({ id: d.id, name: d.name, shortName: d.nameShort ?? d.name, leagueId: d.league.id });
  }
  divisionsCache = { rows, at: Date.now() };
  return rows;
}

/** A split MLB publishes, by its own type name, or null where it has none —
 *  the join-to-null rule one cell wide, so a club MLB has not split yet draws a
 *  dash rather than `0-0`. */
function split(rows: SplitRecord[] | undefined, type: string): StandingsRecord | null {
  const hit = rows?.find((r) => r.type === type);
  return hit && typeof hit.wins === 'number' && typeof hit.losses === 'number'
    ? { wins: hit.wins, losses: hit.losses }
    : null;
}

/** MLB's `-` for none, kept as null so the client never has to know that a dash
 *  in a magic-number column is a string MLB sent rather than a missing value. */
function orNull(s: string | undefined): string | null {
  return s && s !== '-' ? s : null;
}

async function fetchSeasonBoard(): Promise<MlbStandings> {
  // **Both standings types in one request.** The wild-card board is not
  // derivable from the division one — it excludes division leaders and is
  // ranked by MLB's own tiebreakers — and asking for it separately would be a
  // second 64KB read of the same season. Measured together: 144,489 bytes.
  const url =
    `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${SEASON}` +
    `&standingsTypes=regularSeason,wildCard`;
  const [res, teams, divisions] = await Promise.all([
    fetch(url, { headers: UA }),
    getTeamList(),
    getDivisions(),
  ]);
  if (!res.ok) throw new Error(`MLB Stats API standings returned ${res.status}`);
  const data = (await res.json()) as StandingsResponse;
  const named = new Map(teams.map((t) => [t.id, t]));
  const rows: StandingsTeam[] = [];
  const wildcard: MlbStandings['wildcard'] = [];
  for (const rec of data.records ?? []) {
    const leagueId = rec.league?.id ?? 0;
    if (rec.standingsType === 'wildCard') {
      // MLB sends the wild-card block already in its own order, so this is the
      // order rather than a sort of ours — see `MlbStandings.wildcard`.
      wildcard.push({
        leagueId,
        teamIds: (rec.teamRecords ?? [])
          .map((t) => t.team?.id)
          .filter((id): id is number => typeof id === 'number'),
      });
      continue;
    }
    const divisionId = rec.division?.id ?? 0;
    for (const t of rec.teamRecords ?? []) {
      const id = t.team?.id;
      if (typeof id !== 'number') continue;
      const info = named.get(id);
      const splits = t.records?.splitRecords;
      rows.push({
        id,
        // A club the teams table has not heard of keeps its id's row rather
        // than being dropped — thirty rows is the whole of this board, and a
        // missing one is a worse answer than an unnamed one.
        name: info?.name ?? '',
        abbreviation: info?.abbreviation ?? '',
        leagueId,
        divisionId,
        wins: t.wins ?? 0,
        losses: t.losses ?? 0,
        pct: t.winningPercentage ?? pct(t.wins ?? 0, t.losses ?? 0),
        gamesBack: t.gamesBack ?? '-',
        wildCardGamesBack: t.wildCardGamesBack ?? null,
        runsScored: t.runsScored ?? 0,
        runsAllowed: t.runsAllowed ?? 0,
        runDiff: t.runDifferential ?? (t.runsScored ?? 0) - (t.runsAllowed ?? 0),
        home: split(splits, 'home'),
        away: split(splits, 'away'),
        // **`winners` is MLB's name for it and the definition was verified
        // rather than assumed**: against three clubs on 2026-08-25 it matches
        // "record against clubs at .500 or better *now*" exactly (TB 31-24,
        // NYY 29-29, LAD 34-35) and does **not** match "above .500" (23-20,
        // 20-23, 30-30). The window half computes the first of those, so the
        // two spans mean the same thing by this column.
        vsOver500: split(splits, 'winners'),
        lastTen: split(splits, 'lastTen'),
        oneRun: split(splits, 'oneRun'),
        expected: split(t.records?.expectedRecords, 'xWinLoss'),
        streak: t.streak?.streakCode ?? null,
        divisionLeader: t.divisionLeader === true,
        clinched: t.clinched === true,
        magicNumber: orNull(t.magicNumber),
        eliminationNumber: orNull(t.eliminationNumber),
        gamesPlayed: t.gamesPlayed ?? (t.wins ?? 0) + (t.losses ?? 0),
        divisionRank: Number(t.divisionRank) || 0,
        leagueRank: Number(t.leagueRank) || 0,
      });
    }
  }
  return {
    span: 'season',
    // The season's own ends as this app already means them: 1 March is the
    // boundary `teamHitting.ts` and `teamResearch.ts` use, regular-season rows
    // being all anybody asks for, and the end is the day being played.
    start: `${SEASON}-03-01`,
    end: baseballToday(),
    teams: rows,
    wildcard,
    divisions,
    fetchedAt: Date.now(),
  };
}

// ---- A window, computed from the season's schedule ---------------------

interface SeasonGame {
  gamePk: number;
  date: string;
  final: boolean;
  away: { id: number; score: number; won: boolean };
  home: { id: number; score: number; won: boolean };
}

interface ScheduleResponse {
  dates?: {
    games?: {
      gamePk?: number;
      officialDate?: string;
      status?: { codedGameState?: string };
      teams?: {
        away?: { team?: { id?: number }; score?: number; isWinner?: boolean };
        home?: { team?: { id?: number }; score?: number; isWinner?: boolean };
      };
    }[];
  }[];
}

let gamesCache: { games: SeasonGame[]; at: number } | null = null;
let gamesInFlight: Promise<SeasonGame[]> | null = null;

/**
 * The season's games, one entry per `gamePk`.
 *
 * **A final entry always displaces a non-final one**, which is the whole of the
 * deduplication and is not a defensive flourish — see this file's header for
 * the 22-of-30 measurement that establishes it. Where both are the same state
 * the first wins, the two being identical.
 */
function keepPlayed(by: Map<number, SeasonGame>, g: SeasonGame): void {
  const had = by.get(g.gamePk);
  if (!had || (g.final && !had.final)) by.set(g.gamePk, g);
}

async function fetchSeasonGames(): Promise<SeasonGame[]> {
  const url =
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${SEASON}&gameType=R` +
    // The narrowest cut that answers: who played, on what day, who won and by
    // how much. Measured over the whole 2026 season — 2,458 entries — at
    // **30,287 bytes on the wire**, which is one read for every window span
    // and every reader.
    `&fields=dates,games,gamePk,officialDate,status,codedGameState,teams,away,home,team,id,score,isWinner`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`MLB schedule returned ${res.status} for ${SEASON}`);
  const data = (await res.json()) as ScheduleResponse;
  const by = new Map<number, SeasonGame>();
  for (const d of data.dates ?? []) {
    for (const g of d.games ?? []) {
      const away = g.teams?.away;
      const home = g.teams?.home;
      if (
        typeof g.gamePk !== 'number' ||
        typeof away?.team?.id !== 'number' ||
        typeof home?.team?.id !== 'number'
      ) {
        continue;
      }
      // **`F` alone**, MLB's coded state for a completed game. A called-off
      // game is `D`/`C` and a suspended one `U`, and none of the three is a
      // result — the same distinction `stateOf` draws elsewhere, made here on
      // the one field this cut carries.
      const final = g.status?.codedGameState === 'F';
      keepPlayed(by, {
        gamePk: g.gamePk,
        date: g.officialDate ?? '',
        final,
        away: { id: away.team.id, score: away.score ?? 0, won: away.isWinner === true },
        home: { id: home.team.id, score: home.score ?? 0, won: home.isWinner === true },
      });
    }
  }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function getSeasonGames(): Promise<SeasonGame[]> {
  if (gamesCache && Date.now() - gamesCache.at < TTL) return gamesCache.games;
  if (gamesInFlight) return gamesInFlight;
  const p = fetchSeasonGames()
    .then((games) => {
      gamesCache = { games, at: Date.now() };
      return games;
    })
    .finally(() => {
      gamesInFlight = null;
    });
  gamesInFlight = p;
  return p;
}

/** `.595`, as MLB spells it — three places, no leading zero, and `.000` for a
 *  club that has not played, which is the same shape a dash would occupy. */
function pct(w: number, l: number): string {
  const n = w + l;
  return n === 0 ? '.000' : (w / n).toFixed(3).replace(/^0/, '');
}

/** Games behind, in MLB's own form: `-` for whoever leads, and one decimal
 *  otherwise. The arithmetic is MLB's too — half the sum of the win gap and the
 *  loss gap — so the two spans cannot come to mean different things by it. */
function gamesBack(w: number, l: number, leadW: number, leadL: number): string {
  const gb = (leadW - w + (l - leadL)) / 2;
  return gb <= 0 ? '-' : gb.toFixed(1);
}

interface Tally {
  wins: number;
  losses: number;
  runsScored: number;
  runsAllowed: number;
  home: StandingsRecord;
  away: StandingsRecord;
  /** The club's results in date order, for the streak. */
  results: boolean[];
  /** Opponent id per result, in the same order, so the .500 cut can be taken
   *  after the season records are known rather than during the walk. */
  opponents: number[];
}

function emptyTally(): Tally {
  return {
    wins: 0,
    losses: 0,
    runsScored: 0,
    runsAllowed: 0,
    home: { wins: 0, losses: 0 },
    away: { wins: 0, losses: 0 },
    results: [],
    opponents: [],
  };
}

/** Every club's line over a range of days, inclusive. Final games only — see
 *  `fetchSeasonGames`. */
function tally(games: SeasonGame[], start: string, end: string): Map<number, Tally> {
  const out = new Map<number, Tally>();
  const get = (id: number): Tally => {
    let t = out.get(id);
    if (!t) out.set(id, (t = emptyTally()));
    return t;
  };
  for (const g of games) {
    if (!g.final || g.date < start || g.date > end) continue;
    for (const [me, them, atHome] of [
      [g.away, g.home, false],
      [g.home, g.away, true],
    ] as const) {
      const t = get(me.id);
      if (me.won) t.wins++;
      else t.losses++;
      t.runsScored += me.score;
      t.runsAllowed += them.score;
      const venue = atHome ? t.home : t.away;
      if (me.won) venue.wins++;
      else venue.losses++;
      t.results.push(me.won);
      t.opponents.push(them.id);
    }
  }
  return out;
}

/** `W2`, `L4` — the trailing run of one result. Null where the club played
 *  nothing over the span, which on a seven-day window is an ordinary answer for
 *  a club on a break. */
function streakOf(results: boolean[]): string | null {
  if (results.length === 0) return null;
  const last = results[results.length - 1];
  let n = 1;
  for (let i = results.length - 2; i >= 0 && results[i] === last; i--) n++;
  return `${last ? 'W' : 'L'}${n}`;
}

async function buildWindow(span: number): Promise<MlbStandings> {
  const [games, teams, divisions] = await Promise.all([
    getSeasonGames(),
    getTeamList(),
    getDivisions(),
  ]);
  const end = baseballToday();
  const start = addDays(end, -(span - 1));
  const window = tally(games, start, end);
  // **The `.500 or better` set is the club's record *now*, not on the day of
  // the game** — MLB's own definition of the split this column mirrors, and the
  // one that makes a seven-day board mean the same thing the season board
  // means. Off the same game list rather than a second read of the standings:
  // measured, the two agree on all thirty clubs.
  const season = tally(games, `${SEASON}-01-01`, end);
  const over500 = new Set(
    [...season].filter(([, t]) => t.wins >= t.losses).map(([id]) => id),
  );
  const byDivision = new Map<number, StandingsTeam[]>();
  const byLeague = new Map<number, StandingsTeam[]>();
  const rows: StandingsTeam[] = [];
  // **A club's division is not on the schedule payload**, so it comes off the
  // season board — which is the one place this server is told which of the six
  // a club is in, and is the second upstream read a window costs. It is shared
  // rather than spent: the Standings tab opens on the season, so by the time a
  // reader picks a window it is already in hand, and the two boards can never
  // come to disagree about which division a club is in.
  const seasonBoard = await getSeasonBoard();
  const placeOf = new Map(seasonBoard.teams.map((t) => [t.id, t]));
  for (const info of teams) {
    const place = placeOf.get(info.id);
    // A club the season board has no row for cannot be placed in a division,
    // and a standings row with no group is a row with nowhere to be drawn.
    if (!place) continue;
    const t = window.get(info.id) ?? emptyTally();
    let vsWins = 0;
    let vsLosses = 0;
    for (let i = 0; i < t.results.length; i++) {
      if (!over500.has(t.opponents[i])) continue;
      if (t.results[i]) vsWins++;
      else vsLosses++;
    }
    const row: StandingsTeam = {
      id: info.id,
      name: info.name,
      abbreviation: info.abbreviation,
      leagueId: place.leagueId,
      divisionId: place.divisionId,
      wins: t.wins,
      losses: t.losses,
      pct: pct(t.wins, t.losses),
      // Filled below, once the group each row sits in is known.
      gamesBack: '-',
      // **Null rather than the season's number.** A wild-card race is a fact
      // about the season, and carrying it onto a seven-day row would be two
      // arithmetics on one line — `BoardProjection`'s rule.
      wildCardGamesBack: null,
      runsScored: t.runsScored,
      runsAllowed: t.runsAllowed,
      runDiff: t.runsScored - t.runsAllowed,
      home: t.home,
      away: t.away,
      vsOver500: { wins: vsWins, losses: vsLosses },
      // The three MLB's own board has and a window cannot: ten games is a
      // window of its own, and the other two are MLB's figures rather than
      // ours.
      lastTen: null,
      oneRun: null,
      expected: null,
      streak: streakOf(t.results),
      // A lens is not a standing — nothing about the last week clinches
      // anything, and a leader mark drawn off seven days would read as one.
      divisionLeader: false,
      clinched: false,
      magicNumber: null,
      eliminationNumber: null,
      gamesPlayed: t.wins + t.losses,
      divisionRank: 0,
      leagueRank: 0,
    };
    rows.push(row);
    push(byDivision, row.divisionId, row);
    push(byLeague, row.leagueId, row);
  }
  // Rank and games-back, per group, by the same rule in both: pct, then run
  // differential. MLB's tiebreakers are head-to-head records this board has no
  // business reimplementing over seven days, and run differential is the one
  // tiebreak that is a fact about the span rather than about the season.
  for (const group of byDivision.values()) {
    group.sort(byRecord);
    const lead = group[0];
    group.forEach((row, i) => {
      row.divisionRank = i + 1;
      row.gamesBack = gamesBack(row.wins, row.losses, lead.wins, lead.losses);
    });
  }
  for (const group of byLeague.values()) {
    group.sort(byRecord);
    group.forEach((row, i) => {
      row.leagueRank = i + 1;
    });
  }
  // Leaders out, then by record — the rule MLB applies to its own wild-card
  // board, applied here because MLB has no opinion about a window.
  const wildcard: MlbStandings['wildcard'] = [];
  for (const [leagueId, group] of byLeague) {
    wildcard.push({
      leagueId,
      teamIds: group.filter((r) => r.divisionRank !== 1).map((r) => r.id),
    });
  }
  return {
    span: span as StandingsSpan,
    start,
    end,
    teams: rows,
    wildcard,
    divisions,
    fetchedAt: Date.now(),
  };
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const had = map.get(key);
  if (had) had.push(value);
  else map.set(key, [value]);
}

function byRecord(a: StandingsTeam, b: StandingsTeam): number {
  return b.pct.localeCompare(a.pct) || b.runDiff - a.runDiff;
}

// ---- The two caches ---------------------------------------------------

let seasonCache: { board: MlbStandings; at: number } | null = null;
let seasonInFlight: Promise<MlbStandings> | null = null;

async function getSeasonBoard(): Promise<MlbStandings> {
  if (seasonCache && Date.now() - seasonCache.at < TTL) return seasonCache.board;
  if (seasonInFlight) return seasonInFlight;
  const p = fetchSeasonBoard()
    .then((board) => {
      seasonCache = { board, at: Date.now() };
      return board;
    })
    .finally(() => {
      seasonInFlight = null;
    });
  seasonInFlight = p;
  return p;
}

const windowCache = new Map<number, { board: MlbStandings; at: number }>();
const windowInFlight = new Map<number, Promise<MlbStandings>>();

/**
 * The board for one span.
 *
 * **This route 502s honestly** where every enrichment in this server costs its
 * own column and nothing more. It is the `/api/schedule` exception and the same
 * test: the answer *is* the table, and a standings board drawn with dashes down
 * it says "these clubs have no record" rather than "we could not ask".
 */
export async function getMlbStandings(span: StandingsSpan): Promise<MlbStandings> {
  if (span === 'season') return getSeasonBoard();
  const hit = windowCache.get(span);
  if (hit && Date.now() - hit.at < TTL) return hit.board;
  const running = windowInFlight.get(span);
  if (running) return running;
  const p = buildWindow(span)
    .then((board) => {
      windowCache.set(span, { board, at: Date.now() });
      return board;
    })
    .finally(() => {
      windowInFlight.delete(span);
    });
  windowInFlight.set(span, p);
  return p;
}
