import { parse } from 'csv-parse/sync';
import { readJsonBlob, writeJsonBlob } from './storage.js';

// Keep in sync with hfSea in savant.ts, CURRENT_SEASON in percentiles.ts, and
// SEASON in xwoba.ts / pitcherArsenal.ts / teamHitting.ts / expectedStats.ts.
const SEASON = 2026;

// Savant recomputes this nightly at most, and it is the whole league in one CSV.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/**
 * **How far above horizontal a pitcher's arm is at release**, and how high the
 * ball leaves his hand — what the Arsenal tab's movement plot draws in its
 * corner. 0° is a true sidearm slot, 90° would be straight over the top; the
 * league sits around 37°.
 *
 * It is the one thing on that chart the pitch-level CSV cannot give. Savant
 * measures the angle against an estimate of the **shoulder** position, which is
 * nowhere in the per-pitch export — and their own leaderboard publishes the
 * shoulder and the release point beside the angle, so the figure is read rather
 * than reconstructed from an assumption about where a shoulder is.
 */
export interface ArmAngle {
  /** Degrees above horizontal, Savant's own `ball_angle`. */
  angle: number;
  /** Release height in feet — how high the ball actually leaves his hand. */
  releaseHeight: number;
  /** How far to his arm side of the shoulder the ball is released, in feet. */
  releaseSide: number;
}

type StoredAngles = { byPitcher: Record<string, ArmAngle>; league: number | null };

let cache: { data: StoredAngles; fetchedAt: number } | null = null;
let inFlight: Promise<StoredAngles> | null = null;

const storeKey = () => `arm-angles-${SEASON}-v1.json`;

// `min=1` for the same reason every other leaderboard here uses it: a
// qualified-only board leaves most of the bullpen without a figure, and a
// reliever's slot is exactly the thing a reader is curious about.
const leaderboardUrl = () =>
  'https://baseballsavant.mlb.com/leaderboard/pitcher-arm-angles?' +
  `type=Pitcher&min=1&year=${SEASON}&csv=true`;

/**
 * The league's own average slot, over pitchers with a real sample.
 *
 * **Not split by hand**, and that is measured rather than assumed: right-handers
 * average 36.9° and left-handers 37.0° over the 2026 board, which is as close to
 * identical as two populations get. (The *break* table next door is split,
 * because velocity genuinely differs by hand — see `pitchLeague.ts`.)
 */
const LEAGUE_MIN_PITCHES = 100;

async function buildLeague(): Promise<StoredAngles> {
  const res = await fetch(leaderboardUrl(), { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) {
    throw new Error(`Savant arm angles returned ${res.status} ${res.statusText}`);
  }
  const rows: Record<string, string>[] = parse(await res.text(), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  });
  const byPitcher: Record<string, ArmAngle> = {};
  const sample: number[] = [];
  for (const r of rows) {
    const id = Number(r.pitcher);
    const angle = Number(r.ball_angle);
    if (!Number.isFinite(id) || !Number.isFinite(angle)) continue;
    const relX = Number(r.relative_release_ball_x);
    const shoX = Number(r.relative_shoulder_x);
    const relZ = Number(r.release_ball_z);
    byPitcher[id] = {
      angle: Math.round(angle * 10) / 10,
      releaseHeight: Number.isFinite(relZ) ? Math.round(relZ * 100) / 100 : 0,
      releaseSide:
        Number.isFinite(relX) && Number.isFinite(shoX)
          ? Math.round(Math.abs(relX - shoX) * 100) / 100
          : 0,
    };
    if ((Number(r.n_pitches) || 0) >= LEAGUE_MIN_PITCHES) sample.push(angle);
  }
  const league = sample.length
    ? Math.round((sample.reduce((s, x) => s + x, 0) / sample.length) * 10) / 10
    : null;
  return { byPitcher, league };
}

async function getLeague(): Promise<StoredAngles> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const stored = await readJsonBlob<StoredAngles>(
      storeKey(),
      (_v, cachedAt) => Date.now() - cachedAt < CACHE_TTL_MS,
    );
    if (stored) {
      cache = { data: stored, fetchedAt: Date.now() };
      return stored;
    }
    const data = await buildLeague();
    cache = { data, fetchedAt: Date.now() };
    await writeJsonBlob(storeKey(), data);
    return data;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/**
 * One pitcher's arm angle, with the league's own average beside it.
 *
 * Failures resolve to null rather than throwing, the rule every league lookup
 * in this codebase follows: it is one mark in the corner of a chart and must
 * never cost the tab it sits on.
 */
export async function getArmAngle(
  pitcherId: number,
): Promise<{ angle: number; releaseHeight: number; releaseSide: number; league: number | null } | null> {
  try {
    const { byPitcher, league } = await getLeague();
    const own = byPitcher[pitcherId];
    return own ? { ...own, league } : null;
  } catch (err) {
    console.error('arm angle fetch failed:', err);
    return null;
  }
}
