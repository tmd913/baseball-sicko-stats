import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getReport } from './savant.js';
import { getPercentiles } from './percentiles.js';
import { getXwobaSeries } from './xwoba.js';
import { getSeasonArsenal } from './pitcherArsenal.js';
import { getLeaguePitchAverage } from './pitchLeague.js';
import type { SeasonArsenalPitch } from './types.js';
import { getPitcherStats, getPlayerStats, getSeasonPlayers, resolveVideoUrl } from './mlbStats.js';
import { addPlayer, getWatchlist, removePlayer, reorderPlayers } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 4000);

// MLB days are anchored to US Eastern time (games can end after midnight ET),
// so "previous day" is computed in America/New_York rather than UTC — this
// must match the client's previousDay() so defaults agree.
const ET_ZONE = 'America/New_York';

function easternDate(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Previous day (US Eastern) relative to now, as YYYY-MM-DD. */
function previousDay(): string {
  const [y, m, day] = easternDate(new Date()).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
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

// All players rostered for the current season (for search / adding players).
app.get(
  '/api/players',
  asyncRoute(async (_req, res) => {
    const season = new Date().getFullYear();
    const players = await getSeasonPlayers(season);
    res.json({ season, players });
  }),
);

// The user's saved watchlist.
app.get(
  '/api/watchlist',
  asyncRoute(async (_req, res) => {
    res.json({ players: await getWatchlist() });
  }),
);

app.post(
  '/api/watchlist',
  asyncRoute(async (req, res) => {
    const { id, savantName, name, kind } = req.body ?? {};
    if (typeof id !== 'number' || typeof savantName !== 'string' || typeof name !== 'string') {
      res.status(400).json({ error: 'id (number), savantName, name required' });
      return;
    }
    const players = await addPlayer({
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
  asyncRoute(async (req, res) => {
    // Keys, not ids — "pitcher-592332" — so a two-way player's two entries can
    // be ordered independently. Usually only one kind's keys are submitted.
    const keys = req.body?.keys;
    if (!Array.isArray(keys) || !keys.every((k) => typeof k === 'string')) {
      res.status(400).json({ error: 'keys (string[]) required' });
      return;
    }
    const players = await reorderPlayers(keys);
    res.json({ players });
  }),
);

app.delete(
  '/api/watchlist/:id',
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    // `kind` narrows the removal to one half of a two-way player; without it
    // every entry for the id goes.
    const kind = req.query.kind;
    const players = await removePlayer(
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
  asyncRoute(async (req, res) => {
    const { start, end } = resolveDateRange(req.query.start ?? req.query.date, req.query.end ?? req.query.date);
    if (dayCount(start, end) > MAX_RANGE_DAYS) {
      res.status(400).json({ error: `date range too large (max ${MAX_RANGE_DAYS} days)` });
      return;
    }
    const watchlist = await getWatchlist();
    const players = await getReport(start, end, watchlist);
    res.json({ start, end, players });
  }),
);

// A player's Savant-style Statcast percentile-ranking card, for the details view.
app.get(
  '/api/percentiles/:playerId',
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

// A player's season platoon splits (vs LHP / vs RHP), for the details view. The
// report already carries these for watchlisted players; this serves the details
// view when it's opened for a player who isn't on the watchlist.
app.get(
  '/api/players/:playerId/splits',
  asyncRoute(async (req, res) => {
    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      res.status(400).json({ error: 'invalid playerId' });
      return;
    }
    if (req.query.type === 'pitcher') {
      const stats = (await getPitcherStats([playerId])).get(playerId);
      res.json({ vsLeft: stats?.vsLeft ?? null, vsRight: stats?.vsRight ?? null, kind: 'pitcher' });
      return;
    }
    const stats = (await getPlayerStats([playerId])).get(playerId);
    res.json({ vsLeft: stats?.vsLeft ?? null, vsRight: stats?.vsRight ?? null, kind: 'batter' });
  }),
);

// A player's season per-PA xwOBA sequence, for the details view's rolling-xwOBA
// chart (the client computes the rolling averages for the selected window). For a
// pitcher (?type=pitcher) it's xwOBA allowed.
app.get(
  '/api/players/:playerId/xwoba',
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
  asyncRoute(async (req, res) => {
    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      res.status(400).json({ error: 'invalid playerId' });
      return;
    }
    const arsenal = await getSeasonArsenal(playerId);
    const total = [...arsenal.values()].reduce((sum, p) => sum + p.count, 0);
    const pitches: SeasonArsenalPitch[] = [...arsenal.entries()]
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
    res.json({ pitches });
  }),
);

// Resolve the direct .mp4 URL for a play's Statcast video (lazy, on demand).
app.get(
  '/api/video/:playId',
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

// In production, serve the built client.
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
