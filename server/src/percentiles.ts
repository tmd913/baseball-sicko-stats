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
type Fmt = 'avg' | 'dec1' | 'int';
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
      { key: 'xwoba', label: 'xwOBA', pct: 'percent_rank_xwoba', raw: 'xwoba', fmt: 'avg' },
      { key: 'xba', label: 'xBA', pct: 'percent_rank_xba', raw: 'xba', fmt: 'avg' },
      { key: 'xslg', label: 'xSLG', pct: 'percent_rank_xslg', raw: 'xslg', fmt: 'avg' },
      { key: 'exit_velo', label: 'Avg Exit Velocity', pct: 'percent_rank_exit_velocity_avg', raw: 'exit_velocity_avg', fmt: 'dec1' },
      { key: 'barrel', label: 'Barrel %', pct: 'percent_rank_barrel_batted_rate', raw: 'barrel_batted_rate', fmt: 'dec1' },
      { key: 'hard_hit', label: 'Hard-Hit %', pct: 'percent_rank_hard_hit_percent', raw: 'hard_hit_percent', fmt: 'dec1' },
      { key: 'sweet_spot', label: 'LA Sweet-Spot %', pct: 'percent_rank_sweet_spot_percent', raw: 'sweet_spot_percent', fmt: 'dec1' },
      // Bat speed's percentile lives under `swing_speed` but the raw mph under
      // `avg_swing_speed` — the two are not named in parallel.
      { key: 'bat_speed', label: 'Bat Speed', pct: 'percent_rank_swing_speed', raw: 'avg_swing_speed', fmt: 'dec1' },
      { key: 'squared_up', label: 'Squared-Up %', pct: 'percent_rank_squared_up_swing', raw: 'squared_up_swing', fmt: 'dec1' },
      // Chase %'s raw value is the out-of-zone swing rate.
      { key: 'chase', label: 'Chase %', pct: 'percent_rank_chase_percent', raw: 'oz_swing_percent', fmt: 'dec1' },
      { key: 'whiff', label: 'Whiff %', pct: 'percent_rank_whiff_percent', raw: 'whiff_percent', fmt: 'dec1' },
      { key: 'k', label: 'K %', pct: 'percent_rank_k_percent', raw: 'k_percent', fmt: 'dec1' },
      { key: 'bb', label: 'BB %', pct: 'percent_rank_bb_percent', raw: 'bb_percent', fmt: 'dec1' },
    ],
  },
  {
    title: 'Running',
    metrics: [
      // Sprint speed's percentile is `percent_speed_order` (no `percent_rank_` prefix).
      { key: 'sprint', label: 'Sprint Speed', pct: 'percent_speed_order', raw: 'sprint_speed', fmt: 'dec1' },
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

function buildSections(row: StatcastRow): PercentileSection[] {
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
  return {
    playerId,
    year,
    sections: buildSections(row),
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
