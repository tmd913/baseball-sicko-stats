import { getMlbIndex, matchMlbPlayer } from './espn.js';
import { getTeamAbbrevs } from './mlbStats.js';
import { readJsonBlob, writeJsonBlob } from './storage.js';

/**
 * # CBS Sports is where a RotoWire note is read *in full*
 *
 * ## It is not a second source, and that is the first thing to know
 *
 * Every item in CBS's "Fantasy News" carries the byline **`Rotowire`**. This is
 * the same desk writing the same notes the player page already shows — so
 * nothing here is a second opinion, a second set of facts, or a hedge against
 * RotoWire going down. What it is is **the rest of the note**.
 *
 * RotoWire's own player page publishes the lede and stops. CBS republishes the
 * whole thing, lede and analysis together. Measured on Jake Bauers, 2026-08-26:
 *
 * | | RotoWire | CBS |
 * | --- | --- | --- |
 * | notes per player | up to **7** | **20** |
 * | body | headline + lede | headline + **lede and analysis** |
 * | stamp | a day (`August 14, 2026`) | an instant (`2026-08-26 20:21:51 GMT`) |
 *
 * On that note RotoWire ends at *"…diagnosed with shin splints Sunday, Curt
 * Hogg of the Milwaukee Journal Sentinel reports."* CBS carries the next 600
 * characters — when the splints first surfaced, that the injured list is not in
 * play, that he pinch-hit Tuesday and should be available Wednesday. That
 * second half is the reason this file exists, and it is the half a manager
 * actually decides on.
 *
 * ## Why RotoWire stays the source and this is an enrichment
 *
 * **Because CBS cannot address most of the league.** It publishes no player
 * list; the only place it enumerates anybody is one roster page per club, and
 * those pages are the **26-man active roster**. Measured: Nick Pivetta, Spencer
 * Strider, Brandon Woodruff and Zac Gallen do not appear anywhere on their
 * club's page — not in the markup, not in the JSON-LD. Injured players are
 * exactly who a news tab is opened for, and CBS's index does not contain them.
 *
 * The league-wide injuries page recovers 275 of them, and even so:
 *
 * | index | requests | bytes | MLB ids matched |
 * | --- | --- | --- | --- |
 * | RotoWire | **2** | 629KB | **1,403** |
 * | CBS (rosters + injuries) | **31** | ~16MB | 966 |
 *
 * Against this app's own boards: CBS reaches **74.3%** of the batter board and
 * **64.9%** of the pitcher board where RotoWire reaches **99.6%** and
 * **99.8%** — and CBS brings exactly **one** player RotoWire does not have,
 * against **470** RotoWire has that CBS does not. Switching wholesale would
 * have blanked the News tab for roughly one pitcher in three to gain one
 * player. So RotoWire is the list and CBS is the long form of the rows it
 * already has, which is the shape the measurement chose rather than a
 * compromise between two sources.
 *
 * ## What was probed
 *
 * Written down rather than left to be re-probed, the table `rotowire.ts` sets
 * the precedent for. The 404s are the useful half here — CBS has no search or
 * player API to be found:
 *
 * | Endpoint | Result |
 * | --- | --- |
 * | `www.cbssports.com/mlb/players/{id}/fantasy/` | **200** — the source used here. ~686KB of HTML, of which 20 `<article class="NewsFeedWire">` blocks are the news. |
 * | …with **no slug at all**, and with a **wrong** slug | **200 both ways**, same 20 items. So the index carries an id and not an address, unlike RotoWire's, where a wrong slug 301s away. |
 * | `www.cbssports.com/mlb/teams/{ABBR}/{slug}/roster/` | **200** — the index used here. A schema.org `SportsTeam` block with `athlete[]` giving full name and player URL. 26-28 men: **the active roster, no injured players**. |
 * | `www.cbssports.com/mlb/injuries/` | **200** — one request, 285 player ids, and where Strider and the rest of the injured are. |
 * | `www.cbssports.com/mlb/players/` | **200 and no player links** — a landing page, not a list. |
 * | `www.cbssports.com/fantasy/baseball/players/`, `/mlb/stats/player/batting/…`, `/api/search/?q=`, `/search/?q=` | **404** |
 *
 * `robots.txt` disallows `/info/search`, `/data/*`, `/component/*` and the
 * account paths; `/mlb/players/` and `/mlb/teams/` are not among them. `GPTBot`
 * is disallowed wholesale and this is not it.
 *
 * ## The shape this depends on, and how it fails
 *
 * A scrape, like the RotoWire one it enriches, so the shape is written down
 * because nothing upstream promises it:
 *
 * 1. `<article class="NewsFeedWire …">`, one per note.
 * 2. Inside it: `NewsFeedWire-title` (the headline), `NewsFeedWire-source`
 *    (`Rotowire`), a `<time datetime="…">` and `NewsFeedWire-content` — the
 *    **whole** body, lede and analysis both. That node comes back **two ways**,
 *    as plain text with a blank line and as `<p>` elements carrying annotation
 *    spans, so the paragraph break is recovered from the markup rather than
 *    from the whitespace. See `plain`.
 * 3. The `... See More` control is **CSS**, not a fetch: the full text is in
 *    the server's own HTML and a plain `fetch` has all of it. This was checked
 *    rather than assumed, and it is the fact that makes the feature cheap.
 *
 * **Every field is optional in the parser and a miss costs its own note**, not
 * the read: a block with no headline or no body is skipped, an unparseable page
 * answers an empty list, and `news.ts` merges an empty list to exactly the
 * RotoWire text it has today. *A failure costs its own column, never the
 * request* — and here the column is one paragraph of one note.
 */

const UA = {
  // CBS serves the roster JSON-LD and the news markup to a plain client, but a
  // bare library agent gets a different (script-only) shell on some paths. A
  // browser agent is what was measured against, so it is what is sent.
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

/**
 * **Six hours, the same as RotoWire's index and for the same reason**: this is
 * a season roster and the only thing that moves it is a call-up or an IL move.
 * It matters more here than there, because rebuilding costs 31 requests and
 * ~16MB against RotoWire's 2 and 629KB.
 */
const INDEX_TTL = 6 * 60 * 60 * 1000;
const INDEX_KEY = 'cbs-index-v1.json';

let indexCache: { map: Map<number, string>; at: number } | null = null;
/** So a cold container answering three player pages at once sends one sweep of
 *  31 upstreams rather than three, the guard every shared read here carries. */
let indexInFlight: Promise<Map<number, string>> | null = null;
/** A failure is remembered for a minute — `getRotowireIndex`'s rule, and the
 *  cost of being wrong is only that a note shows its lede for up to a minute. */
let indexFailedAt = 0;
const INDEX_RETRY_MS = 60 * 1000;

async function text(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`CBS ${url} returned ${res.status}`);
  return res.text();
}

/** `{"@type":"Person","name":"Jake Bauers","url":"\\/mlb\\/players\\/2165918\\/…"}`
 *  — the JSON-LD is embedded in a script body, so the slashes are escaped and
 *  the pattern has to tolerate both spellings. */
const ATHLETE_RE =
  /\{"@type":"Person","name":"(.*?)","url":"\\?\/mlb\\?\/players\\?\/(\d+)\\?\//g;

/** A CBS player link anywhere on a page — what the injuries page is read with,
 *  it having no JSON-LD of its own. The slug is the only name it carries. */
const PLAYER_LINK_RE =
  /href="(?:https:\/\/www\.cbssports\.com)?\/mlb\/players\/(\d+)\/([a-z0-9-]+)\/"/g;

/** `jake-bauers` → `Jake Bauers`. Only ever used on the injuries page, where
 *  there is no full name to be had; the roster pages carry a real one and never
 *  come through here. It is deliberately naive — `matchMlbPlayer` does the
 *  accent-and-suffix folding, and a name it cannot place is left unmatched
 *  rather than guessed at, which is this codebase's standing direction. */
function nameFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.length === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** The thirty clubs, as CBS spells their roster paths. Read off its own teams
 *  page rather than pinned, so a club that renames itself does not silently
 *  cost its whole roster — the `ATH` move is the recent precedent. */
async function clubPaths(): Promise<string[]> {
  const html = await text('https://www.cbssports.com/mlb/teams/');
  const seen = new Set<string>();
  for (const m of html.matchAll(/\/mlb\/teams\/([A-Z]{2,3})\/([a-z0-9-]+)\//g)) {
    seen.add(`${m[1]}/${m[2]}`);
  }
  return [...seen];
}

/**
 * **The build itself, which nothing on a request path may await.** See
 * `getCbsIndex` for why, and `warmCbsIndex` for who does await it.
 */
function buildCbsIndex(): Promise<Map<number, string>> {
  if (indexInFlight) return indexInFlight;
  const work = (async (): Promise<Map<number, string>> => {
    const [clubs, mlbIndex, abbrevs] = await Promise.all([
      clubPaths(),
      getMlbIndex(),
      getTeamAbbrevs(),
    ]);
    const teamIdByAbbrev = new Map<string, number>();
    for (const [id, abbrev] of abbrevs) teamIdByAbbrev.set(abbrev, id);

    /** Everyone CBS names, with the club we found him under where we know it. */
    const found: { name: string; cbsId: string; teamId?: number }[] = [];
    const haveCbsId = new Set<string>();

    // The rosters, in sequence rather than all thirty at once: this is a
    // six-hourly rebuild behind a blob, so it is never on a reader's path, and
    // thirty simultaneous 500KB pages is not a courtesy worth skipping. A club
    // whose page fails costs its own roster and nothing else.
    for (const club of clubs) {
      try {
        const html = await text(`https://www.cbssports.com/mlb/teams/${club}/roster/`);
        const block = html.match(/"athlete":\[(.*?)\]/s);
        if (!block) continue;
        const teamId = teamIdByAbbrev.get(club.split('/')[0]);
        for (const m of block[1].matchAll(ATHLETE_RE)) {
          if (haveCbsId.has(m[2])) continue;
          haveCbsId.add(m[2]);
          found.push({ name: m[1], cbsId: m[2], teamId });
        }
      } catch (err) {
        console.error(`CBS roster ${club} failed:`, err);
      }
    }

    // …and then everybody the active rosters leave out, which is the injured —
    // the population a news tab is most often opened for. One request.
    try {
      const html = await text('https://www.cbssports.com/mlb/injuries/');
      for (const m of html.matchAll(PLAYER_LINK_RE)) {
        if (haveCbsId.has(m[1])) continue;
        haveCbsId.add(m[1]);
        found.push({ name: nameFromSlug(m[2]), cbsId: m[1] });
      }
    } catch (err) {
      console.error('CBS injuries page failed:', err);
    }

    const map = new Map<number, string>();
    for (const f of found) {
      const hit = matchMlbPlayer(mlbIndex, f.name, f.teamId);
      // First writer wins, and the rosters are walked first — so a man who is
      // on both an active roster and the injuries page is addressed by the row
      // that carried a real name and a club rather than by a slug.
      if (hit && !map.has(hit.id)) map.set(hit.id, f.cbsId);
    }
    indexCache = { map, at: Date.now() };
    // The **reduced** map rather than the ~16MB it came out of, the same rule
    // the RotoWire index follows. ~15KB of pairs.
    await writeJsonBlob<[number, string][]>(INDEX_KEY, [...map]);
    return map;
  })();
  indexInFlight = work;
  return work
    .catch((err: unknown) => {
      console.error('CBS index build failed:', err);
      indexFailedAt = Date.now();
      return new Map<number, string>();
    })
    .finally(() => {
      indexInFlight = null;
    });
}

/**
 * MLB id → CBS's numeric player id, **for a caller with a reader waiting**.
 *
 * **Memory, then the blob, and never a build.** This is the whole of the rule
 * and it is a production constraint rather than a preference: the build is 31
 * sequential requests and **~36 seconds measured**, and the API Lambda is
 * capped at **29** (`infra/lib/stack.ts` — *API Gateway gives up at 30s; there
 * is no point outliving it*). Awaiting a cold build inside `/api/players/:id/
 * news` would not degrade that route, it would **time the whole thing out** —
 * so a reader whose CBS index happened to be cold would lose his RotoWire notes
 * and his transactions too, to add an analysis paragraph. That is precisely the
 * inversion *a failure costs its own column, never the request* forbids.
 *
 * So a cold index **kicks the build off and answers empty in the same tick**.
 * The reader gets exactly the page he had before this file existed, the blob
 * lands a half-minute later, and the next read is enriched. Nothing waits and
 * nothing fails. `warmCbsIndex` is what actually pays for it, nightly, where
 * there are ten minutes to spend and nobody watching.
 *
 * **An id and not an address**, which is the one way this index is easier than
 * RotoWire's: a CBS player URL with the right number and no slug at all is a
 * 200, so there is no slug to keep fresh and no way a rename can break a stored
 * row.
 *
 * **The join is `espn.ts`'s**, imported rather than rewritten — the same
 * accent-and-suffix fold, the same MLB name index, the same rule that a club
 * breaks a tie and an ambiguity neither test resolves is left unmatched. The
 * roster pages supply the club for free, being one page per club; the injuries
 * page supplies none, so its rows are matched on name alone.
 *
 * Measured: 784 men off the thirty roster pages, 275 more off the injuries
 * page, **966 of those 1,059 matched** to MLB ids. The 93 that do not are
 * overwhelmingly the injuries page's slug-derived names, which is the honest
 * cost of the one page that carries no proper name.
 */
export async function getCbsIndex(): Promise<Map<number, string>> {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL) return indexCache.map;
  if (indexFailedAt && Date.now() - indexFailedAt < INDEX_RETRY_MS) return new Map();
  const stored = await readJsonBlob<[number, string][]>(
    INDEX_KEY,
    (_v, at) => Date.now() - at < INDEX_TTL,
  );
  if (stored) {
    const map = new Map(stored);
    indexCache = { map, at: Date.now() };
    return map;
  }
  // **Started, not awaited.** `void` is the point of the line.
  void buildCbsIndex();
  return new Map();
}

/**
 * **The one caller that waits**, for `warmer.ts`: build the index if the blob is
 * cold, so no reader ever meets a cold one. Ten minutes of budget against a
 * ~36-second job, and nobody watching.
 */
export async function warmCbsIndex(): Promise<void> {
  const stored = await readJsonBlob<[number, string][]>(
    INDEX_KEY,
    (_v, at) => Date.now() - at < INDEX_TTL,
  );
  if (stored) {
    indexCache = { map: new Map(stored), at: Date.now() };
    return;
  }
  await buildCbsIndex();
}

/**
 * Tags out, entities back, runs of blank space folded — but the **paragraph
 * break kept**, which is the one thing this body has that RotoWire's lede does
 * not. The lede and the analysis are two paragraphs and that break is the whole
 * shape of the note; run them together and the reader gets a wall.
 *
 * **The break is recovered from the markup rather than found in the text**, and
 * that is a correction. CBS serves this node two ways: as plain text with a
 * literal blank line in it (what a saved sample showed) *and* as `<p>` elements
 * with annotation spans inside them (what the live page actually returned).
 * Stripping tags without putting a break back ran *"…Sentinel reports."* and
 * *"Bauers was believed…"* together into one 953-character sentence with no
 * space at the seam — measured on the live answer, which is why the block tags
 * are converted before anything is stripped rather than trusting whatever
 * whitespace happened to be there.
 */
function plain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    // Every block that ends a paragraph, whichever of the two shapes came back.
    .replace(/<\/(p|div|li|h\d)\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

/**
 * **The key the two sources are joined on**, and it is the headline with CBS's
 * own prefix taken off.
 *
 * They are the same desk's notes, so the headline string is *identical* on both
 * sides — except that CBS files it under the club and the man:
 *
 * ```
 *   RotoWire   Out again Wednesday, managing shin splints
 *   CBS        Brewers' Jake Bauers: Out again Wednesday, managing shin splints
 * ```
 *
 * **Measured, and it is why the first pass matched nothing**: 0 of 7 notes on
 * Jake Bauers joined on the raw string, and 7 of 7 join once the prefix comes
 * off. So the prefix is stripped on the **CBS side only** — the first `": "`
 * and everything before it — which is deliberately not symmetric. A RotoWire
 * headline that contains a colon of its own (`Injury update: out a week`)
 * arrives at CBS as `Brewers' Jake Bauers: Injury update: out a week`, and
 * cutting at the *first* colon on that side alone leaves both sides holding
 * `Injury update: out a week`. Stripping on both would eat the real one.
 *
 * The rest is the folding two publishers of one string can still differ on:
 * whitespace runs, and the curly apostrophe against the straight one. Case is
 * folded too. Nothing looser than that — an over-eager match would staple one
 * note's analysis onto another note, which is worse than showing no analysis at
 * all and is the *join fails to null, never to a guess* rule read on this side.
 */
export function newsKey(headline: string, stripPrefix: boolean): string {
  const cut = stripPrefix ? headline.indexOf(': ') : -1;
  const tail = cut === -1 ? headline : headline.slice(cut + 2);
  return tail
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** One note as CBS has it. */
export interface CbsNote {
  /** The headline as CBS files it, club and player and all — kept as it came
   *  rather than as the key it is looked up by, so a reader of a log can see
   *  which note this is. `news.ts` never draws it; the RotoWire row keeps its
   *  own headline, that being the one already on screen. */
  headline: string;
  /** The whole body, lede and analysis, `\n\n` between them. */
  body: string;
  /** `2026-08-26T20:21:51Z` where CBS gave a parseable stamp, else null. Not
   *  used to order anything — the RotoWire item keeps its own date — and here
   *  only so a note can be told from a re-run of the same headline. */
  at: string | null;
}

/**
 * One player's notes off his CBS page, newest first as CBS orders them.
 *
 * Twenty of them where RotoWire's page has seven, and every one carrying the
 * analysis paragraph RotoWire's own page withholds.
 */
export async function fetchCbsNotes(cbsId: string): Promise<CbsNote[]> {
  const html = await text(`https://www.cbssports.com/mlb/players/${cbsId}/fantasy/`);
  const out: CbsNote[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<article[^>]*class="[^"]*NewsFeedWire[^"]*"[^>]*>([\s\S]*?)<\/article>/g)) {
    const block = m[1];
    const head = block.match(/NewsFeedWire-title[^"]*"[^>]*>([\s\S]*?)<\/h\d>/);
    const body = block.match(/NewsFeedWire-content"[^>]*>([\s\S]*?)<\/div>/);
    if (!head || !body) continue;
    const headline = plain(head[1]);
    const text_ = plain(body[1]);
    // A note with no headline cannot be matched to a RotoWire one, and one with
    // no body has nothing this file exists to add. Either way it is dropped
    // rather than half-built.
    if (!headline || !text_) continue;
    if (seen.has(headline)) continue;
    seen.add(headline);
    const stamp = block.match(/<time[^>]*datetime="([^"]+)"/);
    out.push({ headline, body: text_, at: isoStamp(stamp?.[1] ?? null) });
  }
  return out;
}

/** `2026-08-26 20:21:51 GMT+0000` → an ISO instant, or null. CBS's own format
 *  is not one `Date` parses, so the offset is normalized first. */
function isoStamp(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(' GMT', '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2').replace(' ', 'T');
  const d = new Date(cleaned.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(cleaned) ? cleaned : `${cleaned}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * One player's CBS notes by **MLB** id, keyed by headline — an empty map for a
 * man CBS cannot address, which is a third of the pitching board and is the
 * ordinary case rather than a failure.
 *
 * Keyed by headline because the headline is what the two sources share — see
 * `newsKey` for the one way they spell it differently and for the measurement.
 * The dates are not comparable (a day against an instant) and there is no id on
 * either side to join on; `rotowire.ts` records why there is no id.
 */
export async function getCbsBodies(mlbId: number): Promise<Map<string, CbsNote>> {
  const cbsId = (await getCbsIndex()).get(mlbId);
  if (!cbsId) return new Map();
  const notes = await fetchCbsNotes(cbsId);
  const out = new Map<string, CbsNote>();
  // Keyed by the stripped headline; first writer wins, so where CBS has run the
  // same headline twice the newer of the two (its own order) is the one kept.
  for (const n of notes) {
    const key = newsKey(n.headline, true);
    if (!out.has(key)) out.set(key, n);
  }
  return out;
}
