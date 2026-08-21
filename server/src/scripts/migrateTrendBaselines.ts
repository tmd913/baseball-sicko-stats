/**
 * **Bring the v1 roster-% baselines forward under the v3 key.**
 *
 * The `-v2` bump (see `espn.ts::snapshotKey`) orphaned every stored baseline at
 * once, which cost the board and the player page all five trend columns for up
 * to a month. This restores the history the app already holds, with the one
 * thing about a v1 blob that is genuinely wrong withheld rather than copied:
 * the MLB ids two ESPN rows both claimed, whose stored percentage may be the
 * other man's.
 *
 * **Withheld as an explicit `null`, never by deletion.** `diffAgainst` reads a
 * player *missing* from a baseline as having risen from nothing — deliberately,
 * so a call-up shows his real percentage instead of a blank cell — so deleting
 * the contested ids would have re-created the fabricated ▲64.2 by another
 * route. A `null` is the one value that means "nothing here knows".
 *
 * The contested set is read off the live pool through `getPlayerPool`, not
 * typed out here: it is the same set `claimant` arbitrates, and a hardcoded
 * list would be one that agreed with the code on the day it was written.
 *
 *   npm run migrate:trend --workspace server            # dry run, prints the plan
 *   npm run migrate:trend --workspace server -- --write # writes the v3 blobs
 *
 * Against prod, set `CACHE_BUCKET` so `storage.ts` reaches S3 instead of
 * `server/data/cache`. Only ever writes new keys — the v1 and v2 blobs are left
 * untouched, so undoing this is deleting the v3 ones.
 */
import { getPlayerPool, TREND_DRIFT, TREND_WINDOWS } from '../espn.js';
import { readBlob, writeBlob } from '../storage.js';
import { baseballToday } from '../etDate.js';

/** How far back to look for v1 blobs. The 30D window's widest baseline is 35
 *  days, so nothing older than that could ever be read even if it existed. */
const LOOK_BACK = 40;

const v1Key = (date: string) => `espn-ownership-${date}.json`;
const v2Key = (date: string) => `espn-ownership-${date}-v2.json`;
const v3Key = (date: string) => `espn-ownership-${date}-v3.json`;

const daysAgo = (date: string, n: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - n * 86_400_000).toISOString().slice(0, 10);
};

async function readJson(key: string): Promise<Record<string, number | null> | null> {
  const raw = await readBlob(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as Record<string, number | null>;
  } catch {
    return null;
  }
}

async function main() {
  const write = process.argv.includes('--write');
  const today = baseballToday();
  console.log(`Baseball day: ${today}`);
  console.log(write ? 'MODE: writing' : 'MODE: dry run (pass --write to commit)');

  const pool = await getPlayerPool();
  const contested = new Set(pool.contested.map(String));
  console.log(`\nContested MLB ids (two ESPN rows claim one player): ${contested.size}`);
  console.log([...contested].join(', '));

  // Today's own snapshot comes across from v2 unchanged: it was written by the
  // corrected code, so there is nothing in it to withhold. Unless one is
  // already there — a server running the v3 code will have written today's on
  // its first ownership read — in which case it is left alone, on
  // `snapshotRosterPct`'s own rule that a baseline is never rewritten later in
  // the day.
  const plan: { date: string; from: 'v1' | 'v2'; keys: number; withheld: string[] }[] = [];
  const migrated = new Map<string, Record<string, number | null>>();

  const todayV3 = await readJson(v3Key(today));
  if (todayV3) {
    console.log(`\n  ${today}: v3 already written by a running server, left alone`);
    migrated.set(today, todayV3);
  } else {
    const todayV2 = await readJson(v2Key(today));
    if (todayV2) {
      plan.push({ date: today, from: 'v2', keys: Object.keys(todayV2).length, withheld: [] });
      migrated.set(today, todayV2);
    }
  }

  for (let n = 1; n <= LOOK_BACK; n++) {
    const date = daysAgo(today, n);
    if (await readBlob(v3Key(date))) {
      console.log(`  ${date}: v3 already present, skipping`);
      continue;
    }
    const v1 = await readJson(v1Key(date));
    if (!v1) continue;
    const out: Record<string, number | null> = {};
    const withheld: string[] = [];
    for (const [id, pct] of Object.entries(v1)) {
      if (contested.has(id)) {
        out[id] = null;
        withheld.push(id);
      } else {
        out[id] = pct;
      }
    }
    migrated.set(date, out);
    plan.push({ date, from: 'v1', keys: Object.keys(out).length, withheld });
  }

  plan.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`\nBlobs to write: ${plan.filter((p) => p.from === 'v1').length} migrated + ${
    plan.filter((p) => p.from === 'v2').length
  } copied`);
  for (const p of plan) {
    console.log(`  ${p.date}  from ${p.from}  ${p.keys} ids  ${p.withheld.length} withheld`);
  }

  // ---- What the app would serve, which is the point of the dry run ----------
  const current = pool.pct;
  console.log('\nWindows this would restore, and their largest movers:');
  for (const w of TREND_WINDOWS) {
    const order: number[] = [w];
    for (let i = 1; i <= TREND_DRIFT[w]; i++) {
      order.push(w + i);
      if (w - i >= 1) order.push(w - i);
    }
    let used: { days: number; base: Record<string, number | null> } | null = null;
    for (const days of order) {
      const base = migrated.get(daysAgo(today, days));
      if (base) {
        used = { days, base };
        break;
      }
    }
    if (!used) {
      console.log(`  ${w}D: no baseline in band (${order.join(', ')} days back) — column stays absent`);
      continue;
    }
    const moves: { id: string; change: number }[] = [];
    let withheldCount = 0;
    for (const [id, pct] of Object.entries(current)) {
      if (id in used.base && used.base[id] === null) {
        withheldCount++;
        continue;
      }
      const was = used.base[id];
      const change = Math.round((pct - (typeof was === 'number' ? was : 0)) * 10) / 10;
      if (change !== 0) moves.push({ id, change });
    }
    moves.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    console.log(
      `  ${w}D: measured ${used.days}d, ${moves.length} movers, ${withheldCount} withheld`,
    );
    for (const m of moves.slice(0, 12)) {
      const name = Object.values(pool.byEspnId).find((r) => r.mlbId === Number(m.id))?.name ?? '?';
      console.log(
        `      ${m.change > 0 ? '+' : ''}${m.change.toFixed(1).padStart(6)}  ${m.id.padEnd(7)} ${name}`,
      );
    }
  }

  if (!write) {
    console.log('\nDry run — nothing written.');
    return;
  }
  for (const p of plan) {
    const body = migrated.get(p.date);
    if (!body) continue;
    await writeBlob(v3Key(p.date), JSON.stringify(body));
    console.log(`  wrote ${v3Key(p.date)}`);
  }
  console.log('\nDone.');
}

main().catch((err: Error) => {
  console.error(err);
  process.exit(1);
});
