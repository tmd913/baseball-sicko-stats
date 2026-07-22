import { parse } from 'csv-parse/sync';

// Keep in sync with hfSea in savant.ts, SEASON in xwoba.ts, CURRENT_SEASON in
// percentiles.ts.
const SEASON = 2026;

/** A pitch type's season averages, in the same units/convention as the game feed
 * (velo mph, spin rpm, break in inches — vBreak = induced vertical break;
 * hBreak signed to match the feed, i.e. −pfx_x × 12). */
export interface ArsenalPitch {
  velo: number | null;
  spin: number | null;
  hBreak: number | null;
  vBreak: number | null;
}
/** A pitcher's season arsenal, keyed by full pitch name ("4-Seam Fastball"). */
export type Arsenal = Map<string, ArsenalPitch>;

/** Baseball Savant statcast-search CSV for one pitcher's full regular season —
 * every pitch, for per-pitch-type velo/spin/break season averages. */
function seasonPitcherUrl(pitcherId: number): string {
  const params = new URLSearchParams({
    hfGT: 'R|',
    hfSea: `${SEASON}|`,
    player_type: 'pitcher',
    'pitchers_lookup[]': String(pitcherId),
    game_date_gt: `${SEASON}-01-01`,
    game_date_lt: `${SEASON}-12-31`,
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

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // current-season data moves daily
const cache = new Map<number, { data: Arsenal; fetchedAt: number }>();

/**
 * A pitcher's season arsenal averages (velo, spin, induced vertical break,
 * horizontal break) per pitch type. The feed's `breakHorizontal` is the negation
 * of Savant `pfx_x`, and `breakVerticalInduced` equals `pfx_z`; both are ×12 to
 * convert feet→inches so the season baseline matches the per-game feed values.
 */
export async function getSeasonArsenal(pitcherId: number): Promise<Arsenal> {
  const hit = cache.get(pitcherId);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.data;

  const res = await fetch(seasonPitcherUrl(pitcherId), {
    headers: { 'User-Agent': 'statcast-sicko/1.0' },
  });
  if (!res.ok) throw new Error(`Baseball Savant returned ${res.status} ${res.statusText}`);
  const records: Record<string, string>[] = parse(await res.text(), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  });

  const agg = new Map<string, { velo: number[]; spin: number[]; hb: number[]; vb: number[] }>();
  for (const r of records) {
    const name = r.pitch_name;
    if (!name || name === 'null') continue;
    let a = agg.get(name);
    if (!a) {
      a = { velo: [], spin: [], hb: [], vb: [] };
      agg.set(name, a);
    }
    const velo = num(r.release_speed);
    if (velo !== null) a.velo.push(velo);
    const spin = num(r.release_spin_rate);
    if (spin !== null) a.spin.push(spin);
    const px = num(r.pfx_x);
    if (px !== null) a.hb.push(-px * 12); // −pfx_x → the feed's horizontal-break sign
    const pz = num(r.pfx_z);
    if (pz !== null) a.vb.push(pz * 12); // pfx_z → induced vertical break
  }

  const mean = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null;
  const data: Arsenal = new Map();
  for (const [name, a] of agg) {
    // Skip stray unclassified rows (e.g. pitchouts) with no real sample.
    if (a.velo.length < 2) continue;
    data.set(name, {
      velo: mean(a.velo),
      spin: a.spin.length ? Math.round(a.spin.reduce((s, x) => s + x, 0) / a.spin.length) : null,
      hBreak: mean(a.hb),
      vBreak: mean(a.vb),
    });
  }

  cache.set(pitcherId, { data, fetchedAt: Date.now() });
  return data;
}
