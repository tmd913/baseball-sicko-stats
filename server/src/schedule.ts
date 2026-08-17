import type { ScheduleGame, ScheduleWindow } from './types.js';
import { addDays, baseballToday } from './etDate.js';
import { getAllRosterMembers, getTeamAbbrevs } from './mlbStats.js';
import { buildRotations, buildSeasonRuns, type SeasonRuns } from './rotations.js';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/**
 * How far ahead the window reaches, and so the widest span the Schedule view
 * can offer.
 *
 * **Fourteen was the number and it is 28, because the view now offers a
 * *matchup* as a span.** The old figure was `nextGame.ts`'s and the argument
 * was sound as far as it went — a rotation turn is five days, an off day either
 * side of the All-Star break is the widest gap a club's own schedule has, and a
 * manager planning past a fortnight is planning past anything the schedule can
 * tell him. What it did not have to cover is *next* matchup, which begins where
 * this one ends: `remaining(this) + length(next)`, and a league whose playoff
 * rounds run a fortnight (`playoffMatchupPeriodLength: 2` on the live one) can
 * ask for **14 + 14**. At 14 days that span was answerable for an ordinary
 * seven-day week and silently short exactly when a manager cares most, which is
 * the failure this codebase least wants — a count of games that is quietly
 * missing half of them.
 *
 * **It costs about three kilobytes.** Measured against MLB with this file's own
 * `fields`: 14 days is 47,570 bytes raw / **3,129 gzipped** and 189 games, 28
 * days is 91,776 / **5,444** and 376. Our own response to a client goes 35,834
 * raw / 3,110 gzipped to roughly double that — once per baseball day for the
 * whole app, since this is one shared read.
 *
 * It is still **one window rather than one per span**: the client picks a span
 * and slices, so there is exactly one cache entry per baseball day whatever
 * anybody asks for. The numeric spans are unchanged at 7 and 14 — this is how
 * far the window *reaches*, not how much of it is ever drawn at once.
 */
export const SCHEDULE_DAYS = 28;

/**
 * How long the window stays fresh.
 *
 * The schedule itself barely moves; **the probables are what change**, and they
 * land through the day as clubs name them — the same one moving part
 * `nextGame.ts` sets its own half-hour against, and the same span the game log
 * and the season lines settle on.
 */
const WINDOW_TTL = 30 * 60 * 1000;

/**
 * **In memory only, and deliberately no `storage.ts` blob.**
 *
 * This is `nextGame.ts`'s rule rather than a new one: everything this app
 * persists is a *finished* fact — a day whose games are all final, a scoring
 * period gone by — where this is the opposite, a window onto games that have
 * not been played whose probables are filled in by the hour. A blob's freshness
 * test would have to be exactly the TTL beside it, which is a stored answer
 * pretending to be a fact.
 *
 * What it *is* is the class `getPlayerPool` and `expectedStats.ts` are in: one
 * upstream, cookie-free, identical for every user and every row of both tables,
 * so a single entry serves the whole app. Hence the `inFlight` guard — a cold
 * Lambda with three readers must send one request, not three.
 */
/**
 * What one read of the season yields — the window that goes on the wire, and the
 * three server-side lookups the player page's own projections read.
 *
 * They are kept together because they come out of one payload and must not be
 * rebuilt from another: a rotation slot is a position in a club's run of games
 * *including the ones already played*, so `projectedStarts.ts` needs exactly the
 * season the grid's own projections were built from. None of the three goes on
 * the wire — no client has any use for April, and this is 694KB of it.
 */
interface Entry {
  window: ScheduleWindow;
  /** The clubs' runs and cadences, parsed once rather than per request. */
  season: SeasonRuns;
  /** `gamePk` → the game, so a projected turn can name its opponent. */
  byPk: Map<number, ScheduleGame>;
  /**
   * Player id → his name, for the opposing starters a projected row names.
   *
   * A map rather than two fields on every `ScheduleGame`, which is what it would
   * be if the names rode on the games: nobody needs a name *per game*, the same
   * pitcher being named for many, and `ScheduleGame` is the wire type — a field
   * there would be payload no client reads.
   */
  names: Map<number, string>;
  fetchedAt: number;
}

let cached: Entry | null = null;
let inFlight: Promise<Entry> | null = null;

interface StatusFields {
  abstractGameState?: string;
  codedGameState?: string;
  detailedState?: string;
}

interface ScheduleResponse {
  dates?: {
    date?: string;
    games?: {
      gamePk?: number;
      gameDate?: string;
      officialDate?: string;
      status?: StatusFields;
      teams?: {
        away?: { team?: { id?: number }; probablePitcher?: { id?: number; fullName?: string } };
        home?: { team?: { id?: number }; probablePitcher?: { id?: number; fullName?: string } };
      };
    }[];
  }[];
}

/**
 * MLB reports a postponed game as `abstractGameState: "Final"`, so the state
 * cannot be read off that field alone — `mlbStats.ts::isPostponedStatus` is the
 * app's own test and this is the same two keys. It is restated rather than
 * imported because that one is module-private and this is two comparisons
 * against a payload this file parses itself; getting it wrong would file a
 * postponement as a game played, which is the one error that would make the
 * per-row game count lie.
 */
function stateOf(s: StatusFields | undefined): ScheduleGame['state'] {
  const d = s?.detailedState ?? '';
  if (s?.codedGameState === 'D' || d.startsWith('Postponed')) return 'postponed';
  if (d.startsWith('Cancelled') || d.startsWith('Suspended')) return 'postponed';
  if (s?.abstractGameState === 'Live') return 'live';
  if (s?.abstractGameState === 'Final') return 'final';
  return 'scheduled';
}

/**
 * The season, once, and the window sliced out of it.
 *
 * **The whole season rather than the 28 days the view draws**, which is the one
 * decision in this file worth arguing. The window needs the days ahead; the
 * *rotation slots* the view now marks need the days behind — a turn is the median
 * gap between a pitcher's consecutive starts, so placing him needs the games he
 * has already started (see `rotations.ts`). Those could have been two reads, and
 * one read is better for a reason beyond the saving: **the two halves cannot
 * disagree about who is announced.** A projected turn is never placed on a game
 * somebody is named for, and that guarantee only holds if the grid's `SP` chips
 * and the projections behind them come off one payload.
 *
 * **It costs about 36KB gzipped, once per baseball day, for the whole app.**
 * Measured against MLB with this file's own `fields`: the 28-day window is
 * 91,418 bytes raw / **5,256 gzipped** and 376 games in 278ms, where the season
 * is 693,688 / **41,382** and 2,458 games in 434ms. That is one shared read
 * behind a 30-minute cache, against a per-club read of 53KB that the player
 * page's own projections used to make one at a time.
 */
/**
 * The two things the 40-man rosters tell a projection: **whose club** each player
 * is on, and **whether he is available** to take a turn on it.
 *
 * League-wide the 40-man carries exactly eight status codes and only one of them
 * is on the active roster — measured: `A Active` 782, `RM Reassigned to Minors`
 * 300, `D60` 171, `D15` 51, `D10` 51, `D7` 3, `PL Paternity List` 1, `NYR Not
 * Yet Reported` 1. So the test is `code === 'A'`, and everything else is a man who
 * is not taking the ball this week.
 *
 * A player the map has **no entry for at all** keeps both defaults — his club is
 * the schedule's own answer and he stays projectable — so the set handed on is
 * the players positively *off* an active roster rather than the ones on it. A
 * pitcher on no 40-man is either released or a club whose read failed, and those
 * cannot be told apart here; see `projectStarts`'s `projectable`.
 */
async function rosterFacts(): Promise<{ offRoster: Set<number>; clubs: Map<number, number> }> {
  const members = await getAllRosterMembers();
  const offRoster = new Set<number>();
  const clubs = new Map<number, number>();
  for (const [id, m] of members) {
    clubs.set(id, m.teamId);
    if (m.status.code !== 'A') offRoster.add(id);
  }
  return { offRoster, clubs };
}

/**
 * One entry per `gamePk`, preferring the copy that is not postponed.
 *
 * **MLB lists a rescheduled game twice, under one id.** A game called off on 24
 * May and made up on 17 August comes back as *two* entries with the **same
 * `gamePk`** and the same `officialDate` (the makeup day): one filed under the
 * original calendar date and marked `Postponed`, one under the makeup date and
 * marked as whatever it now is. Measured on the 2026 season: **28 duplicated ids
 * across the year, 5 inside a 28-day window.**
 *
 * This is the one thing the season-wide read had to learn that the date-range
 * read it replaced never had to. Asked for 17 Aug – 13 Sep, MLB returns only the
 * makeup copy, the postponed one being filed under a `dates[].date` outside the
 * range — so `games` was 376 rows with no duplicates and is 381 with five until
 * they are collapsed. Left alone, a cell drew a spurious `PPD` beside the real
 * game and a projected turn appeared to land on a postponed one.
 *
 * **It also corrects a claim this file used to make.** `countsAsTurn` says a
 * postponement is dropped from a club's run because *"MLB reschedules one under a
 * new `gamePk`"* — the dropping is right and the reason was wrong: the id is
 * **reused**, and what makes the run correct is this collapse plus that filter,
 * not a fresh id.
 *
 * Preferring the non-postponed copy is what makes a genuinely postponed game with
 * no makeup yet survive as postponed: it appears once, so there is nothing to
 * prefer over it.
 */
function dedupe(games: ScheduleGame[]): ScheduleGame[] {
  const byPk = new Map<number, ScheduleGame>();
  for (const g of games) {
    const seen = byPk.get(g.gamePk);
    if (!seen || (seen.state === 'postponed' && g.state !== 'postponed')) byPk.set(g.gamePk, g);
  }
  // `games` arrived sorted and a Map keeps insertion order, but a replacement
  // keeps the *original* slot — which for a makeup is the right one anyway, both
  // copies carrying the same `officialDate`. Re-sorting makes that independent of
  // the order MLB happened to send.
  return [...byPk.values()].sort((a, b) => a.date.localeCompare(b.date) || a.gamePk - b.gamePk);
}

async function fetchSeason(from: string, to: string): Promise<Entry> {
  const year = Number(from.slice(0, 4));
  const url =
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${year}` +
    `&gameType=R&hydrate=probablePitcher` +
    `&fields=dates,date,games,gamePk,gameDate,officialDate,status,abstractGameState,` +
    `codedGameState,detailedState,teams,away,home,team,id,probablePitcher,fullName`;
  const [res, abbrevs, roster] = await Promise.all([
    fetch(url, { headers: UA }),
    // A missing abbreviation costs a cell its club's short name, not the
    // window — the rule every join in this file follows.
    getTeamAbbrevs().catch(() => new Map<number, string>()),
    // **Whose club each pitcher is on, and whether he is available to pitch for
    // it.** A man on the IL or in the minors is not making a start his rotation
    // slot happens to fall on, which is the feed's own Upcoming rule (see
    // `projectStarts`'s `projectable`); and the roster is what knows about a
    // trade before he has pitched for the new club (see `clubFor`). It is the
    // same 30 forty-man rosters `/api/statuses` and every roster badge already
    // read, on the same 30-minute per-team cache, so on any warm server this is
    // thirty map merges — and a failure answers **null**, which keeps every
    // projection rather than emptying the grid.
    rosterFacts().catch((err) => {
      console.error('schedule roster read failed:', err);
      return null;
    }),
  ]);
  if (!res.ok) throw new Error(`schedule returned ${res.status}`);
  const data = (await res.json()) as ScheduleResponse;
  const all: ScheduleGame[] = [];
  const names = new Map<number, string>();
  for (const d of data.dates ?? []) {
    for (const g of d.games ?? []) {
      if (!g.gamePk) continue;
      const homeId = g.teams?.home?.team?.id ?? 0;
      const awayId = g.teams?.away?.team?.id ?? 0;
      if (!homeId || !awayId) continue;
      for (const side of [g.teams?.home?.probablePitcher, g.teams?.away?.probablePitcher]) {
        if (side?.id && side.fullName) names.set(side.id, side.fullName);
      }
      all.push({
        gamePk: g.gamePk,
        // `officialDate` is the day the game counts on, which is what every
        // other date in this app means; `dates[].date` agrees with it and is
        // the fallback for a payload that omits one.
        date: g.officialDate ?? d.date ?? '',
        startTime: g.gameDate ?? null,
        homeId,
        awayId,
        home: abbrevs.get(homeId) ?? '',
        away: abbrevs.get(awayId) ?? '',
        state: stateOf(g.status),
        homeProbableId: g.teams?.home?.probablePitcher?.id ?? null,
        awayProbableId: g.teams?.away?.probablePitcher?.id ?? null,
      });
    }
  }
  // Date order, and a doubleheader in game order. The API returns them that way
  // and nothing promises it; both the client's left-to-right day and
  // `rotations.ts`'s whole coordinate system are an index into this list.
  // One entry per game before anything reads them — see `dedupe`, which is where
  // the season-wide read differs from the date-range one it replaced.
  const season = dedupe(all);
  const games = season.filter((g) => g.date >= from && g.date <= to);
  // The runs are read off the **whole** season and the projections bounded to the
  // window the client will draw: the days behind are what a cadence is measured
  // from, and the days ahead are what the grid has columns for.
  const runs = buildSeasonRuns(season, from);
  const rotations = Object.fromEntries(
    buildRotations(runs, from, to, roster?.offRoster ?? null, roster?.clubs ?? null),
  );
  return {
    window: { start: from, end: to, days: SCHEDULE_DAYS, games, rotations },
    season: runs,
    byPk: new Map(season.map((g) => [g.gamePk, g])),
    names,
    fetchedAt: Date.now(),
  };
}

/**
 * Every club's next four weeks, with whoever each side has announced — and, for
 * every pitcher with a rotation slot, the turns nobody has announced yet.
 *
 * One upstream for all thirty clubs rather than one per club or one per player:
 * the two tables that read it draw hundreds of rows at once, and the answer for
 * a row is entirely a function of the club its player is on — so a per-player
 * read would be the same 43KB fetched six hundred times to be sliced six
 * hundred ways.
 */
export async function getScheduleWindow(): Promise<ScheduleWindow> {
  return (await current()).window;
}

/** The clubs' runs, the game lookup and the probables' names, all off the same
 *  read and the same cache entry the window comes from — see `Entry`. */
export interface SeasonRead {
  season: SeasonRuns;
  byPk: Map<number, ScheduleGame>;
  names: Map<number, string>;
}

/**
 * The season as `projectedStarts.ts` reads it, for one pitcher's rotation slot.
 *
 * **One read for both surfaces, which is what stops them disagreeing.** The
 * player page and the Schedule view's grid draw the same projection, and they
 * are only *provably* the same while the games and the cadences under them are
 * the same objects.
 */
export async function getSeasonRead(): Promise<SeasonRead> {
  const { season, byPk, names } = await current();
  return { season, byPk, names };
}

/**
 * The cache entry, fetched if it is stale.
 *
 * **Keyed by the baseball day**, so the entry rolls over with the app's own
 * calendar rather than drifting off it: a window still keyed to yesterday would
 * quietly draw yesterday's first column for half an hour after 3am ET.
 */
async function current(): Promise<Entry> {
  const from = baseballToday();
  if (cached && cached.window.start === from && Date.now() - cached.fetchedAt < WINDOW_TTL) {
    return cached;
  }
  if (inFlight) return inFlight;
  const to = addDays(from, SCHEDULE_DAYS - 1);
  inFlight = fetchSeason(from, to)
    .then((entry) => {
      cached = entry;
      return entry;
    })
    .catch((err: unknown) => {
      console.error('schedule window fetch failed:', err);
      // A stale window is better than none — it is wrong about probables alone,
      // where a throw costs the view its whole table. With nothing cached at
      // all the throw stands and `asyncRoute` answers 502, which is what the
      // client's own error line is for.
      if (cached) return cached;
      throw err;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
