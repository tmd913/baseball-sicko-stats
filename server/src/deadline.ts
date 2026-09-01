/**
 * A deadline for one upstream read, and the length stamped on it so the failure
 * can say how long it waited.
 *
 * ## Why this is not in `upstream.ts`
 *
 * It belongs there by subject — that module is where upstream deadlines are
 * decided — and it cannot live there, because **`upstream.ts` is imported for a
 * side effect**: it replaces the global `fetch` for the whole process. Only
 * `index.ts` imports it, and that is deliberate. The API Lambda wants every
 * read capped at 15s; the **warmer** Lambda emphatically does not. Its whole
 * job is the reads the interactive path cannot absorb — thirty-one CBS roster
 * pages, sixty 3.3MB Statcast day exports, a season CSV per pitcher — and it is
 * given ten minutes to do them in.
 *
 * So a module that merely wants to *set* a deadline must be able to say so
 * without dragging the global replacement in behind it. `mlbStats.ts` is one
 * such module and the warmer imports it directly; had `withDeadline` come from
 * `upstream.ts`, one import line would have quietly put a 15-second cap on
 * every fetch the warmer makes.
 *
 * The symbol is `Symbol.for` rather than a module-private symbol for the same
 * reason: it has to be readable from `upstream.ts` without the two files
 * importing each other.
 */

/** Where `withDeadline` records how long it gave, for `deadlineOf` to read. */
const DEADLINE = Symbol.for('sicko.upstream.deadlineMs');

/**
 * A deadline shorter (or longer) than the server-wide default, for a caller
 * that has something to say about the lifetime of its own read.
 *
 * `upstream.ts` leaves a caller-supplied signal alone rather than stapling a
 * second deadline on top — see its own note — so this is how a read opts out of
 * the default. It still gets that module's logging, because the length travels
 * with the signal.
 */
export function withDeadline(ms: number): AbortSignal {
  const signal = AbortSignal.timeout(ms);
  Object.defineProperty(signal, DEADLINE, { value: ms, enumerable: false });
  return signal;
}

/**
 * How long a signal was given, or null for one that came from anywhere else.
 *
 * For the log line alone. A signal built by a plain `AbortSignal.timeout`, or
 * an `AbortController` aborted for some reason that is not a timeout at all,
 * answers null and the message says so — a log line stating the wrong timeout
 * is worse than one stating none.
 */
export function deadlineOf(signal: AbortSignal): number | null {
  const ms = (signal as unknown as Record<symbol, unknown>)[DEADLINE];
  return typeof ms === 'number' ? ms : null;
}
