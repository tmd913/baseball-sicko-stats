import type { PlayerReport, RosterEntry, WatchPlayer } from './types';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  async roster(date: string): Promise<{ date: string; players: RosterEntry[] }> {
    return json(await fetch(`/api/roster?date=${date}`));
  },
  async watchlist(): Promise<WatchPlayer[]> {
    const r = await json<{ players: WatchPlayer[] }>(await fetch('/api/watchlist'));
    return r.players;
  },
  async addPlayer(p: WatchPlayer): Promise<WatchPlayer[]> {
    const r = await json<{ players: WatchPlayer[] }>(
      await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      }),
    );
    return r.players;
  },
  async removePlayer(id: number): Promise<WatchPlayer[]> {
    const r = await json<{ players: WatchPlayer[] }>(
      await fetch(`/api/watchlist/${id}`, { method: 'DELETE' }),
    );
    return r.players;
  },
  async report(date: string): Promise<{ date: string; players: PlayerReport[] }> {
    return json(await fetch(`/api/report?date=${date}`));
  },
  async video(playId: string): Promise<string> {
    const r = await json<{ url: string }>(await fetch(`/api/video/${playId}`));
    return r.url;
  },
};
