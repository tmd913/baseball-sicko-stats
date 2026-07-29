import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playerKey } from './types.js';
import type { PlayerKind, WatchPlayer } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'watchlist.json');

let cache: WatchPlayer[] | null = null;

async function load(): Promise<WatchPlayer[]> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw) as WatchPlayer[];
    // Migrate pre-pitcher entries (saved before `kind` existed) to batters.
    cache = parsed.map((p) => ({ ...p, kind: p.kind ?? 'batter' }));
  } catch {
    cache = [];
  }
  return cache;
}

async function persist(list: WatchPlayer[]): Promise<void> {
  cache = list;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(list, null, 2), 'utf8');
}

export async function getWatchlist(): Promise<WatchPlayer[]> {
  return load();
}

/** Adds unless the same player is already watched *as that kind* — a two-way
 * player is two separate entries, one per kind. */
export async function addPlayer(player: WatchPlayer): Promise<WatchPlayer[]> {
  const list = await load();
  const key = playerKey(player);
  if (!list.some((p) => playerKey(p) === key)) {
    list.unshift(player);
    await persist(list);
  }
  return list;
}

/** Removes one entry. Without `kind`, removes every entry for the id — which is
 * what a client that predates two-way support means by "remove this player". */
export async function removePlayer(id: number, kind?: PlayerKind): Promise<WatchPlayer[]> {
  const list = await load();
  const next = list.filter((p) => p.id !== id || (kind !== undefined && p.kind !== kind));
  await persist(next);
  return next;
}

/**
 * Reorder the watchlist to match the given key order ("pitcher-592332", ...).
 * Keys not present are ignored.
 *
 * The submitted keys usually cover only one kind, since the reorder screen is
 * per-kind — so the new order is spliced back into the slots that kind already
 * occupied, leaving every other entry exactly where it was. Any player of a
 * submitted kind that's missing from `keys` keeps its place too, so a stale
 * client can't accidentally drop or bury players.
 */
export async function reorderPlayers(keys: string[]): Promise<WatchPlayer[]> {
  const list = await load();
  const byKey = new Map(list.map((p) => [playerKey(p), p]));
  const moving = keys.map((k) => byKey.get(k)).filter((p): p is WatchPlayer => p !== undefined);
  if (moving.length === 0) return list;

  // Only the kinds actually represented in the submitted order are touched.
  const kinds = new Set(moving.map((p) => p.kind));
  const movingKeys = new Set(moving.map(playerKey));
  // Players of those kinds that the client didn't mention, in their current
  // order — they refill the leftover slots after the ones that did move.
  const leftover = list.filter((p) => kinds.has(p.kind) && !movingKeys.has(playerKey(p)));
  const queue = [...moving, ...leftover];

  let i = 0;
  const next = list.map((p) => (kinds.has(p.kind) ? queue[i++] : p));
  await persist(next);
  return next;
}
