import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'data', 'cache');

/** Aggregated per-game facts pulled from the MLB Stats API play-by-play. */
export interface GameEvents {
  /** Official RBI keyed by at-bat number (1-based; matches CSV at_bat_number). */
  rbiByAtBat: Map<number, number>;
  /** Total official RBI keyed by batter id. */
  rbiByBatter: Map<number, number>;
  /** Statcast video playId of the in-play pitch, keyed by at-bat number. */
  playIdByAtBat: Map<number, string>;
  /** Runs scored keyed by runner id. */
  runsByRunner: Map<number, number>;
  /** Stolen bases keyed by runner id. */
  sbByRunner: Map<number, number>;
  /** Caught stealing keyed by runner id. */
  csByRunner: Map<number, number>;
}

// Minimal shapes for the bits of the play-by-play payload we read.
interface PbpRunner {
  movement?: { end?: string | null };
  details?: { eventType?: string; runner?: { id?: number } };
}
interface PbpPlayEvent {
  playId?: string;
  details?: { isInPlay?: boolean };
}
interface PbpPlay {
  result?: { rbi?: number };
  about?: { atBatIndex?: number };
  matchup?: { batter?: { id?: number } };
  runners?: PbpRunner[];
  playEvents?: PbpPlayEvent[];
}
interface Pbp {
  allPlays?: PbpPlay[];
}

const memCache = new Map<number, GameEvents>();

async function downloadPlayByPlay(gamePk: number): Promise<Pbp> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `pbp-${gamePk}.json`);
  try {
    const cached = await fs.readFile(file, 'utf8');
    if (cached.trim().length > 0) return JSON.parse(cached) as Pbp;
  } catch {
    // not cached yet
  }
  const res = await fetch(
    `https://statsapi.mlb.com/api/v1/game/${gamePk}/playByPlay`,
    { headers: { 'User-Agent': 'previous-day-player-events/1.0' } },
  );
  if (!res.ok) {
    throw new Error(`MLB Stats API returned ${res.status} for game ${gamePk}`);
  }
  const text = await res.text();
  await fs.writeFile(file, text, 'utf8');
  return JSON.parse(text) as Pbp;
}

// Stolen bases and caught stealing are recorded as runner movements. Prefix
// matching handles the _2b/_3b/_home suffixes and — importantly — excludes
// `defensive_indiff` (not a SB) and plain `pickoff_*` (not a CS).
const isStolenBase = (et: string): boolean => et.startsWith('stolen_base');
const isCaughtStealing = (et: string): boolean =>
  et.startsWith('caught_stealing') || et.startsWith('pickoff_caught_stealing');

function parsePlayByPlay(pbp: Pbp): GameEvents {
  const ev: GameEvents = {
    rbiByAtBat: new Map(),
    rbiByBatter: new Map(),
    playIdByAtBat: new Map(),
    runsByRunner: new Map(),
    sbByRunner: new Map(),
    csByRunner: new Map(),
  };
  for (const play of pbp.allPlays ?? []) {
    const rbi = play.result?.rbi ?? 0;
    const atBatIndex = play.about?.atBatIndex;
    const batterId = play.matchup?.batter?.id;
    if (typeof atBatIndex === 'number') {
      ev.rbiByAtBat.set(atBatIndex + 1, rbi);
      // The pitch put in play carries the Statcast video playId.
      const inPlay = (play.playEvents ?? []).find(
        (e) => e.details?.isInPlay && e.playId,
      );
      if (inPlay?.playId) ev.playIdByAtBat.set(atBatIndex + 1, inPlay.playId);
    }
    if (typeof batterId === 'number' && rbi) {
      ev.rbiByBatter.set(batterId, (ev.rbiByBatter.get(batterId) ?? 0) + rbi);
    }
    for (const r of play.runners ?? []) {
      const et = r.details?.eventType ?? '';
      const rid = r.details?.runner?.id;
      if (typeof rid !== 'number') continue;
      // A run scored = a runner whose movement ends at "score".
      if (r.movement?.end === 'score') {
        ev.runsByRunner.set(rid, (ev.runsByRunner.get(rid) ?? 0) + 1);
      }
      if (isStolenBase(et)) {
        ev.sbByRunner.set(rid, (ev.sbByRunner.get(rid) ?? 0) + 1);
      } else if (isCaughtStealing(et)) {
        ev.csByRunner.set(rid, (ev.csByRunner.get(rid) ?? 0) + 1);
      }
    }
  }
  return ev;
}

export async function getGameEvents(gamePk: number): Promise<GameEvents> {
  const cached = memCache.get(gamePk);
  if (cached) return cached;
  const parsed = parsePlayByPlay(await downloadPlayByPlay(gamePk));
  memCache.set(gamePk, parsed);
  return parsed;
}

// ---- Play video resolution -------------------------------------------------

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MP4_RE = /https:\/\/sporty-clips\.mlb\.com\/[^"'\s)]+?\.mp4/;
const videoCache = new Map<string, string | null>();

/**
 * Resolve the direct .mp4 URL for a Statcast playId by scraping the Savant
 * sporty-videos page. Cached (including negative results) since the mapping is
 * stable. Returns null if no clip is available.
 */
export async function resolveVideoUrl(playId: string): Promise<string | null> {
  const cached = videoCache.get(playId);
  if (cached !== undefined) return cached;
  const res = await fetch(
    `https://baseballsavant.mlb.com/sporty-videos?playId=${encodeURIComponent(playId)}`,
    { headers: { 'User-Agent': BROWSER_UA } },
  );
  if (!res.ok) {
    videoCache.set(playId, null);
    return null;
  }
  const html = await res.text();
  const url = html.match(MP4_RE)?.[0] ?? null;
  videoCache.set(playId, url);
  return url;
}
