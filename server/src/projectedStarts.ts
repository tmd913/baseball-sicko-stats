import type {
  ProjectedStart,
  ProjectedStarts,
  ProbablePitcher,
  ScheduleGame,
  StartTier,
} from './types.js';
import { baseballToday } from './etDate.js';
import { getRosterInfo, getTeamAbbrevs } from './mlbStats.js';
import { getSeasonRead } from './schedule.js';
import { clubFor, projectStarts, startPositions } from './rotations.js';

/**
 * How many starts to answer with. **Five again, where this briefly said
 * three.** The trim to three was argued from the same measurement restated
 * here rather than hedged around: walking the 2026 season and projecting
 * each pitcher's next turns off only what was known then, the run is
 * **73.0% exact for the next start, 57.0% for the second and 46.6% for the
 * third**, then **39.1% and 33.5%** for the fourth and fifth (81.0% down to
 * 45.4% over the 40 busiest starters). That decay is real and the two extra
 * rows are read with it in view rather than hidden from it — a projected row
 * is muted and tagged, and the block's own note names the cadence it was built
 * from rather than claiming a date.
 *
 * **The upstream cost the trim was written to avoid is not paid at all now.**
 * It was one club-season read plus one game-log read per pitcher, and both are
 * gone: the whole projection comes off the league-wide schedule `schedule.ts`
 * already holds for the Schedule view (see `rotations.ts`). What is left is the
 * opposing starters' hands, which is one batched `people` lookup — and measured
 * against the live season the opposing probable is on **39 of 151 first rows
 * (25.8%) and 0 of the 568 rows behind them**, MLB naming one about three days
 * out where a fifth turn is three to four weeks off.
 */
const WANT = 5;

/**
 * His club's abbreviation for a game, and which end of it he is on.
 *
 * `announced` rides alongside `tier` rather than being derived from it: it is
 * the one distinction every older client reads, and `tier === 'announced'` is
 * the same test.
 */
function toStart(
  g: ScheduleGame,
  teamId: number,
  tier: StartTier,
  names: Map<number, string>,
  hands: Map<number, string | null>,
  abbrevs: Map<number, string>,
  /** How many games his club plays that day — 1 all but a handful of times a
   *  season, and the test that decides whether the row names its half. See
   *  `ProjectedStart.gameNumber`. */
  onTheDay: number,
): ProjectedStart {
  const home = g.homeId === teamId;
  const opponentId = home ? g.awayId : g.homeId;
  const oppId = home ? g.awayProbableId : g.homeProbableId;
  const oppName = oppId === null ? undefined : names.get(oppId);
  const probablePitcher: ProbablePitcher | null =
    oppId !== null && oppName
      ? { id: oppId, name: oppName, hand: hands.get(oppId) ?? null }
      : null;
  return {
    gamePk: g.gamePk,
    date: g.date,
    startTime: g.startTime,
    home,
    opponentId,
    venueId: g.venueId,
    opponent: abbrevs.get(opponentId) ?? '—',
    announced: tier === 'announced',
    // Only where there is a second game to be told apart from — a `1` on every
    // ordinary row is a mark that marks nothing.
    gameNumber: onTheDay > 1 ? g.gameNumber : null,
    tier,
    probablePitcher,
  };
}

/**
 * A pitcher's next five starts — the ones his club has named him for, and, past
 * those, the ones his rotation slot puts him in.
 *
 * **The method, the constants and the refusals are all `rotations.ts`'s**, and
 * that is the point rather than an implementation detail: the Schedule view's
 * grid draws the same projection for six hundred pitchers at once, and the two
 * can only be *known* to agree while they are one function over one payload. A
 * reader who sees a projected turn on a board row and opens the player page
 * behind it gets the same date because there is only one place the date comes
 * from. What is left in this file is the shape the player page wants: five rows,
 * the opposing starter's hand, and the club abbreviations.
 *
 * **Which club he is on** is `getRosterInfo`'s answer where it names a
 * major-league one, and the club he was most recently named to start for
 * otherwise. That second half is what makes a **rehab assignment** work with no
 * case of its own: a pitcher on one has a minor-league `currentTeam` (checked on
 * the live season — Edward Cabrera's is the Knoxville Smokies), which has no
 * major-league schedule at all, and the club he last started for is exactly the
 * club to project against. It replaces a `parentOrgId` lookup that existed for
 * that one case and is better than it, being derived from where he has actually
 * pitched rather than from a farm system's parentage.
 */
export async function getProjectedStarts(playerId: number): Promise<ProjectedStarts> {
  const today = baseballToday();
  const [read, info] = await Promise.all([
    getSeasonRead(),
    getRosterInfo([playerId])
      .then((m) => m.get(playerId) ?? null)
      .catch((err) => {
        // His club is a nicety here rather than a requirement — the schedule
        // itself says which club he has been pitching for.
        console.error('projected-starts roster lookup failed:', err);
        return null;
      }),
  ]);
  const { season, byPk, names } = read;

  // Which club's schedule to place him on — `clubFor`'s rule, shared with the
  // grid so the two cannot resolve the same pitcher to two clubs and draw two
  // different sets of dates. See there; it is a mistake this once made.
  const teamId = clubFor(season, playerId, info?.teamId ?? null);
  const run = teamId === null ? undefined : season.runs.get(teamId);
  if (teamId === null || !run) return { starts: [], cadence: null, refusal: 'no-schedule' };

  const positions = startPositions(run, playerId, today);
  const p = projectStarts({
    run,
    playerId,
    today,
    positions,
    clubTurn: season.cadences.get(teamId) ?? null,
    startedElsewhere: (season.startsAnywhere.get(playerId) ?? 0) > positions.length,
    // **Off the active roster is not projectable** — the same rule the grid
    // applies league-wide, off the status this route was already fetching for
    // his club. A status we could not read leaves him projectable, which is the
    // direction every join in this file fails in.
    projectable: info?.status == null || info.status.code === 'A',
    want: WANT,
  });

  const rows = p.turns.flatMap(({ index, tier }) => {
    const g = byPk.get(run[index].gamePk);
    return g ? [{ g, tier }] : [];
  });
  // One batched lookup for the opposing starters' hands — the schedule carries a
  // name and no hand, hydrated or not, so it comes off the same `people` join
  // every roster status in the app already goes through. A failure costs the rows
  // their counterpart's "RHP" and nothing else.
  const oppIds = [
    ...new Set(
      rows
        .map(({ g }) => (g.homeId === teamId ? g.awayProbableId : g.homeProbableId))
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

  // How many games his club plays on each day one of his turns falls on. It is
  // counted off the club's own run rather than off `rows`, which holds at most
  // one half of any pair — his turn is one game, and the fact the row needs is
  // about the *day*.
  const onDay = new Map<string, number>();
  for (const g of run) onDay.set(g.date, (onDay.get(g.date) ?? 0) + 1);

  return {
    starts: rows.map(({ g, tier }) =>
      toStart(g, teamId, tier, names, hands, abbrevs, onDay.get(g.date) ?? 1),
    ),
    cadence: p.cadence,
    refusal: p.refusal,
  };
}
