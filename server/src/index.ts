import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getReport } from './savant.js';
import { getSeasonPlayers, resolveVideoUrl } from './mlbStats.js';
import { addPlayer, getWatchlist, removePlayer } from './store.js';

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

function resolveDate(q: unknown): string {
  if (typeof q === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  return previousDay();
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
    const { id, savantName, name } = req.body ?? {};
    if (typeof id !== 'number' || typeof savantName !== 'string' || typeof name !== 'string') {
      res.status(400).json({ error: 'id (number), savantName, name required' });
      return;
    }
    const players = await addPlayer({ id, savantName, name });
    res.json({ players });
  }),
);

app.delete(
  '/api/watchlist/:id',
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    const players = await removePlayer(id);
    res.json({ players });
  }),
);

// The main report: every watchlisted player's events for the date.
app.get(
  '/api/report',
  asyncRoute(async (req, res) => {
    const date = resolveDate(req.query.date);
    const watchlist = await getWatchlist();
    const players = await getReport(date, watchlist);
    res.json({ date, players });
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
