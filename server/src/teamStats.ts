import { readJsonBlob, writeJsonBlob } from './storage.js';
import type { TeamHitting, TeamHittingLine, TeamHittingRanks } from './types.js';

// Keep in sync with hfSea in savant.ts, CURRENT_SEASON in percentiles.ts, and
// SEASON in xwoba.ts / pitcherArsenal.ts / expectedStats.ts.
const SEASON = 2026;

// Team lines barely move inside a day, and this is the whole league in one blob.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Every team's hitting, keyed by team id. */
type LeagueHitting = Record<string, TeamHitting>;

let cache: { data: LeagueHitting; fetchedAt: number } | null = null;
let inFlight: Promise<LeagueHitting> | null = null;

const storeKey = () => `team-hitting-league-${SEASON}.json`;

// One request for all 30 teams beats one per team: the report needs a handful of
// them, ranking needs all of them anyway, and `limit` has to be raised or the
// split call comes back truncated at 50 of its 60 rows.
const leagueUrl = (stats: string, extra = '') =>
  `https://statsapi.mlb.com/api/v1/teams/stats?stats=${stats}&group=hitting` +
  `&season=${SEASON}&sportIds=1&limit=200${extra}`;

interface StatSplit {
  split?: { code?: string };
  team?: { id?: number };
  stat?: Record<string, unknown>;
}

const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
const str = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '—';
/** A rate to three decimals, no leading zero — ".291". */
const rate3 = (x: number): string => {
  const t = x.toFixed(3);
  return t.startsWith('0.') ? t.slice(1) : t;
};

function toLine(stat: Record<string, unknown>): TeamHittingLine {
  const pa = n(stat.plateAppearances);
  const k = n(stat.strikeOuts);
  const bb = n(stat.baseOnBalls);
  const games = n(stat.gamesPlayed);
  const runs = n(stat.runs);
  return {
    pa,
    games,
    runs,
    // A split doesn't carry runs, so this is null there rather than 0.00.
    runsPerGame: games > 0 ? (runs / games).toFixed(2) : null,
    avg: str(stat.avg),
    obp: str(stat.obp),
    slg: str(stat.slg),
    ops: str(stat.ops),
    homeRuns: n(stat.homeRuns),
    strikeOuts: k,
    baseOnBalls: bb,
    stolenBases: n(stat.stolenBases),
    kRate: pa > 0 ? rate3(k / pa) : '—',
    bbRate: pa > 0 ? rate3(bb / pa) : '—',
    ranks: null, // filled by rankAll once the whole league is parsed
  };
}

/** The categories that get a rank, and which direction is good for an offence. */
const RANKED: { key: keyof TeamHittingRanks; of: (l: TeamHittingLine) => number | null; lowIsBest?: boolean }[] = [
  { key: 'runsPerGame', of: (l) => (l.runsPerGame === null ? null : Number(l.runsPerGame)) },
  { key: 'avg', of: (l) => Number(l.avg) },
  { key: 'obp', of: (l) => Number(l.obp) },
  { key: 'slg', of: (l) => Number(l.slg) },
  { key: 'ops', of: (l) => Number(l.ops) },
  { key: 'homeRuns', of: (l) => l.homeRuns },
  { key: 'stolenBases', of: (l) => l.stolenBases },
  // Striking out less is the better offence, so 1st here is the *fewest* K.
  { key: 'kRate', of: (l) => Number(l.kRate), lowIsBest: true },
  { key: 'bbRate', of: (l) => Number(l.bbRate) },
];

/**
 * Rank one set of comparable lines (all 30 teams' season, or all 30 of one
 * split) in place. Ties share a rank, the standard competition way: two teams
 * tied for 4th are both 4th and the next is 6th.
 */
function rankAll(lines: TeamHittingLine[]): void {
  for (const line of lines) line.ranks = { ...EMPTY_RANKS };
  for (const cat of RANKED) {
    const scored = lines
      .map((line) => ({ line, value: cat.of(line) }))
      .filter((x): x is { line: TeamHittingLine; value: number } =>
        x.value !== null && Number.isFinite(x.value),
      )
      .sort((a, b) => (cat.lowIsBest ? a.value - b.value : b.value - a.value));
    scored.forEach((x, i) => {
      const tied = i > 0 && scored[i - 1].value === x.value;
      x.line.ranks![cat.key] = tied ? scored[i - 1].line.ranks![cat.key] : i + 1;
    });
  }
}

const EMPTY_RANKS: TeamHittingRanks = {
  runsPerGame: null,
  avg: null,
  obp: null,
  slg: null,
  ops: null,
  homeRuns: null,
  stolenBases: null,
  kRate: null,
  bbRate: null,
};

async function fetchSplits(url: string): Promise<StatSplit[]> {
  const res = await fetch(url, { headers: { 'User-Agent': 'statcast-sicko/1.0' } });
  if (!res.ok) throw new Error(`MLB Stats API returned ${res.status} ${res.statusText}`);
  const body = (await res.json()) as { stats?: { splits?: StatSplit[] }[] };
  return (body.stats ?? []).flatMap((g) => g.splits ?? []);
}

/** Fetch every team's season line and platoon splits, then rank each category. */
async function buildLeague(): Promise<LeagueHitting> {
  const [season, splits] = await Promise.all([
    fetchSplits(leagueUrl('season')),
    fetchSplits(leagueUrl('statSplits', '&sitCodes=vl,vr')),
  ]);

  const league: LeagueHitting = {};
  const seasonLines: TeamHittingLine[] = [];
  for (const sp of season) {
    const id = sp.team?.id;
    if (typeof id !== 'number' || !sp.stat) continue;
    const line = toLine(sp.stat);
    league[id] = { teamId: id, season: line, vsLeft: null, vsRight: null };
    seasonLines.push(line);
  }

  const byCode: Record<'vl' | 'vr', TeamHittingLine[]> = { vl: [], vr: [] };
  for (const sp of splits) {
    const id = sp.team?.id;
    const code = sp.split?.code;
    if (typeof id !== 'number' || !sp.stat || !league[id]) continue;
    if (code !== 'vl' && code !== 'vr') continue;
    const line = toLine(sp.stat);
    // For a *team*, vl/vr is the hand of the pitcher they faced — which is what
    // a watched pitcher wants to be compared against.
    if (code === 'vl') league[id].vsLeft = line;
    else league[id].vsRight = line;
    byCode[code].push(line);
  }

  // Each population ranks within itself: the season against seasons, a split
  // against the same split league-wide.
  rankAll(seasonLines);
  rankAll(byCode.vl);
  rankAll(byCode.vr);
  return league;
}

async function getLeague(): Promise<LeagueHitting> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const stored = await readJsonBlob<LeagueHitting>(
      storeKey(),
      (_v, cachedAt) => Date.now() - cachedAt < CACHE_TTL_MS,
    );
    if (stored) {
      cache = { data: stored, fetchedAt: Date.now() };
      return stored;
    }
    const data = await buildLeague();
    cache = { data, fetchedAt: Date.now() };
    await writeJsonBlob(storeKey(), data);
    return data;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/**
 * A team's season batting line, how they've hit left- and right-handed pitching,
 * and where each of those numbers places among all 30 — the "who is he facing
 * tonight" context on a pitcher's game.
 *
 * Failures resolve to null rather than throwing: the opponent's line is colour
 * on a card, and a report that already has the outing itself shouldn't 502
 * because a team lookup timed out.
 */
export async function getTeamHitting(teamId: number): Promise<TeamHitting | null> {
  try {
    return (await getLeague())[teamId] ?? null;
  } catch (err) {
    console.error('league hitting fetch failed:', err);
    return null;
  }
}
