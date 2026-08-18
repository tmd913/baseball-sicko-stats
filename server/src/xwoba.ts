import { parse } from 'csv-parse/sync';
import { readStampedBlob, writeJsonBlob } from './storage.js';
import { DEFAULT_LEAGUE_XWOBA, getLeagueXwoba } from './leagueWoba.js';
import type { XwobaPa, XwobaSeries } from './types.js';

// Keep in sync with hfSea in savant.ts, CURRENT_SEASON in percentiles.ts, and
// SEASON in pitcherArsenal.ts / teamHitting.ts / expectedStats.ts.
const SEASON = 2026;

/**
 * **The league line is measured now, and it is not measured here.**
 *
 * It used to be `const LEAGUE_XWOBA = 0.315`, on the reasoning that wOBA is
 * calibrated to the league OBP scale so a fixed benchmark is fine. It is fine
 * to a thousandth for the *season* (2026 measures .3149) and wrong by a fifth
 * of that within it — the same season runs .3241 in April and .3071 in August.
 * `leagueWoba.ts` sums the season's own plate appearances nightly; this file
 * reads the answer and pins the old constant on as the fallback for an
 * installation whose nightly job has not run.
 *
 * **Attached on the way out rather than stored**, which is the part worth
 * stating: the per-player blob below is a *season series*, and folding a league
 * figure into it would freeze one reading of the league inside every player's
 * cached copy — a number that moves nightly, cached for as long as the series
 * is. So the stored payload keeps whatever league figure it was written with
 * and every response overwrites it, which also means the blob's shape did not
 * change and no stored series had to be thrown away for this.
 */
async function withLeague(series: XwobaSeries): Promise<XwobaSeries> {
  const league = await getLeagueXwoba().catch((err) => {
    console.error('league xwOBA read failed:', err);
    return null;
  });
  return {
    ...series,
    leagueXwoba: league?.xwoba ?? DEFAULT_LEAGUE_XWOBA,
    // 0 is the honest statement of "this is the benchmark, not a measurement",
    // and it is what the legend reads to say so.
    leagueXwobaPa: league?.pa ?? 0,
  };
}

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

// Current-season data changes daily; refresh at most every 6h per player.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/**
 * How stale a copy may be and still be served **while** the refresh runs.
 *
 * The read behind this is a Savant `statcast_search` query for one player's
 * whole season, and its cost is Savant's own query cache rather than anything
 * here: measured over five players, **0.12–0.18s when they have it warm and
 * 5.7–6.6s when they don't**, for the same 0.8–1.4MB. So the reader who arrives
 * first after the TTL expires waited six seconds for a chart that differs from
 * the one on disk by a day's plate appearances. Serving what we have and
 * refreshing behind it makes that reader's chart instant and the next one's
 * current.
 *
 * **A day, and not unbounded.** A day is at most four or five PAs of several
 * hundred on a rolling 50/100/250-PA mean — invisible on the line — and it is
 * no worse than the six hours the plain TTL already served with no mark on it.
 * Past that the series is missing enough to be worth waiting for, so the read
 * blocks as it always did. A player nobody has opened all week therefore costs
 * one reader six seconds rather than everybody a stale chart.
 */
const SERVE_STALE_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { data: XwobaSeries; fetchedAt: number }>();
/** One download per player in flight at a time: a burst of opens on a cold
 *  container must not become a burst of season CSVs. */
const inFlight = new Map<string, Promise<XwobaSeries>>();

/** Backing the memory cache with the storage tier matters more than it looks:
 *  the source here is a *full-season* Savant CSV, several MB per player. Memory
 *  alone means every cold container re-downloads and re-parses it. */
const storeKey = (playerId: number, kind: 'batter' | 'pitcher') =>
  `xwoba-${kind}-${playerId}-${SEASON}.json`;

/** Sortable per-PA record before it's trimmed to the wire shape. */
interface PaRow extends XwobaPa {
  gamePk: number;
  atBat: number;
}

/**
 * Download, parse and store one player's season.
 *
 * Each PA's `xwoba` is Savant's `estimated_woba_using_speedangle`, which already
 * encodes the right wOBA contribution for every event (batted-ball xwOBA, the
 * walk/HBP weight, a strikeout's 0); `woba_value` is a fallback for the rare
 * event with no estimate (e.g. catcher's interference). Only rows with a wOBA
 * denominator are kept — that excludes intentional walks and truncated PAs,
 * which don't count in wOBA (matching Savant's convention).
 */
async function download(playerId: number, kind: 'batter' | 'pitcher'): Promise<XwobaSeries> {
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
  const seasonXwoba = pas.length > 0 ? pas.reduce((s, p) => s + p.xwoba, 0) / pas.length : 0;

  // `leagueXwoba` is written for the shape's sake and overwritten on the way out
  // by `withLeague` — see the note on that function.
  const data: XwobaSeries = {
    season: SEASON,
    seasonXwoba,
    leagueXwoba: DEFAULT_LEAGUE_XWOBA,
    pas,
  };
  cache.set(`${kind}-${playerId}`, { data, fetchedAt: Date.now() });
  await writeJsonBlob(storeKey(playerId, kind), data);
  return data;
}

/** One download per player at a time, whether it is being waited on or is
 *  running behind a stale answer. */
function refresh(playerId: number, kind: 'batter' | 'pitcher'): Promise<XwobaSeries> {
  const key = `${kind}-${playerId}`;
  const running = inFlight.get(key);
  if (running) return running;
  const p = download(playerId, kind).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

/**
 * The player's season sequence of per-plate-appearance xwOBA, in play order, for
 * the rolling-xwOBA chart.
 *
 * **Stale while it revalidates**, which is the whole of what makes the Charts
 * tab quick: a copy under `SERVE_STALE_MS` old is returned straight away and
 * the refresh runs behind it, so only a player with no copy at all — or one
 * older than that — pays Savant's six seconds. The series is append-only, so
 * what a stale copy is missing is the newest PAs and never a changed one.
 *
 * The background refresh is deliberately **not awaited** and its failure is
 * logged rather than raised: the reader already has an answer, and the next
 * reader kicks another attempt, so a Savant outage costs the chart its newest
 * day rather than the chart.
 */
export async function getXwobaSeries(
  playerId: number,
  kind: 'batter' | 'pitcher' = 'batter',
): Promise<XwobaSeries> {
  const key = `${kind}-${playerId}`;
  let entry = cache.get(key);
  if (!entry) {
    const stored = await readStampedBlob<XwobaSeries>(storeKey(playerId, kind));
    if (stored) cache.set(key, (entry = { data: stored.value, fetchedAt: stored.cachedAt }));
  }

  if (entry) {
    const age = Date.now() - entry.fetchedAt;
    if (age < CACHE_TTL_MS) return withLeague(entry.data);
    if (age < SERVE_STALE_MS) {
      void refresh(playerId, kind).catch((err) =>
        console.error(`xwOBA refresh failed for ${key}:`, err),
      );
      return withLeague(entry.data);
    }
  }

  return withLeague(await refresh(playerId, kind));
}

/**
 * **The warmer's door, which is not `getXwobaSeries`.**
 *
 * That one is written for a reader and answers from a stale copy the moment it
 * has one, leaving the refresh to run behind the response — which on Lambda is
 * a promise the container may be frozen in the middle of. A warmer that called
 * it would return in two milliseconds having refreshed nothing, and the copy it
 * was run to freshen would still be there in the morning.
 *
 * So this waits for the download when there is one to do, and does nothing at
 * all when the copy is inside its TTL. It shares `refresh`'s in-flight map, so
 * a reader arriving mid-warm joins the same download rather than starting a
 * second.
 */
export async function warmXwobaSeries(
  playerId: number,
  kind: 'batter' | 'pitcher' = 'batter',
): Promise<void> {
  const key = `${kind}-${playerId}`;
  let entry = cache.get(key);
  if (!entry) {
    const stored = await readStampedBlob<XwobaSeries>(storeKey(playerId, kind));
    if (stored) cache.set(key, (entry = { data: stored.value, fetchedAt: stored.cachedAt }));
  }
  if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) return;
  await refresh(playerId, kind);
}
