import type { NextGameInfo, NextGame, ProbablePitcher } from './types.js';
import { addDays, baseballToday } from './etDate.js';
import { getRosterInfo, getTeamAbbrevs } from './mlbStats.js';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/**
 * How far ahead we look. A club plays every day or two, so the first answer is
 * almost always tomorrow; the window exists for the other two cases. A **start**
 * is the one that needs the room — a rotation turn is five days, and a club that
 * has only named the next three has nothing to say about the fourth — while an
 * off day either side of the All-Star break is the widest gap a club's own
 * schedule has. Fourteen covers both with slack and costs nothing: the whole
 * window is 21KB unfiltered for one club, against the ~650KB the season-wide
 * schedule read already spends.
 */
const WINDOW_DAYS = 14;

/**
 * How long a window stays fresh. Probables are announced through the day, which
 * is the one thing in here that moves — a schedule does not — so this matches
 * the half hour the game log and the season lines already settle on.
 */
const WINDOW_TTL = 30 * 60 * 1000;

/**
 * **In memory only, and deliberately no storage blob.** Everything this app
 * persists is a *finished* fact — a day whose games are all final, a scoring
 * period gone by — where this is the opposite: a window onto games that have not
 * been played, whose probables are filled in as clubs name them. A blob would be
 * a stored answer to a question that changes by the hour, and its freshness test
 * would have to be exactly the TTL beside it. `gameLog.ts` caches on the same
 * reasoning and for the same span, and touches no `storage.ts` key either.
 */
const windowCache = new Map<string, { games: ScheduledGame[]; fetchedAt: number }>();

/** One future game of a club, as far as this file reads it. */
interface ScheduledGame {
  gamePk: number;
  date: string;
  startTime: string | null;
  homeId: number;
  awayId: number;
  homeProbableId: number | null;
  awayProbableId: number | null;
  homeProbableName: string | null;
  awayProbableName: string | null;
}

interface ScheduleResponse {
  dates?: {
    date?: string;
    games?: {
      gamePk?: number;
      gameDate?: string;
      officialDate?: string;
      teams?: {
        away?: { team?: { id?: number }; probablePitcher?: { id?: number; fullName?: string } };
        home?: { team?: { id?: number }; probablePitcher?: { id?: number; fullName?: string } };
      };
    }[];
  }[];
}

/**
 * One club's next fortnight, with whoever each side has announced.
 *
 * `hydrate=probablePitcher` is the whole reason this is its own read rather than
 * a widening of `gameLog.ts::getSchedule`. That one is the **season** in a single
 * call, shared across every player who opens a log, and hydrating probables
 * across a league-year to answer for the next five days would be paying for the
 * whole season to read one club's week. Cut to a club and a fortnight it is
 * fifteen games.
 */
async function fetchWindow(teamId: number, from: string, to: string): Promise<ScheduledGame[]> {
  const key = `${teamId}-${from}`;
  const hit = windowCache.get(key);
  if (hit && Date.now() - hit.fetchedAt < WINDOW_TTL) return hit.games;
  const url =
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}` +
    `&startDate=${from}&endDate=${to}&gameType=R&hydrate=probablePitcher` +
    `&fields=dates,date,games,gamePk,gameDate,officialDate,teams,away,home,team,id,probablePitcher,fullName`;
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`schedule returned ${res.status}`);
    const data = (await res.json()) as ScheduleResponse;
    const games: ScheduledGame[] = [];
    for (const d of data.dates ?? []) {
      for (const g of d.games ?? []) {
        if (!g.gamePk) continue;
        games.push({
          gamePk: g.gamePk,
          // `officialDate` is the day the game counts on, which is what every
          // other date in this app means; `dates[].date` agrees with it and is
          // the fallback for a payload that omits one.
          date: g.officialDate ?? d.date ?? '',
          startTime: g.gameDate ?? null,
          homeId: g.teams?.home?.team?.id ?? 0,
          awayId: g.teams?.away?.team?.id ?? 0,
          homeProbableId: g.teams?.home?.probablePitcher?.id ?? null,
          awayProbableId: g.teams?.away?.probablePitcher?.id ?? null,
          homeProbableName: g.teams?.home?.probablePitcher?.fullName ?? null,
          awayProbableName: g.teams?.away?.probablePitcher?.fullName ?? null,
        });
      }
    }
    // The API returns them in date order and a doubleheader in game order, but
    // nothing promises it, and the whole answer here is "the first one".
    games.sort((a, b) => a.date.localeCompare(b.date) || a.gamePk - b.gamePk);
    windowCache.set(key, { games, fetchedAt: Date.now() });
    return games;
  } catch (err) {
    console.error('next-game schedule fetch failed:', err);
    // A failed read costs the block its answer, never the tab: the client says
    // there is no game today and draws nothing under it.
    return hit?.games ?? [];
  }
}

/**
 * What a player has coming, for a day that holds nothing.
 *
 * Two questions, and which one is asked is the **caller's** to decide: a batter
 * or a reliever wants his club's next game, since any of them could be his,
 * where a starting pitcher wants the one he is actually named for. That split
 * lives in the client, on `lib.ts::isRotationStarter` — the app's one definition
 * of who works out of the rotation — rather than being restated here, which is
 * why this takes `wantStart` rather than working it out again off a season line.
 *
 * A starter with no announced start answers `{ start: true, game: null }`, which
 * is a different fact from a club with no game and is drawn differently: a
 * rotation turn four days out has not been named by anybody yet, and saying so
 * is the honest answer rather than showing him a game somebody else is starting.
 */
export async function getNextGame(playerId: number, wantStart: boolean): Promise<NextGameInfo> {
  const teamId = (await getRosterInfo([playerId])).get(playerId)?.teamId ?? null;
  if (teamId === null) return { start: wantStart, game: null };
  // The window opens **tomorrow**, which is what makes "next" unambiguous: this
  // is only ever asked for a day that holds no game for him at all, so today is
  // a day his club is not playing and has nothing to offer.
  const from = addDays(baseballToday(), 1);
  const games = await fetchWindow(teamId, from, addDays(from, WINDOW_DAYS - 1));
  const found = wantStart
    ? games.find((g) => g.homeProbableId === playerId || g.awayProbableId === playerId)
    : games[0];
  if (!found) return { start: wantStart, game: null };
  const home = found.homeId === teamId;
  const opponentId = home ? found.awayId : found.homeId;
  const oppProbableId = home ? found.awayProbableId : found.homeProbableId;
  const oppProbableName = home ? found.awayProbableName : found.homeProbableName;
  // The hand is nowhere in a schedule payload, hydrated or not (checked against
  // `probablePitcher` and `probablePitcher(all)`), so it comes off the same
  // `people` lookup every roster status in the app already goes through — one
  // id, memory-cached half an hour, and a failure costs the line its "RHP" and
  // nothing else.
  let hand: string | null = null;
  if (oppProbableId !== null) {
    hand = await getRosterInfo([oppProbableId])
      .then((m) => m.get(oppProbableId)?.throws ?? null)
      .catch(() => null);
  }
  const probable: ProbablePitcher | null =
    oppProbableId !== null && oppProbableName
      ? { id: oppProbableId, name: oppProbableName, hand }
      : null;
  const abbrevs = await getTeamAbbrevs().catch(() => new Map<number, string>());
  const game: NextGame = {
    gamePk: found.gamePk,
    date: found.date,
    startTime: found.startTime,
    home,
    opponentId,
    opponent: abbrevs.get(opponentId) ?? '—',
    probablePitcher: probable,
  };
  return { start: wantStart, game };
}
