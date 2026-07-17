import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WatchPlayer } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'watchlist.json');

let cache: WatchPlayer[] | null = null;

async function load(): Promise<WatchPlayer[]> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    cache = JSON.parse(raw) as WatchPlayer[];
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

export async function addPlayer(player: WatchPlayer): Promise<WatchPlayer[]> {
  const list = await load();
  if (!list.some((p) => p.id === player.id)) {
    list.unshift(player);
    await persist(list);
  }
  return list;
}

export async function removePlayer(id: number): Promise<WatchPlayer[]> {
  const list = await load();
  const next = list.filter((p) => p.id !== id);
  await persist(next);
  return next;
}

/**
 * Reorder the watchlist to match the given id order. Ids not present are
 * ignored; any current players missing from `ids` are appended (preserving
 * their existing order) so a stale client can't accidentally drop players.
 */
export async function reorderPlayers(ids: number[]): Promise<WatchPlayer[]> {
  const list = await load();
  const byId = new Map(list.map((p) => [p.id, p]));
  const next: WatchPlayer[] = [];
  for (const id of ids) {
    const p = byId.get(id);
    if (p) {
      next.push(p);
      byId.delete(id);
    }
  }
  for (const p of list) if (byId.has(p.id)) next.push(p);
  await persist(next);
  return next;
}
