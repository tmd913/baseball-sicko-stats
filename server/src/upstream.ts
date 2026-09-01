/**
 * **No upstream read may outlive the request that made it.**
 *
 * This module has no exports and is imported for its one side effect: it wraps
 * the global `fetch` so that every request this server makes to MLB, Savant,
 * ESPN, RotoWire or CBS carries a deadline.
 *
 * ## What it is for, measured
 *
 * Every route in this server is written so that a failing upstream costs its
 * own column and never the request — a dead Savant leaves the MLB half
 * standing, a dead RotoWire leaves the transactions. That rule is about an
 * upstream that **answers badly**. An upstream that does not answer at all was
 * not covered by it: `fetch` has no default timeout, so a hung connection is a
 * `try` that never reaches its `catch`, and the request rides all the way to
 * the Lambda's own limit.
 *
 * It is not hypothetical. Over the seven days to 2026-09-01 the gateway logged
 * **four 500s and every one of them was the same thing**:
 *
 * ```
 * 2026-09-01 03:59:15  /api/espn/ownership     500  29027ms
 * 2026-09-01 03:59:15  /api/report             500  29028ms
 * 2026-09-01 03:59:15  /api/espn/roster        500  29018ms
 * 2026-08-31 21:32:14  /api/espn/transactions  500  29022ms
 * ```
 *
 * — `Task timed out after 29.00 seconds`, three of them in the same second on
 * three separate invocations, which is the shape of one upstream going quiet
 * under a burst rather than of anything this code computes. Against that, the
 * *ordinary* cold read is nowhere near: over the same window the slowest
 * cold-container route is `/api/report` at a **7.3s** maximum, and the next is
 * `/api/news/recent` at 6.6.
 *
 * What a reader saw was a page that took half a minute to fail, showed a 500,
 * and then loaded on the retry — which is the worst of the three possible
 * outcomes, and the one this turns into the second-best: a fast, honest failure
 * that the route's own `catch` reports as the missing column it is.
 *
 * ## The number
 *
 * **15 seconds.** It has to sit between the slowest thing this server
 * legitimately waits for and the 29 the platform allows, and both ends are
 * measured rather than guessed: the slowest single upstream read recorded here
 * is Savant's per-player season CSV at **4.4s** (a starter's 2,077 rows / 1.4MB
 * — see the note this repo keeps on that export), and the slowest *route* cold
 * is 7.3. Fifteen is twice the second and three times the first, so nothing
 * that works today is cut off; and a route that fans out sequentially can still
 * take two of them and answer inside the platform's limit.
 *
 * ## Two things it deliberately does not do
 *
 * **It does not touch a caller that brought its own `signal`.** A caller with a
 * signal has said something about the lifetime of its request, and a second
 * deadline stapled on top would be this module overruling it. Nothing in
 * `server/src` passes one today; the guard is for the one that will.
 *
 * **It does not retry.** A timeout here is reported to the route that made it,
 * and every route in this server already knows what to do with a failed
 * upstream. A retry inside `fetch` would be a second 15 seconds spent inside a
 * `try` that was written to expect one.
 *
 * ## Why the global rather than a helper
 *
 * There are about forty `fetch` calls across a dozen modules, and the ones that
 * matter are the ones nobody thought about. A `fetchWithTimeout` helper covers
 * the calls somebody remembered to change; wrapping the global covers the
 * module added next year by somebody who has not read this file. It is one
 * assignment, it is reversible, and it is the only version of this rule that is
 * true of the whole server rather than of most of it.
 */

const UPSTREAM_TIMEOUT_MS = 15_000;

const real = globalThis.fetch;

/** What was being read, for the log line — a `Request`, a `URL` or a string. */
function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

globalThis.fetch = function timedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (init?.signal) return real(input, init);
  const signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  return real(input, { ...init, signal }).catch((err: unknown) => {
    // `AbortSignal.timeout` rejects with a `TimeoutError`; the `aborted` test
    // beside it covers a runtime that reports the abort some other way, since
    // the whole point of this file is that the failure must be legible.
    if ((err as { name?: string })?.name === 'TimeoutError' || signal.aborted) {
      const where = urlOf(input);
      console.error(`upstream timed out after ${UPSTREAM_TIMEOUT_MS}ms: ${where}`);
      // A plain `Error` rather than the `TimeoutError`, because what every
      // caller does with this is put its message in a log line or on the wire,
      // and `The operation was aborted due to timeout` says nothing about who
      // did not answer.
      throw new Error(`Upstream did not answer within ${UPSTREAM_TIMEOUT_MS / 1000}s: ${where}`);
    }
    throw err;
  });
};
