import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireUser, userId } from './auth.js';
import { addDays, baseballToday } from './etDate.js';
import { getPlayerDay, getPlayerStatuses, getReport, withEstimators } from './savant.js';
import type { HeldDays } from './savant.js';
import { getPercentiles } from './percentiles.js';
import { getXwobaSeries } from './xwoba.js';
import { getBatterGameLog, getPitcherGameLog } from './gameLog.js';
import { getNextGame } from './nextGame.js';
import { getPlayerNews } from './news.js';
import { getSeasonArsenal } from './pitcherArsenal.js';
import { getPitcherXera } from './expectedStats.js';
import { getResearch, getPlayerWindows } from './research.js';
import type { Arsenal } from './pitcherArsenal.js';
import { getLeaguePitchAverage } from './pitchLeague.js';
import { RESEARCH_INCLUDE_KEYS, RESEARCH_WINDOWS } from './types.js';
import type { PlayerKind, ResearchIncludeKey, ResearchWindow, SeasonArsenalPitch } from './types.js';
import { getPitcherStats, getPlayerStats, getSeasonPlayers, resolveVideoUrl } from './mlbStats.js';
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
  setStatRanks,
  setRecentPlayer,
  setLeagueSharing,
  setResearchColumns,
  setStatsColumns,
  setResearchInclude,
  setRosterSource,
  setWatchlisted,
  upsertLeague,
} from './store.js';
import type { EspnLeague, LeagueRecord } from './store.js';
import { randomBytes } from 'node:crypto';
import {
  EspnAuthError,
  getLeagueInfo,
  getOwnership,
  getScoreboard,
  lineupsFrom,
  getTeamRosters,
  normalizeS2,
  normalizeSwid,
  rosterToWatchlist,
  rostersToWatchlist,
} from './espn.js';
import type { EspnRosterPlayer } from './espn.js';
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
    let watched: WatchPlayer[];
    let held: HeldDays | undefined;
    let teamName: string | null = null;
    if (fantasy) {
      try {
        // The **range**, not just its end: a fantasy team is a range of rosters
        // exactly as the saved one is, so the report reads one per day and is
        // told which of them each player was on. A read that fails leaves
        // `held` null, which is the old behaviour — today's team over every day
        // of the range.
        const fan = await fantasyWatchlist(userId(req), req.query.refresh === '1', end, {
          start,
          end,
        });
        watched = fan.players;
        teamName = fan.teamName;
        held = fan.held ?? undefined;
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
    res.json({ start, end, players, source: fantasy ? 'fantasy' : 'watchlist', teamName });
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
): Promise<{
  players: WatchPlayer[];
  teamName: string | null;
  roster: EspnRosterPlayer[];
  endRoster: EspnRosterPlayer[] | null;
  lineups: Record<string, number[]> | null;
  held: HeldDays | null;
}> {
  const espn = await getEspnLeague(user);
  if (!espn) throw new EspnAuthError('No ESPN league connected');
  if (espn.teamId == null) {
    throw new EspnAuthError(
      'No fantasy team chosen in this league — pick yours on the Fantasy league page.',
    );
  }
  const creds = await getEspnCreds(user);
  if (!creds) throw new EspnAuthError('No ESPN league connected');
  const own = await getOwnership(creds, refresh, date);
  const roster = own.rosters[espn.teamId] ?? [];
  const team = own.teams.find((t) => t.id === espn.teamId);
  // **One read per day answers both questions**, where it used to answer one.
  // *Which players do the views report on* is the union of every day's roster —
  // your team as it stood over those days, the man you dropped on Tuesday
  // included, for the days you had him — and *which of a player's days count*
  // is that same map read a second way. See `espn.ts`'s **A range is a range of
  // rosters** for why the roster rule reversed and what it costs.
  //
  // The seed is the day `getOwnership` has just answered for — today, or the
  // future day a `Tomorrow` view asked for — so the map and the slot chips
  // beside it come from one read and cannot disagree about that day.
  let byDate: Record<string, EspnRosterPlayer[]> | null = null;
  if (range) {
    const seedDate = date && date > baseballToday() ? date : baseballToday();
    byDate = await getTeamRosters(
      creds,
      espn.teamId,
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
  // range, not to today.** `getOwnership` clamps anything at or before today
  // back onto ESPN's current period — deliberately, since *which players the
  // views report on* must not become a team the manager no longer has — so on
  // a past range the roster it answers with is today's, and reading the chips
  // and the order off it says a man was benched yesterday because he is on the
  // bench now, and files the catcher you did start under "no longer on the
  // team". The per-day map has that day's roster, slots and all, so the anchor
  // is `byDate[end]` where there is one.
  //
  // **Where there isn't, today's roster stands**, which is the pre-per-day
  // behaviour and the right direction to fail in: a day ESPN wouldn't answer
  // for costs its precision, not the chips. That covers a failed read, a
  // caller that named no range at all, and every range ending today or later —
  // the last of which needs no fallback at all, `getTeamRosters` having seeded
  // the map with this very array (`byDate[end] === roster` by construction), so
  // the two agree by identity rather than by luck.
  const endRoster = (range && byDate?.[range.end]) ?? null;
  const anchor = endRoster ?? roster;
  const over = byDate && Object.keys(byDate).length > 0 ? rostersToWatchlist(byDate, anchor) : null;
  return {
    players: over?.players ?? rosterToWatchlist(roster),
    teamName: team?.name ?? espn.teamName ?? null,
    roster,
    // Sent only when it is genuinely a *different* day's list. Ending today or
    // later it is the same 28 rows the caller already has under `roster`, and a
    // second copy of them on the wire would say nothing the client's own
    // fallback doesn't.
    endRoster: endRoster === roster ? null : endRoster,
    lineups: byDate && lineupsFrom(byDate),
    held: over?.heldDays ?? null,
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
// otherwise left to `getOwnership`, which clamps anything at or before today
// back onto ESPN's current period, so a nonsense date can only ever cost the
// caller today's answer rather than someone else's team from June.
//
// `?start=` opts the response into `lineups`: which of your players were in
// your lineup on **each** day of `start`…`end`, so the summary table can
// aggregate a range against the lineup that was actually set for each of its
// days rather than applying one day's to all of them. Omitted (an older tab, or
// a caller that only wants the chips) the field is simply absent and nothing
// downstream changes. The span is capped like the report's, since it is the
// same span and the fan-out is one ESPN read per day of it.
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
// in the payload — so leaguemates cannot be recognised automatically. What it
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
    // An unrecognised window is the season, not a 400: the param is a view
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
    const statuses = await getPlayerStatuses();
    res.json({ players: Object.fromEntries(statuses) });
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
    res.json(await getPercentiles(playerId, year, kind));
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
    res.json(await getPlayerWindows(playerId, kind));
  }),
);

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
    res.json({ kind: 'batter', games: await getBatterGameLog(playerId, season) });
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
    const arsenals = await getSeasonArsenal(playerId);
    const toPitches = (arsenal: Arsenal): SeasonArsenalPitch[] => {
      const total = [...arsenal.values()].reduce((sum, p) => sum + p.count, 0);
      return [...arsenal.entries()]
        .map(([pitchType, p]) => {
          const lg = getLeaguePitchAverage(pitchType);
          // League hBreak is a magnitude; orient it to this pitcher's own
          // direction so the signed comparison reads correctly (same as the
          // per-game baselines in savant.ts::attachArsenalBaselines).
          const dir = (p.hBreak ?? 0) < 0 ? -1 : 1;
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
    });
  }),
);

// Resolve the direct .mp4 URL for a play's Statcast video (lazy, on demand).
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
