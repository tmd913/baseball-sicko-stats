import { readJsonBlob, writeJsonBlob } from './storage.js';
import { LEAGUE_HR_PER_FB, fipLike, ipToOuts } from './leagueRates.js';
import { teamStatcast, windowDates } from './statcastWindow.js';
import { getTeamAbbrevs } from './mlbStats.js';
import { addDays, baseballToday, daysBetween } from './etDate.js';
import { RESEARCH_WINDOWS } from './types.js';
import type { PlayerKind, PlayerWindows, ResearchRow, ResearchWindow } from './types.js';

/**
 * **The research board read as thirty clubs instead of six hundred players.**
 *
 * The same row type, the same column vocabulary and the same windows — a club
 * is simply a different *population* of the one board, which is why this file
 * hands back `ResearchRow[]` rather than a shape of its own. Everything
 * downstream (the sort, the filter builder, the percentile scales, the column
 * picker, the paging) then works untouched, exactly as the Schedule view's
 * column swap does one file over.
 *
 * ## Where the two halves come from
 *
 * **The MLB half is a leaderboard of teams**, and it is the same endpoint
 * family the player board reads, one path segment along:
 * `teams/stats?stats=season|byDateRange&group=hitting|pitching`. Probed before
 * anything was built on it, and it answers properly in all four combinations —
 * 30 splits each, carrying every field `research.ts::buildBase` reads off the
 * player leaderboard (`plateAppearances`, `battersFaced`, `strikeoutsPer9Inn`,
 * `outs`, `earnedRuns` and the rest), so FIP comes out of `fipLike` here on
 * exactly the inputs it does there. Note this is *not* the endpoint
 * `teamHitting.ts` records as useless: that file wanted a windowed **split**
 * (home only, versus left-handers), and it is `sitCodes` that `byDateRange`
 * ignores. An unsplit team line over a range comes back correctly.
 *
 * **The Statcast half is summed a day at a time**, off the two club axes
 * `statcastWindow.ts` now tallies beside its two player ones. Savant publishes
 * `expected_statistics?type=batter-team` and `leaderboard/statcast?type=batter-team`
 * — 30 rows each, both populated — but publishes **no** team cut of the two
 * boards the rest of the columns live on: `custom?type=batter-team` returns the
 * 637-row player board (the `type` select on that page offers Batters and
 * Pitchers and nothing else), and `batted-ball?type=batter-team` returns 633
 * rows with `id` and `name` blank. So Whiff%, Chase%, F-Str%, GB/LD/FB%,
 * PulAir% and Bat are reachable for a club from no leaderboard, and none of the
 * team boards takes a date range at all. Summing the days answers every column
 * on every span with one rule; the alternative — a leaderboard season beside a
 * summed window — is a board whose columns empty when the reader presses a tab.
 *
 * **The record is read from the standings on a season board and off the
 * schedule on a windowed one**, which is the same split `research.ts` already
 * makes for its team game counts and for the same reason: the standings carry
 * a season total and nothing else.
 *
 * ## What a club row deliberately has not got
 *
 * `position`, `positionType` and `starter` are empty/false, and the client
 * draws no position list, no hand and none of the four per-player marks on a
 * team row — a club has no position to be eligible at and no hand to hit from.
 *
 * `qualified` is **false on every row**, and that is a decision rather than an
 * omission. Savant's bar (2.1 PA per team game) is a rule for separating
 * players who have played enough from players who have not; thirty clubs have
 * all played the whole span, so every one of them would clear any bar and the
 * flag would partition nothing. False is what routes `rankScales` down its
 * already-written "nobody qualifies" path: the scale is built over **all
 * thirty clubs**, no row wears the dashed ring (a mark every row would carry
 * marks nothing), and every badge's tooltip says "of the 30 clubs" rather than
 * borrowing a player population's noun. What must never happen is a percentile
 * against six hundred players rendering under a club's aggregate, and a
 * separate population is what prevents it.
 *
 * `xera` and `sprintSpeed` stay null and their columns are not drawn for a
 * club: xERA is Savant's own model and its team expected-stats board carries no
 * `xera` column at all, and sprint speed is not in a pitch row (the same two
 * absences a *window* has on the player board, for the same two reasons).
 */

// Keep in sync with hfSea in savant.ts, CURRENT_SEASON in percentiles.ts, and
// SEASON in xwoba.ts / pitcherArsenal.ts / teamHitting.ts / expectedStats.ts /
// research.ts.
const SEASON = 2026;

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/** The same 6h the player board and the team hitting board settle on. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** MLB prints rate stats as strings and counts as numbers, exactly as it does
 *  on the player leaderboard — the same two readers, kept identical so a club's
 *  ERA is parsed by the rule a pitcher's is. */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function int(v: unknown): number {
  return num(v) ?? 0;
}

interface TeamSplit {
  stat?: Record<string, unknown>;
  team?: { id?: number; name?: string };
}
interface TeamStatsResponse {
  stats?: { splits?: TeamSplit[] }[];
}

/** The first and last date a window covers — `statcastWindow`'s own dates, so
 *  the MLB line and the Statcast half describe the same days rather than
 *  differing by whatever each thought "the last 7 days" meant. A season runs
 *  from **1 March**, the boundary `teamHitting.ts` already uses and for the
 *  reason recorded there: Savant is asked for regular-season rows only, so a
 *  spring date contributes nothing and needs no special case. */
function spanDays(window: ResearchWindow): number {
  if (window !== 'season') return window;
  const end = addDays(baseballToday(), -1);
  return Math.max(1, daysBetween(`${end.slice(0, 4)}-03-01`, end) + 1);
}

function teamsUrl(kind: PlayerKind, window: ResearchWindow): string {
  const group = kind === 'pitcher' ? 'pitching' : 'hitting';
  const base = `https://statsapi.mlb.com/api/v1/teams/stats?group=${group}&season=${SEASON}&sportId=1`;
  if (window === 'season') return `${base}&stats=season`;
  const d = windowDates(window);
  return `${base}&stats=byDateRange&startDate=${d[0]}&endDate=${d[d.length - 1]}`;
}

// ---- The record ------------------------------------------------------------

type Record_ = { wins: number; losses: number };

/**
 * Every club's won-lost record over the span.
 *
 * **Season: the standings.** One request, MLB's own totals, and the only
 * authority on them — `research.ts::getTeamGames` already reads this endpoint
 * for `gamesPlayed` and `wins`/`losses` ride on the very same `teamRecords`
 * rows, so this is that call with two more fields asked for.
 *
 * **A window: the schedule**, counted off `isWinner`, which is the same
 * traversal `getTeamGamesInRange` makes for its finals count with one field
 * added. A postponement is excluded by the same `codedGameState === 'F'` test —
 * a called-off game is not a loss.
 */
async function getRecords(window: ResearchWindow): Promise<Map<number, Record_>> {
  const out = new Map<number, Record_>();
  if (window === 'season') {
    const url =
      'https://statsapi.mlb.com/api/v1/standings?leagueId=103,104' +
      `&season=${SEASON}&fields=records,teamRecords,team,id,wins,losses`;
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`MLB Stats API standings returned ${res.status}`);
    const data = (await res.json()) as {
      records?: { teamRecords?: { team?: { id?: number }; wins?: number; losses?: number }[] }[];
    };
    for (const rec of data.records ?? []) {
      for (const tr of rec.teamRecords ?? []) {
        if (tr.team?.id !== undefined && typeof tr.wins === 'number' && typeof tr.losses === 'number') {
          out.set(tr.team.id, { wins: tr.wins, losses: tr.losses });
        }
      }
    }
    return out;
  }
  const d = windowDates(window);
  const url =
    'https://statsapi.mlb.com/api/v1/schedule?sportId=1&gameType=R' +
    `&startDate=${d[0]}&endDate=${d[d.length - 1]}` +
    '&fields=dates,games,status,codedGameState,teams,away,home,team,id,isWinner';
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`MLB Stats API schedule returned ${res.status}`);
  const data = (await res.json()) as {
    dates?: {
      games?: {
        status?: { codedGameState?: string };
        teams?: {
          away?: { team?: { id?: number }; isWinner?: boolean };
          home?: { team?: { id?: number }; isWinner?: boolean };
        };
      }[];
    }[];
  };
  for (const day of data.dates ?? []) {
    for (const g of day.games ?? []) {
      if (g.status?.codedGameState !== 'F') continue;
      for (const side of [g.teams?.away, g.teams?.home]) {
        const id = side?.team?.id;
        // A finished game MLB has not marked a winner on either side of — a tie
        // it has yet to file — counts for neither club rather than for both.
        if (id === undefined || typeof side?.isWinner !== 'boolean') continue;
        const rec = out.get(id) ?? { wins: 0, losses: 0 };
        if (side.isWinner) rec.wins++;
        else rec.losses++;
        out.set(id, rec);
      }
    }
  }
  return out;
}

// ---- Assembly --------------------------------------------------------------

async function buildRows(kind: PlayerKind, window: ResearchWindow): Promise<ResearchRow[]> {
  const [res, abbrevs, records] = await Promise.all([
    fetch(teamsUrl(kind, window), { headers: UA }),
    getTeamAbbrevs(),
    // A failed standings read costs the record cell and nothing else — the
    // table is the thirty stat lines, and a row with no record still answers
    // every question the board is opened with.
    getRecords(window).catch((err) => {
      console.error(`Team research: ${window} records unavailable:`, err);
      return new Map<number, Record_>();
    }),
  ]);
  if (!res.ok) {
    throw new Error(`MLB Stats API ${kind} team leaderboard returned ${res.status}`);
  }
  const data = (await res.json()) as TeamStatsResponse;
  const splits = data.stats?.[0]?.splits ?? [];

  const rows: ResearchRow[] = [];
  for (const sp of splits) {
    const id = sp.team?.id;
    const name = sp.team?.name;
    const s = sp.stat;
    if (id === undefined || !name || !s) continue;
    const abbr = abbrevs.get(id) ?? '';

    const row: ResearchRow = {
      // **The club's own MLB id where a player row carries his.** It is what
      // the cap logo is served by and what the client's color table is keyed
      // on, so the identity block needs no second vocabulary; and it keeps the
      // board's row key (`${kind}-${id}`) unique within a reading, which is all
      // that key has ever had to be.
      id,
      name,
      // Nothing on a club row is joined against Savant by name — the Statcast
      // half joins on the abbreviation — so this is the plain name rather than
      // a fold that would claim a correspondence it has not got.
      savantName: name,
      kind,
      team: abbr,
      teamId: id,
      // A club plays every position and none. Left empty rather than given a
      // placeholder: the client draws the record in this line's place, and an
      // empty string is what `positionCell` already treats as nothing to say.
      position: '',
      positionType: '',
      games: int(s.gamesPlayed),
      starter: false,
      // False on purpose — see the head of this file.
      qualified: false,
      record: records.get(id) ?? null,
      xba: null, xslg: null, xwoba: null,
      exitVelocity: null, launchAngle: null, barrelRate: null, hardHitRate: null,
      sweetSpotRate: null, gbRate: null, ldRate: null, fbRate: null,
      pullAirRate: null, whiffRate: null, chaseRate: null,
      firstPitchStrikeRate: null, batSpeed: null, sprintSpeed: null,
      pa: null, ab: null, hits: null, doubles: null, triples: null,
      hr: null, runs: null, rbi: null, walks: null, strikeouts: null,
      sb: null, cs: null, avg: null, obp: null, slg: null, ops: null, babip: null,
      wins: null, losses: null, saves: null, holds: null, gamesStarted: null,
      inningsPitched: null, era: null, whip: null, strikeoutsPer9: null,
      walksPer9: null, homeRunsPer9: null, battersFaced: null,
      avgAgainst: null, xera: null, hitBatsmen: null, strikes: null,
      pitches: null, fip: null, xfip: null,
    };

    // The two halves are read field for field exactly as `research.ts` reads a
    // player's, because they are the same payload shape — which is what lets
    // one column vocabulary draw both.
    if (kind === 'pitcher') {
      row.gamesStarted = int(s.gamesStarted);
      row.wins = int(s.wins);
      row.losses = int(s.losses);
      row.saves = int(s.saves);
      row.holds = int(s.holds);
      row.inningsPitched = typeof s.inningsPitched === 'string' ? s.inningsPitched : null;
      row.outs = int(s.outs);
      row.era = num(s.era);
      row.whip = num(s.whip);
      row.strikeoutsPer9 = num(s.strikeoutsPer9Inn);
      row.walksPer9 = num(s.walksPer9Inn);
      row.homeRunsPer9 = num(s.homeRunsPer9);
      row.battersFaced = int(s.battersFaced);
      row.avgAgainst = num(s.avg);
      row.hits = int(s.hits);
      row.hr = int(s.homeRuns);
      row.runs = int(s.runs);
      row.earnedRuns = int(s.earnedRuns);
      row.walks = int(s.baseOnBalls);
      row.strikeouts = int(s.strikeOuts);
      row.hitBatsmen = int(s.hitBatsmen);
      row.strikes = int(s.strikes);
      row.pitches = int(s.numberOfPitches);
      row.fip = fipLike(
        row.hr,
        row.walks,
        row.hitBatsmen,
        row.strikeouts,
        ipToOuts(row.inningsPitched),
      );
    } else {
      row.pa = int(s.plateAppearances);
      row.ab = int(s.atBats);
      row.hits = int(s.hits);
      row.doubles = int(s.doubles);
      row.triples = int(s.triples);
      row.hr = int(s.homeRuns);
      row.runs = int(s.runs);
      row.rbi = int(s.rbi);
      row.walks = int(s.baseOnBalls);
      row.strikeouts = int(s.strikeOuts);
      row.sb = int(s.stolenBases);
      row.cs = int(s.caughtStealing);
      row.avg = num(s.avg);
      row.obp = num(s.obp);
      row.slg = num(s.slg);
      row.ops = num(s.ops);
      row.babip = num(s.babip);
    }
    rows.push(row);
  }
  return rows;
}

/** The Statcast half, joined on the abbreviation the day export carries. A club
 *  the join cannot place is left with nulls rather than matched to a guess. */
async function enrich(
  rows: ResearchRow[],
  kind: PlayerKind,
  window: ResearchWindow,
): Promise<void> {
  const byTeam = new Map(rows.filter((r) => r.team).map((r) => [r.team, r]));
  let stat;
  try {
    stat = await teamStatcast(kind, spanDays(window));
  } catch (err) {
    // The same rule the player board's Savant half follows: this costs its own
    // columns a value on every row, never the table — the MLB line is in hand.
    console.error(`Team research: ${window} Statcast unavailable:`, err);
    return;
  }
  for (const [team, v] of stat) {
    const row = byTeam.get(team);
    if (!row) continue;
    row.xba = v.xba;
    row.xslg = v.xslg;
    row.xwoba = v.xwoba;
    row.exitVelocity = v.exitVelocity;
    row.launchAngle = v.launchAngle;
    row.barrelRate = v.barrelRate;
    row.hardHitRate = v.hardHitRate;
    row.sweetSpotRate = v.sweetSpotRate;
    row.gbRate = v.gbRate;
    row.ldRate = v.ldRate;
    row.fbRate = v.fbRate;
    row.pullAirRate = v.pullAirRate;
    row.whiffRate = v.whiffRate;
    row.chaseRate = v.chaseRate;
    row.firstPitchStrikeRate = v.firstPitchStrikeRate;
    row.batSpeed = v.batSpeed;
    // xFIP off the window's own fly balls, exactly as both player paths do it —
    // same helper, same league rate, so a club's xFIP means what a pitcher's
    // does.
    if (kind === 'pitcher') {
      row.xfip =
        v.flyBalls > 0
          ? fipLike(
              v.flyBalls * LEAGUE_HR_PER_FB,
              row.walks ?? 0,
              row.hitBatsmen ?? 0,
              row.strikeouts ?? 0,
              row.outs ?? 0,
            )
          : null;
    }
  }
}

// ---- Cache ----------------------------------------------------------------

interface Cached {
  season: number;
  window: ResearchWindow;
  rows: ResearchRow[];
}

type BoardKey = `${PlayerKind}:${ResearchWindow}`;
const boardKey = (kind: PlayerKind, window: ResearchWindow): BoardKey => `${kind}:${window}`;

const mem = new Map<BoardKey, { data: Cached; fetchedAt: number }>();
const inFlight = new Map<BoardKey, Promise<Cached>>();

/** `-v1`, and bumped on the rule the player board's own key carries: a stored
 *  blob deserializes with every field added since it missing, and a field that
 *  has *begun* to be filled or *begun* to be read is the same fault wearing a
 *  null. */
const storeKey = (kind: PlayerKind, window: ResearchWindow) =>
  `team-research-${kind}-${window}-${SEASON}-v1.json`;

/**
 * Thirty clubs on one board over one window — the research table's team
 * reading.
 *
 * The MLB half throwing fails the request, exactly as it does on the player
 * board: without it there are no rows. The Statcast half failing empties its
 * own columns, and a failed standings read costs the record alone.
 */
export async function getTeamResearch(
  kind: PlayerKind,
  window: ResearchWindow = 'season',
): Promise<Cached> {
  const key = boardKey(kind, window);
  const hit = mem.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.data;

  const running = inFlight.get(key);
  if (running) return running;

  const p = (async () => {
    const stored = await readJsonBlob<Cached>(
      storeKey(kind, window),
      (_v, cachedAt) => Date.now() - cachedAt < CACHE_TTL_MS,
    );
    if (stored) {
      mem.set(key, { data: stored, fetchedAt: Date.now() });
      return stored;
    }
    const rows = await buildRows(kind, window);
    await enrich(rows, kind, window);
    const data: Cached = { season: SEASON, window, rows };
    mem.set(key, { data, fetchedAt: Date.now() });
    await writeJsonBlob(storeKey(kind, window), data);
    return data;
  })();
  inFlight.set(key, p);
  try {
    return await p;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * **One club's row on all five boards at once** — the team page's Stats tab,
 * which is this board transposed exactly as the player page's is.
 *
 * The same shape `research.ts::getPlayerWindows` answers in (`PlayerWindows`),
 * and deliberately the same: the table that draws it is `PlayerWindowTable`,
 * one component over one vocabulary, so a club and a player read down the same
 * column set with the same percentile badges. A shape of its own here would be
 * a second thing for that table to accept for no difference in the answer.
 *
 * **It costs no upstream call the board has not already made.** Each span is
 * `getTeamResearch`'s own cached board, so the first read of this warms five
 * boards the research view then opens instantly on, and every read after is
 * five map lookups.
 *
 * `row: null` for a span the club is missing from, which on a team board can
 * only be a failed enrich or an upstream that dropped a club — thirty clubs
 * play every window, where a *player* legitimately has nothing in a 7-day one.
 * The table draws the same dash either way.
 */
export async function getTeamWindows(teamId: number, kind: PlayerKind): Promise<PlayerWindows> {
  const windows = await Promise.all(
    RESEARCH_WINDOWS.map((window) =>
      getTeamResearch(kind, window).then((b) => ({
        window,
        row: b.rows.find((r) => r.id === teamId) ?? null,
      })),
    ),
  );
  return { season: SEASON, kind, windows };
}
