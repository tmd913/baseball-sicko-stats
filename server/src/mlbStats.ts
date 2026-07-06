import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'data', 'cache');
const UA = { 'User-Agent': 'baseball-sicko-stats/1.0' };

async function fetchCached(url: string, cacheFile: string): Promise<string> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, cacheFile);
  try {
    const cached = await fs.readFile(file, 'utf8');
    if (cached.trim().length > 0) return cached;
  } catch {
    // not cached yet
  }
  const res = await fetch(url, { headers: UA });
  if (!res.ok) {
    throw new Error(`MLB Stats API returned ${res.status} for ${url}`);
  }
  const text = await res.text();
  await fs.writeFile(file, text, 'utf8');
  return text;
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

// ---- Live feed (pitch-by-pitch + Statcast-style pitch/hit data) -------

const FEED_FIELDS = [
  'gameData',
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
  gameData?: { teams?: { home?: { abbreviation?: string }; away?: { abbreviation?: string } } };
  liveData?: { plays?: { allPlays?: FeedPlay[] } };
}

async function getLiveFeed(gamePk: number): Promise<LiveFeed> {
  const text = await fetchCached(
    `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live?fields=${FEED_FIELDS}`,
    `game-${gamePk}.json`,
  );
  return JSON.parse(text) as LiveFeed;
}

// ---- Win probability (per-play win expectancy added) -------------------

interface WinProbabilityPlay {
  about?: { atBatIndex?: number };
  homeTeamWinProbabilityAdded?: number;
}

async function getWinProbabilityByAtBat(gamePk: number): Promise<Map<number, number>> {
  const text = await fetchCached(
    `https://statsapi.mlb.com/api/v1/game/${gamePk}/winProbability`,
    `wp-${gamePk}.json`,
  );
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

const gameMemCache = new Map<number, StatsApiGame>();

export async function getStatsApiGame(gamePk: number): Promise<StatsApiGame> {
  const cached = gameMemCache.get(gamePk);
  if (cached) return cached;

  const [feed, winExpByAtBat] = await Promise.all([
    getLiveFeed(gamePk),
    getWinProbabilityByAtBat(gamePk).catch(() => new Map<number, number>()),
  ]);

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
  gameMemCache.set(gamePk, game);
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

async function scrapeSavantVideoUrl(playId: string): Promise<string | null> {
  const res = await fetch(
    `https://baseballsavant.mlb.com/sporty-videos?playId=${encodeURIComponent(playId)}`,
    { headers: { 'User-Agent': BROWSER_UA } },
  );
  if (!res.ok) return null;
  const html = await res.text();
  return html.match(MP4_RE)?.[0] ?? null;
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
