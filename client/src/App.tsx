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
  TrendWindow,
  WatchPlayer,
} from './types';
import { eligibleForKind, isInjured, isStartingOn, positionCodes } from './lib';
import { BaseballMark } from './components/BaseballMark';
import { PlayerAdder } from './components/PlayerAdder';
import { PlayerOrderEditor } from './components/PlayerOrderEditor';
import { LiveFeed } from './components/LiveFeed';
import { SummaryTable } from './components/SummaryTable';
import {
  ResearchTable,
  freshResearchUi,
  includeParam,
  isDefaultColumns,
  isDefaultInclude,
  fromIncludeKeys,
  researchKindFor,
  toColumnKeys,
  toResearchInclude,
  toResearchPos,
  toResearchWindow,
} from './components/ResearchTable';
import type { ResearchInclude, ResearchPos, ResearchUi } from './components/ResearchTable';
import { simulateLiveDay } from './simulate';
import { PlayerDetails } from './components/PlayerDetails';
import { DateRangePicker, numericRange, tightRange } from './components/DateRangePicker';
import {
  FantasyRosterContext,
  MutedContext,
  PlayerStatusContext,
  useDelayedFlag,
  useDismissable,
  useStickyChromeOffset,
} from './hooks';
import type { FantasySlot } from './hooks';
import { LoadingBlock, LoadingLine, SpinningBaseball } from './components/Loading';
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

// How long the header's refresh keeps spinning at a minimum — see `refreshAll`.
// A warm `/api/report` comes back in about 16ms, which is a baseball nobody
// sees turn, and a button that answers a press with nothing at all reads as
// broken. Every press-triggered mark in the app takes this floor; the waits
// nobody pressed take `WAIT_DELAY` at the other end of the same argument
// (`hooks.ts`), which is a delay before a mark goes up rather than a floor on
// how long it stays.
const MIN_SPIN = 450;

/**
 * The app's three pages. **Roster** is the summary table over the date range,
 * **Feed** the same players and days read as a stream — by clock, or grouped
 * one card per player — and **Research** the whole league over the season.
 *
 * It was two tiers until now: Roster · Research on top, and Roster's own
 * Summary / Games / Feed below. What collapsed it was noticing that Games and
 * Feed were not two readings but one: a card per player over the range, and a
 * stream over the same range, differing in *sort order*. Sorting is not a page.
 * So Games folded into the feed as `groupByPlayer`, which left Roster with a
 * single reading — the summary table — and the sub-row with one live tab in it.
 * Three pages, one row.
 *
 * `summary` rather than `roster` because that is the name `view=` has always
 * used for it, and it is the default every link in the wild omits.
 */
type View = 'summary' | 'feed' | 'research';

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
  /** The user's **roster** — the saved list the Summary, Games and Feed views
   *  report on. Called `watchlist` until the two lists were told apart; the
   *  watchlist proper is `watchlistKeys` below, and is the research board's. */
  const [roster, setRoster] = useState<WatchPlayer[]>([]);
  const [reports, setReports] = useState<PlayerReport[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  /* The report's read, held back by `WAIT_DELAY` — nobody pressed anything to
     start this one, so it owes the reader nothing until it is slow enough to
     be worth saying. The same hook now guards every block wait in the app. */
  const showLoading = useDelayedFlag(reportLoading);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  /**
   * The **watchlist** — `${kind}-${id}` keys the user is following on the
   * research board, independent of whether they are on his roster. A free agent
   * he is thinking about picking up belongs here and not there, which is the
   * whole reason the two lists exist separately.
   *
   * Keys rather than entries, matching what the server stores: the board holds
   * every row it could mark, so a name saved beside the key would only be a
   * second and staler copy of one the leaderboard already carries.
   */
  const [watchlistKeys, setWatchlistKeys] = useState<Set<string>>(() => new Set());
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
  const [view, setView] = useState<View>(() => {
    const v = initialParams.get('view');
    if (v === 'research') return 'research';
    // `games` was the card-per-player page and `players` its own older name.
    // Both are the feed grouped by player now — that page *was* the grouping —
    // so an old link opens the thing it asked for rather than 404ing into the
    // default, the same courtesy `readKeys` extends to pre-two-way player ids.
    if (v === 'feed' || v === 'games' || v === 'players') return 'feed';
    // Summary is the default; the rest are opted into explicitly.
    return 'summary';
  });
  /**
   * Read the feed one card per player instead of newest-first. In the URL
   * because it changes how a shared link reads, and seeded on for a legacy
   * `view=games` link, that page having been exactly this.
   */
  const [groupByPlayer, setGroupByPlayer] = useState<boolean>(() => {
    const v = initialParams.get('view');
    if (v === 'games' || v === 'players') return true;
    return initialParams.get('group') === 'player';
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
  /**
   * Narrow the summary table to the players who are actually starting today —
   * a hitter in the posted lineup, a pitcher named as today's starter.
   *
   * **In the URL** (`starters=1`), by the same rule `hideil=1` follows: it
   * changes *which players a view is reporting on*, so a link that carries it
   * is saying something about the data rather than about how it is drawn.
   *
   * **Not saved as a preference**, which is where it parts from hide-injured.
   * An IL stint is a standing fact about a player and is as true next Tuesday
   * as it is today, so a saved "hide them" is a setting. Who is starting is
   * true for an afternoon and false by the next morning, and a saved copy would
   * mean a filter switched on for one night's lineups silently narrowing a
   * table read a week later — a stored answer to a question that has since
   * changed. So there is no `UserPrefs` key, no route, and none of the
   * already-touched dance the other two need.
   */
  const [startersOnly, setStartersOnly] = useState<boolean>(
    () => initialParams.get('starters') === '1',
  );
  // The filter is about *today*, so it can only act on a range that contains
  // today. Over "Yesterday" or a custom week in July there is nobody it could
  // keep, and a control that empties a table with no way to read why is a trap
  // — the same reasoning that hides the date row on the research board, which
  // has nothing dated to act on. The state survives the excursion (going back
  // to Today finds the toggle as it was left) and only its *effect* is gated,
  // which is also what keeps `starters=1` out of a URL where it does nothing.
  const rangeHasToday = useMemo(() => {
    const today = baseballToday();
    return start <= today && today <= end;
  }, [start, end]);
  const startersActive = startersOnly && rangeHasToday;
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
   * Which set of players the three roster views describe: the list built here,
   * or the user's ESPN fantasy team.
   *
   * In the URL like `hideil=1`, and for the same reason — it changes *which
   * players a view is reporting on*, so a shared link that says so is saying
   * something about the data. Saved per user too, with the same
   * already-touched guard, so a preference landing a moment after boot can't
   * undo a switch just made.
   */
  const [rosterSource, setRosterSourceState] = useState<RosterSource>(() =>
    initialParams.get('roster') === 'fantasy' ? 'fantasy' : 'saved',
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
  // buy nothing but a wait.
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

  /**
   * Which sets of players the board includes, and whether the watchlist is on
   * the board as well. Shared across both boards and both windows like the
   * window above — they are statements about *you* rather than about a board —
   * and in the URL for the same reason it is: each decides which players the
   * table is about, which is what a link has to carry.
   *
   * Both are **saved per user** as well (`researchInclude` /
   * `researchWatchlist`), which is what "it keeps what I set it to" means for a
   * control someone sets once and then reads for a season. The URL wins where
   * it speaks, exactly as `cols=` does: a link someone was handed should show
   * what it says, and it doesn't overwrite what they had saved.
   *
   * **`watch=1` keeps its spelling although its meaning has widened** — it once
   * narrowed the board to the watchlist and now unions it in. Renaming the
   * param would have cost every open tab and every link already shared, and it
   * buys nothing: the word never said "only", and the widening is the safe
   * direction for an old link to be read in. A `watch=1` link shows the
   * watchlisted players it promised, plus whatever its `inc=` asked for, rather
   * than fewer than either.
   */
  const includeFromUrl =
    initialParams.get('inc') !== null || initialParams.get('scope') !== null;
  const [researchInclude, setResearchIncludeState] = useState<ResearchInclude>(() =>
    toResearchInclude(initialParams.get('inc'), initialParams.get('scope')),
  );
  const watchlistFromUrl = initialParams.get('watch') === '1';
  const [researchWatchlist, setResearchWatchlistState] = useState(watchlistFromUrl);
  const researchIncludeTouched = useRef(false);
  // One PUT for the pair, because the server holds them as one control set —
  // and because either of them changing means re-reading who is on the board,
  // so the client has both to hand whenever one moves.
  const saveInclude = useCallback((inc: ResearchInclude, watch: boolean) => {
    researchIncludeTouched.current = true;
    api
      .saveResearchInclude(
        isDefaultInclude(inc)
          ? null
          : (['mine', 'others', 'fa'] as const).filter((k) => inc[k]),
        watch,
      )
      .catch((e: Error) => console.error('saving board players failed:', e.message));
  }, []);
  const setResearchInclude = useCallback(
    (next: ResearchInclude) => {
      setResearchIncludeState(next);
      saveInclude(next, researchWatchlist);
    },
    [saveInclude, researchWatchlist],
  );
  const setResearchWatchlist = useCallback(
    (next: boolean) => {
      setResearchWatchlistState(next);
      saveInclude(researchInclude, next);
    },
    [saveInclude, researchInclude],
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
        // The board's population settings, on the same rule: the URL wins
        // where it spoke, and a user who has already worked the buttons in the
        // second before this landed keeps what they pressed.
        if (!researchIncludeTouched.current && !includeFromUrl && prefs.researchInclude) {
          setResearchIncludeState(fromIncludeKeys(prefs.researchInclude));
        }
        // The stored key was renamed when the control stopped meaning "only"
        // (`researchWatchlistOnly` → `researchWatchlist`), so the **old one is
        // still read** — a record only migrates on the next write, so a user
        // who set this a month ago and hasn't touched it since has nothing but
        // the old key, and dropping it would silently reset a saved preference
        // on deploy. The same courtesy `fileLoad` extends to every older shape
        // of the stored item.
        if (
          !researchIncludeTouched.current &&
          !watchlistFromUrl &&
          (prefs.researchWatchlist ?? prefs.researchWatchlistOnly)
        ) {
          setResearchWatchlistState(true);
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
  }, [urlColumns, hideInjuredFromUrl, rosterSourceFromUrl, includeFromUrl, watchlistFromUrl]);

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
  // like the position and the include set, and for the same reason: "the last
  // 30 days" means the same thing on either, so a tab switch dropping it would
  // silently change the population. In the URL, unlike the page's transient
  // filters — it changes
  // *which* season a shared link is about, which is the kind of thing a link
  // has to carry.
  const [researchWindow, setResearchWindow] = useState<ResearchWindow>(() =>
    toResearchWindow(initialParams.get('win')),
  );
  // Keyed by board **and** window: each is its own fetch and its own megabyte,
  // and both are kept, so flipping back to a window already read is instant.
  const [research, setResearch] = useState<Record<string, ResearchRow[]>>({});
  const researchCacheKey = `${researchKind}:${researchWindow}`;
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  /**
   * The rest of what the board is set to — each board's search, sort and stat
   * filters, which of the three disclosures are open, and the condition being
   * typed into the filter builder (`ResearchUi`, defined beside the rules that
   * govern it).
   *
   * It is here for the reason the ones above it are: `ResearchTable` is
   * unmounted the moment the view changes, so anything it holds is thrown away
   * by a glance at the Roster tab. Half the board's settings lived up here and
   * half in the component, and coming back landed you on a board that had kept
   * its position, window and columns and lost its filters and its sort — which
   * read as a bug rather than as a rule. All of it survives now, and the board
   * comes back exactly as it was left.
   */
  const [researchUi, setResearchUi] = useState<ResearchUi>(freshResearchUi);
  /**
   * Where the board's control set renders: a box inside the pinned chrome, so
   * the research page has **one** top section instead of the app's chrome with
   * a second band of controls stacked under it.
   *
   * State rather than a ref because a portal needs the element itself, and a
   * ref's value is not a render's to read. The callback runs in the commit
   * phase, so the re-render it triggers lands before the browser paints and the
   * bar is never visibly absent.
   */
  const [researchChrome, setResearchChrome] = useState<HTMLDivElement | null>(null);

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
    if (view !== 'research' || !espnConnected) return;
    // Two of the three include buttons are *defined* by who owns whom, so
    // either of them being on is what makes the read worth doing.
    if (!researchInclude.fa && !researchInclude.others) return;
    loadOwnership();
  }, [
    view,
    researchInclude.fa,
    researchInclude.others,
    espnConnected,
    espnLeagueId,
    loadOwnership,
  ]);

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
   *
   * **The range's end decides which day's lineup comes back.** A lineup is a
   * fact about a day and ESPN answers for one day at a time, so the `Tomorrow`
   * preset — which exists to show a watched player's scheduled games before
   * they are played — has to ask for tomorrow, or its chips describe the lineup
   * being played out today while the games beside them are tomorrow's. The
   * server reads anything at or before today as today, so the other four
   * presets are unaffected; see `espn.ts`'s **Which day's lineup**. It is the
   * same date `/api/report` derives from its own range, which is what keeps the
   * chips and the rows the report orders one roster rather than two.
   */
  const rosterRead = useRef(0);
  const loadFantasyRoster = useCallback((refresh = false) => {
    const seq = ++rosterRead.current;
    return api
      .espnRoster(refresh, end)
      .then((r) => {
        if (seq === rosterRead.current) setFantasyRoster(r);
      })
      // The report request carries the same failure and banners it; a second
      // copy of the same message would only say it twice.
      .catch((e: Error) => console.error('fantasy roster unavailable:', e.message));
    // `end` rather than nothing: it decides which day's lineup is asked for, so
    // a stale closure would hold the chips on the day the range was last
    // changed *from*. It re-identifies this callback on a date change, which
    // the effect below wanted anyway — it already lists `end` — so the two move
    // together and it still fires once.
  }, [end]);

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
   * The keys "your roster" means on screen — the saved list, or the fantasy
   * team when that is what the views are reading. This is what the research
   * board's `My Roster` button selects on and what its baseball marks, so both
   * follow whichever list is actually being shown.
   *
   * Deliberately *not* what `PlayerAdder` dedupes against, which stays the
   * saved list: that control's button adds to the saved list whatever mode the
   * app is in, and it should show the state of the thing it changes. And
   * deliberately nothing to do with `watchlistKeys`, which is the other list
   * entirely.
   */
  const rosterKeys = useMemo(() => {
    if (fantasySlots) return new Set(fantasySlots.keys());
    return new Set(roster.map(playerKey));
  }, [roster, fantasySlots]);

  /** ESPN's global rostered percentage by MLB id, or null with no league —
   *  which is also what turns the board's `Ros%` column on and off. */
  const rosterPct = useMemo(() => {
    if (!espnConnected || !ownership) return null;
    const map = new Map<number, number>();
    for (const [id, pct] of Object.entries(ownership.rosterPct)) map.set(Number(id), pct);
    return map;
  }, [espnConnected, ownership]);

  /**
   * The positions ESPN has each player eligible at, or null with no league —
   * which is also what makes the board's position pills mean ESPN eligibility
   * rather than MLB's single listed position.
   */
  const eligibility = useMemo(() => {
    if (!espnConnected || !ownership) return null;
    const map = new Map<number, string[]>();
    for (const [id, list] of Object.entries(ownership.eligibility ?? {})) {
      map.set(Number(id), list);
    }
    return map;
  }, [espnConnected, ownership]);

  /**
   * Read the ownership map, which by now four surfaces want: the research
   * board's roster %, trend and position pills, the player page's copy of the
   * first two, the free-agent include buttons that asked for it first — and the
   * **position chip on every card**, which is what took the last of the laziness
   * out of this effect. It used to wait until the board was open or a player
   * page was up; a chip on the games view is neither, and a card that showed
   * MLB's position for a second and then swapped would be worse than one that
   * simply took a moment to be right. So the only gate left is a connected
   * league, which is what says the answer exists at all.
   *
   * It is cheap enough to want on load: **27KB gzipped**, and the server holds
   * the league it is built from for ten minutes, so this is one request per
   * session against a page that is going to ask for it as soon as anyone opens
   * a player.
   *
   * It fires **once**, unlike the statuses read below: roster % is ESPN's
   * season-wide figure and moves by a fraction of a point a day, where lineups
   * post by the hour. Every guard is a terminal state (loaded, failed, or in
   * flight), so the effect cannot re-trigger on its own result.
   */
  useEffect(() => {
    if (!espnConnected || ownership || espnLoading || espnError) return;
    loadOwnership();
  }, [espnConnected, ownership, espnLoading, espnError, loadOwnership]);

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
    // Returns a promise so the header's refresh can wait on it — an in-flight
    // read resolves immediately rather than sending a second copy of itself.
    if (statusesInFlight.current) return Promise.resolve();
    statusesInFlight.current = true;
    return api
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

  /** How each roster % has moved, one entry per span the server found a
   *  baseline for. Null without a league, and also when it has no history at
   *  all yet — see `getRosterTrend`, where a window with no baseline is left
   *  out rather than sent empty.
   *
   *  Each delta becomes a `Map` here because the merge below asks after every
   *  row on the board in every window — up to five lookups a row across some
   *  1,500 of them — and a numeric key into a plain object goes through a
   *  string conversion each time. */
  const rosterTrend = useMemo(() => {
    if (!espnConnected || !ownership?.trend) return null;
    return ownership.trend.map((w) => ({
      window: w.window,
      days: w.days,
      delta: new Map<number, number>(
        Object.entries(w.delta).map(([id, d]) => [Number(id), d]),
      ),
    }));
  }, [espnConnected, ownership]);

  /**
   * The board's rows with roster % merged in. Client-side because the research
   * board is cached per kind and window and served to every user alike, while
   * this number is only shown to someone with a league connected — folding it
   * into that blob would make a shared cache carry a per-user concern.
   */
  const researchRows = useMemo(() => {
    const rows = research[researchCacheKey] ?? [];
    if (!rosterPct && !eligibility) return rows;
    return rows.map((r) => {
      // Absent from a delta map means "hasn't moved", not "unknown": the server
      // drops zeroes to keep the blob small, so a player with a roster % and no
      // entry really is flat. A player with no roster % at all gets a null,
      // which the column dashes. Built key by key rather than with
      // `Object.fromEntries` so the window keys stay typed as windows.
      const rosterTrends: Partial<Record<TrendWindow, number | null>> = {};
      for (const w of rosterTrend ?? []) {
        rosterTrends[w.window] = rosterPct?.has(r.id) ? w.delta.get(r.id) ?? 0 : null;
      }
      return {
        ...r,
        rosterPct: rosterPct?.get(r.id) ?? null,
        rosterTrends: rosterTrend ? rosterTrends : undefined,
        // Absent here means the opposite of absent above: ESPN doesn't know him,
        // so the board falls back to MLB's listed position for him.
        eligible: eligibility?.get(r.id) ?? null,
      };
    });
  }, [research, researchCacheKey, rosterPct, rosterTrend, eligibility]);

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
    /* Only meaningful on the feed, and off is the default — so a link can only
       ever turn the grouping on, and `view=games` is what an old one says. */
    if (view === 'feed' && groupByPlayer) p.set('group', 'player');
    if (playerKind !== 'batter') p.set('kind', playerKind);
    // Only meaningful on the research view, and 'batters' is its default.
    if (view === 'research' && researchPos !== 'batters') p.set('pos', researchPos);
    // Likewise, with the whole season as the default. A window is the one page
    // filter that goes in the URL: it decides which games the numbers are drawn
    // from, so a link without it would open on a different table.
    if (view === 'research' && researchWindow !== 'season') {
      p.set('win', String(researchWindow));
    }
    // The three include buttons as one param, and only when they differ from
    // the default — free agents alone. A bare research link therefore opens on
    // *the recipient's* sets rather than the sender's, which is the right way
    // round: `mine` names a set of players, and on their screen it is theirs.
    // `inc=none` is spelled out because turning everything off is a real state
    // and an empty value reads as an absent one.
    const inc = view === 'research' ? includeParam(researchInclude) : null;
    if (inc) p.set('inc', inc);
    // In the URL for the reason `hideil=1` is: it changes which players the
    // view reports on. Off is the absence of the param, so a link can only ever
    // turn it on and a saved preference has something to fill in.
    if (view === 'research' && researchWatchlist) p.set('watch', '1');
    // The column set of the board on screen, and only once it differs from that
    // board's defaults — otherwise every link would carry twenty stat keys to
    // say "the usual". `pos=` is what tells a reader which board they describe.
    const cols = researchCols[researchKind];
    if (view === 'research' && cols && !isDefaultColumns(researchKind, cols)) {
      p.set('cols', cols.join(','));
    }
    if (simulate) p.set('sim', '1');
    if (hideInjured) p.set('hideil', '1');
    // Only while it is actually narrowing something — see `startersActive`.
    if (startersActive) p.set('starters', '1');
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
    groupByPlayer,
    playerKind,
    researchPos,
    researchWindow,
    researchInclude,
    researchWatchlist,
    researchCols,
    researchKind,
    simulate,
    hideInjured,
    startersActive,
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

  // Load the roster once. A failure here used to be swallowed, which rendered
  // the "your roster is empty" state — actively misleading now that the list
  // lives server-side per user, where a failure means "we couldn't read it".
  useEffect(() => {
    api
      .roster()
      .then(setRoster)
      .catch((e: Error) => setError(e.message))
      .finally(() => setRosterLoaded(true));
  }, []);


  /**
   * The watchlist, read once on boot beside the roster — it decides whether a
   * board row's star is filled, and a first render that got that wrong would
   * then correct itself under the reader's eye.
   *
   * A failure is logged rather than bannered, the rule the preferences follow:
   * the board opens with nobody starred, which is exactly what a user who has
   * never watchlisted anyone sees.
   */
  useEffect(() => {
    let cancelled = false;
    api
      .watchlist()
      .then((keys) => {
        if (!cancelled) setWatchlistKeys(new Set(keys));
      })
      .catch((e: Error) => console.error('watchlist unavailable:', e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Star a player, or unstar him. Applied **optimistically** and reconciled
   * with the server's answer: this is a mark on a row in a table of six hundred
   * of them, and a press that waits a round trip to fill in reads as a press
   * that missed. A failure puts it back and says so in the console — nothing
   * here is worth a banner over the board it sits on.
   */
  const toggleWatchlisted = useCallback((key: string, on: boolean) => {
    setWatchlistKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
    api
      .setWatchlisted(key, on)
      .then((keys) => setWatchlistKeys(new Set(keys)))
      .catch((e: Error) => {
        console.error('saving watchlist failed:', e.message);
        setWatchlistKeys((prev) => {
          const back = new Set(prev);
          if (on) back.delete(key);
          else back.add(key);
          return back;
        });
      });
  }, []);

  // `quiet` refreshes in the background (live polling) without flashing the
  // loading UI; the foreground load on date/roster change is not quiet.
  const loadReport = useCallback(
    (quiet = false, refresh = false) => {
      if (!quiet) setReportLoading(true);
      return api
        .report(start, end, usingFantasy ? 'fantasy' : 'saved', refresh)
        .then((r) => setReports(r.players))
        .catch((e: Error) => setError(e.message))
        .finally(() => {
          if (!quiet) setReportLoading(false);
        });
    },
    [start, end, usingFantasy],
  );

  // Refresh report when the date range, the roster, or which list is being
  // read changes. `roster` is still a dependency in fantasy mode — it costs
  // one refetch on a change that can't happen while the editor is hidden, and
  // dropping it would mean a switch back showing the pre-edit list.
  useEffect(() => {
    // A session that opens on `roster=fantasy` waits for the connection status
    // first. Firing now would read the saved watchlist, render it, and replace
    // it a moment later — a flash of the wrong list of players, which is worse
    // than a slightly longer wait.
    if (rosterSource === 'fantasy' && !espnStatusSettled) return;
    loadReport();
    // `fantasyTeamId` because the report is *about* that team's players: pick a
    // different one on the Fantasy league page and this is what re-reads it.
  }, [loadReport, roster, rosterSource, espnStatusSettled, fantasyTeamId]);

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

  /**
   * The same read, from the fantasy popover — one press from any view.
   *
   * It was only on the Fantasy league page, which put two navigations between
   * "I just moved somebody on ESPN" and the app agreeing: open the popover,
   * open the page, press. That is the wrong distance for the one thing this app
   * cannot see for itself, and the popover is already where every other fantasy
   * control ended up for exactly that reason.
   *
   * **It stays on the league page too**, and the two are not quite the same
   * control. That one re-reads the **team picker** after the league (see
   * `EspnSettings`'s `refresh`), which is the page's own business and nothing
   * the popover has any use for; the page also carries the paragraph explaining
   * the ten-minute cache, and a note naming a button that isn't there is worse
   * than a second doorway. They are never on screen together — opening the page
   * closes the popover — so this is one action reached from two places rather
   * than the duplicated affordance the search bar's own close button was.
   *
   * `refreshFantasy` is called unchanged, sequencing and all: the flag rides on
   * the ownership read alone and the roster and report follow through the cache
   * it just filled.
   */
  const [fantasyRefreshing, setFantasyRefreshing] = useState(false);
  const [fantasyRefreshed, setFantasyRefreshed] = useState(false);
  const refreshFantasyFromMenu = useCallback(() => {
    setFantasyRefreshing(true);
    setFantasyRefreshed(false);
    // The same `MIN_SPIN` floor the header's refresh takes, for the same
    // measured reason: a warm league answers in milliseconds, and a menu row
    // that flickers and settles reads as a press that did nothing.
    Promise.all([
      Promise.resolve(refreshFantasy()),
      new Promise((r) => setTimeout(r, MIN_SPIN)),
    ])
      .then(() => setFantasyRefreshed(true))
      // Silent here on purpose: the report's own request carries the same
      // failure and banners it across the page, where this row could only
      // repeat it inside a popover that is about to be dismissed.
      .catch((e: Error) => console.error('fantasy refresh failed:', e.message))
      .finally(() => setFantasyRefreshing(false));
  }, [refreshFantasy]);

  // "Up to date ✓" is about the press, not a standing state, so it is dropped
  // the moment the menu is reopened — otherwise a tick from an hour ago greets
  // someone who has come back precisely because they suspect it isn't.
  useEffect(() => {
    if (fantasyOpen) setFantasyRefreshed(false);
  }, [fantasyOpen]);

  /**
   * Re-read the board on screen, past the copy this session is holding. The
   * research blob is fetched once per kind and window and then kept for the
   * life of the tab — which is the right default for a megabyte of league-wide
   * season stats behind a six-hour server cache, and the one thing about it
   * that goes stale on a tab left open all day.
   *
   * The rows already on screen are left standing until the new ones land:
   * `research` is only written on success, and the table's `loading` prop is
   * gated on the cache being *empty*, so nothing blanks while this is in
   * flight.
   */
  const reloadResearch = useCallback(() => {
    return api
      .research(researchKind, researchWindow)
      .then((r) => {
        setResearchError(null);
        setResearch((prev) => ({ ...prev, [`${r.kind}:${r.window}`]: r.rows }));
      })
      .catch((e: Error) => setResearchError(e.message));
  }, [researchKind, researchWindow]);

  /**
   * The header's refresh: **re-read every source the page in front of you is
   * drawn from**, and nothing else. That rule is what decides each of the four
   * reads below — a button that re-fetched the whole app would spend a 2MB
   * league read and a megabyte of leaderboard to update a summary table.
   *
   * - **ESPN first**, and only when a league is connected *and* something on
   *   screen is drawn from it (the ownership map has been read, or the views
   *   are reading the fantasy roster). It is the same sequential dance
   *   `refreshFantasy` does and for the same reason: `?refresh=1` on the
   *   ownership call is the only true cache bypass in the app, it bypasses the
   *   server's in-flight guard as well, and the roster and the report read the
   *   same league payload — so firing them together would send three copies of
   *   one upstream read instead of one and two lookups.
   * - **The report always.** It is what the three roster views are, and in
   *   fantasy mode it is *about* the roster the call above just re-read.
   * - **The statuses map** on the two views that draw it (the research board
   *   and the details view) — lineups post and IL moves land through the day.
   * - **The research blob** on the research view alone.
   *
   * Every one of those keeps what is on screen until its replacement arrives:
   * the report goes through `loadReport`'s quiet path, so the page's own
   * "Updating…" badge stays away and the button is the only thing that says a
   * read is happening.
   */
  const [refreshing, setRefreshing] = useState(false);
  const refreshAll = useCallback(() => {
    setRefreshing(true);
    const espnFirst =
      espnConnected && (ownership !== null || usingFantasy)
        ? loadOwnership(true)
        : Promise.resolve();
    const work = espnFirst.then(() => {
      const rest: Promise<unknown>[] = [loadReport(true)];
      if (usingFantasy) rest.push(loadFantasyRoster());
      if (view === 'research' || detailsKey !== null) rest.push(loadStatuses());
      if (view === 'research') rest.push(reloadResearch());
      return Promise.all(rest);
    });
    // Spin for at least `MIN_SPIN` however fast the answer comes. Measured: a
    // warm server answers `/api/report` in **16ms**, which is one frame of a
    // turning ball — a press that leaves no trace reads as a dead button, and
    // the one thing this control has to say is "I heard you and I have gone and
    // looked". Long enough to be seen, short enough that a genuinely quick read
    // still feels quick.
    return Promise.all([work, new Promise((r) => setTimeout(r, MIN_SPIN))]).finally(() =>
      setRefreshing(false),
    );
  }, [
    espnConnected,
    ownership,
    usingFantasy,
    view,
    detailsKey,
    loadOwnership,
    loadReport,
    loadFantasyRoster,
    loadStatuses,
    reloadResearch,
  ]);

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
  const showRosterViews = displayReports.length > 0;
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
  // The feed has two levels of collapsible now — the player groups
  // (`expandedKeys`, which is what the Games view's cards used and what
  // `expanded=` still carries) and the items inside them (`feedOpenKeys`) — so
  // it answers for both. The summary table and the edit screen have neither.
  const hasExpanded =
    view === 'summary' || editMode
      ? false
      : view === 'feed'
        ? feedOpenKeys.size > 0 || expandedKeys.size > 0
        : false;
  const collapseAll = () => {
    setFeedOpenKeys(new Set());
    setExpandedKeys(new Set());
  };

  const onAdd = async (p: WatchPlayer) => {
    setRoster(await api.addPlayer(p));
  };
  const onRemove = async (p: { id: number; kind: PlayerKind }) => {
    setRoster(await api.removePlayer(p.id, p.kind));
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
      .then(setRoster)
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

  // Persist the order; setRoster keeps the server's copy in sync (and triggers
  // a cached report refetch, which returns the same order).
  const commitOrder = useCallback(() => {
    api
      .reorderPlayers(reportsRef.current.map(playerKey))
      .then(setRoster)
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
  // Only ever the summary table: the jump's origin used to be either of the
  // two roster views, and the feed is now the jump's *destination*.
  const [backView, setBackView] = useState<'summary' | null>(null);
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
  /**
   * Jump to a player's full day: the grouped feed, his card open, scrolled to
   * the top. This used to switch to the Games view, which *was* the grouped
   * feed — so the destination is unchanged in everything but name, down to
   * `expandedKeys` being what opens the card.
   *
   * From the summary table it crosses pages and records the origin for the back
   * button; from the feed itself there is nowhere to go back to, and the jump
   * is the grouping turning on around the player you asked for.
   */
  const openPlayerDay = useCallback(
    (key: string) => {
      const from = view === 'summary' ? 'summary' : null;
      scrollPlaced.current = true;
      setBackView(from);
      setEditMode(false);
      setView('feed');
      setGroupByPlayer(true);
      // The feed shows one kind at a time, so land on the tab this player is
      // actually in — otherwise the jump scrolls to nothing.
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
  /**
   * The chip beside a card's name: **what your league will let you play him
   * at** wherever ESPN can say so, and MLB's single listed position otherwise.
   *
   * The same swap the research board's pills already made, arriving on the
   * cards for the same reason — a fantasy position is multi-valued and is
   * sometimes flatly different from MLB's (Curtis Mead is listed at 2B and is
   * eligible at 1B and 3B), so the one word MLB has for a man is the wrong
   * answer to the question a card in this app is read with. It costs no fetch:
   * the map rides on the `/api/espn/ownership` response the board and the
   * player page already read, which is why the effect behind it now fires on
   * any view rather than on those two.
   *
   * **Narrowed to the card's own kind** (`eligibleForKind`), exactly as each
   * board is: a two-way player's bat reads `DH` where his arm reads `SP`, and a
   * mis-joined pitcher reads his fallback rather than `2B/SS`. Whole lists are
   * the player page's business, that being the one place with room for one.
   *
   * It was the *card's* chip until the Games view went; the grouped feed's
   * player header is what that card became, so the chip moved with it rather
   * than being dropped along with the page — losing it was never part of
   * folding the two views together. Handed to the feed as a function rather
   * than as the eligibility map, so the fallback rule and the two-code cap
   * stay here beside the board's own copy of them.
   */
  const positionFor = useCallback(
    (id: number, kind: PlayerKind): { position?: string; positionTitle?: string } => {
      const espn = eligibleForKind(eligibility?.get(id), kind);
      if (!espn) return { position: positionById.get(id) };
      // Two codes and a count, the form the board's Pos cell prints — a card's
      // header is a name and this chip on one line, and the widest list in the
      // league wraps 8 of 14 names at 390px against the 1 that wraps today.
      // The tooltip carries the whole of it, and the player page prints it
      // whole in the first place.
      const { ordered, text } = positionCodes(espn);
      return { position: text, positionTitle: `Eligible in ESPN at ${ordered.join(', ')}` };
    },
    [eligibility, positionById],
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
  /**
   * Whether the player whose page is open is on the roster **the views are
   * reporting on** — which in fantasy mode is the ESPN team rather than the
   * saved list. It reads `rosterKeys` for that reason, the same set the
   * research board's `My Roster` button selects on and its baseball marks, so
   * the mark on a board row and the badge on that player's page can never come
   * to disagree about one man. In saved-roster mode the two are the same list
   * and nothing changes.
   */
  const detailsRostered = useMemo(
    () => (detailsKey ? rosterKeys.has(detailsKey) : false),
    [detailsKey, rosterKeys],
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
  /**
   * The rows the roster views show — Summary, Games and Feed alike.
   *
   * The filter reached the summary table alone for a while, on the reasoning
   * that "starting today" is a statement about one afternoon where the games
   * list is a record of a range and the feed a chronological one, so neither
   * had any business losing a player because tonight's lineup left him out.
   * What that missed is that the question is the same on all three: on a game
   * day you open whichever of them you read the roster in to see who is
   * actually in tonight, and picking those men out by the pips down a column of
   * thirty is exactly the work this button exists to save. A record of the
   * range is what the *dates* decide; who is on the page is what this decides,
   * and the two compose — a week's games for the nine men starting tonight is a
   * perfectly ordinary thing to ask for.
   *
   * So the toggle belongs to the roster row rather than to one of its tabs, and
   * it narrows whatever that row is showing. What it still does not touch is
   * the edit screen, which reads `editPlayers` off the raw reports: dropping a
   * player from the roster is what that screen is for.
   *
   * Filtered *here* rather than up in `shownReports`, where hide-injured is,
   * because the two are still different questions. An injured player is absent
   * for weeks, so dropping him ahead of the kind split keeps the tab counts
   * equal to the lists under them; filtering below it leaves the
   * Batters/Pitchers tabs alone, which is right — they say what is watched, not
   * what tonight's lineups came to.
   */
  const filteredCards = useMemo(() => {
    if (!startersActive) return kindCards;
    // Reading the fantasy team, the button answers a different question, so it
    // reads a different fact: not "is he in tonight's lineup" but "am I
    // starting him". The two are genuinely different populations, and in this
    // mode only one of them is the honest reading of the word. A man in your
    // lineup whom his real manager left out is still your start — he is
    // accruing you a zero tonight, which is exactly the thing you opened the
    // table to find out — while a player on your bench accrues you nothing
    // however he hits, so keeping him because MLB has him batting third would
    // be answering about somebody else's roster.
    //
    // Deliberately **not** the union of the two tests, which was the obvious
    // alternative: the union is "starting for anyone", a set that belongs to no
    // question anybody asks of this table, and it would put every benched
    // player back on a table narrowed precisely to the ones you are playing.
    // Nor is anything lost by the swap — whether one of your starters is in his
    // own club's lineup is already on his headshot, as the pip this filter and
    // that pip are both drawn from, so the narrowed table is where you read it.
    //
    // `fantasySlots` is null in saved-roster mode, which is what leaves that
    // mode untouched. It is *also* null while the roster read is in flight or
    // after it has failed, and falling back to the MLB test there is the right
    // direction to fail in: an empty table under a lit toggle reads as "nobody
    // is starting", which would be a claim where the truth is that the app
    // hasn't been told yet.
    if (fantasySlots) {
      return kindCards.filter((r) => fantasySlots.get(playerKey(r))?.starting === true);
    }
    const today = baseballToday();
    return kindCards.filter((r) => isStartingOn(r, today));
  }, [kindCards, startersActive, fantasySlots]);
  /**
   * Which of the two rules the toggle applies — see `filteredCards`. The
   * button's tooltip and the empty state under it both have to say which set
   * they are talking about, and neither should hold a second copy of the test:
   * the map being there is what makes the filter read the fantasy lineup, so
   * the map being there is what these read too.
   */
  const startersReadFantasy = fantasySlots !== null;
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
  /**
   * Reload what is on screen. The app re-polls on its own only while a real
   * game is live, and even then only the report — so this is the one control
   * that says "read it all again now": the report, the statuses map behind the
   * headshot marks, the research blob, and the connected league past its
   * ten-minute cache. See `refreshAll` for the rule and why the order matters.
   *
   * **It lives in the brand cluster, beside the gear and the fantasy button**,
   * where it used to sit at the right-hand end of `.header-tools` behind the
   * search field. Two things put it here. It is *app* chrome — it acts on
   * whatever page you are on rather than on the roster, which is exactly what
   * the other two squares beside the title are, where the cluster it left is
   * the roster's own search. And the header's one-line budget is measured in
   * whether a 418px field fits: the cluster is the side that overflows first,
   * so a 44px square is worth more given away than kept.
   *
   * Disabled while a read is in flight, with the app's own spinning baseball
   * in place of the icon inside a square that doesn't move — so nothing in the
   * header shifts, which matters more here than it did on the right-hand end,
   * the title and two buttons now sitting to its left.
   */
  const refreshButton = (
    <button
      type="button"
      className="refresh-btn"
      onClick={refreshAll}
      disabled={refreshing}
      aria-label={refreshing ? 'Refreshing' : 'Refresh'}
      aria-busy={refreshing}
      title={refreshing ? 'Refreshing…' : 'Refresh what is on screen'}
    >
      {refreshing ? (
        <SpinningBaseball />
      ) : (
        <svg
          viewBox="0 0 24 24"
          width="17"
          height="17"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* Three quarters of a circle with an arrowhead on the open end —
              the same gesture at 17px as the 14px baseball that replaces it,
              so the swap reads as the icon becoming the thing it was drawing. */}
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v4.5h-4.5" />
        </svg>
      )}
    </button>
  );

  // The header's cluster, at the top right: the roster search, and nothing
  // else. The calendar was once beside it and moved down to the roster row (see
  // `dateToggle`); Edit was the next and is now an entry in the settings menu;
  // refresh was the last, and has gone to the brand cluster on the left, where
  // the controls that act on the whole app already are. What is left is the one
  // thing in this header that belongs to the roster rather than to the app.
  //
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
          watchlist={roster}
          canAdd={!usingFantasy}
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
    </div>
  );

  /* The roster row's one filter: only the players who are actually starting
     today — a hitter in the posted lineup, a pitcher named as today's starter.

     **On the roster row, not in the settings menu.** The gear is app chrome and
     everything in it reads as app-wide (hide-injured decides the summary *and*
     the games list, muting decides every clip in the app); this qualifies the
     three roster views and nothing on the research board, and a menu entry that
     quietly did nothing over there would be a setting lying about its own
     reach. The roster row is where the app already says which slice of the
     roster is on screen, so the filter goes beside the tabs that select it —
     and goes with them on Research, which is the honest version of "it doesn't
     apply here".

     **It stays put across the three tabs**, where it used to be the summary's
     alone: Summary, Games and Feed are three readings of the same players over
     the same days, so a control that says *which players* has the same meaning
     in all three, and a button that vanished when you crossed to Games read as
     the filter being switched off rather than as it not applying. See
     `filteredCards` for what it narrows.

     **Between the reading and the days**, which is the research board's order
     rather than an exception to this row's: the scope pills there name *which
     players* and sit ahead of the window that names which span. Same question,
     same place in the run.

     It is a plain toggle with no panel, so it takes `.on` and never `.active`,
     and it is folded into `.research-toggle`'s selector lists rather than
     restyled to resemble the board's own panel-less toggle, the Watchlist
     button it is the twin of — a plain switch that decides who is in a table,
     stated on the control that opens it. Under 640px it goes to its glyph
     alongside the calendar beside it — the pair is a run of two icons where a
     lone one on a row of tabs would have nothing beside it to say what it
     meant, and the two labels were 174px of a line a phone hasn't got. */
  /* Read the feed one card per player rather than newest-first. This is the
     Games view's own control, kept after the page itself went: what that page
     did was sort the same days by roster instead of by clock, which is a
     reading of the feed rather than a page beside it — so it is a toggle on
     the feed, next to the other one that says which players the view is about.

     `.group-toggle` is folded into `.research-toggle`/`.starters-toggle`'s
     selector lists rather than restyled to resemble them: it is the same
     object as the Starters button beside it, a plain toggle with no panel, so
     it takes `.on` and never `.active`. On a phone it goes to its glyph with
     them, the run of icons on this row being what makes that legible. */
  const groupToggle = (
    <button
      type="button"
      className={`group-toggle${groupByPlayer ? ' on' : ''}`}
      aria-pressed={groupByPlayer}
      onClick={() => setGroupByPlayer((v) => !v)}
      title={
        groupByPlayer
          ? 'One card per player — his live at-bat, his plays and his next game together'
          : 'Group the feed by player instead of reading it newest-first'
      }
    >
      {/* Two stacked cards, each with a line in it: the shape the grouped feed
          makes of the page. Drawn to the same optical weight as the clipboard
          beside it — 20px, spanning 3–21 across — since on a phone the two are
          a pair of glyphs with no words between them. */}
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="3.5" width="18" height="7" rx="2" />
        <rect x="3" y="13.5" width="18" height="7" rx="2" />
        <path d="M7 7h6M7 17h6" />
      </svg>
      <span className="starters-toggle-label">By player</span>
    </button>
  );

  const startersToggle = rangeHasToday ? (
      <button
        type="button"
        className={`starters-toggle${startersOnly ? ' on' : ''}`}
        aria-pressed={startersOnly}
        onClick={() => setStartersOnly((v) => !v)}
        /* The word means one thing on your own roster and another on your
           fantasy team, so the tooltip says which. The label can't — it is one
           word, and "Starters" is the right word for both readings. */
        title={
          startersReadFantasy
            ? 'Only the players in your fantasy starting lineup — your bench and IL are hidden whatever their clubs do with them'
            : "Only the players starting today — hitters in a posted lineup, pitchers named as today's starter"
        }
      >
        {/* A lineup card, which is what the filter is: the men written on
            tonight's. It was three shortening rules — a "list" glyph, and a
            fair drawing of a filtered list, but on a phone this button is the
            icon and nothing else, and that one was *optically* tiny rather than
            small: its strokes span 10 of the viewBox's 24 units, so at 15px they
            came to about 6px of ink adrift in the middle of a 36px square.

            Which is also why the first clipboard drawn here still read small at
            17px and then at 20: it was 16 units wide against the calendar's 18,
            and a tall narrow outline carries less weight than a wide one
            whatever its box says. This one spans **3–21 across and 2–22 down**,
            so the glyph is the size the number claims. 20px in a 36px square,
            with the calendar beside it raised to the 17 every other icon button
            in the app uses — the pair has to read as a pair, and this one leads
            it. */}
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="8" y="2" width="8" height="4" rx="1" />
          <path d="M16 5h3a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3" />
          <path d="M7 12.5h10M7 17h6" />
        </svg>
        <span className="starters-toggle-label">Starters</span>
      </button>
    ) : null;

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
      {/* 17px, the size every other icon button in the app draws at — it was
          15, which was fine beside a label and small once a phone made this
          button the glyph alone beside a 20px clipboard. */}
      <svg
        viewBox="0 0 24 24"
        width="17"
        height="17"
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
      {/* What the label says once there is no room for a label. On a phone this
          button and the starters toggle beside it go to their icons — two
          squares where two words wouldn't fit — and this is the one of the pair
          that cannot simply lose its wording: the icon says "dates" and the page
          would then say nowhere at all *which* dates every number on it is drawn
          from. So the range rides on the corner of the glyph as a bubble.

          Numbers rather than the preset's word, always: "Today" is a label's
          worth of text and this is a badge on a 36px square, where 8/12 says the
          same thing in half the width and says it exactly. Rendered at every
          width and hidden by the stylesheet above 640, the way the date presets
          and their dropdown are already done. */}
      <span className="date-toggle-bubble">{tightRange(start, end)}</span>
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
  //
  // It carries no close button. The magnifier that opened it is still on screen
  // directly above, lit, and closes it on a second press — an ✕ beside the field
  // was a second control for a thing one press already undoes, and it cost the
  // field 44 of the ~350px a phone has to offer it. Escape closes it too (via
  // `onClose`, after a first press that clears the query).
  const searchBar = searchOpen ? (
    <div className="search-bar">
      <PlayerAdder
        players={seasonPlayers}
        watchlist={roster}
        canAdd={!usingFantasy}
        onAdd={onAdd}
        onOpenDetails={setDetailsKey}
        loading={playersLoading}
        autoFocus
        onClose={() => setSearchOpen(false)}
      />
    </div>
  ) : null;

  // The reorder screen edits the raw watchlist order, one kind at a time, so it
  // reads `reports` rather than the simulate-overlaid copy the cards render.
  const editPlayers = reports
    .filter((r) => (shownKind === 'pitcher' ? r.kind === 'pitcher' : r.kind !== 'pitcher'))
    .map((r) => ({ id: r.id, key: playerKey(r), name: r.name }));

  /* The edit screen. The chrome above is hidden entirely in this mode, so this
     is the whole of what's on screen and it carries its own heading rather than
     relying on a header to say where you are.

     **Done is on this row, not up in the header**, and it had to move here when
     Edit went into the settings menu: the header button was both the way in and
     the way out, and a menu entry can only be the way in — the gear is hidden in
     this mode, so a Done left inside it would be behind a button that isn't
     there. A mode with no visible way out is a trap, which is the one rule this
     screen has always had. It keeps `.edit-order-btn`, the very class the header
     button wore, so the control that leaves the mode is the same control that
     used to enter it.

     The kind switch comes with it. It is the header's own `kindTabs`, rendered
     here because the view bar is hidden in this mode and it is the only way to
     reach the other kind's order — hiding the chrome shouldn't mean a roster
     whose pitchers can no longer be reordered. It renders only when both kinds
     are watched, as ever. */
  const editPage = (
    <div className="edit-page">
      <div className="edit-page-head">
        <h2 className="edit-page-title">Edit players</h2>
        {kindTabs}
        <button
          type="button"
          className="edit-order-btn active"
          onClick={() => setEditMode(false)}
          title="Finish editing"
          aria-label="Finish editing"
        >
          <span className="edit-order-icon" aria-hidden="true">
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
          </span>
          <span className="edit-order-label">Done</span>
        </button>
      </div>
      <PlayerOrderEditor
        players={editPlayers}
        onMove={movePlayer}
        onCommit={commitOrder}
        onRemove={removeFromEditor}
      />
    </div>
  );

  return (
    /* One provider over the whole app: every clip plays through `ClipVideo`,
       which reads it, so the cards, the feed, the player page and the highlight
       reel are all covered without any of them handling the value. */
    <MutedContext.Provider value={muteAudio}>
    <FantasyRosterContext.Provider value={fantasySlots}>
    <PlayerStatusContext.Provider value={playerStatuses}>
    <div
      /* `summary-mode` is the fixed-height flex column the table needs, and
         the edit screen is a long scrolling list that must not be trapped in
         one — it took this page over when Edit moved off the Games view. */
      className={`app${view === 'summary' && !editMode ? ' summary-mode' : ''}${
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
                {/* Edit players came the other way, out of the header cluster
                    and into the menu. It takes `.help-btn` rather than
                    `.settings-toggle` because it is that kind of entry: it
                    opens a screen instead of flipping a setting, so it reads
                    with "How to use" below it rather than with the two
                    toggles above. Offered on the same terms it always was —
                    something to put in an order, and a list of ours to put it
                    in. */}
                {reports.length > 1 && !usingFantasy && (
                  <button
                    type="button"
                    className="help-btn"
                    role="menuitem"
                    onClick={() => {
                      // The menu has to go with the press: edit mode hides the
                      // whole chrome, gear included, so a popover left open
                      // would be floating over a screen that has hidden
                      // everything it belongs to.
                      setSettingsOpen(false);
                      // The reorder screen only exists on the Roster page, and
                      // this can be pressed from anywhere — so take the user
                      // there rather than flipping a mode with nothing on
                      // screen to show for it.
                      if (view !== 'summary') {
                        setBackView(null);
                        setView('summary');
                      }
                      // The edit screen hides the search bar too; closing it
                      // here stops it being restored on the way out of a mode
                      // it was never visible in.
                      setSearchOpen(false);
                      setEditMode(true);
                    }}
                    title="Reorder your players, or remove one"
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
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                    Edit players
                  </button>
                )}
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
                      setRosterSource(rosterSource === 'fantasy' ? 'saved' : 'fantasy')
                    }
                    title={
                      espnTeamName
                        ? `Read the Summary, Games and Feed views off ${espnTeamName} instead of the roster you built here`
                        : 'Read the Summary, Games and Feed views off your fantasy team'
                    }
                  >
                    <span className="settings-dot" aria-hidden="true" />
                    Use my fantasy team
                  </button>
                )}
                {/* Read the league again, now. The one thing this app cannot
                    see is a move made on ESPN, and until this it took two
                    navigations to tell it — see `refreshFantasyFromMenu` for
                    why it is here as well as on the league page.

                    Above League settings and below the toggle: it acts on what
                    this menu is about without leaving it, where the entry under
                    it is the menu's way *out*. The popover deliberately stays
                    open across the press — this is the one entry whose result
                    is a change in the page behind it, and closing on the press
                    would take away the only thing saying the read happened. */}
                <button
                  type="button"
                  className="help-btn fantasy-refresh"
                  role="menuitem"
                  onClick={refreshFantasyFromMenu}
                  disabled={fantasyRefreshing}
                  aria-busy={fantasyRefreshing}
                  title="Read your league from ESPN again — for a lineup or roster move you have just made there"
                >
                  {/* The header refresh's arrow at the menu's 15px, swapped for
                      the app's own spinning baseball in flight — the same pair,
                      so the two controls that re-read ESPN read as one idea. */}
                  {fantasyRefreshing ? (
                    <SpinningBaseball />
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      width="15"
                      height="15"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                      <path d="M20 4.2V9h-4.8" />
                    </svg>
                  )}
                  {/* No ellipsis: the ball beside the word is what says the
                      read is still going, which is the rule everywhere the two
                      appear together. */}
                  {fantasyRefreshing
                    ? 'Reading'
                    : fantasyRefreshed
                      ? 'Up to date ✓'
                      : 'Refresh from ESPN'}
                </button>
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
          {/* Last of the three squares, after the two that open something. It
              is the only one that *does* something on the press, so it reads
              last — and being outside `.fantasy-menu` it can't be caught by
              that popover's outside-click dismissal. See `refreshButton`. */}
          {refreshButton}
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
          **Roster · Feed · Research**, one row and three pages, with Batters /
          Pitchers beside them applying to the first two.

          It was two tiers until the Games view went. The top row was the real
          division — the watchlist over a range against the whole league over a
          season — and under it sat Roster's own Summary / Games / Feed. Folding
          Games into the feed as a grouping (see `View`) left that sub-row with
          two tabs, and a tier of chrome to hold one choice is a tier too many:
          Summary and Feed are as different from each other as either is from
          Research, so they read as siblings of it rather than as a drawer under
          one of them. Feed sits in the middle, between the roster it reports on
          and the league it doesn't.

          The search no longer appears here in any case — it is in the header
          now, which is also what lets the tabs stay hidden until something is
          watched without stranding a new user: the only way to add a first
          player is app chrome, not a bar that comes and goes with the view. */}
      {showViewToggle && (
        <div className="view-bar">
          <div className="view-bar-tabs">
            <div className="view-switch" role="tablist" aria-label="Page">
              {/* Nothing watched, nothing to put on either roster page — so
                  these two pills only appear once there is something to read. */}
              {showRosterViews && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'summary'}
                  className={`view-tab${view === 'summary' ? ' active' : ''}`}
                  onClick={() => {
                    setBackView(null);
                    // The reorder screen lives on this page now, so coming back
                    // to it is not a reason to close it. The other two are.
                    setView('summary');
                  }}
                >
                  Roster
                </button>
              )}
              {showRosterViews && (
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
            {/* Batters / Pitchers. */}
            {view !== 'research' && kindTabs}
            {/* The feed's grouping, the starters filter and the calendar that
                says which days they cover. All of it in the one wrapping row:
                each group is `flex: none`, so the row fits as many whole groups
                per line as the width allows and breaks between them rather than
                inside one — the order is the order the questions come in (which
                page, which kind, which reading of it, which players, which
                days), and where the line falls is the window's business rather
                than something fixed in the markup.

                Where the Summary / Games / Feed switch used to be: those three
                became two pages and a toggle, so what stood here as a tab group
                now stands here as the toggle that replaced the third of them. */}
            {view !== 'research' && showRosterViews && (
              <>
              {/* Only on the feed — it is a reading of that page and nothing
                  the summary table can do. */}
              {view === 'feed' && groupToggle}
              {/* Only over a range that contains today — see `startersToggle`. */}
              {startersToggle}
              {dateToggle}
              </>
            )}
            {/* The research board's own controls, in the tab row itself. They
                are the same kind of statement as the pills beside them — which
                page, then which players, which span, which position, which
                columns — and they sat below the chrome as a band of their own
                until now, so the page opened on two stacked control areas with
                nothing on screen to say why they were two.

                In the row rather than merely in the box, because this row is
                already the app's answer to "too many groups for one line": each
                group is atomic and the wrap fits as many whole ones per line as
                the width allows. So on a wide screen the whole control set
                finishes the tab row, and as the window narrows the last group
                drops to a line of its own — the same behaviour the kind tabs and
                the date button have always had here, and nothing pins which
                group lands where. `.research-chrome` and `.research-bar` are
                `display: contents` for exactly that reason: the groups have to
                be items of *this* flex container to take part in its wrap, and a
                box of their own would move as one block or not at all.

                The box is empty here and filled by `ResearchTable`, which
                portals its bar into it: the controls are inseparable from the
                board's column vocabulary and belong in the file that owns it
                (see the portal there). Rendered only on the research view, so no
                other page carries an empty row of chrome. */}
            {view === 'research' && <div className="research-chrome" ref={setResearchChrome} />}
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

      {/* `!usingFantasy`, because this block is about the *saved* list and in
          fantasy mode the views are not reading it: a user with an ESPN team
          and nothing saved would otherwise get "Your roster is empty" sitting
          on top of a full page of his fantasy team's cards, over a button that
          opens a search which — ESPN owning the list — no longer adds to
          anything. The mode's own empty case is the block below it. */}
      {rosterLoaded && !usingFantasy && roster.length === 0 && !error && view !== 'research' && (
        <div className="empty-state">
          <p className="empty-title">Your roster is empty</p>
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

      {/* And the fantasy half of it, which names its own cause the way every
          other emptied view in the app does. There is no search to offer here
          — the way to put a player on this roster is to add him on ESPN — so
          the two things it can say are the two ways out: go and make the move,
          or read your own list instead. Held until the roster read has landed
          (`fantasyRoster !== null`), or the message would flash over every
          fantasy page for as long as ESPN takes to answer. */}
      {usingFantasy &&
        fantasyRoster !== null &&
        rosterKeys.size === 0 &&
        !error &&
        view !== 'research' && (
          <div className="empty-state">
            <p className="empty-title">Your fantasy team is empty</p>
            <p>
              Add players to it on ESPN, then use Refresh from ESPN in the fantasy menu — or
              turn off “Use my fantasy team” there to go back to your own roster.
            </p>
          </div>
        )}

      {/* The two halves of the same read, and which one shows turns on whether
          there is anything on screen to protect. With nothing yet, the wait
          takes the page and names what it is reading; with cards already up it
          is a badge beside them and the cards stay exactly as they are. */}
      {showLoading && reports.length === 0 && view !== 'research' && (
        <LoadingBlock>Reading your roster&rsquo;s games</LoadingBlock>
      )}

      {showLoading && reports.length > 0 && view !== 'research' && (
        <LoadingLine className="refreshing">Updating</LoadingLine>
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

      {/* The other thing that can empty a roster view, and the reason it needs
          its own wording: the message above names the toggle that did it, and
          the gear is the wrong place to send someone whose page was narrowed by
          a button on the tab row. On all three now, the filter having stopped
          being the summary's alone — and off the edit screen, which the filter
          never touches. */}
      {view !== 'research' &&
        kindCards.length > 0 &&
        filteredCards.length === 0 &&
        !editMode && (
          <div className="empty-state">
            <p className="empty-title">
              {startersReadFantasy
                ? 'Nothing to show — nobody here is in your lineup today'
                : 'Nothing to show — nobody here is starting today'}
            </p>
            {/* Two causes, two messages. The MLB reading can be empty simply
                because the day is young, which is the thing a reader most needs
                told at 9am; the fantasy reading cannot — your lineup is set the
                moment you set it, so an empty table there means the kind on
                screen really is all bench and IL, and offering the lineup-card
                excuse would send someone off to wait for something that has
                already happened. */}
            {startersReadFantasy ? (
              <p>
                Turn off “Starters” in the row above to see your whole team — your bench and
                IL are what it is hiding.
              </p>
            ) : (
              <p>
                Turn off “Starters” in the row above to see everyone. Lineups post a couple of
                hours before first pitch, so an empty page in the morning may only mean they
                aren’t out yet.
              </p>
            )}
          </div>
        )}

      {view === 'research' ? (
        <ResearchTable
          /* Deliberately **not** keyed on the board. It was, so that crossing
             from OF to SP remounted the table rather than carrying a batter's
             column vocabulary onto a pitcher's — but a remount is a blunt way
             to say "these are two boards", and it threw away the filters you
             had built as the price of a look at the other one. A slot per kind
             does that job instead (`BoardState`), so each board has its own
             search, sort and filters *and* still has them when you come back —
             and it is held up here (`researchUi`) rather than in the component,
             which the bigger crossing, to Roster and back, unmounts. */
          rows={researchRows}
          kind={researchKind}
          loading={researchLoading && !research[researchCacheKey]}
          error={researchError}
          pos={researchPos}
          onPosChange={setResearchPos}
          columnKeys={researchCols[researchKind] ?? null}
          onColumnsChange={setResearchColumns}
          window={researchWindow}
          onWindowChange={setResearchWindow}
          include={researchInclude}
          onIncludeChange={setResearchInclude}
          includeWatchlist={researchWatchlist}
          onIncludeWatchlistChange={setResearchWatchlist}
          hasRosterPct={rosterPct !== null}
          hasEligibility={eligibility !== null}
          trendWindows={rosterTrend}
          ownedIds={ownedIds}
          espnConnected={espnConnected}
          espnError={espnError}
          onConnectEspn={openEspnSettings}
          rosterKeys={rosterKeys}
          watchlistKeys={watchlistKeys}
          onWatchlistToggle={toggleWatchlisted}
          onOpenDetails={setDetailsKey}
          /* Held here so leaving the page doesn't throw it away, and handed
             back whole — see `researchUi`. */
          ui={researchUi}
          onUiChange={setResearchUi}
          /* The chrome box above, which the board's control set renders into. */
          controlsHost={researchChrome}
        />
      ) : view === 'summary' ? (
        /* The edit screen takes this page. It lived on the Games view until
           that view went, and Roster is where it belongs anyway: it edits the
           list this table reports on, and it is the only page left that is
           about the roster as a list rather than as a stream. */
        editMode ? (
          <div className="content-layout">
            {editPage}
          </div>
        ) : (
        filteredCards.length > 0 && (
          <SummaryTable
            reports={filteredCards}
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
                {/* Expanded, the research board reduces its control set to a
                    row of read-only badges; this view keeps its controls
                    instead, and the filter comes with them for the same reason
                    the kind tabs and the dates do — it is what the rows *are*,
                    and a table narrowed to nine names with nothing on screen
                    saying why is the one state this must never be in. Being the
                    live control rather than a badge, it is also the way back
                    out without leaving the page. */}
                {startersToggle}
                {dateToggle}
                {dateControl}
              </>
            }
          />
        )
        )
      ) : (
        filteredCards.length > 0 && (
          /* Keyed so switching kind or date range starts the stream back at its
             first page; a live poll (data only) leaves it alone. The starters
             filter deliberately isn't in that key: it changes which players the
             stream is about, and re-reading it from the top is what the reader
             wants when the list has become a different one. */
          <LiveFeed
            key={`${shownKind}-${start}-${end}`}
            reports={filteredCards}
            kind={shownKind}
            onOpenDetails={setDetailsKey}
            onOpenPlayerDay={openPlayerDay}
            openKeys={feedOpenKeys}
            onToggleKey={toggleFeedKey}
            groupByPlayer={groupByPlayer}
            /* The player groups are what `expandedKeys` has always opened —
               they are the Games view's cards, and `expanded=` still names
               them. */
            groupOpenKeys={expandedKeys}
            onToggleGroup={toggleCollapsed}
            positionFor={positionFor}
            multiDay={start !== end}
          />
        )
      )}

      {/* Bottom-left back button, shown only after a name in the summary table
          jumped to that player's card on the feed — returns to the table. */}
      <button
        type="button"
        className={`float-btn back-nav${
          view === 'feed' && backView && !editMode ? ' visible' : ''
        }`}
        onClick={goBack}
        aria-label="Back to roster"
        title="Back to Roster"
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
          isOnRoster={detailsRostered}
          rosterEditable={!usingFantasy}
          isWatchlisted={watchlistKeys.has(`${detailsPlayer.kind}-${detailsPlayer.id}`)}
          onWatchlistToggle={(on) =>
            toggleWatchlisted(`${detailsPlayer.kind}-${detailsPlayer.id}`, on)
          }
          rosterPct={rosterPct ? rosterPct.get(detailsPlayer.id) ?? null : undefined}
          eligible={eligibility ? eligibility.get(detailsPlayer.id) ?? null : undefined}
          rosterTrends={
            rosterTrend && rosterPct?.has(detailsPlayer.id)
              ? rosterTrend.map((w) => ({
                  window: w.window,
                  days: w.days,
                  change: w.delta.get(detailsPlayer.id) ?? 0,
                }))
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
