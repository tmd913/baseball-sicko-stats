/**
 * Run `items` through `fn` with at most `n` in flight, preserving input order
 * in the result.
 *
 * The report's fan-out is nested — a date range spawns a `getDay` per date, and
 * each `getDay` spawns a fetch per game — so an unbounded `Promise.all` over a
 * 62-day range opens on the order of a thousand sockets at once against MLB's
 * unauthenticated APIs. Capping it also bounds peak memory, which matters more:
 * without a cap every day in the range is fully parsed and resident at the same
 * time, and a day's parsed model is several MB.
 *
 * Rejections propagate like `Promise.all`: the first failure rejects, and
 * queued work stops being started.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  n: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(n, items.length));
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;

  async function worker(): Promise<void> {
    while (!failed) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}
