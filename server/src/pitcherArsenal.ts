import { parse } from 'csv-parse/sync';
import { readJsonBlob, writeJsonBlob } from './storage.js';

// Keep in sync with hfSea in savant.ts, SEASON in xwoba.ts, CURRENT_SEASON in
// percentiles.ts.
const SEASON = 2026;

/** A pitch type's season averages, in the same units/convention as the game feed
 * (velo mph, spin rpm, break in inches — vBreak = induced vertical break;
 * hBreak signed to match the feed, i.e. −pfx_x × 12). This shape is also the
 * league-average table's row (pitchLeague.ts). */
export interface ArsenalPitch {
  velo: number | null;
  spin: number | null;
  hBreak: number | null;
  vBreak: number | null;
}

/** Season outcomes a pitch type produced (the Baseball Savant "Results" columns):
 * batting line against, whiff%, and put-away% — all over the pitcher's season. */
export interface PitchResults {
  pa: number | null; // plate appearances that ended on this pitch type
  ba: number | null; // batting average against (0-1)
  slg: number | null; // slugging against (0-4 scale)
  woba: number | null; // wOBA against (from woba_value / woba_denom)
  xwoba: number | null; // expected wOBA against (est_woba on BIP, woba weights else)
  whiff: number | null; // whiffs / swings (0-1)
  putAway: number | null; // 2-strike strikeouts / 2-strike pitches (0-1)
}

/** How often a pitch type was thrown, and how often it was a strike. Only the
 * pitcher's own season carries this — the league table is movement-only. */
export interface PitchUsage {
  count: number; // pitches of this type thrown this season
  strikes: number; // of those, the ones not ruled a ball (CSV `type` !== 'B')
}

/** A pitch type's full season profile: usage + movement/velo baseline + results. */
export interface SeasonPitch extends ArsenalPitch, PitchResults, PitchUsage {}

/** A pitcher's season arsenal, keyed by full pitch name ("4-Seam Fastball"). */
export type Arsenal = Map<string, SeasonPitch>;

/**
 * The season's batted balls by trajectory. Only the fly-ball share is used —
 * xFIP replaces a pitcher's own home runs with his fly balls times the league
 * HR/FB rate, and the CSV this module already downloads is the one place we
 * have a fly-ball count (the boxscore only counts batted-ball *outs*).
 */
export interface BattedBallMix {
  total: number;
  fly: number; // fly balls incl. popups, and so incl. the ones that left the yard
  ground: number;
  line: number;
}

/** The season arsenal, whole and split by the batter's side. A split is empty
 * (not absent) when he's faced nobody of that hand. */
export interface SeasonArsenals {
  all: Arsenal;
  vsRight: Arsenal;
  vsLeft: Arsenal;
  battedBalls: BattedBallMix;
}

/**
 * Savant's CSV and the MLB feed disagree on a couple of pitch names. The arsenal
 * is keyed by the feed's spelling, since that's what a game's `PitchMix` carries
 * and what `pitchStyle()` colors by — without this, a splitter's season baselines
 * and Results never attach to its game row.
 */
const CSV_PITCH_NAME: Record<string, string> = {
  'Split-Finger': 'Splitter',
};

function feedPitchName(csvName: string | undefined): string | undefined {
  return csvName === undefined ? undefined : (CSV_PITCH_NAME[csvName] ?? csvName);
}

// ---- Statcast event / description vocabularies (CSV `events`/`description`) ---

/** Total bases per hit event, and the set of hits. */
const HIT_TB: Record<string, number> = { single: 1, double: 2, triple: 3, home_run: 4 };
/** PA-terminal batting events (excludes baserunning: steals, pickoffs, WP/PB). */
const BATTING_EVENTS = new Set([
  'single', 'double', 'triple', 'home_run',
  'field_out', 'force_out', 'grounded_into_double_play', 'double_play', 'triple_play',
  'fielders_choice', 'fielders_choice_out', 'field_error', 'other_out',
  'strikeout', 'strikeout_double_play', 'strikeout_triple_play',
  'walk', 'intent_walk', 'hit_by_pitch',
  'sac_fly', 'sac_fly_double_play', 'sac_bunt', 'sac_bunt_double_play',
  'catcher_interf',
]);
/** PA events that are NOT at-bats (excluded from the BA/SLG denominator). */
const NON_AB = new Set([
  'walk', 'intent_walk', 'hit_by_pitch', 'catcher_interf',
  'sac_fly', 'sac_fly_double_play', 'sac_bunt', 'sac_bunt_double_play',
]);
const STRIKEOUT_EVENTS = new Set(['strikeout', 'strikeout_double_play', 'strikeout_triple_play']);
/** A swing: any pitch the batter offered at (whiffs + fouls + balls in play). */
const isSwing = (d: string): boolean =>
  d === 'swinging_strike' || d === 'swinging_strike_blocked' || d === 'foul' ||
  d === 'foul_tip' || d === 'foul_bunt' || d === 'missed_bunt' || d.startsWith('hit_into_play');
/** A whiff: a swing that missed entirely (foul tips are contact, not whiffs). */
const isWhiff = (d: string): boolean =>
  d === 'swinging_strike' || d === 'swinging_strike_blocked' || d === 'missed_bunt';

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
const cache = new Map<number, { data: SeasonArsenals; fetchedAt: number }>();

/** An `Arsenal` is a Map, so it needs flattening before it can be stored. */
interface StoredArsenals {
  all: Record<string, SeasonPitch>;
  vsRight: Record<string, SeasonPitch>;
  vsLeft: Record<string, SeasonPitch>;
  battedBalls?: BattedBallMix;
}

// v2 carries the batted-ball mix; a v1 blob would deserialize with no fly balls
// and silently cost every pitcher his xFIP until the TTL expired.
const storeKey = (pitcherId: number) => `arsenal-${pitcherId}-${SEASON}-v2.json`;

const NO_BATTED_BALLS: BattedBallMix = { total: 0, fly: 0, ground: 0, line: 0 };

function toStored(a: SeasonArsenals): StoredArsenals {
  return {
    all: Object.fromEntries(a.all),
    vsRight: Object.fromEntries(a.vsRight),
    vsLeft: Object.fromEntries(a.vsLeft),
    battedBalls: a.battedBalls,
  };
}

function fromStored(s: StoredArsenals): SeasonArsenals {
  return {
    all: new Map(Object.entries(s.all ?? {})),
    vsRight: new Map(Object.entries(s.vsRight ?? {})),
    vsLeft: new Map(Object.entries(s.vsLeft ?? {})),
    battedBalls: s.battedBalls ?? NO_BATTED_BALLS,
  };
}

/** Tally the season's batted balls by Statcast trajectory (`bb_type`). */
function battedBallMix(records: Record<string, string>[]): BattedBallMix {
  const mix: BattedBallMix = { total: 0, fly: 0, ground: 0, line: 0 };
  for (const r of records) {
    switch (r.bb_type) {
      // Popups are fly balls for this purpose, and a home run is recorded as a
      // fly ball — so `fly` is already the denominator HR/FB wants.
      case 'fly_ball':
      case 'popup':
        mix.fly++;
        break;
      case 'ground_ball':
        mix.ground++;
        break;
      case 'line_drive':
        mix.line++;
        break;
      default:
        continue;
    }
    mix.total++;
  }
  return mix;
}

/**
 * A pitcher's season arsenal averages (velo, spin, induced vertical break,
 * horizontal break) per pitch type. The feed's `breakHorizontal` is the negation
 * of Savant `pfx_x`, and `breakVerticalInduced` equals `pfx_z`; both are ×12 to
 * convert feet→inches so the season baseline matches the per-game feed values.
 */
export async function getSeasonArsenal(pitcherId: number): Promise<SeasonArsenals> {
  const hit = cache.get(pitcherId);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.data;

  // getReport calls this once per watched pitcher, and the source is a
  // full-season Savant CSV — without a storage tier behind the memory cache a
  // cold container re-downloads one per pitcher on every report.
  const stored = await readJsonBlob<StoredArsenals>(
    storeKey(pitcherId),
    (_v, cachedAt) => Date.now() - cachedAt < CACHE_TTL_MS,
  );
  if (stored) {
    const data = fromStored(stored);
    cache.set(pitcherId, { data, fetchedAt: Date.now() });
    return data;
  }

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

  const data: SeasonArsenals = {
    all: aggregate(records),
    // `stand` is the BATTER's side, so these are the pitcher's arsenal against
    // righties / lefties.
    vsRight: aggregate(records.filter((r) => r.stand === 'R')),
    vsLeft: aggregate(records.filter((r) => r.stand === 'L')),
    battedBalls: battedBallMix(records),
  };
  cache.set(pitcherId, { data, fetchedAt: Date.now() });
  await writeJsonBlob(storeKey(pitcherId), toStored(data));
  return data;
}

/** Roll a set of season pitch rows up into a per-pitch-type arsenal. */
function aggregate(records: Record<string, string>[]): Arsenal {
  interface Acc {
    count: number;
    strikes: number;
    velo: number[];
    spin: number[];
    hb: number[];
    vb: number[];
    pa: number; // PA-terminal batting events
    ab: number; // at-bats (PA minus walks/HBP/sac/interference)
    hits: number;
    tb: number; // total bases
    wobaVal: number; // Σ woba_value
    wobaDen: number; // Σ woba_denom
    xwobaNum: number; // Σ (est_woba on BIP, woba_value otherwise)
    swings: number;
    whiffs: number;
    twoStrike: number; // pitches thrown in a 2-strike count
    putaways: number; // 2-strike pitches that were strike three
  }
  const agg = new Map<string, Acc>();
  for (const r of records) {
    const name = feedPitchName(r.pitch_name);
    if (!name || name === 'null') continue;
    let a = agg.get(name);
    if (!a) {
      a = { count: 0, strikes: 0, velo: [], spin: [], hb: [], vb: [], pa: 0, ab: 0, hits: 0, tb: 0, wobaVal: 0, wobaDen: 0, xwobaNum: 0, swings: 0, whiffs: 0, twoStrike: 0, putaways: 0 };
      agg.set(name, a);
    }
    a.count++;
    // Savant's `type`: B = ball, S = strike, X = in play — which counts as a
    // strike, the same split the boxscore's balls/strikes uses.
    if (r.type !== 'B') a.strikes++;
    const velo = num(r.release_speed);
    if (velo !== null) a.velo.push(velo);
    const spin = num(r.release_spin_rate);
    if (spin !== null) a.spin.push(spin);
    const px = num(r.pfx_x);
    if (px !== null) a.hb.push(-px * 12); // −pfx_x → the feed's horizontal-break sign
    const pz = num(r.pfx_z);
    if (pz !== null) a.vb.push(pz * 12); // pfx_z → induced vertical break

    // Whiff / swing (per pitch, on `description`).
    const d = r.description ?? '';
    if (isSwing(d)) a.swings++;
    if (isWhiff(d)) a.whiffs++;

    // Put-away: strike three thrown in a 2-strike count.
    const strikes = num(r.strikes);
    const ev = r.events ?? '';
    if (strikes === 2) {
      a.twoStrike++;
      if (STRIKEOUT_EVENTS.has(ev)) a.putaways++;
    }

    // Results (only PA-terminal batting events carry an outcome).
    if (BATTING_EVENTS.has(ev)) {
      a.pa++;
      if (!NON_AB.has(ev)) a.ab++;
      const tb = HIT_TB[ev];
      if (tb !== undefined) {
        a.hits++;
        a.tb += tb;
      }
      const den = num(r.woba_denom);
      if (den !== null && den > 0) {
        a.wobaDen += den;
        a.wobaVal += num(r.woba_value) ?? 0;
        const est = num(r.estimated_woba_using_speedangle);
        // In play → expected wOBA from launch data; else the actual woba weight.
        a.xwobaNum += r.type === 'X' && est !== null ? est : num(r.woba_value) ?? 0;
      }
    }
  }

  const mean = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const data: Arsenal = new Map();
  for (const [name, a] of agg) {
    // Skip stray unclassified rows (e.g. pitchouts) with no real sample.
    if (a.velo.length < 2) continue;
    data.set(name, {
      count: a.count,
      strikes: a.strikes,
      velo: mean(a.velo),
      spin: a.spin.length ? Math.round(a.spin.reduce((s, x) => s + x, 0) / a.spin.length) : null,
      hBreak: mean(a.hb),
      vBreak: mean(a.vb),
      pa: a.pa || null,
      ba: a.ab ? r3(a.hits / a.ab) : null,
      slg: a.ab ? r3(a.tb / a.ab) : null,
      woba: a.wobaDen ? r3(a.wobaVal / a.wobaDen) : null,
      xwoba: a.wobaDen ? r3(a.xwobaNum / a.wobaDen) : null,
      whiff: a.swings ? r3(a.whiffs / a.swings) : null,
      putAway: a.twoStrike ? r3(a.putaways / a.twoStrike) : null,
    });
  }

  return data;
}
