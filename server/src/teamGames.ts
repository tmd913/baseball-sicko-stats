import type { TeamGameResult } from './types.js';
import { getTeamAbbrevs, isFinalStatus, isPostponedStatus, type GameStatusFields } from './mlbStats.js';
import { SEASON } from './research.js';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/**
 * **A club's season, backwards** — every game it has played or is playing, for
 * the Results tab on its page and for the doors into a game's own page that tab
 * is made of.
 *
 * ## Why this is not `/api/schedule`
 *
 * That window is the **forward** one: `baseballToday()` to +28 days, no scores,
 * because a game that has not been played has none. `ScheduleGame` is thin on
 * purpose and the team page's own document records the consequence — a Game Log
 * tab was refused there on the grounds that *"the scores are not on the wire"*.
 * They are now, on this route, which is the whole of what it exists for.
 *
 * The two are deliberately not folded together. One is read once a baseball day
 * by every surface in the app that draws days ahead; this is read per club, on
 * a tab, and carries a season rather than a fortnight.
 *
 * ## The season is a **use** and not a pin
 *
 * `SEASON` is imported from `research.ts` rather than declared here, which is
 * exactly what `playerSplits.ts` does and for the same reason: this file has
 * nothing to update when the year rolls over, so a constant of its own would be
 * a twelfth place for `CLAUDE.md`'s list to be one behind.
 */

/** One club's season barely moves; the scores in it move only while a game is
 *  being played. The two spans `gameLog.ts` settles on, for the same reason. */
const TTL = 30 * 60 * 1000;
const LIVE_TTL = 60 * 1000;

interface Entry {
  games: TeamGameResult[];
  fetchedAt: number;
}

const cache = new Map<number, Entry>();
/** One request per club in flight, not one per reader — a cold Lambda with
 *  three readers on a page must ask MLB once. The rule `schedule.ts` states. */
const inFlight = new Map<number, Promise<TeamGameResult[]>>();

interface ScheduleResponse {
  dates?: {
    games?: {
      gamePk?: number;
      gameDate?: string;
      officialDate?: string;
      status?: GameStatusFields;
      teams?: {
        away?: { team?: { id?: number }; score?: number; isWinner?: boolean };
        home?: { team?: { id?: number }; score?: number; isWinner?: boolean };
      };
      linescore?: { currentInning?: number; inningState?: string };
    }[];
  }[];
}

/**
 * The state, off the same two predicates every other reading of an MLB status
 * in this app goes through (`mlbStats.ts`).
 *
 * **Postponed is tested first**, because MLB files a called-off game as
 * `abstractGameState: "Final"` — the one error `schedule.ts::stateOf` names as
 * the one that would make a game count lie. `Cancelled` is MLB's own spelling
 * and lives inside `isPostponedStatus`; nothing here restates it.
 */
function stateOf(s: GameStatusFields | undefined): TeamGameResult['state'] {
  if (isPostponedStatus(s)) return 'postponed';
  if (isFinalStatus(s)) return 'final';
  return s?.abstractGameState === 'Live' ? 'live' : 'scheduled';
}

async function fetchSeason(teamId: number): Promise<TeamGameResult[]> {
  const url =
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${SEASON}&teamId=${teamId}` +
    // `hydrate=linescore` is what buys the half-inning a live row says — the
    // schedule's own payload carries the score and not where the game has got
    // to. Measured on one club's season: **72,449 bytes** with it, which is a
    // read this route makes once every half hour per club.
    `&gameType=R&hydrate=linescore` +
    `&fields=dates,games,gamePk,gameDate,officialDate,status,abstractGameState,` +
    `codedGameState,detailedState,teams,away,home,team,id,score,isWinner,` +
    `linescore,currentInning,inningState`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`MLB schedule returned ${res.status} for team ${teamId}`);
  const data = (await res.json()) as ScheduleResponse;
  const abbrevs = await getTeamAbbrevs();
  const out: TeamGameResult[] = [];
  for (const d of data.dates ?? []) {
    for (const g of d.games ?? []) {
      if (typeof g.gamePk !== 'number') continue;
      const state = stateOf(g.status);
      // **Only what has happened.** A fixture ahead is the Schedule tab's, drawn
      // off the one shared window with both announced starters on it; a row here
      // with two dashes where the score goes would be that tab's answer at lower
      // resolution, in a list whose whole column is the score.
      if (state === 'scheduled') continue;
      const home = g.teams?.home?.team?.id === teamId;
      const mine = home ? g.teams?.home : g.teams?.away;
      const theirs = home ? g.teams?.away : g.teams?.home;
      const oppId = theirs?.team?.id ?? 0;
      out.push({
        gamePk: g.gamePk,
        date: g.officialDate ?? (g.gameDate ?? '').slice(0, 10),
        startTime: g.gameDate ?? null,
        home,
        opponentId: oppId,
        // A club MLB has no abbreviation for draws an empty cell rather than a
        // bare id — the join-to-null rule, one column wide.
        opponent: abbrevs.get(oppId) ?? '',
        state,
        detailedState: g.status?.detailedState ?? '',
        teamScore: typeof mine?.score === 'number' ? mine.score : null,
        opponentScore: typeof theirs?.score === 'number' ? theirs.score : null,
        // **Null is a game with no winner**, which is two things at once — one
        // still being played, and a tie — and both of them are correctly "not a
        // result yet or ever". MLB omits the flag rather than sending false.
        won: typeof mine?.isWinner === 'boolean' ? mine.isWinner : null,
        inning: state === 'live' ? g.linescore?.currentInning ?? null : null,
        inningState: state === 'live' ? g.linescore?.inningState ?? null : null,
      });
    }
  }
  // **Newest first.** A club's page is opened to ask how they have been going,
  // and the answer to that is at the end of a list read the other way up. MLB
  // sends the season in date order, so this is one reversal rather than a sort
  // — except that a doubleheader's two games share a date, and MLB's own order
  // within a day is the order they were played.
  out.reverse();
  return out;
}

/** Whether a club's list holds a game still being played — which is the only
 *  thing in it that can change inside half an hour. */
const anyLive = (games: TeamGameResult[]): boolean => games.some((g) => g.state === 'live');

export async function getTeamGames(teamId: number): Promise<TeamGameResult[]> {
  const hit = cache.get(teamId);
  if (hit && Date.now() - hit.fetchedAt < (anyLive(hit.games) ? LIVE_TTL : TTL)) {
    return hit.games;
  }
  const running = inFlight.get(teamId);
  if (running) return running;
  const p = fetchSeason(teamId)
    .then((games) => {
      cache.set(teamId, { games, fetchedAt: Date.now() });
      return games;
    })
    .finally(() => {
      inFlight.delete(teamId);
    });
  inFlight.set(teamId, p);
  return p;
}
