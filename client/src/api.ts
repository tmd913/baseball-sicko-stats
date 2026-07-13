import type { PlayerPercentiles, PlayerReport, SeasonPlayer, WatchPlayer } from './types';

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
  async players(): Promise<{ season: number; players: SeasonPlayer[] }> {
    return json(await fetch('/api/players'));
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
  async reorderPlayers(ids: number[]): Promise<WatchPlayer[]> {
    const r = await json<{ players: WatchPlayer[] }>(
      await fetch('/api/watchlist/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }),
    );
    return r.players;
  },
  async report(
    start: string,
    end: string,
  ): Promise<{ start: string; end: string; players: PlayerReport[] }> {
    return json(await fetch(`/api/report?start=${start}&end=${end}`));
  },
  async percentiles(playerId: number): Promise<PlayerPercentiles> {
    return json(await fetch(`/api/percentiles/${playerId}`));
  },
  async video(playId: string, gamePk: number): Promise<string> {
    const r = await json<{ url: string }>(
      await fetch(`/api/video/${playId}?gamePk=${gamePk}`),
    );
    return r.url;
  },
};
