import { addDays, baseballToday } from './etDate.js';
import { mapLimit } from './limit.js';
import { getRotowireIndex } from './rotowire.js';
import { readJsonBlob, writeJsonBlob } from './storage.js';
import { getTeamAbbrevs } from './mlbStats.js';
import type { LeagueNews, LeagueNewsItem, RecentNews, NewsRecency } from './types.js';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/**
 * # Who in the league has news, and when — one read for everybody.
 *
 * The mark beside a player's name says *there is something in his News tab and
 * it is from today* (red) *or from yesterday* (gray). That mark is drawn on the
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
 * only lose grays.
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
 * **How far back the sweep reaches**, and it is a week because a *feed* needs
 * one.
 *
 * It was **two days**, and the reasoning was exactly right for the one reader
 * this file had: the mark says today or yesterday, so two days back and one
 * forward made the boundary a filter rather than a fetch. `getLeagueNews` is
 * the second reader and asks a different question — *what has been going on* —
 * which two days cannot answer on a Monday morning.
 *
 * Seven is RotoWire's own reach rather than a number picked to be round: 25
 * notes per club span four to seven days (measured, all thirty clubs), so a
 * transaction window wider than that would be a feed whose two halves stop at
 * different places, with the last three days carrying moves and no reporting.
 *
 * **It costs the mark nothing.** Those days are classified and dropped by
 * `getRecentNews` exactly as the third day already was; what changes is one
 * request's size — 216 rows over three days becomes roughly 500 over eight.
 */
const NEWS_DAYS = 7;

/**
 * The stored form is **the dates, never the levels**.
 *
 * A level is a fact about the day it was computed on, so a blob holding levels
 * would be a stored answer that goes wrong at 3am whether or not anything about
 * it was stale. Holding the date and classifying at read time makes the blob
 * mean the same thing whenever it is read, and makes the rollover self-correct
 * with no refetch: an item that was red yesterday is gray this morning and
 * falls out of the map tomorrow, off one comparison.
 *
 * **`-v2` because the blob is the notes now and was the reduced map**, which is
 * the version rule read exactly as `docs/claude/data-sources.md` states it: the
 * shape stored changed, and a v1 blob deserialized as this would be a list of
 * `undefined`s. The reduction is still a reduction — ~250KB of notes out of
 * ~10MB of HTML and JSON, against the ~25KB the map alone cost — and it is what
 * buys the second reader of this sweep (`getLeagueNews`) its whole answer
 * without a second sweep. The map is derived from the list at read time, which
 * is the same "store the fact, classify on read" rule the paragraph above
 * makes for the levels.
 */
const BLOB_KEY = 'news-recent-v2.json';

/** MLB id → the newest thing said about him, and what said it. */
type NewsDates = Map<number, { date: string; headline: string }>;

let cache: { notes: SweepNote[]; at: number } | null = null;
/** So a cold container answering three boards at once sends one sweep rather
 *  than three, the guard every shared read in this codebase carries. */
let inFlight: Promise<SweepNote[]> | null = null;

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

/**
 * One thing said about one player, from either half of the sweep.
 *
 * **It carries more than the mark needs, and that is the point of it.** The
 * mark wants a date and a headline; the league's news feed wants who it is
 * about, which club, and the paragraph under the headline. One shape rather
 * than two means the two readings cannot come to disagree about what was said
 * — and every field here is on the page the sweep already fetches, so the
 * wider note costs one more regular expression per note and no requests.
 */
interface SweepNote {
  source: 'mlb' | 'rotowire';
  /**
   * **The player, as the source identifies him** — a RotoWire id on a note, an
   * MLB id on a transaction. The two are kept apart until the merge, where the
   * RotoWire half is inverted through the index into MLB ids; a field named for
   * one of them holding the other is the shape that eventually gets one joined
   * as the other.
   */
  playerId: number;
  playerName: string | null;
  team: string | null;
  position: string | null;
  date: string;
  headline: string;
  summary: string | null;
  /** What MLB calls the kind of move — `Status Change`, `Designated for
   *  Assignment` — which is `NewsItem.kind`'s own field filled from
   *  `news.ts`'s own source. Null on a RotoWire note, which has no such
   *  vocabulary and whose headline is the kind. */
  kind: string | null;
  /**
   * **Whether the note is about a major-league club** — the one field the
   * league news feed narrows on and the mark deliberately does not.
   *
   * MLB's transaction log is the whole organization: measured over 2026-08-23
   * to 08-25, **216 moves of which 73 name a major-league club**, the rest
   * being a Lakeland activation nobody reading a league feed came for. A rehab
   * assignment *to* Sacramento names the Giants as the club sending him and
   * stays, which is the case the test is shaped around.
   *
   * The mark keeps them all: a Triple-A move for a man on a research board *is*
   * news about him, and the mark's job is to say there is something in his tab.
   */
  major: boolean;
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
async function fetchClubNotes(team: string): Promise<SweepNote[]> {
  const res = await fetch(`https://www.rotowire.com/baseball/news.php?team=${team}`, {
    headers: UA,
  });
  if (!res.ok) throw new Error(`RotoWire ${team} news returned ${res.status}`);
  const html = await res.text();
  const notes: SweepNote[] = [];
  for (const block of html.split(/(?=<div class="news-update[ "])/).slice(1)) {
    const link =
      /class="news-update__player-link"[^>]*href="\/baseball\/player\/[^"]*?-(\d+)"[^>]*>([\s\S]*?)<\/a>/.exec(
        block,
      );
    const stamp = /class="news-update__timestamp"[^>]*>([^<]*)</.exec(block);
    const headline = /class="news-update__headline"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (!link || !stamp || !headline) continue;
    const date = isoDate(stamp[1]);
    const text = plain(headline[1]);
    if (!date || !text) continue;
    // **The three that are allowed to be missing**, and they are the three the
    // mark never wanted: a note whose meta block moves upstream loses its club
    // and its position and still marks its player and still reads on the feed.
    // The player link, the timestamp and the headline are not in that class —
    // a block missing any of them is dropped rather than guessed at, which is
    // the rule the per-player scrape follows and the reason a shape change here
    // empties this half instead of inventing entries.
    // The position badge and the club are one string in the source —
    // `<b class="news-update__pos">P</b>Tampa Bay Rays` — so they come off one
    // expression rather than two that would have to agree about it.
    const meta = /class="news-update__pos"[^>]*>([^<]*)<\/b>([^<]*)</.exec(block);
    const body = /class="news-update__news"[^>]*>([\s\S]*?)<\/div>/.exec(block);
    notes.push({
      source: 'rotowire',
      playerId: Number(link[1]),
      playerName: plain(link[2]) || null,
      team: meta ? plain(meta[2]) || null : null,
      position: meta ? plain(meta[1]) || null : null,
      date,
      headline: text,
      summary: body ? plain(body[1]) || null : null,
      kind: null,
      // Every RotoWire note is major-league by construction — the sweep asks
      // the thirty club pages by name, so the page has already answered this.
      major: true,
    });
  }
  return notes;
}

// ---- MLB transactions, the whole league in one call --------------------

interface TransactionsResponse {
  transactions?: {
    person?: { id?: number; fullName?: string };
    fromTeam?: { id?: number; name?: string };
    toTeam?: { id?: number; name?: string };
    date?: string;
    effectiveDate?: string;
    typeCode?: string;
    typeDesc?: string;
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
async function fetchLeagueTransactions(from: string, to: string): Promise<SweepNote[]> {
  const url =
    `https://statsapi.mlb.com/api/v1/transactions?startDate=${from}&endDate=${to}`;
  const [res, abbrevs] = await Promise.all([fetch(url, { headers: UA }), getTeamAbbrevs()]);
  if (!res.ok) throw new Error(`league transactions returned ${res.status}`);
  const data = (await res.json()) as TransactionsResponse;
  const out: SweepNote[] = [];
  for (const t of data.transactions ?? []) {
    const id = t.person?.id;
    const date = t.effectiveDate ?? t.date;
    const text = t.description;
    if (!id || !date || !text) continue;
    if (t.typeCode && QUIET_TRANSACTIONS.has(t.typeCode)) continue;
    // **Either end counts.** A call-up names the major club as `toTeam` and a
    // rehab assignment names it as `fromTeam`, and both are league news; only a
    // move with a minor-league club at both ends is not.
    const major =
      (t.toTeam?.id !== undefined && abbrevs.has(t.toTeam.id)) ||
      (t.fromTeam?.id !== undefined && abbrevs.has(t.fromTeam.id));
    out.push({
      source: 'mlb',
      playerId: id,
      playerName: t.person?.fullName ?? null,
      // The club that did it, which is what the description already names —
      // carried separately so a row can print it as a club rather than leaving
      // the reader to find it in a sentence.
      team: (major && abbrevs.has(t.toTeam?.id ?? -1) ? t.toTeam?.name : t.fromTeam?.name) ?? null,
      // MLB gives none, and a position guessed from a roster read would be a
      // fact about today rather than about the move.
      position: null,
      date,
      headline: text,
      // The description **is** the headline here: a transaction is one
      // sentence, and repeating it underneath itself would be a summary that
      // summarizes nothing.
      summary: null,
      kind: t.typeDesc ?? null,
      major,
    });
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

async function sweep(): Promise<SweepNote[]> {
  const today = baseballToday();

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
      if (mlbByRwId.size === 0) return [] as SweepNote[];
      const perClub = await mapLimit(ROTOWIRE_TEAMS, CLUB_CONCURRENCY, (t) => fetchClubNotes(t));
      const out: SweepNote[] = [];
      for (const club of perClub) {
        for (const n of club) {
          const mlbId = mlbByRwId.get(n.playerId);
          if (mlbId) out.push({ ...n, playerId: mlbId });
        }
      }
      return out;
    })().catch((err: unknown) => {
      console.error('league RotoWire news sweep failed:', (err as Error).message);
      return [] as SweepNote[];
    }),
    // A week back and a day forward — see `NEWS_DAYS`. The day ahead is
    // MLB's: it stamps some moves with an `effectiveDate` in the future, and a
    // note about tomorrow is not a reason to hide today's.
    fetchLeagueTransactions(addDays(today, -NEWS_DAYS), addDays(today, 1)).catch((err: unknown) => {
      console.error('league transactions sweep failed:', (err as Error).message);
      return [] as SweepNote[];
    }),
  ]);

  // **RotoWire first, then MLB, then a stable sort by date.** Both readers
  // depend on that order and depend on it for the same reason: on a day both
  // halves spoke about one man, RotoWire's wording is the one his News tab puts
  // at the top (`getPlayerNews`'s precedence), so it is the one the mark's
  // tooltip and the feed's row must carry. `Array.prototype.sort` is stable, so
  // the concatenation order survives inside a day.
  return [...notes, ...transactions].sort((a, b) => b.date.localeCompare(a.date));
}

async function loadNotes(): Promise<SweepNote[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.notes;
  if (inFlight) return inFlight;
  const work = (async (): Promise<SweepNote[]> => {
    const stored = await readJsonBlob<SweepNote[]>(BLOB_KEY, (_v, at) => Date.now() - at < TTL);
    if (stored) {
      cache = { notes: stored, at: Date.now() };
      return stored;
    }
    const notes = await sweep();
    cache = { notes, at: Date.now() };
    // The notes rather than the ~10MB of HTML and JSON they came out of, the
    // rule `espn-period-anchor` and the RotoWire index both follow.
    await writeJsonBlob<SweepNote[]>(BLOB_KEY, notes);
    return notes;
  })();
  // The failure is handled **inside** the shared promise rather than around one
  // caller's await, so a rejection cannot be handed to the other callers the
  // `inFlight` guard has already given this promise to. It never rejects: it
  // answers with the notes or with none, and a board with no marks on it is
  // a board.
  inFlight = work
    .catch((err: unknown) => {
      console.error('recent-news sweep unavailable:', (err as Error).message);
      return [] as SweepNote[];
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
  const notes = await loadNotes();
  const dates: NewsDates = new Map();
  for (const n of notes) keepNewest(dates, n.playerId, n.date, n.headline);
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

/**
 * # The ten biggest stories, and how a story's size is decided
 *
 * The MLB view's News tab, off the sweep the mark already pays for.
 *
 * **It was the whole feed and is a top ten**, which is the change that matters
 * here: 973 items over seven days (measured, 2026-08-25) is not *news*, it is
 * an inbox — nine hundred of them being RotoWire's desk noting that a man went
 * 2-for-4 and MLB's log noting that Lakeland activated a right-hander. A reader
 * who opens a tab called News wants to know what happened in the league, and
 * on an ordinary day that is a dozen things.
 *
 * ## The score
 *
 * Three parts, all of them off what is already on the note:
 *
 *  1. **What kind of event it is** — a trade is the biggest thing that happens
 *     in a season, an option to Triple-A is not. MLB states its own kind
 *     (`typeDesc`) and that half is a lookup; RotoWire states none on a club
 *     page, so its half is matched on the headline and the note, which is the
 *     desk's own wording and turns out to be strongly conventional (`Traded to`,
 *     `Undergoes surgery`, `Placed on 15-day IL`, `Named closer`).
 *  2. **How recent it is.** Today over yesterday over the rest of the week —
 *     `baseballToday()`'s day, the one this file already classifies by.
 *  3. **How much is being said about him.** A player with four notes filed on
 *     one day is a player something is happening to, and this is the one signal
 *     here that is derived from the corpus rather than declared over it.
 *
 * **And one story per player**, taking his best: a trade generates a
 * transaction, a RotoWire note and usually a second note about his new role,
 * and three tenths of the list spent on one man is a list that has stopped
 * being about the league.
 *
 * ## What is deliberately *not* modeled
 *
 * **How big a name he is.** A trade involving a star and a trade involving a
 * fringe reliever score the same here, and that is a real limitation rather
 * than an oversight: the honest signals for it are on boards this file does not
 * read (the research board's playing time, ESPN's roster percentage), and
 * pulling a megabyte of season stats into a news sweep to sort ten headlines is
 * the wrong trade. The note count in (3) is the cheap proxy and it is a partial
 * one.
 *
 * ## What is dropped before any of it
 *
 * **Minor-league transactions** — see `SweepNote.major` for the measurement (73
 * of 216 moves over three days name a major-league club). The mark keeps them;
 * a feed of the whole organization is not what "the league" means.
 */

/** How many stories the tab draws. Ten because a day of baseball has about that
 *  many things in it worth a headline, and because a list a reader can take in
 *  without scrolling is the difference between a news page and a feed. */
const TOP_STORIES = 10;

/**
 * **What MLB's own kinds are worth.** Its `typeDesc` is already a reader's
 * phrase and the whole vocabulary is twelve words wide — measured over the live
 * sweep: Status Change 64, Optioned 47, Recalled 46, Assigned 36,
 * Designated for Assignment 17, Signed as Free Agent 13, Outrighted 13,
 * Selected 12, Claimed Off Waivers 5, Released 3, Trade 2, Declared Free Agency
 * 2. So this is a table rather than a guess about one.
 *
 * `Status Change` is the one that cannot be scored from its kind: it is both
 * "placed on the 60-day injured list" and "sent on a rehab assignment", which
 * are not the same story. It scores from its description like a RotoWire note,
 * which is what `EVENTS` below is for.
 */
const MLB_KINDS: Record<string, number> = {
  Trade: 12,
  'Signed as Free Agent': 8,
  Released: 7,
  'Declared Free Agency': 6,
  'Designated for Assignment': 6,
  'Claimed Off Waivers': 5,
  Selected: 4,
  Outrighted: 3,
  Recalled: 3,
  Optioned: 2,
  // Rehab assignments and minor-league shuffling, which is what this kind is
  // almost entirely made of.
  Assigned: 1,
};

/**
 * **What a note is about, from the desk's own words.**
 *
 * Applied to the headline and the note together, and **the highest match wins**
 * rather than the sum: a note reading "Undergoes Tommy John surgery, out for
 * season" is one story and should not out-score a trade by matching three
 * patterns.
 *
 * Ordered loosely by weight for reading; the code does not depend on the order.
 * Every pattern here was written against the live corpus rather than from
 * memory — the headlines RotoWire actually files are short and conventional
 * (`Sent back to minors`, `Undergoing MRI on elbow`, `Collects save No. 30`),
 * which is what makes this work at all.
 */
const EVENTS: { re: RegExp; weight: number }[] = [
  { re: /\b(traded|trade[ds]? to|dealt to|acquired (?:by|from))\b/i, weight: 12 },
  { re: /\b(tommy john|undergoes? surgery|season-ending|out for (?:the )?season|done for (?:the )?(?:season|year))\b/i, weight: 11 },
  { re: /\b(suspended|suspension)\b/i, weight: 9 },
  { re: /\b(no-hitter|perfect game|hits for the cycle|walk-?off|grand slam)\b/i, weight: 8 },
  { re: /\b(60-day|placed on the (?:10|15)-day injured list|placed on (?:the )?injured list|to the il|il move)\b/i, weight: 7 },
  { re: /\b(released|designated for assignment|dfa'?d?|claimed off waivers)\b/i, weight: 6 },
  { re: /\b(named closer|closer(?:'s)? (?:job|role)|takes over (?:the )?ninth|save chances|ninth-inning opportunit)\b/i, weight: 6 },
  { re: /\b(activated|reinstated|returns from the il|off the il)\b/i, weight: 5 },
  { re: /\b(promoted|called up|selected|heading (?:back )?to (?:the )?(?:big leagues|majors)|makes? (?:his )?(?:mlb|major-league) debut)\b/i, weight: 5 },
  { re: /\b(mri|imaging|x-?rays?|exits? (?:the )?game|leaves? (?:the )?game|carted off|scratched)\b/i, weight: 4 },
  { re: /\b(demoted|sent (?:back )?(?:down|to (?:the )?minors)|optioned|outrighted)\b/i, weight: 3 },
  // A milestone the desk bothered to number — `Collects save No. 30`,
  // `Blasts 27th homer`, `Cruises to 10th victory`. Worth a place on a slow day
  // and never worth beating an injury.
  { re: /\b(no\. \d{2,}|\d{2,}(?:st|nd|rd|th) (?:homer|home run|save|victory|win|steal))\b/i, weight: 3 },
  { re: /\b(rehab (?:start|assignment|appearance)|throwing progression|facing hitters)\b/i, weight: 2 },
];

/** Whole days between two ISO dates, both parsed as UTC midnight — the rule
 *  `etDate.ts::daysBetween` follows, restated in one line rather than imported
 *  because that module's copy takes the app's own day boundaries and this is
 *  arithmetic on two strings. */
function days(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

/** The best pattern a note matches, or zero — see `EVENTS`. */
function eventWeight(note: SweepNote): number {
  const text = `${note.headline} ${note.summary ?? ''}`;
  let best = 0;
  for (const { re, weight } of EVENTS) {
    if (weight > best && re.test(text)) best = weight;
  }
  return best;
}

export async function getLeagueNews(): Promise<LeagueNews> {
  const notes = (await loadNotes()).filter((n) => n.major);
  const today = baseballToday();
  /* How many notes each player has on the day of the note being scored — the
     corpus's own answer to "is something happening to this man". Counted once
     over the whole sweep rather than per note, which would be a million
     comparisons for a map lookup's worth of answer (`recentNews`'s own rule,
     one function up). */
  const chatter = new Map<string, number>();
  for (const n of notes) {
    const key = `${n.playerId}:${n.date.slice(0, 10)}`;
    chatter.set(key, (chatter.get(key) ?? 0) + 1);
  }
  /** One entry per player, his best story. */
  const best = new Map<number, { note: SweepNote; score: number }>();
  for (const n of notes) {
    const day = n.date.slice(0, 10);
    const kind = n.kind ? MLB_KINDS[n.kind] ?? 0 : 0;
    // **The larger of the two, not the sum.** A `Status Change` scores 0 from
    // its kind and everything from its description; a `Trade` scores 12 from
    // its kind and would score 12 again from the word in its description.
    const event = Math.max(kind, eventWeight(n));
    // Capped at three, because past that the count is saying "RotoWire covers
    // this club closely" rather than "something is happening to this man".
    const noise = Math.min(3, (chatter.get(`${n.playerId}:${day}`) ?? 1) - 1);
    // **Graded rather than the two levels the mark uses**, which is the one
    // place this scorer parts from `getRecentNews`: a mark has two states
    // because a dot has two colors, where a *ranking* wants an edge between
    // Sunday and Wednesday as well. Four steps and then flat, so size still
    // decides the order and recency decides between comparable stories — which
    // is why a season-ending surgery filed six days ago can still lead a list
    // read today, and should.
    const recency = day >= today ? 4 : Math.max(0, 4 - Math.round(days(day, today)));
    const score = event + noise + recency;
    // **Nothing with no event in it, ever.** A day's box-score notes are ~700
    // of the 973 and every one of them would score 3 or 4 on recency and
    // chatter alone — enough to fill a top ten with men who went 2-for-4. The
    // list is allowed to be short; it is not allowed to be wrong about what a
    // story is.
    if (event === 0) continue;
    const had = best.get(n.playerId);
    if (!had || score > had.score) best.set(n.playerId, { note: n, score });
  }
  const ranked = [...best.values()]
    // Score, then the newer of two equal ones, then RotoWire's wording over
    // MLB's — the precedence `getPlayerNews` gives them and `sweep` orders by,
    // so the headline here is the headline at the top of his own News tab.
    .sort((a, b) => b.score - a.score || b.note.date.localeCompare(a.note.date))
    .slice(0, TOP_STORIES);
  return {
    items: ranked.map(({ note: n }) => ({
      // **The player, the day and the headline**, prefixed by source — the same
      // "what the row says" rule `NewsItem.id` states, and the same reason:
      // RotoWire's note ids are not on a club page to be had, and two sources
      // must not be able to collide.
      id: `${n.source}:${n.playerId}:${n.date}:${n.headline}`,
      source: n.source,
      date: n.date,
      headline: n.headline,
      summary: n.summary,
      kind: n.kind,
      playerId: n.playerId,
      playerName: n.playerName,
      team: n.team,
      position: n.position,
    })),
    days: NEWS_DAYS,
    // What the ten were picked out of, so the tab can say so rather than
    // leaving a reader to wonder whether ten is all there was.
    considered: notes.length,
    fetchedAt: Date.now(),
  };
}
