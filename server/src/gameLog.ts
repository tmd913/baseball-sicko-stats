import type {
  BatterGameLog,
  GameLogEntry,
  GameLogGap,
  GameStatus,
  PitcherGameLog,
  PitchingCredit,
  PlayerStint,
} from './types.js';
import { getSeasonArsenal, type Appearances } from './pitcherArsenal.js';
import { fipLike } from './leagueRates.js';
import { stateOf, type StatusFields } from './schedule.js';
import { getPlayerStints, statusOn } from './stints.js';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/** A finished game log only moves when a game ends, and the details view is
 *  opened over and over on the same handful of players — 30 min matches the
 *  season lines. */
const GAME_LOG_TTL = 30 * 60 * 1000;
/**
 * What a log holding a game **still being played** is cached for instead.
 *
 * The 30 minutes above is right for a row that cannot change and wrong for the
 * one row that can: a log now says which of its games is live, and at the long
 * TTL a game that ended would keep saying so for half an hour — the same lie
 * this file was fixed to stop telling, wearing the other face. A minute is the
 * span `savant.ts` reaches for on a live day (15s there, over a *day's* games —
 * this is the season schedule at ~900KB and one player's splits, so it is
 * deliberately slower) and is well inside a half-inning.
 */
const LIVE_LOG_TTL = 60 * 1000;
/** Team ids and their abbreviations change once a decade. */
const TEAMS_TTL = 24 * 60 * 60 * 1000;
/** Scores and states go stale only for a game still being played — so the
 *  season schedule takes the same two spans the logs it feeds do. */
const SCORES_TTL = GAME_LOG_TTL;

interface TeamsResponse {
  teams?: { id: number; abbreviation?: string; name?: string }[];
}

let teamsCache: { abbrevs: Map<number, string>; fetchedAt: number } | null = null;

/** "MIL" for each team id. The game log's `opponent` carries only id + full
 *  name, and a full name is three times the width of the column it sits in. */
async function getTeamAbbrevs(): Promise<Map<number, string>> {
  const now = Date.now();
  if (teamsCache && now - teamsCache.fetchedAt < TEAMS_TTL) return teamsCache.abbrevs;
  const url = 'https://statsapi.mlb.com/api/v1/teams?sportId=1&fields=teams,id,abbreviation';
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`teams returned ${res.status}`);
    const data = (await res.json()) as TeamsResponse;
    const abbrevs = new Map<number, string>();
    for (const t of data.teams ?? []) {
      if (t.abbreviation) abbrevs.set(t.id, t.abbreviation);
    }
    teamsCache = { abbrevs, fetchedAt: now };
    return abbrevs;
  } catch (err) {
    console.error('team abbreviations fetch failed:', err);
    // A missing abbreviation costs the column its short form, not the log.
    return teamsCache?.abbrevs ?? new Map();
  }
}

interface ScheduleResponse {
  dates?: {
    date?: string;
    games?: {
      gamePk?: number;
      officialDate?: string;
      status?: StatusFields;
      teams?: {
        away?: { score?: number; team?: { id?: number } };
        home?: { score?: number; team?: { id?: number } };
      };
      lineups?: { homePlayers?: { id?: number }[]; awayPlayers?: { id?: number }[] };
    }[];
  }[];
}

/** What the schedule tells us about one game that its own log rows can't. */
interface ScheduledGame {
  // Where the game is, classified by `schedule.ts::stateOf` — the one place in
  // the app that knows MLB files a postponement under `abstractGameState:
  // "Final"`, and the reason this is not a fourth reading of those keys.
  state: GameStatus['state'];
  // MLB's label, kept as it comes off the wire.
  detailedState: string;
  homeScore: number | null;
  awayScore: number | null;
  // The posted batting orders, in order — index + 1 is the slot. Empty for a
  // game that hasn't been played; a player who came off the bench is in
  // neither, which is why an unlisted batter gets no spot rather than a guess.
  homeLineup: number[];
  awayLineup: number[];
  /** The three fields below are the gap walk's alone — a played row is found by
   *  `gamePk` and never needs to ask who was playing or when. Filling a batter's
   *  season in means asking the opposite question ("which of *his club's* games
   *  has no row?"), which cannot be answered from a map keyed on the games he
   *  was in. `date` is MLB's `officialDate`, which is the day a game belongs to
   *  rather than the day it started — the same distinction the app's 3am
   *  baseball day is built on, and it is what keeps a game finishing after
   *  midnight from being counted on a date its club has another game on. */
  date: string;
  homeId: number;
  awayId: number;
}

type Schedule = Map<number, ScheduledGame>;

const scheduleCache = new Map<number, { games: Schedule; fetchedAt: number }>();

/** Whether a set of games holds one still being played — what shortens both
 *  this file's caches, since a live game is the only thing in either that can
 *  change inside the half hour. */
const anyLive = (games: Iterable<{ state: GameStatus['state'] | null }>): boolean => {
  for (const g of games) if (g.state === 'live') return true;
  return false;
};

/**
 * The season's schedule in one call, keyed by gamePk — the three things a
 * `stats(gameLog)` split leaves out. It carries the opponent and `isWin` but
 * **no score at all**, nothing about where a batter hit, and **nothing about
 * whether the game is over**; asking per game would be 150 requests to fill two
 * columns. `hydrate=lineups` is what makes it one: every *completed* game in the
 * response carries both batting orders (only scheduled and postponed ones don't,
 * which have no log rows anyway), and one player's log warms it for every other.
 *
 * **The status costs 205KB and buys the row's honesty.** With the fields cut to
 * scores and player ids the season is 704KB raw / 61.8KB gzipped; opening
 * `status` for its three keys takes it to **909KB / 66.1KB** (measured, 2026,
 * `gameType=R`). That is the same kind of trade the `primaryPosition` hydrate
 * lost — and it is a fifth of that one's cost (which went to 1,696KB) for the
 * one fact without which the log calls a game in the second inning a win.
 */
async function getSchedule(season: number): Promise<Schedule> {
  const hit = scheduleCache.get(season);
  if (hit) {
    const ttl = anyLive(hit.games.values()) ? LIVE_LOG_TTL : SCORES_TTL;
    if (Date.now() - hit.fetchedAt < ttl) return hit.games;
  }
  const url =
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${season}&gameType=R` +
    `&hydrate=lineups&fields=dates,date,games,gamePk,officialDate,status,abstractGameState,` +
    `codedGameState,detailedState,teams,away,home,score,team,lineups,homePlayers,` +
    `awayPlayers,id`;
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`schedule returned ${res.status}`);
    const data = (await res.json()) as ScheduleResponse;
    const games: Schedule = new Map();
    const ids = (players: { id?: number }[] | undefined): number[] =>
      (players ?? []).map((p) => p.id ?? 0);
    for (const d of data.dates ?? []) {
      for (const g of d.games ?? []) {
        if (!g.gamePk) continue;
        const home = g.teams?.home?.score;
        const away = g.teams?.away?.score;
        games.set(g.gamePk, {
          state: stateOf(g.status),
          detailedState: g.status?.detailedState ?? '',
          // Absent until first pitch — a scheduled game has the keys, no score.
          homeScore: typeof home === 'number' ? home : null,
          awayScore: typeof away === 'number' ? away : null,
          homeLineup: ids(g.lineups?.homePlayers),
          awayLineup: ids(g.lineups?.awayPlayers),
          date: g.officialDate ?? d.date ?? '',
          homeId: g.teams?.home?.team?.id ?? 0,
          awayId: g.teams?.away?.team?.id ?? 0,
        });
      }
    }
    scheduleCache.set(season, { games, fetchedAt: Date.now() });
    return games;
  } catch (err) {
    console.error('schedule fetch failed:', err);
    // A missing entry costs a row its score, its lineup spot and its result,
    // not the log.
    return hit?.games ?? new Map();
  }
}

/** One `stats(type=[gameLog])` split, as far as we read it. */
interface GameLogSplit {
  date?: string;
  isHome?: boolean;
  isWin?: boolean;
  gameType?: string;
  opponent?: { id?: number; name?: string };
  game?: { gamePk?: number };
  // The fielding positions he held that game, first one first. Already on the
  // split — nothing was added to the request for it.
  positionsPlayed?: { abbreviation?: string }[];
  stat?: Record<string, unknown>;
}

interface PeopleGameLogResponse {
  people?: { id: number; stats?: { type?: { displayName?: string }; splits?: GameLogSplit[] }[] }[];
}

/** The first position of a split's `positionsPlayed`, or null. */
const positionPlayed = (sp: GameLogSplit): string | null =>
  sp.positionsPlayed?.[0]?.abbreviation ?? null;

const n = (v: unknown): number => (typeof v === 'number' ? v : 0);
const s = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '—';

function toEntry(sp: GameLogSplit, abbrevs: Map<number, string>, sched: Schedule): GameLogEntry {
  const oppId = sp.opponent?.id ?? 0;
  const gamePk = sp.game?.gamePk ?? 0;
  const g = sched.get(gamePk);
  // Turned around to his side of it — the split says which end he was on.
  const home = sp.isHome === true;
  return {
    gamePk,
    date: sp.date ?? '',
    home,
    opponentId: oppId,
    opponent: abbrevs.get(oppId) ?? sp.opponent?.name ?? '—',
    /**
     * **`isWin` is not a result, and this is the gate that makes it one.**
     *
     * The field reads as one — it is a boolean called "is win" on a game-log
     * split — and the comment that stood here said it was *absent* on a game
     * that hadn't been decided. It is not. Measured against MLB on 2026-08-19:
     * Kyle Schwarber's row for gamePk 823424 carried `isWin: true` while that
     * game was `abstractGameState: "Live"`, `detailedState: "In Progress"`,
     * Philadelphia 1-0 in the **second inning**; both starters in gamePk 824722
     * carried `isWin: false` with the game tied 5-5 in the seventh. What MLB
     * fills in live is *who is ahead right now*, and the log printed it as a
     * green `W 1-0`.
     *
     * So the result is gated on the schedule's own state — a game that is not
     * `final` has no result to report, whatever the split says. A game the
     * schedule had no entry for (a failed or stale fetch) reports none either:
     * this app's standing rule is that **a join fails to null, never to a
     * guess**, and a row with no score to show is not the place to start
     * claiming a win.
     */
    win: g?.state === 'final' && typeof sp.isWin === 'boolean' ? sp.isWin : null,
    state: g?.state ?? null,
    detailedState: g?.detailedState ?? '',
    teamScore: (home ? g?.homeScore : g?.awayScore) ?? null,
    opponentScore: (home ? g?.awayScore : g?.homeScore) ?? null,
    summary: typeof sp.stat?.summary === 'string' ? sp.stat.summary : '',
  };
}

function toBatterGame(
  sp: GameLogSplit,
  playerId: number,
  abbrevs: Map<number, string>,
  sched: Schedule,
): BatterGameLog {
  const st = sp.stat ?? {};
  const lineup = (sp.isHome === true ? sched.get(sp.game?.gamePk ?? 0)?.homeLineup : sched.get(sp.game?.gamePk ?? 0)?.awayLineup) ?? [];
  const at = lineup.indexOf(playerId);
  return {
    ...toEntry(sp, abbrevs, sched),
    // Where he hit, from the posted order. Null when he isn't in it — he came
    // off the bench, and the posted lineup can't say whose spot he took.
    lineupSpot: at >= 0 ? at + 1 : null,
    // **Where he started** — the split's own `positionsPlayed`, gated on his
    // being in the posted order.
    //
    // The two halves answer the two halves of the question and neither does it
    // alone. `positionsPlayed` is the *fielding positions he held*, first one
    // first (checked against the boxscore's own `allPositions`: 41 of 42
    // player-games identical), and it **drops PH and PR outright** — so a
    // pinch-hitter who stayed in at DH reads a bare `DH` and would print as a
    // start he never made, which is exactly the one row that disagreed. The
    // lineup entry says whether he started and cannot say where; this says
    // where and cannot say whether. Together they are right on both, and
    // `startPosition` is null on exactly the rows `lineupSpot` is null on.
    //
    // **The alternative was the schedule's own `lineups`, which carries a
    // per-game position and was rejected on payload.** MLB overloads
    // `primaryPosition` inside that hydrate to mean the position he started at
    // (checked: 162 of 162 posted players match the boxscore), so it is a
    // correct answer and a free *request* — `getSchedule` already fetches it —
    // but not a free *read*: `fields` is leaf-matched, and opening
    // `primaryPosition` on ~44,000 lineup entries takes the season schedule
    // from **685KB to 1,696KB** at its cheapest spelling (`code`) and 1,982KB
    // with `abbreviation`. That is a shared, once-per-30-minutes fetch every
    // player's log waits on, and this answer costs nothing at all: the split is
    // already in hand.
    startPosition: at >= 0 ? positionPlayed(sp) : null,
    pa: n(st.plateAppearances),
    ab: n(st.atBats),
    runs: n(st.runs),
    hits: n(st.hits),
    doubles: n(st.doubles),
    triples: n(st.triples),
    hr: n(st.homeRuns),
    rbi: n(st.rbi),
    bb: n(st.baseOnBalls),
    so: n(st.strikeOuts),
    sb: n(st.stolenBases),
    // Not columns of their own — they're what lets the client's season row
    // recompute OBP/SLG from the sums instead of averaging per-game rates.
    hbp: n(st.hitByPitch),
    sacFlies: n(st.sacFlies),
    totalBases: n(st.totalBases),
    // Season-to-date through this game, which is how the game log reports
    // them — see the field comments on BatterGameLog.
    seasonAvg: s(st.avg),
    seasonObp: s(st.obp),
    seasonSlg: s(st.slg),
    seasonOps: s(st.ops),
  };
}

/**
 * His credit for this game. The game log counts each as a 0/1 tally rather than
 * naming one, so they're checked in scorebook order — a start that also earned
 * the win is a W, and a hold only surfaces when nothing above it did.
 *
 * **These four need no live gate, where `isWin` beside them does** — measured,
 * and worth recording because the asymmetry looks like an oversight. All four
 * tallies read 0 for every pitcher in a game still being played: both starters
 * and both relievers used in gamePk 824722 on 2026-08-19 (tied 5-5, seventh
 * inning) carried `wins`/`losses`/`saves`/`holds` of 0 while the same splits
 * carried `isWin: false`. MLB awards a decision when the game ends; it fills
 * `isWin` from the scoreboard as it stands.
 */
function decisionOf(st: Record<string, unknown>): PitchingCredit | null {
  if (n(st.wins) > 0) return 'W';
  if (n(st.losses) > 0) return 'L';
  if (n(st.saves) > 0) return 'S';
  if (n(st.holds) > 0) return 'H';
  return null;
}

/**
 * The three true outcomes and the outs behind them, accumulated down the log so
 * each row can carry a season-to-date FIP. MLB publishes ERA and WHIP that way
 * itself; it publishes no FIP at all, and the counting stats in a game-log split
 * are **that game's own** — so the running totals have to be kept here, over the
 * splits in the order MLB sends them, which is scorebook order (the reverse of
 * the order the table reads in).
 */
interface RunningFip {
  hr: number;
  bb: number;
  hbp: number;
  k: number;
  outs: number;
}

function toPitcherGame(
  sp: GameLogSplit,
  abbrevs: Map<number, string>,
  sched: Schedule,
  appearances: Appearances,
  fip: number | null,
): PitcherGameLog {
  const st = sp.stat ?? {};
  const app = appearances.get(sp.game?.gamePk ?? 0) ?? null;
  return {
    ...toEntry(sp, abbrevs, sched),
    // Which innings he was in and what he inherited — neither is anywhere in
    // MLB's game log, so both come off his season's pitch-level CSV and are
    // null whenever that fetch failed.
    firstInning: app?.firstInning ?? null,
    lastInning: app?.lastInning ?? null,
    entryMargin: app?.entryMargin ?? null,
    decision: decisionOf(st),
    started: n(st.gamesStarted) > 0,
    // `outs` is what the client's season row sums — "5.1" thirds don't add up.
    outs: n(st.outs),
    inningsPitched: s(st.inningsPitched),
    hits: n(st.hits),
    runs: n(st.runs),
    earnedRuns: n(st.earnedRuns),
    walks: n(st.baseOnBalls),
    strikeOuts: n(st.strikeOuts),
    hr: n(st.homeRuns),
    hitBatsmen: n(st.hitBatsmen),
    battersFaced: n(st.battersFaced),
    pitches: n(st.numberOfPitches),
    strikes: n(st.strikes),
    seasonEra: s(st.era),
    // Ours, not MLB's — see `RunningFip`. Formatted here the way the pitcher
    // card's season line formats its own, so the two read alike.
    seasonFip: fip === null ? null : fip.toFixed(2),
    seasonWhip: s(st.whip),
  };
}

const batterCache = new Map<string, { games: BatterGameLog[]; fetchedAt: number }>();
const pitcherCache = new Map<string, { games: PitcherGameLog[]; fetchedAt: number }>();

/** Whether a cached log may still be served: the long span for a log whose
 *  games are all over, `LIVE_LOG_TTL` for one holding a game in progress —
 *  whose stats, score and state are all still moving. */
const logIsFresh = (hit: { games: GameLogEntry[]; fetchedAt: number } | undefined): boolean =>
  hit !== undefined &&
  Date.now() - hit.fetchedAt < (anyLive(hit.games) ? LIVE_LOG_TTL : GAME_LOG_TTL);

async function fetchSplits(
  playerId: number,
  season: number,
  group: 'hitting' | 'pitching',
): Promise<GameLogSplit[]> {
  const url =
    `https://statsapi.mlb.com/api/v1/people?personIds=${playerId}` +
    `&hydrate=${encodeURIComponent(`stats(group=[${group}],type=[gameLog],season=${season})`)}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`people/gameLog returned ${res.status}`);
  const data = (await res.json()) as PeopleGameLogResponse;
  const person = (data.people ?? []).find((p) => p.id === playerId);
  const group0 = (person?.stats ?? []).find((g) => g.type?.displayName === 'gameLog');
  // Regular season only: a spring or exhibition line sits in the same list and
  // would land in the middle of the log with stats nobody means to read.
  return (group0?.splits ?? []).filter((sp) => !sp.gameType || sp.gameType === 'R');
}

/**
 * One row per game the player appeared in this season, **newest first** — the
 * order a game log is read in, and the reverse of the API's.
 *
 * A player who hasn't played (or whose group is empty — a pitcher's hitting log)
 * yields an empty list rather than an error: the tab says "no games", which is
 * the truth, and there's nothing here that should take the details view down.
 */
export async function getBatterGameLog(
  playerId: number,
  season: number = new Date().getFullYear(),
): Promise<BatterGameLog[]> {
  const key = `${playerId}-${season}`;
  const hit = batterCache.get(key);
  if (hit && logIsFresh(hit)) return hit.games;
  const [splits, abbrevs, sched] = await Promise.all([
    fetchSplits(playerId, season, 'hitting'),
    getTeamAbbrevs(),
    getSchedule(season),
  ]);
  const games = splits.map((sp) => toBatterGame(sp, playerId, abbrevs, sched)).reverse();
  batterCache.set(key, { games, fetchedAt: Date.now() });
  return games;
}

export async function getPitcherGameLog(
  playerId: number,
  season: number = new Date().getFullYear(),
): Promise<PitcherGameLog[]> {
  const key = `${playerId}-${season}`;
  const hit = pitcherCache.get(key);
  if (hit && logIsFresh(hit)) return hit.games;
  const [splits, abbrevs, sched, appearances] = await Promise.all([
    fetchSplits(playerId, season, 'pitching'),
    getTeamAbbrevs(),
    getSchedule(season),
    // His season's pitch rows, which the Arsenal tab has usually already warmed.
    // A failed CSV costs the log its innings and entry columns, nothing else.
    getSeasonArsenal(playerId).then(
      (a) => a.appearances,
      (err) => {
        console.error('season arsenal (appearances) failed:', err);
        return new Map() as Appearances;
      },
    ),
  ]);
  // Oldest first, which is how MLB sends them — the running totals behind each
  // row's FIP only mean anything in that order, so they are accumulated before
  // the list is turned around for the table.
  const run: RunningFip = { hr: 0, bb: 0, hbp: 0, k: 0, outs: 0 };
  const games = splits
    .map((sp) => {
      const st = sp.stat ?? {};
      run.hr += n(st.homeRuns);
      run.bb += n(st.baseOnBalls);
      run.hbp += n(st.hitBatsmen);
      run.k += n(st.strikeOuts);
      run.outs += n(st.outs);
      return toPitcherGame(
        sp,
        abbrevs,
        sched,
        appearances,
        fipLike(run.hr, run.bb, run.hbp, run.k, run.outs),
      );
    })
    .reverse();
  pitcherCache.set(key, { games, fetchedAt: Date.now() });
  return games;
}


/**
 * **The days his club played and he did not**, which is the other half of a
 * season and the half a game log has never carried.
 *
 * `stats(type=[gameLog])` answers *which games did he appear in*, and a reader
 * looking at a log with nothing between June 2 and July 13 cannot tell a
 * benching from a rib fracture. Both readings are in the same silence, and the
 * log drew them the same way by drawing neither.
 *
 * **Two shapes, because the two silences are not the same size.** A day off is a
 * *game* — it has an opponent, a score and a result — and comes back as an
 * ordinary log entry with no stats on it. An absence is a *stretch*: a man who
 * missed six weeks would otherwise arrive as forty near-identical rows burying
 * the season he did play, so consecutive games lost to one state collapse into
 * one row that names the state and counts them.
 *
 * **Only games that are `final` count.** A game still being played is one he may
 * yet come into, and a postponement is not a game anybody missed — which is
 * `schedule.ts`'s own rule, read here through the `state` this file already
 * classified rather than off the status keys a second time.
 *
 * **Which club's fixtures to walk is read off the stint, not off his nearest
 * game.** The two agree everywhere except either side of a trade, which is
 * exactly where the question gets asked; where the stints know no club — a
 * player with no transactions at all, which is most of them — it falls back to
 * the club of his nearest played game, and where he has played nothing at all it
 * returns nothing rather than inventing a club to walk.
 */
function buildBatterGaps(
  games: BatterGameLog[],
  sched: Schedule,
  stints: PlayerStint[],
  abbrevs: Map<number, string>,
): GameLogGap[] {
  if (games.length === 0) return [];
  const played = new Set(games.map((g) => g.gamePk));

  // His club on the day of each game he played, oldest first — the fallback the
  // stints are read against.
  const byGame: { date: string; club: number }[] = [];
  for (const g of [...games].reverse()) {
    const sg = sched.get(g.gamePk);
    if (!sg) continue;
    const club = g.home ? sg.homeId : sg.awayId;
    if (club) byGame.push({ date: g.date, club });
  }
  if (byGame.length === 0) return [];

  const clubOn = (date: string): number => {
    for (let i = stints.length - 1; i >= 0; i--) {
      const st = stints[i];
      if (st.from <= date && (st.to === null || date < st.to) && st.club !== null) return st.club;
    }
    let club = byGame[0].club;
    for (const b of byGame) {
      if (b.date > date) break;
      club = b.club;
    }
    return club;
  };

  const firstPlayed = byGame[0].date;
  // **Every final game of his club's season, not every game up to his last
  // appearance** — and the difference is the row a reader most wants. The first
  // cut stopped at his last played game on the reasoning that the season past
  // it had not happened for him; measured on Aaron Judge, who last played on
  // 2026-05-31 and has been on the injured list since June 2, that reasoning
  // deleted **every** row explaining why: 59 games, 0 gaps, and a log that
  // simply stopped in May with nothing to say about it. A game still being
  // played and a game not yet played are excluded by `final` alone, which is
  // the honest cut and the only one needed.
  const season = [...sched.entries()]
    .filter(([, g]) => g.state === 'final' && g.date)
    .sort((a, b) => (a[1].date < b[1].date ? -1 : a[1].date > b[1].date ? 1 : 0));

  const out: GameLogGap[] = [];
  // The absence being accumulated, if the last game was one. A run ends when the
  // status changes, when he plays, or when the season does.
  let run: { status: string; detail: string; from: string; to: string; games: number } | null = null;
  const closeRun = (): void => {
    if (!run) return;
    out.push({
      kind: 'absence',
      from: run.from,
      to: run.to,
      games: run.games,
      status: run.status,
      detail: run.detail,
    });
    run = null;
  };

  for (const [gamePk, g] of season) {
    const club = clubOn(g.date);
    const home = g.homeId === club;
    if (!home && g.awayId !== club) continue;
    if (played.has(gamePk)) {
      closeRun();
      continue;
    }
    const st = statusOn(stints, g.date);
    // **Before his first appearance, silence is not availability.** A date
    // ahead of his debut that no stint covers is one nothing is known about —
    // he may not have been signed, or the transaction that would say so may be
    // one this file could not read — and a `dnp` row there would claim he was
    // on the bench. Nothing is drawn instead, which is the standing rule that a
    // join fails to null rather than to a guess.
    if (!st?.status && g.date < firstPlayed) {
      closeRun();
      continue;
    }
    if (st?.status) {
      if (run && run.status === st.status) {
        run.to = g.date;
        run.games += 1;
      } else {
        closeRun();
        run = { status: st.status, detail: st.detail, from: g.date, to: g.date, games: 1 };
      }
      continue;
    }
    closeRun();
    const oppId = home ? g.awayId : g.homeId;
    out.push({
      kind: 'dnp',
      gamePk,
      date: g.date,
      home,
      opponentId: oppId,
      opponent: abbrevs.get(oppId) ?? '—',
      // The same gate a played row takes: a result exists only where the game
      // is over, and every game reaching here is.
      win: home ? g.homeScore! > g.awayScore! : g.awayScore! > g.homeScore!,
      state: g.state,
      detailedState: g.detailedState,
      teamScore: (home ? g.homeScore : g.awayScore) ?? null,
      opponentScore: (home ? g.awayScore : g.homeScore) ?? null,
      summary: '',
    });
  }
  closeRun();

  // Newest first, which is the order the log is read in and the order the rows
  // these interleave with already arrive in.
  return out.reverse();
}

/**
 * **A batter's log and the season around it** — the games he played, and the
 * days his club played without him.
 *
 * The two ride side by side rather than merged, and that is the whole of why
 * nothing already reading a game log had to change: the Overview's five-game
 * preview and the season totals row read `games` and get exactly the list they
 * have always got. Only the Game Log tab asks for `gaps`, and only it draws
 * them.
 */
export async function getBatterLog(
  playerId: number,
  season: number = new Date().getFullYear(),
): Promise<{ games: BatterGameLog[]; gaps: GameLogGap[] }> {
  const [games, abbrevs, sched] = await Promise.all([
    getBatterGameLog(playerId, season),
    getTeamAbbrevs(),
    getSchedule(season),
  ]);
  // A failed transactions read costs the absence rows and nothing else — every
  // day he did not play then reads as a day he did not play, which is true and
  // merely less informative. `getPlayerStints` already swallows its own error;
  // this catch is the one for a thrown abbreviation map.
  const stints = await getPlayerStints(playerId, season, new Set(abbrevs.keys())).catch((err) => {
    console.error('player stints failed:', err);
    return [] as PlayerStint[];
  });
  return { games, gaps: buildBatterGaps(games, sched, stints, abbrevs) };
}
