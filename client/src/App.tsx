import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import type { PlayerReport, SeasonPlayer, WatchPlayer } from './types';
import { PlayerAdder } from './components/PlayerAdder';
import { PlayerOrderEditor } from './components/PlayerOrderEditor';
import { PlayerCard } from './components/PlayerCard';
import { PitcherCard } from './components/PitcherCard';
import { LiveFeed } from './components/LiveFeed';
import { SummaryTable } from './components/SummaryTable';
import { simulateLiveDay } from './simulate';
import { PlayerDetails } from './components/PlayerDetails';
import { DateRangePicker } from './components/DateRangePicker';

// Breathing room above a card scrolled to the top of the viewport.
const SCROLL_GAP = 12;

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
  // The picker allows selecting through the end of the current year so the full
  // published schedule (scheduled games, probable pitchers) can be viewed ahead.
  const maxDate = useMemo(() => `${todayEt().slice(0, 4)}-12-31`, []);
  const [seasonPlayers, setSeasonPlayers] = useState<SeasonPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [watchlist, setWatchlist] = useState<WatchPlayer[]>([]);
  const [reports, setReports] = useState<PlayerReport[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [watchlistLoaded, setWatchlistLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Player cards are collapsed by default; the URL tracks the ids the user has
  // explicitly expanded (so a fresh visit — and any newly-added player — starts
  // collapsed, while reloads/shared links restore whatever was opened).
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => {
    const v = initialParams.get('expanded');
    if (!v) return new Set();
    return new Set(v.split(',').map(Number).filter(Number.isFinite));
  });
  // The player whose details view (percentile rankings) is open, seeded from the
  // URL so a shared/reloaded link reopens it once that player's report loads.
  const [detailsId, setDetailsId] = useState<number | null>(() => {
    const n = Number(initialParams.get('player'));
    return Number.isInteger(n) && n > 0 ? n : null;
  });
  // Watchlist display mode: the grouped-by-player cards ('players'), the flat,
  // most-recent-first stream of individual at-bats ('feed') for following live
  // games, or a full-page stat table over the range ('summary'). Seeded from the
  // URL so a reload/shared link restores the same view.
  const [view, setView] = useState<'players' | 'feed' | 'summary'>(() => {
    const v = initialParams.get('view');
    // Summary is the default view; players/feed are opted into explicitly.
    return v === 'players' || v === 'feed' ? v : 'summary';
  });
  // Demo toggle: overlay a synthetic live-day state on the loaded reports so the
  // live-only UI can be exercised when nothing is actually being played.
  const [simulate, setSimulate] = useState<boolean>(() => initialParams.get('sim') === '1');
  // The settings popover (gear next to the title) — currently holds the simulate
  // toggle. Closes on outside click or Escape.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e: PointerEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen]);
  // Edit mode (the pencil next to the search box): swaps the player list for the
  // drag-to-reorder edit screen. Deliberately not persisted in the URL — it's a
  // transient mode, not a view.
  const [editMode, setEditMode] = useState(false);

  // Scroll a player's card to the top of the viewport.
  //
  // Deferred a frame because callers expand the card first: expanding grows the
  // document, and only then is there room to scroll a bottom-of-page card's top
  // up to the top. Scrolling before the grow would clamp at the old, shorter page
  // bottom and stop short.
  const scrollToPlayer = useCallback((playerId: number) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(`player-${playerId}`);
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - SCROLL_GAP;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    });
  }, []);
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
    if (expandedIds.size) p.set('expanded', [...expandedIds].join(','));
    if (detailsId) p.set('player', String(detailsId));
    if (view !== 'summary') p.set('view', view);
    if (simulate) p.set('sim', '1');
    window.history.replaceState(null, '', `?${p.toString()}`);
  }, [start, end, activePreset, expandedIds, detailsId, view, simulate]);

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

  // The reports as rendered: the real ones, or a synthetic live-day overlay when
  // the demo toggle is on. Everything downstream (nav, cards, feed, the live
  // toggles) reads these; the raw `reports` still back polling and reordering.
  const displayReports = useMemo(
    () => (simulate ? simulateLiveDay(reports) : reports),
    [simulate, reports],
  );

  // While any game is in progress, quietly re-poll so the live score, bases, and
  // the at-bat/on-deck/on-base highlights track the game in near-real-time.
  // Only real live games drive polling — a simulated one has nothing to fetch.
  const hasRealLiveGame = reports.some((r) => r.games.some((g) => g.status.state === 'live'));
  // The feed view is always available: besides live at-bats it lists the day's
  // completed and not-yet-started games, so it's useful before first pitch too.
  const showViewToggle = displayReports.length > 0;
  useEffect(() => {
    if (!hasRealLiveGame) return;
    const t = setInterval(() => loadReport(true), 20_000);
    return () => clearInterval(t);
  }, [hasRealLiveGame, loadReport]);

  // Show a "back to top" button once the user has scrolled down a screenful.
  const [showBackToTop, setShowBackToTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Expanded at-bats / upcoming rows in the feed view, lifted here so "collapse
  // all" can clear them (the player view collapses via expandedIds instead).
  const [feedOpenKeys, setFeedOpenKeys] = useState<Set<string>>(() => new Set());
  const toggleFeedKey = useCallback((key: string) => {
    setFeedOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  // Whether the current view has anything expanded to collapse (the summary
  // table and the edit screen have no collapsibles).
  const hasExpanded =
    view === 'summary'
      ? false
      : view === 'feed'
        ? feedOpenKeys.size > 0
        : !editMode && expandedIds.size > 0;
  const collapseAll = () => {
    if (view === 'feed') setFeedOpenKeys(new Set());
    else setExpandedIds(new Set());
  };

  const onAdd = async (p: WatchPlayer) => {
    setWatchlist(await api.addPlayer(p));
  };
  const onRemove = async (id: number) => {
    setWatchlist(await api.removePlayer(id));
  };

  // Drag-to-reorder on the edit screen: the list is reordered live as the dragged
  // row passes over another, and the final order is persisted once the pointer is
  // released. The order ref is updated synchronously so chained moves — and the
  // release commit — always see the latest order, independent of render timing.
  const movePlayer = useCallback((fromId: number, toId: number) => {
    if (fromId === toId) return;
    const prev = reportsRef.current;
    const fi = prev.findIndex((r) => r.id === fromId);
    const ti = prev.findIndex((r) => r.id === toId);
    if (fi === -1 || ti === -1 || fi === ti) return;
    const next = prev.slice();
    const [moved] = next.splice(fi, 1);
    next.splice(ti, 0, moved);
    reportsRef.current = next;
    setReports(next);
  }, []);

  // Persist the order; setWatchlist keeps the server's copy in sync (and triggers
  // a cached report refetch, which returns the same order).
  const commitOrder = useCallback(() => {
    api
      .reorderPlayers(reportsRef.current.map((r) => r.id))
      .then(setWatchlist)
      .catch((e: Error) => setError(e.message));
  }, []);

  const toggleCollapsed = (id: number) => {
    const willExpand = !expandedIds.has(id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Expanding scrolls the card to the top of the viewport.
    if (willExpand) scrollToPlayer(id);
  };
  // A link (from the summary/feed) jumped to the players page — remember which
  // view we came from so a back button can return there. Cleared once we're back,
  // or when the user navigates explicitly via the tabs. backScroll remembers that
  // view's scroll offset so going back restores where the user left off — the
  // summary view scrolls its inner table, the feed scrolls the window.
  const [backView, setBackView] = useState<'summary' | 'feed' | null>(null);
  const backScroll = useRef(0);
  const goBack = () => {
    if (!backView) return;
    const dest = backView;
    const top = backScroll.current;
    setBackView(null);
    setView(dest);
    // Restore the previous scroll once the destination view has re-mounted.
    requestAnimationFrame(() => {
      if (dest === 'summary') {
        const el = document.querySelector('.summary-scroll');
        if (el) el.scrollTop = top;
      } else {
        window.scrollTo(0, top);
      }
    });
  };
  // From the feed/summary: jump to a player's full day on the players view —
  // switch views, expand their card, and scroll it to the top. Record the origin
  // view + its scroll offset for the back button.
  const openPlayerDay = useCallback(
    (id: number) => {
      const from = view === 'summary' || view === 'feed' ? view : null;
      if (from === 'summary') {
        backScroll.current = document.querySelector('.summary-scroll')?.scrollTop ?? 0;
      } else if (from === 'feed') {
        backScroll.current = window.scrollY;
      }
      setBackView(from);
      setEditMode(false);
      setView('players');
      setExpandedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
      scrollToPlayer(id);
    },
    [scrollToPlayer, view],
  );
  // Positions come from the season roster; look them up by id for each report.
  const positionById = useMemo(
    () => new Map(seasonPlayers.map((p) => [p.id, p.position])),
    [seasonPlayers],
  );
  // The player backing an open details view. Name comes from the report if the
  // player is watchlisted, otherwise from the season roster — so details can be
  // opened for any player, on the watchlist or not. Position always comes from
  // the roster. Null until whichever source carries the name has loaded.
  const detailsPlayer = useMemo(() => {
    if (!detailsId) return null;
    // Both PlayerReport and SeasonPlayer extend WatchPlayer, so either source
    // carries the id/name/savantName needed to add the player to the watchlist.
    const src =
      reports.find((r) => r.id === detailsId) ??
      seasonPlayers.find((p) => p.id === detailsId);
    if (!src) return null;
    return {
      id: detailsId,
      name: src.name,
      savantName: src.savantName,
      kind: src.kind,
      position: positionById.get(detailsId),
    };
  }, [detailsId, reports, seasonPlayers, positionById]);
  const detailsWatched = useMemo(
    () => (detailsId ? watchlist.some((p) => p.id === detailsId) : false),
    [detailsId, watchlist],
  );

  // The player list is split into a hitters half and a pitchers half (each
  // keeping the watchlist's order). The headings only show when both kinds are
  // watched — with one kind there's nothing to tell apart.
  const cardBatters = displayReports.filter((r) => r.kind !== 'pitcher');
  const cardPitchers = displayReports.filter((r) => r.kind === 'pitcher');
  const showKindHeadings = cardBatters.length > 0 && cardPitchers.length > 0;
  const renderCard = (r: PlayerReport) =>
    r.kind === 'pitcher' ? (
      <PitcherCard
        key={r.id}
        report={r}
        position={positionById.get(r.id)}
        collapsed={!expandedIds.has(r.id)}
        onToggleCollapsed={() => toggleCollapsed(r.id)}
        onOpenDetails={setDetailsId}
      />
    ) : (
      <PlayerCard
        key={r.id}
        report={r}
        position={positionById.get(r.id)}
        singleDay={start === end}
        collapsed={!expandedIds.has(r.id)}
        onToggleCollapsed={() => toggleCollapsed(r.id)}
        onOpenDetails={setDetailsId}
      />
    );

  return (
    <div className={`app${view === 'summary' ? ' summary-mode' : ''}`}>
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            ⚾
          </div>
          <h1>
            Statcast <span className="brand-sicko">Sicko</span>
          </h1>
          <div className="settings-menu" ref={settingsRef}>
            <button
              type="button"
              className={`settings-btn${settingsOpen ? ' active' : ''}`}
              aria-haspopup="true"
              aria-expanded={settingsOpen}
              aria-label="Settings"
              title="Settings"
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M19.4 13a7.6 7.6 0 0 0 .1-1 7.6 7.6 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7.3 7.3 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7.3 7.3 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.3 7.3 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.3 7.3 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {settingsOpen && (
              <div className="settings-popover" role="menu">
                <span className="settings-popover-label">Settings</span>
                <button
                  type="button"
                  className={`sim-toggle${simulate ? ' active' : ''}`}
                  role="menuitemcheckbox"
                  aria-checked={simulate}
                  onClick={() => setSimulate((v) => !v)}
                  title="Simulate a live day of games — demo the live view when nothing's on"
                >
                  <span className="sim-dot" aria-hidden="true" />
                  {simulate ? 'Simulating live' : 'Simulate live'}
                </button>
              </div>
            )}
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
              max={maxDate}
              onChange={(s, e) => {
                setStart(s);
                setEnd(e);
                setActivePreset(null);
              }}
            />
          </div>
        </div>
      </header>

      {/* Tabs + (players-only) roster search share one row when there's room; the
          search wraps to its own line when narrow. The row still renders with
          just the search when there are no reports yet (so an empty watchlist can
          still add players), and with just the tabs on the feed/summary views. */}
      {(showViewToggle || view === 'players') && (
        <div className="view-bar">
          {showViewToggle && (
            <div className="view-switch" role="tablist" aria-label="Watchlist view">
              <button
                type="button"
                role="tab"
                aria-selected={view === 'summary'}
                className={`view-tab${view === 'summary' ? ' active' : ''}`}
                onClick={() => {
                  setBackView(null);
                  setEditMode(false);
                  setView('summary');
                }}
              >
                Summary
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'players'}
                className={`view-tab${view === 'players' ? ' active' : ''}`}
                onClick={() => {
                  setBackView(null);
                  setView('players');
                }}
              >
                Players
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'feed'}
                className={`view-tab${view === 'feed' ? ' active' : ''}`}
                onClick={() => {
                  setBackView(null);
                  setEditMode(false);
                  setView('feed');
                }}
              >
                Feed
              </button>
            </div>
          )}
          {view === 'players' && (
            <div className="players-bar">
              <PlayerAdder
                players={seasonPlayers}
                watchlist={watchlist}
                onAdd={onAdd}
                onOpenDetails={setDetailsId}
                loading={playersLoading}
              />
              {/* Opens the reorder screen in place of the player list. Hidden
                  until there's more than one player to put in an order. */}
              {reports.length > 1 && (
                <button
                  type="button"
                  className={`edit-order-btn${editMode ? ' active' : ''}`}
                  onClick={() => setEditMode((v) => !v)}
                  title={editMode ? 'Finish editing' : 'Reorder players'}
                  aria-pressed={editMode}
                >
                  <span className="edit-order-icon" aria-hidden="true">
                    {editMode ? (
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    )}
                  </span>
                  {editMode ? 'Done' : 'Edit'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

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

      {view === 'summary' ? (
        displayReports.length > 0 && (
          <SummaryTable
            reports={displayReports}
            onOpenDetails={setDetailsId}
            onOpenPlayerDay={openPlayerDay}
          />
        )
      ) : view === 'feed' ? (
        displayReports.length > 0 && (
          <LiveFeed
            reports={displayReports}
            onOpenDetails={setDetailsId}
            onOpenPlayerDay={openPlayerDay}
            openKeys={feedOpenKeys}
            onToggleKey={toggleFeedKey}
          />
        )
      ) : (
      <div
        className={`content-layout${showLoading && reports.length > 0 ? ' is-loading' : ''}`}
      >
        {editMode ? (
          <PlayerOrderEditor
            players={reports}
            onMove={movePlayer}
            onCommit={commitOrder}
          />
        ) : (
        <main className="player-list">
          {showKindHeadings && <h2 className="kind-heading">Batters</h2>}
          {cardBatters.map(renderCard)}
          {showKindHeadings && <h2 className="kind-heading">Pitchers</h2>}
          {cardPitchers.map(renderCard)}
        </main>
        )}
      </div>
      )}

      {/* Bottom-left back button, shown only after a summary/feed link jumped to
          the players page — returns to whichever view it came from. */}
      <button
        type="button"
        className={`float-btn back-nav${view === 'players' && backView ? ' visible' : ''}`}
        onClick={goBack}
        aria-label={`Back to ${backView === 'feed' ? 'feed' : 'summary'}`}
        title={`Back to ${backView === 'feed' ? 'Feed' : 'Summary'}`}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M15 18l-6-6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back
      </button>

      <button
        type="button"
        className={`float-btn collapse-all${hasExpanded ? ' visible' : ''}${
          showBackToTop ? ' raised' : ''
        }`}
        onClick={collapseAll}
        aria-label="Collapse all"
        title="Collapse all"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M7 6 12 10 17 6M7 18 12 14 17 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <button
        type="button"
        className={`float-btn back-to-top${showBackToTop ? ' visible' : ''}`}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Back to top"
        title="Back to top"
      >
        ↑
      </button>

      {detailsPlayer && (
        <PlayerDetails
          playerId={detailsPlayer.id}
          name={detailsPlayer.name}
          position={detailsPlayer.position}
          isPitcher={detailsPlayer.kind === 'pitcher'}
          isWatched={detailsWatched}
          onAdd={() =>
            onAdd({
              id: detailsPlayer.id,
              savantName: detailsPlayer.savantName,
              name: detailsPlayer.name,
              kind: detailsPlayer.kind,
            })
          }
          onRemove={() => onRemove(detailsPlayer.id)}
          onClose={() => setDetailsId(null)}
        />
      )}
    </div>
  );
}
