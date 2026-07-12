import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import type { PlayerGame, PlayerReport, SeasonPlayer, WatchPlayer } from './types';
import { PlayerAdder } from './components/PlayerAdder';
import { PlayerCard } from './components/PlayerCard';
import { BaseDiamond } from './components/BaseDiamond';
import { DateRangePicker } from './components/DateRangePicker';
import { formatStartTime, gameStatusView, headshotUrl, liveRole, liveRoleLabel } from './lib';

const SHORT_INNING: Record<string, string> = {
  Top: 'Top',
  Bottom: 'Bot',
  Middle: 'Mid',
  End: 'End',
};

/** The game to summarize for a player in the nav: prefer live, then upcoming. */
function navGame(report: PlayerReport): PlayerGame | null {
  const games = report.games;
  if (games.length === 0) return null;
  return (
    games.find((g) => g.status.state === 'live') ??
    games.find((g) => g.status.state === 'scheduled') ??
    [...games].sort((a, b) => b.date.localeCompare(a.date) || b.gamePk - a.gamePk)[0]
  );
}

/** Player headshot for the image-only (narrow) nav; falls back to initials. */
function NavPhoto({ id, name }: { id: number; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    const initials = name
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join('');
    return (
      <span className="player-nav-photo player-nav-photo-empty" aria-label={name}>
        {initials}
      </span>
    );
  }
  return (
    <img
      className="player-nav-photo"
      src={headshotUrl(id)}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** Compact game line for the nav: time (scheduled), score + inning + runners/outs
 * (live), or final score. */
function NavGameStatus({ game }: { game: PlayerGame }) {
  const s = game.status;
  const { kind, score } = gameStatusView(game);
  const matchup = `${game.isHome ? 'vs' : '@'} ${game.opponent}`;

  let text: string;
  if (kind === 'scheduled') {
    text = `${matchup} · ${formatStartTime(s.startTime) ?? (s.detailedState || 'TBD')}`;
  } else if (kind === 'live') {
    const inning =
      s.currentInning !== null
        ? `${SHORT_INNING[s.inningState ?? ''] ?? s.inningState ?? ''} ${s.currentInning}`.trim()
        : s.detailedState;
    text = `${score ?? matchup} · ${inning}`;
  } else {
    text = `${score ?? matchup} · Final`;
  }

  return (
    <span className={`nav-game ${kind}`}>
      {kind === 'live' && <span className="live-dot" aria-hidden="true" />}
      <span className="nav-game-text">{text}</span>
      {kind === 'live' && s.bases && (
        <BaseDiamond bases={s.bases} outs={s.outs ?? 0} className="nav-bases" />
      )}
    </span>
  );
}

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

function nextDay(): string {
  return addDays(todayEt(), 1);
}

/** Most recent Monday on or before the given date (i.e. start of that week). */
function mondayOnOrBefore(date: string): string {
  const [y, m, day] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  const daysSinceMonday = (dt.getUTCDay() + 6) % 7;
  return addDays(date, -daysSinceMonday);
}


interface DatePreset {
  label: string;
  start: string;
  end: string;
}

function datePresets(): DatePreset[] {
  const today = todayEt();
  const tomorrow = nextDay();
  const yesterday = previousDay();
  return [
    { label: 'Today', start: today, end: today },
    // Tomorrow surfaces watched players' scheduled games (start times) before
    // any plate appearances exist.
    { label: 'Tomorrow', start: tomorrow, end: tomorrow },
    { label: 'Yesterday', start: yesterday, end: yesterday },
    { label: 'This week', start: mondayOnOrBefore(today), end: today },
    { label: 'Last 15 days', start: addDays(today, -14), end: today },
  ];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function App() {
  // Initial UI state is seeded from the URL query so a reload (or shared link)
  // restores the same date range, active preset, and collapsed cards.
  const initialParams = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const [start, setStart] = useState(() => {
    const v = initialParams.get('start');
    return v && ISO_DATE.test(v) ? v : todayEt();
  });
  const [end, setEnd] = useState(() => {
    const v = initialParams.get('end');
    return v && ISO_DATE.test(v) ? v : todayEt();
  });
  const [activePreset, setActivePreset] = useState<string | null>(() => {
    if (initialParams.has('preset')) return initialParams.get('preset') || null;
    // No preset param: fresh visit defaults to Today; an explicit range means
    // the user picked custom dates, so no preset is active.
    return initialParams.has('start') || initialParams.has('end') ? null : 'Today';
  });
  const presets = useMemo(datePresets, []);
  // The picker allows up to tomorrow so scheduled games can be viewed ahead.
  const tomorrow = useMemo(nextDay, []);
  const [seasonPlayers, setSeasonPlayers] = useState<SeasonPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [watchlist, setWatchlist] = useState<WatchPlayer[]>([]);
  const [reports, setReports] = useState<PlayerReport[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [watchlistLoaded, setWatchlistLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(() => {
    const v = initialParams.get('collapsed');
    if (!v) return new Set();
    return new Set(v.split(',').map(Number).filter(Number.isFinite));
  });
  // Nav edit mode: reveal per-player delete buttons and enable drag-to-reorder.
  const [editMode, setEditMode] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const dragId = useRef<number | null>(null);
  // Always-current reports, so the drag-end handler reads the latest order
  // without being recreated (and re-bound) on every reorder.
  const reportsRef = useRef(reports);
  reportsRef.current = reports;
  // Keep the URL in sync with UI state (replaceState so we don't flood history).
  useEffect(() => {
    const p = new URLSearchParams();
    p.set('start', start);
    p.set('end', end);
    if (activePreset) p.set('preset', activePreset);
    if (collapsedIds.size) p.set('collapsed', [...collapsedIds].join(','));
    window.history.replaceState(null, '', `?${p.toString()}`);
  }, [start, end, activePreset, collapsedIds]);

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
    api
      .watchlist()
      .then(setWatchlist)
      .catch(() => {})
      .finally(() => setWatchlistLoaded(true));
  }, []);

  // Only surface the loading UI if the fetch is slow enough to matter — quick
  // loads finish before this fires, so the spinner/empty flicker never shows.
  useEffect(() => {
    if (!reportLoading) {
      setShowLoading(false);
      return;
    }
    const t = setTimeout(() => setShowLoading(true), 250);
    return () => clearTimeout(t);
  }, [reportLoading]);

  // `quiet` refreshes in the background (live polling) without flashing the
  // loading UI; the foreground load on date/watchlist change is not quiet.
  const loadReport = useCallback(
    (quiet = false) => {
      if (!quiet) setReportLoading(true);
      api
        .report(start, end)
        .then((r) => setReports(r.players))
        .catch((e: Error) => setError(e.message))
        .finally(() => {
          if (!quiet) setReportLoading(false);
        });
    },
    [start, end],
  );

  // Refresh report when date or watchlist changes.
  useEffect(() => {
    loadReport();
  }, [loadReport, watchlist]);

  // While any game is in progress, quietly re-poll so the live score, bases, and
  // the nav's at-bat/on-deck/on-base highlights track the game in near-real-time.
  const hasLiveGame = reports.some((r) => r.games.some((g) => g.status.state === 'live'));
  useEffect(() => {
    if (!hasLiveGame) return;
    const t = setInterval(() => loadReport(true), 20_000);
    return () => clearInterval(t);
  }, [hasLiveGame, loadReport]);

  // Show a "back to top" button once the user has scrolled down a screenful.
  const [showBackToTop, setShowBackToTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const onAdd = async (p: WatchPlayer) => {
    setWatchlist(await api.addPlayer(p));
  };
  const onRemove = async (id: number) => {
    setWatchlist(await api.removePlayer(id));
  };

  // Drag-to-reorder in the nav, via Pointer Events so it works with both mouse
  // and touch (the phone strip). The list is reordered live as the dragged item
  // passes over another; the final order is persisted when the pointer is
  // released. The order ref is updated synchronously so chained moves — and the
  // release commit — always see the latest order, independent of render timing.
  const reorderTo = useCallback((targetId: number) => {
    const from = dragId.current;
    if (from === null || from === targetId) return;
    const prev = reportsRef.current;
    const fi = prev.findIndex((r) => r.id === from);
    const ti = prev.findIndex((r) => r.id === targetId);
    if (fi === -1 || ti === -1 || fi === ti) return;
    const next = prev.slice();
    const [moved] = next.splice(fi, 1);
    next.splice(ti, 0, moved);
    reportsRef.current = next;
    setReports(next);
  }, []);

  const dragMove = useCallback(
    (e: PointerEvent) => {
      // The dragged item has pointer-events: none (see .dragging), so this finds
      // the item under the pointer, not the one being dragged.
      const link = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest(
        '.player-nav-link',
      ) as HTMLElement | null;
      const id = link?.dataset.id;
      if (id) reorderTo(Number(id));
    },
    [reorderTo],
  );

  const endDrag = useCallback(() => {
    window.removeEventListener('pointermove', dragMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    dragId.current = null;
    setDraggingId(null);
    // Persist the new order; setWatchlist keeps the server's copy in sync (and
    // triggers a cached report refetch, which returns the same order).
    api
      .reorderPlayers(reportsRef.current.map((r) => r.id))
      .then(setWatchlist)
      .catch((e: Error) => setError(e.message));
  }, [dragMove]);

  const startDrag = (e: React.PointerEvent, id: number) => {
    // A press on the delete button shouldn't begin a drag.
    if ((e.target as HTMLElement).closest('.player-nav-delete')) return;
    e.preventDefault();
    dragId.current = id;
    setDraggingId(id);
    window.addEventListener('pointermove', dragMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  };

  const toggleCollapsed = (id: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  // Positions come from the season roster; look them up by id for each report.
  const positionById = useMemo(
    () => new Map(seasonPlayers.map((p) => [p.id, p.position])),
    [seasonPlayers],
  );

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
          <div className="date-row">
            {/* Desktop: a row of preset pills. On phones this row is hidden and
                the equivalent <select> below takes over (see styles.css). */}
            <div className="date-presets">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={`date-preset${activePreset === p.label ? ' active' : ''}`}
                  onClick={() => {
                    setStart(p.start);
                    setEnd(p.end);
                    setActivePreset(p.label);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {/* Phone-only equivalent of the pill row. A custom range (no active
                preset) shows the disabled placeholder option. */}
            <select
              className="date-presets-select"
              value={activePreset ?? ''}
              onChange={(e) => {
                const p = presets.find((x) => x.label === e.target.value);
                if (!p) return;
                setStart(p.start);
                setEnd(p.end);
                setActivePreset(p.label);
              }}
              aria-label="Date range preset"
            >
              <option value="" disabled>
                Custom range
              </option>
              {presets.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </select>
            <DateRangePicker
              start={start}
              end={end}
              max={tomorrow}
              onChange={(s, e) => {
                setStart(s);
                setEnd(e);
                setActivePreset(null);
              }}
            />
          </div>
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

      {watchlistLoaded && watchlist.length === 0 && !error && (
        <div className="empty-state">
          <p className="empty-title">Your watchlist is empty</p>
          <p>
            Search for a player above to start tracking their plate
            appearances, pitch sequences, and Statcast contact quality.
          </p>
        </div>
      )}

      {showLoading && reports.length === 0 && (
        <div className="loading">Loading events…</div>
      )}

      {showLoading && reports.length > 0 && (
        <div className="refreshing" role="status">
          <span className="spinner" aria-hidden="true" />
          Updating…
        </div>
      )}

      <div
        className={`content-layout${showLoading && reports.length > 0 ? ' is-loading' : ''}`}
      >
        {reports.length > 0 && (
          <aside className={`player-nav${editMode ? ' editing' : ''}`}>
            <div className="player-nav-header">
              <span className="player-nav-title">Players</span>
              <button
                type="button"
                className="player-nav-edit"
                onClick={() => setEditMode((v) => !v)}
                title={editMode ? 'Finish editing' : 'Reorder or remove players'}
              >
                {editMode ? 'Done' : 'Edit'}
              </button>
            </div>
            <nav>
              {reports.map((r) => {
                const role = liveRole(r);
                const game = navGame(r);
                const body = (
                  <>
                    <NavPhoto id={r.id} name={r.name} />
                    <div className="player-nav-body">
                      <div className="player-nav-top">
                        <span className="player-nav-name">{r.name}</span>
                        {role && <span className="player-nav-role">{liveRoleLabel(role)}</span>}
                      </div>
                      {game ? (
                        <NavGameStatus game={game} />
                      ) : (
                        <span className="nav-game">Did not appear</span>
                      )}
                    </div>
                  </>
                );
                if (editMode) {
                  // In edit mode the item isn't a link — it's a draggable row with
                  // a delete button. Dragging (mouse or touch) reorders the list as
                  // the item passes over its peers; data-id lets a pointer move map
                  // the element under the finger back to a player.
                  return (
                    <div
                      key={r.id}
                      data-id={r.id}
                      className={
                        `player-nav-link editing${role ? ` role-${role}` : ''}` +
                        (draggingId === r.id ? ' dragging' : '')
                      }
                      title={r.name}
                      onPointerDown={(e) => startDrag(e, r.id)}
                    >
                      <span className="player-nav-grip" aria-hidden="true">
                        ⠿
                      </span>
                      {body}
                      <button
                        type="button"
                        className="player-nav-delete"
                        onClick={() => onRemove(r.id)}
                        title={`Remove ${r.name}`}
                        aria-label={`Remove ${r.name}`}
                      >
                        ✕
                      </button>
                    </div>
                  );
                }
                return (
                  <a
                    key={r.id}
                    className={`player-nav-link${role ? ` role-${role}` : ''}`}
                    href={`#player-${r.id}`}
                    title={r.name}
                    onClick={(e) => {
                      e.preventDefault();
                      document
                        .getElementById(`player-${r.id}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    {body}
                  </a>
                );
              })}
              {/* Phone strip only: the edit toggle rides at the end of the list as
                  an icon (the header above is hidden). Hidden on wider screens,
                  where the header's Edit button is used instead. */}
              <button
                type="button"
                className="player-nav-edit-inline"
                onClick={() => setEditMode((v) => !v)}
                title={editMode ? 'Finish editing' : 'Reorder or remove players'}
                aria-label={editMode ? 'Finish editing' : 'Edit players'}
              >
                {editMode ? (
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                )}
              </button>
            </nav>
          </aside>
        )}

        <main className="player-list">
          {reports.map((r) => (
            <PlayerCard
              key={r.id}
              report={r}
              position={positionById.get(r.id)}
              collapsed={collapsedIds.has(r.id)}
              onToggleCollapsed={() => toggleCollapsed(r.id)}
            />
          ))}
        </main>
      </div>

      <button
        type="button"
        className={`back-to-top${showBackToTop ? ' visible' : ''}`}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Back to top"
        title="Back to top"
      >
        ↑
      </button>
    </div>
  );
}
