import { parse } from 'csv-parse/sync';
import { readGzipBlob, writeGzipBlob } from './storage.js';
import { downloadDayCsv, downloadPullCsv } from './savant.js';
import { addDays, baseballToday } from './etDate.js';
import { mapLimit } from './limit.js';
import type { PlayerKind } from './types.js';

/**
 * The Statcast half of the research board, for a **window** rather than a season.
 *
 * Savant publishes no windowed leaderboard: `expected_statistics` and `custom`
 * take a `year` and ignore every date-range spelling there is (checked — the
 * CSV comes back byte-identical). The pitch-level `statcast_search` export does
 * take a range, but it caps at **25,000 rows**, which a league-wide week
 * (~30,000 pitches) silently exceeds — you get a truncated board with no error.
 *
 * So a window is built the only way that stays correct: **one day at a time**,
 * from the same per-date CSV `savant.ts` already downloads and keeps forever,
 * reduced immediately to per-player counts. The counts are what's cached, not
 * the CSV — a day is ~3.3MB of text and ~2KB of counts, so a 60-day board sums
 * sixty small blobs instead of re-parsing 200MB every six hours.
 *
 * One file feeds **both** boards: every pitch row carries a `batter` and a
 * `pitcher` id, so the same parse yields the batter's contact quality and the
 * pitcher's contact allowed.
 */

// ---- Counts ----------------------------------------------------------------
//
// Everything here is a **sum**, never a rate. That is the whole reason a window
// can be assembled from days at all: rates don't add, and averaging sixty daily
// barrel rates would weight a one-ball afternoon the same as a four-hit night.

export interface StatcastCounts {
  bip: number; // balls in play — the denominator for the contact group
  evSum: number;
  evN: number; // batted balls with a tracked exit velocity (a few are missed)
  laSum: number;
  laN: number;
  barrels: number;
  hardHit: number; // 95+ mph
  sweetSpot: number; // launch angle 8-32°
  gb: number;
  ld: number;
  fb: number;
  pu: number; // popups — folded into fly balls for xFIP, as Savant's mix does
  swings: number;
  whiffs: number;
  ozPitches: number; // pitches outside the zone
  ozSwings: number; // …swung at, which is the chase rate
  firstPitches: number; // 0-0 counts
  firstStrikes: number;
  paDen: number; // wOBA denominator — PA less the events wOBA doesn't count
  xwobaSum: number;
  xbaSum: number;
  xslgSum: number;
  /** Pulled batted balls that were not ground balls — the numerator of pull
   *  air rate. Off the day's `hfPull=Pull` export rather than off the pitch
   *  rows, since Savant's own direction is nowhere in them; see `pullFor`. */
  pullAir: number;
  /** The batted balls those `pullAir` were counted out of. Normally identical
   *  to `bip`, and 0 for a day whose pull export could not be read — which is
   *  what keeps the rate honest over a window with a hole in it: that day
   *  contributes to neither half rather than diluting the numerator. */
  pullBip: number;
  /** Bat speed over every tracked non-bunt swing, and how many there were.
   *  These two are ordinary sums; the histogram below is what makes them
   *  usable, and the comment on `swingBins` says why. */
  batSpeedSum: number;
  batSpeedN: number;
  /**
   * Bat speed is the one metric on this board whose published figure is **not
   * a mean over everything tracked**, and so the one that cannot be assembled
   * from two running sums. Savant averages *competitive* swings only — bunts
   * out, and then the **slowest 10% of that player's own swings** dropped — so
   * the cut is a percentile of a distribution, which is exactly the shape a
   * day-at-a-time sum cannot carry.
   *
   * So a day stores the distribution as well: `speed floor in mph → how many`,
   * which adds like everything else here. `reduce` then walks the summed bins
   * from the bottom, drops the slowest 10%, and subtracts their contribution
   * from `batSpeedSum` using each bin's midpoint — the one approximation in the
   * file, and a measured one. Against Savant's own season board, reconstructed
   * from all 139 daily exports: **median error 0.1 mph, p90 0.2, max 0.9** over
   * the 480 batters with 100+ swings, and byte-identical to keeping the exact
   * swing list (which scores 0.1 / 0.2 / 0.9 as well). One-mph bins are
   * therefore free precision-wise and cost ~8.5KB gzipped a day against the
   * blob's own ~13KB.
   *
   * **The rule is Savant's, applied to the window** rather than read from it:
   * they publish no windowed bat speed to check a 7-day figure against, so
   * "the slowest 10% of his swings *in these seven days*" is the honest
   * analogue of what their season number means, not an estimate of a number
   * they publish.
   */
  swingBins: Record<string, number>;
}

/** **Module-local again.** These three (`empty`, `tally`, `toStatcast`) were
 *  exported for `playerSplits.ts`, which tallied one player's own season export
 *  into the same counts a day export is reduced to — so a cut of a span and the
 *  span itself were the same arithmetic over the same pitch rows rather than two
 *  definitions of a barrel that happened to agree today. That file is gone with
 *  the cut controls it fed, and an export nobody imports is an invitation to a
 *  second caller that has not read this file. */
function empty(): StatcastCounts {
  return {
    bip: 0, evSum: 0, evN: 0, laSum: 0, laN: 0, barrels: 0, hardHit: 0,
    sweetSpot: 0, gb: 0, ld: 0, fb: 0, pu: 0, swings: 0, whiffs: 0,
    ozPitches: 0, ozSwings: 0, firstPitches: 0, firstStrikes: 0,
    paDen: 0, xwobaSum: 0, xbaSum: 0, xslgSum: 0, pullAir: 0, pullBip: 0,
    batSpeedSum: 0, batSpeedN: 0, swingBins: {},
  };
}

export function addCounts(a: StatcastCounts, b: StatcastCounts): void {
  a.bip += b.bip; a.evSum += b.evSum; a.evN += b.evN; a.laSum += b.laSum;
  a.laN += b.laN; a.barrels += b.barrels; a.hardHit += b.hardHit;
  a.sweetSpot += b.sweetSpot; a.gb += b.gb; a.ld += b.ld; a.fb += b.fb;
  a.pu += b.pu; a.swings += b.swings; a.whiffs += b.whiffs;
  a.ozPitches += b.ozPitches; a.ozSwings += b.ozSwings;
  a.firstPitches += b.firstPitches; a.firstStrikes += b.firstStrikes;
  a.paDen += b.paDen; a.xwobaSum += b.xwobaSum; a.xbaSum += b.xbaSum;
  a.xslgSum += b.xslgSum; a.pullAir += b.pullAir; a.pullBip += b.pullBip;
  a.batSpeedSum += b.batSpeedSum; a.batSpeedN += b.batSpeedN;
  for (const [bin, n] of Object.entries(b.swingBins ?? {})) {
    a.swingBins[bin] = (a.swingBins[bin] ?? 0) + n;
  }
}

// ---- Classifying one pitch row ---------------------------------------------
//
// Every test below was read off a real day's export rather than assumed, and
// the league-wide totals they produce land where they should (87.0 mph, 7.2%
// barrels, 35.6% hard-hit, .305 xwOBA on 2026-08-07).

/** A swing is any description that only happens when the bat moved. Savant has
 *  no `swing` flag, so this list *is* the definition. `foul_tip` is a swing and
 *  a miss both — the ball reached the mitt untouched by anything but a graze. */
const SWINGS = new Set([
  'hit_into_play', 'foul', 'swinging_strike', 'swinging_strike_blocked',
  'foul_tip', 'foul_bunt', 'missed_bunt', 'bunt_foul_tip',
]);
const WHIFFS = new Set([
  'swinging_strike', 'swinging_strike_blocked', 'foul_tip', 'missed_bunt',
  'bunt_foul_tip',
]);
/** Anything not called a ball. Used for first-pitch strike, so a ball put in
 *  play or fouled off counts — the batter did not get ahead. */
const BALLS = new Set(['ball', 'blocked_ball', 'pitchout', 'hit_by_pitch']);

/**
 * Savant leaves bunts out of **average exit velocity and launch angle** and
 * keeps them in the batted-ball denominators — a distinction worth getting
 * right, because it is the whole difference between matching the published
 * numbers and not. Measured over the season against Savant's own board: with
 * bunts in the average, EV ran 0.76 mph light (median error 0.30, worst 8.4);
 * with them out, the median error is 0.027 mph and the mean bias 0.034. Barrel
 * and hard-hit rate, which count bunts in their denominator, matched to the
 * hundredth *before* this and are deliberately left alone.
 *
 * There is no bunt column in the export — `bb_type` files a bunt as an ordinary
 * ground ball — so the play description is the only signal there is.
 */
function isBunt(r: Record<string, string>): boolean {
  return (r.des ?? '').toLowerCase().includes('bunt');
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Exported with `empty` above, and for the same reason — see there. */
function tally(into: StatcastCounts, r: Record<string, string>): void {
  const desc = r.description ?? '';

  // Discipline. `zone` is 1-9 inside and 11-14 outside — Savant's own grid.
  const zone = num(r.zone);
  if (zone !== null && zone >= 11) {
    into.ozPitches++;
    if (SWINGS.has(desc)) into.ozSwings++;
  }
  if (SWINGS.has(desc)) {
    into.swings++;
    if (WHIFFS.has(desc)) into.whiffs++;
  }

  // Bat tracking. `bat_speed` is filled on the swings Hawk-Eye measured, which
  // is most but not all of them, so this has a denominator of its own rather
  // than riding on `swings`. Bunts are out, as they are from EV and LA above
  // and for the same reason: Savant leaves them out of the average.
  const speed = num(r.bat_speed);
  if (speed !== null && !isBunt(r)) {
    into.batSpeedSum += speed;
    into.batSpeedN++;
    const bin = String(Math.floor(speed));
    into.swingBins[bin] = (into.swingBins[bin] ?? 0) + 1;
  }
  if (num(r.balls) === 0 && num(r.strikes) === 0) {
    into.firstPitches++;
    if (!BALLS.has(desc)) into.firstStrikes++;
  }

  // Contact. `bb_type` is set on exactly the batted balls, and
  // `launch_speed_angle` is Savant's own 1-6 classification, 6 being a barrel —
  // so a barrel is read off the export rather than re-derived from EV and angle.
  const bb = r.bb_type ?? '';
  if (bb) {
    into.bip++;
    const bunt = isBunt(r);
    const ev = num(r.launch_speed);
    if (ev !== null) {
      if (!bunt) {
        into.evSum += ev;
        into.evN++;
      }
      if (ev >= 95) into.hardHit++;
    }
    const la = num(r.launch_angle);
    if (la !== null) {
      if (!bunt) {
        into.laSum += la;
        into.laN++;
      }
      if (la >= 8 && la <= 32) into.sweetSpot++;
    }
    if (num(r.launch_speed_angle) === 6) into.barrels++;
    if (bb === 'ground_ball') into.gb++;
    else if (bb === 'line_drive') into.ld++;
    else if (bb === 'fly_ball') into.fb++;
    else if (bb === 'popup') into.pu++;
  }

  // Value. Savant fills `estimated_woba_using_speedangle` on *every* wOBA event,
  // not just the batted ones — a strikeout carries 0 and a walk .697636, the
  // standard weights — so the expected line is a plain sum over the rows whose
  // `woba_denom` is set, with no need to special-case the non-contact events.
  const den = num(r.woba_denom);
  if (den) {
    into.paDen += den;
    into.xwobaSum += num(r.estimated_woba_using_speedangle) ?? 0;
    into.xbaSum += num(r.estimated_ba_using_speedangle) ?? 0;
    into.xslgSum += num(r.estimated_slg_using_speedangle) ?? 0;
  }
}

// ---- One day ---------------------------------------------------------------

/**
 * One day, tallied four ways off **one** parse of the day's export.
 *
 * The two player axes were here first and are what the research board's windows
 * are summed from. The two **club** axes are the same rows bucketed by the
 * abbreviation on them instead of the id — `batterTeam` under the batting side,
 * `pitcherTeam` under the side that threw the pitch — and they are here rather
 * than in a file of their own for the reason `parseDay` already gives about the
 * batter and the pitcher: the day CSV is 3.3MB and the expensive part is
 * reading it, so a second pass over the same rows to answer a second question
 * about them would double the one cost that matters.
 *
 * A club key is the export's own `home_team`/`away_team` abbreviation, which is
 * byte-identical to MLB's for all thirty (measured in `teamHitting.ts`, which
 * keys the same way off the same file).
 */
export interface DayCounts {
  batter: Record<string, StatcastCounts>;
  pitcher: Record<string, StatcastCounts>;
  /** The club **at bat**, keyed by abbreviation. */
  batterTeam: Record<string, StatcastCounts>;
  /** The club **in the field**, keyed by abbreviation — its pitching staff. */
  pitcherTeam: Record<string, StatcastCounts>;
}

/** Which of the four axes one kind's players and one kind's clubs live on, so
 *  the two readers below need no `if` of their own. */
const TEAM_AXIS: Record<PlayerKind, 'batterTeam' | 'pitcherTeam'> = {
  batter: 'batterTeam',
  pitcher: 'pitcherTeam',
};

/** Every axis a day holds, for the passes that treat them alike. */
const AXES = ['batter', 'pitcher', 'batterTeam', 'pitcherTeam'] as const;

/** `-v5`: bumped when bunts came out of the EV/LA averages (v2), again when
 *  `pullAir`/`pullBip` were added (v3), and again for bat speed's two sums and
 *  its histogram (v4) — a stored blob holds *sums*, so a stale one would keep
 *  serving the pre-fix numbers, and it deserializes with any field added since
 *  it missing. Bump this whenever `StatcastCounts` gains one, exactly as the
 *  day snapshot and the research board itself do. A bump costs a re-parse off
 *  the day CSVs this file keeps forever, not a re-download.
 *
 *  **v5 is the two club axes arriving.** A v4 blob deserializes perfectly with
 *  `batterTeam` and `pitcherTeam` **missing**, which is the exact fault the rule
 *  names: the team board would read `undefined` off every settled day and serve
 *  thirty rows of dashes for as long as the blobs lived — which, these having no
 *  TTL at all, is for ever. */
const dayKey = (date: string) => `statcast-counts-${date}-v5.json`;

const dayMem = new Map<string, DayCounts>();
const dayInFlight = new Map<string, Promise<DayCounts>>();

function parseCsv(csv: string): Record<string, string>[] {
  return parse(csv, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  }) as Record<string, string>[];
}

/**
 * Which club was batting and which was pitching on this row.
 *
 * `inning_topbot` is the away side's half when it reads `Top`, so the batting
 * club is the away one there and the home one otherwise — the same test
 * `teamHitting.ts::parseDay` makes off the same three columns, and the pitching
 * club is simply the other name. A row missing either abbreviation is left out
 * of both, which is the join-fails-to-null rule: a pitch we cannot place is not
 * a pitch to file under a guess.
 */
function sides(r: Record<string, string>): { bat: string; pitch: string } | null {
  const top = r.inning_topbot === 'Top';
  const bat = top ? r.away_team : r.home_team;
  const pitch = top ? r.home_team : r.away_team;
  return bat && pitch ? { bat, pitch } : null;
}

function parseDay(csv: string): DayCounts {
  const out: DayCounts = { batter: {}, pitcher: {}, batterTeam: {}, pitcherTeam: {} };
  for (const r of parseCsv(csv)) {
    for (const kind of ['batter', 'pitcher'] as const) {
      const id = r[kind];
      if (!id) continue;
      const bucket = out[kind];
      tally((bucket[id] ??= empty()), r);
    }
    // The same row again under the two clubs. `tally` is called once per bucket
    // rather than once and copied, because it *adds into* a bucket — which is
    // the whole reason a club's line comes out identical in shape to a player's
    // and can be handed to the same `toStatcast` at the end.
    const side = sides(r);
    if (!side) continue;
    tally((out.batterTeam[side.bat] ??= empty()), r);
    tally((out.pitcherTeam[side.pitch] ??= empty()), r);
  }
  return out;
}

/**
 * Fold the day's pulled batted balls into counts already built from the full
 * export. The pull file is Savant's own classification and nothing else is: no
 * spray-angle rule over `hc_x`/`hc_y` reproduces it, which was measured to
 * exhaustion (see `research.ts::enrichWindow` and **Data sources**).
 *
 * `pullBip` is copied from `bip` rather than counted, because the pull export
 * is a **subset** of the very rows `bip` was tallied from — so the two always
 * describe the same population, and a player with no pulled ball still gets his
 * denominator.
 */
function addPull(day: DayCounts, csv: string): void {
  for (const axis of AXES) {
    for (const counts of Object.values(day[axis])) counts.pullBip = counts.bip;
  }
  for (const r of parseCsv(csv)) {
    // Every row of this export is a batted ball (checked: 781 of 781 on a real
    // day), but the guard costs nothing and keeps the rule stated where it is
    // read: pull *air* is everything pulled that stayed off the ground.
    if (!r.bb_type || r.bb_type === 'ground_ball') continue;
    for (const kind of ['batter', 'pitcher'] as const) {
      const id = r[kind];
      if (!id) continue;
      const bucket = day[kind];
      (bucket[id] ??= empty()).pullAir++;
    }
    const side = sides(r);
    if (!side) continue;
    (day.batterTeam[side.bat] ??= empty()).pullAir++;
    (day.pitcherTeam[side.pitch] ??= empty()).pullAir++;
  }
}

/**
 * A finished day's counts never change, so they are cached without a TTL — the
 * same reasoning that lets `savant.ts` keep a past date's CSV forever. Today is
 * the exception and is deliberately **not** stored: its games are still being
 * played, and a blob written at 4pm would be served as complete all evening.
 *
 * **A day whose pull export fails is neither memoized nor stored**, which is
 * the one place this parts from "cache a settled day forever". The main export
 * throwing is fatal for the day and always was — `windowStatcast` catches per
 * day and skips it — but the pull half is one column against fifteen, so it
 * costs its own numbers and leaves the rest standing. Not caching it is what
 * keeps that from being permanent: the next reader re-attempts the small pull
 * request (the day CSV itself being on disk), where a stored `pullBip: 0` would
 * have quietly excluded that day from the rate for ever.
 *
 * **Exported for a second reader**, `leagueWoba.ts`, which wants two numbers a
 * day out of the same tally rather than a second pass over the same CSV — the
 * rule this file already applies to the two boards it feeds.
 */
export async function dayCounts(date: string): Promise<DayCounts> {
  const hit = dayMem.get(date);
  if (hit) return hit;
  const running = dayInFlight.get(date);
  if (running) return running;

  const p = (async () => {
    const settled = date < baseballToday();
    if (settled) {
      const stored = await readGzipBlob(dayKey(date));
      if (stored !== null) {
        const parsed = JSON.parse(stored) as DayCounts;
        dayMem.set(date, parsed);
        return parsed;
      }
    }
    const counts = parseDay(await downloadDayCsv(date));
    let pulled = false;
    try {
      addPull(counts, await downloadPullCsv(date));
      pulled = true;
    } catch (err) {
      console.error(`Statcast window: ${date} pull-direction export unavailable:`, err);
    }
    if (settled && pulled) {
      dayMem.set(date, counts);
      await writeGzipBlob(dayKey(date), JSON.stringify(counts));
    }
    return counts;
  })();
  dayInFlight.set(date, p);
  try {
    return await p;
  } finally {
    dayInFlight.delete(date);
  }
}

// ---- A window --------------------------------------------------------------

/** The rates a window yields, in the shape `ResearchRow` wants them. Two of the
 *  board's Statcast columns are **absent by nature** rather than by failure:
 *  `sprintSpeed` is a separate measurement that never appears in a pitch row,
 *  and `xera` is Statcast's own model, which only Savant can publish. Both stay
 *  null on a window, and the client dashes them like any other missing value.
 *  `pullAirRate` was a third until Savant's `hfPull` filter turned up; it is a
 *  real number here now. */
export interface WindowStatcast {
  xba: number | null;
  xslg: number | null;
  xwoba: number | null;
  exitVelocity: number | null;
  launchAngle: number | null;
  barrelRate: number | null;
  hardHitRate: number | null;
  sweetSpotRate: number | null;
  gbRate: number | null;
  ldRate: number | null;
  fbRate: number | null;
  pullAirRate: number | null;
  whiffRate: number | null;
  chaseRate: number | null;
  firstPitchStrikeRate: number | null;
  batSpeed: number | null;
  /** Fly balls plus popups — not shown, and carried for the same reason the
   *  season board carries it: xFIP needs his fly-ball count. */
  flyBalls: number;
}

/**
 * Savant's competitive-swing average, off the summed histogram: drop the
 * slowest 10% of his swings in the window and average what is left.
 *
 * The dropped swings' contribution is subtracted from the exact sum using each
 * bin's midpoint, so only the swings actually thrown away are approximated and
 * the retained ones keep their real values. The share is **rounded** rather
 * than floored — measured against Savant's board, rounding reproduces 308 of
 * 630 batters exactly against floor's 290, with the same 0.1 median either way.
 */
const NON_COMPETITIVE = 0.1;

function competitiveBatSpeed(c: StatcastCounts): number | null {
  const n = c.batSpeedN;
  if (n <= 0) return null;
  const drop = Math.round(n * NON_COMPETITIVE);
  const keep = n - drop;
  if (keep <= 0) return null;
  let dropped = 0;
  let left = drop;
  const bins = Object.keys(c.swingBins ?? {})
    .map(Number)
    .sort((a, b) => a - b);
  for (const bin of bins) {
    if (left <= 0) break;
    const take = Math.min(c.swingBins[String(bin)], left);
    dropped += take * (bin + 0.5);
    left -= take;
  }
  return (c.batSpeedSum - dropped) / keep;
}

const rate = (n: number, d: number): number | null => (d > 0 ? (100 * n) / d : null);
const mean = (sum: number, n: number): number | null => (n > 0 ? sum / n : null);
const r3 = (v: number | null): number | null => (v === null ? null : Math.round(v * 1000) / 1000);
const r1 = (v: number | null): number | null => (v === null ? null : Math.round(v * 10) / 10);

function toStatcast(c: StatcastCounts): WindowStatcast {
  return {
    xba: r3(mean(c.xbaSum, c.paDen)),
    xslg: r3(mean(c.xslgSum, c.paDen)),
    xwoba: r3(mean(c.xwobaSum, c.paDen)),
    exitVelocity: r1(mean(c.evSum, c.evN)),
    launchAngle: r1(mean(c.laSum, c.laN)),
    barrelRate: r1(rate(c.barrels, c.bip)),
    hardHitRate: r1(rate(c.hardHit, c.bip)),
    sweetSpotRate: r1(rate(c.sweetSpot, c.bip)),
    gbRate: r1(rate(c.gb, c.bip)),
    ldRate: r1(rate(c.ld, c.bip)),
    fbRate: r1(rate(c.fb + c.pu, c.bip)),
    // Over `pullBip` rather than `bip`: they are the same number on every day
    // whose pull export was read, and differ only by excluding a day it wasn't.
    pullAirRate: r1(rate(c.pullAir, c.pullBip)),
    whiffRate: r1(rate(c.whiffs, c.swings)),
    chaseRate: r1(rate(c.ozSwings, c.ozPitches)),
    firstPitchStrikeRate: r1(rate(c.firstStrikes, c.firstPitches)),
    batSpeed: r1(competitiveBatSpeed(c)),
    flyBalls: c.fb + c.pu,
  };
}

/** The dates a window covers, newest last, ending **yesterday**: today's games
 *  are mid-flight and Savant lags the live feed by a day, so including it would
 *  add a partial day to every window and a day of nothing to the ones read in
 *  the morning. */
export function windowDates(days: number): string[] {
  const end = addDays(baseballToday(), -1);
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(addDays(end, -i));
  return out;
}

/**
 * Per-player Statcast over the last `days` days. A day that can't be fetched is
 * **skipped, not fatal** — the same rule the season board's Savant half follows,
 * and an off-day (the All-Star break, a washed-out Monday) legitimately has no
 * export at all. `mapLimit` bounds the fan-out at the CSV concurrency the rest
 * of the server uses; sixty 3.3MB downloads at once is not a thing to do to
 * Savant or to the heap.
 */
export async function windowStatcast(
  kind: PlayerKind,
  days: number,
): Promise<Map<number, WindowStatcast>> {
  const totals = await sumDays(kind, days);
  const out = new Map<number, WindowStatcast>();
  for (const [id, counts] of totals) out.set(Number(id), toStatcast(counts));
  return out;
}

/**
 * **The same window, summed by club rather than by player** — thirty rows off
 * the very rows the six hundred were counted from.
 *
 * It is the *same* function underneath (`sumDays` picks an axis; `toStatcast`
 * turns the sums into rates), which is the whole argument for it: a club's
 * barrel rate is then barrels over batted balls computed by the one routine
 * that computes a player's, rather than a second definition that agrees today.
 * A club key is an abbreviation, since that is what the export carries.
 *
 * Unlike the player board, **this is how a club's season is built too**, not
 * only its windows — Savant's `expected_statistics` and `statcast` boards do
 * answer for `type=batter-team`, but neither its `custom` board nor its
 * `batted-ball` one does (probed: `type=batter-team` on `custom` returns the
 * 637-row *player* board, and on `batted-ball` returns 633 rows with the id and
 * name columns blank), so whiff, chase, first-pitch strike, the batted-ball
 * mix, pull air and bat speed are reachable for a club by no leaderboard at
 * all. Summing the days answers every column on every span with one rule, where
 * a leaderboard season beside a summed window would have given the reader a
 * board whose columns changed when he pressed a tab. See **Data sources** for
 * the season-long reconciliation against the two team boards Savant *does*
 * publish.
 */
export async function teamStatcast(
  kind: PlayerKind,
  days: number,
): Promise<Map<string, WindowStatcast>> {
  const totals = await sumDays(TEAM_AXIS[kind], days);
  const out = new Map<string, WindowStatcast>();
  for (const [team, counts] of totals) out.set(team, toStatcast(counts));
  return out;
}

/** The shared half: every day in the window, added up along one axis. */
async function sumDays(
  axis: (typeof AXES)[number],
  days: number,
): Promise<Map<string, StatcastCounts>> {
  const dates = windowDates(days);
  const totals = new Map<string, StatcastCounts>();
  let missed = 0;

  const perDay = await mapLimit(dates, 4, async (date) => {
    try {
      return await dayCounts(date);
    } catch (err) {
      missed++;
      console.error(`Statcast window: ${date} unavailable:`, err);
      return null;
    }
  });

  for (const day of perDay) {
    if (!day) continue;
    // A v4 blob that somehow survives a deploy has no club axes at all; `?? {}`
    // makes that a day contributing nothing rather than a throw, which is the
    // same shape as the missing-day case a line above.
    for (const [key, counts] of Object.entries(day[axis] ?? {})) {
      let acc = totals.get(key);
      if (!acc) totals.set(key, (acc = empty()));
      addCounts(acc, counts);
    }
  }
  if (missed) console.error(`Statcast window: ${missed}/${dates.length} days missing`);
  return totals;
}
