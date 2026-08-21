import { baseballToday, daysBetween } from './etDate.js';
import { readStampedBlob, writeJsonBlob } from './storage.js';

/**
 * Official scoring moves after the last out, and MLB will tell you which games
 * it moved.
 *
 * A hit becomes an error, an earned run becomes unearned, a decision is
 * reassigned — days later, pushed into the Stats API silently. The `gamePk`
 * does not change, the `status` does not change, and nothing in the game's own
 * payload announces it. `isSettledFeed` (see `mlbStats.ts`) catches the *first*
 * half of this — a box score MLB has not finished writing — and explicitly does
 * not catch this half, because a rescoring lands long after the decisions are
 * in. This app then treats a finished day as final and never reads it again, so
 * a line MLB has since corrected goes on being served off disk for ever.
 *
 * **Measured, over every current-version game blob in the cache.** 622 games,
 * 47,018 plays, each re-fetched through the same field-filtered URL the app
 * writes with and compared play for play against what MLB serves today: **9
 * plays across 8 games differ**, and every one of the 8 has a later update
 * stamp in MLB's own change feed than the moment we froze it. What they cost:
 *
 * - `823264` (2026-08-12) — five runs went from earned to unearned. That
 *   pitcher's line reads `ER 8` on disk and `ER 3` at MLB.
 * - `823754` (2026-08-06) — a single became a field error: the batter loses a
 *   hit and an RBI, the pitcher loses a hit and an earned run.
 * - `823024` (2026-08-08) — a field error became a single, the other way, and
 *   the pitcher's hits go 4 → 5.
 * - `823994` (2026-08-13) — the **losing pitcher** was reassigned, 615698 to
 *   695239.
 * - `824725` (2026-08-17) — two strikeouts and an inning moved off one reliever
 *   onto another who had not been credited with appearing.
 * - `824970`, `824969`, `824240`, `824395` — three more earned-run flags and
 *   two runner attributions.
 *
 * **When they land, measured rather than assumed.**
 * `game/changes?updatedSince=` answers with every game MLB has touched since an
 * instant, so binary-searching it gives the instant of a game's last update
 * exactly. Sliced at 30 minutes across the last 14 days and at a day across the
 * last 31, and read against each game's `officialDate`: of the games MLB
 * touched in a 31-day window, **33 were touched two or more days after they
 * were played** — at 2, 3, 4, 5, 6, 7, 10, 11, 12, 15 and 16 days, plus two
 * outliers at 42 and 135 and eleven archival touches on 2023–2025 games. The
 * longest in-season lag in the fine-grained scan is **12 days** (`823754`,
 * played 2026-08-06, revised 2026-08-17T22:35Z). They arrive in small clusters
 * rather than continuously — three games in one half-hour on 8/15, three more
 * inside one hour on 8/17 — which is what a scorer's batch looks like.
 *
 * ---
 *
 * **The rule is not a TTL, and it is not a window either.** Both were written
 * out and rejected. A short TTL on a finished day throws away the entire point
 * of the day snapshot: a 62-day range would re-fetch a thousand games to move
 * nine plays. A fixed window — *anything inside N days is provisional* — is
 * only a guess at the tail, and the tail is real (15, 16, 42 days all appear).
 *
 * **MLB is asked which games moved, and only those days are rebuilt.** One
 * request, `fields`-filtered to `gamePk` and `officialDate`: **17,117 bytes and
 * 148ms for a 14-day lookback, against 260,456 bytes and 686ms unfiltered.** In
 * the steady state the lookback is the half-hour since the last poll, which is
 * a few hundred bytes, and on a day when nothing that has settled moved, the
 * whole rule costs that one request and nothing else.
 *
 * **Two traps in this endpoint, both probed before anything was built on it.**
 * It caps at **1,000 games**, so a lookback past about 60 days silently
 * truncates and cannot be trusted — `-120d` and `-200d` both answer with
 * exactly 1,000. And an **omitted or empty `updatedSince` returns 200 with the
 * full 1,000-game list** rather than an error, which is this repo's standing
 * warning about an endpoint that accepts a parameter and ignores it; the value
 * is built here and can never be blank. A malformed value 400s honestly.
 */

/**
 * How far back a cold stamp asks about.
 *
 * This is the **only** thing the number decides — how much of MLB's recent
 * history the app assumes it may have missed while it was not watching. Once
 * there is a stamp, the lookback is the time since the last poll and this is
 * never reached for again.
 *
 * Fourteen days, because that is what heals the cache as it stands. All 8 of
 * the drifted games above were last updated between **0.84 and 10.45 days ago**
 * (binary-searched off the change feed), and no game blob on disk is older than
 * that: all 622 current-version blobs were written on 2026-08-10 or later,
 * `FEED_CACHE_VERSION` having gone to 8 that day. So one seeded poll names
 * every blob this measurement found wrong — which is the argument, below, for
 * why neither cache version needed a bump to heal them.
 */
const SEED_LOOKBACK_DAYS = 14;

/** How often MLB is asked what moved. `news.ts`'s own number and for its
 *  reason: short enough that a correction is never stale by the time anybody
 *  looks twice, long enough that a 62-day range pays for one request rather
 *  than sixty-two. */
const POLL_TTL_MS = 30 * 60 * 1000;

/**
 * How far the next poll's `updatedSince` is rewound from the last one.
 *
 * The stamp is a plain blob and `storage.ts` has no compare-and-set, so two
 * containers polling at once can lose one of the two writes. Rewinding two
 * hours makes a lost write cost a *repeated* answer rather than a missed one —
 * the same games come back next time and `pending` is a union, so nothing has
 * to be right the first time. It is also what covers the one race in
 * `revisedSince` below. It costs nothing measurable: a two-hour lookback is a
 * few hundred bytes.
 */
const OVERLAP_MS = 2 * 60 * 60 * 1000;

/**
 * A safety valve, not a policy. A date is normally cleared the moment its day
 * is rebuilt; this only stops a date whose rebuild keeps failing from growing
 * the stamp without bound. Well past the longest lag measured.
 */
const PENDING_MAX_DAYS = 45;

const KEY = 'mlb-revisions-v1.json';

/** One date's outstanding revisions. `seenAt` is when *we learned*, not when
 *  MLB made the change — the feed does not say when — and it is compared
 *  against a day snapshot's own `builtAt`. See `revisedSince`. */
interface DayRevisions {
  seenAt: number;
  pks: number[];
}

interface RevisionState {
  /** The instant the last poll asked about. */
  since: string;
  /**
   * Baseball date → the games MLB has revised there that this app has not
   * rebuilt yet.
   *
   * **Durable, and cleared by the rebuild rather than by the poll.** Advancing
   * `since` on its own would mean a revision reported to a process that then
   * died was never reported again: the blob on disk stays wrong for ever and
   * nothing knows it. An entry leaves this map only through `clearRevisions`,
   * which `savant.ts::getDay` calls after it has rebuilt the day from the wire
   * and written the snapshot again.
   */
  pending: Record<string, DayRevisions>;
}

const EMPTY: RevisionState = { since: '', pending: {} };

let mem: { state: RevisionState; polledAt: number } | null = null;
let inFlight: Promise<RevisionState> | null = null;

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');

interface ChangedGame {
  gamePk?: number;
  officialDate?: string;
}

/**
 * Ask MLB what it has touched since `since`.
 *
 * `officialDate` is asked for by name rather than read off the enclosing
 * `dates[].date`: that grouping key is the **UTC** day, which for a night game
 * is one past the day this app files it under. `fields` is not decoration
 * either — see the header for both measurements.
 */
async function fetchChanged(since: string): Promise<Map<number, string>> {
  const url =
    `https://statsapi.mlb.com/api/v1/game/changes?sportId=1&updatedSince=${encodeURIComponent(since)}` +
    `&fields=dates,games,gamePk,officialDate`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB game/changes returned ${res.status} ${res.statusText}`);
  const body = (await res.json()) as { dates?: { games?: ChangedGame[] }[] };
  const out = new Map<number, string>();
  for (const d of body.dates ?? []) {
    for (const g of d.games ?? []) {
      if (typeof g.gamePk === 'number' && typeof g.officialDate === 'string') {
        out.set(g.gamePk, g.officialDate);
      }
    }
  }
  return out;
}

/** A stored state is only as trustworthy as any other blob on disk — an older
 *  shape, a hand-edited file — so both halves are checked rather than cast. */
function normalize(value: RevisionState | null | undefined): RevisionState {
  const since = value?.since;
  const pending = value?.pending;
  return {
    since: typeof since === 'string' ? since : '',
    pending: pending !== null && typeof pending === 'object' ? pending : {},
  };
}

async function readState(): Promise<RevisionState> {
  const stored = await readStampedBlob<RevisionState>(KEY);
  return stored === null ? EMPTY : normalize(stored.value);
}

function prune(pending: Record<string, DayRevisions>): Record<string, DayRevisions> {
  const today = baseballToday();
  const out: Record<string, DayRevisions> = {};
  for (const [date, entry] of Object.entries(pending)) {
    if (!entry || entry.pks.length === 0) continue;
    if (daysBetween(date, today) > PENDING_MAX_DAYS) continue;
    out[date] = entry;
  }
  return out;
}

async function poll(): Promise<RevisionState> {
  const prior = await readState();
  const now = Date.now();
  // Never blank — a blank `updatedSince` is the 200-that-ignores-you above —
  // and never further back than the seed, which is where the endpoint's
  // 1,000-game cap starts to bite.
  const floor = now - SEED_LOOKBACK_DAYS * 86_400_000;
  const since =
    prior.since === ''
      ? iso(floor)
      : iso(Math.max(Date.parse(prior.since) - OVERLAP_MS, floor));

  const changed = await fetchChanged(since);
  const pending = { ...prior.pending };
  for (const [gamePk, date] of changed) {
    // A game on today's baseball day is still mutable and is re-read on its own
    // TTL, so a change to it is not news — but it is still *recorded*, because
    // the day rolls over at 3am ET (`etDate.ts`) and an update landing at 2am
    // would otherwise be dropped an hour before the day it belongs to became
    // one this rule can act on.
    const held = pending[date];
    // Copied rather than mutated in place: `prior` is a freshly parsed blob
    // today, but a shared one tomorrow is exactly the kind of aliasing that
    // makes a memo and a stored blob disagree.
    const pks = held ? [...held.pks] : [];
    if (!pks.includes(gamePk)) pks.push(gamePk);
    pending[date] = { seenAt: now, pks };
  }
  // Pruned **after** the merge rather than before it, which is not a detail: a
  // seeded poll's answer carries MLB's own archival touches — measured, eleven
  // games from 2023, 2024 and 2025 and one from 2026-03-31 in a single 31-day
  // window — and a date this app will never open again is a day rebuild (a
  // schedule fetch, fifteen feeds and a Savant export) spent on nothing.
  const next: RevisionState = { since: iso(now), pending: prune(pending) };
  await writeJsonBlob(KEY, next);
  return next;
}

/**
 * The revision map, polled at most once per `POLL_TTL_MS`.
 *
 * **A failure costs its own column, never the request.** A dead change feed
 * leaves the last answer standing — or an empty one on a cold start, which is
 * exactly the behavior this app had before the rule existed: every finished day
 * final. Nothing upstream of here needs a `try`, and a feed that is down must
 * not turn into a request per read, which is why the memo is stamped on the
 * failure path too.
 */
async function state(): Promise<RevisionState> {
  if (mem && Date.now() - mem.polledAt < POLL_TTL_MS) return mem.state;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      // **A cold process adopts the last poll rather than making one of its
      // own.** The stamp carries the instant it was written (`storage.ts`'s
      // envelope), so a container coming up inside the window reads a blob
      // instead of paying for a round trip to MLB. Measured on a cold 7-day
      // `/api/report` whose days all come off snapshots, three restarts each:
      // **228/212/207ms adopting against 226/216/204ms before this rule existed
      // at all**, and **681ms for the one process that has to poll** (646-938ms
      // over the wider set of trials). Nearly all of that is the first TLS handshake to
      // `statsapi.mlb.com` rather than the answer, which is **12 bytes and
      // 18-22ms** on a connection already open. It matters most exactly where
      // it is cheapest to have: on Lambda, where containers are cold constantly
      // and every one of them shares the one stamp in S3.
      const stored = await readStampedBlob<RevisionState>(KEY);
      if (stored !== null && Date.now() - stored.cachedAt < POLL_TTL_MS) {
        const adopted = normalize(stored.value);
        mem = { state: adopted, polledAt: stored.cachedAt };
        return adopted;
      }
      const next = await poll();
      mem = { state: next, polledAt: Date.now() };
      return next;
    } catch (err) {
      console.error('MLB revision poll failed:', err);
      const fallback = mem?.state ?? (await readState().catch(() => EMPTY));
      mem = { state: fallback, polledAt: Date.now() };
      return fallback;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * The games MLB has revised on `date` since a day snapshot built at `builtAt`
 * was written — empty when there is nothing to do, which is the ordinary case
 * and the whole of the cost control.
 *
 * **`builtAt` is what keeps this from rebuilding yesterday every morning.** MLB
 * writes to a game after the last out as a matter of course (the decisions, the
 * holds), so the change feed names most of a slate the night it is played; if
 * the mere presence of a pending entry invalidated a day, every day would be
 * rebuilt once for nothing. Comparing against the moment the snapshot was
 * written settles it: an update we learned about *before* we built the day is
 * already in the day.
 *
 * That comparison is safe in the direction that matters, because a snapshot
 * written at time *T* was written by a `getDay` that consulted this map at *T*
 * — so anything pending before *T* was either applied or is still pending with
 * a later `seenAt`. The one race left is a poll landing while a build is in
 * flight, and `OVERLAP_MS` is what covers it: the same game is reported again
 * on the next poll with a later stamp.
 *
 * A date at or after today's baseball day answers empty: it is mutable, it is
 * re-read on `TODAY_TTL` anyway, and it has no snapshot to be wrong.
 */
export async function revisedSince(date: string, builtAt: number): Promise<number[]> {
  if (date >= baseballToday()) return [];
  const entry = (await state()).pending[date];
  if (!entry || entry.seenAt <= builtAt) return [];
  return entry.pks;
}

/**
 * A date has been rebuilt from the wire and re-snapshotted; stop reporting it.
 *
 * Cleared at the **day** rather than at the game, deliberately.
 * `savant.ts::buildStatsApiDay` is the only caller of `getStatsApiGame`, so a
 * game is only ever read through its day; clearing per game would let a route
 * that happened to touch one game first clear the flag the day snapshot still
 * needed.
 */
export async function clearRevisions(date: string): Promise<void> {
  const current = await state();
  if (current.pending[date] === undefined) return;
  const pending = { ...current.pending };
  delete pending[date];
  const next: RevisionState = { since: current.since, pending };
  mem = { state: next, polledAt: mem?.polledAt ?? Date.now() };
  await writeJsonBlob(KEY, next);
}

/**
 * Every settled date with a revision outstanding, oldest first.
 *
 * The warmer's list. A reader must never be the one who pays for a rebuild if
 * anything else can — the rule this file's neighbors already follow for the
 * research board and team hitting — and draining this nightly is also what
 * keeps `pending` from depending on whether anybody happened to open the day.
 */
export async function revisedDates(): Promise<string[]> {
  const today = baseballToday();
  return Object.keys((await state()).pending)
    .filter((d) => d < today)
    .sort();
}
