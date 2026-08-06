import type {
  SeasonArsenal,
  PlayerKind,
  PitcherSeasonStats,
  PlayerPercentiles,
  PlayerReport,
  SeasonPlayer,
  SeasonStats,
  WatchPlayer,
  XwobaSeries,
} from './types';

/** An API failure that still knows its HTTP status — the app needs to tell an
 *  expired token (401) apart from a genuine server error. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * The current Cognito ID token, and how to get a fresh one.
 *
 * Held here rather than passed through every call site because this module is
 * the single chokepoint for every request the app makes. Both are null when
 * auth isn't configured, which is what makes local dev work unchanged.
 */
let authToken: string | null = null;
let reauth: (() => Promise<string | null>) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function setReauthHandler(handler: (() => Promise<string | null>) | null): void {
  reauth = handler;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, res.status);
  }
  return res.json() as Promise<T>;
}

/**
 * Every request goes through here: same-origin relative URLs (CloudFront routes
 * /api/* to the backend, so there's no base URL and no CORS), plus the bearer
 * token. A 401 is retried once against a freshly-minted token, since an ID token
 * expiring mid-session is routine rather than exceptional.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const send = (token: string | null) =>
    fetch(path, {
      ...init,
      headers: {
        ...init?.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  const res = await send(authToken);
  if (res.status === 401 && reauth) {
    const fresh = await reauth();
    if (fresh) return json<T>(await send(fresh));
  }
  return json<T>(res);
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const api = {
  async players(): Promise<{ season: number; players: SeasonPlayer[] }> {
    return request('/api/players');
  },
  async watchlist(): Promise<WatchPlayer[]> {
    const r = await request<{ players: WatchPlayer[] }>('/api/watchlist');
    return r.players;
  },
  async addPlayer(p: WatchPlayer): Promise<WatchPlayer[]> {
    const r = await request<{ players: WatchPlayer[] }>('/api/watchlist', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(p),
    });
    return r.players;
  },
  // `kind` removes only that half of a two-way player, who is two entries.
  async removePlayer(id: number, kind: PlayerKind): Promise<WatchPlayer[]> {
    const r = await request<{ players: WatchPlayer[] }>(`/api/watchlist/${id}?kind=${kind}`, {
      method: 'DELETE',
    });
    return r.players;
  },
  // Player keys ("pitcher-592332"), usually just one kind's — the server splices
  // them back into the slots that kind already held.
  async reorderPlayers(keys: string[]): Promise<WatchPlayer[]> {
    const r = await request<{ players: WatchPlayer[] }>('/api/watchlist/order', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ keys }),
    });
    return r.players;
  },
  async report(
    start: string,
    end: string,
  ): Promise<{ start: string; end: string; players: PlayerReport[] }> {
    return request(`/api/report?start=${start}&end=${end}`);
  },
  async percentiles(
    playerId: number,
    kind: 'batter' | 'pitcher' = 'batter',
  ): Promise<PlayerPercentiles> {
    return request(`/api/percentiles/${playerId}?type=${kind}`);
  },
  async splits(
    playerId: number,
  ): Promise<{ vsLeft: SeasonStats | null; vsRight: SeasonStats | null }> {
    return request(`/api/players/${playerId}/splits`);
  },
  async pitcherSplits(
    playerId: number,
  ): Promise<{ vsLeft: PitcherSeasonStats | null; vsRight: PitcherSeasonStats | null }> {
    return request(`/api/players/${playerId}/splits?type=pitcher`);
  },
  // A pitcher's season pitch arsenal (details view's Arsenal tab).
  async arsenal(playerId: number): Promise<SeasonArsenal> {
    return request<SeasonArsenal>(`/api/players/${playerId}/arsenal`);
  },
  async xwoba(playerId: number, kind: 'batter' | 'pitcher' = 'batter'): Promise<XwobaSeries> {
    return request(`/api/players/${playerId}/xwoba?type=${kind}`);
  },
  async video(playId: string, gamePk: number): Promise<string> {
    const r = await request<{ url: string }>(`/api/video/${playId}?gamePk=${gamePk}`);
    return r.url;
  },
};
