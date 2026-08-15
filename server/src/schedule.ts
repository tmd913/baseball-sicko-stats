import type { ScheduleGame, ScheduleWindow } from './types.js';
import { addDays, baseballToday } from './etDate.js';
import { getTeamAbbrevs } from './mlbStats.js';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/**
 * How far ahead the window reaches, and so the widest span the Schedule view
 * can offer.
 *
 * Fourteen is `nextGame.ts`'s number and it is the same argument arriving from
 * the other side: a rotation turn is five days, an off day either side of the
 * All-Star break is the widest gap a club's own schedule has, and a fantasy
 * manager planning past a fortnight is planning past anything the schedule can
 * tell him. It is also **one window rather than two**: the client picks 7 or 14
 * and slices, so there is exactly one cache entry per baseball day for the
 * whole app rather than one per span.
 */
export const SCHEDULE_DAYS = 14;

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
let cached: { window: ScheduleWindow; fetchedAt: number } | null = null;
let inFlight: Promise<ScheduleWindow> | null = null;

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
        away?: { team?: { id?: number }; probablePitcher?: { id?: number } };
        home?: { team?: { id?: number }; probablePitcher?: { id?: number } };
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

async function fetchWindow(from: string, to: string): Promise<ScheduleWindow> {
  const url =
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${from}&endDate=${to}` +
    `&gameType=R&hydrate=probablePitcher` +
    `&fields=dates,date,games,gamePk,gameDate,officialDate,status,abstractGameState,` +
    `codedGameState,detailedState,teams,away,home,team,id,probablePitcher`;
  const [res, abbrevs] = await Promise.all([
    fetch(url, { headers: UA }),
    // A missing abbreviation costs a cell its club's short name, not the
    // window — the rule every join in this file follows.
    getTeamAbbrevs().catch(() => new Map<number, string>()),
  ]);
  if (!res.ok) throw new Error(`schedule returned ${res.status}`);
  const data = (await res.json()) as ScheduleResponse;
  const games: ScheduleGame[] = [];
  for (const d of data.dates ?? []) {
    for (const g of d.games ?? []) {
      if (!g.gamePk) continue;
      const homeId = g.teams?.home?.team?.id ?? 0;
      const awayId = g.teams?.away?.team?.id ?? 0;
      if (!homeId || !awayId) continue;
      games.push({
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
  // and nothing promises it, and the client draws a day's games left to right.
  games.sort((a, b) => a.date.localeCompare(b.date) || a.gamePk - b.gamePk);
  return { start: from, end: to, days: SCHEDULE_DAYS, games };
}

/**
 * Every club's next fortnight, with whoever each side has announced.
 *
 * One upstream for all thirty clubs rather than one per club or one per player:
 * the two tables that read it draw hundreds of rows at once, and the answer for
 * a row is entirely a function of the club its player is on — so a per-player
 * read would be the same 43KB fetched six hundred times to be sliced six
 * hundred ways.
 *
 * **Keyed by the baseball day**, so the entry rolls over with the app's own
 * calendar rather than drifting off it: a window still keyed to yesterday would
 * quietly draw yesterday's first column for half an hour after 3am ET.
 */
export async function getScheduleWindow(): Promise<ScheduleWindow> {
  const from = baseballToday();
  if (cached && cached.window.start === from && Date.now() - cached.fetchedAt < WINDOW_TTL) {
    return cached.window;
  }
  if (inFlight) return inFlight;
  const to = addDays(from, SCHEDULE_DAYS - 1);
  inFlight = fetchWindow(from, to)
    .then((window) => {
      cached = { window, fetchedAt: Date.now() };
      return window;
    })
    .catch((err: unknown) => {
      console.error('schedule window fetch failed:', err);
      // A stale window is better than none — it is wrong about probables alone,
      // where a throw costs the view its whole table. With nothing cached at
      // all the throw stands and `asyncRoute` answers 502, which is what the
      // client's own error line is for.
      if (cached) return cached.window;
      throw err;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
