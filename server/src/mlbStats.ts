import { readBlob, writeBlob } from './storage.js';
import { toSavantName } from './names.js';
import type {
  BaseState,
  GameStatus,
  PitcherSeasonStats,
  PitchingLine,
  ProbablePitcher,
  RosterStatus,
  SeasonPlayer,
  SeasonStats,
} from './types.js';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

async function fetchCached(url: string, cacheFile: string): Promise<string> {
  const hit = await readCache(cacheFile);
  if (hit !== null) return hit;
  const text = await fetchText(url);
  await writeCache(cacheFile, text);
  return text;
}

// The cache tier lives in storage.ts — the local filesystem by default, S3 when
// CACHE_BUCKET is set. Key names are unchanged either way.
const readCache = readBlob;
const writeCache = writeBlob;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) {
    throw new Error(`MLB Stats API returned ${res.status} for ${url}`);
  }
  return res.text();
}

// ---- Schedule ---------------------------------------------------------

interface GameStatusFields {
  abstractGameState?: string;
  codedGameState?: string;
  detailedState?: string;
}
interface ScheduleGame {
  gamePk: number;
  status?: GameStatusFields;
}
interface ScheduleResponse {
  dates?: { games?: ScheduleGame[] }[];
}

/** A game on a date's schedule, with the status that date's schedule reports. */
export interface ScheduledGame {
  gamePk: number;
  /**
   * Postponed for THIS date per the schedule endpoint. The game's own feed/live
   * can't be trusted for this: once a postponed game is rescheduled its gamePk is
   * reused and the feed rolls forward to the makeup date, reading "Scheduled"
   * again — only the original date's schedule still says "Postponed".
   */
  postponed: boolean;
  /** The schedule's human label for this date, e.g. "Postponed". */
  detailedState: string;
}

/** Postponed per a raw status blob (feed or schedule). MLB reports a postponed
 * game as abstractGameState "Final", so this can't lean on that field: it keys
 * off codedGameState 'D' / the "Postponed" detailedState label. */
function isPostponedStatus(s: GameStatusFields | undefined): boolean {
  return s?.codedGameState === 'D' || s?.detailedState?.startsWith('Postponed') === true;
}

/** All regular-season games on a date (YYYY-MM-DD), with their schedule status. */
export async function getGamesForDate(date: string): Promise<ScheduledGame[]> {
  const url =
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&gameTypes=R` +
    `&fields=dates,games,gamePk,status,codedGameState,detailedState,abstractGameState`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) {
    throw new Error(`MLB Stats API schedule returned ${res.status} for ${date}`);
  }
  const data = (await res.json()) as ScheduleResponse;
  const games: ScheduledGame[] = [];
  for (const d of data.dates ?? []) {
    for (const g of d.games ?? []) {
      games.push({
        gamePk: g.gamePk,
        postponed: isPostponedStatus(g.status),
        detailedState: g.status?.detailedState ?? '',
      });
    }
  }
  return games;
}

// ---- Season player list (for watchlist search/autocomplete) -----------

interface SportsPlayersPerson {
  id: number;
  fullName: string;
  primaryPosition?: { code?: string; abbreviation?: string };
  currentTeam?: { id?: number };
}
interface SportsPlayersResponse {
  people?: SportsPlayersPerson[];
}
interface TeamsResponse {
  teams?: { id: number; name: string }[];
}

/** MLB Stats API's player payload only carries currentTeam.id, not its name. */
async function getTeamNamesById(): Promise<Map<number, string>> {
  const url = 'https://statsapi.mlb.com/api/v1/teams?sportId=1&fields=teams,id,name';
  const res = await fetch(url, { headers: UA });
  if (!res.ok) {
    throw new Error(`MLB Stats API teams returned ${res.status}`);
  }
  const data = (await res.json()) as TeamsResponse;
  return new Map((data.teams ?? []).map((t) => [t.id, t.name]));
}

/** How long a season's player list stays fresh before we re-download (ms). */
const SEASON_PLAYERS_TTL = 60 * 60 * 1000;
const seasonPlayersCache = new Map<number, { players: SeasonPlayer[]; fetchedAt: number }>();

/** Every player rostered for a season (for watchlist search) — batters and
 * pitchers alike; the caller distinguishes by `position` ('P' for pitchers). */
export async function getSeasonPlayers(
  season: number = new Date().getFullYear(),
): Promise<SeasonPlayer[]> {
  const cached = seasonPlayersCache.get(season);
  if (cached && Date.now() - cached.fetchedAt < SEASON_PLAYERS_TTL) {
    return cached.players;
  }

  const url =
    `https://statsapi.mlb.com/api/v1/sports/1/players?season=${season}` +
    `&fields=people,id,fullName,primaryPosition,code,abbreviation,currentTeam,id`;
  const [res, teamNames] = await Promise.all([fetch(url, { headers: UA }), getTeamNamesById()]);
  if (!res.ok) {
    throw new Error(`MLB Stats API sports/players returned ${res.status} for season ${season}`);
  }
  const data = (await res.json()) as SportsPlayersResponse;

  const players: SeasonPlayer[] = (data.people ?? []).flatMap((p) => {
    const row = {
      id: p.id,
      name: p.fullName,
      savantName: toSavantName(p.fullName),
      team: (p.currentTeam?.id !== undefined && teamNames.get(p.currentTeam.id)) || '',
      position: p.primaryPosition?.abbreviation ?? '',
    };
    // A two-way player (position code 'Y') gets a row per kind, so he can be
    // watched as a hitter, as a pitcher, or both — they're separate entries.
    if (p.primaryPosition?.code === 'Y') {
      return [
        { ...row, kind: 'batter' as const },
        { ...row, kind: 'pitcher' as const },
      ];
    }
    return [{ ...row, kind: p.primaryPosition?.code === '1' ? ('pitcher' as const) : ('batter' as const) }];
  });

  seasonPlayersCache.set(season, { players, fetchedAt: Date.now() });
  return players;
}

// ---- Season batting stats + platoon splits (shown on each player's card) ----

interface PeopleStatsPerson {
  id: number;
  stats?: {
    type?: { displayName?: string };
    splits?: { split?: { code?: string }; stat?: Record<string, unknown> }[];
  }[];
}
interface PeopleStatsResponse {
  people?: PeopleStatsPerson[];
}

/** Season line plus vs-LHP / vs-RHP splits for one player. */
export interface PlayerStats {
  season: SeasonStats | null;
  vsLeft: SeasonStats | null; // vs LHP
  vsRight: SeasonStats | null; // vs RHP
}

const EMPTY_PLAYER_STATS: PlayerStats = { season: null, vsLeft: null, vsRight: null };

const s = (v: unknown): string => (typeof v === 'string' ? v : '.---');
const n = (v: unknown): number => (typeof v === 'number' ? v : 0);

function toSeasonStats(stat: Record<string, unknown>): SeasonStats {
  return {
    gamesPlayed: n(stat.gamesPlayed),
    pa: n(stat.plateAppearances),
    avg: s(stat.avg),
    obp: s(stat.obp),
    slg: s(stat.slg),
    ops: s(stat.ops),
    hr: n(stat.homeRuns),
    rbi: n(stat.rbi),
    hits: n(stat.hits),
    atBats: n(stat.atBats),
    runs: n(stat.runs),
    sb: n(stat.stolenBases),
  };
}

/** Fold one person's hydrated stat groups into a season line + L/R splits. */
function parsePlayerStats(p: PeopleStatsPerson): PlayerStats {
  const out: PlayerStats = { season: null, vsLeft: null, vsRight: null };
  for (const grp of p.stats ?? []) {
    const type = grp.type?.displayName;
    for (const sp of grp.splits ?? []) {
      if (!sp.stat) continue;
      if (type === 'season') out.season = toSeasonStats(sp.stat);
      else if (type === 'statSplits') {
        if (sp.split?.code === 'vl') out.vsLeft = toSeasonStats(sp.stat);
        else if (sp.split?.code === 'vr') out.vsRight = toSeasonStats(sp.stat);
      }
    }
  }
  return out;
}

/** Per-player stats stay fresh for 30 min — they only move once a day. */
const SEASON_STATS_TTL = 30 * 60 * 1000;
const playerStatsCache = new Map<number, { stats: PlayerStats; fetchedAt: number }>();

/**
 * Season hitting line and vs-LHP/vs-RHP platoon splits for each id, batched into
 * one people?hydrate=stats request for the ids whose cache entry is missing or
 * stale. Missing groups (e.g. a player who hasn't hit yet) map to null.
 */
export async function getPlayerStats(
  ids: number[],
  season: number = new Date().getFullYear(),
): Promise<Map<number, PlayerStats>> {
  const now = Date.now();
  const stale = ids.filter((id) => {
    const c = playerStatsCache.get(id);
    return !c || now - c.fetchedAt >= SEASON_STATS_TTL;
  });

  if (stale.length > 0) {
    const url =
      `https://statsapi.mlb.com/api/v1/people?personIds=${stale.join(',')}` +
      `&hydrate=${encodeURIComponent(
        `stats(group=[hitting],type=[season,statSplits],sitCodes=[vr,vl],season=${season})`,
      )}`;
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(`people/stats returned ${res.status}`);
      const data = (await res.json()) as PeopleStatsResponse;
      const seen = new Set<number>();
      for (const p of data.people ?? []) {
        playerStatsCache.set(p.id, { stats: parsePlayerStats(p), fetchedAt: now });
        seen.add(p.id);
      }
      // Cache empties for ids the response omitted so we don't refetch in a loop.
      for (const id of stale) {
        if (!seen.has(id)) playerStatsCache.set(id, { stats: EMPTY_PLAYER_STATS, fetchedAt: now });
      }
    } catch (err) {
      console.error('player stats fetch failed:', err);
    }
  }

  return new Map(ids.map((id) => [id, playerStatsCache.get(id)?.stats ?? EMPTY_PLAYER_STATS]));
}

// ---- Season pitching stats + platoon splits (for watched pitchers) ----------

const str = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '—';
/** A rate to three decimals, no leading zero — ".291". */
const rate3 = (x: number): string => {
  const t = x.toFixed(3);
  return t.startsWith('0.') ? t.slice(1) : t;
};

/** Season pitching line plus vs-LHB / vs-RHB splits for one pitcher. */
export interface PitcherStats {
  season: PitcherSeasonStats | null;
  vsLeft: PitcherSeasonStats | null; // vs LHB
  vsRight: PitcherSeasonStats | null; // vs RHB
}
const EMPTY_PITCHER_STATS: PitcherStats = { season: null, vsLeft: null, vsRight: null };

function toPitcherSeasonStats(stat: Record<string, unknown>): PitcherSeasonStats {
  const bf = n(stat.battersFaced);
  const k = n(stat.strikeOuts);
  const bb = n(stat.baseOnBalls);
  const perBf = (num: number) => (bf > 0 ? rate3(num / bf) : '—');
  return {
    gamesPlayed: n(stat.gamesPlayed),
    gamesStarted: n(stat.gamesStarted),
    battersFaced: bf,
    inningsPitched: str(stat.inningsPitched),
    era: str(stat.era),
    whip: str(stat.whip),
    strikeOuts: k,
    baseOnBalls: bb,
    hits: n(stat.hits),
    homeRuns: n(stat.homeRuns),
    strikeoutsPer9: str(stat.strikeoutsPer9Inn),
    walksPer9: str(stat.walksPer9Inn),
    kRate: perBf(k),
    bbRate: perBf(bb),
    avgAgainst: str(stat.avg),
  };
}

function parsePitcherStats(p: PeopleStatsPerson): PitcherStats {
  const out: PitcherStats = { season: null, vsLeft: null, vsRight: null };
  for (const grp of p.stats ?? []) {
    const type = grp.type?.displayName;
    for (const sp of grp.splits ?? []) {
      if (!sp.stat) continue;
      if (type === 'season') out.season = toPitcherSeasonStats(sp.stat);
      else if (type === 'statSplits') {
        if (sp.split?.code === 'vl') out.vsLeft = toPitcherSeasonStats(sp.stat);
        else if (sp.split?.code === 'vr') out.vsRight = toPitcherSeasonStats(sp.stat);
      }
    }
  }
  return out;
}

const pitcherStatsCache = new Map<number, { stats: PitcherStats; fetchedAt: number }>();

/** Season pitching line + vs-L/R splits for each id, mirroring getPlayerStats but
 * hydrating the pitching stat group. */
export async function getPitcherStats(
  ids: number[],
  season: number = new Date().getFullYear(),
): Promise<Map<number, PitcherStats>> {
  const now = Date.now();
  const stale = ids.filter((id) => {
    const c = pitcherStatsCache.get(id);
    return !c || now - c.fetchedAt >= SEASON_STATS_TTL;
  });

  if (stale.length > 0) {
    const url =
      `https://statsapi.mlb.com/api/v1/people?personIds=${stale.join(',')}` +
      `&hydrate=${encodeURIComponent(
        `stats(group=[pitching],type=[season,statSplits],sitCodes=[vr,vl],season=${season})`,
      )}`;
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(`people/pitching-stats returned ${res.status}`);
      const data = (await res.json()) as PeopleStatsResponse;
      const seen = new Set<number>();
      for (const p of data.people ?? []) {
        pitcherStatsCache.set(p.id, { stats: parsePitcherStats(p), fetchedAt: now });
        seen.add(p.id);
      }
      for (const id of stale) {
        if (!seen.has(id)) pitcherStatsCache.set(id, { stats: EMPTY_PITCHER_STATS, fetchedAt: now });
      }
    } catch (err) {
      console.error('pitcher stats fetch failed:', err);
    }
  }
  return new Map(ids.map((id) => [id, pitcherStatsCache.get(id)?.stats ?? EMPTY_PITCHER_STATS]));
}

// ---- Roster status + current team (for absent/off-roster players) ------

/** A player's current team id and 40-man roster status (IL, suspended, ...). */
export interface RosterInfo {
  teamId: number | null;
  status: RosterStatus | null;
}

/** Team ids and rosters move at most day to day, so a 30-min TTL is plenty. */
const ROSTER_INFO_TTL = 30 * 60 * 1000;
const playerTeamCache = new Map<number, { teamId: number | null; fetchedAt: number }>();

interface PeopleTeamResponse {
  people?: { id: number; currentTeam?: { id?: number } }[];
}

/** Each id's current team id, batched into one people?hydrate=currentTeam call. */
async function getPlayerTeamIds(ids: number[]): Promise<Map<number, number | null>> {
  const now = Date.now();
  const stale = ids.filter((id) => {
    const c = playerTeamCache.get(id);
    return !c || now - c.fetchedAt >= ROSTER_INFO_TTL;
  });

  if (stale.length > 0) {
    try {
      const url =
        `https://statsapi.mlb.com/api/v1/people?personIds=${stale.join(',')}` +
        `&hydrate=currentTeam&fields=people,id,currentTeam`;
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(`people/currentTeam returned ${res.status}`);
      const data = (await res.json()) as PeopleTeamResponse;
      const seen = new Set<number>();
      for (const p of data.people ?? []) {
        playerTeamCache.set(p.id, { teamId: p.currentTeam?.id ?? null, fetchedAt: now });
        seen.add(p.id);
      }
      // Cache misses too, so an unknown id doesn't refetch every request.
      for (const id of stale) {
        if (!seen.has(id)) playerTeamCache.set(id, { teamId: null, fetchedAt: now });
      }
    } catch (err) {
      console.error('player team lookup failed:', err);
    }
  }

  return new Map(ids.map((id) => [id, playerTeamCache.get(id)?.teamId ?? null]));
}

interface RosterResponse {
  roster?: { person?: { id?: number }; status?: { code?: string; description?: string } }[];
}

const teamRosterCache = new Map<number, { byPlayer: Map<number, RosterStatus>; fetchedAt: number }>();

/**
 * Every 40-man player's status for one team, by player id. The 40-man roster
 * (unlike the active roster) still lists players who are on the IL, suspended,
 * or optioned to the minors — exactly the cases where a watched player has no
 * game of their own but we still want to explain why.
 */
async function getTeamRosterStatus(teamId: number): Promise<Map<number, RosterStatus>> {
  const cached = teamRosterCache.get(teamId);
  if (cached && Date.now() - cached.fetchedAt < ROSTER_INFO_TTL) return cached.byPlayer;

  const byPlayer = new Map<number, RosterStatus>();
  try {
    const url =
      `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=40Man` +
      `&fields=roster,person,id,status,code,description`;
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`roster returned ${res.status}`);
    const data = (await res.json()) as RosterResponse;
    for (const r of data.roster ?? []) {
      const id = r.person?.id;
      const code = r.status?.code;
      const description = r.status?.description;
      if (typeof id === 'number' && code && description) byPlayer.set(id, { code, description });
    }
  } catch (err) {
    console.error(`team roster fetch failed for ${teamId}:`, err);
  }

  teamRosterCache.set(teamId, { byPlayer, fetchedAt: Date.now() });
  return byPlayer;
}

/**
 * Each player's current team id and 40-man roster status. The team id lets a
 * report tie a watched player to their team's games even when they're off the
 * active roster (suspended, on the IL, optioned) and therefore absent from every
 * game's boxscore; the status is surfaced on the card to explain the absence.
 */
export async function getRosterInfo(ids: number[]): Promise<Map<number, RosterInfo>> {
  const teamByPlayer = await getPlayerTeamIds(ids);
  const teamIds = [...new Set([...teamByPlayer.values()].filter((t): t is number => t !== null))];
  const rosters = new Map<number, Map<number, RosterStatus>>();
  await Promise.all(
    teamIds.map(async (tid) => {
      rosters.set(tid, await getTeamRosterStatus(tid));
    }),
  );
  return new Map(
    ids.map((id) => {
      const teamId = teamByPlayer.get(id) ?? null;
      const status = teamId !== null ? rosters.get(teamId)?.get(id) ?? null : null;
      return [id, { teamId, status }];
    }),
  );
}

// ---- Live feed (pitch-by-pitch + Statcast-style pitch/hit data) -------

const FEED_FIELDS = [
  'gameData',
  'status',
  'abstractGameState',
  'codedGameState',
  'detailedState',
  // gameData.game.gameNumber — needed to order a day's games (doubleheaders).
  'game',
  'gameNumber',
  'datetime',
  'dateTime',
  'teams',
  'away',
  'home',
  'abbreviation',
  'liveData',
  'linescore',
  // Boxscore rosters — the per-side player ids, so a watched player can be tied
  // to a game they were rostered for even if they never batted (e.g. benched in
  // a final game → "did not appear" with the score still shown). battingOrder
  // (per player, a multiple of 100 for starters) marks the announced lineup.
  'boxscore',
  'players',
  'person',
  'battingOrder',
  'currentInning',
  'inningState',
  'isTopInning',
  'runs',
  'plays',
  'allPlays',
  'about',
  'atBatIndex',
  'halfInning',
  'isTopInning',
  'inning',
  // Per-play timestamps — the sort key for the cross-game "most recent at-bat"
  // live feed (endTime once the PA is over, startTime while it's in progress).
  'startTime',
  'endTime',
  'count',
  'balls',
  'strikes',
  'outs',
  'matchup',
  'batter',
  'pitcher',
  'probablePitchers',
  'postOnFirst',
  'postOnSecond',
  'postOnThird',
  'id',
  'fullName',
  'batSide',
  'code',
  'pitchHand',
  'result',
  'event',
  'eventType',
  'description',
  'rbi',
  'runners',
  'movement',
  // runners[].details.earned — earned/unearned flag on a scoring runner;
  // responsiblePitcher — who the run is charged to (inherited-runner attribution).
  'earned',
  'responsiblePitcher',
  'end',
  'details',
  'runner',
  'playEvents',
  'isPitch',
  'pitchNumber',
  'call',
  'type',
  'pitchData',
  'startSpeed',
  'coordinates',
  'pX',
  'pZ',
  'strikeZoneTop',
  'strikeZoneBottom',
  'breaks',
  'spinRate',
  'zone',
  'hitData',
  'launchSpeed',
  'launchAngle',
  'totalDistance',
  'trajectory',
  'isInPlay',
  'playId',
  // Break metrics (children of the already-requested `breaks` object — they come
  // through even without being named, but list them so the intent is explicit).
  'breakVertical',
  'breakVerticalInduced',
  'breakHorizontal',
  'spinDirection',
  // The fielding team's current pitcher (live feed) — for the "Pitching" role.
  'defense',
  // Boxscore per-pitcher line — the authoritative IP/H/R/ER/BB/K/HR/pitch counts.
  // (runs/strikes/balls are already requested above.) `fields` is leaf-name
  // matched, so naming `stats`+`pitching`+these pulls ONLY the pitching group.
  'stats',
  'pitching',
  'inningsPitched',
  'hits',
  'earnedRuns',
  'baseOnBalls',
  'strikeOuts',
  'homeRuns',
  'numberOfPitches',
  'battersFaced',
  'gamesStarted',
  // The rest of the pitching line: extra-base hits, hit batters, the at-bats
  // that back BAA, and the reliever's inherited-runner accounting.
  'doubles',
  'triples',
  'hitBatsmen',
  'atBats',
  'intentionalWalks',
  'wildPitches',
  'inheritedRunners',
  'inheritedRunnersScored',
  // liveData.decisions — the winning / losing / save pitcher (final games).
  'decisions',
  'winner',
  'loser',
  'save',
].join(',');

interface FeedPitchData {
  startSpeed?: number;
  coordinates?: { pX?: number; pZ?: number };
  strikeZoneTop?: number;
  strikeZoneBottom?: number;
  breaks?: {
    spinRate?: number;
    // Induced vertical break and horizontal break, in inches — Statcast movement.
    breakVerticalInduced?: number;
    breakHorizontal?: number;
    spinDirection?: number;
  };
  zone?: number;
}
interface FeedHitData {
  launchSpeed?: number;
  launchAngle?: number;
  totalDistance?: number;
  trajectory?: string;
}
interface FeedPlayEvent {
  isPitch?: boolean;
  pitchNumber?: number;
  playId?: string;
  count?: { balls?: number; strikes?: number };
  details?: {
    call?: { code?: string; description?: string };
    type?: { code?: string; description?: string };
    isInPlay?: boolean;
  };
  pitchData?: FeedPitchData;
  hitData?: FeedHitData;
}
interface FeedRunner {
  movement?: { end?: string | null };
  // `earned` is set on a scoring runner (movement.end === 'score'): true when the
  // run is charged as earned, false when the defense's errors made it unearned.
  // `responsiblePitcher` is the pitcher charged with the run (an inherited runner
  // stays charged to the pitcher who allowed him, not the one now on the mound).
  details?: {
    eventType?: string;
    runner?: { id?: number };
    earned?: boolean;
    responsiblePitcher?: { id?: number } | null;
  };
}
interface FeedPlay {
  about?: {
    atBatIndex?: number;
    halfInning?: string;
    inning?: number;
    startTime?: string;
    endTime?: string;
  };
  count?: { outs?: number };
  matchup?: {
    batter?: { id?: number; fullName?: string };
    pitcher?: { id?: number; fullName?: string };
    batSide?: { code?: string };
    pitchHand?: { code?: string };
    // Present (a runner object) when the base is occupied at the END of the PA.
    postOnFirst?: { id?: number } | null;
    postOnSecond?: { id?: number } | null;
    postOnThird?: { id?: number } | null;
  };
  result?: { event?: string; eventType?: string; description?: string; rbi?: number };
  runners?: FeedRunner[];
  playEvents?: FeedPlayEvent[];
}
interface LiveFeed {
  // The full (unfiltered) feed carries metaData.timeStamp, which is the
  // startTimecode for the next diffPatch request while a game is live.
  metaData?: { timeStamp?: string };
  gameData?: {
    status?: { abstractGameState?: string; codedGameState?: string; detailedState?: string };
    // gameNumber is 1 for a single game, 1/2 for the two halves of a
    // doubleheader — the only reliable way to order a day's games, since gamePk
    // is NOT monotonic with game order (a DH's game 2 can have a lower gamePk).
    game?: { gameNumber?: number };
    teams?: {
      home?: { abbreviation?: string; id?: number };
      away?: { abbreviation?: string; id?: number };
    };
    datetime?: { dateTime?: string };
    probablePitchers?: {
      home?: { id?: number; fullName?: string };
      away?: { id?: number; fullName?: string };
    };
    // Present only in the full (unfiltered) feed used for live/scheduled games —
    // the source for a probable pitcher's throwing hand.
    players?: Record<string, { pitchHand?: { code?: string } }>;
  };
  liveData?: {
    plays?: { allPlays?: FeedPlay[] };
    linescore?: {
      currentInning?: number;
      inningState?: string;
      isTopInning?: boolean;
      outs?: number;
      teams?: { home?: { runs?: number }; away?: { runs?: number } };
      // Current on-base runners + batter/on-deck (full feed only).
      offense?: {
        batter?: { id?: number } | null;
        onDeck?: { id?: number } | null;
        first?: { id?: number } | null;
        second?: { id?: number } | null;
        third?: { id?: number } | null;
      };
      // The fielding team's current pitcher (full feed only) — drives the
      // "Pitching" live role for a watched pitcher.
      defense?: { pitcher?: { id?: number } | null };
    };
    boxscore?: {
      teams?: { home?: BoxTeam; away?: BoxTeam };
    };
    // The winning / losing / save pitcher for a decided (final) game.
    decisions?: {
      winner?: { id?: number };
      loser?: { id?: number };
      save?: { id?: number };
    };
  };
}

/** A boxscore team's players, with each player's pitching line when present. */
interface BoxTeam {
  players?: Record<
    string,
    {
      person?: { id?: number };
      battingOrder?: string;
      stats?: { pitching?: BoxPitching };
    }
  >;
}

/** The pitching stat line the boxscore carries per pitcher (authoritative). */
interface BoxPitching {
  inningsPitched?: string; // "5.2" (5 IP + 2 outs)
  hits?: number;
  runs?: number;
  earnedRuns?: number;
  baseOnBalls?: number;
  strikeOuts?: number;
  homeRuns?: number;
  numberOfPitches?: number;
  strikes?: number;
  balls?: number;
  battersFaced?: number;
  gamesStarted?: number;
  doubles?: number;
  triples?: number;
  hitBatsmen?: number;
  atBats?: number;
  intentionalWalks?: number;
  wildPitches?: number;
  inheritedRunners?: number;
  inheritedRunnersScored?: number;
}

/**
 * A game is "final" once it's over (Final/Game Over/Completed Early). Only final
 * games are safe to cache permanently — an in-progress game keeps accruing
 * plays, so its feed must be re-fetched rather than frozen at first read.
 */
function isFinalFeed(feed: LiveFeed): boolean {
  const status = feed.gameData?.status;
  return (
    status?.abstractGameState === 'Final' ||
    status?.codedGameState === 'F' ||
    status?.codedGameState === 'O'
  );
}

/**
 * A postponed game — moved to a later date, so it never became live/final on the
 * queried date. MLB reports it with `abstractGameState: "Final"` (so isFinalFeed
 * would claim it) and `codedGameState: 'D'` / `detailedState: "Postponed"` — the
 * reliable signals. `rescheduleDate` points at the makeup game; without this
 * branch the game reads as a real Final (no score) or a next-day scheduled game.
 */
function isPostponedFeed(feed: LiveFeed): boolean {
  return isPostponedStatus(feed.gameData?.status);
}

// Compact (field-filtered) feed — used for reads of completed games we persist.
const feedUrl = (gamePk: number) =>
  `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live?fields=${FEED_FIELDS}`;
// Full (unfiltered) feed — the base snapshot a diffPatch stream applies onto.
// diffPatch paths reference the whole document, so its base can't be filtered.
const fullFeedUrl = (gamePk: number) =>
  `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
const diffPatchUrl = (gamePk: number, startTimecode: string) =>
  `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live/diffPatch` +
  `?startTimecode=${startTimecode}`;
const winProbabilityUrl = (gamePk: number) =>
  `https://statsapi.mlb.com/api/v1/game/${gamePk}/winProbability`;

// ---- Win probability (per-play win expectancy added) -------------------

interface WinProbabilityPlay {
  about?: { atBatIndex?: number };
  homeTeamWinProbabilityAdded?: number;
}

function parseWinProbability(text: string): Map<number, number> {
  const plays = JSON.parse(text) as WinProbabilityPlay[];
  const byAtBat = new Map<number, number>();
  for (const p of plays) {
    const idx = p.about?.atBatIndex;
    if (typeof idx === 'number' && typeof p.homeTeamWinProbabilityAdded === 'number') {
      byAtBat.set(idx, p.homeTeamWinProbabilityAdded / 100);
    }
  }
  return byAtBat;
}

// ---- Live feed via diffPatch ------------------------------------------
//
// A live game keeps accruing plays, so rather than re-pulling the whole feed we
// keep the last full snapshot in memory and ask the diffPatch endpoint for just
// the JSON-Patch (RFC 6902) deltas since our snapshot's timeStamp. Any failure
// (stale timecode, unexpected shape, bad patch) falls back to a full re-fetch,
// so correctness never depends on the diff path.

type PatchOp = { op: string; path: string; value?: unknown; from?: string };

// RFC 6901 JSON pointer -> path tokens (with ~1/~0 unescaping).
function pointerTokens(pointer: string): string[] {
  if (pointer === '') return [];
  return pointer
    .split('/')
    .slice(1)
    .map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolvePointer(doc: any, tokens: string[]): any {
  let node = doc;
  for (const t of tokens) {
    if (node == null) return undefined;
    node = node[t];
  }
  return node;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyPatch(doc: any, ops: PatchOp[]): void {
  for (const op of ops) {
    const tokens = pointerTokens(op.path);
    const last = tokens[tokens.length - 1];
    const parent = resolvePointer(doc, tokens.slice(0, -1));
    if (parent == null) throw new Error(`diffPatch: no parent for ${op.path}`);
    switch (op.op) {
      case 'add':
        if (Array.isArray(parent)) {
          if (last === '-') parent.push(op.value);
          else parent.splice(Number(last), 0, op.value);
        } else parent[last] = op.value;
        break;
      case 'replace':
        parent[last] = op.value;
        break;
      case 'remove':
        if (Array.isArray(parent)) parent.splice(Number(last), 1);
        else delete parent[last];
        break;
      case 'move':
      case 'copy': {
        const fromTokens = pointerTokens(op.from ?? '');
        const value = resolvePointer(doc, fromTokens);
        if (op.op === 'move') {
          const fromParent = resolvePointer(doc, fromTokens.slice(0, -1));
          const fromLast = fromTokens[fromTokens.length - 1];
          if (Array.isArray(fromParent)) fromParent.splice(Number(fromLast), 1);
          else delete fromParent[fromLast];
        }
        applyPatch(doc, [{ op: 'add', path: op.path, value }]);
        break;
      }
      case 'test':
        break; // advisory only
      default:
        throw new Error(`diffPatch: unsupported op ${op.op}`);
    }
  }
}

interface DiffPatchResult {
  diffs: PatchOp[][];
  full?: LiveFeed;
}

async function fetchDiffPatch(gamePk: number, startTimecode: string): Promise<DiffPatchResult> {
  const data = JSON.parse(await fetchText(diffPatchUrl(gamePk, startTimecode))) as unknown;
  const items = Array.isArray(data) ? data : [data];
  const diffs: PatchOp[][] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    if (Array.isArray(obj.diff)) {
      diffs.push(obj.diff as PatchOp[]);
    } else if ('gameData' in obj || 'liveData' in obj) {
      // Timecode too old to diff: the API returns the whole feed instead.
      return { diffs: [], full: obj as LiveFeed };
    }
  }
  return { diffs };
}

// ---- Pitch type / call-code normalization (to match Savant vocabulary) -

const PITCH_CODE_TO_NAME: Record<string, string> = {
  FF: '4-Seam Fastball',
  SI: 'Sinker',
  FC: 'Cutter',
  SL: 'Slider',
  ST: 'Sweeper',
  SV: 'Slurve',
  CU: 'Curveball',
  KC: 'Knuckle Curve',
  CH: 'Changeup',
  FS: 'Splitter',
  SC: 'Screwball',
  FO: 'Forkball',
  EP: 'Eephus',
  CS: 'Slow Curve',
  KN: 'Knuckleball',
};

function pitchTypeName(code: string | undefined, fallback: string | undefined): string | null {
  if (code && PITCH_CODE_TO_NAME[code]) return PITCH_CODE_TO_NAME[code];
  return fallback ?? null;
}

const CALL_CODE_TO_DESCRIPTION: Record<string, string> = {
  B: 'ball',
  '*B': 'ball',
  I: 'ball',
  P: 'pitchout',
  C: 'called_strike',
  S: 'swinging_strike',
  W: 'swinging_strike_blocked',
  M: 'missed_bunt',
  F: 'foul',
  L: 'foul_bunt',
  T: 'foul_tip',
  H: 'hit_by_pitch',
  D: 'hit_into_play',
  E: 'hit_into_play',
  X: 'hit_into_play',
};

function pitchDescription(
  callCode: string | undefined,
  fallback: string | undefined,
): string {
  if (callCode && CALL_CODE_TO_DESCRIPTION[callCode]) return CALL_CODE_TO_DESCRIPTION[callCode];
  return (fallback ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const isStolenBase = (et: string): boolean => et.startsWith('stolen_base');
const isCaughtStealing = (et: string): boolean =>
  et.startsWith('caught_stealing') || et.startsWith('pickoff_caught_stealing');

/** The base taken on a stolen_base_* event type, for the feed label. */
const stolenBaseTarget = (et: string): string | null => {
  if (et.endsWith('_2b')) return '2nd';
  if (et.endsWith('_3b')) return '3rd';
  if (et.endsWith('_home')) return 'home';
  return null;
};

// ---- Public per-game model ----------------------------------------------

export interface StatsApiPitch {
  pitchNumber: number;
  pitchType: string | null;
  releaseSpeed: number | null;
  spinRate: number | null;
  description: string;
  balls: number | null;
  strikes: number | null;
  plateX: number | null;
  plateZ: number | null;
  szTop: number | null;
  szBot: number | null;
  zone: number | null;
  launchSpeed: number | null;
  launchAngle: number | null;
  hitDistance: number | null;
  bbType: string | null;
  vBreak: number | null; // induced vertical break, inches
  hBreak: number | null; // horizontal break, inches
}

export interface StatsApiPlateAppearance {
  atBatNumber: number;
  inning: number;
  half: string;
  // ISO time the PA ended (or, for the in-progress at-bat, when it began) — the
  // recency key for the live feed. Null for older cached feeds without it.
  timestamp: string | null;
  outsWhenUp: number;
  onBase: BaseState;
  stand: string | null;
  pThrows: string | null;
  pitcherId: number | null;
  pitcherName: string | null;
  event: string | null;
  description: string;
  rbi: number;
  playId: string | null;
  launchSpeed: number | null;
  launchAngle: number | null;
  hitDistance: number | null;
  bbType: string | null;
  deltaWinExp: number | null;
  pitches: StatsApiPitch[];
}

export interface StatsApiBatterGame {
  batterId: number;
  batterName: string;
  isHome: boolean;
  stand: string | null;
  plateAppearances: StatsApiPlateAppearance[];
}

/** A batter faced from the pitcher's side (result + the pitches thrown to them). */
export interface StatsApiFacedBatter {
  batterId: number;
  batterName: string;
  stand: string | null;
  inning: number;
  half: string;
  outsWhenUp: number;
  onBase: BaseState;
  event: string | null;
  description: string;
  rbi: number;
  // Runs that scored on this play (and how many were earned) — the per-PA basis
  // for the pitcher card's per-inning R/ER line.
  runs: number;
  earnedRuns: number;
  timestamp: string | null;
  playId: string | null;
  launchSpeed: number | null;
  launchAngle: number | null;
  hitDistance: number | null;
  bbType: string | null;
  pitches: StatsApiPitch[];
}

/** A pitcher's game assembled by regrouping the play loop on the pitcher id. */
export interface StatsApiPitcherGame {
  pitcherId: number;
  pitcherName: string;
  isHome: boolean; // the pitcher's team is home
  throws: string | null;
  facedBatters: StatsApiFacedBatter[];
  pitches: StatsApiPitch[]; // every pitch thrown, for arsenal/whiff aggregation
}

// A base-running event by a runner (not a plate appearance) — a stolen base or a
// run scored — captured so the feed can interleave them chronologically with
// at-bats. Keyed by runner id in StatsApiGame.baseEvents.
export interface StatsApiBaseEvent {
  kind: 'sb' | 'run';
  inning: number;
  half: 'Top' | 'Bot';
  timestamp: string | null;
  // For a stolen base, the base taken ("2nd" / "3rd" / "home"); null for a run.
  base: string | null;
}

export interface StatsApiGame {
  gamePk: number;
  // 1 for a single game; 1 or 2 for the halves of a doubleheader. Used to order
  // a day's games, since gamePk isn't reliably ordered by game number.
  gameNumber: number | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number | null;
  awayTeamId: number | null;
  status: GameStatus;
  homeProbablePitcher: ProbablePitcher | null;
  awayProbablePitcher: ProbablePitcher | null;
  // Active-roster player ids per side (from the boxscore) so a watched player
  // can be tied to a scheduled/in-progress game before their first plate
  // appearance. Empty for cached final games, where every appearance is known.
  homePlayerIds: Set<number>;
  awayPlayerIds: Set<number>;
  // The announced starting lineup per side, as player id -> batting slot (1-9).
  // Empty until the lineup is posted, and for old cached feeds without it.
  homeStarters: Map<number, number>;
  awayStarters: Map<number, number>;
  batters: Map<number, StatsApiBatterGame>;
  // Per-pitcher game (regrouped from the same plays), and the authoritative
  // boxscore pitching line per pitcher id.
  pitchers: Map<number, StatsApiPitcherGame>;
  pitchingLines: Map<number, PitchingLine>;
  // The winning / losing / save pitcher ids for a decided game (null until final).
  decisions: { win: number | null; loss: number | null; save: number | null };
  runsByRunner: Map<number, number>;
  sbByRunner: Map<number, number>;
  csByRunner: Map<number, number>;
  // Per-runner base events (stolen bases, runs scored) in play order — for the
  // feed's chronological stream. A run scored on the runner's own plate
  // appearance (a home run) is omitted, since the at-bat already shows it.
  baseEvents: Map<number, StatsApiBaseEvent[]>;
}

const EMPTY_BASES: BaseState = { first: false, second: false, third: false };

/** A base is occupied when its runner slot holds an object rather than null. */
const baseState = (a: unknown, b: unknown, c: unknown): BaseState => ({
  first: a != null,
  second: b != null,
  third: c != null,
});

function buildGameStatus(feed: LiveFeed): GameStatus {
  const s = feed.gameData?.status;
  // Postponed is checked first: MLB marks a postponed game as abstractGameState
  // "Final" (codedGameState 'D'), so isFinalFeed would otherwise claim it as a
  // real final.
  const state: GameStatus['state'] = isPostponedFeed(feed)
    ? 'postponed'
    : isFinalFeed(feed)
      ? 'final'
      : s?.abstractGameState === 'Live'
        ? 'live'
        : 'scheduled';
  const ls = feed.liveData?.linescore;
  const o = ls?.offense;
  const live = state === 'live';
  return {
    state,
    detailedState: s?.detailedState ?? '',
    startTime: feed.gameData?.datetime?.dateTime ?? null,
    homeScore: ls?.teams?.home?.runs ?? null,
    awayScore: ls?.teams?.away?.runs ?? null,
    currentInning: ls?.currentInning ?? null,
    inningState: ls?.inningState ?? null,
    isTopInning: ls?.isTopInning ?? null,
    // Only meaningful mid-game; between innings/at rest there are no runners.
    bases: live ? baseState(o?.first, o?.second, o?.third) : null,
    outs: live ? ls?.outs ?? 0 : null,
    atBatId: live ? o?.batter?.id ?? null : null,
    onDeckId: live ? o?.onDeck?.id ?? null : null,
    onBaseIds: live
      ? [o?.first?.id, o?.second?.id, o?.third?.id].filter((x): x is number => typeof x === 'number')
      : [],
    pitchingId: live ? ls?.defense?.pitcher?.id ?? null : null,
  };
}

function probablePitcher(
  feed: LiveFeed,
  p: { id?: number; fullName?: string } | undefined,
): ProbablePitcher | null {
  if (typeof p?.id !== 'number' || !p.fullName) return null;
  // Handedness lives in gameData.players (full feed only); null if unavailable.
  const hand = feed.gameData?.players?.[`ID${p.id}`]?.pitchHand?.code ?? null;
  return { id: p.id, name: p.fullName, hand };
}

function rosterIds(
  team: { players?: Record<string, { person?: { id?: number } }> } | undefined,
): Set<number> {
  const ids = new Set<number>();
  for (const p of Object.values(team?.players ?? {})) {
    if (typeof p.person?.id === 'number') ids.add(p.person.id);
  }
  return ids;
}

/**
 * A side's announced starting lineup as player id -> batting-order slot (1-9).
 * In the boxscore each player's `battingOrder` is a string like "100".."900" for
 * the nine starters (a multiple of 100, so "300" = batting 3rd) and "101", "302",
 * ... for substitutes; players never in the lineup carry no `battingOrder`. An
 * empty map means the lineup hasn't posted yet.
 */
function startingOrder(
  team: { players?: Record<string, { person?: { id?: number }; battingOrder?: string }> } | undefined,
): Map<number, number> {
  const order = new Map<number, number>();
  for (const p of Object.values(team?.players ?? {})) {
    const id = p.person?.id;
    if (typeof id === 'number' && p.battingOrder && Number(p.battingOrder) % 100 === 0) {
      order.set(id, Number(p.battingOrder) / 100);
    }
  }
  return order;
}

/** Innings pitched string "5.2" → outs recorded (5×3 + 2). */
function ipToOuts(ip: string | undefined): number {
  if (!ip) return 0;
  const [whole, frac] = ip.split('.');
  return (Number(whole) || 0) * 3 + (Number(frac) || 0);
}

/** The authoritative per-pitcher counting line from the boxscore (the play stream
 * can't attribute earned vs unearned / inherited runners). Keyed by pitcher id. */
function parsePitchingLines(feed: LiveFeed): Map<number, PitchingLine> {
  const out = new Map<number, PitchingLine>();
  const teams = feed.liveData?.boxscore?.teams;
  for (const team of [teams?.home, teams?.away]) {
    for (const p of Object.values(team?.players ?? {})) {
      const pit = p.stats?.pitching;
      const id = p.person?.id;
      if (typeof id !== 'number' || !pit || pit.inningsPitched === undefined) continue;
      const pitchesThrown = pit.numberOfPitches ?? 0;
      const strikes = pit.strikes ?? 0;
      out.set(id, {
        outs: ipToOuts(pit.inningsPitched),
        hits: pit.hits ?? 0,
        runs: pit.runs ?? 0,
        earnedRuns: pit.earnedRuns ?? 0,
        walks: pit.baseOnBalls ?? 0,
        strikeouts: pit.strikeOuts ?? 0,
        hr: pit.homeRuns ?? 0,
        battersFaced: pit.battersFaced ?? 0,
        pitchesThrown,
        strikes,
        balls: pit.balls ?? Math.max(0, pitchesThrown - strikes),
        doubles: pit.doubles ?? 0,
        triples: pit.triples ?? 0,
        hitBatsmen: pit.hitBatsmen ?? 0,
        atBats: pit.atBats ?? 0,
        intentionalWalks: pit.intentionalWalks ?? 0,
        wildPitches: pit.wildPitches ?? 0,
        inheritedRunners: pit.inheritedRunners ?? 0,
        inheritedRunnersScored: pit.inheritedRunnersScored ?? 0,
      });
    }
  }
  return out;
}

// Final games are immutable, so they're memoized (and disk-cached) forever.
// In-progress games are held in memory as a full feed snapshot that we advance
// with diffPatch deltas, refreshed at most once per LIVE_GAME_TTL.
const LIVE_GAME_TTL = 10 * 1000;
const gameMemCache = new Map<number, StatsApiGame>();

interface LiveEntry {
  feed: LiveFeed;
  timeStamp: string;
  winExp: Map<number, number>;
  fetchedAt: number;
}
const liveState = new Map<number, LiveEntry>();

/**
 * Up-to-date feed + win expectancy for an in-progress game. Uses the diffPatch
 * endpoint to advance a retained snapshot when possible, falling back to a full
 * fetch. Throttled to one refresh per LIVE_GAME_TTL so repeated report requests
 * within that window reuse the snapshot.
 */
async function getLiveData(gamePk: number): Promise<{ feed: LiveFeed; winExp: Map<number, number> }> {
  const entry = liveState.get(gamePk);
  if (entry && Date.now() - entry.fetchedAt < LIVE_GAME_TTL) {
    return { feed: entry.feed, winExp: entry.winExp };
  }

  let feed: LiveFeed;
  if (entry?.timeStamp) {
    try {
      const res = await fetchDiffPatch(gamePk, entry.timeStamp);
      if (res.full) {
        feed = res.full;
      } else {
        for (const ops of res.diffs) applyPatch(entry.feed, ops);
        feed = entry.feed;
      }
      if (!feed.metaData?.timeStamp) throw new Error('diffPatch: missing timeStamp');
    } catch {
      feed = JSON.parse(await fetchText(fullFeedUrl(gamePk))) as LiveFeed;
    }
  } else {
    feed = JSON.parse(await fetchText(fullFeedUrl(gamePk))) as LiveFeed;
  }

  // Win probability has no diff endpoint, so re-fetch it alongside each refresh.
  const winExp = await fetchText(winProbabilityUrl(gamePk))
    .then(parseWinProbability)
    .catch(() => new Map<number, number>());

  liveState.set(gamePk, {
    feed,
    timeStamp: feed.metaData?.timeStamp ?? '',
    winExp,
    fetchedAt: Date.now(),
  });
  return { feed, winExp };
}

// Bump when the persisted compact feed needs new fields (so cached finals, which
// were frozen without them, re-fetch). v2 added the boxscore pitching line; v3
// added liveData.decisions (W/L/S) and the per-batter pitch sequence; v4 added
// runners[].details.earned (per-PA earned-run flag); v5 added responsiblePitcher.
const FEED_CACHE_VERSION = 6;

export async function getStatsApiGame(gamePk: number): Promise<StatsApiGame> {
  const finalCached = gameMemCache.get(gamePk);
  if (finalCached) return finalCached;

  const feedFile = `game-${gamePk}-v${FEED_CACHE_VERSION}.json`;
  const wpFile = `wp-${gamePk}.json`;

  // A cached entry only ever exists for a completed game, so a hit means we can
  // skip the network; otherwise resolve the live snapshot via diffPatch.
  const feedCached = await readCache(feedFile);
  let feed: LiveFeed;
  let winExpByAtBat: Map<number, number>;
  if (feedCached !== null) {
    feed = JSON.parse(feedCached) as LiveFeed;
    winExpByAtBat = parseWinProbability((await readCache(wpFile)) ?? '[]');
  } else {
    const live = await getLiveData(gamePk);
    feed = live.feed;
    winExpByAtBat = live.winExp;
  }

  const isFinal = isFinalFeed(feed);

  // Once the game is over, persist a compact (field-filtered) snapshot so the
  // cache stays small, then drop the live snapshot from memory.
  if (isFinal && feedCached === null) {
    const [compact, wpText] = await Promise.all([
      fetchText(feedUrl(gamePk)).catch(() => null),
      fetchText(winProbabilityUrl(gamePk)).catch(() => null),
    ]);
    if (compact) await writeCache(feedFile, compact);
    if (wpText) await writeCache(wpFile, wpText);
    liveState.delete(gamePk);
  }

  const gameNumber = feed.gameData?.game?.gameNumber ?? null;
  const homeTeam = feed.gameData?.teams?.home?.abbreviation ?? '';
  const awayTeam = feed.gameData?.teams?.away?.abbreviation ?? '';
  const homeTeamId = feed.gameData?.teams?.home?.id ?? null;
  const awayTeamId = feed.gameData?.teams?.away?.id ?? null;
  const status = buildGameStatus(feed);
  const homeProbablePitcher = probablePitcher(feed, feed.gameData?.probablePitchers?.home);
  const awayProbablePitcher = probablePitcher(feed, feed.gameData?.probablePitchers?.away);
  const homePlayerIds = rosterIds(feed.liveData?.boxscore?.teams?.home);
  const awayPlayerIds = rosterIds(feed.liveData?.boxscore?.teams?.away);
  const homeStarters = startingOrder(feed.liveData?.boxscore?.teams?.home);
  const awayStarters = startingOrder(feed.liveData?.boxscore?.teams?.away);
  const batters = new Map<number, StatsApiBatterGame>();
  const pitchers = new Map<number, StatsApiPitcherGame>();
  const runsByRunner = new Map<number, number>();
  const sbByRunner = new Map<number, number>();
  const csByRunner = new Map<number, number>();
  const baseEvents = new Map<number, StatsApiBaseEvent[]>();
  const addBaseEvent = (rid: number, ev: StatsApiBaseEvent) => {
    const list = baseEvents.get(rid);
    if (list) list.push(ev);
    else baseEvents.set(rid, [ev]);
  };

  let outsInHalf = 0;
  // The base state a batter comes up to equals the previous PA's end state in
  // the same half-inning (empty to start the half). postOnX gives that end state.
  let basesWhenUp: BaseState = EMPTY_BASES;
  let currentHalfKey = '';

  for (const play of feed.liveData?.plays?.allPlays ?? []) {
    const atBatIndex = play.about?.atBatIndex;
    if (typeof atBatIndex !== 'number') continue;
    // Advisory plays (status/delay changes, e.g. "Status Change - Pre-Game")
    // carry the upcoming batter's matchup but aren't plate appearances — skip
    // them before touching the outs/bases state so they don't count as at-bats
    // or blank out the runners the next real batter comes up to.
    if (play.result?.eventType === 'game_advisory') continue;
    const halfKey = `${play.about?.inning}-${play.about?.halfInning}`;
    if (halfKey !== currentHalfKey) {
      currentHalfKey = halfKey;
      outsInHalf = 0;
      basesWhenUp = EMPTY_BASES;
    }
    const outsWhenUp = outsInHalf;
    outsInHalf = play.count?.outs ?? outsInHalf;
    const onBase = basesWhenUp;
    const m = play.matchup;
    basesWhenUp = baseState(m?.postOnFirst, m?.postOnSecond, m?.postOnThird);

    const batterId = play.matchup?.batter?.id;
    const batterName = play.matchup?.batter?.fullName;
    if (typeof batterId !== 'number' || !batterName) continue;

    const isHome = play.about?.halfInning?.toLowerCase() === 'bottom';
    let bg = batters.get(batterId);
    if (!bg) {
      bg = { batterId, batterName, isHome, stand: null, plateAppearances: [] };
      batters.set(batterId, bg);
    }
    bg.stand = play.matchup?.batSide?.code ?? bg.stand;

    const pitches: StatsApiPitch[] = [];
    let lastHit: FeedHitData | null = null;
    let lastPlayId: string | null = null;
    for (const ev of play.playEvents ?? []) {
      if (!ev.isPitch) continue;
      const pd = ev.pitchData;
      const hd = ev.hitData;
      if (hd) lastHit = hd;
      if (ev.playId) lastPlayId = ev.playId;
      pitches.push({
        pitchNumber: ev.pitchNumber ?? pitches.length + 1,
        pitchType: pitchTypeName(ev.details?.type?.code, ev.details?.type?.description),
        releaseSpeed: pd?.startSpeed ?? null,
        spinRate: pd?.breaks?.spinRate ?? null,
        description: pitchDescription(ev.details?.call?.code, ev.details?.call?.description),
        balls: ev.count?.balls ?? null,
        strikes: ev.count?.strikes ?? null,
        plateX: pd?.coordinates?.pX ?? null,
        plateZ: pd?.coordinates?.pZ ?? null,
        szTop: pd?.strikeZoneTop ?? null,
        szBot: pd?.strikeZoneBottom ?? null,
        zone: pd?.zone ?? null,
        launchSpeed: hd?.launchSpeed ?? null,
        launchAngle: hd?.launchAngle ?? null,
        hitDistance: hd?.totalDistance ?? null,
        bbType: hd?.trajectory ?? null,
        vBreak: pd?.breaks?.breakVerticalInduced ?? null,
        hBreak: pd?.breaks?.breakHorizontal ?? null,
      });
    }

    const evInning = play.about?.inning ?? 0;
    const evHalf = play.about?.halfInning?.toLowerCase() === 'top' ? 'Top' : 'Bot';
    const evTime = play.about?.endTime ?? play.about?.startTime ?? null;
    // Runs (and earned runs) that crossed the plate on this play and are charged
    // to the pitcher who threw it — the per-inning R/ER basis for the pitcher
    // card. A run charged to an earlier pitcher (an inherited runner) is skipped,
    // so a reliever isn't blamed for runners he didn't put on.
    const playPitcherId = play.matchup?.pitcher?.id;
    let playRuns = 0;
    let playEarned = 0;
    for (const r of play.runners ?? []) {
      const et = r.details?.eventType ?? '';
      const rid = r.details?.runner?.id;
      if (typeof rid !== 'number') continue;
      if (r.movement?.end === 'score') {
        const resp = r.details?.responsiblePitcher?.id;
        if (resp === undefined || resp === null || resp === playPitcherId) {
          playRuns++;
          if (r.details?.earned !== false) playEarned++;
        }
        runsByRunner.set(rid, (runsByRunner.get(rid) ?? 0) + 1);
        // Skip a run scored on the runner's own at-bat (a home run) — the plate
        // appearance already shows it. Baserunner runs are their own feed event.
        if (rid !== batterId) {
          addBaseEvent(rid, { kind: 'run', inning: evInning, half: evHalf, timestamp: evTime, base: null });
        }
      }
      if (isStolenBase(et)) {
        sbByRunner.set(rid, (sbByRunner.get(rid) ?? 0) + 1);
        addBaseEvent(rid, {
          kind: 'sb',
          inning: evInning,
          half: evHalf,
          timestamp: evTime,
          base: stolenBaseTarget(et),
        });
      } else if (isCaughtStealing(et)) {
        csByRunner.set(rid, (csByRunner.get(rid) ?? 0) + 1);
      }
    }

    bg.plateAppearances.push({
      atBatNumber: atBatIndex + 1,
      inning: play.about?.inning ?? 0,
      half: play.about?.halfInning?.toLowerCase() === 'top' ? 'Top' : 'Bot',
      timestamp: play.about?.endTime ?? play.about?.startTime ?? null,
      outsWhenUp,
      onBase,
      stand: play.matchup?.batSide?.code ?? null,
      pThrows: play.matchup?.pitchHand?.code ?? null,
      pitcherId: play.matchup?.pitcher?.id ?? null,
      pitcherName: play.matchup?.pitcher?.fullName ?? null,
      event: play.result?.eventType ?? null,
      description: play.result?.description ?? '',
      rbi: play.result?.rbi ?? 0,
      playId: lastPlayId,
      launchSpeed: lastHit?.launchSpeed ?? null,
      launchAngle: lastHit?.launchAngle ?? null,
      hitDistance: lastHit?.totalDistance ?? null,
      bbType: lastHit?.trajectory ?? null,
      deltaWinExp: winExpByAtBat.get(atBatIndex) ?? null,
      pitches,
    });

    // Pitcher's-eye view: the same play, regrouped under the pitcher who threw it.
    const pitcherId = play.matchup?.pitcher?.id;
    const pitcherName = play.matchup?.pitcher?.fullName;
    if (typeof pitcherId === 'number' && pitcherName) {
      // The home team pitches in the top of the inning (it fields then).
      const pIsHome = play.about?.halfInning?.toLowerCase() === 'top';
      let pg = pitchers.get(pitcherId);
      if (!pg) {
        pg = { pitcherId, pitcherName, isHome: pIsHome, throws: null, facedBatters: [], pitches: [] };
        pitchers.set(pitcherId, pg);
      }
      pg.throws = play.matchup?.pitchHand?.code ?? pg.throws;
      pg.facedBatters.push({
        batterId,
        batterName,
        stand: play.matchup?.batSide?.code ?? null,
        inning: play.about?.inning ?? 0,
        half: evHalf,
        outsWhenUp,
        onBase,
        event: play.result?.eventType ?? null,
        description: play.result?.description ?? '',
        rbi: play.result?.rbi ?? 0,
        runs: playRuns,
        earnedRuns: playEarned,
        timestamp: evTime,
        playId: lastPlayId,
        launchSpeed: lastHit?.launchSpeed ?? null,
        launchAngle: lastHit?.launchAngle ?? null,
        hitDistance: lastHit?.totalDistance ?? null,
        bbType: lastHit?.trajectory ?? null,
        pitches,
      });
      for (const p of pitches) pg.pitches.push(p);
    }
  }

  const pitchingLines = parsePitchingLines(feed);

  const game: StatsApiGame = {
    gamePk,
    gameNumber,
    homeTeam,
    awayTeam,
    homeTeamId,
    awayTeamId,
    status,
    homeProbablePitcher,
    awayProbablePitcher,
    homePlayerIds,
    awayPlayerIds,
    homeStarters,
    awayStarters,
    batters,
    pitchers,
    pitchingLines,
    decisions: {
      win: feed.liveData?.decisions?.winner?.id ?? null,
      loss: feed.liveData?.decisions?.loser?.id ?? null,
      save: feed.liveData?.decisions?.save?.id ?? null,
    },
    runsByRunner,
    sbByRunner,
    csByRunner,
    baseEvents,
  };
  // Final games are immutable — memoize forever. Live games are rebuilt each
  // request from the (throttled) snapshot in liveState, so don't cache them here.
  if (isFinal) gameMemCache.set(gamePk, game);
  return game;
}

// ---- Play video resolution -------------------------------------------------

// The MLB Stats API's own game/content endpoint carries direct mp4/HLS URLs
// for "highlight" plays (homers, notable hits/Ks, etc.) — the same endpoint
// that powers mlb.com/gameday's video clips. Each highlight's `guid` is the
// same Statcast playId already threaded through the rest of this app, so we
// can join on it directly instead of scraping. Coverage is curated, though —
// routine outs generally don't get a highlight clip — so this is tried first
// and we fall back to scraping Baseball Savant's sporty-videos page (which
// has a clip for essentially every play) when a playId has no highlight.
interface ContentPlayback {
  name?: string;
  url?: string;
}
interface ContentHighlightItem {
  guid?: string;
  playbacks?: ContentPlayback[];
}
interface ContentResponse {
  highlights?: { highlights?: { items?: ContentHighlightItem[] } };
}

const highlightMemCache = new Map<number, Map<string, string>>();

async function getHighlightVideosByPlayId(gamePk: number): Promise<Map<string, string>> {
  const cached = highlightMemCache.get(gamePk);
  if (cached) return cached;
  const text = await fetchCached(
    `https://statsapi.mlb.com/api/v1/game/${gamePk}/content`,
    `content-${gamePk}.json`,
  );
  const data = JSON.parse(text) as ContentResponse;
  const items = data.highlights?.highlights?.items ?? [];
  const byPlayId = new Map<string, string>();
  for (const item of items) {
    if (!item.guid) continue;
    const mp4 = item.playbacks?.find((p) => p.name === 'mp4Avc')?.url;
    if (mp4) byPlayId.set(item.guid, mp4);
  }
  highlightMemCache.set(gamePk, byPlayId);
  return byPlayId;
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MP4_RE = /https:\/\/sporty-clips\.mlb\.com\/[^"'\s)]+?\.mp4/;
const videoCache = new Map<string, string | null>();

/** Savant embeds the clip URL HTML-escaped (e.g. "=" as "&#x3D;"); undo that. */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, '&');
}

async function scrapeSavantVideoUrl(playId: string): Promise<string | null> {
  const res = await fetch(
    `https://baseballsavant.mlb.com/sporty-videos?playId=${encodeURIComponent(playId)}`,
    { headers: { 'User-Agent': BROWSER_UA } },
  );
  if (!res.ok) return null;
  const html = await res.text();
  const match = html.match(MP4_RE)?.[0];
  return match ? decodeHtmlEntities(match) : null;
}

/**
 * Resolve the direct video URL for a Statcast playId within a given game.
 * Tries the official MLB game-content highlights first, falling back to
 * scraping Baseball Savant for plays that weren't cut into a highlight.
 * Cached (including negative results) since the mapping is stable.
 */
export async function resolveVideoUrl(playId: string, gamePk: number): Promise<string | null> {
  const cached = videoCache.get(playId);
  if (cached !== undefined) return cached;

  let url: string | null = null;
  try {
    url = (await getHighlightVideosByPlayId(gamePk)).get(playId) ?? null;
  } catch (err) {
    console.error(`game content fetch failed for game ${gamePk}:`, err);
  }
  if (!url) url = await scrapeSavantVideoUrl(playId);

  videoCache.set(playId, url);
  return url;
}
