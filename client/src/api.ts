import type {
  SeasonArsenalPitch,
  PlayerKind,
  PitcherSeasonStats,
  PlayerPercentiles,
  PlayerReport,
  SeasonPlayer,
  SeasonStats,
  WatchPlayer,
  XwobaSeries,
} from './types';

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
  // `kind` removes only that half of a two-way player, who is two entries.
  async removePlayer(id: number, kind: PlayerKind): Promise<WatchPlayer[]> {
    const r = await json<{ players: WatchPlayer[] }>(
      await fetch(`/api/watchlist/${id}?kind=${kind}`, { method: 'DELETE' }),
    );
    return r.players;
  },
  // Player keys ("pitcher-592332"), usually just one kind's — the server splices
  // them back into the slots that kind already held.
  async reorderPlayers(keys: string[]): Promise<WatchPlayer[]> {
    const r = await json<{ players: WatchPlayer[] }>(
      await fetch('/api/watchlist/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys }),
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
  async percentiles(
    playerId: number,
    kind: 'batter' | 'pitcher' = 'batter',
  ): Promise<PlayerPercentiles> {
    return json(await fetch(`/api/percentiles/${playerId}?type=${kind}`));
  },
  async splits(
    playerId: number,
  ): Promise<{ vsLeft: SeasonStats | null; vsRight: SeasonStats | null }> {
    return json(await fetch(`/api/players/${playerId}/splits`));
  },
  async pitcherSplits(
    playerId: number,
  ): Promise<{ vsLeft: PitcherSeasonStats | null; vsRight: PitcherSeasonStats | null }> {
    return json(await fetch(`/api/players/${playerId}/splits?type=pitcher`));
  },
  // A pitcher's season pitch arsenal (details view's Arsenal tab).
  async arsenal(playerId: number): Promise<SeasonArsenalPitch[]> {
    const r = await json<{ pitches: SeasonArsenalPitch[] }>(
      await fetch(`/api/players/${playerId}/arsenal`),
    );
    return r.pitches;
  },
  async xwoba(playerId: number, kind: 'batter' | 'pitcher' = 'batter'): Promise<XwobaSeries> {
    return json(await fetch(`/api/players/${playerId}/xwoba?type=${kind}`));
  },
  async video(playId: string, gamePk: number): Promise<string> {
    const r = await json<{ url: string }>(
      await fetch(`/api/video/${playId}?gamePk=${gamePk}`),
    );
    return r.url;
  },
};
