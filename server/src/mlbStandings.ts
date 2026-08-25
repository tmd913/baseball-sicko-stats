import type { MlbStandings, StandingsRecord, StandingsTeam } from './types.js';
import { getTeamList } from './mlbStats.js';
import { SEASON } from './research.js';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/**
 * # Where the thirty clubs stand
 *
 * The MLB view's Standings tab. **One board, and it is the season** — MLB's own
 * standings, which is the only authority on a club's record and the only place
 * several of these columns exist at all: games behind, the wild-card race, the
 * magic number, a Pythagorean record, and the split records (home, away,
 * one-run, last ten, and **vs .500 or better**, which MLB calls `winners`).
 *
 * ## Three splits MLB does not publish, computed here
 *
 * `lastThirty`, `firstHalf` and `secondHalf`. None of them is on
 * `/api/v1/standings` — its `splitRecords` run to sixteen types and stop at
 * `lastTen` — and `date=` on that endpoint gives the standings **as of** a day
 * rather than the record **since** one, so there is no way to ask for them.
 * They come out of the season's own schedule instead, walked once.
 *
 * **This replaced a span control.** The tab offered the board over five spans —
 * season, 60, 30, 15, 7 — with the whole board recomputed for a window. Three
 * columns beside `L10` say more of what that control was reached for and say it
 * *at the same time as everything else*: how a club has been going lately, and
 * either side of the break, without leaving the row its record is on. The
 * machinery is the same walk; what changed is that its answer is now three cells
 * rather than a second board.
 *
 * ## The walk agrees with MLB exactly, which was measured before anything was
 * built on it
 *
 * Every club's wins, losses, runs scored and runs allowed, computed from
 * `/api/v1/schedule`'s final games and compared against `/api/v1/standings` on
 * 2026-08-25: **all thirty clubs match on all four figures**. So the three split
 * columns are the same arithmetic MLB does, run over fewer games, rather than a
 * second opinion about a club's record.
 *
 * **That match depends on one line and it is worth stating why.** MLB's season
 * schedule lists a rescheduled game **under both dates**, the same `gamePk`
 * twice — 28 of them in the 2026 season, 2,458 entries for 2,430 games. Naive
 * first-wins deduplication is *worse than none*: the first entry of a postponed
 * game is the `Postponed` one, so dropping the second drops the game that was
 * actually played, and **22 of 30 clubs came out wrong**. The rule is
 * `keepPlayed` below: a final entry always displaces a non-final one.
 *
 * ## The halves are the All-Star break, and its date is asked for
 *
 * Not hardcoded and not "mid-July": `/api/v1/schedule?gameType=A` answers with
 * the one All-Star game and its date (2026-07-14, measured — **276 bytes**).
 * `gameType=R` excludes that game from the walk, so every regular-season game
 * falls cleanly on one side of it.
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
  divisionRank?: string;
  leagueRank?: string;
  sportRank?: string;
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
        // Filled by the walk below, or left as dashes where it could not be
        // made — see `buildBoard`.
        lastThirty: null,
        firstHalf: null,
        secondHalf: null,
        oneRun: split(splits, 'oneRun'),
        expected: split(t.records?.expectedRecords, 'xWinLoss'),
        streak: t.streak?.streakCode ?? null,
        divisionLeader: t.divisionLeader === true,
        clinched: t.clinched === true,
        magicNumber: orNull(t.magicNumber),
        eliminationNumber: orNull(t.eliminationNumber),
        divisionRank: Number(t.divisionRank) || 0,
        leagueRank: Number(t.leagueRank) || 0,
        // **MLB's own rank across all thirty**, which is what the Overall board
        // is ordered by. It is on the same payload as the other two and needed
        // asking for no more than they did — `sportRank`, MLB's word for the
        // whole of the major leagues.
        overallRank: Number(t.sportRank) || 0,
      });
    }
  }
  return {
    teams: rows,
    wildcard,
    divisions,
    fetchedAt: Date.now(),
  };
}

/** `.595`, as MLB spells it — three places, no leading zero, and `.000` for a
 *  club that has not played, which is the same shape a dash would occupy. Only
 *  ever reached where MLB omitted its own `winningPercentage`. */
function pct(w: number, l: number): string {
  const n = w + l;
  return n === 0 ? '.000' : (w / n).toFixed(3).replace(/^0/, '');
}

// ---- The three splits, computed from the season's schedule --------------

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
    // **30,287 bytes on the wire**, which is one read for the whole board and
    // every reader of it.
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

/**
 * **The All-Star game's date**, which is what the two half columns are split
 * on.
 *
 * Asked for rather than hardcoded or approximated: the break moves by a week or
 * more between seasons, and a mid-July constant would put a fortnight of games
 * on the wrong side of it in some years and be silently wrong in all of them.
 * `gameType=A` returns exactly one game — **276 bytes**, measured — and the
 * walk's own `gameType=R` means that game is never in the games being split.
 *
 * A whole season, because it is one: cached for a day, which is as often as it
 * could conceivably matter.
 */
let allStarCache: { date: string | null; at: number } | null = null;

async function getAllStarDate(): Promise<string | null> {
  if (allStarCache && Date.now() - allStarCache.at < DIVISIONS_TTL) return allStarCache.date;
  const url =
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${SEASON}&gameType=A` +
    `&fields=dates,games,officialDate`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`MLB All-Star schedule returned ${res.status}`);
  const data = (await res.json()) as ScheduleResponse;
  const date = data.dates?.[0]?.games?.[0]?.officialDate ?? null;
  allStarCache = { date, at: Date.now() };
  return date;
}

/** A club's games in date order, final only — the one list all three splits are
 *  cut from, so they cannot come to disagree about which games a club played. */
function gamesOf(games: SeasonGame[], teamId: number): { won: boolean; date: string }[] {
  const out: { won: boolean; date: string }[] = [];
  for (const g of games) {
    if (!g.final) continue;
    const me = g.away.id === teamId ? g.away : g.home.id === teamId ? g.home : null;
    if (!me) continue;
    out.push({ won: me.won, date: g.date });
  }
  return out;
}

/** Won-lost over a slice, or null where the slice is empty — the join-to-null
 *  rule one cell wide, so a club with no games either side of a boundary draws a
 *  dash rather than `0-0`, which reads as a record. */
function record(rows: { won: boolean }[]): StandingsRecord | null {
  if (rows.length === 0) return null;
  let wins = 0;
  for (const r of rows) if (r.won) wins++;
  return { wins, losses: rows.length - wins };
}

/**
 * The three columns MLB does not publish, for one club.
 *
 * **`L30` is thirty *games*, not thirty days**, because it stands beside `L10`
 * and that one is games. Two columns an inch apart, one counting games and one
 * counting days, is the kind of thing this codebase spends its length
 * preventing — and a club that has had four days off would otherwise read as
 * having gone cold.
 */
function splitsFor(
  games: SeasonGame[],
  teamId: number,
  allStar: string | null,
): Pick<StandingsTeam, 'lastThirty' | 'firstHalf' | 'secondHalf'> {
  const played = gamesOf(games, teamId);
  return {
    lastThirty: record(played.slice(-30)),
    // **Null, not an empty record, where the break has no date.** A failed
    // All-Star read costs these two columns a dash on every row, which is the
    // honest reading of "we could not ask" — where `0-0` on all thirty rows
    // would be a claim that nobody has played since July.
    firstHalf: allStar === null ? null : record(played.filter((g) => g.date < allStar)),
    secondHalf: allStar === null ? null : record(played.filter((g) => g.date > allStar)),
  };
}

// ---- The board ---------------------------------------------------------

let seasonCache: { board: MlbStandings; at: number } | null = null;
let seasonInFlight: Promise<MlbStandings> | null = null;

/**
 * The board.
 *
 * **This route 502s honestly** where every enrichment in this server costs its
 * own column and nothing more. It is the `/api/schedule` exception and the same
 * test: the answer *is* the table, and a standings board drawn with dashes down
 * it says "these clubs have no record" rather than "we could not ask".
 *
 * The three computed columns are the one part that does **not** follow that:
 * they are an enrichment on a board that stands without them, so the schedule
 * and the All-Star reads are each in their own `try` and a failure costs its own
 * columns. That is the rule the rest of this server runs on, applied to the half
 * of this file that is ours rather than MLB's.
 */
export async function getMlbStandings(): Promise<MlbStandings> {
  if (seasonCache && Date.now() - seasonCache.at < TTL) return seasonCache.board;
  if (seasonInFlight) return seasonInFlight;
  const p = buildBoard()
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

async function buildBoard(): Promise<MlbStandings> {
  const board = await fetchSeasonBoard();
  // Each in its own `try`: a dead schedule leaves MLB's own board standing with
  // three columns of dashes, and a dead All-Star read costs two of them.
  const [games, allStar] = await Promise.all([
    getSeasonGames().catch((err: unknown) => {
      console.error('standings splits unavailable:', (err as Error).message);
      return [] as SeasonGame[];
    }),
    getAllStarDate().catch((err: unknown) => {
      console.error('All-Star date unavailable:', (err as Error).message);
      return null;
    }),
  ]);
  if (games.length === 0) return board;
  return {
    ...board,
    teams: board.teams.map((t) => ({ ...t, ...splitsFor(games, t.id, allStar) })),
  };
}
