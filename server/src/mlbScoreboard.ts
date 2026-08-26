import type {
  BaseState,
  MlbScoreboard,
  MlbScoreboardGame,
  MlbScoreboardTeam,
} from './types.js';
import {
  getTeamAbbrevs,
  hasStarted,
  isFinalStatus,
  isPostponedStatus,
  type GameStatusFields,
} from './mlbStats.js';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/**
 * **One ET day's games, whole** — the MLB view's Scoreboard tab.
 *
 * ## Why this is neither of the two schedule reads already here
 *
 * There are two, and this is a third because it asks a third question:
 *
 *  - `schedule.ts` is the **forward window**, `baseballToday()` to +28 days,
 *    deliberately thin — no scores, because a game ahead has none — and read
 *    once a baseball day by every surface that draws days ahead. A scoreboard
 *    of *yesterday* is not in it at all, and a scoreboard of today drawn from
 *    it would be fifteen rows of two dashes.
 *  - `teamGames.ts` is **one club's season backwards**, every game it has
 *    played, and drops fixtures for the mirror of that reason. Fifteen games on
 *    one day would be up to thirty reads of it, each carrying a season.
 *
 * This is **one day, both directions**: what has been played, what is being
 * played and what has not started, for every club at once. `date=` rather than
 * a range, because the tab shows one day and steps to another.
 *
 * ## What one read costs, measured
 *
 * `hydrate=linescore,probablePitcher,decisions,team` with this file's own
 * `fields=` cut, against 2026-08-24 (10 games, all final) and 2026-08-25 (15
 * games, none started): **11,425 bytes** and **9,662 bytes**. Everything the
 * card draws is in one request — the score, where a live game has got to, both
 * announced starters, the three pitchers a finished game names, the ballpark
 * and which game of the series it is.
 *
 * **The live matchup put ~60% on that**, re-measured on the same two days once
 * `offense`/`defense` were added: 8,646 → **13,506** on the finished day and
 * 11,627 → **18,790** on the live one. The three fields the card gained are
 * two names and three flags; the rest of it is `fields=` being a **flat name
 * filter** with no notion of the path a name sits on — `first`, `second` and
 * `third` are the runners on the offense block *and* the corners and the
 * keystone on the defense block, so asking for the bases asks for the whole
 * defensive alignment, and `batter`/`pitcher` are each on both blocks too. It
 * is the one place in this cut where something is fetched that nothing draws,
 * and there is no way to ask for less: MLB has no per-path form of `fields=`.
 * Nineteen kilobytes once a minute, held in memory and shared by every reader,
 * is what that is worth paying.
 *
 * The alternative was `/api/v1/schedule` bare plus a `feed/live` per game for
 * the half-inning, which is fifteen requests for a fact the linescore hydration
 * carries. `game.ts` reads a feed because a *box score* needs one; a board does
 * not.
 *
 * ## The day is the caller's, and the caller is the client
 *
 * Unlike `/api/news/recent`, which takes the server's own `baseballToday()`
 * because "today" there is the whole of what the mark means, this route is
 * given a date: the tab has arrows and a calendar, so most reads are not of
 * today at all. The route validates the shape and asks MLB, which is the one
 * authority on whether a day has games — a date the schedule has nothing for
 * answers with an empty list, and the client says so in words.
 */

/**
 * How long a day's board stays fresh, and it is the only thing here with two
 * answers.
 *
 * A day with a game still to start or still being played is **the** moving
 * target in this app: scores change by the pitch, and the tab is read while
 * watching. A minute is `teamGames.ts`'s own live span and `warmer.ts`'s live
 * cadence, so nothing in the server is being asked to refresh faster than the
 * fastest thing already in it.
 *
 * A day whose games are all final cannot change except by official scoring,
 * which `revisions.ts` handles for the readings that store a day — this one
 * stores nothing, so six hours is simply how long a finished day is worth
 * holding in a container that will be recycled long before it matters.
 */
const LIVE_TTL = 60 * 1000;
const FINAL_TTL = 6 * 60 * 60 * 1000;

/**
 * **In memory only, and deliberately no `storage.ts` blob.**
 *
 * `schedule.ts`'s rule: everything this server persists is a *finished* fact,
 * and a scoreboard is the opposite — the whole reason to open it is that the
 * games are moving. A finished day would qualify, but a blob whose freshness
 * test is "were all fifteen of these final when we wrote it" is a stored answer
 * pretending to be a fact, and the day it would save a read on is the day
 * nobody is looking at.
 */
interface Entry {
  board: MlbScoreboard;
  at: number;
}
const cache = new Map<string, Entry>();
/** One request per date in flight, not one per reader — the guard every shared
 *  read in this codebase carries. */
const inFlight = new Map<string, Promise<MlbScoreboard>>();

interface Person {
  id?: number;
  fullName?: string;
}

interface ScheduleResponse {
  dates?: {
    games?: {
      gamePk?: number;
      gameDate?: string;
      officialDate?: string;
      status?: GameStatusFields & { reason?: string };
      teams?: {
        away?: SideResponse;
        home?: SideResponse;
      };
      linescore?: {
        currentInning?: number;
        inningState?: string;
        outs?: number;
        /** Whoever is batting — and, between halves, whoever is about to. The
         *  runners hang off it because they are the batting club's. */
        offense?: { batter?: Person; first?: Person; second?: Person; third?: Person };
        /** Whoever is in the field, of whom the card wants exactly one. */
        defense?: { pitcher?: Person };
      };
      decisions?: { winner?: Person; loser?: Person; save?: Person };
      venue?: { name?: string };
      seriesGameNumber?: number;
      gamesInSeries?: number;
    }[];
  }[];
}

interface SideResponse {
  team?: { id?: number; name?: string };
  leagueRecord?: { wins?: number; losses?: number };
  score?: number;
  isWinner?: boolean;
  probablePitcher?: Person;
}

/**
 * The state, off the two predicates every reading of an MLB status in this app
 * goes through (`mlbStats.ts`).
 *
 * **Postponed is tested first**, because MLB files a called-off game as
 * `abstractGameState: "Final"` — the one error `schedule.ts::stateOf` names as
 * the one that would make a game count lie. `Cancelled` is MLB's own spelling
 * and lives inside `isPostponedStatus`; nothing here restates it. This is
 * `teamGames.ts::stateOf` verbatim and is duplicated rather than shared for the
 * reason that one is: four lines, and an export tying two parsers together
 * would be the thing that eventually makes one of them answer for the other.
 */
function stateOf(s: GameStatusFields | undefined): MlbScoreboardGame['state'] {
  if (isPostponedStatus(s)) return 'postponed';
  if (isFinalStatus(s)) return 'final';
  return s?.abstractGameState === 'Live' ? 'live' : 'scheduled';
}

/** A pitcher MLB names, or null — the join-to-null rule at its smallest: an id
 *  with no name is a door with no label, and neither half is worth guessing. */
function person(p: Person | undefined): { id: number; name: string } | null {
  return typeof p?.id === 'number' && p.fullName ? { id: p.id, name: p.fullName } : null;
}

/**
 * The runners, off the batting club's own block.
 *
 * **A base is occupied where MLB names the man on it**, there being no boolean
 * on the wire — the key is simply absent where nobody is there. Measured on
 * 2026-08-25: a `Top 4` read `second` alone and every `Middle` read none, MLB
 * clearing the runners at the change of half rather than carrying them over.
 */
function bases(offense: { first?: Person; second?: Person; third?: Person } | undefined): BaseState {
  return {
    first: typeof offense?.first?.id === 'number',
    second: typeof offense?.second?.id === 'number',
    third: typeof offense?.third?.id === 'number',
  };
}

function side(
  s: SideResponse | undefined,
  abbrevs: Map<number, string>,
  started: boolean,
): MlbScoreboardTeam {
  const id = s?.team?.id ?? 0;
  const probable = person(s?.probablePitcher);
  return {
    id,
    name: s?.team?.name ?? '',
    // A club MLB has no abbreviation for draws its name instead of a bare id —
    // the join-to-null rule, one cell wide.
    abbreviation: abbrevs.get(id) ?? '',
    score: typeof s?.score === 'number' ? s.score : null,
    wins: typeof s?.leagueRecord?.wins === 'number' ? s.leagueRecord.wins : null,
    losses: typeof s?.leagueRecord?.losses === 'number' ? s.leagueRecord.losses : null,
    // **Only until the game starts.** MLB goes on sending `probablePitcher`
    // through a game and past its end, and a card that says "probable: Skubal"
    // beside a line score he has already left is a promise about a fact. Once
    // there is a game to read, the pitchers on it are the box score's — which
    // is one press away, the card being a door into the game's own page.
    probableId: started ? null : probable?.id ?? null,
    probableName: started ? null : probable?.name ?? null,
    // **Null is a game with no winner**, which is two things at once — one
    // still being played, and a tie — and both are correctly "not a result yet
    // or ever". MLB omits the flag rather than sending false.
    winner: typeof s?.isWinner === 'boolean' ? s.isWinner : null,
  };
}

async function fetchDay(date: string): Promise<MlbScoreboard> {
  const url =
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}` +
    `&hydrate=linescore,probablePitcher,decisions` +
    // The `fields=` cut is what takes this to eleven kilobytes. Every name in
    // it is drawn by the card or decides what the card draws; nothing is here
    // "in case", which is the rule that keeps a hydrated schedule small.
    `&fields=dates,games,gamePk,gameDate,officialDate,status,abstractGameState,` +
    `codedGameState,detailedState,reason,teams,away,home,team,id,name,score,` +
    `isWinner,leagueRecord,wins,losses,probablePitcher,fullName,linescore,` +
    `currentInning,inningState,outs,offense,defense,batter,pitcher,first,second,` +
    `third,decisions,winner,loser,save,venue,` +
    `seriesGameNumber,gamesInSeries`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`MLB schedule returned ${res.status} for ${date}`);
  const data = (await res.json()) as ScheduleResponse;
  const abbrevs = await getTeamAbbrevs();
  const games: MlbScoreboardGame[] = [];
  for (const d of data.dates ?? []) {
    for (const g of d.games ?? []) {
      if (typeof g.gamePk !== 'number') continue;
      const state = stateOf(g.status);
      // `hasStarted` as well as `live`: MLB calls a game Live at Warmup and
      // hands out a `Top 1` linescore with it, half an hour before anybody
      // plays it (see `mlbStats.ts`). The row keeps MLB's state — that is what
      // holds the day on the live TTL through first pitch — but it claims no
      // half-inning until there is one.
      const playing = state === 'live' && hasStarted(g.status);
      const dec = g.decisions;
      games.push({
        gamePk: g.gamePk,
        date: g.officialDate ?? (g.gameDate ?? '').slice(0, 10),
        startTime: g.gameDate ?? null,
        state,
        detailedState: g.status?.detailedState ?? '',
        reason: g.status?.reason ?? null,
        away: side(g.teams?.away, abbrevs, state !== 'scheduled'),
        home: side(g.teams?.home, abbrevs, state !== 'scheduled'),
        inning: playing ? g.linescore?.currentInning ?? null : null,
        inningState: playing ? g.linescore?.inningState ?? null : null,
        outs: playing && typeof g.linescore?.outs === 'number' ? g.linescore.outs : null,
        // **The same `playing` gate the half-inning takes**, and for a reason
        // one step past that one: MLB keeps sending `offense` and `defense`
        // long after a game is over — the last man to bat and the last man to
        // pitch, which on a `Final` card would read as a matchup in progress.
        // `person` is the join-to-null rule, so an id with no name is nobody.
        bases: playing ? bases(g.linescore?.offense) : null,
        atBat: playing ? person(g.linescore?.offense?.batter) : null,
        onMound: playing ? person(g.linescore?.defense?.pitcher) : null,
        venue: g.venue?.name ?? null,
        seriesGame: typeof g.seriesGameNumber === 'number' ? g.seriesGameNumber : null,
        seriesLength: typeof g.gamesInSeries === 'number' ? g.gamesInSeries : null,
        // **Only on a final game.** MLB fills `decisions` the moment a winner
        // is determinable, which on a game still being played is a pitcher who
        // may yet lose the decision — the same "a promise about a fact"
        // objection the probables above answer, read from the other end.
        winPitcher: state === 'final' ? person(dec?.winner) : null,
        lossPitcher: state === 'final' ? person(dec?.loser) : null,
        savePitcher: state === 'final' ? person(dec?.save) : null,
      });
    }
  }
  // **In start order, earliest first**, which is how a scoreboard is read and
  // is not what MLB sends: its own order within a day is the order the games
  // were filed. A game with no first pitch on it sorts last rather than first,
  // an absent time being unknown rather than early.
  games.sort((a, b) => (a.startTime ?? '9').localeCompare(b.startTime ?? '9'));
  return { date, games, fetchedAt: Date.now() };
}

/** Whether anything on the board can still change inside the hour — which is
 *  every state but the two that are over. */
function moving(board: MlbScoreboard): boolean {
  return board.games.some((g) => g.state === 'scheduled' || g.state === 'live');
}

export async function getMlbScoreboard(date: string): Promise<MlbScoreboard> {
  const hit = cache.get(date);
  if (hit && Date.now() - hit.at < (moving(hit.board) ? LIVE_TTL : FINAL_TTL)) {
    return hit.board;
  }
  const running = inFlight.get(date);
  if (running) return running;
  const p = fetchDay(date)
    .then((board) => {
      cache.set(date, { board, at: Date.now() });
      return board;
    })
    .finally(() => {
      inFlight.delete(date);
    });
  inFlight.set(date, p);
  return p;
}
