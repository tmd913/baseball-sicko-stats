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
 *    normalized full name, disambiguated by the club, since ESPN's player
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
import type { PlayerKind, SeasonPlayer, WatchPlayer } from './types.js';
import { readBlob, readJsonBlob, readStampedBlob, writeBlob, writeJsonBlob } from './storage.js';
import { addDays, baseballToday, daysBetween, easternDate } from './etDate.js';
import { mapLimit } from './limit.js';
// The 30-club table every abbreviation in the app is drawn from — 24h cached
// and already fetched for a player's own club badge, so a transactions row's
// `MIL` costs nothing new.
import { getTeamAbbrevs, getTeamNames, kindsOf, majorClubOf, searchPeople } from './mlbStats.js';
import type { SearchPerson } from './mlbStats.js';

// Keep in sync with hfSea in savant.ts, CURRENT_SEASON in percentiles.ts, and
// SEASON in xwoba.ts / pitcherArsenal.ts / teamHitting.ts / expectedStats.ts /
// research.ts.
const SEASON = 2026;

const FANTASY_BASE =
  'https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/** Rosters move whenever anyone in the league makes a move, which is the whole
 *  point of the feature — so this is much shorter than the six hours the
 *  league-wide stat tables settle on. */
const OWNERSHIP_TTL_MS = 10 * 60 * 1000;

/**
 * How long a **moving** league fact is kept — the week being played, the
 * transactions feed, and the league's own running totals.
 *
 * Ten minutes is the right span for a *roster*, which changes when a manager
 * acts; it is far too long for a scoreboard, which changes while games are on
 * and which is the one thing somebody sitting on the League page is watching.
 * Thirty seconds is what makes that page live: the client polls the tab it is
 * showing on the same cadence, so a poll either reads a cache under thirty
 * seconds old or goes and asks.
 *
 * **It was a minute, matched to a minute's poll, and the two stacked.** "Never
 * more than about a minute behind ESPN" was the claim and it was out by a
 * factor of two: a tick every 60s landing on a blob up to 60s old is **up to
 * 120s behind**, and ESPN's board — sampled every 20s across four minutes of
 * live games — moves once a minute, so the reader routinely missed a whole
 * cycle. Halving both windows together puts the worst case at 60s, which is
 * that quantum, so the page can never be more than one of ESPN's own updates
 * behind. The pairing is the load-bearing part: change this without changing
 * `lib.ts::LEAGUE_POLL_MS` and the shorter of the two is wasted.
 *
 * **What this deliberately does not shorten is anything settled.** A finished
 * matchup period and a finished span are facts and are read back off their
 * blobs with no freshness test at all, exactly as before — so the cost of a
 * minute is paid only by the week actually being played, and only while
 * somebody has the page open (`App.tsx::LEAGUE_POLL_MS`, which skips a tick
 * while the tab is hidden).
 */
const LIVE_TTL_MS = 30 * 1000;

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

// The reverse of that table — MLB club id → ESPN club id — used to live here
// for `news.ts`, which read ESPN's per-club article feed. That feed is gone
// (RotoWire's per-player notes replaced it, see `rotowire.ts`) and with it the
// only reader, so the export went too rather than being left as a derivation
// nothing derives anything from. The measurement it carried is worth keeping
// even so: **ESPN's site API numbers its clubs identically to the fantasy
// game's `proTeamId`**, checked club by club against
// `site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams` — all 30 the same,
// 1 BAL … 30 TB — so if anything ever needs the site API again, the table above
// answers for it and no second copy is warranted.

/**
 * ESPN's `lineupSlotId` to the slot a fantasy manager would call it.
 *
 * This is a **different numbering system** from `defaultPositionId` (a player's
 * natural position), which is the trap in ESPN's payload: `1` here is first
 * base and there a starting pitcher.
 */
export const LINEUP_SLOTS: Record<number, string> = {
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
 * **ESPN's three pitching slots: `P`, `SP`, `RP`.** Everything else a league
 * starts is a batting slot, which is the same fail-safe direction the two
 * constants above take — an undocumented slot reads as a place a hitter can
 * stand rather than as nothing.
 *
 * Exported because it is the fact behind *which side of the ball a seat is*,
 * and two files ask it: the projection engine fills batting and pitching seats
 * from separate pools of candidates (`projection.ts::planLineups`), and
 * `seatKinds` below decides which of a two-way player's two rows one seat is
 * about. It was declared in both until the second reader arrived; one table of
 * three numbers is one table.
 *
 * **It was then declared twice more, in this one file**, by two branches that
 * each needed it and landed a day apart — the ownership join's `slotKinds` and
 * the seat test above. That is the same rule failing at a smaller scale, and
 * the detail the second copy carried is worth keeping: everything from `C` (0)
 * to `UTIL` (12), plus the middle-infield group (19), is a place a batter
 * stands, and `BE` (16) and `IL` (17) are where either of them sits and say
 * nothing about which side of the ball a man is on.
 */
export const PITCHING_SLOTS = new Set([13, 14, 15]);

/**
 * **A seat belongs to one side of the ball, and a two-way player fills one seat
 * at a time.**
 *
 * The app's currency is `${kind}-${id}` and a two-way player is **two rows
 * under one id** — Ohtani is a batter row on the batting table and a pitcher
 * row on the pitching one, with a player page each. ESPN's roster is not: in
 * the live league he is *one* entry, eligible at `DH` and `SP`, standing in
 * exactly one slot on any given day. So "he is in the lineup" is a fact about a
 * seat, and the seat says which of his two rows it is a fact about: seated at
 * `UTIL` he is accruing you hits and nothing else, and his pitching row that
 * day is a row you have **not** started.
 *
 * Everybody else is untouched — one kind in, the same one kind out — which is
 * what makes this safe to run over a whole roster rather than only over the
 * two-way men.
 */
export function seatKinds(kinds: PlayerKind[], slotId: number): PlayerKind[] {
  if (kinds.length < 2) return kinds;
  return [PITCHING_SLOTS.has(slotId) ? 'pitcher' : 'batter'];
}

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
export function normalizeName(raw: string): string {
  return stripAccents(raw)
    .toLowerCase()
    .replace(/[.'’]/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface IndexEntry {
  id: number;
  name: string;
  teamId: number | null;
  /** Which board(s) the player belongs to, derived exactly as
   *  `getSeasonPlayers` derives it so a fantasy roster and the watchlist agree
   *  on what a two-way player is: primary-position code `1` is a pitcher, `Y`
   *  is both, anything else is a batter. */
  kinds: PlayerKind[];
  /** His club in MLB's own words, his listed position and his two hands —
   *  filled by the **prospect fallback alone** (`extendIndex`), which is the
   *  only caller that has to be able to describe a player no other list in the
   *  app carries. Absent on an entry off the season's own roster, where all
   *  four are already on `getSeasonPlayers`' row for him. */
  team?: string;
  position?: string;
  bats?: string | null;
  throws?: string | null;
}

export interface MlbIndex {
  /** Normalized name to every MLB player who has it — a list, because the
   *  season roster really does hold three collisions of its own. */
  byName: Map<string, IndexEntry[]>;
  /**
   * The men in `byName` that the **season's major-league list does not hold** —
   * empty on the base index and filled only by `extendIndex`, keyed by MLB id.
   *
   * They are here in `SeasonPlayer` shape because they are exactly the players
   * no other list in the app can name: the client holds `/api/players` from
   * boot for the header search, the details page's fallback and the position
   * lookup, and that list is `sports/1/players` — the same 1,401 rows this
   * index is built from. A prospect is in neither, so the only way he can be
   * searched for or opened is to ride out on the league payload that found him.
   */
  beyond: Map<number, SeasonPlayer[]>;
}

let indexCache: { index: MlbIndex; fetchedAt: number } | null = null;

/**
 * Every player on the season's MLB roster, by normalized name. Its own fetch
 * rather than `getSeasonPlayers`, which resolves a player's club to its full
 * name — this needs the **team id**, since that is the currency the ESPN team
 * table above is written in and a name is one rename away from breaking.
 */
export async function getMlbIndex(): Promise<MlbIndex> {
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
  const index = { byName, beyond: new Map<number, SeasonPlayer[]>() };
  indexCache = { index, fetchedAt: Date.now() };
  return index;
}

// ---- The prospect fallback: a name the season's major leaguers cannot answer

/**
 * **A player who has never appeared in a major-league game was invisible in
 * this app, and the index above is where he was lost.**
 *
 * It is built from `sports/1/players?season={SEASON}` — the season's major
 * leaguers, 1,401 of them — so a prospect on a fantasy roster matched nobody,
 * `toRosterPlayer` gave him `mlbId: null`, and `rosterToWatchlist` dropped him
 * outright. Measured on the live 12-team league on 2026-08-21: **316 roster
 * entries, 311 matched**, and the five that did not were Kade Anderson, Ryan
 * Sloan, Franklin Arias, Jesús Made and Spencer Schwellenbach — four prospects
 * and one major leaguer the season's list has stopped carrying.
 *
 * **MLB knows all five perfectly well**, just not on that list:
 * `people/search?names=…` answers with an id, a club and a position for every
 * one of them (Kade Anderson is 807739, Arkansas Travelers, Seattle's Double-A
 * club). So the fix is a second lookup rather than a second source of truth.
 *
 * **It is consulted only where the index above answers nothing**, which is what
 * makes it incapable of changing an existing match. `docs/claude/espn.md`
 * argues at length that ESPN's minor-league universe is kept *out* of the name
 * index because it "would only add collisions" — and that argument is about
 * putting eleven thousand extra names into the map every join reads. This
 * merges a handful, under keys that were empty, driven by the names an actual
 * roster asked for. A key the season's own list already holds is never touched.
 *
 * **And the ambiguity rule is unweakened.** The search is a *substring* match —
 * `names=Anderson` answers with 49KB of Andersons — so a result is kept only
 * when its own normalized full name equals the key asked for, every survivor is
 * pushed under that key as a candidate, and `matchMlbPlayer` then applies the
 * same two tests it always has: the club decides, and an ambiguity the club
 * cannot resolve is left **unmatched rather than guessed**. Two Wilmer Floreses
 * come back from this endpoint too.
 */
const PROSPECT_BATCH = 40;

/** Normalized name → what the search answered with, or an **empty list** where
 *  it answered with nobody. A miss is remembered exactly as a hit is, so a name
 *  ESPN carries and MLB has never heard of is asked once an hour rather than
 *  once per league read. Cleared with the index it supplements. */
let prospectCache = new Map<string, IndexEntry[]>();
let prospectFetchedAt = 0;
/** One batch in flight per set of names, on the same reasoning `inFlight` is
 *  there for the league read: the per-day fan-out runs six roster parses at
 *  once and six cold ones would ask MLB the same question six times. */
const prospectInFlight = new Map<string, Promise<void>>();

async function resolveProspects(keys: string[]): Promise<void> {
  // The thirty clubs by id, so a prospect's parent organization can be *named*
  // and not merely numbered — see `team` below. Already fetched and 24h cached
  // for every cap logo in the app, so this is a map lookup.
  const [people, teamNames] = await Promise.all([searchPeople(keys), getTeamNames()]);
  const found = new Map<string, IndexEntry[]>();
  for (const p of people) {
    // **Only somebody currently playing.** The search reaches back through
    // every person MLB has ever listed, and a retired homonym cannot be on a
    // fantasy roster but can very easily make a live prospect ambiguous and so
    // cost him his match. All five of the league's unmatched men come back
    // `active: true`.
    if (!p.id || !p.fullName || p.active === false) continue;
    const key = normalizeName(p.fullName);
    // The endpoint matches on substrings, so a row is kept only if it is
    // genuinely the name that was asked for.
    if (!keys.includes(key)) continue;
    const at = found.get(key) ?? [];
    at.push({
      id: p.id,
      name: p.fullName,
      // **The parent club, not the affiliate.** ESPN files a prospect under the
      // major-league organization that owns him, and the club test compares
      // against `ESPN_TO_MLB_TEAM`, which is written in major-league ids — so
      // Kade Anderson's Arkansas Travelers (574) has to read as Seattle (136).
      // A major leaguer the season list has dropped has no parent and his own
      // club id is already the right one.
      teamId: majorClubOf(p.currentTeam),
      kinds: kindsOf(p.primaryPosition?.code),
      /**
       * **The organization that owns him, named** — `Minnesota Twins`, not
       * `St. Paul Saints`.
       *
       * It was the affiliate, on the argument that this is "where he actually
       * is, in MLB's own words … the only honest thing to print beside his name
       * in a search". The flaw in that is that this field is not only printed:
       * it rides on the `SeasonPlayer` the client keys everything off, beside a
       * `teamId` that has always been the **parent** (the line above, and it has
       * to be — `ESPN_TO_MLB_TEAM` is written in major-league ids). So the two
       * halves of one row named two different clubs, and every reader that draws
       * both — the cap over a player page's club door, the team page that door
       * opens — was working from the id while the reader was reading the name.
       * `Arkansas Travelers` beside a Mariners cap is not more honest than
       * `Seattle Mariners`; it is the same row saying two things.
       *
       * Where he actually is has not gone anywhere — his page's News tab prints
       * `St. Paul Saints activated OF Walker Jenkins` off MLB's own feed, which
       * is the place a sentence about an affiliate belongs.
       */
      team: teamNames.get(majorClubOf(p.currentTeam) ?? -1) ?? '',
      position: p.primaryPosition?.abbreviation ?? '',
      bats: p.batSide?.code ?? null,
      throws: p.pitchHand?.code ?? null,
    });
    found.set(key, at);
  }
  // A key with no answer is cached empty, which is what stops it being asked
  // again on the next roster parse a minute later.
  for (const key of keys) prospectCache.set(key, found.get(key) ?? []);
}

/**
 * The index, plus whatever MLB's own search can say about the names in `names`
 * that it could not answer. Returns the index **unchanged** when there is
 * nothing to add — including when the search fails, which costs a prospect his
 * row and never the league read.
 */
export async function extendIndex(index: MlbIndex, names: string[]): Promise<MlbIndex> {
  if (Date.now() - prospectFetchedAt >= INDEX_TTL_MS) {
    prospectCache = new Map();
    prospectFetchedAt = Date.now();
  }
  const asked = new Set<string>();
  const missing = new Set<string>();
  for (const raw of names) {
    const key = normalizeName(raw);
    // `normalizeName` leaves only `[a-z ]`, so a key can never carry the comma
    // the batch is joined on — but the guard is stated rather than assumed,
    // since one that did would silently split into two names that match
    // nobody.
    if (!key || key.includes(',') || index.byName.has(key)) continue;
    asked.add(key);
    if (!prospectCache.has(key)) missing.add(key);
  }
  if (missing.size > 0) {
    const keys = [...missing].sort();
    for (let i = 0; i < keys.length; i += PROSPECT_BATCH) {
      const batch = keys.slice(i, i + PROSPECT_BATCH);
      const flightKey = batch.join(',');
      let job = prospectInFlight.get(flightKey);
      if (!job) {
        job = resolveProspects(batch)
          .catch((err: Error) => {
            // A failure costs these names their rows, not the request: the
            // roster still reads, every major leaguer on it still matches, and
            // the prospect stays exactly as invisible as he was before.
            console.error('MLB people/search unavailable:', err.message);
          })
          .finally(() => {
            prospectInFlight.delete(flightKey);
          });
        prospectInFlight.set(flightKey, job);
      }
      await job;
    }
  }
  const extra = [...asked].filter((k) => (prospectCache.get(k)?.length ?? 0) > 0);
  if (extra.length === 0) return index;
  const byName = new Map(index.byName);
  const beyond = new Map(index.beyond);
  for (const key of extra) {
    const entries = prospectCache.get(key) as IndexEntry[];
    byName.set(key, entries);
    for (const e of entries) {
      beyond.set(
        e.id,
        e.kinds.map((kind) => ({
          id: e.id,
          name: e.name,
          savantName: toSavantName(e.name),
          kind,
          team: e.team ?? '',
          // Already on the entry, and the one field of it a prospect row can
          // fill as fully as a season row does — `resolveProspects` reads the
          // club it was matched to. Null where MLB files him under none.
          teamId: e.teamId,
          position: e.position ?? '',
          bats: e.bats ?? null,
          throws: e.throws ?? null,
        })),
      );
    }
  }
  return { ...index, byName, beyond };
}

/** One row per `${kind}-${id}`, first occurrence winning — the app's own player
 *  key, since a two-way player is two rows under one id and both are wanted. */
function dedupePlayers(players: SeasonPlayer[]): SeasonPlayer[] {
  const seen = new Set<string>();
  const out: SeasonPlayer[] = [];
  for (const p of players) {
    const key = `${p.kind}-${p.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/** Every roster entry's name, which is what `extendIndex` needs to know which
 *  of them the season's own list cannot answer for. */
function rosterNames(teams: EspnRosterResponse['teams']): string[] {
  const names: string[] = [];
  for (const team of teams ?? []) {
    for (const entry of team.roster?.entries ?? []) {
      const name = entry.playerPoolEntry?.player?.fullName;
      if (name) names.push(name);
    }
  }
  return names;
}

/**
 * The MLB player one *outside* source is naming, or null if he isn't a major
 * leaguer this season (most of ESPN's universe isn't).
 *
 * Team first, name second: a club match is decisive, and falling back to the
 * name alone covers the player ESPN still has on his old team the morning after
 * a trade. An ambiguity neither test resolves is left unmatched rather than
 * guessed — marking the wrong Wilmer Flores as owned is worse than marking
 * neither.
 *
 * **Exported because `rotowire.ts` runs the identical join** and a second
 * normalization beside this one is exactly the drift this codebase spends its
 * comments avoiding: one fold, one index, one tie-break rule, two upstreams.
 */
export function matchMlbPlayer(
  index: MlbIndex,
  name: string,
  mlbTeamId: number | undefined,
): IndexEntry | null {
  const candidates = index.byName.get(normalizeName(name));
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const onTeam = candidates.filter((c) => c.teamId === mlbTeamId);
  return onTeam.length === 1 ? onTeam[0] : null;
}

/** The same match phrased in ESPN's own club numbering, which is the currency
 *  every caller in this file has. `rotowire.ts` asks the exported form above
 *  with an MLB club id, since that is the currency *it* can reach. */
function matchPlayer(
  index: MlbIndex,
  name: string,
  espnTeamId: number | undefined,
): IndexEntry | null {
  return matchMlbPlayer(
    index,
    name,
    espnTeamId === undefined ? undefined : ESPN_TO_MLB_TEAM[espnTeamId],
  );
}

// ---- Two ESPN rows, one MLB player ----------------------------------------
//
// **`matchMlbPlayer` declines an ambiguity among the *answers*. It cannot see
// an ambiguity among the *askers*, and that is where Will Smith was lost.**
//
// The season's major-league list holds exactly one Will Smith — the Dodgers'
// catcher, 669257 — so `byName` has one candidate under `will smith` and the
// function returns it on its first line, before the club test is ever reached.
// ESPN's own list holds **two**: the catcher (38309, LAD, eligible at C, 64.25%
// owned) and a free-agent left-hander of the same name (31549, no club,
// eligible at RP, 0.02%). Both ask the index the same question, both are handed
// the catcher, and the pool loop writes `pct`, `eligible` and `slots` under
// 669257 twice — so the **later row wins** and the catcher's board cell read
// `0.0%` with an `RP` pill over it.
//
// It is not one player. Measured over the 3,927-row pool against the 2026
// index: **8 MLB ids are claimed by two ESPN rows each**, and **4 of the 8
// currently answer with the wrong man** — Will Smith (0.02 for 64.25), Fernando
// Cruz (a Cubs infielder's 0.01 and `2B/SS` for the Yankees' reliever, which is
// the very row `docs/claude/espn-players.md` records as "the name-and-club join
// having found the wrong man"), Victor Mesa Jr. (0 for 0.26) and Yunior Marte
// (`SP` for `RP`). The other four happen to be listed in an order that puts the
// right man last, which is not a property anybody should be relying on.
//
// **So the contest is decided on evidence, in the order this file already
// decides everything: the club, then what he plays, then null.** Neither test
// is new and neither is a tie-break — a tie-break would pick a winner where
// there is no reason to prefer one, and this returns null there instead.

/**
 * Which board an ESPN row's own `eligibleSlots` puts him on — the second test,
 * and the same `PlayerKind` vocabulary `IndexEntry.kinds` is written in so the
 * two can be compared directly.
 *
 * Measured across all 3,927 rows of the pool: **not one carries no kind at
 * all**, and 8 carry both (the two-way players, whose index entry says
 * `['batter','pitcher']` and so intersects either way).
 */
function slotKinds(slots: number[] | undefined): PlayerKind[] {
  let pitcher = false;
  let batter = false;
  for (const slot of slots ?? []) {
    if (PITCHING_SLOTS.has(slot)) pitcher = true;
    else if ((slot >= 0 && slot <= 12) || slot === 19) batter = true;
  }
  const kinds: PlayerKind[] = [];
  if (batter) kinds.push('batter');
  if (pitcher) kinds.push('pitcher');
  return kinds;
}

/**
 * Which of several ESPN rows claiming one MLB player is actually him, or null
 * where nothing decides it.
 *
 * **The club first**, exactly as `matchMlbPlayer` does it: the row whose
 * `proTeamId` maps to the club MLB has him on. It resolves **all 8** of the
 * contested ids on the live pool, Will Smith among them — 38309 is on ESPN's
 * team 19, which is MLB's 119, which is where MLB has 669257.
 *
 * **Then what he plays**, which is a genuinely independent test rather than a
 * fallback in name only: driven with the club test disabled, it resolves **4 of
 * the 8** on its own (Will Smith, Edwin Díaz, Fernando Cruz and Carlos
 * Rodriguez — the pairs that are a batter against a pitcher), and it picks the
 * **same row the club test does in all 4**, 0 disagreements. It earns its place
 * on the case the club cannot answer: two rows both off-club is exactly the
 * morning-after-a-trade shape the name-only fallback above exists for, and a
 * catcher is still not a reliever.
 *
 * **Then null.** Two rows on the same club playing the same side of the ball is
 * an ambiguity neither test resolves, and this file's rule is that such a man
 * is left unmatched rather than guessed at. 0 of the 8 reach it today; the
 * cost when one does is a dash in one column, which is what a dash is for.
 */
function claimant<T extends { proTeamId?: number; eligibleSlots?: number[] }>(
  entry: IndexEntry,
  rows: T[],
): T | null {
  const onClub = rows.filter(
    (r) => r.proTeamId !== undefined && ESPN_TO_MLB_TEAM[r.proTeamId] === entry.teamId,
  );
  if (onClub.length === 1) return onClub[0];
  const onKind = rows.filter((r) =>
    slotKinds(r.eligibleSlots).some((k) => entry.kinds.includes(k)),
  );
  return onKind.length === 1 ? onKind[0] : null;
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
/** One row of `players?view=players_wl`, as far as anything here reads it. */
interface PoolRow {
  id?: number;
  fullName?: string;
  proTeamId?: number;
  eligibleSlots?: number[];
  ownership?: { percentOwned?: number };
}

/**
 * One row of that list keyed by **ESPN's own player id** — his name, the MLB id
 * he joined to, the club that join found him on, and the two facts the join is
 * fetched *for*.
 *
 * `pct` and `eligible` are the same numbers `EspnPlayerPool.pct` and
 * `.eligible` carry, filed under the other key. They are here because the name
 * join is not the only way to reach a player: a man on a fantasy roster is
 * named by ESPN's id on both sides of that read, which is an identity rather
 * than a match, and it is the only way to reach one MLB's season list has never
 * heard of. See `getOwnership`, where the five prospects on the live league
 * take exactly that path.
 *
 * `pct` is **null rather than absent** where ESPN published no figure, and
 * `eligible` is an **empty array** rather than absent where he is eligible
 * nowhere the board has a word for: this map is a row per ESPN player and a row
 * that exists is not the same claim as a row that does not.
 */
interface EspnPoolRow {
  name: string;
  mlbId: number | null;
  teamId: number | null;
  pct: number | null;
  eligible: string[];
}

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
  /**
   * **ESPN's own player id → his name, the MLB id he joined to, and the club
   * that join found him on.**
   *
   * The third reading of the same row, and it exists because the league's
   * activity feed names a player by ESPN's id and by nothing else — no name, no
   * club. Filling it here rather than fetching anything is the whole point: it
   * is one more `Map` over rows already parsed and already joined, so the
   * transactions tab costs **no upstream request at all** for its names. Every
   * row is kept, matched or not, since a name is worth having for a player MLB
   * has never listed; `mlbId` is null for him and the row simply is not a link.
   *
   * `teamId` rides along because the join has it in hand — `matchMlbPlayer`
   * answers with the whole `IndexEntry`, whose club is the very field the tie
   * is broken on — and because a transactions row draws the identity block the
   * summary table and the research board draw, which is a cap logo and MLB
   * serves one by id and by nothing else. Null for a player who did not join,
   * which is the same row that has no `mlbId` and so draws no block at all.
   *
   * Checked against a whole season of this league's activity: **376 of 376**
   * distinct ESPN player ids named in it are on this list.
   *
   * It carries the **roster percentage and the eligibility** as well, which is
   * the reading that made it more than the transactions tab's name lookup: a
   * player the MLB season list has never heard of has no key in `pct` or
   * `eligible` above and cannot get one, because those are keyed by an MLB id
   * the name join could not find — but a fantasy roster names him by *ESPN's*
   * id, which is the key here. See `getOwnership`.
   */
  byEspnId: Record<number, EspnPoolRow>;
  /**
   * ESPN's `eligibleSlots` **raw**, by MLB player id — the slot *ids* rather
   * than the names `eligible` above carries.
   *
   * Two readings of one field, and both are wanted. `eligible` is written for
   * the board's position pills, so it is de-duplicated and spelled the way a
   * reader says it (`LF`/`CF`/`RF` all read `OF`); a **lineup** is filled
   * against ESPN's own numbering, where `5` is the OF slot, `12` is UTIL and
   * `19` is the middle-infield one, and the de-duplication that makes the
   * first readable is exactly what makes it unable to answer the second.
   *
   * **It never leaves the server.** `getOwnership` copies `pct` and `eligible`
   * onto the object the client reads and this is not among them, being of use
   * only to `projection.ts` — which is the same rule that keeps the projection's
   * own components off the wire.
   */
  slots: Record<number, number[]>;
  /**
   * **The MLB ids two ESPN rows both claimed** — the set `claimant` arbitrates,
   * whether or not it managed to.
   *
   * It is here because a *baseline* written before that arbitration existed
   * carries the loser's percentage for these men, and nothing in the blob says
   * so. The migration that brought the v1 history forward reads this set and
   * withholds exactly it (see `snapshotKey`), so the list has to be derived from
   * the same join that decides the contest rather than typed out beside it —
   * a hardcoded eight would be eight ids that agreed with the code on the day
   * somebody wrote them down.
   *
   * Measured on the live pool: **8 ids**, of which 3 carry a percentage
   * different enough from the winner's to move a delta at all.
   *
   * **It never leaves the server**, like `slots` above: it answers a question
   * about stored history, not about a player.
   */
  contested: number[];
  /**
   * **The men in this pool that MLB's season list has never carried**, as
   * `SeasonPlayer` rows — and, unlike everything above, a *global* answer
   * rather than a per-league one.
   *
   * `byEspnId` reaches these men by ESPN's own id and was the whole answer for
   * a while, on the reasoning quoted in `espn.md`: extending the name join
   * "would mean asking MLB about three thousand names to answer for five".
   * That is true of the whole pool and false of the part of it anybody
   * **rosters**. Measured on the live pool of 3,929: **2,507 rows** fail the
   * name join, and of those only **37 are more than 0.5% owned** — one
   * `people/search` batch, the same call `extendIndex` already makes, once
   * every six hours for every user of the installation.
   *
   * What that buys is not a name (`byEspnId` had one) but a **key**: with an
   * MLB id these men land in `pct`, `eligible` and `slots` like anybody else,
   * which means they land in the **daily snapshot** the trend is diffed
   * against. The trend was the one thing the ESPN-id route could not give them,
   * and it is the thing a manager sorts by.
   *
   * The rows themselves ride out to the client so the research board can draw a
   * man it has no stat line for — see `POOL_JOIN_FLOOR`.
   */
  beyond: SeasonPlayer[];
}

/**
 * **How much of ESPN's pool is worth a second lookup**, as a rostered
 * percentage.
 *
 * The pool is 3,929 rows and 2,507 of them fail the name join, which is why
 * this file spent a year saying the join could not be extended. Nearly all of
 * that is noise — organizational filler nobody in any league has ever added.
 * Cut by ownership it collapses: **>0% is 790 rows, >0.5% is 37, >1% is 18**.
 *
 * 0.5 is the floor because it is where the deep prospects still are and the
 * long tail is not. Above it: Ryan Pepiot 30.4%, Joe Musgrove 9.5, Spencer
 * Schwellenbach 9.1, Jordan Westburg 8.5, Walker Jenkins 8.4, Corbin Burnes
 * 6.3, Jurickson Profar 4.7 — then the prospects, Jesús Made 2.3, Leo De Vries
 * 1.7, Charlie Condon 1.7, Franklin Arias 1.4, Josue De Paula 1.1, Seth
 * Hernandez 0.99, Sebastian Walcott 0.96, Ryan Sloan 0.80, Eli Willits 0.65.
 * At >1% the last six of those go, and they are precisely the men a `Δ1d` sort
 * is for. Below 0.5 the next name down is 0.49% and the list is 750 long.
 *
 * **It is not two populations.** More than half the list is not a prospect at
 * all but a major leaguer with no 2026 line — season-ending injuries — and the
 * board was missing him for exactly the same reason. A floor written in
 * ownership rather than in status does not have to tell them apart.
 */
const POOL_JOIN_FLOOR = 0.5;

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
    const rows = (await res.json()) as PoolRow[];
    const index = await getMlbIndex();
    const pct: Record<number, number> = {};
    const eligible: Record<number, string[]> = {};
    const slots: Record<number, number[]> = {};
    const byEspnId: Record<number, EspnPoolRow> = {};
    // The join first, once per row — `matchPlayer` is the costly part and the
    // three readings below are the same player either way — and then **who
    // claimed whom**, because a name the index answers with one player can be
    // asked by two ESPN rows. See `claimant` above for the measurement.
    const found = new Map<PoolRow, IndexEntry>();
    for (const row of rows) {
      if (!row.fullName) continue;
      const hit = matchPlayer(index, row.fullName, row.proTeamId);
      if (hit) found.set(row, hit);
    }
    /**
     * **A second pass for the names the season's list cannot answer — but only
     * the ones somebody rosters.**
     *
     * `extendIndex` is the prospect fallback `getOwnership` already runs over a
     * league's roster rows; this runs it over the *pool*, which is what makes
     * the answer global. The objection that stood here — three thousand names
     * to answer for five — is answered by `POOL_JOIN_FLOOR` rather than
     * argued with: 2,507 rows fail the join and 37 of them clear 0.5% owned, so
     * this is **one** `people/search` batch every six hours.
     *
     * **It cannot change a match that already worked.** Only rows `matchPlayer`
     * declined are asked about, `extendIndex` writes only under keys the base
     * index leaves empty, and the ambiguity rule is untouched — a name with two
     * candidates the club cannot separate is *declined* rather than unanswered,
     * so it never reaches this pass at all, and a name this pass finds twice is
     * declined here on the same test.
     */
    const unnamed = rows.filter(
      (r) =>
        r.fullName &&
        !found.has(r) &&
        typeof r.ownership?.percentOwned === 'number' &&
        r.ownership.percentOwned > POOL_JOIN_FLOOR,
    );
    const full =
      unnamed.length > 0
        ? await extendIndex(index, unnamed.map((r) => r.fullName as string))
        : index;
    for (const row of unnamed) {
      const hit = matchPlayer(full, row.fullName as string, row.proTeamId);
      if (hit) found.set(row, hit);
    }
    // **The contest is decided over both passes**, not over the first one: a
    // name the extension answered can be asked by two ESPN rows exactly as a
    // season-list name can, and `claimant` is what settles which of them is
    // him. Built from `found` after both passes for that reason.
    const claims = new Map<number, { entry: IndexEntry; rows: PoolRow[] }>();
    for (const [row, hit] of found) {
      const at = claims.get(hit.id);
      if (at) at.rows.push(row);
      else claims.set(hit.id, { entry: hit, rows: [row] });
    }
    // A contested id is decided on the club and then on what he plays, and the
    // rows that lose are struck out of the join entirely — they must not carry
    // his `mlbId` on `byEspnId` either, or the transactions tab draws the
    // wrong man's cap logo beside the right man's name.
    const rejected = new Set<PoolRow>();
    for (const { entry, rows: claimed } of claims.values()) {
      if (claimed.length === 1) continue;
      const winner = claimant(entry, claimed);
      for (const row of claimed) if (row !== winner) rejected.add(row);
    }
    for (const row of rows) {
      if (!row.fullName) continue;
      const hit = rejected.has(row) ? undefined : found.get(row);
      // The name is kept whether or not he joined, which is the one reading
      // that does not need the join: the activity feed names a player by
      // ESPN's id alone, and a transaction is worth printing for a man MLB has
      // never listed. `mlbId` null is what makes his row not a link.
      const owned = row.ownership?.percentOwned;
      const positions = eligiblePositions(row.eligibleSlots);
      if (typeof row.id === 'number') {
        byEspnId[row.id] = {
          name: row.fullName,
          mlbId: hit?.id ?? null,
          teamId: hit?.teamId ?? null,
          pct: typeof owned === 'number' ? owned : null,
          eligible: positions,
        };
      }
      if (!hit) continue;
      if (typeof owned === 'number') pct[hit.id] = owned;
      if (positions.length > 0) eligible[hit.id] = positions;
      if (Array.isArray(row.eligibleSlots) && row.eligibleSlots.length > 0) {
        slots[hit.id] = row.eligibleSlots;
      }
    }
    const contested = [...claims]
      .filter(([, at]) => at.rows.length > 1)
      .map(([id]) => id);
    // Only the men the extension actually *placed* — `full.beyond` holds
    // everything `extendIndex` has merged this hour, and a name it resolved
    // whose row then lost a contest has no key in `pct` and must not claim one
    // here either.
    const beyond =
      full === index
        ? []
        : [...full.beyond.values()].flat().filter((p) => pct[p.id] !== undefined);
    const pool = { pct, eligible, slots, byEspnId, contested, beyond };
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
// **One exception, and it is a bootstrap rather than a second measurement.** The
// league board *does* honor `filterIds` when a `limit` and a sort ride with it —
// three ids in 10KB — and a man the extended join has only just reached has no
// snapshot at all, so for him the choice is not between two measurements but
// between one and a dash. `getOwnershipChange` reads that figure for exactly
// those men and only to supply the **missing day-back baseline**, for the 1D
// window alone; the delta is still this function's own arithmetic, and it is
// entirely ours again the following morning. The window is no longer
// undocumented either — measured against ours over 118 men, slope **0.944**.
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
export const TREND_DRIFT: Record<TrendWindow, number> = { 1: 0, 3: 1, 7: 2, 15: 3, 30: 5 };

/** The furthest back any window can reach, and so how much history a snapshot
 *  has to survive to be useful. Nothing prunes these blobs — the cache bucket's
 *  lifecycle rule expires the whole `cache/` prefix at 400 days, an order of
 *  magnitude past this — so the only thing that ever limited the history was
 *  this constant, which used to be 14. */
export const TREND_MAX_DAYS = 30 + TREND_DRIFT[30];

/**
 * **`-v2` because the meaning of eight of these numbers changed, not their
 * shape.** The blob is still a map of MLB id to percentage; it is that for
 * eight ids the percentage stored under a v1 key is **the wrong player's** —
 * see `claimant` above, where two ESPN rows claiming one MLB id used to be
 * settled by array order.
 *
 * A baseline is subtracted from today's map, so a corrected value against an
 * uncorrected baseline reads as a *move*. Driven on the live league before this
 * bump: Will Smith's page showed `Rostered 64.2%` — right — over `1d ▲64.2 ·
 * 3d ▲64.2 · 7d ▲64.2`, a man who had not moved at all reported as the largest
 * riser in baseball, and he would have gone on being one on the 30D column for
 * a month. Three ids do this (Will Smith +64.22, Fernando Cruz +4.31, Victor
 * Mesa Jr. +0.26; Yunior Marte's two rows both read 0, so his correction is
 * invisible).
 *
 * The alternative was to leave it, on the grounds that a bump **deletes 1,376
 * players' history to hide three rows**. It was rejected because those three
 * rows do not sit quietly: the trend columns sort, and one tap puts a
 * fabricated ▲64.2 at the top of every one of them. The cost is the shape this
 * file already describes and already handles — `getRosterTrend` returns null
 * with no baseline at all, so the columns simply are not there, and they come
 * back one at a time as the history rebuilds: 1D tomorrow, 3D in three days,
 * 30D in a month. Nothing prunes the v1 blobs; the cache bucket's 400-day
 * lifecycle is the only expiry, which is the rule the rest of this file writes
 * under.
 *
 * **`-v3` because the meaning changed again, and this time in the other
 * direction.** The v2 bump above accepted the loss of 1,376 players' history to
 * hide three fabricated risers. That trade was right on the day and got worse
 * every day after it: the three rows are eight ids out of 1,393, and the price
 * was every column on the board for up to a month. So the v1 blobs were brought
 * forward — the same numbers under a v3 key, with **the contested ids set to
 * `null` rather than dropped**.
 *
 * `null` and not absence, because absence already means something here and
 * means the opposite of this: `diffAgainst` reads a player missing from the
 * baseline as having *risen from nothing*, which is how a call-up shows his real
 * percentage instead of a blank cell. Dropping Will Smith from a baseline would
 * have re-created his ▲64.2 by that route rather than fixing it. So the withheld
 * ids are stored explicitly, `diffAgainst` passes the `null` through, and the
 * client draws a dash in that column for that man — the one shape in this app
 * that means "nothing here knows", which is the truth about him.
 *
 * A version rather than a quiet rewrite of the v2 blobs, on this file's own
 * rule that a version guards **the meaning** of what is stored: v2 code reading
 * a `null` would fail the `typeof was === 'number'` test, fall through to zero
 * and resurrect the exact riser this is undoing. Under v3 it never sees one.
 * The v1 blobs are left where they are — the migration only ever wrote new
 * keys, so undoing it is deleting them.
 */
const snapshotKey = (date: string) => `espn-ownership-${date}-v3.json`;

/**
 * Store today's map, once **per player**.
 *
 * Write-once was the rule for the whole blob, on the grounds that a baseline
 * which crept toward the current value would shrink every delta measured
 * against it as the day went on, for no reason a reader could see. That
 * reasoning is about a value being **rewritten**, and it is untouched: an id
 * already in the blob is never touched again.
 *
 * What it now also does is **fill in an id the blob does not have**, which is a
 * different act with the opposite consequence. A man reached for the first time
 * — because `POOL_JOIN_FLOOR` let him into the join today, or because ESPN
 * listed him this afternoon — is absent from a blob written this morning, and
 * under the old rule he stayed absent from it for good. `diffAgainst` then
 * withholds him for a full extra day: measured on the local history, today's
 * `2026-08-28` blob holds **1,411** ids and none of the 32 the extended join
 * reached, so tomorrow's 1D column would have read them off a baseline that
 * still could not name them and drawn a second day of dashes.
 *
 * Filling him in writes his current percentage as his baseline, which is what
 * every other player's blob entry is: the value as of the first read of the day
 * that could see him. His first delta understates by however much he moved
 * before that read — one afternoon at most, once, and only for a man who had no
 * delta at all under the alternative.
 */
async function snapshotRosterPct(pct: Record<number, number>): Promise<void> {
  const key = snapshotKey(baseballToday());
  const raw = await readBlob(key);
  if (raw === null) {
    await writeBlob(key, JSON.stringify(pct));
    return;
  }
  let stored: Record<number, number | null>;
  try {
    stored = JSON.parse(raw) as Record<number, number | null>;
  } catch {
    // A malformed blob is one `readSnapshot` skips the day for anyway; rewriting
    // it whole is the repair, and today's map is exactly what it should hold.
    await writeBlob(key, JSON.stringify(pct));
    return;
  }
  let added = 0;
  for (const [id, v] of Object.entries(pct)) {
    // `in`, not truthiness: a withheld id is stored as an explicit `null` and
    // filling it would resurrect the very delta that null exists to suppress.
    if (id in stored) continue;
    stored[id as unknown as number] = v;
    added++;
  }
  if (added > 0) await writeBlob(key, JSON.stringify(stored));
}

/** A stored baseline. A `null` value is a **withheld** id — see `snapshotKey`;
 *  it is not the same as an absent one, which `diffAgainst` reads as a rise
 *  from nothing. */
async function readSnapshot(date: string): Promise<Record<number, number | null> | null> {
  const raw = await readBlob(snapshotKey(date));
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as Record<number, number | null>;
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

/** Today's map less a baseline, for every player on today's.
 *
 *  Rounded to a tenth, which is the precision the figure is published at;
 *  without it floating-point noise gives half the league a "trend". Zeroes are
 *  dropped, so the client reads "absent but has a roster %" as flat rather than
 *  unknown.
 *
 *  **A player missing from the baseline rose from nothing**, and his whole
 *  current percentage is the delta. That reverses what this did — he used to be
 *  excluded outright, on the reasoning that treating him as rising from zero
 *  "would put every newly-added prospect at the top of the risers". The
 *  reasoning was wrong twice. It is wrong about the *fact*: ESPN's list is the
 *  active major-league population, so a man who is on today's and not on
 *  yesterday's genuinely was rostered nowhere yesterday, and his whole
 *  percentage is the movement — Joshua Baez played his first game on
 *  2026-08-15 and went to **24.1%** by the evening, and the board drew him a
 *  blank cell in every one of the five windows. And it is wrong about the
 *  *volume*, measured through this function against the live map rather than
 *  feared: the players on it and not on a baseline's are **7 / 10 / 16** over
 *  the 1d, 3d and 5d spans the local history can serve, of which **3 / 5 / 8**
 *  carry a percentage that rounds to anything at all — the rest are 0.00 to
 *  0.02 and are dropped as flat — and the largest of them is Baez himself.
 *  There is no flood to guard against, and the two or three men there are, are
 *  exactly the ones a reader opens this column for.
 *
 *  A player at 0% today who is missing from the baseline is a change of 0 and
 *  is dropped like any other flat row, so nothing is added to the wire for the
 *  arrivals nobody has picked up.
 *
 *  **A player the baseline holds as `null` is withheld rather than measured**,
 *  and passes through as a `null` on the wire — the one value here that is not
 *  a number and does not mean zero. It is how a migrated v1 baseline says "the
 *  percentage I hold for this man is the other man's" without the absence above
 *  reading it as a rise from nothing. See `snapshotKey`. Nothing writes one
 *  today; the migrated blobs for 2026-08-10 … -08-20 are the only source, and
 *  the last of them leaves the 30D band on 2026-09-25, after which no baseline
 *  in play carries a null and the client stops seeing one.
 *
 *  What it still cannot do is tell "he was rostered nowhere" from "ESPN had not
 *  listed him yet", and it does not need to: both are the same claim about the
 *  same man. A baseline that were somehow *truncated* would invent a rise for
 *  everybody it lost — but a truncated blob is a malformed one, which
 *  `readSnapshot` fails to parse and skips the day for entirely.
 *
 *  **`extended` is the exception, and it is the one case where absence is about
 *  us rather than about him.** The paragraph above rests on ESPN's list being
 *  the active major-league population, so that a name arriving on it is a
 *  call-up. It stopped being the whole story when `getPlayerPool` began
 *  extending its own join over `POOL_JOIN_FLOOR`: those men were rostered at
 *  the same percentage yesterday and every day before it, and the only thing
 *  that changed is that this app can now *name* them. Left to the rule above,
 *  the deploy that reaches them would print each one a rise equal to his whole
 *  percentage in all five windows — measured, before this guard: Walker Jenkins
 *  at the top of the `Δ1d` sort with `+8.4 +8.4 +8.4 +8.4`, which is the
 *  fabricated riser `snapshotKey`'s two version notes are both about, arriving
 *  by a third route and sitting there for up to thirty days.
 *
 *  So for an id in `extended`, an absent baseline is **withheld** rather than a
 *  rise: `null` on the wire, a dash in the cell, the app's one shape for
 *  *nothing here knows*. It self-heals without a version bump and without
 *  costing anybody else a column — the first snapshot written after the deploy
 *  carries these men, so 1D is real tomorrow, 3D in three days, 30D in a month,
 *  and every other player on the board is untouched throughout. A genuine
 *  call-up inside that set loses his first day's rise to a dash, which is the
 *  direction every join in this file fails in. */
function diffAgainst(
  current: Record<number, number>,
  base: Record<number, number | null>,
  extended: Set<number>,
): Record<number, number | null> {
  const delta: Record<number, number | null> = {};
  for (const [id, pct] of Object.entries(current)) {
    const key = id as unknown as number;
    if (!(key in base) && extended.has(Number(id))) {
      delta[Number(id)] = null;
      continue;
    }
    // `in` rather than a truthiness test on the value: a withheld id is stored
    // as an explicit `null`, and the whole point of storing it is that it is
    // present. `base[key] === null` alone would answer the same today and stop
    // answering the moment anything writes an absent key as undefined.
    if (key in base && base[key] === null) {
      delta[Number(id)] = null;
      continue;
    }
    const was = base[key];
    const change = Math.round((pct - (typeof was === 'number' ? was : 0)) * 10) / 10;
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
   *  rather than assumed because the header says it: a column labeled "7d"
   *  that measured five days would be a lie the reader has no way to catch. */
  days: number;
  /** Change in roster % per MLB player id over `days`.
   *
   *  **Absent, `null` and `0` are three different answers.** Absent is flat —
   *  zeroes are dropped to keep the blob small, and the client fills them back.
   *  `null` is *withheld*: the baseline for this man is known to be the wrong
   *  player's, so nothing here knows how he has moved, and the client draws a
   *  dash rather than a number. See `snapshotKey` for where nulls come from and
   *  when they stop. */
  delta: Record<number, number | null>;
}

/** One entry per window that had a usable baseline, ascending. A window with
 *  none is **absent** rather than present and empty: the client removes that
 *  column entirely, since a column of zeroes reads as "nobody is moving", which
 *  is a claim where the truth is an absence. */
export type RosterTrend = RosterTrendWindow[];

// ---- Day one, for a man the map has only just learned to name --------------

/**
 * **ESPN's own published change in roster %, by ESPN player id.**
 *
 * This file's opening argument about the trend is that **the delta is ours,
 * not ESPN's** — their `percentChange` rides only on payloads the app cannot
 * justify, and their window is undocumented. Both halves of that are still
 * true and it is still ours for all 1,400 men the snapshot can name. What
 * changed is that a handful of men have **no snapshot at all** on the day the
 * extended join first reaches them, and for exactly those the choice is not
 * between two measurements but between one and a dash.
 *
 * **The payload is affordable because the request names the players.** The
 * cookie-free season-wide `players?view=kona_player_info` ignores an
 * `x-fantasy-filter` outright — probed, **211,301,476 bytes** and 23,390 rows
 * with `filterIds` set — but the **league** endpoint honors it, and it is the
 * one this app already reads with the user's cookies. `filterIds` alone is a
 * 400 (`Filter: Limit request must be accompanied by a sort`); with a `limit`
 * and a `sortPercOwned` beside it, three ids come back in **10,008 bytes** and
 * sixty in 360KB. `players_wl` is leaner still (805 bytes for three) and
 * carries no `percentChange` at all, which is what sends this to the heavier
 * view.
 *
 * **What it measures, in numbers rather than in trust.** Driven against the
 * live league over the 118 men this app holds a same-day delta for, ESPN's
 * figure regressed on ours gives a slope of **0.944** — the same quantity,
 * same sign, same units, on a window anchored differently: theirs rolls back
 * from now, ours runs from the first read of the previous baseball day. On the
 * 49 men who moved more than a point, the ratio is typically 0.86–0.93 (Grant
 * Holmes 7.85 against 8.4, Michael Wacha 3.52 against 3.8, Shane McClanahan
 * 4.09 against 4.4). At the top of the sort — which is the whole of what this
 * is for — the two agree closely; the widest disagreements are on men moving
 * hundredths, where our own tenth-rounding is the larger term.
 *
 * **It is a global fact fetched with one reader's cookies**, which is the one
 * uncomfortable part and is stated rather than hidden. `percentChange` is
 * ESPN's league-wide figure and does not vary by who asks; the cookies are the
 * entry ticket to an endpoint, not a parameter of the answer. So it is cached
 * globally like the pool it patches, on the pool's own six-hour TTL, and
 * whichever connected league is read first in a window pays for it. A reader
 * with no league connected sees no trend column at all, so there is nobody the
 * cache could serve who could not have filled it.
 */
const CHANGE_TTL_MS = ROSTER_PCT_TTL_MS;

/** A ceiling on how many ids one request may name, so a floor that one day
 *  admits far more men cannot quietly turn this into the 211MB read. It is
 *  four times today's 32 and **says so when it bites** rather than truncating
 *  in silence. */
const MAX_CHANGE_IDS = 128;

interface KonaPlayersResponse {
  players?: { player?: { id?: number; ownership?: { percentChange?: number } } }[];
}

let changeCache: { by: Map<number, number>; key: string; fetchedAt: number } | null = null;
const changeInFlight = new Map<string, Promise<Map<number, number>>>();

async function getOwnershipChange(
  creds: EspnCreds,
  espnIds: number[],
): Promise<Map<number, number>> {
  const asked = espnIds.slice(0, MAX_CHANGE_IDS).sort((a, b) => a - b);
  if (asked.length < espnIds.length) {
    console.warn(
      `ESPN ownership change: ${espnIds.length} ids over the ${MAX_CHANGE_IDS} cap, ` +
        `${espnIds.length - asked.length} left without a day-one delta`,
    );
  }
  const key = asked.join(',');
  if (changeCache && changeCache.key === key && Date.now() - changeCache.fetchedAt < CHANGE_TTL_MS) {
    return changeCache.by;
  }
  const running = changeInFlight.get(key);
  if (running) return running;
  const job = (async () => {
    const data = await leagueGet<KonaPlayersResponse>(creds, ['kona_player_info'], null, {
      players: {
        filterIds: { value: asked },
        // Both required together — the filter is a 400 without the sort, and the
        // sort does nothing without the limit. Which sort is immaterial; every
        // row asked for comes back.
        limit: asked.length,
        offset: 0,
        sortPercOwned: { sortAsc: false, sortPriority: 1 },
      },
    });
    const by = new Map<number, number>();
    for (const row of data.players ?? []) {
      const id = row.player?.id;
      const change = row.player?.ownership?.percentChange;
      if (typeof id === 'number' && typeof change === 'number') by.set(id, change);
    }
    changeCache = { by, key, fetchedAt: Date.now() };
    return by;
  })().finally(() => {
    changeInFlight.delete(key);
  });
  changeInFlight.set(key, job);
  return job;
}

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
export async function getRosterTrend(creds?: EspnCreds): Promise<RosterTrend | null> {
  const today = baseballToday();
  // The pool rather than the wrapper, because the men its **extended** join
  // reached need to be told apart from a call-up when a baseline lacks them —
  // see `diffAgainst`. It is the same one fetch and the same six-hour cache
  // `getRosterPct` is a thin reading of.
  const pool = await getPlayerPool();
  const current = pool.pct;
  const extended = new Set(pool.beyond.map((p) => p.id));
  await snapshotRosterPct(current).catch((err: Error) =>
    console.error('ESPN ownership snapshot failed:', err.message),
  );

  /**
   * **A baseline for the men who have none, so their `Δ1d` is a number today
   * rather than tomorrow.**
   *
   * The withhold rule in `diffAgainst` is right and this does not weaken it:
   * absence still is not read as a rise from nothing. What it does is *supply
   * the missing day* — `was = now − ESPN's own change` — so the delta this
   * function then computes is its own arithmetic over a baseline that has a
   * source, rather than a guess about one that does not exist.
   *
   * **The 1D window only, because one change figure is one day.** ESPN
   * publishes a single `percentChange`; measured against ours it is a day's
   * movement (slope 0.944 — see `getOwnershipChange`), so it can stand in for
   * the day-back baseline and for nothing else. 3D and out stay withheld until
   * real history reaches them, which is three days and out.
   *
   * **It lasts one day per player.** Tomorrow the snapshot written this
   * morning is the 1D baseline and the figure is entirely ours again, so this
   * is a bootstrap rather than a second measurement living permanently in one
   * column.
   *
   * A failed read costs the seed and nothing else: the men fall back to the
   * dash they would have had, every other player's five columns are untouched,
   * and no error reaches the caller. Absent `creds` — the nightly warmer, which
   * exists to write the snapshot rather than to answer anybody — skips it
   * entirely.
   */
  const espnByMlb = new Map<number, number>();
  for (const [espnId, row] of Object.entries(pool.byEspnId)) {
    if (row.mlbId !== null && extended.has(row.mlbId)) espnByMlb.set(row.mlbId, Number(espnId));
  }
  let seed: Map<number, number> | null = null;
  if (creds && espnByMlb.size > 0) {
    const by = await getOwnershipChange(creds, [...espnByMlb.values()]).catch((err: Error) => {
      console.error('ESPN ownership change unavailable:', err.message);
      return null;
    });
    if (by) {
      seed = new Map<number, number>();
      for (const [mlbId, espnId] of espnByMlb) {
        const change = by.get(espnId);
        const now = current[mlbId];
        if (typeof change === 'number' && typeof now === 'number') seed.set(mlbId, now - change);
      }
    }
  }

  const resolved = await Promise.all(
    TREND_WINDOWS.map(async (window): Promise<RosterTrendWindow | null> => {
      for (const days of baselineOrder(window)) {
        const stored = await readSnapshot(daysAgo(today, days));
        if (!stored) continue;
        let base = stored;
        if (window === 1 && seed) {
          // Copied, and **only where the day genuinely holds nothing**: a
          // stored value is the real thing and an explicit `null` is a withheld
          // one, and overwriting either would be the baseline-creep this file
          // refuses everywhere else.
          const filled = { ...stored };
          let any = false;
          for (const [id, was] of seed) {
            if (id in filled) continue;
            filled[id] = was;
            any = true;
          }
          if (any) base = filled;
        }
        return { window, days, delta: diffAgainst(current, base, extended) };
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
  settings?: {
    name?: string;
    size?: number;
    /** How many of each lineup slot this league starts — ESPN's slot id to a
     *  count, `{"0":1,"4":1,"5":4,"13":5,"16":3,"17":5,…}`. It arrives with
     *  `mSettings`, which the roster read already asks for, so reading it costs
     *  nothing; see `lineupSlotsFor`. */
    rosterSettings?: { lineupSlotCounts?: Record<string, number> };
  };
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

async function leagueGet<T = EspnRosterResponse>(
  creds: EspnCreds,
  views: string[],
  scoringPeriodId?: number | null,
  // ESPN's own server-side narrowing, sent as a header rather than a query
  // param. Only the scoreboard uses it, and it earns its place there: asking
  // for one matchup period rather than the season's 118 takes the read from
  // 524KB to 24KB, and ESPN does the filtering rather than the wire.
  filter?: unknown,
  // A sub-path under the league. Only the activity feed uses one
  // (`/communication/`), and it is the same league, the same cookies and the
  // same error handling — so it is a segment on this function rather than a
  // second fetch beside it with its own copy of the 401 rule.
  path = '',
): Promise<T> {
  const url =
    `${FANTASY_BASE}/${SEASON}/segments/0/leagues/${creds.leagueId}${path}` +
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
      ...(filter === undefined ? {} : { 'X-Fantasy-Filter': JSON.stringify(filter) }),
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
  const body = (await res.json()) as T | T[];
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
 * **The day whose scoring period carries ESPN's roster as it stands right now**
 * — which is *tomorrow*, not today, and the reason is a fact about how ESPN
 * books a transaction rather than anything about our own calendar.
 *
 * **A move made after about 1pm ET takes effect from the *next* scoring
 * period.** Measured on the live 12-team league against its own activity feed,
 * which stamps every topic with an instant, by reading `mRoster` at four
 * consecutive periods and asking which one each move first shows up in:
 *
 * | move | when (ET) | 144 | 145 | 146 | 147 |
 * | --- | --- | --- | --- | --- | --- |
 * | add of 4417208 | 08-16 11:27 | — | **12** | — | — |
 * | add of 34973 | 08-16 19:55 | — | — | **1** | 1 |
 * | drop of 34984 | 08-16 19:55 | 1 | 1 | **—** | — |
 * | drop of 36071 | 08-16 14:32 | 6 | 6 | **—** | — |
 * | add of 32667 (Gausman) | 08-17 22:30 | — | — | — | **1** |
 * | drop of 4872649 | 08-17 22:22 | 1 | 1 | 1 | **—** |
 *
 * Period 145 is 08-16 and 146 is 08-17, so the 11:27 add lands on its own day
 * and everything after 1pm lands on the day after — the same 13:00 ET boundary
 * `acquisitionLimitFor` already measures for the acquisition *counter*, here
 * deciding the roster itself.
 *
 * **So asking for today's period answers with a roster that is stale from
 * lunchtime onwards.** That is not a small-hours edge case: with our own day
 * turning at 3am ET it is about fourteen hours in twenty-four during which a
 * player somebody has just picked up still reads as a free agent, everywhere
 * ownership is drawn — the research board's free-agent set, the padlock, the
 * roster baseball, `players` on `/api/espn/roster`. It is what "Kevin Gausman
 * was added today and still shows as a free agent" was.
 *
 * **Tomorrow's period is the fix and costs nothing**, because a future period
 * returns ESPN's *current* roster — the file has measured that since the
 * `Tomorrow` preset was written ("periods 141 through 200 carry the same 28
 * players as today"), and what the table above sharpens is that "current" means
 * *including the moves booked forward*, which today's period does not. It is
 * one entry rather than one per user for the same reason today's was: every
 * member of a league resolves the same tomorrow.
 *
 * A date **beyond** tomorrow is left alone — it reads its own period, which
 * answers with this same roster anyway — and `lineupPeriodFor` takes the date
 * unclamped throughout, because the per-team, per-day read below is precisely
 * the one that wants a *day's* answer rather than the freshest one.
 */
export function liveRosterDay(): string {
  return addDays(baseballToday(), 1);
}

/**
 * Which **calendar day** the caller wants, for the reads that may only ever
 * look forward. Clamped at `liveRosterDay()` — see above for why that is
 * tomorrow.
 *
 * Exported because `fantasyWatchlist` seeds the per-day roster map with the
 * array this read answered with, and a seed filed under the wrong day is the
 * one way this change could put tomorrow's lineup under today's chips.
 */
export function ownershipDay(date: string | null | undefined): string {
  const live = liveRosterDay();
  const day = validDate(date);
  return day === null || day <= live ? live : day;
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

/**
 * One point on the line: this period held that ET calendar date. It is what the
 * whole 0.81MB schedule reduces to, and it is one fact again.
 *
 * It carried a second for a while — the **All-Star break**, the longest run of
 * gameless scoring periods in the season, which the Rankings tab's two halves
 * used to be cut on. Those halves are an even division by matchup period now
 * (`halvesOf`), so nothing reads the break and nothing derives it: a field
 * nobody reads is a field nobody misses, the rule `teamProbablePitcher`'s
 * removal already sets.
 */
interface PeriodAnchor {
  period: number;
  date: string;
}

/**
 * The pro schedule is **static for the season and takes no cookies at all** —
 * checked, 200 with no `Cookie` header, 850,891 bytes — so this is one read
 * shared by every league and every user, exactly as `getPlayerPool` is. It is
 * the 0.81MB that is not worth holding: what gets cached is the **67-byte**
 * pair it reduces to, which is why the storage key is by season and the
 * freshness window is measured in weeks rather than hours.
 *
 * **The key stays at `-v2` although the shape has shrunk back to the pair.**
 * That bump was the All-Star break joining it, and the break has since gone
 * (`PeriodAnchor`); a stored v2 blob carrying the two extra numbers
 * deserializes into this shape with them ignored, where the hazard a version
 * guards against is the opposite one — a field arriving *missing*. Bumping
 * would only spend the 850KB again to learn the same pair.
 */
const anchorBlobKey = (season: number) => `espn-period-anchor-${season}-v2.json`;
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
    for (const [id, list] of Object.entries(team.proGamesByScoringPeriod ?? {})) {
      const period = Number(id);
      if (!Number.isInteger(period) || period < 1) continue;
      for (const game of list ?? []) {
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
 * agree and is the behavior this file had for its whole life; the point of the
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
   *  'SP', 'BE', 'IL'. Whichever day that is, is the caller's business: the
   *  league-wide read answers for today or a future day, and `getTeamRoster`
   *  answers for any day of the season, past ones included. See **Which day's
   *  lineup** above. */
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
   * Carried raw rather than pre-labeled, the way `RosterStatus` carries MLB's
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
    // it is normalized to null here rather than filtered at every read site.
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
  /**
   * The league's rostered players **that `/api/players` does not carry** — the
   * prospects, resolved by `extendIndex` against MLB's own search.
   *
   * It rides here for the reason `rosterPct` and `eligibility` do: this is the
   * call a connected client already makes, and the gate is the same — having a
   * league. It could not have gone on `/api/players`, which is the season's
   * major-league roster, cached per season and served to every user alike;
   * whose minor leaguers are worth naming is a fact about a *league*.
   *
   * The client merges it into that list, which is what makes a prospect
   * findable in the header search and openable as a player page at all. Five
   * rows on the live 12-team league, ~600 bytes.
   */
  beyondMlb: SeasonPlayer[];
  /**
   * **The ids whose roster % has no baseline behind it**, so the client can
   * withhold their trend instead of drawing five flat zeroes for a man nothing
   * here knows about.
   *
   * A percentage reaches a player two ways. Almost all of them are in the
   * **global** pool map, which is what the daily snapshot is taken of, so a
   * delta against it is real. The rest are men *this* league rosters who are
   * under `POOL_JOIN_FLOOR` — reached by ESPN's own player id off this league's
   * roster rows, present in no day of the global map and never going to be.
   * This is that second set.
   *
   * It is a field rather than something the client derives off `beyondMlb`,
   * which is what it used to be: that list is now mostly men who **do** have a
   * trend, and deriving the suppression from it would blank the very columns
   * the pool's extended join exists to fill.
   */
  noTrend: number[];
  /** How many roster entries were read, and how many of them found an MLB
   *  player. The gap used to be almost entirely prospects who have never played
   *  a major-league game and is now almost nothing (**316 read, 316 matched**
   *  on the live league, against 311 before `extendIndex`), which makes it a
   *  sharper instrument than it was: it is reported so a bad *season* (an index
   *  for the wrong year matches nobody) is visible rather than silently
   *  emptying the filter. */
  rosterCount: number;
  matched: number;
  fetchedAt: number;
}

/**
 * Keyed by league **and scoring period**, not by league alone: a lineup is a
 * fact about a day, so two days are two answers. The key for the *live* day —
 * `liveRosterDay()`, which every at-or-before-today request clamps onto — is
 * the league's own id with no period on it, which is what keeps the blob every
 * user of a league shares (the free-agent set, the roster %, the trend) one
 * entry rather than one per person's date range.
 */
const cacheKey = (leagueId: number, period: number | null) =>
  period === null ? `${leagueId}` : `${leagueId}:${period}`;

/**
 * **How many of each lineup slot a league starts**, by league id — `{0: 1, 4: 1,
 * 5: 4, 12: 1, 13: 5, 14: 2, 15: 2, 16: 3, 17: 5, 19: 1}` on the live one, which
 * is eleven batting slots, nine pitching, three bench and five IL.
 *
 * **Filled as a side effect of the roster read rather than fetched**, which is
 * the whole reason it is a module cache and not a field on `EspnOwnership`.
 * `mSettings` is already one of the three views that read asks for, so the
 * counts are sitting in a payload the app has in hand; giving them a read of
 * their own would be a second request for a fact already downloaded, and
 * putting them on the ownership object would put them on the **wire**, where
 * the only caller is `projection.ts` and nothing on the client has ever asked.
 *
 * Null until a league's rosters have been read once, which on every path that
 * wants it has already happened — `getProjection` awaits `getOwnership` before
 * it projects anything.
 */
const lineupSlotCache = new Map<number, Record<number, number>>();

/** The lineup shape for a league, or null where no roster read has landed yet
 *  or the league published none. **Null is a real answer** and the projection
 *  treats it as one: with no slot counts it cannot know what a lineup holds, so
 *  it falls back to the rule it always had. */
export function lineupSlotsFor(leagueId: number): Record<number, number> | null {
  return lineupSlotCache.get(leagueId) ?? null;
}

const ownershipCache = new Map<string, EspnOwnership>();
/** A cold Lambda serving three tabs at once should send one upstream request,
 *  not three — the same rule the research board's own fetches follow. */
const inFlight = new Map<string, Promise<EspnOwnership>>();

/**
 * `date` is the day the caller wants the **lineup** for — the last day of the
 * range the roster views are reporting on. Today and anything before it read
 * the *live* period, which is tomorrow's; see `liveRosterDay` above for the
 * measurement that says so and for what asking today's period got wrong.
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
  // the **key** wants the day and the **request** wants the period: the live
  // day's entry keeps the bare league id, so the map every member of a league
  // shares stays one entry, while the request still names the period rather
  // than letting ESPN's own pointer answer — which is today's, and so is
  // missing every move made since about 1pm (see `liveRosterDay` above).
  const day = ownershipDay(date);
  const period = await periodFor(creds, day);
  const key = cacheKey(creds.leagueId, day === liveRosterDay() ? null : period);
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
        // Stated in full rather than cast: `byEspnId` is read below, and an
        // `as` here is how a failed upstream becomes a thrown property access
        // on the one path this catch exists to keep standing.
        const empty: EspnPlayerPool = {
          pct: {},
          eligible: {},
          slots: {},
          byEspnId: {},
          contested: [],
          beyond: [],
        };
        return empty;
      }),
      getRosterTrend(creds).catch((err: Error) => {
        console.error('ESPN roster trend unavailable:', err.message);
        return null;
      }),
    ]);
    // The league's lineup shape, off the `mSettings` half of the read that has
    // just landed — see `lineupSlotsFor` for why it is stashed here rather than
    // returned.
    const counts = data.settings?.rosterSettings?.lineupSlotCounts;
    if (counts && typeof counts === 'object') {
      const parsed: Record<number, number> = {};
      for (const [id, n] of Object.entries(counts)) {
        const slot = Number(id);
        if (Number.isFinite(slot) && typeof n === 'number' && n > 0) parsed[slot] = n;
      }
      if (Object.keys(parsed).length > 0) lineupSlotCache.set(creds.leagueId, parsed);
    }
    const info = leagueInfoFrom(creds, data);
    // The prospect fallback, asked once for the whole league rather than once
    // per team: every name the season's major-league list cannot answer, in one
    // `people/search`. See `extendIndex`.
    const full = await extendIndex(index, rosterNames(data.teams));
    const owned: Record<number, number> = {};
    const rosters: Record<number, EspnRosterPlayer[]> = {};
    let rosterCount = 0;
    let matched = 0;
    for (const team of data.teams ?? []) {
      const roster: EspnRosterPlayer[] = [];
      for (const entry of team.roster?.entries ?? []) {
        const player = toRosterPlayer(entry, full);
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
    // **The men the MLB index cannot name get their roster % by ESPN's id, not
    // by their name**, and it costs no request at all.
    //
    // `pool.pct` and `pool.eligible` are keyed by MLB id and are filled by the
    // name-and-club join against the *base* index, so a prospect has no key in
    // either and could not be given one: the join is what failed for him in the
    // first place. Extending `getPlayerPool`'s own join with `extendIndex`
    // would mean asking MLB about 3,900 names to answer for five, and would
    // make a globally-cached map depend on which league was read last.
    //
    // But ESPN names him with **ESPN's own player id** on both payloads — the
    // roster entry that found him and the pool row that carries his figures —
    // so the join goes the other way and is an identity rather than a match.
    // No name, no club, no tie to break: 5198748 is 5198748. `pool.byEspnId`
    // is a pass over rows already parsed, so this is one `Map` lookup per
    // beyond-index player and **zero upstream requests**; measured on the live
    // 12-team league, Kade Anderson comes back **29.4%** and `SP` where the
    // board and his page both drew a dash.
    //
    // Only the men `extendIndex` found are looked up this way. A player the
    // base index *did* name already has an answer under his MLB id, and the
    // contested-claim rule above is what makes that answer right; reaching for
    // ESPN's id there as well would put a per-league fact into a map every
    // league shares. And the **trend stays out** for the same reason it has to:
    // it is a diff of two days of the *global* map, and a man who is only
    // reachable through one league's roster has no baseline in yesterday's.
    //
    // **Most of these men now come in through the front door**, `getPlayerPool`
    // having extended its own join for everybody over `POOL_JOIN_FLOOR` — so
    // they are in `pool.pct`, in the daily snapshot, and in the trend. What is
    // left on this path is the man *below* the floor whom this particular
    // league happens to roster: a 0.2%-owned prospect nobody else has, who
    // still gets his percentage by ESPN's id and still, correctly, gets no
    // trend. `noTrend` below is that set and nothing more.
    const byId = new Map(Object.values(rosters).flat().map((p) => [p.mlbId, p] as const));
    const beyondHere = [...full.beyond.keys()].filter(
      (id) => owned[id] !== undefined && pool.pct[id] === undefined,
    );
    let rosterPct = pool.pct;
    let eligibility = pool.eligible;
    if (beyondHere.length > 0) {
      // Copied rather than written through: `pool` is the six-hour global cache
      // every league shares, and these keys belong to this one.
      rosterPct = { ...pool.pct };
      eligibility = { ...pool.eligible };
      for (const id of beyondHere) {
        const espnId = byId.get(id)?.espnId;
        const row = espnId ? pool.byEspnId[espnId] : undefined;
        if (!row) continue;
        if (row.pct !== null) rosterPct[id] = row.pct;
        if (row.eligible.length > 0) eligibility[id] = row.eligible;
      }
    }
    const result: EspnOwnership = {
      ...info,
      owned,
      rosterPct,
      eligibility,
      trend,
      rosters,
      /**
       * **Everyone the season's list cannot name that this reader has a reason
       * to see**, which is now two sets rather than one.
       *
       * The per-league half is unchanged and still filtered to `owned`:
       * `full.beyond` is the index's own accumulation and an hour of league
       * reads can leave *another* league's prospects on it, which would put
       * strangers in this reader's search results.
       *
       * The global half — `pool.beyond` — is not filtered, and deliberately.
       * Those men are in `pool.pct` and therefore already have a roster % and a
       * trend on this very payload, so the board is going to draw a row for
       * each of them whether or not anybody here rosters him; without a name he
       * would be a row of dashes with an id. They are not strangers in the way
       * the paragraph above means: the floor is *ownership*, so every one of
       * them is a man some league is holding, which is exactly the population a
       * `Δ` sort is read for.
       *
       * Deduplicated on the app's own `${kind}-${id}` key, a two-way player
       * being two rows and reachable down both paths.
       */
      beyondMlb: dedupePlayers([
        ...[...full.beyond.values()].flat().filter((p) => owned[p.id] !== undefined),
        ...pool.beyond,
      ]),
      /**
       * **The ids whose roster % has no baseline behind it**, so the client can
       * withhold their trend rather than draw five flat zeroes.
       *
       * It is the per-league `byEspnId` additions and only those: a percentage
       * that came off *this* league's roster rows is in no day of the global
       * snapshot and never will be. Everything in `pool.pct` — including the
       * men `POOL_JOIN_FLOOR` let in — has a real baseline from the day it
       * joined and reads like anybody else.
       *
       * A field rather than the client deriving it off `beyondMlb`, which is
       * what it used to do: that list is now mostly men who *do* have a trend,
       * so deriving it there would suppress the very columns this change
       * exists to fill.
       */
      noTrend: beyondHere,
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
// **A range of days is a range of lineups.** The roster views summarize a date
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
//  - *Which players does the view report on?* The **union of every day's
//    roster** — see `rostersToWatchlist`, which reverses what this line used to
//    say. The man you dropped on Tuesday has the days he was yours.
//  - *Which of his days count?* The days **you actually had him in your
//    lineup**, read off each day's own period.
//
// A player who was not on your team at all on some day is, on that day, not in
// your lineup — which is the same answer as benched and is the honest one: his
// Monday belonged to whoever held him on Monday.
//
// **Three things read this file's rosters and only one of them wants today's.**
// `getOwnership`'s clamp is right for *whose team is this* — a past period
// answers with the roster you had then, and the app must not report on a team
// you no longer have. It is wrong for the two questions that are about a *day*:
// the slot chip a row wears and the order the roster reads in. Those take
// `byDate[end]` instead — see `index.ts::fantasyWatchlist`, where the split is
// argued, and **The slot chip and the order are the range end's, not today's**
// in `docs/claude/espn.md`.

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
 * with every field added since it missing, so bump `-v2` if the shape ever
 * grows past a roster.
 *
 * **`-v3` is not a shape change, it is a field that has begun to be filled.**
 * `mlbId`, `savantName` and `kinds` were null, null and empty on every prospect
 * a v2 blob holds, because the join could not reach him — and a frozen day is
 * read back with *no freshness test at all*, so those rows would have stayed
 * unmatched for the life of the cache while every live day showed him. Which is
 * exactly the case `RULES.md` names: the test is not whether a field rides in
 * the blob but whether anything reads it back out of one, and
 * `rostersToWatchlist` reads all three.
 */
const lineupBlobKey = (leagueId: number, teamId: number, period: number) =>
  `espn-lineup-${leagueId}-${teamId}-${period}-v3.json`;

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
 * `docs/claude/espn.md`. `startedKeys` derives the old answer from the new one.
 *
 * **Read `forTeamId`, not the whole league.** The consumer is always one team on
 * one day, and ESPN honors the filter: measured, `view=mRoster` for a single
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
  // The same fallback the league-wide read makes, over one team's names — and
  // it has to be here too, because this is the read the roster views and every
  // team page are actually drawn from. Its cache is shared with that read, so
  // a fan-out over 62 days asks MLB nothing after the first day.
  const full = await extendIndex(index, rosterNames(team ? [team] : []));
  const roster: EspnRosterPlayer[] = [];
  for (const entry of team?.roster?.entries ?? []) {
    const player = toRosterPlayer(entry, full);
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

/**
 * One team's roster on one day — **any** team in the league, not only the
 * reader's own.
 *
 * The Matchup tab's roster view is the first thing to want somebody else's
 * team, and it wants both sides at once, which is why the route above it takes
 * a list. Everything under it is `getTeamRoster`'s: the same `forTeamId` read
 * (198KB against the league's 2.2MB), the same ten-minute memory cache on a
 * mutable day, and the same **frozen** rule for a day gone by — a finished
 * day's roster is a fact, so it reads back off its blob with no freshness test
 * and every leaguemate reading the same settled week shares one entry.
 *
 * A day ESPN cannot be asked about — one before the season's first scoring
 * period — answers **null rather than throwing**, which is the rule the whole
 * of this file's roster fan-out follows: a roster is context, and a caller that
 * asked for two teams should get the one it can have.
 */
export async function getRosterOn(
  creds: EspnCreds,
  teamId: number,
  date: string,
): Promise<EspnRosterPlayer[] | null> {
  const period = await lineupPeriodFor(creds, date);
  if (period === null) return null;
  return getTeamRoster(creds, teamId, period, date < baseballToday());
}

/**
 * Which **player keys** a roster read already in hand has in its lineup — the
 * seed below, and the one place the per-day map and the slot chips are
 * guaranteed to agree because they are the same read.
 *
 * **Keys rather than MLB ids, and that is the whole of the two-way fix.** An id
 * names a man and the app's rows name a man *and a side of the ball*, so a
 * lineup shipped as ids put Ohtani's one `UTIL` seat on both of his rows: the
 * pitching table drew him above its `Lineup` divider on a day he was seated as
 * a hitter, and no arithmetic downstream could tell, an id having nothing in it
 * to tell with. `seatKinds` reads the slot the same read already carries, so
 * the answer is per-day rather than per-range — a man at `P` on the Monday and
 * `UTIL` on the Tuesday is two different rows' start.
 *
 * A key is also what every client-side reader of this map already holds
 * (`playerKey(r)`), which is the second reason: `startedOn` used to be handed
 * `r.id` off a row whose kind it then had no way to consult.
 */
export function startedKeys(roster: EspnRosterPlayer[]): string[] {
  return roster.flatMap((p) =>
    p.starting && p.mlbId !== null
      ? seatKinds(p.kinds, p.slotId).map((kind) => `${kind}-${p.mlbId}`)
      : [],
  );
}

/**
 * Your lineup for every day of `start`…`end`, as player keys, keyed by date.
 *
 * **A missing date is "we couldn't tell", not "nobody started".** A day whose
 * read fails is left out of the record entirely rather than sent empty, so the
 * client can fall back to the one lineup it does have — the end-of-range roster
 * it draws its chips from, which is exactly what the app did before any of this
 * — instead of quietly reporting a day of your team as a day of nobody's. One
 * bad day therefore costs that day's precision and nothing else; the whole
 * thing failing costs the feature and leaves the old behavior standing.
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

/** Which **player keys** a day's roster had in its lineup — the `lineups` map
 *  `/api/espn/roster` ships and the `Starters` filter reads, **derived** from
 *  the same per-day read rather than fetched again, so the chips, the filter
 *  and the days a report counts cannot come to disagree about an afternoon.
 *  Keys rather than ids because a seat has a side of the ball; see
 *  `startedKeys`. */
export function lineupsFrom(
  byDate: Record<string, EspnRosterPlayer[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(byDate).map(([date, roster]) => [date, startedKeys(roster)]),
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
 * **Order is the `anchor` day's team first, in its own order** (lineup, bench,
 * IL — what `rosterToWatchlist` has always preserved), then the men who were on
 * the team over the range but not on it that day, most-recently-held first. A
 * manager reads his own team down the page and a man he wasn't holding on the
 * day in question is a footnote to it, not an interruption in the middle.
 *
 * **The anchor is the end of the range, not today**, which for four of the five
 * date presets is the same thing and for a past range is the whole point: with
 * `Yesterday` on screen, the catcher you started yesterday belongs in the
 * catcher's spot, not at the bottom under the men you have since picked up. The
 * caller passes whichever day it could actually read; see
 * `index.ts::fantasyWatchlist`, where the fallback to today is argued.
 */
export interface FantasyRosterRange {
  players: WatchPlayer[];
  /** Player key → the days of the range he was on the team. */
  heldDays: Map<string, Set<string>>;
}

export function rostersToWatchlist(
  byDate: Record<string, EspnRosterPlayer[]>,
  anchor: EspnRosterPlayer[],
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
  for (const p of rosterToWatchlist(anchor)) {
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

// ---- The league scoreboard -----------------------------------------------
//
// **What the roster views cannot answer: how is my team doing against the
// league.** Everything this file did until now was about *players* — who owns
// whom, who is eligible where, what each manager has in his lineup — and the
// one thing a fantasy manager actually opens ESPN for is the thing it could
// not say: the matchups, and where he stands in each category.
//
// **Which ESPN views carry what**, measured against a live 12-team league
// rather than assumed, because three of them look interchangeable and are not:
//
//  - **`mScoreboard`** is the only one that carries `cumulativeScore
//    .scoreByStat` — the per-category total for each side of a matchup, plus
//    ESPN's own `result` (WIN/LOSS/TIE) once the matchup is over. It is what
//    the scoreboard is made of, and nothing else has it.
//  - **`mMatchupScore`** carries `matchupPeriodId` and `pointsByScoringPeriod`
//    and *not* `scoreByStat` — its `statBySlot` is null on every row. What it
//    is worth reading for is the **date span**: the keys of
//    `pointsByScoringPeriod` are the scoring periods a matchup period covers,
//    which is the only published statement of which days a scoreboard's
//    numbers are drawn from.
//  - **`mTeam`** carries `valuesByStat` — every team's **season** total in each
//    category — beside its record, seed and logo. That is the whole standings
//    table in one 46KB read, and it is the read this file already makes to
//    identify the connecting user's own team.
//
// **`scoringPeriodId=0` is what makes the scoreboard affordable, and it is the
// measurement worth keeping.** `mScoreboard` embeds two whole rosters per side
// — `rosterForCurrentScoringPeriod` and `rosterForMatchupPeriod`, ~43KB a team
// — which is the entire payload: one matchup period comes to **524,565 bytes**.
// Naming a scoring period that is not a day empties both of them while leaving
// `cumulativeScore` untouched, because that is a fact about the *matchup*
// period rather than about a day: **23,759 bytes**, and the category scores are
// **byte-identical** (checked field by field over all 10 matchups of a period,
// both sides — 18,102 bytes of scores, `IDENTICAL: true`). A 22x reduction for
// naming a day that does not exist.
//
// **`X-Fantasy-Filter` does the narrowing server-side.** `{"schedule":
// {"filterMatchupPeriodIds":{"value":[19]}}}` returns that period's matchups
// alone; without it the season's 118 come back. `filterCurrentMatchupPeriod`
// answers identically and is *not* used, for the reason the whole of this file
// distrusts ESPN's own pointers — see the period note below.
//
// **The category winner is computed here, not read.** ESPN fills `result` and
// the wins/losses/ties tally only once a matchup is **over**: a live one comes
// back with `result: null`, `wins/losses/ties: 0` and `winner: 'UNDECIDED'`, so
// a scoreboard that only reported ESPN's answer would say nothing at all about
// the week being played — which is the week anybody is looking at. So the
// comparison is done here for every matchup, live and final alike, honoring
// `isReverseItem` (ERA and WHIP, where the smaller number wins).
//
// **Checked against ESPN's own answer rather than reasoned about**: over all 18
// completed matchup periods of the live league — **108 matchups and 1,080
// category comparisons** — the computed per-category result matched ESPN's
// `result` **1,080 times out of 1,080**, the computed matchup winner matched
// ESPN's `winner` on all 108, and the computed win/loss/tie tally matched
// ESPN's `cumulativeScore` on all 108. So a live matchup and a final one are
// drawn by the same arithmetic, and the final one is drawn by arithmetic known
// to reproduce ESPN's. `ineligible` was scanned for over the same 5,244
// score cells and is false on every one; it is nonetheless honored, since a
// category a team cannot score in is not a category it is losing.

/** How a league decides who wins — and therefore what this view can honestly
 *  draw. `unknown` is a real answer and is rendered as one. */
export type EspnScoringFormat = 'h2h-categories' | 'h2h-points' | 'standings' | 'unknown';

/**
 * ESPN publishes **no dictionary of stat ids anywhere** — checked against the
 * game-level `seasons/{year}`, `kona_game_state` and every league view, none of
 * which names a single stat — so this is a curated table, the same shape
 * `pitchLeague.ts` takes for its league averages, and the honest failure is a
 * header reading `Stat 62` rather than a wrong one.
 *
 * **Twenty-three of these were confirmed arithmetically against the live
 * league** rather than taken on trust, by checking the identities the numbers
 * themselves have to satisfy: `41` is `(37 + 39) / (34 / 3)` to eight places
 * (1.24968711 from 1440 hits and 557 walks over 1598 innings), `47` is
 * `45 * 9 / (34 / 3)` (3.92553191 from 697 earned runs), and `83` is `57 + 60`
 * (2 = 1 + 1). Those are 0, 1, 3, 4, 5, 10, 12, 13, 18, 20, 21, 23, 34, 37, 39,
 * 41, 45, 47, 48, 53, 57, 60 and 83. The rest are the community mapping
 * `cwendt94/espn-api` uses and are **unconfirmed** — a league scoring quality
 * starts or complete games is a league this table has never been read against.
 */
interface StatMeta {
  /** The column header — ESPN's own abbreviation. */
  label: string;
  /** The tooltip, and what the matchup card names the category by. */
  name: string;
  /** `count` prints an integer; `avg` a three-place figure with no leading zero
   *  (`.759`, the way a slash line is written); `rate` two places with one
   *  (`3.93`). Getting this wrong is the difference between an ERA and an OPS. */
  format: 'count' | 'avg' | 'rate';
  /** Which side of the ball the category is scored on, and where it reads
   *  within that side. Both are declared here rather than inferred from the
   *  label, because a label cannot say it: `H` is a hit and a hit allowed, `K`
   *  is a strikeout taken and a strikeout thrown, and `BB`, `HR`, `HBP` and
   *  `IBB` are each two categories in this table under one abbreviation.
   *
   *  The **order** is a reading order rather than the league's own, and each
   *  side's is a rule rather than a taste. Batting: the counting stats in the
   *  order a box score lists them, then the rates in slash-line order. Pitching:
   *  the starter's line first — its counting stats, then its rates — with the
   *  **relief categories trailing everything**, a save or a hold being a role
   *  a manager fills a slot for rather than something a season accrues. On the
   *  live league those two rules give `R · HR · RBI · SB · OPS` and
   *  `K · W · ERA · WHIP · SVHD`, which is how a 5x5 is written. */
  side: EspnCategorySide;
  order: number;
}

/** Which side of the ball a scoring category belongs to. `other` is a real
 *  answer rather than a failure bucket: it is what an id this table has never
 *  been read against gets, and filing such a one under Batters would be a
 *  claim where `Stat 62` is an admission. */
export type EspnCategorySide = 'batting' | 'pitching' | 'other';

const STAT_META: Record<number, StatMeta> = {
  // Batting.
  0: { label: 'AB', name: 'At bats', format: 'count', side: 'batting', order: 31 },
  1: { label: 'H', name: 'Hits', format: 'count', side: 'batting', order: 11 },
  2: { label: 'AVG', name: 'Batting average', format: 'avg', side: 'batting', order: 40 },
  3: { label: '2B', name: 'Doubles', format: 'count', side: 'batting', order: 13 },
  4: { label: '3B', name: 'Triples', format: 'count', side: 'batting', order: 14 },
  5: { label: 'HR', name: 'Home runs', format: 'count', side: 'batting', order: 15 },
  6: { label: 'XBH', name: 'Extra-base hits', format: 'count', side: 'batting', order: 16 },
  7: { label: '1B', name: 'Singles', format: 'count', side: 'batting', order: 12 },
  8: { label: 'TB', name: 'Total bases', format: 'count', side: 'batting', order: 17 },
  9: { label: 'SLG', name: 'Slugging', format: 'avg', side: 'batting', order: 42 },
  10: { label: 'BB', name: 'Walks', format: 'count', side: 'batting', order: 22 },
  11: { label: 'IBB', name: 'Intentional walks', format: 'count', side: 'batting', order: 23 },
  12: { label: 'HBP', name: 'Hit by pitch', format: 'count', side: 'batting', order: 24 },
  13: { label: 'SF', name: 'Sacrifice flies', format: 'count', side: 'batting', order: 26 },
  14: { label: 'SH', name: 'Sacrifice hits', format: 'count', side: 'batting', order: 27 },
  15: { label: 'SAC', name: 'Sacrifices', format: 'count', side: 'batting', order: 28 },
  16: { label: 'PA', name: 'Plate appearances', format: 'count', side: 'batting', order: 32 },
  17: { label: 'OBP', name: 'On-base percentage', format: 'avg', side: 'batting', order: 41 },
  18: { label: 'OPS', name: 'On-base plus slugging', format: 'avg', side: 'batting', order: 43 },
  19: { label: 'RC', name: 'Runs created', format: 'rate', side: 'batting', order: 44 },
  20: { label: 'R', name: 'Runs', format: 'count', side: 'batting', order: 10 },
  21: { label: 'RBI', name: 'Runs batted in', format: 'count', side: 'batting', order: 18 },
  23: { label: 'SB', name: 'Stolen bases', format: 'count', side: 'batting', order: 19 },
  24: { label: 'CS', name: 'Caught stealing', format: 'count', side: 'batting', order: 20 },
  25: { label: 'SB-CS', name: 'Net stolen bases', format: 'count', side: 'batting', order: 21 },
  26: { label: 'GIDP', name: 'Grounded into double plays', format: 'count', side: 'batting', order: 29 },
  27: { label: 'GIDPO', name: 'Double-play opportunities', format: 'count', side: 'batting', order: 30 },
  31: { label: 'K', name: 'Strikeouts (batting)', format: 'count', side: 'batting', order: 25 },
  // Pitching.
  32: { label: 'GP', name: 'Games pitched', format: 'count', side: 'pitching', order: 18 },
  33: { label: 'GS', name: 'Games started', format: 'count', side: 'pitching', order: 19 },
  34: { label: 'OUTS', name: 'Outs recorded', format: 'count', side: 'pitching', order: 17 },
  35: { label: 'TBF', name: 'Batters faced', format: 'count', side: 'pitching', order: 20 },
  36: { label: 'P', name: 'Pitches', format: 'count', side: 'pitching', order: 21 },
  37: { label: 'H', name: 'Hits allowed', format: 'count', side: 'pitching', order: 22 },
  38: { label: 'OBA', name: 'Opponent batting average', format: 'avg', side: 'pitching', order: 43 },
  39: { label: 'BB', name: 'Walks allowed', format: 'count', side: 'pitching', order: 26 },
  40: { label: 'IBB', name: 'Intentional walks allowed', format: 'count', side: 'pitching', order: 27 },
  41: { label: 'WHIP', name: 'Walks and hits per inning', format: 'rate', side: 'pitching', order: 41 },
  42: { label: 'HBP', name: 'Batters hit', format: 'count', side: 'pitching', order: 28 },
  44: { label: 'R', name: 'Runs allowed', format: 'count', side: 'pitching', order: 23 },
  45: { label: 'ER', name: 'Earned runs', format: 'count', side: 'pitching', order: 24 },
  46: { label: 'HR', name: 'Home runs allowed', format: 'count', side: 'pitching', order: 25 },
  47: { label: 'ERA', name: 'Earned run average', format: 'rate', side: 'pitching', order: 40 },
  48: { label: 'K', name: 'Strikeouts', format: 'count', side: 'pitching', order: 10 },
  49: { label: 'K/9', name: 'Strikeouts per nine', format: 'rate', side: 'pitching', order: 42 },
  50: { label: 'WP', name: 'Wild pitches', format: 'count', side: 'pitching', order: 29 },
  51: { label: 'BLK', name: 'Balks', format: 'count', side: 'pitching', order: 30 },
  52: { label: 'PK', name: 'Pickoffs', format: 'count', side: 'pitching', order: 31 },
  53: { label: 'W', name: 'Wins', format: 'count', side: 'pitching', order: 11 },
  54: { label: 'L', name: 'Losses', format: 'count', side: 'pitching', order: 12 },
  55: { label: 'WPCT', name: 'Winning percentage', format: 'avg', side: 'pitching', order: 44 },
  56: { label: 'SVO', name: 'Save opportunities', format: 'count', side: 'pitching', order: 53 },
  57: { label: 'SV', name: 'Saves', format: 'count', side: 'pitching', order: 50 },
  58: { label: 'BS', name: 'Blown saves', format: 'count', side: 'pitching', order: 54 },
  59: { label: 'SV%', name: 'Save percentage', format: 'avg', side: 'pitching', order: 55 },
  60: { label: 'HD', name: 'Holds', format: 'count', side: 'pitching', order: 51 },
  61: { label: 'CG', name: 'Complete games', format: 'count', side: 'pitching', order: 14 },
  62: { label: 'QS', name: 'Quality starts', format: 'count', side: 'pitching', order: 13 },
  63: { label: 'NH', name: 'No-hitters', format: 'count', side: 'pitching', order: 15 },
  64: { label: 'PG', name: 'Perfect games', format: 'count', side: 'pitching', order: 16 },
  83: { label: 'SVHD', name: 'Saves plus holds', format: 'count', side: 'pitching', order: 52 },
};

/** One of the league's own scoring categories, in the league's own order. */
export interface EspnCategory {
  statId: number;
  label: string;
  name: string;
  /** ESPN's `isReverseItem` — ERA and WHIP, where the smaller number wins. */
  lowerBetter: boolean;
  format: 'count' | 'avg' | 'rate';
  /** Which side of the ball scores it, and where it reads within that side —
   *  `STAT_META`'s own, shipped per category so the client can group the
   *  scoreboard's line and the Rankings table without a second table of stat
   *  ids to keep in step with this one. **The array stays in the league's own
   *  order**: it is a faithful record of what the league scores, and grouping
   *  is presentation. */
  side: EspnCategorySide;
  order: number;
}

/** One side of one matchup. */
export interface EspnMatchupSide {
  teamId: number;
  /** The team's total in each scoring category, keyed by stat id. A category
   *  ESPN reports the side as ineligible for is absent rather than zero. */
  scores: Record<number, number>;
  /** Categories won, lost and tied — computed here for a live matchup and
   *  checked against ESPN's own tally on 108 finished ones. */
  wins: number;
  losses: number;
  ties: number;
  /** A points league's one number. Null in a category league. */
  points: number | null;
  /** How many acquisitions this manager has used in this matchup period, off
   *  `mTeam`'s `transactionCounter`. Null where ESPN reports none. The **limit**
   *  is one number for the period and rides on the scoreboard rather than on
   *  each side — see `EspnScoreboard.acquisitionLimit`. */
  acquisitions: number | null;
}

export interface EspnMatchup {
  id: number;
  home: EspnMatchupSide;
  /** Null is a **bye**, which is a real shape rather than a failure: a 12-team
   *  league's first playoff round had 2 matchups and 8 of them. */
  away: EspnMatchupSide | null;
  /** Null while the matchup is still being played. */
  winner: 'home' | 'away' | 'tie' | null;
}

/** One row of the standings table — the league's own season-to-date totals. */
export interface EspnStandingsTeam {
  id: number;
  name: string;
  abbrev: string;
  /** ESPN lets a manager upload any URL, so this is an arbitrary third-party
   *  image and the client is written to survive one that doesn't load. */
  logo: string | null;
  wins: number;
  losses: number;
  ties: number;
  gamesBack: number;
  /** ESPN's own `streakLength` + `streakType`, as `W3` / `L1`. */
  streak: string | null;
  seed: number;
  /** A points league's season total. */
  points: number;
  /** Season-to-date total in each scoring category, keyed by stat id. */
  values: Record<number, number>;
}

/**
 * One matchup period the league's schedule carries, with the days it covers —
 * **the same arithmetic `EspnScoreboard.start`/`end` are, run for every period
 * instead of for the one being shown.**
 *
 * It is here so the client can offer the weeks as a *list* rather than only as
 * two arrows, and it is derived rather than fetched: `leagueMeta.periods` is
 * already in hand on every scoreboard read (it is what `prevPeriod` and
 * `nextPeriod` are computed from) and `dateForPeriod` is one cached anchor plus
 * `addDays`, so the whole list costs no upstream request at all.
 *
 * **The dates are the *observed* span, deliberately** — the same truncation
 * `start`/`end` carry on the live period. A list whose entry for the week you
 * are on read further than the header above it does would be two dates for one
 * week, and the header's is the one the numbers on screen actually are. The
 * whole-period reading exists and has its own route (`getMatchupWindow`), for
 * the forward-looking question it answers.
 *
 * Null dates where the period anchor could not be read — the same failure the
 * header's own dates take, and the list then names the week without them rather
 * than dropping it.
 */
export interface EspnPeriodSpan {
  period: number;
  start: string | null;
  end: string | null;
}

export interface EspnScoreboard {
  format: EspnScoringFormat;
  /** ESPN's own word for the format, so an unsupported one can be named on
   *  screen rather than described. */
  scoringType: string;
  /** Which matchup period is being shown, and the ones either side of it that
   *  actually exist — ESPN materialises no future periods, so `next` is null on
   *  the current one and the client's forward arrow is simply absent. */
  matchupPeriod: number;
  prevPeriod: number | null;
  nextPeriod: number | null;
  /** Every matchup period the schedule has materialised, in order, with the
   *  days each covers — see `EspnPeriodSpan`. The arrows are two members of
   *  this list; the client draws the rest of it as the week list behind the
   *  header. Empty on a league whose schedule could not be read at all. */
  periods: EspnPeriodSpan[];
  /** The ET calendar days this period's totals cover. For a **live** matchup
   *  that is the days played *so far*, which is what the numbers on screen
   *  actually are: `pointsByScoringPeriod` truncates at ESPN's own current day.
   *  Null where the period anchor could not be read. */
  start: string | null;
  end: string | null;
  /**
   * The period's **whole** last day, `max(observed, declared)` — the same
   * reading `getMatchupWindow` publishes, for the one thing on this page that
   * is not a total.
   *
   * `end` is deliberately truncated at today and the numbers under it are the
   * days played, so it is the right bound for everything the scoreboard
   * *counts*. It is the wrong bound for the **moves** list, which is not a
   * count of days played but of acts booked against this period — and ESPN
   * books an afternoon move against *tomorrow* (`MatchupCard::periodDay`, the
   * measured 13:00 ET boundary). On every day of the week but the last those
   * two disagree by exactly one day, so today's afternoon pickups fell outside
   * `end` and appeared only the next morning, when the observed span caught up.
   * Measured on the live league at 20:26 ET on 2026-08-29: one topic filed at
   * 13:50 ET, `periodDay` 2026-08-30, against an `end` of 2026-08-29.
   *
   * On the period's last day the two are equal, which is what keeps the
   * boundary rule intact: a Sunday-afternoon move still belongs to next week
   * and is still excluded. It inherits `getMatchupWindow`'s own honest failure
   * — a period longer than it declares reads short until observation catches
   * it up — and errs toward showing fewer days than the period has, never
   * more.
   */
  fullEnd: string | null;
  /** Whether this is the period being played — nothing on it is final. */
  live: boolean;
  /** How many acquisitions a manager gets in this matchup period, or null where
   *  the league does not limit them per period. See `acquisitionLimitFor`. */
  acquisitionLimit: number | null;
  categories: EspnCategory[];
  matchups: EspnMatchup[];
  teams: EspnStandingsTeam[];
  myTeamId: number | null;
  leagueName: string;
  fetchedAt: number;
}

function formatOf(scoringType: string | undefined): EspnScoringFormat {
  switch (scoringType) {
    // Both of ESPN's category spellings. `H2H_CATEGORY` awards a point per
    // category and `H2H_MOST_CATEGORIES` a single win to whoever takes the
    // most; the scoreboard is the same object either way, which is why they
    // share a bucket — what differs is only how the league's standings are
    // kept, and those are read rather than computed.
    case 'H2H_CATEGORY':
    case 'H2H_MOST_CATEGORIES':
      return 'h2h-categories';
    case 'H2H_POINTS':
      return 'h2h-points';
    // No matchups at all: the season table *is* the league. Drawing an empty
    // scoreboard over it would be the view claiming a shape the league hasn't.
    case 'ROTO':
    case 'TOTAL_POINTS':
      return 'standings';
    default:
      return 'unknown';
  }
}

/** The shape of the reads below — declared here rather than widened onto
 *  `EspnRosterResponse`, which is the roster's shape and has no business
 *  growing a schedule. */
interface EspnScoreboardResponse {
  settings?: {
    name?: string;
    scoringSettings?: {
      scoringType?: string;
      scoringItems?: { statId?: number; isReverseItem?: boolean }[];
    };
    /** How many matchup periods the **regular season** is. Everything past it
     *  is a playoff round — the distinction the halves and the playoff span
     *  both turn on, and one the schedule alone cannot make.
     *
     *  `matchupPeriods` maps a matchup period to the **weeks** it covers —
     *  `{"1": [1], "19": [19, 20]}` — which is how a two-week playoff round
     *  says so. Not scoring periods: period 1 covers one week and 12 scoring
     *  periods on the live league, the season having opened mid-week. */
    scheduleSettings?: {
      matchupPeriodCount?: number;
      matchupPeriods?: Record<string, number[]> | null;
    };
    /** How many acquisitions a manager gets. See `acquisitionLimitFor`. */
    acquisitionSettings?: {
      acquisitionLimit?: number;
      matchupAcquisitionLimit?: number;
      matchupLimitPerScoringPeriod?: boolean;
    };
  };
  status?: {
    currentMatchupPeriod?: number;
    /** The scoring period ESPN is *on*. Load-bearing rather than decorative:
     *  a matchup's `cumulativeScore` covers every scoring period of the week
     *  **except** this one — see `scoringPeriodTotals`. */
    latestScoringPeriod?: number;
  };
  teams?: {
    id: number;
    name?: string;
    abbrev?: string;
    logo?: string | null;
    owners?: string[] | null;
    primaryOwner?: string | null;
    playoffSeed?: number;
    points?: number;
    valuesByStat?: Record<string, number> | null;
    record?: {
      overall?: {
        wins?: number;
        losses?: number;
        ties?: number;
        gamesBack?: number;
        streakLength?: number;
        streakType?: string;
      };
    };
    /** How many moves this manager has made, and — the useful half — how many
     *  in each **matchup period**, keyed by period id. */
    transactionCounter?: {
      acquisitions?: number;
      matchupAcquisitionTotals?: Record<string, number> | null;
    } | null;
  }[];
  schedule?: {
    id?: number;
    matchupPeriodId?: number;
    winner?: string;
    home?: EspnScheduleSide;
    away?: EspnScheduleSide;
  }[];
}

interface EspnScheduleSide {
  teamId?: number;
  totalPoints?: number;
  totalPointsLive?: number;
  pointsByScoringPeriod?: Record<string, number> | null;
  cumulativeScore?: {
    wins?: number;
    losses?: number;
    ties?: number;
    /**
     * **`score` is not always a number and `ineligible` does not always mean
     * ineligible** — measured on the live league at 19:58 ET on 2026-08-24, the
     * first day of period 20, where every side's ERA and WHIP cell came back
     * `{"ineligible":true,"rank":0,"result":"TIE","score":"Infinity"}`. That is
     * ESPN saying *this rate has no denominator yet*, and it is the shape
     * `sideFrom` reads the distinction off; a side that has thrown an inning by
     * then has an ordinary numeric cell. Typed as it arrives rather than as it
     * usually is, so the string cannot be mistaken for a figure.
     */
    scoreByStat?: Record<string, { score?: number | string; ineligible?: boolean }> | null;
  } | null;
  /** The lineup as it stands on the scoring period the request named, each
   *  player carrying his stat line for that one day. Empty on a request that
   *  names no day (`scoringPeriodId=0`), which is exactly why the live read
   *  below has to name one. */
  rosterForCurrentScoringPeriod?: {
    entries?: {
      lineupSlotId?: number;
      playerPoolEntry?: {
        player?: {
          stats?: {
            scoringPeriodId?: number;
            statSourceId?: number;
            statSplitTypeId?: number;
            stats?: Record<string, number> | null;
          }[];
        };
      };
    }[];
  } | null;
}

/**
 * The league's teams, its categories and the span of every matchup period it
 * has — everything about the league that is not one period's scores.
 *
 * Two reads, and each is the cheapest thing that answers its half:
 *
 *  - `mTeam` + `mSettings`, **49,749 bytes**, for the standings table and the
 *    scoring categories. This is the read `getLeagueInfo` already makes with
 *    one view added.
 *  - `mMatchupScore` at `scoringPeriodId=0`, **70,794 bytes**, for the whole
 *    season's matchup-period → scoring-period spans. Unfiltered, because the
 *    point of it is the season: it is what dates every period and what makes
 *    the arrows below know which periods exist.
 *
 * **Which period is the current one is read off the schedule, not off ESPN's
 * pointer** — the rule the whole of this file follows since the scoring-period
 * anchor. ESPN materialises **no future matchup periods at all** (checked: the
 * schedule's highest is exactly the one being played, 19 of a 21-period
 * season), so the highest period the schedule carries *is* the current one, as
 * a fact about the data rather than a claim about a clock. `status
 * .currentMatchupPeriod` is kept as the fallback and agrees today.
 *
 * **What that cannot fix, and does not pretend to**: between our 3am rollover
 * and ESPN's own nightly batch — the ~90-minute window `The anchor is derived
 * from ESPN's calendar` measures at 03:39–05:19 ET — ESPN has not yet opened
 * the new matchup period, so on a Monday morning the highest period it carries
 * is the week that has just ended. There is nothing to read for the new one.
 * That is shown as what it is: the period's own dates, and `Final` rather than
 * `Live`, with the arrows to move. A wrong week silently labeled "this week"
 * is the failure being avoided, and dates are what avoid it.
 */
interface LeagueMeta {
  leagueName: string;
  format: EspnScoringFormat;
  scoringType: string;
  categories: EspnCategory[];
  teams: EspnStandingsTeam[];
  myTeamId: number | null;
  /** Every matchup period the schedule carries, with the scoring periods it
   *  covers, ascending. */
  periods: { period: number; first: number; last: number }[];
  /** The last period of the **regular season** (ESPN's `matchupPeriodCount`).
   *  Everything past it is a playoff round. Null if ESPN did not say. */
  regularPeriods: number | null;
  /** Team id → matchup period → acquisitions used, off `mTeam`. */
  acquisitions: Map<number, Record<string, number>>;
  /** The league's settings, kept whole so the acquisition limit can be worked
   *  out **per period** — it depends on which one is asked for, and this meta
   *  is one object cached for all of them. */
  settings: EspnScoreboardResponse['settings'] | null;
  /** The period being played, off ESPN's own pointer. */
  currentPeriod: number | null;
  /** The scoring period ESPN is on — the day every `cumulativeScore` in this
   *  league leaves out, and so the day the live scoreboard and the live span
   *  have to add back. See `scoringPeriodTotals`. */
  latestScoringPeriod: number | null;
  fetchedAt: number;
}

const metaCache = new Map<number, LeagueMeta>();
const metaInFlight = new Map<number, Promise<LeagueMeta>>();

/**
 * **How many acquisitions a manager gets in one matchup period**, or null where
 * the league does not limit them per period.
 *
 * ESPN does not publish the number. What it publishes is
 * `matchupAcquisitionLimit` — **0.7142857142857143** on the live league, with
 * `matchupLimitPerScoringPeriod: true` beside it — which is the limit *per
 * scoring period*, so a period's own limit is that times the days in it. 5/7 is
 * exactly 0.714…, and an ordinary seven-day week is therefore 5.
 *
 * **How many days a period has is the part that needs care**, because neither
 * source is right on its own:
 *
 * - The **observed span** (the scoring periods `pointsByScoringPeriod` reports)
 *   is exact on a settled period and catches the two that are not seven days —
 *   period 1 is 12 on the live league, the season having opened mid-week, and
 *   period 15 is 14, the All-Star break falling inside it. But it **truncates
 *   at ESPN's own current day**, so the period being played reads short: 7 for
 *   a two-week playoff round.
 * - The **declared length** (`matchupPeriods`, which maps a period to the
 *   *weeks* it covers) is right about the playoff round and wrong about both of
 *   the others, knowing nothing of an opening stretch or a break.
 *
 * So it is the **larger of the two**, which needs no live/settled branch and is
 * principled rather than lucky: the observation is a lower bound because it
 * truncates, and the declaration is the nominal length, so a period is at least
 * as long as both.
 *
 * **Checked against every team's own totals rather than reasoned about.** Over
 * the live league's 185 team-periods, **0 are over the computed limit and 55
 * are exactly at it** — a cap 55 managers hit and none exceeded. The four
 * periods that are not five: 1 → 9 (12 days), 15 → 10 (14), 19 → 10 (a
 * fortnight's playoff round), and every other week 5.
 */
function acquisitionLimitFor(
  settings: EspnScoreboardResponse['settings'],
  period: number,
  observedDays: number,
): number | null {
  const perDay = settings?.acquisitionSettings?.matchupAcquisitionLimit;
  if (typeof perDay !== 'number' || !(perDay > 0)) return null;
  const weeks = settings?.scheduleSettings?.matchupPeriods?.[String(period)]?.length ?? 1;
  const days = Math.max(observedDays, weeks * 7);
  const limit = Math.round(perDay * days);
  return limit > 0 ? limit : null;
}

async function leagueMeta(creds: EspnCreds, force = false): Promise<LeagueMeta> {
  const hit = metaCache.get(creds.leagueId);
  // `LIVE_TTL_MS`, not the rosters' ten minutes: `valuesByStat` on every team
  // is the Rankings tab's **season** column, and it accrues while games are
  // being played — so the one span that reads ESPN's own running total would
  // otherwise be the one span on the page that did not move.
  if (!force && hit && Date.now() - hit.fetchedAt < LIVE_TTL_MS) return hit;
  const running = metaInFlight.get(creds.leagueId);
  if (running && !force) return running;

  const job = (async () => {
    const [info, sched] = await Promise.all([
      leagueGet<EspnScoreboardResponse>(creds, ['mTeam', 'mSettings']),
      // `scoringPeriodId=0` for the same reason the scoreboard read uses it:
      // it names no day, so the per-day rosters come back empty while the
      // matchup-level fields — which are what this is for — are untouched.
      leagueGet<EspnScoreboardResponse>(creds, ['mMatchupScore'], 0),
    ]);

    const scoring = info.settings?.scoringSettings;
    const categories: EspnCategory[] = (scoring?.scoringItems ?? []).flatMap((item) => {
      if (typeof item.statId !== 'number') return [];
      const meta = STAT_META[item.statId];
      return [
        {
          statId: item.statId,
          label: meta?.label ?? `Stat ${item.statId}`,
          name: meta?.name ?? `ESPN stat ${item.statId}`,
          lowerBetter: item.isReverseItem === true,
          format: meta?.format ?? ('count' as const),
          // A stat id this table has never been read against is `other` and is
          // ordered by its own id, so it draws in a group of its own rather
          // than being filed under a side nothing establishes it is on.
          side: meta?.side ?? ('other' as const),
          order: meta?.order ?? item.statId,
        },
      ];
    });

    const swid = creds.swid?.toUpperCase() ?? null;
    let myTeamId: number | null = null;
    const teams: EspnStandingsTeam[] = (info.teams ?? []).map((t) => {
      const o = t.record?.overall ?? {};
      if (
        swid &&
        [...(t.owners ?? []), t.primaryOwner].some((x) => (x ?? '').toUpperCase() === swid)
      ) {
        myTeamId = t.id;
      }
      const values: Record<number, number> = {};
      for (const [id, v] of Object.entries(t.valuesByStat ?? {})) {
        if (typeof v === 'number' && Number.isFinite(v)) values[Number(id)] = v;
      }
      const streakLength = o.streakLength ?? 0;
      return {
        id: t.id,
        name: t.name?.trim() || `Team ${t.id}`,
        abbrev: t.abbrev?.trim() || `T${t.id}`,
        logo: t.logo?.trim() || null,
        wins: o.wins ?? 0,
        losses: o.losses ?? 0,
        ties: o.ties ?? 0,
        gamesBack: o.gamesBack ?? 0,
        streak:
          streakLength > 0 && o.streakType
            ? `${o.streakType === 'WIN' ? 'W' : o.streakType === 'LOSS' ? 'L' : 'T'}${streakLength}`
            : null,
        seed: t.playoffSeed ?? 0,
        points: t.points ?? 0,
        values,
      };
    });

    // Period → the scoring periods it covers. Both sides of every matchup are
    // read rather than the home one alone: a bye has only a home side, and the
    // period's span is the union either way.
    const span = new Map<number, { first: number; last: number }>();
    for (const m of sched.schedule ?? []) {
      const period = m.matchupPeriodId;
      if (typeof period !== 'number') continue;
      for (const side of [m.home, m.away]) {
        for (const key of Object.keys(side?.pointsByScoringPeriod ?? {})) {
          const sp = Number(key);
          if (!Number.isInteger(sp)) continue;
          const at = span.get(period);
          if (!at) span.set(period, { first: sp, last: sp });
          else {
            at.first = Math.min(at.first, sp);
            at.last = Math.max(at.last, sp);
          }
        }
      }
      // A period with no scoring periods recorded at all still exists as a
      // period — the schedule carries it — so it is kept with an empty span
      // rather than dropped, and simply has no dates to show.
      if (!span.has(period)) span.set(period, { first: 0, last: 0 });
    }
    const periods = [...span.entries()]
      .map(([period, s]) => ({ period, ...s }))
      .sort((a, b) => a.period - b.period);
    // The fallback, and only the fallback: if the schedule carried nothing at
    // all there is no data to derive a period from and ESPN's pointer is
    // better than nothing.
    if (periods.length === 0 && typeof info.status?.currentMatchupPeriod === 'number') {
      periods.push({ period: info.status.currentMatchupPeriod, first: 0, last: 0 });
    }

    const meta: LeagueMeta = {
      leagueName: info.settings?.name?.trim() || `League ${creds.leagueId}`,
      format: formatOf(scoring?.scoringType),
      scoringType: scoring?.scoringType ?? 'UNKNOWN',
      categories,
      teams,
      myTeamId,
      periods,
      /** Per team, per matchup period: how many acquisitions he has used. Off
       *  `mTeam`'s `transactionCounter`, which the standings read already
       *  carries — no second request. */
      acquisitions: new Map(
        (info.teams ?? []).flatMap((t) =>
          typeof t.id === 'number'
            ? [[t.id, t.transactionCounter?.matchupAcquisitionTotals ?? {}] as const]
            : [],
        ),
      ),
      /** The whole `settings` object, kept so the limit can be worked out per
       *  period rather than once here — it depends on which period is asked
       *  for, and this meta is cached for every period at once. */
      settings: info.settings ?? null,
      // Where the regular season ends. **ESPN's own number, not a guess from
      // the schedule**: `matchupPeriodCount` is 18 on the checked league while
      // the schedule runs to 21, and periods past it are playoff rounds — which
      // is exactly the distinction the halves and the playoff span turn on.
      regularPeriods: info.settings?.scheduleSettings?.matchupPeriodCount ?? null,
      // ESPN's own pointer at the live period, preferred over "the last period
      // the schedule mentions": those agree today only because the playoff
      // rounds past the current one are not scheduled yet, and the day they are
      // the last one would be a round nobody has played.
      currentPeriod:
        typeof info.status?.currentMatchupPeriod === 'number'
          ? info.status.currentMatchupPeriod
          : null,
      latestScoringPeriod:
        typeof info.status?.latestScoringPeriod === 'number'
          ? info.status.latestScoringPeriod
          : null,
      fetchedAt: Date.now(),
    };
    metaCache.set(creds.leagueId, meta);
    return meta;
  })().finally(() => {
    metaInFlight.delete(creds.leagueId);
  });

  metaInFlight.set(creds.leagueId, job);
  return job;
}

/**
 * One matchup period's matchups.
 *
 * **A finished matchup period is a fact**, so it takes a storage blob read with
 * no freshness test — the rule `getTeamRoster` already follows for a finished
 * day's lineup, and for the same reason: you cannot retroactively score a run
 * in a week that is over. The period being played is memory-only on
 * `LIVE_TTL_MS`, a minute, which is what the League page's own poll reads
 * through, and `force` — the header's `Refresh from ESPN`
 * — reaches it and leaves the frozen ones alone, since re-reading a settled
 * week spends an ESPN request to be told what the blob already says.
 */
/**
 * A settled matchup period's own blob, read back with **no freshness test** —
 * the week is over and what happened in it is a fact.
 *
 * **`-v2` is `EspnMatchupSide.acquisitions` arriving**, and it is exactly the
 * hazard a version guards against: a v1 blob deserializes with the new field
 * missing, so every settled week would have gone on serving sides with no
 * acquisition count at all while the live one had them — measured before the
 * bump, `undefined` on every side of period 18 against a working 19. Bump it
 * whenever a side or a matchup gains a field.
 *
 * **`-v3` is nothing gaining a field and `tallyCategories` changing its mind**,
 * which is the other half of the same rule: a version guards the *meaning* of
 * what is stored as well as its shape. `wins/losses/ties` are computed once, on
 * the way in, and a settled week is read back with no freshness test at all —
 * so a week in which a side threw no innings would have gone on serving the
 * tally that skipped ERA and WHIP long after every live week counted them as
 * tied. The blobs are one ESPN request each to rebuild and the two answers
 * cannot be told apart by looking, which is exactly when a stale one is worth
 * least and costs most.
 */
const scoreboardBlobKey = (leagueId: number, period: number) =>
  `espn-scoreboard-${leagueId}-${period}-v3.json`;

const scoreboardCache = new Map<string, { matchups: EspnMatchup[]; fetchedAt: number }>();
const scoreboardInFlight = new Map<string, Promise<EspnMatchup[]>>();

/** ESPN's bench and injured-reserve lineup slots — the two a player accrues
 *  nothing from. Everything else counts, which is the same fail-safe rule
 *  `toRosterPlayer` takes for the slot chip: an undocumented slot reads as
 *  playing rather than as benched. */
const NON_ACCRUING_SLOTS = new Set([16, 17]);

/**
 * One scoring period's production per team, summed over the players actually in
 * a lineup — **the day ESPN's own `cumulativeScore` leaves out.**
 *
 * This is the fix for "the scoreboard doesn't incorporate today". A matchup's
 * `cumulativeScore` is not a running total: it covers every scoring period of
 * the week **except `status.latestScoringPeriod`**, so through an evening's
 * games it sits still at yesterday's figure however often it is re-read. No
 * amount of cache-shortening reaches that, because the number itself is not
 * moving — which is why this file spent a release polling a figure that could
 * not answer.
 *
 * **Measured rather than assumed, twice.** On the live week, every team whose
 * players had produced that day was short by *exactly* that day's contribution
 * (Pirates Cove `25/9/27` summed against a cumulative `22/8/24`, the day being
 * `3/1/3`) while every team with a quiet day matched — which is what makes the
 * boundary a rule rather than a coincidence, and what made the first check on
 * one quiet team inconclusive. And on the **settled** week 18, summing its days
 * this way reproduces ESPN's own final `cumulativeScore` for **120 of 120
 * cells to 4.9e-9**, rate categories included. So the summation is ESPN's
 * arithmetic, not an approximation of it.
 *
 * **`cumulativeScoreLive` is not the answer and was the first thing tried.** The
 * side object declares it beside `totalPointsLive`, which reads exactly like the
 * field this needs; it is **null on every side of every read** — bare, at
 * `scoringPeriodId=0` and at the current day alike, 0 of 12 populated. It is a
 * points-league field this league never fills.
 *
 * **The read is `mMatchupScore` at the day, and the view is chosen on
 * payload.** Measured on the live league for one matchup period: `mScoreboard`
 * at `scoringPeriodId=0` is **23KB and carries no roster at all**, the same read
 * at the day is **488KB** and carries both, and `mMatchupScore` at the day is
 * **208KB** and carries the roster without the scores. So the live path is two
 * reads at 231KB rather than one at 488 — and the frozen path keeps the 23KB
 * read it has always made, untouched.
 */
async function scoringPeriodTotals(
  creds: EspnCreds,
  period: number,
  scoringPeriodId: number,
): Promise<Record<number, Record<number, number>>> {
  const data = await leagueGet<EspnScoreboardResponse>(creds, ['mMatchupScore'], scoringPeriodId, {
    schedule: { filterMatchupPeriodIds: { value: [period] } },
  });
  const out: Record<number, Record<number, number>> = {};
  for (const m of data.schedule ?? []) {
    for (const side of [m.home, m.away]) {
      if (!side || typeof side.teamId !== 'number') continue;
      const acc = (out[side.teamId] ??= {});
      for (const e of side.rosterForCurrentScoringPeriod?.entries ?? []) {
        if (e.lineupSlotId != null && NON_ACCRUING_SLOTS.has(e.lineupSlotId)) continue;
        // `statSourceId: 0` is the real line rather than a projection, and
        // `statSplitTypeId: 5` the one-day split. A player who has not taken
        // the field carries an entry with no stats in it at all.
        //
        // **Every matching line, not the first — a doubleheader is two of
        // them.** ESPN files one `{day}/0/5` entry *per game*, so a man who
        // played twice carries two, and `.find` took whichever came first and
        // dropped the other outright. Which of the two it dropped is not even
        // stable: the first is routinely the empty `{}` of the game that has
        // not started, so a reliever's whole day could vanish.
        //
        // Measured on the live league, 2026-08-29 (period 20, scoring period
        // 158, thirteen roster entries league-wide carrying two lines): team
        // 6's second-game hold was dropped, and with it the category the fault
        // was reported as — **SVHD 1 → 2**, and beside it **K 66 → 67, OPS
        // .667 → .645, ERA 2.455 → 2.413, WHIP 1.125 → 1.106**. Its opponent
        // moved too, which is what makes this a scoreboard fault rather than
        // one side's.
        //
        // **Checked against ESPN's own final `cumulativeScore` on a settled
        // week that has a doubleheader in it**, which is what the original
        // 120-of-120 validation happened to miss: period 18 has no day with
        // two lines on it and matches either way, and **period 19 — whose
        // scoring period 146 has thirteen — mismatches 49 of its 276 cells
        // taking the first line and 12 taking them all.** The twelve that
        // remain are four teams' one-or-two-unit disagreements in H, ER and
        // hits allowed with the rates they feed, which is the same official
        // scoring revision `REVISION_TTL_MS` measures, in both directions.
        for (const line of e.playerPoolEntry?.player?.stats ?? []) {
          if (
            line.scoringPeriodId !== scoringPeriodId ||
            line.statSourceId !== 0 ||
            line.statSplitTypeId !== 5
          )
            continue;
          for (const [id, v] of Object.entries(line.stats ?? {})) {
            if (typeof v === 'number' && Number.isFinite(v)) {
              acc[Number(id)] = (acc[Number(id)] ?? 0) + v;
            }
          }
        }
      }
    }
  }
  return out;
}

/** One scoring period's production per team, keyed by stat id. */
type DayTotals = Record<number, Record<number, number>>;

/** A day's own counts, on the rule `espn-lineup-…` already follows one level
 *  up: a scoring period strictly before ESPN's own latest is a day whose games
 *  have been played and whose lineups can no longer be edited, so what came out
 *  of it is a fact. ~1.6KB on the live 12-team league against the ~125KB read
 *  it is reduced from — store the answer, not the payload. */
//
//  **`-v2` is the doubleheader**, and it is the cache-version rule in its
//  *meaning* form rather than its shape one: nothing on this blob gained a
//  field, and every one written before `scoringPeriodTotals` summed all of a
//  day's stat lines holds one game of a two-game day. A settled day is read
//  back with no freshness test at all, so those would have gone on serving the
//  short figure to the day-by-day chart for the rest of the season. See
//  *A doubleheader is two stat lines* in **The league scoreboard**.
const dayTotalsBlobKey = (leagueId: number, scoringPeriod: number) =>
  `espn-day-totals-${leagueId}-${scoringPeriod}-v2.json`;

const dayTotalsCache = new Map<string, { totals: DayTotals; fetchedAt: number }>();
const dayTotalsInFlight = new Map<string, Promise<DayTotals>>();

/**
 * **How much a day's own totals can still move**, which is the only thing that
 * decides how they are cached — see `dayTotals`.
 *
 *  - `live` — the day ESPN is on. Memory only, on `LIVE_TTL_MS`.
 *  - `revisable` — a finished day inside the matchup period *being played*.
 *    Blobbed, but read back against `REVISION_TTL_MS` rather than trusted.
 *  - `settled` — a day in a matchup period that is over. Blobbed and read back
 *    with no freshness test at all, which is what makes a settled week free.
 */
type DayFreeze = 'live' | 'revisable' | 'settled';

/**
 * **How long a finished day inside the live week is believed for.**
 *
 * A day was treated as a fact the moment ESPN moved off it, and it is not one:
 * official scoring is revised, and ESPN restates the day when it is. Measured
 * on the live league on 2026-08-23, against blobs written on the 17th — team 1's
 * **earned runs for Aug 11 went 15 → 10 and for Aug 15 went 3 → 1**, so the
 * chart's ERA for the week read **3.53 against the card's 3.16** and would have
 * gone on reading it for as long as the blob lived. Every other stat of every
 * other day of that week matched, which is what makes this a revision rule
 * rather than a cache-everything one.
 *
 * Half an hour, which is the number that makes an open page self-correcting
 * without making the week expensive: a settled period is untouched, and the
 * thirteen finished days of the live one cost thirteen reads a half hour on top
 * of the one a minute today already costs.
 */
const REVISION_TTL_MS = 30 * 60 * 1000;

/**
 * `scoringPeriodTotals` with the cache the series needs and the live scoreboard
 * turns out to want too.
 *
 * **The freeze is the matchup period's, not the day's** — which is the
 * correction `DayFreeze` carries and `REVISION_TTL_MS` measures. A day whose
 * *week* is over cannot move and takes a blob read with no freshness test; a
 * finished day inside the week being played is still being scored, and takes
 * the same blob against a half-hour test; the day itself is memory-only on
 * `LIVE_TTL_MS`. That is what keeps the chart affordable on the week anybody is
 * looking at — the first press pays for the whole week, and every minute after
 * it re-reads the one day that can still move — while letting a scoring
 * revision reach a page somebody has left open.
 *
 * The live scoreboard reads through it as well, which it did not before. It
 * only ever asks for the latest day, so it always takes the live path and its
 * behavior is unchanged; what it gains is the `inFlight` guard, so a cold
 * container serving three tabs sends one upstream rather than three.
 */
async function dayTotals(
  creds: EspnCreds,
  period: number,
  scoringPeriodId: number,
  freeze: DayFreeze,
): Promise<DayTotals> {
  const key = `${creds.leagueId}:${scoringPeriodId}`;
  const ttl =
    freeze === 'settled' ? Infinity : freeze === 'revisable' ? REVISION_TTL_MS : LIVE_TTL_MS;
  const hit = dayTotalsCache.get(key);
  if (hit && Date.now() - hit.fetchedAt < ttl) return hit.totals;
  const running = dayTotalsInFlight.get(key);
  if (running) return running;

  const job = (async () => {
    if (freeze !== 'live') {
      // **Stamped rather than tested**, so the memory copy inherits the blob's
      // own age: a `revisable` day read off a blob written 29 minutes ago is
      // due in one, not in thirty-one. `readJsonBlob` would have spent the
      // stamp on the test and left this cache believing it had just read ESPN.
      const stored = await readStampedBlob<DayTotals>(
        dayTotalsBlobKey(creds.leagueId, scoringPeriodId),
      );
      if (
        stored !== null &&
        typeof stored.value === 'object' &&
        (freeze === 'settled' || Date.now() - stored.cachedAt < REVISION_TTL_MS)
      ) {
        dayTotalsCache.set(key, { totals: stored.value, fetchedAt: stored.cachedAt });
        return stored.value;
      }
    }
    const totals = await scoringPeriodTotals(creds, period, scoringPeriodId);
    dayTotalsCache.set(key, { totals, fetchedAt: Date.now() });
    if (freeze !== 'live') {
      await writeJsonBlob(dayTotalsBlobKey(creds.leagueId, scoringPeriodId), totals);
    }
    return totals;
  })().finally(() => {
    dayTotalsInFlight.delete(key);
  });

  dayTotalsInFlight.set(key, job);
  return job;
}

/**
 * ESPN's through-yesterday score with today's day added on.
 *
 * **Counting stats add and rates do not**, which is the same rule
 * `getSpanTotals` obeys one level up and the reason this cannot be a merge of
 * two numbers: a rate is rebuilt from the components it is made of, and the
 * components are in `scoreByStat` — it carries all 23 stats ESPN tracks, the
 * components as well as the ten a league scores. So every `DERIVED` id is
 * skipped on the way in and recomputed on the way out.
 *
 * **Today can move a number ESPN already gave this side and can never invent
 * one.** A category a side is *ineligible* for is absent from `scores` by
 * `sideFrom`'s own rule, and adding a day's production would put it back — as a
 * zero-based total that in a `lowerBetter` category reads as the best score in
 * the league. A rate whose components are incomplete keeps yesterday's figure
 * rather than being rebuilt out of half of them.
 *
 * **It has a second caller and is named for what both of them mean.** It was
 * `withScoringPeriod` while adding today was the only thing it did;
 * `projection.ts` adds a *week's* worth of expected production the same way, and
 * every rule above holds for that bundle unchanged — most importantly the last
 * two, which are what stop a projection inventing a category the side cannot
 * score in or rebuilding a rate out of half its parts.
 */
export function withAddedComponents(
  scores: Record<number, number>,
  today: Record<number, number> | undefined,
  categories: EspnCategory[],
  /**
   * **Whether a *rate* absent from `scores` may be created from what is being
   * added**. It is the default for nobody now and passed by both callers, which
   * is a correction rather than a widening: it went in for the projection and
   * the live day turned out to have the same hole, one day of every week wide
   * (see `withLiveDay`, which passes it and then puts the narrower half of the
   * old rule back).
   *
   * The rule above — a category ESPN left out is one the side is ineligible for,
   * and adding a day's production must not put it back — is right about *today*
   * and wrong about *the end of the week*. At the start of a matchup period a
   * side has thrown no innings, so ESPN reports **no ERA and no WHIP**: there is
   * no denominator to divide by yet. Under the old rule the projection could
   * then never produce them either, and the card drew two of the ten categories
   * as blank for the whole first day of every week — reported as *"projections
   * are not including ERA/WHIP at the beginning of the matchup"*, which is
   * exactly what it was doing. A side that has not pitched yet is not
   * ineligible; it is early.
   *
   * **Only a `DERIVED` rate may be created, never a counting category**, which
   * keeps the identity this file is measured on ("0 categories invented where
   * the side has none") true where it was actually about something. ESPN sends
   * a counting stat as `0` from the first minute of a week — there is nothing to
   * divide — so a counting category that is genuinely absent is genuinely
   * ineligible, and creating one would be the fault the old rule names.
   *
   * **And the zero denominator is its own guard.** A rate is created only where
   * `DERIVED.of` returns a finite number, and every one of the nine returns
   * `null` on an empty denominator — so a side with no pitching to project
   * produces no ERA rather than a 0.00 that would read as the best score in the
   * league. The dangerous case cannot be reached from here.
   */
  createRates = false,
): Record<number, number> {
  if (!today) return scores;
  const merged = { ...scores };
  for (const [id, v] of Object.entries(today)) {
    const n = Number(id);
    if (DERIVED[n]) continue;
    if (merged[n] === undefined) {
      // A component the side has no figure for is still a component of a rate
      // that may be created. It is not a category, and neither caller puts one
      // on the wire — the projection's goes through `categoryScores` and the
      // live day's through `withLiveDay`, which keeps only what ESPN sent and
      // the categories the league scores.
      if (!createRates) continue;
      merged[n] = 0;
    }
    merged[n] += v;
  }
  for (const cat of categories) {
    const rule = DERIVED[cat.statId];
    if (!rule) continue;
    if (merged[cat.statId] === undefined && !createRates) continue;
    if (!rule.needs.every((n) => typeof merged[n] === 'number')) continue;
    const v = rule.of(merged);
    if (typeof v === 'number' && Number.isFinite(v)) merged[cat.statId] = v;
  }
  return merged;
}

/**
 * **Rebuild every scored rate the map is missing, from the components it has.**
 *
 * `withAddedComponents` does this as its last pass and *recomputes* — a day has
 * been added, so a rate ESPN already gave is stale and must be replaced. This
 * one only **fills gaps**: it is for the side that has no day to add, where
 * every figure ESPN sent is still current and the only thing to do is put back
 * the two it wrote as `Infinity`. It never overwrites a number ESPN sent.
 *
 * The zero-denominator guard is `DERIVED`'s own — every rule returns `null` on
 * one — so a side that has genuinely not pitched gets no ERA rather than a
 * `0.00` that would read as the best score in the league.
 */
function fillRates(
  merged: Record<number, number>,
  categories: EspnCategory[],
): Record<number, number> {
  for (const cat of categories) {
    const rule = DERIVED[cat.statId];
    if (!rule) continue;
    if (merged[cat.statId] !== undefined) continue;
    if (!rule.needs.every((n) => typeof merged[n] === 'number')) continue;
    const v = rule.of(merged);
    if (typeof v === 'number' && Number.isFinite(v)) merged[cat.statId] = v;
  }
  return merged;
}

/**
 * **ESPN's through-yesterday score with today's day added on, for the live
 * scoreboard** — `withAddedComponents` with the two things this caller needs
 * and `projection.ts`'s does not.
 *
 * ### The rebuild does not depend on there being a day
 *
 * **Everything below this heading was written for the side that *has* a live
 * day, and it left the side that has not with no rates at all.** The function
 * opened `if (!today) return scores;`, so a team whose clubs were all idle this
 * morning — `today?.[teamId]` undefined, which is the ordinary case at 10am —
 * skipped the whole rebuild and shipped ESPN's map exactly as it arrived. And
 * ESPN's map is precisely the thing that does not carry the two rates: they
 * come back flagged `ineligible` with the string `"Infinity"` and `sideFrom`
 * drops them on purpose, on the understanding that this function would put them
 * back.
 *
 * Which it did, on the day it was written, because on that day the read that
 * found it (19:49 ET) had a live day for every side. **Reported the next
 * morning as "ERA/WHIP aren't showing again"**, and measured on the live league
 * at 10:02 ET on 2026-08-25, mid-period-20: team 6 came back with
 * `OUTS 17 · ER 2 · H 6 · BB 2` and **no `41` and no `47`** — an ERA of
 * `2 × 9 ÷ (17/3) = 3.18` and a WHIP of `(6 + 2) ÷ (17/3) = 1.41` sitting
 * right there in the components, which is the pair the card had drawn the
 * afternoon before and was now drawing as `—`.
 *
 * So the day is optional and the rebuild is not: with a day it is
 * `withAddedComponents`, which recomputes every rate after adding; without one
 * it is `fillRates`, which fills the gaps and overwrites nothing. Every guard
 * the two paragraphs below describe is unchanged and holds on both paths —
 * `ineligible` is still honored, a counting category is still never created,
 * and an empty denominator still yields no figure at all.
 *
 * **It passes `createRates`**, and the reason that flag exists is the same one
 * read on the other surface of the same page. At the top of a week nobody has a
 * denominator, so ESPN has **no ERA and no WHIP** for anybody, and the standing
 * rule that today "can never invent" a category then withheld a figure a side
 * genuinely had. Reported as *"why am I not seeing ERA/WHIP for my current
 * matchup even though my opponent has a pitcher that's pitched 3 innings"*, and
 * measured on the live league at 19:49 ET on 2026-08-24, the first day of
 * period 20: team 12 had thrown **3.1 innings, 3 hits, no walks and no earned
 * runs** and the matchup card drew `—` against `—` for both rates — while the
 * **Rankings tab's `Current matchup` span, the same week off the same
 * components, drew `ERA 0.00 / WHIP 0.90`**. Two surfaces of one page
 * disagreeing about one week is what *The Rankings tab takes the same fix on
 * the same day* exists to prevent, and the rankings are the half that was
 * already right: `withRates` there rebuilds every rate from its components with
 * no such guard. So this is the scoreboard catching up rather than a new rule.
 *
 * **Measured through the route, before → after**, on the same six sides an hour
 * later: a side that has pitched goes from `— / —` to a figure (team 12,
 * 4.0 innings: `ERA 2.25 / WHIP 0.750`; team 9, 9.1: `2.89 / 1.286`), a side
 * that has not is unmoved (teams 6 and 1, no innings, both still `— / —`), and
 * the whole scoreboard payload goes **11,048 → 11,174 bytes**.
 *
 * **The two guards `createRates` carries hold here unchanged**, and they are
 * what make it safe rather than merely right this evening: only a `DERIVED`
 * rate may be created and never a counting category (ESPN sends those as `0`
 * from the first minute, so an absent one is genuinely ineligible), and every
 * `DERIVED.of` returns `null` on an empty denominator, so a side that has not
 * pitched gets no ERA rather than a `0.00` that would read as the best score in
 * the league. That is not reasoning about the dangerous case, it is the
 * measurement above: team 6, with no innings thrown, still has neither rate
 * after the change.
 *
 * **It moves the headline, and the movement is honest.** While one side has
 * pitched and the other has not, the two rates stop being *both* absent and
 * become absent on one side — which `tallyCategories` **skips** rather than
 * ties, that being its standing answer to a figure only one side has. So the
 * triple sums to eight for a few hours of a Monday (measured, team 6 against
 * team 12: `1-1-8` → `1-1-6`) where the both-absent tie made it sum to ten.
 * That is not the `0-0-8` the tie rule was written against: there the card
 * showed `—` against `—` and could not say whose the two categories were, and
 * here it shows `— ` against `2.25` and says so plainly. The moment the second
 * side throws an inning both rates are real on both sides and the category is
 * decided — measured on the same read, teams 9 and 4 both having pitched:
 * `3-0-7`/`0-3-7` → `3-2-5`/`2-3-5`, back to ten with ERA and WHIP among the
 * decided rather than among the ties. (All six tallies were recomputed off one
 * fetch, old rule against new, so no figure moved under the comparison.)
 *
 * **Two things it then takes back**, both because this caller ships `scores`
 * straight down the wire where the projection's goes through `categoryScores`
 * first:
 *
 * - **A category ESPN calls the side *ineligible* for stays out**, which is the
 *   half of the old rule that was right. Ineligible is not early: the side has
 *   the components either way, so nothing else here would stop the rate being
 *   built for it. **But ESPN spells the two the same**, and finding that out is
 *   what this change actually cost — see `sideFrom`, where a rate with no
 *   denominator arrives flagged `ineligible` with the string `"Infinity"` for a
 *   score. The scan that found `ineligible` false on 5,244 cells was over the
 *   **settled** periods, where both sides have pitched and the flag never
 *   appears; a live week's first day was never in it.
 * - **The components `createRates` invents are dropped again.** A day's bucket
 *   carries 80 stat ids where `scoreByStat` carries 23, so keeping them would
 *   put dozens of numbers a side on the wire that nothing reads — measured, the
 *   merged map came back with **48, 68 and 76 ids** on the three sides logged.
 *   What ESPN sent, plus the categories the league scores, is what survives:
 *   **21 keys a side before, 23 after** where the side has pitched (the two are
 *   its ERA and its WHIP) and 21 where it has not.
 *
 * **No cache version moves with this**, which is the rule about *what is
 * stored* rather than what is computed: `getMatchups` writes a blob only for a
 * frozen period, `today` is null on every frozen read, and this function
 * returns `scores` untouched when there is no day to add. A settled week is
 * therefore byte-identical, tally included, and `-v3` still describes it.
 */
function withLiveDay(
  scores: Record<number, number>,
  today: Record<number, number> | undefined,
  categories: EspnCategory[],
  ineligible: Set<number>,
): Record<number, number> {
  // **The day is optional and the rebuild is not**, which is the whole of the
  // fix below this function's own note. A side with no day to add still has
  // components ESPN sent and rates ESPN did not.
  const merged = today
    ? withAddedComponents(scores, today, categories, true)
    : fillRates({ ...scores }, categories);
  const scored = new Set(categories.map((c) => c.statId));
  const out: Record<number, number> = {};
  for (const [id, v] of Object.entries(merged)) {
    const n = Number(id);
    if (ineligible.has(n)) continue;
    if (scores[n] === undefined && !scored.has(n)) continue;
    out[n] = v;
  }
  return out;
}

function sideFrom(
  raw: EspnScheduleSide | undefined,
  live: boolean,
  today: Record<number, Record<number, number>> | null,
  categories: EspnCategory[],
): { teamId: number; scores: Record<number, number>; points: number | null } | null {
  if (!raw || typeof raw.teamId !== 'number') return null;
  const scores: Record<number, number> = {};
  /** The categories ESPN says this side genuinely **cannot score in** — kept
   *  rather than merely skipped, because `withLiveDay` may now build a rate the
   *  side has no figure for, and this is the one absence it must not fill. */
  const ineligible = new Set<number>();
  for (const [id, cell] of Object.entries(raw.cumulativeScore?.scoreByStat ?? {})) {
    if (!cell) continue;
    if (cell.ineligible === true) {
      /**
       * **`Infinity` is an empty denominator, not an ineligibility**, and the
       * two arrive wearing the same flag. Measured on the live league at 19:58
       * ET on 2026-08-24, the first day of period 20, on all six matchups and
       * both sides: the ERA and WHIP cells come back
       * `{"ineligible":true,"rank":0,"result":"TIE","score":"Infinity"}` —
       * a *string*, which is why `typeof cell.score !== 'number'` had been
       * dropping them silently and why they were recorded as "absent
       * altogether" rather than present and unusable. (ESPN's own `result` on
       * that cell is `TIE`, which is the verdict `tallyCategories` reaches
       * independently for two absences.)
       *
       * A side that has not pitched is early, not ineligible — the distinction
       * `withAddedComponents`' `createRates` is built on — so this is left out
       * of the set and the rate is rebuilt from the components instead. Without
       * this test the guard below would withhold exactly the figure the guard's
       * own caller exists to produce: the fix was written, measured, and drew
       * `—` against `—` all over again.
       *
       * Anything else ESPN calls ineligible is taken at its word and stays out,
       * which is the rule as it was: a category a side cannot score in is not
       * one it is losing, and a zero in a `lowerBetter` category would read as
       * the best score in the league.
       */
      /**
       * **And a *rate* ESPN sent a number for is a number, whatever the flag
       * says.** This is the second thing found out about `ineligible`, and it
       * goes further than the first: on the live league the flag is not merely
       * overloaded, it is **anti-correlated** with the thing it is supposed to
       * mean.
       *
       * Read straight off ESPN at 10:14 ET on 2026-08-25, period 20, all six
       * matchups, the ERA and WHIP cells:
       *
       * | team | outs | ERA cell |
       * | --- | --- | --- |
       * | 12 | 38 | `score 4.263, ineligible true, result TIE` |
       * | 6 | 17 | `score 3.176, ineligible true, result TIE` |
       * | 1 | 21 | `score 0, ineligible true, result TIE` |
       * | 7 | 22 | `score 2.455, ineligible false` |
       * | 10 | 35 | `score 8.486, ineligible false` |
       * | 11 | **0** | `score "Infinity", ineligible false` |
       *
       * Six sides with real innings and real figures are flagged; the one side
       * with **no denominator at all** is not. Team 1's `0` is the case the old
       * rule was written to fear — *a zero in a `lowerBetter` category would
       * read as the best score in the league* — and it is a genuine 0.00 ERA
       * over seven innings, which is exactly what the best score in the league
       * looks like.
       *
       * **The pattern is which matchup the cell is in, not what the side can
       * score.** Period 20 is a playoff round: three contested matchups and six
       * byes. Every rate cell in the **three contested** ones is
       * `ineligible: true` with `result: TIE`; every rate cell on the **six
       * byes** is `ineligible: false`. So the flag tracks *being part of a
       * comparison*, which is not eligibility and is not something this app has
       * any use for. The league's own settings were checked for the innings
       * minimum that would explain a real ineligibility: there is none,
       * `scoringItems` carrying no threshold on any of the ten.
       *
       * So for a `DERIVED` rate the flag carries nothing usable and the score
       * does. Taking it is also the *safe* direction, because the guard the old
       * rule really wanted is structural rather than a flag: a rate with no
       * denominator arrives as `"Infinity"` and is caught one line up.
       *
       * **A counting category is untouched by this** and is still taken at its
       * word — those have no denominator to be undefined, so a flagged one is
       * genuinely a category the side cannot score in, and the old rule is
       * exactly right about it.
       *
       * **It moves the headline, and the movement is stated rather than
       * hidden.** Those cells carry ESPN's own `result: TIE`, and with the
       * figures in hand `tallyCategories` now *decides* them instead — measured
       * on the same read, team 12 against team 6 went `7-0-3` / `0-7-3` to
       * **`8-1-1` / `1-8-1`**, ERA to team 6 (3.18 against 4.26) and WHIP to
       * team 12 (1.184 against 1.412), with the ties falling from three to one
       * and the triple still summing to ten.
       *
       * That is a deliberate disagreement with a live cell, and the reason to
       * back this file's own arithmetic over ESPN's flag is on the table above:
       * the same cell that says `TIE` says `ineligible` about a 0.00 ERA over
       * seven innings, and the league has no rule that would make either true.
       * The computation doing the deciding is the one checked against ESPN on
       * **1,080 of 1,080** category comparisons over eighteen settled periods,
       * where these flags are clean and the two agree.
       */
      if (DERIVED[Number(id)] && typeof cell.score === 'number') {
        scores[Number(id)] = cell.score;
        continue;
      }
      if (String(cell.score) !== 'Infinity') ineligible.add(Number(id));
      continue;
    }
    if (typeof cell.score !== 'number') continue;
    scores[Number(id)] = cell.score;
  }
  const points = live ? raw.totalPointsLive ?? raw.totalPoints : raw.totalPoints;
  return {
    teamId: raw.teamId,
    scores: withLiveDay(scores, today?.[raw.teamId], categories, ineligible),
    points: typeof points === 'number' ? points : null,
  };
}

/**
 * **How many categories one side is winning, losing and tying** — the whole of
 * what a categories matchup's headline is.
 *
 * ESPN fills its own `result` and its wins/losses/ties tally only once a matchup
 * is **over**, so a live one comes back `UNDECIDED` with zeroes and a page that
 * reported only ESPN's answer would say nothing about the week anybody is
 * looking at. This is therefore computed here for live and final alike, and the
 * computed answer was checked against ESPN's on **1,080 of 1,080** category
 * comparisons over the live league's eighteen settled periods.
 *
 * **Exported so the projection's tally is this one.** `projection.ts` compares
 * two *projected* sides, and it must reach the same verdict from the same
 * numbers as the card it replaces — one function rather than two that agree
 * today. `lowerBetter` is honored here, so ERA and WHIP need no case anywhere
 * else.
 *
 * **A category *neither* side has a figure for is a tie; one only one side has
 * is skipped.** The two absences are different facts and the split is the whole
 * of the rule. A side ESPN reports as *ineligible* for a category is absent
 * from `scores` by `sideFrom`'s own rule, and counting that as a loss is the
 * fault the skip exists to prevent — but it is a fact about **one** side, so
 * the other still has its figure and the skip still answers it.
 *
 * Both sides absent is the other thing entirely, and it is the first minute of
 * every week: a side that has thrown no innings has no denominator, so ESPN
 * reports **no ERA and no WHIP** for either of them (see `withAddedComponents`,
 * where the projection's own version of this was already found and answered).
 * Measured on the live 12-team league at the top of period 20, every one of the
 * six matchups: `scoreByStat` carries all eight counting and OPS categories as
 * `0` from the first minute — ESPN having nothing to divide — and carries
 * neither 47 (ERA) nor 41 (WHIP) at all. Skipped, the headline read **0-0-8**
 * on a ten-category league, which says two of the ten are somebody's and does
 * not say whose. Level on nothing is what they actually are, so they are level:
 * **0-0-10**.
 *
 * Which also means **only a rate can reach the tie**, and that is what keeps
 * the ineligibility rule intact rather than merely mostly intact: a counting
 * category ESPN sends as `0` from the first minute is present, so a counting
 * category that is genuinely absent is genuinely ineligible — and it is
 * ineligible for one side, not for both.
 */
export function tallyCategories(
  mine: Record<number, number>,
  theirs: Record<number, number>,
  categories: EspnCategory[],
): { wins: number; losses: number; ties: number } {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const cat of categories) {
    const h = mine[cat.statId];
    const a = theirs[cat.statId];
    const hasH = typeof h === 'number';
    const hasA = typeof a === 'number';
    if (!hasH && !hasA) {
      ties++;
      continue;
    }
    if (!hasH || !hasA) continue;
    if (h === a) ties++;
    else if (cat.lowerBetter ? h < a : h > a) wins++;
    else losses++;
  }
  return { wins, losses, ties };
}

async function fetchMatchups(
  creds: EspnCreds,
  period: number,
  categories: EspnCategory[],
  live: boolean,
  span: { first: number; last: number } | null,
  acquisitions: Map<number, Record<string, number>>,
): Promise<EspnMatchup[]> {
  const data = await leagueGet<EspnScoreboardResponse>(creds, ['mScoreboard'], 0, {
    schedule: { filterMatchupPeriodIds: { value: [period] } },
  });

  /**
   * The day `cumulativeScore` leaves out — read only for the week being played,
   * and only when ESPN's own latest day falls **inside** that week.
   *
   * That guard is what makes the boundary safe at the rollover rather than
   * merely right this afternoon. ESPN's nightly batch (03:39–05:19 ET, measured
   * under *The anchor is derived from ESPN's calendar*) folds the finished day
   * into `cumulativeScore` and advances `latestScoringPeriod` to the new one —
   * which by then belongs to the *next* matchup period, falls outside this
   * span, and so is not added. A settled week therefore never has a day put
   * back on it, and no day is ever counted twice.
   *
   * A failed read costs the live day and leaves the week standing, which is the
   * direction every read in this file fails in.
   */
  const latest = data.status?.latestScoringPeriod;
  const wantsToday =
    live && typeof latest === 'number' && span != null && latest >= span.first && latest <= span.last;
  const today = wantsToday
    ? await dayTotals(creds, period, latest, 'live').catch((err: Error) => {
        console.error(`ESPN live day ${latest} unavailable for league ${creds.leagueId}:`, err.message);
        return null;
      })
    : null;

  const out: EspnMatchup[] = [];
  for (const m of data.schedule ?? []) {
    const home = sideFrom(m.home, live, today, categories);
    if (!home) continue;
    const away = sideFrom(m.away, live, today, categories);

    const { wins: hw, losses: aw, ties: tie } = away
      ? tallyCategories(home.scores, away.scores, categories)
      : { wins: 0, losses: 0, ties: 0 };

    // ESPN's own word where it has one; ours where it doesn't, so a live
    // matchup reads the same way a final one does. Both are the same
    // comparison — see the 108-matchup check above.
    let winner: 'home' | 'away' | 'tie' | null;
    if (away === null) winner = 'home';
    else if (m.winner === 'HOME') winner = 'home';
    else if (m.winner === 'AWAY') winner = 'away';
    else if (m.winner === 'TIE') winner = 'tie';
    else if (live) winner = null;
    else winner = hw > aw ? 'home' : aw > hw ? 'away' : 'tie';

    /**
     * **Absent means none**, not unknown: `matchupAcquisitionTotals` carries a
     * key only for the periods a manager actually moved in, so a quiet week is
     * a missing key rather than a zero. Null is kept for the team ESPN reported
     * no counter for at all, which is a different fact and draws nothing.
     */
    const used = (side: { teamId: number }) => {
      const totals = acquisitions.get(side.teamId);
      return totals ? totals[String(period)] ?? 0 : null;
    };
    out.push({
      id: m.id ?? 0,
      home: { ...home, wins: hw, losses: aw, ties: tie, acquisitions: used(home) },
      away:
        away === null
          ? null
          : { ...away, wins: aw, losses: hw, ties: tie, acquisitions: used(away) },
      winner,
    });
  }
  return out;
}

async function getMatchups(
  creds: EspnCreds,
  period: number,
  categories: EspnCategory[],
  live: boolean,
  /** The scoring periods this matchup period covers, so the live read can tell
   *  whether ESPN's latest day belongs to the week it is building. Null where
   *  the schedule could not place the period, which costs the live day and
   *  nothing else. */
  span: { first: number; last: number } | null,
  /** Team id → matchup period → acquisitions used, off the standings read this
   *  scoreboard is assembled beside. */
  acquisitions: Map<number, Record<string, number>>,
  force = false,
): Promise<EspnMatchup[]> {
  const key = `${creds.leagueId}:${period}`;
  const frozen = !live;
  const stale = force && !frozen;
  const hit = scoreboardCache.get(key);
  // A settled week is read back with no freshness test at all; the week being
  // played is a minute old at most, which is what makes the page live.
  if (!stale && hit && (frozen || Date.now() - hit.fetchedAt < LIVE_TTL_MS)) {
    return hit.matchups;
  }
  const running = scoreboardInFlight.get(key);
  if (running && !stale) return running;

  const job = (async () => {
    if (frozen) {
      // No freshness test: the week is over and what happened in it is a fact.
      const stored = await readJsonBlob<EspnMatchup[]>(
        scoreboardBlobKey(creds.leagueId, period),
        () => true,
      );
      if (Array.isArray(stored)) {
        scoreboardCache.set(key, { matchups: stored, fetchedAt: Date.now() });
        return stored;
      }
    }
    const matchups = await fetchMatchups(creds, period, categories, live, span, acquisitions);
    scoreboardCache.set(key, { matchups, fetchedAt: Date.now() });
    if (frozen) await writeJsonBlob(scoreboardBlobKey(creds.leagueId, period), matchups);
    return matchups;
  })().finally(() => {
    scoreboardInFlight.delete(key);
  });

  scoreboardInFlight.set(key, job);
  return job;
}

/** A scoring period as an ET calendar date — the anchor's arithmetic run the
 *  other way round. Null when the schedule could not be read, which costs the
 *  header its dates and nothing else. */
async function dateForPeriod(period: number): Promise<string | null> {
  if (!Number.isInteger(period) || period < 1) return null;
  const anchor = await getPeriodAnchor();
  return anchor ? addDays(anchor.date, period - anchor.period) : null;
}

/**
 * The whole view: one matchup period's scoreboard and the league's standings.
 *
 * `period` names a matchup period to look at; absent it is the one being
 * played. `force` is `Refresh from ESPN` reaching this far, and it drops
 * **every** period of the league from memory — the rule `getOwnership` states,
 * since "read my league again" is about the league rather than about a week —
 * while the frozen blobs stand, because a settled week cannot have changed.
 */
export async function getScoreboard(
  creds: EspnCreds,
  period?: number | null,
  force = false,
): Promise<EspnScoreboard> {
  if (force) {
    const prefix = `${creds.leagueId}:`;
    for (const k of [...scoreboardCache.keys()]) {
      if (k.startsWith(prefix)) scoreboardCache.delete(k);
    }
  }
  const meta = await leagueMeta(creds, force);
  const current =
    meta.currentPeriod ??
    (meta.periods.length > 0 ? meta.periods[meta.periods.length - 1].period : null);
  // A period the schedule has no row for is not a period this league has, so
  // it falls back to the current one rather than answering with an empty
  // scoreboard the reader has no way to explain.
  const asked = period != null && meta.periods.some((p) => p.period === period) ? period : current;

  const at = meta.periods.findIndex((p) => p.period === asked);
  const span = at >= 0 ? meta.periods[at] : null;
  const live = asked !== null && asked === current;

  // The whole period as well as the observed part of it — see
  // `EspnScoreboard.fullEnd`. `declaredDays` is `getMatchupWindow`'s own, so
  // the two readings of a period cannot come to disagree; a settled period
  // observes its whole length and the pair is one date twice.
  const fullLast =
    span && span.first
      ? span.first +
        Math.max(span.last - span.first + 1, declaredDays(meta.settings, asked as number)) -
        1
      : null;
  const [start, end, fullEnd] = await Promise.all([
    span && span.first ? dateForPeriod(span.first) : Promise.resolve(null),
    span && span.last ? dateForPeriod(span.last) : Promise.resolve(null),
    fullLast ? dateForPeriod(fullLast) : Promise.resolve(null),
  ]);

  // Every period, dated by the very same two calls — written as one expression
  // over `meta.periods` rather than beside the pair above, so the week the
  // header is on and the week's own row in the list cannot come to print
  // different days. `dateForPeriod` awaits one cached anchor and then does
  // arithmetic, so the whole list is that one await.
  const periods: EspnPeriodSpan[] = await Promise.all(
    meta.periods.map(async (p) => ({
      period: p.period,
      start: p.first ? await dateForPeriod(p.first) : null,
      end: p.last ? await dateForPeriod(p.last) : null,
    })),
  );

  // A league with no matchups at all is not a league whose matchups failed to
  // read: `standings` and `unknown` are both answered with the table alone.
  const matchups =
    asked === null || meta.format === 'standings' || meta.format === 'unknown'
      ? []
      : await getMatchups(
          creds,
          asked,
          meta.categories,
          live,
          span ? { first: span.first, last: span.last } : null,
          meta.acquisitions,
          force,
        );

  return {
    format: meta.format,
    scoringType: meta.scoringType,
    matchupPeriod: asked ?? 0,
    /** How many acquisitions a manager gets in this period — one number for the
     *  whole board, since the limit is the period's rather than the team's. See
     *  `acquisitionLimitFor` for how it is derived and what it was checked
     *  against. Null where the league does not limit them per period, which is
     *  what makes the client draw a bare count instead of `5/10`. */
    acquisitionLimit: acquisitionLimitFor(
      meta.settings ?? undefined,
      asked ?? 0,
      span ? span.last - span.first + 1 : 0,
    ),
    prevPeriod: at > 0 ? meta.periods[at - 1].period : null,
    nextPeriod: at >= 0 && at < meta.periods.length - 1 ? meta.periods[at + 1].period : null,
    periods,
    start,
    end,
    fullEnd,
    live,
    categories: meta.categories,
    matchups,
    teams: meta.teams,
    myTeamId: meta.myTeamId,
    leagueName: meta.leagueName,
    fetchedAt: Date.now(),
  };
}

// ---- A category over the days of a matchup period -------------------------
//
// **A scoreboard cell is one number and the week that produced it is not.** `R
// 31–23` says who is ahead and nothing about how: a lead built on the Monday
// and defended since reads identically to one taken on the Saturday, and the
// second is the one a manager can still do something about. So each category
// cell opens a chart of that category **day by day, both sides** — and the
// whole of the work was establishing whether ESPN can answer for a day at all.
//
// **It cannot, four ways, and each was measured rather than assumed** (all
// figures the live 12-team league, matchup period 18, scoring periods
// 132–138):
//
//  - **`cumulativeScore` is not parameterised by `scoringPeriodId`.** This is
//    the one that would have made the series free and authoritative — one read
//    per day of ESPN's own running total, no summation of ours anywhere. It is
//    a fact about the **matchup** period and nothing else: asked at
//    `scoringPeriodId` 0, 132, 134, 136, 138 and 146 the same matchup comes
//    back with **byte-identical scores every time** (`R 32 · HR 13 · RBI 28 ·
//    K 45 · ERA 4.43283582`). What the day *does* change is the payload —
//    23,511 bytes at a day outside the period against 521–579KB at one inside
//    it, which is the two rosters `scoringPeriodId=0` empties.
//  - **A response carries exactly one day's stat lines.** The obvious escape —
//    read one day and take the whole week out of it — does not exist: over the
//    28 roster entries of one side, every stat line present is
//    `scoringPeriodId/statSourceId/statSplitTypeId` = **`136/0/5` and nothing
//    else**, 28 of 28.
//  - **`filterStatsForTopScoringPeriodIds` is a 400**, as it already is on the
//    Rankings tab's own probe table.
//  - **`schedule.filterScoringPeriodIds` is ignored** — 125,723 bytes and the
//    same single day back, whatever it names. So is
//    `filterStatsForSplitTypeIds` on `mScoreboard`, which still empties the
//    roster.
//  - **`mBoxscore` is `mScoreboard` under another name** — 577,813 bytes, one
//    day, both roster forms.
//
// **So a day is one read, and the series is the days summed** — which is
// `scoringPeriodTotals`' own arithmetic, already validated at 120 of 120 cells
// against ESPN's final `cumulativeScore`, and re-validated here: summing the
// seven days of period 18 reproduces every one of its **120 category cells**,
// worst delta **4.86e-9** (which is ESPN's own eight-decimal rounding of an
// OPS, not a disagreement). So the chart's last point *is* the number on the
// card above it, by construction on a settled week and by the same summation on
// a live one.
//
// **Counting stats add and rates are rebuilt**, the rule `getSpanTotals` and
// `withScoringPeriod` both obey: the running figure for ERA on day four is
// four days of earned runs over four days of outs, never four ERAs averaged.
// Every `DERIVED` id is recomputed from the running components at each day.
//
// **What it costs**, measured through the route on the live league: a settled
// seven-day week is **797,498 bytes and 1,588ms** the first time and nothing
// upstream ever again, the seven days being frozen blobs from then on. The
// week being played is that plus one live day per minute. It is why this is a
// route of its own rather than a field on `/api/espn/scoreboard`: a payload
// every reader of the League page fetches has no business carrying a week of
// rosters for a chart nobody may open.

/** One day of a matchup period, and whether it could be read at all. */
export interface EspnSeriesDay {
  scoringPeriod: number;
  /** Its ET calendar date, or null where the period anchor could not be read —
   *  which costs the axis its dates and nothing else. */
  date: string | null;
  /** False for a day ESPN would not answer for. Every point from there on is
   *  null, the cumulative past a hole being genuinely unknowable — see
   *  `getMatchupSeries`. */
  ok: boolean;
}

export interface EspnMatchupSeries {
  matchupPeriod: number;
  days: EspnSeriesDay[];
  /** Team id → stat id → the running figure **after** each day, index-aligned
   *  with `days`. Null is "not known", never zero: a category with no
   *  denominator yet (an ERA before anybody has thrown an out) and a day that
   *  could not be read both read as a gap rather than as a figure. */
  teams: Record<number, Record<number, (number | null)[]>>;
  fetchedAt: number;
}

const seriesCache = new Map<string, { value: EspnMatchupSeries; fetchedAt: number }>();
const seriesInFlight = new Map<string, Promise<EspnMatchupSeries>>();

/** One matchup period's days read at a time, capped the way every fan-out in
 *  this file is: a fortnight's playoff round is 14 reads against an upstream
 *  that has no idea we are doing it. */
const SERIES_CONCURRENCY = 6;

/**
 * A matchup period's categories, day by day, for every team in it.
 *
 * Keyed by team and stat rather than by matchup, so one read serves every card
 * on the board — which is what makes it worth a request at all: the ten cards
 * of a 12-team league are six matchups over the same twelve teams and the same
 * ten categories.
 *
 * **The span is clamped to the day ESPN is on**, so a period that declares more
 * days than have been played is never asked for a day that has not happened.
 * On a settled period that is the period's own last day; on the live one it is
 * `latestScoringPeriod`, which is the same day the scoreboard adds to
 * `cumulativeScore` — so the two agree about where the week has got to.
 *
 * **A day that cannot be read stops the series rather than being skipped.**
 * Every figure here is a running total, so a hole in the middle of it is not a
 * missing point but a wrong one for every day after it: the sum would be short
 * by that day's production with nothing on screen to say so. So the first
 * failure marks its own day `ok: false` and every point from there is null, and
 * the chart draws the days it actually knows.
 */
export async function getMatchupSeries(
  creds: EspnCreds,
  period?: number | null,
  force = false,
): Promise<EspnMatchupSeries> {
  const meta = await leagueMeta(creds, force);
  const current =
    meta.currentPeriod ??
    (meta.periods.length > 0 ? meta.periods[meta.periods.length - 1].period : null);
  const asked = period != null && meta.periods.some((p) => p.period === period) ? period : current;
  const at = meta.periods.findIndex((p) => p.period === asked);
  const span = at >= 0 ? meta.periods[at] : null;
  const live = asked !== null && asked === current;

  if (asked === null || span === null || meta.format !== 'h2h-categories') {
    return { matchupPeriod: asked ?? 0, days: [], teams: {}, fetchedAt: Date.now() };
  }

  const key = `${creds.leagueId}:${asked}`;
  const frozen = !live;
  const stale = force && !frozen;
  const hit = seriesCache.get(key);
  if (!stale && hit && (frozen || Date.now() - hit.fetchedAt < LIVE_TTL_MS)) return hit.value;
  const running = seriesInFlight.get(key);
  if (running && !stale) return running;

  const job = (async () => {
    const latest = meta.latestScoringPeriod;
    const last = typeof latest === 'number' ? Math.min(span.last, latest) : span.last;
    const periods: number[] = [];
    for (let sp = span.first; sp <= last; sp++) periods.push(sp);

    const read = await mapLimit(periods, SERIES_CONCURRENCY, async (sp) => {
      // Every day but ESPN's own latest is finished — and a finished day is a
      // fact only once its **week** is over, `REVISION_TTL_MS` being what a
      // finished day inside the live one is believed for instead.
      const done = typeof latest === 'number' ? sp < latest : true;
      const freeze: DayFreeze = !done ? 'live' : live ? 'revisable' : 'settled';
      try {
        return { totals: await dayTotals(creds, asked, sp, freeze), ok: true };
      } catch (err) {
        console.error(
          `ESPN day ${sp} unavailable for league ${creds.leagueId}:`,
          (err as Error).message,
        );
        return { totals: {} as DayTotals, ok: false };
      }
    });

    const dates = await Promise.all(periods.map((sp) => dateForPeriod(sp)));
    // A hole poisons everything after it: see the note above.
    const firstBad = read.findIndex((r) => !r.ok);
    const good = firstBad === -1 ? read.length : firstBad;

    const days: EspnSeriesDay[] = periods.map((sp, i) => ({
      scoringPeriod: sp,
      date: dates[i],
      ok: i < good,
    }));

    const teamIds = meta.teams.map((t) => t.id);
    const teams: Record<number, Record<number, (number | null)[]>> = {};
    for (const teamId of teamIds) {
      // The running components, which the rates are rebuilt out of at every
      // day rather than added.
      const run: Record<number, number> = {};
      const out: Record<number, (number | null)[]> = {};
      for (const cat of meta.categories) out[cat.statId] = [];
      for (let i = 0; i < periods.length; i++) {
        if (i < good) {
          for (const [id, v] of Object.entries(read[i].totals[teamId] ?? {})) {
            run[Number(id)] = (run[Number(id)] ?? 0) + v;
          }
        }
        for (const cat of meta.categories) {
          if (i >= good) {
            out[cat.statId].push(null);
            continue;
          }
          const rule = DERIVED[cat.statId];
          if (!rule) {
            out[cat.statId].push(run[cat.statId] ?? 0);
            continue;
          }
          const v = rule.needs.every((n) => typeof run[n] === 'number') ? rule.of(run) : null;
          out[cat.statId].push(typeof v === 'number' && Number.isFinite(v) ? v : null);
        }
      }
      teams[teamId] = out;
    }

    const value: EspnMatchupSeries = {
      matchupPeriod: asked,
      days,
      teams,
      fetchedAt: Date.now(),
    };
    seriesCache.set(key, { value, fetchedAt: Date.now() });
    return value;
  })().finally(() => {
    seriesInFlight.delete(key);
  });

  seriesInFlight.set(key, job);
  return job;
}

/**
 * **The days this matchup period covers, and the days the next one covers** —
 * what the Schedule view's two named spans are, and the one league fact that
 * neither the scoreboard nor the status route can answer.
 *
 * `getScoreboard` publishes a `start` and an `end` and they are the wrong
 * dates for this: they are the **observed** span, the scoring periods
 * `pointsByScoringPeriod` actually reports, which for the period being played
 * **truncates at ESPN's own current day**. A forward-looking view asked for
 * "this matchup" and would have been handed a window ending today. And
 * `nextPeriod` is null on the current period by construction — ESPN
 * materialises no future matchup period at all — so next matchup is not in
 * that payload in any form.
 *
 * **So both are derived, by `acquisitionLimitFor`'s own rule one step further
 * on**: a period is at least as long as the larger of what has been observed
 * of it (a lower bound, since it truncates) and what the league declares
 * (`scheduleSettings.matchupPeriods`, which maps a period to the *weeks* it
 * covers — `{"19": [19, 20]}` is a fortnight). The next period then begins on
 * the day after this one ends, because **matchup periods are contiguous**, and
 * runs for its own declared weeks.
 *
 * **Checked against the live league rather than reasoned about.** Over its 19
 * materialised periods the observed spans are contiguous with **0 gaps**
 * (`first(p+1) === last(p) + 1` on all 18 joins), and the declaration never
 * overstates an observation — 7 against 7 on the ordinary weeks, 7 against the
 * 12 of period 1 (the season opened mid-week) and the 14 of period 15 (the
 * All-Star break falls inside it). So `max(observed, declared)` reproduces
 * **every settled period exactly**, and on the live one it is the declaration
 * that corrects the truncation: period 19 observed 139–145 (seven days, cut at
 * today) and declared a fortnight reads 139–152, which is Aug 10 – Aug 23.
 *
 * **Which is also the honest failure**, and it is worth naming: a period that
 * is *longer* than it declares and is still being played — period 15's
 * fortnight, mid-break — reads short until observation catches it up. It errs
 * toward showing fewer days than the period has, never more, and it corrects
 * itself day by day.
 *
 * `matchupPeriods` declares **every period of the season** (1…21 on the live
 * league, past the 19 the schedule has materialised), so whether there *is* a
 * next matchup is that key existing rather than a guess.
 */
export interface EspnMatchupWindow {
  /** The period being played. */
  period: number;
  /** Its first and last ET day, `YYYY-MM-DD` — the whole period, not the part
   *  of it that has been played. */
  start: string;
  end: string;
  /** The one after it, absent past the last period the league has. */
  next: { period: number; start: string; end: string } | null;
}

/** A period's declared length in scoring periods — its weeks × 7, and 7 for a
 *  period the settings do not name (which is the ordinary week and the safe
 *  reading of a payload that has left one out). */
function declaredDays(
  settings: EspnScoreboardResponse['settings'] | null,
  period: number,
): number {
  const weeks = settings?.scheduleSettings?.matchupPeriods?.[String(period)]?.length;
  return (typeof weeks === 'number' && weeks > 0 ? weeks : 1) * 7;
}

export async function getMatchupWindow(
  creds: EspnCreds,
  force = false,
): Promise<EspnMatchupWindow | null> {
  const meta = await leagueMeta(creds, force);
  const current =
    meta.currentPeriod ??
    (meta.periods.length > 0 ? meta.periods[meta.periods.length - 1].period : null);
  if (current === null) return null;
  const span = meta.periods.find((p) => p.period === current);
  if (!span || !span.first) return null;

  const len = Math.max(span.last - span.first + 1, declaredDays(meta.settings, current));
  const last = span.first + len - 1;
  // A period past the season's own last scoring period is a period that does
  // not exist — the same clamp `finalScoringPeriod` is published for.
  const final = meta.settings?.scheduleSettings?.matchupPeriods
    ? Object.prototype.hasOwnProperty.call(
        meta.settings.scheduleSettings.matchupPeriods,
        String(current + 1),
      )
    : false;
  const nextFirst = last + 1;
  const nextLast = nextFirst + declaredDays(meta.settings, current + 1) - 1;

  const [start, end, nextStart, nextEnd] = await Promise.all([
    dateForPeriod(span.first),
    dateForPeriod(last),
    final ? dateForPeriod(nextFirst) : Promise.resolve(null),
    final ? dateForPeriod(nextLast) : Promise.resolve(null),
  ]);
  // The anchor is what dates any of this, and it answers with a pair or with
  // null — so a failed schedule read costs the two spans and nothing else, the
  // rule the whole of this file's period arithmetic follows.
  if (!start || !end) return null;
  return {
    period: current,
    start,
    end,
    next:
      nextStart && nextEnd ? { period: current + 1, start: nextStart, end: nextEnd } : null,
  };
}

// ---- The Rankings tab: where each team stands, category by category ------
//
// **The season table the League page opened with was the raw values, and a
// value is only half of what a manager wants from it.** 232 home runs is a lot
// or a little depending on the eleven teams beside it, and the reader was
// doing that comparison by eye down a column of twelve. So the table is drawn
// again with the *rank* under each value — the values kept, because a rank
// with no number behind it cannot be acted on.
//
// **Which spans can be answered honestly, and the one thing that decided it.**
// The obvious way to cut a season into halves is to ask ESPN for one, and ESPN
// will not:
//
//  - `mTeam`'s `valuesByStat` is the **season** and only the season. Naming a
//    `scoringPeriodId` leaves it byte-identical (checked, sp=100 against the
//    bare read), and every span filter there is comes back **400**:
//    `filterStatsForTopScoringPeriodIds`, `filterScoringPeriodIds`,
//    `filterStatsForMatchupPeriodIds`, `filterStatsForSplitTypeIds` and
//    `filterStatsForExternalIds` were each tried and each rejected outright.
//  - `mTransactions2`-style paging does not apply, and `mStandings` carries an
//    `id` and nothing else (already recorded above).
//
// **What does answer it is `mScoreboard`'s own `scoreByStat`, which carries
// more than the league's scoring categories.** That was the measurement that
// opened this up: a matchup period's `scoreByStat` holds **all 23 stats
// `valuesByStat` holds** — the *components* (AB, H, 2B, 3B, HR, BB, HBP, SF,
// outs, hits and walks allowed, earned runs) as well as the ten this league
// actually scores. So a span is the sum of its matchup periods: the counting
// stats add, and the rate categories are **recomputed from the summed
// components** rather than averaged, which would be wrong in exactly the way
// averaging sixty daily barrel rates is wrong in `statcastWindow.ts`.
//
// **Verified against the one span ESPN does publish**, which is the check this
// design turns on: summing `scoreByStat` over a prefix of matchup periods
// reproduces every team's `valuesByStat` **exactly — all 12 teams, all 20
// counting stats to the unit, and OPS, WHIP and ERA to within 5e-9** on all 36
// of them. The prefix is 1..18 for eight teams and 1..19 for four, and that is
// an ESPN quirk rather than a fault in the arithmetic: the four are the ones in
// the winners' bracket in the live period 19, whose stats ESPN counts toward
// the season line while the consolation ladder's are not yet. Every team is
// reproduced by *some* prefix, to machine precision, which is what makes the
// summation trustworthy.
//
// **So all four spans are served and none is faked.** What *is* refused is a
// category with no derivation from the components in hand — opponent batting
// average, runs created — which comes back null and is dashed rather than
// summed as though it were a count.

/**
 * The five cuts the Rankings tab offers, in the order it lists them —
 * `matchup` leads and is the default — **and `week`, which is not one of
 * them.**
 *
 * `week` is what the tab's own bar produces: one matchup period the reader
 * picked off the league's calendar, which is a cut of the same shape as
 * `matchup` and a different *kind* of thing from the other four. It is
 * deliberately **absent from `spans`**, the list the strip is drawn from — the
 * strip offers the five named cuts, and there are nineteen weeks — so nothing
 * downstream has to special-case a strip entry that would have to be relabeled
 * every time the reader moved.
 *
 * **The week being played is not a `week`.** A reader who picks it off the list
 * gets `matchup`, which is the *rule* "the week being played" rather than the
 * range that week happens to be — the same reason the scoreboard's `mp=` is
 * absent on the current period. So a `week` is always a settled one, which is
 * also why it is never `projectable`.
 */
export type EspnRankSpan = 'season' | 'matchup' | 'first' | 'second' | 'playoffs' | 'week';

/** One span, as the tab strip needs it: what it is called and what it covers. */
export interface EspnRankSpanInfo {
  span: EspnRankSpan;
  label: string;
  /** The matchup periods it is made of — `[first, last]`, or null for the
   *  season, which is ESPN's own figure rather than a range this file summed. */
  periods: [number, number] | null;
  /** ET calendar days, where the anchor could date them. */
  start: string | null;
  end: string | null;
  /** Whether the numbers include a week still being played, which is what
   *  makes the difference between a total and a total *so far*. */
  live: boolean;
}

/**
 * **How a team stands across one whole side of the ball**, which is the one
 * question a column of ten ranks cannot answer at a glance: a manager reading
 * `2nd · 5th · 1st · 9th · 3rd` down his batting run is doing the arithmetic in
 * his head, and the arithmetic has a name.
 *
 * **`points` is the league's own currency** — roto points, `n + 1 − rank`
 * summed over that side's categories, so first place in a twelve-team category
 * is worth 12 and last is worth 1. It is the right number rather than a mean of
 * ranks for three reasons: it is what every categories league already scores
 * its standings in, it goes **up** with quality like every other value in this
 * table (a rank goes down, which would put one column in the table reading
 * backwards), and it handles a tie without a special case, two teams sharing a
 * rank sharing its points.
 *
 * **The direction is already baked in**, so a `lowerBetter` category needs no
 * case of its own: `rankBy` has made 1 the best ERA and the most home runs
 * alike, and `n + 1 − rank` is worth the same either way.
 *
 * **A tie shares the better points, and that is deliberate rather than a
 * rounding of roto's own convention** — which splits them, giving two teams
 * tied for first 11.5 each. This column is computed from the ranks printed
 * beside it, and those share a rank and skip the next (1, 2, 2, 4) because that
 * is what every league table does; a reader adding up the ranks he can see has
 * to get the number this column shows. The visible cost is that a side's points
 * no longer sum to a fixed `categories × n(n+1)/2`: measured on the live league,
 * batting comes to 408 against that formula's 390 and pitching to 404, and both
 * excesses are **exactly** the `k(k−1)/2` its tie groups predict (18 and 14).
 * That is the arithmetic being consistent with the table, not drifting from it.
 *
 * **A team not ranked in a category earns nothing there**, which is the same
 * direction `values` itself fails in — absent rather than invented — and is why
 * `categories` rides along: it is how many of that side's categories the team
 * actually scored in, so a total that is short says so rather than looking like
 * a bad one. In practice it cannot differ across a league, a category having a
 * figure for every team or for none.
 */
export interface EspnRankSideTotal {
  /** Roto points over that side's categories — larger is better. */
  points: number;
  /** 1 is best. Competition ranking over the points, like every other rank
   *  here, so ties share a rank and the next distinct total skips. */
  rank: number;
  /** How many of that side's categories this team scored in, and how many
   *  there were — the pair that says whether `points` is a full total. */
  categories: number;
  of: number;
}

/** One team's row: its figure in each category and where that figure stands. */
export interface EspnRankRow {
  teamId: number;
  /** Keyed by stat id. A category with no honest figure for this span is
   *  **absent** rather than zero — the rule `sideFrom` already follows for a
   *  category a side is ineligible for, and for the same reason. */
  values: Record<number, number>;
  /** 1 is best, whichever direction the category runs. Absent exactly where
   *  the value is: a team with no figure has not got the worst one. */
  ranks: Record<number, number>;
  /** The whole of one side of the ball, per side the league actually scores.
   *  Absent for a side with no categories in it, so a pitching-only league
   *  draws no batting column rather than a column of noughts. */
  sides: Partial<Record<EspnCategorySide, EspnRankSideTotal>>;
  /**
   * **The same arithmetic over every category the league scores** — the roto
   * total, and where it stands.
   *
   * It is the sum of the side totals beside it **by construction** rather than
   * by coincidence: both are `n + 1 − rank` added up, one over a side's
   * categories and one over all of them, so a reader can add `BAT` and `PIT`
   * and get `OVR`. That is worth having for a figure the app derives — a
   * number nobody can check against the page is a number nobody can trust —
   * and it is why this counts *every* side rather than the two named ones: a
   * category the app cannot place is still a category the league scores, and
   * leaving it out would make the total disagree with the columns above it.
   *
   * Absent where there is nothing to combine — a league scoring one side only
   * gets no `OVR`, that column being `BAT` said twice.
   */
  overall?: EspnRankSideTotal;
}

export interface EspnRankings {
  span: EspnRankSpan;
  /**
   * **Whether this span could carry a projection at all** — which is the
   * `matchup` span of a week still being played, and nothing else.
   *
   * It is on the response rather than being a rule the client keeps, for the
   * reason `spans` itself is: it is a fact about the league's own week rather
   * than about the request, and the client drawing a toggle from a rule of its
   * own would be a second opinion about whether a week is over. The test is
   * `liveDay != null`, which is the same one `getSpanTotals` already uses to
   * decide whether ESPN's `cumulativeScore` is missing today — a settled week
   * has ESPN's pointer on a day belonging to the *next* period, so it answers
   * false there with no extra read at all.
   *
   * **Absent rather than disabled** is the client's half of it: a toggle that
   * cannot act is not drawn, so a settled week's caption is the caption it has
   * always been.
   */
  projectable: boolean;
  /**
   * **Whether the figures on this response are the projection.** Not the same
   * question as whether the reader asked for one: a period the engine declines
   * (`ok: false`, which is a settled week) comes back with the live figures and
   * this false, so the toggle un-lights itself over the table it is actually
   * describing rather than claiming a lens that is not in force.
   */
  projected: boolean;
  /** The period's own last ET day, and how many of its days are still to be
   *  played — the projection's own two figures, carried so the caption can say
   *  what it is projecting *to* rather than counting the days a second time.
   *  Null and 0 where the figures are not projected. */
  projectedEnd: string | null;
  projectedDaysLeft: number;
  /** Every span this league can actually be asked for, in reading order. A
   *  half with no matchup period in it — the second half in April, either of
   *  them in a league that publishes no matchup count — is **absent from this
   *  list rather than served empty**, which is the same rule the
   *  scoreboard's forward arrow follows for a period ESPN has not opened.
   *
   *  **`week` is never in it** — see `EspnRankSpan`. The strip is drawn from
   *  this list and a strip cannot hold nineteen weeks; the one the reader
   *  picked rides on `week` below. */
  spans: EspnRankSpanInfo[];
  /**
   * **The one matchup period this table is of**, where the reader picked one
   * off the league's calendar, and null where the table is one of the five
   * named spans.
   *
   * It is an `EspnRankSpanInfo` like the five so the bar that states it has one
   * shape to read whichever is in force — the label (`Week 12`) and the days
   * are computed here, off the same `dateForPeriod` anchor the scoreboard's own
   * header uses, so the two cannot print different days for one week. `live` is
   * always false: a week the reader picked is a settled one, the week being
   * played being `matchup` instead.
   */
  week: EspnRankSpanInfo | null;
  format: EspnScoringFormat;
  scoringType: string;
  categories: EspnCategory[];
  rows: EspnRankRow[];
  teams: EspnStandingsTeam[];
  myTeamId: number | null;
  leagueName: string;
  fetchedAt: number;
}

/**
 * How a rate category is rebuilt from the counting stats a span was summed
 * from — because a rate does not add.
 *
 * Every entry names the stat ids it **needs**, and a span missing any one of
 * them yields null rather than a figure computed from a hole: a league whose
 * `scoreByStat` omits sacrifice flies has no OBP this file can honestly state,
 * and the cell dashes. The three that matter to the live league are checked
 * against ESPN's own season figure to 5e-9 (above); the rest are the same
 * arithmetic written from the same definitions and are **unverified**, for the
 * reason `STAT_META`'s own tail is: there was one league to read.
 */
/**
 * **Exported for the projection's seat ordering**, which has to know what a
 * rate category is *made of* to say what one more outing would do to it — see
 * **The pitching seats** in *ESPN scoreboard*. Exported rather than copied: a
 * second table of the same nine formulas is a second table to keep in step, and
 * this one is already the definition every score on the board is rebuilt from.
 */
export const DERIVED: Record<number, { needs: number[]; of: (v: Record<number, number>) => number | null }> =
  {
    // AVG = H / AB.
    2: { needs: [1, 0], of: (v) => (v[0] ? v[1] / v[0] : null) },
    // SLG = TB / AB, with total bases from the extra-base counts.
    9: {
      needs: [1, 3, 4, 5, 0],
      of: (v) => (v[0] ? (v[1] + v[3] + 2 * v[4] + 3 * v[5]) / v[0] : null),
    },
    // OBP = (H + BB + HBP) / (AB + BB + HBP + SF).
    17: {
      needs: [1, 10, 12, 0, 13],
      of: (v) => {
        const den = v[0] + v[10] + v[12] + v[13];
        return den ? (v[1] + v[10] + v[12]) / den : null;
      },
    },
    // OPS = OBP + SLG, and the two halves are the two above.
    18: {
      needs: [1, 3, 4, 5, 10, 12, 0, 13],
      of: (v) => {
        const den = v[0] + v[10] + v[12] + v[13];
        if (!den || !v[0]) return null;
        return (v[1] + v[10] + v[12]) / den + (v[1] + v[3] + 2 * v[4] + 3 * v[5]) / v[0];
      },
    },
    // WHIP = (H + BB) / IP, and IP is outs over three.
    41: { needs: [37, 39, 34], of: (v) => (v[34] ? (v[37] + v[39]) / (v[34] / 3) : null) },
    // ERA = ER * 9 / IP.
    47: { needs: [45, 34], of: (v) => (v[34] ? (v[45] * 9) / (v[34] / 3) : null) },
    // K/9.
    49: { needs: [48, 34], of: (v) => (v[34] ? (v[48] * 9) / (v[34] / 3) : null) },
    // Winning percentage.
    55: { needs: [53, 54], of: (v) => (v[53] + v[54] ? v[53] / (v[53] + v[54]) : null) },
    // Save percentage.
    59: { needs: [57, 56], of: (v) => (v[56] ? v[57] / v[56] : null) },
  };

/**
 * One span's totals per team, summed a matchup period at a time.
 *
 * **A settled span is a fact and takes a blob**, the rule `getMatchups` follows
 * one period at a time: a span whose last matchup period is over cannot change,
 * so it is read back with no freshness test. A span reaching into the week
 * being played is memory-only on `LIVE_TTL_MS`, and `force` —
 * `Refresh from ESPN` — reaches that one and leaves the frozen ones alone.
 *
 * The read is `mScoreboard` **alone**, filtered to the span's periods. It does
 * not carry `matchupPeriodId` back (that is `mMatchupScore`'s field, which is
 * why `leagueMeta` reads it separately), and it does not need to: every row it
 * returns belongs to a period that was asked for, so every row is summed.
 * Measured on the live league: the first half's fifteen periods are **299,245
 * bytes**, the second half's four are **82,823**, and one period is 23,511 —
 * about 20KB a week either way.
 */
const spanBlobKey = (leagueId: number, first: number, last: number) =>
  `espn-span-${leagueId}-${first}-${last}-v1.json`;

const spanCache = new Map<string, { totals: Record<number, Record<number, number>>; fetchedAt: number }>();
const spanInFlight = new Map<string, Promise<Record<number, Record<number, number>>>>();

/** The day a span is missing, where it reaches into the week being played:
 *  which matchup period to read it from and which scoring period it is. Null
 *  for a span that is entirely settled, which is every span but one. */
export interface LiveDay {
  period: number;
  scoringPeriodId: number;
}

async function fetchSpanTotals(
  creds: EspnCreds,
  periods: number[],
  liveDay: LiveDay | null,
): Promise<Record<number, Record<number, number>>> {
  const data = await leagueGet<EspnScoreboardResponse>(creds, ['mScoreboard'], 0, {
    schedule: { filterMatchupPeriodIds: { value: periods } },
  });
  const totals: Record<number, Record<number, number>> = {};
  for (const m of data.schedule ?? []) {
    for (const side of [m.home, m.away]) {
      if (!side || typeof side.teamId !== 'number') continue;
      const at = (totals[side.teamId] ??= {});
      for (const [id, cell] of Object.entries(side.cumulativeScore?.scoreByStat ?? {})) {
        if (!cell || cell.ineligible === true || typeof cell.score !== 'number') continue;
        at[Number(id)] = (at[Number(id)] ?? 0) + cell.score;
      }
    }
  }

  // The same day `cumulativeScore` leaves out of the scoreboard, added for the
  // same reason and by the same read — see `scoringPeriodTotals`. **Components
  // only**: a rate is not summable, and every caller of this rebuilds its rate
  // categories from the components afterwards, so adding a rate here would be
  // adding a number nothing reads and confusing the one thing that does.
  if (liveDay) {
    const today = await scoringPeriodTotals(creds, liveDay.period, liveDay.scoringPeriodId).catch(
      (err: Error) => {
        console.error(`ESPN live day unavailable for span in league ${creds.leagueId}:`, err.message);
        return null;
      },
    );
    if (today) {
      for (const [teamId, day] of Object.entries(today)) {
        const at = (totals[Number(teamId)] ??= {});
        for (const [id, v] of Object.entries(day)) {
          const n = Number(id);
          if (DERIVED[n]) continue;
          at[n] = (at[n] ?? 0) + v;
        }
      }
    }
  }
  return totals;
}

async function getSpanTotals(
  creds: EspnCreds,
  periods: number[],
  frozen: boolean,
  liveDay: LiveDay | null,
  force = false,
): Promise<Record<number, Record<number, number>>> {
  const first = periods[0];
  const last = periods[periods.length - 1];
  const key = `${creds.leagueId}:${first}-${last}`;
  const stale = force && !frozen;
  const hit = spanCache.get(key);
  // As `getMatchups`: frozen is forever, and a span reaching into the week
  // being played is a minute.
  if (!stale && hit && (frozen || Date.now() - hit.fetchedAt < LIVE_TTL_MS)) return hit.totals;
  const running = spanInFlight.get(key);
  if (running && !stale) return running;

  const job = (async () => {
    if (frozen) {
      const stored = await readJsonBlob<Record<number, Record<number, number>>>(
        spanBlobKey(creds.leagueId, first, last),
        () => true,
      );
      if (stored && typeof stored === 'object') {
        spanCache.set(key, { totals: stored, fetchedAt: Date.now() });
        return stored;
      }
    }
    const totals = await fetchSpanTotals(creds, periods, frozen ? null : liveDay);
    spanCache.set(key, { totals, fetchedAt: Date.now() });
    if (frozen) await writeJsonBlob(spanBlobKey(creds.leagueId, first, last), totals);
    return totals;
  })().finally(() => {
    spanInFlight.delete(key);
  });

  spanInFlight.set(key, job);
  return job;
}

/**
 * Which matchup periods make up each half of the regular season.
 *
 * **An even division by matchups, not by the calendar.** The divider used to be
 * the All-Star break, read off ESPN's own schedule as its longest run of
 * gameless scoring periods — a true fact about the season and the wrong cut for
 * this table, because the break does not fall halfway. On the live league it
 * lands inside matchup period 15 of an 18-period regular season, so `First
 * half` was fifteen weeks of play against `Second half`'s three and the two
 * columns could not be read against each other at all: every counting stat in
 * the first was five times the second for no reason a reader could see. A half
 * is a half.
 *
 * **The boundary is `regularPeriods`, not the periods the schedule happens to
 * carry**, and that is what keeps it still. A league's matchup count is settled
 * before opening day, so `ceil(N / 2)` names the same week in April as in
 * September, where halving the list of periods played so far would move the
 * line every week — a span whose meaning changed under the reader between two
 * visits. In April the second half is therefore empty, and a half with nothing
 * in it is simply not offered, which is the rule a playoff round nobody has
 * reached already follows.
 *
 * The odd period goes to the **first** half (19 → 10 and 9), one of them having
 * to take it.
 *
 * `regularPeriods` is also what keeps the playoffs out, which was a real error
 * rather than a tidiness one when it was missing: on the checked league the
 * regular season is 18 periods and the schedule runs to 19, so period 19 — the
 * first playoff round, already being played — was landing in `Second half` and
 * being counted as regular-season play.
 *
 * Null when the league publishes no matchup count, which is the one thing this
 * cut cannot be made without — and the halves are then not offered at all,
 * exactly as they were not when the break could not be read.
 */
function halvesOf(
  periods: { period: number; first: number; last: number }[],
  regularPeriods: number | null,
): { first: number[]; second: number[] } | null {
  if (regularPeriods == null || regularPeriods < 2) return null;
  const mid = Math.ceil(regularPeriods / 2);
  const first: number[] = [];
  const second: number[] = [];
  for (const p of periods) {
    // A matchup period ESPN has filed no scoring periods under is a week with
    // no days in it; it can be dated by nothing and belongs to neither half.
    if (!p.first || !p.last) continue;
    if (p.period > regularPeriods) continue;
    (p.period <= mid ? first : second).push(p.period);
  }
  return { first, second };
}

/** Competition ranking — 1 is best, ties share a rank and the next distinct
 *  figure skips (1, 2, 2, 4) — which is `teamHitting.ts::rankAll`'s convention
 *  and, more to the point, the one every league table in the world uses. */
function rankBy(
  entries: { teamId: number; value: number }[],
  lowerBetter: boolean,
): Record<number, number> {
  const sorted = [...entries].sort((a, b) => (lowerBetter ? a.value - b.value : b.value - a.value));
  const out: Record<number, number> = {};
  let rank = 0;
  let seen = 0;
  let prev: number | null = null;
  for (const e of sorted) {
    seen++;
    if (prev === null || e.value !== prev) rank = seen;
    out[e.teamId] = rank;
    prev = e.value;
  }
  return out;
}

/**
 * The Rankings tab: every team's figure and standing in each of the league's
 * scoring categories, over one of five spans.
 *
 * **`matchup` and `season` are ESPN's own numbers and the two halves are ours**
 * — the current period's `scoreByStat` and `valuesByStat` respectively, drawn
 * as they arrive. That split is deliberate rather than accidental: where ESPN
 * publishes a figure this reads it, and it computes only where ESPN publishes
 * nothing. The two arithmetics are the same one, checked to 5e-9 above.
 *
 * **`matchup` means the week being played, not the week the Scoreboard tab is
 * navigated to.** The tabs are independent pages of one view — the period
 * arrows belong to the Scoreboard because they govern only it — and a span
 * labeled `Current matchup` that silently followed somebody else's arrows
 * would be a label that is false as often as it is true. Which week it is, is
 * printed under the tabs.
 *
 * **`projected` swaps the figures for where the week is heading, and the
 * ranking arithmetic underneath is not told.** That is the whole of the design
 * and the reason it is done here rather than in the client: everything that
 * turns a figure into a standing — `rankBy`'s competition ranking with
 * `lowerBetter` baked in, the per-category population a roto point is worth,
 * `totalOver`, and the identity that makes `OVR` equal `BAT` + `PIT` by
 * construction — is *this* function, and a projected table ranked anywhere
 * else would be a second definition of every one of them, free to drift the
 * next time either moved. So the projection replaces `values` and the rest
 * falls out unchanged: the same competition ranks, the same points, the same
 * `OVR` identity, over different numbers.
 *
 * **It applies to the current matchup and nothing else** (`projectable`), which
 * is not a limitation so much as the only span the question has an answer for:
 * a projection is what a *week still being played* finishes on, and there is no
 * such thing as a projected season line or a projected first half.
 *
 * **A period the engine declines comes back live rather than empty.** `ok:
 * false` is a settled week — nothing is wrong, there is simply nothing left to
 * project — so the response carries the figures it has with `projected: false`,
 * and the client's toggle un-lights itself over a table it is describing
 * truthfully. That is `getOwnership`'s own direction: a lens that cannot be
 * applied costs its figures, never the table.
 */
export async function getRankings(
  creds: EspnCreds,
  span?: EspnRankSpan | null,
  force = false,
  projected = false,
  /**
   * **One matchup period, picked off the league's own calendar** — the tab's
   * bar, in place of the five named cuts. It wins over `span` where it names a
   * period the schedule actually carries, and is ignored otherwise, which is
   * the same direction an unrecognized `span` falls in: a bad value costs the
   * reader the cut they asked for, never the table.
   *
   * **The week being played is not one of these.** It normalizes away here as
   * well as in the client, so a link carrying `period=19` in the live week
   * opens on `Current matchup` — the rule rather than the range, which is what
   * makes it still true tomorrow.
   */
  period?: number | null,
): Promise<EspnRankings> {
  if (force) {
    const prefix = `${creds.leagueId}:`;
    for (const k of [...spanCache.keys()]) if (k.startsWith(prefix)) spanCache.delete(k);
  }
  const meta = await leagueMeta(creds, force);
  const current =
    meta.currentPeriod ??
    (meta.periods.length > 0 ? meta.periods[meta.periods.length - 1].period : null);
  // The playoff rounds that exist — periods past the regular season which the
  // schedule actually carries. A round nobody has reached yet is not in the
  // schedule, so this grows as the bracket is played rather than offering a
  // span with nothing in it.
  const playoffs =
    meta.regularPeriods == null
      ? []
      : meta.periods.filter((p) => p.period > meta.regularPeriods!).map((p) => p.period);
  /**
   * **The regular season, as a list of matchup periods** — the same cut
   * `halvesOf` makes, undivided.
   *
   * This is what the `season` span is drawn from now, where it used to be
   * ESPN's own published season line read straight off `meta.teams[].values`.
   * That line was free and was answering a different question: **it includes
   * the playoffs**, so on the checked league a `Season` column in late August
   * carried periods 19 and 20 — a bracket two teams in twelve are playing in —
   * mixed into the eighteen weeks every team played. Reported as exactly that.
   *
   * **And it fixes a quirk that was documented rather than fixed.** ESPN counts
   * a playoff week only for the teams still in the winners' bracket, so the
   * eight sides on a bye were short by their week's own total against the four
   * who were not: a column nobody could rank fairly. Summing the periods gives
   * every team the weeks it actually played and nothing else.
   *
   * `p.first`/`p.last` are tested for `halvesOf`'s own reason — a matchup period
   * ESPN has filed no scoring periods under is a week with no days in it — and
   * an empty list is what makes the fallback below possible.
   */
  const regular =
    meta.regularPeriods == null
      ? []
      : meta.periods
          .filter((p) => p.period <= meta.regularPeriods! && p.first && p.last)
          .map((p) => p.period);
  const halves = halvesOf(meta.periods, meta.regularPeriods);

  const dated = async (first: number, last: number) => {
    const a = meta.periods.find((p) => p.period === first);
    const b = meta.periods.find((p) => p.period === last);
    const [start, end] = await Promise.all([
      a?.first ? dateForPeriod(a.first) : Promise.resolve(null),
      b?.last ? dateForPeriod(b.last) : Promise.resolve(null),
    ]);
    return { start, end };
  };

  // **The week being played leads**, then the whole year, then the season cut
  // into its two halves, then the bracket.
  //
  // Season led for a while and the argument for it was "the whole year first,
  // then the narrowing", which is how a *reference* table reads. This is not
  // one: a manager opens the Rankings tab in the middle of a matchup to find
  // out which categories he is losing **this week** and what he can still do
  // about it, and the season line is the context for that rather than the
  // question. The order is also the default — `asked` falls back to whichever
  // span leads the list — so the two cannot come to disagree about which span
  // the tab is about.
  const spans: EspnRankSpanInfo[] = [];
  if (current != null && meta.categories.length > 0) {
    const { start, end } = await dated(current, current);
    spans.push({
      span: 'matchup',
      label: 'Current matchup',
      periods: [current, current],
      start,
      end,
      live: true,
    });
  }
  /**
   * **`Regular Season`, and it says so because it is one.** The label was
   * `Season` while the figures were ESPN's own line, which runs to whatever has
   * been played including the bracket; this is the eighteen weeks every team
   * played, so the word that was a summary is a claim now and the label has to
   * carry it.
   *
   * **It is dated and it carries its periods**, where it carried neither: the
   * span *is* a run of weeks now, so the bar states them like every other cut
   * (`Regular Season · Weeks 1–18`) rather than falling back to the "ESPN's own
   * season line" note the client keeps for the case below.
   *
   * **And `live` is answered rather than declared `false`.** The old flag was
   * false because ESPN's line and the week being played were different
   * questions; this span *contains* the current period while the regular season
   * is on, so it is live in the one sense that flag has ever meant — these
   * figures include a week still being played — and it stops being live the day
   * the bracket starts, which is exactly when the numbers stop moving.
   *
   * **The fallback is ESPN's line under its old name**, for a league that
   * publishes no matchup count: there is no boundary to cut the playoffs out at,
   * so there is nothing to promise, and `Regular Season` over a figure that may
   * include a bracket would be the claim this change exists to stop making. It
   * is the same league that is offered no halves and no playoffs span, for the
   * same missing number.
   */
  if (regular.length > 0) {
    const { start, end } = await dated(regular[0], regular[regular.length - 1]);
    spans.push({
      span: 'season',
      label: 'Regular Season',
      periods: [regular[0], regular[regular.length - 1]],
      start,
      end,
      live: current != null && regular.includes(current),
    });
  } else {
    spans.push({
      span: 'season',
      label: 'Season',
      periods: null,
      start: null,
      end: null,
      // **A running total is live while the season is on**, which is the same
      // question the four spans above answer: do these figures include a week
      // still being played. It read `false` here for years and the client
      // carried a named exception to make the poll work anyway (`rankings.span
      // === 'season'`); answered honestly, the flag is the only thing either
      // side has to look at.
      live: current != null,
    });
  }
  for (const [key, label, list] of [
    ['first', 'First half', halves?.first ?? []],
    ['second', 'Second half', halves?.second ?? []],
    ['playoffs', 'Playoffs', playoffs],
  ] as const) {
    if (list.length === 0) continue;
    const { start, end } = await dated(list[0], list[list.length - 1]);
    spans.push({
      span: key,
      label,
      periods: [list[0], list[list.length - 1]],
      start,
      end,
      live: current != null && list.includes(current),
    });
  }

  // **A week the reader picked, if it is one this league has.** Not the week
  // being played — that is `matchup`, the rule — and not a period the schedule
  // has never carried, which falls back to the span beside it rather than
  // ranking an empty table.
  const weekPeriod =
    period != null && period !== current && meta.periods.some((p) => p.period === period)
      ? period
      : null;

  // A span this league cannot be asked for falls back to the one that leads
  // the list rather than to a named constant — which is what keeps the default
  // and the order one decision. `season` is the floor because it is the one
  // span every league has: it is ESPN's own line and needs no matchup period.
  const asked: EspnRankSpan =
    weekPeriod != null
      ? 'week'
      : span && span !== 'week' && spans.some((s) => s.span === span)
        ? span
        : (spans[0]?.span ?? 'season');
  // The week as a span, for the bar that states it — one shape whichever cut is
  // in force. Off the same anchor the five are dated from, so a week's days
  // here and the scoreboard's own header cannot disagree.
  const week: EspnRankSpanInfo | null =
    weekPeriod == null
      ? null
      : {
          span: 'week',
          label: `Week ${weekPeriod}`,
          periods: [weekPeriod, weekPeriod],
          ...(await dated(weekPeriod, weekPeriod)),
          // A picked week is a settled one — the live one is `matchup`.
          live: false,
        };

  // The values, by team. Three sources for four spans, and each is the
  // cheapest honest answer to its own question.
  let values: Record<number, Record<number, number>> = {};
  // ESPN's own two carry all 23 stats it tracks — the components as well as
  // the ten this league scores — so both are narrowed to the categories the
  // table actually draws. It is the same shape the halves come out in, and
  // the thirteen it drops are 1KB a read of numbers nothing renders.
  const onlyCategories = (v: Record<number, number>) => {
    const out: Record<number, number> = {};
    for (const cat of meta.categories) {
      const n = v[cat.statId];
      if (typeof n === 'number' && Number.isFinite(n)) out[cat.statId] = n;
    }
    return out;
  };
  /** Rates rebuilt from the components they are made of — one definition for
   *  the two branches below, since a span that has had the live day added to it
   *  can no longer read ESPN's own rate off the wire. A rate whose components
   *  are incomplete is left out rather than invented, which is the rule the
   *  halves have always followed. */
  const withRates = (summed: Record<number, number>) => {
    const out: Record<number, number> = {};
    for (const cat of meta.categories) {
      if (cat.format === 'count') {
        const v = summed[cat.statId];
        if (typeof v === 'number') out[cat.statId] = v;
        continue;
      }
      const rule = DERIVED[cat.statId];
      if (!rule || !rule.needs.every((n) => typeof summed[n] === 'number')) continue;
      const v = rule.of(summed);
      if (typeof v === 'number' && Number.isFinite(v)) out[cat.statId] = v;
    }
    return out;
  };

  /**
   * The day every `cumulativeScore` in this league is missing, where the span
   * asked for actually reaches it — see `scoringPeriodTotals` for the
   * measurement, and `fetchMatchups` for the same guard on the scoreboard.
   *
   * The scoring period has to fall inside the **current** matchup period's own
   * span, which is what keeps a day off a week it does not belong to at the
   * rollover: ESPN's nightly batch folds the finished day in and advances the
   * pointer to one that belongs to the next week.
   */
  const currentSpan = current != null ? meta.periods.find((p) => p.period === current) : undefined;
  const latest = meta.latestScoringPeriod;
  const liveDay: LiveDay | null =
    current != null &&
    currentSpan != null &&
    latest != null &&
    latest >= currentSpan.first &&
    latest <= currentSpan.last
      ? { period: current, scoringPeriodId: latest }
      : null;

  if (asked === 'season' && regular.length === 0) {
    // **ESPN's own published season line, left exactly as it comes** — the
    // fallback for a league that publishes no matchup count, and so no boundary
    // to cut a bracket out at. It stops at yesterday, deliberately: this column
    // is then the number the manager sees on ESPN's own site, and a figure of
    // ours that silently disagreed with it would be worse than one that lags
    // with it.
    //
    // **This used to be the `season` branch outright**, and the two things
    // wrong with it are why it is a fallback now. It includes the playoffs, so
    // a `Season` column in late August carried a bracket two teams in twelve
    // were playing. And it counts a playoff week only for the teams still in
    // the winners' bracket — measured, the eight sides on a bye short by
    // exactly their week's own total. Both were documented rather than fixed;
    // summing the regular-season periods answers both.
    for (const t of meta.teams) values[t.id] = onlyCategories(t.values);
  } else if (asked === 'week' && weekPeriod != null) {
    // **One settled week, exactly as `matchup` reads the live one** — the same
    // `mScoreboard` sum over a single matchup period, with ESPN's own rates for
    // it read as they come. `frozen` because it is over: the totals go to a
    // blob and are read back with no freshness test, which is `getSpanTotals`'
    // standing rule and is why stepping back through a season costs one read a
    // week and then nothing. No live day is added — that day belongs to the
    // week being played, and this is not it.
    const raw = await getSpanTotals(creds, [weekPeriod], true, null, force);
    for (const [id, v] of Object.entries(raw)) values[Number(id)] = onlyCategories(v);
  } else if (asked === 'matchup' && current != null) {
    const raw = await getSpanTotals(creds, [current], false, liveDay, force);
    // One period's rates are ESPN's own and read as they come — **unless** the
    // live day has been added underneath them, in which case they are rebuilt
    // from the components exactly as a multi-period span's are. This is the tab
    // that shows the same week as the Scoreboard, so the two must agree.
    for (const [id, v] of Object.entries(raw)) {
      values[Number(id)] = liveDay ? withRates(v) : onlyCategories(v);
    }
  } else {
    // **Four spans through one branch now**, the regular season having become a
    // run of matchup periods like the three beside it: one `mScoreboard` read
    // filtered to the list, counting stats added and rates rebuilt from the
    // components they add up from. `season` is the widest of the four and costs
    // no more than any of them — the filter takes the whole list in one request.
    const list =
      asked === 'season'
        ? regular
        : asked === 'first'
          ? (halves?.first ?? [])
          : asked === 'second'
            ? (halves?.second ?? [])
            : playoffs;
    if (list.length > 0) {
      const frozen = current == null || !list.includes(current);
      const raw = await getSpanTotals(creds, list, frozen, liveDay, force);
      // Counting stats add; rates are rebuilt from what they add up from, and
      // a rate with a component missing is left out rather than invented.
      for (const [id, summed] of Object.entries(raw)) values[Number(id)] = withRates(summed);
    }
  }

  /**
   * **Where the table is heading**, in place of where it has got to.
   *
   * `liveDay` is the whole of the `projectable` test and costs nothing: it is
   * already computed above, and it says exactly what this needs to know — that
   * ESPN's own latest scoring period falls inside the current matchup period,
   * which is what "this week is still being played" means everywhere else in
   * this file.
   *
   * The read is `getProjection` for the **current** period, which is the same
   * one the matchup page's own lens reads and is cached per league on its own
   * minute — so a reader who has already opened a matchup pays nothing for
   * this, and one who has not pays for it once. A **bye** side is a real shape
   * and its own total is projected all the same (`away` null, `home` there), so
   * both sides of every matchup are walked rather than the pairs.
   *
   * A team the projection has no side for keeps no figures rather than its live
   * ones — the rule every absent figure on this table follows, and the honest
   * one: a row half projected and half not would be a row nobody could read.
   */
  const projectable = asked === 'matchup' && current != null && liveDay != null;
  let projectedNow = false;
  let projectedEnd: string | null = null;
  let projectedDaysLeft = 0;
  if (projected && projectable) {
    // Imported here rather than at the top of the file because `projection.ts`
    // imports *this* module — it is built on `getScoreboard` and `getOwnership`
    // — so a static import would be a cycle. Nothing is evaluated at module
    // scope on either side, but a dynamic import says so rather than relying on
    // it, and it is only reached when a reader has actually pressed the toggle.
    const { getProjection } = await import('./projection.js');
    const proj = await getProjection(creds, current, force).catch(() => null);
    if (proj?.ok) {
      const next: Record<number, Record<number, number>> = {};
      for (const m of proj.matchups) {
        for (const side of [m.home, m.away]) {
          if (side) next[side.teamId] = onlyCategories(side.scores);
        }
      }
      values = next;
      projectedNow = true;
      projectedEnd = proj.end;
      projectedDaysLeft = proj.daysLeft;
    }
  }

  const rows: EspnRankRow[] = meta.teams.map((t) => ({
    teamId: t.id,
    values: values[t.id] ?? {},
    ranks: {},
    sides: {},
  }));
  const byTeam = new Map(rows.map((r) => [r.teamId, r]));
  /** How many teams are ranked in each category — the denominator a roto point
   *  is worth, and per category rather than per league because a category
   *  nobody has a figure for ranks nobody. */
  const rankedIn = new Map<number, number>();
  for (const cat of meta.categories) {
    const entries = rows
      .filter((r) => typeof r.values[cat.statId] === 'number')
      .map((r) => ({ teamId: r.teamId, value: r.values[cat.statId] }));
    if (entries.length === 0) continue;
    rankedIn.set(cat.statId, entries.length);
    for (const [teamId, rank] of Object.entries(rankBy(entries, cat.lowerBetter))) {
      const row = byTeam.get(Number(teamId));
      if (row) row.ranks[cat.statId] = rank;
    }
  }

  // **A run of categories as a single figure** — roto points over them, then
  // ranked like any other column. One function for a side and for the whole
  // league, so `OVR` is `BAT` + `PIT` by construction rather than by two
  // arithmetics that happen to agree; see `EspnRankSideTotal` for why points
  // rather than a mean of ranks, and why `lowerBetter` needs no case here.
  const totalOver = (cats: EspnCategory[]): Map<number, EspnRankSideTotal> => {
    const out = new Map<number, EspnRankSideTotal>();
    if (cats.length === 0) return out;
    const totals: { teamId: number; value: number; scored: number }[] = [];
    for (const row of rows) {
      let points = 0;
      let scored = 0;
      for (const cat of cats) {
        const rank = row.ranks[cat.statId];
        const n = rankedIn.get(cat.statId);
        if (typeof rank !== 'number' || !n) continue;
        points += n + 1 - rank;
        scored++;
      }
      // A team ranked in none of them has no total rather than a total of
      // nought — the rule every absent figure on this table follows.
      if (scored > 0) totals.push({ teamId: row.teamId, value: points, scored });
    }
    if (totals.length === 0) return out;
    const ranked = rankBy(
      totals.map((t) => ({ teamId: t.teamId, value: t.value })),
      false,
    );
    for (const t of totals) {
      out.set(t.teamId, {
        points: t.value,
        rank: ranked[t.teamId],
        categories: t.scored,
        of: cats.length,
      });
    }
    return out;
  };

  const sidesPresent: EspnCategorySide[] = [];
  for (const side of ['batting', 'pitching', 'other'] as const) {
    const cats = meta.categories.filter((c) => c.side === side);
    if (cats.length === 0) continue;
    sidesPresent.push(side);
    for (const [teamId, total] of totalOver(cats)) {
      const row = byTeam.get(teamId);
      if (row) row.sides[side] = total;
    }
  }
  // **The whole league in one column**, and only where there is more than one
  // side to combine: with a single side it would be that side's column said
  // twice, which is a column spent saying nothing.
  if (sidesPresent.length > 1) {
    for (const [teamId, total] of totalOver(meta.categories)) {
      const row = byTeam.get(teamId);
      if (row) row.overall = total;
    }
  }

  return {
    span: asked,
    projectable,
    projected: projectedNow,
    projectedEnd,
    projectedDaysLeft,
    spans,
    week,
    format: meta.format,
    scoringType: meta.scoringType,
    categories: meta.categories,
    rows,
    teams: meta.teams,
    myTeamId: meta.myTeamId,
    leagueName: meta.leagueName,
    fetchedAt: Date.now(),
  };
}

// ---- The Transactions tab: who moved whom ---------------------------------
//
// **Which ESPN endpoint answers this, and the two that look as though they
// should and don't.** Recorded here for the reason the scoreboard's own probe
// table is: this file exists partly so nobody re-probes.
//
//  - **`view=mTransactions2`** is real and is **scoped to one scoring period**
//    — the query param, not the filter. Bare it returns the current day's 30
//    rows; `scoringPeriodId=100` returns that day's. `filterType` works
//    (`{"transactions":{"filterType":{"value":["FREEAGENT","WAIVER","TRADE_ACCEPT"]}}}`
//    narrows 30 rows to 4), but `filterScoringPeriodIds` is **ignored** — the
//    same 30 rows come back — and `limit`, `offset` and `sortDate` are each a
//    **400**. So a season of transactions off this view is one request per
//    scoring period, ~150 of them, which is not a page load.
//  - **`view=mTransactions`** carries no `transactions` key at all (1,375
//    bytes, `members`/`players`/`settings`), and **`mPendingTransactions`** is
//    1,285 bytes of nothing on a league with none pending.
//  - **Diffing `mRoster` day over day** was the fallback and is not needed; it
//    would also be a reconstruction where the two below are a record.
//
// **What answers it is `communication/` with `kona_league_communication`**, the
// endpoint ESPN's own "recent activity" is drawn from — and it is the one that
// takes `limit` and `offset`, which is the whole difference: the entire 2026
// season of this league is **770 topics and 1,261 messages in one request**
// (933,078 bytes at `limit: 1000`), against 244KB for the most recent 200.
//
// **A topic is the transaction and its messages are the players in it.** The
// shapes, counted over that whole season: `178+179` (pick up and drop) 458,
// `178` alone 160, `239` alone 121, `180+181` (waiver claim and drop) 19, `180`
// alone 8, and five trades of three to nine messages each.
//
// **The message type table was cross-checked against `mTransactions2` rather
// than taken from the community mapping**, on four topics of the same
// afternoon: a `t179 p32667 to6` is `mTransactions2`'s `DROP p32667 6->0`, and
// the `t178 p39640 to6` beside it is its `ADD p39640 0->6`. And the field that
// carries the team was **counted over all 1,266 messages**, because it is not
// the same field on every type: `to` is a real team id on all 1,122 of the
// 178/179/180/181 messages and on both ends of all 23 trades, while a `239`
// has `to: -1` on all 121 of them and its team in **`for`** — where its `from`
// is a lineup slot that merely *looks* like a team id 50 times in 121. Reading
// `from` there would have filed a third of the league's drops under the wrong
// manager.

/** How many topics are read. A season of this league is 770, so this is not a
 *  window that cuts anything today; it is a bound on a payload that grows all
 *  season and is here so a league with a very busy waiver wire cannot make the
 *  read unbounded. The client says when the list is at it. */
const TRANSACTIONS_LIMIT = 250;

/** ESPN's own message types, in the vocabulary the page speaks. `for` rather
 *  than `to` on 239 is not a typo — see the note above, where it is counted. */
const TX_MESSAGE: Record<
  number,
  { move: 'add' | 'drop'; via: 'free-agent' | 'waiver' | 'trade'; team: 'to' | 'for' | 'both' }
> = {
  178: { move: 'add', via: 'free-agent', team: 'to' },
  180: { move: 'add', via: 'waiver', team: 'to' },
  179: { move: 'drop', via: 'free-agent', team: 'to' },
  181: { move: 'drop', via: 'waiver', team: 'to' },
  239: { move: 'drop', via: 'free-agent', team: 'for' },
  244: { move: 'add', via: 'trade', team: 'both' },
};

/** One player moving in one transaction. */
export interface EspnTransactionPlayer {
  /** ESPN's own player id, which is what the activity feed names him by. */
  espnId: number;
  name: string;
  /** The MLB id where the name-and-club join lands on exactly one man, so the
   *  row can open his page like every other player name in the app — and null
   *  where it doesn't, which is `matchMlbPlayer`'s rule rather than a new one:
   *  an ambiguity neither name nor club resolves is left unmatched rather than
   *  guessed. The row still draws; it simply is not a link. */
  mlbId: number | null;
  /** His MLB club, for the cap logo the row's identity block draws — the id the
   *  mark is served by, and the abbreviation that is its `alt`, its tooltip and
   *  what the block prints when there is no mark to draw. Both come off the
   *  join that found `mlbId` (`IndexEntry.teamId`) and the 24h team table every
   *  other abbreviation in the app comes from, so neither is a request of its
   *  own; both are null on the row that did not join. */
  mlbTeamId: number | null;
  team: string | null;
  move: 'add' | 'drop';
  via: 'free-agent' | 'waiver' | 'trade';
  /** The team that took him, and the one that gave him up. A free-agent pickup
   *  has no `from` and a drop no `to`; a trade has both. */
  toTeamId: number | null;
  fromTeamId: number | null;
  /** ESPN's waiver bid, on a claim that carried one. */
  bid: number | null;
}

export interface EspnTransaction {
  id: string;
  /** Epoch milliseconds, which is what ESPN stamps a topic with. */
  date: number;
  kind: 'add' | 'drop' | 'trade';
  /** Every team the move touched — one for a pickup or a drop, two for a
   *  trade. In the order they read: the team that acted first. */
  teamIds: number[];
  players: EspnTransactionPlayer[];
}

export interface EspnTransactions {
  transactions: EspnTransaction[];
  /** Whether the read came back at `TRANSACTIONS_LIMIT`, i.e. whether there is
   *  more season behind it. The page says so rather than implying a complete
   *  record it hasn't got. */
  capped: boolean;
  teams: EspnStandingsTeam[];
  myTeamId: number | null;
  leagueName: string;
  fetchedAt: number;
}

interface EspnTopicResponse {
  topics?: {
    id?: string;
    date?: number;
    author?: string;
    messages?: {
      messageTypeId?: number;
      targetId?: number;
      to?: number;
      from?: number;
      for?: number;
      date?: number;
    }[];
  }[];
}

/**
 * The league's activity feed, reduced to the moves.
 *
 * **Memory only, and deliberately no storage blob.** A past transaction is
 * immutable, which is the argument for one — and what is being read is not a
 * past transaction, it is the *head of a feed* that grows all season, which is
 * `nextGame.ts`'s class rather than `espn-lineup-…`'s: a blob's freshness test
 * here could only ever be the TTL beside it, and the thing it would
 * store is a window that has moved by the time it is read. It is keyed per
 * league on `LIVE_TTL_MS`, with an `inFlight` guard so a
 * cold container serving three tabs sends one upstream, and `?refresh=1`
 * reaches it — a move made on ESPN is exactly what that button is for.
 */
const txCache = new Map<number, { value: EspnTransactions; fetchedAt: number }>();
const txInFlight = new Map<number, Promise<EspnTransactions>>();

export async function getTransactions(
  creds: EspnCreds,
  force = false,
): Promise<EspnTransactions> {
  const hit = txCache.get(creds.leagueId);
  // A minute, not the rosters' ten: this is the head of a feed the League page
  // polls, and it is what the red dot on the Transactions tab is computed from —
  // a mark saying "something happened" ten minutes after it happened is a mark
  // the reader has already scrolled past on ESPN.
  if (!force && hit && Date.now() - hit.fetchedAt < LIVE_TTL_MS) return hit.value;
  const running = txInFlight.get(creds.leagueId);
  if (running && !force) return running;

  const job = (async () => {
    const [meta, data, pool, abbrevs] = await Promise.all([
      leagueMeta(creds, force),
      leagueGet<EspnTopicResponse>(creds, ['kona_league_communication'], null, {
        topics: {
          filterType: { value: ['ACTIVITY_TRANSACTIONS'] },
          limit: TRANSACTIONS_LIMIT,
          // Generous rather than tight: a nine-player trade is one topic and
          // truncating its messages would print half a trade.
          limitPerMessageSet: { value: 40 },
          offset: 0,
          sortMessageDate: { sortPriority: 1, sortAsc: false },
          sortFor: { sortPriority: 2, sortAsc: false },
          filterIncludeMessageTypeIds: { value: Object.keys(TX_MESSAGE).map(Number) },
        },
      }, '/communication/'),
      // The names, and with them the MLB ids. **No new upstream**: this is the
      // same cookie-free 940KB pool `getRosterPct` and the eligibility chip
      // already share, read once every six hours by every user of the app —
      // and it covers the whole season's activity, checked: **376 of 376**
      // distinct ESPN player ids named in 2026's transactions are on it.
      getPlayerPool().catch((err: Error) => {
        console.error('ESPN player pool unavailable for transactions:', err.message);
        return null;
      }),
      // The 30-club abbreviation table, 24h-cached and already fetched for every
      // roster badge in the app — so a row's `MIL` is a `Map` lookup rather than
      // a request. A failure costs the cap logo its `alt` and nothing else.
      getTeamAbbrevs().catch((err: Error) => {
        console.error('MLB team table unavailable for transactions:', err.message);
        return null;
      }),
    ]);

    const teamIds = new Set(meta.teams.map((t) => t.id));
    const out: EspnTransaction[] = [];
    for (const topic of data.topics ?? []) {
      const players: EspnTransactionPlayer[] = [];
      const touched: number[] = [];
      let anyTrade = false;
      for (const m of topic.messages ?? []) {
        const rule = m.messageTypeId == null ? undefined : TX_MESSAGE[m.messageTypeId];
        if (!rule || typeof m.targetId !== 'number') continue;
        let toTeamId: number | null = null;
        let fromTeamId: number | null = null;
        if (rule.team === 'both') {
          anyTrade = true;
          toTeamId = teamIds.has(m.to as number) ? (m.to as number) : null;
          fromTeamId = teamIds.has(m.from as number) ? (m.from as number) : null;
        } else {
          const raw = rule.team === 'for' ? m.for : m.to;
          const team = teamIds.has(raw as number) ? (raw as number) : null;
          if (rule.move === 'add') toTeamId = team;
          else fromTeamId = team;
        }
        for (const t of [toTeamId, fromTeamId]) if (t != null && !touched.includes(t)) touched.push(t);
        const entry = pool?.byEspnId[m.targetId];
        players.push({
          espnId: m.targetId,
          // A player the pool has never heard of still gets a row: what he was
          // is a fact even where his name is not to hand.
          name: entry?.name ?? `ESPN player ${m.targetId}`,
          mlbId: entry?.mlbId ?? null,
          mlbTeamId: entry?.teamId ?? null,
          team: entry?.teamId != null ? abbrevs?.get(entry.teamId) ?? null : null,
          move: rule.move,
          via: rule.via,
          toTeamId,
          fromTeamId,
          bid: rule.via === 'waiver' && typeof m.for === 'number' ? m.for : null,
        });
      }
      if (players.length === 0) continue;
      out.push({
        id: topic.id ?? `${topic.date ?? 0}-${players[0].espnId}`,
        date: typeof topic.date === 'number' ? topic.date : 0,
        kind: anyTrade ? 'trade' : players.some((p) => p.move === 'add') ? 'add' : 'drop',
        teamIds: touched,
        players,
      });
    }
    // Newest first. ESPN sorts them that way and is asked to; sorting here as
    // well costs nothing and means the page's own order does not depend on it.
    out.sort((a, b) => b.date - a.date);

    const value: EspnTransactions = {
      transactions: out,
      capped: (data.topics ?? []).length >= TRANSACTIONS_LIMIT,
      teams: meta.teams,
      myTeamId: meta.myTeamId,
      leagueName: meta.leagueName,
      fetchedAt: Date.now(),
    };
    txCache.set(creds.leagueId, { value, fetchedAt: Date.now() });
    return value;
  })().finally(() => {
    txInFlight.delete(creds.leagueId);
  });

  txInFlight.set(creds.leagueId, job);
  return job;
}
