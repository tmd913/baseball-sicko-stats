import { getMlbIndex, matchMlbPlayer } from './espn.js';
import { getTeamAbbrevs } from './mlbStats.js';
import { readJsonBlob, writeJsonBlob } from './storage.js';
import type { NewsItem } from './types.js';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

// Keep in sync with hfSea in savant.ts, CURRENT_SEASON in percentiles.ts, and
// SEASON in xwoba.ts, pitcherArsenal.ts, teamStats.ts, expectedStats.ts,
// research.ts and espn.ts. This one is the season RotoWire's own player tables
// are asked for, and the parameter is **required** — without it the table
// answers `{"error":"The LEAGUE parameter is required."}` in 45 bytes rather
// than falling back to the current year.
const SEASON = 2026;

/**
 * # RotoWire is the player-news source, and this is what is reachable of it.
 *
 * The section this feeds used to be MLB transactions plus **ESPN's club article
 * feed**, and the ESPN half is gone. RotoWire is what a fantasy manager
 * actually reads: its baseball desk writes a short, dated note **per player**
 * whenever anything happens to him — a lineup he is out of, a bullpen session,
 * an IL placement, a save, a demotion — which is precisely the reporting the
 * ESPN feed could only reach obliquely, through a club-wide list narrowed back
 * to one man by ESPN's own tagging.
 *
 * ## What was probed, and what each one does instead
 *
 * Recorded here rather than left to be re-probed. The two 200s are the
 * dangerous half and are named as such:
 *
 * | Endpoint | Result |
 * | --- | --- |
 * | `www.rotowire.com/baseball/player/{slug}-{id}` | **200** — the source used here. ~627KB of HTML (**93KB gzipped**), of which `id="latest-news"` is up to **7** dated notes for that player. No login, no cookie, no User-Agent gate. |
 * | `www.rotowire.com/baseball/tables/player-basic-stats.php?pos=B\|P&league=3&season=&filter=0` | **200 JSON** — the index used here: `ID`, `URL` (the slug), `player`, `team`. 685 batters + 847 pitchers = **1,378 players over all 30 clubs**. |
 * | `www.rotowire.com/baseball/news.php?playerid=` / `?id=` / `?player=` | **200, and the parameter is ignored** — the same 25-item league-wide feed comes back whatever you name. Verified by diffing the player links out of three responses: identical, 25 items, 25 distinct players. This is the worst kind of dead end and is the reason this table exists. |
 * | `www.rotowire.com/baseball/news.php?page=` / `?offset=` | **200, ignored** likewise — the league feed is 25 items and does not page, so it cannot answer for one player however far you walk it. |
 * | `www.rotowire.com/rss/news.php?sport=MLB` | **200** — a real feed, and league-wide: **10 items**, no player filter. Useless per player. |
 * | `www.rotowire.com/inc/player-panel/api/main/?player_id=&sport=baseball` | **200 and `null`** — the React player panel's JSON API exists and its own page says `SUPPORTED_SPORTS = { football: true }`. `sport=mlb` is a 400. |
 * | `www.rotowire.com/baseball/ajax/player-page-data.php?id=&stats=batting` | **200, 572KB JSON** — real, and it is game logs, splits and matchups. **No news in it** (checked key by key). |
 * | `www.rotowire.com/baseball/ajax/player-news.php`, `/baseball/tables/player-news.php`, `/baseball/player-news.php`, `/baseball/player/{slug}/news` | **404** |
 * | `www.rotowire.com/baseball/tables/injury-report.php?team=ALL&pos=ALL&league=ALL` | **200 JSON**, 598 rows with slugs — but as a *second* index it adds **369 ids, none of them** one of the eight major leaguers the stats tables miss, and every one of those 369 a minor leaguer whose name is a fresh chance to collide. Measured and rejected. |
 *
 * ## So the news is scraped, and this is the shape it depends on
 *
 * `percentiles.ts` already scrapes a Savant player page, so this is a pattern
 * the codebase has rather than a new one — but the shape has to be written
 * down, because nothing upstream promises it:
 *
 * 1. A container `id="latest-news"`. **Absent → no items**, and the
 *    transactions beside them stand alone.
 * 2. Inside it, one `<div class="news-update …">` per note — matched on the
 *    class **followed by a space**, since every field inside is
 *    `news-update__something` and a looser split matches those too (it did, on
 *    the first pass: 10 "blocks" for 1 real one).
 * 3. Within a block: `news-update__headline` (the headline), `__timestamp`
 *    (`August 14, 2026` — a **day**, never an instant), `__news` (the note),
 *    `__inj` (the body part, when RotoWire files one).
 *
 * **How it fails**: every one of those is optional in the parser. A block with
 * no date or no headline is dropped rather than drawn, a region that has moved
 * yields zero items, and `getRotowireNews` is called inside its own `try` one
 * level up — so the worst a shape change can do is empty this half of the
 * section and leave MLB's transactions carrying it. What it can never do is
 * put somebody else's news on a player's page: the *join* is the only thing
 * that decides whose page was read, and it is a name-and-club match rather
 * than anything the HTML says.
 *
 * ## What is deliberately not taken
 *
 * The `news-update__analysis` block — RotoWire's own take. It is the thing
 * RotoWire is read for and it is **paywalled**: on a checked player 1 of 7
 * items carried it and the other 6 read "Subscribe now to instantly reveal our
 * take on this news." Shipping that string would be an advertisement in the
 * app, and shipping the one free take would make one row a paragraph and six
 * rows a line. So the row links to the page it was read from instead, which is
 * where the take is.
 */

// ---- The index: MLB id -> RotoWire slug -----------------------------------

/**
 * RotoWire's club abbreviations against MLB's, checked club by club: **29 of
 * 30 identical**, and the one that isn't is Arizona — `ARI` there, `AZ` here.
 * A one-entry table rather than a thirty-entry one, and derived from MLB's own
 * abbreviations at read time so a club rename cannot leave a stale copy.
 */
const ROTOWIRE_TEAM_ALIASES: Record<string, string> = { ARI: 'AZ' };

/** A player as RotoWire's own stats tables list him. Four fields of many. */
interface RotowireRow {
  ID?: string;
  URL?: string;
  player?: string;
  team?: string;
}

/**
 * How long the index stays fresh. Six hours, which is what every other
 * cookie-free league-wide table in this codebase settles on — it is a season
 * roster, and the only thing that moves it is a call-up.
 */
const INDEX_TTL = 6 * 60 * 60 * 1000;

const INDEX_KEY = `rotowire-index-${SEASON}-v1.json`;

let indexCache: { map: Map<number, string>; at: number } | null = null;
/** So a cold container answering three player pages at once sends one pair of
 *  upstreams rather than three, the guard every shared read here carries. */
let indexInFlight: Promise<Map<number, string>> | null = null;
/**
 * A failure is remembered for a minute, which is `getPeriodAnchor`'s rule for
 * its own shared read: without it a dead upstream is asked for both tables once
 * per player page for as long as it stays dead, where the answer is the same
 * every time. The window is short because the cost of being wrong is only that
 * a player page shows transactions alone for up to a minute.
 */
let indexFailedAt = 0;
const INDEX_RETRY_MS = 60 * 1000;

async function fetchRotowireRows(pos: 'B' | 'P'): Promise<RotowireRow[]> {
  const url =
    'https://www.rotowire.com/baseball/tables/player-basic-stats.php' +
    `?pos=${pos}&league=3&season=${SEASON}&filter=0`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`RotoWire ${pos} table returned ${res.status}`);
  const rows = (await res.json()) as unknown;
  if (!Array.isArray(rows)) throw new Error('RotoWire table did not return a list');
  return rows as RotowireRow[];
}

/**
 * MLB id → the RotoWire path for that player (`/baseball/player/{slug}-{id}`).
 *
 * **The slug is what has to be carried, not the id.** A RotoWire player URL
 * with the right id and a wrong slug does not redirect to the canonical one —
 * it 301s to `/baseball/`, and `/baseball/player/13962` is a 404 — so knowing
 * the number is not knowing the address, and an index is not optional.
 *
 * **The join is `espn.ts`'s, imported rather than rewritten**: the same
 * accent-and-suffix fold, the same MLB name index, the same rule that a club
 * match breaks a tie and an ambiguity neither test resolves is left unmatched
 * rather than guessed. `league=3` is both leagues (`league=1` returns half),
 * and the two calls are `pos=B` and `pos=P`.
 *
 * Measured against the 2026 season roster: **1,375 of RotoWire's 1,378 rows
 * match**, 1,370 on the name alone and 5 where the club broke a tie — which is
 * five more than the ESPN article join could ever do, that one having had no
 * club to break one with, and it is why **both Max Muncys and both José
 * Fermíns now get their own news** where before they got none. Read the other
 * way it covers **1,375 of the 1,383 players on MLB's own list**; the eight it
 * misses are three whose spelling the fold cannot bridge (`Jihwan Bae` against
 * RotoWire's `Ji Hwan Bae`, `José A. Ferrer` against `Jose Ferrer`, and the
 * third Luis García, whom MLB does not list on the club RotoWire has him on)
 * and five with no MLB stat line for RotoWire's tables to carry at all. Each
 * of the eight gets his transactions and no reporting, which is this
 * codebase's standing direction to fail in.
 */
export async function getRotowireIndex(): Promise<Map<number, string>> {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL) return indexCache.map;
  if (indexFailedAt && Date.now() - indexFailedAt < INDEX_RETRY_MS) return new Map();
  if (indexInFlight) return indexInFlight;
  const work = (async (): Promise<Map<number, string>> => {
    const stored = await readJsonBlob<[number, string][]>(
      INDEX_KEY,
      (_v, at) => Date.now() - at < INDEX_TTL,
    );
    if (stored) {
      const map = new Map(stored);
      indexCache = { map, at: Date.now() };
      return map;
    }
    const [batters, pitchers, mlbIndex, abbrevs] = await Promise.all([
      fetchRotowireRows('B'),
      fetchRotowireRows('P'),
      getMlbIndex(),
      getTeamAbbrevs(),
    ]);
    const teamIdByAbbrev = new Map<string, number>();
    for (const [id, abbrev] of abbrevs) teamIdByAbbrev.set(abbrev, id);
    const map = new Map<number, string>();
    const seen = new Set<string>();
    for (const row of [...batters, ...pitchers]) {
      const rwId = row.ID;
      const url = row.URL;
      const name = row.player;
      if (!rwId || !url || !name || seen.has(rwId)) continue;
      seen.add(rwId);
      const abbrev = row.team ? (ROTOWIRE_TEAM_ALIASES[row.team] ?? row.team) : undefined;
      const teamId = abbrev === undefined ? undefined : teamIdByAbbrev.get(abbrev);
      const hit = matchMlbPlayer(mlbIndex, name, teamId);
      // First writer wins: a player who somehow appears on both tables (a
      // two-way player does) is one man with one page, and the batting row is
      // no better or worse an address than the pitching one.
      if (hit && !map.has(hit.id)) map.set(hit.id, url);
    }
    indexCache = { map, at: Date.now() };
    // The **reduced** map rather than the 611KB of tables it came out of, the
    // rule `espn-period-anchor` follows. ~60KB of pairs for 1,375 players.
    await writeJsonBlob<[number, string][]>(INDEX_KEY, [...map]);
    return map;
  })();
  // **The failure is handled inside the shared promise, not around the await.**
  // Every concurrent caller is handed *this* promise by the `inFlight` guard
  // above, so a `catch` on one caller's `await` would leave the others holding a
  // rejection — the exact shape `getPeriodAnchor` records finding by driving its
  // own read at a 503. This one never rejects: it answers with the map or with
  // an empty one, and a player page with no RotoWire index is a page with
  // transactions on it, which is the direction every join in this codebase
  // fails in.
  indexInFlight = work
    .catch((err: unknown): Map<number, string> => {
      // One line per failure window rather than one per concurrent caller.
      const first = !indexFailedAt || Date.now() - indexFailedAt >= INDEX_RETRY_MS;
      indexFailedAt = Date.now();
      if (first) console.error('RotoWire player index unavailable:', (err as Error).message);
      return new Map();
    })
    .finally(() => {
      indexInFlight = null;
    });
  return indexInFlight;
}

// ---- The scrape -----------------------------------------------------------

const MONTHS: Record<string, string> = {
  January: '01',
  February: '02',
  March: '03',
  April: '04',
  May: '05',
  June: '06',
  July: '07',
  August: '08',
  September: '09',
  October: '10',
  November: '11',
  December: '12',
};

/** `August 14, 2026` → `2026-08-14`, or null for anything else. RotoWire dates
 *  a note to the **day** and never to an instant, which is the same resolution
 *  a transaction has and is why both halves of this section sort on a day. */
function isoDate(raw: string): string | null {
  const m = /^([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const month = MONTHS[m[1]];
  if (!month) return null;
  return `${m[3]}-${month}-${m[2].padStart(2, '0')}`;
}

/** Tags out, entities in, whitespace collapsed. The note bodies carry `<a>`
 *  links to the reporter's own post, which are worth nothing once the text is
 *  a string in a table cell. */
function plain(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, '’')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One `news-update__…` field out of a block, as text.
 *
 * **The element's own tag is captured and back-referenced**, which is not
 * fussiness: the note body carries inline `<a>` links to the reporter's own
 * post, so a closer written as `</(?:div|a)>` stops at the first of those and
 * truncates the sentence — measured, it cut *"Snell (elbow) was activated from
 * the 60-day injured list ahead of his start Tuesday night against the Royals"*
 * at "list". A back-reference closes the tag that opened, and none of these
 * fields nests an element of its own kind.
 */
function field(block: string, name: string): string | null {
  const m = new RegExp(
    `<(div|a|b)[^>]*class="news-update__${name}"[^>]*>([\\s\\S]*?)</\\1>`,
  ).exec(block);
  return m ? plain(m[2]) : null;
}

/**
 * One player's RotoWire notes, newest first — or an empty list, which is a
 * real answer and not an error.
 *
 * `path` is the index's own `/baseball/player/{slug}-{id}`, so nothing here
 * builds a URL out of a name.
 */
export async function fetchRotowireNews(path: string, mlbId: number): Promise<NewsItem[]> {
  const url = `https://www.rotowire.com${path}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`RotoWire player page returned ${res.status}`);
  const html = await res.text();
  const start = html.indexOf('id="latest-news"');
  if (start === -1) return [];
  // The **space** after the class name is what separates the container from
  // its own `news-update__*` children; without it this splits ten ways on one
  // note. Splitting on a lookahead keeps each block whole.
  const blocks = html.slice(start).split(/(?=<div class="news-update )/).slice(1);
  const items: NewsItem[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const stamp = field(block, 'timestamp');
    const headline = field(block, 'headline');
    const date = stamp ? isoDate(stamp) : null;
    // A note with no date cannot be sorted into a list whose whole order is
    // the date, and one with no headline has nothing to draw. Either way it is
    // dropped rather than guessed at.
    if (!date || !headline) continue;
    const body = field(block, 'news');
    const injury = field(block, 'inj');
    // No upstream id: the headline links carrying RotoWire's own news id
    // (`…-1020205`) exist on the league-wide feed and **not** on a player
    // page, where the headline is a bare `<div>`. So the key is what the row
    // says — the same rule the transaction dedupe below already runs on, and
    // the same rule that makes it stable across re-reads.
    const id = `rw-${mlbId}-${date}-${headline}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      source: 'rotowire',
      date,
      headline,
      summary: body,
      // Every note on a player links to that player's page. It is not
      // item-precise — RotoWire publishes no per-note address a player page
      // can reach — and it is where the note, and RotoWire's own analysis of
      // it, actually live, which is the one thing this section deliberately
      // does not ship.
      url: `${url}#latest-news`,
      // RotoWire's own word for what the note is about: the body part it files
      // an injury note under, which says more in four characters than any
      // label this app could invent, and `Report` for everything else.
      kind: injury && injury.length > 0 ? injury : 'Report',
    });
  }
  return items;
}

/**
 * One player's RotoWire notes by MLB id — the index lookup and the scrape,
 * with a player the index cannot place answering an empty list rather than
 * throwing. Nothing is cached here: the merged list one level up is, on the
 * thirty minutes both halves of the section share.
 */
export async function getRotowireNews(mlbId: number): Promise<NewsItem[]> {
  const path = (await getRotowireIndex()).get(mlbId);
  if (!path) return [];
  return fetchRotowireNews(path, mlbId);
}
