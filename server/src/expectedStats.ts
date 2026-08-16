import { parse } from 'csv-parse/sync';
import { readJsonBlob, writeJsonBlob } from './storage.js';

// Keep in sync with hfSea in savant.ts, CURRENT_SEASON in percentiles.ts, and
// SEASON in xwoba.ts / pitcherArsenal.ts / teamHitting.ts.
const SEASON = 2026;

// Savant recomputes these nightly at most, and this is every pitcher in one blob.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** xERA keyed by MLB player id, as Savant prints it ("3.74"). */
type LeagueXera = Record<string, string>;

let cache: { data: LeagueXera; fetchedAt: number } | null = null;
let inFlight: Promise<LeagueXera> | null = null;

const storeKey = () => `pitcher-xera-${SEASON}.json`;

// The whole league in one CSV rather than a page scrape per pitcher: xERA is one
// number on a card, and `min=1` keeps the September call-up who's faced nine
// batters — a qualified-only board would leave most relievers without one.
const leaderboardUrl = () =>
  'https://baseballsavant.mlb.com/leaderboard/expected_statistics?' +
  `type=pitcher&year=${SEASON}&position=&team=&filter=&min=1&csv=true`;

async function buildLeague(): Promise<LeagueXera> {
  const res = await fetch(leaderboardUrl(), { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) {
    throw new Error(`Savant expected stats returned ${res.status} ${res.statusText}`);
  }
  const rows: Record<string, string>[] = parse(await res.text(), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  });
  const league: LeagueXera = {};
  for (const r of rows) {
    const id = Number(r.player_id);
    const xera = Number(r.xera);
    if (!Number.isFinite(id) || !Number.isFinite(xera)) continue;
    league[id] = xera.toFixed(2);
  }
  return league;
}

async function getLeague(): Promise<LeagueXera> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const stored = await readJsonBlob<LeagueXera>(
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
 * Every pitcher's season xERA, keyed by MLB id — Statcast's contact-quality ERA
 * estimator, the third of the three the card's season line shows (ERA, what
 * happened; xERA, what the contact he allowed was worth; FIP/xFIP, what's left
 * once the defence behind him is taken out of it).
 *
 * Failures resolve to an empty map rather than throwing, the same rule the team
 * lookup follows: this is one figure on a card and must never 502 a report.
 */
export async function getPitcherXera(): Promise<Map<number, string>> {
  try {
    return new Map(Object.entries(await getLeague()).map(([id, x]) => [Number(id), x]));
  } catch (err) {
    console.error('pitcher xERA fetch failed:', err);
    return new Map();
  }
}
