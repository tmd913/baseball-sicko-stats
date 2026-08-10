import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireUser, userId } from './auth.js';
import { addDays, baseballToday } from './etDate.js';
import { getReport, withEstimators } from './savant.js';
import { getPercentiles } from './percentiles.js';
import { getXwobaSeries } from './xwoba.js';
import { getBatterGameLog, getPitcherGameLog } from './gameLog.js';
import { getSeasonArsenal } from './pitcherArsenal.js';
import { getPitcherXera } from './expectedStats.js';
import { getResearch } from './research.js';
import type { Arsenal } from './pitcherArsenal.js';
import { getLeaguePitchAverage } from './pitchLeague.js';
import { RESEARCH_WINDOWS } from './types.js';
import type { ResearchWindow, SeasonArsenalPitch } from './types.js';
import { getPitcherStats, getPlayerStats, getSeasonPlayers, resolveVideoUrl } from './mlbStats.js';
import {
  addPlayer,
  getPrefs,
  getWatchlist,
  removePlayer,
  reorderPlayers,
  setHideInjured,
  setMuteAudio,
  setResearchColumns,
} from './store.js';

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

// The user's saved watchlist.
app.get(
  '/api/watchlist',
  requireUser,
  asyncRoute(async (req, res) => {
    res.json({ players: await getWatchlist(userId(req)) });
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
    const players = await addPlayer(userId(req), {
      id,
      savantName,
      name,
      kind: kind === 'pitcher' ? 'pitcher' : 'batter',
    });
    res.json({ players });
  }),
);

// Persist a new watchlist order (drag-to-reorder in the nav's edit mode).
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
    const players = await reorderPlayers(userId(req), keys);
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
    const players = await removePlayer(
      userId(req),
      id,
      kind === 'pitcher' || kind === 'batter' ? kind : undefined,
    );
    res.json({ players });
  }),
);

// The main report: every watchlisted player's events across a date range
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
    const watchlist = await getWatchlist(userId(req));
    const players = await getReport(start, end, watchlist);
    res.json({ start, end, players });
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

app.put(
  '/api/prefs/research-columns',
  requireUser,
  asyncRoute(async (req, res) => {
    const { kind, keys } = (req.body ?? {}) as { kind?: unknown; keys?: unknown };
    if (kind !== 'batter' && kind !== 'pitcher') {
      res.status(400).json({ error: "kind must be 'batter' or 'pitcher'" });
      return;
    }
    // null is "back to the defaults", which is stored as the absence of an
    // entry rather than as a copy of today's default list.
    if (keys !== null && !Array.isArray(keys)) {
      res.status(400).json({ error: 'keys must be an array of column keys, or null' });
      return;
    }
    if (
      Array.isArray(keys) &&
      (keys.length > MAX_COLUMNS ||
        !keys.every((k) => typeof k === 'string' && COLUMN_KEY_RE.test(k)))
    ) {
      res.status(400).json({ error: 'keys must be up to 100 short alphanumeric column keys' });
      return;
    }
    res.json(await setResearchColumns(userId(req), kind, keys as string[] | null));
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

// Every player in the league on one board, season to date — the research
// table. Unlike /api/report this is watchlist-independent and season-wide: it
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
