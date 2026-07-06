import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { PlayerReport, SeasonPlayer, WatchPlayer } from './types';
import { PlayerAdder } from './components/PlayerAdder';
import { PlayerCard } from './components/PlayerCard';

// MLB days are anchored to US Eastern time (games can end after midnight ET),
// so "previous day" is computed in America/New_York rather than UTC or the
// machine's local zone — otherwise an evening US user gets an off-by-one.
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

function previousDay(): string {
  const [y, m, day] = easternDate(new Date()).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

function prettyDate(date: string): string {
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function App() {
  const [date, setDate] = useState(previousDay());
  const [seasonPlayers, setSeasonPlayers] = useState<SeasonPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [watchlist, setWatchlist] = useState<WatchPlayer[]>([]);
  const [reports, setReports] = useState<PlayerReport[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the season's player list once, for search/autocomplete.
  useEffect(() => {
    let cancelled = false;
    setPlayersLoading(true);
    setError(null);
    api
      .players()
      .then((r) => {
        if (!cancelled) setSeasonPlayers(r.players);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setPlayersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load watchlist once.
  useEffect(() => {
    api.watchlist().then(setWatchlist).catch(() => {});
  }, []);

  const loadReport = useCallback(() => {
    setReportLoading(true);
    api
      .report(date)
      .then((r) => setReports(r.players))
      .catch((e: Error) => setError(e.message))
      .finally(() => setReportLoading(false));
  }, [date]);

  // Refresh report when date or watchlist changes.
  useEffect(() => {
    loadReport();
  }, [loadReport, watchlist]);

  const onAdd = async (p: WatchPlayer) => {
    setWatchlist(await api.addPlayer(p));
  };
  const onRemove = async (id: number) => {
    setWatchlist(await api.removePlayer(id));
  };

  const totals = useMemo(() => {
    const played = reports.filter((r) => r.found);
    const hrs = played.reduce(
      (s, r) => s + r.games.reduce((a, g) => a + g.line.hr, 0),
      0,
    );
    const hits = played.reduce(
      (s, r) => s + r.games.reduce((a, g) => a + g.line.hits, 0),
      0,
    );
    return { played: played.length, hrs, hits };
  }, [reports]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">⚾</div>
          <div>
            <h1>Baseball Sicko Stats</h1>
            <p className="brand-sub">Statcast batting events for your watchlist</p>
          </div>
        </div>
        <div className="date-control">
          <label>
            Game date
            <input
              type="date"
              value={date}
              max={previousDay()}
              onChange={(e) => setDate(e.target.value || previousDay())}
            />
          </label>
          <span className="date-pretty">{prettyDate(date)}</span>
        </div>
      </header>

      <section className="controls">
        <PlayerAdder
          players={seasonPlayers}
          watchlist={watchlist}
          onAdd={onAdd}
          loading={playersLoading}
        />
        <div className="summary-chips">
          <span className="chip">{watchlist.length} watched</span>
          <span className="chip">{totals.played} played</span>
          <span className="chip accent">{totals.hits} hits</span>
          <span className="chip hr">{totals.hrs} HR</span>
        </div>
      </section>

      {error && <div className="error-banner">⚠ {error}</div>}

      {watchlist.length === 0 && !error && (
        <div className="empty-state">
          <p className="empty-title">Your watchlist is empty</p>
          <p>
            Search for a player above to start tracking their previous-day
            plate appearances, pitch sequences, and Statcast contact quality.
          </p>
        </div>
      )}

      {reportLoading && reports.length === 0 && (
        <div className="loading">Loading events…</div>
      )}

      <main className="player-list">
        {reports.map((r) => (
          <PlayerCard key={r.id} report={r} onRemove={onRemove} />
        ))}
      </main>
    </div>
  );
}
