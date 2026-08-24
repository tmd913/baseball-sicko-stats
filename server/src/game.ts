import type {
  GameBatterLine,
  GameBattingTotals,
  GameDecision,
  GameInning,
  GamePitcherLine,
  GamePitchingTotals,
  GameReport,
  GameRosterMan,
  GameStatus,
  GameTeamLine,
} from './types.js';
import type { PlayerReport } from './types.js';
import { isFinalStatus, isPostponedStatus, type GameStatusFields } from './mlbStats.js';
import { getDay } from './savant.js';
import { readBlob, writeBlob } from './storage.js';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/**
 * **One game, whole** — the box score, both clubs' rosters and the play stream,
 * for the page a live or finished opponent cell and a club's Results tab open.
 *
 * ## Why this is its own module and not a wider `StatsApiGame`
 *
 * `mlbStats.ts::getStatsApiGame` already reads this exact feed and already
 * caches it, so the obvious move was to widen that type and bump
 * `FEED_CACHE_VERSION`. It was measured and rejected on three counts.
 *
 * **What that type is cut for.** Every field on `StatsApiGame` is *per player*
 * — a batter's plate appearances, a pitcher's faced batters, a runner's base
 * events — because every reader of it is a player: the day snapshot, the feed,
 * the game log. A line score by inning, a bench, a bullpen and a list of the
 * game's own plays are facts about the **game**, and none of the four surfaces
 * that read a day would draw one.
 *
 * **What the bump would cost.** 622 settled feeds are frozen on disk under
 * `game-<pk>-v8.json`, and a version bump reads every one of them as a miss —
 * the whole season re-fetched from MLB to carry a field the day view does not
 * draw. The version rule exists to stop a stale blob serving nulls; paying it
 * for a field nothing in that pipeline reads is the rule applied where it does
 * not bite.
 *
 * **What it would cost a live day.** That module resolves a live game through
 * `diffPatch`, which is the whole reason a day of fifteen games can be re-read
 * every twenty seconds. This page reads **one** game, deliberately, and can
 * afford a plain fetch of it.
 *
 * So: one module, one blob namespace, one version, and nothing about the day
 * pipeline moves.
 *
 * ## The field filter, measured
 *
 * The unfiltered feed for a finished game is **697,054 bytes** (gamePk 822696,
 * WSH–CHC, 2026-08-13). With the whitelist below it is **110,199** — a 6.3×
 * cut — and every field this file reads survives it, checked leaf by leaf
 * against the full payload before a line of this was written. That is the
 * repo's own rule about upstreams: *probe before you build on one*, because a
 * `fields=` list is leaf-matched and a name left off does not fail, it returns
 * a column of nothing.
 *
 * The cut matters twice over: a settled game pays it once ever, and a **live**
 * one pays it every twenty seconds for as long as somebody is watching.
 */
const FEED_FIELDS = [
  // ── gameData ────────────────────────────────────────────────────────────
  'gameData',
  'datetime',
  'dateTime',
  'officialDate',
  'status',
  'abstractGameState',
  'codedGameState',
  'detailedState',
  'teams',
  'home',
  'away',
  'id',
  'name',
  'abbreviation',
  // gameData.players — every man in the game by id, which is where a bench or
  // bullpen row gets its name and the hand beside it. The boxscore's own
  // `players` map carries neither.
  'players',
  'fullName',
  'batSide',
  'pitchHand',
  'code',
  'venue',
  'gameInfo',
  'attendance',
  'gameDurationMinutes',
  'weather',
  'condition',
  'temp',
  'wind',
  'probablePitchers',
  // ── liveData.linescore ──────────────────────────────────────────────────
  'liveData',
  'linescore',
  'currentInning',
  'inningState',
  'isTopInning',
  'outs',
  'scheduledInnings',
  'innings',
  'num',
  'runs',
  'hits',
  'errors',
  'leftOnBase',
  // ── liveData.boxscore ───────────────────────────────────────────────────
  'boxscore',
  'person',
  'position',
  'battingOrder',
  'stats',
  'seasonStats',
  'batting',
  'pitching',
  'teamStats',
  'batters',
  'pitchers',
  'bench',
  'bullpen',
  'info',
  'label',
  'value',
  'note',
  'summary',
  'atBats',
  'doubles',
  'triples',
  'homeRuns',
  'strikeOuts',
  'baseOnBalls',
  'hitByPitch',
  'plateAppearances',
  'totalBases',
  'avg',
  'obp',
  'slg',
  'ops',
  'inningsPitched',
  'earnedRuns',
  'battersFaced',
  'numberOfPitches',
  'pitchesThrown',
  'strikes',
  'balls',
  'era',
  'whip',
  'wins',
  'losses',
  'saves',
  'holds',
  'gamesStarted',
  // ── liveData.decisions ──────────────────────────────────────────────────
  'decisions',
  'winner',
  'loser',
  'save',
  'type',
  'event',
  'eventType',
  'inning',
].join(',');

const feedUrl = (gamePk: number) =>
  `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live?fields=${FEED_FIELDS}`;

/**
 * The blob version. Bump it when a field is added to `GameReport` **or begins
 * to be filled** — a stored report deserializes with everything added since it
 * missing, so a stale one quietly serves nulls on a page whose whole content is
 * this object.
 *
 * **v2 narrowed `plays` to `scoringPlays`**, which is the same rule read the
 * other way: what is stored changed meaning, so a v1 blob would answer the
 * Overview with every play in the game where it now asks for five.
 */
const REPORT_VERSION = 2;

const blobKey = (gamePk: number) => `game-report-${gamePk}-v${REPORT_VERSION}.json`;

/**
 * A settled report, pinned for the life of the process.
 *
 * The same pin `getStatsApiGame` keeps and for the same reason — a page is
 * opened over and over on the same handful of games — with the same
 * consequence written down where it was found there: dropping a bad blob does
 * nothing until the server restarts.
 */
const memCache = new Map<number, GameReport>();

/* ────────────────────────────────────────────────────────────────────────────
 * The feed, as far as this file reads it
 * ──────────────────────────────────────────────────────────────────────────── */

interface FeedPerson {
  id?: number;
  fullName?: string;
}

interface BoxPlayer {
  person?: FeedPerson;
  position?: { abbreviation?: string };
  /** `"100"` is the man who started the first slot, `"801"` the second man in
   *  the eighth. Absent for anyone who never came up. */
  battingOrder?: string;
  stats?: { batting?: Record<string, unknown>; pitching?: Record<string, unknown> };
  seasonStats?: { batting?: Record<string, unknown>; pitching?: Record<string, unknown> };
}

interface BoxTeam {
  team?: { id?: number; name?: string; abbreviation?: string };
  teamStats?: { batting?: Record<string, unknown>; pitching?: Record<string, unknown> };
  players?: Record<string, BoxPlayer>;
  batters?: number[];
  pitchers?: number[];
  bench?: number[];
  bullpen?: number[];
}

interface Feed {
  gameData?: {
    status?: GameStatusFields;
    datetime?: { dateTime?: string; officialDate?: string };
    teams?: {
      home?: { id?: number; name?: string; abbreviation?: string };
      away?: { id?: number; name?: string; abbreviation?: string };
    };
    players?: Record<
      string,
      { id?: number; fullName?: string; batSide?: { code?: string }; pitchHand?: { code?: string } }
    >;
    venue?: { id?: number; name?: string };
    weather?: { condition?: string; temp?: string; wind?: string };
    gameInfo?: { attendance?: number; gameDurationMinutes?: number };
    probablePitchers?: { home?: FeedPerson; away?: FeedPerson };
  };
  liveData?: {
    linescore?: {
      currentInning?: number;
      inningState?: string;
      isTopInning?: boolean;
      outs?: number;
      scheduledInnings?: number;
      innings?: { num?: number; home?: { runs?: number }; away?: { runs?: number } }[];
      teams?: {
        home?: { runs?: number; hits?: number; errors?: number; leftOnBase?: number };
        away?: { runs?: number; hits?: number; errors?: number; leftOnBase?: number };
      };
    };
    boxscore?: {
      teams?: { home?: BoxTeam; away?: BoxTeam };
      info?: { label?: string; value?: string }[];
    };
    decisions?: { winner?: FeedPerson; loser?: FeedPerson; save?: FeedPerson };
  };
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/**
 * **Whether MLB has finished writing this game**, which is not the same
 * question as whether it is over and is the difference between a report it is
 * safe to freeze for ever and one that keeps a blank for ever.
 *
 * This is `mlbStats.ts::isSettledFeed`'s test, reached at the same three
 * branches and for the reasons recorded there at length: a final game MLB has
 * closed out names **both** a winner and a loser; a postponement or a
 * cancellation is settled the moment it is called; and a **tie** has neither by
 * definition, so it is read off the line score instead. That module's copy was
 * found by a hold that was missing from exactly 1 blob in 622, and this page's
 * box score would lose the same credit in the same window.
 *
 * It is restated rather than imported because that one takes `LiveFeed` — a
 * type private to a module whose payload is a different `fields=` cut of the
 * same endpoint. The two must move together; each names the other.
 */
function isSettled(feed: Feed): boolean {
  const status = feed.gameData?.status;
  if (!isFinalStatus(status)) return false;
  if (isPostponedStatus(status)) return true;
  const d = feed.liveData?.decisions;
  if (d?.winner?.id && d?.loser?.id) return true;
  const ls = feed.liveData?.linescore?.teams;
  const home = ls?.home?.runs;
  const away = ls?.away?.runs;
  return typeof home === 'number' && typeof away === 'number' && home === away;
}

/** The state the page's own head reads, off the same two predicates every other
 *  reading of a status in this app goes through. Postponed is tested first:
 *  MLB files a called-off game as `abstractGameState: "Final"`, so the final
 *  test would otherwise claim it. */
function buildStatus(feed: Feed): GameStatus {
  const s = feed.gameData?.status;
  const ls = feed.liveData?.linescore;
  const state: GameStatus['state'] = isPostponedStatus(s)
    ? 'postponed'
    : isFinalStatus(s)
      ? 'final'
      : s?.abstractGameState === 'Live'
        ? 'live'
        : 'scheduled';
  const live = state === 'live';
  return {
    state,
    detailedState: s?.detailedState ?? '',
    startTime: feed.gameData?.datetime?.dateTime ?? null,
    homeScore: numOrNull(ls?.teams?.home?.runs),
    awayScore: numOrNull(ls?.teams?.away?.runs),
    currentInning: numOrNull(ls?.currentInning),
    inningState: ls?.inningState ?? null,
    isTopInning: ls?.isTopInning ?? null,
    // The four that are only ever true of a live game, and which this page does
    // not draw at all: a `GameStatus` is one shape across the whole app, and a
    // second one differing in four nulls would be a second thing every reader
    // of a status has to know about. The bases and the men on them belong to
    // the *day* pipeline, which builds them from the offense block this cut of
    // the feed does not ask for.
    bases: null,
    outs: live ? num(ls?.outs) : null,
    atBatId: null,
    onDeckId: null,
    onBaseIds: [],
    pitchingId: null,
    inGamePitcherIds: [],
  };
}

/**
 * **`"801"` is the second man in the eighth slot**, which is the whole of what
 * this reads: MLB writes a batting order as the slot in hundreds and the depth
 * down it in units.
 *
 * It is what lets the box score indent a substitute under the man he came in
 * for rather than filing him as a tenth hitter — and a man who was in the game
 * and never came up carries no `battingOrder` at all, which is the null.
 */
function battingSlot(raw: string | undefined): { order: number | null; sub: number } {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return { order: null, sub: 0 };
  return { order: Math.floor(n / 100), sub: n % 100 };
}

function batterLine(id: number, p: BoxPlayer): GameBatterLine {
  const b = p.stats?.batting ?? {};
  const season = p.seasonStats?.batting ?? {};
  const { order, sub } = battingSlot(p.battingOrder);
  return {
    id,
    name: p.person?.fullName ?? '',
    pos: p.position?.abbreviation ?? null,
    order,
    sub,
    ab: num(b.atBats),
    r: num(b.runs),
    h: num(b.hits),
    rbi: num(b.rbi),
    bb: num(b.baseOnBalls),
    k: num(b.strikeOuts),
    hr: num(b.homeRuns),
    lob: num(b.leftOnBase),
    summary: str(b.summary),
    avg: str(season.avg),
    ops: str(season.ops),
  };
}

function pitcherLine(id: number, p: BoxPlayer): GamePitcherLine {
  const s = p.stats?.pitching ?? {};
  const season = p.seasonStats?.pitching ?? {};
  return {
    id,
    name: p.person?.fullName ?? '',
    // MLB's own `"5.2"`, kept as it comes off the wire: it is thirds of an
    // inning in the decimal place, so a number here would add up wrongly the
    // first time anything summed two of them.
    ip: str(s.inningsPitched) ?? '0.0',
    h: num(s.hits),
    r: num(s.runs),
    er: num(s.earnedRuns),
    bb: num(s.baseOnBalls),
    k: num(s.strikeOuts),
    hr: num(s.homeRuns),
    pitches: num(s.numberOfPitches),
    strikes: num(s.strikes),
    battersFaced: num(s.battersFaced),
    // `(W, 10-5)` — MLB writes the decision and the record it left him with as
    // one string beside his name, and re-deriving it from `decisions` would
    // lose the record half.
    decision: str(s.note),
    era: str(season.era),
    started: num(s.gamesStarted) > 0,
  };
}

function battingTotals(t: Record<string, unknown> | undefined): GameBattingTotals | null {
  if (!t || Object.keys(t).length === 0) return null;
  return {
    ab: num(t.atBats),
    r: num(t.runs),
    h: num(t.hits),
    rbi: num(t.rbi),
    bb: num(t.baseOnBalls),
    k: num(t.strikeOuts),
    lob: num(t.leftOnBase),
    avg: str(t.avg),
    ops: str(t.ops),
  };
}

function pitchingTotals(t: Record<string, unknown> | undefined): GamePitchingTotals | null {
  if (!t || Object.keys(t).length === 0) return null;
  return {
    ip: str(t.inningsPitched) ?? '0.0',
    h: num(t.hits),
    r: num(t.runs),
    er: num(t.earnedRuns),
    bb: num(t.baseOnBalls),
    k: num(t.strikeOuts),
    hr: num(t.homeRuns),
    pitches: num(t.numberOfPitches),
    strikes: num(t.strikes),
  };
}

function buildSide(
  box: BoxTeam | undefined,
  data: Feed['gameData'],
  which: 'home' | 'away',
): GameTeamLine {
  const info = data?.teams?.[which];
  const players = box?.players ?? {};
  const at = (id: number): BoxPlayer | undefined => players[`ID${id}`];

  /**
   * **The batting order, starters and substitutes interleaved.**
   *
   * `boxscore.batters` is the ids in the order they came up, which puts a pinch
   * hitter wherever he happened to bat rather than under the man he replaced.
   * Sorting by the slot MLB already writes into `battingOrder` (`801` after
   * `800`) is what makes the table read down the nine slots.
   *
   * **A man with no `battingOrder` is not in this table**, and that is a filter
   * rather than a sort: MLB appends the pitchers who took the mound to
   * `batters` whether or not they ever occupied a lineup slot, so in a game
   * with a designated hitter the batting table came out ten and eleven rows
   * long with the relievers on the end of it at `0 AB, .000, .000` — measured
   * on gamePk 822696, where Kevin Gausman and Aaron Civale sat under the Cubs'
   * nine. No box score has ever printed that.
   *
   * **The test is the slot rather than "is he a pitcher"**, which is what makes
   * it right in the games where it matters: a pitcher who *does* bat — no
   * designated hitter, or a club that has lost its DH — occupies a slot and
   * MLB gives him a `battingOrder`, so he stays. So does a defensive substitute
   * who came in and never came up, which a box score does print. What is
   * dropped is exactly the men who were never in the order.
   */
  const batters = (box?.batters ?? [])
    .map((id) => {
      const p = at(id);
      return p ? batterLine(id, p) : null;
    })
    .filter((b): b is GameBatterLine => b !== null && b.order !== null)
    .sort((a, b) => (a.order === b.order ? a.sub - b.sub : (a.order ?? 0) - (b.order ?? 0)));

  const pitchers = (box?.pitchers ?? [])
    .map((id) => {
      const p = at(id);
      return p ? pitcherLine(id, p) : null;
    })
    .filter((p): p is GamePitcherLine => p !== null);

  /**
   * A man on the roster who has not appeared. His **name and his hand come off
   * `gameData.players`** rather than the boxscore's own map — that one carries
   * the position but not the hand, and a roster is exactly the list a reader
   * scans for the left-handers (the rule the team page's Roster tab already
   * states). The position is the boxscore's, which is where it is.
   */
  const man = (id: number, arm: boolean): GameRosterMan => {
    const gd = data?.players?.[`ID${id}`];
    const hand = arm ? gd?.pitchHand?.code : gd?.batSide?.code;
    return {
      id,
      name: gd?.fullName ?? at(id)?.person?.fullName ?? '',
      pos: at(id)?.position?.abbreviation ?? null,
      hand: hand ?? null,
    };
  };

  const probable = data?.probablePitchers?.[which];
  return {
    teamId: info?.id ?? 0,
    name: info?.name ?? '',
    abbr: info?.abbreviation ?? '',
    runs: null,
    hits: null,
    errors: null,
    lob: null,
    probablePitcherId: probable?.id ?? null,
    probablePitcherName: probable?.fullName ?? null,
    batters,
    pitchers,
    bench: (box?.bench ?? []).map((id) => man(id, false)),
    bullpen: (box?.bullpen ?? []).map((id) => man(id, true)),
    batting: battingTotals(box?.teamStats?.batting),
    pitching: pitchingTotals(box?.teamStats?.pitching),
  };
}

/**
 * **The line score, exactly as far as MLB has written it.**
 *
 * One entry per inning *begun*, so a game in the fourth has four and a game
 * that went twelve has twelve. It is deliberately **not padded out to
 * `scheduledInnings`** here, and that is the whole of what this function had to
 * be measured to get right.
 *
 * A `null` half is one MLB has sent no number for, and that is **two different
 * facts wearing one absence**:
 *
 * - the bottom of the ninth with the home club ahead, which is the `x` a line
 *   score prints — measured on gamePk 822696, whose ninth arrives as
 *   `{"num":9,"away":{"runs":0},"home":{}}` on a final game;
 * - **a half being played that has not scored yet**, which arrives in exactly
 *   the same shape — measured on gamePk 823745 in the bottom of the eighth,
 *   `{"num":8,"home":{},"away":{"runs":0}}`.
 *
 * Nothing in the payload separates them, and the thing that does is the game's
 * own **state**, which the client already has. So the wire stays honest — null
 * means MLB sent no number — and the page draws `x` only on a game that is
 * over. Padding here would have made the two indistinguishable a third time
 * over, since a rain-shortened seven-inning final would have grown two innings
 * nobody played and drawn `x` in both of them.
 */
function buildInnings(feed: Feed): GameInning[] {
  return (feed.liveData?.linescore?.innings ?? []).map((i, idx) => ({
    num: i.num ?? idx + 1,
    away: numOrNull(i.away?.runs),
    home: numOrNull(i.home?.runs),
  }));
}

function buildDecisions(feed: Feed): GameDecision[] {
  const d = feed.liveData?.decisions;
  const out: GameDecision[] = [];
  const push = (role: GameDecision['role'], p: FeedPerson | undefined) => {
    if (typeof p?.id === 'number') out.push({ role, id: p.id, name: p.fullName ?? '' });
  };
  push('W', d?.winner);
  push('L', d?.loser);
  push('S', d?.save);
  return out;
}

function buildReport(gamePk: number, feed: Feed): GameReport {
  const ls = feed.liveData?.linescore;
  const box = feed.liveData?.boxscore;
  const scheduled = ls?.scheduledInnings ?? 9;
  const side = (which: 'home' | 'away'): GameTeamLine => {
    const line = buildSide(box?.teams?.[which], feed.gameData, which);
    const totals = ls?.teams?.[which];
    line.runs = numOrNull(totals?.runs);
    line.hits = numOrNull(totals?.hits);
    line.errors = numOrNull(totals?.errors);
    line.lob = numOrNull(totals?.leftOnBase);
    return line;
  };
  const w = feed.gameData?.weather;
  return {
    gamePk,
    status: buildStatus(feed),
    date: feed.gameData?.datetime?.officialDate ?? '',
    venueId: feed.gameData?.venue?.id ?? null,
    venueName: feed.gameData?.venue?.name ?? null,
    attendance: numOrNull(feed.gameData?.gameInfo?.attendance),
    durationMinutes: numOrNull(feed.gameData?.gameInfo?.gameDurationMinutes),
    // One sentence rather than three fields, because it is one line of prose on
    // the page and nothing computes with it. A game with neither reads null,
    // which is a park with the roof shut as often as it is a missing field.
    weather:
      w?.condition || w?.temp || w?.wind
        ? [w?.temp ? `${w.temp}°` : null, w?.condition ?? null, w?.wind ?? null]
            .filter(Boolean)
            .join(' · ')
        : null,
    away: side('away'),
    home: side('home'),
    innings: buildInnings(feed),
    scheduledInnings: scheduled,
    decisions: buildDecisions(feed),
    notes: (box?.info ?? [])
      // MLB puts the date in this list as a label with no value; everything
      // else is a genuine pair. A note with nothing on the right of it would
      // draw as a dangling term.
      .filter((i): i is { label: string; value: string } => !!i.label && !!i.value)
      .map((i) => ({ label: i.label, value: i.value })),
  };
}

/**
 * One game's report.
 *
 * **A settled game is frozen and never read again** — from memory first, then
 * from its blob, which is the same two-tier pin `getStatsApiGame` keeps. Every
 * other state (scheduled, live, and the half-hour between the last out and MLB
 * closing the box) goes to the wire every time, because every one of them is
 * still changing.
 *
 * A failed **write** is swallowed by `storage.ts`, which is the rule this whole
 * server keeps: a cache write must never fail a request that already has its
 * answer.
 */
export async function getGameReport(gamePk: number): Promise<GameReport> {
  const pinned = memCache.get(gamePk);
  if (pinned) return pinned;

  const key = blobKey(gamePk);
  const stored = await readBlob(key);
  if (stored !== null) {
    try {
      const report = JSON.parse(stored) as GameReport;
      memCache.set(gamePk, report);
      return report;
    } catch {
      // A blob that will not parse is a miss, not a failure — the wire has the
      // answer and the write below replaces it.
    }
  }

  const res = await fetch(feedUrl(gamePk), { headers: UA });
  if (!res.ok) throw new Error(`MLB game feed returned ${res.status} for ${gamePk}`);
  const feed = (await res.json()) as Feed;
  const report = buildReport(gamePk, feed);
  if (isSettled(feed)) {
    memCache.set(gamePk, report);
    await writeBlob(key, JSON.stringify(report));
  }
  return report;
}

/**
 * **The game's plays, as the feed draws them** — every plate appearance and
 * every base-running event, with the pitches, the batted-ball detail, the
 * expected numbers and the clip, exactly as the roster's stream and the player
 * page's Overview have them.
 *
 * ## Why this is the day pipeline rather than a shape of this file's own
 *
 * The Plays tab drew its own thin sentence list first — MLB's description, the
 * count, the score — and the answer to *"plays should be structured like they
 * are on the feed"* is not to grow that list until it resembles a feed item. A
 * feed item is a `PlateAppearanceCard`: the pitch sequence in the zone, the
 * exit velocity and the distance, xBA and xwOBA, the win-expectancy swing and
 * the video. Every one of those is already computed, per plate appearance, for
 * **every player in every game** — `savant.ts::getDay` merges MLB's feed with
 * Savant's day CSV and caches the result per date, which is the read the roster
 * view makes anyway.
 *
 * So this hands back the day's own `PlayerReport`s, narrowed to the one game,
 * and the client draws them with `playerDayEntries` and `FeedItem` — the same
 * two functions the feed and the player page use. **The three readings cannot
 * disagree about what happened**, which is the property `playerDayEntries` was
 * kept as one function for in the first place.
 *
 * ## Batters only
 *
 * A pitcher's stream item is his **whole outing**, which is a different reading
 * of this game and one the Box Score tab already holds — and his own base
 * events are rows inside that outing rather than items (see
 * `LiveFeed.tsx::baseEntries`, which states why). What is wanted here is the
 * game play by play, and that is the batters' side: their plate appearances and
 * their base running, which is every play there is.
 *
 * ## The cost
 *
 * One `getDay` for the game's date, which is cached per date in memory and
 * snapshotted on disk once the day is settled — so a past game is a disk read
 * and today's game is the copy the roster is already holding. Measured cold:
 * **1,002ms** for 2026-08-13 and **385ms** for the live day, against **19** and
 * **18** batters, **64** and **74** plate appearances, and payloads of
 * **149,606** and **178,785** bytes. That is why it is a **route of its own,
 * read when the tab opens** rather than a field on `GameReport`: a reader who
 * came for the box score never pays for it.
 */
export async function getGamePlays(gamePk: number): Promise<PlayerReport[]> {
  // The date off the game's own report rather than off the caller, which is
  // what keeps the two reads talking about the same game: a settled report is
  // a memory hit, and an unsettled one is a fetch this route would have had to
  // make anyway to know which day to ask for.
  const report = await getGameReport(gamePk);
  if (!report.date) return [];
  const day = await getDay(report.date);
  const out: PlayerReport[] = [];
  for (const [key, rep] of day.reports) {
    if (!key.startsWith('batter-')) continue;
    const game = rep.games.find((g) => g.gamePk === gamePk);
    if (!game) continue;
    // **Narrowed to the one game**, which is most of what makes the payload the
    // size it is: a report holds every game of the range it was built for, and
    // a man who played a doubleheader would otherwise send both.
    out.push({ ...rep, games: [game] });
  }
  return out;
}
