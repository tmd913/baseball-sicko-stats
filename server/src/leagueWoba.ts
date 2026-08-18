import { readJsonBlob, readStampedBlob, writeJsonBlob } from './storage.js';
import { dayCounts } from './statcastWindow.js';
import { addDays, baseballToday } from './etDate.js';
import { mapLimit } from './limit.js';

/**
 * **What an average major-league plate appearance is worth, measured rather
 * than declared.**
 *
 * The rolling-xwOBA chart draws a reference line, and for its whole life that
 * line was a constant — `LEAGUE_XWOBA = 0.315`, with a comment admitting it was
 * a benchmark rather than a measurement ("wOBA is calibrated to the league OBP
 * scale, so this sits ~.310–.320 year to year"). It is close: the 2026 season
 * to date measures **.3149** over 140,028 wOBA events. It is also *only* close
 * by luck of the year, and it says nothing about how the league is actually
 * hitting — reduced by month, the same season runs **.3241 in April and .3071
 * in August**, so a chart read in August compares a hitter against a league
 * that stopped existing in the spring.
 *
 * **It is measured from the days the app already has on disk.** Every wOBA
 * event of the season is in the per-date Savant exports `savant.ts` downloads
 * and keeps forever, and `statcastWindow.ts` already tallies exactly the two
 * numbers this needs while building the research board — `paDen` (the wOBA
 * denominator) and `xwobaSum`. So this file is a second reader of that tally
 * rather than a second pass over the same CSV, which is the rule that file
 * already follows for the two boards it feeds.
 *
 * **The batter side and the pitcher side are the same number**, so one figure
 * serves both charts: every plate appearance has exactly one of each, so
 * summing the league's batters and summing the league's pitchers count the same
 * events. (Checked on a real day: the two sides agree to machine precision.)
 * The chart's series for a pitcher is xwOBA *allowed*, which is what a league
 * average is on that side too.
 *
 * **Nothing on the read path builds this.** `getLeagueXwoba()` reads a blob and
 * answers null if there isn't one; `buildLeagueXwoba()` is the nightly job. A
 * season is 142 days of tallies, which is seconds off warm blobs and minutes
 * from cold CSVs — not something a reader opening a chart should ever be the
 * one to pay for, which is the whole of why this is split in two.
 *
 * The first build holds a season of `statcastWindow`s own day tallies in memory
 * on the way past, which is **24MB measured** (1.7MB per ten days) and is paid
 * once: every night after it, the days are already reduced to the two numbers
 * below and nothing re-reads a count.
 */

/** Two numbers a day, which is all a league average is made of. */
interface DayWoba {
  /** wOBA denominator — plate appearances less the events wOBA doesn't count. */
  pa: number;
  /** Σ of each event's `estimated_woba_using_speedangle`. */
  xwobaSum: number;
}

/** The league's season to date, as it goes on the wire and into the blob. */
export interface LeagueWoba {
  season: number;
  /** Σ xwoba / Σ pa over every wOBA event of the season so far. */
  xwoba: number;
  /** How many events that is — what makes the figure worth trusting, and what
   *  tells a measured line from the fallback constant on the client. */
  pa: number;
  /** The last day counted (yesterday, Savant lagging the live feed by a day). */
  through: string;
  /** Days with games in them. A day that could not be read is missing from
   *  this count as well as from the sums, so a short season says so. */
  days: number;
}

/**
 * The benchmark the chart used before this existed, kept as the answer for an
 * installation whose nightly job has not run yet. Stated on the wire as a
 * `pa: 0`, which is what the client reads to know it is a benchmark rather than
 * a measurement.
 */
export const DEFAULT_LEAGUE_XWOBA = 0.315;

/** A day's two numbers never change once the day is over, so they are stored
 *  without a freshness test — the rule `statcast-counts-{date}` itself follows.
 *  40 bytes against the 25KB counts blob they are reduced from, which is what
 *  makes summing a whole season a cheap thing to do every night. */
const dayKey = (date: string) => `league-woba-${date}-v1.json`;
const seasonKey = (season: number) => `league-xwoba-${season}-v1.json`;

/** March rather than opening day, the rule `teamHitting.ts` follows: a spring
 *  date reduces to an empty day, so this file needs no fixture list and no
 *  season-start constant to keep in sync. */
const SEASON_START = '03-01';

const dayMem = new Map<string, DayWoba>();

/**
 * One day's league totals, off the same tally the research board is built from.
 *
 * The **batter** side is summed rather than the pitcher side because the two are
 * the same events and one of them has to be picked; a position player mopping
 * up is a pitcher in that tally and a batter in this one either way, since it is
 * the plate appearances being counted rather than the players.
 */
async function dayWoba(date: string): Promise<DayWoba> {
  const hit = dayMem.get(date);
  if (hit) return hit;
  const stored = await readJsonBlob<DayWoba>(dayKey(date), () => true);
  if (stored) {
    dayMem.set(date, stored);
    return stored;
  }
  const counts = await dayCounts(date);
  const out: DayWoba = { pa: 0, xwobaSum: 0 };
  for (const c of Object.values(counts.batter)) {
    out.pa += c.paDen;
    out.xwobaSum += c.xwobaSum;
  }
  dayMem.set(date, out);
  // A day still being played would be stored half-finished, so today is not
  // written — the same exception `statcastWindow.ts` makes for its own counts.
  if (date < baseballToday()) await writeJsonBlob(dayKey(date), out);
  return out;
}

/** Every date of the season up to and including yesterday, oldest first.
 *  Yesterday because Savant lags the live feed by a day, which is the same
 *  boundary `windowDates` draws. */
function seasonDates(): string[] {
  const end = addDays(baseballToday(), -1);
  const start = `${end.slice(0, 4)}-${SEASON_START}`;
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * **The nightly job.** Sum the season and write one blob.
 *
 * A day that cannot be read is skipped rather than fatal — the rule
 * `windowStatcast` follows, and an off day legitimately has no export at all.
 * Each day it *does* read is stored on its own, so a run that dies half way
 * leaves the work it did behind and the next night carries on from there.
 */
export async function buildLeagueXwoba(): Promise<LeagueWoba> {
  const dates = seasonDates();
  let missed = 0;
  const perDay = await mapLimit(dates, 4, async (date) => {
    try {
      return await dayWoba(date);
    } catch (err) {
      missed++;
      console.error(`league xwOBA: ${date} unavailable:`, err);
      return null;
    }
  });

  let pa = 0;
  let sum = 0;
  let days = 0;
  for (const day of perDay) {
    if (!day || day.pa <= 0) continue;
    pa += day.pa;
    sum += day.xwobaSum;
    days++;
  }
  if (missed) console.error(`league xwOBA: ${missed}/${dates.length} days missing`);

  const end = dates[dates.length - 1] ?? baseballToday();
  const out: LeagueWoba = {
    season: Number(end.slice(0, 4)),
    xwoba: pa > 0 ? Math.round((sum / pa) * 10000) / 10000 : DEFAULT_LEAGUE_XWOBA,
    pa,
    through: end,
    days,
  };
  await writeJsonBlob(seasonKey(out.season), out);
  mem = { value: out, at: Date.now() };
  return out;
}

// Read from the blob at most this often. A figure the nightly job writes needs
// no shorter check than this, and it keeps a burst of chart opens on a warm
// container down to one read.
const MEM_TTL_MS = 30 * 60 * 1000;
let mem: { value: LeagueWoba | null; at: number } | null = null;

/**
 * **The read path, which never builds.** The blob or nothing: a chart opening
 * must not be the thing that reduces a season of exports, so an installation
 * whose nightly job has not run yet gets the fallback constant and says so.
 *
 * No freshness test on the read either. The figure moves by a thousandth over a
 * week — it is 140,000 events deep by August — so a blob a day old is the same
 * line, and refusing a stale one would only trade a measured average for a
 * declared one.
 */
export async function getLeagueXwoba(): Promise<LeagueWoba | null> {
  if (mem && Date.now() - mem.at < MEM_TTL_MS) return mem.value;
  const season = Number(baseballToday().slice(0, 4));
  const stored = await readStampedBlob<LeagueWoba>(seasonKey(season));
  const value = stored?.value ?? null;
  mem = { value, at: Date.now() };
  return value;
}
