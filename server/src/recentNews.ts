import { addDays, baseballToday } from './etDate.js';
import { mapLimit } from './limit.js';
import { getRotowireIndex } from './rotowire.js';
import { readJsonBlob, writeJsonBlob } from './storage.js';
import type { RecentNews, NewsRecency } from './types.js';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/**
 * # Who in the league has news, and when — one read for everybody.
 *
 * The mark beside a player's name says *there is something in his News tab and
 * it is from today* (red) *or from yesterday* (grey). That mark is drawn on the
 * research board, which is six hundred names at once, so the one thing this
 * could not be is `/api/players/:id/news` six hundred times. It is the class
 * `getPlayerPool` and the ESPN ownership map are in: **one upstream sweep,
 * cached, shared by every user**, keyed by MLB id.
 *
 * ## The bulk sources, and the one that answers
 *
 * The per-player section is RotoWire's notes plus MLB's transactions (see
 * `news.ts`). Both halves turn out to have a league-wide form, which is the
 * whole reason this is possible at all — and the RotoWire one had to be found,
 * every endpoint in that file's probe table having been tried against a *player*
 * rather than against the league.
 *
 * | Endpoint | Result |
 * | --- | --- |
 * | `www.rotowire.com/baseball/news.php?team={ABBR}` | **200 — the source used here.** 25 dated notes for one club, each carrying a `news-update__player-link` to `/baseball/player/{slug}-{rwId}`. ~345KB of HTML, **65KB gzipped**. Thirty of these is the league. |
 * | `statsapi.mlb.com/api/v1/transactions?startDate=&endDate=` (no `playerId`) | **200 — the second source used here.** Every move in the league over the range in one call, each row carrying `person.id`, which is the MLB id itself. 343 rows / 132KB over a four-day window. |
 * | `www.rotowire.com/baseball/news.php` (bare) | **200, and 25 items all dated today.** The league feed is a rolling newest-25 across all thirty clubs, so on a busy afternoon it does not reach back one day, let alone two. Useless for this — and it is the endpoint that *looks* like the answer. |
 * | `www.rotowire.com/baseball/tables/news.php` | **404** |
 * | `www.rotowire.com/baseball/news.php?page=` / `?offset=` | **200, ignored** (already in `rotowire.ts`'s table) |
 * | `www.rotowire.com/rss/news.php?sport=MLB` | **200**, 10 items, league-wide (likewise) |
 *
 * **Twenty-five per club reaches back far enough, and that is a measurement
 * rather than a hope.** Driven against all thirty clubs at once on 2026-08-15:
 * every one of the thirty came back 200 with 25 items and 25 player links, and
 * **every one of them spanned at least four calendar days** — the narrowest was
 * LAD at Aug 12–14 and the widest MIA and STL at Aug 8–15. Nothing this window
 * needs is older than yesterday, so the tightest club has a full day of margin.
 * It is the right thing to re-measure if the mark ever starts missing a player
 * on a deadline day, and the failure is benign in the meantime: a club whose 25
 * items were all filed today would still mark every red row correctly and would
 * only lose greys.
 *
 * **ESPN's club article feed was the third candidate and is deliberately not
 * here.** It would answer in bulk — it is already fetched and cached per club —
 * but `news.ts` dropped it as a *news* source, so a mark drawn from it would
 * promise a News tab entry the News tab does not have. The mark's whole job is
 * to be right about what is behind it.
 *
 * ## The join is exact, which is the part worth stating
 *
 * A club page's player link is `/baseball/player/{slug}-{rwId}`, and
 * `rotowire.ts`'s index is MLB id → that same path — so the join is a **numeric
 * RotoWire id on both sides**, inverted out of an index that has already done
 * the name-and-club matching once, league-wide, with the club breaking ties.
 * There is no name comparison anywhere in this file. It is a strictly better
 * join than the ESPN article feed's ever was, and a player the index cannot
 * place simply gets no mark, which is the direction every join here fails in.
 *
 * The RotoWire **id** is used rather than the path itself so a slug rewrite
 * upstream (a player renamed, a hyphen changed) cannot silently unjoin him.
 *
 * ## What each source costs, and why nothing pre-warms it
 *
 * ~2MB gzipped and about a second of wall clock at six in flight, once per
 * `TTL` for the whole user base. It is deliberately **not** in `warmer.ts`:
 * that file's live rule runs every five minutes, which against a thirty-minute
 * window would spend 2MB six times over to keep warm a map nobody may be
 * looking at. A shared read this size is paid by the first reader of it.
 */

/**
 * RotoWire's own club codes, taken off its news page's own club nav rather than
 * written from memory. Thirty of thirty, and note `ARI` where MLB says `AZ` —
 * the same one disagreement `rotowire.ts::ROTOWIRE_TEAM_ALIASES` records, and
 * harmless here because nothing in this file joins on a club at all: the code
 * is a URL parameter and the player is identified by his RotoWire id.
 */
const ROTOWIRE_TEAMS = [
  'ATH', 'BAL', 'BOS', 'CLE', 'CWS', 'DET', 'HOU', 'KC', 'LAA', 'MIN',
  'NYY', 'SEA', 'TB', 'TEX', 'TOR', 'ARI', 'ATL', 'CHC', 'CIN', 'COL',
  'LAD', 'MIA', 'MIL', 'NYM', 'PHI', 'PIT', 'SD', 'SF', 'STL', 'WSH',
];

/**
 * Thirty clubs at six in flight — the repo's own `DAY_CONCURRENCY`, and the
 * same cap `getTeamRosters` puts on its ESPN fan-out. Unbounded would be thirty
 * sockets against a site that has no idea we are doing this; measured at six it
 * is about a second for the sweep.
 */
const CLUB_CONCURRENCY = 6;

/**
 * How long the map stays fresh. **Thirty minutes, which is `news.ts`'s own TTL
 * and is that on purpose**: the mark and the tab behind it must not be able to
 * disagree about whether a man has news. Longer here would have a red mark
 * standing over a tab that had already moved on, and shorter would spend the
 * sweep for a resolution the data does not have — both halves date to a *day*.
 */
const TTL = 30 * 60 * 1000;

/**
 * The stored form is **the dates, never the levels**.
 *
 * A level is a fact about the day it was computed on, so a blob holding levels
 * would be a stored answer that goes wrong at 3am whether or not anything about
 * it was stale. Holding the date and classifying at read time makes the blob
 * mean the same thing whenever it is read, and makes the rollover self-correct
 * with no refetch: an item that was red yesterday is grey this morning and
 * falls out of the map tomorrow, off one comparison.
 */
const BLOB_KEY = 'news-recent-v1.json';

/** MLB id → the newest thing said about him, and what said it. */
type NewsDates = Map<number, { date: string; headline: string }>;

let cache: { map: NewsDates; at: number } | null = null;
/** So a cold container answering three boards at once sends one sweep rather
 *  than three, the guard every shared read in this codebase carries. */
let inFlight: Promise<NewsDates> | null = null;

// ---- RotoWire, a club at a time ---------------------------------------

const MONTHS: Record<string, string> = {
  January: '01', February: '02', March: '03', April: '04',
  May: '05', June: '06', July: '07', August: '08',
  September: '09', October: '10', November: '11', December: '12',
};

/** `August 14, 2026` → `2026-08-14`. `rotowire.ts` has the same three lines for
 *  the same strings; they are not shared because that one is a private of the
 *  scrape and this one is a private of the sweep, and four lines duplicated is
 *  cheaper than an export that ties two parsers together. */
function isoDate(raw: string): string | null {
  const m = /^([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const month = MONTHS[m[1]];
  return month ? `${m[3]}-${month}-${m[2].padStart(2, '0')}` : null;
}

/** Tags out, the handful of entities RotoWire actually emits in, whitespace
 *  collapsed — a headline goes into a tooltip and nothing else. */
function plain(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;|&rsquo;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

interface ClubNote {
  rwId: number;
  date: string;
  headline: string;
}

/**
 * One club's 25 newest notes.
 *
 * **The block split is `rotowire.ts`'s with one character changed, and the
 * character is the whole of the correctness.** That one splits on
 * `<div class="news-update ` — the trailing *space* being what keeps the
 * container's own `news-update__something` children from matching — and on a
 * player page it is right, because every note there carries the modifier
 * classes `is-injured has-no-player-name` and so has a space after the name.
 * **On a club page most notes carry no modifier at all** and are a bare
 * `class="news-update"`, so the space-only split finds the handful that happen
 * to be injuries and drops the rest: measured on TOR, **5 blocks against 25
 * timestamps**, and league-wide **151 notes parsed of 750**. Accepting either
 * terminator (`[ "]`) finds exactly 25 per club and still cannot match a child,
 * every one of which has a `_` there.
 *
 * That is worth stating rather than fixing quietly, because it is the failure
 * this kind of scrape has: it did not throw, it did not warn, and it produced a
 * map that was three quarters right — 26 players marked red where the true
 * figure was 55.
 *
 * A block missing any of its three fields is dropped rather than guessed at,
 * which is the rule the per-player scrape follows and the reason a shape change
 * here empties this half instead of inventing entries.
 */
async function fetchClubNotes(team: string): Promise<ClubNote[]> {
  const res = await fetch(`https://www.rotowire.com/baseball/news.php?team=${team}`, {
    headers: UA,
  });
  if (!res.ok) throw new Error(`RotoWire ${team} news returned ${res.status}`);
  const html = await res.text();
  const notes: ClubNote[] = [];
  for (const block of html.split(/(?=<div class="news-update[ "])/).slice(1)) {
    const link = /class="news-update__player-link"[^>]*href="\/baseball\/player\/[^"]*?-(\d+)"/.exec(
      block,
    );
    const stamp = /class="news-update__timestamp"[^>]*>([^<]*)</.exec(block);
    const headline = /class="news-update__headline"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (!link || !stamp || !headline) continue;
    const date = isoDate(stamp[1]);
    const text = plain(headline[1]);
    if (!date || !text) continue;
    notes.push({ rwId: Number(link[1]), date, headline: text });
  }
  return notes;
}

// ---- MLB transactions, the whole league in one call --------------------

interface TransactionsResponse {
  transactions?: {
    person?: { id?: number };
    date?: string;
    effectiveDate?: string;
    typeCode?: string;
    description?: string;
  }[];
}

/** The one type code `news.ts` drops from a player's own list, dropped here for
 *  the same reason and so that the two cannot disagree: on Jackie Robinson Day
 *  a uniform change is a uniform change for the whole league, which would put a
 *  red mark on 1,300 names for a day. */
const QUIET_TRANSACTIONS = new Set(['NUM']);

/**
 * Every move in the league over the window, by MLB id.
 *
 * `person.id` **is** the MLB id, so this half needs no join of any kind — which
 * is also why it is worth having beside the RotoWire sweep rather than being
 * folded into it: it is one request, it cannot mis-join anybody, and it is the
 * half that keeps the mark standing if RotoWire's page shape ever moves.
 *
 * It reaches a day past today, because MLB stamps some moves with an
 * `effectiveDate` in the future and a note about tomorrow is not a reason to
 * hide today's.
 */
async function fetchLeagueTransactions(from: string, to: string): Promise<ClubNote[]> {
  const url =
    `https://statsapi.mlb.com/api/v1/transactions?startDate=${from}&endDate=${to}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`league transactions returned ${res.status}`);
  const data = (await res.json()) as TransactionsResponse;
  const out: ClubNote[] = [];
  for (const t of data.transactions ?? []) {
    const id = t.person?.id;
    const date = t.effectiveDate ?? t.date;
    const text = t.description;
    if (!id || !date || !text) continue;
    if (t.typeCode && QUIET_TRANSACTIONS.has(t.typeCode)) continue;
    // `rwId` is a misnomer for this half and is deliberate: these two lists are
    // merged by the same code below, and giving the transaction rows an MLB id
    // in a field named for RotoWire's would be the shape that eventually gets
    // one of them joined as the other. They are kept apart until the merge.
    out.push({ rwId: id, date, headline: text });
  }
  return out;
}

// ---- The sweep --------------------------------------------------------

/** Keep the later date; on the same day keep whichever was offered first, which
 *  the caller orders so that RotoWire's wording leads MLB's — the same
 *  precedence `getPlayerNews` gives them, so the headline in the tooltip is the
 *  headline at the top of the tab. */
function keepNewest(map: NewsDates, id: number, date: string, headline: string): void {
  const had = map.get(id);
  if (had && had.date >= date) return;
  map.set(id, { date, headline });
}

async function sweep(): Promise<NewsDates> {
  const today = baseballToday();
  const map: NewsDates = new Map();

  // Each source in its own `try`, the rule `news.ts` runs on one player at a
  // time: a dead RotoWire leaves the transactions marking the league's moves,
  // and a dead MLB leaves the reporting. Neither can 502 a board.
  const [notes, transactions] = await Promise.all([
    (async () => {
      const index = await getRotowireIndex();
      // Inverted once rather than searched per note: 1,375 entries against
      // 750 notes, and a linear scan per note would be a million comparisons
      // for a map lookup's worth of answer.
      const mlbByRwId = new Map<number, number>();
      for (const [mlbId, path] of index) {
        const m = /-(\d+)$/.exec(path);
        if (m) mlbByRwId.set(Number(m[1]), mlbId);
      }
      if (mlbByRwId.size === 0) return [] as ClubNote[];
      const perClub = await mapLimit(ROTOWIRE_TEAMS, CLUB_CONCURRENCY, (t) => fetchClubNotes(t));
      const out: ClubNote[] = [];
      for (const club of perClub) {
        for (const n of club) {
          const mlbId = mlbByRwId.get(n.rwId);
          if (mlbId) out.push({ ...n, rwId: mlbId });
        }
      }
      return out;
    })().catch((err: unknown) => {
      console.error('league RotoWire news sweep failed:', (err as Error).message);
      return [] as ClubNote[];
    }),
    // Two days back and one forward: the window this answers for is today and
    // yesterday, and the extra day either side costs one request nothing while
    // making the boundary a filter rather than a fetch.
    fetchLeagueTransactions(addDays(today, -2), addDays(today, 1)).catch((err: unknown) => {
      console.error('league transactions sweep failed:', (err as Error).message);
      return [] as ClubNote[];
    }),
  ]);

  for (const n of notes) keepNewest(map, n.rwId, n.date, n.headline);
  for (const t of transactions) keepNewest(map, t.rwId, t.date, t.headline);
  return map;
}

async function loadDates(): Promise<NewsDates> {
  if (cache && Date.now() - cache.at < TTL) return cache.map;
  if (inFlight) return inFlight;
  const work = (async (): Promise<NewsDates> => {
    const stored = await readJsonBlob<[number, { date: string; headline: string }][]>(
      BLOB_KEY,
      (_v, at) => Date.now() - at < TTL,
    );
    if (stored) {
      const map: NewsDates = new Map(stored);
      cache = { map, at: Date.now() };
      return map;
    }
    const map = await sweep();
    cache = { map, at: Date.now() };
    // The reduced map rather than the 10MB of HTML it came out of, the rule
    // `espn-period-anchor` and the RotoWire index both follow. ~25KB.
    await writeJsonBlob<[number, { date: string; headline: string }][]>(BLOB_KEY, [...map]);
    return map;
  })();
  // The failure is handled **inside** the shared promise rather than around one
  // caller's await, so a rejection cannot be handed to the other callers the
  // `inFlight` guard has already given this promise to. It never rejects: it
  // answers with a map or with an empty one, and a board with no marks on it is
  // a board.
  inFlight = work
    .catch((err: unknown) => {
      console.error('recent-news map unavailable:', (err as Error).message);
      return new Map() as NewsDates;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * The players with news today or yesterday, by MLB id — and nobody else.
 *
 * ## What "today" means, which the data decides rather than the design
 *
 * Both upstreams date to a **day** and neither publishes an instant — MLB
 * stamps a transaction with a date and RotoWire stamps a note `August 14,
 * 2026` — so a rolling 24 hours is not merely a different choice here, it is
 * uncomputable from what there is. The window is therefore the app's own day,
 * `baseballToday()`, which turns at 3am ET:
 *
 * - **today** — the note is stamped `baseballToday()` **or later**;
 * - **yesterday** — the day before that;
 * - anything else is not in the map at all, the rule `saysSomething` follows
 *   for `/api/statuses`: a player nothing is true of is not shipped.
 *
 * **"Or later" is doing real work rather than being defensive.** RotoWire's own
 * day turns at midnight ET while ours turns at 3am, so between those two hours
 * its desk files notes under tomorrow's date while the app still calls it
 * today — and those notes are the *newest news there is*. Comparing for
 * equality would drop exactly them, which is the one thing a "he has news
 * today" mark must never do. This is the same disagreement `espn.ts` records
 * between our 3am and ESPN's 4:26am batch, answered here by taking the wider
 * side because the cost of being wrong is asymmetric.
 */
export async function getRecentNews(): Promise<Map<number, RecentNews>> {
  const dates = await loadDates();
  const today = baseballToday();
  const yesterday = addDays(today, -1);
  const out = new Map<number, RecentNews>();
  for (const [id, { date, headline }] of dates) {
    const day = date.slice(0, 10);
    const level: NewsRecency | null =
      day >= today ? 'today' : day === yesterday ? 'yesterday' : null;
    if (level) out.set(id, { date: day, level, headline });
  }
  return out;
}
