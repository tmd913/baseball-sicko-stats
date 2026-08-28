import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { LIVE_POLL_MS } from './lib';

/**
 * **One entry per server resource, shared by everybody reading it.**
 *
 * The client's *own* state is already in one place — `App.tsx` holds it and the
 * URL persists it — and nothing here touches that. What was in as many places
 * as there were readers is the other half: an answer off the server, which was
 * fetched again by every component that wanted one, each with its own clock,
 * its own sequence guard and its own idea of when to re-read.
 *
 * Measured before this existed: **84 hand-written sequence guards** across six
 * files (`Req.current` / `Seq.current`), 47 loading flags and 34 error flags,
 * every one of them the same three lines re-derived. Correctness depended on
 * each component's author remembering the one-clock rule, rule 1 of the loading
 * system, and the guard — and the record is that several didn't:
 *
 * - `LeagueTeam` had no poll at all until one was added by hand, and the
 *   comment above it names what that cost: *"a team page opened at seven
 *   o'clock was still drawing seven o'clock's lines at ten"*, while the Roster
 *   view — the same component over the same shape of report — moved every
 *   twenty seconds. Reported as the matchup page being out of sync.
 * - It also **blanked on every mount** (`setReport(null)` before the read),
 *   so leaving a team page and stepping back onto it drew a wait over rows the
 *   app already had.
 *
 * Both are properties of *where the fetch lives* rather than of what it fetches,
 * so they are fixed here once instead of in each caller.
 *
 * **This is not a store of application state and must not become one.** A key
 * names a thing the server can be asked for; what is on screen, which tab is
 * open and which range is being read stay exactly where they are.
 */

/** What a caller gets back. Immutable and replaced wholesale, so
 *  `useSyncExternalStore` can compare it by identity. */
export type Resource<T> = {
  /** The last answer that landed, or undefined before the first one does.
   *  **A failed read leaves it standing** — rule 1, the same as `loadReport`
   *  has always done: the banner is the error's business and the rows are not
   *  its to take away. */
  value: T | undefined;
  /** The last failure, cleared by the next answer. */
  error: Error | undefined;
  /** A read has answered at least once, either way. The flag the tab pills and
   *  the boot gate want: *the app has been told*, not *the app was told
   *  something*. */
  settled: boolean;
  /** Nothing on screen yet and a read in flight — the block wait's flag. */
  loading: boolean;
  /** An answer on screen and a read in flight — the `Updating` badge's flag.
   *  The two are split here rather than at each render site, which is where
   *  `showLoading && reports.length === 0` was making the same distinction by
   *  hand. */
  updating: boolean;
  /** When the last answer landed, ms epoch. Zero before the first. */
  at: number;
};

const EMPTY: Resource<never> = {
  value: undefined,
  error: undefined,
  settled: false,
  loading: false,
  updating: false,
  at: 0,
};

type Entry = {
  snap: Resource<unknown>;
  /** Bumped per read; only the newest may write. **The sequence guard, written
   *  once.** A stale answer landing on a fresh one is the fault this is here
   *  for, and it is not a corner — see `App::loadReport`, where a `saved` read
   *  fired against an empty roster could land after the `fantasy` read that
   *  replaced it and set the page back to nobody. */
  seq: number;
  /** The read in flight, so a second subscriber mounting joins it rather than
   *  asking the same question again. */
  inflight: Promise<unknown> | null;
  /** How many reads are outstanding. Two counters rather than one, because the
   *  app has always had two kinds of read and only one of them is allowed to
   *  say so on screen: a **loud** read is one somebody's action started — a
   *  step of the date bar, a change of roster, a press of refresh — and a
   *  **quiet** one is the poll, the resume and the invalidation, which by rule
   *  1 leave no mark at all ("no ball in the toggle, no blank cells, the last
   *  answer standing until the next lands"). `loading` and `updating` are read
   *  off `loud` alone; `inflight` dedupes against both.
   *
   *  Either count clears on the **last** read outstanding rather than on any one
   *  of them, which is why `loadReport` counted rather than testing its
   *  sequence number: a stale response clearing the flag would take the block
   *  wait off a page that still has nothing on it. */
  reads: number;
  loud: number;
  subs: Set<() => void>;
  /** The most recently registered reader for this key. Two callers of one key
   *  are by construction asking the same question, so the newest is as good as
   *  any — and it is the one whose closure is current. */
  read: (() => Promise<unknown>) | null;
  /** Each subscriber's requested interval, by subscriber identity. One timer
   *  per **key**, at the shortest interval anybody asked for — the whole point
   *  of the one-clock rule, enforced rather than remembered. */
  polls: Map<object, number>;
  pollMs: number | null;
  timer: ReturnType<typeof setInterval> | null;
};

const entries = new Map<string, Entry>();

/**
 * **How many answers nobody is reading are worth keeping.**
 *
 * The cache outliving the component is the whole point of it — stepping back
 * onto a page draws what the app already had — but "for ever" is not the same
 * promise. A reader stepping the date bar across a month leaves a report per
 * day behind it, and a report is the largest thing this client holds.
 *
 * So an entry **with a subscriber is never evicted** (something on screen is
 * drawn from it), and the idle ones are held to this many, oldest answer first.
 * Thirty-two is chosen against the two shapes of return this exists to serve —
 * a step of the date bar and back, and a page opened, left and reopened — both
 * of which land within a handful of keys; the rest is headroom, and what it
 * costs is bounded by it.
 */
const MAX_IDLE = 32;

/** Drop the least recently answered idle entries until only `MAX_IDLE` remain.
 *  Insertion order is not the right order — an entry re-read a moment ago is
 *  the one worth keeping — so this sorts on when each last landed. */
function evict(): void {
  const idle = [...entries].filter(([, e]) => e.subs.size === 0 && e.polls.size === 0);
  if (idle.length <= MAX_IDLE) return;
  idle
    .sort((a, b) => a[1].snap.at - b[1].snap.at)
    .slice(0, idle.length - MAX_IDLE)
    .forEach(([key, e]) => {
      if (e.timer) clearInterval(e.timer);
      entries.delete(key);
    });
}

function entryFor(key: string): Entry {
  let e = entries.get(key);
  if (!e) {
    e = {
      snap: EMPTY,
      seq: 0,
      inflight: null,
      reads: 0,
      loud: 0,
      subs: new Set(),
      read: null,
      polls: new Map(),
      pollMs: null,
      timer: null,
    };
    entries.set(key, e);
  }
  return e;
}

function emit(e: Entry): void {
  for (const fn of e.subs) fn();
}

/** Recompute the immutable snapshot from the entry's parts and tell everybody
 *  reading it. The two loading flags are derived here rather than stored, so
 *  they cannot come to disagree with the value beside them. */
function settle(e: Entry, next: Partial<Resource<unknown>>): void {
  const merged = { ...e.snap, ...next };
  e.snap = {
    ...merged,
    loading: e.loud > 0 && merged.value === undefined,
    updating: e.loud > 0 && merged.value !== undefined,
  };
  emit(e);
}

/**
 * **Ask, unless somebody already is** — a second subscriber mounting on a key
 * with a read in flight joins it rather than asking the same question again.
 *
 * `force` is what reaches past that: the fantasy refresh, which exists
 * precisely because the reader knows something no cache can.
 */
function runRead(key: string, opts: { force?: boolean; quiet?: boolean } = {}): Promise<unknown> {
  const e = entryFor(key);
  if (!e.read) return Promise.resolve();
  if (e.inflight && !opts.force) return e.inflight;
  const seq = ++e.seq;
  e.reads += 1;
  if (!opts.quiet) e.loud += 1;
  settle(e, {});
  const p = Promise.resolve()
    .then(() => e.read!())
    .then(
      (value) => {
        if (seq !== e.seq) return;
        settle(e, { value, error: undefined, settled: true, at: Date.now() });
      },
      (err: unknown) => {
        if (seq !== e.seq) return;
        // Settled either way: a failed read is still an answer, and a gate
        // waiting for one must not wait for ever for one that isn't coming.
        settle(e, {
          error: err instanceof Error ? err : new Error(String(err)),
          settled: true,
        });
      },
    )
    .finally(() => {
      e.reads -= 1;
      if (!opts.quiet) e.loud -= 1;
      if (e.inflight === p) e.inflight = null;
      settle(e, {});
    });
  e.inflight = p;
  return p;
}

function refreshTimer(e: Entry, key: string): void {
  const want = e.polls.size > 0 ? Math.min(...e.polls.values()) : null;
  if (want === e.pollMs) return;
  if (e.timer) clearInterval(e.timer);
  e.pollMs = want;
  e.timer = want == null ? null : setInterval(() => void runRead(key, { quiet: true }), want);
}

/**
 * **What a mutation does to the answers it invalidates.**
 *
 * Prefix-matched, because a resource's key is written most-general-first
 * (`report:…`) exactly so that a write can name a family of them without
 * knowing which ranges and which rosters happen to be cached.
 *
 * An entry somebody is reading is **re-read**; one nobody is reading is
 * **dropped**, so it is asked for fresh next time it is wanted rather than
 * costing a request now. Quiet either way, which is rule 1 — the page keeps
 * what it has until the new answer lands.
 */
export function invalidate(prefix: string): void {
  for (const [key, e] of entries) {
    if (!key.startsWith(prefix)) continue;
    if (e.subs.size > 0) void runRead(key, { force: true, quiet: true });
    else entries.delete(key);
  }
}

/**
 * **An edit the app makes to an answer it is holding**, without asking for it
 * again — the reorder screen's drag, and the row that goes the moment it is
 * tapped. Both are cases where the client knows the next answer and a round
 * trip would only redraw what is already right.
 *
 * It does not mark the entry stale: the write that follows is what re-reads it.
 */
export function setResource<T>(key: string, update: (prev: T | undefined) => T): void {
  const e = entries.get(key);
  if (!e) return;
  settle(e, { value: update(e.snap.value as T | undefined) });
}

/** For a caller that wants the answer without subscribing to it. */
export function peekResource<T>(key: string): T | undefined {
  return entries.get(key)?.snap.value as T | undefined;
}

/**
 * **Re-read this key every `ms` while this component wants it polled**, or not
 * at all when `ms` is null.
 *
 * Its own hook rather than an option on `useResource` for one reason, and it is
 * the reason the team page had no poll for so long: **whether to poll is
 * usually a reading of the answer itself**. `anyLive` is computed off the
 * report, and an option consumed by the read would have had every caller
 * reaching for the previous render's value to decide about this one. Here the
 * gate is an ordinary derived boolean, declared after the value it is derived
 * from, and the timer follows it.
 *
 * **One timer per key**, at the shortest interval anybody asked for. Two
 * components watching one resource are one request, whatever either of them
 * believes about how often it should be made — which is the one-clock rule
 * enforced rather than remembered.
 */
export function useResourcePoll(key: string | null, ms: number | null): void {
  /** This subscriber's identity in the entry's poll table. A ref, so two
   *  components asking about one key stay two askers. */
  const me = useRef({});
  useEffect(() => {
    if (!key || ms == null) return;
    const e = entryFor(key);
    const mine = me.current;
    e.polls.set(mine, ms);
    refreshTimer(e, key);
    return () => {
      e.polls.delete(mine);
      refreshTimer(e, key);
    };
  }, [key, ms]);
}

/**
 * Subscribe to one server resource.
 *
 * `key` is the whole of the identity: two components passing the same key are
 * reading one object, one clock and one request. **A null key is "not yet"** —
 * the boot gates that hold a read until the app knows what it is about become a
 * null key rather than an early `return` in an effect, and the resource simply
 * has no answer while they hold.
 *
 * `read` is held in a ref and read at fetch time, so a caller may close over
 * whatever it likes without restarting anything; the key alone decides when a
 * question is a different question.
 */
export function useResource<T>(
  key: string | null,
  read: () => Promise<T>,
  opts: {
    /** **Carry the last answer across a change of key**, which is rule 1 read
     *  one step further than a single key can read it: stepping the date bar
     *  changes *which* report is wanted, and blanking the pane while the new
     *  one is in flight is the same curtain over the same rows that "never over
     *  data" exists to forbid. What the reader gets is the old rows and the
     *  `Updating` badge until the new ones land — which is what `loadReport`
     *  did by writing state only on success, and what `LeagueTeam` did *not*
     *  do, its effect blanking on `[teamId, start, end]` before every read.
     *
     *  On by default because it is the app's rule rather than an option. Turn
     *  it off where the old answer would be *wrong* rather than stale: a
     *  percentile card belonging to a different man is not a stale answer to
     *  the question on screen, it is an answer to a different one. */
    keepPrevious?: boolean;
    /** **How far `keepPrevious` reaches.** Two keys in one family are two
     *  questions about the same subject, and carrying an answer between them is
     *  the date bar's case; two families are two subjects, and carrying between
     *  those is drawing the wrong man.
     *
     *  The player page is what this is for and it needs both readings at once:
     *  the percentile card is keyed on the man *and the cut*, so pressing
     *  `vs LHP` should leave the season card up until the new one lands — which
     *  it did — while opening a different player must blank it, which the page
     *  used to do by hand in an eleven-line reset effect. Family
     *  `${kind}-${playerId}` says exactly that in one string.
     *
     *  Absent means one family: everything carries, which is the report's case
     *  and the ordinary one. */
    family?: string;
    /** How long an answer already in hand is considered current for on mount.
     *  The default is `LIVE_POLL_MS`, which is the app's own definition of it —
     *  see `lib.ts`, and `useResumed`, which asks the same question about a
     *  return from the background. */
    staleMs?: number;
  } = {},
): Resource<T> & {
  /** Ask again now, past the dedupe. Quiet by default — the callers are
   *  resumes and background refreshes; pass `{ quiet: false }` for a press that
   *  should show its own mark. */
  reload: (opts?: { quiet?: boolean }) => Promise<unknown>;
  /** Edit the held answer in place — see `setResource`. */
  set: (update: (prev: T | undefined) => T) => void;
} {
  const { staleMs = LIVE_POLL_MS, keepPrevious = true, family } = opts;

  const readRef = useRef(read);
  readRef.current = read;

  if (key) {
    // Registered during render rather than in the effect: the subscribe
    // callback below can fire a read before effects run, and a read with no
    // reader registered is a no-op that never retries.
    entryFor(key).read = readRef.current as () => Promise<unknown>;
  }

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!key) return () => undefined;
      const e = entryFor(key);
      e.subs.add(onChange);
      return () => {
        e.subs.delete(onChange);
        // The entry is **kept** with no subscribers left. That is the point of
        // it outliving the component: stepping back onto a page draws what the
        // app already had rather than a wait over an empty box, which is
        // `GamePage`'s `gameCache` argument generalized. `invalidate` drops
        // one; `evict` bounds how many of them are kept at once.
        evict();
      };
    },
    [key],
  );

  const snap = useSyncExternalStore(
    subscribe,
    () => (key ? entryFor(key).snap : EMPTY),
    () => (key ? entryFor(key).snap : EMPTY),
  );

  useEffect(() => {
    if (!key) return;
    const e = entryFor(key);
    // Decided from the entry's own state, never from a mark set before the
    // answer lands: React mounts, tears down and re-runs, and an "asked" flag
    // set on the first pass is what leaves a wait up for ever. The dedupe in
    // `runRead` is what makes the second pass free.
    const stale = !e.snap.settled || Date.now() - e.snap.at >= staleMs;
    // **Loud**, because this fires when the key changes — a different range, a
    // different roster, a page opened — and that is always something the reader
    // did. The quiet reads are the poll, the resume and the invalidation.
    if (stale) void runRead(key);
  }, [key, staleMs]);

  /** The last answer this caller was given, for `keepPrevious`. Held per hook
   *  rather than on the entry: it is a fact about what *this* component last
   *  drew, and two components crossing keys at different moments have different
   *  answers to it. */
  const held = useRef<{ value: T; family: string | undefined } | undefined>(undefined);
  const shown = snap as Resource<T>;
  if (shown.value !== undefined) held.current = { value: shown.value, family };
  else if (held.current && held.current.family !== family) held.current = undefined;
  const out: Resource<T> =
    keepPrevious && shown.value === undefined && held.current !== undefined
      ? {
          ...shown,
          value: held.current.value,
          // It is an answer on screen with a read behind it, which is the
          // badge's state and never the block wait's.
          loading: false,
          updating: shown.loading || shown.updating,
        }
      : shown;

  const reload = useCallback(
    (o: { quiet?: boolean } = {}) =>
      key ? runRead(key, { force: true, quiet: o.quiet ?? true }) : Promise.resolve(),
    [key],
  );
  const set = useCallback(
    (update: (prev: T | undefined) => T) => {
      if (key) setResource(key, update);
    },
    [key],
  );

  return { ...out, reload, set };
}
