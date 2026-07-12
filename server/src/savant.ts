import { parse } from 'csv-parse/sync';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getGamesForDate, getPlayerStats, getStatsApiGame } from './mlbStats.js';
import { toSavantName } from './names.js';
import type {
  Pitch,
  PlateAppearance,
  PlayerGame,
  PlayerReport,
  BattingLine,
  GameStatus,
  ProbablePitcher,
  WatchPlayer,
} from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'data', 'cache');

/**
 * Build the Baseball Savant CSV export URL for a single date (YYYY-MM-DD).
 * This is now only used to enrich the primary MLB Stats API model with the
 * handful of Statcast fields that have no public Stats API equivalent:
 * bat speed, swing length, expected BA/wOBA, and per-pitch run value.
 */
function savantUrl(date: string): string {
  const params = new URLSearchParams({
    hfGT: 'R|',
    hfSea: '2026|',
    player_type: 'batter',
    game_date_gt: date,
    game_date_lt: date,
    group_by: 'name-event',
    min_pitches: '0',
    min_results: '0',
    min_pas: '0',
    player_event_sort: 'fangraphs_est_woba_numer',
    sort_order: 'desc',
    type: 'details',
    all: 'true',
    minors: 'false',
    wbc: 'false',
  });
  return `https://baseballsavant.mlb.com/statcast_search/csv?${params.toString()}`;
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || v === '' || v === 'null') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};
const int = (v: string | undefined): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};

/** A game on a given day, with rosters — lets a watched player be tied to a
 * scheduled/in-progress game they haven't batted in yet. */
interface DayGame {
  gamePk: number;
  date: string;
  homeTeam: string;
  awayTeam: string;
  status: GameStatus;
  homeProbablePitcher: ProbablePitcher | null;
  awayProbablePitcher: ProbablePitcher | null;
  homePlayerIds: number[];
  awayPlayerIds: number[];
}

interface ParsedDay {
  date: string;
  reports: Map<number, PlayerReport>; // by batter id
  games: DayGame[];
  fetchedAt: number;
}

const memCache = new Map<string, ParsedDay>();

async function downloadCsv(date: string): Promise<string> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `${date}.csv`);
  try {
    const cached = await fs.readFile(file, 'utf8');
    if (cached.trim().length > 0) return cached;
  } catch {
    // not cached yet
  }
  const res = await fetch(savantUrl(date), {
    headers: { 'User-Agent': 'baseball-sicko-stats/1.0' },
  });
  if (!res.ok) {
    throw new Error(`Baseball Savant returned ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  await fs.writeFile(file, text, 'utf8');
  return text;
}

function classifyHit(event: string | null): {
  isAb: boolean;
  isHit: boolean;
  bases: number;
} {
  switch (event) {
    case 'single':
      return { isAb: true, isHit: true, bases: 1 };
    case 'double':
      return { isAb: true, isHit: true, bases: 2 };
    case 'triple':
      return { isAb: true, isHit: true, bases: 3 };
    case 'home_run':
      return { isAb: true, isHit: true, bases: 4 };
    case 'walk':
    case 'hit_by_pitch':
    case 'sac_fly':
    case 'sac_bunt':
    case 'catcher_interf':
      return { isAb: false, isHit: false, bases: 0 };
    default:
      // strikeout, field_out, force_out, grounded_into_double_play, double_play,
      // field_error, fielders_choice(_out), etc. all count as at-bats without a hit.
      return { isAb: true, isHit: false, bases: 0 };
  }
}

function buildLine(pas: PlateAppearance[]): BattingLine {
  const line: BattingLine = {
    pa: pas.length,
    ab: 0,
    hits: 0,
    singles: 0,
    doubles: 0,
    triples: 0,
    hr: 0,
    bb: 0,
    so: 0,
    hbp: 0,
    runs: 0,
    rbi: 0,
    sb: 0,
    cs: 0,
    totalBases: 0,
    avgExitVelo: null,
    maxExitVelo: null,
    maxDistance: null,
    hardHits: 0,
    runValue: null,
  };
  const evs: number[] = [];
  let runExp = 0;
  let hasRunExp = false;
  for (const pa of pas) {
    const { isAb, isHit, bases } = classifyHit(pa.event);
    if (isAb) line.ab++;
    if (isHit) {
      line.hits++;
      line.totalBases += bases;
    }
    if (pa.event === 'single') line.singles++;
    if (pa.event === 'double') line.doubles++;
    if (pa.event === 'triple') line.triples++;
    if (pa.event === 'home_run') line.hr++;
    if (pa.event === 'walk') line.bb++;
    if (pa.event === 'strikeout' || pa.event === 'strikeout_double_play') line.so++;
    if (pa.event === 'hit_by_pitch') line.hbp++;
    line.rbi += pa.rbi;
    if (pa.launchSpeed !== null) {
      evs.push(pa.launchSpeed);
      if (pa.launchSpeed >= 95) line.hardHits++;
    }
    if (pa.hitDistance !== null) {
      line.maxDistance = Math.max(line.maxDistance ?? 0, pa.hitDistance);
    }
    if (pa.deltaRunExp !== null) {
      runExp += pa.deltaRunExp;
      hasRunExp = true;
    }
  }
  if (evs.length) {
    line.avgExitVelo = Math.round((evs.reduce((a, b) => a + b, 0) / evs.length) * 10) / 10;
    line.maxExitVelo = Math.max(...evs);
  }
  if (hasRunExp) line.runValue = Math.round(runExp * 100) / 100;
  return line;
}

// ---- CSV enrichment: bat speed, swing length, xBA/xwOBA, run value -------

interface PitchExtras {
  batSpeed: number | null;
  swingLength: number | null;
}
interface PaExtras {
  xba: number | null;
  xwoba: number | null;
  deltaRunExp: number | null;
}
interface CsvEnrichment {
  pitchExtras: Map<string, PitchExtras>;
  paExtras: Map<string, PaExtras>;
}

const EMPTY_ENRICHMENT: CsvEnrichment = { pitchExtras: new Map(), paExtras: new Map() };

function parseCsvEnrichment(csvText: string): CsvEnrichment {
  const records: Record<string, string>[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  });

  const pitchExtras = new Map<string, PitchExtras>();
  const paRows = new Map<string, Record<string, string>[]>();

  for (const r of records) {
    const batterId = int(r.batter);
    const gamePk = int(r.game_pk);
    const atBat = int(r.at_bat_number);
    if (batterId === null || gamePk === null || atBat === null) continue;
    const paKey = `${batterId}|${gamePk}|${atBat}`;

    const pitchNum = int(r.pitch_number);
    if (pitchNum !== null) {
      pitchExtras.set(`${paKey}|${pitchNum}`, {
        batSpeed: num(r.bat_speed),
        swingLength: num(r.swing_length),
      });
    }

    let rows = paRows.get(paKey);
    if (!rows) {
      rows = [];
      paRows.set(paKey, rows);
    }
    rows.push(r);
  }

  const paExtras = new Map<string, PaExtras>();
  for (const [key, rows] of paRows) {
    const last = rows
      .slice()
      .sort((a, c) => (int(a.pitch_number) ?? 0) - (int(c.pitch_number) ?? 0))
      .at(-1)!;
    paExtras.set(key, {
      xba: num(last.estimated_ba_using_speedangle),
      xwoba: num(last.estimated_woba_using_speedangle),
      deltaRunExp: num(last.delta_run_exp),
    });
  }

  return { pitchExtras, paExtras };
}

function applyCsvEnrichment(
  batterId: number,
  gamePk: number,
  pas: PlateAppearance[],
  enrichment: CsvEnrichment,
): void {
  for (const pa of pas) {
    const paKey = `${batterId}|${gamePk}|${pa.atBatNumber}`;
    const paExtra = enrichment.paExtras.get(paKey);
    pa.xba = paExtra?.xba ?? null;
    pa.xwoba = paExtra?.xwoba ?? null;
    pa.deltaRunExp = paExtra?.deltaRunExp ?? null;
    for (const pitch of pa.pitches) {
      const pitchExtra = enrichment.pitchExtras.get(`${paKey}|${pitch.pitchNumber}`);
      pitch.batSpeed = pitchExtra?.batSpeed ?? null;
      pitch.swingLength = pitchExtra?.swingLength ?? null;
    }
  }
}

// ---- Primary day builder (MLB Stats API) ---------------------------------

async function buildStatsApiDay(date: string): Promise<{
  byBatter: Map<number, { name: string; games: PlayerGame[] }>;
  dayGames: DayGame[];
}> {
  const gamePks = await getGamesForDate(date);
  const games = await Promise.all(
    gamePks.map(async (pk) => {
      try {
        return await getStatsApiGame(pk);
      } catch (err) {
        console.error(`live feed fetch failed for game ${pk}:`, err);
        return null;
      }
    }),
  );

  const byBatter = new Map<number, { name: string; games: PlayerGame[] }>();
  const dayGames: DayGame[] = [];

  for (const g of games) {
    if (!g) continue;
    dayGames.push({
      gamePk: g.gamePk,
      date,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      status: g.status,
      homeProbablePitcher: g.homeProbablePitcher,
      awayProbablePitcher: g.awayProbablePitcher,
      homePlayerIds: [...g.homePlayerIds],
      awayPlayerIds: [...g.awayPlayerIds],
    });
    for (const bg of g.batters.values()) {
      const plateAppearances: PlateAppearance[] = bg.plateAppearances.map((pa) => ({
        atBatNumber: pa.atBatNumber,
        inning: pa.inning,
        half: pa.half,
        outsWhenUp: pa.outsWhenUp,
        onBase: pa.onBase,
        stand: pa.stand,
        pThrows: pa.pThrows,
        pitcherId: pa.pitcherId,
        pitcherName: pa.pitcherName,
        event: pa.event,
        description: pa.description,
        rbi: pa.rbi,
        playId: pa.playId,
        launchSpeed: pa.launchSpeed,
        launchAngle: pa.launchAngle,
        hitDistance: pa.hitDistance,
        bbType: pa.bbType,
        xba: null,
        xwoba: null,
        deltaRunExp: null,
        deltaWinExp: pa.deltaWinExp,
        pitches: pa.pitches.map((p): Pitch => ({
          pitchNumber: p.pitchNumber,
          pitchType: p.pitchType,
          releaseSpeed: p.releaseSpeed,
          spinRate: p.spinRate,
          description: p.description,
          balls: p.balls,
          strikes: p.strikes,
          plateX: p.plateX,
          plateZ: p.plateZ,
          szTop: p.szTop,
          szBot: p.szBot,
          zone: p.zone,
          launchSpeed: p.launchSpeed,
          launchAngle: p.launchAngle,
          hitDistance: p.hitDistance,
          bbType: p.bbType,
          batSpeed: null,
          swingLength: null,
        })),
      }));

      const batterTeam = bg.isHome ? g.homeTeam : g.awayTeam;
      const opponent = bg.isHome ? g.awayTeam : g.homeTeam;

      const playerGame: PlayerGame = {
        gamePk: g.gamePk,
        date,
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        batterTeam,
        opponent,
        isHome: bg.isHome,
        stand: bg.stand,
        status: g.status,
        // The batter faces the opposing team's starter.
        probablePitcher: bg.isHome ? g.awayProbablePitcher : g.homeProbablePitcher,
        plateAppearances,
        // line is finalized after CSV enrichment is merged in (below), since
        // run value / avg exit velo depend on fields the enrichment fills in.
        line: buildLine(plateAppearances.filter((p) => p.event)),
      };
      playerGame.line.runs = g.runsByRunner.get(bg.batterId) ?? 0;
      playerGame.line.sb = g.sbByRunner.get(bg.batterId) ?? 0;
      playerGame.line.cs = g.csByRunner.get(bg.batterId) ?? 0;

      let b = byBatter.get(bg.batterId);
      if (!b) {
        b = { name: bg.batterName, games: [] };
        byBatter.set(bg.batterId, b);
      }
      b.games.push(playerGame);
    }
  }

  return { byBatter, dayGames };
}

/** How long a current/future-day fetch stays fresh before we re-download (ms).
 *  Drops to LIVE_DAY_TTL while any game that day is in progress so reloads keep
 *  up with live scores (the underlying feed refreshes on its own 10s cadence). */
const TODAY_TTL = 10 * 60 * 1000;
const LIVE_DAY_TTL = 15 * 1000;

/** Today's date (YYYY-MM-DD) in US Eastern — MLB days are anchored to ET, and a
 *  UTC "today" rolls over mid-evening while ET games are still live, which would
 *  misclassify the live game day as a frozen past date. Matches index.ts. */
function easternToday(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function getDay(date: string): Promise<ParsedDay> {
  const cached = memCache.get(date);
  // Today and future dates are still mutable (scores accrue, lineups/rosters get
  // posted closer to first pitch), so they honor the TTL. Past dates are frozen.
  const isMutable = date >= easternToday();
  if (cached && !isMutable) return cached;
  if (cached) {
    const states = cached.games.map((g) => g.status.state);
    // Once every game that day is final, nothing will change until the date
    // rolls over (final games are cached permanently), so freeze like a past
    // day. Empty schedules still honor the TTL in case games post late.
    const allFinal = states.length > 0 && states.every((s) => s === 'final');
    if (allFinal) return cached;
    // Any in-progress game shortens the TTL so reloads track live scores;
    // otherwise a scheduled day polls for first pitch / lineups.
    const ttl = states.some((s) => s === 'live') ? LIVE_DAY_TTL : TODAY_TTL;
    if (Date.now() - cached.fetchedAt < ttl) return cached;
  }

  const { byBatter, dayGames } = await buildStatsApiDay(date);

  let enrichment = EMPTY_ENRICHMENT;
  try {
    enrichment = parseCsvEnrichment(await downloadCsv(date));
  } catch (err) {
    console.error(`Savant CSV enrichment unavailable for ${date}:`, err);
  }

  const reports = new Map<number, PlayerReport>();

  for (const [batterId, b] of byBatter) {
    for (const g of b.games) {
      applyCsvEnrichment(batterId, g.gamePk, g.plateAppearances, enrichment);
      // Run value depends on deltaRunExp, which only the CSV enrichment fills
      // in (exit-velo stats already came from the Stats API's hitData above).
      let runExp = 0;
      let hasRunExp = false;
      for (const pa of g.plateAppearances) {
        if (!pa.event || pa.deltaRunExp === null) continue;
        runExp += pa.deltaRunExp;
        hasRunExp = true;
      }
      g.line.runValue = hasRunExp ? Math.round(runExp * 100) / 100 : null;
    }

    b.games.sort((a, c) => a.gamePk - c.gamePk);
    const savantName = toSavantName(b.name);
    reports.set(batterId, {
      id: batterId,
      savantName,
      name: b.name,
      found: true,
      games: b.games,
      // Filled in by getReport, which fetches season stats per watched player.
      seasonStats: null,
      splitVsLeft: null,
      splitVsRight: null,
    });
  }

  const parsed: ParsedDay = { date, reports, games: dayGames, fetchedAt: Date.now() };
  memCache.set(date, parsed);
  return parsed;
}

/** Inclusive list of YYYY-MM-DD dates from start to end. */
function enumerateDates(start: string, end: string): string[] {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const endMs = Date.UTC(ey, em - 1, ed);
  const dates: string[] = [];
  for (let cur = Date.UTC(sy, sm - 1, sd); cur <= endMs; cur += 86_400_000) {
    dates.push(new Date(cur).toISOString().slice(0, 10));
  }
  return dates;
}

function findPlayerDay(day: ParsedDay, p: WatchPlayer): PlayerReport | undefined {
  const found = day.reports.get(p.id);
  if (found) return found;
  // Fall back to name match if the id changed / not present.
  for (const rep of day.reports.values()) {
    if (rep.savantName.toLowerCase() === p.savantName.toLowerCase()) return rep;
  }
  return undefined;
}

/**
 * A placeholder game for a watched player who is on a scheduled/in-progress
 * game's roster but hasn't come to the plate yet — so the card can show the
 * start time (or live score/inning) before any plate appearances exist.
 */
function upcomingGame(dg: DayGame, isHome: boolean): PlayerGame {
  return {
    gamePk: dg.gamePk,
    date: dg.date,
    homeTeam: dg.homeTeam,
    awayTeam: dg.awayTeam,
    batterTeam: isHome ? dg.homeTeam : dg.awayTeam,
    opponent: isHome ? dg.awayTeam : dg.homeTeam,
    isHome,
    stand: null,
    status: dg.status,
    probablePitcher: isHome ? dg.awayProbablePitcher : dg.homeProbablePitcher,
    plateAppearances: [],
    line: buildLine([]),
  };
}

/**
 * Build each watched player's games across an inclusive date range (a single
 * day is just startDate === endDate). Games from every day are merged and
 * sorted chronologically, since a player's card already knows how to render
 * multiple games (originally added for doubleheaders). A player rostered for a
 * scheduled/in-progress game they haven't batted in yet gets a placeholder game
 * so the card can still surface the start time or live score.
 */
export async function getReport(
  startDate: string,
  endDate: string,
  players: WatchPlayer[],
): Promise<PlayerReport[]> {
  const [days, playerStats] = await Promise.all([
    Promise.all(enumerateDates(startDate, endDate).map(getDay)),
    getPlayerStats(players.map((p) => p.id)),
  ]);

  return players.map((p) => {
    const games: PlayerGame[] = [];
    const seen = new Set<number>();
    for (const day of days) {
      const found = findPlayerDay(day, p);
      if (found) {
        for (const g of found.games) {
          games.push(g);
          seen.add(g.gamePk);
        }
      }
    }
    // Surface not-yet-batted games (scheduled or just underway) the player is
    // rostered for. Final games are skipped — a rostered player who never
    // appeared in a completed game should stay "did not appear", not show up.
    for (const day of days) {
      for (const dg of day.games) {
        if (dg.status.state === 'final' || seen.has(dg.gamePk)) continue;
        const isHome = dg.homePlayerIds.includes(p.id);
        if (!isHome && !dg.awayPlayerIds.includes(p.id)) continue;
        seen.add(dg.gamePk);
        games.push(upcomingGame(dg, isHome));
      }
    }
    games.sort((a, b) => (a.date === b.date ? a.gamePk - b.gamePk : a.date < b.date ? -1 : 1));
    const st = playerStats.get(p.id);
    return {
      ...p,
      found: games.length > 0,
      games,
      seasonStats: st?.season ?? null,
      splitVsLeft: st?.vsLeft ?? null,
      splitVsRight: st?.vsRight ?? null,
    };
  });
}
