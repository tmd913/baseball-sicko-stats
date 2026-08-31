import type { NewsItem, PlayerNews } from './types.js';
import { addDays, baseballToday } from './etDate.js';
import { getRotowireNews } from './rotowire.js';
import { getCbsBodies, newsKey, type CbsNote } from './cbs.js';
import { readJsonBlob, writeJsonBlob } from './storage.js';

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

/**
 * # There is no per-player news API, from anybody. This file is what is left.
 *
 * Recorded here rather than left to be re-probed. Eleven endpoints across three
 * publishers have been tried and every one of them is a dead end; the ones that
 * answer **200 and ignore the parameter** are the dangerous half, because they
 * look like they worked.
 *
 * | Endpoint | Result |
 * | --- | --- |
 * | `statsapi.mlb.com/api/v1/people/{id}/news` | **404** |
 * | `site.web.api.espn.com/apis/common/v3/…/athletes/{id}/news` | **404** |
 * | `sports.core.api.espn.com/v2/…/athletes/{id}/news` | **404** |
 * | `lm-api-reads.fantasy.espn.com/apis/v3/games/flb/news/players?playerId=` | **404** |
 * | `site.api.espn.com/…/mlb/news?athlete=` / `athleteId=` / `player=` | **200, parameter ignored** — the league-wide feed whatever you name |
 * | `search-api.mlb.com` | does not resolve |
 * | `rotowire.com/baseball/news.php?playerid=` / `?id=` / `?player=` | **200, parameter ignored** — the same 25 league-wide items, verified by diffing the player links out of three responses |
 * | `rotowire.com/rss/news.php?sport=MLB` | **200**, and league-wide: 10 items, no player filter |
 * | `rotowire.com/inc/player-panel/api/main/?player_id=&sport=baseball` | **200 and `null`** — the panel API is football-only today |
 * | `rotowire.com/baseball/ajax/player-page-data.php?id=` | **200, 572KB** — game logs and splits, **no news** |
 * | `rotowire.com/baseball/ajax/player-news.php`, `/tables/player-news.php`, `/player/{slug}/news` | **404** |
 *
 * The whole of the RotoWire probe, and the HTML shape the scrape depends on,
 * is in `rotowire.ts`; this table is the short form so nobody starts from the
 * beginning.
 *
 * ## So a player's news is **assembled** from two sources of opposite character
 *
 * 1. **RotoWire's player page** — the reporting, and the reason this section is
 *    worth having. A short dated note per player whenever anything happens to
 *    him: a lineup he is out of, a bullpen session, a save, a demotion, the
 *    closer's job changing hands. It is *fantasy* reporting rather than general
 *    sports writing, which is what this app is for. Up to 7 notes per player.
 * 2. **MLB transactions** (`/api/v1/transactions?playerId=`) — the record. Per
 *    player, official, dated, needing no matching of any kind. RotoWire reports
 *    most of these moves too and reports them better, but MLB is the one that
 *    is *authoritative* about them, and it is the half that keeps standing if
 *    RotoWire's page shape ever moves under the scrape.
 *
 * **ESPN's club article feed was the second source and has been dropped.** It
 * was the reporting half, and RotoWire is strictly better at that job here: per
 * player rather than per club, fantasy-shaped rather than general, and reaching
 * every player rather than only the ones ESPN happened to tag. Keeping all
 * three would have been three upstreams and two name joins for one section,
 * with two of them answering the same question.
 *
 * Each source is fetched in its **own `try`** and each failure costs its own
 * half. The route above this never 502s a page that already has its answer.
 */

/** How far back the transaction log reaches. A news list is "lately" rather
 *  than a career, and 120 days covers the whole of a season's second half —
 *  which is where every IL stint a reader is deciding about actually is. */
const TRANSACTION_DAYS = 120;

/**
 * How long a player's merged list stays fresh.
 *
 * Thirty minutes is what `gameLog.ts` and `nextGame.ts` already settle on for
 * the same reason: this is a window onto something that is still moving.
 * Transactions land through the afternoon and RotoWire's desk files notes as
 * lineups are posted, so a longer TTL would have the page telling a reader a
 * man is active who went on the IL at noon — which is precisely the fact this
 * section exists to carry.
 */
const TTL = 30 * 60 * 1000;

/**
 * Items the section will draw, newest first, per player.
 *
 * **Memory *and* a `storage.ts` blob, on the same TTL.** This said memory only
 * and cited `nextGame.ts`'s rule — a window onto something unfinished, whose
 * freshness test would only ever be the TTL beside it. That reasoning is left
 * below because it was not wrong about what this *is*; it was wrong about what
 * it costs.
 *
 * **Measured, once the per-route timing existed to measure it with:** 30
 * requests over two days, and the distribution is two humps — **3 under 500ms
 * (min 1ms)** where the container had it in memory, and **17 between 2.0s and
 * 2.6s** where it did not. p50 **2,051ms**, the slowest median of any route on
 * the board. A miss is three upstreams in parallel (MLB transactions, a
 * RotoWire scrape, CBS bodies) and the slowest of them sets the time, so every
 * cold container pays two seconds for a page's News tab.
 *
 * The blob does not change *when* an answer goes stale — `readJsonBlob` is
 * handed the same 30-minute test the memory map used, so a note filed at noon
 * reaches a reader on exactly the schedule it did before. It changes only what
 * a miss costs: one S3 read instead of three scrapes.
 *
 * That is the migration `storage.ts` already records for `xwoba.ts` and
 * `pitcherArsenal.ts` — both were memory-only, both re-fetched on every cold
 * container, and `readJsonBlob` exists to carry exactly this caller-supplied
 * freshness test. `nextGame.ts`'s rule still holds for `nextGame.ts`, whose
 * miss is one cheap schedule read rather than three scrapes.
 *
 * The one thing here that *is* shared by every player and every user —
 * RotoWire's name-to-slug index — takes a blob of its own in `rotowire.ts`,
 * which is the other class entirely and the one `getPlayerPool` is in.
 */
const playerCache = new Map<string, { news: PlayerNews; at: number }>();

/** Versioned from the first write: a stored blob deserializes with anything
 *  added since it missing, so a `NewsItem` gaining a field wants `-v2` rather
 *  than a season of stored nulls. */
const storeKey = (playerId: number) => `player-news-${playerId}-v1.json`;

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
 * The one type code that is noise on a player page, dropped by evidence rather
 * than by taste.
 *
 * `NUM` is a uniform change, and on one day a year it is a uniform change for
 * **every player in the league** — Jackie Robinson Day would put "changed
 * number to 42" and "changed number to 17" on 1,300 news sections, two items
 * each, which would be the top of most of them for a fortnight. Measured over
 * 2026-07-01 to 08-14 it is 2 of 12,235 league transactions, so nothing else is
 * lost with it.
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
      // A transaction is one line of official record with no second half to
      // have — the enrichment below is about RotoWire's notes and nothing else.
      full: null,
      kind: t.typeDesc ?? null,
    });
  }
  return items;
}

// ---- The same move, said twice ----------------------------------------

/**
 * What a sentence says a club *did*, or null if it names no move at all.
 *
 * RotoWire reports most transactions as well as MLB records them, and on the
 * day of a move the two say the same thing in different words: *"The Dodgers
 * placed Treinen on the 15-day injured list Saturday due to right elbow
 * inflammation"* against *"Los Angeles Dodgers placed RHP Blake Treinen on the
 * 15-day injured list. Right elbow inflammation."* That is one move and two
 * rows, and a section that draws both is repeating itself.
 *
 * The two texts share no phrasing to dedupe on, so what is compared is the
 * **move** each of them names, on the day they share — the same principle as
 * the transaction dedupe above (what a row *says*, never its id), one step more
 * abstract because the wording is two publishers' rather than one's.
 *
 * **The list is ordered and the first match wins**, which is what makes the
 * classes mutually exclusive and so makes an equality test meaningful: an
 * activation *from* the injured list must read `activate` rather than `il`, or
 * a man placed on the IL in the morning and a man activated off it would
 * collapse into each other. `transfer` leads `il` for the same reason — a
 * 15-day stint becoming a 60-day one is a different row from the placement.
 *
 * Measured over a random 60-player sample of the 2026 season (401 RotoWire
 * notes, 266 deduped transactions): **76 same-day same-class pairs**, every one
 * of them a genuine restatement on inspection, and **28 same-day
 * different-class pairs** — a trade and an option on one afternoon, a Triple-A
 * club activating a man his major-league club optioned — all correctly kept.
 * No misfire in either direction.
 */
const MOVES: [string, RegExp][] = [
  ['rehab', /rehab/i],
  ['transfer', /\btransferr?ed\b/i],
  ['activate', /\bactivat|\breinstat/i],
  ['il', /injured list/i],
  ['dfa', /designated .{0,12}for assignment/i],
  ['select', /\bselected\b/i],
  ['recall', /\brecall/i],
  ['option', /\boption(ed|s)\b/i],
  ['trade', /\btraded\b|\bacquired\b/i],
  ['claim', /\bclaimed\b/i],
  ['release', /\breleased\b/i],
  ['sign', /\bsigned\b/i],
  ['suspend', /\bsuspend/i],
];

function moveNamed(text: string): string | null {
  for (const [name, pattern] of MOVES) if (pattern.test(text)) return name;
  return null;
}

/**
 * The transactions RotoWire has not already reported.
 *
 * **RotoWire's row wins and MLB's is dropped**, which is the direction the
 * sample settles rather than a preference: on every pair inspected RotoWire's
 * note carries everything MLB's does — the stint length, the club, the body
 * part — with the reporting attached ("*began a rehab assignment with Triple-A
 * Durham on Sunday, walking three and giving up a three-run homer*" against
 * "*sent LHP Garrett Cleavinger on a rehab assignment to Durham Bulls*"), and a
 * headline a reader can scan. MLB's row is a strict subset of what it says.
 *
 * The transactions that survive are the ones RotoWire did not write up — the
 * minor-league bookkeeping, the moves that happened while nobody was watching —
 * and the whole list survives untouched whenever the RotoWire half is empty,
 * which is what makes this safe when the scrape fails.
 */
function withoutRestated(transactions: NewsItem[], reports: NewsItem[]): NewsItem[] {
  if (reports.length === 0) return transactions;
  const reported = new Set<string>();
  for (const r of reports) {
    const move = moveNamed(`${r.headline} ${r.summary ?? ''}`);
    if (move) reported.add(`${r.date.slice(0, 10)}|${move}`);
  }
  return transactions.filter((t) => {
    const move = moveNamed(t.headline);
    return move === null || !reported.has(`${t.date.slice(0, 10)}|${move}`);
  });
}

/**
 * **How much longer a CBS body has to be before it is worth a press.**
 *
 * Forty characters — about a clause. Under it the two texts are the same note
 * with different whitespace or a trailing source credit, and an expansion that
 * reveals a line the reader is already looking at is worse than no expansion:
 * *a mark that would be on every row marks nothing*, and one that opens onto
 * nothing is the version of that fault a reader actually notices. Measured on
 * the notes that do differ, the gain is 300-700 characters — a whole analysis
 * paragraph — so nothing real sits near this threshold and it is a guard rather
 * than a tuning knob.
 */
const FULL_MIN_GAIN = 40;

// ---- The two, merged --------------------------------------------------

/**
 * One player's news, newest first.
 *
 * The player is named by his **MLB id and nothing else**: the RotoWire join is
 * done once, league-wide, inside `rotowire.ts`, so nothing here has to resolve
 * a name and nothing a caller supplies can get one wrong. `?type=` is
 * deliberately absent too — news is a fact about a *person*, so a two-way
 * player has one list where he has two of everything else.
 */
export async function getPlayerNews(playerId: number): Promise<PlayerNews> {
  const key = String(playerId);
  const hit = playerCache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.news;

  // The storage tier behind the memory one, on the same TTL — a cold container
  // reads one blob rather than making three upstream requests. It fills the
  // memory map on the way through so the second read in this container is the
  // 1ms one again.
  const stored = await readJsonBlob<PlayerNews>(
    storeKey(playerId),
    (_v, cachedAt) => Date.now() - cachedAt < TTL,
  );
  if (stored) {
    playerCache.set(key, { news: stored, at: Date.now() });
    return stored;
  }

  const [transactions, reports, bodies] = await Promise.all([
    fetchTransactions(playerId).catch((err) => {
      console.error('player transactions fetch failed:', err);
      return [] as NewsItem[];
    }),
    getRotowireNews(playerId).catch((err) => {
      console.error('player rotowire news fetch failed:', err);
      return [] as NewsItem[];
    }),
    // **The long form of the notes above, where CBS has the player.** A third
    // upstream in the same `Promise.all` and with the same `catch`, which is
    // this file's own rule read exactly: a dead CBS costs every note its
    // analysis paragraph and costs the list nothing else — the reader sees
    // precisely the page he saw before this existed. See `cbs.ts` for why this
    // enriches RotoWire's list rather than replacing it.
    getCbsBodies(playerId).catch((err) => {
      console.error('player cbs bodies fetch failed:', err);
      return new Map<string, CbsNote>();
    }),
  ]);

  /**
   * **Joined on the headline**, which is what the two sources share — the same
   * desk writes both. `newsKey` carries the one way they spell it differently
   * (CBS files a note under the club and the man) and the measurement that
   * found it. A note CBS does not have keeps `full: null` and draws as it
   * always has.
   *
   * **Longer, not merely present.** A note whose lede *is* the whole note comes
   * back from CBS as a body equal to the summary we already show, and offering
   * a reader an expansion that reveals the text under his eyes is the dead
   * affordance this app's own rule forbids. So the body has to beat the summary
   * it would replace, and by enough to be a second thought rather than a
   * difference in whitespace.
   */
  const enriched = reports.map((item) => {
    const note = bodies.get(newsKey(item.headline, false));
    if (!note) return item;
    const summary = item.summary ?? '';
    return note.body.length > summary.length + FULL_MIN_GAIN
      ? { ...item, full: note.body }
      : item;
  });

  // Reports lead the transactions they share a day with: `cmpDate` answers 0
  // for two rows dated to the same day, `sort` is stable, so the concat order
  // *is* the same-day order — and a note that reads like a sentence belongs
  // above the roster move it describes rather than under it.
  const items = [...enriched, ...withoutRestated(transactions, reports)].sort((a, b) =>
    cmpDate(b.date, a.date),
  );
  const news: PlayerNews = { items };
  playerCache.set(key, { news, at: Date.now() });
  // Not awaited: the answer is already built, and `storage.ts` logs and
  // swallows a failed write for exactly this reason — a full disk or a
  // transient S3 error must never fail a request that has its answer.
  void writeJsonBlob(storeKey(playerId), news);
  return news;
}

/**
 * Both halves date to the **day** — MLB publishes no time with a transaction
 * and RotoWire stamps a note `August 14, 2026` — so the comparison is on the
 * day and a longer string breaks its own ties, which keeps the function right
 * if either upstream ever starts publishing an instant. Sorting the raw strings
 * would work by accident today and stop working the moment one of them does.
 */
function cmpDate(a: string, b: string): number {
  const d = a.slice(0, 10).localeCompare(b.slice(0, 10));
  return d !== 0 ? d : a.localeCompare(b);
}
