import { parse } from 'csv-parse/sync';
import { readJsonBlob, writeJsonBlob } from './storage.js';
import { toSavantName } from './names.js';
import { LEAGUE_HR_PER_FB, fipLike, ipToOuts } from './leagueRates.js';
import { windowDates, windowStatcast } from './statcastWindow.js';
import type { PlayerKind, ResearchRow, ResearchWindow } from './types.js';

// Keep in sync with hfSea in savant.ts, CURRENT_SEASON in percentiles.ts, and
// SEASON in xwoba.ts / pitcherArsenal.ts / teamStats.ts / expectedStats.ts.
const SEASON = 2026;

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// The whole league in three blobs, none of which moves faster than nightly —
// the same 6h the other league-wide tables (xERA, team hitting) settle on.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// ---- MLB Stats API: the season line, one row per player -------------------
//
// The season *leaderboard* rather than a hydrated per-player group, because it
// already does what `preferSeasonWide` has to undo elsewhere: a traded player
// comes back once, aggregated across his stints, carrying his current club.
// `playerPool=ALL` is what keeps the September call-up and the position player
// who threw an inning — a research table's whole point is the long tail.

interface StatSplit {
  stat?: Record<string, unknown>;
  team?: { id?: number; name?: string };
  player?: { id?: number; fullName?: string };
  position?: { abbreviation?: string; type?: string };
  numTeams?: number;
}
interface StatsResponse {
  stats?: { splits?: StatSplit[] }[];
}

/** MLB prints rate stats as strings (".323", "3.52") and counts as numbers; a
 *  stat it can't compute comes back as a placeholder of dashes (".---"). */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function int(v: unknown): number {
  return num(v) ?? 0;
}

/** A team's three-letter abbreviation isn't on the leaderboard payload — only
 *  the id and full name — and a full name is three times the width of the
 *  column, so the same lookup the game log uses fills it in here. */
async function getTeamAbbrevs(): Promise<Map<number, string>> {
  const url =
    'https://statsapi.mlb.com/api/v1/teams?sportId=1&fields=teams,id,abbreviation';
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`MLB Stats API teams returned ${res.status}`);
  const data = (await res.json()) as { teams?: { id: number; abbreviation: string }[] };
  return new Map((data.teams ?? []).map((t) => [t.id, t.abbreviation]));
}

// ---- Qualifying ------------------------------------------------------------
//
// The rate-stat qualifier is 3.1 plate appearances (or 1.0 inning) per game
// **his team** has played — which is why it needs the standings and can't be
// read off the leaderboard, whose only game count is the player's own.
//
// **Nothing reads `ResearchRow.qualified` any more.** The board's `Qualified`
// toggle was its only reader in either workspace and has been removed, so
// everything below still runs on every cold build of the blob and still ships a
// boolean on every row, answering a question nothing on screen asks. It is kept
// deliberately: the reasoning is unchanged and correct, and one client-side
// filter would make it useful again. Pruning it would drop this whole section,
// `getTeamGames`/`getTeamGamesInRange`'s standings and schedule calls, and the
// field from both `types.ts` — and would need the storage key's `-v6` bumped,
// or a stored blob keeps deserializing with it. `starter` must survive either
// way: the SP/RP position pills read it.

/** Games played, per team id, from the standings. */
/**
 * Games **his team** has played inside the window, which is what the qualifier
 * is measured against. The standings carry a season total and nothing else, so
 * a window has to count finals off the schedule instead — and must count them
 * per team rather than per day, since no two clubs play the same number over
 * thirty days (22 to 25, on a checked month). A postponement is not a game and
 * is excluded by asking for `codedGameState === 'F'`.
 */
async function getTeamGamesInRange(start: string, end: string): Promise<Map<number, number>> {
  const url =
    'https://statsapi.mlb.com/api/v1/schedule?sportId=1&gameType=R' +
    `&startDate=${start}&endDate=${end}` +
    '&fields=dates,games,status,codedGameState,teams,away,home,team,id';
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`MLB Stats API schedule returned ${res.status}`);
  const data = (await res.json()) as {
    dates?: {
      games?: {
        status?: { codedGameState?: string };
        teams?: { away?: { team?: { id?: number } }; home?: { team?: { id?: number } } };
      }[];
    }[];
  };
  const games = new Map<number, number>();
  for (const day of data.dates ?? []) {
    for (const g of day.games ?? []) {
      if (g.status?.codedGameState !== 'F') continue;
      for (const side of [g.teams?.away, g.teams?.home]) {
        const id = side?.team?.id;
        if (id !== undefined) games.set(id, (games.get(id) ?? 0) + 1);
      }
    }
  }
  return games;
}

async function getTeamGames(): Promise<Map<number, number>> {
  const url =
    'https://statsapi.mlb.com/api/v1/standings?leagueId=103,104' +
    `&season=${SEASON}&fields=records,teamRecords,team,id,gamesPlayed`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`MLB Stats API standings returned ${res.status}`);
  const data = (await res.json()) as {
    records?: { teamRecords?: { team?: { id?: number }; gamesPlayed?: number }[] }[];
  };
  const games = new Map<number, number>();
  for (const rec of data.records ?? []) {
    for (const tr of rec.teamRecords ?? []) {
      if (tr.team?.id !== undefined && typeof tr.gamesPlayed === 'number') {
        games.set(tr.team.id, tr.gamesPlayed);
      }
    }
  }
  return games;
}

/** A majority of his appearances are starts — the same test `isRotationStarter`
 *  applies to a watched pitcher, ties counting as a starter. Here rather than in
 *  the client so the SP/RP pills and the qualifier below share one definition. */
function isStarter(row: ResearchRow): boolean {
  return row.games > 0 && (row.gamesStarted ?? 0) * 2 >= row.games;
}

/**
 * Whether he clears the bar, against his own team's games played.
 *
 * **Three rules, because one number cannot serve all three roles.** A batter
 * qualifies on 3.1 plate appearances per team game and a starter on one inning
 * — MLB's own figures, and `Math.floor` is what reproduces them (162 games is a
 * 502 PA qualifier, and 3.1 × 162 is 502.2).
 *
 * A **reliever qualifies on appearances**, one per three team games, because
 * the innings rule excludes literally every one of them: at 117 team games it
 * asks for 117 innings and the hardest-worked reliever in the league has 59.
 * Innings are also the wrong measure of a reliever's season — the *most used*
 * arm in the league right now has 62 appearances and 47 innings, a matchup lefty
 * whose value is in how often he is asked, not how long he stays. One
 * appearance per three team games is ~39 today, which is about four relievers a
 * club: a settled bullpen core rather than everyone who has warmed up.
 *
 * A player with **no** team games to measure against falls back to the league
 * maximum rather than to zero — zero would be a threshold of nothing and
 * quietly qualify him.
 */
function qualifies(kind: PlayerKind, row: ResearchRow, teamGames: number): boolean {
  if (teamGames <= 0) return false;
  if (kind !== 'pitcher') return (row.pa ?? 0) >= Math.floor(3.1 * teamGames);
  if (row.starter) return (row.outs ?? 0) >= 3 * teamGames;
  return row.games >= Math.floor(teamGames / 3);
}

/** The same leaderboard either way. `byDateRange` takes `playerPool=ALL` just as
 *  the season call does, and still returns a traded player once carrying his
 *  current club, so nothing downstream has to know which one it asked for. */
function leaderboardUrl(kind: PlayerKind, window: ResearchWindow): string {
  const group = kind === 'pitcher' ? 'pitching' : 'hitting';
  const base =
    `https://statsapi.mlb.com/api/v1/stats?group=${group}` +
    `&season=${SEASON}&sportId=1&limit=2000&playerPool=ALL`;
  if (window === 'season') return `${base}&stats=season`;
  const d = windowDates(window);
  return `${base}&stats=byDateRange&startDate=${d[0]}&endDate=${d[d.length - 1]}`;
}

async function buildBase(kind: PlayerKind, window: ResearchWindow): Promise<ResearchRow[]> {
  const d = window === 'season' ? null : windowDates(window);
  const [res, teams, teamGames] = await Promise.all([
    fetch(leaderboardUrl(kind, window), { headers: UA }),
    getTeamAbbrevs(),
    d ? getTeamGamesInRange(d[0], d[d.length - 1]) : getTeamGames(),
  ]);
  // The fallback for a player whose team we can't place (see `qualifies`).
  const maxTeamGames = Math.max(0, ...teamGames.values());
  if (!res.ok) {
    throw new Error(`MLB Stats API ${kind} leaderboard returned ${res.status}`);
  }
  const data = (await res.json()) as StatsResponse;
  const splits = data.stats?.[0]?.splits ?? [];

  const rows: ResearchRow[] = [];
  for (const sp of splits) {
    const id = sp.player?.id;
    const name = sp.player?.fullName;
    const s = sp.stat;
    if (id === undefined || !name || !s) continue;

    const row: ResearchRow = {
      id,
      name,
      savantName: toSavantName(name),
      kind,
      team: (sp.team?.id !== undefined && teams.get(sp.team.id)) || '',
      // Both are the player's own position, not the one he filled that day: a
      // reliever on the pitching board is 'P'/'Pitcher', and the position
      // player who mopped up an eleven-run loss keeps his own, which is what
      // makes the position-type filter mean what it says on either board.
      position: sp.position?.abbreviation ?? '',
      positionType: sp.position?.type ?? 'Unknown',
      games: int(s.gamesPlayed),
      // Both filled once the kind-specific half below has set the counts they
      // are measured against.
      starter: false,
      qualified: false,
      // Statcast enrichment, filled below — null when Savant has no row for him
      // (he hasn't put a ball in play) or when its fetch failed outright.
      xba: null,
      xslg: null,
      xwoba: null,
      exitVelocity: null,
      launchAngle: null,
      barrelRate: null,
      hardHitRate: null,
      sweetSpotRate: null,
      gbRate: null,
      ldRate: null,
      fbRate: null,
      whiffRate: null,
      chaseRate: null,
      firstPitchStrikeRate: null,
      sprintSpeed: null,
      // Batter-only / pitcher-only halves; the client renders one kind's
      // columns at a time, so the other half stays null.
      pa: null, ab: null, hits: null, doubles: null, triples: null,
      hr: null, runs: null, rbi: null, walks: null, strikeouts: null,
      sb: null, cs: null, avg: null, obp: null, slg: null, ops: null, babip: null,
      wins: null, losses: null, saves: null, holds: null, gamesStarted: null,
      inningsPitched: null, era: null, whip: null, strikeoutsPer9: null,
      walksPer9: null, homeRunsPer9: null, battersFaced: null,
      avgAgainst: null, xera: null, hitBatsmen: null, strikes: null,
      pitches: null, fip: null, xfip: null,
    };

    if (kind === 'pitcher') {
      row.gamesStarted = int(s.gamesStarted);
      row.wins = int(s.wins);
      row.losses = int(s.losses);
      row.saves = int(s.saves);
      row.holds = int(s.holds);
      // Kept as innings rather than outs: it's a display value here, and the
      // client sorts on `outs` (below) so 6.2 doesn't order above 6.1 as 6.2 > 6.1
      // would have it — thirds of an inning aren't a decimal fraction.
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
      // The same `fipLike` the pitcher card's season line uses, so the FIP
      // constant is defined once — and so a pitcher's FIP reads the same here
      // as it does on his card. It returns null under three innings itself.
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
    row.starter = kind === 'pitcher' && isStarter(row);
    row.qualified = qualifies(
      kind,
      row,
      (sp.team?.id !== undefined ? teamGames.get(sp.team.id) : undefined) ?? maxTeamGames,
    );
    rows.push(row);
  }
  return rows;
}

// ---- Savant enrichment ----------------------------------------------------
//
// Two league-wide CSVs, each fetched in its own try by the caller: expected
// statistics (xBA/xSLG/xwOBA, and xERA on the pitcher board) and the custom
// board (contact quality + whiff). A board that fails costs its own columns a
// value on every row and nothing else — the same rule the percentile card's
// leaderboards follow.

function csvRows(text: string): Record<string, string>[] {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  }) as Record<string, string>[];
}

async function savantCsv(url: string, what: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) {
    throw new Error(`Savant ${what} returned ${res.status} ${res.statusText}`);
  }
  return csvRows(await res.text());
}

/** Savant leaves a cell empty for a player it can't compute the metric for
 *  (nobody has put a ball in play off the reliever who's faced two batters). */
function cell(v: string | undefined): number | null {
  if (v === undefined || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// `min=1` on both boards, or a qualified-only default would drop most of the
// league — which is the half of the table this page exists to let you dig
// through.
const expectedUrl = (kind: PlayerKind) =>
  'https://baseballsavant.mlb.com/leaderboard/expected_statistics?' +
  `type=${kind}&year=${SEASON}&position=&team=&filter=&min=1&csv=true`;

// Every column verified to come back populated on both boards, bar
// `sprint_speed`, which the pitching board leaves empty (and which `cell`
// therefore resolves to null there without special-casing).
const CUSTOM_COLUMNS = [
  'exit_velocity_avg',
  'launch_angle_avg',
  'barrel_batted_rate',
  'hard_hit_percent',
  'sweet_spot_percent',
  'groundballs_percent',
  'linedrives_percent',
  'flyballs_percent',
  'whiff_percent',
  'oz_swing_percent',
  'f_strike_percent',
  'sprint_speed',
  // Counts, not rates, and carried only to compute xFIP below — never shown.
  'flyballs',
  'popups',
] as const;

const customUrl = (kind: PlayerKind) => {
  const params = new URLSearchParams({
    year: String(SEASON),
    type: kind,
    filter: '',
    min: '1',
    selections: `pa,${CUSTOM_COLUMNS.join(',')},`,
    sort: '1',
    sortDir: 'desc',
    csv: 'true',
  });
  return `https://baseballsavant.mlb.com/leaderboard/custom?${params.toString()}`;
};

/**
 * The windowed Statcast half, computed from the per-date exports rather than
 * read off a leaderboard — Savant publishes none for a range (see
 * `statcastWindow.ts` for why, and for the 25,000-row cap that rules out the
 * obvious alternative).
 *
 * Two columns are **absent by nature** on a window and stay null: `sprintSpeed`
 * is never in a pitch row, and `xera` is Statcast's own model. The client dashes
 * them like any other missing value, which is the honest rendering — a window
 * has no sprint speed rather than a sprint speed of zero.
 */
async function enrichWindow(
  rows: ResearchRow[],
  kind: PlayerKind,
  window: Exclude<ResearchWindow, 'season'>,
): Promise<void> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  let stat;
  try {
    stat = await windowStatcast(kind, window);
  } catch (err) {
    // Same rule as the season board's Savant half: this costs its own columns
    // a value, never the table — the MLB line is already in hand.
    console.error(`Research: ${window}-day Statcast unavailable:`, err);
    return;
  }
  for (const [id, v] of stat) {
    const row = byId.get(id);
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
    row.whiffRate = v.whiffRate;
    row.chaseRate = v.chaseRate;
    row.firstPitchStrikeRate = v.firstPitchStrikeRate;
    // xFIP off the window's own fly balls, exactly as the season path does it
    // off the custom board's — same helper, same league rate, so a pitcher's
    // xFIP means the same thing on either board.
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

async function enrich(rows: ResearchRow[], kind: PlayerKind): Promise<void> {
  const byId = new Map(rows.map((r) => [r.id, r]));

  try {
    for (const r of await savantCsv(expectedUrl(kind), `expected ${kind} statistics`)) {
      const row = byId.get(Number(r.player_id));
      if (!row) continue;
      row.xba = cell(r.est_ba);
      row.xslg = cell(r.est_slg);
      row.xwoba = cell(r.est_woba);
      if (kind === 'pitcher') row.xera = cell(r.xera);
    }
  } catch (err) {
    console.error(`Research: expected ${kind} statistics unavailable:`, err);
  }

  try {
    for (const r of await savantCsv(customUrl(kind), `custom ${kind} leaderboard`)) {
      const row = byId.get(Number(r.player_id));
      if (!row) continue;
      row.exitVelocity = cell(r.exit_velocity_avg);
      row.launchAngle = cell(r.launch_angle_avg);
      row.barrelRate = cell(r.barrel_batted_rate);
      row.hardHitRate = cell(r.hard_hit_percent);
      row.sweetSpotRate = cell(r.sweet_spot_percent);
      row.gbRate = cell(r.groundballs_percent);
      row.ldRate = cell(r.linedrives_percent);
      row.fbRate = cell(r.flyballs_percent);
      row.whiffRate = cell(r.whiff_percent);
      row.chaseRate = cell(r.oz_swing_percent);
      row.firstPitchStrikeRate = cell(r.f_strike_percent);
      row.sprintSpeed = cell(r.sprint_speed);
      // xFIP: FIP with his own home runs swapped for his fly balls at the
      // league rate — the one estimator needing a *count* off this board rather
      // than a rate, which is why it can't be computed in buildBase beside FIP.
      // Fly balls are `fly_ball + popup`, matching `BattedBallMix.fly` exactly,
      // so a pitcher's xFIP here is the number his card shows rather than a
      // second definition of the same stat. Null at zero fly balls, as the card
      // is, and null under three innings, which `fipLike` enforces itself.
      if (kind === 'pitcher') {
        const fly = (cell(r.flyballs) ?? 0) + (cell(r.popups) ?? 0);
        row.xfip =
          fly > 0
            ? fipLike(
                fly * LEAGUE_HR_PER_FB,
                row.walks ?? 0,
                row.hitBatsmen ?? 0,
                row.strikeouts ?? 0,
                row.outs ?? 0,
              )
            : null;
      }
    }
  } catch (err) {
    console.error(`Research: custom ${kind} leaderboard unavailable:`, err);
  }
}

// ---- Assembly + cache -----------------------------------------------------

interface Cached {
  season: number;
  window: ResearchWindow;
  rows: ResearchRow[];
}

// Keyed by kind **and** window: the two boards were already separate blobs, and
// a window is a different population of the same league, not a filter over one.
type BoardKey = `${PlayerKind}:${ResearchWindow}`;
const boardKey = (kind: PlayerKind, window: ResearchWindow): BoardKey => `${kind}:${window}`;

const mem = new Map<BoardKey, { data: Cached; fetchedAt: number }>();
const inFlight = new Map<BoardKey, Promise<Cached>>();

// -v3: a stored older blob deserializes with every field added since missing,
// and would quietly cost each row its estimators, its batted-ball profile or
// its discipline columns for six hours. Bump this whenever a field is added.
const storeKey = (kind: PlayerKind, window: ResearchWindow) =>
  `research-${kind}-${window}-${SEASON}-v6.json`;

async function build(kind: PlayerKind, window: ResearchWindow): Promise<Cached> {
  const rows = await buildBase(kind, window);
  if (window === 'season') await enrich(rows, kind);
  else await enrichWindow(rows, kind, window);
  return { season: SEASON, window, rows };
}

/**
 * Every player in the league on one board, season to date — the research
 * table's whole payload. Cached in memory and in the storage tier on the 6h
 * the rest of the league-wide tables use; `inFlight` collapses the stampede a
 * cold Lambda would otherwise send at three upstreams at once.
 *
 * The MLB half throwing fails the request — without it there is no table. The
 * Savant half failing only empties its own columns (see `enrich`).
 */
export async function getResearch(
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
    const data = await build(kind, window);
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
