import { parse } from 'csv-parse/sync';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PercentileMetric, PercentileSection, PlayerPercentiles } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'data', 'cache');

/** Current Statcast season — mirrors the hfSea pin in savant.ts. */
const CURRENT_SEASON = 2026;
/** Re-scrape the current season's percentiles at most this often (percentiles
 * shift as the season accumulates; past seasons are immutable). */
const CURRENT_TTL_MS = 6 * 60 * 60 * 1000; // 6h

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/**
 * How each row of the Savant percentile card maps onto the `serverVals.statcast`
 * blob embedded in a player page. `pct` is the field holding the 0-100 league
 * rank; `raw` holds the underlying stat; `fmt` renders that stat the way Savant
 * prints it to the right of each bar. Order here is the display order.
 */
type Fmt = 'avg' | 'dec1' | 'dec2' | 'int';
interface MetricDef {
  key: string;
  label: string;
  pct: string; // field in the statcast record with the 0-100 percentile
  raw: string; // field with the underlying value
  fmt: Fmt;
}
interface SectionDef {
  title: string;
  metrics: MetricDef[];
}

const SECTIONS: SectionDef[] = [
  {
    title: 'Value',
    metrics: [
      // Savant's headline "run value" rows. The percentile fields carry the
      // `percent_rank_` prefix; the raw values are whole run totals.
      { key: 'batting_rv', label: 'Batting Run Value', pct: 'percent_rank_swing_take_run_value', raw: 'swing_take_run_value', fmt: 'int' },
      { key: 'baserunning_rv', label: 'Baserunning Run Value', pct: 'percent_rank_runner_run_value', raw: 'runner_run_value', fmt: 'int' },
      { key: 'fielding_rv', label: 'Fielding Run Value', pct: 'percent_rank_fielding_run_value', raw: 'fielding_run_value', fmt: 'int' },
    ],
  },
  {
    title: 'Batting',
    metrics: [
      // Slash line + overall value, each actual stat next to its expected (x-) twin.
      // The x- raws arrive pre-formatted as ".374"; the avg fmt renders both the same.
      { key: 'woba', label: 'wOBA', pct: 'percent_rank_woba', raw: 'woba', fmt: 'avg' },
      { key: 'xwoba', label: 'xwOBA', pct: 'percent_rank_xwoba', raw: 'xwoba', fmt: 'avg' },
      { key: 'ba', label: 'AVG', pct: 'percent_rank_ba', raw: 'ba', fmt: 'avg' },
      { key: 'xba', label: 'xBA', pct: 'percent_rank_xba', raw: 'xba', fmt: 'avg' },
      { key: 'obp', label: 'OBP', pct: 'percent_rank_obp', raw: 'obp', fmt: 'avg' },
      { key: 'xobp', label: 'xOBP', pct: 'percent_rank_xobp', raw: 'xobp', fmt: 'avg' },
      { key: 'slg', label: 'SLG', pct: 'percent_rank_slg', raw: 'slg', fmt: 'avg' },
      { key: 'xslg', label: 'xSLG', pct: 'percent_rank_xslg', raw: 'xslg', fmt: 'avg' },
      { key: 'iso', label: 'ISO', pct: 'percent_rank_iso', raw: 'iso', fmt: 'avg' },
      { key: 'xiso', label: 'xISO', pct: 'percent_rank_xiso', raw: 'xiso', fmt: 'avg' },
      { key: 'xhr', label: 'Expected HR', pct: 'percent_rank_xhr', raw: 'xhr', fmt: 'dec1' },
      // BABIP bridges the slash line into the contact-quality metrics that explain it.
      { key: 'babip', label: 'BABIP', pct: 'percent_rank_babip', raw: 'babip', fmt: 'avg' },
      { key: 'exit_velo', label: 'Avg Exit Velocity', pct: 'percent_rank_exit_velocity_avg', raw: 'exit_velocity_avg', fmt: 'dec1' },
      { key: 'barrel', label: 'Barrel %', pct: 'percent_rank_barrel_batted_rate', raw: 'barrel_batted_rate', fmt: 'dec1' },
      { key: 'hard_hit', label: 'Hard-Hit %', pct: 'percent_rank_hard_hit_percent', raw: 'hard_hit_percent', fmt: 'dec1' },
      { key: 'sweet_spot', label: 'LA Sweet-Spot %', pct: 'percent_rank_sweet_spot_percent', raw: 'sweet_spot_percent', fmt: 'dec1' },
      // Pull Air %: share of batted balls that are both pulled and in the air —
      // Savant's `pull_percent_airballs`, ranked by `percent_rank_pull_percent_airballs`.
      { key: 'pull_air', label: 'Pull Air %', pct: 'percent_rank_pull_percent_airballs', raw: 'pull_percent_airballs', fmt: 'dec1' },
      // Batted-ball profile: air balls (fly balls + line drives).
      { key: 'air', label: 'Air %', pct: 'percent_rank_airballs_percent', raw: 'airballs_percent', fmt: 'dec1' },
      // Bat speed's percentile lives under `swing_speed` but the raw mph under
      // `avg_swing_speed` — the two are not named in parallel.
      { key: 'bat_speed', label: 'Bat Speed', pct: 'percent_rank_swing_speed', raw: 'avg_swing_speed', fmt: 'dec1' },
      { key: 'squared_up', label: 'Squared-Up %', pct: 'percent_rank_squared_up_swing', raw: 'squared_up_swing', fmt: 'dec1' },
      // Chase %'s raw value is the out-of-zone swing rate.
      { key: 'chase', label: 'Chase %', pct: 'percent_rank_chase_percent', raw: 'oz_swing_percent', fmt: 'dec1' },
      { key: 'whiff', label: 'Whiff %', pct: 'percent_rank_whiff_percent', raw: 'whiff_percent', fmt: 'dec1' },
      { key: 'k', label: 'K %', pct: 'percent_rank_k_percent', raw: 'k_percent', fmt: 'dec1' },
      { key: 'bb', label: 'BB %', pct: 'percent_rank_bb_percent', raw: 'bb_percent', fmt: 'dec1' },
      // Strike-zone judgment: Savant's swing-decision run value (`sz_judge`).
      { key: 'sz_judge', label: 'Strike-Zone Judgment', pct: 'percent_rank_sz_judge', raw: 'sz_judge', fmt: 'dec1' },
    ],
  },
  {
    title: 'Vs Pitch Type',
    metrics: [
      // Batting run value accrued against each pitch group (whole-run totals).
      { key: 'rv_fastball', label: 'vs Fastball', pct: 'percent_rank_pitch_run_value_fastball', raw: 'pitch_run_value_fastball', fmt: 'int' },
      { key: 'rv_breaking', label: 'vs Breaking', pct: 'percent_rank_pitch_run_value_breaking', raw: 'pitch_run_value_breaking', fmt: 'int' },
      { key: 'rv_offspeed', label: 'vs Offspeed', pct: 'percent_rank_pitch_run_value_offspeed', raw: 'pitch_run_value_offspeed', fmt: 'int' },
    ],
  },
  {
    title: 'Running',
    metrics: [
      // Sprint speed's percentile is `percent_speed_order` (no `percent_rank_` prefix).
      { key: 'sprint', label: 'Sprint Speed', pct: 'percent_speed_order', raw: 'sprint_speed', fmt: 'dec1' },
      // Baserunning run value split into its stealing and extra-base-taking parts.
      { key: 'runner_sb', label: 'Basestealing Runs', pct: 'percent_rank_runner_runs_sb', raw: 'runner_runs_sb', fmt: 'int' },
      { key: 'runner_xb', label: 'Extra-Base Runs', pct: 'percent_rank_runner_runs_xb', raw: 'runner_runs_xb', fmt: 'int' },
    ],
  },
  {
    title: 'Fielding',
    metrics: [
      { key: 'oaa', label: 'Outs Above Average', pct: 'percent_rank_oaa', raw: 'outs_above_average', fmt: 'int' },
      // Outfield jump, in feet vs the league average.
      { key: 'jump', label: 'OF Jump (ft)', pct: 'percent_rank_jump', raw: 'jump_v_avg', fmt: 'dec1' },
      // Arm strength in mph (average and max throw); arm run value in whole runs.
      { key: 'arm_avg', label: 'Avg Arm Strength', pct: 'percent_rank_arm_overall', raw: 'arm_overall', fmt: 'dec1' },
      { key: 'arm_max', label: 'Max Arm Strength', pct: 'percent_rank_arm_max', raw: 'max_arm_strength', fmt: 'dec1' },
      { key: 'arm_rv', label: 'Arm Run Value', pct: 'percent_rank_fielding_run_value_arm', raw: 'fielding_run_value_arm', fmt: 'int' },
      // Catcher-only defense. These raws are null for non-catchers, so the
      // metric-level null-drop below keeps every one of them off other players'
      // cards automatically (same mechanism that hides OF Jump for infielders).
      // `percent_rank_framing` is paired with the strike rate (there's no `framing` raw).
      { key: 'framing', label: 'Framing (Strike %)', pct: 'percent_rank_framing', raw: 'strike_rate', fmt: 'dec1' },
      { key: 'framing_rv', label: 'Framing Run Value', pct: 'percent_rank_fielding_run_value_framing', raw: 'fielding_run_value_framing', fmt: 'int' },
      { key: 'blocks', label: 'Blocks Above Avg', pct: 'percent_rank_blocks_above_average', raw: 'blocks_above_average', fmt: 'int' },
      { key: 'cs', label: 'Caught Stealing Above Avg', pct: 'percent_rank_cs_above_average', raw: 'cs_above_average', fmt: 'int' },
      { key: 'pop_2b', label: 'Pop Time to 2B (sec)', pct: 'percent_rank_pop_2b', raw: 'pop_2b', fmt: 'dec2' },
      { key: 'catcher_arm', label: 'Arm Strength on Steals', pct: 'percent_rank_arm_cs_2b', raw: 'arm_cs_2b', fmt: 'dec1' },
    ],
  },
];

type StatcastRow = Record<string, unknown>;

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Format a raw stat the way Savant prints it beside the bar. */
function formatValue(v: unknown, fmt: Fmt): string | null {
  const n = toNum(v);
  if (n === null) return null;
  if (fmt === 'int') return String(Math.round(n));
  if (fmt === 'dec1') return n.toFixed(1);
  if (fmt === 'dec2') return n.toFixed(2); // e.g. catcher pop time "1.95"
  // avg: three decimals, dropping the leading zero (".415", "1.000").
  const s = n.toFixed(3);
  return s.startsWith('0.') ? s.slice(1) : s;
}

/** Percentiles come as 0-100; clamp/round defensively (they're stored rounded,
 * but the page occasionally carries a fractional value). */
function toPercentile(v: unknown): number | null {
  const n = toNum(v);
  if (n === null) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Extract the `serverVals.statcast: [ ... ]` array literal embedded in a Savant
 * player page by balancing brackets from the opening `[`. Returns [] if the
 * marker isn't present (page shape changed, or a non-player response).
 */
function extractStatcast(html: string): StatcastRow[] {
  const marker = 'statcast: [';
  const at = html.indexOf(marker);
  if (at === -1) return [];
  const start = at + marker.length - 1; // the '['
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === '\\') {
      esc = true;
      continue;
    }
    if (c === '"') inStr = !inStr;
    if (inStr) continue;
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as StatcastRow[];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

/** Pick the MLB batting aggregate for the requested year, preferring the row
 * with the most plate appearances when a player has multiple stints. */
function pickRow(rows: StatcastRow[], year: number): StatcastRow | null {
  const candidates = rows.filter(
    (r) => toNum(r.year) === year && toNum(r.is_sport_mlb) === 1,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, r) =>
    (toNum(r.pa) ?? toNum(r.ab) ?? 0) > (toNum(best.pa) ?? toNum(best.ab) ?? 0) ? r : best,
  );
}

// ---- Fast Swing % ---------------------------------------------------------
// Savant's player page carries the raw `fast_swing_rate` but — unlike every
// other card metric — no `percent_rank_` field for it. To rank it we pull the
// bat-tracking leaderboard (all qualified batters) and compute the league
// percentile ourselves from that distribution. `hard_swing_rate` there is the
// same stat as the player page's `fast_swing_rate`, expressed as a proportion.

interface FastSwingDist {
  year: number;
  rates: number[]; // qualified batters' fast-swing rates, as percent (0-100), ascending
  updatedAt: string;
}

const fastSwingMem = new Map<number, FastSwingDist>();

function batTrackingUrl(year: number): string {
  const params = new URLSearchParams({
    attackZone: '', batSide: '', contactType: '', count: '',
    dateStart: '', dateEnd: '', gameType: '', isHardHit: '',
    minSwings: 'q', minGroupSwings: '1', pitchHand: '', pitchType: '',
    seasonStart: String(year), seasonEnd: String(year),
    team: '', type: 'batter', csv: 'true',
  });
  return `https://baseballsavant.mlb.com/leaderboard/bat-tracking?${params.toString()}`;
}

function fastSwingFile(year: number): string {
  return path.join(CACHE_DIR, `fast-swing-${year}.json`);
}

/** Same freshness rule as the percentile cards: past seasons are immutable,
 * the current season re-fetches past the TTL. */
function fastSwingFresh(d: FastSwingDist): boolean {
  if (d.year !== CURRENT_SEASON) return true;
  return Date.now() - new Date(d.updatedAt).getTime() < CURRENT_TTL_MS;
}

async function fetchFastSwingRates(year: number): Promise<number[]> {
  const res = await fetch(batTrackingUrl(year), { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) {
    throw new Error(`Bat-tracking leaderboard returned ${res.status} ${res.statusText}`);
  }
  const records: Record<string, string>[] = parse(await res.text(), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  });
  const rates: number[] = [];
  for (const r of records) {
    const v = toNum(r.hard_swing_rate);
    if (v !== null) rates.push(v * 100); // proportion (0.53) -> percent (53.4), to match fast_swing_rate
  }
  rates.sort((a, b) => a - b);
  return rates;
}

/** The qualified-batter fast-swing distribution for a season, cached in memory
 * and on disk under `data/cache/`. Empty array on failure so a missing
 * leaderboard degrades the card (raw value, no bar) instead of failing it. */
async function getFastSwingDist(year: number): Promise<number[]> {
  const mem = fastSwingMem.get(year);
  if (mem && fastSwingFresh(mem)) return mem.rates;

  try {
    const raw = await fs.readFile(fastSwingFile(year), 'utf8');
    const disk = JSON.parse(raw) as FastSwingDist;
    if (fastSwingFresh(disk)) {
      fastSwingMem.set(year, disk);
      return disk.rates;
    }
  } catch {
    // not cached yet
  }

  const rates = await fetchFastSwingRates(year);
  const built: FastSwingDist = { year, rates, updatedAt: new Date().toISOString() };
  fastSwingMem.set(year, built);
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(fastSwingFile(year), JSON.stringify(built), 'utf8');
  return rates;
}

/** League percentile of `valuePct` within an ascending distribution: the share
 * of the league below it, matching Savant's percent-rank convention. */
function fastSwingPercentile(valuePct: number, sortedAsc: number[]): number | null {
  if (sortedAsc.length === 0) return null;
  let below = 0;
  for (const v of sortedAsc) {
    if (v < valuePct) below++;
    else break; // ascending, so nothing further can be below
  }
  return Math.max(0, Math.min(100, Math.round((below / sortedAsc.length) * 100)));
}

/** The computed Fast Swing % row, or null if the player has no fast-swing data. */
function fastSwingMetric(row: StatcastRow, sortedRates: number[]): PercentileMetric | null {
  const raw = toNum(row.fast_swing_rate);
  if (raw === null) return null;
  return {
    key: 'fast_swing',
    label: 'Fast Swing %',
    percentile: fastSwingPercentile(raw, sortedRates),
    value: formatValue(raw, 'dec1'),
  };
}

function buildSections(row: StatcastRow, fastSwingRates: number[]): PercentileSection[] {
  const sections: PercentileSection[] = [];
  for (const sec of SECTIONS) {
    const metrics: PercentileMetric[] = [];
    for (const m of sec.metrics) {
      const percentile = toPercentile(row[m.pct]);
      const value = formatValue(row[m.raw], m.fmt);
      // Drop rows the player simply has no data for (e.g. fielding value for a
      // full-time DH) so the card doesn't fill with empty tracks.
      if (percentile === null && value === null) continue;
      metrics.push({ key: m.key, label: m.label, percentile, value });
    }
    // Fast Swing % is computed, not scraped — slot it next to Bat Speed in the
    // batting block since they're both bat-tracking metrics.
    if (sec.title === 'Batting') {
      const fs = fastSwingMetric(row, fastSwingRates);
      if (fs) {
        const at = metrics.findIndex((m) => m.key === 'bat_speed');
        if (at === -1) metrics.push(fs);
        else metrics.splice(at + 1, 0, fs);
      }
    }
    if (metrics.length > 0) sections.push({ title: sec.title, metrics });
  }
  return sections;
}

const memCache = new Map<string, PlayerPercentiles>();

function cacheFile(playerId: number, year: number): string {
  return path.join(CACHE_DIR, `percentiles-${playerId}-${year}.json`);
}

/** A cached card is fresh if it's a past season (immutable) or, for the current
 * season, younger than the TTL. */
function isFresh(p: PlayerPercentiles, year: number): boolean {
  if (year !== CURRENT_SEASON) return true;
  return Date.now() - new Date(p.updatedAt).getTime() < CURRENT_TTL_MS;
}

async function readDiskCache(playerId: number, year: number): Promise<PlayerPercentiles | null> {
  try {
    const raw = await fs.readFile(cacheFile(playerId, year), 'utf8');
    return JSON.parse(raw) as PlayerPercentiles;
  } catch {
    return null;
  }
}

async function scrape(playerId: number, year: number): Promise<PlayerPercentiles> {
  // The slug doesn't matter — Savant 301-redirects an id-only slug to the
  // canonical player page.
  const url = `https://baseballsavant.mlb.com/savant-player/x-${playerId}?stats=statcast-r-hitting-mlb`;
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) {
    throw new Error(`Baseball Savant returned ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const row = pickRow(extractStatcast(html), year);
  if (!row) {
    throw new Error(`No Statcast percentile data for ${playerId} in ${year}`);
  }
  // Fast Swing % has no scraped percentile; rank it against the league. A failed
  // leaderboard fetch just drops the bar (empty array) rather than the whole card.
  let fastSwingRates: number[] = [];
  try {
    fastSwingRates = await getFastSwingDist(year);
  } catch (err) {
    console.error(`Bat-tracking leaderboard unavailable for ${year}:`, err);
  }
  return {
    playerId,
    year,
    sections: buildSections(row, fastSwingRates),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * A player's Savant-style percentile-ranking card for a season. Cached in
 * memory and on disk under `data/cache/`; the current season re-scrapes past a
 * TTL, past seasons are kept forever.
 */
export async function getPercentiles(
  playerId: number,
  year = CURRENT_SEASON,
): Promise<PlayerPercentiles> {
  const key = `${playerId}-${year}`;
  const mem = memCache.get(key);
  if (mem && isFresh(mem, year)) return mem;

  const disk = await readDiskCache(playerId, year);
  if (disk && isFresh(disk, year)) {
    memCache.set(key, disk);
    return disk;
  }

  const fresh = await scrape(playerId, year);
  memCache.set(key, fresh);
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(cacheFile(playerId, year), JSON.stringify(fresh), 'utf8');
  return fresh;
}
