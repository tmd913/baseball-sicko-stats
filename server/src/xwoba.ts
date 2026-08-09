import { parse } from 'csv-parse/sync';
import { readJsonBlob, writeJsonBlob } from './storage.js';
import type { XwobaPa, XwobaSeries } from './types.js';

// Keep in sync with hfSea in savant.ts, CURRENT_SEASON in percentiles.ts, and
// SEASON in pitcherArsenal.ts / teamStats.ts / expectedStats.ts.
const SEASON = 2026;

// MLB league-average xwOBA — the reference line on the rolling chart. wOBA (and
// thus xwOBA) is calibrated to the league OBP scale, so this sits ~.310–.320
// year to year; a fixed benchmark is fine for "above / below average".
const LEAGUE_XWOBA = 0.315;

/** Baseball Savant statcast-search CSV for one player's full regular season —
 * every pitch, from which we take the per-plate-appearance result rows. For a
 * pitcher this is xwOBA *allowed* (the same estimate, keyed to the pitcher). */
function seasonXwobaUrl(playerId: number, kind: 'batter' | 'pitcher'): string {
  const params = new URLSearchParams({
    hfGT: 'R|',
    hfSea: `${SEASON}|`,
    player_type: kind,
    [`${kind}s_lookup[]`]: String(playerId),
    game_date_gt: `${SEASON}-01-01`,
    game_date_lt: `${SEASON}-12-31`,
    group_by: 'name-event',
    min_pitches: '0',
    min_results: '0',
    min_pas: '0',
    type: 'details',
    all: 'true',
    minors: 'false',
    wbc: 'false',
  });
  return `https://baseballsavant.mlb.com/statcast_search/csv?${params.toString()}`;
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || v === '' || v === 'null') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

// Current-season data changes daily; re-fetch at most every 6h per player.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { data: XwobaSeries; fetchedAt: number }>();

/** Backing the memory cache with the storage tier matters more than it looks:
 *  the source here is a *full-season* Savant CSV, several MB per player. Memory
 *  alone means every cold container re-downloads and re-parses it. */
const storeKey = (playerId: number, kind: 'batter' | 'pitcher') =>
  `xwoba-${kind}-${playerId}-${SEASON}.json`;
const stillFresh = (_v: XwobaSeries, cachedAt: number) => Date.now() - cachedAt < CACHE_TTL_MS;

/** Sortable per-PA record before it's trimmed to the wire shape. */
interface PaRow extends XwobaPa {
  gamePk: number;
  atBat: number;
}

/**
 * The player's season sequence of per-plate-appearance xwOBA, in play order, for
 * a rolling-xwOBA chart. Each PA's `xwoba` is Savant's `estimated_woba_using_
 * speedangle`, which already encodes the right wOBA contribution for every event
 * (batted-ball xwOBA, the walk/HBP weight, a strikeout's 0); `woba_value` is a
 * fallback for the rare event with no estimate (e.g. catcher's interference).
 * Only rows with a wOBA denominator are kept — that excludes intentional walks
 * and truncated PAs, which don't count in wOBA (matching Savant's convention).
 */
export async function getXwobaSeries(
  playerId: number,
  kind: 'batter' | 'pitcher' = 'batter',
): Promise<XwobaSeries> {
  const key = `${kind}-${playerId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.data;

  const stored = await readJsonBlob<XwobaSeries>(storeKey(playerId, kind), stillFresh);
  if (stored) {
    cache.set(key, { data: stored, fetchedAt: Date.now() });
    return stored;
  }

  const res = await fetch(seasonXwobaUrl(playerId, kind), {
    headers: { 'User-Agent': 'statcast-sicko/1.0' },
  });
  if (!res.ok) {
    throw new Error(`Baseball Savant returned ${res.status} ${res.statusText}`);
  }
  const records: Record<string, string>[] = parse(await res.text(), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  });

  // One entry per PA, keyed by game + at-bat number (the result row carries the
  // event and the estimate). Dedupe in case the export repeats a PA.
  const byPa = new Map<string, PaRow>();
  for (const r of records) {
    if (!r.events) continue;
    const denom = num(r.woba_denom);
    if (denom === null || denom <= 0) continue;
    const x = num(r.estimated_woba_using_speedangle) ?? num(r.woba_value) ?? 0;
    byPa.set(`${r.game_pk}|${r.at_bat_number}`, {
      date: r.game_date ?? '',
      gamePk: num(r.game_pk) ?? 0,
      atBat: num(r.at_bat_number) ?? 0,
      xwoba: x,
    });
  }

  const ordered = [...byPa.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.gamePk - b.gamePk || a.atBat - b.atBat,
  );
  const pas: XwobaPa[] = ordered.map((p) => ({ date: p.date, xwoba: p.xwoba }));
  const seasonXwoba =
    pas.length > 0 ? pas.reduce((s, p) => s + p.xwoba, 0) / pas.length : 0;

  const data: XwobaSeries = { season: SEASON, seasonXwoba, leagueXwoba: LEAGUE_XWOBA, pas };
  cache.set(key, { data, fetchedAt: Date.now() });
  await writeJsonBlob(storeKey(playerId, kind), data);
  return data;
}
