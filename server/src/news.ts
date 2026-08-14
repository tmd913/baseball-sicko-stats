import type { NewsItem, PlayerNews } from './types.js';
import { addDays, baseballToday } from './etDate.js';
import { getRosterInfo, getSeasonPlayers } from './mlbStats.js';
import { ESPN_SITE_TEAM_BY_MLB } from './espn.js';
import { stripAccents } from './names.js';
import { readJsonBlob, writeJsonBlob } from './storage.js';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/**
 * # There is no per-player news API, from anybody. This file is what is left.
 *
 * Recorded here rather than left to be re-probed, because five plausible
 * endpoints were tried and every one of them is a dead end:
 *
 * - `statsapi.mlb.com/api/v1/people/{id}/news` — **404**.
 * - `site.web.api.espn.com/apis/common/v3/sports/baseball/mlb/athletes/{id}/news` — **404**.
 * - `sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/athletes/{id}/news` — **404**.
 * - `lm-api-reads.fantasy.espn.com/apis/v3/games/flb/news/players?playerId=` — **404**.
 * - `site.api.espn.com/…/mlb/news?athlete=` / `athleteId=` / `player=` — **200, and
 *   the parameter is ignored**: the same league-wide feed comes back whatever
 *   you name, which is the worst of the five because it looks like it worked.
 * - `search-api.mlb.com` — does not resolve.
 *
 * So a player's news has to be **assembled** from two feeds that answer for
 * something else, and the two have opposite characters, which is why both are
 * here rather than one:
 *
 * 1. **MLB transactions** (`/api/v1/transactions?playerId=`) — per player,
 *    official, dated, and it needs no matching of any kind. It is also exactly
 *    the news a fantasy manager acts on: an IL placement, an activation, a
 *    recall, an option, a trade, a DFA. What it is not is *reporting* — a player
 *    having a bad month makes no transaction at all.
 * 2. **ESPN's team news feed** — the reporting, and the only route to it. It is
 *    scoped to a club rather than a player, and the join back to a player is
 *    the interesting part: see `playerArticles` below, which reads **ESPN's own
 *    structured attribution** (every article carries a `categories[]` entry of
 *    `type: "athlete"` naming whom it is about) rather than searching a
 *    headline for a name.
 *
 * Each is fetched in its **own `try`** and each failure costs its own half: a
 * dead ESPN feed leaves the transactions standing, and vice versa. The route
 * above this never 502s a page that already has its answer.
 */

/** How far back the transaction log reaches. A news list is "lately" rather
 *  than a career, and 120 days covers the whole of a season's second half —
 *  which is where every IL stint a reader is deciding about actually is. */
const TRANSACTION_DAYS = 120;

/**
 * How long a feed stays fresh, and it is the same number for both halves.
 *
 * Thirty minutes is what `gameLog.ts` and `nextGame.ts` already settle on for
 * the same reason: this is a window onto something that is still moving.
 * Transactions land through the afternoon and articles land hourly, so a longer
 * TTL would have the page telling a reader a man is active who went on the IL
 * at noon — which is precisely the fact this section exists to carry.
 */
const TTL = 30 * 60 * 1000;

/**
 * How many articles ESPN will actually give. `limit=100` is accepted and
 * answered with **50** (measured), which is ~10 days of a club's feed — more
 * than enough for "latest", and there is no paging past it.
 */
const ESPN_LIMIT = 50;

/** Items the section will draw, newest first, per player. */
const playerCache = new Map<string, { news: PlayerNews; at: number }>();
/**
 * The reduced article list per club.
 *
 * **This half gets a storage blob and the transactions half deliberately does
 * not**, and the split is the codebase's own rule rather than a preference.
 * `nextGame.ts` argues that a window onto something unfinished has no business
 * in the cache tier, and that is right for a *per-player* read — one man's
 * transactions are nobody else's and a blob would only be a stored answer to a
 * question that changes by the hour. A club's article feed is the other class
 * entirely, the one `expectedStats.ts` and `getPlayerPool` are in: it is
 * **cookie-free and shared by every player of that club and every user**, so on
 * a cold Lambda the alternative is one 150KB read per player page rather than
 * one per club per half hour.
 *
 * What is stored is the **reduced list**, not the payload — the rule
 * `espn-period-anchor` follows, where 850KB of schedule is kept as the 67-byte
 * pair it was read for. A club's 50 articles come to ~6KB of `NewsItem` against
 * the 152KB they were parsed out of.
 */
const teamCache = new Map<number, { articles: TeamArticle[]; at: number }>();
/** So a cold container answering three player pages at once sends one upstream
 *  per club rather than three, the guard every shared read here carries. */
const teamInFlight = new Map<number, Promise<TeamArticle[]>>();

const teamKey = (espnTeamId: number) => `news-espn-${espnTeamId}-v1.json`;

// ---- MLB transactions -------------------------------------------------

interface TransactionsResponse {
  transactions?: {
    id?: number;
    date?: string;
    effectiveDate?: string;
    typeCode?: string;
    typeDesc?: string;
    description?: string;
    fromTeam?: { name?: string };
    toTeam?: { name?: string };
  }[];
}

/**
 * The two type codes that are noise on a player page, dropped by evidence
 * rather than by taste.
 *
 * `NUM` is a uniform change, and on one day a year it is a uniform change for
 * **every player in the league** — Jackie Robinson Day puts "changed number to
 * 42" and "changed number to 17" on 1,300 news sections, two items each, which
 * would be the top of most of them for a fortnight. Measured over 2026-07-01 to
 * 08-14 it is 2 of 12,235 league transactions, so nothing else is lost with it.
 *
 * Everything else stays, including the ones that look procedural: `ASG` is
 * 5,147 of that sample and is where a **rehab assignment** lives, which is the
 * single most useful thing this list can tell a manager about a man on the IL.
 */
const QUIET_TRANSACTIONS = new Set(['NUM']);

async function fetchTransactions(playerId: number): Promise<NewsItem[]> {
  const to = addDays(baseballToday(), 1);
  const from = addDays(to, -TRANSACTION_DAYS);
  const url =
    `https://statsapi.mlb.com/api/v1/transactions?playerId=${playerId}` +
    `&startDate=${from}&endDate=${to}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`transactions returned ${res.status}`);
  const data = (await res.json()) as TransactionsResponse;
  const items: NewsItem[] = [];
  // MLB emits the same move twice under two ids often enough to matter — a
  // rehab assignment came back as 863948 and 863854 on one checked player, same
  // date, same wording — so the dedupe is on what the item *says* rather than on
  // its id, which is the only thing that catches it.
  const seen = new Set<string>();
  for (const t of data.transactions ?? []) {
    const date = t.effectiveDate ?? t.date;
    const text = t.description;
    if (!date || !text) continue;
    if (t.typeCode && QUIET_TRANSACTIONS.has(t.typeCode)) continue;
    const dedupe = `${date}|${text}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    items.push({
      id: `mlb-${t.id ?? dedupe}`,
      source: 'mlb',
      // A transaction is a **day**, not an instant — MLB publishes no time with
      // one — so it is kept as the date it is and the client formats it as one.
      date,
      headline: text,
      summary: null,
      url: null,
      kind: t.typeDesc ?? null,
    });
  }
  return items;
}

// ---- ESPN team articles -----------------------------------------------

interface EspnNewsResponse {
  articles?: {
    id?: number;
    type?: string;
    headline?: string;
    description?: string;
    published?: string;
    lastModified?: string;
    links?: { web?: { href?: string } };
    categories?: { type?: string; description?: string }[];
  }[];
}

/** An article as it comes off the feed, with ESPN's own athlete attribution
 *  kept beside it — the thing the per-player filter reads. */
interface TeamArticle {
  item: NewsItem;
  /** Every athlete ESPN tagged, normalised. */
  athletes: string[];
}

/** The same reduction `espn.ts::normalizeName` performs, mirrored here rather
 *  than exported from it: that one strips generational suffixes because it is
 *  matching two whole roster names against each other, and dropping "Jr." from
 *  a *tag* would make Ronald Acuña Jr. and a hypothetical Ronald Acuña the same
 *  person on a page whose whole job is to be sure whose news it is. */
function foldName(raw: string): string {
  return stripAccents(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function buildTeamArticles(espnTeamId: number): Promise<TeamArticle[]> {
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news` +
    `?limit=${ESPN_LIMIT}&team=${espnTeamId}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`ESPN news returned ${res.status}`);
  const data = (await res.json()) as EspnNewsResponse;
  const out: TeamArticle[] = [];
  for (const a of data.articles ?? []) {
    const headline = a.headline?.trim();
    const date = a.published ?? a.lastModified;
    const href = a.links?.web?.href;
    // An article with no link is one this section cannot honour — every row is
    // a press that opens ESPN — and one with no date cannot be sorted into a
    // list whose whole order is the date. Either way it is dropped rather than
    // drawn as a headline that does nothing.
    if (!headline || !date || !href) continue;
    const athletes = (a.categories ?? [])
      .filter((c) => c.type === 'athlete' && typeof c.description === 'string')
      .map((c) => foldName(c.description as string))
      .filter((n) => n.length > 0);
    if (athletes.length === 0) continue; // nothing to attribute it to
    out.push({
      item: {
        id: `espn-${a.id ?? href}`,
        source: 'espn',
        date,
        headline,
        summary: a.description?.trim() || null,
        url: href,
        kind: a.type ?? null,
      },
      athletes,
    });
  }
  return out;
}

/**
 * One club's article list, shared by every player on it.
 *
 * The **club id is ESPN's site-API one, and it is the same numbering as the
 * fantasy `proTeamId`** — checked team by team against
 * `site.api.espn.com/…/mlb/teams`, all 30 identical (1 BAL … 30 TB), which is
 * why this needs no second table and reads `ESPN_TO_MLB_TEAM` inverted.
 */
async function getTeamArticles(espnTeamId: number): Promise<TeamArticle[]> {
  const cached = teamCache.get(espnTeamId);
  if (cached && Date.now() - cached.at < TTL) return cached.articles;
  const running = teamInFlight.get(espnTeamId);
  if (running) return running;
  const work = (async (): Promise<TeamArticle[]> => {
    const stored = await readJsonBlob<StoredTeam>(
      teamKey(espnTeamId),
      (_v, at) => Date.now() - at < TTL,
    );
    const articles = stored
      ? stored.items.map((item, i) => ({ item, athletes: stored.athletes[i] ?? [] }))
      : await buildTeamArticles(espnTeamId);
    teamCache.set(espnTeamId, { articles, at: Date.now() });
    if (!stored) {
      await writeJsonBlob<StoredTeam>(teamKey(espnTeamId), {
        items: articles.map((a) => a.item),
        athletes: articles.map((a) => a.athletes),
      });
    }
    return articles;
  })();
  teamInFlight.set(espnTeamId, work);
  try {
    return await work;
  } finally {
    teamInFlight.delete(espnTeamId);
  }
}

/**
 * The blob's shape: the items as they go on the wire, and ESPN's attribution
 * **beside** them rather than on them.
 *
 * Beside, because the tags are what the per-player filter reads and have no
 * business on the wire — by the time a row reaches the client it is already
 * known to be this player's, and shipping the other twenty names an article
 * mentions would be a payload saying so twenty times. In the blob they have to
 * be kept, though: a stored list that dropped them would come back
 * unfilterable, which is the one way this cache could be worse than no cache.
 */
interface StoredTeam {
  items: NewsItem[];
  athletes: string[][];
}


/**
 * The names in this league that **two** players answer to, which is the set the
 * article match refuses.
 *
 * This is `espn.ts`'s own rule — *an ambiguity neither test resolves is left
 * unmatched rather than guessed* — applied to a join that runs the other way.
 * There the club disambiguates; here the club is already fixed (we asked that
 * club's feed) and what remains is that a club's feed carries league-wide
 * stories too, so a "Max Muncy" tag in the Dodgers feed could in principle be
 * the other one. Rather than guess, a player whose folded name is shared is
 * shown his transactions and no articles at all.
 *
 * **The set is tiny and it is enumerated rather than feared**: over the 1,382
 * players on the 2026 season roster there are exactly **3** shared names and
 * **6** players in them (José Fermín, Luis García, Max Muncy). It costs no
 * upstream either — `getSeasonPlayers` is the same 1h-cached list the roster
 * search and `/day` already read.
 */
async function ambiguousNames(): Promise<Set<string>> {
  const seen = new Map<string, number>();
  for (const p of await getSeasonPlayers()) {
    // That list emits a row per kind for a two-way player, so the *id* is what
    // counts a person — folded on name alone, Ohtani would look like two men
    // and be refused his own news.
    const key = foldName(p.name);
    const prev = seen.get(key);
    if (prev === undefined) seen.set(key, p.id);
    else if (prev !== p.id) seen.set(key, -1);
  }
  return new Set([...seen].filter(([, id]) => id === -1).map(([k]) => k));
}

// ---- The two, merged --------------------------------------------------

/**
 * One player's news, newest first.
 *
 * `name` is looked up here rather than taken from the client, the way `/day`
 * resolves its own: the name is what the article match turns on, and a name the
 * caller supplied is a name the caller could get wrong.
 */
export async function getPlayerNews(playerId: number): Promise<PlayerNews> {
  const key = String(playerId);
  const hit = playerCache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.news;

  const [transactions, articles] = await Promise.all([
    fetchTransactions(playerId).catch((err) => {
      console.error('player transactions fetch failed:', err);
      return [] as NewsItem[];
    }),
    playerArticles(playerId).catch((err) => {
      console.error('player articles fetch failed:', err);
      return [] as NewsItem[];
    }),
  ]);

  const items = [...transactions, ...articles].sort((a, b) => cmpDate(b.date, a.date));
  const news: PlayerNews = { items };
  playerCache.set(key, { news, at: Date.now() });
  return news;
}

/**
 * A transaction's date is a **day** and an article's is an **instant**, so the
 * two are compared on the day they share and an instant breaks its own ties.
 * Sorting the raw strings would work by accident — `2026-08-14` sorts before
 * `2026-08-14T11:22:33Z` — and would put every one of a day's transactions
 * *under* every one of its articles rather than interleaving them by nothing at
 * all, which is what a same-day tie honestly is.
 */
function cmpDate(a: string, b: string): number {
  const d = a.slice(0, 10).localeCompare(b.slice(0, 10));
  return d !== 0 ? d : a.localeCompare(b);
}

/** The club's feed, narrowed to the articles ESPN itself attributed to him. */
async function playerArticles(playerId: number): Promise<NewsItem[]> {
  const [info, players] = await Promise.all([
    getRosterInfo([playerId]),
    getSeasonPlayers().catch(() => []),
  ]);
  const mlbTeamId = info.get(playerId)?.teamId ?? null;
  const name = players.find((p) => p.id === playerId)?.name ?? null;
  // A player the app cannot place on a club, or cannot name, gets his
  // transactions and nothing else — which is the same direction every join in
  // this codebase fails in.
  if (mlbTeamId === null || name === null) return [];
  const espnTeamId = ESPN_SITE_TEAM_BY_MLB[mlbTeamId];
  if (espnTeamId === undefined) return [];
  const folded = foldName(name);
  if ((await ambiguousNames()).has(folded)) return [];
  const articles = await getTeamArticles(espnTeamId);
  return articles.filter((a) => a.athletes.includes(folded)).map((a) => a.item);
}
