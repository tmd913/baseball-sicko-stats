import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { SignOutButton } from './auth';
import { playerKey } from './types';
import type {
  PlayerKind,
  PlayerReport,
  ResearchRow,
  ResearchWindow,
  SeasonPlayer,
  WatchPlayer,
} from './types';
import { isInjured } from './lib';
import { PlayerAdder } from './components/PlayerAdder';
import { PlayerOrderEditor } from './components/PlayerOrderEditor';
import { PlayerCard } from './components/PlayerCard';
import { PitcherCard } from './components/PitcherCard';
import { LiveFeed } from './components/LiveFeed';
import { SummaryTable } from './components/SummaryTable';
import {
  ResearchTable,
  isDefaultColumns,
  researchKindFor,
  toColumnKeys,
  toResearchPos,
  toResearchWindow,
} from './components/ResearchTable';
import type { ResearchPos } from './components/ResearchTable';
import { simulateLiveDay } from './simulate';
import { PlayerDetails } from './components/PlayerDetails';
import { DateRangePicker } from './components/DateRangePicker';
import { Tutorial } from './components/Tutorial';

// Breathing room above a card scrolled to the top of the viewport.
const SCROLL_GAP = 12;

// Whether the settings menu offers the "Simulate live" toggle. Off: the overlay
// is a developer/demo tool, not something a user of the site should be handed a
// switch for. The mode itself is untouched — `?sim=1` in the URL still turns it
// on — so flipping this back to true (or, later, to an is-admin test, which the
// app has no notion of yet) is all it takes to restore the menu entry.
const SHOW_SIMULATE_TOGGLE = false;

// MLB days are anchored to US Eastern time, computed in America/New_York rather
// than UTC or the machine's local zone — otherwise an evening US user gets an
// off-by-one.
const ET_ZONE = 'America/New_York';

// And a baseball day doesn't end at midnight: a 10pm ET first pitch on the West
// Coast finishes around 1am, so at 12:30am the day "Today" should mean is still
// the one whose games are ending — rolling over on the calendar would swap the
// user onto an empty slate mid-game. The day turns at 3am ET instead: later
// than any game realistically runs, earlier than anything the next day starts.
// `server/src/etDate.ts` mirrors this (the two workspaces can't share code, and
// the API's default date has to land where the presets do) — change both.
const DAY_ROLLOVER_HOUR = 3;

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

/** Today's baseball date — the Eastern date of a clock set back to the rollover
 *  hour, so the small hours still belong to the night before. */
function baseballToday(): string {
  return easternDate(new Date(Date.now() - DAY_ROLLOVER_HOUR * 3_600_000));
}

function previousDay(): string {
  return addDays(baseballToday(), -1);
}

function nextDay(): string {
  return addDays(baseballToday(), 1);
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
  const today = baseballToday();
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

/**
 * Player keys out of a comma-separated URL param. Bare numbers are links from
 * before two-way players existed, when the params held ids — read them as
 * batters, which is what they meant.
 */
function readKeys(v: string | null): string[] {
  if (!v) return [];
  return v
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => (/^\d+$/.test(k) ? `batter-${k}` : k))
    .filter((k) => /^(batter|pitcher)-\d+$/.test(k));
}

export default function App() {
  // Initial UI state is seeded from the URL query so a reload (or shared link)
  // restores the same date range, active preset, and collapsed cards.
  const initialParams = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const presets = useMemo(datePresets, []);
  // The preset named in the URL, if it's still one we offer. An unknown label
  // (renamed preset, hand-edited link) falls through to start/end instead.
  const initialPreset = useMemo(() => {
    if (initialParams.has('preset')) {
      const label = initialParams.get('preset');
      return presets.some((p) => p.label === label) ? label : null;
    }
    // No preset param: fresh visit defaults to Today; an explicit range means
    // the user picked custom dates, so no preset is active.
    return initialParams.has('start') || initialParams.has('end') ? null : 'Today';
  }, [initialParams, presets]);
  // A preset is a rule, not a fixed range, so its dates are re-derived here
  // rather than read back from the URL: a tab left open overnight and reloaded
  // under "Today" has to land on the new today, not the day it was opened.
  // Only a custom range gets its dates from the query string.
  const initialRange = useMemo(() => {
    const preset = presets.find((p) => p.label === initialPreset);
    if (preset) return preset;
    const s = initialParams.get('start');
    const e = initialParams.get('end');
    return {
      start: s && ISO_DATE.test(s) ? s : baseballToday(),
      end: e && ISO_DATE.test(e) ? e : baseballToday(),
    };
  }, [initialParams, presets, initialPreset]);
  const [start, setStart] = useState(initialRange.start);
  const [end, setEnd] = useState(initialRange.end);
  const [activePreset, setActivePreset] = useState<string | null>(initialPreset);
  // The picker allows selecting through the end of the current year so the full
  // published schedule (scheduled games, probable pitchers) can be viewed ahead.
  const maxDate = useMemo(() => `${baseballToday().slice(0, 4)}-12-31`, []);
  const [seasonPlayers, setSeasonPlayers] = useState<SeasonPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [watchlist, setWatchlist] = useState<WatchPlayer[]>([]);
  const [reports, setReports] = useState<PlayerReport[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [watchlistLoaded, setWatchlistLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Player cards are collapsed by default; the URL tracks the keys the user has
  // explicitly expanded (so a fresh visit — and any newly-added player — starts
  // collapsed, while reloads/shared links restore whatever was opened).
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(readKeys(initialParams.get('expanded'))),
  );
  // The player whose details view (percentile rankings) is open, seeded from the
  // URL so a shared/reloaded link reopens it once that player's report loads.
  const [detailsKey, setDetailsKey] = useState<string | null>(
    () => readKeys(initialParams.get('player'))[0] ?? null,
  );
  // Watchlist display mode: the grouped-by-player cards ('players'), the flat,
  // most-recent-first stream of individual at-bats ('feed') for following live
  // games, or a full-page stat table over the range ('summary'). Seeded from the
  // URL so a reload/shared link restores the same view.
  // 'research' is the odd one out: the other three are reads on the watchlist
  // over the date range, while research is the whole league over the season. It
  // hides the date row for that reason, and is reachable with nothing watched —
  // finding players to watch is half of what it's for.
  const [view, setView] = useState<'players' | 'feed' | 'summary' | 'research'>(() => {
    const v = initialParams.get('view');
    // Summary is the default view; the rest are opted into explicitly.
    return v === 'players' || v === 'feed' || v === 'research' ? v : 'summary';
  });
  // Which half of the watchlist the players view is showing. Its own tab row,
  // since a batter card and a pitcher card have nothing in common to scan down.
  // Only surfaced when both kinds are watched; batters are the default.
  const [playerKind, setPlayerKind] = useState<'batter' | 'pitcher'>(() =>
    initialParams.get('kind') === 'pitcher' ? 'pitcher' : 'batter',
  );
  // Demo toggle: overlay a synthetic live-day state on the loaded reports so the
  // live-only UI can be exercised when nothing is actually being played. Still
  // reachable by hand as `?sim=1`; only its settings-menu entry is hidden (see
  // SHOW_SIMULATE_TOGGLE).
  const [simulate, setSimulate] = useState<boolean>(() => initialParams.get('sim') === '1');
  // Keep players on the IL off the players view. The summary table hides them
  // whatever this says (see `visibleReports`); this is the one view where the
  // choice is the user's, since a card can still show what he did before he got
  // hurt. In the URL like every other view setting — the client has no
  // localStorage, so this is where a preference lives.
  const [hideInjured, setHideInjuredState] = useState<boolean>(
    () => initialParams.get('hideil') === '1',
  );
  // A URL that says nothing about this is *unspecified*, not "off" — that's
  // what lets the saved preference fill it in below. `hideil=1` is the only
  // thing the param can say, so an explicit off is indistinguishable from
  // silence; a link therefore only ever turns the filter on.
  const hideInjuredFromUrl = initialParams.get('hideil') === '1';
  // Set once the user works the toggle, so a preference arriving late can't
  // undo a choice they just made.
  const hideInjuredTouched = useRef(false);
  const setHideInjured = useCallback((hide: boolean) => {
    hideInjuredTouched.current = true;
    setHideInjuredState(hide);
    api
      .saveHideInjured(hide)
      .catch((e: Error) => console.error('saving hide-injured failed:', e.message));
  }, []);
  // The research board, fetched per kind the first time that tab is opened and
  // kept for the session: it's the whole league in one blob, season-to-date, and
  // the server caches it for six hours — re-fetching on every tab switch would
  // buy nothing but a spinner.
  // Which pill the research board is on. Its own selector rather than the
  // watchlist's `kind` tabs, because the row it drives is both — Batters and
  // Pitchers are two of its eleven entries, and the rest are slices of one or
  // the other, so the board is a consequence of the position rather than a
  // second choice beside it. In the URL like every other tab in the app.
  const [researchPos, setResearchPos] = useState<ResearchPos>(() =>
    toResearchPos(initialParams.get('pos')),
  );
  const researchKind = researchKindFor(researchPos);
  // Which columns the research table shows, per board — absent means that
  // board's defaults. Per board because a batter's columns and a pitcher's are
  // different vocabularies; the URL carries only the one on screen (see below).
  // A `cols=` on the opening URL names one board — the one `pos=` selects.
  // Remembered so the saved preferences that arrive a moment later don't
  // overwrite it: a link someone was handed should show what it says.
  const urlColumns = useMemo(() => {
    const kind = researchKindFor(toResearchPos(initialParams.get('pos')));
    const keys = toColumnKeys(kind, initialParams.get('cols'));
    return keys ? { kind, keys } : null;
  }, [initialParams]);
  const [researchCols, setResearchCols] = useState<Partial<Record<PlayerKind, string[]>>>(
    () => (urlColumns ? { [urlColumns.kind]: urlColumns.keys } : {}),
  );

  // The user's saved columns, fetched once. Applied only to boards the URL
  // didn't already speak for, and only where the user hasn't already changed
  // something in the seconds before this landed.
  useEffect(() => {
    let cancelled = false;
    api
      .prefs()
      .then((prefs) => {
        if (cancelled) return;
        if (!hideInjuredTouched.current && !hideInjuredFromUrl && prefs.hideInjured) {
          setHideInjuredState(true);
        }
        setResearchCols((prev) => {
          const next = { ...prev };
          for (const kind of ['batter', 'pitcher'] as const) {
            if (next[kind] || urlColumns?.kind === kind) continue;
            const saved = toColumnKeys(kind, prefs.researchColumns?.[kind]?.join(',') ?? null);
            if (saved) next[kind] = saved;
          }
          return next;
        });
      })
      // A preference is not worth an error banner over: the board opens on its
      // defaults, which is exactly what a user with nothing saved gets.
      .catch((e: Error) => console.error('preferences unavailable:', e.message));
    return () => {
      cancelled = true;
    };
  }, [urlColumns, hideInjuredFromUrl]);

  // Saving is debounced because the picker is a row of checkboxes — turning a
  // group on is one intent and a dozen state changes, and each would otherwise
  // be its own read-modify-write against the user's item.
  const saveColsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (saveColsTimer.current) clearTimeout(saveColsTimer.current);
  }, []);
  const setResearchColumns = useCallback(
    (keys: string[] | null) => {
      setResearchCols((prev) => {
        const next = { ...prev };
        if (keys) next[researchKind] = keys;
        else delete next[researchKind];
        return next;
      });
      if (saveColsTimer.current) clearTimeout(saveColsTimer.current);
      saveColsTimer.current = setTimeout(() => {
        api
          .saveResearchColumns(researchKind, keys)
          .catch((e: Error) => console.error('saving columns failed:', e.message));
      }, 600);
    },
    [researchKind],
  );

  // Which slice of the season the board is reading. Shared across both boards
  // like `qualified` and for the same reason: "the last 30 days" means the same
  // thing on either, so a tab switch dropping it would silently change the
  // population. In the URL, unlike the page's transient filters — it changes
  // *which* season a shared link is about, which is the kind of thing a link
  // has to carry.
  const [researchWindow, setResearchWindow] = useState<ResearchWindow>(() =>
    toResearchWindow(initialParams.get('win')),
  );
  // Keyed by board **and** window: each is its own fetch and its own megabyte,
  // and both are kept, so flipping back to a window already read is instant.
  const [research, setResearch] = useState<Record<string, ResearchRow[]>>({});
  const researchCacheKey = `${researchKind}:${researchWindow}`;
  // Shared across both boards (see the prop's comment in ResearchTable), so it
  // survives the remount that switching board causes. Transient like the page's
  // other filters — deliberately not in the URL.
  const [researchQualified, setResearchQualified] = useState(false);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);

  // The how-to page (settings menu → How to use, and the empty state's button).
  // In the URL like every other view, so it survives a reload and can be linked
  // to — which is the only way to hand someone the guide directly.
  const [helpOpen, setHelpOpen] = useState<boolean>(() => initialParams.get('help') === '1');
  // The settings popover (gear next to the title) — the hide-injured toggle
  // (and the simulate one, when it's shown), then the way into the how-to page.
  // Closes on outside click or Escape.
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
  const scrollToPlayer = useCallback((key: string) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(`player-${key}`);
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
    // The preset *is* the range — writing its dates out too would pin the link
    // to whatever "Today" meant when it was saved, which is the whole bug.
    if (activePreset) {
      p.set('preset', activePreset);
    } else {
      p.set('start', start);
      p.set('end', end);
    }
    if (expandedKeys.size) p.set('expanded', [...expandedKeys].join(','));
    if (detailsKey) p.set('player', detailsKey);
    if (view !== 'summary') p.set('view', view);
    if (playerKind !== 'batter') p.set('kind', playerKind);
    // Only meaningful on the research view, and 'batters' is its default.
    if (view === 'research' && researchPos !== 'batters') p.set('pos', researchPos);
    // Likewise, with the whole season as the default. A window is the one page
    // filter that goes in the URL: it decides which games the numbers are drawn
    // from, so a link without it would open on a different table.
    if (view === 'research' && researchWindow !== 'season') {
      p.set('win', String(researchWindow));
    }
    // The column set of the board on screen, and only once it differs from that
    // board's defaults — otherwise every link would carry twenty stat keys to
    // say "the usual". `pos=` is what tells a reader which board they describe.
    const cols = researchCols[researchKind];
    if (view === 'research' && cols && !isDefaultColumns(researchKind, cols)) {
      p.set('cols', cols.join(','));
    }
    if (simulate) p.set('sim', '1');
    if (hideInjured) p.set('hideil', '1');
    if (helpOpen) p.set('help', '1');
    window.history.replaceState(null, '', `?${p.toString()}`);
  }, [
    start,
    end,
    activePreset,
    expandedKeys,
    detailsKey,
    view,
    playerKind,
    researchPos,
    researchWindow,
    researchCols,
    researchKind,
    simulate,
    hideInjured,
    helpOpen,
  ]);

  // Fetch the research board for the kind on screen, once per kind. Lazy —
  // nothing here is needed until the tab is opened, and it's a megabyte of
  // league-wide season stats.
  useEffect(() => {
    // Already loaded: nothing to fetch, but clear an error left over from the
    // other board — it belongs to that one, not this one.
    if (research[researchCacheKey]) {
      setResearchError(null);
      return;
    }
    if (view !== 'research') return;
    let cancelled = false;
    setResearchLoading(true);
    setResearchError(null);
    api
      .research(researchKind, researchWindow)
      .then((r) => {
        // Keyed off what came back rather than what was asked for, so a server
        // that fell back to the season (an unrecognised window from an older
        // link) caches under the window it actually served.
        if (!cancelled) setResearch((prev) => ({ ...prev, [`${r.kind}:${r.window}`]: r.rows }));
      })
      .catch((e: Error) => {
        if (!cancelled) setResearchError(e.message);
      })
      .finally(() => {
        if (!cancelled) setResearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, researchKind, researchWindow, researchCacheKey, research]);

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

  // Load watchlist once. A failure here used to be swallowed, which rendered the
  // "your watchlist is empty" state — actively misleading now that the list
  // lives server-side per user, where a failure means "we couldn't read it".
  useEffect(() => {
    api
      .watchlist()
      .then(setWatchlist)
      .catch((e: Error) => setError(e.message))
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
  // The three watchlist views need something watched to be worth opening; the
  // feed among them, since besides live at-bats it lists the day's completed and
  // not-yet-started games. Research needs nothing, so the row itself always
  // renders — with an empty watchlist it's the lone Research pill, which is the
  // one tab a new user can actually use.
  const showWatchlistViews = displayReports.length > 0;
  const showViewToggle = true;
  // The roster search belongs to the players view, but it's also the only way
  // out of an empty watchlist — and with nothing watched the view tabs are
  // hidden too, so a new user on the default summary view would otherwise have
  // no search bar *and* no way to reach the view that has one.
  // …but never on the research board, which carries its own search over the
  // whole league. A player is added from there through his details overlay,
  // which is a click on his name away — two search boxes side by side, one
  // over the watchlist roster and one over the table below it, would be a
  // question about which one you're in.
  const showAdder =
    view !== 'research' && (view === 'players' || (watchlistLoaded && watchlist.length === 0));
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
  // all" can clear them (the player view collapses via expandedKeys instead).
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
        : !editMode && expandedKeys.size > 0;
  const collapseAll = () => {
    if (view === 'feed') setFeedOpenKeys(new Set());
    else setExpandedKeys(new Set());
  };

  const onAdd = async (p: WatchPlayer) => {
    setWatchlist(await api.addPlayer(p));
  };
  const onRemove = async (p: { id: number; kind: PlayerKind }) => {
    setWatchlist(await api.removePlayer(p.id, p.kind));
  };
  // Remove from the edit screen. The row goes as soon as it's tapped — the
  // watchlist update refetches the report, which would otherwise leave the
  // removed player sitting there until it lands — and reportsRef is updated
  // alongside so a drag that follows commits the order without him.
  const removeFromEditor = useCallback((key: string) => {
    const player = reportsRef.current.find((r) => playerKey(r) === key);
    if (!player) return;
    const next = reportsRef.current.filter((r) => playerKey(r) !== key);
    reportsRef.current = next;
    setReports(next);
    api
      .removePlayer(player.id, player.kind)
      .then(setWatchlist)
      .catch((e: Error) => setError(e.message));
  }, []);

  // Drag-to-reorder on the edit screen: the list is reordered live as the dragged
  // row passes over another, and the final order is persisted once the pointer is
  // released. The order ref is updated synchronously so chained moves — and the
  // release commit — always see the latest order, independent of render timing.
  const movePlayer = useCallback((fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    const prev = reportsRef.current;
    const fi = prev.findIndex((r) => playerKey(r) === fromKey);
    const ti = prev.findIndex((r) => playerKey(r) === toKey);
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
      .reorderPlayers(reportsRef.current.map(playerKey))
      .then(setWatchlist)
      .catch((e: Error) => setError(e.message));
  }, []);

  const toggleCollapsed = (key: string) => {
    const willExpand = !expandedKeys.has(key);
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    // Expanding scrolls the card to the top of the viewport.
    if (willExpand) scrollToPlayer(key);
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
    (key: string) => {
      const from = view === 'summary' || view === 'feed' ? view : null;
      if (from === 'summary') {
        backScroll.current = document.querySelector('.summary-scroll')?.scrollTop ?? 0;
      } else if (from === 'feed') {
        backScroll.current = window.scrollY;
      }
      setBackView(from);
      setEditMode(false);
      setView('players');
      // The players view shows one kind at a time, so land on the tab this
      // player is actually in — otherwise the jump scrolls to nothing.
      const kind = reportsRef.current.find((r) => playerKey(r) === key)?.kind;
      if (kind === 'pitcher' || kind === 'batter') setPlayerKind(kind);
      setExpandedKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
      scrollToPlayer(key);
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
    if (!detailsKey) return null;
    // Both PlayerReport and SeasonPlayer extend WatchPlayer, so either source
    // carries the id/name/savantName needed to add the player to the watchlist.
    const src =
      reports.find((r) => playerKey(r) === detailsKey) ??
      seasonPlayers.find((p) => playerKey(p) === detailsKey);
    if (!src) return null;
    return {
      id: src.id,
      name: src.name,
      savantName: src.savantName,
      kind: src.kind,
      position: positionById.get(src.id),
    };
  }, [detailsKey, reports, seasonPlayers, positionById]);
  const detailsWatched = useMemo(
    () => (detailsKey ? watchlist.some((p) => playerKey(p) === detailsKey) : false),
    [detailsKey, watchlist],
  );

  // The player list is one kind at a time, picked by its own tab row (each half
  // keeping the watchlist's order). The tabs only appear when both kinds are
  // watched; with one kind there's nothing to switch between, so the list just
  // shows it — even if the URL asked for the empty half.
  //
  // A player on the IL plays no games, so over any range that starts after he
  // went down his row is a line of dashes. The summary table — nothing but those
  // rows — drops him outright; the players view drops him only when the settings
  // toggle asks, his card there still being able to say what he did before he
  // got hurt. The feed is left alone either way: it's a record of things that
  // happened, and it already keeps inactive players out of Upcoming.
  //
  // Filtering here, ahead of the kind split, is what keeps the tab counts equal
  // to the list under them. The reorder screen is deliberately upstream of it
  // (`editPlayers`, off raw `reports`) — dropping an injured player from the
  // watchlist is exactly what that screen is for.
  const hidingInjured = view === 'summary' || hideInjured;
  const shownReports = useMemo(
    () =>
      hidingInjured
        ? displayReports.filter((r) => !isInjured(r.rosterStatus))
        : displayReports,
    [displayReports, hidingInjured],
  );
  const cardBatters = shownReports.filter((r) => r.kind !== 'pitcher');
  const cardPitchers = shownReports.filter((r) => r.kind === 'pitcher');
  const showKindTabs = cardBatters.length > 0 && cardPitchers.length > 0;
  // With one kind empty the tabs are hidden, so the list shows whichever kind is
  // left — a stale `kind=` (or a filter that just emptied that half) can't leave
  // the user staring at nothing with no tab to click back to.
  const shownKind =
    cardPitchers.length === 0 && cardBatters.length > 0
      ? 'batter'
      : cardBatters.length === 0 && cardPitchers.length > 0
        ? 'pitcher'
        : playerKind;
  const kindCards = shownKind === 'pitcher' ? cardPitchers : cardBatters;
  // The second tier of tabs, in the view bar beside the view switch: every view
  // below shows a single kind at a time, so the pair reads as one control.
  const kindTabs = showKindTabs ? (
    <div className="kind-switch" role="tablist" aria-label="Batters or pitchers">
      <button
        type="button"
        role="tab"
        aria-selected={shownKind === 'batter'}
        className={`kind-tab${shownKind === 'batter' ? ' active' : ''}`}
        onClick={() => setPlayerKind('batter')}
      >
        Batters
        <span className="kind-tab-count">{cardBatters.length}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={shownKind === 'pitcher'}
        className={`kind-tab${shownKind === 'pitcher' ? ' active' : ''}`}
        onClick={() => setPlayerKind('pitcher')}
      >
        Pitchers
        <span className="kind-tab-count">{cardPitchers.length}</span>
      </button>
    </div>
  ) : null;
  // The roster search + the Edit (reorder) toggle. On the players view they sit
  // under the tabs, with the list they act on; everywhere else — really just the
  // empty watchlist, the one case the search shows outside that view — the view
  // bar carries them, since there's no list to sit above.
  const adderBelowTabs = view === 'players' && displayReports.length > 0;
  const playersBar = (
    <div className="players-bar">
      <PlayerAdder
        players={seasonPlayers}
        watchlist={watchlist}
        onAdd={onAdd}
        onOpenDetails={setDetailsKey}
        loading={playersLoading}
      />
      {/* Opens the reorder screen in place of the player list. Hidden until
          there's more than one player to put in an order. */}
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
  );

  // The reorder screen edits the raw watchlist order, one kind at a time, so it
  // reads `reports` rather than the simulate-overlaid copy the cards render.
  const editPlayers = reports
    .filter((r) => (shownKind === 'pitcher' ? r.kind === 'pitcher' : r.kind !== 'pitcher'))
    .map((r) => ({ id: r.id, key: playerKey(r), name: r.name }));
  const renderCard = (r: PlayerReport) => {
    const key = playerKey(r);
    return r.kind === 'pitcher' ? (
      <PitcherCard
        key={key}
        report={r}
        position={positionById.get(r.id)}
        singleDay={start === end}
        collapsed={!expandedKeys.has(key)}
        onToggleCollapsed={() => toggleCollapsed(key)}
        onOpenDetails={setDetailsKey}
      />
    ) : (
      <PlayerCard
        key={key}
        report={r}
        position={positionById.get(r.id)}
        singleDay={start === end}
        collapsed={!expandedKeys.has(key)}
        onToggleCollapsed={() => toggleCollapsed(key)}
        onOpenDetails={setDetailsKey}
      />
    );
  };

  return (
    <div
      className={`app${view === 'summary' ? ' summary-mode' : ''}${
        view === 'research' ? ' research-mode' : ''
      }`}
    >
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
              {/* Six-tooth gear generated at exact 60° rotational symmetry: a
                  tip arc at r=9.1 spanning 24°, flanks down to a root arc at
                  r=6.5 spanning 30° — so each tooth tapers toward its tip
                  rather than flaring. The hand-written path this replaces had
                  drifted out of symmetry (uneven teeth, a flat stretch on the
                  left where one was missing), which showed at any size. */}
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle
                  cx="12"
                  cy="12"
                  r="3.3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M10.11 3.1A9.1 9.1 0 0 1 13.89 3.1L13.68 5.72A6.5 6.5 0 0 1 16.6 7.4L18.76 5.91A9.1 9.1 0 0 1 20.65 9.19L18.28 10.32A6.5 6.5 0 0 1 18.28 13.68L20.65 14.81A9.1 9.1 0 0 1 18.76 18.09L16.6 16.6A6.5 6.5 0 0 1 13.68 18.28L13.89 20.9A9.1 9.1 0 0 1 10.11 20.9L10.32 18.28A6.5 6.5 0 0 1 7.4 16.6L5.24 18.09A9.1 9.1 0 0 1 3.35 14.81L5.72 13.68A6.5 6.5 0 0 1 5.72 10.32L3.35 9.19A9.1 9.1 0 0 1 5.24 5.91L7.4 7.4A6.5 6.5 0 0 1 10.32 5.72L10.11 3.1Z"
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
                {SHOW_SIMULATE_TOGGLE && (
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
                )}
                <button
                  type="button"
                  className={`settings-toggle${hideInjured ? ' active' : ''}`}
                  role="menuitemcheckbox"
                  aria-checked={hideInjured}
                  onClick={() => setHideInjured(!hideInjured)}
                  title="Keep players on the IL off the players view — the summary table always leaves them off"
                >
                  <span className="settings-dot" aria-hidden="true" />
                  Hide injured players
                </button>
                {/* The checkable toggle(s) read together above; this one is a
                    way out of the menu, so it sits below them and beside Sign
                    out. */}
                <button
                  type="button"
                  className="help-btn"
                  role="menuitem"
                  onClick={() => {
                    setSettingsOpen(false);
                    setHelpOpen(true);
                  }}
                  title="How to use the app"
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M9.6 9.2a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.9" />
                    <path d="M12 17.2h.01" />
                  </svg>
                  How to use
                </button>
                {/* Renders nothing when auth isn't configured, so the local dev
                    menu looks exactly as it did. */}
                <SignOutButton />
              </div>
            )}
          </div>
        </div>
        {/* The research board is season-to-date and watchlist-independent, so
            the range picker has nothing to act on there — left up, it would
            invite a click that changes nothing on the page in front of you. */}
        {view !== 'research' && (
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
        )}
      </header>

      {/* Both tiers of tabs share one row when there's room for them, the second
          wrapping under the first when there isn't. The row still renders with
          just the search when the watchlist is empty (on any view — that's the
          only way to add a first player, since the tabs are hidden until
          something is watched); on the players view the search sits below
          instead, with the list it acts on. */}
      {(showViewToggle || (showAdder && !adderBelowTabs)) && (
        <div className="view-bar">
          {showViewToggle && (
            <div className="view-bar-tabs">
              <div className="view-switch" role="tablist" aria-label="View">
                {showWatchlistViews && (
                  <>
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
                  </>
                )}
                {/* Always present, watchlist or not — the league board is the
                    one page that doesn't depend on what you're tracking. */}
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'research'}
                  className={`view-tab${view === 'research' ? ' active' : ''}`}
                  onClick={() => {
                    setBackView(null);
                    setEditMode(false);
                    setView('research');
                  }}
                >
                  Research
                </button>
              </div>
              {/* Second tier: Batters / Pitchers. Beside the view tabs when
                  the row has room for both, wrapping under them when it
                  does not. */}
              {view !== 'research' && kindTabs}
            </div>
          )}
          {showAdder && !adderBelowTabs && playersBar}
        </div>
      )}

      {error && <div className="error-banner">⚠ {error}</div>}

      {watchlistLoaded && watchlist.length === 0 && !error && view !== 'research' && (
        <div className="empty-state">
          <p className="empty-title">Your watchlist is empty</p>
          <p>
            Search for a player above to start tracking their plate
            appearances, pitch sequences, and Statcast contact quality.
          </p>
          {/* The one place a first-time user is guaranteed to land, so the guide
              is offered here rather than only from the settings menu. */}
          <button type="button" className="empty-help" onClick={() => setHelpOpen(true)}>
            How does this work?
          </button>
        </div>
      )}

      {showLoading && reports.length === 0 && view !== 'research' && (
        <div className="loading">Loading events…</div>
      )}

      {showLoading && reports.length > 0 && view !== 'research' && (
        <div className="refreshing" role="status">
          <span className="spinner" aria-hidden="true" />
          Updating…
        </div>
      )}

      {/* Everyone the active view would show is on the IL. Without this the
          summary is a header over a Total row of zeros, and the players view an
          expanse of nothing with no hint that a setting is doing it. */}
      {view !== 'research' && displayReports.length > 0 && kindCards.length === 0 && !editMode && (
        <div className="empty-state">
          <p className="empty-title">Nothing to show — everyone here is on the IL</p>
          <p>
            {view === 'summary'
              ? 'Injured players are left off the summary table. Their cards are still on the Players view.'
              : 'Turn off “Hide injured players” in settings (the gear by the title) to see their cards.'}
          </p>
        </div>
      )}

      {view === 'research' ? (
        <ResearchTable
          /* Keyed on the board, not the pill: moving between positions of the
             same kind (SS → OF) keeps the sort and the filters, while crossing
             to the other board (OF → SP) starts fresh rather than carrying a
             batter's column vocabulary onto a pitcher's table. */
          key={researchKind}
          rows={research[researchCacheKey] ?? []}
          kind={researchKind}
          loading={researchLoading && !research[researchCacheKey]}
          error={researchError}
          pos={researchPos}
          onPosChange={setResearchPos}
          columnKeys={researchCols[researchKind] ?? null}
          onColumnsChange={setResearchColumns}
          qualifiedOnly={researchQualified}
          onQualifiedChange={setResearchQualified}
          window={researchWindow}
          onWindowChange={setResearchWindow}
          onOpenDetails={setDetailsKey}
        />
      ) : view === 'summary' ? (
        kindCards.length > 0 && (
          <SummaryTable
            reports={kindCards}
            onOpenDetails={setDetailsKey}
            onOpenPlayerDay={openPlayerDay}
          />
        )
      ) : view === 'feed' ? (
        kindCards.length > 0 && (
          /* Keyed so switching kind or date range starts the stream back at its
             first page; a live poll (data only) leaves it alone. */
          <LiveFeed
            key={`${shownKind}-${start}-${end}`}
            reports={kindCards}
            kind={shownKind}
            onOpenDetails={setDetailsKey}
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
          <>
            {adderBelowTabs && playersBar}
            <PlayerOrderEditor
              players={editPlayers}
              onMove={movePlayer}
              onCommit={commitOrder}
              onRemove={removeFromEditor}
            />
          </>
        ) : (
        <main className="player-list">
          {adderBelowTabs && playersBar}
          {kindCards.map(renderCard)}
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
          onRemove={() => onRemove(detailsPlayer)}
          onClose={() => setDetailsKey(null)}
        />
      )}

      {/* Last, and above the player page in the stack: opened from a link it can
          sit over an already-open details view, and closing it puts that back. */}
      {helpOpen && <Tutorial onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
