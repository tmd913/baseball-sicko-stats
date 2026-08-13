/**
 * ESPN Fantasy Baseball — who in the league is already owned, and therefore who
 * is a free agent.
 *
 * The research board is a league-wide table of *major league* players; a
 * fantasy league is a partition of that same population into rostered and
 * available. Joining the two is the whole job of this module, and it has two
 * halves that are worth keeping apart in your head:
 *
 * 1. **Reading ESPN.** Their fantasy API is undocumented but stable, and the
 *    shapes here are the ones `cwendt94/espn-api` reads (`mRoster` for the
 *    rosters, `mTeam` for the team names, `mSettings` for the league's). It
 *    needs the user's own session cookies — `SWID` and `espn_s2` — because a
 *    private league is only visible to someone in it.
 *
 * 2. **Matching ESPN players to MLB ids.** ESPN numbers players in its own
 *    space and publishes no MLB id, so the join is by **name plus team**: the
 *    normalised full name, disambiguated by the club, since ESPN's player
 *    universe carries minor leaguers and duplicate names are real (two Fernando
 *    Cruzes, two Wilmer Floreses). Checked against a live 12-team league: 317
 *    of 319 rostered players matched, and the two that didn't are players the
 *    MLB season roster has never listed — so they could not have appeared on
 *    the board to be marked either way.
 *
 * **Free agency is read as the complement of ownership**, not from ESPN's own
 * free-agent list. Both give the same answer — measured on that league, ESPN's
 * `kona_player_info` free-agent board and "every MLB player not on a roster"
 * agreed on 1050 of 1051 players — but the roster read is 319 rows and 2MB
 * against 3602 rows and 10MB, and it doesn't drag ESPN's whole minor-league
 * universe into the name index, where it would only add collisions.
 */

import { stripAccents, toSavantName } from './names.js';
import type { PlayerKind, WatchPlayer } from './types.js';
import { readBlob, readJsonBlob, writeBlob, writeJsonBlob } from './storage.js';
import { addDays, baseballToday, daysBetween, easternDate } from './etDate.js';
import { mapLimit } from './limit.js';

// Keep in sync with hfSea in savant.ts, CURRENT_SEASON in percentiles.ts, and
// SEASON in xwoba.ts / pitcherArsenal.ts / teamStats.ts / expectedStats.ts /
// research.ts.
const SEASON = 2026;

const FANTASY_BASE =
  'https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/** Rosters move whenever anyone in the league makes a move, which is the whole
 *  point of the feature — so this is much shorter than the six hours the
 *  league-wide stat tables settle on. */
const OWNERSHIP_TTL_MS = 10 * 60 * 1000;

/** The MLB name index changes only as players are added to the season roster. */
const INDEX_TTL_MS = 60 * 60 * 1000;

// ---- Credentials ----------------------------------------------------------

/**
 * What is needed to read a league.
 *
 * **The cookies are optional**, because a *public* league needs none: ESPN
 * serves it to anyone who asks. They are required only for a private one, which
 * is the case the 401 below names. `espnS2` is a session cookie for that user's
 * ESPN account: it is stored server-side, never logged, and never sent back to
 * the browser — see the `/api/espn` routes.
 */
export interface EspnCreds {
  leagueId: number;
  swid: string | null;
  espnS2: string | null;
}

/** ESPN's cookie wants the SWID in braces; people paste it both ways. */
export function normalizeSwid(raw: string): string {
  const v = raw.trim().replace(/^["']|["']$/g, '');
  const bare = v.replace(/^\{|\}$/g, '');
  return `{${bare}}`;
}

/** The espn_s2 value is percent-encoded and long enough that people paste it
 *  with the surrounding quotes, or with a newline the clipboard added. */
export function normalizeS2(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');
}

/** Thrown when ESPN rejects the cookies, or the league isn't visible to them.
 *  Carried as its own type so the route can answer with something the client
 *  can act on ("reconnect") rather than a generic upstream failure. */
export class EspnAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EspnAuthError';
  }
}

// ---- Teams: ESPN's numbering to MLB's -------------------------------------

/**
 * ESPN's `proTeamId` to the MLB Stats API team id. Both numbering systems are
 * fixed and neither is derivable from the other, so this is a table; it is the
 * only thing standing between "Fernando Cruz, NYY" and "Fernando Cruz, CHC".
 * `0` is ESPN's free-agent/no-team slot and is deliberately absent — a player
 * with no club can't be matched on one.
 */
const ESPN_TO_MLB_TEAM: Record<number, number> = {
  1: 110, // BAL
  2: 111, // BOS
  3: 108, // LAA
  4: 145, // CWS
  5: 114, // CLE
  6: 116, // DET
  7: 118, // KC
  8: 158, // MIL
  9: 142, // MIN
  10: 147, // NYY
  11: 133, // ATH
  12: 136, // SEA
  13: 140, // TEX
  14: 141, // TOR
  15: 144, // ATL
  16: 112, // CHC
  17: 113, // CIN
  18: 117, // HOU
  19: 119, // LAD
  20: 120, // WSH
  21: 121, // NYM
  22: 143, // PHI
  23: 134, // PIT
  24: 138, // STL
  25: 135, // SD
  26: 137, // SF
  27: 115, // COL
  28: 146, // MIA
  29: 109, // AZ
  30: 139, // TB
};

/**
 * ESPN's `lineupSlotId` to the slot a fantasy manager would call it.
 *
 * This is a **different numbering system** from `defaultPositionId` (a player's
 * natural position), which is the trap in ESPN's payload: `1` here is first
 * base and there a starting pitcher.
 */
const LINEUP_SLOTS: Record<number, string> = {
  0: 'C',
  1: '1B',
  2: '2B',
  3: '3B',
  4: 'SS',
  5: 'OF',
  6: '2B/SS',
  7: '1B/3B',
  8: 'LF',
  9: 'CF',
  10: 'RF',
  11: 'DH',
  12: 'UTIL',
  13: 'P',
  14: 'SP',
  15: 'RP',
  16: 'BE',
  17: 'IL',
  19: 'IF',
};

/** The bench and the injured list are the two slots that are *not* a lineup
 *  spot. Everything else — including the ones ESPN has never documented — is a
 *  player who is in today's lineup, which is the way round that fails safe:
 *  an unknown slot id reads as playing rather than as benched. */
const BENCH_SLOT = 16;
const IL_SLOT = 17;

/**
 * The same slot ids again, reduced to the vocabulary the research board's
 * position pills are written in — which is what `eligibleSlots` has to be
 * translated into to be any use as a filter.
 *
 * Three kinds of slot are deliberately absent, and each for its own reason.
 *
 * **The composite slots say nothing new.** `2B/SS` (6), `1B/3B` (7) and `IF`
 * (19) are places a manager may *play* him, and ESPN grants each of them off
 * the single positions he is already eligible at — checked across all 3,922
 * rows of the season-wide pool: not one player carries `2B/SS` without 2B or
 * SS, `1B/3B` without 1B or 3B, or `IF` without one of the four infield spots.
 * So carrying them would be the same fact twice, at the price of a wider cell;
 * the board's own `IF` pill is that group, and it reads it off the four.
 *
 * **`LF`/`CF`/`RF` (8–10) collapse into `OF`** for the same reason and by the
 * same check: slot 5 is present on every row that carries any of the three, 0
 * exceptions. The board has one outfield pill, so three would only be three
 * ways of lighting it.
 *
 * **`UTIL` (12), `P` (13), `BE` (16) and `IL` (17) are not positions at all** —
 * two are "anywhere", two are where he sits when he isn't playing. ESPN's
 * minor-league slots (21 and 22, 84 rows between them and every one of them a
 * player the MLB index has never heard of) go with them.
 */
const ELIGIBLE_POSITIONS: Record<number, string> = {
  0: 'C',
  1: '1B',
  2: '2B',
  3: '3B',
  4: 'SS',
  5: 'OF',
  8: 'OF',
  9: 'OF',
  10: 'OF',
  11: 'DH',
  14: 'SP',
  15: 'RP',
};

/** The order an eligibility list reads in: round the infield from the plate
 *  out, then the outfield, then the two slots that are a role rather than a
 *  place. Fixed rather than ESPN's own array order so two players eligible at
 *  the same pair read identically. */
const ELIGIBILITY_ORDER = ['C', '1B', '2B', '3B', 'SS', 'OF', 'DH', 'SP', 'RP'];

/** ESPN's `eligibleSlots` as the board's positions, de-duplicated (three
 *  outfield slots are one `OF`) and in that order. */
function eligiblePositions(slots: number[] | undefined): string[] {
  if (!slots) return [];
  const have = new Set<string>();
  for (const slot of slots) {
    const pos = ELIGIBLE_POSITIONS[slot];
    if (pos) have.add(pos);
  }
  return ELIGIBILITY_ORDER.filter((p) => have.has(p));
}

// ---- The MLB name index ---------------------------------------------------

/**
 * A name reduced to what two sources can be expected to agree on: accents
 * stripped, case dropped, punctuation and generational suffixes removed. ESPN
 * writes "Luis Garcia Jr." where MLB writes "Luis García Jr.", and either may
 * carry the period or not.
 */
function normalizeName(raw: string): string {
  return stripAccents(raw)
    .toLowerCase()
    .replace(/[.'’]/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface IndexEntry {
  id: number;
  name: string;
  teamId: number | null;
  /** Which board(s) the player belongs to, derived exactly as
   *  `getSeasonPlayers` derives it so a fantasy roster and the watchlist agree
   *  on what a two-way player is: primary-position code `1` is a pitcher, `Y`
   *  is both, anything else is a batter. */
  kinds: PlayerKind[];
}

interface MlbIndex {
  /** Normalised name to every MLB player who has it — a list, because the
   *  season roster really does hold three collisions of its own. */
  byName: Map<string, IndexEntry[]>;
}

let indexCache: { index: MlbIndex; fetchedAt: number } | null = null;

/**
 * Every player on the season's MLB roster, by normalised name. Its own fetch
 * rather than `getSeasonPlayers`, which resolves a player's club to its full
 * name — this needs the **team id**, since that is the currency the ESPN team
 * table above is written in and a name is one rename away from breaking.
 */
async function getMlbIndex(): Promise<MlbIndex> {
  if (indexCache && Date.now() - indexCache.fetchedAt < INDEX_TTL_MS) {
    return indexCache.index;
  }
  const url =
    `https://statsapi.mlb.com/api/v1/sports/1/players?season=${SEASON}` +
    '&fields=people,id,fullName,currentTeam,id,primaryPosition,code';
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`MLB Stats API sports/players returned ${res.status}`);
  const data = (await res.json()) as {
    people?: {
      id: number;
      fullName: string;
      currentTeam?: { id?: number };
      primaryPosition?: { code?: string };
    }[];
  };
  const byName = new Map<string, IndexEntry[]>();
  for (const p of data.people ?? []) {
    const key = normalizeName(p.fullName);
    const code = p.primaryPosition?.code;
    const kinds: PlayerKind[] =
      code === 'Y' ? ['batter', 'pitcher'] : code === '1' ? ['pitcher'] : ['batter'];
    const entry = { id: p.id, name: p.fullName, teamId: p.currentTeam?.id ?? null, kinds };
    const at = byName.get(key);
    if (at) at.push(entry);
    else byName.set(key, [entry]);
  }
  const index = { byName };
  indexCache = { index, fetchedAt: Date.now() };
  return index;
}

/**
 * The MLB id for one ESPN player, or null if he isn't a major leaguer this
 * season (most of ESPN's universe isn't).
 *
 * Team first, name second: a club match is decisive, and falling back to the
 * name alone covers the player ESPN still has on his old team the morning after
 * a trade. An ambiguity neither test resolves is left unmatched rather than
 * guessed — marking the wrong Wilmer Flores as owned is worse than marking
 * neither.
 */
function matchPlayer(
  index: MlbIndex,
  name: string,
  espnTeamId: number | undefined,
): IndexEntry | null {
  const candidates = index.byName.get(normalizeName(name));
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const mlbTeam = espnTeamId === undefined ? undefined : ESPN_TO_MLB_TEAM[espnTeamId];
  const onTeam = candidates.filter((c) => c.teamId === mlbTeam);
  return onTeam.length === 1 ? onTeam[0] : null;
}

// ---- The season-wide player pool: roster % and eligibility ---------------

/**
 * What the app reads off ESPN's own list of every player it knows about, keyed
 * by MLB id: the **rostered percentage** and the **positions he is eligible
 * at**.
 *
 * One fetch for both because they arrive on the same row, and because the join
 * behind either of them — a name and a club against the MLB index — is the
 * expensive half and is worth doing once.
 *
 * Note what the **percentage** is: the share of *all* ESPN leagues in which the
 * player is on a roster — ESPN's own global figure, which is what "roster %"
 * means everywhere in fantasy. It is **not** the share of teams in the user's
 * league, which for a 12-team league would only ever be 0% or 8.3% and tell you
 * nothing.
 *
 * And note what the **eligibility** is, because that one could plausibly have
 * been league-specific and isn't. ESPN grants a position off games played there,
 * and a league *may* set its own threshold — so the honest question was whether
 * the global list agrees with the one the user's own league is scored by. It
 * does: `mRoster` carries `eligibleSlots` for every rostered player, and against
 * a live 12-team league all **320 of them came back byte-identical** to the
 * global pool's, 0 differences. So the cookie-free list is not an approximation
 * of the league's answer, it *is* the league's answer, and there is no case for
 * the 10MB cookied board that would give it per league.
 *
 * Two things make all of this much cheaper than it might be. It comes off the
 * **season-wide** players endpoint rather than the league board — 3,922 rows
 * and ~940KB against `kona_player_info`'s 3,602 rows and 10MB — and that
 * endpoint takes **no cookies at all**, since none of it is league-specific. So
 * one fetch serves every user of the app, and the map is cached globally rather
 * than per league.
 *
 * Gating either on having a league connected is therefore a product decision
 * rather than a technical one: both are available to anyone, and to someone
 * with no fantasy team a roster percentage is noise and an ESPN position is a
 * second opinion he has no use for.
 */
export interface EspnPlayerPool {
  /** MLB player id → ESPN's global rostered percentage. */
  pct: Record<number, number>;
  /** MLB player id → the positions ESPN has him eligible at, in
   *  `ELIGIBILITY_ORDER`. Players with none in the board's vocabulary are
   *  **absent** rather than carrying an empty array: the client reads an
   *  absence as "fall back to MLB's listed position", which is the same thing
   *  it does for a player ESPN has never heard of, and one shape for one
   *  meaning is what keeps that rule single. */
  eligible: Record<number, string[]>;
}

const ROSTER_PCT_TTL_MS = 6 * 60 * 60 * 1000;
let poolCache: { pool: EspnPlayerPool; fetchedAt: number } | null = null;
let poolInFlight: Promise<EspnPlayerPool> | null = null;

export async function getPlayerPool(): Promise<EspnPlayerPool> {
  if (poolCache && Date.now() - poolCache.fetchedAt < ROSTER_PCT_TTL_MS) {
    return poolCache.pool;
  }
  if (poolInFlight) return poolInFlight;

  poolInFlight = (async () => {
    const url = `${FANTASY_BASE}/${SEASON}/players?view=players_wl`;
    const res = await fetch(url, {
      headers: { ...UA, 'x-fantasy-filter': JSON.stringify({ filterActive: { value: true } }) },
    });
    if (!res.ok) throw new Error(`ESPN players endpoint returned ${res.status}`);
    const rows = (await res.json()) as {
      id?: number;
      fullName?: string;
      proTeamId?: number;
      eligibleSlots?: number[];
      ownership?: { percentOwned?: number };
    }[];
    const index = await getMlbIndex();
    const pct: Record<number, number> = {};
    const eligible: Record<number, string[]> = {};
    for (const row of rows) {
      if (!row.fullName) continue;
      // The join first, once, and the two readings of the row after it: they
      // are the same player either way, and `matchPlayer` is the costly part.
      const found = matchPlayer(index, row.fullName, row.proTeamId);
      if (!found) continue;
      const owned = row.ownership?.percentOwned;
      if (typeof owned === 'number') pct[found.id] = owned;
      const positions = eligiblePositions(row.eligibleSlots);
      if (positions.length > 0) eligible[found.id] = positions;
    }
    const pool = { pct, eligible };
    poolCache = { pool, fetchedAt: Date.now() };
    return pool;
  })().finally(() => {
    poolInFlight = null;
  });

  return poolInFlight;
}

/** Just the percentages — what the trend is measured on, and what it snapshots.
 *  A wrapper rather than a fetch of its own, so there is still one request and
 *  one cache behind both halves. */
export async function getRosterPct(): Promise<Record<number, number>> {
  return (await getPlayerPool()).pct;
}

// ---- Trending: which way a roster % is moving ----------------------------
//
// **The delta is ours, not ESPN's.** They do publish a `percentChange`, but only
// on payloads this app can't justify: the league board is 10MB and needs
// cookies, and the season-wide `kona_player_info` — which needs none — is
// **180MB**, rejects `limit`, and rejects every stat filter there is (checked:
// 400 on each). Their window is undocumented either way.
//
// So it is computed from a **daily snapshot of the map already being fetched**.
// That costs nothing extra — `getRosterPct` is one 940KB request the app makes
// regardless — and it means the number has a definition the app can print: the
// change over exactly the span reported beside it.

/**
 * The spans a trend is reported over, ascending.
 *
 * Five rather than one because they are five different questions. A 1D move is
 * a reaction — last night's start, this morning's IL placement — where a 30D one
 * is a player the league has been coming round to all month, and the two
 * routinely disagree in sign about the same man. One column could only ever
 * answer one of them, and seven days — the convention it borrowed from the rest
 * of fantasy — is the least useful of the five on the day something happens.
 */
export const TREND_WINDOWS = [1, 3, 7, 15, 30] as const;
export type TrendWindow = (typeof TREND_WINDOWS)[number];

/**
 * How far a window's baseline may drift when the exact day back is missing, in
 * days either side of it.
 *
 * There cannot be one number for this, which is why it is a table. The old
 * single column walked out to **fourteen** days from a target of seven, and the
 * same tolerance on a 1D column would report a fortnight's movement under a
 * header saying yesterday. So the drift is roughly a sixth of the span, and the
 * shortest window gets **none at all**: yesterday's snapshot is either there or
 * it isn't, and there is no near miss for it that is still the thing the column
 * claims to be.
 *
 * The wide old fallback was buying *coverage*: with one column, falling back
 * from seven days to three was the difference between a trend and nothing at
 * all. That argument goes away the moment a 3D column sits beside the 7D one —
 * a short span now has a column of its own to be reported in, so a long one
 * blurring into it would only be two columns saying one thing under two
 * headers.
 *
 * The numbers are also picked so the **bands do not touch**: [1], [2-4], [5-9],
 * [12-18], [25-35]. No two windows can therefore resolve to the same measured
 * span, which matters because each column's label states the span it actually
 * measured rather than the one it asked for — two headers both reading
 * "Δ4d" over different columns would be unreadable, and this makes that
 * impossible rather than merely unlikely.
 */
const TREND_DRIFT: Record<TrendWindow, number> = { 1: 0, 3: 1, 7: 2, 15: 3, 30: 5 };

/** The furthest back any window can reach, and so how much history a snapshot
 *  has to survive to be useful. Nothing prunes these blobs — the cache bucket's
 *  lifecycle rule expires the whole `cache/` prefix at 400 days, an order of
 *  magnitude past this — so the only thing that ever limited the history was
 *  this constant, which used to be 14. */
export const TREND_MAX_DAYS = 30 + TREND_DRIFT[30];

const snapshotKey = (date: string) => `espn-ownership-${date}.json`;

/** Store today's map, once. Not overwritten later in the day: a baseline that
 *  crept toward the current value would shrink every delta measured against it
 *  as the day went on, for no reason a reader could see. */
async function snapshotRosterPct(pct: Record<number, number>): Promise<void> {
  const key = snapshotKey(baseballToday());
  if ((await readBlob(key)) !== null) return;
  await writeBlob(key, JSON.stringify(pct));
}

async function readSnapshot(date: string): Promise<Record<number, number> | null> {
  const raw = await readBlob(snapshotKey(date));
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as Record<number, number>;
  } catch {
    return null;
  }
}

function daysAgo(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - n * 86_400_000).toISOString().slice(0, 10);
}

/** Which days back to try for one window, best first: the exact day, then
 *  further back, then nearer, so a gap in the history costs accuracy rather
 *  than the column. Further back before nearer, because a delta measured over
 *  slightly too long a span overstates the movement by a little where the short
 *  one reports several days of it as one. */
function baselineOrder(window: TrendWindow): number[] {
  const drift = TREND_DRIFT[window];
  const order: number[] = [window];
  for (let i = 1; i <= drift; i++) {
    order.push(window + i);
    if (window - i >= 1) order.push(window - i);
  }
  return order;
}

/** Today's map less a baseline, for the players in both.
 *
 *  Rounded to a tenth, which is the precision the figure is published at;
 *  without it floating-point noise gives half the league a "trend". Zeroes are
 *  dropped, so the client reads "absent but has a roster %" as flat rather than
 *  unknown. A player missing from the baseline is **excluded rather than
 *  treated as rising from zero**, which would put every newly-added prospect at
 *  the top of the risers — and does so per window, so a call-up is missing from
 *  30D while appearing in 1D, which is exactly right. */
function diffAgainst(
  current: Record<number, number>,
  base: Record<number, number>,
): Record<number, number> {
  const delta: Record<number, number> = {};
  for (const [id, pct] of Object.entries(current)) {
    const was = base[id as unknown as number];
    if (typeof was !== 'number') continue;
    const change = Math.round((pct - was) * 10) / 10;
    if (change !== 0) delta[Number(id)] = change;
  }
  return delta;
}

export interface RosterTrendWindow {
  /** The span asked for — one of `TREND_WINDOWS`. This is the column's
   *  identity, and stays fixed while the measurement under it drifts, so a
   *  saved column set and a `cols=` link go on naming the same column. */
  window: TrendWindow;
  /** The span actually measured, within `TREND_DRIFT[window]` of it. Reported
   *  rather than assumed because the header says it: a column labelled "7d"
   *  that measured five days would be a lie the reader has no way to catch. */
  days: number;
  /** Change in roster % per MLB player id over `days`. */
  delta: Record<number, number>;
}

/** One entry per window that had a usable baseline, ascending. A window with
 *  none is **absent** rather than present and empty: the client removes that
 *  column entirely, since a column of zeroes reads as "nobody is moving", which
 *  is a claim where the truth is an absence. */
export type RosterTrend = RosterTrendWindow[];

/**
 * The trend windows, or null when not one of them has a baseline to measure
 * against — a cold install, whose history starts accumulating today.
 *
 * The columns therefore arrive one at a time as it grows: 1D tomorrow, 3D in
 * three days, 30D in a month. That is the honest shape of the thing, and it is
 * why nothing here falls back to the earliest snapshot it happens to hold and
 * calls the answer a month.
 *
 * The windows resolve concurrently and each walks only its own band, which
 * cannot overlap another's (see `TREND_DRIFT`), so no date is read twice.
 * Typically that is five 19KB reads, one per window, each hitting its exact
 * day; a miss is a 404 against the cache and costs nothing.
 */
export async function getRosterTrend(): Promise<RosterTrend | null> {
  const today = baseballToday();
  const current = await getRosterPct();
  await snapshotRosterPct(current).catch((err: Error) =>
    console.error('ESPN ownership snapshot failed:', err.message),
  );

  const resolved = await Promise.all(
    TREND_WINDOWS.map(async (window): Promise<RosterTrendWindow | null> => {
      for (const days of baselineOrder(window)) {
        const base = await readSnapshot(daysAgo(today, days));
        if (!base) continue;
        return { window, days, delta: diffAgainst(current, base) };
      }
      return null;
    }),
  );
  const found = resolved.filter((w): w is RosterTrendWindow => w !== null);
  return found.length > 0 ? found : null;
}

// ---- Reading the league ---------------------------------------------------

interface EspnRosterResponse {
  id?: number;
  seasonId?: number;
  scoringPeriodId?: number;
  settings?: { name?: string; size?: number };
  teams?: {
    id: number;
    name?: string;
    abbrev?: string;
    owners?: string[] | null;
    primaryOwner?: string | null;
    roster?: {
      entries?: {
        lineupSlotId?: number;
        playerPoolEntry?: {
          player?: {
            id?: number;
            fullName?: string;
            proTeamId?: number;
            injured?: boolean;
            injuryStatus?: string;
          };
        };
      }[];
    };
  }[];
}

async function leagueGet(
  creds: EspnCreds,
  views: string[],
  scoringPeriodId?: number | null,
): Promise<EspnRosterResponse> {
  const url =
    `${FANTASY_BASE}/${SEASON}/segments/0/leagues/${creds.leagueId}` +
    `?${views.map((v) => `view=${v}`).join('&')}` +
    // Omitted rather than sent as ESPN's own current value when there is
    // nothing to say: an absent `scoringPeriodId` is exactly "whichever day the
    // league is on", which is the answer for every request but a future one.
    (scoringPeriodId == null ? '' : `&scoringPeriodId=${scoringPeriodId}`);
  // Omitted entirely rather than sent empty when there is nothing to send: a
  // public league is read anonymously, and `Cookie: SWID=; espn_s2=` is not the
  // same request as no cookie header at all.
  const authed = Boolean(creds.swid && creds.espnS2);
  const res = await fetch(url, {
    headers: {
      ...UA,
      // Sent as a raw Cookie header, exactly as a browser would: `espn_s2` is
      // already percent-encoded by ESPN and must not be encoded again.
      ...(authed ? { Cookie: `SWID=${creds.swid}; espn_s2=${creds.espnS2}` } : {}),
    },
  });
  if (res.status === 401 || res.status === 403) {
    // The two 401s mean opposite things to the person reading them: one is
    // "this league is private, so it needs your cookies", the other is "the
    // cookies you gave have expired". Saying the wrong one sends the user off
    // to solve a problem they don't have.
    throw new EspnAuthError(
      authed
        ? `ESPN rejected the saved credentials for league ${creds.leagueId}. ` +
          'The espn_s2 cookie expires — sign in to ESPN again and re-copy it.'
        : `League ${creds.leagueId} is private, so it can't be read without ` +
          'your ESPN cookies. Add the SWID and espn_s2 values below.',
    );
  }
  if (res.status === 404) {
    throw new EspnAuthError(
      `ESPN has no league ${creds.leagueId} for ${SEASON}. Check the League ID.`,
    );
  }
  if (!res.ok) throw new Error(`ESPN fantasy API returned ${res.status}`);
  const body = (await res.json()) as EspnRosterResponse | EspnRosterResponse[];
  // The `leagueHistory` shape returns an array of one; the current-season
  // endpoint returns the object. Both are worth surviving.
  return Array.isArray(body) ? body[0] : body;
}

// ---- Which day's lineup ---------------------------------------------------
//
// **A lineup is a fact about a day, and `mRoster` answers for one day only.**
// Asked without a `scoringPeriodId` it returns the lineup for whichever period
// ESPN is currently on, which is why a lineup set for tomorrow was invisible
// here: the manager moves a starter off the bench for tomorrow's games, ESPN
// files that under tomorrow's period, and the app went on reading today's.
// Checked against a live league on 2026-08-11 (period 140): Gilbert `BE` and
// Webb `SP` at 140, and the reverse — the change that had just been made — at
// 141. The default answered 140.
//
// **The app therefore names the period rather than inheriting ESPN's clock.**
// Which period follows from the day the roster views are reporting on, and the
// rule has two halves that are worth stating separately because only one of
// them is symmetric:
//
//  - **The future is read at its own period.** The `Tomorrow` preset exists to
//    surface a watched player's scheduled games before they are played, and the
//    lineup he is scheduled to play *in* is the same kind of fact. So the slot
//    chip on that preset is the lineup set for that day.
//  - **And the past is read at its own period too**, which is a reversal. ESPN
//    answers a past period with the roster **as it was then**, players and all
//    — re-checked over the seven days ending 2026-08-13 (periods 136–142): 31
//    players were on the team at some point in that week against the 28 on it
//    today. That used to be the argument *against* reading a past period for
//    the roster, on the reasoning that what a manager wants over "Last 15 days"
//    is *his* team's last fifteen days. It is the same mistake the whole-range
//    lineup made beside it: what he wants is what he actually **had**. See
//    `getTeamRosters` below, and **A range is a range of rosters** in
//    `docs/claude/espn.md`.
//
// A future period costs nothing either: it returns the **current** roster with
// the lineup as it stands (checked: periods 141 through 200 carry the same 28
// players as today, and 200 is past the season's last period without erroring),
// so naming one can't invent or lose a player.
//
// One read per day now answers both questions the payload holds — which players
// the views report on, and which of a player's days count — where the single
// end-of-range read answered only the first and answered it about today.

/**
 * A date shaped like one **and real**, or null.
 *
 * Shape is not enough: `2026-99-99` matches every YYYY-MM-DD test in the
 * codebase and `Date.UTC` rolls it over into 2034, which would ask ESPN for a
 * scoring period some 3,000 past the season. A day that doesn't exist means
 * nothing, and nothing here is today.
 */
function validDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== m - 1 || at.getUTCDate() !== d) return null;
  return date;
}

/**
 * Which **calendar day** the caller wants, for the reads that may only ever
 * look forward.
 *
 * Clamped at today, which is what keeps the **league-wide** read — the
 * ownership map every member of a league shares, and the one roster the slot
 * chips are drawn from — on one entry rather than one per person's date range.
 * `lineupPeriodFor` takes the date unclamped, because the per-team, per-day
 * read below is precisely the one that wants a past day.
 */
function ownershipDay(date: string | null | undefined): string {
  const today = baseballToday();
  const day = validDate(date);
  return day === null || day <= today ? today : day;
}

// ---- The period a day falls in --------------------------------------------
//
// **ESPN numbers its scoring periods one per calendar day of the season**, the
// All-Star break included: 2026 allocates ids 111–113 to three gameless days.
// So a day ahead is exactly a period ahead, and the whole mapping is one
// straight line — but a line needs a point on it, and where that point comes
// from is the thing this section is about.
//
// **It used to be ESPN's own `currentScoringPeriod`, plus the days from
// `baseballToday()`**, and that quietly asserted something nobody had checked:
// that ESPN's period pointer turns at the same moment the app's baseball day
// does. It does not. The app's day turns at **3am ET** (`etDate.ts`), while
// ESPN advances the pointer in a nightly batch — `status.lastUpdateInfo.source`
// is `NightlyLeagueUpdateTaskProcessor`, and the `standingsUpdateDate` /
// `waiverLastExecutionDate` pair it stamps landed at **04:26:40 ET** on
// 2026-08-13, with the season's eighteen recorded waiver runs spread from
// **03:39 to 05:19 ET**. Between 3am and whenever that batch runs, therefore,
// `baseballToday()` had already rolled and ESPN's pointer had not, and **every
// period this file computed was one too low** — which is a lineup and a roster
// from the wrong day, drawn as though it were this one. Latent while only the
// `Tomorrow` preset named a period; load-bearing since a range became a range
// of rosters, which names one per day for up to 62 days.
//
// **So the anchor is derived from ESPN's own calendar instead**, and
// `baseballToday()` drops out of the arithmetic entirely. `proTeamSchedules_wl`
// maps every period to the ET date of the games in it; reduced to a single
// `{ period, date }` pair, `period = anchor.period + daysBetween(anchor.date,
// target)` answers for any day of the season and cannot disagree with ESPN
// about when a day begins, because it never asks. The app's own clock is left
// doing the one job it is right for — deciding *which day* the reader wants —
// and none of the job it was wrong for.
//
// If the schedule can't be read the old rule stands as the fallback, logged: a
// failed derivation must cost accuracy in the small hours, never the feature.

/** One point on the line: this period held that ET calendar date. */
interface PeriodAnchor {
  period: number;
  date: string;
}

/**
 * The pro schedule is **static for the season and takes no cookies at all** —
 * checked, 200 with no `Cookie` header, 850,891 bytes — so this is one read
 * shared by every league and every user, exactly as `getPlayerPool` is. It is
 * the 0.81MB that is not worth holding: what gets cached is the pair it
 * reduces to — a **67-byte** blob, stamp and all — which is why the storage key
 * is by season and the freshness window is measured in weeks rather than hours.
 * Bump the `-v1` if the pair ever grows.
 */
const anchorBlobKey = (season: number) => `espn-period-anchor-${season}-v1.json`;
const ANCHOR_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let anchorCache: { anchor: PeriodAnchor; fetchedAt: number } | null = null;
/** A cold container answering three tabs should send one upstream read — the
 *  rule `inFlight` follows for the ownership blob and `poolInFlight` for the
 *  player pool. */
let anchorInFlight: Promise<PeriodAnchor> | null = null;

/**
 * Reduce ESPN's whole season schedule to one `{ period, date }` pair.
 *
 * Every game row is stamped with an epoch and filed under a period, and the
 * date that matters is the **ET** one — the calendar the periods are actually
 * cut on. Checked across the 2026 season: **184 periods map to exactly one ET
 * date each, 0 mixed**, and every one of them satisfies `period = p0 +
 * daysBetween(d0, date)` against the first pair, 0 violations. So one pair
 * really is enough and no lookup table is needed.
 *
 * The pair is nonetheless picked by **majority vote** over all of them rather
 * than by taking the first: the implied anchor is computed for every mapped
 * period and the modal answer wins, so a single malformed row — a game filed
 * under the wrong period, a date ESPN moves — costs nothing instead of
 * shifting the entire season by a day. With 0 violations today the vote is
 * unanimous; it is there for the day it isn't.
 */
async function fetchPeriodAnchor(): Promise<PeriodAnchor> {
  const url = `${FANTASY_BASE}/${SEASON}?view=proTeamSchedules_wl`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`ESPN pro schedule returned ${res.status}`);
  const data = (await res.json()) as {
    settings?: {
      proTeams?: { proGamesByScoringPeriod?: Record<string, { date?: number }[]> }[];
    };
  };

  // Period → the ET dates its games fall on. A period with more than one is a
  // period this can't speak for and is dropped rather than guessed at.
  const dates = new Map<number, Set<string>>();
  for (const team of data.settings?.proTeams ?? []) {
    for (const [id, games] of Object.entries(team.proGamesByScoringPeriod ?? {})) {
      const period = Number(id);
      if (!Number.isInteger(period) || period < 1) continue;
      for (const game of games ?? []) {
        if (typeof game.date !== 'number') continue;
        const day = easternDate(new Date(game.date));
        const at = dates.get(period);
        if (at) at.add(day);
        else dates.set(period, new Set([day]));
      }
    }
  }

  const pairs = [...dates.entries()]
    .filter(([, days]) => days.size === 1)
    .map(([period, days]): PeriodAnchor => ({ period, date: [...days][0] }))
    .sort((a, b) => a.period - b.period);
  if (pairs.length === 0) throw new Error('ESPN pro schedule carried no usable scoring periods');

  // Every pair, restated as "what period would `base.date` have been?", and the
  // most popular answer wins.
  const base = pairs[0];
  const votes = new Map<number, number>();
  for (const pair of pairs) {
    const implied = pair.period - daysBetween(base.date, pair.date);
    votes.set(implied, (votes.get(implied) ?? 0) + 1);
  }
  let period = base.period;
  let best = 0;
  for (const [value, count] of votes) {
    if (count > best) {
      best = count;
      period = value;
    }
  }
  return { period, date: base.date };
}

/** How long a failed derivation is remembered before it is tried again. */
const ANCHOR_RETRY_MS = 60 * 1000;
let anchorFailedAt = 0;

/**
 * The anchor, or null if ESPN's schedule can't be read at all.
 *
 * **This never rejects**, and that is load-bearing rather than tidy: a single
 * fan-out asks for one period per day of the range, so a throwing anchor would
 * reject in every one of `MAX_RANGE_DAYS` places at once — and `getTeamRosters`
 * catches per *roster read*, not around the naming of the period, so the throw
 * would escape the whole range instead of costing it its accuracy. Caught by
 * driving the module with the schedule read forced to 503: the in-flight guard
 * handed the same rejecting promise to five concurrent callers and the range
 * died. Every path out of here is an anchor or a null.
 *
 * A failure is remembered for `ANCHOR_RETRY_MS` for the same reason: without
 * it, a 62-day range against a dead upstream would retry an 850KB fetch once
 * per wave of the fan-out rather than once.
 */
async function getPeriodAnchor(): Promise<PeriodAnchor | null> {
  if (anchorCache && Date.now() - anchorCache.fetchedAt < ANCHOR_TTL_MS) return anchorCache.anchor;
  if (anchorFailedAt && Date.now() - anchorFailedAt < ANCHOR_RETRY_MS) return null;

  if (!anchorInFlight) {
    anchorInFlight = (async () => {
      const key = anchorBlobKey(SEASON);
      const stored = await readJsonBlob<PeriodAnchor>(
        key,
        (_value, cachedAt) => Date.now() - cachedAt < ANCHOR_TTL_MS,
      );
      if (stored && typeof stored.period === 'number' && typeof stored.date === 'string') {
        anchorCache = { anchor: stored, fetchedAt: Date.now() };
        return stored;
      }
      const anchor = await fetchPeriodAnchor();
      anchorCache = { anchor, fetchedAt: Date.now() };
      await writeJsonBlob(key, anchor);
      return anchor;
    })().finally(() => {
      anchorInFlight = null;
    });
  }

  try {
    return await anchorInFlight;
  } catch (err) {
    // One line per failure window rather than one per concurrent caller: a
    // 62-day fan-out shares the rejecting promise and would otherwise log the
    // same outage six times over.
    const first = !anchorFailedAt || Date.now() - anchorFailedAt >= ANCHOR_RETRY_MS;
    anchorFailedAt = Date.now();
    if (first) console.error('ESPN period anchor unavailable:', (err as Error).message);
    return null;
  }
}

/**
 * ESPN's own current scoring period for a league.
 *
 * **The fallback, and only the fallback.** It was the anchor until the schedule
 * above became one, and it is kept because a derivation that fails must cost
 * accuracy rather than the feature: without it a dead schedule read would leave
 * every period unnamed and every day reading as today's. It is a bare league
 * read — **3KB** against `mRoster`'s 2.2MB — cached per league for the same ten
 * minutes the rosters take, and on the ordinary path it is now never issued at
 * all.
 */
const periodCache = new Map<number, { period: number; fetchedAt: number }>();

async function currentScoringPeriod(creds: EspnCreds): Promise<number | null> {
  const hit = periodCache.get(creds.leagueId);
  // A period turns once a day, so ten minutes is generous; sharing the window
  // with the rosters keeps one answer about how fresh "now" is.
  if (hit && Date.now() - hit.fetchedAt < OWNERSHIP_TTL_MS) return hit.period;
  const data = await leagueGet(creds, []);
  const period = data.scoringPeriodId;
  if (typeof period !== 'number') return null;
  periodCache.set(creds.leagueId, { period, fetchedAt: Date.now() });
  return period;
}

/**
 * The absolute period holding `day`'s lineup, or null when nothing can name it.
 *
 * The anchor answers whenever the schedule could be read, and the arithmetic
 * touches no clock of ours. Failing that it is the old rule — ESPN's pointer
 * plus the days from `baseballToday()` — which is right whenever the two clocks
 * agree and is the behaviour this file had for its whole life; the point of the
 * anchor is that agreement is no longer something we have to hope for.
 *
 * Null only when neither could answer, which leaves the request
 * un-parameterised and ESPN answering for its own current day — the right
 * direction to fail in, the alternative being to guess an absolute period and
 * show the wrong day's.
 */
async function periodFor(creds: EspnCreds, day: string): Promise<number | null> {
  const anchor = await getPeriodAnchor();
  if (anchor) return anchor.period + daysBetween(anchor.date, day);
  const base = await currentScoringPeriod(creds).catch((err: Error) => {
    console.error('ESPN scoring period unavailable:', err.message);
    return null;
  });
  return base === null ? null : base + daysBetween(baseballToday(), day);
}

/** One fantasy team, as the client shows it. */
export interface EspnTeam {
  id: number;
  name: string;
  abbrev: string;
}

/** What a user's league looks like once connected — no credentials in it. */
export interface EspnLeagueInfo {
  leagueId: number;
  leagueName: string;
  season: number;
  teams: EspnTeam[];
  /** The team owned by the SWID that connected, if one of them is. */
  myTeamId: number | null;
  myTeamName: string | null;
}

/** Reads the league and identifies the connecting user's own team. Used to
 *  verify credentials before they are saved — a set that can't read the league
 *  is worth rejecting at the point of entry rather than at first use. */
export async function getLeagueInfo(creds: EspnCreds): Promise<EspnLeagueInfo> {
  const data = await leagueGet(creds, ['mTeam', 'mSettings']);
  return leagueInfoFrom(creds, data);
}

function leagueInfoFrom(creds: EspnCreds, data: EspnRosterResponse): EspnLeagueInfo {
  const teams: EspnTeam[] = (data.teams ?? []).map((t) => ({
    id: t.id,
    name: t.name?.trim() || `Team ${t.id}`,
    abbrev: t.abbrev?.trim() || `T${t.id}`,
  }));
  // Without a SWID there is nobody to match, so a public league connected
  // anonymously has no "your team" — the caller may still know it from the URL
  // the user pasted, which is the only other place it appears.
  const swid = creds.swid?.toUpperCase() ?? null;
  const mine = swid
    ? (data.teams ?? []).find((t) =>
        [...(t.owners ?? []), t.primaryOwner].some((o) => (o ?? '').toUpperCase() === swid),
      )
    : undefined;
  return {
    leagueId: creds.leagueId,
    leagueName: data.settings?.name?.trim() || `League ${creds.leagueId}`,
    season: data.seasonId ?? SEASON,
    teams,
    myTeamId: mine?.id ?? null,
    myTeamName: mine?.name?.trim() ?? null,
  };
}

/**
 * Who owns whom, keyed by **MLB** player id — which is the currency the
 * research board is in, so the client's test for a free agent is a set lookup
 * on the id it already has.
 */
/**
 * One player on a fantasy roster, joined to the MLB id the rest of the app is
 * written in. This is what makes "use my fantasy team as the watchlist"
 * possible: the app's currency is `${kind}-${mlbId}`, and everything needed to
 * mint that is here.
 */
export interface EspnRosterPlayer {
  espnId: number;
  name: string;
  /** Null when the name didn't resolve to a major leaguer — a prospect, most
   *  often. Kept in the list rather than dropped so the roster can say how many
   *  of its players the app can actually report on. */
  mlbId: number | null;
  savantName: string | null;
  /** Usually one; two for a two-way player, who is two watchlist entries. */
  kinds: PlayerKind[];
  /** The fantasy slot he is in on the day this was read for — 'SS', 'UTIL',
   *  'SP', 'BE', 'IL'. Today's, unless the caller asked for a future one; see
   *  **Which day's lineup** above. */
  slot: string;
  slotId: number;
  /** In that day's lineup, i.e. not benched and not on the IL. */
  starting: boolean;
  /** ESPN's own injury flag, which is about the real player rather than the
   *  fantasy slot — a manager can leave an injured player in a lineup spot. */
  injured: boolean;
  /**
   * ESPN's injury designation, raw (`DAY_TO_DAY`, `OUT`, `TEN_DAY_DL`, …), or
   * null when he is `ACTIVE` or it is absent.
   *
   * Carried raw rather than pre-labelled, the way `RosterStatus` carries MLB's
   * code and description: presentation is `lib.ts`'s job on the client, and one
   * of these maps to a badge the app already draws.
   *
   * **This is the only source in the app for day-to-day and out.** MLB's roster
   * status has no such code — checked league-wide, it publishes only `A`, the
   * `D10`/`D15`/`D60` IL stints, minors, traded, released, claimed, DFA, free
   * agent and suspended — because a day-to-day player is still on the active
   * roster and MLB has nothing to say about him. ESPN's league roster does, and
   * the cookie-free season-wide player list does **not** (checked: the field is
   * absent on all 3,921 rows), so this rides on the one payload that carries it
   * and is therefore a fantasy-mode fact, like the lineup slot beside it.
   */
  injuryStatus: string | null;
}

/** One `mRoster` entry, joined to MLB. Null for a row with no name at all.
 *
 *  Shared by the league-wide read below and the per-day `forTeamId` one further
 *  down, because the two are the same payload asked for at two widths — one
 *  parse rather than two that can come to disagree about a slot or a name. */
function toRosterPlayer(
  entry: {
    lineupSlotId?: number;
    playerPoolEntry?: {
      player?: {
        id?: number;
        fullName?: string;
        proTeamId?: number;
        injured?: boolean;
        injuryStatus?: string;
      };
    };
  },
  index: MlbIndex,
): EspnRosterPlayer | null {
  const player = entry.playerPoolEntry?.player;
  if (!player?.fullName) return null;
  const found = matchPlayer(index, player.fullName, player.proTeamId);
  const slotId = entry.lineupSlotId ?? BENCH_SLOT;
  return {
    espnId: player.id ?? 0,
    // MLB's spelling where the join succeeded: it is the one the rest of the
    // app shows, and ESPN drops the accents MLB keeps.
    name: found?.name ?? player.fullName,
    mlbId: found?.id ?? null,
    savantName: found ? toSavantName(found.name) : null,
    kinds: found?.kinds ?? [],
    slot: LINEUP_SLOTS[slotId] ?? String(slotId),
    slotId,
    starting: slotId !== BENCH_SLOT && slotId !== IL_SLOT,
    injured: player.injured === true,
    // 'ACTIVE' is the overwhelming majority and means nothing worth saying, so
    // it is normalised to null here rather than filtered at every read site.
    injuryStatus:
      player.injuryStatus && player.injuryStatus !== 'ACTIVE' ? player.injuryStatus : null,
  };
}

/** Lineup first, then the bench, then the IL — the order a manager reads their
 *  own team in, and the order the watchlist inherits. */
function sortRoster(roster: EspnRosterPlayer[]): EspnRosterPlayer[] {
  return roster.sort((a, b) => Number(b.starting) - Number(a.starting) || a.slotId - b.slotId);
}

export interface EspnOwnership extends EspnLeagueInfo {
  /** MLB player id to the fantasy team id that holds him. */
  owned: Record<number, number>;
  /** ESPN's global rostered percentage, by MLB player id — see `getPlayerPool`.
   *  It rides along here rather than getting a route of its own because this is
   *  the call a connected client already makes, and the gate on both is the
   *  same: having a league. Its own cache is six hours, so the ten-minute
   *  ownership refresh re-reads a map rather than an upstream. */
  rosterPct: Record<number, number>;
  /**
   * The positions ESPN has each player eligible at, by MLB player id — off the
   * same pool read and here for the same reason.
   *
   * It could not have gone on the research blob, which is where the board's
   * other position facts live: that blob is cached per kind and window and
   * served to **every** user alike, and this is a fact about a fantasy provider
   * that only a user with a league connected is shown. The same rule already
   * puts `rosterPct` here and has the client merge it into the rows.
   *
   * ~24KB of JSON for ~1,376 major leaguers, 6KB down the wire once
   * `compression()` has had it — against the 2MB league read it rides on.
   */
  eligibility: Record<number, string[]>;
  /** How each roster % has moved, over each of the five spans a baseline could
   *  be found for, and how long each of those spans really was — null until
   *  there is a second day of history to measure against at all. A window with
   *  no baseline is missing from the list rather than present and empty, which
   *  is what removes its column. See `getRosterTrend`. */
  trend: RosterTrend | null;
  /** Every team's roster, by fantasy team id. Keyed by team rather than
   *  narrowed to the caller's, because this whole object is cached **per
   *  league** and shared by everyone in it — making it user-specific would
   *  turn one upstream read into one per manager. */
  rosters: Record<number, EspnRosterPlayer[]>;
  /** How many roster entries were read, and how many of them found an MLB
   *  player. The gap is almost entirely prospects who have never played a
   *  major-league game, and is reported so a bad *season* (an index for the
   *  wrong year matches nobody) is visible rather than silently emptying the
   *  filter. */
  rosterCount: number;
  matched: number;
  fetchedAt: number;
}

/**
 * Keyed by league **and scoring period**, not by league alone: a lineup is a
 * fact about a day, so two days are two answers. The key for today is the
 * league's own id with no period on it, which is what keeps the blob every user
 * of a league shares — the free-agent set, the roster %, the trend — one entry
 * rather than one per person's date range.
 */
const cacheKey = (leagueId: number, period: number | null) =>
  period === null ? `${leagueId}` : `${leagueId}:${period}`;

const ownershipCache = new Map<string, EspnOwnership>();
/** A cold Lambda serving three tabs at once should send one upstream request,
 *  not three — the same rule the research board's own fetches follow. */
const inFlight = new Map<string, Promise<EspnOwnership>>();

/**
 * `date` is the day the caller wants the **lineup** for — the last day of the
 * range the roster views are reporting on. Today and anything before it read
 * ESPN's current period, so the default is the behaviour this has always had;
 * see `ownershipDay` above for why a past day reads as today here.
 *
 * `force` drops **every** period of the league, not just the one being asked
 * for. "Read my league again" is a statement about the league rather than about
 * a day, and the header's refresh leans on it: it forces the ownership read and
 * then lets the roster and the report come back through the cache it filled. If
 * those two want a different day — which on the `Tomorrow` preset they do — a
 * per-period force would have left them serving a nine-minute-old lineup, which
 * is precisely the staleness the button exists to clear.
 */
export async function getOwnership(
  creds: EspnCreds,
  force = false,
  date?: string | null,
): Promise<EspnOwnership> {
  // The day first, then the period it falls in. The two are separate because
  // the **key** wants the day and the **request** wants the period: today's
  // entry keeps the bare league id, so the map every member of a league shares
  // stays one entry, while the request still names the period rather than
  // letting ESPN's own pointer answer — which in the small hours is a different
  // day (see **The period a day falls in** above).
  const day = ownershipDay(date);
  const period = await periodFor(creds, day);
  const key = cacheKey(creds.leagueId, day === baseballToday() ? null : period);
  if (force) {
    const prefix = `${creds.leagueId}`;
    for (const k of ownershipCache.keys()) {
      if (k === prefix || k.startsWith(`${prefix}:`)) ownershipCache.delete(k);
    }
  }
  const cached = ownershipCache.get(key);
  if (!force && cached && Date.now() - cached.fetchedAt < OWNERSHIP_TTL_MS) return cached;

  const running = inFlight.get(key);
  if (running && !force) return running;

  const job = (async () => {
    const [data, index, pool, trend] = await Promise.all([
      leagueGet(creds, ['mRoster', 'mTeam', 'mSettings'], period),
      getMlbIndex(),
      // A failed read here costs one column and the board's ESPN positions —
      // which fall back to MLB's listed one — not the whole connection: the
      // free-agent filter and the fantasy roster don't depend on either.
      getPlayerPool().catch((err: Error) => {
        console.error('ESPN player pool unavailable:', err.message);
        return { pct: {}, eligible: {} } as EspnPlayerPool;
      }),
      getRosterTrend().catch((err: Error) => {
        console.error('ESPN roster trend unavailable:', err.message);
        return null;
      }),
    ]);
    const info = leagueInfoFrom(creds, data);
    const owned: Record<number, number> = {};
    const rosters: Record<number, EspnRosterPlayer[]> = {};
    let rosterCount = 0;
    let matched = 0;
    for (const team of data.teams ?? []) {
      const roster: EspnRosterPlayer[] = [];
      for (const entry of team.roster?.entries ?? []) {
        const player = toRosterPlayer(entry, index);
        if (!player) continue;
        rosterCount++;
        if (player.mlbId !== null) {
          matched++;
          owned[player.mlbId] = team.id;
        }
        roster.push(player);
      }
      rosters[team.id] = sortRoster(roster);
    }
    const result: EspnOwnership = {
      ...info,
      owned,
      rosterPct: pool.pct,
      eligibility: pool.eligible,
      trend,
      rosters,
      rosterCount,
      matched,
      fetchedAt: Date.now(),
    };
    ownershipCache.set(key, result);
    return result;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, job);
  return job;
}

// ---- The roster and the lineup, one day at a time -------------------------
//
// **A range of days is a range of rosters as well as a range of lineups**, and
// the two were found wrong in that order — see `getTeamRosters` at the end of
// this section for the roster half, which is the later of the two and reverses
// a rule stated above.
//
// **A range of days is a range of lineups.** The roster views summarise a date
// range, and until now they applied *one* lineup — the one set for the end of
// it — to every day in it. That is the wrong arithmetic for the thing the
// summary table is: a player started on Monday and benched on Wednesday earned
// you Monday's line and none of Wednesday's, where the old `Starters` filter
// either counted his whole week or dropped him from it. It is not a rare edge
// either. Measured on the live 12-team league over the seven days ending
// 2026-08-13 (periods 135–141), **12 of the 29 players** who were on the team
// at some point in that week changed state within it — Gausman benched, started,
// benched again; Gilbert started, benched, started; Snell off the IL on day six;
// Hoffman dropped and Bowlan added. Eight of the 28 lineup spots on a given day
// were held by somebody different a week earlier.
//
// So the lineup is read **per day, at that day's own period**. Which is the
// opposite of the rule above it, and deliberately: the two are different
// questions off the same payload.
//
//  - *Which players does the view report on?* Your team **as it stands** —
//    today's roster, or a future day's, exactly as before. A man you dropped on
//    Tuesday is not on your team and has no row.
//  - *Which of his days count?* The days **you actually had him in your
//    lineup**, read off each day's own period.
//
// A player who was not on your team at all on some day is, on that day, not in
// your lineup — which is the same answer as benched and is the honest one: his
// Monday belonged to whoever held him on Monday. The two rules compose into one
// sentence a reader can hold: *your team as it is now, credited only for the
// days you were playing them.* What it cannot show is the man you have since
// dropped, whose Monday you really did earn — he is off the roster the whole
// app is reporting on, and putting him back would be the very thing the roster
// rule above refuses. Stated rather than papered over.

/**
 * The absolute period holding `date`'s lineup — **unclamped**, so a past day
 * resolves to a past period, which is the whole point of reading a range one
 * day at a time. Null when no anchor could be had at all, and null below period
 * 1: ESPN has nothing to say about period 0, so a range reaching past opening
 * day has no lineups in its early half rather than erroring.
 *
 * This is the caller the anchor was derived from the schedule *for*. It names a
 * period per day for up to `MAX_RANGE_DAYS` of them, so an anchor off by one
 * shifts every roster and every lineup in the range by a day — silently wrong
 * rather than absent, which is the failure this file least wants.
 */
async function lineupPeriodFor(creds: EspnCreds, date: string): Promise<number | null> {
  const day = validDate(date);
  if (day === null) return null;
  const period = await periodFor(creds, day);
  return period !== null && period >= 1 ? period : null;
}

/**
 * Ten minutes for a day still being played, matching the rosters. A **finished**
 * day is not cached on a clock at all — see `lineupBlobKey`.
 */
const LINEUP_TTL_MS = OWNERSHIP_TTL_MS;

/**
 * At most this many of ESPN's per-day reads in flight at once. The repo's own
 * `mapLimit`, for the reason the report's fan-out uses it: the widest range the
 * app allows is `MAX_RANGE_DAYS` (62) and an unbounded `Promise.all` over it is
 * 62 sockets and 12MB resident against one upstream that has no idea we are
 * doing it. Measured against the live league at 6: a cold 62-day range is
 * **2.1s** and 11.7MB, a cold 30-day one **1.4s** and 5.6MB, a cold 7-day one
 * **0.5s** and 1.4MB. (At 4 the 30-day read is 1.9s, so 6 is worth the two
 * extra sockets; past that ESPN stops getting faster.)
 */
const LINEUP_CONCURRENCY = 6;

/**
 * **A finished day's lineup can never change**, which is what earns this a
 * storage blob rather than a ten-minute window: you cannot retroactively start
 * somebody in a game that has been played. So a period strictly before today's
 * is written to the cache tier and read back with no freshness test at all, the
 * way `savant.ts` keeps a finished day's parse — which is what makes a 30-day
 * range cost one ESPN read the first time anybody asks for it and none ever
 * after. Today's and any future day's are mutable (a lineup is editable until
 * the games start) and stay in memory on the ten-minute clock.
 *
 * Keyed by league, team and period, and versioned — a stored blob deserializes
 * with every field added since it missing, so bump `-v1` if the shape ever
 * grows past a list of ids.
 */
const lineupBlobKey = (leagueId: number, teamId: number, period: number) =>
  `espn-lineup-${leagueId}-${teamId}-${period}-v2.json`;

const lineupCache = new Map<string, { roster: EspnRosterPlayer[]; fetchedAt: number }>();
/** One cold container asking for the same day from three tabs should send one
 *  upstream read — the rule `inFlight` follows for the ownership blob. */
const lineupInFlight = new Map<string, Promise<EspnRosterPlayer[]>>();

/**
 * A team's **whole roster** on one day, slot by slot — the same
 * `EspnRosterPlayer` the league-wide read builds, off the same `toRosterPlayer`,
 * so a day read here and the same day read there cannot disagree.
 *
 * **It used to return the started ids alone** and now returns the roster they
 * are a subset of, because a range turned out to be a range of *rosters* as
 * well as a range of lineups — see **A range is a range of rosters** in
 * `docs/claude/espn.md`. `startedIds` derives the old answer from the new one.
 *
 * **Read `forTeamId`, not the whole league.** The consumer is always one team on
 * one day, and ESPN honours the filter: measured, `view=mRoster` for a single
 * team is **197,554 bytes against the full league's 2,237,620** — 11.3× smaller
 * — and the 28 entries it returns are byte-identical to that team's entries in
 * the full read (checked name and `lineupSlotId` for all 28, 0 differences),
 * `injuryStatus` included. That factor is the whole reason a 62-day range is
 * affordable: at the league-wide payload it would be 136MB.
 */
async function fetchTeamRoster(
  creds: EspnCreds,
  teamId: number,
  period: number,
): Promise<EspnRosterPlayer[]> {
  const url =
    `${FANTASY_BASE}/${SEASON}/segments/0/leagues/${creds.leagueId}` +
    `?view=mRoster&forTeamId=${teamId}&scoringPeriodId=${period}`;
  const authed = Boolean(creds.swid && creds.espnS2);
  const res = await fetch(url, {
    headers: {
      ...UA,
      ...(authed ? { Cookie: `SWID=${creds.swid}; espn_s2=${creds.espnS2}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`ESPN fantasy API returned ${res.status}`);
  const body = (await res.json()) as EspnRosterResponse | EspnRosterResponse[];
  const data = Array.isArray(body) ? body[0] : body;
  const team = (data.teams ?? []).find((t) => t.id === teamId);
  const index = await getMlbIndex();
  const roster: EspnRosterPlayer[] = [];
  for (const entry of team?.roster?.entries ?? []) {
    const player = toRosterPlayer(entry, index);
    if (player) roster.push(player);
  }
  return sortRoster(roster);
}

async function getTeamRoster(
  creds: EspnCreds,
  teamId: number,
  period: number,
  frozen: boolean,
  force = false,
): Promise<EspnRosterPlayer[]> {
  const key = `${creds.leagueId}:${teamId}:${period}`;
  // **A forced read only reaches the days that can have changed.** `Refresh
  // from ESPN` is somebody saying "I have just moved a player", and the only
  // days a move can touch are today's and the ones after it — a finished day's
  // roster and lineup are facts, so re-fetching thirty of them would spend
  // thirty ESPN reads to be told what the blobs already say.
  const stale = force && !frozen;
  const hit = lineupCache.get(key);
  if (!stale && hit && (frozen || Date.now() - hit.fetchedAt < LINEUP_TTL_MS)) return hit.roster;
  const running = lineupInFlight.get(key);
  if (running && !stale) return running;

  const job = (async () => {
    if (frozen) {
      // No freshness test: the day is over and what you had is a fact.
      const stored = await readJsonBlob<EspnRosterPlayer[]>(
        lineupBlobKey(creds.leagueId, teamId, period),
        () => true,
      );
      if (stored) {
        lineupCache.set(key, { roster: stored, fetchedAt: Date.now() });
        return stored;
      }
    }
    const roster = await fetchTeamRoster(creds, teamId, period);
    lineupCache.set(key, { roster, fetchedAt: Date.now() });
    if (frozen) await writeJsonBlob(lineupBlobKey(creds.leagueId, teamId, period), roster);
    return roster;
  })().finally(() => {
    lineupInFlight.delete(key);
  });

  lineupInFlight.set(key, job);
  return job;
}

/** Which MLB ids a roster read already in hand has in its lineup — the seed
 *  below, and the one place the per-day map and the slot chips are guaranteed
 *  to agree because they are the same read. */
export function startedIds(roster: EspnRosterPlayer[]): number[] {
  return roster.flatMap((p) => (p.starting && p.mlbId !== null ? [p.mlbId] : []));
}

/**
 * Your lineup for every day of `start`…`end`, as MLB ids, keyed by date.
 *
 * **A missing date is "we couldn't tell", not "nobody started".** A day whose
 * read fails is left out of the record entirely rather than sent empty, so the
 * client can fall back to the one lineup it does have — the end-of-range roster
 * it draws its chips from, which is exactly what the app did before any of this
 * — instead of quietly reporting a day of your team as a day of nobody's. One
 * bad day therefore costs that day's precision and nothing else; the whole
 * thing failing costs the feature and leaves the old behaviour standing.
 *
 * `seed` is a day already read by the caller — `fantasyWatchlist` has the
 * end-of-range roster in hand from the ownership read, so asking ESPN for it a
 * second time would be a 198KB round trip to learn something we were told a
 * millisecond ago, and worse, a second source that could disagree with the
 * chips drawn from the first.
 *
 * `force` is the header's `Refresh from ESPN` reaching this far, and it reaches
 * **only the mutable days** — see `getTeamLineup`. A finished day's lineup
 * cannot have changed since the button was last pressed, so forcing it would
 * spend one ESPN read per day of the range to confirm what the blobs hold.
 */
export async function getTeamRosters(
  creds: EspnCreds,
  teamId: number,
  start: string,
  end: string,
  seed?: { date: string; roster: EspnRosterPlayer[] } | null,
  force = false,
): Promise<Record<string, EspnRosterPlayer[]>> {
  const today = baseballToday();
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  if (dates.length === 0) return {};

  const out: Record<string, EspnRosterPlayer[]> = {};
  if (seed && seed.date >= start && seed.date <= end) out[seed.date] = seed.roster;

  const wanted = dates.filter((d) => !(d in out));
  const resolved = await mapLimit(wanted, LINEUP_CONCURRENCY, async (date) => {
    const period = await lineupPeriodFor(creds, date);
    if (period === null) return null;
    // Strictly before today: the games are played and what you had is frozen.
    return getTeamRoster(creds, teamId, period, date < today, force).catch((err: Error) => {
      console.error(`ESPN roster for ${date} unavailable:`, err.message);
      return null;
    });
  });
  wanted.forEach((date, i) => {
    const roster = resolved[i];
    if (roster) out[date] = roster;
  });
  return out;
}

/** Which MLB ids a day's roster had in its lineup — the `lineups` map
 *  `/api/espn/roster` ships and the `Starters` filter reads, **derived** from
 *  the same per-day read rather than fetched again, so the chips, the filter
 *  and the days a report counts cannot come to disagree about an afternoon. */
export function lineupsFrom(
  byDate: Record<string, EspnRosterPlayer[]>,
): Record<string, number[]> {
  return Object.fromEntries(
    Object.entries(byDate).map(([date, roster]) => [date, startedIds(roster)]),
  );
}

/**
 * A fantasy roster as the app's own watchlist.
 *
 * Players the name match couldn't place are dropped — there is nothing to
 * report on for a prospect who has never appeared in a major-league game — and
 * a two-way player becomes **two entries**, one per kind, which is what the
 * app's `${kind}-${id}` key means and what lets him be read as a hitter and a
 * pitcher separately. Roster order is preserved, so the lineup comes first and
 * the bench and IL follow.
 */
/**
 * A fantasy team over a **range** of days, as the app's own roster plus the days
 * each man was on it.
 *
 * The two halves are the same two `store.ts::getRosterForRange` answers for the
 * saved roster, and for the same reason: which players have a row is one
 * question and which of a player's days count is another. Here the first is the
 * union of every day's roster — including the man you have since dropped, whose
 * Monday you really did earn — and the second is exactly the days he was on it.
 *
 * **Order is today's team first, in its own order** (lineup, bench, IL — what
 * `rosterToWatchlist` has always preserved), then the men who are no longer on
 * it, most-recently-held first. A manager reads his own team down the page and a
 * dropped player is a footnote to it, not an interruption in the middle.
 */
export interface FantasyRosterRange {
  players: WatchPlayer[];
  /** Player key → the days of the range he was on the team. */
  heldDays: Map<string, Set<string>>;
}

export function rostersToWatchlist(
  byDate: Record<string, EspnRosterPlayer[]>,
  current: EspnRosterPlayer[],
): FantasyRosterRange {
  const heldDays = new Map<string, Set<string>>();
  const identity = new Map<string, WatchPlayer>();
  const lastHeld = new Map<string, string>();
  for (const date of Object.keys(byDate).sort()) {
    for (const p of rosterToWatchlist(byDate[date])) {
      const key = `${p.kind}-${p.id}`;
      let days = heldDays.get(key);
      if (!days) {
        days = new Set<string>();
        heldDays.set(key, days);
      }
      days.add(date);
      // The newest spelling of a name wins, the way the live entry does in the
      // saved roster's own history.
      identity.set(key, p);
      lastHeld.set(key, date);
    }
  }

  const players: WatchPlayer[] = [];
  const placed = new Set<string>();
  for (const p of rosterToWatchlist(current)) {
    const key = `${p.kind}-${p.id}`;
    if (!heldDays.has(key) || placed.has(key)) continue;
    placed.add(key);
    players.push(identity.get(key) ?? p);
  }
  const gone = [...heldDays.keys()].filter((k) => !placed.has(k));
  gone.sort((a, b) => (lastHeld.get(a)! < lastHeld.get(b)! ? 1 : -1));
  for (const key of gone) players.push(identity.get(key)!);
  return { players, heldDays };
}

export function rosterToWatchlist(roster: EspnRosterPlayer[]): WatchPlayer[] {
  return roster.flatMap((p) =>
    p.mlbId === null || p.savantName === null
      ? []
      : p.kinds.map((kind) => ({
          id: p.mlbId as number,
          name: p.name,
          savantName: p.savantName as string,
          kind,
        })),
  );
}
