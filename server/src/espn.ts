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

import { toSavantName } from './names.js';
import type { PlayerKind, WatchPlayer } from './types.js';

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

// ---- The MLB name index ---------------------------------------------------

/**
 * A name reduced to what two sources can be expected to agree on: accents
 * stripped, case dropped, punctuation and generational suffixes removed. ESPN
 * writes "Luis Garcia Jr." where MLB writes "Luis García Jr.", and either may
 * carry the period or not.
 */
function normalizeName(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
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
          player?: { id?: number; fullName?: string; proTeamId?: number; injured?: boolean };
        };
      }[];
    };
  }[];
}

async function leagueGet(creds: EspnCreds, views: string[]): Promise<EspnRosterResponse> {
  const url =
    `${FANTASY_BASE}/${SEASON}/segments/0/leagues/${creds.leagueId}` +
    `?${views.map((v) => `view=${v}`).join('&')}`;
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
  /** The fantasy slot he is in *today* — 'SS', 'UTIL', 'SP', 'BE', 'IL'. */
  slot: string;
  slotId: number;
  /** In today's lineup, i.e. not benched and not on the IL. */
  starting: boolean;
  /** ESPN's own injury flag, which is about the real player rather than the
   *  fantasy slot — a manager can leave an injured player in a lineup spot. */
  injured: boolean;
}

export interface EspnOwnership extends EspnLeagueInfo {
  /** MLB player id to the fantasy team id that holds him. */
  owned: Record<number, number>;
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

const ownershipCache = new Map<number, EspnOwnership>();
/** A cold Lambda serving three tabs at once should send one upstream request,
 *  not three — the same rule the research board's own fetches follow. */
const inFlight = new Map<number, Promise<EspnOwnership>>();

export async function getOwnership(creds: EspnCreds, force = false): Promise<EspnOwnership> {
  const key = creds.leagueId;
  const cached = ownershipCache.get(key);
  if (!force && cached && Date.now() - cached.fetchedAt < OWNERSHIP_TTL_MS) return cached;

  const running = inFlight.get(key);
  if (running && !force) return running;

  const job = (async () => {
    const [data, index] = await Promise.all([
      leagueGet(creds, ['mRoster', 'mTeam', 'mSettings']),
      getMlbIndex(),
    ]);
    const info = leagueInfoFrom(creds, data);
    const owned: Record<number, number> = {};
    const rosters: Record<number, EspnRosterPlayer[]> = {};
    let rosterCount = 0;
    let matched = 0;
    for (const team of data.teams ?? []) {
      const roster: EspnRosterPlayer[] = [];
      for (const entry of team.roster?.entries ?? []) {
        const player = entry.playerPoolEntry?.player;
        if (!player?.fullName) continue;
        rosterCount++;
        const found = matchPlayer(index, player.fullName, player.proTeamId);
        if (found) {
          matched++;
          owned[found.id] = team.id;
        }
        const slotId = entry.lineupSlotId ?? BENCH_SLOT;
        roster.push({
          espnId: player.id ?? 0,
          // MLB's spelling where the join succeeded: it is the one the rest of
          // the app shows, and ESPN drops the accents MLB keeps.
          name: found?.name ?? player.fullName,
          mlbId: found?.id ?? null,
          savantName: found ? toSavantName(found.name) : null,
          kinds: found?.kinds ?? [],
          slot: LINEUP_SLOTS[slotId] ?? String(slotId),
          slotId,
          starting: slotId !== BENCH_SLOT && slotId !== IL_SLOT,
          injured: player.injured === true,
        });
      }
      // Lineup first, then the bench, then the IL — the order a manager reads
      // their own team in, and the order the watchlist inherits.
      roster.sort(
        (a, b) => Number(b.starting) - Number(a.starting) || a.slotId - b.slotId,
      );
      rosters[team.id] = roster;
    }
    const result: EspnOwnership = {
      ...info,
      owned,
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
