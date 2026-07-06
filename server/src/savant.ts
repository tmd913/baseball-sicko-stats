import { parse } from 'csv-parse/sync';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getGameEvents, type GameEvents } from './mlbStats.js';
import type {
  Pitch,
  PlateAppearance,
  PlayerGame,
  PlayerReport,
  RosterEntry,
  BattingLine,
  WatchPlayer,
} from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'data', 'cache');

/** Build the Baseball Savant CSV export URL for a single date (YYYY-MM-DD). */
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

/** "Last, First" -> "First Last" */
function displayName(savantName: string): string {
  const idx = savantName.indexOf(',');
  if (idx === -1) return savantName;
  const last = savantName.slice(0, idx).trim();
  const first = savantName.slice(idx + 1).trim();
  return `${first} ${last}`.trim();
}

interface ParsedDay {
  date: string;
  reports: Map<number, PlayerReport>; // by batter id
  roster: RosterEntry[];
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
    headers: { 'User-Agent': 'previous-day-player-events/1.0' },
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
    // RBI (and SB/CS) come from the MLB Stats API during report enrichment.
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

function parseDay(date: string, csvText: string): ParsedDay {
  const records: Record<string, string>[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  });

  // Group rows: batterId -> gamePk -> atBatNumber -> pitches
  interface GameAccum {
    gamePk: number;
    homeTeam: string;
    awayTeam: string;
    pas: Map<number, Record<string, string>[]>;
  }
  const byBatter = new Map<
    number,
    { savantName: string; games: Map<number, GameAccum> }
  >();

  for (const r of records) {
    const batterId = int(r.batter);
    if (batterId === null) continue;
    const gamePk = int(r.game_pk);
    if (gamePk === null) continue;
    const atBat = int(r.at_bat_number);
    if (atBat === null) continue;

    let b = byBatter.get(batterId);
    if (!b) {
      b = { savantName: r.player_name, games: new Map() };
      byBatter.set(batterId, b);
    }
    let g = b.games.get(gamePk);
    if (!g) {
      g = {
        gamePk,
        homeTeam: r.home_team,
        awayTeam: r.away_team,
        pas: new Map(),
      };
      b.games.set(gamePk, g);
    }
    let paRows = g.pas.get(atBat);
    if (!paRows) {
      paRows = [];
      g.pas.set(atBat, paRows);
    }
    paRows.push(r);
  }

  const reports = new Map<number, PlayerReport>();
  const roster: RosterEntry[] = [];

  for (const [batterId, b] of byBatter) {
    const games: PlayerGame[] = [];
    for (const g of b.games.values()) {
      const paNumbers = [...g.pas.keys()].sort((a, c) => a - c);
      const plateAppearances: PlateAppearance[] = [];
      let stand: string | null = null;
      let isHome = false;

      for (const abNum of paNumbers) {
        const rows = g.pas
          .get(abNum)!
          .slice()
          .sort((a, c) => (int(a.pitch_number) ?? 0) - (int(c.pitch_number) ?? 0));
        const last = rows[rows.length - 1];
        const half = last.inning_topbot || '';
        // Top of inning = away team batting.
        const batterIsHome = half.toLowerCase().startsWith('bot');
        isHome = batterIsHome;
        stand = last.stand || stand;

        const pitches: Pitch[] = rows.map((p) => ({
          pitchNumber: int(p.pitch_number) ?? 0,
          pitchType: p.pitch_name || null,
          releaseSpeed: num(p.release_speed),
          spinRate: num(p.release_spin_rate),
          description: p.description || '',
          balls: int(p.balls),
          strikes: int(p.strikes),
          plateX: num(p.plate_x),
          plateZ: num(p.plate_z),
          szTop: num(p.sz_top),
          szBot: num(p.sz_bot),
          zone: int(p.zone),
          launchSpeed: num(p.launch_speed),
          launchAngle: num(p.launch_angle),
          hitDistance: num(p.hit_distance_sc),
          bbType: p.bb_type || null,
          batSpeed: num(p.bat_speed),
          swingLength: num(p.swing_length),
        }));

        plateAppearances.push({
          atBatNumber: abNum,
          inning: int(last.inning) ?? 0,
          half,
          outsWhenUp: int(last.outs_when_up),
          stand: last.stand || null,
          pThrows: last.p_throws || null,
          event: last.events || null,
          description: last.des || '',
          rbi: 0, // filled from the MLB Stats API during report enrichment
          playId: null, // filled from the MLB Stats API during report enrichment
          launchSpeed: num(last.launch_speed),
          launchAngle: num(last.launch_angle),
          hitDistance: num(last.hit_distance_sc),
          bbType: last.bb_type || null,
          xba: num(last.estimated_ba_using_speedangle),
          xwoba: num(last.estimated_woba_using_speedangle),
          deltaRunExp: num(last.delta_run_exp),
          deltaWinExp: num(last.delta_home_win_exp),
          pitches,
        });
      }

      // Only count real PAs (those with an outcome) toward the line.
      const completedPas = plateAppearances.filter((p) => p.event);
      const sample = g.pas.get(paNumbers[0])![0];
      const batterTeam = isHome ? g.homeTeam : g.awayTeam;
      const opponent = isHome ? g.awayTeam : g.homeTeam;

      games.push({
        gamePk: g.gamePk,
        date,
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        batterTeam,
        opponent,
        isHome,
        stand,
        plateAppearances,
        line: buildLine(completedPas),
      });
      void sample;
    }

    games.sort((a, c) => a.gamePk - c.gamePk);
    const name = displayName(b.savantName);
    reports.set(batterId, {
      id: batterId,
      savantName: b.savantName,
      name,
      found: true,
      games,
    });

    const g0 = games[0];
    roster.push({
      id: batterId,
      savantName: b.savantName,
      name,
      team: g0?.batterTeam ?? '',
      opponent: g0?.opponent ?? '',
      pa: games.reduce((s, g) => s + g.line.pa, 0),
    });
  }

  roster.sort((a, b) => a.name.localeCompare(b.name));
  return { date, reports, roster, fetchedAt: Date.now() };
}

/** How long a "today" fetch stays fresh before we re-download (ms). */
const TODAY_TTL = 10 * 60 * 1000;

export async function getDay(date: string): Promise<ParsedDay> {
  const cached = memCache.get(date);
  const isToday = date === new Date().toISOString().slice(0, 10);
  if (cached && (!isToday || Date.now() - cached.fetchedAt < TODAY_TTL)) {
    return cached;
  }
  const csvText = await downloadCsv(date);
  const parsed = parseDay(date, csvText);
  memCache.set(date, parsed);
  return parsed;
}

export async function getRoster(date: string): Promise<RosterEntry[]> {
  return (await getDay(date)).roster;
}

export async function getReport(
  date: string,
  players: WatchPlayer[],
): Promise<PlayerReport[]> {
  const day = await getDay(date);
  const reports = players.map((p) => {
    const found = day.reports.get(p.id);
    if (found) return found;
    // Fall back to name match if the id changed / not present.
    for (const rep of day.reports.values()) {
      if (rep.savantName.toLowerCase() === p.savantName.toLowerCase()) return rep;
    }
    return { ...p, found: false, games: [] };
  });
  await enrichWithStatsApi(reports);
  return reports;
}

/**
 * Fill in RBI (per PA + total) and SB/CS from the MLB Stats API play-by-play,
 * which carries official scoring. Best-effort: a failed game fetch leaves that
 * game's derived stats at 0 rather than failing the whole report.
 */
async function enrichWithStatsApi(reports: PlayerReport[]): Promise<void> {
  const gamePks = new Set<number>();
  for (const r of reports) {
    if (r.found) for (const g of r.games) gamePks.add(g.gamePk);
  }

  const eventsByGame = new Map<number, GameEvents>();
  await Promise.all(
    [...gamePks].map(async (pk) => {
      try {
        eventsByGame.set(pk, await getGameEvents(pk));
      } catch (err) {
        console.error(`play-by-play fetch failed for game ${pk}:`, err);
      }
    }),
  );

  for (const r of reports) {
    if (!r.found) continue;
    for (const g of r.games) {
      const ev = eventsByGame.get(g.gamePk);
      if (!ev) continue;
      for (const pa of g.plateAppearances) {
        pa.rbi = ev.rbiByAtBat.get(pa.atBatNumber) ?? 0;
        pa.playId = ev.playIdByAtBat.get(pa.atBatNumber) ?? null;
      }
      g.line.runs = ev.runsByRunner.get(r.id) ?? 0;
      g.line.rbi = ev.rbiByBatter.get(r.id) ?? 0;
      g.line.sb = ev.sbByRunner.get(r.id) ?? 0;
      g.line.cs = ev.csByRunner.get(r.id) ?? 0;
    }
  }
}
