import { parse } from 'csv-parse/sync';
import { readBlob, writeBlob } from './storage.js';
import type { PercentileMetric, PercentileSection, PlayerPercentiles } from './types.js';

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
  // Metrics where a lower raw value is better (K%, chase, whiff, pop time, …).
  // Only matters for the estimated-percentile fallback, which otherwise assumes
  // higher-is-better; Savant's own `percent_rank_` fields already bake this in.
  lowerBetter?: boolean;
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
      { key: 'xhr', label: 'xHR', pct: 'percent_rank_xhr', raw: 'xhr', fmt: 'dec1' },
      // BABIP closes the slash line and bridges into Batted Ball, the contact
      // quality that explains it.
      { key: 'babip', label: 'BABIP', pct: 'percent_rank_babip', raw: 'babip', fmt: 'avg' },
    ],
  },
  {
    title: 'Batted Ball',
    metrics: [
      // What he hit and how hard — the pitcher card's section of the same name,
      // read from the other side of the plate.
      { key: 'exit_velo', label: 'Avg Exit Velocity', pct: 'percent_rank_exit_velocity_avg', raw: 'exit_velocity_avg', fmt: 'dec1' },
      { key: 'barrel', label: 'Barrel %', pct: 'percent_rank_barrel_batted_rate', raw: 'barrel_batted_rate', fmt: 'dec1' },
      { key: 'hard_hit', label: 'Hard-Hit %', pct: 'percent_rank_hard_hit_percent', raw: 'hard_hit_percent', fmt: 'dec1' },
      { key: 'sweet_spot', label: 'LA Sweet-Spot %', pct: 'percent_rank_sweet_spot_percent', raw: 'sweet_spot_percent', fmt: 'dec1' },
      // Pull Air %: share of batted balls that are both pulled and in the air —
      // Savant's `pull_percent_airballs`, ranked by `percent_rank_pull_percent_airballs`.
      { key: 'pull_air', label: 'Pull Air %', pct: 'percent_rank_pull_percent_airballs', raw: 'pull_percent_airballs', fmt: 'dec1' },
      // Batted-ball profile: air balls (fly balls + line drives).
      { key: 'air', label: 'Air %', pct: 'percent_rank_airballs_percent', raw: 'airballs_percent', fmt: 'dec1' },
    ],
  },
  {
    title: 'Swing',
    metrics: [
      // Bat tracking — the swing itself, before it meets anything. The pitcher
      // card carries the same rows as Swings Against, the swings he induces.
      // Bat speed's percentile lives under `swing_speed` but the raw mph under
      // `avg_swing_speed` — the two are not named in parallel.
      { key: 'bat_speed', label: 'Bat Speed', pct: 'percent_rank_swing_speed', raw: 'avg_swing_speed', fmt: 'dec1' },
      // Fast Swing % follows, ranked by `BATTER_COMPUTED` — the page carries the
      // rate but doesn't rank it.
      { key: 'squared_up', label: 'Squared-Up %', pct: 'percent_rank_squared_up_swing', raw: 'squared_up_swing', fmt: 'dec1' },
    ],
  },
  {
    title: 'Plate Discipline',
    metrics: [
      // Chase %'s raw value is the out-of-zone swing rate.
      { key: 'chase', label: 'Chase %', pct: 'percent_rank_chase_percent', raw: 'oz_swing_percent', fmt: 'dec1', lowerBetter: true },
      { key: 'whiff', label: 'Whiff %', pct: 'percent_rank_whiff_percent', raw: 'whiff_percent', fmt: 'dec1', lowerBetter: true },
      { key: 'k', label: 'K %', pct: 'percent_rank_k_percent', raw: 'k_percent', fmt: 'dec1', lowerBetter: true },
      { key: 'bb', label: 'BB %', pct: 'percent_rank_bb_percent', raw: 'bb_percent', fmt: 'dec1' },
      // Strike-zone judgment: Savant's swing-decision run value (`sz_judge`); lower is better.
      { key: 'sz_judge', label: 'Strike-Zone Judgment', pct: 'percent_rank_sz_judge', raw: 'sz_judge', fmt: 'dec1', lowerBetter: true },
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
      { key: 'pop_2b', label: 'Pop Time to 2B (sec)', pct: 'percent_rank_pop_2b', raw: 'pop_2b', fmt: 'dec2', lowerBetter: true },
      { key: 'catcher_arm', label: 'Arm Strength on Steals', pct: 'percent_rank_arm_cs_2b', raw: 'arm_cs_2b', fmt: 'dec1' },
    ],
  },
];

// Pitcher percentile card (Savant `statcast-r-pitching-mlb` page). `lowerBetter`
// (only used by the estimated-percentile fallback) flags the results a pitcher
// wants LOW — the ones they allow. Savant's own `percent_rank_` fields already
// encode direction, so it rarely fires.
const PITCHER_SECTIONS: SectionDef[] = [
  {
    title: 'Value',
    metrics: [
      // The headline row, as on Savant's own card: the runs he saved or cost
      // over every pitch — the pitcher-side twin of Batting Run Value.
      { key: 'run_value', label: 'Pitching Run Value', pct: 'percent_rank_swing_take_run_value', raw: 'swing_take_run_value', fmt: 'int' },
      // Each result a pitcher actually posted sits immediately before its
      // expected twin, which is what collapses the two into one dumbbell row on
      // the card (the client pairs on `EXPECTED_OF`, actual first). ERA and HR
      // are the exceptions: the page ranks neither, so `PITCHER_COMPUTED` ranks
      // them against a leaderboard and splices each in below.
      { key: 'woba', label: 'wOBA', pct: 'percent_rank_woba', raw: 'woba', fmt: 'avg', lowerBetter: true },
      { key: 'xwoba', label: 'xwOBA', pct: 'percent_rank_xwoba', raw: 'xwoba', fmt: 'avg', lowerBetter: true },
      { key: 'xera', label: 'xERA', pct: 'percent_rank_xera', raw: 'xera', fmt: 'dec2', lowerBetter: true },
      { key: 'ba', label: 'BA', pct: 'percent_rank_ba', raw: 'ba', fmt: 'avg', lowerBetter: true },
      { key: 'xba', label: 'xBA', pct: 'percent_rank_xba', raw: 'xba', fmt: 'avg', lowerBetter: true },
      { key: 'obp', label: 'OBP', pct: 'percent_rank_obp', raw: 'obp', fmt: 'avg', lowerBetter: true },
      { key: 'xobp', label: 'xOBP', pct: 'percent_rank_xobp', raw: 'xobp', fmt: 'avg', lowerBetter: true },
      { key: 'slg', label: 'SLG', pct: 'percent_rank_slg', raw: 'slg', fmt: 'avg', lowerBetter: true },
      { key: 'xslg', label: 'xSLG', pct: 'percent_rank_xslg', raw: 'xslg', fmt: 'avg', lowerBetter: true },
      { key: 'iso', label: 'ISO', pct: 'percent_rank_iso', raw: 'iso', fmt: 'avg', lowerBetter: true },
      { key: 'xiso', label: 'xISO', pct: 'percent_rank_xiso', raw: 'xiso', fmt: 'avg', lowerBetter: true },
      { key: 'xhr', label: 'xHR', pct: 'percent_rank_xhr', raw: 'xhr', fmt: 'dec1', lowerBetter: true },
      // BABIP closes the section the way it does on the batter card: the bridge
      // from what he allowed to the contact quality that explains it.
      { key: 'babip', label: 'BABIP', pct: 'percent_rank_babip', raw: 'babip', fmt: 'avg', lowerBetter: true },
    ],
  },
  {
    title: 'Pitch',
    metrics: [
      { key: 'fb_velo', label: 'Fastball Velocity', pct: 'percent_rank_fastball_velo', raw: 'fastball_velo', fmt: 'dec1' },
      { key: 'fb_spin', label: 'Fastball Spin', pct: 'percent_rank_fastball_spin', raw: 'fastball_spin', fmt: 'int' },
      { key: 'fb_ext', label: 'Extension', pct: 'percent_rank_fastball_extension', raw: 'fastball_extension', fmt: 'dec1' },
      // The one breaking-ball spin Savant ranks (`cu_spin`, not named in
      // parallel with its raw). Null for a pitcher with no curve, which the
      // metric-level null-drop keeps off his card.
      { key: 'cu_spin', label: 'Curveball Spin', pct: 'percent_rank_cu_spin', raw: 'curveball_spin', fmt: 'int' },
    ],
  },
  {
    title: 'Run Value by Pitch',
    metrics: [
      // The mirror of the batter card's Vs Pitch Type section: run value earned
      // with each pitch group (whole-run totals), which is where a card shows
      // that one pitch is carrying the arsenal.
      { key: 'rv_fastball', label: 'Fastball', pct: 'percent_rank_pitch_run_value_fastball', raw: 'pitch_run_value_fastball', fmt: 'int' },
      { key: 'rv_breaking', label: 'Breaking', pct: 'percent_rank_pitch_run_value_breaking', raw: 'pitch_run_value_breaking', fmt: 'int' },
      { key: 'rv_offspeed', label: 'Offspeed', pct: 'percent_rank_pitch_run_value_offspeed', raw: 'pitch_run_value_offspeed', fmt: 'int' },
    ],
  },
  {
    title: 'Plate Discipline',
    metrics: [
      { key: 'k', label: 'K %', pct: 'percent_rank_k_percent', raw: 'k_percent', fmt: 'dec1' },
      { key: 'bb', label: 'BB %', pct: 'percent_rank_bb_percent', raw: 'bb_percent', fmt: 'dec1', lowerBetter: true },
      { key: 'whiff', label: 'Whiff %', pct: 'percent_rank_whiff_percent', raw: 'whiff_percent', fmt: 'dec1' },
      // Chase %'s raw value is the out-of-zone swing rate, as on the batter card
      // — there is no `chase_percent` field, so the bar printed no number.
      { key: 'chase', label: 'Chase %', pct: 'percent_rank_chase_percent', raw: 'oz_swing_percent', fmt: 'dec1' },
      // First-Pitch Strike %, Edge % and Meatball % follow, ranked by
      // `PITCHER_COMPUTED` — the page carries the three rates but ranks none.
    ],
  },
  {
    title: 'Swings Against',
    metrics: [
      // Bat tracking, read from the pitcher's side: these are the swings he
      // induces, so a low number is the good one (verified against Savant's own
      // ranks, which already bake the direction in).
      { key: 'bat_speed', label: 'Bat Speed', pct: 'percent_rank_swing_speed', raw: 'avg_swing_speed', fmt: 'dec1', lowerBetter: true },
      { key: 'squared_up', label: 'Squared-Up %', pct: 'percent_rank_squared_up_swing', raw: 'squared_up_swing', fmt: 'dec1', lowerBetter: true },
      { key: 'blasts', label: 'Blast %', pct: 'percent_rank_blasts_swing', raw: 'blasts_swing', fmt: 'dec1', lowerBetter: true },
      // Swords (a swing so far off it embarrasses the hitter) follows, ranked by
      // `PITCHER_COMPUTED`.
    ],
  },
  {
    title: 'Batted Ball',
    metrics: [
      // What the contact he allowed was worth, actual before expected so the two
      // pair into a dumbbell like the slash line above.
      { key: 'wobacon', label: 'wOBAcon', pct: 'percent_rank_wobacon', raw: 'wobacon', fmt: 'avg', lowerBetter: true },
      { key: 'xwobacon', label: 'xwOBAcon', pct: 'percent_rank_xwobacon', raw: 'xwobacon', fmt: 'avg', lowerBetter: true },
      { key: 'exit_velo', label: 'Avg Exit Velocity', pct: 'percent_rank_exit_velocity_avg', raw: 'exit_velocity_avg', fmt: 'dec1', lowerBetter: true },
      { key: 'max_exit_velo', label: 'Max Exit Velocity', pct: 'percent_rank_exit_velocity_max', raw: 'exit_velocity_max', fmt: 'dec1', lowerBetter: true },
      { key: 'barrel', label: 'Barrel %', pct: 'percent_rank_barrel_batted_rate', raw: 'barrel_batted_rate', fmt: 'dec1', lowerBetter: true },
      { key: 'hard_hit', label: 'Hard-Hit %', pct: 'percent_rank_hard_hit_percent', raw: 'hard_hit_percent', fmt: 'dec1', lowerBetter: true },
      { key: 'sweet_spot', label: 'LA Sweet-Spot %', pct: 'percent_rank_sweet_spot_percent', raw: 'sweet_spot_percent', fmt: 'dec1', lowerBetter: true },
      { key: 'launch_angle', label: 'Avg Launch Angle', pct: 'percent_rank_launch_angle_avg', raw: 'launch_angle_avg', fmt: 'dec1', lowerBetter: true },
      { key: 'gb', label: 'Groundball %', pct: 'percent_rank_groundballs_percent', raw: 'groundballs_percent', fmt: 'dec1' },
      // HR/FB % follows, ranked by `PITCHER_COMPUTED`.
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

// ---- Estimated percentiles from the league distribution -------------------
// Savant leaves `percent_rank_*` null for metrics a player doesn't qualify for
// (e.g. bat tracking for a part-season hitter) even though it still shows a
// slider — it computes one from the season's league mean/stddev, which it also
// embeds as `metricSummaryStats: { "<year>": { "<metric>": {avg,stddev,n} } }`.
// We do the same to fill those blanks, keyed by year so there's no ambiguity.

type MetricStats = Record<string, unknown>; // { avg_metric, stddev_metric, n }
type YearSummary = Record<string, Record<string, MetricStats>>;

/** Extract the per-season league mean/stddev map embedded in a player page. */
function extractMetricSummary(html: string): YearSummary {
  const marker = 'metricSummaryStats:';
  const at = html.indexOf(marker);
  if (at === -1) return {};
  const start = html.indexOf('{', at);
  if (start === -1) return {};
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
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as YearSummary;
        } catch {
          return {};
        }
      }
    }
  }
  return {};
}

/** Standard normal CDF (Abramowitz & Stegun 26.2.17), good to ~1e-7. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Estimate a percentile for an un-ranked metric from its season league
 * distribution: a z-score into the normal CDF, flipped for lower-is-better
 * metrics. Approximate (these stats aren't perfectly normal) but within a few
 * points of Savant's exact ranks; null when no usable distribution exists. */
function estimatePercentile(
  rawValue: number,
  stats: MetricStats | undefined,
  lowerBetter: boolean,
): number | null {
  if (!stats) return null;
  const mean = toNum(stats.avg_metric);
  const sd = toNum(stats.stddev_metric);
  if (mean === null || sd === null || sd <= 0) return null;
  let p = normalCdf((rawValue - mean) / sd) * 100;
  if (lowerBetter) p = 100 - p;
  return Math.max(0, Math.min(100, Math.round(p)));
}

// ---- Computed percentiles (Fast Swing %, HR) ------------------------------
// A few metrics have a raw value on the player page but no Savant `percent_rank_`
// field, so we rank them ourselves against a qualified-batter leaderboard
// distribution, fetched and cached the same way the percentile cards are.

interface Dist {
  year: number;
  values: number[]; // ascending
  updatedAt: string;
}

const distMem = new Map<string, Dist>();

/** Same freshness rule as the percentile cards: past seasons are immutable,
 * the current season re-fetches past the TTL. */
function distFresh(d: { year: number; updatedAt: string }): boolean {
  if (d.year !== CURRENT_SEASON) return true;
  return Date.now() - new Date(d.updatedAt).getTime() < CURRENT_TTL_MS;
}

/** A qualified-batter distribution for one leaderboard column, sorted ascending
 * and cached in memory and in the storage tier as `{name}-{year}.json`.
 * `transform` adapts the raw column to the units used on the player page. */
async function getDistribution(
  name: string,
  year: number,
  url: string,
  column: string,
  transform: (v: number) => number = (v) => v,
): Promise<number[]> {
  const key = `${name}-${year}`;
  const mem = distMem.get(key);
  if (mem && distFresh(mem)) return mem.values;

  const file = `${name}-${year}.json`;
  const raw = await readBlob(file);
  if (raw !== null) {
    try {
      const stored = JSON.parse(raw) as Dist;
      if (distFresh(stored)) {
        distMem.set(key, stored);
        return stored.values;
      }
    } catch {
      // corrupt entry — fall through and re-fetch
    }
  }

  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) {
    throw new Error(`${name} leaderboard returned ${res.status} ${res.statusText}`);
  }
  const records: Record<string, string>[] = parse(await res.text(), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  });
  const values: number[] = [];
  for (const r of records) {
    const v = toNum(r[column]);
    if (v !== null) values.push(transform(v));
  }
  values.sort((a, b) => a - b);

  const built: Dist = { year, values, updatedAt: new Date().toISOString() };
  distMem.set(key, built);
  await writeBlob(file, JSON.stringify(built));
  return values;
}

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

function hrLeaderboardUrl(year: number): string {
  const params = new URLSearchParams({
    year: String(year), type: 'batter', filter: '', min: 'q',
    selections: 'home_run,', sort: '1', sortDir: 'desc', csv: 'true',
  });
  return `https://baseballsavant.mlb.com/leaderboard/custom?${params.toString()}`;
}

/** `hard_swing_rate` on the leaderboard is a proportion; scale it to the percent
 * the player page's `fast_swing_rate` uses. */
const getFastSwingDist = (year: number) =>
  getDistribution('fast-swing', year, batTrackingUrl(year), 'hard_swing_rate', (v) => v * 100);

/** Actual home-run counts among qualified batters, to rank `home_run` against. */
const getHrDist = (year: number) =>
  getDistribution('hr-dist', year, hrLeaderboardUrl(year), 'home_run');

/** League percentile of `value` within a distribution: the share of the league
 * it beat, matching Savant's percent-rank convention. `lowerBetter` flips which
 * side of it counts as beaten (a pitcher's ERA is better for being smaller). */
function leaguePercentile(
  value: number,
  values: number[],
  lowerBetter = false,
): number | null {
  if (values.length === 0) return null;
  const beaten = values.filter((v) => (lowerBetter ? v > value : v < value)).length;
  return Math.max(0, Math.min(100, Math.round((beaten / values.length) * 100)));
}

// ---- Rows a pitcher's page shows but doesn't rank -------------------------
// Savant ranks a pitcher's xERA but not the ERA it estimates, and prints his
// first-pitch strike, edge, meatball, sword and HR/FB numbers with no rank at
// all. We rank each ourselves — against the same population Savant used for
// every other bar on the card. That population is not everyone who threw a
// pitch: the page publishes its size as `n` beside each metric in
// `metricSummaryStats` (363 in 2026), and taking that many pitchers off a
// leaderboard in plate-appearance order reproduces Savant's own
// xERA/xwOBA/BA/SLG ranks to the point, which is the check that the slice is
// the right one.

/** The columns we rank against, and the board each comes from: `expected` is the
 * expected-statistics leaderboard, the only one carrying ERA; `custom` is the
 * custom board, which serves every other column in one request. Both carry the
 * `pa` the slice sorts on. */
const POP_COLUMNS = {
  expected: ['era'],
  custom: [
    'home_run',
    'f_strike_percent',
    'edge_percent',
    'meatball_percent',
    'swords',
    // `flyballs` is carried only to derive HR/FB below — the board prints the
    // rate itself as an empty column — and is never ranked on its own.
    'flyballs',
    'hr_flyballs_percent',
  ],
} as const;

type PopBoard = keyof typeof POP_COLUMNS;

/** One pitcher's season on a leaderboard: `pa` plus that board's ranked columns.
 * A column is kept nullable rather than defaulted, so a blank cell drops out of
 * the distribution instead of ranking as a 0. */
interface PopRow {
  pa: number;
  values: Record<string, number | null>;
}
interface PopDist {
  year: number;
  rows: PopRow[];
  updatedAt: string;
}

function popUrl(board: PopBoard, year: number): string {
  // `min=1` keeps the whole league on either board; the PA slice below is what
  // narrows it to the population Savant ranked within.
  if (board === 'expected') {
    return (
      'https://baseballsavant.mlb.com/leaderboard/expected_statistics?' +
      `type=pitcher&year=${year}&position=&team=&filter=&min=1&csv=true`
    );
  }
  const params = new URLSearchParams({
    year: String(year),
    type: 'pitcher',
    filter: '',
    min: '1',
    selections: `pa,${POP_COLUMNS.custom.join(',')},`,
    sort: '1',
    sortDir: 'desc',
    csv: 'true',
  });
  return `https://baseballsavant.mlb.com/leaderboard/custom?${params.toString()}`;
}

const popMem = new Map<string, PopDist>();

/** Every pitcher's PA and ranked columns from one leaderboard, cached in memory
 * and in the storage tier on the same freshness rule as the other distributions.
 * Unsliced, because the population size comes from the player page, not here. */
async function getPopRows(board: PopBoard, year: number): Promise<PopRow[]> {
  const key = `${board}-${year}`;
  const mem = popMem.get(key);
  if (mem && distFresh(mem)) return mem.rows;

  const file = `pitcher-pop-${board}-${year}.json`;
  const raw = await readBlob(file);
  if (raw !== null) {
    try {
      const stored = JSON.parse(raw) as PopDist;
      if (distFresh(stored)) {
        popMem.set(key, stored);
        return stored.rows;
      }
    } catch {
      // corrupt entry — fall through and re-fetch
    }
  }

  const res = await fetch(popUrl(board, year), { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) {
    throw new Error(`${board} pitcher leaderboard returned ${res.status} ${res.statusText}`);
  }
  const records: Record<string, string>[] = parse(await res.text(), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  });
  const rows: PopRow[] = [];
  for (const r of records) {
    const pa = toNum(r.pa);
    if (pa === null) continue;
    const values: Record<string, number | null> = {};
    for (const c of POP_COLUMNS[board]) values[c] = toNum(r[c]);
    // HR/FB comes back blank for every pitcher on the custom board, so it's
    // derived from the two counts that back it — the same quotient the player
    // page prints.
    if (board === 'custom') {
      const { home_run: hr, flyballs: fb } = values;
      values.hr_flyballs_percent = hr !== null && fb ? (hr / fb) * 100 : null;
    }
    rows.push({ pa, values });
  }

  const built: PopDist = { year, rows, updatedAt: new Date().toISOString() };
  popMem.set(key, built);
  await writeBlob(file, JSON.stringify(built));
  return rows;
}

/** The `n` most-worked pitchers' values for one column, ascending — the slice
 * Savant ranks within, less anyone the column is blank for. */
function popDistribution(rows: PopRow[], n: number, column: string): number[] {
  return [...rows]
    .sort((a, b) => b.pa - a.pa)
    .slice(0, n)
    .map((r) => r.values[column])
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
}

/** A row the player page carries a value for but no `percent_rank_` field:
 * ranked here against `column`'s distribution, then spliced into `section` —
 * ahead of `before` when it has an expected twin there (so the client pairs the
 * two into a dumbbell), else appended. */
interface ComputedDef {
  key: string;
  label: string;
  raw: string; // field on the player's statcast row
  fmt: Fmt;
  column: string; // leaderboard column holding the league's values
  section: string; // section title in PITCHER_SECTIONS
  before?: string;
  lowerBetter?: boolean;
}

const PITCHER_COMPUTED: ComputedDef[] = [
  // The two actuals whose expected twins Savant does rank.
  { key: 'era', label: 'ERA', raw: 'era', fmt: 'dec2', column: 'era', section: 'Value', before: 'xera', lowerBetter: true },
  { key: 'hr', label: 'HR', raw: 'home_run', fmt: 'int', column: 'home_run', section: 'Value', before: 'xhr', lowerBetter: true },
  // Command: how often he starts a hitter 0-1, how much of the plate he works
  // the edges of, and how often he leaves one over the middle.
  { key: 'f_strike', label: 'First-Pitch Strike %', raw: 'f_strike_percent', fmt: 'dec1', column: 'f_strike_percent', section: 'Plate Discipline' },
  { key: 'edge', label: 'Edge %', raw: 'edge_percent', fmt: 'dec1', column: 'edge_percent', section: 'Plate Discipline' },
  { key: 'meatball', label: 'Meatball %', raw: 'meatball_percent', fmt: 'dec1', column: 'meatball_percent', section: 'Plate Discipline', lowerBetter: true },
  // A sword is a swing so far off it comes apart mid-cut — a count, not a rate,
  // so it ranks like HR does.
  { key: 'swords', label: 'Swords', raw: 'swords', fmt: 'int', column: 'swords', section: 'Swings Against' },
  { key: 'hr_fb', label: 'HR/FB %', raw: 'hr_flyballs_percent', fmt: 'dec1', column: 'hr_flyballs_percent', section: 'Batted Ball', lowerBetter: true },
];

/** The computed row for one definition, or null if the pitcher has no value for
 * it. An empty distribution (its leaderboard was unavailable) costs the row its
 * percentile and nothing else. */
function computedMetric(row: StatcastRow, def: ComputedDef, values: number[]): PercentileMetric | null {
  const raw = toNum(row[def.raw]);
  if (raw === null) return null;
  return {
    key: def.key,
    label: def.label,
    percentile: leaguePercentile(raw, values, !!def.lowerBetter),
    value: formatValue(raw, def.fmt),
  };
}

/** The computed Fast Swing % row, or null if the player has no fast-swing data. */
function fastSwingMetric(row: StatcastRow, sortedRates: number[]): PercentileMetric | null {
  const raw = toNum(row.fast_swing_rate);
  if (raw === null) return null;
  return {
    key: 'fast_swing',
    label: 'Fast Swing %',
    percentile: leaguePercentile(raw, sortedRates),
    value: formatValue(raw, 'dec1'),
  };
}

/** The computed actual-HR row, or null if the player has no HR data. Pairs with
 * the scraped xHR row into a dumbbell on the client. */
function hrMetric(row: StatcastRow, hrCounts: number[]): PercentileMetric | null {
  const raw = toNum(row.home_run);
  if (raw === null) return null;
  return {
    key: 'hr',
    label: 'HR',
    percentile: leaguePercentile(raw, hrCounts),
    value: formatValue(raw, 'int'),
  };
}

/** The batter's two computed rows, and where each lands. Unlike the pitcher's
 * they aren't ranked off a shared leaderboard blob — each has its own board and
 * so its own builder — but they're spliced the same way: `before` sits a row
 * ahead of its expected twin (so the client pairs the two into a dumbbell),
 * `after` follows the row it belongs beside, and a missing anchor appends to the
 * section it names. */
interface BatterComputedDef {
  section: string; // section title in SECTIONS
  build: (row: StatcastRow, computed: Computed) => PercentileMetric | null;
  before?: string;
  after?: string;
}

const BATTER_COMPUTED: BatterComputedDef[] = [
  { section: 'Batting', before: 'xhr', build: (row, c) => hrMetric(row, c.hrCounts) },
  { section: 'Swing', after: 'bat_speed', build: (row, c) => fastSwingMetric(row, c.fastSwingRates) },
];

/** The league distributions behind the rows we rank ourselves, each empty when
 * its leaderboard was unavailable (which costs that one bar its percentile). */
interface Computed {
  fastSwingRates: number[]; // batter
  hrCounts: number[]; // batter
  pitcherDists: Record<string, number[]>; // pitcher, keyed by leaderboard column
}

function buildSections(
  row: StatcastRow,
  dist: Record<string, MetricStats>,
  defs: SectionDef[],
  kind: 'batter' | 'pitcher',
  computed: Computed,
): PercentileSection[] {
  const sections: PercentileSection[] = [];
  for (const sec of defs) {
    const metrics: PercentileMetric[] = [];
    for (const m of sec.metrics) {
      let percentile = toPercentile(row[m.pct]);
      const value = formatValue(row[m.raw], m.fmt);
      // Savant left this player un-ranked but still has a value: estimate the
      // percentile from the season league distribution, the way its own slider
      // does. Marked `estimated` so the card can flag it as approximate.
      let estimated = false;
      if (percentile === null && value !== null) {
        const rawVal = toNum(row[m.raw]);
        const est = rawVal === null ? null : estimatePercentile(rawVal, dist[m.raw], !!m.lowerBetter);
        if (est !== null) {
          percentile = est;
          estimated = true;
        }
      }
      // Drop rows the player simply has no data for (e.g. fielding value for a
      // full-time DH) so the card doesn't fill with empty tracks.
      if (percentile === null && value === null) continue;
      metrics.push({ key: m.key, label: m.label, percentile, value, ...(estimated && { estimated }) });
    }
    if (kind === 'batter') {
      // Actual HR (ahead of the scraped xHR, so the client pairs the two into an
      // expected/actual dumbbell) and Fast Swing % (beside Bat Speed, the other
      // bat-tracking row) are ranked against a leaderboard rather than scraped.
      for (const def of BATTER_COMPUTED) {
        if (def.section !== sec.title) continue;
        const metric = def.build(row, computed);
        if (!metric) continue;
        const at = metrics.findIndex((m) => m.key === (def.before ?? def.after));
        if (at === -1) metrics.push(metric);
        else metrics.splice(def.before ? at : at + 1, 0, metric);
      }
    }
    if (kind === 'pitcher') {
      // Rows Savant shows but doesn't rank are computed rather than scraped.
      // Each goes just ahead of its expected twin, so the client pairs the two
      // into a dumbbell the way the batter card pairs HR with xHR; the rest
      // land at the end of the section they belong to.
      for (const def of PITCHER_COMPUTED) {
        if (def.section !== sec.title) continue;
        const metric = computedMetric(row, def, computed.pitcherDists[def.column] ?? []);
        if (!metric) continue;
        const at = def.before ? metrics.findIndex((m) => m.key === def.before) : -1;
        if (at === -1) metrics.push(metric);
        else metrics.splice(at, 0, metric);
      }
    }
    if (metrics.length > 0) sections.push({ title: sec.title, metrics });
  }
  return sections;
}

const memCache = new Map<string, PlayerPercentiles>();

function cacheFile(playerId: number, year: number, kind: 'batter' | 'pitcher'): string {
  return `percentiles-${kind}-${playerId}-${year}.json`;
}

/** Bumped whenever the card gains or drops rows. A past season's card is kept
 * forever, so without this a stored one would be served for good in the shape
 * it was scraped in — v2 added the pitcher card's actual-vs-expected rows, v3
 * widened the pitcher card (run value, OBP/ISO/HR pairs, BABIP, curve spin, run
 * value by pitch group, command rates, swings against, more batted ball), v4
 * split the batter card's one long Batting section into Batting / Batted Ball /
 * Swing / Plate Discipline. */
const CARD_VERSION = 4;

/** A cached card is fresh if it was built by this version of the card and is
 * either a past season (immutable) or, for the current season, younger than the
 * TTL. */
function isFresh(p: PlayerPercentiles, year: number): boolean {
  if (p.version !== CARD_VERSION) return false;
  if (year !== CURRENT_SEASON) return true;
  return Date.now() - new Date(p.updatedAt).getTime() < CURRENT_TTL_MS;
}

async function readStoredCache(
  playerId: number,
  year: number,
  kind: 'batter' | 'pitcher',
): Promise<PlayerPercentiles | null> {
  const raw = await readBlob(cacheFile(playerId, year, kind));
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as PlayerPercentiles;
  } catch {
    return null;
  }
}

async function scrape(
  playerId: number,
  year: number,
  kind: 'batter' | 'pitcher',
): Promise<PlayerPercentiles> {
  // The slug doesn't matter — Savant 301-redirects an id-only slug to the
  // canonical player page.
  const statType = kind === 'pitcher' ? 'pitching' : 'hitting';
  const url = `https://baseballsavant.mlb.com/savant-player/x-${playerId}?stats=statcast-r-${statType}-mlb`;
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) {
    throw new Error(`Baseball Savant returned ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const row = pickRow(extractStatcast(html), year);
  if (!row) {
    throw new Error(`No Statcast percentile data for ${playerId} in ${year}`);
  }
  const dist = extractMetricSummary(html)[String(year)] ?? {};
  const defs = kind === 'pitcher' ? PITCHER_SECTIONS : SECTIONS;
  // Fast Swing % and actual HR (batter), and every `PITCHER_COMPUTED` row, are
  // ranked against a leaderboard rather than read off the page. A failed fetch
  // leaves those distributions empty, which costs their bars a percentile and
  // nothing else.
  const computed: Computed = { fastSwingRates: [], hrCounts: [], pitcherDists: {} };
  if (kind === 'batter') {
    try {
      computed.fastSwingRates = await getFastSwingDist(year);
    } catch (err) {
      console.error(`Bat-tracking leaderboard unavailable for ${year}:`, err);
    }
    try {
      computed.hrCounts = await getHrDist(year);
    } catch (err) {
      console.error(`HR leaderboard unavailable for ${year}:`, err);
    }
  } else {
    // Savant publishes the size of its ranking population beside every metric —
    // slice each leaderboard to match, so these bars rank against the same
    // pitchers the ones above and below them do. A board that fails takes only
    // its own columns down with it, hence one try per board.
    const n = toNum(dist.xera?.n) ?? toNum(dist.woba?.n);
    for (const board of Object.keys(POP_COLUMNS) as PopBoard[]) {
      try {
        const rows = await getPopRows(board, year);
        for (const column of POP_COLUMNS[board]) {
          computed.pitcherDists[column] = popDistribution(rows, n ?? rows.length, column);
        }
      } catch (err) {
        console.error(`Pitcher ${board} leaderboard unavailable for ${year}:`, err);
      }
    }
  }
  return {
    playerId,
    year,
    version: CARD_VERSION,
    sections: buildSections(row, dist, defs, kind, computed),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * A player's Savant-style percentile-ranking card for a season. Cached in
 * memory and in the storage tier; the current season re-scrapes past a TTL,
 * past seasons are kept forever.
 */
export async function getPercentiles(
  playerId: number,
  year = CURRENT_SEASON,
  kind: 'batter' | 'pitcher' = 'batter',
): Promise<PlayerPercentiles> {
  const key = `${kind}-${playerId}-${year}`;
  const mem = memCache.get(key);
  if (mem && isFresh(mem, year)) return mem;

  const stored = await readStoredCache(playerId, year, kind);
  if (stored && isFresh(stored, year)) {
    memCache.set(key, stored);
    return stored;
  }

  const fresh = await scrape(playerId, year, kind);
  memCache.set(key, fresh);
  await writeBlob(cacheFile(playerId, year, kind), JSON.stringify(fresh));
  return fresh;
}
