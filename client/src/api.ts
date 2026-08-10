import type {
  BatterGameLog,
  EspnOwnership,
  EspnRoster,
  EspnStatus,
  PitcherGameLog,
  SeasonArsenal,
  PlayerKind,
  PitcherSeasonStats,
  PlayerPercentiles,
  PlayerReport,
  ResearchRow,
  RosterSource,
  SeasonPlayer,
  SeasonStats,
  UserPrefs,
  WatchPlayer,
  XwobaSeries,
  ResearchWindow,
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
  /** `source: 'fantasy'` reports on the user's ESPN roster instead of their
   *  saved watchlist. Asked for explicitly rather than left to the server's
   *  view of the saved preference, so the report and the view rendering it can
   *  never disagree about which set of players it describes. */
  async report(
    start: string,
    end: string,
    source: RosterSource = 'watchlist',
  ): Promise<{
    start: string;
    end: string;
    players: PlayerReport[];
    source?: RosterSource;
    teamName?: string | null;
  }> {
    const src = source === 'fantasy' ? '&source=fantasy' : '';
    return request(`/api/report?start=${start}&end=${end}${src}`);
  },
  // What this user has customised, saved server-side against their id. One
  // request on boot; the research board's columns are the only entry so far.
  async prefs(): Promise<UserPrefs> {
    return request('/api/prefs');
  },
  // `keys: null` means "back to the defaults", stored as no entry at all — so
  // a reset follows the defaults as they change rather than pinning today's.
  async saveResearchColumns(kind: PlayerKind, keys: string[] | null): Promise<UserPrefs> {
    return request('/api/prefs/research-columns', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ kind, keys }),
    });
  },
  async saveHideInjured(hide: boolean): Promise<UserPrefs> {
    return request('/api/prefs/hide-injured', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ hide }),
    });
  },
  async saveRosterSource(source: RosterSource): Promise<UserPrefs> {
    return request('/api/prefs/roster-source', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ source }),
    });
  },
  async saveMuteAudio(mute: boolean): Promise<UserPrefs> {
    return request('/api/prefs/mute-audio', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ mute }),
    });
  },
  // ---- ESPN fantasy league ----
  // The credential (`espnS2`, an ESPN session cookie) travels one way: in
  // through `saveEspn` and never back out, so nothing in this app's memory or
  // in a devtools response pane holds it.
  async espn(): Promise<EspnStatus> {
    return request('/api/espn');
  },
  /** `swid`/`espnS2` are omitted for a public league, which ESPN serves to
   *  anyone; `teamId` is whatever the pasted league URL carried, used only when
   *  there is no SWID to identify the user's own team with. */
  async saveEspn(
    leagueId: number,
    swid: string,
    espnS2: string,
    teamId: number | null = null,
  ): Promise<EspnStatus> {
    return request('/api/espn', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ leagueId, swid, espnS2, teamId }),
    });
  },
  async disconnectEspn(): Promise<EspnStatus> {
    return request('/api/espn', { method: 'DELETE' });
  },
  /** Which team in the league is the user's. Derived from the SWID at connect
   *  time where that identifies one; settable because a public league read
   *  anonymously has no owner to match. */
  async setEspnTeam(teamId: number): Promise<EspnStatus> {
    return request('/api/espn/team', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ teamId }),
    });
  },
  /** The user's own roster, slot by slot. */
  async espnRoster(): Promise<EspnRoster> {
    return request('/api/espn/roster');
  },
  /** `refresh` skips the server's ten-minute cache — for the user who has just
   *  made a move and wants the board to agree with ESPN. */
  async espnOwnership(refresh = false): Promise<EspnOwnership> {
    return request(`/api/espn/ownership${refresh ? '?refresh=1' : ''}`);
  },

  // Every player in the league on one board, season to date — the research
  // table. Watchlist-independent and season-wide, so it takes no date range.
  async research(
    kind: PlayerKind,
    window: ResearchWindow = 'season',
  ): Promise<{
    season: number;
    kind: PlayerKind;
    window: ResearchWindow;
    rows: ResearchRow[];
  }> {
    const w = window === 'season' ? '' : `&window=${window}`;
    return request(`/api/research?type=${kind}${w}`);
  },
  async percentiles(
    playerId: number,
    kind: 'batter' | 'pitcher' = 'batter',
  ): Promise<PlayerPercentiles> {
    return request(`/api/percentiles/${playerId}?type=${kind}`);
  },
  // The season line plus the platoon splits — the details view's Season tab.
  async splits(
    playerId: number,
  ): Promise<{
    season: SeasonStats | null;
    vsLeft: SeasonStats | null;
    vsRight: SeasonStats | null;
  }> {
    return request(`/api/players/${playerId}/splits`);
  },
  async pitcherSplits(
    playerId: number,
  ): Promise<{
    season: PitcherSeasonStats | null;
    vsLeft: PitcherSeasonStats | null;
    vsRight: PitcherSeasonStats | null;
  }> {
    return request(`/api/players/${playerId}/splits?type=pitcher`);
  },
  // Every game of the player's season, newest first — the Game Log tab.
  async gameLog(playerId: number): Promise<{ kind: 'batter'; games: BatterGameLog[] }> {
    return request(`/api/players/${playerId}/gamelog`);
  },
  async pitcherGameLog(
    playerId: number,
  ): Promise<{ kind: 'pitcher'; games: PitcherGameLog[] }> {
    return request(`/api/players/${playerId}/gamelog?type=pitcher`);
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
