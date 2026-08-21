import type {
  BatterGameLog,
  EspnOwnership,
  MatchupWindow,
  EspnRoster,
  EspnRankings,
  EspnRankSpan,
  EspnMatchupSeries,
  EspnProjection,
  EspnScoreboard,
  EspnTransactions,
  EspnStatus,
  PitcherGameLog,
  NextGameInfo,
  ProjectedStarts,
  PlayerNews,
  SeasonArsenal,
  PlayerKind,
  PitcherSeasonStats,
  PlayerPercentiles,
  PlayerReport,
  PlayerWindows,
  PlayerStatus,
  RecentNews,
  ResearchIncludeKey,
  ResearchRow,
  RosterSource,
  ScheduleWindow,
  SeasonPlayer,
  SplitCut,
  SeasonStats,
  UserPrefs,
  WatchPlayer,
  XwobaSeries,
  ResearchWindow,
  RosterProjection,
  TeamHitting,
  TeamHittingWindow,
  EspnRosterPlayer,
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
  /**
   * Every club's next four weeks, with whoever each side has announced — what
   * the Schedule view draws on both wide tables.
   *
   * No parameters: the server names the window off its own `baseballToday()`
   * and the client slices it to the span on screen, so one answer serves every
   * user, every row and every span. Fetched once per session and kept, the way
   * the research blob is.
   */
  async schedule(): Promise<ScheduleWindow> {
    return request('/api/schedule');
  },
  /** The user's **roster** — the saved list the three roster views report on.
   *  The path is still `/api/watchlist` and stays that way: renaming a route
   *  breaks every tab open at the moment of a deploy. The board's watchlist is
   *  `watchlist()` below, on `/api/watch`. */
  async roster(): Promise<WatchPlayer[]> {
    const r = await request<{ players: WatchPlayer[] }>('/api/watchlist');
    return r.players;
  },
  /** The **watchlist** — `${kind}-${id}` keys followed on the research board.
   *  Keys rather than entries: membership is the whole of it, and the board
   *  already holds every row it could mark. */
  async watchlist(): Promise<string[]> {
    const r = await request<{ keys: string[] }>('/api/watch');
    return r.keys;
  },
  async setWatchlisted(key: string, on: boolean): Promise<string[]> {
    const r = await request<{ keys: string[] }>('/api/watch', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ key, on }),
    });
    return r.keys;
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
  /** `source: 'fantasy'` reports on the user's ESPN team instead of their
   *  saved roster. Asked for explicitly rather than left to the server's
   *  view of the saved preference, so the report and the view rendering it can
   *  never disagree about which set of players it describes. */
  /** `refresh` is only meaningful alongside `source=fantasy`: it skips the
   *  server's ten-minute read of the ESPN league, so the players this report is
   *  about follow a lineup change made a moment ago. */
  /**
   * `teamId` names **whose** fantasy team, and absent means the reader's own —
   * which is what every caller but one wants. The exception is the League
   * page's Matchup tab, whose two team pages are these same roster views read
   * for the two managers in one matchup. It rides only with `source=fantasy`,
   * there being no other roster a team id could name.
   */
  async report(
    start: string,
    end: string,
    source: RosterSource = 'saved',
    refresh = false,
    teamId?: number | null,
  ): Promise<{
    start: string;
    end: string;
    players: PlayerReport[];
    source?: RosterSource;
    teamName?: string | null;
    /** Which of this team's players were in its lineup on each day of the
     *  range, keyed by date — what the `Starters` filter reads on a matchup's
     *  team pages. Present only with `source=fantasy`, and absent where the
     *  per-day read failed, which is the old behavior: one lineup applied to
     *  the whole range. */
    lineups?: Record<string, number[]> | null;
  }> {
    const src = source === 'fantasy' ? '&source=fantasy' : '';
    const fresh = refresh && source === 'fantasy' ? '&refresh=1' : '';
    const team = source === 'fantasy' && teamId != null ? `&teamId=${teamId}` : '';
    return request(`/api/report?start=${start}&end=${end}${src}${fresh}${team}`);
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
  // The player page's Stats tab keeps its own set — same body, its own entry.
  async saveStatsColumns(kind: PlayerKind, keys: string[] | null): Promise<UserPrefs> {
    return request('/api/prefs/stats-columns', {
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
  /** The board's population settings, both at once: which of the three
   *  ownership sets it includes (null for the default) and whether the
   *  watchlist is unioned onto them. One route, because they are one control
   *  set. */
  async saveResearchInclude(
    include: ResearchIncludeKey[] | null,
    watchlist: boolean,
  ): Promise<UserPrefs> {
    return request('/api/prefs/research-include', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ include, watchlist }),
    });
  },
  /** Remember a player picked out of the header search. The server owns the
   *  push-to-front and the cap of five, so this posts the one key rather than a
   *  list — a whole list from a tab that has been open an hour would overwrite
   *  whatever another tab has picked since. */
  async saveRecentPlayer(key: string): Promise<UserPrefs> {
    return request('/api/prefs/recent-players', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ key }),
    });
  },
  async saveMuteAudio(mute: boolean): Promise<UserPrefs> {
    return request('/api/prefs/mute-audio', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ mute }),
    });
  },
  /** The color scheme. `null` is "back to the default", which the server
   *  stores as the absence of the entry — the same null-clears rule
   *  `saveResearchColumns` follows, and the reason this is a route of its own
   *  rather than a boolean. */
  async saveTheme(theme: string | null): Promise<UserPrefs> {
    return request('/api/prefs/theme', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ theme }),
    });
  },
  /** Show a percentile rank under every value on the research board and the
   *  player page's Stats tab. A boolean like the two above, and a route of its
   *  own for the reason each of those is. */
  async saveStatRanks(on: boolean): Promise<UserPrefs> {
    return request('/api/prefs/stat-ranks', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ on }),
    });
  },
  /** Mark the League page's Transactions feed read up to `ts` — the date of
   *  the newest move on screen. What undraws the red dot on that tab, and the
   *  only thing that does. The league travels with the date because a marker
   *  only means anything against the feed it was read in; the server keeps
   *  whichever is newer, so this is safe to fire from two tabs. */
  async saveSeenTransactions(leagueId: number, ts: number): Promise<UserPrefs> {
    return request('/api/prefs/seen-transactions', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ leagueId, ts }),
    });
  },
  /** Mark the Feed view's stream of plays read up to `ts` — the timestamp of the
   *  newest play on screen. What undraws the red `N new plays` button. No league
   *  travels with it, a play being scoped to nothing the reader switches
   *  between; the server keeps whichever is newer, so this is safe to fire from
   *  two tabs and safe against a range excursion into last week. */
  async saveSeenPlays(ts: number): Promise<UserPrefs> {
    return request('/api/prefs/seen-plays', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ ts }),
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
  /** Turn the invite link on or off for the league this user is on. Any member
   *  may — they are all equally on the connection. */
  async shareEspn(enabled: boolean): Promise<EspnStatus> {
    return request('/api/espn/share', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ enabled }),
    });
  },
  /** Join a league from an invite code — no league id, no cookies. */
  async joinEspn(code: string): Promise<EspnStatus> {
    return request('/api/espn/join', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ code }),
    });
  },
  /** The user's own roster, slot by slot. `refresh` as on `espnOwnership` —
   *  the two read the same upstream through the same cache.
   *
   *  `end` is the day to read the **roster** for: a manager sets tomorrow's
   *  lineup today, and ESPN files it under tomorrow, so a view reporting on
   *  tomorrow has to ask for tomorrow or it draws today's slots. The server
   *  reads anything at or before today as today.
   *
   *  `start` asks for `lineups` as well — one lineup per day of the range, each
   *  at that day's own scoring period, which is what lets the roster views
   *  credit a player only for the days he was actually in the lineup — and for
   *  `endRoster`, the team as it stood on the **last day** of that range, which
   *  is what a slot chip is a fact about. That one comes back only when the day
   *  differs from `players`, i.e. when the range ends in the past; see
   *  `EspnRoster`. Sent as `end=` with the older `date=` dropped: the server
   *  reads both, so a tab open across a deploy keeps working either way. */
  async espnRoster(
    refresh = false,
    start?: string | null,
    end?: string | null,
  ): Promise<EspnRoster> {
    const q = new URLSearchParams();
    if (refresh) q.set('refresh', '1');
    if (start) q.set('start', start);
    if (end) q.set('end', end);
    const qs = q.toString();
    return request(`/api/espn/roster${qs ? `?${qs}` : ''}`);
  },
  /** `refresh` skips the server's ten-minute cache — for the user who has just
   *  made a move and wants the board to agree with ESPN. */
  async espnOwnership(refresh = false): Promise<EspnOwnership> {
    return request(`/api/espn/ownership${refresh ? '?refresh=1' : ''}`);
  },

  /** **Which days this matchup period covers, and which the next one covers.**
   *  Two dates each, and null for a league whose period arithmetic could not be
   *  read — which is what makes the Schedule view fall back to its two numeric
   *  spans rather than offering one it cannot fill.
   *
   *  Read once per session on a connected league, like the ownership map: the
   *  answer moves once a week, and the server holds the league it is derived
   *  from on its own minute. */
  async espnMatchupWindow(): Promise<MatchupWindow | null> {
    return request('/api/espn/matchup-window');
  },

  /** The league's scoreboard: one matchup period's matchups, plus every team's
   *  season totals in the league's own categories.
   *
   *  `period` names a matchup period — absent, the one being played. A period
   *  this league has no row for is answered with the current one rather than
   *  an empty board, so the arrows can never strand the reader. `refresh` is
   *  the same escape hatch `espnOwnership` carries and reaches only the live
   *  period; a settled week is a fact and reads back off its blob. */
  async espnScoreboard(period?: number | null, refresh = false): Promise<EspnScoreboard> {
    const q = new URLSearchParams();
    if (period != null) q.set('period', String(period));
    if (refresh) q.set('refresh', '1');
    const qs = q.toString();
    return request(`/api/espn/scoreboard${qs ? `?${qs}` : ''}`);
  },

  /** **One matchup period's categories, day by day** — the chart a scoreboard
   *  category opens.
   *
   *  A route of its own rather than a field on the scoreboard: it is a week of
   *  ESPN rosters summed a day at a time, so it is fetched on the first press
   *  rather than by everyone who opens the League page. `period` and `refresh`
   *  mean what they mean on the scoreboard beside it. */
  async espnMatchupSeries(period?: number | null, refresh = false): Promise<EspnMatchupSeries> {
    const q = new URLSearchParams();
    if (period != null) q.set('period', String(period));
    if (refresh) q.set('refresh', '1');
    const qs = q.toString();
    return request(`/api/espn/matchup-series${qs ? `?${qs}` : ''}`);
  },

  /** **Where a live matchup is heading** — each side's projected final total in
   *  every category, which is what the Scoreboard's `Projected` toggle swaps its
   *  figures for.
   *
   *  A route of its own for the same reason `matchup-series` is one: it joins
   *  four league-wide boards against every roster in the league, and folding it
   *  into the scoreboard would make everybody who opens the League page pay for
   *  a projection nobody may ask for. A **settled** period answers `ok: false`
   *  with a `note` rather than an error — nothing is wrong, there is simply
   *  nothing left to project. */
  async espnProjection(period?: number | null, refresh = false): Promise<EspnProjection> {
    const q = new URLSearchParams();
    if (period != null) q.set('period', String(period));
    if (refresh) q.set('refresh', '1');
    const qs = q.toString();
    return request(`/api/espn/projection${qs ? `?${qs}` : ''}`);
  },

  /**
   * **What the roster is expected to do over a span** — one projected line per
   * player, which is what the Roster view's `Projected` toggle draws.
   *
   * The same three parameters `report` takes, and the server resolves the
   * roster the same way, so the rows this describes are the rows that report
   * describes. Lazy on the toggle: nobody who never presses it pays for it.
   */
  async rosterProjection(
    start: string,
    end: string,
    source: 'watchlist' | 'fantasy',
    teamId?: number | null,
  ): Promise<RosterProjection> {
    const q = new URLSearchParams({ start, end });
    if (source === 'fantasy') q.set('source', 'fantasy');
    if (teamId != null) q.set('teamId', String(teamId));
    return request(`/api/projection/roster?${q.toString()}`);
  },

  /** The League page's Rankings tab: every team's figure in each of the
   *  league's categories and where it stands, over one span.
   *
   *  A span this league cannot be asked for — a half with no matchup periods
   *  in it — is answered with the season rather than an empty table, and the
   *  response says which spans it *can* serve so the tab strip is drawn from
   *  the league rather than from a list held here.
   *
   *  **`projected` swaps the figures for where the week is heading**, and the
   *  ranking arithmetic is done on the server over them — one definition of a
   *  competition rank, of a roto point and of the `OVR = BAT + PIT` identity,
   *  rather than a second one here. It reaches the `matchup` span of a live
   *  week alone; anywhere else it is ignored and the answer comes back with
   *  `projected: false`, which is what un-lights the toggle rather than
   *  claiming a lens that is not in force. */
  async espnRankings(
    span?: EspnRankSpan | null,
    refresh = false,
    projected = false,
    /** One matchup week off the league's calendar, in place of the five named
     *  spans — the tab's own bar. It wins over `span` on the server where it
     *  names a period the schedule carries. */
    period?: number | null,
  ): Promise<EspnRankings> {
    const q = new URLSearchParams();
    if (span && span !== 'week') q.set('span', span);
    if (refresh) q.set('refresh', '1');
    if (projected) q.set('projected', '1');
    if (period != null) q.set('period', String(period));
    const qs = q.toString();
    return request(`/api/espn/rankings${qs ? `?${qs}` : ''}`);
  },

  /** The League page's Transactions tab: who added, dropped and traded whom,
   *  most recent first. `refresh` as everywhere else — a move made on ESPN is
   *  exactly what it is for. */
  async espnTransactions(refresh = false): Promise<EspnTransactions> {
    return request(`/api/espn/transactions${refresh ? '?refresh=1' : ''}`);
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
  /** The same board read as thirty clubs — one row per MLB team over the same
   *  window, in the same row shape, so the board's own columns draw it. */
  async teamResearch(
    kind: PlayerKind,
    window: ResearchWindow = 'season',
  ): Promise<{
    season: number;
    kind: PlayerKind;
    window: ResearchWindow;
    rows: ResearchRow[];
  }> {
    const w = window === 'season' ? '' : `&window=${window}`;
    return request(`/api/research/teams?type=${kind}${w}`);
  },
  /**
   * Every player the league has something to say about today — his roster
   * status and where his club's game has him — keyed by MLB player id.
   *
   * One call for the whole league rather than a lookup per player: the
   * research board asks about several hundred rows at once, and the answer is
   * the same for every user, so it is built once server-side and shared. Only
   * the players with a status worth drawing are in it, so an id that is absent
   * means "active, and nothing posted yet".
   */
  async statuses(): Promise<Record<string, PlayerStatus>> {
    const { players } = await request<{ players: Record<string, PlayerStatus> }>('/api/statuses');
    return players;
  },
  /**
   * Who in the league has news today or yesterday, keyed by MLB player id — the
   * mark beside a player's name.
   *
   * One request for everybody, for the reason `statuses` above is: the mark is
   * drawn on the research board, which is six hundred rows of the whole league,
   * and the per-player `news` route below could never answer for it.
   *
   * Read **once on mount** rather than on every entry, which is where this
   * parts from `statuses`: a lineup posts a couple of hours before first pitch
   * and a man goes on the IL at noon, so that map is wrong by dinner — where
   * this one dates to a *day* on both of its upstreams, so re-asking inside one
   * page-load can only ever return what it already said. The server's thirty
   * minutes is where freshness is actually decided.
   *
   * A failure is swallowed: this decorates a name, and the table it sits on is
   * what the reader came for.
   */
  async recentNews(): Promise<Record<string, RecentNews>> {
    const { players } = await request<{ players: Record<string, RecentNews> }>('/api/news/recent');
    return players;
  },
  async percentiles(
    playerId: number,
    kind: 'batter' | 'pitcher' = 'batter',
  ): Promise<PlayerPercentiles> {
    return request(`/api/percentiles/${playerId}?type=${kind}`);
  },
  /**
   * One player's row on each of the research board's five windows — the player
   * page's **Stats** tab.
   *
   * It reads the board's own blobs rather than a per-player upstream of its
   * own, which is what makes the numbers here and the numbers on the board the
   * same numbers; see `getPlayerWindows` on the server for why that matters
   * more than the request it saves. In practice it is five cache hits: the ten
   * boards are pulled warm nightly.
   */
  async playerWindows(
    playerId: number,
    kind: PlayerKind,
    /** Which cut of the spans, or null for all of them. A cut is the same five
     *  rows off the same route — see `playerSplits.ts` for why it cannot be
     *  read off the board, and what a cut row can and cannot carry. */
    cut: SplitCut | null = null,
  ): Promise<PlayerWindows> {
    const q = cut ? `&cut=${cut}` : '';
    return request(`/api/players/${playerId}/windows?type=${kind}${q}`);
  },
  /** One team's nine hitting cuts over a window — the opponent table on a
   *  pitcher's game. The season is already on the report, so this is only ever
   *  called for the other four windows; it answers with all three venues, so
   *  changing that control costs nothing. */
  /** Both sides of a matchup, as rosters, on one day — the Matchup tab's roster
   *  view. One call rather than two, because the reader opens both at once and
   *  two round trips to draw one thing is two chances for half of it to land. */
  async espnRosters(
    teamIds: number[],
    date: string,
  ): Promise<{ date: string; rosters: Record<string, EspnRosterPlayer[] | null> }> {
    return request(`/api/espn/rosters?teams=${teamIds.join(',')}&date=${date}`);
  },
  async teamHitting(teamId: number, window: TeamHittingWindow): Promise<TeamHitting | null> {
    return request(`/api/teams/${teamId}/hitting?window=${window}`);
  },
  // The season line plus the platoon splits — the platoon card at the foot of
  // the details view's **Stats** tab. Still the only reader of that route.
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
  /**
   * One player's day — the same `PlayerReport` the report route returns, for
   * one man over one date. It backs the player page's **Overview** tab and the
   * popup a Game Log row opens, both of which draw the feed's own item
   * components and so need the feed's own report rather than a lighter shape.
   *
   * `date` omitted means the **server's** baseball today: the client mirrors
   * the 3am ET rule for its date presets, but a tab left open past the rollover
   * would ask for yesterday, and one definition of "now" beats two that agree
   * most of the time.
   */
  async playerDay(
    playerId: number,
    kind: PlayerKind,
    date?: string,
  ): Promise<{ date: string; player: PlayerReport }> {
    const q = `?type=${kind}${date ? `&date=${date}` : ''}`;
    return request(`/api/players/${playerId}/day${q}`);
  },
  /**
   * What he has coming, for a day that holds no game of his — the Overview
   * tab's middle section when there is nothing to draw for today.
   *
   * `start` asks for his next **announced start** rather than his club's next
   * game, and the caller decides it off `lib.ts::isRotationStarter`: a batter or
   * a reliever could be in any of his club's games, where a starter is in one in
   * five and the only useful answer is the one he is named for. The response
   * carries the flag back, so a starter with nothing announced can be told so
   * rather than shown somebody else's start.
   */
  async nextGame(playerId: number, start: boolean): Promise<NextGameInfo> {
    return request(`/api/players/${playerId}/next-game${start ? '?start=1' : ''}`);
  },
  /**
   * A pitcher's next several starts — announced where his club has named him,
   * projected from his own rotation slot past that. The Overview tab's
   * **Projected Starts** block.
   *
   * **No `kind`**, unlike his day, his log and his boards: a rotation slot is a
   * fact about a pitcher, so there is no batting half of the question. Which
   * players it is asked *about* is the caller's business and is
   * `lib.ts::isRotationStarter`, the app's one definition of who works out of
   * the rotation.
   */
  async projectedStarts(playerId: number): Promise<ProjectedStarts> {
    return request(`/api/players/${playerId}/projected-starts`);
  },
  /**
   * His latest news — the News tab, and the section that previews it on the
   * Overview. One read serves both, which is why it is hung on `PlayerDetails`
   * rather than fetched inside either surface: the same rule the game log
   * follows for its own preview, and the same guarantee — the two can never
   * show different items.
   *
   * No `kind`: news is a fact about a *person*, so a two-way player's bat and
   * his arm have one list between them, where his day, his log and his boards
   * are two of each.
   */
  async playerNews(playerId: number): Promise<PlayerNews> {
    return request(`/api/players/${playerId}/news`);
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
  /**
   * **Which plays in these games MLB cut a highlight for**, a game at a time —
   * what the feed's `Video` lens is filtered on for the day being played. One
   * request for a whole slate rather than one per game; see the route, and see
   * `LiveFeed`'s `hasFilm` for why only *today's* games are ever asked about.
   */
  async gameClips(gamePks: number[]): Promise<Record<number, string[]>> {
    const r = await request<{ games: Record<number, string[]> }>(
      `/api/video/clips?games=${gamePks.join(',')}`,
    );
    return r.games;
  },
};
