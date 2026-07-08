import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toSavantName } from './names.js';
import type { SeasonPlayer } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'data', 'cache');
const UA = { 'User-Agent': 'baseball-sicko-stats/1.0' };

async function fetchCached(url: string, cacheFile: string): Promise<string> {
  const hit = await readCache(cacheFile);
  if (hit !== null) return hit;
  const text = await fetchText(url);
  await writeCache(cacheFile, text);
  return text;
}

async function readCache(cacheFile: string): Promise<string | null> {
  try {
    const cached = await fs.readFile(path.join(CACHE_DIR, cacheFile), 'utf8');
    if (cached.trim().length > 0) return cached;
  } catch {
    // not cached yet
  }
  return null;
}

async function writeCache(cacheFile: string, text: string): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(path.join(CACHE_DIR, cacheFile), text, 'utf8');
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) {
    throw new Error(`MLB Stats API returned ${res.status} for ${url}`);
  }
  return res.text();
}

// ---- Schedule ---------------------------------------------------------

interface ScheduleGame {
  gamePk: number;
}
interface ScheduleResponse {
  dates?: { games?: ScheduleGame[] }[];
}

/** All regular-season gamePks played on a date (YYYY-MM-DD). */
export async function getGamesForDate(date: string): Promise<number[]> {
  const url =
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&gameTypes=R` +
    `&fields=dates,games,gamePk`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) {
    throw new Error(`MLB Stats API schedule returned ${res.status} for ${date}`);
  }
  const data = (await res.json()) as ScheduleResponse;
  const gamePks: number[] = [];
  for (const d of data.dates ?? []) {
    for (const g of d.games ?? []) gamePks.push(g.gamePk);
  }
  return gamePks;
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

/** Every non-pitcher rostered for a season (for watchlist search — this app only tracks batting). */
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

  const players: SeasonPlayer[] = (data.people ?? [])
    .filter((p) => p.primaryPosition?.code !== '1')
    .map((p) => ({
      id: p.id,
      name: p.fullName,
      savantName: toSavantName(p.fullName),
      team: (p.currentTeam?.id !== undefined && teamNames.get(p.currentTeam.id)) || '',
      position: p.primaryPosition?.abbreviation ?? '',
    }));

  seasonPlayersCache.set(season, { players, fetchedAt: Date.now() });
  return players;
}

// ---- Live feed (pitch-by-pitch + Statcast-style pitch/hit data) -------

const FEED_FIELDS = [
  'gameData',
  'status',
  'abstractGameState',
  'codedGameState',
  'teams',
  'away',
  'home',
  'abbreviation',
  'liveData',
  'plays',
  'allPlays',
  'about',
  'atBatIndex',
  'halfInning',
  'isTopInning',
  'inning',
  'count',
  'balls',
  'strikes',
  'outs',
  'matchup',
  'batter',
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
].join(',');

interface FeedPitchData {
  startSpeed?: number;
  coordinates?: { pX?: number; pZ?: number };
  strikeZoneTop?: number;
  strikeZoneBottom?: number;
  breaks?: { spinRate?: number };
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
  details?: { eventType?: string; runner?: { id?: number } };
}
interface FeedPlay {
  about?: { atBatIndex?: number; halfInning?: string; inning?: number };
  count?: { outs?: number };
  matchup?: {
    batter?: { id?: number; fullName?: string };
    batSide?: { code?: string };
    pitchHand?: { code?: string };
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
    status?: { abstractGameState?: string; codedGameState?: string };
    teams?: { home?: { abbreviation?: string }; away?: { abbreviation?: string } };
  };
  liveData?: { plays?: { allPlays?: FeedPlay[] } };
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
}

export interface StatsApiPlateAppearance {
  atBatNumber: number;
  inning: number;
  half: string;
  outsWhenUp: number;
  stand: string | null;
  pThrows: string | null;
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

export interface StatsApiGame {
  gamePk: number;
  homeTeam: string;
  awayTeam: string;
  batters: Map<number, StatsApiBatterGame>;
  runsByRunner: Map<number, number>;
  sbByRunner: Map<number, number>;
  csByRunner: Map<number, number>;
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

export async function getStatsApiGame(gamePk: number): Promise<StatsApiGame> {
  const finalCached = gameMemCache.get(gamePk);
  if (finalCached) return finalCached;

  const feedFile = `game-${gamePk}.json`;
  const wpFile = `wp-${gamePk}.json`;

  // A cached file on disk only ever exists for a completed game, so a hit means
  // we can skip the network; otherwise resolve the live snapshot via diffPatch.
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
  // on-disk cache stays small, then drop the live snapshot from memory.
  if (isFinal && feedCached === null) {
    const [compact, wpText] = await Promise.all([
      fetchText(feedUrl(gamePk)).catch(() => null),
      fetchText(winProbabilityUrl(gamePk)).catch(() => null),
    ]);
    if (compact) await writeCache(feedFile, compact);
    if (wpText) await writeCache(wpFile, wpText);
    liveState.delete(gamePk);
  }

  const homeTeam = feed.gameData?.teams?.home?.abbreviation ?? '';
  const awayTeam = feed.gameData?.teams?.away?.abbreviation ?? '';
  const batters = new Map<number, StatsApiBatterGame>();
  const runsByRunner = new Map<number, number>();
  const sbByRunner = new Map<number, number>();
  const csByRunner = new Map<number, number>();

  let outsInHalf = 0;
  let currentHalfKey = '';

  for (const play of feed.liveData?.plays?.allPlays ?? []) {
    const atBatIndex = play.about?.atBatIndex;
    if (typeof atBatIndex !== 'number') continue;
    const halfKey = `${play.about?.inning}-${play.about?.halfInning}`;
    if (halfKey !== currentHalfKey) {
      currentHalfKey = halfKey;
      outsInHalf = 0;
    }
    const outsWhenUp = outsInHalf;
    outsInHalf = play.count?.outs ?? outsInHalf;

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
      });
    }

    for (const r of play.runners ?? []) {
      const et = r.details?.eventType ?? '';
      const rid = r.details?.runner?.id;
      if (typeof rid !== 'number') continue;
      if (r.movement?.end === 'score') {
        runsByRunner.set(rid, (runsByRunner.get(rid) ?? 0) + 1);
      }
      if (isStolenBase(et)) {
        sbByRunner.set(rid, (sbByRunner.get(rid) ?? 0) + 1);
      } else if (isCaughtStealing(et)) {
        csByRunner.set(rid, (csByRunner.get(rid) ?? 0) + 1);
      }
    }

    bg.plateAppearances.push({
      atBatNumber: atBatIndex + 1,
      inning: play.about?.inning ?? 0,
      half: play.about?.halfInning?.toLowerCase() === 'top' ? 'Top' : 'Bot',
      outsWhenUp,
      stand: play.matchup?.batSide?.code ?? null,
      pThrows: play.matchup?.pitchHand?.code ?? null,
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
  }

  const game: StatsApiGame = { gamePk, homeTeam, awayTeam, batters, runsByRunner, sbByRunner, csByRunner };
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
