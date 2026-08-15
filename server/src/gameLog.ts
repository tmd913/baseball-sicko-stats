import type { BatterGameLog, GameLogEntry, PitcherGameLog, PitchingCredit } from './types.js';
import { getSeasonArsenal, type Appearances } from './pitcherArsenal.js';
import { fipLike } from './leagueRates.js';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/** A game log only moves when a game ends, and the details view is opened over
 *  and over on the same handful of players — 30 min matches the season lines. */
const GAME_LOG_TTL = 30 * 60 * 1000;
/** Team ids and their abbreviations change once a decade. */
const TEAMS_TTL = 24 * 60 * 60 * 1000;
/** Scores go stale only for a game still being played, and the log's newest row
 *  is the only one that can be — so it rides the same 30 min as the log. */
const SCORES_TTL = GAME_LOG_TTL;

interface TeamsResponse {
  teams?: { id: number; abbreviation?: string; name?: string }[];
}

let teamsCache: { abbrevs: Map<number, string>; fetchedAt: number } | null = null;

/** "MIL" for each team id. The game log's `opponent` carries only id + full
 *  name, and a full name is three times the width of the column it sits in. */
async function getTeamAbbrevs(): Promise<Map<number, string>> {
  const now = Date.now();
  if (teamsCache && now - teamsCache.fetchedAt < TEAMS_TTL) return teamsCache.abbrevs;
  const url = 'https://statsapi.mlb.com/api/v1/teams?sportId=1&fields=teams,id,abbreviation';
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`teams returned ${res.status}`);
    const data = (await res.json()) as TeamsResponse;
    const abbrevs = new Map<number, string>();
    for (const t of data.teams ?? []) {
      if (t.abbreviation) abbrevs.set(t.id, t.abbreviation);
    }
    teamsCache = { abbrevs, fetchedAt: now };
    return abbrevs;
  } catch (err) {
    console.error('team abbreviations fetch failed:', err);
    // A missing abbreviation costs the column its short form, not the log.
    return teamsCache?.abbrevs ?? new Map();
  }
}

interface ScheduleResponse {
  dates?: {
    games?: {
      gamePk?: number;
      teams?: { away?: { score?: number }; home?: { score?: number } };
      lineups?: { homePlayers?: { id?: number }[]; awayPlayers?: { id?: number }[] };
    }[];
  }[];
}

/** What the schedule tells us about one game that its own log rows can't. */
interface ScheduledGame {
  homeScore: number | null;
  awayScore: number | null;
  // The posted batting orders, in order — index + 1 is the slot. Empty for a
  // game that hasn't been played; a player who came off the bench is in
  // neither, which is why an unlisted batter gets no spot rather than a guess.
  homeLineup: number[];
  awayLineup: number[];
}

type Schedule = Map<number, ScheduledGame>;

const scheduleCache = new Map<number, { games: Schedule; fetchedAt: number }>();

/**
 * The season's schedule in one call, keyed by gamePk — the two things a
 * `stats(gameLog)` split leaves out. It carries the opponent and `isWin` but
 * **no score at all**, and nothing about where a batter hit; asking per game
 * would be 150 requests to fill two columns. `hydrate=lineups` is what makes it
 * one: every *completed* game in the response carries both batting orders (only
 * scheduled and postponed ones don't, which have no log rows anyway). ~650KB
 * with the fields cut to scores and player ids, and one player's log warms it
 * for every other.
 */
async function getSchedule(season: number): Promise<Schedule> {
  const hit = scheduleCache.get(season);
  if (hit && Date.now() - hit.fetchedAt < SCORES_TTL) return hit.games;
  const url =
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${season}&gameType=R` +
    `&hydrate=lineups&fields=dates,games,gamePk,teams,away,home,score,lineups,homePlayers,awayPlayers,id`;
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`schedule returned ${res.status}`);
    const data = (await res.json()) as ScheduleResponse;
    const games: Schedule = new Map();
    const ids = (players: { id?: number }[] | undefined): number[] =>
      (players ?? []).map((p) => p.id ?? 0);
    for (const d of data.dates ?? []) {
      for (const g of d.games ?? []) {
        if (!g.gamePk) continue;
        const home = g.teams?.home?.score;
        const away = g.teams?.away?.score;
        games.set(g.gamePk, {
          // Absent until first pitch — a scheduled game has the keys, no score.
          homeScore: typeof home === 'number' ? home : null,
          awayScore: typeof away === 'number' ? away : null,
          homeLineup: ids(g.lineups?.homePlayers),
          awayLineup: ids(g.lineups?.awayPlayers),
        });
      }
    }
    scheduleCache.set(season, { games, fetchedAt: Date.now() });
    return games;
  } catch (err) {
    console.error('schedule fetch failed:', err);
    // A missing entry costs a row its score and lineup spot, not the log.
    return hit?.games ?? new Map();
  }
}

/** One `stats(type=[gameLog])` split, as far as we read it. */
interface GameLogSplit {
  date?: string;
  isHome?: boolean;
  isWin?: boolean;
  gameType?: string;
  opponent?: { id?: number; name?: string };
  game?: { gamePk?: number };
  stat?: Record<string, unknown>;
}

interface PeopleGameLogResponse {
  people?: { id: number; stats?: { type?: { displayName?: string }; splits?: GameLogSplit[] }[] }[];
}

const n = (v: unknown): number => (typeof v === 'number' ? v : 0);
const s = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '—';

function toEntry(sp: GameLogSplit, abbrevs: Map<number, string>, sched: Schedule): GameLogEntry {
  const oppId = sp.opponent?.id ?? 0;
  const gamePk = sp.game?.gamePk ?? 0;
  const g = sched.get(gamePk);
  // Turned around to his side of it — the split says which end he was on.
  const home = sp.isHome === true;
  return {
    gamePk,
    date: sp.date ?? '',
    home,
    opponentId: oppId,
    opponent: abbrevs.get(oppId) ?? sp.opponent?.name ?? '—',
    // Absent on a game that hasn't been decided (suspended, in progress).
    win: typeof sp.isWin === 'boolean' ? sp.isWin : null,
    teamScore: (home ? g?.homeScore : g?.awayScore) ?? null,
    opponentScore: (home ? g?.awayScore : g?.homeScore) ?? null,
    summary: typeof sp.stat?.summary === 'string' ? sp.stat.summary : '',
  };
}

function toBatterGame(
  sp: GameLogSplit,
  playerId: number,
  abbrevs: Map<number, string>,
  sched: Schedule,
): BatterGameLog {
  const st = sp.stat ?? {};
  const lineup = (sp.isHome === true ? sched.get(sp.game?.gamePk ?? 0)?.homeLineup : sched.get(sp.game?.gamePk ?? 0)?.awayLineup) ?? [];
  const at = lineup.indexOf(playerId);
  return {
    ...toEntry(sp, abbrevs, sched),
    // Where he hit, from the posted order. Null when he isn't in it — he came
    // off the bench, and the posted lineup can't say whose spot he took.
    lineupSpot: at >= 0 ? at + 1 : null,
    pa: n(st.plateAppearances),
    ab: n(st.atBats),
    runs: n(st.runs),
    hits: n(st.hits),
    doubles: n(st.doubles),
    triples: n(st.triples),
    hr: n(st.homeRuns),
    rbi: n(st.rbi),
    bb: n(st.baseOnBalls),
    so: n(st.strikeOuts),
    sb: n(st.stolenBases),
    // Not columns of their own — they're what lets the client's season row
    // recompute OBP/SLG from the sums instead of averaging per-game rates.
    hbp: n(st.hitByPitch),
    sacFlies: n(st.sacFlies),
    totalBases: n(st.totalBases),
    // Season-to-date through this game, which is how the game log reports
    // them — see the field comments on BatterGameLog.
    seasonAvg: s(st.avg),
    seasonObp: s(st.obp),
    seasonSlg: s(st.slg),
    seasonOps: s(st.ops),
  };
}

/**
 * His credit for this game. The game log counts each as a 0/1 tally rather than
 * naming one, so they're checked in scorebook order — a start that also earned
 * the win is a W, and a hold only surfaces when nothing above it did.
 */
function decisionOf(st: Record<string, unknown>): PitchingCredit | null {
  if (n(st.wins) > 0) return 'W';
  if (n(st.losses) > 0) return 'L';
  if (n(st.saves) > 0) return 'S';
  if (n(st.holds) > 0) return 'H';
  return null;
}

/**
 * The three true outcomes and the outs behind them, accumulated down the log so
 * each row can carry a season-to-date FIP. MLB publishes ERA and WHIP that way
 * itself; it publishes no FIP at all, and the counting stats in a game-log split
 * are **that game's own** — so the running totals have to be kept here, over the
 * splits in the order MLB sends them, which is scorebook order (the reverse of
 * the order the table reads in).
 */
interface RunningFip {
  hr: number;
  bb: number;
  hbp: number;
  k: number;
  outs: number;
}

function toPitcherGame(
  sp: GameLogSplit,
  abbrevs: Map<number, string>,
  sched: Schedule,
  appearances: Appearances,
  fip: number | null,
): PitcherGameLog {
  const st = sp.stat ?? {};
  const app = appearances.get(sp.game?.gamePk ?? 0) ?? null;
  return {
    ...toEntry(sp, abbrevs, sched),
    // Which innings he was in and what he inherited — neither is anywhere in
    // MLB's game log, so both come off his season's pitch-level CSV and are
    // null whenever that fetch failed.
    firstInning: app?.firstInning ?? null,
    lastInning: app?.lastInning ?? null,
    entryMargin: app?.entryMargin ?? null,
    decision: decisionOf(st),
    started: n(st.gamesStarted) > 0,
    // `outs` is what the client's season row sums — "5.1" thirds don't add up.
    outs: n(st.outs),
    inningsPitched: s(st.inningsPitched),
    hits: n(st.hits),
    runs: n(st.runs),
    earnedRuns: n(st.earnedRuns),
    walks: n(st.baseOnBalls),
    strikeOuts: n(st.strikeOuts),
    hr: n(st.homeRuns),
    hitBatsmen: n(st.hitBatsmen),
    battersFaced: n(st.battersFaced),
    pitches: n(st.numberOfPitches),
    strikes: n(st.strikes),
    seasonEra: s(st.era),
    // Ours, not MLB's — see `RunningFip`. Formatted here the way the pitcher
    // card's season line formats its own, so the two read alike.
    seasonFip: fip === null ? null : fip.toFixed(2),
    seasonWhip: s(st.whip),
  };
}

const batterCache = new Map<string, { games: BatterGameLog[]; fetchedAt: number }>();
const pitcherCache = new Map<string, { games: PitcherGameLog[]; fetchedAt: number }>();

async function fetchSplits(
  playerId: number,
  season: number,
  group: 'hitting' | 'pitching',
): Promise<GameLogSplit[]> {
  const url =
    `https://statsapi.mlb.com/api/v1/people?personIds=${playerId}` +
    `&hydrate=${encodeURIComponent(`stats(group=[${group}],type=[gameLog],season=${season})`)}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`people/gameLog returned ${res.status}`);
  const data = (await res.json()) as PeopleGameLogResponse;
  const person = (data.people ?? []).find((p) => p.id === playerId);
  const group0 = (person?.stats ?? []).find((g) => g.type?.displayName === 'gameLog');
  // Regular season only: a spring or exhibition line sits in the same list and
  // would land in the middle of the log with stats nobody means to read.
  return (group0?.splits ?? []).filter((sp) => !sp.gameType || sp.gameType === 'R');
}

/**
 * One row per game the player appeared in this season, **newest first** — the
 * order a game log is read in, and the reverse of the API's.
 *
 * A player who hasn't played (or whose group is empty — a pitcher's hitting log)
 * yields an empty list rather than an error: the tab says "no games", which is
 * the truth, and there's nothing here that should take the details view down.
 */
export async function getBatterGameLog(
  playerId: number,
  season: number = new Date().getFullYear(),
): Promise<BatterGameLog[]> {
  const key = `${playerId}-${season}`;
  const hit = batterCache.get(key);
  if (hit && Date.now() - hit.fetchedAt < GAME_LOG_TTL) return hit.games;
  const [splits, abbrevs, sched] = await Promise.all([
    fetchSplits(playerId, season, 'hitting'),
    getTeamAbbrevs(),
    getSchedule(season),
  ]);
  const games = splits.map((sp) => toBatterGame(sp, playerId, abbrevs, sched)).reverse();
  batterCache.set(key, { games, fetchedAt: Date.now() });
  return games;
}

export async function getPitcherGameLog(
  playerId: number,
  season: number = new Date().getFullYear(),
): Promise<PitcherGameLog[]> {
  const key = `${playerId}-${season}`;
  const hit = pitcherCache.get(key);
  if (hit && Date.now() - hit.fetchedAt < GAME_LOG_TTL) return hit.games;
  const [splits, abbrevs, sched, appearances] = await Promise.all([
    fetchSplits(playerId, season, 'pitching'),
    getTeamAbbrevs(),
    getSchedule(season),
    // His season's pitch rows, which the Arsenal tab has usually already warmed.
    // A failed CSV costs the log its innings and entry columns, nothing else.
    getSeasonArsenal(playerId).then(
      (a) => a.appearances,
      (err) => {
        console.error('season arsenal (appearances) failed:', err);
        return new Map() as Appearances;
      },
    ),
  ]);
  // Oldest first, which is how MLB sends them — the running totals behind each
  // row's FIP only mean anything in that order, so they are accumulated before
  // the list is turned around for the table.
  const run: RunningFip = { hr: 0, bb: 0, hbp: 0, k: 0, outs: 0 };
  const games = splits
    .map((sp) => {
      const st = sp.stat ?? {};
      run.hr += n(st.homeRuns);
      run.bb += n(st.baseOnBalls);
      run.hbp += n(st.hitBatsmen);
      run.k += n(st.strikeOuts);
      run.outs += n(st.outs);
      return toPitcherGame(
        sp,
        abbrevs,
        sched,
        appearances,
        fipLike(run.hr, run.bb, run.hbp, run.k, run.outs),
      );
    })
    .reverse();
  pitcherCache.set(key, { games, fetchedAt: Date.now() });
  return games;
}

/** One game a pitcher **started**, which is the whole of what a rotation
 *  projection needs to know about his season. */
export interface StartedGame {
  gamePk: number;
  date: string;
}

const startsCache = new Map<string, { starts: StartedGame[]; fetchedAt: number }>();

/**
 * The games he started this season, oldest first — `projectedStarts.ts`'s half
 * of the game log.
 *
 * **It shares `fetchSplits` and deliberately not `getPitcherGameLog`.** That one
 * is the log as the table draws it, and getting there costs two joins this
 * question has no use for: the league-wide season schedule (~650KB, for scores
 * and lineup spots) and his season's pitch-level Savant CSV (for the innings he
 * was in). A projection wants two fields off each split — which game, and did he
 * start it — so paying for either would be the same mistake `nextGame.ts` records
 * for not widening `getSchedule`: buying the whole season to read one club's
 * week. What is shared is the thing that matters, the *fetch* — one URL, one
 * regular-season filter, so the log and the projection can never disagree about
 * which games are his.
 *
 * Oldest first, which is the order MLB sends them and the order a cadence is
 * measured in — the reverse of the order the table reads.
 */
export async function getPitcherStarts(
  playerId: number,
  season: number,
): Promise<StartedGame[]> {
  const key = `${playerId}-${season}`;
  const hit = startsCache.get(key);
  if (hit && Date.now() - hit.fetchedAt < GAME_LOG_TTL) return hit.starts;
  const splits = await fetchSplits(playerId, season, 'pitching');
  const starts = splits
    .filter((sp) => n(sp.stat?.gamesStarted) > 0)
    .map((sp) => ({ gamePk: sp.game?.gamePk ?? 0, date: sp.date ?? '' }))
    .filter((g) => g.gamePk > 0 && g.date !== '');
  startsCache.set(key, { starts, fetchedAt: Date.now() });
  return starts;
}
