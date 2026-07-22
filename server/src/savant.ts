import { parse } from 'csv-parse/sync';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getGamesForDate,
  getPitcherStats,
  getPlayerStats,
  getRosterInfo,
  getStatsApiGame,
} from './mlbStats.js';
import type { StatsApiPitch, StatsApiPitcherGame } from './mlbStats.js';
import { getSeasonArsenal } from './pitcherArsenal.js';
import type { Arsenal } from './pitcherArsenal.js';
import { getLeaguePitchAverage } from './pitchLeague.js';
import { toSavantName } from './names.js';
import type {
  FacedBatter,
  Pitch,
  PitchMix,
  PitcherGame,
  PitchingLine,
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
  gameNumber: number | null;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number | null;
  awayTeamId: number | null;
  status: GameStatus;
  homeProbablePitcher: ProbablePitcher | null;
  awayProbablePitcher: ProbablePitcher | null;
  homePlayerIds: number[];
  awayPlayerIds: number[];
  homeStarters: Map<number, number>;
  awayStarters: Map<number, number>;
}

/**
 * A player's lineup status and batting slot for a side whose announced starters
 * (id -> slot 1-9) are `starters`, shaped as the PlayerGame fields so it can be
 * spread in directly. An empty map means the lineup hasn't posted, so nothing is
 * known yet (null status).
 */
function lineupStatusFor(
  playerId: number,
  starters: Map<number, number>,
): { lineupStatus: 'starting' | 'bench' | null; lineupSpot: number | null } {
  if (starters.size === 0) return { lineupStatus: null, lineupSpot: null };
  const spot = starters.get(playerId);
  return spot !== undefined
    ? { lineupStatus: 'starting', lineupSpot: spot }
    : { lineupStatus: 'bench', lineupSpot: null };
}

interface ParsedDay {
  date: string;
  // Keyed by `${kind}-${id}` so a two-way player (bats AND pitches) can hold both
  // a batter report and a pitcher report without colliding.
  reports: Map<string, PlayerReport>;
  games: DayGame[];
  fetchedAt: number;
}

/**
 * Chronological order for a player's games: by date, then game number within a
 * day (doubleheaders), with gamePk as a last-resort tiebreak. gamePk is NOT a
 * reliable proxy for game order — a doubleheader's game 2 can carry a lower
 * gamePk than game 1 — so gameNumber leads. Falls back to gamePk only for older
 * cached games predating gameNumber (null).
 */
function byGameOrder(
  a: { date: string; gameNumber: number | null; gamePk: number },
  b: { date: string; gameNumber: number | null; gamePk: number },
): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return (a.gameNumber ?? 0) - (b.gameNumber ?? 0) || a.gamePk - b.gamePk;
}

const memCache = new Map<string, ParsedDay>();

/** True if the CSV has at least one data row (not just the header line). A
 *  headers-only export is what Savant returns for a date whose Statcast data
 *  hasn't posted yet (e.g. fetched mid-game); it must NOT be cached permanently
 *  or fields like bat speed stay null forever once real data lands. */
function hasDataRows(csvText: string): boolean {
  const trimmed = csvText.trim();
  if (trimmed.length === 0) return false;
  const nl = trimmed.indexOf('\n');
  return nl !== -1 && trimmed.slice(nl + 1).trim().length > 0;
}

async function downloadCsv(date: string): Promise<string> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `${date}.csv`);
  try {
    const cached = await fs.readFile(file, 'utf8');
    // Only trust a cached file that actually has data rows. A headers-only file
    // means the previous fetch ran before Statcast data posted; re-fetch so the
    // enrichment (bat speed, swing length, xBA/xwOBA) fills in once it's live.
    if (hasDataRows(cached)) return cached;
  } catch {
    // not cached yet
  }
  const res = await fetch(savantUrl(date), {
    headers: { 'User-Agent': 'statcast-sicko/1.0' },
  });
  if (!res.ok) {
    throw new Error(`Baseball Savant returned ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  // Persist only complete exports; an empty (headers-only) result is transient,
  // so leave it uncached and let the next request try again.
  if (hasDataRows(text)) await fs.writeFile(file, text, 'utf8');
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
    case 'intent_walk':
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
    if (pa.event === 'walk' || pa.event === 'intent_walk') line.bb++;
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

// ---- Pitcher game aggregation --------------------------------------------

// Swing-and-miss outcomes (Savant counts a foul tip as a whiff), and contact
// outcomes — together they make up "swings", the whiff-rate denominator.
const WHIFF_DESC = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul_tip']);
const CONTACT_DESC = new Set(['foul', 'foul_bunt', 'hit_into_play', 'foul_pitchout']);

// Baserunning / pickoff plays carry the batter who was up but aren't plate
// appearances, so they're excluded from the "batters faced" result list.
function isBaserunningEvent(e: string | null): boolean {
  if (!e) return false;
  return (
    e.startsWith('pickoff') ||
    e.startsWith('caught_stealing') ||
    e.startsWith('stolen_base') ||
    e === 'wild_pitch' ||
    e === 'passed_ball' ||
    e === 'balk' ||
    e === 'other_advance' ||
    e === 'defensive_indiff' ||
    e === 'runner_double_play' ||
    e === 'cs_double_play' ||
    e === 'error' ||
    e === 'runner_placed'
  );
}

const mean = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const round1 = (x: number | null): number | null => (x === null ? null : Math.round(x * 10) / 10);
const roundInt = (x: number | null): number | null => (x === null ? null : Math.round(x));

/** A degraded pitching line derived from the play stream when the boxscore line
 * is missing (old cache) — counting stats only; outs/runs can't be attributed
 * reliably from plays, so they stay 0 (the boxscore is the real source). */
function deriveLine(pg: StatsApiPitcherGame): PitchingLine {
  let hits = 0;
  let walks = 0;
  let strikeouts = 0;
  let hr = 0;
  for (const fb of pg.facedBatters) {
    const e = fb.event ?? '';
    if (e === 'single' || e === 'double' || e === 'triple' || e === 'home_run') hits++;
    if (e === 'home_run') hr++;
    if (e === 'walk' || e === 'intent_walk') walks++;
    if (e === 'strikeout' || e === 'strikeout_double_play') strikeouts++;
  }
  let strikes = 0;
  for (const p of pg.pitches) if (p.description !== 'ball' && p.description !== 'blocked_ball') strikes++;
  return {
    outs: 0,
    hits,
    runs: 0,
    earnedRuns: 0,
    walks,
    strikeouts,
    hr,
    battersFaced: pg.facedBatters.length,
    pitchesThrown: pg.pitches.length,
    strikes,
    balls: pg.pitches.length - strikes,
  };
}

/** Build the pitcher's-eye game view: the boxscore line, the batters faced
 * (result-only), the pitch-type arsenal, and whiff/CSW/strike rates. Season and
 * league arsenal baselines are filled later (per pitcher) in getReport. */
function buildPitcherGame(pg: StatsApiPitcherGame, line: PitchingLine | undefined): PitcherGame {
  const total = pg.pitches.length;
  let whiffs = 0;
  let swings = 0;
  let called = 0;
  const byType = new Map<string, StatsApiPitch[]>();
  for (const p of pg.pitches) {
    const d = p.description;
    const isWhiff = WHIFF_DESC.has(d);
    if (isWhiff) whiffs++;
    if (isWhiff || CONTACT_DESC.has(d)) swings++;
    if (d === 'called_strike') called++;
    const name = p.pitchType ?? 'Other';
    const list = byType.get(name);
    if (list) list.push(p);
    else byType.set(name, [p]);
  }

  const pitchMix: PitchMix[] = [...byType.entries()]
    .map(([pitchType, ps]): PitchMix => {
      let w = 0;
      let s = 0;
      for (const p of ps) {
        const isW = WHIFF_DESC.has(p.description);
        if (isW) w++;
        if (isW || CONTACT_DESC.has(p.description)) s++;
      }
      return {
        pitchType,
        count: ps.length,
        share: total ? ps.length / total : 0,
        whiffRate: s ? w / s : null,
        avgVelo: round1(mean(ps.map((p) => p.releaseSpeed))),
        avgSpin: roundInt(mean(ps.map((p) => p.spinRate))),
        hBreak: round1(mean(ps.map((p) => p.hBreak))),
        vBreak: round1(mean(ps.map((p) => p.vBreak))),
        seasonVelo: null,
        seasonSpin: null,
        seasonHBreak: null,
        seasonVBreak: null,
        leagueVelo: null,
        leagueSpin: null,
        leagueHBreak: null,
        leagueVBreak: null,
      };
    })
    .sort((a, b) => b.count - a.count);

  const pl = line ?? deriveLine(pg);
  const facedBatters: FacedBatter[] = pg.facedBatters
    .filter((fb) => !isBaserunningEvent(fb.event))
    .map((fb) => ({
    batterId: fb.batterId,
    batterName: fb.batterName,
    stand: fb.stand,
    inning: fb.inning,
    half: fb.half,
    outsWhenUp: fb.outsWhenUp,
    onBase: fb.onBase,
    event: fb.event,
    description: fb.description,
    rbi: fb.rbi,
    timestamp: fb.timestamp,
    playId: fb.playId,
    launchSpeed: fb.launchSpeed,
    hitDistance: fb.hitDistance,
    xwoba: null,
  }));

  return {
    line: pl,
    facedBatters,
    pitchMix,
    whiffRate: swings ? whiffs / swings : null,
    cswRate: total ? (called + whiffs) / total : null,
    strikePct: pl.pitchesThrown ? pl.strikes / pl.pitchesThrown : total ? (total - (pl.balls || 0)) / total : null,
    // A starter (or opener) faces the first batter of the game, in the 1st inning.
    isStart: pg.facedBatters[0]?.inning === 1,
  };
}

/** Fill a pitcher game's arsenal with season (his own) and league baselines,
 * orienting the league horizontal-break magnitude to his own break direction. */
function attachArsenalBaselines(
  pitching: PitcherGame,
  season: Map<string, { velo: number | null; spin: number | null; hBreak: number | null; vBreak: number | null }>,
): void {
  for (const m of pitching.pitchMix) {
    const sea = season.get(m.pitchType);
    if (sea) {
      m.seasonVelo = sea.velo;
      m.seasonSpin = sea.spin;
      m.seasonHBreak = sea.hBreak;
      m.seasonVBreak = sea.vBreak;
    }
    const lg = getLeaguePitchAverage(m.pitchType);
    if (lg) {
      m.leagueVelo = lg.velo;
      m.leagueSpin = lg.spin;
      m.leagueVBreak = lg.vBreak;
      // League hBreak is a magnitude; orient it to this pitcher's own horizontal
      // direction (his season, else this game) so signed deltas compare cleanly.
      const dir = (m.seasonHBreak ?? m.hBreak ?? 0) < 0 ? -1 : 1;
      m.leagueHBreak = lg.hBreak === null ? null : Math.abs(lg.hBreak) * dir;
    }
  }
}

// ---- Primary day builder (MLB Stats API) ---------------------------------

async function buildStatsApiDay(date: string): Promise<{
  byBatter: Map<number, { name: string; games: PlayerGame[] }>;
  byPitcher: Map<number, { name: string; games: PlayerGame[] }>;
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
  const byPitcher = new Map<number, { name: string; games: PlayerGame[] }>();
  const dayGames: DayGame[] = [];

  for (const g of games) {
    if (!g) continue;
    dayGames.push({
      gamePk: g.gamePk,
      gameNumber: g.gameNumber,
      date,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      status: g.status,
      homeProbablePitcher: g.homeProbablePitcher,
      awayProbablePitcher: g.awayProbablePitcher,
      homePlayerIds: [...g.homePlayerIds],
      awayPlayerIds: [...g.awayPlayerIds],
      homeStarters: g.homeStarters,
      awayStarters: g.awayStarters,
    });
    for (const bg of g.batters.values()) {
      const plateAppearances: PlateAppearance[] = bg.plateAppearances.map((pa) => ({
        atBatNumber: pa.atBatNumber,
        inning: pa.inning,
        half: pa.half,
        timestamp: pa.timestamp,
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
        gameNumber: g.gameNumber,
        date,
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        batterTeam,
        opponent,
        isHome: bg.isHome,
        stand: bg.stand,
        status: g.status,
        ...lineupStatusFor(bg.batterId, bg.isHome ? g.homeStarters : g.awayStarters),
        // The batter faces the opposing team's starter.
        probablePitcher: bg.isHome ? g.awayProbablePitcher : g.homeProbablePitcher,
        plateAppearances,
        baseEvents: (g.baseEvents.get(bg.batterId) ?? []).map((e) => ({
          kind: e.kind,
          inning: e.inning,
          half: e.half,
          timestamp: e.timestamp,
          base: e.base,
        })),
        // line is finalized after CSV enrichment is merged in (below), since
        // run value / avg exit velo depend on fields the enrichment fills in.
        line: buildLine(plateAppearances.filter((p) => p.event)),
        pitching: null,
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

    // Pitcher's-eye games, from the same plays regrouped by pitcher.
    for (const pg of g.pitchers.values()) {
      const pitcherTeam = pg.isHome ? g.homeTeam : g.awayTeam;
      const opponent = pg.isHome ? g.awayTeam : g.homeTeam;
      const pitcherGame: PlayerGame = {
        gamePk: g.gamePk,
        gameNumber: g.gameNumber,
        date,
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        batterTeam: pitcherTeam,
        opponent,
        isHome: pg.isHome,
        stand: pg.throws, // the pitcher's throwing hand
        status: g.status,
        lineupStatus: null,
        lineupSpot: null,
        probablePitcher: null,
        plateAppearances: [],
        baseEvents: [],
        line: buildLine([]),
        pitching: buildPitcherGame(pg, g.pitchingLines.get(pg.pitcherId)),
      };
      let pb = byPitcher.get(pg.pitcherId);
      if (!pb) {
        pb = { name: pg.pitcherName, games: [] };
        byPitcher.set(pg.pitcherId, pb);
      }
      pb.games.push(pitcherGame);
    }
  }

  return { byBatter, byPitcher, dayGames };
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

  const { byBatter, byPitcher, dayGames } = await buildStatsApiDay(date);

  let enrichment = EMPTY_ENRICHMENT;
  try {
    enrichment = parseCsvEnrichment(await downloadCsv(date));
  } catch (err) {
    console.error(`Savant CSV enrichment unavailable for ${date}:`, err);
  }

  const reports = new Map<string, PlayerReport>();

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

    b.games.sort(byGameOrder);
    reports.set(`batter-${batterId}`, {
      id: batterId,
      savantName: toSavantName(b.name),
      name: b.name,
      kind: 'batter',
      found: true,
      games: b.games,
      // Filled in by getReport, which fetches season stats + roster status per
      // watched player.
      seasonStats: null,
      pitcherSeasonStats: null,
      splitVsLeft: null,
      splitVsRight: null,
      rosterStatus: null,
    });
  }

  for (const [pitcherId, pb] of byPitcher) {
    pb.games.sort(byGameOrder);
    reports.set(`pitcher-${pitcherId}`, {
      id: pitcherId,
      savantName: toSavantName(pb.name),
      name: pb.name,
      kind: 'pitcher',
      found: true,
      games: pb.games,
      seasonStats: null,
      pitcherSeasonStats: null,
      splitVsLeft: null,
      splitVsRight: null,
      rosterStatus: null,
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
  const found = day.reports.get(`${p.kind}-${p.id}`);
  if (found) return found;
  // Fall back to a same-kind name match if the id changed / isn't present.
  for (const rep of day.reports.values()) {
    if (rep.kind === p.kind && rep.savantName.toLowerCase() === p.savantName.toLowerCase()) {
      return rep;
    }
  }
  return undefined;
}

/**
 * A placeholder game for a watched player who is on a game's roster but has no
 * plate appearances of their own — either the game hasn't started (show the
 * start time / live score) or it finished without them batting (show the final
 * score alongside "did not appear").
 */
function rosterGame(dg: DayGame, isHome: boolean, playerId: number): PlayerGame {
  return {
    gamePk: dg.gamePk,
    gameNumber: dg.gameNumber,
    date: dg.date,
    homeTeam: dg.homeTeam,
    awayTeam: dg.awayTeam,
    batterTeam: isHome ? dg.homeTeam : dg.awayTeam,
    opponent: isHome ? dg.awayTeam : dg.homeTeam,
    isHome,
    stand: null,
    status: dg.status,
    ...lineupStatusFor(playerId, isHome ? dg.homeStarters : dg.awayStarters),
    probablePitcher: isHome ? dg.awayProbablePitcher : dg.homeProbablePitcher,
    plateAppearances: [],
    baseEvents: [],
    line: buildLine([]),
    pitching: null,
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
  const ids = players.map((p) => p.id);
  const batterIds = players.filter((p) => p.kind === 'batter').map((p) => p.id);
  const pitcherIds = players.filter((p) => p.kind === 'pitcher').map((p) => p.id);
  const [days, playerStats, pitcherStats, rosterInfo] = await Promise.all([
    Promise.all(enumerateDates(startDate, endDate).map(getDay)),
    getPlayerStats(batterIds),
    getPitcherStats(pitcherIds),
    getRosterInfo(ids),
  ]);

  // Each watched pitcher's season arsenal (fetched once) — for the per-game
  // velo/spin/break vs season-average comparison on the card.
  const arsenals = new Map<number, Arsenal>();
  await Promise.all(
    pitcherIds.map(async (id) => {
      try {
        arsenals.set(id, await getSeasonArsenal(id));
      } catch (err) {
        console.error(`pitcher arsenal fetch failed for ${id}:`, err);
      }
    }),
  );

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
    // Surface games the player didn't bat in but is still tied to — either they
    // were on the game's boxscore roster (rostered, benched or not-yet-started),
    // or they're off the active roster (suspended / on the IL / optioned) and so
    // absent from every boxscore, in which case any game their current team plays
    // stands in. Either way the card keeps the game info (start time / score),
    // and the roster status below explains an off-roster absence. Games they
    // batted in are already in `seen`.
    const teamId = rosterInfo.get(p.id)?.teamId ?? null;
    for (const day of days) {
      for (const dg of day.games) {
        if (seen.has(dg.gamePk)) continue;
        const isHome =
          dg.homePlayerIds.includes(p.id) || (teamId !== null && dg.homeTeamId === teamId);
        const isAway =
          dg.awayPlayerIds.includes(p.id) || (teamId !== null && dg.awayTeamId === teamId);
        if (!isHome && !isAway) continue;
        seen.add(dg.gamePk);
        games.push(rosterGame(dg, isHome, p.id));
      }
    }
    games.sort(byGameOrder);
    const rosterStatus = rosterInfo.get(p.id)?.status ?? null;

    if (p.kind === 'pitcher') {
      const arsenal = arsenals.get(p.id);
      if (arsenal) {
        for (const g of games) if (g.pitching) attachArsenalBaselines(g.pitching, arsenal);
      }
      return {
        ...p,
        found: games.length > 0,
        games,
        seasonStats: null,
        pitcherSeasonStats: pitcherStats.get(p.id)?.season ?? null,
        splitVsLeft: null,
        splitVsRight: null,
        rosterStatus,
      };
    }

    const st = playerStats.get(p.id);
    return {
      ...p,
      found: games.length > 0,
      games,
      seasonStats: st?.season ?? null,
      pitcherSeasonStats: null,
      splitVsLeft: st?.vsLeft ?? null,
      splitVsRight: st?.vsRight ?? null,
      rosterStatus,
    };
  });
}
