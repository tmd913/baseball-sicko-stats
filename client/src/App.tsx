import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { SignOutButton } from './auth';
import { playerKey } from './types';
import type {
  EspnOwnership,
  EspnRoster,
  EspnStatus,
  PlayerKind,
  PlayerReport,
  PlayerStatus,
  ResearchRow,
  ResearchWindow,
  RosterSource,
  SeasonPlayer,
  WatchPlayer,
} from './types';
import { isInjured } from './lib';
import { BaseballMark } from './components/BaseballMark';
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
  toResearchScope,
  toResearchWindow,
} from './components/ResearchTable';
import type { ResearchPos, ResearchScope } from './components/ResearchTable';
import { simulateLiveDay } from './simulate';
import { PlayerDetails } from './components/PlayerDetails';
import { DateRangePicker, numericRange } from './components/DateRangePicker';
import {
  FantasyRosterContext,
  MutedContext,
  PlayerStatusContext,
  useDismissable,
  useStickyChromeOffset,
} from './hooks';
import type { FantasySlot } from './hooks';
import { Tutorial } from './components/Tutorial';
import { EspnSettings } from './components/EspnSettings';

// A page's remembered scroll offset is re-applied every frame until the page
// has been the same height for PAGE_SCROLL_QUIET — long enough to outlast the
// gaps between bursts of content arriving — and abandoned after
// PAGE_SCROLL_SETTLE whatever happens, so a page that really is shorter now
// settles rather than being held against an offset it can never reach.
const PAGE_SCROLL_QUIET = 250;
const PAGE_SCROLL_SETTLE = 900;
// Anything that means the reader has taken the scroll back.
const USER_SCROLLS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

// Breathing room above a card scrolled to the top of the viewport — the bare
// gap, matching `--scroll-offset`'s own; the pinned chrome's height is added to
// it at the call site.
const SCROLL_GAP = 12;

/** The three ways of reading one set of players over one span of days. They are
 *  tabs *within* Roster rather than siblings of Research — see `section`. */
type RosterTab = 'summary' | 'games' | 'feed';
/** The flat view name the app (and the `view=` param) is written against. */
type View = RosterTab | 'research';

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
  // Where the page is, in two parts rather than one flat list of four views.
  //
  // The top tier is **Roster or Research**, which is the real division: Roster
  // is a read on the watchlist (or the fantasy team) over the date range,
  // Research is the whole league over the season — it hides the date row for
  // that reason, and is reachable with nothing watched, finding players to
  // watch being half of what it's for. Summary, Games and Feed are three ways
  // of reading *the same set of players over the same days*, so they are a
  // tier below, under the kind tabs, rather than three siblings of Research.
  //
  // Keeping them as two pieces of state is what lets Roster remember which of
  // its three you were last on: leaving for Research and coming back lands
  // where you left rather than resetting to Summary.
  const [section, setSection] = useState<'roster' | 'research'>(() =>
    initialParams.get('view') === 'research' ? 'research' : 'roster',
  );
  const [rosterTab, setRosterTab] = useState<RosterTab>(() => {
    const v = initialParams.get('view');
    // `players` is what the Games tab was called before it was named for what
    // it shows; a link written under the old name still opens it, the same
    // courtesy `readKeys` extends to pre-two-way player ids.
    if (v === 'games' || v === 'players') return 'games';
    // Summary is the default; the rest are opted into explicitly.
    return v === 'feed' ? 'feed' : 'summary';
  });
  // The flat view name the rest of the app is written against, and the URL
  // still carries — the split above is a fact about the tab rows, not about
  // what any view is reading, so nothing downstream has to know about it.
  const view: View = section === 'research' ? 'research' : rosterTab;
  const setView = useCallback((next: View) => {
    if (next === 'research') setSection('research');
    else {
      setSection('roster');
      setRosterTab(next);
    }
  }, []);
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
  // Play every clip with the sound off. Saved per user like the toggle above,
  // but deliberately **not** in the URL: hide-injured is there because it
  // changes which players a view is reporting on, and a link that says so is
  // saying something about the data. Muting is a preference about this person
  // and this room — a shared link has no business carrying it, and there is no
  // param for a recipient's own saved setting to have to defend itself against.
  const [muteAudio, setMuteAudioState] = useState(false);
  // As with hide-injured: set once the user works the toggle, so the saved
  // value landing a moment later can't undo a choice they have just made.
  const muteAudioTouched = useRef(false);
  const setMuteAudio = useCallback((mute: boolean) => {
    muteAudioTouched.current = true;
    setMuteAudioState(mute);
    api
      .saveMuteAudio(mute)
      .catch((e: Error) => console.error('saving mute-audio failed:', e.message));
  }, []);
  /**
   * Which set of players the four watchlist views describe: the list built here,
   * or the user's ESPN fantasy roster.
   *
   * In the URL like `hideil=1`, and for the same reason — it changes *which
   * players a view is reporting on*, so a shared link that says so is saying
   * something about the data. Saved per user too, with the same
   * already-touched guard, so a preference landing a moment after boot can't
   * undo a switch just made.
   */
  const [rosterSource, setRosterSourceState] = useState<RosterSource>(() =>
    initialParams.get('roster') === 'fantasy' ? 'fantasy' : 'watchlist',
  );
  const rosterSourceFromUrl = initialParams.get('roster') === 'fantasy';
  const rosterSourceTouched = useRef(false);
  const setRosterSource = useCallback((next: RosterSource) => {
    rosterSourceTouched.current = true;
    setRosterSourceState(next);
    api
      .saveRosterSource(next)
      .catch((e: Error) => console.error('saving roster source failed:', e.message));
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
        // No URL param to reconcile against — the saved value is the only
        // source there is, so it applies unless the user has already spoken.
        if (!muteAudioTouched.current && prefs.muteAudio) setMuteAudioState(true);
        // Same rule as hide-injured: the URL can only ever say `fantasy`, so
        // silence there is unspecified rather than "watchlist", which is what
        // lets the saved value fill it in.
        if (
          !rosterSourceTouched.current &&
          !rosterSourceFromUrl &&
          prefs.rosterSource === 'fantasy'
        ) {
          setRosterSourceState('fantasy');
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
  }, [urlColumns, hideInjuredFromUrl, rosterSourceFromUrl]);

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
  // Whose players the board shows. Shared across both boards and both windows
  // like the two above — it is a statement about you, not about the board.
  const [researchScope, setResearchScope] = useState<ResearchScope>(() =>
    toResearchScope(initialParams.get('scope')),
  );
  // Keyed by board **and** window: each is its own fetch and its own megabyte,
  // and both are kept, so flipping back to a window already read is instant.
  const [research, setResearch] = useState<Record<string, ResearchRow[]>>({});
  const researchCacheKey = `${researchKind}:${researchWindow}`;
  // The research board is the whole league, so it marks its rows against the
  // watchlist rather than being built from it. Same key `PlayerAdder` dedupes
  // on, so the two agree about what "already watched" means.
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

  // ---- ESPN fantasy league ----
  // The connection status is read once on boot, next to the preferences: it
  // decides whether the research board offers its Free Agents pill, which is a
  // thing the first render would otherwise get wrong and then correct.
  // Deliberately not in the URL — a connection is an account fact, not a view.
  const [espnOpen, setEspnOpen] = useState(false);
  const [espnStatus, setEspnStatus] = useState<EspnStatus | null>(null);
  const [ownership, setOwnership] = useState<EspnOwnership | null>(null);
  const [espnLoading, setEspnLoading] = useState(false);
  const [espnError, setEspnError] = useState<string | null>(null);
  /** Why an invite link didn't work, shown on the page it opens. */
  const [espnJoinError, setEspnJoinError] = useState<string | null>(null);

  // Settled either way — read or failed. The report waits on this rather than
  // on the status itself, so a failed read doesn't leave a `roster=fantasy`
  // session waiting forever for an answer that isn't coming.
  const [espnStatusSettled, setEspnStatusSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .espn()
      .then((s) => {
        if (!cancelled) setEspnStatus(s);
      })
      // Not banner-worthy: with no status the board simply doesn't offer the
      // pill, which is what an unconnected user sees anyway.
      .catch((e: Error) => console.error('ESPN status unavailable:', e.message))
      .finally(() => {
        if (!cancelled) setEspnStatusSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * An invite link (`?league=<code>`) hands this user a leaguemate's
   * connection. Redeemed once on load, before anything else asks about a
   * league — and the page is then **opened**, rather than the app quietly
   * changing state behind them: a link that silently rewires where your player
   * list comes from is a surprise, and they have to pick their team anyway.
   *
   * The param needs no cleanup of its own: `App`'s URL sync writes the whole
   * query string from the view state, and `league` isn't part of it, so the
   * first sync drops it. That also means a reload can't redeem it twice.
   */
  const inviteCode = initialParams.get('league');
  useEffect(() => {
    if (!inviteCode) return;
    let cancelled = false;
    api
      .joinEspn(inviteCode)
      .then((s) => {
        if (cancelled) return;
        setEspnStatus(s);
        setEspnOpen(true);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        // Opened anyway, with the reason: an expired link that does nothing at
        // all leaves someone staring at an app that ignored what they clicked.
        setEspnJoinError(e.message);
        setEspnOpen(true);
      })
      .finally(() => {
        if (!cancelled) setEspnStatusSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [inviteCode]);

  const espnConnected = espnStatus?.connected === true;
  const espnLeagueId = espnStatus?.connected ? espnStatus.leagueId : null;
  const espnTeamId = espnStatus?.connected ? espnStatus.teamId : null;
  const espnTeamName = espnStatus?.connected ? espnStatus.teamName : null;
  const espnLeagueName = espnStatus?.connected ? espnStatus.leagueName : null;

  /** Who is rostered in the connected league. The previous read is deliberately
   *  left in place while this one is in flight, so a re-read doesn't blank a
   *  table the user is reading. */
  const loadOwnership = useCallback((refresh = false) => {
    setEspnLoading(true);
    setEspnError(null);
    // Returned so a caller can wait on it: `refreshFantasy` busts this cache
    // first and then lets the reads that share it come back through it.
    return api
      .espnOwnership(refresh)
      .then(setOwnership)
      .catch((e: Error) => setEspnError(e.message))
      .finally(() => setEspnLoading(false));
  }, []);

  /**
   * Read lazily, and only for the board that needs it: the rosters are
   * irrelevant until someone asks which players are free.
   *
   * This fires on **every entry** to the free-agent board rather than once a
   * session, and that is the point — a roster changes whenever anyone in the
   * league makes a move, so a set read at breakfast is the wrong answer by
   * lunchtime. It costs nothing to re-ask: the server holds its own ten-minute
   * cache, which is the single place freshness is decided, and repeats inside
   * it are a lookup. The dependency list is exactly the set of things that can
   * *be* an entry, so nothing else here re-triggers it — and deliberately not
   * `ownership` or `espnLoading`, either of which would re-run the effect on
   * its own result and spin.
   */
  useEffect(() => {
    if (view !== 'research' || researchScope !== 'fa' || !espnConnected) return;
    loadOwnership();
  }, [view, researchScope, espnConnected, espnLeagueId, loadOwnership]);

  // A different league (or a disconnect) invalidates the whole set.
  useEffect(() => {
    setOwnership(null);
    setEspnError(null);
  }, [espnLeagueId]);

  const ownedIds = useMemo(
    () => (ownership ? new Set(Object.keys(ownership.owned).map(Number)) : null),
    [ownership],
  );

  // The fantasy roster itself — the slot chips, and the list the reorder screen
  // and the adder must not pretend to edit. Only read while it is in use.
  const [fantasyRoster, setFantasyRoster] = useState<EspnRoster | null>(null);
  const usingFantasy = rosterSource === 'fantasy' && espnConnected;

  /**
   * The team the views are reading, or null while they are reading the saved
   * watchlist. This is what makes a team change reload: `PUT /api/espn/team`
   * answers with a new status and nothing else about the league moves, so
   * without the id in these dependency lists the app kept showing the old
   * team's players until a reload.
   */
  const fantasyTeamId = usingFantasy ? espnTeamId : null;

  /**
   * Read the fantasy team from ESPN. `refresh` skips the server's ten-minute
   * cache; the previous roster is left in place while the read is in flight, so
   * a re-read never blanks the slot chips.
   *
   * The sequence number is what the effect's `cancelled` flag used to be, and
   * is needed for the same reason in a different shape: two team picks in quick
   * succession are two reads in flight, and without it the slower one lands
   * last and leaves the chips describing a team nobody chose.
   */
  const rosterRead = useRef(0);
  const loadFantasyRoster = useCallback((refresh = false) => {
    const seq = ++rosterRead.current;
    return api
      .espnRoster(refresh)
      .then((r) => {
        if (seq === rosterRead.current) setFantasyRoster(r);
      })
      // The report request carries the same failure and banners it; a second
      // copy of the same message would only say it twice.
      .catch((e: Error) => console.error('fantasy roster unavailable:', e.message));
  }, []);

  useEffect(() => {
    if (!usingFantasy) return;
    loadFantasyRoster();
  }, [usingFantasy, espnLeagueId, fantasyTeamId, start, end, loadFantasyRoster]);

  /** Slot by player key, for the chips. Null when the views are reading the
   *  saved watchlist, which is what makes every chip in the app disappear. */
  const fantasySlots = useMemo(() => {
    if (!usingFantasy || !fantasyRoster) return null;
    const map = new Map<string, FantasySlot>();
    for (const p of fantasyRoster.players) {
      if (p.mlbId === null) continue;
      for (const kind of p.kinds) {
        map.set(`${kind}-${p.mlbId}`, {
          slot: p.slot,
          starting: p.starting,
          injuryStatus: p.injuryStatus,
        });
      }
    }
    return map;
  }, [usingFantasy, fantasyRoster]);

  /**
   * The keys "my players" means on screen — the saved watchlist, or the fantasy
   * roster when that is what the views are reading. This is what the research
   * board's `My Players` scope selects on and what its ✓ marks, so both follow
   * whichever list is actually being shown.
   *
   * Deliberately *not* what `PlayerAdder` dedupes against, which stays the
   * saved list: that control's button adds to the saved list whatever mode the
   * app is in, and it should show the state of the thing it changes.
   */
  const watchedKeys = useMemo(() => {
    if (fantasySlots) return new Set(fantasySlots.keys());
    return new Set(watchlist.map(playerKey));
  }, [watchlist, fantasySlots]);

  /** ESPN's global rostered percentage by MLB id, or null with no league —
   *  which is also what turns the board's `Ros%` column on and off. */
  const rosterPct = useMemo(() => {
    if (!espnConnected || !ownership) return null;
    const map = new Map<number, number>();
    for (const [id, pct] of Object.entries(ownership.rosterPct)) map.set(Number(id), pct);
    return map;
  }, [espnConnected, ownership]);

  /**
   * Read the ownership map for the two surfaces that want roster % — the
   * research board and the player page — as well as the free-agent filter that
   * already asked for it.
   *
   * Unlike that one this fires **once**: roster % is ESPN's season-wide figure
   * and moves by a fraction of a point a day, where a league's rosters change
   * the moment anyone makes a move. Every guard here is a terminal state
   * (loaded, failed, or in flight), so the effect cannot re-trigger on its own
   * result.
   */
  useEffect(() => {
    if (!espnConnected || ownership || espnLoading || espnError) return;
    if (view !== 'research' && detailsKey === null) return;
    loadOwnership();
  }, [espnConnected, ownership, espnLoading, espnError, view, detailsKey, loadOwnership]);

  /**
   * What the league has to say about each player today — his roster status, and
   * where his club's game has him. One request for everybody, because the two
   * views that want it ask about players they hold no report for: the research
   * board is several hundred rows of the whole league, and the details view
   * opens on whoever it was pointing at.
   *
   * Re-read on **every entry**, like the free-agent ownership read above and
   * for the same reason: a lineup posts a couple of hours before first pitch
   * and a man goes on the IL at noon, so a map read at breakfast is the wrong
   * answer by dinner. It costs nothing to re-ask — the server's day is cached
   * ten minutes, fifteen seconds while a game is live — and the ref keeps two
   * entries in quick succession from sending two requests.
   *
   * A failure is swallowed: this decorates a headshot, and the board it sits on
   * is the thing the user actually came for.
   */
  const [playerStatuses, setPlayerStatuses] = useState<Map<number, PlayerStatus> | null>(null);
  const statusesInFlight = useRef(false);
  const loadStatuses = useCallback(() => {
    if (statusesInFlight.current) return;
    statusesInFlight.current = true;
    api
      .statuses()
      .then((byId) =>
        setPlayerStatuses(new Map(Object.entries(byId).map(([id, st]) => [Number(id), st]))),
      )
      .catch((e: Error) => console.error('player statuses unavailable:', e.message))
      .finally(() => {
        statusesInFlight.current = false;
      });
  }, []);

  useEffect(() => {
    if (view !== 'research' && detailsKey === null) return;
    loadStatuses();
  }, [view, detailsKey, loadStatuses]);

  /** How each roster % has moved lately, and over how long. Null without a
   *  league, and also when the server has no baseline yet. */
  const rosterTrend = useMemo(() => {
    if (!espnConnected || !ownership?.trend) return null;
    const map = new Map<number, number>();
    for (const [id, d] of Object.entries(ownership.trend.delta)) map.set(Number(id), d);
    return { delta: map, days: ownership.trend.days };
  }, [espnConnected, ownership]);

  /**
   * The board's rows with roster % merged in. Client-side because the research
   * board is cached per kind and window and served to every user alike, while
   * this number is only shown to someone with a league connected — folding it
   * into that blob would make a shared cache carry a per-user concern.
   */
  const researchRows = useMemo(() => {
    const rows = research[researchCacheKey] ?? [];
    if (!rosterPct) return rows;
    return rows.map((r) => ({
      ...r,
      rosterPct: rosterPct.get(r.id) ?? null,
      // Absent from the delta map means "hasn't moved", not "unknown": the
      // server drops zeroes to keep the blob small, so a player with a roster %
      // and no entry really is flat.
      rosterTrend: rosterTrend ? (rosterPct.has(r.id) ? rosterTrend.delta.get(r.id) ?? 0 : null) : null,
    }));
  }, [research, researchCacheKey, rosterPct, rosterTrend]);

  const openEspnSettings = useCallback(() => {
    setSettingsOpen(false);
    setEspnOpen(true);
  }, []);

  /** Stable, because the settings page has an effect that depends on it — an
   *  inline arrow would hand that effect a new identity on every render. */
  const onEspnStatusChange = useCallback((s: EspnStatus) => {
    setEspnStatus(s);
    // A fresh connection (or a disconnect) makes whatever was read before
    // wrong; the board re-reads when it next needs it.
    setOwnership(null);
    setEspnError(null);
  }, []);
  // The settings popover (gear next to the title) — the hide-injured toggle
  // (and the simulate one, when it's shown), then the way into the how-to page.
  // Closes on outside click or Escape.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  useDismissable(settingsOpen, settingsRef, closeSettings);
  // Everything to do with the fantasy league, behind its own button beside the
  // gear. It was two entries in the settings menu — a "Use my fantasy team"
  // toggle and a "Fantasy league" page link — plus a chip in the view bar
  // naming the team, which is one feature answered in three places, none of
  // them saying where the other two were. The button is the one place: it is
  // lit when the app is reading the fantasy roster, so the state the chip used
  // to carry is the button's own appearance, and what the chip *said* (which
  // team) is the first line inside it.
  const [fantasyOpen, setFantasyOpen] = useState(false);
  const fantasyRef = useRef<HTMLDivElement | null>(null);
  const closeFantasy = useCallback(() => setFantasyOpen(false), []);
  useDismissable(fantasyOpen, fantasyRef, closeFantasy);
  // Edit mode (the pencil in the header): swaps the player list for the
  // drag-to-reorder edit screen. Deliberately not persisted in the URL — it's a
  // transient mode, not a view.
  const [editMode, setEditMode] = useState(false);
  // The roster search is an icon in the header; pressing it opens the search
  // bar across the top of the page. Transient for the same reason edit mode is
  // — a search box you left open is not a view worth restoring from a link.
  const [searchOpen, setSearchOpen] = useState(false);
  // Same idea for the date controls, which are the widest thing in the header:
  // below 640px they collapse behind the calendar icon and open as their own
  // full-width line. Transient like the other two.
  const [dateOpen, setDateOpen] = useState(false);
  // "Search for a player" from the empty state has two things it could mean,
  // depending on which of the two the breakpoint is showing: put the cursor in
  // the header's field, or open the bar the icon opens. `offsetParent` is null
  // for a `display: none` element, so the DOM answers which is up rather than a
  // second copy of the 640px rule in JS drifting out of step with the first.
  const openSearch = useCallback(() => {
    const inline = document.querySelector<HTMLInputElement>('.header-search .adder-input');
    if (inline && inline.offsetParent !== null) {
      inline.focus();
      return;
    }
    setSearchOpen(true);
  }, []);

  // The pinned chrome, measured — it publishes `--chrome-h` for every
  // `scroll-margin-top` in the stylesheet, and hands its height back here for
  // the one scroll the app computes itself (below).
  const [chromeRef, chromeH] = useStickyChromeOffset<HTMLDivElement>();

  // Scroll a player's card to the top of the viewport — below the pinned
  // chrome, which is what `scroll-margin-top` does for every collapsible that
  // scrolls itself; this one does the arithmetic, so it subtracts the bar too.
  //
  // Deferred a frame because callers expand the card first: expanding grows the
  // document, and only then is there room to scroll a bottom-of-page card's top
  // up to the top. Scrolling before the grow would clamp at the old, shorter page
  // bottom and stop short.
  const scrollToPlayer = useCallback((key: string) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(`player-${key}`);
      if (!el) return;
      const top =
        el.getBoundingClientRect().top + window.scrollY - SCROLL_GAP - chromeH.current;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    });
  }, [chromeH]);
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
    // 'mine' is the default and stays out of the URL. That does mean a bare
    // research link opens on the *recipient's* watchlist rather than the
    // sender's board — which is the right way round: the scope names a set of
    // players, and it is their set the word "mine" refers to on their screen.
    // A sender who means "look at the whole league" gets `scope=all` written
    // for them, since that now differs from the default.
    if (view === 'research' && researchScope !== 'mine') p.set('scope', researchScope);
    // The column set of the board on screen, and only once it differs from that
    // board's defaults — otherwise every link would carry twenty stat keys to
    // say "the usual". `pos=` is what tells a reader which board they describe.
    const cols = researchCols[researchKind];
    if (view === 'research' && cols && !isDefaultColumns(researchKind, cols)) {
      p.set('cols', cols.join(','));
    }
    if (simulate) p.set('sim', '1');
    if (hideInjured) p.set('hideil', '1');
    if (rosterSource === 'fantasy') p.set('roster', 'fantasy');
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
    researchScope,
    researchCols,
    researchKind,
    simulate,
    hideInjured,
    rosterSource,
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
    (quiet = false, refresh = false) => {
      if (!quiet) setReportLoading(true);
      return api
        .report(start, end, usingFantasy ? 'fantasy' : 'watchlist', refresh)
        .then((r) => setReports(r.players))
        .catch((e: Error) => setError(e.message))
        .finally(() => {
          if (!quiet) setReportLoading(false);
        });
    },
    [start, end, usingFantasy],
  );

  // Refresh report when the date range, the watchlist, or which list is being
  // read changes. `watchlist` is still a dependency in fantasy mode — it costs
  // one refetch on a change that can't happen while the editor is hidden, and
  // dropping it would mean a switch back showing the pre-edit list.
  useEffect(() => {
    // A session that opens on `roster=fantasy` waits for the connection status
    // first. Firing now would read the saved watchlist, render it, and replace
    // it a moment later — a flash of the wrong list of players, which is worse
    // than a slightly longer spinner.
    if (rosterSource === 'fantasy' && !espnStatusSettled) return;
    loadReport();
    // `fantasyTeamId` because the report is *about* that team's players: pick a
    // different one on the Fantasy league page and this is what re-reads it.
  }, [loadReport, watchlist, rosterSource, espnStatusSettled, fantasyTeamId]);

  /**
   * Re-read everything that comes from ESPN, past the server's ten-minute
   * cache — the ownership map, the fantasy roster's slots, and the report the
   * roster decides the players of. For the person who has just moved someone
   * over on ESPN and has come back here to see it.
   *
   * Deliberately sequential, and only the first call carries the flag: all
   * three read the same league payload, and `getOwnership(force)` bypasses the
   * in-flight guard as well as the cache, so firing them together would send
   * three copies of one 2MB upstream read instead of one and two lookups.
   */
  const refreshFantasy = useCallback(() => {
    const fresh = espnConnected ? loadOwnership(true) : Promise.resolve();
    return fresh.then(() => {
      if (!usingFantasy) return;
      loadFantasyRoster();
      loadReport();
    });
  }, [espnConnected, usingFantasy, loadOwnership, loadFantasyRoster, loadReport]);

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
  // or when the user navigates explicitly via the tabs. Where in that view the
  // reader was is the page memory's business, not this one's.
  const [backView, setBackView] = useState<'summary' | 'feed' | null>(null);
  // Set by the one path that places the scroll itself — the jump to a player's
  // day, which scrolls to his card — so the page memory below doesn't restore
  // the Games view's own offset out from under it. The back button needs no
  // such flag: putting the reader back where they were on the view they came
  // from is exactly what the memory does anyway.
  const scrollPlaced = useRef(false);
  const goBack = () => {
    if (!backView) return;
    setBackView(null);
    setView(backView);
  };
  // From the feed/summary: jump to a player's full day on the players view —
  // switch views, expand their card, and scroll it to the top. Record the origin
  // view + its scroll offset for the back button.
  const openPlayerDay = useCallback(
    (key: string) => {
      const from = view === 'summary' || view === 'feed' ? view : null;
      scrollPlaced.current = true;
      setBackView(from);
      setEditMode(false);
      setView('games');
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
  // went down his row is a line of dashes. Whether that is worth showing is the
  // user's call and nobody else's: the summary table and the players view both
  // drop him only when the settings toggle asks. The summary used to drop him
  // outright, on the reasoning that its rows are nothing *but* those columns —
  // but a row of dashes against a name is itself the answer to "is he playing?",
  // and a table that quietly omits a player you watch is a worse thing than a
  // sparse one, since nothing on screen says he was left out. The feed is left
  // alone either way: it's a record of things that happened, and it already
  // keeps inactive players out of Upcoming.
  //
  // Filtering here, ahead of the kind split, is what keeps the tab counts equal
  // to the list under them. The reorder screen is deliberately upstream of it
  // (`editPlayers`, off raw `reports`) — dropping an injured player from the
  // watchlist is exactly what that screen is for.
  const shownReports = useMemo(
    () =>
      hideInjured
        ? displayReports.filter((r) => !isInjured(r.rosterStatus))
        : displayReports,
    [displayReports, hideInjured],
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
  // Each page keeps its own place, and going back to it lands where you left.
  //
  // Games and Feed are two readings of the same days over one window scroller,
  // so the offset used to carry straight across a tab switch: leaving Games
  // 800px down opened the Feed 800px into a stream of somebody else's at-bats,
  // and coming back clamped to wherever the shorter page ended. That only
  // became reachable when the chrome was pinned — the tabs used to be at the
  // top of the page, so getting to one meant scrolling back up first and the
  // reset came free with having to go there.
  //
  // Keyed by view **and kind**, since the kind tabs swap the whole list for a
  // different set of players: Feed/Batters and Feed/Pitchers are two pages by
  // the same test that makes Games and Feed two. Not keyed on the date range,
  // which changes the numbers in the rows rather than which rows they are —
  // the row being read is still on screen. A page not yet visited opens at the
  // top, which is what the old reset did for every page.
  const scrollKey = view === 'research' ? 'research' : `${view}:${shownKind}`;
  // Read by the scroll listener, which is bound once and would otherwise close
  // over the key from the render that bound it.
  const scrollKeyRef = useRef(scrollKey);
  scrollKeyRef.current = scrollKey;
  const pageScroll = useRef(new Map<string, number>());
  // High while a restore is in flight, so the listener doesn't record the
  // half-way positions the restore itself passes through as the reader's.
  const restoring = useRef(false);
  const restoreRaf = useRef(0);

  // Two of the four views don't scroll the window at all: the summary and
  // research boards are fixed-height columns whose table scrolls inside them,
  // which is why the memory is written and read through this rather than
  // through `window` directly.
  const pageScroller = () =>
    document.querySelector<HTMLElement>('.summary-scroll, .research-scroll');

  useEffect(() => {
    const onScroll = (e: Event) => {
      if (restoring.current) return;
      const el = pageScroller();
      const target = e.target;
      // A scroll inside an overlay (the player page, the how-to) is not the
      // page's, and nor is a table's own horizontal scroller.
      if (el) {
        if (target === el) pageScroll.current.set(scrollKeyRef.current, el.scrollTop);
      } else if (target === document || target === document.documentElement) {
        pageScroll.current.set(scrollKeyRef.current, window.scrollY);
      }
    };
    // Capture, because a scroll event doesn't bubble: the inner scrollers'
    // events reach a document listener on the way down or not at all.
    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, []);

  const firstPage = useRef(true);
  useLayoutEffect(() => {
    // The jump to a player's day places the scroll itself, and the browser's
    // own restore on a reload owns the first pass.
    if (firstPage.current || scrollPlaced.current) {
      firstPage.current = false;
      scrollPlaced.current = false;
      return;
    }
    const top = pageScroll.current.get(scrollKey) ?? 0;
    const inner = pageScroller();
    if (inner) {
      inner.scrollTop = top;
      return;
    }
    if (top <= 0) {
      window.scrollTo(0, 0);
      return;
    }
    // A page re-mounts shorter than it will be — the feed's clips and images
    // size themselves as they load, 3158px growing to 5426px on a measured
    // watchlist — so a single `scrollTo` lands wherever the page currently
    // ends. Worse, it can't simply be repeated until the offset is *reachable*
    // and then left alone: content arriving **above** the viewport pushes
    // everything down, and the browser's scroll anchoring follows it to keep
    // the visible rows still, which took a restored 1800 to 2934 a frame after
    // it landed. So the offset is held until the page has **stopped growing**,
    // with anchoring switched off underneath it — the saved number was
    // measured against the finished page, and it is the finished page it has
    // to be applied to. `PAGE_SCROLL_SETTLE` ends it either way: a page that
    // really is shorter now (a live update dropped an item) must not be held
    // against an offset it can never reach.
    restoring.current = true;
    const root = document.documentElement;
    const anchor = root.style.overflowAnchor;
    root.style.overflowAnchor = 'none';
    const started = performance.now();
    let lastHeight = -1;
    let steadySince = started;
    const stop = () => {
      cancelAnimationFrame(restoreRaf.current);
      root.style.overflowAnchor = anchor;
      restoring.current = false;
    };
    const step = () => {
      window.scrollTo(0, top);
      const now = performance.now();
      const height = root.scrollHeight;
      if (height !== lastHeight) {
        lastHeight = height;
        steadySince = now;
      }
      // Two frames of the same height is not settled — the content arrives in
      // bursts, and letting go on the first pause put the feed back at 1800
      // and watched it drift to 2934 when the next burst landed 36ms later.
      const held = Math.abs(window.scrollY - top) < 1 && now - steadySince > PAGE_SCROLL_QUIET;
      if (held || now - started > PAGE_SCROLL_SETTLE) {
        stop();
        return;
      }
      restoreRaf.current = requestAnimationFrame(step);
    };
    // The reader wins: a scroll of their own during that window ends it, or
    // the retry would drag the page back under their finger.
    for (const ev of USER_SCROLLS) window.addEventListener(ev, stop, { once: true, passive: true });
    step();
    return () => {
      stop();
      for (const ev of USER_SCROLLS) window.removeEventListener(ev, stop);
    };
  }, [scrollKey]);
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
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={shownKind === 'pitcher'}
        className={`kind-tab${shownKind === 'pitcher' ? ' active' : ''}`}
        onClick={() => setPlayerKind('pitcher')}
      >
        Pitchers
      </button>
    </div>
  ) : null;
  // The header's cluster, at the top right: the roster search and the Edit
  // (reorder) toggle. The calendar was the third of them and has moved down to
  // the roster row (see `dateToggle`), which leaves the header holding only
  // what belongs to the watchlist itself rather than to any one page of it.
  // Icons rather than labelled buttons because a full search field is the
  // widest thing in the row and is wanted for a few seconds at a time, so it
  // earns its space only while it is being used; pressing one opens its own bar
  // across the top instead.
  //
  // Only one bar at a time: they are alternatives, not a stack, and two of them
  // over a phone's view tabs is more chrome than page.
  const headerTools = (
    <div className="header-tools">
      {/* The search form itself, shown from 641px up where there is room for it
          and the icon below. Rendered alongside the toggle and swapped by a
          media query rather than chosen in JS — the same way the date presets
          and their phone dropdown already do it, which keeps one breakpoint in
          the stylesheet instead of one in each place. Both are mounted, so each
          keeps its own query; only one is ever on screen. */}
      <div className="header-search">
        <PlayerAdder
          players={seasonPlayers}
          watchlist={watchlist}
          onAdd={onAdd}
          onOpenDetails={setDetailsKey}
          loading={playersLoading}
        />
      </div>
      <button
        type="button"
        className={`search-toggle${searchOpen ? ' active' : ''}`}
        onClick={() => {
          setDateOpen(false);
          setSearchOpen((v) => !v);
        }}
        aria-expanded={searchOpen}
        aria-label={searchOpen ? 'Close player search' : 'Search for a player'}
        title={searchOpen ? 'Close search' : 'Search for a player'}
      >
        <svg
          viewBox="0 0 24 24"
          width="17"
          height="17"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.4 15.4 4.1 4.1" />
        </svg>
      </button>
      {/* Opens the reorder screen in place of the player list. Hidden until
          there's more than one player to put in an order — and while the views
          are reading the fantasy roster, where there is no order of ours to
          edit and no player of ours to remove. ESPN owns that list; a screen
          offering to rearrange it would be offering something it can't do. */}
      {reports.length > 1 && !usingFantasy && (
        <button
          type="button"
          className={`edit-order-btn${editMode ? ' active' : ''}`}
          onClick={() => {
            // The reorder screen only exists on the Games view, and from the
            // header this button can be pressed from anywhere — so take the
            // user there rather than flipping a mode with nothing on screen
            // to show for it.
            if (!editMode && view !== 'games') {
              setBackView(null);
              setView('games');
            }
            // The edit screen hides the rest of the chrome, the search bar
            // included; closing it here stops it being restored on the way out
            // of a mode it was never visible in.
            setSearchOpen(false);
            setEditMode((v) => !v);
          }}
          title={editMode ? 'Finish editing' : 'Reorder players'}
          aria-label={editMode ? 'Finish editing' : 'Reorder players'}
          aria-pressed={editMode}
        >
          <span className="edit-order-icon" aria-hidden="true">
            {editMode ? (
              <svg
                viewBox="0 0 24 24"
                width="17"
                height="17"
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
                width="17"
                height="17"
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
          <span className="edit-order-label">{editMode ? 'Done' : 'Edit'}</span>
        </button>
      )}
    </div>
  );

  /* The calendar, which is both the disclosure for the date controls and the
     one thing on the page saying which days every number on it is drawn from.
     Those were two controls until now — a square icon up in the header and a
     round `dateBadge` down in the view bar — which is the page telling you the
     span in one place and letting you change it in another, and a chip that
     could only be read sitting an inch from a button that only opened. One
     control says both: the label *is* the state, and pressing the thing that
     states the range is how you change it.

     It lives on the roster row rather than in the header for the same reason
     the roster tabs do: the dates qualify exactly these views and nothing on
     the research board, so a header slot made it chrome belonging to the whole
     app when it belongs to one page of it. Last in the row, after the tab
     groups — it is the answer to "which days", which is the question you ask
     after "which players" and "which reading of them". */
  const dateToggle = (
    <button
      type="button"
      className={`date-toggle${dateOpen ? ' active' : ''}`}
      onClick={() => {
        setSearchOpen(false);
        setDateOpen((v) => !v);
      }}
      aria-expanded={dateOpen}
      aria-label={dateOpen ? 'Close date controls' : 'Change dates'}
      title={dateOpen ? 'Close dates' : 'Change dates'}
    >
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
      </svg>
      {/* The preset's own word while one is active, so it reads "Today" rather
          than today's date — that is what was picked, and it survives the date
          rolling over. A hand-picked range has no name and shows its numbers. */}
      <span className="date-toggle-label">{activePreset ?? numericRange(start, end)}</span>
    </button>
  );

  /* The presets and the range picker themselves. They open as a full-width row
     of the view bar, directly under the button that opened them — they used to
     hang off the header, which is where the calendar used to be; a disclosure
     and the thing it discloses have to stay together, and following the button
     down is the whole of that. Rendered once either way rather than duplicated
     into a second location: `.view-bar` already wraps, so `flex: 1 1 100%` on
     `.app.date-open .date-control` is all "its own row" takes. */
  const dateControl = (
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
                // Same as the phone dropdown below: the row is a disclosure
                // at every width now, and picking a preset is the errand it
                // was opened for, so it closes behind you. The range picker
                // still doesn't — its own popover needs the row to stay.
                setDateOpen(false);
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
            // As the pills above: picking a preset is the errand, so the
            // row closes behind you.
            setDateOpen(false);
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
  );

  // The search bar the header icon opens: a full-width row directly under the
  // header, above the view tabs. It is a row of its own rather than an overlay
  // so nothing it covers has to be guessed at — the page moves down by the
  // height of one control and everything stays readable behind it.
  const searchBar = searchOpen ? (
    <div className="search-bar">
      <PlayerAdder
        players={seasonPlayers}
        watchlist={watchlist}
        onAdd={onAdd}
        onOpenDetails={setDetailsKey}
        loading={playersLoading}
        autoFocus
        onClose={() => setSearchOpen(false)}
      />
      <button
        type="button"
        className="search-bar-close"
        onClick={() => setSearchOpen(false)}
        aria-label="Close search"
        title="Close search"
      >
        ✕
      </button>
    </div>
  ) : null;

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
    /* One provider over the whole app: every clip plays through `ClipVideo`,
       which reads it, so the cards, the feed, the player page and the highlight
       reel are all covered without any of them handling the value. */
    <MutedContext.Provider value={muteAudio}>
    <FantasyRosterContext.Provider value={fantasySlots}>
    <PlayerStatusContext.Provider value={playerStatuses}>
    <div
      className={`app${view === 'summary' ? ' summary-mode' : ''}${
        view === 'research' ? ' research-mode' : ''
      }${editMode ? ' edit-mode' : ''}${dateOpen ? ' date-open' : ''}`}
    >
      {/* Everything above the page's content, in one box so it can be pinned to
          the top of the window as one thing (`position: sticky`). They were
          three siblings — the header, the search bar and the view bar — and
          they belong together: each is a statement of *where you are and what
          you are looking at*, which is exactly what should not scroll away
          under a page you are reading.

          Staying put is also why it carries a tone of its own rather than the
          page's — see `.app-chrome`. A bar that is always there has to say it
          is a bar. */}
      <div className="app-chrome" ref={chromeRef}>
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
                  title="Keep players on the IL off the summary table and the Games view — the feed still shows what they did before they got hurt"
                >
                  <span className="settings-dot" aria-hidden="true" />
                  Hide injured players
                </button>
                <button
                  type="button"
                  className={`settings-toggle${muteAudio ? ' active' : ''}`}
                  role="menuitemcheckbox"
                  aria-checked={muteAudio}
                  onClick={() => setMuteAudio(!muteAudio)}
                  title="Play every video clip with the sound off"
                >
                  <span className="settings-dot" aria-hidden="true" />
                  Mute clip audio
                </button>
                {/* The fantasy entries used to sit here — the roster-source
                    toggle and the league page — and have moved out to their own
                    button beside the gear, where the state they control can be
                    read without opening anything. */}
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
          {/* Everything fantasy, behind one button next to the gear. It is lit
              (`.on`) whenever the app is reading the fantasy roster, which is
              what the view bar's team chip used to say — the difference being
              that a chip could only be read, where this can be read *and*
              pressed to change what it reports. `.active` is the popover being
              open, the same two-class split the research board's disclosures
              use, and the fill wins over the tint while it is open because by
              then the panel itself is saying the state.

              With no league connected there is nothing to put in a menu, so the
              button opens the league page directly: a popover holding one item
              is a menu that isn't one. */}
          <div className="fantasy-menu" ref={fantasyRef}>
            <button
              type="button"
              className={`fantasy-btn${fantasyOpen ? ' active' : ''}${
                usingFantasy ? ' on' : ''
              }`}
              aria-haspopup={espnConnected ? 'true' : undefined}
              aria-expanded={espnConnected ? fantasyOpen : undefined}
              aria-label="Fantasy league"
              title={
                usingFantasy
                  ? `Reading ${fantasyRoster?.teamName ?? espnTeamName ?? 'your fantasy team'}`
                  : espnConnected
                    ? 'Fantasy league'
                    : 'Connect an ESPN fantasy league'
              }
              onClick={() => {
                setSettingsOpen(false);
                if (espnConnected) setFantasyOpen((v) => !v);
                else openEspnSettings();
              }}
            >
              {/* The same mark the league page and the old menu entry carry, so
                  one concept keeps one glyph across the app. */}
              <BaseballMark size={17} width={2} />
            </button>
            {espnConnected && fantasyOpen && (
              <div className="settings-popover fantasy-popover" role="menu">
                <span className="settings-popover-label">Fantasy</span>
                {/* What the chip in the view bar used to say, kept because the
                    button can only report *that* the roster is fantasy, not
                    whose. A line of text, not a menu item — nothing happens if
                    you press it. */}
                <span className="fantasy-popover-team">
                  {fantasyRoster?.teamName ?? espnTeamName ?? espnLeagueName ?? 'Connected'}
                </span>
                {/* Only offered once a team is known — without one there is no
                    roster to switch to, and a toggle that can only fail is
                    worse than no toggle. */}
                {espnTeamId !== null && (
                  <button
                    type="button"
                    className={`settings-toggle${usingFantasy ? ' active' : ''}`}
                    role="menuitemcheckbox"
                    aria-checked={usingFantasy}
                    onClick={() =>
                      setRosterSource(rosterSource === 'fantasy' ? 'watchlist' : 'fantasy')
                    }
                    title={
                      espnTeamName
                        ? `Read the Summary, Games and Feed views off ${espnTeamName} instead of your watchlist`
                        : 'Read the watchlist views off your fantasy roster'
                    }
                  >
                    <span className="settings-dot" aria-hidden="true" />
                    Use my fantasy team
                  </button>
                )}
                {/* Below the toggle, as the how-to button sits below the gear's:
                    it opens a page rather than flipping a setting, so it reads
                    as the menu's way *out* of it. */}
                <button
                  type="button"
                  className="help-btn"
                  role="menuitem"
                  onClick={() => {
                    setFantasyOpen(false);
                    openEspnSettings();
                  }}
                  title="Your league, your team, and the connection itself"
                >
                  <BaseballMark size={15} width={2} />
                  League settings
                </button>
              </div>
            )}
          </div>
        </div>
        {/* The icon cluster, in the header rather than over the list: these
            belong to the watchlist itself, not to whichever view is reading it,
            and moving them here stopped the whole control row appearing and
            disappearing as you switched tabs.

            `margin-left: auto` pushes the cluster to the right edge, leaving
            the brand alone on the left — the header reads brand … search ·
            edit, the dates having moved down to the roster row where the views
            they qualify are.

            They show on every view, the research board included. The reason the
            search used to be hidden there was that a second search box directly
            above the board's own would be "a question about which one you're
            in" — a tier up in the header, past the view tabs and the board's
            own bar, that ambiguity is gone. The two do different jobs anyway:
            this one adds a player to your watchlist, the board's filters the
            table. */}
        {headerTools}
      </header>

      {/* Across the top, under the header — see `searchBar`. */}
      {searchBar}

      {/* Three tiers of tabs, in the order the choices actually nest.
          Top: **Roster or Research** — the real division, one being a read on
          the watchlist over the date range and the other the whole league over
          the season. Beside it, Batters / Pitchers, which applies to both.
          Below both: Roster's own Summary / Games / Feed, three ways of
          reading the same players over the same days, so they belong under
          that choice rather than beside it.

          The search no longer appears here in any case — it is in the header
          now, which is also what lets the tabs stay hidden until something is
          watched without stranding a new user: the only way to add a first
          player is app chrome, not a bar that comes and goes with the view. */}
      {showViewToggle && (
        <div className="view-bar">
          <div className="view-bar-tabs">
            <div className="view-switch" role="tablist" aria-label="Section">
              {/* Nothing watched, nothing to put on a roster page — so this
                  pill only appears once there is something to read. */}
              {showWatchlistViews && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={section === 'roster'}
                  className={`view-tab${section === 'roster' ? ' active' : ''}`}
                  onClick={() => {
                    setBackView(null);
                    // Coming back to Roster lands on the tab you left it on;
                    // the reorder screen only lives on Games, so returning to
                    // either of the other two closes it rather than leaving
                    // the app in a mode with nothing on screen to show for it.
                    if (rosterTab !== 'games') setEditMode(false);
                    setSection('roster');
                  }}
                >
                  Roster
                </button>
              )}
              {/* Always present, watchlist or not — the league board is the
                  one page that doesn't depend on what you're tracking. */}
              <button
                type="button"
                role="tab"
                aria-selected={section === 'research'}
                className={`view-tab${section === 'research' ? ' active' : ''}`}
                onClick={() => {
                  setBackView(null);
                  setEditMode(false);
                  setSection('research');
                }}
              >
                Research
              </button>
            </div>
            {/* Batters / Pitchers. */}
            {view !== 'research' && kindTabs}
            {/* Roster's own three, then the calendar that says which days they
                cover and the chip saying whose list it is. All of it in the one
                wrapping row: each group is `flex: none`, so the row fits as
                many whole groups per line as the width allows and breaks
                between them rather than inside one — the order is the order the
                questions come in (which page, which kind, which reading, which
                days, whose list), and where the line falls is the window's
                business rather than something fixed in the markup. */}
            {section === 'roster' && showWatchlistViews && (
              <>
              <div className="roster-switch" role="tablist" aria-label="Roster view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={rosterTab === 'summary'}
                  className={`roster-tab${rosterTab === 'summary' ? ' active' : ''}`}
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
                  aria-selected={rosterTab === 'games'}
                  className={`roster-tab${rosterTab === 'games' ? ' active' : ''}`}
                  onClick={() => {
                    setBackView(null);
                    setView('games');
                  }}
                >
                  Games
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={rosterTab === 'feed'}
                  className={`roster-tab${rosterTab === 'feed' ? ' active' : ''}`}
                  onClick={() => {
                    setBackView(null);
                    setEditMode(false);
                    setView('feed');
                  }}
                >
                  Feed
                </button>
              </div>
              {dateToggle}
              </>
            )}
          </div>
          {/* The disclosure's own row, under the tabs — see `dateControl`. */}
          {view !== 'research' && dateControl}
        </div>
      )}
      </div>

      {/* Outside the pinned box on purpose: a failed report is news about the
          page rather than a control over it, and it would otherwise hold a
          permanent row against the top of the window — and be folded away by a
          menu button that has nothing to do with it. */}
      {error && <div className="error-banner">⚠ {error}</div>}

      {watchlistLoaded && watchlist.length === 0 && !error && view !== 'research' && (
        <div className="empty-state">
          <p className="empty-title">Your watchlist is empty</p>
          <p>
            Search for a player to start tracking their plate appearances, pitch
            sequences, and Statcast contact quality.
          </p>
          <div className="empty-actions">
            {/* The search is an icon in the header now, which is a small target
                to hand someone with nothing on screen — so the one page a new
                user is guaranteed to land on opens it for them. */}
            <button
              type="button"
              className="empty-search"
              onClick={openSearch}
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m15.4 15.4 4.1 4.1" />
              </svg>
              Search for a player
            </button>
            {/* The one place a first-time user is guaranteed to land, so the
                guide is offered here rather than only from the settings menu. */}
            <button type="button" className="empty-help" onClick={() => setHelpOpen(true)}>
              How does this work?
            </button>
          </div>
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

      {/* Everyone the active view would show is on the IL and the toggle is
          hiding them. Without this the summary is a header over a Total row of
          zeros, and the players view an expanse of nothing, with no hint on
          either that a setting is doing it. One message for every view now: the
          toggle is the only thing that can empty a view this way, where the
          summary table used to drop them whatever it said. */}
      {view !== 'research' && displayReports.length > 0 && kindCards.length === 0 && !editMode && (
        <div className="empty-state">
          <p className="empty-title">Nothing to show — everyone here is on the IL</p>
          <p>Turn off “Hide injured players” in settings (the gear by the title) to see them.</p>
        </div>
      )}

      {view === 'research' ? (
        <ResearchTable
          /* Deliberately **not** keyed on the board. It was, so that crossing
             from OF to SP remounted the table rather than carrying a batter's
             column vocabulary onto a pitcher's — but a remount is a blunt way
             to say "these are two boards", and it threw away the filters you
             had built as the price of a look at the other one. The component
             keeps a slot per kind instead (`BoardState`), so each board has its
             own search, sort and filters *and* still has them when you come
             back. */
          rows={researchRows}
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
          scope={researchScope}
          onScopeChange={setResearchScope}
          hasRosterPct={rosterPct !== null}
          trendDays={rosterTrend?.days ?? null}
          ownedIds={ownedIds}
          espnConnected={espnConnected}
          espnLoading={espnLoading}
          espnError={espnError}
          onConnectEspn={openEspnSettings}
          watchedKeys={watchedKeys}
          onOpenDetails={setDetailsKey}
        />
      ) : view === 'summary' ? (
        kindCards.length > 0 && (
          <SummaryTable
            reports={kindCards}
            onOpenDetails={setDetailsKey}
            onOpenPlayerDay={openPlayerDay}
            /* Kept when the table takes the page. The same nodes render in the
               view bar as well, which is behind the expanded box and so never
               on screen at the same time — the alternative is lifting the
               expanded flag out of the table that owns it so App can decide
               where to put them, which is a lot of wiring to avoid two
               invisible elements. */
            chrome={
              <>
                {kindTabs}
                {dateToggle}
                {dateControl}
              </>
            }
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
          /* The edit screen takes the page: the header keeps the title and the
             Done button and nothing else, so this is the whole of what's on
             screen and it carries its own heading rather than relying on the
             chrome above to say where you are.

             The kind switch comes with it. It is the header's own `kindTabs`,
             rendered here because the view bar is hidden in this mode and it is
             the only way to reach the other kind's order — hiding the chrome
             shouldn't mean a watchlist whose pitchers can no longer be
             reordered. It renders only when both kinds are watched, as ever. */
          <div className="edit-page">
            <div className="edit-page-head">
              <h2 className="edit-page-title">Edit players</h2>
              {kindTabs}
            </div>
            <PlayerOrderEditor
              players={editPlayers}
              onMove={movePlayer}
              onCommit={commitOrder}
              onRemove={removeFromEditor}
            />
          </div>
        ) : (
        <main className="player-list">
          {kindCards.map(renderCard)}
        </main>
        )}
      </div>
      )}

      {/* Bottom-left back button, shown only after a summary/feed link jumped to
          the players page — returns to whichever view it came from. */}
      <button
        type="button"
        className={`float-btn back-nav${
          view === 'games' && backView && !editMode ? ' visible' : ''
        }`}
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
          rosterPct={rosterPct ? rosterPct.get(detailsPlayer.id) ?? null : undefined}
          rosterTrend={
            rosterTrend && rosterPct?.has(detailsPlayer.id)
              ? { change: rosterTrend.delta.get(detailsPlayer.id) ?? 0, days: rosterTrend.days }
              : undefined
          }
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

      {espnOpen && (
        <EspnSettings
          status={espnStatus}
          joinError={espnJoinError}
          onStatusChange={onEspnStatusChange}
          onRefresh={refreshFantasy}
          onClose={() => setEspnOpen(false)}
        />
      )}
    </div>
    </PlayerStatusContext.Provider>
    </FantasyRosterContext.Provider>
    </MutedContext.Provider>
  );
}
