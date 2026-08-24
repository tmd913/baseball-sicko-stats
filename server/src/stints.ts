/**
 * **Where a player was on a day he did not play**, which is the one thing a game
 * log cannot say for itself.
 *
 * `stats(type=[gameLog])` is a list of games he *appeared in*. Everything the
 * log leaves out is silence of two completely different kinds — a rest day for
 * a man who was on the bench in uniform, and six weeks on the injured list —
 * and the log draws them identically by drawing neither. This file is what
 * tells them apart, so `gameLog.ts` can fill a batter's season in.
 *
 * **The upstream is `/api/v1/transactions`, and it was probed before it was
 * built on** (this repo's standing rule, half its dead ends being endpoints that
 * return 200 and ignore the parameter). Measured against the live API on
 * 2026-08-24: Aaron Judge (592450) over the season returns **6** transactions
 * carrying both of his injured-list placements, the retroactive re-file of the
 * first, and his activation; Joshua Báez (695491) returns **6** carrying an
 * option to Memphis in March and a recall on 2026-08-15, which is the whole of
 * why his season log begins in the middle of August.
 *
 * ```
 * 2026-06-02 | SC  | ->147     | New York Yankees placed RF Aaron Judge on the 10-day injured list.
 * 2026-07-13 | SC  | ->147     | American League All-Stars activated RF Aaron Judge from the 10-day…
 * 2026-03-09 | OPT | 138->235  | St. Louis Cardinals optioned RF Joshua Báez to Memphis Redbirds.
 * 2026-08-15 | CU  | 235->138  | St. Louis Cardinals recalled RF Joshua Báez from Memphis Redbirds.
 * ```
 *
 * **A club id is the strong signal and the description is the weak one, so the
 * club is read first.** Whether `toTeam.id` is one of the thirty is a fact, and
 * a man on a club that is not one of the thirty is in the minors whatever any
 * sentence says. Only the injured list needs the sentence at all, being the one
 * state where he is still on his major-league club and still unavailable — and
 * that is why the parsing here is confined to it rather than being the method.
 *
 * **An unclassifiable transaction leaves the state where it was.** The standing
 * rule is that a join fails to null rather than to a guess, and the null here is
 * *no change* — a row this file cannot read is a row that must not invent a
 * six-week absence, and the cost of missing one is a handful of days drawn as
 * "did not play", which is the honest reading of a day nothing is known about.
 */

import type { PlayerStint } from './types.js';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/** A transaction, as far as this file reads one. */
interface Transaction {
  date?: string;
  effectiveDate?: string;
  typeCode?: string;
  description?: string;
  fromTeam?: { id?: number; name?: string };
  toTeam?: { id?: number; name?: string };
}

interface TransactionsResponse {
  transactions?: Transaction[];
}

/**
 * A season's stints move only when a transaction lands, which is a thing that
 * happens to one player a few times a year — but the log they feed is opened
 * over and over on the same handful of players, and an option or an IL
 * placement is news on the day it happens. Thirty minutes is `gameLog.ts`'s own
 * span for a finished log and the same answer to the same question.
 */
const STINTS_TTL = 30 * 60 * 1000;

const cache = new Map<string, { stints: PlayerStint[]; fetchedAt: number }>();

/**
 * MLB writes a retroactive placement as a *second* transaction on the day it is
 * filed, naming the day it takes effect in prose — Judge was placed on the
 * 10-day list on June 2 and the same placement re-filed on June 5 "retroactive
 * to June 2, 2026". Reading the sentence is what keeps the second one from
 * moving the start of a stint three days later than it began.
 */
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

function retroDate(description: string): string | null {
  const m = /retroactive to ([A-Z][a-z]+) (\d{1,2}), (\d{4})/.exec(description);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/** The injured list a sentence names, as the label a row will print. MLB spells
 *  the span into the description ("the 10-day injured list") and it is the only
 *  place the length appears. */
function injuredListLabel(description: string): string | null {
  const m = /\b(\d+)-day injured list\b/i.exec(description);
  if (m) return `${m[1]}-day IL`;
  // Some placements are written without the span — a minor-league IL, mostly.
  return /\binjured list\b/i.test(description) ? 'Injured list' : null;
}

/** The other lists a man can be unavailable on, all of them written the same
 *  way and none of them an injury. */
function otherListLabel(description: string): string | null {
  const m =
    /\bplaced .* on the (bereavement|paternity|restricted|suspended|family medical emergency|military) list\b/i.exec(
      description,
    );
  if (!m) return null;
  const word = m[1].toLowerCase();
  return word === 'family medical emergency'
    ? 'Family medical list'
    : `${word[0].toUpperCase()}${word.slice(1)} list`;
}

/**
 * **The 201 affiliated minor-league clubs**, which is the set that tells being
 * sent down from everything else a non-major club can be.
 *
 * The first cut had no such set and read *any* club that is not one of the
 * thirty as the minors, which is wrong in a World Baseball Classic year and was
 * caught by the player it is most obviously wrong about: Aaron Judge's season
 * opened with `United States activated RF Aaron Judge` on 2026-02-05, and the
 * fold turned that into a stint reading **"Minors — United States"** running to
 * the middle of April. A national team is not a demotion.
 *
 * So a move to a club in neither set **leaves the state where it was** — the
 * file's standing rule, and the right answer for a winter league, an
 * independent league or a country. Measured: one request, 201 clubs, and the
 * bogus stint is gone.
 */
const MINORS_TTL = 24 * 60 * 60 * 1000;
let minorsCache: { ids: Set<number>; fetchedAt: number } | null = null;

async function getMinorClubs(): Promise<Set<number>> {
  if (minorsCache && Date.now() - minorsCache.fetchedAt < MINORS_TTL) return minorsCache.ids;
  try {
    const res = await fetch(
      'https://statsapi.mlb.com/api/v1/teams?sportIds=11,12,13,14,16&fields=teams,id',
      { headers: UA },
    );
    if (!res.ok) throw new Error(`minor teams returned ${res.status}`);
    const data = (await res.json()) as { teams?: { id?: number }[] };
    const ids = new Set<number>();
    for (const t of data.teams ?? []) if (typeof t.id === 'number') ids.add(t.id);
    minorsCache = { ids, fetchedAt: Date.now() };
    return ids;
  } catch (err) {
    // An empty set costs an option its row rather than the whole timeline: with
    // nothing to match, a demotion falls into the same "leave it alone" branch a
    // national team does, which under-reports and never invents.
    console.error('minor-league team list failed:', err);
    return minorsCache?.ids ?? new Set();
  }
}

/** The running state a fold over the transactions carries. */
interface State {
  /** His major-league club, or null when he is not on one — the minors, a
   *  release, or a season that has not started for him yet. */
  club: number | null;
  /** The club he is with when it is not a major-league one, for the row's
   *  label: "Memphis Redbirds" rather than a bare "Minors". */
  minorClub: string | null;
  /** The list he is on, as its printed label, or null when he is available. */
  list: string | null;
  /** Designated for assignment — on the major-league club's books and on
   *  nobody's active roster. */
  dfa: boolean;
  /** MLB's own sentence for whatever put him here, for the row's tooltip. */
  detail: string;
}

const sameState = (a: State, b: State): boolean =>
  a.club === b.club && a.minorClub === b.minorClub && a.list === b.list && a.dfa === b.dfa;

/**
 * What a state reads as on the wire. `null` is *available* — he was on a
 * major-league active roster that day and any game of his club's he is missing
 * from is a day he did not get into, which is a different row.
 */
function labelOf(st: State): string | null {
  if (st.list) return st.list;
  if (st.dfa) return 'Designated for assignment';
  if (st.club === null) return st.minorClub ? `Minors — ${st.minorClub}` : 'Not on a roster';
  return null;
}

/**
 * **One player's season as the states he passed through**, oldest first and
 * each running to the day before the next begins.
 *
 * `mlbClubs` is the thirty ids — `gameLog.ts` already holds them for the
 * abbreviation column, so this costs no request of its own — and it is the test
 * that separates a recall from an assignment between two minor-league clubs
 * without reading a word of English.
 *
 * The window opens on **October 1 of the previous year** rather than on opening
 * day, because the state a season starts in is set by the winter: a man signed
 * as a free agent in December and optioned in spring training has no
 * in-season transaction saying which club he belongs to, and a fold that began
 * in March would not know he had one.
 */
export async function getPlayerStints(
  playerId: number,
  season: number,
  mlbClubs: Set<number>,
): Promise<PlayerStint[]> {
  const key = `${playerId}-${season}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < STINTS_TTL) return hit.stints;

  const url =
    `https://statsapi.mlb.com/api/v1/transactions?playerId=${playerId}` +
    `&startDate=${season - 1}-10-01&endDate=${season}-12-31`;
  const minorClubs = await getMinorClubs();
  let raw: Transaction[];
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`transactions returned ${res.status}`);
    raw = ((await res.json()) as TransactionsResponse).transactions ?? [];
  } catch (err) {
    // A failure costs the log its absence rows and nothing else: every day he
    // did not play then reads as a day he did not play, which is true and
    // merely less informative. The standing rule — a failure costs its own
    // column, never the request.
    console.error('player transactions fetch failed:', err);
    return cache.get(key)?.stints ?? [];
  }

  const events: { date: string; apply: (st: State) => void }[] = [];
  for (const t of raw) {
    const desc = t.description ?? '';
    const on = t.effectiveDate || t.date;
    if (!on) continue;
    const toId = t.toTeam?.id;
    const toName = t.toTeam?.name ?? null;
    const toIsMajor = typeof toId === 'number' && mlbClubs.has(toId);

    // The injured list, and the two other things a `Status Change` can be.
    // Read before the club, because an IL placement carries a `toTeam` that is
    // his own club and would otherwise read as an ordinary arrival on it.
    const il = injuredListLabel(desc);
    const other = otherListLabel(desc);
    const activated = /\b(activated|reinstated)\b/i.test(desc);
    const placed = /\b(placed|transferred)\b/i.test(desc);
    const dfa = /\bdesignated .* for assignment\b/i.test(desc);
    const released = /\breleased\b/i.test(desc);

    if (placed && (il || other)) {
      const label = other ?? il!;
      events.push({
        date: retroDate(desc) ?? on,
        apply: (st) => {
          st.list = label;
          st.detail = desc;
        },
      });
      continue;
    }
    if (activated && (il || other || /\blist\b/i.test(desc))) {
      events.push({
        date: on,
        apply: (st) => {
          st.list = null;
          st.dfa = false;
          if (toIsMajor) {
            st.club = toId!;
            st.minorClub = null;
          }
          st.detail = desc;
        },
      });
      continue;
    }
    if (dfa) {
      events.push({
        date: on,
        apply: (st) => {
          st.dfa = true;
          st.detail = desc;
        },
      });
      continue;
    }
    if (released) {
      events.push({
        date: on,
        apply: (st) => {
          st.club = null;
          st.minorClub = null;
          st.dfa = false;
          st.list = null;
          st.detail = desc;
        },
      });
      continue;
    }
    // Everything else is a move, and where it lands is the whole of the
    // reading: an option, a recall, a trade, a waiver claim and a free-agent
    // signing differ in their prose and not in what this file needs from them.
    if (typeof toId === 'number' && (toIsMajor || minorClubs.has(toId))) {
      events.push({
        date: on,
        apply: (st) => {
          if (toIsMajor) {
            st.club = toId;
            st.minorClub = null;
            st.dfa = false;
          } else {
            st.club = null;
            st.minorClub = toName;
          }
          st.detail = desc;
        },
      });
    }
  }

  // Oldest first. A stable sort on the date alone keeps two transactions filed
  // on one day in the order MLB listed them, which is the order they happened —
  // an option and the assignment that follows it share a date constantly.
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const st: State = { club: null, minorClub: null, list: null, dfa: false, detail: '' };
  const stints: PlayerStint[] = [];
  const push = (from: string): void => {
    const label = labelOf(st);
    const last = stints[stints.length - 1];
    // A run of transactions that do not change what a reader would see — three
    // assignments between three minor-league clubs — is one stint, not three.
    if (last && last.status === label && last.club === st.club && last.to === null) return;
    if (last && last.to === null) last.to = from;
    stints.push({ from, to: null, status: label, club: st.club, detail: st.detail });
  };

  let prev: State | null = null;
  for (const ev of events) {
    ev.apply(st);
    if (!prev || !sameState(prev, st)) {
      push(ev.date);
      prev = { ...st };
    }
  }

  cache.set(key, { stints, fetchedAt: Date.now() });
  return stints;
}

/**
 * The status on one date — `null` when he was available to play, which is what
 * makes a missing game a day he did not get into rather than a day he was not
 * there for.
 *
 * Before the first stint begins there is nothing to say, and *nothing to say is
 * not an absence*: a player with no transactions at all (most of them, most
 * years) is available all season, which is exactly right.
 */
export function statusOn(stints: PlayerStint[], date: string): PlayerStint | null {
  let found: PlayerStint | null = null;
  for (const s of stints) {
    if (s.from > date) break;
    if (s.to === null || date < s.to) found = s;
  }
  return found && found.status !== null ? found : null;
}
