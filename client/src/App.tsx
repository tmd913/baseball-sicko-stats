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

function addDays(date: string, delta: number): string {
  const [y, m, day] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function todayEt(): string {
  return easternDate(new Date());
}

function previousDay(): string {
  return addDays(todayEt(), -1);
}

/** Most recent Monday on or before the given date (i.e. start of that week). */
function mondayOnOrBefore(date: string): string {
  const [y, m, day] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  const daysSinceMonday = (dt.getUTCDay() + 6) % 7;
  return addDays(date, -daysSinceMonday);
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

function prettyShort(date: string): string {
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function prettyRange(start: string, end: string): string {
  return start === end ? prettyDate(start) : `${prettyShort(start)} – ${prettyDate(end)}`;
}

interface DatePreset {
  label: string;
  start: string;
  end: string;
}

function datePresets(): DatePreset[] {
  const today = todayEt();
  const yesterday = previousDay();
  return [
    { label: 'Today', start: today, end: today },
    { label: 'Yesterday', start: yesterday, end: yesterday },
    { label: 'This week', start: mondayOnOrBefore(today), end: today },
    { label: 'Last 15 days', start: addDays(today, -14), end: today },
  ];
}

export default function App() {
  const [start, setStart] = useState(previousDay());
  const [end, setEnd] = useState(previousDay());
  const presets = useMemo(datePresets, []);
  const today = useMemo(todayEt, []);
  const [seasonPlayers, setSeasonPlayers] = useState<SeasonPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [watchlist, setWatchlist] = useState<WatchPlayer[]>([]);
  const [reports, setReports] = useState<PlayerReport[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());

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
      .report(start, end)
      .then((r) => setReports(r.players))
      .catch((e: Error) => setError(e.message))
      .finally(() => setReportLoading(false));
  }, [start, end]);

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

  const toggleCollapsed = (id: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const expandAll = () => setCollapsedIds(new Set());
  const collapseAll = () => setCollapsedIds(new Set(reports.map((r) => r.id)));

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
          <div className="date-presets">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                className={`date-preset${start === p.start && end === p.end ? ' active' : ''}`}
                onClick={() => {
                  setStart(p.start);
                  setEnd(p.end);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="date-range-inputs">
            <label>
              From
              <input
                type="date"
                value={start}
                max={end}
                onChange={(e) => setStart(e.target.value || start)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={end}
                min={start}
                max={today}
                onChange={(e) => setEnd(e.target.value || end)}
              />
            </label>
          </div>
          <span className="date-pretty">{prettyRange(start, end)}</span>
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
        {reports.length > 0 && (
          <div className="bulk-toggles">
            <button type="button" className="bulk-toggle" onClick={expandAll}>
              Expand all
            </button>
            <button type="button" className="bulk-toggle" onClick={collapseAll}>
              Collapse all
            </button>
          </div>
        )}
      </section>

      {error && <div className="error-banner">⚠ {error}</div>}

      {watchlist.length === 0 && !error && (
        <div className="empty-state">
          <p className="empty-title">Your watchlist is empty</p>
          <p>
            Search for a player above to start tracking their plate
            appearances, pitch sequences, and Statcast contact quality.
          </p>
        </div>
      )}

      {reportLoading && reports.length === 0 && (
        <div className="loading">Loading events…</div>
      )}

      <main className="player-list">
        {reports.map((r) => (
          <PlayerCard
            key={r.id}
            report={r}
            onRemove={onRemove}
            collapsed={collapsedIds.has(r.id)}
            onToggleCollapsed={() => toggleCollapsed(r.id)}
          />
        ))}
      </main>
    </div>
  );
}
