import { parse } from 'csv-parse/sync';
import { readBlob, readGzipBlob, writeBlob, writeGzipBlob } from './storage.js';
import { mapLimit } from './limit.js';
import { baseballToday } from './etDate.js';
import { getTeamHitting } from './teamStats.js';
import { fipLike, ipToOuts, LEAGUE_HR_PER_FB } from './leagueRates.js';
import {
  getAllRosterStatuses,
  getGamesForDate,
  getPitcherStats,
  getPlayerStats,
  getRosterInfo,
  getSeasonPlayers,
  getStatsApiGame,
} from './mlbStats.js';
import type {
  StatsApiFacedBatter,
  StatsApiGame,
  StatsApiPitch,
  StatsApiPitcherGame,
} from './mlbStats.js';
import { getSeasonArsenal } from './pitcherArsenal.js';
import { getPitcherXera } from './expectedStats.js';
import type { Arsenal, BattedBallMix, SeasonArsenals } from './pitcherArsenal.js';
import { getLeaguePitchAverage } from './pitchLeague.js';
import { toSavantName } from './names.js';
import type {
  FacedBatter,
  PlayerStatus,
  RosterStatus,
  Pitch,
  PitchMix,
  PitcherGame,
  PitcherSeasonStats,
  PitcherSplit,
  PitchingLine,
  PlateAppearance,
  PlayerGame,
  PlayerKind,
  PlayerReport,
  BattingLine,
  GameStatus,
  PitchingCredit,
  ProbablePitcher,
  TeamHitting,
  WatchPlayer,
} from './types.js';

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
  // The ids of the game's two starting pitchers, from the boxscore. Empty until
  // first pitch. An array, not a Set — a day is snapshotted as JSON.
  pitchingStarterIds: number[];
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

/**
 * A pitcher's role in a game, shaped as the PlayerGame fields so it can be
 * spread in — the pitcher-side mirror of lineupStatusFor. A starter's entry
 * inning is left null (it's the 1st by definition); a reliever carries the
 * inning he first pitched in. Neither is known until he's announced or appears.
 */
function pitchingRoleFor(
  isStarter: boolean,
  firstInning: number | null,
): { pitchingRole: 'starting' | 'relief' | null; entryInning: number | null } {
  if (isStarter) return { pitchingRole: 'starting', entryInning: null };
  if (firstInning === null) return { pitchingRole: null, entryInning: null };
  return { pitchingRole: 'relief', entryInning: firstInning };
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

/** Exported as `downloadDayCsv` below — `statcastWindow.ts` builds a windowed
 *  board by reducing these same per-date exports to per-player counts, and
 *  reuses this so a day already on disk for the report is never fetched twice. */
async function downloadCsv(date: string): Promise<string> {
  const cached = await readBlob(`${date}.csv`);
  // Only trust a cached file that actually has data rows. A headers-only file
  // means the previous fetch ran before Statcast data posted; re-fetch so the
  // enrichment (bat speed, swing length, xBA/xwOBA) fills in once it's live.
  if (cached !== null && hasDataRows(cached)) return cached;
  const res = await fetch(savantUrl(date), {
    headers: { 'User-Agent': 'statcast-sicko/1.0' },
  });
  if (!res.ok) {
    throw new Error(`Baseball Savant returned ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  // Persist only complete exports; an empty (headers-only) result is transient,
  // so leave it uncached and let the next request try again.
  if (hasDataRows(text)) await writeBlob(`${date}.csv`, text);
  return text;
}

export { downloadCsv as downloadDayCsv };

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

/** Project an internal Stats API pitch onto the client `Pitch` shape. Statcast
 * bat-tracking (batSpeed/swingLength) comes only from the Savant CSV enrichment,
 * so it starts null here (batter PAs fill it in `getDay`). */
function toClientPitch(p: StatsApiPitch): Pitch {
  return {
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
  };
}

// Swing-and-miss outcomes (Savant counts a foul tip as a whiff), and contact
// outcomes — together they make up "swings", the whiff-rate denominator.
const WHIFF_DESC = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul_tip']);
const CONTACT_DESC = new Set(['foul', 'foul_bunt', 'hit_into_play', 'foul_pitchout']);
// Everything that isn't ruled a ball is a strike — called, swinging, foul, in
// play — which is the same split the boxscore's balls/strikes counts use.
const BALL_DESC = new Set([
  'ball',
  'blocked_ball',
  'intent_ball',
  'automatic_ball',
  'pitchout',
  'hit_by_pitch',
]);
const isStrikePitch = (description: string): boolean => !BALL_DESC.has(description);

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

/**
 * A pitching line counted off the play stream. Used both as the fallback when
 * the boxscore line is missing (old cache) and as the only way to build the
 * vs-RHB / vs-LHB splits, which the boxscore doesn't carry. Counting stats
 * only: outs and runs can't be attributed reliably from plays, so they stay 0
 * (the boxscore is the real source for those).
 */
function deriveLine(faced: StatsApiFacedBatter[], pitches: StatsApiPitch[]): PitchingLine {
  let hits = 0;
  let walks = 0;
  let intentionalWalks = 0;
  let strikeouts = 0;
  let hr = 0;
  let doubles = 0;
  let triples = 0;
  let hitBatsmen = 0;
  let runs = 0;
  let earnedRuns = 0;
  let notAtBats = 0; // walks, HBP and sacrifices — everything BAA excludes
  for (const fb of faced) {
    const e = fb.event ?? '';
    // Runs that scored on this play and were charged to this pitcher. Sums to
    // the boxscore's total only when he left no runners behind for a reliever.
    runs += fb.runs;
    earnedRuns += fb.earnedRuns;
    if (e === 'single' || e === 'double' || e === 'triple' || e === 'home_run') hits++;
    if (e === 'double') doubles++;
    if (e === 'triple') triples++;
    if (e === 'home_run') hr++;
    if (e === 'walk' || e === 'intent_walk') walks++;
    if (e === 'intent_walk') intentionalWalks++;
    if (e === 'hit_by_pitch') hitBatsmen++;
    if (e === 'strikeout' || e === 'strikeout_double_play') strikeouts++;
    if (
      e === 'walk' ||
      e === 'intent_walk' ||
      e === 'hit_by_pitch' ||
      e === 'sac_fly' ||
      e === 'sac_bunt' ||
      e === 'sac_fly_double_play' ||
      e === 'sac_bunt_double_play' ||
      e === 'catcher_interf'
    )
      notAtBats++;
  }
  let strikes = 0;
  for (const p of pitches) if (isStrikePitch(p.description)) strikes++;
  return {
    // Outs can't be attributed reliably from the play stream — the boxscore is
    // the only source, and a handedness split has no meaningful innings anyway.
    outs: 0,
    hits,
    runs,
    earnedRuns,
    walks,
    strikeouts,
    hr,
    battersFaced: faced.length,
    pitchesThrown: pitches.length,
    strikes,
    balls: pitches.length - strikes,
    doubles,
    triples,
    hitBatsmen,
    atBats: Math.max(0, faced.length - notAtBats),
    intentionalWalks,
    // Not derivable from the play loop — they only come off the boxscore.
    wildPitches: 0,
    inheritedRunners: 0,
    inheritedRunnersScored: 0,
    wins: 0,
    saves: 0,
    holds: 0,
  };
}

/** This pitcher's decision in the game (win, loss, or save), or null. */
function pitcherDecision(g: StatsApiGame, pitcherId: number): PitchingCredit | null {
  const d = g.decisions;
  if (d.win === pitcherId) return 'W';
  if (d.loss === pitcherId) return 'L';
  if (d.save === pitcherId) return 'S';
  // A hold is the reliever's version of the same thing, and `liveData.decisions`
  // has no slot for it — the boxscore line is the only place it appears. Checked
  // last because the official decision outranks it (they're mutually exclusive
  // by rule, but a feed that disagrees shouldn't demote a save to a hold).
  if ((g.pitchingLines.get(pitcherId)?.holds ?? 0) > 0) return 'H';
  return null;
}

/** Build the pitcher's-eye game view: the boxscore line, the batters faced
 * (result-only), the pitch-type arsenal, and whiff/CSW/strike rates. Season and
 * league arsenal baselines are filled later (per pitcher) in getReport. */
function aggregatePitches(pitches: StatsApiPitch[]): {
  pitchMix: PitchMix[];
  whiffRate: number | null;
  cswRate: number | null;
} {
  const total = pitches.length;
  let whiffs = 0;
  let swings = 0;
  let called = 0;
  const byType = new Map<string, StatsApiPitch[]>();
  for (const p of pitches) {
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
      let strikes = 0;
      for (const p of ps) {
        const isW = WHIFF_DESC.has(p.description);
        if (isW) w++;
        if (isW || CONTACT_DESC.has(p.description)) s++;
        if (isStrikePitch(p.description)) strikes++;
      }
      return {
        pitchType,
        count: ps.length,
        strikes,
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
        seasonPa: null,
        seasonBa: null,
        seasonSlg: null,
        seasonWoba: null,
        seasonXwoba: null,
        seasonWhiff: null,
        seasonPutAway: null,
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    pitchMix,
    whiffRate: swings ? whiffs / swings : null,
    cswRate: total ? (called + whiffs) / total : null,
  };
}

/**
 * The outing restricted to the batters of one handedness — the same aggregation
 * over just their plate appearances and the pitches thrown in them.
 */
function buildSplit(faced: StatsApiFacedBatter[]): PitcherSplit {
  const pitches = faced.flatMap((fb) => fb.pitches);
  const line = deriveLine(faced, pitches);
  return {
    line,
    ...aggregatePitches(pitches),
    strikePct: pitches.length ? line.strikes / pitches.length : null,
  };
}

/** Build the pitcher's-eye game view: the boxscore line, the batters faced
 * (result-only), the pitch-type arsenal, whiff/CSW/strike rates, and the same
 * view split by batter handedness. Season and league arsenal baselines are
 * filled later (per pitcher) in getReport. */
function buildPitcherGame(
  pg: StatsApiPitcherGame,
  line: PitchingLine | undefined,
  decision: PitchingCredit | null,
  isStart: boolean,
): PitcherGame {
  const overall = aggregatePitches(pg.pitches);
  // Baserunning-only plays (pickoffs, steals) carry a batter but aren't plate
  // appearances, so they're out of both the result list and the splits.
  const faced = pg.facedBatters.filter((fb) => !isBaserunningEvent(fb.event));
  const byHand = (stand: string) => faced.filter((fb) => fb.stand === stand);
  const hasHand = (stand: string) => faced.some((fb) => fb.stand === stand);

  const pl = line ?? deriveLine(pg.facedBatters, pg.pitches);
  const facedBatters: FacedBatter[] = faced.map((fb) => ({
    batterId: fb.batterId,
    batterName: fb.batterName,
    stand: fb.stand,
    atBatNumber: fb.atBatNumber,
    inning: fb.inning,
    half: fb.half,
    outsWhenUp: fb.outsWhenUp,
    onBase: fb.onBase,
    event: fb.event,
    description: fb.description,
    rbi: fb.rbi,
    runs: fb.runs,
    earnedRuns: fb.earnedRuns,
    timestamp: fb.timestamp,
    playId: fb.playId,
    launchSpeed: fb.launchSpeed,
    launchAngle: fb.launchAngle,
    hitDistance: fb.hitDistance,
    bbType: fb.bbType,
    xwoba: null,
    pitches: fb.pitches.map(toClientPitch),
  }));

  const total = pg.pitches.length;
  return {
    line: pl,
    facedBatters,
    vsRight: hasHand('R') ? buildSplit(byHand('R')) : null,
    vsLeft: hasHand('L') ? buildSplit(byHand('L')) : null,
    pitchMix: overall.pitchMix,
    whiffRate: overall.whiffRate,
    cswRate: overall.cswRate,
    strikePct: pl.pitchesThrown ? pl.strikes / pl.pitchesThrown : total ? (total - (pl.balls || 0)) / total : null,
    isStart,
    decision,
  };
}

/**
 * The season line with the two estimators the MLB line can't carry: xFIP (his
 * own home runs swapped for his fly balls at the league rate, which needs the
 * Savant season CSV's batted-ball mix) and xERA (Statcast's, read straight off
 * the expected-stats leaderboard). Both land here rather than where the rest of
 * the line is built because both wait on a Savant fetch.
 */
export function withEstimators(
  season: PitcherSeasonStats | null,
  bb: BattedBallMix | undefined,
  xera: string | undefined,
): PitcherSeasonStats | null {
  if (!season) return season;
  const xfip =
    bb && bb.fly > 0
      ? fipLike(
          bb.fly * LEAGUE_HR_PER_FB,
          season.baseOnBalls,
          season.hitBatsmen,
          season.strikeOuts,
          ipToOuts(season.inningsPitched),
        )
      : null;
  // A copy: the stats cache hands out the same object to every request.
  return {
    ...season,
    xfip: xfip === null ? season.xfip : xfip.toFixed(2),
    xera: xera ?? season.xera,
  };
}

/** Fill one mix's rows with season (his own) and league baselines, orienting
 * the league horizontal-break magnitude to his own break direction. */
function fillBaselines(mix: PitchMix[], season: Arsenal, fallback: Arsenal): void {
  for (const m of mix) {
    // A split arsenal can be missing a pitch he's thrown only a handful of
    // times to that hand; his season-wide row is a better baseline than none.
    const sea = season.get(m.pitchType) ?? fallback.get(m.pitchType);
    if (sea) {
      m.seasonVelo = sea.velo;
      m.seasonSpin = sea.spin;
      m.seasonHBreak = sea.hBreak;
      m.seasonVBreak = sea.vBreak;
      m.seasonPa = sea.pa;
      m.seasonBa = sea.ba;
      m.seasonSlg = sea.slg;
      m.seasonWoba = sea.woba;
      m.seasonXwoba = sea.xwoba;
      m.seasonWhiff = sea.whiff;
      m.seasonPutAway = sea.putAway;
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

/**
 * Fill a pitcher game's arsenal with his season baselines and the league's.
 * **Each handedness split is measured against that same split of his season**,
 * not against his season as a whole — the details view's Arsenal tab reads that
 * way (its vs RHB rows are aggregated from the righty half of the CSV), and a
 * card whose "vs RHB" tab changed the game numbers while its season column sat
 * still was comparing two different populations.
 */
function attachArsenalBaselines(pitching: PitcherGame, season: SeasonArsenals): void {
  fillBaselines(pitching.pitchMix, season.all, season.all);
  if (pitching.vsRight) fillBaselines(pitching.vsRight.pitchMix, season.vsRight, season.all);
  if (pitching.vsLeft) fillBaselines(pitching.vsLeft.pitchMix, season.vsLeft, season.all);
}

// ---- Primary day builder (MLB Stats API) ---------------------------------

async function buildStatsApiDay(date: string): Promise<{
  byBatter: Map<number, { name: string; games: PlayerGame[] }>;
  byPitcher: Map<number, { name: string; games: PlayerGame[] }>;
  dayGames: DayGame[];
}> {
  const scheduled = await getGamesForDate(date);
  const games = await mapLimit(scheduled, GAME_CONCURRENCY, async (s) => {
    try {
      return { game: await getStatsApiGame(s.gamePk), sched: s };
    } catch (err) {
      console.error(`live feed fetch failed for game ${s.gamePk}:`, err);
      return null;
    }
  });

  const byBatter = new Map<number, { name: string; games: PlayerGame[] }>();
  const byPitcher = new Map<number, { name: string; games: PlayerGame[] }>();
  const dayGames: DayGame[] = [];

  for (const entry of games) {
    if (!entry) continue;
    const { game: g, sched } = entry;
    // A postponed game's own feed/live has rolled forward to its makeup date
    // (reading "Scheduled"); only the queried date's schedule still calls it
    // postponed, so that verdict overrides the feed-derived status here.
    const status: GameStatus = sched.postponed
      ? { ...g.status, state: 'postponed', detailedState: sched.detailedState || 'Postponed', startTime: null }
      : g.status;
    dayGames.push({
      gamePk: g.gamePk,
      gameNumber: g.gameNumber,
      date,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      status,
      homeProbablePitcher: g.homeProbablePitcher,
      awayProbablePitcher: g.awayProbablePitcher,
      pitchingStarterIds: [...g.pitchingStarters],
      homePlayerIds: [...g.homePlayerIds],
      awayPlayerIds: [...g.awayPlayerIds],
      homeStarters: g.homeStarters,
      awayStarters: g.awayStarters,
    });
    for (const bg of g.batters.values()) {
      // A play whose *result* is a baserunning event carries the batter who was
      // up but is not his plate appearance — MLB only files one that way when it
      // ended the half-inning (all 31 of them in a checked 111 games were the
      // third out), so the at-bat itself resumes in the next inning and this row
      // is somebody else's caught stealing wearing his name. It was showing up
      // in his feed as an out and counting toward his PA total; the pitcher side
      // has excluded it since `buildPitcherGame`, and now both do.
      const plateAppearances: PlateAppearance[] = bg.plateAppearances
        .filter((pa) => !isBaserunningEvent(pa.event))
        .map((pa) => ({
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
          awayScore: pa.awayScore,
          homeScore: pa.homeScore,
          launchSpeed: pa.launchSpeed,
          launchAngle: pa.launchAngle,
          hitDistance: pa.hitDistance,
          bbType: pa.bbType,
          xba: null,
          xwoba: null,
          deltaRunExp: null,
          deltaWinExp: pa.deltaWinExp,
          pitches: pa.pitches.map(toClientPitch),
          actions: pa.actions,
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
        status,
        ...lineupStatusFor(bg.batterId, bg.isHome ? g.homeStarters : g.awayStarters),
        // Pitching role is the pitcher-side mirror of that lineup status; a
        // batter's game never carries one (a two-way player's pitching shows up
        // in his own pitcher report).
        pitchingRole: null,
        entryInning: null,
        opponentId: bg.isHome ? g.awayTeamId : g.homeTeamId,
        opponentHitting: null,
        // The batter faces the opposing team's starter.
        probablePitcher: bg.isHome ? g.awayProbablePitcher : g.homeProbablePitcher,
        plateAppearances,
        baseEvents: (g.baseEvents.get(bg.batterId) ?? []).map((e) => ({ ...e })),
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
      // Starter or reliever: the boxscore's gamesStarted is definitive, so a
      // pitcher missing from a non-empty starter set relieved. Only when the
      // boxscore carries no pitching stats at all (an old cached feed) do the
      // announced probable and "faced someone in the 1st" stand in.
      const ownProbable = pg.isHome ? g.homeProbablePitcher : g.awayProbablePitcher;
      const firstInning = pg.facedBatters[0]?.inning ?? null;
      const isStart =
        g.pitchingStarters.size > 0
          ? g.pitchingStarters.has(pg.pitcherId)
          : ownProbable?.id === pg.pitcherId || firstInning === 1;
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
        status,
        lineupStatus: null,
        lineupSpot: null,
        ...pitchingRoleFor(isStart, firstInning),
        opponentId: pg.isHome ? g.awayTeamId : g.homeTeamId,
        // Filled per team in getReport — the day builder shouldn't fan out to
        // another API for a lineup nobody has asked about yet.
        opponentHitting: null,
        // His counterpart: the starter the other side announced. Nothing on the
        // pitcher side of the card reads it (the lineup he faces is the useful
        // half), but the summary table's opponent column shows the matchup.
        probablePitcher: pg.isHome ? g.awayProbablePitcher : g.homeProbablePitcher,
        plateAppearances: [],
        // The half of the day's base events he was a party to — his balk, his
        // wild pitch, the bag taken off him, the man he picked off. Same shape
        // and same feed item as a runner's, so the pitcher stream reads the way
        // the batter stream does.
        baseEvents: (g.pitcherBaseEvents.get(pg.pitcherId) ?? []).map((e) => ({ ...e })),
        line: buildLine([]),
        pitching: buildPitcherGame(
          pg,
          g.pitchingLines.get(pg.pitcherId),
          pitcherDecision(g, pg.pitcherId),
          isStart,
        ),
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

/**
 * Which players a caller actually needs out of a day.
 *
 * A day holds a report for *every* player who appeared — on the order of 600,
 * several MB parsed — so a 62-day range that keeps them all resident is most of
 * a gigabyte of heap for a watchlist of 27. Filtering at parse time is what
 * makes a wide range viable inside a Lambda.
 *
 * `names` exists because `findPlayerDay` falls back to a same-kind name match
 * when a player's id isn't present that day; filtering on ids alone would
 * quietly break that fallback.
 */
export interface DayFilter {
  keys: Set<string>;
  names: Set<string>;
}

export function dayFilterFor(players: WatchPlayer[]): DayFilter {
  return {
    keys: new Set(players.map((p) => `${p.kind}-${p.id}`)),
    names: new Set(players.map((p) => `${p.kind}|${p.savantName.toLowerCase()}`)),
  };
}

function wanted(filter: DayFilter, key: string, rep: PlayerReport): boolean {
  return (
    filter.keys.has(key) || filter.names.has(`${rep.kind}|${rep.savantName.toLowerCase()}`)
  );
}

/** A stable cache key for a filter — the watchlist rarely changes, so the 20s
 *  report poll keeps hitting the same projection. */
function filterKey(filter: DayFilter): string {
  return [...filter.keys].sort().join(',');
}

function projectDay(day: ParsedDay, filter: DayFilter): ParsedDay {
  const reports = new Map<string, PlayerReport>();
  for (const [key, rep] of day.reports) {
    if (wanted(filter, key, rep)) reports.set(key, rep);
  }
  return { ...day, reports };
}

/** Bump when the shape of a stored day changes, so old snapshots are ignored
 *  rather than deserialized into the wrong model. v2 stores each game's
 *  starting lineups as entry pairs — as Maps they serialized to `{}`; v3 added
 *  the pitching role (starter/reliever + entry inning) each game carries, the
 *  starting-pitcher ids the placeholder games read it from, the pitching line's
 *  win/save/hold credits, and each game's opposing team id; v4 fills the
 *  opposing probable starter on a pitcher's own game, which used to be null; v5
 *  gives each base event its clip, description, matchup and count, which a v4
 *  snapshot has none of and would go on serving as a bare badge forever. */
const DAY_SNAPSHOT_VERSION = 6;

/**
 * The on-the-wire form of a day.
 *
 * Two things here are Maps, and `JSON.stringify` silently turns a Map into
 * `{}` rather than failing — so both need explicit conversion: `reports`, and
 * the per-side starting lineups nested inside each game.
 */
interface StoredDay {
  date: string;
  reports: Record<string, PlayerReport>;
  games: StoredDayGame[];
}

type StoredDayGame = Omit<DayGame, 'homeStarters' | 'awayStarters'> & {
  homeStarters: [number, number][];
  awayStarters: [number, number][];
};

function storeGame(g: DayGame): StoredDayGame {
  return { ...g, homeStarters: [...g.homeStarters], awayStarters: [...g.awayStarters] };
}

function loadGame(g: StoredDayGame): DayGame {
  return {
    ...g,
    homeStarters: new Map(g.homeStarters ?? []),
    awayStarters: new Map(g.awayStarters ?? []),
  };
}

const snapshotKey = (date: string) => `day-${date}-v${DAY_SNAPSHOT_VERSION}.json`;

/**
 * A finished day, stored as one gzipped object.
 *
 * Rebuilding a day otherwise costs a schedule fetch plus a read per game (~16
 * for a full slate) plus the Savant CSV. Collapsing that to a single read is
 * the difference between a wide date range fitting in API Gateway's 30s budget
 * and not.
 */
async function readDaySnapshot(date: string, filter: DayFilter): Promise<ParsedDay | null> {
  const raw = await readGzipBlob(snapshotKey(date));
  if (raw === null) return null;
  try {
    const stored = JSON.parse(raw) as StoredDay;
    const reports = new Map<string, PlayerReport>();
    // Filter while walking the parsed object rather than building the full Map
    // and pruning it after.
    for (const [key, rep] of Object.entries(stored.reports ?? {})) {
      if (wanted(filter, key, rep)) reports.set(key, rep);
    }
    return {
      date,
      reports,
      games: (stored.games ?? []).map(loadGame),
      fetchedAt: Date.now(),
    };
  } catch (err) {
    console.error(`day snapshot unreadable for ${date}:`, err);
    return null;
  }
}

async function writeDaySnapshot(day: ParsedDay): Promise<void> {
  const stored: StoredDay = {
    date: day.date,
    reports: Object.fromEntries(day.reports),
    games: day.games.map(storeGame),
  };
  await writeGzipBlob(snapshotKey(day.date), JSON.stringify(stored));
}

/** Frozen days, already narrowed to one watchlist. Bounded because the key
 *  includes the watchlist, so a multi-user server would otherwise accumulate a
 *  projection per user per date. */
const projectedCache = new Map<string, ParsedDay>();
const PROJECTED_CACHE_MAX = 200;

function rememberProjection(key: string, day: ParsedDay): ParsedDay {
  if (projectedCache.size >= PROJECTED_CACHE_MAX) {
    const oldest = projectedCache.keys().next().value;
    if (oldest !== undefined) projectedCache.delete(oldest);
  }
  projectedCache.set(key, day);
  return day;
}

/** How many days / games of a report may be in flight at once. Caps the socket
 *  count against MLB's APIs, and more importantly bounds how many fully-parsed
 *  days are resident at the same time. */
const DAY_CONCURRENCY = 6;
const GAME_CONCURRENCY = 8;
// Opposing-lineup fetches: at most one per team in the range, nearly always a
// cache hit after the first report of the day.
const TEAM_CONCURRENCY = 6;

/**
 * A day's parsed model. Pass `filter` to get back only the players it names —
 * required for wide ranges, since the unfiltered model is far larger than any
 * one watchlist needs.
 */
export async function getDay(date: string, filter?: DayFilter): Promise<ParsedDay> {
  // Today and future dates are still mutable (scores accrue, lineups/rosters get
  // posted closer to first pitch), so they honor the TTL. Past dates are frozen.
  // A day stays mutable until the *baseball* day has moved past it (3am ET, see
  // etDate.ts). On the calendar boundary alone, a 12:30am read would call a date
  // whose West Coast games are still in progress a frozen past date and serve
  // the cached copy without refreshing it.
  const isMutable = date >= baseballToday();

  // Frozen days can be served from a snapshot without touching the network or
  // the per-game caches at all.
  if (!isMutable && filter) {
    const pKey = `${date}|${filterKey(filter)}`;
    const hit = projectedCache.get(pKey);
    if (hit) return hit;
    const full = memCache.get(date);
    if (full) return rememberProjection(pKey, projectDay(full, filter));
    const snapshot = await readDaySnapshot(date, filter);
    if (snapshot) return rememberProjection(pKey, snapshot);
  }

  const cached = memCache.get(date);
  if (cached && !isMutable) return filter ? projectDay(cached, filter) : cached;
  if (cached) {
    const states = cached.games.map((g) => g.status.state);
    // Once every game that day is final, nothing will change until the date
    // rolls over (final games are cached permanently), so freeze like a past
    // day. Empty schedules still honor the TTL in case games post late.
    const allFinal = states.length > 0 && states.every((s) => s === 'final');
    if (allFinal) return filter ? projectDay(cached, filter) : cached;
    // Any in-progress game shortens the TTL so reloads track live scores;
    // otherwise a scheduled day polls for first pitch / lineups.
    const ttl = states.some((s) => s === 'live') ? LIVE_DAY_TTL : TODAY_TTL;
    if (Date.now() - cached.fetchedAt < ttl) {
      return filter ? projectDay(cached, filter) : cached;
    }
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
      throws: null,
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
      throws: null,
    });
  }

  const parsed: ParsedDay = { date, reports, games: dayGames, fetchedAt: Date.now() };

  // Snapshot a day that will never change again, so the next cold read is one
  // object instead of a schedule fetch plus a read per game. An empty schedule
  // is deliberately not snapshotted — games can post late.
  const allFinal =
    dayGames.length > 0 && dayGames.every((g) => g.status.state === 'final');
  if (allFinal) await writeDaySnapshot(parsed);

  if (!filter) {
    memCache.set(date, parsed);
    return parsed;
  }
  // Hold on to the whole day only while it can still change; once it's frozen
  // the snapshot is the durable copy and only the projection is worth keeping.
  const projected = projectDay(parsed, filter);
  if (isMutable && !allFinal) {
    memCache.set(date, parsed);
    return projected;
  }
  return rememberProjection(`${date}|${filterKey(filter)}`, projected);
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
  // A watched pitcher with no outing of his own is either the starter — the
  // pitcher-side equivalent of a posted lineup — or nothing yet. The boxscore
  // names the starter from first pitch on, which covers the gap before his
  // first batter completes an at-bat; until then the announced probable stands
  // in. Deliberately not after first pitch: a probable who never appears in the
  // boxscore was scratched.
  const ownProbable = isHome ? dg.homeProbablePitcher : dg.awayProbablePitcher;
  const announced =
    dg.pitchingStarterIds.includes(playerId) ||
    (dg.status.state === 'scheduled' && ownProbable?.id === playerId);
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
    ...pitchingRoleFor(announced, null),
    opponentId: isHome ? dg.awayTeamId : dg.homeTeamId,
    opponentHitting: null,
    probablePitcher: isHome ? dg.awayProbablePitcher : dg.homeProbablePitcher,
    plateAppearances: [],
    baseEvents: [],
    line: buildLine([]),
    pitching: null,
  };
}

/**
 * Which days of the range each player was actually on the roster, by
 * `${kind}-${id}` — `store.ts::getRosterForRange`'s answer, threaded through so
 * a report can be **projected** onto the days it is entitled to.
 *
 * A key absent from the map (or no map at all) is held every day, which is what
 * the callers with no history to consult mean: `getPlayerDay`, which asks for
 * one man on one date on behalf of somebody who may not be rostered at all, and
 * the fantasy path, whose roster is ESPN's rather than ours.
 */
export type HeldDays = Map<string, Set<string>>;

/**
 * Build each watched player's games across an inclusive date range (a single
 * day is just startDate === endDate). Games from every day are merged and
 * sorted chronologically, since a player's card already knows how to render
 * multiple games (originally added for doubleheaders). A player rostered for a
 * scheduled/in-progress game they haven't batted in yet gets a placeholder game
 * so the card can still surface the start time or live score.
 *
 * **`held` cuts days, not rows**, and that is the whole of how the roster's
 * history reaches the app. Which players have a row at all is `players`, which
 * the caller has already resolved over the range; which of a player's days
 * count is this, applied to both of the loops below — the games he actually
 * played, and the placeholder games his club played without him. The summary
 * table's rows, its `Total` and every feed item all sum `report.games`, so
 * cutting the games is the entire change and nothing downstream has to be told.
 *
 * **It is done here rather than on the client**, which is the same argument
 * `dayFilterFor` already makes one level down: this function narrows a day to
 * the players who want it as it parses, so narrowing a player to the days he
 * wants costs nothing extra and happens in the one place that already knows the
 * range day by day. Doing it on the client would mean shipping a report of days
 * the reader was never entitled to and then throwing them away — a wire full of
 * somebody else's at-bats, and a second definition of "held" living in `App.tsx`
 * beside the first.
 */
export async function getReport(
  startDate: string,
  endDate: string,
  players: WatchPlayer[],
  held?: HeldDays,
): Promise<PlayerReport[]> {
  const ids = players.map((p) => p.id);
  const batterIds = players.filter((p) => p.kind === 'batter').map((p) => p.id);
  const pitcherIds = players.filter((p) => p.kind === 'pitcher').map((p) => p.id);
  // Each day is narrowed to just these players as it's parsed — without that a
  // wide range holds every player who appeared on every date in memory at once.
  const filter = dayFilterFor(players);
  const rangeDates = enumerateDates(startDate, endDate);
  const [days, playerStats, pitcherStats, rosterInfo] = await Promise.all([
    mapLimit(rangeDates, DAY_CONCURRENCY, (d) => getDay(d, filter)),
    getPlayerStats(batterIds),
    getPitcherStats(pitcherIds),
    getRosterInfo(ids),
  ]);

  // Each watched pitcher's season arsenal (fetched once) — for the per-game
  // velo/spin/break vs season-average comparison on the card, and the fly-ball
  // count his xFIP needs.
  const arsenals = new Map<number, SeasonArsenals>();
  const battedBalls = new Map<number, BattedBallMix>();
  // One leaderboard for every pitcher in the league, so it rides along with the
  // per-pitcher arsenals rather than adding a round of its own.
  const xeraPromise: Promise<Map<number, string>> =
    pitcherIds.length > 0 ? getPitcherXera() : Promise.resolve(new Map());
  await Promise.all(
    pitcherIds.map(async (id) => {
      try {
        // Splits and all: the card's Arsenal section has its own Overall / vs
        // RHB / vs LHB tabs, and each compares against the matching half of his
        // season.
        const seasonArsenal = await getSeasonArsenal(id);
        arsenals.set(id, seasonArsenal);
        battedBalls.set(id, seasonArsenal.battedBalls);
      } catch (err) {
        console.error(`pitcher arsenal fetch failed for ${id}:`, err);
      }
    }),
  );
  const xera = await xeraPromise;

  // How each opposing lineup has hit this season — one fetch per team, however
  // many watched pitchers face it, and only for the pitchers (a batter's card
  // has no use for the other side's offence).
  const opponentIds = new Set<number>();
  for (const day of days) {
    for (const dg of day.games) {
      for (const id of [dg.homeTeamId, dg.awayTeamId]) if (id !== null) opponentIds.add(id);
    }
  }
  const teamHitting = new Map<number, TeamHitting>();
  if (pitcherIds.length > 0) {
    await mapLimit([...opponentIds], TEAM_CONCURRENCY, async (id) => {
      const hitting = await getTeamHitting(id);
      if (hitting) teamHitting.set(id, hitting);
    });
  }

  return players.map((p) => {
    const games: PlayerGame[] = [];
    const seen = new Set<number>();
    // The days of the range this player is entitled to. Read off the enumerated
    // date rather than off `PlayerGame.date` so both loops below are gated by
    // exactly the same thing — the day the report is being built for.
    const onRoster = held?.get(`${p.kind}-${p.id}`);
    const heldOn = (date: string) => onRoster === undefined || onRoster.has(date);
    for (const [i, day] of days.entries()) {
      if (!heldOn(rangeDates[i])) continue;
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
    for (const [i, day] of days.entries()) {
      if (!heldOn(rangeDates[i])) continue;
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
    const throws = p.kind === 'pitcher' ? (rosterInfo.get(p.id)?.throws ?? null) : null;

    if (p.kind === 'pitcher') {
      const arsenal = arsenals.get(p.id);
      if (arsenal) {
        for (const g of games) if (g.pitching) attachArsenalBaselines(g.pitching, arsenal);
      }
      // The lineup he faced, on every one of his games (a card can hold more
      // than one, against different teams).
      for (const g of games) {
        g.opponentHitting = g.opponentId === null ? null : (teamHitting.get(g.opponentId) ?? null);
      }
      return {
        ...p,
        found: games.length > 0,
        games,
        seasonStats: null,
        pitcherSeasonStats: withEstimators(
          pitcherStats.get(p.id)?.season ?? null,
          battedBalls.get(p.id),
          xera.get(p.id),
        ),
        splitVsLeft: null,
        splitVsRight: null,
        rosterStatus,
        throws,
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
      throws,
    };
  });
}

/**
 * One player's whole day, whether or not anybody has him on a roster.
 *
 * This is what the player page's **Overview** tab and the Game Log's per-game
 * popup read, and both of those open on strangers: `PlayerDetails` takes an id
 * and a name, never a report, so the roster-shaped `/api/report` cannot answer
 * for them. It is the case `getPlayerStatuses` below exists for one level up —
 * the day's facts for a player nobody is watching — and it takes the same
 * shape: everything is already built, and this only asks for it on behalf of
 * one man.
 *
 * **It goes through `getReport` rather than around it**, which is the whole
 * design. What the Overview draws is the feed's own items — the at-bat card,
 * the base event, the outing and its innings — so the report behind it has to
 * be the report the feed reads, down to the arsenal baselines on each
 * `PitchMix` and the `opponentHitting` an Upcoming row opens onto. A lighter
 * parallel path would be a second answer to "what happened to him today",
 * free to drift from the first, which is exactly what one shared route buys us
 * out of.
 *
 * **It adds no cache of its own**, deliberately: every layer under it already
 * has one — `getDay` is memoized (ten minutes on today, fifteen seconds while a
 * game is live, and a frozen snapshot forever once every game is final), the
 * season lines and roster info are half-hourly, the arsenals and the xERA
 * leaderboard six-hourly and shared with every other reader. A cache here could
 * only make one player's day *staler* than the same day read on the feed beside
 * it, which is the one thing it must not be: it is the same day.
 *
 * The name and Savant spelling come off the season roster (a one-hour cache the
 * add-player search already pays for) because `findPlayerDay` falls back to a
 * same-kind `savantName` match when an id isn't present that day. A player that
 * roster has never heard of still gets his day by id alone; he simply loses the
 * fallback, which is the right way for an unknown id to fail.
 */
export async function getPlayerDay(
  playerId: number,
  kind: PlayerKind,
  date: string,
): Promise<PlayerReport> {
  const season = await getSeasonPlayers().catch((err) => {
    console.error('season roster unavailable for player day:', err);
    return [];
  });
  // A two-way player has a row per kind and both carry the same name, so the
  // same-kind row is preferred for tidiness alone; either would answer.
  const known =
    season.find((p) => p.id === playerId && p.kind === kind) ??
    season.find((p) => p.id === playerId);
  const player: WatchPlayer = {
    id: playerId,
    kind,
    name: known?.name ?? '',
    savantName: known?.savantName ?? '',
  };
  const [report] = await getReport(date, date, [player]);
  return report;
}

// ---- Today's player statuses ----------------------------------------------

/**
 * MLB's word for a player who is simply on his club's active roster — the one
 * status that says nothing about him and so is never shipped. Kept here rather
 * than inferred from the client's `rosterStatusBadge` (which lives on the other
 * side of the wire) so the two can't disagree about what "active" means: `A` is
 * the code, `RM0` is what a few clubs send instead, and the description is the
 * belt to those braces.
 */
function isPlainlyActive(status: RosterStatus): boolean {
  return status.code === 'A' || status.code === 'RM0' || status.description === 'Active';
}

/** An empty status, so a player known from one source can be filled in by another. */
function blankStatus(rosterStatus: RosterStatus | null): PlayerStatus {
  return {
    rosterStatus,
    lineupStatus: null,
    lineupSpot: null,
    pitchingRole: null,
    entryInning: null,
    gameState: null,
    opponent: null,
    isHome: null,
    ...noGameFacts(),
  };
}

/** The half of a status that describes the game he is in, shaped so it can be
 *  spread into either pass — `lineupStatusFor`'s trick, for the same reason:
 *  the two passes pick a game by different routes and must not describe it
 *  differently once they have.
 *
 *  Three of the five are **state-gated**, which is where most of the payload
 *  saving is. A score exists only once a game has started; the inning is read
 *  only while one is in progress (a final has one and nothing renders it); and
 *  the start time and the opposing probable are dropped at first pitch, exactly
 *  as the summary table's cell drops them — by then the score is the line that
 *  matters and the batter is as likely to be facing a reliever. */
function gameFacts(
  status: GameStatus,
  isHome: boolean,
  opponent: string,
  probable: ProbablePitcher | null,
): Pick<
  PlayerStatus,
  | 'gameState'
  | 'opponent'
  | 'isHome'
  | 'teamScore'
  | 'opponentScore'
  | 'currentInning'
  | 'inningState'
  | 'startTime'
  | 'probablePitcher'
> {
  const live = status.state === 'live';
  const scheduled = status.state === 'scheduled';
  return {
    gameState: status.state,
    opponent,
    isHome,
    teamScore: isHome ? status.homeScore : status.awayScore,
    opponentScore: isHome ? status.awayScore : status.homeScore,
    currentInning: live ? status.currentInning : null,
    inningState: live ? status.inningState : null,
    startTime: scheduled ? status.startTime : null,
    probablePitcher: scheduled ? probable : null,
  };
}

/** The same fields for a player with no game at all — every one of them null,
 *  which is what keeps `saysSomething` honest: none of these can make a man
 *  worth shipping on his own, they only ever describe the game `opponent`
 *  already establishes he has. */
function noGameFacts(): Omit<
  ReturnType<typeof gameFacts>,
  'gameState' | 'opponent' | 'isHome'
> {
  return {
    teamScore: null,
    opponentScore: null,
    currentInning: null,
    inningState: null,
    startTime: null,
    probablePitcher: null,
  };
}

/**
 * Whether a status is worth sending at all. A player with nothing true of him
 * costs a row to say nothing, and before this map carried an opponent the
 * bench of every club before its lineup posted was most of a day's boxscore
 * rosters — 26 men a side of pure payload. A postponement is why `gameState`
 * is in the test: it is the one game state that is itself a fact about his day.
 *
 * **`opponent` widens this deliberately**, and it is worth being explicit about
 * what that costs. Having a game today is now itself worth saying, because the
 * research board draws it in a column of its own, so every player on a
 * boxscore roster ships rather than only the ones a lineup or an IL stint has
 * something to say about: ~1,300 entries on a full slate against the ~600 an
 * unposted morning used to send. That is ~130KB of JSON, which `compression()`
 * takes to a tenth — the price of the column, paid on the one request both
 * views that draw it already make.
 *
 * The score, the inning, the first-pitch time and the opposing probable ride
 * on the same game and **widen nothing**: each is null unless `opponent` is
 * set, so the test below is unchanged and the population it ships is exactly
 * the one the column already cost.
 */
function saysSomething(s: PlayerStatus): boolean {
  return (
    s.rosterStatus !== null ||
    s.lineupStatus !== null ||
    s.pitchingRole !== null ||
    s.opponent !== null ||
    s.gameState === 'postponed'
  );
}

/**
 * The one game of a set to speak for the player — the live one, else the next
 * scheduled one, else the last he played. The same priority the cards and the
 * summary table's opponent column use, so a doubleheader reads the same way
 * wherever the app draws it.
 */
function currentOf<T>(games: T[], stateOf: (g: T) => GameStatus['state']): T | null {
  if (games.length === 0) return null;
  return (
    games.find((g) => stateOf(g) === 'live') ??
    games.find((g) => stateOf(g) === 'scheduled') ??
    games[games.length - 1]
  );
}

/**
 * Every player the league has something to say about today: his roster status,
 * and where his club's game has him.
 *
 * This is `getReport`'s handful of facts for everybody, and it is deliberately
 * *not* a report — the research board is the whole league and the details view
 * opens on any player in it, so neither can pull a report per player to learn
 * that a man is batting third or on the 10-day IL. It costs nothing either view
 * wasn't already paying: the day is the same parse the watchlist reads (cached
 * ten minutes, fifteen seconds while a game is live) and the statuses are the
 * same 30 team rosters `getRosterInfo` fetches whole to answer for one player
 * on them, cached half an hour.
 *
 * A player is included only if something is true of him — see `saysSomething`.
 * The bench of every club before its lineup posts is most of a day's boxscore
 * rosters and none of the point.
 */
export async function getPlayerStatuses(
  date: string = baseballToday(),
): Promise<Map<number, PlayerStatus>> {
  const [day, rosterStatuses] = await Promise.all([
    getDay(date),
    // A failed roster read costs the IL badges and leaves the lineup pips,
    // which is the right direction to fail in: the day is the harder half to
    // rebuild and the half that changes by the minute.
    getAllRosterStatuses().catch((err) => {
      console.error('league roster statuses unavailable:', err);
      return new Map<number, RosterStatus>();
    }),
  ]);

  // Which of the day's games each player is on the roster for, and on which
  // side — the side is what says whose lineup and whose probable he is.
  const appearances = new Map<number, { game: DayGame; isHome: boolean }[]>();
  const note = (id: number, game: DayGame, isHome: boolean) => {
    const list = appearances.get(id);
    if (!list) {
      appearances.set(id, [{ game, isHome }]);
    } else if (!list.some((e) => e.game.gamePk === game.gamePk)) {
      list.push({ game, isHome });
    }
  };
  for (const game of day.games) {
    for (const id of game.homePlayerIds) note(id, game, true);
    for (const id of game.awayPlayerIds) note(id, game, false);
    // An announced probable who isn't on the boxscore yet is still today's
    // starter, and before first pitch he is the only one there is.
    if (game.homeProbablePitcher) note(game.homeProbablePitcher.id, game, true);
    if (game.awayProbablePitcher) note(game.awayProbablePitcher.id, game, false);
  }

  const statuses = new Map<number, PlayerStatus>();
  for (const [id, entries] of appearances) {
    // `day.games` arrives in schedule order, so the last entry is the later
    // game of a doubleheader.
    const pick = currentOf(entries, (e) => e.game.status.state);
    if (!pick) continue;
    const { game, isHome } = pick;
    const ownProbable = isHome ? game.homeProbablePitcher : game.awayProbablePitcher;
    // The same test `rosterGame` applies, and for the same reason: the boxscore
    // names the starter from first pitch on, and until then the probable stands
    // in — but not after, since a probable absent from the boxscore was
    // scratched.
    const announced =
      game.pitchingStarterIds.includes(id) ||
      (game.status.state === 'scheduled' && ownProbable?.id === id);
    statuses.set(id, {
      rosterStatus: rosterStatuses.get(id) ?? null,
      ...lineupStatusFor(id, isHome ? game.homeStarters : game.awayStarters),
      ...pitchingRoleFor(announced, null),
      // The game already picked for him — `currentOf` above having settled the
      // doubleheader the same way every other view settles it — reduced to what
      // the board's opponent cell draws: who, where, the score, the inning, and
      // (before first pitch) the time and the starter the other side announced.
      ...gameFacts(
        game.status,
        isHome,
        isHome ? game.awayTeam : game.homeTeam,
        isHome ? game.awayProbablePitcher : game.homeProbablePitcher,
      ),
    });
  }

  // What the parse itself knows beats what the schedule implies — above all a
  // reliever's entry inning, which exists nowhere but in the game he pitched.
  // Merged per kind so a two-way player's bat can't overwrite his arm.
  for (const rep of day.reports.values()) {
    const game = currentOf(rep.games, (g) => g.status.state);
    if (!game) continue;
    const prev = statuses.get(rep.id) ?? blankStatus(rosterStatuses.get(rep.id) ?? null);
    statuses.set(rep.id, {
      ...prev,
      // The parsed game's own answer, which is the same club by a different
      // route — a player in the day's reports is on that game's boxscore
      // roster too. Restated here so the pass that overrides the game also
      // overrides everything the cell says about it, rather than leaving the
      // two halves of one game to come from two different picks of it.
      // `PlayerGame.probablePitcher` is already the *other* side's announced
      // starter, which is precisely what the first pass hands over too.
      ...gameFacts(game.status, game.isHome, game.opponent, game.probablePitcher),
      ...(rep.kind === 'pitcher'
        ? { pitchingRole: game.pitchingRole, entryInning: game.entryInning }
        : { lineupStatus: game.lineupStatus, lineupSpot: game.lineupSpot }),
    });
  }

  // …and everyone with no game at all today, who is precisely the player this
  // is most worth saying something about: off the active roster is *why* he has
  // no game.
  for (const [id, status] of rosterStatuses) {
    if (statuses.has(id) || isPlainlyActive(status)) continue;
    statuses.set(id, blankStatus(status));
  }

  for (const [id, status] of statuses) {
    if (status.rosterStatus && isPlainlyActive(status.rosterStatus)) status.rosterStatus = null;
    if (!saysSomething(status)) statuses.delete(id);
  }
  return statuses;
}
