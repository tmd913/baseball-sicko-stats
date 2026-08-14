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
}

function empty(): StatcastCounts {
  return {
    bip: 0, evSum: 0, evN: 0, laSum: 0, laN: 0, barrels: 0, hardHit: 0,
    sweetSpot: 0, gb: 0, ld: 0, fb: 0, pu: 0, swings: 0, whiffs: 0,
    ozPitches: 0, ozSwings: 0, firstPitches: 0, firstStrikes: 0,
    paDen: 0, xwobaSum: 0, xbaSum: 0, xslgSum: 0, pullAir: 0, pullBip: 0,
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

type DayCounts = Record<PlayerKind, Record<string, StatcastCounts>>;

/** `-v3`: bumped when bunts came out of the EV/LA averages (v2) and again when
 *  `pullAir`/`pullBip` were added (v3) — a stored blob holds *sums*, so a stale
 *  one would keep serving the pre-fix numbers, and it deserializes with any
 *  field added since it missing. Bump this whenever `StatcastCounts` gains one,
 *  exactly as the day snapshot and the research board itself do. */
const dayKey = (date: string) => `statcast-counts-${date}-v3.json`;

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

function parseDay(csv: string): DayCounts {
  const out: DayCounts = { batter: {}, pitcher: {} };
  for (const r of parseCsv(csv)) {
    for (const kind of ['batter', 'pitcher'] as const) {
      const id = r[kind];
      if (!id) continue;
      const bucket = out[kind];
      tally((bucket[id] ??= empty()), r);
    }
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
  for (const kind of ['batter', 'pitcher'] as const) {
    for (const counts of Object.values(day[kind])) counts.pullBip = counts.bip;
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
 */
async function countsFor(date: string): Promise<DayCounts> {
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
  /** Fly balls plus popups — not shown, and carried for the same reason the
   *  season board carries it: xFIP needs his fly-ball count. */
  flyBalls: number;
}

const rate = (n: number, d: number): number | null => (d > 0 ? (100 * n) / d : null);
const mean = (sum: number, n: number): number | null => (n > 0 ? sum / n : null);
const r3 = (v: number | null): number | null => (v === null ? null : Math.round(v * 1000) / 1000);
const r1 = (v: number | null): number | null => (v === null ? null : Math.round(v * 10) / 10);

export function toStatcast(c: StatcastCounts): WindowStatcast {
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
  const dates = windowDates(days);
  const totals = new Map<number, StatcastCounts>();
  let missed = 0;

  const perDay = await mapLimit(dates, 4, async (date) => {
    try {
      return await countsFor(date);
    } catch (err) {
      missed++;
      console.error(`Statcast window: ${date} unavailable:`, err);
      return null;
    }
  });

  for (const day of perDay) {
    if (!day) continue;
    for (const [id, counts] of Object.entries(day[kind])) {
      const n = Number(id);
      let acc = totals.get(n);
      if (!acc) totals.set(n, (acc = empty()));
      addCounts(acc, counts);
    }
  }
  if (missed) console.error(`Statcast window: ${missed}/${dates.length} days missing`);

  const out = new Map<number, WindowStatcast>();
  for (const [id, counts] of totals) out.set(id, toStatcast(counts));
  return out;
}
