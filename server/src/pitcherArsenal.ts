import { parse } from 'csv-parse/sync';
import { readJsonBlob, writeJsonBlob } from './storage.js';

// Keep in sync with hfSea in savant.ts, SEASON in xwoba.ts / teamHitting.ts /
// expectedStats.ts, and CURRENT_SEASON in percentiles.ts.
export const SEASON = 2026;

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

/**
 * When a pitcher was in one game and what he walked into. Nothing in MLB's game
 * log says either — it has his line and no innings at all — but the pitch-level
 * CSV this module already downloads stamps every pitch with its inning and the
 * score before it was thrown, so an appearance is just its first and last row.
 */
export interface Appearance {
  firstInning: number;
  lastInning: number;
  /** His team's runs minus the opponent's, at his first pitch: +2 up two, 0
   *  tied, -1 down one. `fld_score` is the fielding side, i.e. his. */
  entryMargin: number;
}

/** A pitcher's appearances, by gamePk. */
export type Appearances = Map<number, Appearance>;

/**
 * One pitch as a point on the movement plot: where it broke, how hard it was
 * thrown, and which side the batter stood on. The Arsenal tab's Movement
 * Profile draws a dot per sample, which is what makes it a *cloud* rather than
 * one bubble per pitch type — the spread within a type is the thing a reader is
 * looking at (a slider that sometimes cuts and sometimes sweeps is two clusters
 * under one average).
 *
 * `hBreak`/`vBreak` are the file's own convention throughout: −pfx_x × 12 and
 * pfx_z × 12, inches. That happens to be exactly Savant's own plotting
 * convention with the sign already the right way round — positive `hBreak`
 * renders toward third base for a pitcher of either hand, so the chart needs no
 * handedness case (checked against Savant's own rendering: a RHP four-seam at
 * hBreak +11 sits on the 3B side there too).
 */
export interface MovementSample {
  pitchType: string;
  hBreak: number;
  vBreak: number;
  velo: number | null;
  stand: 'R' | 'L' | null; // the BATTER's side, so the client can cut by split
}

/** The season arsenal, whole and split by the batter's side. A split is empty
 * (not absent) when he's faced nobody of that hand. */
export interface SeasonArsenals {
  all: Arsenal;
  vsRight: Arsenal;
  vsLeft: Arsenal;
  battedBalls: BattedBallMix;
  appearances: Appearances;
  /** A bounded, evenly-spread selection of the season's pitches for the
   *  movement plot. See `sampleMovement` for why it is sampled at all. */
  samples: MovementSample[];
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
  appearances?: Record<string, Appearance>;
  samples?: MovementSample[];
}

// v2 carries the batted-ball mix; a v1 blob would deserialize with no fly balls
// and silently cost every pitcher his xFIP until the TTL expired. v3 adds the
// per-game appearances, which the game log's innings/entry columns read. v4 adds
// the movement samples — a v3 blob deserializes with none, and the Arsenal tab's
// movement plot would then draw an empty cloud for six hours with the legend and
// the league blobs around it intact, which reads as a pitcher who threw nothing
// rather than as a stale blob.
const storeKey = (pitcherId: number) => `arsenal-${pitcherId}-${SEASON}-v4.json`;

const NO_BATTED_BALLS: BattedBallMix = { total: 0, fly: 0, ground: 0, line: 0 };

function toStored(a: SeasonArsenals): StoredArsenals {
  return {
    all: Object.fromEntries(a.all),
    vsRight: Object.fromEntries(a.vsRight),
    vsLeft: Object.fromEntries(a.vsLeft),
    battedBalls: a.battedBalls,
    appearances: Object.fromEntries(a.appearances),
    samples: a.samples,
  };
}

function fromStored(s: StoredArsenals): SeasonArsenals {
  return {
    all: new Map(Object.entries(s.all ?? {})),
    vsRight: new Map(Object.entries(s.vsRight ?? {})),
    vsLeft: new Map(Object.entries(s.vsLeft ?? {})),
    battedBalls: s.battedBalls ?? NO_BATTED_BALLS,
    appearances: new Map(
      Object.entries(s.appearances ?? {}).map(([pk, a]) => [Number(pk), a]),
    ),
    samples: s.samples ?? [],
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
 * How many pitches the movement plot gets to draw. Savant ships ~200; the
 * cloud reads the same at that order of magnitude and the payload stays small
 * (~240 points is ~3KB gzipped on the wire).
 */
const SAMPLE_TARGET = 240;
/** Floor per pitch type, so a 1%-usage changeup is still a visible cluster
 *  rather than one lonely dot the eye reads as an outlier. */
const SAMPLE_FLOOR = 10;

/**
 * Reduce the season's pitches to a bounded set of movement points.
 *
 * **Why sample at all**: a starter throws 2,000+ pitches a season and the plot
 * is 400px wide — past a few hundred dots the cloud is a solid blob that says
 * less, not more, and the payload grows for nothing.
 *
 * **Proportional, with a floor.** Each pitch type gets a share of the budget in
 * proportion to how often he throws it, so the cloud's densities read as his
 * usage — but never fewer than `SAMPLE_FLOOR`, because the interesting pitch is
 * often the rare one and a 1% changeup allocated 2 dots would look like noise.
 *
 * **Deterministic, by stride rather than at random.** `Math.random` would give
 * a different cloud every time the blob was rebuilt — the same pitcher's chart
 * quietly rearranging itself between two readings of the same season, with
 * nothing on screen to say why. An evenly-spaced stride through the rows also
 * spreads the selection across the whole season instead of clumping in whatever
 * order the CSV arrived in, so a pitcher who changed a grip in June shows both
 * versions.
 */
function sampleMovement(records: Record<string, string>[]): MovementSample[] {
  // Group first, so the budget can be split by how much he actually throws each.
  const byType = new Map<string, MovementSample[]>();
  for (const r of records) {
    const name = feedPitchName(r.pitch_name);
    if (!name || name === 'null') continue;
    const px = num(r.pfx_x);
    const pz = num(r.pfx_z);
    if (px === null || pz === null) continue;
    const stand = r.stand === 'R' || r.stand === 'L' ? r.stand : null;
    const list = byType.get(name);
    const point: MovementSample = {
      pitchType: name,
      hBreak: Math.round(-px * 12 * 10) / 10,
      vBreak: Math.round(pz * 12 * 10) / 10,
      velo: num(r.release_speed),
      stand,
    };
    if (list) list.push(point);
    else byType.set(name, [point]);
  }

  const total = [...byType.values()].reduce((sum, v) => sum + v.length, 0);
  if (!total) return [];

  const out: MovementSample[] = [];
  for (const [, all] of byType) {
    // `aggregate` drops types with fewer than 2 velo readings as stray rows
    // (pitchouts and the like); match that here or the plot draws a dot for a
    // pitch the legend beside it has never heard of.
    if (all.length < 2) continue;
    const want = Math.min(
      all.length,
      Math.max(SAMPLE_FLOOR, Math.round((all.length / total) * SAMPLE_TARGET)),
    );
    for (let i = 0; i < want; i++) out.push(all[Math.floor((i * all.length) / want)]);
  }
  return out;
}

/**
 * Each game he pitched in, from the pitch rows themselves. The CSV comes back in
 * no order this can rely on, so the entry row is the lowest `at_bat_number` /
 * `pitch_number` of the game rather than the first row seen — and the scores on
 * it are the ones *before* that pitch (`post_*` are after), which is exactly the
 * situation he inherited.
 */
function appearanceMap(records: Record<string, string>[]): Appearances {
  const out = new Map<number, Appearance & { atBat: number; pitch: number }>();
  for (const r of records) {
    const pk = num(r.game_pk);
    const inning = num(r.inning);
    if (pk === null || inning === null) continue;
    const atBat = num(r.at_bat_number) ?? 0;
    const pitch = num(r.pitch_number) ?? 0;
    const margin = (num(r.fld_score) ?? 0) - (num(r.bat_score) ?? 0);
    const cur = out.get(pk);
    if (!cur) {
      out.set(pk, {
        firstInning: inning,
        lastInning: inning,
        entryMargin: margin,
        atBat,
        pitch,
      });
      continue;
    }
    if (inning < cur.firstInning) cur.firstInning = inning;
    if (inning > cur.lastInning) cur.lastInning = inning;
    if (atBat < cur.atBat || (atBat === cur.atBat && pitch < cur.pitch)) {
      cur.atBat = atBat;
      cur.pitch = pitch;
      cur.entryMargin = margin;
    }
  }
  return new Map(
    [...out].map(([pk, a]) => [
      pk,
      { firstInning: a.firstInning, lastInning: a.lastInning, entryMargin: a.entryMargin },
    ]),
  );
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
    appearances: appearanceMap(records),
    samples: sampleMovement(records),
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
