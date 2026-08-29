import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireUser, userId } from './auth.js';
import { addDays, baseballToday } from './etDate.js';
import { mapLimit } from './limit.js';
import {
  getClubStatuses,
  getPlayerDay,
  getPlayerStatuses,
  getReport,
  withEstimators,
} from './savant.js';
import type { HeldDays } from './savant.js';
import { getPercentiles } from './percentiles.js';
import { getCutPercentiles } from './percentileCuts.js';
import { getXwobaSeries } from './xwoba.js';
import { getBatterLog, getPitcherGameLog } from './gameLog.js';
import { getNextGame } from './nextGame.js';
import { getProjectedStarts } from './projectedStarts.js';
import { getPlayerNews } from './news.js';
import { getRecentNews } from './recentNews.js';
import { getMlbScoreboard } from './mlbScoreboard.js';
import { getMlbStandings } from './mlbStandings.js';
import { getSeasonArsenal, SEASON as ARSENAL_SEASON } from './pitcherArsenal.js';
import { getArmAngle } from './armAngle.js';
import { getPitcherXera } from './expectedStats.js';
import { getResearch, getPlayerWindows } from './research.js';
import { getTeamResearch, getTeamWindows } from './teamResearch.js';
import { getPlayerCutWindows } from './playerSplits.js';
import { getScheduleWindow } from './schedule.js';
import { getTeamHitting } from './teamHitting.js';
import { getParkFactors } from './parkFactors.js';
import { getGamePlays, getGameReport } from './game.js';
import { getTeamGames } from './teamGames.js';
import type { Arsenal } from './pitcherArsenal.js';
import { getLeaguePitchAverage, getLeaguePitchSpread } from './pitchLeague.js';
import {
  PLAYER_CUTS,
  RESEARCH_INCLUDE_KEYS,
  RESEARCH_WINDOWS,
  SPLIT_CUTS,
  TEAM_HITTING_WINDOWS,
} from './types.js';
import type {
  PlayerKind,
  ResearchControlsPref,
  ResearchIncludeKey,
  ResearchWindow,
  SeasonArsenalPitch,
  TeamHittingWindow,
  TeamSplitSide,
} from './types.js';
import {
  getGameClipPlayIds,
  getPitcherStats,
  getPlayerStats,
  getSeasonPlayers,
  getTeamList,
  searchPlayers,
  getPlayerRows,
  PLAYER_SEARCH_MIN,
  resolveVideoUrl,
} from './mlbStats.js';
import {
  addRosterPlayer,
  attachEspnLeague,
  getEspnCreds,
  getEspnLeague,
  getLeague,
  getPrefs,
  getRoster,
  getRosterForRange,
  joinLeague,
  leagueForInvite,
  getWatchlist,
  removeRosterPlayer,
  reorderRoster,
  setEspnLeague,
  setEspnTeam,
  setHideInjured,
  setMuteAudio,
  setTheme,
  setPercentileDensity,
  setResearchControls,
  setStatRanks,
  setRecentPlayer,
  setSeenTransactions,
  setSeenPlays,
  setLeagueSharing,
  setProjectedColumns,
  setResearchColumns,
  setStatsColumns,
  setResearchInclude,
  setRosterSource,
  setWatchlisted,
  addList,
  addSearch,
  deleteList,
  deleteSearch,
  getActiveListId,
  getLists,
  getSearches,
  renameList,
  resolveShare,
  setActiveList,
  setItemSharing,
  updateSearch,
  MAX_BOARD_BYTES,
  MAX_LISTS,
  MAX_LIST_KEYS,
  MAX_NAME_LEN,
  MAX_SEARCHES,
  upsertLeague,
} from './store.js';
import type { EspnLeague, LeagueRecord } from './store.js';
import { randomBytes } from 'node:crypto';
import {
  EspnAuthError,
  getLeagueInfo,
  getMatchupWindow,
  getOwnership,
  ownershipDay,
  getRankings,
  getRosterOn,
  getMatchupSeries,
  getScoreboard,
  getTransactions,
  lineupsFrom,
  getTeamRosters,
  normalizeS2,
  normalizeSwid,
  rosterToWatchlist,
  rostersToWatchlist,
} from './espn.js';
import type { EspnRosterPlayer } from './espn.js';
import {
  getBoardProjection,
  getGameProjection,
  getProjection,
  getRosterProjection,
} from './projection.js';
import type { WatchPlayer } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Required, not just an optimisation: a wide-range report for a full watchlist
// runs to several MB of JSON, and Lambda caps a response at 6 MB. Nothing
// downstream can compress on our behalf — API Gateway doesn't, and the cap
// applies before CloudFront ever sees the response — so it has to happen here.
app.use(compression());
app.use(express.json());

/** True when running as a Lambda rather than a long-lived local server. */
const IS_LAMBDA = process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;

const PORT = Number(process.env.PORT ?? 4000);

/** The day before today's baseball day (see etDate.ts), as YYYY-MM-DD. The
 *  client's presets resolve against the same rollover, so a default and a
 *  "Yesterday" click land on the same date. */
function previousDay(): string {
  return addDays(baseballToday(), -1);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolveDate(q: unknown): string {
  if (typeof q === 'string' && DATE_RE.test(q)) return q;
  return previousDay();
}

/** Max span for a single /api/report request, to bound how many days we fetch. */
const MAX_RANGE_DAYS = 62;

function dayCount(start: string, end: string): number {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000) + 1;
}

/** Resolve a start/end query pair, defaulting to previous day and swapping if reversed. */
function resolveDateRange(startQ: unknown, endQ: unknown): { start: string; end: string } {
  const start = resolveDate(startQ);
  const end = resolveDate(endQ);
  return start <= end ? { start, end } : { start: end, end: start };
}

function asyncRoute(
  fn: (req: express.Request, res: express.Response) => Promise<void>,
) {
  return (req: express.Request, res: express.Response) => {
    fn(req, res).catch((err: unknown) => {
      console.error(err);
      res
        .status(502)
        .json({ error: err instanceof Error ? err.message : 'Unknown error' });
    });
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// What the client needs to talk to Cognito. Served rather than baked into the
// bundle so one build works in any environment; public by necessity (it's all
// public config) and by definition (the client reads it before it can sign in).
app.get('/api/config', (_req, res) => {
  res.json({
    userPoolId: process.env.USER_POOL_ID ?? null,
    clientId: process.env.USER_POOL_CLIENT_ID ?? null,
    cognitoDomain: process.env.COGNITO_DOMAIN ?? null,
    region: process.env.AWS_REGION ?? null,
  });
});

// All players rostered for the current season (for search / adding players).
app.get(
  '/api/players',
  requireUser,
  asyncRoute(async (_req, res) => {
    const season = new Date().getFullYear();
    const players = await getSeasonPlayers(season);
    res.json({ season, players });
  }),
);

/**
 * **The other players a typed name finds** — every prospect and minor leaguer
 * MLB has an id for and the route above has never carried.
 *
 * `/api/players` is one list of 1,415 major leaguers, fetched at boot and
 * matched against with no request per keystroke; that is the right shape for
 * the population it covers and it cannot be the shape for this one. MLB lists
 * tens of thousands of people and offers no list of them — only a search — so
 * this route is a query rather than a table, and the client asks it only for
 * what it could not answer itself.
 *
 * **A query, so it is `?q=` and not a path segment**, and short queries are the
 * client's own business: `searchPlayers` answers `[]` below
 * `PLAYER_SEARCH_MIN` characters without asking MLB anything, and the length is
 * published on the payload so the field can hold its wait rather than guess at
 * the number.
 *
 * **It 502s through `asyncRoute` like everything else and the client swallows
 * it.** This is the "a failure costs its own column, never the request" rule
 * read from the client's side: the header search's answer is the season list it
 * already holds, and these rows are one more column on it — a dead MLB search
 * costs the reader the prospects and leaves every other name he can type
 * exactly as it was, with no banner for a half of a control that still works.
 */
app.get(
  '/api/players/search',
  requireUser,
  asyncRoute(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ q, min: PLAYER_SEARCH_MIN, players: await searchPlayers(q) });
  }),
);

/**
 * **One player by his MLB id** — the row a `player=` key needs when neither
 * list the client holds can name him.
 *
 * Registered *after* `/api/players/search`, which is what keeps the literal
 * path from being read as an id — Express takes the first route that matches.
 * The digits are then checked in the handler rather than in the path, because
 * **Express 5 does not take an inline pattern**: `'/api/players/:id(\\d+)'` is
 * the v4 spelling, and path-to-regexp v8 throws on it at *registration*, which
 * takes the whole server down on boot rather than failing the one route
 * (observed: the dev server exited and every `curl` got `Connection refused`).
 * A non-numeric segment is a 400, so the two guards still say the same thing.
 *
 * An id MLB does not know answers `{ players: [] }` and **not** a 404: the
 * caller's question is "who is this key, if anybody", and *nobody* is an
 * answer to it. A page that opens on nothing is what a key naming nobody
 * should get, and it is what the client already does with an unresolvable one.
 */
app.get(
  '/api/players/:id',
  requireUser,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'id must be an MLB player id' });
      return;
    }
    res.json({ players: await getPlayerRows(id) });
  }),
);

/**
 * Every club's next four weeks, with whoever each side has announced — what
 * the Schedule view on the summary table and the research board both draw.
 *
 * **No parameters at all, which is the point.** The window is the server's own
 * `baseballToday()` plus `SCHEDULE_DAYS`, so there is exactly one answer for
 * the whole app on a given day and exactly one cache entry behind it; the
 * client picks a span — 7 days, 14, this matchup or next — and slices what it
 * was given. A `days=` parameter would
 * buy nothing a slice doesn't and cost a second entry of the same upstream —
 * the same reasoning `getPlayerPool` follows for its cookie-free player list.
 *
 * A failed read is a 502 through `asyncRoute`, which is right here and not the
 * usual "cost the column its value": this answer *is* the table.
 */
app.get(
  '/api/schedule',
  requireUser,
  asyncRoute(async (_req, res) => {
    res.json(await getScheduleWindow());
  }),
);

// The user's saved **roster** — the list the Summary, Games and Feed views
// report on. The path still says `watchlist` and deliberately stays that way:
// renaming a route breaks every browser tab open at the moment of a deploy,
// and buys nothing this comment doesn't. The app's *watchlist* — who you are
// following on the research board — is `/api/watch` further down.
app.get(
  '/api/watchlist',
  requireUser,
  asyncRoute(async (req, res) => {
    res.json({ players: await getRoster(userId(req)) });
  }),
);

app.post(
  '/api/watchlist',
  requireUser,
  asyncRoute(async (req, res) => {
    const { id, savantName, name, kind } = req.body ?? {};
    if (typeof id !== 'number' || typeof savantName !== 'string' || typeof name !== 'string') {
      res.status(400).json({ error: 'id (number), savantName, name required' });
      return;
    }
    const players = await addRosterPlayer(userId(req), {
      id,
      savantName,
      name,
      kind: kind === 'pitcher' ? 'pitcher' : 'batter',
    });
    res.json({ players });
  }),
);

// Persist a new roster order (drag-to-reorder in the nav's edit mode).
app.put(
  '/api/watchlist/order',
  requireUser,
  asyncRoute(async (req, res) => {
    // Keys, not ids — "pitcher-592332" — so a two-way player's two entries can
    // be ordered independently. Usually only one kind's keys are submitted.
    const keys = req.body?.keys;
    if (!Array.isArray(keys) || !keys.every((k) => typeof k === 'string')) {
      res.status(400).json({ error: 'keys (string[]) required' });
      return;
    }
    const players = await reorderRoster(userId(req), keys);
    res.json({ players });
  }),
);

app.delete(
  '/api/watchlist/:id',
  requireUser,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    // `kind` narrows the removal to one half of a two-way player; without it
    // every entry for the id goes.
    const kind = req.query.kind;
    const players = await removeRosterPlayer(
      userId(req),
      id,
      kind === 'pitcher' || kind === 'batter' ? kind : undefined,
    );
    res.json({ players });
  }),
);

/**
 * The **watchlist** — who the user is following on the research board.
 *
 * A different list from the roster above, and a different currency: player
 * *keys*, since membership is the whole of what this list is and the board
 * already holds every row it could mark. One PUT toggles one key in either
 * direction, which is what the row's star and the player page's do.
 */
const WATCH_KEY_RE = /^(batter|pitcher)-\d{1,9}$/;

app.get(
  '/api/watch',
  requireUser,
  asyncRoute(async (req, res) => {
    res.json({ keys: await getWatchlist(userId(req)) });
  }),
);

app.put(
  '/api/watch',
  requireUser,
  asyncRoute(async (req, res) => {
    const { key, on } = (req.body ?? {}) as { key?: unknown; on?: unknown };
    if (typeof key !== 'string' || !WATCH_KEY_RE.test(key)) {
      res.status(400).json({ error: "key must be a player key, e.g. 'batter-660271'" });
      return;
    }
    if (typeof on !== 'boolean') {
      res.status(400).json({ error: 'on must be a boolean' });
      return;
    }
    res.json({ keys: await setWatchlisted(userId(req), key, on) });
  }),
);

// ---- The named lists, the saved searches, and sharing either ----------
//
// **One family of routes, because it is one idea twice.** A watchlist is a
// saved set of players and a search is a saved reading of the board; both are
// named, renamed, deleted and shared by the same gestures, so they share their
// shape, their caps and their share codes. What differs is the payload, and
// that is one field.
//
// The **board** on a search is stored and returned untouched — see
// `SavedSearch`, where the reasoning is: the client owns that vocabulary, the
// route owns the envelope. So what is checked here is a name that is a name and
// a board that is an object of a sane size, and nothing about what is in it.

/** A name a person typed: present, not blank, and not a paragraph. Trimmed on
 *  the way in, so ` Closers ` and `Closers` are one name rather than two. */
function readName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const name = v.trim();
  if (!name || name.length > MAX_NAME_LEN) return null;
  return name;
}

/** A search's `board`: a plain object, and small enough that thirty of them
 *  cannot make somebody's whole record unwritable (see `MAX_BOARD_BYTES`). */
function readBoard(v: unknown): Record<string, unknown> | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  if (JSON.stringify(v).length > MAX_BOARD_BYTES) return null;
  return v as Record<string, unknown>;
}

/**
 * A share code: 16 URL-safe characters of randomness, the length
 * `mintInviteCode` uses and for the same reason — holding one is the whole of
 * the authorisation to read the thing, so guessing one must not be a way into
 * somebody's saved state.
 */
function mintShareCode(): string {
  return randomBytes(12).toString('base64url');
}

/** Everything the research board needs to draw its own two controls: the lists,
 *  which one is active, and the saved searches. One read rather than three,
 *  because they are one item on the record and the board wants all of them the
 *  moment it opens. */
app.get(
  '/api/research/lists',
  requireUser,
  asyncRoute(async (req, res) => {
    const id = userId(req);
    const [lists, searches, activeId] = await Promise.all([
      getLists(id),
      getSearches(id),
      getActiveListId(id),
    ]);
    res.json({ lists, searches, activeId });
  }),
);

/**
 * Add a list — optionally **with its players already on it**, which is what
 * copying a shared one is.
 *
 * The keys are part of the create rather than a run of stars afterwards, and
 * that is not an optimization. The whole user record is **one item behind one
 * version guard**, so thirty `PUT /api/watch` calls fired at a copied list are
 * thirty conflicting writes against one version, of which `mutate` replays one
 * each — measured, copying a two-player list that way landed **one** of the two
 * and put it on the wrong list, the activate having been a separate request the
 * stars raced. One write cannot race itself.
 */
app.post(
  '/api/research/lists',
  requireUser,
  asyncRoute(async (req, res) => {
    const { name: rawName, keys: rawKeys } = (req.body ?? {}) as {
      name?: unknown;
      keys?: unknown;
    };
    const name = readName(rawName);
    if (!name) {
      res.status(400).json({ error: `name must be 1-${MAX_NAME_LEN} characters` });
      return;
    }
    // Shape-checked against the same pattern the star's own route uses, and
    // capped: a list is a set of player keys and nothing else may be written
    // into one by a client that has decided otherwise.
    const keys = Array.isArray(rawKeys)
      ? rawKeys.filter((k): k is string => typeof k === 'string' && WATCH_KEY_RE.test(k))
      : [];
    if (keys.length > MAX_LIST_KEYS) {
      res.status(400).json({ error: `A watchlist holds at most ${MAX_LIST_KEYS} players.` });
      return;
    }
    const before = await getLists(userId(req));
    if (before.length >= MAX_LISTS) {
      res.status(409).json({ error: `You can keep at most ${MAX_LISTS} watchlists.` });
      return;
    }
    const { lists, id } = await addList(userId(req), name, keys);
    res.json({ lists, id });
  }),
);

/**
 * Which list the star writes to. A `null` clears the choice back to the first
 * list, the convention every preference here follows.
 *
 * **Declared before `/lists/:listId`, and it has to be.** Express matches in
 * declaration order, so with the parameterised route first this one is never
 * reached — `PUT /api/research/lists/active` binds `listId` to the literal
 * string `active` and is answered by the *rename* handler, which then rejects
 * the body for having no `name` on it. Found exactly that way: setting the
 * active list came back `400 name must be 1-60 characters`, an error from a
 * route nobody had called. A literal segment that shares a prefix with a
 * parameter must lead.
 */
app.put(
  '/api/research/lists/active',
  requireUser,
  asyncRoute(async (req, res) => {
    const { listId } = (req.body ?? {}) as { listId?: unknown };
    if (listId !== null && typeof listId !== 'string') {
      res.status(400).json({ error: 'listId must be a string or null' });
      return;
    }
    await setActiveList(userId(req), listId);
    res.json({ activeId: await getActiveListId(userId(req)) });
  }),
);

app.put(
  '/api/research/lists/:listId',
  requireUser,
  asyncRoute(async (req, res) => {
    const name = readName((req.body as { name?: unknown } | undefined)?.name);
    if (!name) {
      res.status(400).json({ error: `name must be 1-${MAX_NAME_LEN} characters` });
      return;
    }
    res.json({ lists: await renameList(userId(req), String(req.params.listId), name) });
  }),
);

app.delete(
  '/api/research/lists/:listId',
  requireUser,
  asyncRoute(async (req, res) => {
    // Deleting the active list is allowed and needs no special case: the
    // preference then names nothing, and `activeList` falls back to the first —
    // which is why that fallback is a rule rather than a guard.
    res.json({ lists: await deleteList(userId(req), String(req.params.listId)) });
  }),
);

app.post(
  '/api/research/searches',
  requireUser,
  asyncRoute(async (req, res) => {
    const { name: rawName, board: rawBoard } = (req.body ?? {}) as {
      name?: unknown;
      board?: unknown;
    };
    const name = readName(rawName);
    const board = readBoard(rawBoard);
    if (!name) {
      res.status(400).json({ error: `name must be 1-${MAX_NAME_LEN} characters` });
      return;
    }
    if (!board) {
      res.status(400).json({ error: 'board must be an object under 8KB' });
      return;
    }
    const before = await getSearches(userId(req));
    if (before.length >= MAX_SEARCHES) {
      res.status(409).json({ error: `You can keep at most ${MAX_SEARCHES} saved searches.` });
      return;
    }
    const { searches, id } = await addSearch(userId(req), name, board);
    res.json({ searches, id });
  }),
);

/** Rename a search, point it at the board as it stands, or both — an omitted
 *  field is left alone, which is what lets a rename not disturb the reading. */
app.put(
  '/api/research/searches/:searchId',
  requireUser,
  asyncRoute(async (req, res) => {
    const { name: rawName, board: rawBoard } = (req.body ?? {}) as {
      name?: unknown;
      board?: unknown;
    };
    const patch: { name?: string; board?: Record<string, unknown> } = {};
    if (rawName !== undefined) {
      const name = readName(rawName);
      if (!name) {
        res.status(400).json({ error: `name must be 1-${MAX_NAME_LEN} characters` });
        return;
      }
      patch.name = name;
    }
    if (rawBoard !== undefined) {
      const board = readBoard(rawBoard);
      if (!board) {
        res.status(400).json({ error: 'board must be an object under 8KB' });
        return;
      }
      patch.board = board;
    }
    res.json({ searches: await updateSearch(userId(req), String(req.params.searchId), patch) });
  }),
);

app.delete(
  '/api/research/searches/:searchId',
  requireUser,
  asyncRoute(async (req, res) => {
    res.json({ searches: await deleteSearch(userId(req), String(req.params.searchId)) });
  }),
);

/**
 * Share one, or stop sharing it. Answers with the code, or null when off.
 *
 * Idempotent when turning it on: a second press hands back the code already
 * minted rather than replacing it, so pressing Share twice does not quietly
 * invalidate the link somebody was given last week.
 */
app.put(
  '/api/research/share',
  requireUser,
  asyncRoute(async (req, res) => {
    const { kind, id, enabled } = (req.body ?? {}) as {
      kind?: unknown;
      id?: unknown;
      enabled?: unknown;
    };
    if (kind !== 'list' && kind !== 'search') {
      res.status(400).json({ error: "kind must be 'list' or 'search'" });
      return;
    }
    if (typeof id !== 'string' || !id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' });
      return;
    }
    const code = await setItemSharing(userId(req), kind, id, enabled, mintShareCode);
    if (code === null && enabled) {
      res.status(404).json({ error: 'No such list or search.' });
      return;
    }
    res.json({ code });
  }),
);

/**
 * Open a shared list or search by its code — **the owner's current copy**, not
 * a snapshot taken when the link was made. See the note on `SHARE_KEY` for why
 * a live reference is the right thing for both of these.
 *
 * One message for "never existed", "revoked" and "deleted since", the reasoning
 * `/api/espn/join` states: which of the three it is tells a stranger holding a
 * guessed code something about whether they are close.
 */
app.get(
  '/api/research/shared/:code',
  requireUser,
  asyncRoute(async (req, res) => {
    const shared = await resolveShare(String(req.params.code), userId(req));
    if (!shared) {
      res.status(404).json({ error: 'That shared link is no longer valid.', code: 'share-gone' });
      return;
    }
    res.json(shared);
  }),
);

// The main report: every rostered player's events across a date range
// (a single day is just start === end).
app.get(
  '/api/report',
  requireUser,
  asyncRoute(async (req, res) => {
    const { start, end } = resolveDateRange(req.query.start ?? req.query.date, req.query.end ?? req.query.date);
    if (dayCount(start, end) > MAX_RANGE_DAYS) {
      res.status(400).json({ error: `date range too large (max ${MAX_RANGE_DAYS} days)` });
      return;
    }
    // `source=fantasy` reads the user's ESPN roster instead of the list they
    // built here. The client asks for it explicitly rather than the server
    // consulting the saved preference, so a report and the view rendering it
    // can never disagree about which set of players it describes — the
    // preference decides what the client asks for, and nothing else.
    // `refresh=1` rides along with it — a lineup change moves which players the
    // report is even about, so the two have to be re-read together or the slot
    // chips and the cards would describe different rosters.
    //
    // The range's **`end`** decides which day's lineup the roster is read at,
    // which is the same day `/api/espn/roster` is asked for — deliberately, and
    // for the same reason the refresh carries: the report's player order *is*
    // the lineup order, and a report ordered by today's lineup under chips
    // drawn from tomorrow's would be one roster described two ways.
    //
    // The saved roster is read **as it stood over those days**, not as it
    // stands now: `getRosterForRange` answers with everyone who was on it on
    // any day of the range and, per player, which of those days were his. A man
    // added this morning has no row over "Yesterday", and a man dropped this
    // morning still has his week. See **The roster is a range of rosters** in
    // `auth-and-storage.md` for the whole of that rule.
    const fantasy = req.query.source === 'fantasy';
    /**
     * **Whose fantasy team**, and absent means the reader's own — which is what
     * every caller but one asks for. The exception is the League page's Matchup
     * tab, whose two team pages are the same roster views read for the two
     * managers in a matchup, so they name a team.
     *
     * Shape-checked here and **membership-checked in `fantasyWatchlist`**
     * against the league the reader is actually connected to, which is the
     * check that matters: a team id is not a credential, so the only thing
     * worth enforcing is that it belongs to a league this user can already read
     * whole (`getOwnership` returns every team's roster in it, and has since
     * the free-agent set was first read as the complement of ownership).
     */
    const teamParam = req.query.teamId;
    let teamId: number | null = null;
    if (typeof teamParam === 'string' && teamParam !== '') {
      const n = Number(teamParam);
      if (!Number.isInteger(n) || n <= 0) {
        res.status(400).json({ error: 'teamId must be a positive integer' });
        return;
      }
      teamId = n;
    }
    let watched: WatchPlayer[];
    let held: HeldDays | undefined;
    let teamName: string | null = null;
    /**
     * **Which of this team's players were in its lineup on each day of the
     * range** — what the `Starters` filter reads, and the one thing the report
     * used to compute and throw away.
     *
     * `fantasyWatchlist` has read one roster per day since a range became a
     * range of rosters: it is where `held` comes from, so the lineups fall out
     * of work this request already does and cost **no upstream read at all**.
     * The reader's own views take the same map off `/api/espn/roster?start=`
     * and are untouched; what this answers for is the team pages of a matchup,
     * where no route returned it for anybody but the reader.
     *
     * It rides here rather than on that roster route for a reason worth
     * stating: the team page fetches this report anyway, so the filter costs it
     * no second request — and the lineups then describe **exactly** the rows
     * this response describes, which is a stronger guarantee than two reads a
     * moment apart can make. Null where the per-day read failed, which is the
     * old behavior: one lineup applied to the whole range.
     *
     * **The values are player keys, not MLB ids** — a seat has a side of the
     * ball, and a two-way player is two rows under one id. See
     * `espn.ts::startedKeys`.
     */
    let lineups: Record<string, string[]> | null = null;
    if (fantasy) {
      try {
        // The **range**, not just its end: a fantasy team is a range of rosters
        // exactly as the saved one is, so the report reads one per day and is
        // told which of them each player was on. A read that fails leaves
        // `held` null, which is the old behavior — today's team over every day
        // of the range.
        const fan = await fantasyWatchlist(
          userId(req),
          req.query.refresh === '1',
          end,
          { start, end },
          teamId,
        );
        watched = fan.players;
        teamName = fan.teamName;
        held = fan.held ?? undefined;
        lineups = fan.lineups;
      } catch (err) {
        // A league that can't be read is the user's to fix, and the client
        // offers the way to — so 409 rather than the 502 `asyncRoute` would
        // otherwise turn this into.
        if (espnError(err, res)) return;
        throw err;
      }
    } else {
      ({ players: watched, heldDays: held } = await getRosterForRange(userId(req), start, end));
    }
    const players = await getReport(start, end, watched, held);
    // `'watchlist'` is what the source has always been called on the wire and
    // stays so for an old tab's sake; it means the saved roster.
    res.json({
      start,
      end,
      players,
      source: fantasy ? 'fantasy' : 'watchlist',
      teamName,
      // Only where there is one: a saved-roster report has no fantasy lineup to
      // describe, and an absent field is what every older tab already reads.
      ...(lineups ? { lineups } : {}),
    });
  }),
);

// A player's Savant-style Statcast percentile-ranking card, for the details view.
// Saved per-user preferences. One request on boot, alongside the watchlist —
// they live on the same item, so this is a read the client already pays for.
app.get(
  '/api/prefs',
  requireUser,
  asyncRoute(async (req, res) => {
    res.json(await getPrefs(userId(req)));
  }),
);

/** A column key as the client writes them: short, alphanumeric identifiers.
 *  Validated for *shape* only — which keys exist is the client's vocabulary,
 *  and it drops any it doesn't know when reading them back. This is here to
 *  keep the item from growing junk, not to police the column list. */
const COLUMN_KEY_RE = /^[A-Za-z0-9]{1,40}$/;
const MAX_COLUMNS = 100;

/**
 * `{ kind, keys }` for a table of columns, validated for shape alone — the two
 * routes below take the identical body and differ only in which entry they
 * write, so the check is written once rather than twice with a chance to
 * diverge. Returns the narrowed pair, or null having already answered 400.
 */
function readColumnBody(
  req: express.Request,
  res: express.Response,
): { kind: PlayerKind; keys: string[] | null } | null {
  const { kind, keys } = (req.body ?? {}) as { kind?: unknown; keys?: unknown };
  if (kind !== 'batter' && kind !== 'pitcher') {
    res.status(400).json({ error: "kind must be 'batter' or 'pitcher'" });
    return null;
  }
  // null is "back to the defaults", which is stored as the absence of an
  // entry rather than as a copy of today's default list.
  if (keys !== null && !Array.isArray(keys)) {
    res.status(400).json({ error: 'keys must be an array of column keys, or null' });
    return null;
  }
  if (
    Array.isArray(keys) &&
    (keys.length > MAX_COLUMNS ||
      !keys.every((k) => typeof k === 'string' && COLUMN_KEY_RE.test(k)))
  ) {
    res.status(400).json({ error: 'keys must be up to 100 short alphanumeric column keys' });
    return null;
  }
  return { kind, keys: keys as string[] | null };
}

app.put(
  '/api/prefs/research-columns',
  requireUser,
  asyncRoute(async (req, res) => {
    const body = readColumnBody(req, res);
    if (!body) return;
    res.json(await setResearchColumns(userId(req), body.kind, body.keys));
  }),
);

/** The board's **projected** reading, which keeps its own set — see
 *  `UserPrefs.projectedColumns`. The same body check and the same store path as
 *  the two beside it; what it must not be is a share of the board's entry,
 *  since the lens offers a strict subset of that vocabulary and a write from
 *  it would drop every column it does not list. */
app.put(
  '/api/prefs/projected-columns',
  requireUser,
  asyncRoute(async (req, res) => {
    const body = readColumnBody(req, res);
    if (!body) return;
    res.json(await setProjectedColumns(userId(req), body.kind, body.keys));
  }),
);

/** The player page's Stats tab, which keeps its own set — see
 *  `UserPrefs.statsColumns` for why it is not a share of the board's. */
app.put(
  '/api/prefs/stats-columns',
  requireUser,
  asyncRoute(async (req, res) => {
    const body = readColumnBody(req, res);
    if (!body) return;
    res.json(await setStatsColumns(userId(req), body.kind, body.keys));
  }),
);

app.put(
  '/api/prefs/hide-injured',
  requireUser,
  asyncRoute(async (req, res) => {
    const { hide } = (req.body ?? {}) as { hide?: unknown };
    if (typeof hide !== 'boolean') {
      res.status(400).json({ error: 'hide must be a boolean' });
      return;
    }
    res.json(await setHideInjured(userId(req), hide));
  }),
);

// A route of its own rather than a merged PUT /api/prefs, for the reason the
// two above are separate: their update semantics genuinely differ (a boolean is
// always set; a column list needs a null that *clears*), and explicit,
// tightly-validated routes beat a merge protocol with null-versus-absent rules.
app.put(
  '/api/prefs/mute-audio',
  requireUser,
  asyncRoute(async (req, res) => {
    const { mute } = (req.body ?? {}) as { mute?: unknown };
    if (typeof mute !== 'boolean') {
      res.status(400).json({ error: 'mute must be a boolean' });
      return;
    }
    res.json(await setMuteAudio(userId(req), mute));
  }),
);

/**
 * The reader's color scheme. A route of its own for the reason each of the
 * preferences around it has one — its update semantics are its own: it is
 * neither a boolean that is always set nor a list a null clears, but **one id,
 * where `null` means "back to the default"** and is stored as the absence of
 * the entry.
 *
 * The id is shape-checked and otherwise trusted, which is the split
 * `research-columns` already makes: which themes exist is the client's
 * vocabulary (`client/src/theme.ts`), and a value this server has never heard
 * of is read back as the default by whoever draws it. The worst a bad one can
 * do is give this one reader the default palette.
 */
app.put(
  '/api/prefs/theme',
  requireUser,
  asyncRoute(async (req, res) => {
    const { theme } = (req.body ?? {}) as { theme?: unknown };
    if (theme !== null && (typeof theme !== 'string' || !/^[a-z0-9-]{1,32}$/.test(theme))) {
      res.status(400).json({ error: 'theme must be a theme id, or null for the default' });
      return;
    }
    res.json(await setTheme(userId(req), theme));
  }),
);

/**
 * Show a percentile rank under every value on the research board and the player
 * page's Stats tab. A boolean like the two above, and a route of its own for the
 * reason each of those is — and **one** entry for both tables, since it is a
 * habit of reading rather than a setting on either of them.
 */
app.put(
  '/api/prefs/stat-ranks',
  requireUser,
  asyncRoute(async (req, res) => {
    const { on } = (req.body ?? {}) as { on?: unknown };
    if (typeof on !== 'boolean') {
      res.status(400).json({ error: 'on must be a boolean' });
      return;
    }
    res.json(await setStatRanks(userId(req), on));
  }),
);

/**
 * **How the research board's controls are arranged on its bar** — up to four
 * rows of keys, the condensed run's order, which of them it leaves out, and how
 * each control is drawn. A route of its own for the reason each of the ones around
 * it is, and its update semantics are `theme`'s: an object that a `null` clears
 * back to the default arrangement.
 *
 * **The shape is validated and the vocabulary is not**, which is the split
 * `/api/prefs/theme` and `/api/prefs/research-columns` both make: which controls
 * exist is the client's business (`ResearchLayout.tsx`), and a key it does not
 * recognize is dropped where the bar is drawn. Validating the words here would
 * mean a newer browser's arrangement being **rejected** by an older server
 * instead of ignored by an older tab — and this is the one preference a reader
 * would have to rebuild by hand.
 *
 * The caps are what keeps a preference blob a preference blob: four rows, and a
 * key no longer than a key. They are deliberately generous against the client's
 * own count rather than equal to it, for the same reason the vocabulary is not
 * checked.
 */
app.put(
  '/api/prefs/research-controls',
  requireUser,
  asyncRoute(async (req, res) => {
    const { controls } = (req.body ?? {}) as { controls?: unknown };
    const KEY = /^[a-z][a-z0-9-]{0,31}$/;
    const keys = (v: unknown, max: number) =>
      Array.isArray(v) && v.length <= max && v.every((k) => typeof k === 'string' && KEY.test(k));
    // A map of key → word, and the words are not checked here either: which
    // readings exist is the client's, exactly as the keys are.
    const wordMap = (v: unknown) =>
      !!v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.keys(v).length <= 64 &&
      Object.entries(v as Record<string, unknown>).every(
        ([k, w]) => KEY.test(k) && typeof w === 'string' && KEY.test(w),
      );
    const c = controls as ResearchControlsPref;
    const valid =
      controls === null ||
      (!!controls &&
        typeof controls === 'object' &&
        !Array.isArray(controls) &&
        Array.isArray(c.rows) &&
        c.rows.length <= 4 &&
        c.rows.every((r) => keys(r, 64)) &&
        keys(c.condensed, 64) &&
        keys(c.condensedOff, 64) &&
        wordMap(c.display));
    if (!valid) {
      res.status(400).json({
        error:
          'controls must be null, or { rows: string[][] (max 4), condensed: string[], condensedOff: string[], display: Record<string, string> }',
      });
      return;
    }
    res.json(
      await setResearchControls(
        userId(req),
        controls === null
          ? null
          : {
              rows: c.rows,
              condensed: c.condensed,
              condensedOff: c.condensedOff,
              display: c.display,
              /* `iconOnly` is deliberately not carried through: it is read on
                 the client and never written, so a PUT that omits it is what
                 migrates the record. See `ResearchControlsPref`. */
            },
      ),
    );
  }),
);

/**
 * Which density the player page's percentile card opens at. A route of its own
 * for the reason each of the ones around it is — its update semantics are its
 * own: a **string** that a null clears, rather than a boolean that is always
 * set, so the stored entry can go back to meaning "whatever the default is".
 *
 * The word itself is not validated against a list here, deliberately, and it is
 * the same split `/api/prefs/theme` makes: which densities exist is the
 * client's business (`PlayerDetails.tsx`), and a value it does not recognize is
 * read there as the default. Validating it here would mean a newer browser's
 * choice being rejected by an older server instead of ignored by an older tab.
 */
app.put(
  '/api/prefs/percentile-density',
  requireUser,
  asyncRoute(async (req, res) => {
    const { density } = (req.body ?? {}) as { density?: unknown };
    if (density !== null && typeof density !== 'string') {
      res.status(400).json({ error: 'density must be a string or null' });
      return;
    }
    res.json(await setPercentileDensity(userId(req), density));
  }),
);

/**
 * Remember a player picked out of the header search. A route of its own for the
 * reason the four above are separate: its update semantics are its own again —
 * not a boolean that is always set, nor a list that a null clears, but a single
 * key **pushed onto** a list the server keeps and caps.
 *
 * The body is one player key, shape-validated against the same `WATCH_KEY_RE`
 * the watchlist uses, since that is the whole of what is stored — see
 * `UserPrefs.recentPlayers` for why a key rather than a name and a club.
 */
app.put(
  '/api/prefs/recent-players',
  requireUser,
  asyncRoute(async (req, res) => {
    const { key } = (req.body ?? {}) as { key?: unknown };
    if (typeof key !== 'string' || !WATCH_KEY_RE.test(key)) {
      res.status(400).json({ error: "key must be a player key, e.g. 'batter-660271'" });
      return;
    }
    res.json(await setRecentPlayer(userId(req), key));
  }),
);

/**
 * Mark the League page's Transactions feed read up to a date — what draws, and
 * undraws, the red dot on that tab.
 *
 * The **sixth** update semantic on this item and its own again: not a boolean
 * that is always set, nor a list a null clears, nor a key pushed onto one, but
 * a watermark that only ever moves forward within a league (see
 * `store.ts::setSeenTransactions`). Two fields for the same reason
 * `research-include` takes two — they are one fact, and a date without the
 * league it was read in is a date that could mark somebody else's feed read.
 *
 * `ts` is epoch milliseconds, which is what ESPN stamps a transaction with and
 * what the feed is ordered by. Both are shape-checked and otherwise trusted:
 * the worst a bad pair can do is this user's own dot.
 */
app.put(
  '/api/prefs/seen-transactions',
  requireUser,
  asyncRoute(async (req, res) => {
    const { leagueId, ts } = (req.body ?? {}) as { leagueId?: unknown; ts?: unknown };
    if (typeof leagueId !== 'number' || !Number.isInteger(leagueId) || leagueId <= 0) {
      res.status(400).json({ error: 'leagueId must be a positive integer' });
      return;
    }
    if (typeof ts !== 'number' || !Number.isFinite(ts) || ts < 0) {
      res.status(400).json({ error: 'ts must be epoch milliseconds' });
      return;
    }
    res.json(await setSeenTransactions(userId(req), leagueId, ts));
  }),
);

/**
 * Mark the Feed view's stream of plays read up to a date — what undraws the red
 * `N new plays` button at the head of it.
 *
 * The **seventh** update semantic on this item, and it is the sixth's with one
 * field rather than two: a watermark that only ever moves forward (see
 * `store.ts::setSeenPlays`). One field because a play is scoped to nothing the
 * reader switches between — it belongs to a roster and a date range, and the
 * feed is already about both — where a transaction date without its league
 * could mark somebody else's feed read.
 *
 * `ts` is epoch milliseconds, which is what the stream is ordered by. Shape-
 * checked and otherwise trusted: the worst a bad value can do is this user's
 * own button.
 */
app.put(
  '/api/prefs/seen-plays',
  requireUser,
  asyncRoute(async (req, res) => {
    const { ts } = (req.body ?? {}) as { ts?: unknown };
    if (typeof ts !== 'number' || !Number.isFinite(ts) || ts < 0) {
      res.status(400).json({ error: 'ts must be epoch milliseconds' });
      return;
    }
    res.json(await setSeenPlays(userId(req), ts));
  }),
);

/**
 * Which ownership sets the research board includes, and whether the watchlist
 * is on the board beside them. **One route for two fields**, where the three
 * above are one each: those are independent settings that happen to live on one
 * item, while these are one control set — the client reads them together to
 * decide who is on the board and holds both whenever either moves.
 *
 * `include: null` is "back to the default"; `[]` is the real state of a user
 * who has turned all three off, and is stored — which with `watchlist: true` is
 * a board that is exactly the watchlist, and so a state worth storing rather
 * than an empty one.
 *
 * The **body field keeps the name `watchlist`**, which is what it always was;
 * only the stored key was renamed when the flag stopped meaning "only" (see
 * `setResearchInclude`), so an older tab's PUT is read correctly and simply
 * means a wider board than it did when the tab was opened.
 */
app.put(
  '/api/prefs/research-include',
  requireUser,
  asyncRoute(async (req, res) => {
    const { include, watchlist } = (req.body ?? {}) as {
      include?: unknown;
      watchlist?: unknown;
    };
    const valid =
      include === null ||
      (Array.isArray(include) &&
        include.length <= RESEARCH_INCLUDE_KEYS.length &&
        include.every((k) => RESEARCH_INCLUDE_KEYS.includes(k as ResearchIncludeKey)));
    if (!valid) {
      res.status(400).json({ error: `include must be null or keys from ${RESEARCH_INCLUDE_KEYS.join('/')}` });
      return;
    }
    if (typeof watchlist !== 'boolean') {
      res.status(400).json({ error: 'watchlist must be a boolean' });
      return;
    }
    res.json(
      await setResearchInclude(
        userId(req),
        include === null ? null : ([...new Set(include)] as ResearchIncludeKey[]),
        watchlist,
      ),
    );
  }),
);

// ---- ESPN fantasy league ------------------------------------------------
//
// Three routes over the saved connection and one over what it can read. The
// credential — `espnS2`, a live ESPN session cookie — goes in through the PUT
// and never comes back out: every response below is built from the harmless
// half of the record, so there is no shape of this API that hands a browser
// back the cookie it was given.

/** What the client is told about a connection. No credentials, by construction:
 *  it is assembled field by field rather than spread from the stored record. */
function espnStatus(user: string, espn: EspnLeague | null, league: LeagueRecord | null) {
  if (!espn) return { connected: false as const };
  return {
    connected: true as const,
    leagueId: espn.leagueId,
    leagueName: league?.leagueName ?? espn.leagueName ?? null,
    teamId: espn.teamId ?? null,
    teamName: espn.teamName ?? null,
    // Whether a cookie is stored at all — true for a private league, false for
    // a public one read anonymously. The value itself never appears here; this
    // is only so the page can say which of the two it is.
    hasCredentials: Boolean(league?.swid && league?.espnS2),
    /** The invite code, or null when sharing is off. Only ever sent to someone
     *  already attached to the league, which is everyone who can reach this. */
    inviteCode: league?.inviteCode ?? null,
    /** How many app users are on this connection, so the page can say whether
     *  sharing it has actually done anything yet. */
    memberCount: league?.members.length ?? 1,
    /** Whether *this* user's cookie is the one the league is currently read
     *  with. What it is for is the opposite case: telling someone their league
     *  is running on a leaguemate's session, so a stale one is understood as
     *  something anybody can fix rather than a fault of theirs. */
    credentialMine: league ? league.credentialFrom === user : true,
    savedAt: espn.savedAt,
  };
}

/**
 * The two records the status is assembled from.
 *
 * It goes through `getEspnCreds` rather than reading the league directly, for
 * the side effect: that is where a pre-sharing connection's inline credential
 * is promoted onto a league record. Reading around it would report
 * `hasCredentials: false` for a perfectly good legacy connection right up
 * until something else happened to trigger the migration.
 */
async function espnStatusFor(user: string) {
  const espn = await getEspnLeague(user);
  if (!espn) return espnStatus(user, null, null);
  await getEspnCreds(user);
  return espnStatus(user, espn, await getLeague(espn.leagueId));
}

/** ESPN rejecting the saved cookies is not an upstream fault to 502 over — it
 *  is a thing the user can fix, and the client shows it as such. 409 rather
 *  than 401, which `api.ts` treats as an expired *Cognito* token and retries. */
function espnError(err: unknown, res: express.Response): boolean {
  if (!(err instanceof EspnAuthError)) return false;
  res.status(409).json({ error: err.message, code: 'espn-auth' });
  return true;
}

/**
 * The user's own fantasy roster as a watchlist, plus the team it came from.
 *
 * Throws `EspnAuthError` when there is nothing to read from — no league, or no
 * team chosen within it — so the caller answers 409 with something the user can
 * act on rather than a 502 about an upstream that was never asked.
 *
 * `refresh` skips the ten-minute ownership cache, the same escape hatch
 * `/api/espn/ownership` carries and for the same person: someone who has just
 * moved a player in ESPN and is looking at the app to see it.
 *
 * `date` is the day to read the **lineup** for — the last day of the range the
 * views are reporting on, so the `Tomorrow` preset shows the lineup set for
 * tomorrow rather than the one being played out today. Today and anything
 * earlier read ESPN's current period; see `espn.ts`'s **Which day's lineup**.
 * It reaches the roster *order* as well as the slots, which is the point of
 * passing it here rather than only to the route that draws the chips: the
 * report's player list is that order, so without it a Tomorrow report would
 * list the lineup one way and chip it another.
 *
 * **A past day is where that clamp stops being enough**, and it is why this
 * returns two rosters rather than one. `roster` is the team **as it stands** —
 * today's, or the future day asked for — and is the answer to every "is he on
 * my team" question the app asks: what the research board's `My Roster` button
 * selects, what its baseball marks, what the player page's badge states.
 * `endRoster` is the team **as it was at the end of the range in view**, which
 * is what a slot chip and the roster's own order are facts about. The two are
 * one array on every range ending today or later, which is four of the five
 * date presets; they part company exactly when the reader has asked about a day
 * gone by, and the whole of this fix is that the second question stops being
 * answered with the first one's roster.
 */
async function fantasyWatchlist(
  user: string,
  refresh = false,
  date?: string | null,
  range?: { start: string; end: string } | null,
  teamIdOverride?: number | null,
): Promise<{
  players: WatchPlayer[];
  teamName: string | null;
  roster: EspnRosterPlayer[];
  endRoster: EspnRosterPlayer[] | null;
  /** Player keys, not MLB ids — see `espn.ts::startedKeys`. */
  lineups: Record<string, string[]> | null;
  held: HeldDays | null;
}> {
  const espn = await getEspnLeague(user);
  if (!espn) throw new EspnAuthError('No ESPN league connected');
  // **Whose team**, and the override is what makes this answer for a
  // leaguemate's. Without one it is the reader's own and every rule below is
  // unchanged; with one it is any team in the league the reader is connected
  // to, which is what the Matchup tab's two team pages read. The "pick a team"
  // error is the reader's own case alone: naming somebody else's team is not a
  // thing they need a team of their own to do.
  const teamId = teamIdOverride ?? espn.teamId;
  if (teamId == null) {
    throw new EspnAuthError(
      'No fantasy team chosen in this league — pick yours on the Fantasy league page.',
    );
  }
  const creds = await getEspnCreds(user);
  if (!creds) throw new EspnAuthError('No ESPN league connected');
  const own = await getOwnership(creds, refresh, date);
  // A team id this league has never heard of is the caller's mistake and is
  // said so rather than answered with an empty roster, which would read as a
  // manager who has dropped everybody.
  if (!own.teams.some((t) => t.id === teamId)) {
    throw new EspnAuthError(`No team ${teamId} in this league.`);
  }
  const roster = own.rosters[teamId] ?? [];
  const team = own.teams.find((t) => t.id === teamId);
  // **One read per day answers both questions**, where it used to answer one.
  // *Which players do the views report on* is the union of every day's roster —
  // your team as it stood over those days, the man you dropped on Tuesday
  // included, for the days you had him — and *which of a player's days count*
  // is that same map read a second way. See `espn.ts`'s **A range is a range of
  // rosters** for why the roster rule reversed and what it costs.
  //
  // The seed is the day `getOwnership` has just answered for, which is
  // **`ownershipDay`'s own answer and not today's** — that read is clamped
  // forward onto the live period so that a player picked up this afternoon is
  // owned rather than free (see `espn.ts::liveRosterDay`), and filing its
  // roster under today would put tomorrow's lineup behind today's slot chips
  // and behind the `Starters` filter. Asking the helper rather than restating
  // the clamp is what keeps the two from drifting.
  //
  // So a range ending today no longer has its last day seeded and reads it
  // instead — one `forTeamId` request (198KB, memory-cached ten minutes like
  // every other mutable day), which is also what makes `endRoster` a genuinely
  // different list from `players` on that range and so sent rather than
  // elided.
  let byDate: Record<string, EspnRosterPlayer[]> | null = null;
  if (range) {
    const seedDate = ownershipDay(date);
    byDate = await getTeamRosters(
      creds,
      teamId,
      range.start,
      range.end,
      { date: seedDate, roster },
      refresh,
    ).catch((err: Error) => {
      // One roster per day is a refinement of the single end-of-range read, not
      // a prerequisite for it: without it the views report on today's team with
      // one lineup applied to the range, which is exactly what the app did
      // before any of this.
      console.error('ESPN per-day rosters unavailable:', err.message);
      return null;
    });
  }
  // **The slot chip and the roster's order are anchored to the end of the
  // range, not to today.** `getOwnership` clamps anything at or before
  // tomorrow onto the live period — deliberately, since *which players the
  // views report on* must not become a team the manager no longer has — so on
  // a past range the roster it answers with is the one he has now, and reading
  // the chips and the order off it says a man was benched yesterday because he
  // is on the bench now, and files the catcher you did start under "no longer
  // on the team". The per-day map has that day's roster, slots and all, so the
  // anchor is `byDate[end]` where there is one.
  //
  // **Where there isn't, today's roster stands**, which is the pre-per-day
  // behavior and the right direction to fail in: a day ESPN wouldn't answer
  // for costs its precision, not the chips. That covers a failed read, a
  // caller that named no range at all, and a range ending on the live day
  // itself — the last of which needs no fallback, `getTeamRosters` having
  // seeded the map with this very array (`byDate[end] === roster` by
  // construction), so the two agree by identity rather than by luck. A range
  // ending **today** now takes the read rather than the seed, since today's
  // lineup and the live roster are two different answers.
  const endRoster = (range && byDate?.[range.end]) ?? null;
  const anchor = endRoster ?? roster;
  const over = byDate && Object.keys(byDate).length > 0 ? rostersToWatchlist(byDate, anchor) : null;
  // **And whoever is on the team now but on none of the days in view**, which
  // is a set the union cannot reach and which had nowhere else to go. ESPN
  // books a move made after about 1pm ET against the *next* scoring period
  // (`espn.ts::liveRosterDay`), so a player picked up this afternoon is on the
  // live roster and on no day of a range ending today — and `players` is what
  // the client's `rosterKeys` reads to answer *is he on my team*, which is a
  // question about now whatever range is on screen. Left out, your own new
  // pickup would sit on the research board under `Other Rosters` wearing
  // neither the roster baseball nor a padlock, which is worse than the free
  // agent he used to read as.
  //
  // He carries an **empty** held-days set rather than none: `getReport` reads
  // an absent key as held every day and an empty set as held on none, so this
  // is the difference between a row of dashes — which is the honest line for a
  // man who has played you no games yet — and a whole week of somebody else's.
  // He goes after the men who were actually on the team over the range, that
  // list being what the table is *about*.
  const held = over?.heldDays ?? null;
  const nowOnly = rosterToWatchlist(roster).filter((p) => {
    const key = `${p.kind}-${p.id}`;
    if (!held || held.has(key)) return false;
    held.set(key, new Set());
    return true;
  });
  return {
    players: over ? [...over.players, ...nowOnly] : rosterToWatchlist(roster),
    teamName: team?.name ?? espn.teamName ?? null,
    roster,
    // Sent only when it is genuinely a *different* day's list. Ending today or
    // later it is the same 28 rows the caller already has under `roster`, and a
    // second copy of them on the wire would say nothing the client's own
    // fallback doesn't.
    endRoster: endRoster === roster ? null : endRoster,
    lineups: byDate && lineupsFrom(byDate),
    held,
  };
}

app.get(
  '/api/espn',
  requireUser,
  asyncRoute(async (req, res) => {
    res.json(await espnStatusFor(userId(req)));
  }),
);

// The user's own roster, slot by slot — what the app shows beside each player
// when it is reading the fantasy team rather than the saved watchlist.
// `?refresh=1` skips the ten-minute cache, for the lineup change just made.
//
// `?end=` (`?date=` is the older tab's name for it) is the day to read the
// *roster* for — the end of the range on screen. Validated for shape and
// otherwise left to `getOwnership`, which clamps anything at or before
// tomorrow onto the live period, so a nonsense date can only ever cost the
// caller the roster as it stands rather than someone else's team from June.
//
// `?start=` opts the response into `lineups`: which of your players were in
// your lineup on **each** day of `start`…`end`, so the summary table can
// aggregate a range against the lineup that was actually set for each of its
// days rather than applying one day's to all of them. Omitted (an older tab, or
// a caller that only wants the chips) the field is simply absent and nothing
// downstream changes. The span is capped like the report's, since it is the
// same span and the fan-out is one ESPN read per day of it. Each day is a list
// of **player keys** — `batter-660271` — because a seat has a side of the ball
// and a two-way player is two rows under one id; see `espn.ts::startedKeys`.
//
// It opts the response into **`endRoster`** as well — the roster as it stood at
// the end of that span, when that is a past day the per-day read could answer
// for. `players` stays the team as it stands, so the two questions the client
// asks of this payload keep their own answers: *where was he in my lineup that
// day* reads `endRoster`, *is he on my team* reads `players`. Absent means the
// second answers both, which is what every range ending today already did.
app.get(
  '/api/espn/roster',
  requireUser,
  asyncRoute(async (req, res) => {
    const q = (k: string) =>
      typeof req.query[k] === 'string' && DATE_RE.test(req.query[k] as string)
        ? (req.query[k] as string)
        : null;
    const end = q('end') ?? q('date');
    const start = q('start');
    const range =
      start && end && start <= end && dayCount(start, end) <= MAX_RANGE_DAYS
        ? { start, end }
        : null;
    try {
      const { roster, endRoster, teamName, lineups } = await fantasyWatchlist(
        userId(req),
        req.query.refresh === '1',
        end,
        range,
      );
      res.json({ teamName, players: roster, endRoster, lineups });
    } catch (err) {
      if (!espnError(err, res)) throw err;
    }
  }),
);

// ---- Sharing a league with your leaguemates ------------------------------
//
// The point of this: the *second* person in a league should not have to go
// hunting for cookies. ESPN publishes no member emails — checked across every
// league view and the member and invite endpoints, there is no email anywhere
// in the payload — so leaguemates cannot be recognized automatically. What it
// does publish is enough for the connection to be *shared* deliberately: one
// person connects, turns sharing on, and hands out a link.
//
// The credential is never in the link and never leaves the server. Joining
// attaches the user to the league record; their reads then use whatever
// credential that record currently holds.

/** An invite code: 16 URL-safe characters of randomness. Long enough that
 *  guessing one is not a way into somebody's private league, which matters
 *  because holding one is the whole of the authorisation to join. */
function mintInviteCode(): string {
  return randomBytes(12).toString('base64url');
}

/** Turn sharing on or off for the league this user is on. Any member may —
 *  they are all equally on the connection, and a league whose only sharer has
 *  stopped using the app would otherwise be frozen. */
app.put(
  '/api/espn/share',
  requireUser,
  asyncRoute(async (req, res) => {
    const { enabled } = (req.body ?? {}) as { enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' });
      return;
    }
    const espn = await getEspnLeague(userId(req));
    if (!espn) {
      res.status(409).json({ error: 'No ESPN league connected', code: 'espn-missing' });
      return;
    }
    await setLeagueSharing(espn.leagueId, enabled, mintInviteCode);
    res.json(await espnStatusFor(userId(req)));
  }),
);

/**
 * Join a league from an invite code. No cookies, no league id — the code is
 * the whole of it, which is the point.
 *
 * A user who already has a league is moved to this one; their watchlist and
 * preferences are untouched, and their team is unset because a team id means
 * nothing in a different league.
 */
app.post(
  '/api/espn/join',
  requireUser,
  asyncRoute(async (req, res) => {
    const { code } = (req.body ?? {}) as { code?: unknown };
    if (typeof code !== 'string' || code.trim() === '') {
      res.status(400).json({ error: 'code is required' });
      return;
    }
    const league = await leagueForInvite(code.trim());
    if (!league) {
      // Deliberately one message for "never existed" and "revoked": which of
      // the two it is tells a stranger holding a guessed code something about
      // whether they are close.
      res.status(404).json({ error: 'That invite link is no longer valid.', code: 'espn-invite' });
      return;
    }
    await joinLeague(userId(req), league.leagueId);
    const espn = await attachEspnLeague(userId(req), league.leagueId, league.leagueName);
    res.json(espnStatus(userId(req), espn, await getLeague(league.leagueId)));
  }),
);

// Which team in the league is the user's. The SWID names it automatically for
// a manager in their own private league; a public league read anonymously has
// no owner to match, and someone with two teams has to say which — so it is
// settable rather than only derived.
app.put(
  '/api/espn/team',
  requireUser,
  asyncRoute(async (req, res) => {
    const { teamId } = (req.body ?? {}) as { teamId?: unknown };
    const id = typeof teamId === 'number' ? teamId : Number(teamId);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'teamId must be a positive integer' });
      return;
    }
    const espn = await getEspnLeague(userId(req));
    if (!espn) {
      res.status(409).json({ error: 'No ESPN league connected', code: 'espn-missing' });
      return;
    }
    try {
      // Named from the league rather than trusted from the client: the id is a
      // choice, but the label beside it is a fact about the league.
      const creds = await getEspnCreds(userId(req));
      if (!creds) {
        res.status(409).json({ error: 'No ESPN league connected', code: 'espn-missing' });
        return;
      }
      const own = await getOwnership(creds);
      const team = own.teams.find((t) => t.id === id);
      if (!team) {
        res.status(400).json({ error: `No team ${id} in league ${espn.leagueId}` });
        return;
      }
      await setEspnTeam(userId(req), id, team.name);
      res.json(await espnStatusFor(userId(req)));
    } catch (err) {
      if (!espnError(err, res)) throw err;
    }
  }),
);

// Verified before it is stored: a set of cookies that cannot read the league is
// worth rejecting while the user still has the form open and can see which
// field is wrong, rather than at first use from a table that just looks empty.
app.put(
  '/api/espn',
  requireUser,
  asyncRoute(async (req, res) => {
    const { leagueId, swid, espnS2, teamId } = (req.body ?? {}) as {
      leagueId?: unknown;
      swid?: unknown;
      espnS2?: unknown;
      teamId?: unknown;
    };
    const id = typeof leagueId === 'number' ? leagueId : Number(leagueId);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'leagueId must be a positive integer' });
      return;
    }
    // **Both cookies or neither.** They are optional because a public league
    // needs none, but half a pair is a typo rather than a choice, and letting
    // it through would read the league anonymously and then report the private
    // league's 401 as though the value supplied were the wrong one.
    const hasSwid = typeof swid === 'string' && swid.trim() !== '';
    const hasS2 = typeof espnS2 === 'string' && espnS2.trim() !== '';
    if (hasSwid !== hasS2) {
      res.status(400).json({ error: 'swid and espnS2 must be given together' });
      return;
    }
    const creds = {
      leagueId: id,
      swid: hasSwid ? normalizeSwid(swid as string) : null,
      espnS2: hasS2 ? normalizeS2(espnS2 as string) : null,
    };
    // Only used when there is no SWID to identify the user's team with — i.e.
    // a public league, where the `teamId` in the URL they pasted is the one
    // place it appears.
    const urlTeamId = Number(teamId);
    const fallbackTeam = Number.isInteger(urlTeamId) && urlTeamId > 0 ? urlTeamId : null;
    try {
      const info = await getLeagueInfo(creds);
      const myTeamId = info.myTeamId ?? fallbackTeam;
      // The credential goes on the **league**, not on this user: that is what
      // lets it be shared, and what makes this same route the way any member
      // refreshes an expired cookie for everybody on it.
      const league = await upsertLeague(
        userId(req),
        creds.leagueId,
        info.leagueName,
        creds.swid,
        creds.espnS2,
      );
      const saved = await setEspnLeague(userId(req), {
        leagueId: creds.leagueId,
        leagueName: info.leagueName,
        teamId: myTeamId,
        teamName:
          info.myTeamName ?? info.teams.find((t) => t.id === myTeamId)?.name ?? null,
        savedAt: Date.now(),
      });
      res.json(espnStatus(userId(req), saved, league));
    } catch (err) {
      if (!espnError(err, res)) throw err;
    }
  }),
);

app.delete(
  '/api/espn',
  requireUser,
  asyncRoute(async (req, res) => {
    await setEspnLeague(userId(req), null);
    res.json(espnStatus(userId(req), null, null));
  }),
);

// Who is on a roster, keyed by MLB player id — which is what makes the research
// board's free-agent filter a set lookup on the id each row already carries.
// `?refresh=1` skips the ten-minute cache, for the user who has just made a move.
app.get(
  '/api/espn/ownership',
  requireUser,
  asyncRoute(async (req, res) => {
    const espn = await getEspnLeague(userId(req));
    if (!espn) {
      res.status(409).json({ error: 'No ESPN league connected', code: 'espn-missing' });
      return;
    }
    try {
      const creds = await getEspnCreds(userId(req));
      if (!creds) {
        res.status(409).json({ error: 'No ESPN league connected', code: 'espn-missing' });
        return;
      }
      const own = await getOwnership(creds, req.query.refresh === '1');
      res.json(own);
    } catch (err) {
      if (!espnError(err, res)) throw err;
    }
  }),
);

// **Which days this matchup period covers, and which the next one covers** —
// the two named spans the Schedule view offers a connected league, and nothing
// else. Two dates and a period number each; see `espn.ts::getMatchupWindow`
// for why they are *derived* rather than read off the scoreboard, whose own
// `start`/`end` truncate at today for the period being played and whose
// `nextPeriod` is null on it by construction.
//
// **A route of its own rather than a field on `/api/espn`**, which is
// assembled from the stored record alone and makes no ESPN read: a status
// every user fetches on boot has no business acquiring an upstream. And rather
// than a field on `/api/espn/ownership`, which is a *per-player* map on a
// ten-minute cache where this is a fact about the league's calendar on
// `leagueMeta`'s own minute — two answers with two lifetimes, and folding them
// would give the shorter one to both.
//
// 409 `espn-auth` on a rejected cookie like every route in this family, and a
// league whose period arithmetic cannot be read answers **null** rather than
// failing: the Schedule view then offers the two numeric spans it always had.
app.get(
  '/api/espn/matchup-window',
  requireUser,
  asyncRoute(async (req, res) => {
    const espn = await getEspnLeague(userId(req));
    if (!espn) {
      res.status(409).json({ error: 'No ESPN league connected', code: 'espn-missing' });
      return;
    }
    try {
      const creds = await getEspnCreds(userId(req));
      if (!creds) {
        res.status(409).json({ error: 'No ESPN league connected', code: 'espn-missing' });
        return;
      }
      res.json(await getMatchupWindow(creds, req.query.refresh === '1'));
    } catch (err) {
      if (!espnError(err, res)) throw err;
    }
  }),
);

// The league's own scoreboard: one matchup period's matchups, and every team's
// season-to-date total in each of the league's scoring categories.
//
// `?period=` names a matchup period — absent, the one being played; a period
// this league has no row for falls back to the current one rather than
// answering with an empty board the reader could not explain. `?refresh=1`
// skips the ten-minute cache, the same escape hatch the ownership and roster
// routes carry and for the same person, and reaches only the **live** period:
// a settled week is a fact and reads back off its blob.
//
// The response names the league's `format` in its own vocabulary, so a roto or
// a points league gets what it actually has rather than an empty category
// grid — see `espn.ts`, **The league scoreboard**.
app.get(
  '/api/espn/scoreboard',
  requireUser,
  asyncRoute(async (req, res) => {
    const raw = req.query.period;
    const period = typeof raw === 'string' && /^\d{1,3}$/.test(raw) ? Number(raw) : null;
    try {
      const creds = await getEspnCreds(userId(req));
      if (!creds) {
        res.status(409).json({ error: 'No ESPN league connected', code: 'espn-missing' });
        return;
      }
      res.json(await getScoreboard(creds, period, req.query.refresh === '1'));
    } catch (err) {
      if (!espnError(err, res)) throw err;
    }
  }),
);

// **One matchup period's categories day by day** — what a scoreboard cell
// cannot say and what the chart behind it draws: how each side's figure in a
// category moved through the week.
//
// A route of its own rather than a field on `/api/espn/scoreboard`, and that is
// the decision worth recording: the board is read by everybody who opens the
// League page and this is a week of ESPN rosters summed a day at a time, so
// folding it in would make every reader pay for a chart nobody may open. It is
// the split `/api/espn/matchup-window` already makes for the same page, from
// the other direction — that one is 103 bytes and is fetched once, this one is
// paid on the first press.
//
// `?period=` and `?refresh=1` mean exactly what they mean on the scoreboard
// beside it, and the refresh reaches only the live period: a day gone by is a
// finished day and reads back off its blob. A league that scores no categories
// answers with an empty series rather than an error, there being no chart to
// draw and nothing wrong.
app.get(
  '/api/espn/matchup-series',
  requireUser,
  asyncRoute(async (req, res) => {
    const raw = req.query.period;
    const period = typeof raw === 'string' && /^\d{1,3}$/.test(raw) ? Number(raw) : null;
    try {
      const creds = await getEspnCreds(userId(req));
      if (!creds) {
        res.status(409).json({ error: 'No ESPN league connected', code: 'espn-missing' });
        return;
      }
      res.json(await getMatchupSeries(creds, period, req.query.refresh === '1'));
    } catch (err) {
      if (!espnError(err, res)) throw err;
    }
  }),
);

/**
 * **What the roster is expected to do over a span** — one projected line per
 * player, which is what the Roster view's own `Projected` toggle draws.
 *
 * A route of its own rather than a field on `/api/report`, and for the reason
 * `/api/espn/projection` is one beside the scoreboard: that report is read on
 * every load of two views, and this joins four league-wide boards and the
 * league's schedule against the roster. Nobody who never presses the toggle
 * should pay for it.
 *
 * It takes the **same three parameters `/api/report` takes** — `start`/`end`,
 * `source=fantasy` and `teamId=` — and resolves the roster exactly the way that
 * route does, so the rows this describes are the rows that report describes.
 * Anything else would be two answers to "which players" a moment apart.
 *
 * **Only the games still to be played are projected.** `start` is clamped
 * forward to today inside `getRosterProjection`, and the client adds the
 * report's own lines for the days already played — the same *what has happened
 * plus what is left* shape the matchup card has, and what makes an arbitrary
 * range need no case of its own.
 *
 * **No ESPN league is needed** unless the reader asks for the fantasy roster:
 * every input is a league-wide board this app already holds. 409 `espn-auth` on
 * a rejected cookie like every route that does read one.
 */
app.get(
  '/api/projection/roster',
  requireUser,
  asyncRoute(async (req, res) => {
    const { start, end } = resolveDateRange(req.query.start, req.query.end);
    if (dayCount(start, end) > MAX_RANGE_DAYS) {
      res.status(400).json({ error: `date range too large (max ${MAX_RANGE_DAYS} days)` });
      return;
    }
    const teamParam = req.query.teamId;
    let teamId: number | null = null;
    if (typeof teamParam === 'string' && teamParam !== '') {
      const n = Number(teamParam);
      if (!Number.isInteger(n) || n <= 0) {
        res.status(400).json({ error: 'teamId must be a positive integer' });
        return;
      }
      teamId = n;
    }
    let watched: WatchPlayer[];
    // The lineup the projection fills, where there is one to fill. Only a
    // fantasy team has a lineup — a saved watchlist is a list of players and
    // nobody benches anyone on it — so this stays null for the other branch and
    // every row comes back with `lineup: null`.
    let fantasy: Parameters<typeof getRosterProjection>[3] = null;
    if (req.query.source === 'fantasy') {
      try {
        // The **end** of the range names which day's lineup the roster is read
        // at, exactly as `/api/report` reads it — so the players projected are
        // the players that report is about.
        const read = await fantasyWatchlist(userId(req), false, end, { start, end }, teamId);
        watched = read.players;
        // **No read of its own.** The roster is the one just returned, the slot
        // counts were stashed by the `mSettings` half of it, and the categories
        // come off the scoreboard's own cached minute — a projection that could
        // not read them falls back to seating by playing time, which is what
        // `seatValues` does with an empty list.
        const creds = await getEspnCreds(userId(req));
        if (creds) {
          const board = await getScoreboard(creds).catch(() => null);
          fantasy = {
            roster: read.endRoster ?? read.roster,
            leagueId: creds.leagueId,
            categories: board?.categories ?? [],
          };
        }
      } catch (err) {
        if (espnError(err, res)) return;
        throw err;
      }
    } else {
      ({ players: watched } = await getRosterForRange(userId(req), start, end));
    }
    res.json(await getRosterProjection(watched, start, end, fantasy));
  }),
);

/**
 * **Where a live matchup is heading** — every side's projected final total in
 * every category the league scores, which is what the Scoreboard's `Projected`
 * toggle swaps its figures for.
 *
 * A route of its own rather than a field on `/api/espn/scoreboard`, and it is the
 * split `/api/espn/matchup-window` and `/api/espn/matchup-series` already make
 * for the same page: that board is read by **everybody** who opens the League
 * page, and this is four league-wide boards joined against every roster in the
 * league. Folding it in would make every reader pay for a projection nobody may
 * ask for.
 *
 * `?period=` and `?refresh=1` mean what they mean on the scoreboard beside it,
 * and the refresh reaches only the projection's own minute — the boards under it
 * are cached on their own terms and warmed nightly.
 *
 * **A settled period answers `ok: false` with a `note` rather than an error.**
 * Nothing is wrong with a week that is over; there is simply nothing left to
 * project, and the client says so. 409 `espn-auth` on a rejected cookie like
 * every route in the family.
 */
app.get(
  '/api/espn/projection',
  requireUser,
  asyncRoute(async (req, res) => {
    const raw = req.query.period;
    const period = typeof raw === 'string' && /^\d{1,3}$/.test(raw) ? Number(raw) : null;
    try {
      const creds = await getEspnCreds(userId(req));
      if (!creds) {
        res.status(409).json({ error: 'No ESPN league connected', code: 'espn-missing' });
        return;
      }
      res.json(await getProjection(creds, period, req.query.refresh === '1'));
    } catch (err) {
      if (!espnError(err, res)) throw err;
    }
  }),
);

/**
 * The rosters of two teams on one day — the Matchup tab's roster view.
 *
 * **A list rather than a route per team**, because the reader opens both sides
 * at once and two round trips to draw one thing is two chances for half of it
 * to arrive. Capped at `MATCHUP_TEAMS` (2, which is what a matchup has) so a
 * hand-edited query cannot fan out across the league; ids past it are ignored
 * rather than a 400, the same direction every other parameter here fails in.
 *
 * `?date=` is which day's roster — the end of the matchup period the client is
 * looking at, clamped to today for a week still being played, so a settled week
 * shows the team that finished it and a live one shows the team as it stands.
 * Shape-checked and otherwise trusted, exactly as `/api/espn/roster` treats its
 * own; absent means today. **A team ESPN cannot answer for is `null` in the
 * map rather than an error**, so one side failing costs that side and leaves
 * the other standing — the rule the whole roster fan-out follows.
 */
const MATCHUP_TEAMS = 2;

app.get(
  '/api/espn/rosters',
  requireUser,
  asyncRoute(async (req, res) => {
    const raw = typeof req.query.teams === 'string' ? req.query.teams : '';
    const teams = raw
      .split(',')
      .map((t) => Number(t))
      .filter((t) => Number.isInteger(t) && t > 0)
      .slice(0, MATCHUP_TEAMS);
    if (teams.length === 0) {
      res.status(400).json({ error: 'teams must be a comma-separated list of team ids' });
      return;
    }
    const asked = req.query.date;
    const date =
      typeof asked === 'string' && DATE_RE.test(asked) ? asked : baseballToday();
    try {
      const creds = await getEspnCreds(userId(req));
      if (!creds) {
        res.status(409).json({ error: 'No ESPN league connected', code: 'espn-missing' });
        return;
      }
      const rosters: Record<string, EspnRosterPlayer[] | null> = {};
      await Promise.all(
        teams.map(async (teamId) => {
          try {
            rosters[teamId] = await getRosterOn(creds, teamId, date);
          } catch (err) {
            console.error(`ESPN roster for team ${teamId} on ${date} unavailable:`, err);
            rosters[teamId] = null;
          }
        }),
      );
      res.json({ date, rosters });
    } catch (err) {
      if (!espnError(err, res)) throw err;
    }
  }),
);

// The League page's **Rankings** tab: every team's figure in each of the
// league's scoring categories, and where that figure stands, over one of four
// spans.
//
// `?span=` is `matchup | season | first | second`; anything else — including a
// half this league has no periods for — falls back to `season` rather than
// answering with an empty table, the same way `?period=` falls back to the
// current matchup. **Which spans can be served at all is on the response**
// (`spans`), because that is a fact about the league rather than about the
// request: a league that publishes no matchup count has no halves at all, and
// one in April has no second half yet, so the tab strip is drawn from what
// comes back rather than from a list the client holds. `?refresh=1` as
// everywhere else, reaching the span that includes the week being played and
// leaving the settled ones on their blobs — see `espn.ts`, **The Rankings tab**.
//
// **`?projected=1` swaps the figures for where the week is heading** and lets
// the ranking arithmetic fall out over them — so what comes back is the same
// table read against the end of the matchup rather than against today. It is a
// parameter on this route rather than a route of its own, which is where it
// parts from `/api/espn/projection` beside it: that one answers a *different
// question* (each side's totals, for the matchup card), where this is the same
// question this route already answers with one input swapped, and every rank,
// point and `OVR` on it has to be computed by the same code that computes the
// live one or the two would be two arithmetics. It reaches only the `matchup`
// span of a week still being played (`projectable` on the response); anywhere
// else it is ignored and the figures come back live with `projected: false`,
// which is what lets the client draw no toggle rather than a dead one.
app.get(
  '/api/espn/rankings',
  requireUser,
  asyncRoute(async (req, res) => {
    const raw = req.query.span;
    // The five spans, validated against the union rather than trusted. An
    // unrecognized one is null, which `getRankings` reads as "the default",
    // so an older tab's `?span=` is a season rather than an error.
    const span =
      raw === 'season' ||
      raw === 'matchup' ||
      raw === 'first' ||
      raw === 'second' ||
      raw === 'playoffs'
        ? raw
        : null;
    // **And `?period=` — one matchup week, off the league's own calendar.** It
    // is not a sixth value of `span=` because it is not one of the five the
    // strip offers: it names a week, and a week is a number. Validated to
    // digits here and against the league's own schedule in `getRankings`,
    // which is the only place that knows which periods exist — an unknown one
    // falls back to the span beside it rather than 400ing, the direction every
    // unrecognized value on this page falls in.
    const rawPeriod = req.query.period;
    const period =
      typeof rawPeriod === 'string' && /^\d{1,3}$/.test(rawPeriod) ? Number(rawPeriod) : null;
    try {
      const creds = await getEspnCreds(userId(req));
      if (!creds) {
        res.status(409).json({ error: 'No ESPN league connected', code: 'espn-missing' });
        return;
      }
      res.json(
        await getRankings(
          creds,
          span,
          req.query.refresh === '1',
          req.query.projected === '1',
          period,
        ),
      );
    } catch (err) {
      if (!espnError(err, res)) throw err;
    }
  }),
);

// The League page's **Transactions** tab: who added, dropped and traded whom,
// most recent first. One read of ESPN's own activity feed, reduced to the
// moves and joined to MLB ids so a name can open the player page — see
// `espn.ts`, **The Transactions tab**, which also records the four endpoints
// that look as though they should answer this and don't.
app.get(
  '/api/espn/transactions',
  requireUser,
  asyncRoute(async (req, res) => {
    try {
      const creds = await getEspnCreds(userId(req));
      if (!creds) {
        res.status(409).json({ error: 'No ESPN league connected', code: 'espn-missing' });
        return;
      }
      res.json(await getTransactions(creds, req.query.refresh === '1'));
    } catch (err) {
      if (!espnError(err, res)) throw err;
    }
  }),
);

// Which list the roster views read from. A route of its own like the three
// above; the saved roster is stored as the absence of an entry. **`'watchlist'`
// is accepted as a synonym for `'saved'`** — it is what the client called this
// before the two lists were told apart, and a tab open across a deploy is still
// sending it.
app.put(
  '/api/prefs/roster-source',
  requireUser,
  asyncRoute(async (req, res) => {
    const { source } = (req.body ?? {}) as { source?: unknown };
    if (source !== 'saved' && source !== 'watchlist' && source !== 'fantasy') {
      res.status(400).json({ error: "source must be 'saved' or 'fantasy'" });
      return;
    }
    res.json(await setRosterSource(userId(req), source === 'fantasy' ? 'fantasy' : 'saved'));
  }),
);

// Every player in the league on one board, season to date — the research
// table. Unlike /api/report this is roster-independent and season-wide: it
// is a league leaderboard to sort and filter, not a read on the range in view.
app.get(
  '/api/research',
  requireUser,
  asyncRoute(async (req, res) => {
    const kind = req.query.type === 'pitcher' ? 'pitcher' : 'batter';
    // An unrecognized window is the season, not a 400: the param is a view
    // preference carried in a shareable URL, and an older link naming a window
    // this build no longer offers should still open the board.
    const asked = Number(req.query.window);
    const window: ResearchWindow = RESEARCH_WINDOWS.includes(asked as ResearchWindow)
      ? (asked as ResearchWindow)
      : 'season';
    const { season, rows } = await getResearch(kind, window);
    res.json({ season, kind, window, rows });
  }),
);

// The same board read as thirty clubs — one row per MLB team, carrying that
// club's aggregate over the same window. A route of its own rather than a
// parameter on the one above, because it is a different population off
// different upstreams and a different blob; what it shares is the row shape, so
// the client draws it with the board's own column vocabulary.
app.get(
  '/api/research/teams',
  requireUser,
  asyncRoute(async (req, res) => {
    const kind = req.query.type === 'pitcher' ? 'pitcher' : 'batter';
    // Unrecognized falls back to the season, for the reason the player board's
    // does: the param rides in a shareable URL.
    const asked = Number(req.query.window);
    const window: ResearchWindow = RESEARCH_WINDOWS.includes(asked as ResearchWindow)
      ? (asked as ResearchWindow)
      : 'season';
    const { season, rows } = await getTeamResearch(kind, window);
    res.json({ season, kind, window, rows });
  }),
);

/**
 * **The same board, projected** — every player in the league over a span of days
 * nobody has played yet, which is what the research board's own `Projected`
 * toggle swaps its figures for.
 *
 * A route of its own rather than a parameter on `/api/research`, and for the
 * two reasons `/api/projection/roster` is one beside `/api/report`: that board
 * is a **cached blob** keyed by kind and window, served warm to every reader
 * alike, where this is a computation over a span the reader picked; and it joins
 * four league-wide boards and the league's schedule, which nobody who never
 * presses the toggle should pay for.
 *
 * **No ESPN league is needed**, exactly as the roster's lens needs none: every
 * input is a board this app already holds. What a connected league adds is the
 * span the toggle opens on — the rest of this matchup period — and that is the
 * client's arithmetic, not this route's.
 *
 * **`start`/`end` take `/api/report`'s own resolution and its own ceiling**, so
 * a link that opens the board on a span is read the way a link that opens the
 * roster on one is, and a range nobody could draw is a 400 rather than a
 * minute of projection.
 */
app.get(
  '/api/research/projected',
  requireUser,
  asyncRoute(async (req, res) => {
    const kind = req.query.type === 'pitcher' ? 'pitcher' : 'batter';
    const { start, end } = resolveDateRange(req.query.start, req.query.end);
    if (dayCount(start, end) > MAX_RANGE_DAYS) {
      res.status(400).json({ error: `date range too large (max ${MAX_RANGE_DAYS} days)` });
      return;
    }
    res.json(await getBoardProjection(kind, start, end));
  }),
);

/**
 * **One man in one game** — what the game preview draws, and the third question
 * `projection.ts` is asked.
 *
 * A route of its own for the reason `/api/projection/roster` is one: it is a
 * computation over a fixture the reader pressed, and a dialog nobody opens
 * should cost nothing. It is **lazy on the press** rather than on a toggle,
 * which is the only difference — the dialog opens on the park and the split it
 * already holds, and this lands underneath them.
 *
 * **The `gamePk` is the narrowing, not the date.** A doubleheader is two games
 * on one day and a preview is opened on one of them; the date rides along
 * because it is what the projection's context is built for, and the two are
 * checked against each other inside `getGameProjection` — a game that is not the
 * player's club's on that day comes back empty rather than as somebody else's
 * line.
 *
 * **No ESPN league is needed**, exactly as neither lens needs one: every input
 * is a board this app already holds, so a reader with a saved watchlist and no
 * connection gets the same answer.
 */
app.get(
  '/api/projection/game',
  requireUser,
  asyncRoute(async (req, res) => {
    const kind = req.query.kind === 'pitcher' ? 'pitcher' : 'batter';
    const playerId = Number(req.query.playerId);
    const gamePk = Number(req.query.gamePk);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      res.status(400).json({ error: 'playerId must be a positive integer' });
      return;
    }
    if (!Number.isInteger(gamePk) || gamePk <= 0) {
      res.status(400).json({ error: 'gamePk must be a positive integer' });
      return;
    }
    const date = req.query.date;
    if (typeof date !== 'string' || !DATE_RE.test(date)) {
      res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      return;
    }
    res.json(await getGameProjection(kind, playerId, gamePk, date));
  }),
);

/**
 * The thirty clubs, by id — name and abbreviation, nothing else.
 *
 * A route rather than a table shipped in the client bundle, for the reason
 * `/api/players` is one: it is MLB's own list, and a curated copy of it in the
 * client is a copy that goes stale silently when a club moves or renames. It is
 * the same cached fetch that already names a player's club on every row of
 * `/api/players`, so this costs no upstream call in practice.
 *
 * Unauthenticated it is not: nothing in this app is except health and config,
 * and there is no reason for this to be the exception.
 */
app.get(
  '/api/teams',
  requireUser,
  asyncRoute(async (_req, res) => {
    res.json({ teams: await getTeamList() });
  }),
);

/**
 * **Every ballpark's Statcast park factors for the season, all three hitter
 * hands** — the team page's Park tab, and the line a game preview draws above
 * the split or the lineup it opens on.
 *
 * One route for every park rather than one per club, and that is the same
 * bargain `/api/teams/:teamId/hitting` strikes by answering with all three
 * venues at once: the payload is thirty-three parks of sixteen small integers
 * three times over — **22,826 bytes of JSON, 4,423 gzipped, measured** — so a
 * client that holds one copy can answer for the club whose page is open, for
 * the park a fixture is at three days from now, and for the neutral site
 * nobody is at home in, having asked once.
 *
 * **The venue join was measured against the whole 2026 schedule before anything
 * was built on it**: 33 of the 34 venues the season is played at have a park
 * factor, and the one that does not is Journey Bank Ballpark — the Little
 * League Classic, one game, too few plate appearances for Savant to index at
 * all — which draws nothing rather than a borrowed number. The same count is
 * the argument for joining on the venue: **10 games this season are not at the
 * home club's own park**, and every one of them is a game a `homeId` join would
 * have quietly labeled with the wrong park's numbers.
 *
 * **This route 502s honestly**, where every enrichment in this server costs its
 * own column and nothing more. That is the `/api/schedule` exception and the
 * same test: the answer *is* the table. A park factor drawn as a dash because
 * the upstream was down is indistinguishable from a park Savant has no index
 * for, and this is the one reading in the app where the difference between
 * "average park" and "we could not ask" is the whole of the fact.
 */
app.get(
  '/api/park-factors',
  requireUser,
  asyncRoute(async (_req, res) => {
    res.json(await getParkFactors());
  }),
);

/**
 * **One club's row on each of the five spans** — the team page's Stats tab, and
 * the exact shape and route pattern `/api/players/:playerId/windows` answers
 * in, because it is the same table transposed onto a different population.
 *
 * It takes **no `cut`**, where the player route does. A split is a cut of the
 * same board (`hfSplit` on Savant's), and the team boards this reads are summed
 * a day at a time from exports that carry no club-level split at all — see
 * `teamResearch.ts`. Offering the parameter and ignoring it is the failure mode
 * that file's own header warns about: an endpoint that accepts a selection and
 * quietly answers something else. A club's platoon reading has a home already,
 * and it is the nine cuts of `/api/teams/:teamId/hitting`.
 */
app.get(
  '/api/teams/:teamId/windows',
  requireUser,
  asyncRoute(async (req, res) => {
    const teamId = Number(req.params.teamId);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      res.status(400).json({ error: 'invalid teamId' });
      return;
    }
    const kind = req.query.type === 'pitcher' ? 'pitcher' : 'batter';
    res.json(await getTeamWindows(teamId, kind));
  }),
);

/**
 * **A club's season, backwards** — every game it has played or is playing, with
 * the score in it. The Results tab on its page, and the doors into a game's own
 * page that tab is made of.
 *
 * It is the mirror of `/api/schedule` rather than a second copy of it: that one
 * is the forward window every surface in the app shares, deliberately thin
 * because a game ahead has no score. This one is a season and the score is the
 * whole of what it carries — which is what makes the tab possible, the team
 * page's own document having refused a game log on exactly the grounds that
 * *"the scores are not on the wire"*.
 *
 * **Fixtures are not in it.** A row here with two dashes where the score goes
 * would be the Schedule tab's answer at lower resolution, in a list whose one
 * column is the score.
 */
app.get(
  '/api/teams/:teamId/games',
  requireUser,
  asyncRoute(async (req, res) => {
    const teamId = Number(req.params.teamId);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      res.status(400).json({ error: 'invalid teamId' });
      return;
    }
    res.json({ games: await getTeamGames(teamId) });
  }),
);

/**
 * **One game, whole** — the line score, both clubs' box scores and rosters, and
 * the play stream. The game page, which a live or finished opponent cell and a
 * club's Results tab both open.
 *
 * **This route 502s honestly**, which is the `/api/schedule` exception and the
 * same test: the answer *is* the page. Everywhere else in this server a dead
 * upstream costs its own column and nothing more, because there is a table
 * around it still standing; here there is nothing else on screen, and a page of
 * dashes would be indistinguishable from a game nobody played.
 *
 * See `game.ts` for why this reads the feed again rather than widening
 * `StatsApiGame`, and for the measured cost of the field filter it reads it
 * with.
 */
app.get(
  '/api/games/:gamePk',
  requireUser,
  asyncRoute(async (req, res) => {
    const gamePk = Number(req.params.gamePk);
    if (!Number.isInteger(gamePk) || gamePk <= 0) {
      res.status(400).json({ error: 'invalid gamePk' });
      return;
    }
    res.json(await getGameReport(gamePk));
  }),
);

/**
 * **The game's plays, as the feed draws them** — every plate appearance and
 * every base-running event, with the pitches, the batted ball, the expected
 * numbers and the clip.
 *
 * The day pipeline's own `PlayerReport`s, narrowed to this one game, so that
 * the client can draw them with `playerDayEntries` and `FeedItem` — the same
 * two functions the roster's stream and the player page's Overview use, which
 * is what stops the three readings disagreeing about what happened.
 *
 * **A route of its own rather than a field on `GameReport`**, and read when the
 * tab opens: it is ~150KB and a `getDay`, and a reader who came for the box
 * score never pays for it. See `game.ts::getGamePlays` for the measurements.
 */
app.get(
  '/api/games/:gamePk/plays',
  requireUser,
  asyncRoute(async (req, res) => {
    const gamePk = Number(req.params.gamePk);
    if (!Number.isInteger(gamePk) || gamePk <= 0) {
      res.status(400).json({ error: 'invalid gamePk' });
      return;
    }
    res.json({ reports: await getGamePlays(gamePk) });
  }),
);

// What is true of a player *today* — his roster status, and where his club's
// game has him — for every player the league has something to say about. The
// research board and the details view both open on players who are not on the
// watchlist and so have no report to read this off; this is that handful of
// facts without the report. Keyed by player id, and only the players with a
// status worth drawing are in it (see `getPlayerStatuses`).
app.get(
  '/api/statuses',
  requireUser,
  asyncRoute(async (_req, res) => {
    // **Two maps, one day.** `clubs` is what the research board's `Opp` column
    // falls back to for a man today's boxscores do not carry — optioned, on the
    // IL, or in the minors entirely — which is what the summary table has
    // always shown him off his report. Both come off the same cached `getDay`,
    // so the second costs one pass over at most fifteen games; thirty entries
    // against the player map's ~1,300. See `getClubStatuses`.
    const [players, clubs] = await Promise.all([getPlayerStatuses(), getClubStatuses()]);
    res.json({ players: Object.fromEntries(players), clubs: Object.fromEntries(clubs) });
  }),
);

app.get(
  '/api/percentiles/:playerId',
  requireUser,
  asyncRoute(async (req, res) => {
    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      res.status(400).json({ error: 'invalid playerId' });
      return;
    }
    const yearQ = Number(req.query.year);
    const year = Number.isInteger(yearQ) && yearQ >= 2015 ? yearQ : undefined;
    const kind = req.query.type === 'pitcher' ? 'pitcher' : 'batter';
    // **A cut of the season, on the same route because it is the same card** —
    // same sections, same keys, same two densities, fewer rows. A second route
    // would be a second shape for the client to hold and a second place for the
    // two to drift, which is the argument the windows route below already makes
    // for its own cut.
    //
    // An unrecognized `cut` falls back to the full season rather than 400ing,
    // the client's own rule for a parameter it does not know arriving in a
    // link: fall back rather than empty the view.
    // A cut is the **current** season's or nothing — see `getCutPercentiles`,
    // which has no year to take because both halves of the card it builds are
    // pinned to this one. Asked for a cut of 2023, the honest answer is that
    // season's uncut card rather than this season's numbers under its heading.
    const cut = year === undefined ? PLAYER_CUTS.find((c) => c === req.query.cut) : undefined;
    res.json(
      cut
        ? await getCutPercentiles(playerId, kind, cut)
        : await getPercentiles(playerId, year, kind),
    );
  }),
);

// One player's row on each of the research board's five windows — the player
// page's **Stats** tab, which is that board transposed: windows down the side,
// the board's own stat columns across the top.
//
// It goes through `getResearch` rather than around it (see `getPlayerWindows`),
// so the number on this tab and the number on the board are the same number and
// cannot drift. That also makes it free in practice: the ten boards are pulled
// warm nightly by `warmer.ts` and cached six hours, so this is five map lookups.
app.get(
  '/api/players/:playerId/windows',
  requireUser,
  asyncRoute(async (req, res) => {
    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      res.status(400).json({ error: 'invalid playerId' });
      return;
    }
    const kind = req.query.type === 'pitcher' ? 'pitcher' : 'batter';
    // **And the same five spans cut four ways**, on the same route because it is
    // the same table — five rows, the same columns, `row: null` for a span he
    // has nothing in. A second route would be a second shape for the client to
    // hold and a second place for the two to drift.
    //
    // An unrecognized `cut` falls back to the uncut board rather than 400ing,
    // which is the client's own rule for a parameter it does not know arriving
    // in a link: fall back rather than empty the view.
    const cut = SPLIT_CUTS.find((c) => c === req.query.cut);
    res.json(cut ? await getPlayerCutWindows(playerId, kind, cut) : await getPlayerWindows(playerId, kind));
  }),
);

/**
 * How one team has **hit or pitched** over a window — whole, at home, on the
 * road, and each of those by the other man's hand. The opponent table on a
 * pitcher's game, and the team page's Splits tab.
 *
 * The report already carries the **season, all games, batting** cut for every
 * opponent a watched pitcher has in view, so that table draws its opening state
 * with no request at all; this serves the four other windows, and it serves all
 * nine cuts of whichever one is asked for so that changing the *venue* costs
 * nothing. `window` is shape-checked against the board's own five and anything
 * else is the season, the rule `/api/research` follows for the same parameter:
 * it is a view preference in a shareable URL, and an older link should still
 * open. `side` falls back the same way, to `batting`.
 *
 * **`/hitting` is registered beside `/splits` and answers the batting side
 * whatever it is asked** — the rule `/api/watchlist` follows for its own name
 * and `?start=1` for its parameter: a tab open at the moment of a deploy is
 * still asking for the old path, and it still gets the right answer. What the
 * path may not do is answer `side=pitching`, which would be a route called
 * `hitting` returning a club's pitching line — the kind of drift the whole
 * codebase spends its comments on. The new name is the honest one because the
 * table is not about hitting any more; it is about a split.
 */
const teamSplitsRoute = asyncRoute(async (req, res) => {
  const teamId = Number(req.params.teamId);
  if (!Number.isInteger(teamId) || teamId <= 0) {
    res.status(400).json({ error: 'invalid teamId' });
    return;
  }
  const asked = Number(req.query.window);
  const window: TeamHittingWindow = TEAM_HITTING_WINDOWS.includes(asked as TeamHittingWindow)
    ? (asked as TeamHittingWindow)
    : 'season';
  const side: TeamSplitSide =
    req.path.endsWith('/hitting') || req.query.side !== 'pitching' ? 'batting' : 'pitching';
  res.json(await getTeamHitting(teamId, window, side));
});
app.get('/api/teams/:teamId/splits', requireUser, teamSplitsRoute);
app.get('/api/teams/:teamId/hitting', requireUser, teamSplitsRoute);

// A player's season line and platoon splits (vs LHP / vs RHP), for the details
// view. The report already carries these for watchlisted players; this serves the
// details view when it's opened for a player who isn't on the watchlist.
app.get(
  '/api/players/:playerId/splits',
  requireUser,
  asyncRoute(async (req, res) => {
    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      res.status(400).json({ error: 'invalid playerId' });
      return;
    }
    if (req.query.type === 'pitcher') {
      // Both ERA-scale estimators, fetched alongside the line rather than after
      // it. xERA is one league-wide leaderboard, cached and shared across every
      // pitcher; xFIP needs *this* pitcher's own season CSV for a fly-ball count,
      // which is the same blob the Arsenal tab opens on and is already warm for a
      // watched pitcher (his report pulled it). Neither may take the line down
      // with it — a failed estimator costs one number, not the whole tab — so the
      // CSV's throw is caught here and `getPitcherXera` swallows its own.
      const [pitcherStats, xera, arsenal] = await Promise.all([
        getPitcherStats([playerId]),
        getPitcherXera(),
        getSeasonArsenal(playerId).catch(() => null),
      ]);
      const stats = pitcherStats.get(playerId);
      res.json({
        season: withEstimators(
          stats?.season ?? null,
          arsenal?.battedBalls,
          xera.get(playerId),
        ),
        vsLeft: stats?.vsLeft ?? null,
        vsRight: stats?.vsRight ?? null,
        kind: 'pitcher',
      });
      return;
    }
    const stats = (await getPlayerStats([playerId])).get(playerId);
    res.json({
      season: stats?.season ?? null,
      vsLeft: stats?.vsLeft ?? null,
      vsRight: stats?.vsRight ?? null,
      kind: 'batter',
    });
  }),
);

// One player's day, for the player page's Overview tab and the Game Log's
// per-game popup — the same `PlayerReport` shape `/api/report` returns, for one
// player over one date. Both callers open on players nobody has rostered, which
// is why this exists beside the roster-shaped report rather than inside it; see
// `getPlayerDay`, which reuses that very function so the Overview and the feed
// can never disagree about what happened.
//
// `date` defaults to the **server's** baseball today rather than the client's,
// which is the right way round: the client mirrors the 3am ET rule for its date
// presets, and a tab left open past the rollover would otherwise ask for
// yesterday. The Game Log passes a date explicitly, that being the whole point
// of the row it was opened from.
app.get(
  '/api/players/:playerId/day',
  requireUser,
  asyncRoute(async (req, res) => {
    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      res.status(400).json({ error: 'invalid playerId' });
      return;
    }
    const kind = req.query.type === 'pitcher' ? 'pitcher' : 'batter';
    const asked = req.query.date;
    // Shape-checked and otherwise trusted, the way `/api/espn/roster` treats
    // its own `date`: a day nothing was played on is an empty report, not an
    // error, and `getDay` answers for any date the schedule has.
    const date =
      typeof asked === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : baseballToday();
    res.json({ date, kind, player: await getPlayerDay(playerId, kind, date) });
  }),
);

// What a player has coming, for a day that holds no game of his — the other
// half of the Overview tab's middle section. `?start=1` asks for his next
// **announced start** rather than his club's next game, and that flag is the
// client's to set: `lib.ts::isRotationStarter` is the app's one definition of
// who works out of the rotation, and restating it here would be a second one
// free to drift. The answer carries the flag back (`NextGameInfo.start`) so the
// block can say "next start not yet scheduled" rather than nothing at all.
app.get(
  '/api/players/:playerId/next-game',
  requireUser,
  asyncRoute(async (req, res) => {
    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      res.status(400).json({ error: 'invalid playerId' });
      return;
    }
    res.json(await getNextGame(playerId, req.query.start === '1'));
  }),
);

// A pitcher's next several starts — the ones his club has named him for, and,
// past those, the ones his own rotation slot puts him in. The player page's
// **Projected Starts** block, which is the sentence `next-game` above could only
// answer with "not yet scheduled": a rotation turn is named a few days out, so
// for most of the month the honest answer to "when does he pitch next" is one
// nobody has published and everybody can work out.
//
// **No `?type=`**, unlike its neighbors: a rotation slot is a fact about a
// pitcher, so there is no batting half of this question to ask for. Whether the
// player *is* a rotation starter is still not decided here — `projectedStarts.ts`
// answers honestly for whoever is asked and says `not-a-starter` when there are
// no starts to read a cadence off, and the client draws the block only for a man
// `lib.ts::isRotationStarter` places in the rotation, which is the app's one
// definition of that and has no business being restated on the server.
app.get(
  '/api/players/:playerId/projected-starts',
  requireUser,
  asyncRoute(async (req, res) => {
    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      res.status(400).json({ error: 'invalid playerId' });
      return;
    }
    res.json(await getProjectedStarts(playerId));
  }),
);

// A player's latest news — the player page's **News** tab and the section that
// previews it on the Overview. Assembled from two upstreams because there is no
// per-player news API from anybody: `news.ts` opens with the five endpoints
// that were tried and what each of them does instead, so nobody has to probe
// them again.
//
// The player's **name is resolved here rather than taken from the query**, the
// way `/day` resolves its own: the name is what the article join turns on, and
// a name the caller supplied is a name the caller could get wrong. A failure in
// either half costs that half and nothing else — the module catches per source,
// so this route answers `{ items: [] }` rather than 502ing a page that has
// every other tab already drawn.
app.get(
  '/api/players/:playerId/news',
  requireUser,
  asyncRoute(async (req, res) => {
    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      res.status(400).json({ error: 'invalid playerId' });
      return;
    }
    res.json(await getPlayerNews(playerId));
  }),
);

// Who in the league has news today or yesterday, keyed by MLB player id — the
// mark beside a player's name on the two roster tables and on his own page.
//
// One call for the whole league rather than a lookup per player, and that is
// the whole design rather than an optimisation: the research board draws six
// hundred names at once, so the per-player `/news` route above could never
// answer for it. `recentNews.ts` opens with the league-wide endpoints that were
// probed and what each of them does instead, including the RotoWire feed that
// looks like the answer and reaches back only a few hours.
//
// **Only the players with news in the window are in it**, the rule `/api/statuses`
// follows: an id that is absent has no recent news, which is most of the league.
// The day is the server's own `baseballToday()` rather than anything the client
// sends — one definition of "today" beats two that agree most of the time.
app.get(
  '/api/news/recent',
  requireUser,
  asyncRoute(async (_req, res) => {
    res.json({ players: Object.fromEntries(await getRecentNews()) });
  }),
);

/* ────────────────────────────────────────────────────────────────────────────
 * The MLB view's three routes
 *
 * The league itself, rather than a roster or a fantasy league: the day's games,
 * where the thirty clubs stand, and what has been said about them. All three
 * are **league-wide and user-independent**, the class `getPlayerPool` is in, so
 * each is one upstream read shared by every reader — which is why all three are
 * behind `requireUser` like everything else and none of them takes a user id.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * **One ET day's games** — the Scoreboard tab, and the doors into each game's
 * own page it is made of.
 *
 * A third schedule read beside `/api/schedule` (the forward window, thin, no
 * scores) and `/api/teams/:id/games` (one club's season backwards, fixtures
 * dropped), because it asks a third question: one day, both directions, every
 * club. `mlbScoreboard.ts` carries the measurements — 11,425 bytes for a
 * finished day of ten games with the linescore, both probables and the three
 * decisions hydrated onto it.
 *
 * **The date is the caller's**, unlike `/api/news/recent` whose day is the
 * server's own: the tab has arrows and a calendar, so most reads are not of
 * today. An unparseable one falls back to today rather than 400ing, which is
 * `/api/research`'s rule for a param carried in a shareable URL — a link naming
 * a day this build cannot read should still open the board.
 *
 * **This route 502s honestly**, the `/api/schedule` exception: the answer *is*
 * the board, and a day drawn empty because MLB was down is indistinguishable
 * from an All-Star break.
 */
app.get(
  '/api/mlb/scoreboard',
  requireUser,
  asyncRoute(async (req, res) => {
    const asked = req.query.date;
    const date = typeof asked === 'string' && DATE_RE.test(asked) ? asked : baseballToday();
    res.json(await getMlbScoreboard(date));
  }),
);

/**
 * **Where the thirty clubs stand** — the Standings tab.
 *
 * One board and it is the season: MLB's own standings, which is the only
 * authority on a club's record and the only place games behind, the wild-card
 * race, the magic number and the split records exist at all.
 *
 * **It took a `span=` and does not.** The tab offered five spans with the whole
 * board recomputed for a window; three columns beside `L10` — the last thirty
 * games and the two halves of the season — say more of what that control was
 * reached for and say it on the row the record is already on. Those three are
 * not on `/api/v1/standings` at any span, so `mlbStandings.ts` walks the
 * season's own schedule for them, and the measurement that says the walk agrees
 * with MLB on all thirty clubs is beside it, along with the one line of
 * deduplication it rests on.
 *
 * **This route 502s honestly** — the `/api/schedule` exception, the answer being
 * the table itself. The three computed columns are the exception to *that*: they
 * are an enrichment on a board that stands without them, so each read is in its
 * own `try` and a failure costs its own columns and nothing more.
 */
app.get(
  '/api/mlb/standings',
  requireUser,
  asyncRoute(async (_req, res) => {
    res.json(await getMlbStandings());
  }),
);

// A player's game-by-game season log, for the details view's Game Log tab —
// every game he appeared in, newest first. Kept off the report because it spans
// the whole season rather than the report's range, and off the Season tab
// because that tab is the season as one line, this is the season as 150 of them.
app.get(
  '/api/players/:playerId/gamelog',
  requireUser,
  asyncRoute(async (req, res) => {
    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      res.status(400).json({ error: 'invalid playerId' });
      return;
    }
    const yearQ = Number(req.query.year);
    const season = Number.isInteger(yearQ) && yearQ >= 2015 ? yearQ : undefined;
    if (req.query.type === 'pitcher') {
      res.json({ kind: 'pitcher', games: await getPitcherGameLog(playerId, season) });
      return;
    }
    // `gaps` rides beside `games` rather than merged into it — see
    // `gameLog.ts::getBatterLog`. Everything already reading `games` reads
    // exactly the list it always has.
    res.json({ kind: 'batter', ...(await getBatterLog(playerId, season)) });
  }),
);

// A player's season per-PA xwOBA sequence, for the details view's rolling-xwOBA
// chart (the client computes the rolling averages for the selected window). For a
// pitcher (?type=pitcher) it's xwOBA allowed.
app.get(
  '/api/players/:playerId/xwoba',
  requireUser,
  asyncRoute(async (req, res) => {
    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      res.status(400).json({ error: 'invalid playerId' });
      return;
    }
    const kind = req.query.type === 'pitcher' ? 'pitcher' : 'batter';
    res.json(await getXwobaSeries(playerId, kind));
  }),
);

// A pitcher's season pitch arsenal, for the details view's Arsenal tab: usage,
// velo/spin/break vs the league, and the season results each pitch produced.
// (The per-game version rides along on the report as `PitchMix`.)
app.get(
  '/api/players/:playerId/arsenal',
  requireUser,
  asyncRoute(async (req, res) => {
    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      res.status(400).json({ error: 'invalid playerId' });
      return;
    }
    // Two independent reads: the arm angle is its own league-wide leaderboard
    // (`armAngle.ts`) on its own cache, so it costs this route nothing on a warm
    // one and resolves to null rather than throwing on a cold failure.
    const [arsenals, armAngle] = await Promise.all([
      getSeasonArsenal(playerId),
      getArmAngle(playerId),
    ]);
    const toPitches = (arsenal: Arsenal): SeasonArsenalPitch[] => {
      const total = [...arsenal.values()].reduce((sum, p) => sum + p.count, 0);
      return [...arsenal.entries()]
        .map(([pitchType, p]) => {
          const lg = getLeaguePitchAverage(pitchType, arsenals.hand);
          // League hBreak is a magnitude; orient it to this pitcher's own
          // direction so the signed comparison reads correctly (same as the
          // per-game baselines in savant.ts::attachArsenalBaselines).
          const dir = (p.hBreak ?? 0) < 0 ? -1 : 1;
          const spread = getLeaguePitchSpread(pitchType);
          return {
            pitchType,
            count: p.count,
            strikes: p.strikes,
            // Share of the pitches in THIS view, so a split's usage adds to 100%.
            share: total ? p.count / total : 0,
            velo: p.velo,
            spin: p.spin,
            hBreak: p.hBreak,
            vBreak: p.vBreak,
            leagueVelo: lg?.velo ?? null,
            leagueSpin: lg?.spin ?? null,
            leagueHBreak: lg?.hBreak == null ? null : Math.abs(lg.hBreak) * dir,
            leagueVBreak: lg?.vBreak ?? null,
            leagueHRange: spread.hRange,
            leagueVRange: spread.vRange,
            pa: p.pa,
            ba: p.ba,
            slg: p.slg,
            woba: p.woba,
            xwoba: p.xwoba,
            whiff: p.whiff,
            putAway: p.putAway,
          };
        })
        .sort((a, b) => b.count - a.count);
    };
    res.json({
      pitches: toPitches(arsenals.all),
      // Null rather than empty when he's faced nobody of that hand, so the
      // client knows not to offer the tab at all.
      vsRight: arsenals.vsRight.size ? toPitches(arsenals.vsRight) : null,
      vsLeft: arsenals.vsLeft.size ? toPitches(arsenals.vsLeft) : null,
      // Which season this is, from the one place that decides it — the same
      // way the rolling-xwOBA payload names its own, rather than the client
      // keeping a second copy of the constant.
      season: ARSENAL_SEASON,
      // Which arm he throws with, so the chart can label its league line
      // `RHP AVG` / `LHP AVG` rather than a blended "League" — and so that line
      // is actually the one it names (a right-hander throws 0.9–2.0 mph harder
      // at every pitch type, so a blended figure marks a lefty down for being
      // left-handed).
      hand: arsenals.hand,
      armAngle,
      // One array carrying the batter's side per pitch, rather than three — the
      // client cuts it for the split tabs, so the three views cannot come to
      // disagree about where a pitch broke.
      samples: arsenals.samples,
    });
  }),
);

// Resolve the direct .mp4 URL for a play's Statcast video (lazy, on demand).
/**
 * **Which plays in these games have a highlight** — the feed's `Video` lens,
 * answered a game at a time rather than a play at a time.
 *
 * Registered **before** `/api/video/:playId`, which would otherwise match
 * `clips` and reject it as a malformed playId: Express tries routes in order.
 *
 * A **set of games in one request** rather than a route per game, because the
 * caller is a stream that draws a day's worth of them and would otherwise open
 * fifteen connections to ask one question. Capped at `MAX_CLIP_GAMES`, which is
 * comfortably a full slate; anything past it is dropped rather than the request
 * refused, the lens degrading to "no film known for that game" exactly as a
 * failed read does.
 *
 * A game that throws answers with an **empty list rather than failing the
 * request**, which is the direction every join in this app fails in: the lens
 * then shows fewer plays than it might, where a 502 would take the whole feed
 * down for a filter.
 */
const MAX_CLIP_GAMES = 40;
app.get(
  '/api/video/clips',
  requireUser,
  asyncRoute(async (req, res) => {
    const raw = String(req.query.games ?? '');
    const gamePks = [
      ...new Set(
        raw
          .split(',')
          .map((p) => Number(p.trim()))
          .filter((n) => Number.isInteger(n) && n > 0),
      ),
    ].slice(0, MAX_CLIP_GAMES);
    const games: Record<number, string[]> = {};
    await mapLimit(gamePks, 6, async (gamePk) => {
      try {
        games[gamePk] = await getGameClipPlayIds(gamePk);
      } catch (err) {
        console.error(`highlight reel failed for game ${gamePk}:`, err);
        games[gamePk] = [];
      }
    });
    res.json({ games });
  }),
);

app.get(
  '/api/video/:playId',
  requireUser,
  asyncRoute(async (req, res) => {
    const playId = String(req.params.playId);
    if (!/^[0-9a-f-]{20,40}$/i.test(playId)) {
      res.status(400).json({ error: 'invalid playId' });
      return;
    }
    const gamePk = Number(req.query.gamePk);
    if (!Number.isInteger(gamePk) || gamePk <= 0) {
      res.status(400).json({ error: 'gamePk (positive integer) required' });
      return;
    }
    const url = await resolveVideoUrl(playId, gamePk);
    if (!url) {
      res.status(404).json({ error: 'no video for this play' });
      return;
    }
    res.json({ url });
  }),
);

// Serving the built client is the local story only — `npm start`. Deployed, the
// SPA comes from S3 via CloudFront, which also owns the index.html fallback, and
// this monorepo-shaped path ('../../client/dist') doesn't survive the Lambda
// bundle anyway.
if (!IS_LAMBDA) {
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(clientDist));
  // SPA fallback: serve index.html for any non-API GET. Express 5 (path-to-regexp
  // v8) no longer accepts a bare '*' route, so use path-less middleware instead.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) next();
    });
  });

  app.listen(PORT, () => {
    console.log(`API + app listening on http://localhost:${PORT}`);
  });
}

export default app;
