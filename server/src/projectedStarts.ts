import type { ProjectedStart, ProjectedStarts, ProjectionRefusal, ProbablePitcher } from './types.js';
import { baseballToday } from './etDate.js';
import { getPitcherStarts, type StartedGame } from './gameLog.js';
import { getRosterInfo, getTeamAbbrevs } from './mlbStats.js';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/**
 * How many starts to answer with. Five turns is about a month, which is the span
 * a fantasy manager actually plans over — long enough to see a two-start week
 * coming, short enough that the tail is still worth printing. It is also about
 * where the guess stops being worth much: measured over the 2026 season the
 * fifth projected start lands on the right game 45% of the time against the
 * first one's 81%, so a sixth would be mostly noise under a heading.
 */
const WANT = 5;

/**
 * The fewest starts we will read a cadence off. Two consecutive gaps is a thin
 * median and it is what a mid-season call-up has after three turns; measured
 * against the season, raising the bar to five starts moves the next-start hit
 * rate by three tenths of a point (80.7% against 81.0%), so the stricter rule
 * buys nothing and costs the call-up — who is exactly the player somebody is
 * looking this up about — his whole block.
 */
const MIN_STARTS = 3;

/**
 * The widest gap between two starts we will treat as **consecutive turns**. A
 * rotation turn is four to seven club games; anything longer is an IL stint, a
 * demotion or a spell in the bullpen, and folding it into the median would
 * invent a cadence nobody pitches on. Nine leaves room for a six-man stretch and
 * an off-day week without letting a fortnight in.
 */
const MAX_TURN_GAP = 9;

/**
 * How many turns he may have missed and still be placed. His slot is a fact
 * about the rotation *as it stands*, and a man whose last start was two turns
 * ago is a man something has happened to — measured on the live board, the one
 * pitcher in that state (Edward Cabrera, nine turns since his last start) is
 * also the one whose projection missed the start MLB had actually named him for.
 * An announcement re-anchors him and this guard never applies; without one,
 * refusing is the honest answer.
 */
const MAX_TURNS_MISSED = 2;

/**
 * How many club games in a row may have somebody else announced before we stop
 * projecting. One is an ordinary shuffle (a bullpen game, a spot start, a
 * doubleheader); three in a row past his own slot means the rotation has been
 * re-ordered and we no longer know his phase — at which point a shorter list is
 * better than a longer wrong one.
 */
const MAX_SLIP = 3;

/**
 * A club's schedule does not move; what moves is who has been named for it, and
 * clubs name their probables through the day. Thirty minutes is what the game
 * log and `nextGame.ts` already settle on for exactly that reason.
 */
const CLUB_TTL = 30 * 60 * 1000;

/**
 * **In memory only, and deliberately no `storage.ts` blob** — the same rule
 * `nextGame.ts` states and for the same reason. Everything this app persists is
 * a *finished* fact (a day whose games are all final, a scoring period gone by);
 * a club's remaining fixtures with their probables filled in as they are
 * announced is the opposite, and a blob would be a stored answer to a question
 * that changes by the hour with a freshness test that could only ever be the TTL
 * beside it.
 */
const clubCache = new Map<string, { games: ClubGame[]; fetchedAt: number }>();

/** One game of a club's regular season, as far as this file reads it. */
interface ClubGame {
  gamePk: number;
  date: string;
  startTime: string | null;
  /** Postponed and cancelled games are dropped before this file sees them — see
   *  `counts()`, and note a postponement comes back later as its own gamePk. */
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
      status?: { detailedState?: string };
      teams?: {
        away?: { team?: { id?: number }; probablePitcher?: { id?: number; fullName?: string } };
        home?: { team?: { id?: number }; probablePitcher?: { id?: number; fullName?: string } };
      };
    }[];
  }[];
}

/**
 * A game consumes a rotation turn unless it was never played on the day it was
 * listed for. A **postponement is rescheduled under a new `gamePk`**, so counting
 * the original would put a phantom game in the club's run and shift every slot
 * after it by one. Measured league-wide on the 2026 season, `detailedState` takes
 * eight values — Final, Scheduled, Postponed, In Progress, Completed Early, Game
 * Over, Warmup, Pre-Game — of which only Postponed (27 games) is one of these;
 * Cancelled is refused as well because MLB does use it and a cancelled game is
 * the same fact with no replacement.
 */
function counts(state: string | undefined): boolean {
  const s = state ?? '';
  return !s.startsWith('Postponed') && !s.startsWith('Cancelled');
}

/**
 * One club's whole regular season in one call, with whoever each side has been
 * named for.
 *
 * **The whole season rather than a forward window**, which is where this parts
 * from `nextGame.ts`: a rotation slot is a position in the club's *run* of
 * games, so placing him needs the games he has already started as well as the
 * ones he has not. And it is **one club rather than the league**, which is where
 * it parts from `gameLog.ts::getSchedule`: that read is 650KB because it carries
 * every club's lineups, where this is **53KB measured** with the fields cut to
 * the six things a projection reads. Hydrating probables over a whole season
 * costs almost nothing, a club having named nobody past the next few days.
 */
async function fetchClubSeason(teamId: number, season: number): Promise<ClubGame[]> {
  const key = `${teamId}-${season}`;
  const hit = clubCache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CLUB_TTL) return hit.games;
  const url =
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}` +
    `&season=${season}&gameType=R&hydrate=probablePitcher` +
    `&fields=dates,date,games,gamePk,gameDate,officialDate,status,detailedState,` +
    `teams,away,home,team,id,probablePitcher,fullName`;
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`schedule returned ${res.status}`);
    const data = (await res.json()) as ScheduleResponse;
    const games: ClubGame[] = [];
    for (const d of data.dates ?? []) {
      for (const g of d.games ?? []) {
        if (!g.gamePk || !counts(g.status?.detailedState)) continue;
        games.push({
          gamePk: g.gamePk,
          // `officialDate` is the day the game counts on, which is what every
          // other date in this app means.
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
    // Date order, and a doubleheader in game order. MLB sends them that way and
    // nothing promises it, and the whole method here is an index into this list.
    games.sort((a, b) => a.date.localeCompare(b.date) || a.gamePk - b.gamePk);
    clubCache.set(key, { games, fetchedAt: Date.now() });
    return games;
  } catch (err) {
    console.error('projected-starts schedule fetch failed:', err);
    return hit?.games ?? [];
  }
}

/**
 * A minor-league club's parent organisation, for the one case that needs it.
 *
 * **A pitcher on a rehab assignment has a minor-league club as his current
 * team** — checked on the live season: Edward Cabrera's `currentTeam` is the
 * Knoxville Smokies, whose `parentOrgId` is the Cubs — so `getRosterInfo`, which
 * every roster badge in the app goes through, hands back a team id that has no
 * major-league schedule at all. That is exactly the pitcher this block is most
 * worth drawing for: a man working his way back, whose club has already named
 * him for a start. Left alone he read `Couldn't read his club's schedule`, which
 * is true of the id and a lie about him.
 *
 * It is a **fallback rather than the primary read**: the ordinary path is
 * `getRosterInfo`, warm from every other page and shared with every roster
 * badge, and this fires only when the schedule it points at comes back empty.
 * Cached for a day, a farm system's parentage being the least volatile thing
 * this app reads, and a failure answers null, which leaves the refusal where it
 * was.
 */
const orgCache = new Map<number, { orgId: number | null; fetchedAt: number }>();
const ORG_TTL = 24 * 60 * 60 * 1000;

async function parentOrgOf(teamId: number): Promise<number | null> {
  const hit = orgCache.get(teamId);
  if (hit && Date.now() - hit.fetchedAt < ORG_TTL) return hit.orgId;
  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/teams/${teamId}?fields=teams,id,parentOrgId`,
      { headers: UA },
    );
    if (!res.ok) throw new Error(`teams returned ${res.status}`);
    const data = (await res.json()) as { teams?: { parentOrgId?: number }[] };
    const orgId = data.teams?.[0]?.parentOrgId ?? null;
    orgCache.set(teamId, { orgId, fetchedAt: Date.now() });
    return orgId;
  } catch (err) {
    console.error('parent org lookup failed:', err);
    return null;
  }
}

/** The middle of an odd list, the mean of the middle two of an even one. */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * How many club games a turn takes, off the gaps between the starts he has
 * actually made — 5 for an ordinary five-man rotation, 6 for a club running six,
 * 4 for a club that has been leaning on four.
 *
 * **Counted in team games rather than days**, which is the whole trick: an off
 * day, a rain-out and the All-Star break all push a rotation back by exactly the
 * days they take out of the calendar, and none of them takes a turn out of the
 * run of games. Days would have to model every one of those; an index into the
 * club's own schedule models none of them and gets them all right.
 *
 * **The median rather than the mean**, because the outliers are the interesting
 * half of a pitcher's season: one IL stint of a month is a single gap of twenty
 * team games, which drags a mean off any real rotation and leaves the median
 * where it was. Gaps past `MAX_TURN_GAP` are dropped outright rather than
 * trusted to the median, so a man with three starts either side of a stint is
 * still placed off the two turns that really were consecutive.
 */
function cadenceOf(positions: number[]): number | null {
  const gaps: number[] = [];
  for (let i = 1; i < positions.length; i += 1) {
    const gap = positions[i] - positions[i - 1];
    if (gap >= 1 && gap <= MAX_TURN_GAP) gaps.push(gap);
  }
  if (gaps.length < MIN_STARTS - 1) return null;
  return Math.max(1, Math.round(median(gaps)));
}

/** His club's abbreviation for a game, and which end of it he is on. */
function toStart(
  g: ClubGame,
  teamId: number,
  announced: boolean,
  abbrevs: Map<number, string>,
  hands: Map<number, string | null>,
): ProjectedStart {
  const home = g.homeId === teamId;
  const opponentId = home ? g.awayId : g.homeId;
  const oppId = home ? g.awayProbableId : g.homeProbableId;
  const oppName = home ? g.awayProbableName : g.homeProbableName;
  const probablePitcher: ProbablePitcher | null =
    oppId !== null && oppName ? { id: oppId, name: oppName, hand: hands.get(oppId) ?? null } : null;
  return {
    gamePk: g.gamePk,
    date: g.date,
    startTime: g.startTime,
    home,
    opponentId,
    opponent: abbrevs.get(opponentId) ?? '—',
    announced,
    probablePitcher,
  };
}

/**
 * A pitcher's next several starts — the ones his club has named him for, and,
 * past those, the ones his own rotation slot puts him in.
 *
 * **What is announced is a fact and what is projected is a guess, and the two are
 * never mixed on one row.** MLB names probables a few days out; everything past
 * that is this file placing him on his club's remaining schedule at the cadence
 * his season has been pitched at. `ProjectedStart.announced` is what says which
 * a row is, and the client draws the two differently — the app's standing rule
 * that an estimate is marked as one, which the percentile card's dotted bubbles
 * and the Splits card's hatched fills already follow.
 *
 * **The method, in one paragraph.** Take the club's regular season as an ordered
 * run of games (postponements dropped, since one is rescheduled under a new id).
 * Find the positions in it of the games he has started; the median gap between
 * consecutive ones is his cadence. Anchor on the latest start we know of — an
 * announced future one if there is one, otherwise his last actual start — and
 * step forward a cadence at a time over the games still to be played. A slot
 * MLB has already given to somebody else is not his, so it is skipped and the
 * rest re-phased from wherever he lands, because a missed turn shifts everything
 * after it.
 *
 * **What it refuses to guess.** A pitcher with fewer than three starts has no
 * cadence to read (`too-few-starts`); a pitcher whose starts all belong to the
 * club that traded him has no slot in this one yet (`new-club`); and a pitcher
 * whose last start was more than two turns ago is a pitcher something has
 * happened to and whose slot is no longer his to project from
 * (`out-of-rotation`) — unless his club has named him for a game, which settles
 * it. In both cases whatever *is* announced still
 * comes back, because an announcement is a fact whatever we can or cannot infer
 * around it. Absence beats a wrong answer, which is this codebase's standing
 * preference and the one thing a projection must not get wrong.
 */
export async function getProjectedStarts(playerId: number): Promise<ProjectedStarts> {
  const today = baseballToday();
  // The season off the app's own definition of today rather than a constant:
  // this is a date-window read and `CLAUDE.md` lists eight places the season is
  // already pinned, none of which this needs to become a ninth of.
  const season = Number(today.slice(0, 4));
  const info = (await getRosterInfo([playerId])).get(playerId) ?? null;
  let teamId = info?.teamId ?? null;
  if (teamId === null) return { starts: [], cadence: null, refusal: 'no-schedule' };

  const [firstTry, starts] = await Promise.all([
    fetchClubSeason(teamId, season),
    getPitcherStarts(playerId, season).catch((err) => {
      console.error('projected-starts game log failed:', err);
      return [] as StartedGame[];
    }),
  ]);
  // No major-league schedule under that id means it is not a major-league club —
  // he is on a rehab assignment, and the club to project against is the org that
  // sent him there. See `parentOrgOf`.
  let games = firstTry;
  if (games.length === 0) {
    const orgId = await parentOrgOf(teamId);
    if (orgId !== null && orgId !== teamId) {
      teamId = orgId;
      games = await fetchClubSeason(orgId, season);
    }
  }
  if (games.length === 0) return { starts: [], cadence: null, refusal: 'no-schedule' };

  const at = new Map(games.map((g, i) => [g.gamePk, i]));
  const mine = (g: ClubGame): number | null =>
    g.homeId === teamId ? g.homeProbableId : g.awayProbableId;

  // **His starts for *this* club only.** A traded pitcher's earlier starts sit in
  // another club's run of games and say nothing about the slot he holds now, so
  // an id this schedule has never heard of drops out rather than being placed.
  const positions = starts
    .map((s) => at.get(s.gamePk))
    .filter((p): p is number => p !== undefined)
    .sort((a, b) => a - b);

  // Everything his club has already named him for. These are facts and they are
  // in the answer whatever the projection can or cannot do around them.
  const announcedAt = games
    .map((g, i) => (g.date > today && mine(g) === playerId ? i : -1))
    .filter((i) => i >= 0);

  const cadence = cadenceOf(positions);
  const lastPlayed = games.reduce((acc, g, i) => (g.date <= today ? i : acc), -1);

  const chosen: { index: number; announced: boolean }[] = announcedAt
    .slice(0, WANT)
    .map((index) => ({ index, announced: true }));

  let refusal: ProjectionRefusal | null = null;
  if (positions.length === 0) {
    // **He has started games and none of them are this club's**, which is a
    // trade rather than a career: checked on the live season, Kris Bubic's nine
    // starts are Kansas City's and his club is now the Dodgers, and Spencer
    // Arrighetti's seventeen are Houston's against a Toronto farm club. Reading
    // that as `not-a-starter` would print "he hasn't started a game this
    // season" over a man with a full rotation season behind him.
    refusal = starts.length === 0 ? 'not-a-starter' : 'new-club';
  } else if (positions.length < MIN_STARTS || cadence === null) {
    refusal = 'too-few-starts';
  } else {
    // The latest start we know of. An announcement outranks his own history: it
    // is his club saying where he is in the rotation *now*, which is the very
    // thing the cadence is being used to infer.
    const anchor = announcedAt.length ? announcedAt[announcedAt.length - 1] : positions[positions.length - 1];
    const missed = announcedAt.length ? 0 : Math.max(0, lastPlayed - anchor) / cadence;
    if (missed > MAX_TURNS_MISSED) {
      refusal = 'out-of-rotation';
    } else {
      let pos = anchor + cadence;
      let slips = 0;
      while (chosen.length < WANT && pos < games.length) {
        const g = games[pos];
        // Only games still to be played: one today is the day block's business
        // (a start today is his day), and one already behind us is not a start.
        if (g.date <= today) {
          pos += 1;
          continue;
        }
        const named = mine(g);
        if (named !== null && named !== playerId) {
          // Somebody else has the ball. His turn slid rather than vanished, so
          // step one game on and re-phase from wherever he actually lands —
          // until it is clear the rotation has been re-ordered under us, at
          // which point a shorter list beats a longer wrong one.
          if (slips >= MAX_SLIP) break;
          slips += 1;
          pos += 1;
          continue;
        }
        slips = 0;
        chosen.push({ index: pos, announced: named === playerId });
        pos += cadence;
      }
    }
  }

  chosen.sort((a, b) => a.index - b.index);
  const rows = chosen.slice(0, WANT);
  // One batched lookup for the opposing starters' hands — the schedule carries
  // no hand at all, hydrated or not, so it comes off the same `people` join
  // every roster status in the app already goes through. A failure costs the
  // rows their "RHP" and nothing else.
  const oppIds = [
    ...new Set(
      rows
        .map(({ index }) => {
          const g = games[index];
          return g.homeId === teamId ? g.awayProbableId : g.homeProbableId;
        })
        .filter((id): id is number => id !== null),
    ),
  ];
  const [abbrevs, hands] = await Promise.all([
    getTeamAbbrevs().catch(() => new Map<number, string>()),
    oppIds.length
      ? getRosterInfo(oppIds)
          .then((m) => new Map([...m].map(([id, v]) => [id, v.throws])))
          .catch(() => new Map<number, string | null>())
      : Promise.resolve(new Map<number, string | null>()),
  ]);

  return {
    starts: rows.map(({ index, announced }) =>
      toStart(games[index], teamId, announced, abbrevs, hands),
    ),
    cadence: refusal === null ? cadence : null,
    refusal,
  };
}
