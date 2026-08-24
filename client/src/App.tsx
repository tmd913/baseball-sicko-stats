import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { SignOutButton } from './auth';
import { playerKey, RESEARCH_WINDOWS, SPLIT_CUTS } from './types';
import type {
  EspnOwnership,
  EspnRankings,
  EspnRankSpan,
  EspnTransactions,
  EspnRoster,
  EspnProjection,
  EspnScoreboard,
  EspnStatus,
  PlayerKind,
  PlayerReport,
  PlayerStatus,
  RecentNews,
  ResearchRow,
  ResearchWindow,
  MatchupWindow,
  RosterProjection,
  RosterSource,
  ScheduleWindow,
  SeasonPlayer,
  ParkFactor,
  SplitCut,
  TeamInfo,
  TrendWindow,
  WatchPlayer,
} from './types';
import {
  addDays,
  baseballDay,
  isInjured,
  isStartingOn,
  LEAGUE_POLL_MS,
  LIVE_POLL_MS,
  projectStarters,
  rangeDatesOf,
  seatKinds,
  startedOn,
} from './lib';
import { takeInvite } from './invite';
import { applyTheme, DEFAULT_THEME, readStoredTheme, storeTheme, toThemeId } from './theme';
import type { ThemeId } from './theme';
import { BaseballMark } from './components/BaseballMark';
import { ScrollRow } from './components/TabStrip';
import { PlayerAdder } from './components/PlayerAdder';
import { TeamDetails } from './components/TeamDetails';
import { GamePage } from './components/GamePage';
import { PlayerOrderEditor } from './components/PlayerOrderEditor';
import { LiveFeed, FEED_PAGE_SIZE, newPlays } from './components/LiveFeed';
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
import { toStatsColumnKeys } from './components/PlayerWindowTable';
import { DateBar, DateCalendar, stepRange, stepTitle } from './components/DateControls';
import type { DateBarReading, DatePreset } from './components/DateControls';
import { ScheduleSpanTabs, ScheduleToggle } from './components/ScheduleControl';
import {
  buildScheduleIndex,
  buildTurnIndex,
  clampTurnDays,
  toTurnDays,
  turnDaysParam,
  defaultScheduleSpan,
  effectiveSpan,
  spanDates,
  spanLabel,
  stepSpan,
  toScheduleSpan,
} from './components/schedule';
import type { ScheduleSpan, TurnDays } from './components/schedule';
import {
  EligibilityContext,
  FantasyRosterContext,
  MutedContext,
  PlayerStatusContext,
  HandednessContext,
  GameDoorContext,
  ParkFactorsContext,
  TeamDoorContext,
  RecentNewsContext,
  useDelayedFlag,
  useDismissable,
  usePopoverFit,
  useResumed,
  useStickyChromeOffset,
} from './hooks';
import type { FantasySlot, GameDoor, GamePageTab, TeamDoor, TeamPageTab } from './hooks';

/**
 * **One of the three pages, as a step the reader took to reach it.**
 *
 * Three shapes because there are three pages, and they are tagged rather than
 * sniffed for the reason `PreviewTarget` is: the club's needs its **tab**
 * carried with it, which neither of the other two has any notion of. A step
 * back to a club must land the reader on the list they pressed a row of, not
 * on its Overview.
 */
type PageStep =
  | { kind: 'player'; key: string }
  | { kind: 'team'; id: number; tab: TeamPageTab | undefined }
  | { kind: 'game'; gamePk: number; tab: GamePageTab | undefined };

/**
 * A page, and **where the reader was standing on it** — the offset its own
 * scroller was at when they pressed the door that took them off it.
 *
 * It is read at the moment of the press rather than followed with a listener,
 * which is the whole of why it costs nothing: one `scrollTop` off the one
 * `.details-view` there can be, taken exactly when it matters.
 */
type PageRef = PageStep & { scroll?: number };
import { LoadingBlock, LoadingLine, SpinningBaseball } from './components/Loading';
import { ProjectedToggle, ProjectionKey } from './components/Projection';
import {
  FeedFilterPills,
  FeedToggle,
  playFilterParam,
  toPlayFilter,
  type FeedLens,
  type PlayFilterKey,
} from './components/FeedFilters';
import { Tutorial } from './components/Tutorial';
import { BackToTop } from './components/FloatControls';
import { EspnSettings } from './components/EspnSettings';
import { LeagueOnboarding } from './components/LeagueOnboarding';
import { ThemeSwatches } from './components/ThemePicker';
import LeagueView, {
  LEAGUE_TABS,
  ProjectedTools,
  boardProjectable,
  showingProjected,
} from './components/LeagueView';
import LeagueMatchupView from './components/LeagueMatchup';
import type { MatchupReading } from './components/LeagueMatchup';
import type { LeagueTab } from './components/LeagueView';

// How long a press-triggered mark keeps spinning at a minimum — the fantasy
// popover's `Refresh from ESPN`, and the league page's own Refresh through it.
// A warm league answers in milliseconds, which is a baseball nobody sees turn,
// and a control that answers a press with nothing at all reads as broken. The
// waits nobody pressed take `WAIT_DELAY` at the other end of the same argument
// (`hooks.ts`), which is a delay before a mark goes up rather than a floor on
// how long it stays.
const MIN_SPIN = 450;

/**
 * The app's three pages. **Roster** is the summary table over the date range,
 * **Feed** the same players and days read as a stream, and **Research** the
 * whole league over the season.
 *
 * It was two tiers once: Roster · Research on top, and Roster's own Summary /
 * Games / Feed below. What collapsed it was noticing that Games and Feed were
 * not two readings but one: a card per player over the range, and a stream over
 * the same range, differing in *sort order*. Sorting is not a page. So Games
 * folded into the feed as a grouping, which left Roster with a single reading —
 * the summary table — and the sub-row with one live tab in it.
 *
 * **The grouping has since gone too, and one step further on.** A card per
 * player is a page about a *player*, and this app already had one that opened
 * on anybody: the player page. So the reading moved onto it as the **Overview**
 * tab, the toggle went with it, and a name in any view now opens the same page
 * his headshot does. Three pages, one row, and one place a player's day is read.
 *
 * `summary` rather than `roster` because that is the name `view=` has always
 * used for it, and it is the default every link in the wild omits.
 */
type View = 'summary' | 'feed' | 'research' | 'matchup' | 'league';

/** The two *readings* of the Roster page — the stat table and the stream. They
 *  are one tab now (`Roster`) and were two, and the pair survives as the value
 *  of `view` for the reason `view=feed` survives in the wild: the reading is
 *  still a page's worth of difference to everything downstream — its own date
 *  range, its own scroll memory, its own URL — and only the *chrome* changed.
 *  Research and Matchup and League are each about something else (the whole
 *  league's season, this week's opponent, the fantasy league), and none of them
 *  has a date range of its own. */
function isRosterView(v: View): boolean {
  return v === 'summary' || v === 'feed';
}

/** The four tabs, and which `view` values each of them owns. The Roster tab
 *  covers two, so the strip cannot test equality — a `Roster` pill unlit while
 *  the Feed reading is on screen would be the row lying about where you are. */
function mainTab(v: View): 'roster' | 'matchup' | 'research' | 'league' {
  return v === 'summary' || v === 'feed' ? 'roster' : v;
}

/**
 * Which **reading of the roster** a date range belongs to — see `dateScopeRef`.
 *
 * It was two, the Roster and the Feed, on the argument that a table read for
 * what a line comes to and a stream scrolled back through ask different
 * questions of one control. That argument was right and did not go far enough:
 * the Roster tab is not one reading but **three**, and the other two move the
 * days as hard as crossing to the Feed does. The Schedule reading is a table of
 * fixtures *ahead*; the Projected reading opens on today → the end of the
 * period. Sharing one entry between them meant every excursion cost the stats
 * table its days and had to be undone by hand on the way back — which is what
 * `beforeProjection` was, and it is gone with this.
 *
 * So there is one entry per control in the tools row: the plain stat table, the
 * Feed, the Schedule reading and the Projected one.
 */
type DateScope = 'summary' | 'feed' | 'schedule' | 'projected';

/** The four, for the two places that have to walk every entry rather than the
 *  one on screen — `settleMatchup` and the seed. Written once so a fifth
 *  reading cannot be added to the type and missed in a loop. */
const DATE_SCOPES: DateScope[] = ['summary', 'feed', 'schedule', 'projected'];

/** A range as this app holds one: the two days, and the preset label they were
 *  derived from — null for a range picked by hand, which has none. A preset is
 *  a rule rather than a pair of dates, which is why the label rides along: it
 *  is what the URL carries and what the calendar's own button prints. */
interface DateRange {
  start: string;
  end: string;
  preset: string | null;
}

// Whether the settings menu offers the "Simulate live" toggle. Off: the overlay
// is a developer/demo tool, not something a user of the site should be handed a
// switch for. The mode itself is untouched — `?sim=1` in the URL still turns it
// on — so flipping this back to true (or, later, to an is-admin test, which the
// app has no notion of yet) is all it takes to restore the menu entry.
const SHOW_SIMULATE_TOGGLE = false;

// The Eastern zone and the 3am rollover that decide what "today" means are
// `lib.ts::baseballDay`'s now — moved there when the matchup page needed the
// baseball day of an ESPN transaction to say which week it belongs to, and one
// copy of a rule that precise is the most there should be. `addDays` went the
// same way when a matchup team page grew a projected lens of its own and needed
// to move a range forward exactly as this file's own does.

/* `startedOn` and the projection below it are `lib.ts`'s now — a matchup's
   team pages ask the same question of a leaguemate's lineup, and one definition
   of "was he in it that day" is what keeps the two surfaces answering it the
   same way. */

/** Today's baseball date — the Eastern date of a clock set back to the rollover
 *  hour, so the small hours still belong to the night before. */
function baseballToday(): string {
  return baseballDay(Date.now());
}

/* `previousDay` and `nextDay` went with the change above: their only caller was
   `datePresets`, which now steps the day it is handed rather than the clock. */

/** Most recent Monday on or before the given date (i.e. start of that week). */
function mondayOnOrBefore(date: string): string {
  const [y, m, day] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  const daysSinceMonday = (dt.getUTCDay() + 6) % 7;
  return addDays(date, -daysSinceMonday);
}


/**
 * The label the current fantasy matchup period goes under, which is a constant
 * because three places have to agree about it: the preset the row offers, the
 * URL param a link carries, and the boot path that resolves one of those back
 * into a pair of dates once the league has answered.
 *
 * **The same word the matchup page's own team pages use, and deliberately not
 * the same preset.** That one names *the matchup being read* — a week the
 * reader navigated to, which is often a past one — where this names *the week
 * the league is on*. They are the same question asked of two different periods,
 * so `LeagueMatchupView` goes on being handed the app's five and adding its own
 * on top (see its `spanPresets`); handing it a list that already carried one
 * would put two pills reading `Matchup` in one row, meaning two spans.
 */
const MATCHUP_PRESET = 'Matchup';

/**
 * **The days the fantasy week the league is on covers**, clamped to today — or
 * null with no window to read them off, and null where the period's first day
 * is still ahead, which has no played days at all and so no span to name.
 *
 * **The end is clamped, and the whole period is not what this names**, which is
 * the one decision in it. `MatchupWindow` publishes the period entire (Aug 10 –
 * Aug 23 on a fortnight's playoff round) because it was derived for the
 * **Schedule** view, which is a grid of fixtures and wants every day of it. The
 * two roster views are cut by what has been *played*: a range running to the
 * 23rd on the 18th is five days of empty columns on every row of the summary
 * table and five days of nothing on the Feed, under a pill whose whole claim is
 * that it names the week's numbers. Clamped, `Matchup` is the days the week has
 * actually had — which is also the span the League page's own category totals
 * are summed over, so the two agree rather than the table quietly including
 * days the score does not.
 *
 * **The days ahead are not lost, they are two other controls**: the Schedule
 * view replaces the stat columns with the fixtures (and offers the league's own
 * two weeks as its spans), and the projected lens already runs
 * from today to `matchupWindow.end`, which is the rest of this very period. So
 * the split is that this preset answers *what has this week come to* and those
 * two answer *what is left of it*.
 *
 * **Not the scoreboard's own `start`/`end`, which truncate at today already and
 * would need no clamp.** That payload is `/api/espn/scoreboard`, read only while
 * the League view is open or a matchup is; making a roster page depend on it
 * would put a league-wide read on every load of the two views most people never
 * leave. This window is 103 bytes, read once per session on a connected league,
 * and the app is already fetching it for the Schedule control.
 */
function matchupDays(
  w: MatchupWindow | null,
  today: string,
): { start: string; end: string } | null {
  if (!w) return null;
  const end = w.end < today ? w.end : today;
  return w.start > end ? null : { start: w.start, end };
}

/** The five named spans, **derived against a day rather than against the
 *  clock**: the caller holds the current baseball day in state so that
 *  reopening a suspended app re-derives them (see `today` in `App`), and a
 *  function that read the clock itself would leave that state a decoration. */
function datePresets(today: string): DatePreset[] {
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);
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

/** How many recently-picked players the header search offers back. Mirrors
 *  `RECENT_PLAYERS` in the server's `store.ts`, the two workspaces being unable
 *  to import from each other — this caps the optimistic copy, the server caps
 *  what is stored, and the two agree by arithmetic rather than by one trusting
 *  the other. */
const RECENT_PLAYERS = 5;

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

/**
 * Did this status change **name a team where the connection had none**?
 *
 * That is the last step of joining a league — an invite link attaches you to
 * one with no team, since a team id means nothing in a league you weren't in,
 * and picking yours out of the list is the act that finishes it. It is what
 * turns the roster views over to the fantasy team (see `onEspnStatusChange`),
 * and every clause below is there to keep some *other* status change out of it:
 *
 * - **`prev.connected`** excludes the connect itself. Pasting cookies for a
 *   private league derives the team from the SWID in the same round trip, so
 *   the transition there is disconnected → connected-with-a-team; treating
 *   that as a first pick would also fire on every *re*-connect, which is what
 *   somebody does when the session cookie has expired and is no statement
 *   about which roster they want to read.
 * - **`prev.teamId === null`** excludes changing which of two teams is yours,
 *   which is the case this must never fire on: someone who has deliberately
 *   turned the fantasy roster off and is correcting the team would have it
 *   turned back on under them.
 * - **the same league** because a connection moved to a different league keeps
 *   nothing of the old one, and comparing team ids across two of them compares
 *   two different numbering systems.
 */
function firstTeamNamed(prev: EspnStatus | null, next: EspnStatus): boolean {
  return (
    prev?.connected === true &&
    next.connected === true &&
    prev.leagueId === next.leagueId &&
    prev.teamId === null &&
    next.teamId !== null
  );
}

export default function App() {
  // Initial UI state is seeded from the URL query so a reload (or shared link)
  // restores the same date range, active preset, and collapsed cards.
  const initialParams = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  /**
   * **The baseball day, held rather than read** — the one clock every derived
   * span in this component is measured against.
   *
   * It was `baseballToday()` called inside each of the memos below, which is
   * the same thing for as long as the page is being *loaded* daily and quietly
   * wrong the moment it is not. An iPhone home-screen PWA is suspended rather
   * than unloaded: it comes back with yesterday's `presets` array, so `Today`
   * named yesterday, the roster read the day before this one, and the date bar
   * said `Today` over it — the report the user actually made. Desktop has the
   * same fault a slower way, in a tab left open across 3am ET.
   *
   * Moved by `refreshOnResume` below, on the app coming back to the foreground,
   * and nowhere else: this is the app's clock, not a subscription to it, and
   * a timer that fired at the rollover would move the dates under somebody
   * reading them at 3am rather than when they next looked.
   */
  const [today, setToday] = useState(baseballToday);
  const presets = useMemo(() => datePresets(today), [today]);
  // The preset named in the URL, if it's still one we offer. An unknown label
  // (renamed preset, hand-edited link) falls through to start/end instead.
  const initialPreset = useMemo(() => {
    if (initialParams.has('preset')) {
      const label = initialParams.get('preset');
      /* `Matchup` is known here and is not in `presets`, which is the whole of
         what makes it a rule rather than a range: its days come off the
         connected league and the league has not answered yet. It is accepted on
         trust and resolved — or given up — once it has; see `matchupSpan`. */
      if (label === MATCHUP_PRESET) return label;
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
  /**
   * The date range, **one per reading of the roster**.
   *
   * It was one range shared by everything, then two — the Roster and the Feed —
   * on the argument that a table read for what a line comes to and a stream
   * scrolled back through ask different questions of one control. A reader who
   * went to the Feed for last week's plays came back to a summary table of last
   * week, put the calendar back to Today to fix it, and found the Feed on Today
   * the next time they crossed: one control answering two questions and losing
   * one of them each way.
   *
   * **It is four now, because the Roster tab is not one reading but three.**
   * The tools row offers `Feed`, `Schedule` and `Projected` beside the plain
   * stat table, and the last two move the days as hard as crossing to the Feed
   * does — Schedule is a table of fixtures *ahead* and Projected opens on today
   * → the end of the matchup period. Both borrowed the stats table's entry and
   * made an excursion out of it, which is the same fault one control over:
   * `Stats → Schedule → Stats` came back on the schedule's days, and the
   * projected lens only came back at all because it remembered a range on the
   * way out and wrote it back on the way in (`beforeProjection`, gone with
   * this — an excursion nobody takes needs no return ticket).
   *
   * Nothing else about the control moves: it is the same bar, the same calendar
   * and the same arrows, drawn on whichever reading is on screen and writing to
   * that reading's own entry.
   *
   * **Every entry is seeded from the same link**, which is the honest reading of
   * one — `?preset=Yesterday` means yesterday, whichever reading it opens on —
   * and they part from there as the reader moves each. A link can only carry one
   * range, and it is the one on screen: the URL writes the entry of the reading
   * in view, that being the one it describes.
   *
   * Which entry is live is `dateScopeRef`, resolved below the three pieces of
   * state that decide it: the entry is a fact about which reading is on screen,
   * so it cannot be picked until all three are known.
   */
  const [ranges, setRanges] = useState<Record<DateScope, DateRange>>(() => {
    const seed = { ...initialRange, preset: initialPreset };
    return { summary: seed, feed: seed, schedule: seed, projected: seed };
  });
  // The picker allows selecting through the end of the current year so the full
  // published schedule (scheduled games, probable pitchers) can be viewed ahead.
  const maxDate = useMemo(() => `${today.slice(0, 4)}-12-31`, [today]);
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
  /* Whether the very first report read has settled — read or failed, and set
     once in `loadReport`'s `finally` and never back to false. This is not the
     same question `reportLoading` answers: that one re-arms on every later
     load (a date change, a roster edit), and gating the tab pills on
     `!reportLoading` would blank the whole row again each time. What the pills
     need is "has an answer come back at all" — settled either way, so a
     failed first read still gets its tabs rather than losing them for the
     session, and a genuinely empty roster still lands on the lone Research
     pill once the answer is in. See `initialLoadSettled` below. */
  const [reportSettled, setReportSettled] = useState(false);
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
  // The player whose details view (percentile rankings) is open, seeded from the
  // URL so a shared/reloaded link reopens it once that player's report loads.
  const [detailsKey, setDetailsKey] = useState<string | null>(
    () => readKeys(initialParams.get('player'))[0] ?? null,
  );
  /**
   * **The club whose page is open**, `team=` in the URL and the exact twin of
   * `detailsKey` above: a page over whatever view is behind it, seeded from the
   * link so a shared one reopens it.
   *
   * The three page parameters — `player=`, `team=` and `game=` — are **mutually
   * exclusive by construction**, and the setters below are the one place that
   * is enforced. They are one page at one layer: a page opened from another
   * *replaces* it rather than stacking over it, which is what keeps this to a
   * single `.details-view` and one press of Escape to leave whatever is on
   * screen.
   *
   * On the way *in*, a link carrying more than one takes the **oldest**
   * parameter it can — player, then team — a hand-made URL being the only way
   * to produce the set, and falling back beating emptying the view.
   */
  const [teamPageId, setTeamPageId] = useState<number | null>(() => {
    if (readKeys(initialParams.get('player'))[0]) return null;
    const raw = Number(initialParams.get('team'));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  });
  /**
   * Which side of the ball that page is reading — `tside=pitching`, written
   * only off the default, the rule every parameter here follows.
   *
   * In the URL because it decides *which numbers* the page's Stats and Overview
   * are showing, which is the same test that put `pos=` and `win=` there. An
   * unrecognized value is the default rather than an empty page.
   */
  const [teamSide, setTeamSide] = useState<PlayerKind>(() =>
    initialParams.get('tside') === 'pitching' ? 'pitcher' : 'batter',
  );
  /** Which tab that page should open on, where a door named one. Held beside
   *  `teamPageId` rather than in the URL, which is where the team page's tab has
   *  always *not* been — it is a reading of one club rather than which data the
   *  view shows, the same call `tside=` went the other way on. */
  const [teamPageTab, setTeamPageTab] = useState<TeamPageTab | undefined>(undefined);
  /** …and the same for a game's page, which a step back names so that a reader
   *  who was reading the Plays and pressed a name comes back to the Plays. */
  const [gamePageTab, setGamePageTab] = useState<GamePageTab | undefined>(undefined);
  /**
   * **Where the page now opening was last left**, for a step *back* — undefined
   * for a page being opened rather than returned to, which is the difference
   * between the two and is what makes a fresh page open at the top. Read once
   * by `DetailsShell`, at mount.
   *
   * **Only the game's page takes it today**, and that is a limit rather than a
   * choice: restoring an offset onto a page whose content has not arrived
   * restores nothing — the browser clamps it against a box of nothing. The game
   * page can because it holds its answers in a module cache and renders at full
   * height in the first commit (see `GamePage`'s `gameCache`); the club's and
   * the player's re-read on every mount, so the same prop on them would land on
   * 0 about as often as it worked. The mechanism is `DetailsShell`'s and waits
   * for them.
   */
  const [backScroll, setBackScroll] = useState<number | undefined>(undefined);
  /** The game whose page is open — `player=`'s and `team=`'s third sibling, and
   *  seeded last for the reason above. */
  const [gamePagePk, setGamePagePk] = useState<number | null>(() => {
    if (readKeys(initialParams.get('player'))[0]) return null;
    const team = Number(initialParams.get('team'));
    if (Number.isInteger(team) && team > 0) return null;
    const raw = Number(initialParams.get('game'));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  });

  /* ── The route in ─────────────────────────────────────────────────────────
   *
   * **`Back` undoes exactly one thing, and there are three pages it can undo
   * to.** That is the app-wide rule every dialog here already keeps, and it is
   * what this block exists to make true of the pages as well.
   *
   * It was **one step of memory per page** before, and the step was spent on
   * the way in: a club opened from a player remembered him, and a player opened
   * from that club remembered nobody — so a reader who walked *player → club →
   * one of its games* got back to the game and then, from the club he pressed
   * inside it, straight out to the view. Reported as **"back button from game
   * page closes previous pages too"** and reproduced: a crest on a game's page
   * opened `?team=112` and one press of `Back` left `?preset=Today`, with the
   * game he came from nowhere.
   *
   * So it is a **stack of where the reader has been**, `pageStackRef`, and the
   * objection the old comment raised against one — *what happens when a reader
   * walks a chain of six* — has an answer that reads better than the memory
   * did: he presses `Back` six times. What that objection was really about is
   * **rendering** six pages at once, which nothing here does: one page is on
   * screen, the rest are a route, and a route costs a small array.
   *
   * It is **not in the URL**, which is where everything about *which* page is
   * open lives. A route is what the reader did rather than where they are, and
   * a link carrying it would promise a recipient pages he was never on — so a
   * reload of `?game=…` closes to the view, which is exactly what the same link
   * handed to somebody else does, and the two agreeing is the point.
   *
   * A **ref rather than state**, because nothing renders it: a stack in state
   * would re-render the whole app on every navigation to change a value only
   * two callbacks read.
   * ────────────────────────────────────────────────────────────────────────── */

  /** How many steps back are kept. A reader can walk a chain as long as they
   *  like — club, a game, a man in it, his club — and this is only the point
   *  past which the oldest step is dropped rather than the array growing for
   *  the life of the session. Twelve is far past any route anybody walks. */
  const PAGE_HISTORY = 12;
  const pageStackRef = useRef<PageRef[]>([]);
  /** `detailsKey` as the last commit left it, so the doors can read who is on
   *  screen without taking him as a dependency — they are handed to a dozen
   *  callers, several through a context, and would otherwise be new functions
   *  every time any page opened. */
  const detailsKeyRef = useRef<string | null>(detailsKey);
  useEffect(() => {
    detailsKeyRef.current = detailsKey;
  }, [detailsKey]);
  const teamPageRef = useRef<number | null>(null);
  useEffect(() => {
    teamPageRef.current = teamPageId;
  }, [teamPageId]);
  const gamePkRef = useRef<number | null>(null);
  useEffect(() => {
    gamePkRef.current = gamePagePk;
  }, [gamePagePk]);
  /**
   * **The tab the club's page is actually showing**, which `teamPageTab` above
   * is not: that one is the tab a *door* named, and the page's key is built from
   * it — so following the strip with it would remount the page on every press
   * of a tab. `TeamDetails` reports its own, and it lands here rather than in
   * state for the same reason.
   *
   * It is what makes a step back land where the reader was standing. Without
   * it, `Back` from a game opened off a club's **Results** tab returned him to
   * that club's *Overview* — measured in a browser before this ref existed.
   */
  const teamTabRef = useRef<TeamPageTab | undefined>(undefined);
  const noteTeamTab = useCallback((tab: TeamPageTab) => {
    teamTabRef.current = tab;
  }, []);
  /** The same for a game's page, and for the same reason: the strip is that
   *  page's own state, and what a step back needs is the tab the reader was
   *  actually on rather than the one a door named. */
  const gameTabRef = useRef<GamePageTab | undefined>(undefined);
  const noteGameTab = useCallback((tab: GamePageTab) => {
    gameTabRef.current = tab;
  }, []);

  /** Which page is on screen, as a step. Null on the view itself, which is what
   *  makes the bottom of the stack empty rather than a page nobody opened. */
  const currentPage = useCallback((): PageRef | null => {
    /* The one `.details-view` there can be — the three pages are exclusive, so
       whichever is open is the one being left. */
    const scroll = document.querySelector('.details-view')?.scrollTop;
    const step = (page: PageStep): PageRef => ({ ...page, scroll });
    if (detailsKeyRef.current !== null) return step({ kind: 'player', key: detailsKeyRef.current });
    if (teamPageRef.current !== null) {
      return step({ kind: 'team', id: teamPageRef.current, tab: teamTabRef.current });
    }
    if (gamePkRef.current !== null) {
      return step({ kind: 'game', gamePk: gamePkRef.current, tab: gameTabRef.current });
    }
    return null;
  }, []);
  /** Put one page on screen and the other two away — the single place the three
   *  parameters are made exclusive, so the exclusion cannot be got round by a
   *  caller. `null` is the view. */
  const showPage = useCallback((page: PageRef | null) => {
    setDetailsKey(page?.kind === 'player' ? page.key : null);
    setTeamPageId(page?.kind === 'team' ? page.id : null);
    setTeamPageTab(page?.kind === 'team' ? page.tab : undefined);
    setGamePagePk(page?.kind === 'game' ? page.gamePk : null);
    setGamePageTab(page?.kind === 'game' ? page.tab : undefined);
    setBackScroll(page?.scroll);
  }, []);
  /** Open a page, remembering the one it was opened from. */
  const openPage = useCallback(
    (page: PageRef) => {
      const from = currentPage();
      if (from) {
        pageStackRef.current = [...pageStackRef.current, from].slice(-PAGE_HISTORY);
      }
      showPage(page);
    },
    [currentPage, showPage],
  );
  /** **Leaving a page** — one step back, or out to the view. `Back` and Escape
   *  are the same door out (`DetailsShell` gives both to `onClose`), so a
   *  returning press is a returning key too, which is what stops the two
   *  disagreeing. */
  const closePage = useCallback(() => {
    const stack = pageStackRef.current;
    const back = stack.length > 0 ? stack[stack.length - 1] : null;
    pageStackRef.current = stack.slice(0, -1);
    showPage(back);
  }, [showPage]);
  /** **The one door into a player's page** — a roster row, a board row, a name
   *  in a box score, the header search. `null` is the door out, which is what
   *  the page's own close has always passed. */
  const openPlayer = useCallback(
    (key: string | null) => {
      if (key === null) {
        closePage();
        return;
      }
      openPage({ kind: 'player', key });
    },
    [closePage, openPage],
  );
  /** **The one door into a club's page** — the board's team rows, a player's
   *  head, the header search, a game's crest. */
  const openTeam = useCallback<TeamDoor>(
    (id, tab) => openPage({ kind: 'team', id, tab }),
    [openPage],
  );
  /** **The one door into a game's page** — the summary table's opponent cell,
   *  and a club's fixture and result rows. */
  const openGame = useCallback<GameDoor>(
    (gamePk) => openPage({ kind: 'game', gamePk, tab: undefined }),
    [openPage],
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
    // Only reachable with a league connected — the pill is not drawn without
    // one — but a link is read here before the status has landed, so it opens
    // and the view's own empty state says why if there is no league. The
    // alternative, silently dropping to Roster, would leave a reader who was
    // handed a link with nothing on screen to explain where it went.
    if (v === 'league') return 'league';
    // Same bargain as League, one tab over: it needs a connected league to draw
    // anything, and a link naming it is read before the ESPN status has landed.
    // It opens, and says why if there is no league behind it.
    if (v === 'matchup') return 'matchup';
    // **Three dead view names, all meaning the feed.** `games` was the
    // card-per-player page and `players` its own older name; both became the
    // feed's grouping, and the grouping has since become the player page's
    // Overview tab. The feed is where they still land: it is the same players
    // over the same days, which is the closest thing to what those links asked
    // for — and the alternative, opening a player page, needs a player, which a
    // bare `view=games` does not name. `group=player` is read only in the sense
    // that it is *ignored*: the first URL sync drops it, along with any
    // `expanded=` the same link carried, since the cards those named no longer
    // exist anywhere. That is the same courtesy `readKeys` extends to
    // pre-two-way player ids, and the safe direction for an old link to fail in.
    if (v === 'feed' || v === 'games' || v === 'players') return 'feed';
    // Summary is the default; the rest are opted into explicitly.
    return 'summary';
  });
  /* **Which reading the Roster tab returns to.** The tab covers two `view`
     values and a press on it has to mean *the page*, not one of its readings —
     so a reader who was in the stream, went to Research and came back finds the
     stream. Written during render on the same terms as `dateScopeRef` below:
     derived purely from navigation state, idempotent, and only while a roster
     reading is on screen, so a crossing leaves the last one standing. (That one
     is declared further down now, its answer depending on two toggles that are
     not in scope up here.) */
  const lastRosterView = useRef<View>('summary');
  if (isRosterView(view)) lastRosterView.current = view;
  // Demo toggle: overlay a synthetic live-day state on the loaded reports so the
  // live-only UI can be exercised when nothing is actually being played. Still
  // reachable by hand as `?sim=1`; only its settings-menu entry is hidden (see
  // SHOW_SIMULATE_TOGGLE).
  const [simulate, setSimulate] = useState<boolean>(() => initialParams.get('sim') === '1');
  /**
   * Writes to the user's own record, one at a time.
   *
   * **Everything the app saves about a person lands on one item** — the roster,
   * the watchlist, the search history, the transactions marker and every entry
   * in `UserPrefs` — so two of them in flight at once is a read-modify-write
   * race whatever the two are. The deployed backend survives it (`store.ts`'s
   * `mutate` re-reads and replays a lost update against a version-conditional
   * put); the dev file backend has no version to check.
   *
   * It was one press of ＋ that first needed this — the roster and the search
   * history, measured losing the pick on the very machine it was made on — and
   * the **settings menu** is the same shape one press further: the color
   * scheme and the two toggles sit in one popover and are pressed in sequence
   * by the same person. Driven back to back before this covered them, a theme
   * and a mute-audio press left the dev record **corrupt** and both writes
   * 502ing (see `store.ts::fileWriteDb`, which is the other half of that fix).
   *
   * A promise chain is the whole of it, and it costs nothing worth having: each
   * write is a few hundred bytes against one small item, and nothing on screen
   * is waiting for the second — the state has already moved, which is what
   * makes every one of these safe to queue rather than await.
   *
   * `then(run, run)` rather than `then(run)`: a failed write must not stop the
   * queue, or one dropped request would silently swallow every later one.
   */
  const userWrites = useRef<Promise<unknown>>(Promise.resolve());
  const queueUserWrite = useCallback(<T,>(run: () => Promise<T>): Promise<T> => {
    const next = userWrites.current.then(run, run);
    userWrites.current = next.catch(() => undefined);
    return next;
  }, []);

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
    queueUserWrite(() => api.saveHideInjured(hide)).catch((e: Error) =>
      console.error('saving hide-injured failed:', e.message),
    );
  }, [queueUserWrite]);
  /**
   * **The batter feed's lens** — which kind of play the stream draws, or whether
   * it is narrowed to the plays the reader has not marked read.
   *
   * **One lens at a time**, which the row of pills at the head of the stream
   * states by lighting exactly one of them (`FeedFilterPills`). It was six
   * chips that unioned with `New` narrowing whatever they selected, and the
   * argument for and against that is in `FeedFilters.tsx`.
   *
   * Still **two pieces of state** for one control, and deliberately: `New` is in
   * the URL under its own name, it is what the red `N new plays` button turns
   * on, and turning it *off* is what marks the stream read (as does `Clear`
   * beside that button, which marks them without turning anything on) — none of
   * which a seventh member of the key union could express. The row derives which pill is
   * lit from the pair (`feedLens`) and every press sets both (`selectFeedLens`),
   * so the two can never both be in force.
   *
   * **In the URL** (`plays=hr` and `newplays=1`), by the rule `hideil=1` and
   * `sched=` follow: each changes *which* items the view draws, so a link that
   * carries one describes a different stream.
   *
   * **Not saved as preferences**, and the line is the one every lens in this app
   * is on the far side of: a standing fact about a player (an IL stint) is as
   * true next Tuesday as today and is worth storing, where which plays you want
   * in front of you is a lens for an afternoon — a saved copy would mean a feed
   * silently narrowed to home runs a week later. So no `UserPrefs` key for
   * either, and none of the already-touched ref dance the saved toggles need.
   * The *marker* below is saved; the lens is not.
   */
  const [playFilter, setPlayFilter] = useState<PlayFilterKey | null>(() =>
    toPlayFilter(initialParams.get('plays')),
  );
  const [feedNewOnly, setFeedNewOnlyState] = useState<boolean>(
    () => initialParams.get('newplays') === '1',
  );
  /* **The stream's direction was two pieces of state and is none.**
     `feedOldestFirst` (`oldest=1`) turned this page's stream round and
     `newPlaysOldestFirst` (`noldest=1`) the new-plays page's — deliberately two,
     on the rule that a press about one page must not rearrange another, and
     deliberately two *params*, on the rule that two params must never mean two
     things. The toggle that set them is gone from the app (see
     `FeedFilters.tsx`), so both streams run newest-first, which is what a feed
     opens on. An `?oldest=1` link still opens; the param is simply not read,
     and the first URL sync drops it — the courtesy `group=player` and the
     pre-two-way ids in `readKeys` already get. */
  /**
   * **How far down the feed's stream of plays this reader has got** — epoch ms
   * of the newest play they marked read, which is what draws the red
   * `N new plays` button and what the `New` filter narrows to.
   *
   * Saved per user (`UserPrefs.seenPlays`) rather than held for the session, for
   * the reason the transactions marker is: "unread" is a claim about a *person*,
   * and a count that reset on every reload could never answer *what happened
   * since I last looked*.
   *
   * **Seeded to this boot rather than to zero**, which is the one thing the
   * transactions marker does not have to decide: a reader with no stored marker
   * has not *missed* anything, and a stream that opens on `84 new plays` is a
   * mark nobody reads. So absent means "everything already on screen is seen",
   * and the marker only reaches the record once they mark something read.
   */
  const [seenPlays, setSeenPlaysState] = useState<number>(() => Date.now());
  const seenPlaysTouched = useRef(false);
  /**
   * **The Schedule view** — the days ahead in place of the stat columns, on the
   * summary table and the research board alike. Null is off; 7 or 14 is the span.
   *
   * **One piece of state for both tables**, which is what makes it one feature
   * rather than two that resemble each other: a reader who wants the schedule
   * wants the schedule, and the two tables are one vocabulary the way `statRanks`
   * says they are. The span is shared for the same reason `researchWindow` is
   * shared across the two boards — "the next 7 days" means one thing.
   *
   * **In the URL as `sched=7` / `sched=14`**, by the rule `hideil=1` and
   * `roster=fantasy` follow: it changes *what data the view is showing*, so a
   * link that carries it describes a different table. One param rather than a
   * mode flag and a span beside it, so it can never say something meaningless:
   * a parameter that cannot describe the page it opens is a parameter that lies
   * about it.
   *
   * **Not a saved preference**, and the line is `view`'s rather than
   * `hideInjured`'s: which *reading* of your players you are on is restored by a
   * link and a reload, not by a record, and every other reading in the app
   * (`view=feed`, `kind=pitcher`) is on exactly that footing. So there is no
   * `UserPrefs` key, no route, and none of the already-touched ref dance the
   * saved toggles need.
   */
  const [scheduleSpan, setScheduleSpan] = useState<ScheduleSpan | null>(() =>
    toScheduleSpan(initialParams.get('sched')),
  );
  /**
   * **Which days this matchup period covers, and which the next one covers** —
   * the two named spans the Schedule view offers, and null with no league.
   *
   * Read once per session on a connected league, the terms the ownership map is
   * on and for the same two reasons: the answer moves once a week, and the
   * server holds the league it is derived from on its own cache, so a second
   * read would buy a wait and nothing else. **The effect is down beside that
   * map's** — `espnConnected` is declared between here and there — and what is
   * up here is the state, because the schedule index below is built from it.
   *
   * **A failed read is not an error anybody is shown.** It costs the control
   * its two named spans and leaves the two numeric ones, which is the whole of
   * what a reader with no league has always had — the direction every optional
   * league fact in this app fails in (`rosterPct` costs a column, eligibility
   * costs a chip).
   */
  /**
   * **The Roster view's projected reading** — what these players are expected to
   * do over the days in view that have not been played, added to what they have
   * already done.
   *
   * **`rproj=1` rather than `proj=1`**, which is the League page's own and means
   * a *matchup*: one param meaning two things in two views is exactly the trap
   * `lspan=` avoids by not being `win=`, and a link is read before anything on
   * screen can say which view it was written on. Both are in the URL by the same
   * rule (`hideil=1`, `sched=`, `plays=`): each changes *what the numbers are*,
   * so a link carrying one describes a different table.
   *
   * **Not a saved preference**, which is where every lens in this app parts from
   * hide-injured: an IL stint is a standing fact about a player, where which
   * figures a reader wants in front of them is a lens for an afternoon — a saved
   * copy would mean a table quietly showing next week's estimates a fortnight
   * later.
   *
   * The **read is lazy on the toggle** — it joins four league-wide boards and
   * the league's schedule against the roster, so nobody who never presses it
   * pays for it — and it needs **no fantasy league at all**: every input is a
   * board this app already holds. What a connected league adds is only the span
   * the toggle opens on.
   */
  const [rosterProjected, setRosterProjected] = useState<boolean>(
    () => initialParams.get('rproj') === '1',
  );
  const [rosterProjection, setRosterProjection] = useState<RosterProjection | null>(null);
  const [rosterProjLoading, setRosterProjLoading] = useState(false);
  /* **`beforeProjection` is gone.** It held the range the reader was on when
     they turned the lens on, so that turning it off could put them back rather
     than strand them in a future week with no stats in it. That was the right
     answer while the lens borrowed the stats table's own entry and made an
     excursion out of it; it borrows nothing now — the projected reading has an
     entry of its own (`DateScope`), so the stats table's days were never moved
     and there is nothing to move back. An excursion nobody takes needs no
     return ticket. */

  /**
   * **Which reading's range is on screen.**
   *
   * A ref, written during render, and **sticky**: Research and League draw no
   * dates at all, so crossing one of them must not swap the range out from
   * under the report. Mapping them to `summary` would spend a full
   * `/api/report` read on the way out of the Feed and another on the way back
   * in — the app's most expensive request, twice, for a range nobody is looking
   * at in between — and would flicker the roster pills and the live poll along
   * with it.
   *
   * **The order of the tests is the order the readings exclude each other in**,
   * which is not arbitrary: the Feed is a `view` and the other two are toggles
   * that only exist on the table, and Schedule and Projected clear each other
   * on press (see `scheduleControl` and `toggleRosterProjected`), so at most one
   * of the last two is ever set. Written this way round, the test never has to
   * ask what happens if both are.
   *
   * Derived purely from those three and idempotent, so any re-render
   * (StrictMode's double pass included) recomputes the same answer. It is the
   * rule the file's own `reportsRef` write already follows.
   */
  const dateScopeRef = useRef<DateScope>('summary');
  if (isRosterView(view)) {
    dateScopeRef.current =
      view === 'feed'
        ? 'feed'
        : scheduleSpan !== null
          ? 'schedule'
          : rosterProjected
            ? 'projected'
            : 'summary';
  }
  const { start, end, preset: activePreset } = ranges[dateScopeRef.current];
  /** Move the range **of the reading on screen**, which is the only one a
   *  control in the chrome can have been pressed from. The scope is read off the
   *  ref at call time rather than closed over, so this is stable and every
   *  caller — the arrows, the calendar, the URL's own re-derivation of a preset
   *  — writes the entry the reader is looking at. The one caller that must
   *  *not* go through it is the projected lens's own seed, which runs on the
   *  commit before the scope has moved: see `toggleRosterProjected`. */
  const setRange = useCallback((r: DateRange) => {
    setRanges((prev) => ({ ...prev, [dateScopeRef.current]: r }));
  }, []);
  const [matchupWindow, setMatchupWindow] = useState<MatchupWindow | null>(null);
  /** Has the question *which days is this matchup* been answered, one way or
   *  the other — the window landed, the read failed, or there is no league to
   *  ask. Read by the boot gate on the report and by the resolution effect
   *  below, both of which need "we know" rather than "we know and it's a yes". */
  const [matchupWindowSettled, setMatchupWindowSettled] = useState(false);
  /* Asked-once rather than a terminal-state guard, and safe because there is no
     cleanup: StrictMode's second pass finds the flag and returns while the
     first pass's answer still lands. The trap this codebase records (*the
     roster read hung under StrictMode*) is marking a request answered **and**
     canceling its result with a `live` flag the teardown flips. */
  const matchupWindowAsked = useRef(false);
  /** The current period's played days — see `matchupDays`. */
  const matchupSpan = useMemo(() => matchupDays(matchupWindow, today), [matchupWindow, today]);
  /**
   * The five presets plus this one, for the two roster views alone.
   *
   * **It reads last**, where the matchup page's own copy leads: there `Matchup`
   * is the reason the reader opened the page, and here `Today` is the reading a
   * manager arrives with and the app's own default. It is also the widest of
   * the named spans, so last is where the row's existing narrow-to-wide order
   * puts it — and adding at the end moves no pill anyone has already learned
   * the position of.
   *
   * **There is no `Next matchup` pill and that is a decision.** The window
   * carries one (`matchupWindow.next`) and both these tables are cut by what has
   * happened, so a span wholly in the future is a summary table of em-dashes and
   * a Feed reading `No games for these players` — a control that empties the
   * page with nothing on screen to say why, which is the one thing this app's
   * own rules forbid a filter to do. `Tomorrow` is not the counter-example it
   * looks like: it is one day, and what it is for is the Upcoming section's
   * scheduled games, where a fortnight of those is not a reading anybody wants.
   * Next week is the Schedule view's question, and that view already offers it.
   */
  const rosterPresets = useMemo<DatePreset[]>(
    () => (matchupSpan ? [...presets, { label: MATCHUP_PRESET, ...matchupSpan }] : presets),
    [presets, matchupSpan],
  );
  /**
   * **The rule re-applied when the day under it moves.** A preset is a rule and
   * not a range — the boot path says so and re-derives from the label rather
   * than reading the dates back out of the URL — and this is that same sentence
   * for a session that is never booted again: an app suspended on `Today` and
   * reopened tomorrow has to land on the new today, exactly as a reload would.
   *
   * **Every entry with a label, and only ever its own rule's days.** The four
   * readings each keep a range and each may be sitting on a different preset,
   * so `Today` and `Yesterday` both move and both move by one day. A custom
   * range is left exactly where it was, which is what makes it custom.
   *
   * **A stepped range is safe here** and that is worth naming, because it is
   * the one case that looks dangerous: the arrows only *keep* a label where the
   * days they landed on are precisely that preset's days (`stepRange`), so an
   * entry carrying a label is an entry whose days are the rule's, and rewriting
   * them from the rule can never overwrite a reader's own arithmetic.
   *
   * Fires on `rosterPresets` rather than on `today` so that the `Matchup` span
   * — whose end is clamped to today — moves with the rest. On mount, and on
   * every render where the day has not moved, every comparison matches and the
   * updater returns `prev` untouched, which is no commit at all.
   */
  useEffect(() => {
    setRanges((prev) => {
      let next: Record<DateScope, DateRange> | null = null;
      for (const scope of DATE_SCOPES) {
        const r = prev[scope];
        if (!r.preset) continue;
        const rule = rosterPresets.find((p) => p.label === r.preset);
        /* An unknown label is left alone rather than dropped: `Matchup` is one
           until the league answers, and `settleMatchup` is what resolves it. */
        if (!rule || (rule.start === r.start && rule.end === r.end)) continue;
        next = { ...(next ?? prev), [scope]: { start: rule.start, end: rule.end, preset: r.preset } };
      }
      return next ?? prev;
    });
  }, [rosterPresets]);
  /**
   * **The window's answer applied**: the flag the boot gate waits on, and the
   * resolution of a `?preset=Matchup` link, in **one** state update.
   *
   * The two have to land together and that is the whole reason this is a
   * callback rather than an effect beside the fetch. Measured with them apart —
   * the flag set in the fetch and the range resolved in an effect keyed on it —
   * the gate opened on one commit and the range moved on the next, so the report
   * effect fired **twice**, once for the placeholder day and once for the week:
   * `?start=2026-08-18&end=2026-08-18` at 26ms and `?start=2026-08-10&…` at
   * 27ms. Batched into one callback there is one read, which is what the gate
   * was for.
   *
   * **Every entry, because a link seeds every one** — the four readings of the
   * roster take the same range off a shared link and part from there, so a
   * `Matchup` link has to mean the matchup on whichever of them it is read
   * from.
   *
   * **With no span it falls back to `Today` rather than keeping the label.**
   * The two are one thing here, unlike the Schedule view's own spans, where the
   * control can mark the span it is *actually* drawing while the URL keeps what
   * it was handed: a preset's label **is** its state and is what the calendar
   * button prints, so a reader with no league would otherwise be left on a
   * button reading `Matchup` over a row with no such pill and no way back to
   * it. The URL then self-corrects to `preset=Today` on the next sync, which is
   * the honest reading of a link this reader cannot honor.
   *
   * **It only ever touches an entry still sitting on the label**, so a reader
   * who moved the dates in the second before the league answered keeps their
   * own range; and it is called once per session, the window being read once.
   */
  const settleMatchup = useCallback(
    (w: MatchupWindow | null) => {
      const span = matchupDays(w, today);
      /* `todayPreset` rather than `today`, which is the day itself now — this
         wants the *preset*, label and all, since it is what the entry falls
         back to wearing. */
      const todayPreset = presets.find((p) => p.label === 'Today');
      setMatchupWindowSettled(true);
      setRanges((prev) => {
        let next: Record<DateScope, DateRange> | null = null;
        for (const scope of DATE_SCOPES) {
          const r = prev[scope];
          if (r.preset !== MATCHUP_PRESET) continue;
          const to: DateRange | null = span
            ? { ...span, preset: MATCHUP_PRESET }
            : todayPreset
              ? { start: todayPreset.start, end: todayPreset.end, preset: todayPreset.label }
              : null;
          if (!to || (to.start === r.start && to.end === r.end && to.preset === r.preset)) continue;
          next = { ...(next ?? prev), [scope]: to };
        }
        return next ?? prev;
      });
    },
    [presets, today],
  );

  /**
   * The window itself — every club's next four weeks, read **once per session
   * and kept**, exactly as the research blob is and for the same two reasons:
   * it is one upstream shared by every user and every row (see
   * `server/src/schedule.ts`), and the server holds it for half an hour anyway,
   * so a second read on a toggle would buy a wait and nothing else.
   *
   * The client slices it to 7 or 14, so **changing the span costs no request**;
   * and because it is fetched lazily on the first entry into the mode, a reader
   * who never presses the toggle never pays for it at all.
   */
  const [scheduleWindow, setScheduleWindow] = useState<ScheduleWindow | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  /**
   * **A second surface asks for the same window.** The matchup page's team
   * pages carry the Schedule view too, and its data takes no parameters at all
   * — one window for every club, sliced per reader — so the two share this one
   * read rather than each making it. The flag is what lets that page ask
   * without owning the span this one is on.
   */
  const [scheduleWanted, setScheduleWanted] = useState(false);
  const needSchedule = useCallback(() => setScheduleWanted(true), []);

  /**
   * **Every ballpark's park factors** — the team page's Park tab and the strip a
   * game preview draws, held once here and shared through
   * `ParkFactorsContext`.
   *
   * `needSchedule`'s own shape, and for the same two reasons. It takes **no
   * parameters** — one table answers for every club, every fixture and the
   * neutral sites nobody is at home in — so several surfaces asking is one
   * request; and it is **lazy**, so a session that opens no team page and
   * previews no game never pays for it. The readers are leaves three and four
   * components down inside dialogs, which is what makes it a context rather
   * than a prop (see `hooks.ts`).
   */
  const [parkFactors, setParkFactors] = useState<Map<number, ParkFactor> | null>(null);
  const [parksLoading, setParksLoading] = useState(false);
  const [parksError, setParksError] = useState<string | null>(null);
  const [parksWanted, setParksWanted] = useState(false);
  const needParkFactors = useCallback(() => setParksWanted(true), []);
  useEffect(() => {
    if (!parksWanted || parkFactors) return;
    let canceled = false;
    setParksLoading(true);
    setParksError(null);
    api
      .parkFactors()
      .then((pf) => {
        if (canceled) return;
        setParkFactors(new Map(pf.parks.map((p) => [p.venueId, p])));
      })
      .catch((e: Error) => {
        if (!canceled) {
          setParksError(e.message);
          // A failed read may be asked for again — the next surface that wants
          // a park sets the flag and this effect runs. Nothing retries on its
          // own, which is rule 1: this is a garnish, not the page.
          setParksWanted(false);
        }
      })
      .finally(() => {
        if (!canceled) setParksLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [parksWanted, parkFactors]);
  /** The one object the context carries, memoized so every leaf reading it does
   *  not re-render on an unrelated render of `App`. */
  const parkRead = useMemo(
    () => ({ byVenue: parkFactors, loading: parksLoading, error: parksError, need: needParkFactors }),
    [parkFactors, parksLoading, parksError, needParkFactors],
  );
  useEffect(() => {
    if ((scheduleSpan === null && !scheduleWanted) || scheduleWindow) return;
    let canceled = false;
    setScheduleLoading(true);
    setScheduleError(null);
    api
      .schedule()
      .then((w) => {
        if (!canceled) setScheduleWindow(w);
      })
      .catch((e: Error) => {
        if (!canceled) setScheduleError(e.message);
      })
      .finally(() => {
        if (!canceled) setScheduleLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [scheduleSpan, scheduleWanted, scheduleWindow]);
  /**
   * **The window re-read when the day beneath it moves**, and only then. Its
   * every row is *days ahead of today* — the server derives the four weeks from
   * its own clock — so a window read yesterday and kept is a Schedule view
   * whose first column is a game that has already been played. Nothing else
   * about it goes stale inside a session, which is why the read above is a
   * once-and-keep and this is the only thing that undoes it.
   *
   * **Overwritten rather than dropped**, which the effect above cannot do (it
   * returns early on a window it already holds): the presence of this window
   * *is* the Schedule mode, so clearing it while somebody is in that mode would
   * put the stat columns back under them for as long as the read took. No wait
   * goes up and a failure leaves the day-old window standing — rule 1, for a
   * read nobody asked for.
   */
  const refreshSchedule = useCallback(() => {
    if (!scheduleWindow) return;
    api
      .schedule()
      .then(setScheduleWindow)
      .catch((e: Error) => console.error('re-reading the schedule window failed:', e.message));
  }, [scheduleWindow]);
  /**
   * The window indexed by club and day, or null while the mode is off or the
   * read is still out.
   *
   * **The mode is the presence of this rather than a flag beside it**, which is
   * what makes "in schedule mode with no schedule" impossible to draw: both
   * tables go on showing their stat columns until it lands, which is rule 1 of
   * the app's loading system (nothing blanks while a read is in flight), and
   * the only mark the press leaves is the ball inside the toggle it started
   * from.
   */
  /**
   * The season roster reduced to what naming a pitcher takes — his name and the
   * arm he throws with — which is what lets a schedule cell say who the other
   * club is starting.
   *
   * **It costs no request.** That list is held from boot for the header search
   * (~1,400 rows), so this is a `Map` over something already in hand rather than
   * a second source; a two-way player is two rows under one id carrying the same
   * `throws`, so the first wins and the second is the same answer. A pitcher the
   * list has never heard of resolves to `undefined` and the cell draws nothing,
   * which is the direction every join in this app fails in.
   */
  const pitcherLookup = useMemo(() => {
    const by = new Map<number, { name: string; throws: string | null }>();
    for (const p of seasonPlayers) if (!by.has(p.id)) by.set(p.id, { name: p.name, throws: p.throws });
    return (id: number) => by.get(id);
  }, [seasonPlayers]);
  /**
   * **The grid waits for the season roster as well as for the window**, and
   * `playersLoading` is that wait *settled* rather than succeeded — it starts
   * true and is cleared in the read's `finally`, so a list that fails settles it
   * too and the grid draws with no names rather than never drawing at all. The
   * rule `initialLoadSettled` already follows for the view tabs.
   *
   * It is here because a cell's **height** depends on that list: a day naming
   * the opposing starter is a line taller than one that cannot, so a grid drawn
   * before the names land and again after would grow under the reader — which on
   * a pitcher's row is 6px a start day. Measured on a `?sched=` deep link, where
   * both reads go out together: `/api/schedule` finished **3ms before**
   * `/api/players`, so the two-paint window is real rather than theoretical, and
   * on a cold list it is however long 207KB takes.
   *
   * It costs the ordinary path nothing — the toggle is pressed long after boot,
   * by which time this is already settled — and it keeps rule 1 intact: with the
   * index null both tables go on drawing their stat columns rather than blanking.
   */
  const scheduleIndex = useMemo(
    () =>
      scheduleSpan !== null && scheduleWindow && !playersLoading
        ? buildScheduleIndex(scheduleWindow, scheduleSpan, matchupWindow, pitcherLookup)
        : null,
    [scheduleSpan, scheduleWindow, matchupWindow, pitcherLookup, playersLoading],
  );
  // Does the range on screen contain today at all — which is what anything
  // asking a question *about* today has to be gated on. Over "Yesterday" or a
  // custom week in July there is no answer to be had, and a mark drawn on one
  // anyway would be a claim about a day nobody is looking at. The same
  // reasoning hides the date row on the research board, which has nothing dated
  // to act on.
  const rangeHasToday = useMemo(
    () => start <= today && today <= end,
    [start, end, today],
  );

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
    queueUserWrite(() => api.saveMuteAudio(mute)).catch((e: Error) =>
      console.error('saving mute-audio failed:', e.message),
    );
  }, [queueUserWrite]);
  /**
   * **The color scheme.** Saved per user like the two toggles above and, like
   * them, deliberately **not in the URL**: it is a fact about this person and
   * this room rather than about the view a link describes — the line `muteAudio`
   * is on, and one step further from the data than `hideil=1`, which is in the
   * URL precisely because it changes which players a view reports on.
   *
   * It is the one preference in the app that is *also* mirrored into
   * localStorage, and `theme.ts` argues why: the server's answer arrives a round
   * trip after the page has painted, so without a local copy every load would
   * open on one palette and change to the other in front of the reader. The
   * mirror is a paint-ahead cache and the record is the source of truth — which
   * is what makes the choice follow them to another device.
   *
   * Seeded from the mirror rather than from the default, so the first React
   * render agrees with what `index.html`'s boot script has already painted.
   */
  const [theme, setThemeState] = useState<ThemeId>(() => readStoredTheme() ?? DEFAULT_THEME);
  const themeTouched = useRef(false);
  const setTheme = useCallback((next: ThemeId) => {
    themeTouched.current = true;
    setThemeState(next);
    storeTheme(next);
    // Through `queueUserWrite`, like every other write to this item: the
    // scheme is picked in the same popover as the two toggles above, so two
    // presses a moment apart are two writes to one record. `null` is "back to
    // the default", which the server stores as the absence of the entry.
    queueUserWrite(() => api.saveTheme(next === DEFAULT_THEME ? null : next)).catch(
      (e: Error) => console.error('saving theme failed:', e.message),
    );
  }, [queueUserWrite]);
  // The one line that puts a palette on the page. A layout effect so the
  // attribute is stamped before the browser paints the commit that changed it,
  // and idempotent, so re-running it costs nothing.
  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);
  /**
   * **Draw a percentile rank under every value** on the research board and on
   * the player page's Stats tab — one flag for both, because they are one
   * vocabulary and this is a habit of reading rather than a setting on a table.
   * See `columnRanks.tsx` for what a badge is ranked against.
   *
   * Saved per user and deliberately **not in the URL**, which is a line worth
   * drawing carefully, since `cols=` *is* in the URL and is also presentation.
   * The difference is what the two change: a column list decides **which
   * numbers are on the page**, so a link that leaves it out is a link about a
   * different table, where this leaves every number exactly where it was and
   * adds a second reading of each. That is a fact about the reader rather than
   * about the board — the line `muteAudio` is on — and there is then no param
   * for the saved value to have to defend itself against, which is why the
   * `Touched` ref below is the whole of the reconciliation.
   */
  const [showRanks, setShowRanksState] = useState(false);
  const showRanksTouched = useRef(false);
  const setShowRanks = useCallback((on: boolean) => {
    showRanksTouched.current = true;
    setShowRanksState(on);
    queueUserWrite(() => api.saveStatRanks(on)).catch((e: Error) =>
      console.error('saving stat-ranks failed:', e.message),
    );
  }, [queueUserWrite]);

  /**
   * The players most recently picked out of the header search, newest first —
   * what that field offers before anything is typed. Player keys, so a row is
   * resolved against the season roster the search is already holding rather
   * than out of a saved copy of a name and a club that could go stale (see
   * `UserPrefs.recentPlayers`).
   *
   * Saved per user and deliberately **not** in the URL: it is a history of what
   * this person has looked up, which says nothing about the view a link
   * describes — the same line `muteAudio` is on, one step further from the
   * data.
   */
  const [recentPlayers, setRecentPlayers] = useState<string[]>([]);
  /**
   * One pick, recorded. The list moves **here first** so the menu is right on
   * the next render, and the write goes out with the one key rather than the
   * whole list — the server owns the push-to-front and the cap, which is what
   * makes a second tab's picks safe (see `store.ts::setRecentPlayer`). A key
   * already in the list moves to the front rather than doubling, on both sides
   * of the wire and by the same arithmetic.
   *
   * No touched-ref here, unlike the two toggles: the boot read **merges**
   * rather than replaces (below), so a pick made in the second before the
   * preferences land keeps its place at the front and the saved four fill in
   * under it, which is exactly what the server will have stored anyway.
   */
  const recordRecentPlayer = useCallback(
    (key: string) => {
      setRecentPlayers((cur) => [key, ...cur.filter((k) => k !== key)].slice(0, RECENT_PLAYERS));
      queueUserWrite(() => api.saveRecentPlayer(key)).catch((e: Error) =>
        console.error('saving recent player failed:', e.message),
      );
    },
    [queueUserWrite],
  );
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
  /** Did this load arrive asking for the fantasy week? The one thing that has
   *  to wait for the league before the report is read — see the gate on
   *  `loadReport` and the effect that resolves it. */
  const matchupFromUrl = initialParams.get('preset') === MATCHUP_PRESET;
  /**
   * Has this user **stated** which list they want — either by working the
   * toggle in this session, or by having an answer in their record?
   *
   * The touched-ref every preference here carries, widened by one thing:
   * `rosterSource` is the one entry stored for *both* of its values, so the
   * presence of the key is itself a statement and this ref reports it. What
   * reads it is the first-team-pick switch below, which fills in an
   * **unspecified** preference and must never overwrite an answered one — the
   * distinction absence-means-default cannot make on its own.
   */
  const rosterSourceStated = useRef(false);
  const setRosterSource = useCallback((next: RosterSource) => {
    rosterSourceStated.current = true;
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
   * The **player page's Stats tab** columns, per kind, and its own entry rather
   * than a share of the board's above.
   *
   * The obvious economy is to have one saved set — the same vocabulary, the
   * same picker, and a reader who wants xwOBA probably wants it in both places.
   * What decides against it is that the two tables do not offer the same
   * columns: the Stats tab cuts `Opp`, `Ros%` and the five trend columns (see
   * `PlayerWindowTable.tsx`), so a write from the player page would hand the
   * board a list with those six missing and **silently drop them from a set the
   * reader never touched** — exactly the hazard `ColumnPicker`'s reorder threads
   * around inside one table. They are also read for different things: a board is
   * scanned across six hundred names, a player page down five spans of one man.
   *
   * It is held here rather than in `PlayerDetails` because that component is
   * unmounted every time the overlay closes, which would make the preference
   * a per-open thing and re-read it on every player. **Not in the URL**: `cols=`
   * names the board `pos=` selects, and putting a second meaning on it would be
   * two tables reading one param; the open player-page tab is in no URL either.
   */
  const [statsCols, setStatsCols] = useState<Partial<Record<PlayerKind, string[]>>>({});

  /**
   * **Which cut of his spans the Stats tab is showing** — `cut=vsr|vsl|home|away`,
   * absent for all of them.
   *
   * In the URL where `cols=` is deliberately not, and the difference is the one
   * the rule actually draws: `cols=` is *how* a table is read, and this is
   * **which data it shows** — five rows of one man against left-handers are not
   * the same five rows. It is its own param name and means one thing: the
   * Splits tab beside it is a different reading with no parameter at all, and
   * `mup`/`mt`/`proj` are the precedent for keeping two lenses from sharing a
   * key.
   *
   * Held here rather than in `PlayerDetails` for the reason `statsCols` is: that
   * component is unmounted the moment the overlay closes, and a param the URL
   * carries has to outlive it — a link with `cut=vsl` seeds this, and the page
   * opens on the cut it names when the reader reaches the Stats tab.
   *
   * An unrecognized value falls back to the uncut table rather than emptying it,
   * on the client and on the server both.
   */
  const [statsCut, setStatsCut] = useState<SplitCut | null>(
    () => SPLIT_CUTS.find((c) => c === initialParams.get('cut')) ?? null,
  );
  /**
   * **And it is put away when the page it was made on leaves the screen**, which
   * is the app's standing rule for a lens: a cut is a question about *this* man,
   * so the next page opens on his whole season unless a link says otherwise.
   *
   * Closing the player page is a leaving; opening another player **over** it is
   * not (`player=` is the precedent this rule states outright), so a reader who
   * walks from one man's left-handed line to the next keeps the question they
   * are asking. It watches `detailsKey`, which is navigation seeded from the
   * URL and never fetched data, so an inbound `?player=…&cut=vsl` is already on
   * its own surface before this runs.
   */
  useEffect(() => {
    if (!detailsKey) setStatsCut(null);
  }, [detailsKey]);

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
  /**
   * Has `/api/prefs` answered — read or failed.
   *
   * One entry in it decides **which roster the report is about**, and it is the
   * one preference that costs a request rather than a re-render, so the first
   * report has to wait for it. See the report effect below, where the whole of
   * that is argued.
   */
  const [prefsSettled, setPrefsSettled] = useState(false);
  // The user's saved columns, fetched once. Applied only to boards the URL
  // didn't already speak for, and only where the user hasn't already changed
  // something in the seconds before this landed.
  useEffect(() => {
    let canceled = false;
    api
      .prefs()
      .then((prefs) => {
        if (canceled) return;
        if (!hideInjuredTouched.current && !hideInjuredFromUrl && prefs.hideInjured) {
          setHideInjuredState(true);
        }
        // No URL param to reconcile against — the saved value is the only
        // source there is, so it applies unless the user has already spoken.
        if (!muteAudioTouched.current && prefs.muteAudio) setMuteAudioState(true);
        if (!showRanksTouched.current && prefs.statRanks) setShowRanksState(true);
        // The record is the source of truth and the localStorage mirror is
        // only a paint-ahead cache, so what lands here wins — and is written
        // back, which is how a theme picked on one device reaches this one.
        if (!themeTouched.current) {
          const saved = toThemeId(prefs.theme);
          setThemeState(saved);
          storeTheme(saved);
        }
        // Merged rather than applied, which is why this needs no touched ref:
        // anyone picked in the second before this landed leads, and the saved
        // list fills in under him — which is the same list the server has
        // stored by then, since its own write pushed that key onto the front of
        // these very keys.
        if (prefs.recentPlayers?.length) {
          setRecentPlayers((cur) =>
            [...cur, ...prefs.recentPlayers!.filter((k) => !cur.includes(k))].slice(
              0,
              RECENT_PLAYERS,
            ),
          );
        }
        // The transactions read-marker is merged on the same rule and for the
        // same reason one step sharper: a reader who opened that tab in the
        // second before this landed has already marked the feed read here *and*
        // on the server, so a saved marker that is older must not put the dot
        // back. Whichever is newer **for the same league** wins, which is
        // exactly the rule the server applies to the write itself.
        if (prefs.seenTransactions) {
          const saved = prefs.seenTransactions;
          setSeenTx((cur) =>
            cur && cur.leagueId === saved.leagueId && cur.ts >= saved.ts ? cur : saved,
          );
        }
        // The feed's own read-marker, and it is applied on the **touched** rule
        // rather than on "whichever is newer" — which is where it parts from the
        // marker above and why. This one is seeded to *this boot* rather than to
        // zero (a reader with no stored marker has missed nothing, and a stream
        // that opens on `84 new plays` is a mark nobody reads), so a saved value
        // is nearly always the *older* of the two and taking the newer would
        // discard it on every load. Absent, therefore, it is the saved value that
        // wins — and a reader who has already marked something read in the second
        // before this landed keeps their own, which is the `hideInjuredTouched`
        // dance and is what stops a saved marker un-reading what they just read.
        if (prefs.seenPlays !== undefined && !seenPlaysTouched.current) {
          setSeenPlaysState(prefs.seenPlays);
        }
        // Same rule as hide-injured: the URL can only ever say `fantasy`, so
        // silence there is unspecified rather than "watchlist", which is what
        // lets the saved value fill it in.
        if (
          !rosterSourceStated.current &&
          !rosterSourceFromUrl &&
          prefs.rosterSource === 'fantasy'
        ) {
          setRosterSourceState('fantasy');
        }
        // ...and whichever of the two values it holds, the *presence* of the
        // entry is this user having answered the question, which is what keeps
        // the first-team-pick switch off their record. Deliberately after the
        // branch above rather than before it: set first, a stored `fantasy`
        // would read as "already stated" and never be applied.
        if (prefs.rosterSource) rosterSourceStated.current = true;
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
        // The Stats tab's own set. No URL to defend it against — see the state
        // above — so it is a plain "fill in what hasn't been touched", and it is
        // narrowed to that table's vocabulary on the way in exactly as the
        // board's is, which is what makes a `Ros%` in a crossed record harmless.
        setStatsCols((prev) => {
          const next = { ...prev };
          for (const kind of ['batter', 'pitcher'] as const) {
            if (next[kind]) continue;
            const saved = toStatsColumnKeys(kind, prefs.statsColumns?.[kind]);
            if (saved) next[kind] = saved;
          }
          return next;
        });
      })
      // A preference is not worth an error banner over: the board opens on its
      // defaults, which is exactly what a user with nothing saved gets.
      .catch((e: Error) => console.error('preferences unavailable:', e.message))
      // Settled either way, and a failed read has to settle it too — the first
      // report waits on this, and a preference that isn't coming must not hold
      // the page for ever. The same rule `espnStatusSettled` follows, and for
      // the same reason one question earlier.
      .finally(() => {
        if (!canceled) setPrefsSettled(true);
      });
    return () => {
      canceled = true;
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

  /**
   * The Stats tab's write, debounced on the same 600ms and for the same reason
   * the board's is: turning a group on is one intent and a dozen state changes,
   * each of which would otherwise be its own read/modify/write against the
   * user's item. Its own timer, since the two sets are two entries and a shared
   * one would let a board edit swallow a player-page edit made half a second
   * later.
   */
  const saveStatsColsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (saveStatsColsTimer.current) clearTimeout(saveStatsColsTimer.current);
  }, []);
  const setStatsColumns = useCallback((kind: PlayerKind, keys: string[] | null) => {
    setStatsCols((prev) => {
      const next = { ...prev };
      if (keys) next[kind] = keys;
      else delete next[kind];
      return next;
    });
    if (saveStatsColsTimer.current) clearTimeout(saveStatsColsTimer.current);
    saveStatsColsTimer.current = setTimeout(() => {
      api
        .saveStatsColumns(kind, keys)
        // A preference is not worth an error banner over: the tab opens on its
        // defaults, which is what a user with nothing saved already sees.
        .catch((e: Error) => console.error('saving stats columns failed:', e.message));
    }, 600);
  }, []);

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
  /**
   * **Which reading of the research board is on screen** — six hundred players,
   * or thirty clubs.
   *
   * In the URL as `board=teams`, and up here with `pos`, `win`, `inc` and
   * `cols` for the reason all four are: it decides what the table is a table
   * *of*, which is the definition of a thing a link has to carry. Its own
   * param rather than a value smuggled into `pos=`, because `pos=` already
   * means one thing (which position, and so which board) and two params must
   * never mean two things.
   *
   * `board=players` is the default and is never written; **anything
   * unrecognized falls back to it** rather than emptying the view, the rule
   * `toResearchPos` and `toResearchWindow` already follow — and the URL keeps
   * whatever it was handed.
   */
  const [researchTeams, setResearchTeams] = useState(
    () => initialParams.get('board') === 'teams',
  );
  // Keyed by board **and** window: each is its own fetch and its own megabyte,
  // and both are kept, so flipping back to a window already read is instant.
  // The team reading takes the same map with `team-` on the front of the key —
  // thirty rows against six hundred, off a different route, so it is a
  // different board in the sense this key means.
  const [research, setResearch] = useState<Record<string, ResearchRow[]>>({});
  const researchCacheKey = `${researchTeams ? 'team-' : ''}${researchKind}:${researchWindow}`;
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
   * **Which days the research board's `Starting` filter is set to** — the one
   * control on that board that selects on the schedule ahead rather than on the
   * season behind, and the way a manager streams a start: pick Friday, and the
   * board is the pitchers due to start on Friday with every stat column beside
   * them.
   *
   * **In the URL as `turn=`**, by the rule `win=`, `pos=` and `inc=` follow: it
   * decides which players are in the table, so a link that leaves it out
   * describes a different board. The param is `turn=` rather than `starts=`
   * because the date bar's own params are `start=` and `end=` — see
   * `toTurnRange`, which carries that argument and the format.
   *
   * **The dates are absolute, and that is honest here where a date preset's
   * would not be.** A preset is a *rule* about the recipient's own today, which
   * is why the bar carries its label; `Starting Fri 8/28` is a fact about the
   * schedule, exactly as the League page's `lwk=` is a fact about the league's
   * calendar. What a link cannot promise is that those days are still ahead
   * when it is opened, and that is what `clampTurnRange` is for.
   *
   * Up here with the rest of the board's cross-cutting controls because
   * `ResearchTable` is unmounted the moment the view changes, and because the
   * URL has to be written from one place.
   */
  const [turnDays, setTurnDays] = useState<TurnDays | null>(() =>
    toTurnDays(initialParams.get('turn')),
  );
  /**
   * **When the window is wanted for the turn filter** — a range in force, *or*
   * the day strip open with nothing picked yet.
   *
   * The second half is not a nicety: the strip **is** the window's days, so
   * gated on the range alone the control could never be used at all — a reader
   * with nothing picked would open an empty panel and have nothing to press to
   * pick anything. It is the same shape the Schedule toggle has, where pressing
   * the mode on is what asks for the read.
   *
   * Scoped to the board that draws it: the panel's open flag is one of
   * `ResearchUi`'s and survives a crossing to the Roster tab, where a window
   * read for a control that is not on screen is a request nobody asked for.
   */
  const turnWanted = view === 'research' && (turnDays !== null || researchUi.panels.turns);
  /**
   * **The same window over every day it has**, which is what the research
   * board's turn filter reads — see `buildWindowIndex`.
   *
   * A second index rather than the one above because the two answer different
   * questions: that one is cut to the span the grid is drawing, and this filter
   * must be able to name a day beyond it (a link to next Tuesday opened by a
   * reader on `Next 7`, or with the Schedule view off altogether). Built only
   * while the filter is on, so a reader who never presses `Starting` pays
   * nothing for it.
   *
   * **It carries the pitcher lookup, and that was not free to skip.** The
   * argument buys `buildStarters` — the club derivation and the 750 game-sides
   * behind it — and the `Start` column itself never draws the other club's man,
   * so the first version left it out. What needs it is the **dialog that column
   * opens**: `SchedulePreview` reads `opposingStarter` off the index it is
   * handed, so an index built without the lookup opens a preview that cannot
   * name the man on the mound, which is the half of it a reader opened it for.
   *
   * So it takes `playersLoading` in its gate as the grid's index does, and for
   * a related reason rather than the same one: there it is the *height* of a
   * cell that depends on the names, here it is whether a dialog can answer at
   * all.
   */
  const turnIndex = useMemo(
    () =>
      turnWanted && scheduleWindow && !playersLoading
        ? buildTurnIndex(scheduleWindow, pitcherLookup)
        : null,
    [turnWanted, scheduleWindow, pitcherLookup, playersLoading],
  );
  /** The turn filter asks for the window the way the matchup page's team pages
   *  do — through the flag, rather than by owning the span the Schedule view is
   *  on. See `scheduleWanted`. */
  useEffect(() => {
    if (turnWanted) needSchedule();
  }, [turnWanted, needSchedule]);
  /**
   * **The days cut to the window, once the window is there to cut them to.**
   *
   * A link naming Friday is opened the following Tuesday, and the schedule this
   * app reads starts at today and never looks back — so the days it names may
   * be behind the window's first. Clamped where they overlap it and dropped
   * where they do not, which is the falls-back-rather-than-empties rule: a
   * filter selecting on days the board can say nothing about is one that empties
   * it in silence. `clampTurnRange` returns the range it was handed when there
   * is nothing to change, so this settles in one pass.
   */
  useEffect(() => {
    if (!turnDays || !turnIndex) return;
    const cut = clampTurnDays(turnDays, turnIndex);
    if (cut !== turnDays) setTurnDays(cut);
  }, [turnDays, turnIndex]);

  // The how-to page (settings menu → How to use, and the empty state's button).
  // In the URL like every other view, so it survives a reload and can be linked
  // to — which is the only way to hand someone the guide directly.
  const [helpOpen, setHelpOpen] = useState<boolean>(() => initialParams.get('help') === '1');

  // ---- ESPN fantasy league ----
  // The connection status is read once on boot, next to the preferences: it
  // decides whether the research board offers its Free Agents pill, which is a
  // thing the first render would otherwise get wrong and then correct.
  // Deliberately not in the URL — a connection is an account fact, not a view.
  // The league scoreboard, and which matchup period is being looked at.
  // `null` is "the one being played", which is a **rule rather than a value**:
  // the same reasoning that keeps a date preset in the URL as its label rather
  // than as two dates, so a link saved this week opens on next week's matchup
  // rather than on a frozen one.
  const [scoreboard, setScoreboard] = useState<EspnScoreboard | null>(null);
  const [scoreboardLoading, setScoreboardLoading] = useState(false);
  const [scoreboardError, setScoreboardError] = useState<string | null>(null);
  /**
   * **Where this period's matchups are heading** — the Scoreboard's `Projected`
   * toggle, and the projection it swaps its figures for.
   *
   * **In the URL as `proj=1`**, by the rule `hideil=1`, `sched=` and `plays=`
   * follow: it changes *what the numbers are*, so a link that
   * carries it describes a different board — and "here is where this week is
   * going" is a thing a leaguemate is worth sending.
   *
   * **Not a saved preference.** Which figures you want in front of you is a lens
   * for an afternoon, where a preference is a standing fact about the reader,
   * and a saved copy would mean a board silently showing projections a
   * fortnight later. So there is no
   * `UserPrefs` key and none of the already-touched ref dance the saved toggles
   * need.
   *
   * The **read** is lazy on the toggle rather than on the view (see its effect):
   * it joins four league-wide boards against every roster in the league, and
   * nobody who never presses it should pay for it.
   *
   * **And it goes off with the page it was pressed on** — see the effect down
   * beside the roster lens's, *The two League lenses go away with their pages*.
   * A link carrying it still opens projected; what it may not do is outlive the
   * matchup page and dash the next card the reader opens.
   */
  const [projected, setProjected] = useState<boolean>(
    () => initialParams.get('proj') === '1',
  );
  const [projection, setProjection] = useState<EspnProjection | null>(null);
  /**
   * **The projection is being read**, which is what the mark inside the button
   * that started it is drawn from.
   *
   * There was none, and the read is the slowest press on this page — 386–715ms
   * with the four boards warm and seconds without them — so the toggle sat
   * inert for the whole of it while the card behind went on drawing the live
   * figures ("it looks like nothing happens for a second", reported). That the
   * card holds still is rule 1 and is right; what was missing is the other half
   * of it, which is that a press must leave a trace *somewhere*, and inside the
   * control is the only place it may go.
   *
   * **No `MIN_SPIN` floor**, and that is a decision rather than an omission.
   * That constant is a floor on how long a mark stays up once a press has put
   * it there, and it earns its keep on `Refresh from ESPN`, whose result is a
   * change in a page behind a popover that may look identical — so without a
   * floor a warm press leaves no evidence at all. Here the result *is* the
   * evidence: every figure on the card changes at once, which is the loudest
   * confirmation this page can give, and a floor would only hold the answer
   * back from a reader who already has it.
   */
  const [projLoading, setProjLoading] = useState(false);
  const [matchupPeriod, setMatchupPeriod] = useState<number | null>(() => {
    const raw = initialParams.get('mp');
    return raw && /^\d{1,3}$/.test(raw) ? Number(raw) : null;
  });

  const showScoreboardWait = useDelayedFlag(scoreboardLoading);

  /**
   * Which of the League page's four tabs is open, which matchup the Matchup tab
   * is on, and — for the Rankings tab — which span it is cut on.
   *
   * **All three are in the URL because all three decide what data is on
   * screen**, the rule `view=`, `win=` and `mp=` follow. `lt=` is the tab
   * (**Matchup** is the default and is omitted, the app's own convention being
   * that the first tab is the one you land on — so a bare `?view=league` opens
   * on the reader's own matchup and `lt=scoreboard` is written out like every
   * other tab), `mup=` is which matchup, `mt=` which page *of* it, and
   * `lspan=` the span. `mr=` is which reading of a team page — see it below.
   * None can collide: the app's other params are `preset`, `start`, `end`,
   * `player`, `expanded`, `view`, `kind`, `sim`, `hideil`, `sched`, `roster`,
   * `pos`, `cols`, `inc`, `scope`, `watch`, `win`, `help`, `mp`, `league`,
   * `plays`, `newplays`, `oldest`, `noldest`, `proj` and `rproj`. (The last
   * seven were missing from this list while it still claimed to be the whole
   * of it — a list that is checked by reading it has to be complete or it
   * checks nothing.)
   *
   * **`mup=` is absent for the reader's own matchup**, which is a *rule* rather
   * than a value — the same reasoning that keeps a date preset in the URL as
   * its label: a link shared without one opens on the recipient's own matchup
   * rather than on the sender's.
   *
   * `lspan=` is deliberately **not** `win=`, which is the research board's own
   * window and means five different spans of a different thing; one param
   * meaning two things in two views is exactly the trap `cols=` avoids by
   * being scoped to the board `pos=` names.
   */
  const [leagueTab, setLeagueTab] = useState<LeagueTab>(() => {
    const raw = initialParams.get('lt');
    // `matchup` was a fourth tab for a while and is a **page over this view**
    // now, opened from the card that names it. An older link naming it reads as
    // the board that matchup was always a row of — and its `mup=` still opens
    // the page, so the link lands where it meant to.
    return raw === 'rankings' || raw === 'transactions' ? raw : 'scoreboard';
  });
  const [matchupId, setMatchupId] = useState<number | null>(() => {
    const raw = Number(initialParams.get('mup'));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  });
  /**
   * **Which page of that matchup is open**, named by the team whose page it is
   * rather than by `away`/`home` — because a team id is what every caller
   * actually knows. A Rankings row knows the team it is, a scoreboard card
   * knows the pair; neither knows which side of the pair a manager is, and the
   * page resolves that off the board it already holds.
   *
   * Absent means **Summary**, which is the middle page and the one a matchup
   * opened from the scoreboard lands on. Present means a manager's own roster
   * and feed, which is what a press on the Rankings tab asks for.
   *
   * It is a **running record rather than an opening**: the page reports its
   * side back up here as the reader crosses the strip (`onSideTeam`), so the
   * link always describes the page in front of them — the rule every other
   * param on this view follows. `mt` because `mp` is the period and `mup` the
   * matchup; none of the app's other params can collide with it.
   */
  const [matchupTeam, setMatchupTeam] = useState<number | null>(() => {
    const raw = Number(initialParams.get('mt'));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  });
  /**
   * **Which reading of that team page is open** — his table over days the
   * reader picks (`roster`), his table over this matchup so far (`summary`), or
   * his stream (`feed`).
   *
   * **In the URL because it decides which data is on screen**, which is the
   * test `view=`, `win=`, `mp=` and `mt=` all pass and the reason a sort order
   * is not a page. `summary` is the half that makes it more than a preference:
   * it is a *span* the page derives — the matchup's own days, clamped to today
   * — so a link that dropped it would open on whatever range the recipient's
   * own default seeded and quietly answer a different question.
   *
   * **`mr` because `mp` is the period, `mup` the matchup and `mt` the page of
   * it**; none of the app's other params can collide with it, and it is
   * deliberately not reused by anything else — `view=` is the app's own four
   * and one param meaning two readings in two places is the trap `lspan=`
   * avoids by not being `win=`.
   *
   * **`roster` is the default and is omitted**, the app's standing convention
   * that the first tab is the one you land on. And it is written only alongside
   * `mt=`: the matchup's Summary page has no reading to be in, so an `mr=` with
   * no team page to be a reading *of* would say nothing.
   *
   * A running record rather than an opening, like `mt=` above: the page reports
   * the reading back as the reader crosses the switch.
   */
  const [matchupReading, setMatchupReading] = useState<MatchupReading>(() => {
    const raw = initialParams.get('mr');
    // An unrecognized value falls back rather than emptying the view, and the
    // URL keeps what it was handed until the page reports its own reading up.
    return raw === 'summary' || raw === 'feed' ? raw : 'roster';
  });

  /**
   * **A matchup page is on screen**, reached either way.
   *
   * There are two doors into one page — a card on the Scoreboard, which opens
   * it *over* the League view (`mup=`), and the `Matchup` tab, which is that
   * page as a page. Everything that is a fact about the page rather than about
   * the door has to test both: which side of it is open (`mt=`), which reading
   * of that side (`mr=`), the projected lens (`proj=1`) and the read behind it.
   * Written once, because two copies of this test are two copies that will one
   * day disagree about whether the lens is drawn.
   */
  const matchupPageOpen = view === 'matchup' || (view === 'league' && matchupId != null);
  /**
   * **A surface that draws the projected lens is on screen**, which is now two
   * of them: the matchup page above, and the League's **Scoreboard** tab, whose
   * `Projected` button is back after having been taken away.
   *
   * The reversal is argued where the board draws it (`LeagueView`'s
   * `Scoreboard`); what matters here is that `proj=1` has two surfaces to be
   * about, so the three places that test it — the URL, the read, and the rule
   * that puts a lens away when its page leaves — test the pair rather than one
   * of them. Written once for the reason `matchupPageOpen` is written once.
   *
   * **Navigation state alone, never fetched data.** Whether the board can *act*
   * on the lens is a fact about the week (`boardProjectable`) and decides only
   * whether the button is drawn; putting it in here would mean a `?proj=1` link
   * had its param stripped and its lens switched off in the frame before the
   * board landed.
   */
  const projLensPage =
    matchupPageOpen || (view === 'league' && leagueTab === 'scoreboard');
  const [rankSpan, setRankSpan] = useState<EspnRankSpan>(() => {
    const raw = initialParams.get('lspan');
    // **`matchup` is the default**, which is the week a manager opens this tab
    // in the middle of — the season line is the context for that rather than
    // the question. A league with no matchup period does not offer it, and the
    // server answers such a reader with the span that *does* lead its list, so
    // this default can never draw an empty table.
    return raw === 'season' ||
      raw === 'matchup' ||
      raw === 'first' ||
      raw === 'second' ||
      raw === 'playoffs'
      ? raw
      : 'matchup';
  });

  /**
   * **Which week of the league's own calendar the Rankings table is of**, where
   * the reader has picked one off the tab's bar — and null where the table is
   * one of the five named spans instead.
   *
   * **In the URL as `lwk=`**, by the rule `lspan=` follows one line up: it
   * decides what data is on screen, so a link that leaves it out describes a
   * different table. A **fourth League param** rather than a sixth value of
   * `lspan=`, and the reason is what that strip is: `lspan=` names one of five
   * *cuts*, each of which is a rule (`Current matchup` is the week being played,
   * on the recipient's own today), and a week is a number. One param carrying
   * both would be a strip with a value it cannot draw — nineteen weeks is not a
   * segmented control — and the app's own trap, two things in one param, read
   * the other way round. None of the others can collide: `preset`, `start`,
   * `end`, `player`, `view`, `kind`, `sim`, `hideil`, `starters`, `sched`,
   * `turn`, `plays`, `newplays`, `roster`, `pos`, `cols`, `inc`, `scope`, `watch`,
   * `win`, `help`, `mp`, `mup`, `mt`, `mr`, `lt`, `lspan`, `proj`, `rproj`,
   * `rankproj`, `league`.
   *
   * **A week is a range and is honestly one**, which is where it parts from a
   * date preset: `Week 12` is a fact about the league's calendar rather than a
   * rule about today, so freezing it in a link is what a link to it *means*.
   * The one period that is both — the week being played — is normalized away by
   * the bar itself, which selects `Current matchup` for it, so `lwk=` never
   * names the live week and a shared link never freezes it. That is the same
   * normalization `mp=` makes by being absent on the current period.
   *
   * **Unrecognized falls back rather than emptying the view.** Anything but
   * digits is no week at all, and a period this league's schedule has never
   * carried is answered by the server with the span beside it — so the table
   * is the five-span one rather than a page of nothing.
   *
   * It is **not put away with the tab** the way the two lenses are: which weeks
   * a reader is looking at is data rather than a lens, and it is remembered
   * exactly as `lspan=` is.
   */
  const [rankWeek, setRankWeek] = useState<number | null>(() => {
    const raw = initialParams.get('lwk');
    return raw && /^\d{1,3}$/.test(raw) ? Number(raw) : null;
  });

  /**
   * **The Rankings tab's own projected reading** — every team's figure and
   * standing read against the end of the matchup rather than against today.
   *
   * It is the question the projection is most useful for on that table: not
   * *am I winning this category*, which the scoreboard answers, but *where will
   * I finish in it* — and a manager two points off third in saves with five
   * days left is looking at a different week from one who is two points off
   * with one.
   *
   * **In the URL as `rankproj=1`**, by the rule `proj=1` and `rproj=1` follow:
   * it changes what the numbers are, so a link that carries it describes a
   * different table. A **third** param rather than a reuse of either, because
   * neither means this: `proj=1` is a *matchup*'s figures and `rproj=1` is a
   * *player's*, and one param meaning three things in three views is exactly
   * the trap `lspan=` avoids by not being `win=`. It is written only on the
   * span it can act on (see the URL sync), so a link to a season table never
   * carries a lens that table has no answer for.
   *
   * **Not a saved preference**, by the line every lens in this app sits the far
   * side of: which figures a reader wants in front of them is a lens for an
   * afternoon rather than a standing fact about the reader, and a saved copy
   * would be a table of guesses drawn a fortnight later.
   *
   * The re-ranking is the **server's** — see `espn.ts::getRankings`. Everything
   * that turns a figure into a standing lives there, so a projected table
   * ranked here would be a second definition of the competition rank, of the
   * roto point, and of the identity that makes `OVR` equal `BAT` + `PIT`.
   *
   * **And it goes off with the tab** — see the effect down beside the roster
   * lens's, *The two League lenses go away with their pages*. The span strip is
   * not a leaving and an inbound link is not one either.
   */
  const [rankProjected, setRankProjected] = useState<boolean>(
    () => initialParams.get('rankproj') === '1',
  );
  const [rankings, setRankings] = useState<EspnRankings | null>(null);
  const [rankingsLoading, setRankingsLoading] = useState(false);
  const [rankingsError, setRankingsError] = useState<string | null>(null);
  const showRankingsWait = useDelayedFlag(rankingsLoading);

  const [transactions, setTransactions] = useState<EspnTransactions | null>(null);
  /** What the transactions effect reads to know it has already read: the feed
   *  is one request per league on the server's own ten minutes, so entering
   *  the tab twice should cost nothing. A ref rather than the state itself,
   *  which as a dependency would re-run the effect on its own result. */
  const transactionsRef = useRef<EspnTransactions | null>(null);
  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const showTransactionsWait = useDelayedFlag(transactionsLoading);

  /**
   * How far down the transactions feed this reader has got — the date of the
   * newest move they had in front of them, and the league it was in. What the
   * red dot on the Transactions tab is drawn from, and the only thing that
   * undraws it.
   *
   * Saved per user (`UserPrefs.seenTransactions`) rather than held for the
   * session, because "unread" is a claim about a *person* and has to survive a
   * reload to mean anything: a dot that came back every morning whatever you
   * had read would be a dot nobody looks at. Deliberately **not** in the URL —
   * it says nothing about the view a link describes, which is the line
   * `muteAudio` and `recentPlayers` are already on, and a link that marked
   * somebody else's feed read would be worse than useless.
   */
  const [seenTx, setSeenTx] = useState<{ leagueId: number; ts: number } | null>(null);

  const [espnOpen, setEspnOpen] = useState(false);
  /**
   * The invite-link onboarding page — the league you have just joined, its
   * teams, and one button. Deliberately its own flag rather than a mode of
   * `espnOpen`: they are two different pages for two different people (see
   * `LeagueOnboarding`), and the settings page is the one thing an invited
   * user should *not* be dropped into.
   */
  const [espnOnboard, setEspnOnboard] = useState(false);
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

  /**
   * A `PUT`/`POST` answer has already told us what the connection is, so the
   * boot `GET` below must not put its own answer over the top of it.
   *
   * The two are fired **concurrently** on a load that carries an invite code —
   * this read and the join that redeems it — and for the one visitor an invite
   * is aimed at the read is the stale half by construction: it describes the
   * account a second before it joined a league. Landing last it undoes the
   * join, which takes the onboarding page off screen (it renders only while
   * the status says connected) and leaves the team pick with no
   * disconnected → connected transition to read, i.e. with the fantasy roster
   * never turned on. Ordering is not ours to arrange, so the write simply
   * wins.
   */
  const espnStatusWritten = useRef(false);
  useEffect(() => {
    let canceled = false;
    api
      .espn()
      .then((s) => {
        if (!canceled && !espnStatusWritten.current) setEspnStatus(s);
      })
      // Not banner-worthy: with no status the board simply doesn't offer the
      // pill, which is what an unconnected user sees anyway.
      .catch((e: Error) => console.error('ESPN status unavailable:', e.message))
      .finally(() => {
        if (!canceled) setEspnStatusSettled(true);
      });
    return () => {
      canceled = true;
    };
  }, []);

  /**
   * An invite link (`?league=<code>`) hands this user a leaguemate's
   * connection. Redeemed once on load, before anything else asks about a
   * league — and the page is then **opened**, rather than the app quietly
   * changing state behind them: a link that silently rewires where your player
   * list comes from is a surprise, and they have to pick their team anyway.
   *
   * The code is **not** read off the URL here, and that is the fix rather than
   * a refactor: this page mounts only once somebody is signed in, and for a new
   * user the sign-in is a round trip through two other origins that can — and
   * on iOS demonstrably does — come back somewhere other than the link they
   * clicked. `invite.ts` captures it at module load, before anything can
   * navigate or rewrite the query, and holds it in localStorage for an hour;
   * `takeInvite` spends it, which is what keeps a reload from redeeming twice.
   *
   * The param still needs no cleanup of its own: `App`'s URL sync writes the
   * whole query string from the view state, and `league` isn't part of it, so
   * the first sync drops it.
   */
  const inviteCode = useMemo(takeInvite, []);
  useEffect(() => {
    if (!inviteCode) return;
    let canceled = false;
    api
      .joinEspn(inviteCode)
      .then((s) => {
        if (canceled) return;
        espnStatusWritten.current = true;
        setEspnStatus(s);
        // The onboarding page, not the settings page: what this reader has to
        // do is name their team, and everything else on that page is written
        // for whoever connected the league in the first place.
        setEspnOnboard(true);
      })
      .catch((e: Error) => {
        if (canceled) return;
        // A link that didn't work is not an onboarding flow — there is no
        // league to name a team in — so this falls back to the settings page
        // with the reason on it, which is also the way to connect one by hand.
        // An expired link that does nothing at all leaves someone staring at an
        // app that ignored what they clicked.
        setEspnJoinError(e.message);
        setEspnOpen(true);
      })
      .finally(() => {
        if (!canceled) setEspnStatusSettled(true);
      });
    return () => {
      canceled = true;
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

  // A different league (or a disconnect) invalidates the whole set — and the
  // transactions feed with it, which is the one League read that is kept rather
  // than re-read on entry, so nothing else would ever throw it away. A feed
  // from the league you have just left is not a feed about the one you are in.
  useEffect(() => {
    setOwnership(null);
    setEspnError(null);
    setTransactions(null);
    transactionsRef.current = null;
  }, [espnLeagueId]);

  /**
   * **Which of the League view's readings needs the board**, as one boolean
   * rather than the three tests it is made of — so the effect below re-runs
   * when the answer changes and not when a matchup is opened over a tab that
   * already needed it.
   */
  const needsScoreboard =
    espnConnected &&
    ((view === 'league' &&
      (leagueTab === 'scoreboard' || leagueTab === 'rankings' || matchupId != null)) ||
      // **The Matchup tab is the fourth reading that needs it**, and it needs
      // it more plainly than the other three: the board is the only thing that
      // says which matchup is *mine* (`myTeamId` against each row's two sides),
      // so without it the page has not merely no figures but no subject.
      view === 'matchup');

  /**
   * The scoreboard, read on entry to the League view and whenever the period
   * changes — which is the same laziness the ownership map takes, and for the
   * same reason: nobody who never opens the page should pay for it.
   *
   * **The previous board is left standing while the next is in flight**, which
   * is rule 1 of the app's loading discipline: a re-read must never blank a
   * pane that has rows. So `setScoreboard` is called on success alone and the
   * view's block wait is gated on there being nothing to show yet.
   */
  useEffect(() => {
    // **The matchup page reads it too**, and reads the same object: a matchup
    // breakdown is one card of this board drawn the other way up, so opening
    // one costs no fetch of its own and closing it costs nothing either.
    //
    // **And the Rankings tab reads it, because its rows are doors into it** —
    // a press on a team there opens that team's current matchup, which is the
    // row of `matchups` carrying his id, so the tab cannot offer the press
    // until the board is in hand. It is the cheapest read on this view (10KB
    // over the wire, a minute's cache per league on the server, ~2ms warm) —
    // an order of magnitude less than the transactions feed already read on
    // entry to the view for the dot on its tab. `matchupId` is in the test so
    // a `?mup=` link landing on the Transactions tab still has a board to draw.
    if (!needsScoreboard) return;
    let canceled = false;
    setScoreboardLoading(true);
    setScoreboardError(null);
    api
      .espnScoreboard(matchupPeriod)
      .then((b) => {
        if (!canceled) setScoreboard(b);
      })
      .catch((e: Error) => {
        if (!canceled) setScoreboardError(e.message);
      })
      .finally(() => {
        if (!canceled) setScoreboardLoading(false);
      });
    return () => {
      canceled = true;
    };
    // Deliberately not `scoreboard` or `scoreboardLoading`, either of which
    // would re-run the effect on its own result and spin — the same dependency
    // rule the ownership read follows. `needsScoreboard` is a boolean rather
    // than the three things it is made of, so opening a matchup over a tab that
    // already needed the board re-runs nothing — where `matchupId` in the list
    // would spend a request per press to be handed the board it already has.
  }, [needsScoreboard, matchupPeriod, espnLeagueId]);

  /**
   * The projection, read on the first press of `Projected` — and re-read on the
   * League page's own minute for as long as the week is live, since half of
   * what a projected card shows is the side's *current* total and that half is
   * re-read on the very same tick (see `pollLeague`).
   *
   * **Lazy on the toggle**, which is where this parts from the board above it:
   * that one is 10KB and read by everybody who opens the page, and this joins
   * four league-wide boards against every roster in the league. Measured through
   * the route on the live league: **386–715ms** with those boards warm (which
   * they are — three of the four are pulled nightly by the warmer) and **35ms**
   * off its own minute, for **1,032 bytes** over the wire.
   *
   * **Never over data**, the app's own rule: `setProjection` is called on success
   * alone, so a re-read at a new period leaves the last one standing rather than
   * flipping the cards back to the live figures mid-look. And it is **cleared on
   * a period change** first, because a projection is a fact about *one* week and
   * drawing last week's over this one is the one thing it must not do.
   */
  const leagueProjRead = useRef(0);
  const loadLeagueProjection = useCallback(
    (quiet = false) => {
      // Sequence-numbered rather than canceled per run, for the reason the
      // roster lens's read is: the poll below means two can be in flight at
      // once, and only the newest may write.
      const seq = ++leagueProjRead.current;
      if (!quiet) setProjLoading(true);
      return api
        .espnProjection(matchupPeriod)
        .then((p) => {
          if (seq === leagueProjRead.current) setProjection(p);
        })
        .catch((e: Error) => {
          // A failed projection costs the toggle its figures and nothing else —
          // the board it was drawn over is untouched, so the cards fall back to
          // the live ones rather than the page becoming a message.
          if (seq === leagueProjRead.current) console.error('reading the projection failed:', e.message);
        })
        .finally(() => {
          if (seq === leagueProjRead.current && !quiet) setProjLoading(false);
        });
    },
    [matchupPeriod],
  );

  useEffect(() => {
    // **Two surfaces read it** — the matchup page and the board it is opened
    // from — and nobody else does, so a reader who never presses `Projected` on
    // either never pays for four league-wide boards joined against every roster
    // in the league. See `projLensPage`.
    if (!projected || !projLensPage || !espnConnected) {
      // **Cleared on the way out, not only on the way in.** Turning the lens off
      // while a read is in flight discards its answer — and a flag left true is
      // a ball spinning for ever on a button that is no longer doing anything.
      // The same shape is why the roster and team-page reads clear theirs here
      // too.
      leagueProjRead.current += 1;
      setProjLoading(false);
      return;
    }
    loadLeagueProjection();
  }, [projected, projLensPage, espnConnected, loadLeagueProjection]);

  /** A projection belongs to one matchup period, so stepping the arrows drops
   *  it rather than letting last week's figures be drawn over this one. */
  useEffect(() => {
    setProjection(null);
  }, [matchupPeriod, espnLeagueId]);

  /**
   * The Rankings tab, read on its first open and whenever the span changes.
   *
   * Gated on the tab as well as the view, which is what "lazily fetch each
   * tab's data on first open" means here: a reader who only ever looks at the
   * scoreboard never pays for a 300KB aggregation of the first half. The
   * previous table is left standing while the next span is in flight, rule 1
   * of the loading discipline.
   */
  useEffect(() => {
    if (view !== 'league' || leagueTab !== 'rankings' || !espnConnected) return;
    let canceled = false;
    setRankingsLoading(true);
    setRankingsError(null);
    api
      // **Never over data**: the table on screen stands while the next answer is
      // in flight, whether the change is the span or the lens, so the only mark
      // a press of `Projected` leaves is the ball inside the button that
      // started it. A failed read leaves the last table standing too.
      .espnRankings(rankSpan, false, rankProjected, rankWeek)
      .then((r) => {
        if (!canceled) setRankings(r);
      })
      .catch((e: Error) => {
        if (!canceled) setRankingsError(e.message);
      })
      .finally(() => {
        if (!canceled) setRankingsLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [view, leagueTab, espnConnected, rankSpan, rankWeek, rankProjected, espnLeagueId]);

  /**
   * The Transactions feed, read **once a league is connected**, whatever view
   * the reader is on — and then kept.
   *
   * It has moved out one level twice, and both times for the same reason. It
   * was gated on the Transactions *tab*, on the reasoning that nobody who only
   * ever looks at the scoreboard should pay for a 250-row activity feed; the
   * dot on that tab overruled it, "there are moves you haven't seen" being a
   * claim the tab row has to make *before* the tab is opened. It is gated on
   * nothing but the league now, because **the dot is in the header** — the
   * button beside the fantasy one, which goes straight to the feed — and that
   * button is on screen on every view. A mark that only tells the truth on the
   * page it points at is a mark that says nothing.
   *
   * What it costs is one request per app boot for a reader with a league,
   * answered from the server's own minute-long cache and about a tenth of its
   * 86KB once `compression()` has had it. Upstream it costs **nothing per
   * reader**: that cache is keyed by league, so twelve leaguemates cost the one
   * read a minute that one of them does.
   *
   * Kept rather than re-read on every entry: the poll below is what keeps it
   * current, and `Refresh from ESPN` is what goes and asks when a reader knows
   * something has happened that a cache cannot.
   */
  useEffect(() => {
    if (!espnConnected) return;
    if (transactionsRef.current) return;
    let canceled = false;
    setTransactionsLoading(true);
    setTransactionsError(null);
    api
      .espnTransactions()
      .then((t) => {
        if (!canceled) setTransactions(t);
      })
      .catch((e: Error) => {
        if (!canceled) setTransactionsError(e.message);
      })
      .finally(() => {
        if (!canceled) setTransactionsLoading(false);
      });
    return () => {
      canceled = true;
    };
    // `transactionsRef` rather than `transactions`, deliberately: depending on
    // the state itself would re-run the effect on its own result and spin,
    // which is the dependency rule the ownership read already states. And
    // neither `leagueTab` nor `view`, which is the whole of the change above.
  }, [espnConnected, espnLeagueId]);

  /**
   * **Which matchup each team is in this period**, team id → matchup id — what
   * a press on a Rankings row opens.
   *
   * Derived here rather than in the table because App is where the board
   * lives: `LeagueRankings` holds one span's rows and has never been handed a
   * scoreboard, and giving it one so it could search the matchups itself would
   * be a second reader of a payload this file already parses.
   *
   * **A bye is in it like any other matchup** (`away` is null and the map takes
   * `home` alone), which is what makes the press work in a playoff round: eight
   * of the live league's ten matchups are byes, and the page those rows open
   * goes straight to the team's roster with no strip at all.
   *
   * Null until the board lands, which is the whole of the gate on the press —
   * see `client-league.md`, *A Rankings row opens that team's matchup*.
   */
  const matchupTeams = useMemo(() => {
    if (!scoreboard) return null;
    const m = new Map<number, number>();
    for (const mu of scoreboard.matchups) {
      m.set(mu.home.teamId, mu.id);
      if (mu.away) m.set(mu.away.teamId, mu.id);
    }
    return m;
  }, [scoreboard]);

  /**
   * Which of the League page's three readings can still change, and so are
   * worth polling.
   *
   * **A settled week is a fact** — the server reads one back off a blob with no
   * freshness test at all — so a reader looking at last week's scoreboard is
   * looking at something that cannot move, and asking again every minute would
   * be a request a minute to be told so.
   *
   * The Rankings tab's answer is the span's own `live` flag with one addition:
   * `season` is ESPN's running total, which accrues all year, and its flag is
   * `false` because that flag answers a different question — *do these numbers
   * include a week still being played*, which is what puts `so far` on the
   * caption. What the poll needs to know is whether they can change at all, and
   * the season's can.
   */
  const scoreboardLive = scoreboard?.live === true;
  const rankSpanLive =
    rankings != null &&
    // **A week the reader picked is a settled one and cannot move**, so it is
    // not polled at all — the same reasoning that leaves a settled scoreboard
    // week alone: a request a minute to be told a fact. `rankings.week` is the
    // server's own answer rather than the request, so this cannot outlive a
    // week it declined.
    rankings.week == null &&
    (rankings.span === 'season' ||
      rankings.spans.find((s) => s.span === rankings.span)?.live === true);

  /**
   * One tick of that poll: re-read what is on screen, quietly.
   *
   * **Quiet is the whole difference** from the three effects above, and it is
   * rule 1 of the app's loading discipline stated for a read nobody asked for:
   * no wait goes up, nothing is blanked, and a tick that *fails* leaves the
   * last good answer standing with no error banner over it — a page that has
   * been readable for ten minutes must not become a message because one poll
   * lost its connection. The next tick will say so if it is real.
   *
   * The transactions feed is polled whatever tab is open **and whatever view
   * the reader is on**, the other three only where they are drawn, which is the
   * same laziness the reads themselves take: what is not on screen is not worth
   * a request — except the one thing a *mark* is drawn from. That mark used to
   * be the tab's dot alone and is now the header button's as well, which is on
   * screen on every view, so the exception travels with it.
   */
  const pollLeague = useCallback(() => {
    const quiet = (what: string) => (e: Error) =>
      console.error(`league poll (${what}) failed:`, e.message);
    // **An open matchup page counts as the scoreboard being on screen**, which
    // is what "poll what is on screen" means once that page can be opened from
    // the Rankings tab: it draws its every figure off this board, so without
    // this it would sit still for as long as it was open. The two rules the
    // poll already has are untouched — the week has to be live, and the read
    // goes through the server's own minute.
    if (view === 'league' && (leagueTab === 'scoreboard' || matchupId != null) && scoreboardLive) {
      api.espnScoreboard(matchupPeriod).then(setScoreboard).catch(quiet('scoreboard'));
    }
    // **A projected card is half live figures**, so the half that is read
    // separately has to ride the same minute: the card is what the side has
    // already scored plus what the projection adds, and the first half is
    // re-read on this very tick. Left alone, an evening's play moved one half
    // of every category and not the other — and the projection's own share of
    // it only shrinks as games are played, so the two drifted apart in a
    // direction nobody could see. Quiet, on success alone, and only where the
    // week can still move.
    if (view === 'league' && projected && projLensPage && scoreboardLive) {
      // The loader carries its own failure handling — see `loadLeagueProjection`,
      // which logs and leaves the last answer standing, which is what `quiet`
      // does for the reads beside it.
      void loadLeagueProjection(true);
    }
    if (view === 'league' && leagueTab === 'rankings' && rankSpanLive) {
      // The lens rides along, or a tick would quietly swap a projected table
      // back to the live one a minute after the reader asked for it.
      api
        .espnRankings(rankSpan, false, rankProjected, rankWeek)
        .then(setRankings)
        .catch(quiet('rankings'));
    }
    api.espnTransactions().then(setTransactions).catch(quiet('transactions'));
  }, [
    // `view` is in the list because the three reads above are now gated on it:
    // the tick runs off the League page for the feed's sake alone, and a
    // scoreboard read fired from the Roster view would be a request for a board
    // nobody is looking at.
    view,
    leagueTab,
    matchupId,
    scoreboardLive,
    rankSpanLive,
    matchupPeriod,
    rankSpan,
    rankWeek,
    rankProjected,
    projected,
    projLensPage,
    loadLeagueProjection,
  ]);

  /** The latest tick, so the interval below can be set up once per visit to the
   *  page rather than torn down and rebuilt every time a poll lands — which is
   *  what depending on `pollLeague` directly would do, since its own answer
   *  changes what it closes over. */
  const pollLeagueRef = useRef(pollLeague);
  useEffect(() => {
    pollLeagueRef.current = pollLeague;
  });

  /**
   * The poll itself, for as long as a league is connected.
   *
   * A hidden tab is skipped rather than polled — see `LEAGUE_POLL_MS` — and
   * becoming visible fires one immediately, so a reader who comes back to a tab
   * they left an hour ago is looking at this minute's league rather than that
   * hour's, and the Transactions dot is answering for now.
   */
  useEffect(() => {
    if (!espnConnected) return;
    const tick = () => {
      if (!document.hidden) pollLeagueRef.current();
    };
    const timer = setInterval(tick, LEAGUE_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
    // **Not `view`**, which is the change the header button forces: the dot on
    // it is drawn from the feed and is on screen wherever the reader is, so a
    // timer that stopped the moment they left the League page would leave a mark
    // answering for whenever they last looked. What the tick *does* off that
    // page is one request — see `pollLeague`, where the other three reads are
    // gated on the view rather than on the timer.
  }, [espnConnected, espnLeagueId]);

  /**
   * The newest move in the feed, which is what "have I seen it" is asked
   * against.
   *
   * A **max rather than the first row**, although the server sends the feed
   * newest first: this is the one number the dot turns on, and a reduce over
   * 250 rows costs nothing and cannot be wrong the day an upstream sort
   * changes under us. Null with no feed read yet, which draws no dot — an
   * absence of news is not news.
   */
  const latestTxTs = useMemo(() => {
    const list = transactions?.transactions;
    if (!list || list.length === 0) return null;
    return list.reduce((max, t) => (t.date > max ? t.date : max), list[0].date);
  }, [transactions]);

  /**
   * Whether the Transactions tab wears its dot: there is a move in the feed
   * newer than the newest this reader has seen.
   *
   * **A reader who has never opened the tab has seen none of it**, so a marker
   * of `null` draws the dot rather than suppressing it — and so does a marker
   * from a *different* league, which is why the league id is stored beside the
   * date. Both fail in the same direction, which is the only safe one here:
   * news offered rather than news hidden.
   */
  const unseenTransactions =
    espnLeagueId != null &&
    latestTxTs != null &&
    !(seenTx != null && seenTx.leagueId === espnLeagueId && seenTx.ts >= latestTxTs);

  /**
   * Opening the tab is reading it, so the marker moves to the head of the feed
   * — and moves again while the tab stays open and a poll brings something
   * new, since those rows are on screen too.
   *
   * The state leads and the write follows, the rule `noteRecentPlayer` already
   * states: the dot has to go on the very next render rather than a round trip
   * later. Through `queueUserWrite` because this and the search history write
   * to the same user item, and the dev file backend has no version to conflict
   * on. It depends on `seenTx` and sets it, which is safe by the guard: the run
   * its own write triggers falls out at the first line.
   */
  useEffect(() => {
    if (view !== 'league' || leagueTab !== 'transactions') return;
    if (espnLeagueId == null || latestTxTs == null) return;
    if (seenTx != null && seenTx.leagueId === espnLeagueId && seenTx.ts >= latestTxTs) return;
    const mark = { leagueId: espnLeagueId, ts: latestTxTs };
    setSeenTx(mark);
    queueUserWrite(() => api.saveSeenTransactions(mark.leagueId, mark.ts)).catch((e: Error) =>
      console.error('marking transactions read failed:', e.message),
    );
  }, [view, leagueTab, espnLeagueId, latestTxTs, seenTx, queueUserWrite]);

  const ownedIds = useMemo(
    () => (ownership ? new Set(Object.keys(ownership.owned).map(Number)) : null),
    [ownership],
  );

  // The fantasy roster itself — the slot chips, and the list the reorder screen
  // and the adder must not pretend to edit. Only read while it is in use.
  const [fantasyRoster, setFantasyRoster] = useState<EspnRoster | null>(null);
  /** Has the read above come back at all — see its own `finally`. */
  const [fantasyRosterSettled, setFantasyRosterSettled] = useState(false);
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
   * The sequence number is what the effect's `canceled` flag used to be, and
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
      .espnRoster(refresh, start, end)
      .then((r) => {
        if (seq === rosterRead.current) setFantasyRoster(r);
      })
      // The report request carries the same failure and banners it; a second
      // copy of the same message would only say it twice.
      .catch((e: Error) => console.error('fantasy roster unavailable:', e.message))
      // **Settled, not loaded**, and the difference is a page with nothing on
      // it at all. The mode's empty state is held until this read lands so it
      // can't flash over every fantasy page while ESPN answers — but held on
      // `fantasyRoster !== null` it was held *for ever* when the read failed,
      // and a failed read is exactly when the saved-roster empty state beside
      // it is also suppressed (`!usingFantasy`) and the report has no players
      // to draw. Blank, with nothing on screen saying why. A read that came
      // back is an answer whichever way it came back.
      .finally(() => setFantasyRosterSettled(true));
    // The whole range rather than nothing: `end` decides which day's roster and
    // slot chips come back, and `start` opts the response into a lineup **per
    // day** of it, which is what the roster views credit a player's days
    // against. A stale closure would hold both on the range the view was last
    // changed *from*. It re-identifies this callback on a date change, which
    // the effect below wanted anyway — it already lists both — so they move
    // together and it still fires once.
  }, [start, end]);

  useEffect(() => {
    if (!usingFantasy) return;
    loadFantasyRoster();
  }, [usingFantasy, espnLeagueId, fantasyTeamId, start, end, loadFantasyRoster]);

  /**
   * Your lineup on **each** day of the range, by **player key** — the whole
   * point of which is that a range is a range of lineups. ESPN answers for one
   * scoring period at a time, so the server reads one per date (see `espn.ts`'s
   * **The lineup, one day at a time**); this turns the wire's `{ date: key[] }`
   * into the shape the filter reads it in.
   *
   * **By key rather than by id, because a seat has a side of the ball.** ESPN
   * seats a two-way player once and this app draws him twice, so an id said
   * *started* for Ohtani's pitching row on an afternoon he was standing at
   * `UTIL`. The server reads the slot off the same per-day roster the map is
   * derived from, so the answer changes with the day rather than with the
   * range.
   *
   * Null when the views aren't reading a fantasy team, and null when the read
   * didn't happen or failed — in which case everything below falls back to
   * `fantasySlots`, i.e. the single end-of-range lineup, which is exactly what
   * the app did before. A **date missing from a present map** falls back the
   * same way and for the same reason: absent means unread, not empty.
   */
  const fantasyLineups = useMemo(() => {
    const raw = usingFantasy ? fantasyRoster?.lineups : null;
    if (!raw) return null;
    const map = new Map<string, Set<string>>();
    for (const [date, keys] of Object.entries(raw)) map.set(date, new Set(keys));
    return map.size > 0 ? map : null;
  }, [usingFantasy, fantasyRoster]);

  /** The dates in the range, which the count on a slot chip and the per-day
   *  filter both walk. Cheap — `MAX_RANGE_DAYS` is 62. */
  const rangeDates = useMemo(() => rangeDatesOf(start, end), [start, end]);

  /**
   * Slot by player key, for the chips. Null when the views are reading the
   * saved watchlist, which is what makes every chip in the app disappear.
   *
   * **Drawn from the roster as it stood at the end of the range**, which the
   * server sends as `endRoster` whenever that is a past day it could read. A
   * slot is a fact about a day, and the day the reader has asked about is the
   * one the numbers beside the chip come from — so over `Yesterday` the chip
   * says where he was in yesterday's lineup, and the man dropped this morning
   * has one at all. Falling back to `players` covers the two cases where there
   * is no such day to speak of and the one where it couldn't be read; see
   * `EspnRoster.endRoster`, and `day` below for how the title stays true in
   * each.
   */
  const fantasySlots = useMemo(() => {
    if (!usingFantasy || !fantasyRoster) return null;
    const map = new Map<string, FantasySlot>();
    // Which day these slots are a fact about, `null` meaning today — which is
    // what `endRoster`'s absence means when the range ends today or the read
    // failed, while a range ending *later* is a day the ownership read itself
    // answered for and so is named. The one thing this must never do is name a
    // day the slots did not come from.
    const slotDay = fantasyRoster.endRoster || end > baseballToday() ? end : null;
    for (const p of fantasyRoster.endRoster ?? fantasyRoster.players) {
      if (p.mlbId === null) continue;
      // **Which of his rows this seat is a fact about** — `lib.ts::seatKinds`,
      // the client's half of the server's own. One kind in, the same one kind
      // out for everybody but a two-way player, who is two rows under one id
      // and standing in exactly one chair: seated at `UTIL` he is a batter you
      // started and a pitcher you did not. `starting` is the per-*row* answer
      // from here on, which is what the `Total` divider, the chip's lit state
      // and the `startedOn` fallback all read.
      const seated = new Set(seatKinds(p.kinds, p.slotId));
      for (const kind of p.kinds) {
        const key = `${kind}-${p.mlbId}`;
        const starting = p.starting && seated.has(kind);
        // Which of the days in view he was in the lineup on — the fact the
        // chip's one-day slot can't carry over a range, and the days rather
        // than a count of them because the projected table's `Starts` column
        // needs to know *which* (see `SummaryTable.tsx::playedStarts`). Null
        // without the per-day map, where there is no second fact to state.
        // **Per key**, since the map is keyed by key and the fallback beside it
        // is now this row's own answer rather than the man's.
        const startedDays =
          fantasyLineups === null
            ? null
            : rangeDates.filter((d) => startedOn(fantasyLineups, d, key, starting));
        map.set(key, {
          slot: p.slot,
          starting,
          day: slotDay,
          injuryStatus: p.injuryStatus,
          startedDays,
          rangeDays: startedDays === null ? null : rangeDates.length,
        });
      }
    }
    return map;
  }, [usingFantasy, fantasyRoster, fantasyLineups, rangeDates, end]);

  /**
   * **Whether "who is starting" has an answer over this range at all** — what
   * `starterCards` and the summary table's `Total` divider are gated on.
   *
   * Two tiers, and the second is what takes the gate off. The **MLB** reading
   * is a fact about tonight, so over a week in July there is nobody it could
   * name and a divider drawn on it would be a line across a table meaning
   * nothing. A **per-day lineup read** does not have that problem: on a fantasy
   * team every day of the range has its own answer, so "the men I started" is
   * exactly as meaningful over `Yesterday` or last July as it is today. Without
   * the map — saved-roster mode, an older tab, a failed read — the first tier
   * stands, since the single end-of-range lineup really is only about one
   * afternoon.
   */
  const startersKnown = rangeHasToday || fantasyLineups !== null;

  /**
   * Your fantasy team **as it stands**, as player keys — or null when the views
   * are reading the saved roster, or before the read has landed, which is what
   * keeps `rosterKeys` on the saved list until there is a fantasy one to give
   * it.
   *
   * `fantasyRoster.players` rather than the slot map beside it, because this is
   * the set that answers "is he on my team" and that is a question about today
   * whatever range is on screen. See `rosterKeys` below, which is its one
   * reader and where the split is argued.
   */
  const fantasyTeam = useMemo(() => {
    if (!usingFantasy || !fantasyRoster) return null;
    const keys: string[] = [];
    for (const p of fantasyRoster.players) {
      if (p.mlbId === null) continue;
      for (const kind of p.kinds) keys.push(`${kind}-${p.mlbId}`);
    }
    return keys;
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
   *
   * **And deliberately not `fantasySlots.keys()`, which it used to be.** Every
   * reader of this set asks the same question and it is a question about *now*:
   * whose roster is he on, may I pick him up, does this page's badge say I hold
   * him. The chips answer a different one — where was he in my lineup on the day
   * in view — and since a past range anchors those to that day, the two sets
   * genuinely part company: over `Yesterday` the slot map holds the catcher
   * dropped this morning and lacks the man picked up in his place. Reading this
   * off it would put a baseball on a free agent on the research board, which is
   * a board with today's ownership map beside it, and have one row of it
   * contradict the next.
   */
  const rosterKeys = useMemo(() => {
    if (fantasyTeam) return new Set(fantasyTeam);
    return new Set(roster.map(playerKey));
  }, [roster, fantasyTeam]);

  /**
   * Who in the league is holding a player **you can't have** — MLB id to the
   * name of the fantasy team that has him, or null with no league connected,
   * which is what keeps the lock off every name in the app for a user with no
   * ownership to read.
   *
   * This is `Other Rosters` as a *map* rather than as a set: the include button
   * names a set to draw, where the lock makes a claim about one player, and a
   * claim wants the owner's name in it — "somebody else has him" is the fact and
   * "who" is the very next question. The names cost nothing, `EspnOwnership`
   * carrying the league's teams beside the map of who holds whom.
   *
   * **Your own team is excluded here rather than at the draw site**, and that is
   * the one place this deliberately parts from `boardRows`' partition. That
   * partition approximates "yours" as `rosterKeys`, which is exact in fantasy
   * mode and is the *saved* list in saved-roster mode — so a user who reads the
   * saved roster with a league connected (the ordinary way to have one, since
   * the board's free agents are the reason to connect at all) would have had a
   * lock drawn on every one of his own ESPN players, the mark stating outright
   * that somebody else held a man he holds himself. A set that is a little wide
   * costs a row on a board; a label that is wrong costs the mark its meaning. So
   * `espnTeamId` — the team the user picked, falling back to the one his SWID
   * identified — is taken out first, and the draw sites then apply the roster
   * test on top of it.
   */
  const ownedElsewhere = useMemo(() => {
    if (!espnConnected || !ownership) return null;
    const mine = espnTeamId ?? ownership.myTeamId;
    const names = new Map(ownership.teams.map((t) => [t.id, t.name]));
    const map = new Map<number, string>();
    for (const [id, teamId] of Object.entries(ownership.owned)) {
      if (teamId === mine) continue;
      map.set(Number(id), names.get(teamId) ?? `Team ${teamId}`);
    }
    return map;
  }, [espnConnected, ownership, espnTeamId]);

  /** ESPN's global rostered percentage by MLB id, or null with no league —
   *  which is also what turns the board's `Ros%` column on and off. */
  const rosterPct = useMemo(() => {
    if (!espnConnected || !ownership) return null;
    const map = new Map<number, number>();
    for (const [id, pct] of Object.entries(ownership.rosterPct)) map.set(Number(id), pct);
    return map;
  }, [espnConnected, ownership]);

  /**
   * **The men whose roster % came off ESPN's id rather than off the shared
   * map** — the league's prospects, and anyone else MLB's season list has
   * stopped carrying.
   *
   * They have a percentage and an eligibility like anybody else (the server
   * reaches them through `byEspnId`, an identity rather than a name match), and
   * they have **no trend and cannot have one**: the trend is a diff of two days
   * of the *global* map, and a man only one league's roster can name is in
   * neither day of it. Left alone, `rosterPct.has(id)` would have read as "he
   * is in the map, so an absent delta is a flat one" and drawn him five spans
   * of `0.0` — a claim that he has not moved, where the truth is that nothing
   * here knows. See **Roster % for a player MLB's season list has never
   * carried** in `docs/claude/espn.md`.
   */
  const beyondIds = useMemo(() => {
    const beyond = espnConnected ? ownership?.beyondMlb : null;
    return new Set((beyond ?? []).map((p) => p.id));
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
   * **Every player the app can name** — the season's major leaguers, plus the
   * men a connected league rosters who are not among them.
   *
   * `/api/players` is `sports/1/players`: the 1,401 players on a major-league
   * roster this season. A prospect is not one, so a fantasy team holding Kade
   * Anderson held somebody this app could not name, could not search for and
   * could not open a page on — the ESPN join gave him no MLB id, and the four
   * surfaces below all key on one. `EspnOwnership.beyondMlb` is exactly that
   * gap, resolved server-side against MLB's own player search, and merging it
   * here is what closes it in one place rather than four.
   *
   * **The season list wins a collision**, and its rows are the ones already on
   * screen — a man who has since been called up is on both lists, and his
   * major-league row is the one carrying his club rather than his affiliate.
   *
   * **Identical by reference when there is nothing to add**, which is every
   * session with no league connected: the memo returns `seasonPlayers` itself,
   * so nothing downstream of it recomputes.
   */
  const knownPlayers = useMemo(() => {
    const beyond = espnConnected ? ownership?.beyondMlb : null;
    if (!beyond || beyond.length === 0) return seasonPlayers;
    const have = new Set(seasonPlayers.map(playerKey));
    const extra = beyond.filter((p) => !have.has(playerKey(p)));
    return extra.length > 0 ? [...seasonPlayers, ...extra] : seasonPlayers;
  }, [seasonPlayers, espnConnected, ownership]);

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

  useEffect(() => {
    if (matchupWindowAsked.current) return;
    if (!espnConnected) {
      /* No league to ask is an answer, and the one the boot gate below is
         waiting for: a `?preset=Matchup` link opened by somebody with no
         connection has to fall back to `Today` and read the report once,
         rather than hold it against a window nobody is going to fetch. Held
         until the *status* has settled, since "not connected" is what every
         session says for its first round trip. */
      if (espnStatusSettled) settleMatchup(null);
      return;
    }
    matchupWindowAsked.current = true;
    api
      .espnMatchupWindow()
      .then((w) => {
        setMatchupWindow(w);
        settleMatchup(w);
      })
      /* Settled either way, a failed read being an answer: without it a
         `?preset=Matchup` link opened against a dead upstream would hold the
         report for ever, which is the rule `setReportSettled` already follows
         one effect over. */
      .catch((e: Error) => {
        console.warn('matchup window read failed:', e.message);
        settleMatchup(null);
      });
  }, [espnConnected, espnStatusSettled, settleMatchup]);



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
    // Returns a promise so a caller can wait on it — an in-flight read
    // resolves immediately rather than sending a second copy of itself.
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

  /**
   * Who in the league has been in the news today or yesterday — the mark beside
   * a player's name on the two roster tables and on his own page.
   *
   * **Once on mount, and unconditionally**, which is where this parts from the
   * statuses read above and from the ownership one: those are re-read on every
   * entry because a lineup posts in the afternoon and a roster moves by the
   * hour, where both of this map's upstreams date to a *day* (MLB stamps a
   * transaction with a date and RotoWire stamps a note `August 14, 2026`), so
   * asking again inside one page-load can only be told what it was told the
   * first time. The server's thirty minutes — the same TTL the News tab itself
   * runs on, so the mark and the tab cannot disagree — is where freshness is
   * decided.
   *
   * Unconditional because the default view draws it: the summary table is the
   * page the app opens on. Gating it on the view would save a reader who goes
   * straight to the feed one 6.5KB response and cost every other reader a mark
   * that arrives late on the page they are already reading.
   *
   * A failure is swallowed, like the statuses read: this decorates a name, and
   * the table under it is what the reader came for.
   */
  const [recentNews, setRecentNews] = useState<Map<number, RecentNews> | null>(null);
  /* Once on mount — and once more whenever the app is reopened, which is the
     one thing that can put a *day* between two calls of it and so the one thing
     that can change the answer. See `refreshOnResume`. */
  const loadRecentNews = useCallback(
    () =>
      api
        .recentNews()
        .then((byId) =>
          setRecentNews(new Map(Object.entries(byId).map(([id, n]) => [Number(id), n]))),
        )
        .catch((e: Error) => console.error('recent news unavailable:', e.message)),
    [],
  );
  useEffect(() => {
    void loadRecentNews();
  }, [loadRecentNews]);

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
      delta: new Map<number, number | null>(
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
      //
      // **`has` rather than `?? 0`**, because the map now carries a third
      // answer: an id stored as `null` is one the server withheld, its baseline
      // being another player's, and `?? 0` would have flattened that into the
      // one claim it is not — that he has not moved. Absent is still flat.
      const rosterTrends: Partial<Record<TrendWindow, number | null>> = {};
      for (const w of rosterTrend ?? []) {
        rosterTrends[w.window] = !rosterPct?.has(r.id)
          ? null
          : w.delta.has(r.id)
            ? w.delta.get(r.id) ?? null
            : 0;
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
  /**
   * Every change the Fantasy league page makes to the connection lands here —
   * a connect, a disconnect, a share toggle, and the team picker.
   *
   * **Naming a team for the first time turns the fantasy roster on**, which is
   * what finishes an invite-link join: the link attaches you to the league,
   * the page asks which team is yours, and until now that left the Roster and
   * Feed views reporting on a saved roster that a brand-new user has nothing
   * in. The two guards are the whole rule and each excludes a different way of
   * getting this wrong — `firstTeamNamed` keeps it off a team *change* (see
   * its own note), and `rosterSourceStated` keeps it off anyone who has said
   * which list they want, in this session or in their record. It cannot fire
   * twice for one user either: the write it makes is itself a stated source.
   *
   * `rosterSource === 'saved'` is not a third guard so much as the honest
   * reading of "turn it on" — with it already on there is nothing to do, and
   * writing it down would have a `roster=fantasy` link quietly overwriting the
   * record it was only ever supposed to override for the one visit, which is
   * the rule `cols=` follows.
   *
   * One write at a time, which the shape gives for free: the team PUT has
   * resolved by the time this is called, so the preference PUT that follows
   * cannot race it on the same user item — the hazard `queueUserWrite` exists
   * for, and the reason this is not done optimistically inside the picker.
   */
  const onEspnStatusChange = useCallback(
    (s: EspnStatus) => {
      const prev = espnStatus;
      espnStatusWritten.current = true;
      setEspnStatus(s);
      // A fresh connection (or a disconnect) makes whatever was read before
      // wrong; the board re-reads when it next needs it.
      setOwnership(null);
      setEspnError(null);
      if (rosterSource === 'saved' && !rosterSourceStated.current && firstTeamNamed(prev, s)) {
        // Nothing else has to be told: this flips `usingFantasy`, which is
        // what the report asks its source with, what the fantasy roster read
        // and the report effect both depend on, what the URL sync writes
        // `roster=fantasy` from, and what lights the fantasy button and takes
        // the editing controls away. One state change, one render, one pass.
        setRosterSource('fantasy');
      }
    },
    [espnStatus, rosterSource, setRosterSource],
  );

  /**
   * The invite flow's own way out, and it is deliberately not the settings
   * page's: name the team, write down which list to read, and then **start the
   * app over on it**.
   *
   * A reload for one press looks heavy-handed and is the honest answer here,
   * because this is the one moment in the app's life when nearly everything it
   * has read is about to be wrong at once. A join arrives mid-boot, so the
   * saved roster, the report drawn from it, the ownership map, the league's
   * teams and the connection itself are all read, in flight or absent in some
   * combination nobody can enumerate — and the team pick then changes *which
   * roster every view is about*. Reconciling that in place is a pile of
   * ordering rules each of which is one race away from a page that draws
   * nothing, which is what this flow was reported doing. A boot has all of
   * those rules already and is known to work.
   *
   * It costs the splash, once, on a screen the reader sees once. What it
   * cannot cost is the preference: the write is **awaited** before the tab is
   * torn down, where every other caller of it fires and forgets.
   *
   * The switch itself is `onEspnStatusChange`'s rule and its two guards
   * unchanged — see `firstTeamNamed`, which is what keeps this off a team
   * *change* and off anyone who has already said which list they want.
   */
  const confirmEspnOnboarding = useCallback(
    async (teamId: number) => {
      const prev = espnStatus;
      const next = await api.setEspnTeam(teamId);
      const turnOn =
        rosterSource === 'saved' &&
        !rosterSourceStated.current &&
        firstTeamNamed(prev, next);
      if (turnOn) {
        rosterSourceStated.current = true;
        // Logged rather than raised: the URL below still puts *this* session on
        // the fantasy roster, and the toggle in the fantasy popover is one
        // press from telling the record. Failing the pick over it would leave
        // the reader on a page whose one button appears not to work.
        await api
          .saveRosterSource('fantasy')
          .catch((e: Error) => console.error('saving roster source failed:', e.message));
      }
      // `league` because a code redeemed twice is a code redeemed once and then
      // refused — `takeInvite` has already spent it, and App's URL sync would
      // drop the param anyway; this only makes sure the reload doesn't carry it.
      // **Drain the write queue before the tab is torn down.** The page above
      // this now offers a color scheme, and picking one is a `PUT` on the same
      // user record fired through `queueUserWrite` and not awaited — so a
      // reader who picks a palette and presses the button in the next breath
      // could have that write killed by the reload. Enqueueing a no-op and
      // awaiting it resolves only once everything already in the chain has
      // settled, which is the same reason `saveRosterSource` above is awaited
      // rather than fired and forgotten. It costs nothing when the queue is
      // empty, and the *scheme* survives either way — `storeTheme` writes the
      // localStorage mirror synchronously, so the boot after the reload comes
      // up on the right palette regardless; what this saves is the record, and
      // with it the choice following its owner to another device.
      await queueUserWrite(async () => undefined);
      const params = new URLSearchParams(window.location.search);
      params.delete('league');
      if (turnOn || rosterSource === 'fantasy') params.set('roster', 'fantasy');
      const qs = params.toString();
      // `replace`, so the pre-pick URL doesn't become a Back destination that
      // re-enters a flow which is over.
      window.location.replace(`${window.location.pathname}${qs ? `?${qs}` : ''}`);
    },
    [espnStatus, rosterSource, queueUserWrite],
  );
  // The settings popover (gear next to the title) — the hide-injured toggle
  // (and the simulate one, when it's shown), then the way into the how-to page.
  // Closes on outside click or Escape.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  // The popover itself rather than the wrapper the dismiss test reads: what is
  // being capped is the box that scrolls. See `hooks.ts::usePopoverFit`.
  const settingsPopRef = useRef<HTMLDivElement | null>(null);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  useDismissable(settingsOpen, settingsRef, closeSettings);
  usePopoverFit(settingsOpen, settingsPopRef);
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
  const fantasyPopRef = useRef<HTMLDivElement | null>(null);
  const closeFantasy = useCallback(() => setFantasyOpen(false), []);
  useDismissable(fantasyOpen, fantasyRef, closeFantasy);
  // The same cap. This menu is shorter than the gear's — a team name, two
  // entries and a toggle — but it hangs off the same row and would run off the
  // same short window, and one rule for both beats two that agree today.
  usePopoverFit(fantasyOpen, fantasyPopRef);
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
  /* Stable, because the Feed's bar hands it to `useDismissable`, whose effect
     is keyed on the callback: an inline lambda would tear the window listeners
     down and put them back on every render of the app. */
  const closeDates = useCallback(() => setDateOpen(false), []);
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
  // `scroll-margin-top` in the stylesheet. It used to hand its height back for
  // one scroll the app computed itself, the jump to a player's card; that jump
  // is a player page now, which covers the bar rather than clearing it, so
  // nothing reads the number by hand any more.
  const chromeRef = useStickyChromeOffset<HTMLDivElement>()[0];

  // Always-current reports, so the drag-end handler reads the latest order
  // without being recreated (and re-bound) on every reorder.
  const reportsRef = useRef(reports);
  reportsRef.current = reports;
  // Keep the URL in sync with UI state (replaceState so we don't flood history).
  useEffect(() => {
    const p = new URLSearchParams();
    // The preset *is* the range — writing its dates out too would pin the link
    // to whatever "Today" meant when it was saved, which is the whole bug.
    //
    // **And it is the range of the reading on screen, which is the only one a
    // link can carry.** There are four entries (`DateScope`) and one
    // `start`/`end`/`preset`, so the query string describes the page it was
    // copied off and nothing else — the same bargain as `sched=` and `rproj=1`
    // beside it, which say which reading that page is. On the way *in* the one
    // range seeds all four, which is the honest reading of one: `?preset=
    // Yesterday` means yesterday whichever reading it opens on, and they part
    // from there as the reader moves each. Carrying four would mean four
    // params to describe one screen, three of them about pages the recipient is
    // not looking at.
    if (activePreset) {
      p.set('preset', activePreset);
    } else {
      p.set('start', start);
      p.set('end', end);
    }
    if (detailsKey) p.set('player', detailsKey);
    // The club's page, which is `player=`'s twin: a page over whatever view is
    // behind it. The three are mutually exclusive in state (`showPage`), so at
    // most one of them is ever written and a link describes exactly one page.
    if (teamPageId !== null) p.set('team', String(teamPageId));
    // …and which side of the ball it is reading. Scoped to `team=`, which is
    // the page that draws it — a side with no club to be a side *of* would name
    // a reading that is not in force, the rule `cut=` and `mt=` follow — and
    // written only off the default.
    if (teamPageId !== null && teamSide === 'pitcher') p.set('tside', 'pitching');
    // …and the game's page, the third of the set and exclusive with both — so
    // at most one of `player`, `team` and `game` is ever written and a link
    // describes exactly one page. Its **tab** is not here, which is where both
    // other pages keep theirs: a tab is which reading of one subject is on
    // screen, where these three are which subject.
    if (gamePagePk !== null) p.set('game', String(gamePagePk));
    // Scoped to `player=`, which is the page that draws it — a cut with no
    // player to be a cut *of* would name a lens that is not in force, which is
    // the rule `proj=` and `mt=` already follow.
    if (detailsKey && statsCut) p.set('cut', statsCut);
    if (view !== 'summary') p.set('view', view);
    // Only meaningful on the research view, and 'batters' is its default.
    if (view === 'research' && researchPos !== 'batters') p.set('pos', researchPos);
    // Likewise, with the whole season as the default. A window is the one page
    // filter that goes in the URL: it decides which games the numbers are drawn
    // from, so a link without it would open on a different table.
    if (view === 'research' && researchWindow !== 'season') {
      p.set('win', String(researchWindow));
    }
    // Which reading of the board — thirty clubs rather than six hundred
    // players. Players is the default and is never written, so a bare research
    // link opens on the reading every other link in the app means.
    if (view === 'research' && researchTeams) p.set('board', 'teams');
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
    // Only once the reader has navigated off the period being played. Absent
    // means "current", which is a rule and not a value — so a link shared this
    // week opens on the week the recipient is in rather than on a frozen one.
    if (view === 'league' && matchupPeriod != null) p.set('mp', String(matchupPeriod));
    // Which of the League page's three tabs, and the Rankings span. Written
    // only on that view and only off their defaults, the rule every other
    // param here follows.
    if (view === 'league' && leagueTab !== 'scoreboard') p.set('lt', leagueTab);
    // Where the week is heading rather than where it has got to. Scoped to the
    // **matchup page**, which is the one place that draws it: the Scoreboard's
    // own toggle is gone (see `LeagueView`), Rankings has its own spans and
    // Transactions has no figures to project — so anywhere else this would be a
    // param naming a lens that is not in force — and a parameter that cannot
    // describe the page it opens is a parameter that lies about it.
    if (projLensPage && projected) p.set('proj', '1');
    // Which matchup is open **over** the view, which is a page rather than a
    // tab — so it is written whatever tab is behind it, and a link carrying it
    // opens that page the way `player=` opens a player's.
    if (view === 'league' && matchupId != null) p.set('mup', String(matchupId));
    // Which page *of* that matchup: a team id, absent meaning the Summary in
    // the middle. Written only alongside `mup=`, since it names a page of a
    // matchup rather than a page of the view — a `mt=` with no matchup to be a
    // side of would say nothing.
    if (matchupPageOpen && matchupTeam != null) {
      p.set('mt', String(matchupTeam));
    }
    // And which reading of that page. Scoped to `mt=` because a reading is a
    // reading *of a team page* — the matchup's own Summary page has none — and
    // written only off the default, the rule every param here follows.
    if (matchupPageOpen && matchupTeam != null && matchupReading !== 'roster') {
      p.set('mr', matchupReading);
    }
    // Omitted at the default, which is now the week being played — so a link
    // shared without one opens on the recipient's *own* current matchup rather
    // than on the sharer's, which is the same rule a date preset follows.
    if (view === 'league' && leagueTab === 'rankings' && rankWeek == null && rankSpan !== 'matchup') {
      p.set('lspan', rankSpan);
    }
    // **And the week, where the reader picked one instead.** The two are
    // alternatives rather than a pair — a week *is* the cut — so exactly one of
    // them is ever in a link, and `lspan=` above drops out while this is set.
    // Written only on the tab that draws the bar, the rule every param here
    // follows.
    if (view === 'league' && leagueTab === 'rankings' && rankWeek != null) {
      p.set('lwk', String(rankWeek));
    }
    // The Rankings tab's own lens, and **only on the span it can act on**: the
    // current matchup is the one span a projection has an answer for (there is
    // no projected season line), so anywhere else the param would name a lens
    // the recipient's table could not apply.
    if (
      view === 'league' &&
      leagueTab === 'rankings' &&
      rankWeek == null &&
      rankSpan === 'matchup' &&
      rankProjected
    ) {
      p.set('rankproj', '1');
    }
    if (simulate) p.set('sim', '1');
    if (hideInjured) p.set('hideil', '1');
    // The feed's own lens — one key, the row above being single-select.
    //
    // Gated on the **view** rather than on the view and the batter tab, and the
    // distinction is worth stating because the obvious rule is the other one: a
    // parameter that cannot narrow what a recipient opens has no business in a
    // link, so a control offered on one screen and not another might be expected
    // to drop out on the way over. This is a lens the reader set on the batter
    // tab and it is *still set*: the pitcher tab does not offer it (a pitcher's
    // item is an outing, not a play), and switching back puts it straight back in
    // force. Dropping it on the way over and re-adding it on the way back would
    // churn the query string on every kind switch to say the same thing.
    if (view === 'feed') {
      const plays = playFilterParam(playFilter);
      if (plays) p.set('plays', plays);
      if (feedNewOnly) p.set('newplays', '1');
    }
    // The days the board's `Starting` filter is set to, and **only where it is
    // in force**: a turn is a fact about a pitcher, so the control is not drawn
    // on the batting board or on the thirty clubs, and a param naming a filter
    // the recipient's page does not offer is a parameter that lies about it —
    // the rule `cut=`, `tside=` and `mr=` follow. The state survives the
    // crossing, so coming back to the pitchers finds the days still picked.
    if (
      view === 'research' &&
      researchKind === 'pitcher' &&
      !researchTeams &&
      turnDays
    ) {
      p.set('turn', turnDaysParam(turnDays));
    }
    // The mode and its span as one param, so it can never say a span with no
    // mode — see `scheduleSpan`. Absent is off, which is the only thing the
    // absence can mean.
    if (scheduleSpan !== null) p.set('sched', String(scheduleSpan));
    // The roster's projected reading — `rproj` rather than `proj`, which is the
    // League page's own and means a matchup. See `rosterProjected`.
    if (rosterProjected) p.set('rproj', '1');
    if (rosterSource === 'fantasy') p.set('roster', 'fantasy');
    if (helpOpen) p.set('help', '1');
    window.history.replaceState(null, '', `?${p.toString()}`);
  }, [
    start,
    end,
    activePreset,
    detailsKey,
    teamPageId,
    teamSide,
    gamePagePk,
    statsCut,
    view,
    researchPos,
    researchWindow,
    researchTeams,
    researchInclude,
    researchWatchlist,
    researchCols,
    researchKind,
    matchupPeriod,
    leagueTab,
    matchupId,
    matchupTeam,
    matchupReading,
    rankSpan,
    rankWeek,
    rankProjected,
    simulate,
    hideInjured,
    scheduleSpan,
    turnDays,
    rosterProjected,
    rosterSource,
    helpOpen,
    playFilter,
    feedNewOnly,
    projected,
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
    let canceled = false;
    setResearchLoading(true);
    setResearchError(null);
    const asked = researchTeams;
    ;(asked ? api.teamResearch(researchKind, researchWindow) : api.research(researchKind, researchWindow))
      .then((r) => {
        // Keyed off what came back rather than what was asked for, so a server
        // that fell back to the season (an unrecognized window from an older
        // link) caches under the window it actually served. The reading is the
        // one half of the key the answer does not carry — it is which route was
        // called — so it comes off the request.
        if (!canceled) {
          setResearch((prev) => ({
            ...prev,
            [`${asked ? 'team-' : ''}${r.kind}:${r.window}`]: r.rows,
          }));
        }
      })
      .catch((e: Error) => {
        if (!canceled) setResearchError(e.message);
      })
      .finally(() => {
        if (!canceled) setResearchLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [view, researchKind, researchWindow, researchTeams, researchCacheKey, research]);

  /**
   * **The boards let go of when the day moves.** Every one of them is a season
   * or a trailing window measured to *yesterday's* last out, so a cache kept
   * across a rollover is a league table missing a day of baseball — and the
   * cache above is deliberately a keep-forever one, since within a day it
   * cannot be wrong.
   *
   * **The board on screen is re-read; the rest are simply dropped.** Dropping
   * one nobody is looking at costs nothing and the next open pays for it,
   * which is the same laziness the read itself takes. Dropping the one *on*
   * screen would blank a megabyte of rows somebody is reading, so it is left
   * standing and overwritten when the answer lands — and the effect above,
   * finding its key still present, does not fire a second read of it.
   *
   * A board still in flight (no entry yet) is left to the read that is already
   * out: it was fired against this same day.
   */
  const refreshResearch = useCallback(() => {
    const onScreen = research[researchCacheKey];
    setResearch(onScreen ? { [researchCacheKey]: onScreen } : {});
    if (!onScreen || view !== 'research') return;
    const asked = researchTeams;
    ;(asked
      ? api.teamResearch(researchKind, researchWindow)
      : api.research(researchKind, researchWindow)
    )
      .then((r) =>
        setResearch((prev) => ({
          ...prev,
          [`${asked ? 'team-' : ''}${r.kind}:${r.window}`]: r.rows,
        })),
      )
      .catch((e: Error) => console.error('re-reading the board failed:', e.message));
  }, [research, researchCacheKey, view, researchKind, researchWindow, researchTeams]);

  /**
   * **The five boards the Stats tab's percentile badges are ranked within.**
   *
   * A percentile needs a population and the player page has none of its own —
   * `/api/players/:id/windows` is five boards reduced to one row each. Rather
   * than a second, server-side ranking rule that could only reach the raw
   * columns (better than half the board's are derived in `Column.value` and
   * exist nowhere on `ResearchRow`), that tab reads the **same boards the
   * research view reads**, through the very cache above: the rows it ranks are
   * then literally the rows the board ranks, and the two cannot disagree.
   *
   * It is lazy twice over — only when the ranks toggle is on, and only from
   * inside the Stats tab, which is the one place `PlayerWindowTable` mounts —
   * and it is cached by **kind and window, not by player**, so twenty player
   * pages in one tab pay for it once and a reader who has used the board has
   * already paid for part of it. Nothing upstream is touched: each board is
   * cached six hours on the server and pulled warm nightly by the warmer.
   *
   * The in-flight set is what stops five effects firing five duplicate reads of
   * the same window while the first is out; a failure is simply not cached, so
   * the next open tries again, and it is deliberately silent — a badge that
   * doesn't appear is the honest cost of a board that couldn't be read, where a
   * banner across a player page would be news about something else.
   */
  const rankPopulationsInFlight = useRef(new Set<string>());
  const loadRankPopulations = useCallback(
    /** `teams` picks the **club** boards, which is the only population a club's
     *  percentile means anything against — a team's home-run total against six
     *  hundred players ranks every one of the thirty at the very top and says
     *  nothing. Same cache, same key scheme as the research view's own
     *  (`team-` prefixed), so a reader who has opened that board has already
     *  paid for these. */
    (kind: PlayerKind, teams = false) => {
      for (const w of RESEARCH_WINDOWS) {
        const key = `${teams ? 'team-' : ''}${kind}:${w}`;
        if (research[key] || rankPopulationsInFlight.current.has(key)) continue;
        rankPopulationsInFlight.current.add(key);
        ;(teams ? api.teamResearch(kind, w) : api.research(kind, w))
          .then((r) =>
            setResearch((cur) => ({
              ...cur,
              [`${teams ? 'team-' : ''}${r.kind}:${r.window}`]: r.rows,
            })),
          )
          .catch((e: Error) => console.error('reading a board for ranks failed:', e.message))
          .finally(() => rankPopulationsInFlight.current.delete(key));
      }
    },
    [research],
  );

  // Load the season's player list once, for search/autocomplete.
  useEffect(() => {
    let canceled = false;
    setPlayersLoading(true);
    setError(null);
    api
      .players()
      .then((r) => {
        if (!canceled) setSeasonPlayers(r.players);
      })
      .catch((e: Error) => {
        if (!canceled) setError(e.message);
      })
      .finally(() => {
        if (!canceled) setPlayersLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, []);

  /**
   * **The thirty clubs**, read once beside the player list and for the same
   * reason: three surfaces want to name a club they have only an id for — the
   * header search's team rows, the link off a player's Overview, and the team
   * page's own head — and every one of them wants it immediately.
   *
   * A failure costs the clubs and nothing else. It is deliberately **not** on
   * `setError`, which raises the app's own banner: the banner is for a roster
   * or a report that could not be read, and a missing team table means a search
   * that finds no clubs and a link that is not drawn, both of which are quiet
   * absences rather than a broken page.
   */
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  useEffect(() => {
    let canceled = false;
    api
      .teams()
      .then((t) => {
        if (!canceled) setTeams(t);
      })
      .catch((e: Error) => console.error('reading the clubs failed:', e.message));
    return () => {
      canceled = true;
    };
  }, []);
  /** …by id, which is how every one of those three reaches one. */
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

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
    let canceled = false;
    api
      .watchlist()
      .then((keys) => {
        if (!canceled) setWatchlistKeys(new Set(keys));
      })
      .catch((e: Error) => console.error('watchlist unavailable:', e.message));
    return () => {
      canceled = true;
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

  /**
   * The sequence number is what `loadFantasyRoster` carries and is here for the
   * same reason in a sharper shape: **several report reads are in flight at
   * once on an ordinary load**, and without it the slowest one wins whatever it
   * is about. The effect below fires on the range, the saved roster and the
   * ESPN status settling, and then again the moment `usingFantasy` flips — so
   * a `saved` read begun on a roster of nobody can land *after* the `fantasy`
   * read that replaced it and set the report back to an empty list.
   *
   * That is not a corner: it is exactly what accepting an invite does. The
   * saved reads are fired against an empty roster while the join is still in
   * flight, the fantasy read that follows the team pick is a cold ESPN league
   * plus a cold report, and a page drawn from the loser of that race is a
   * fantasy team with nobody on it — which is what "two tabs and no page
   * content" was. The same race is reachable from the fantasy popover's own
   * toggle, so the guard is on the read rather than on the flow.
   *
   * `quiet` refreshes in the background (live polling) without flashing the
   * loading UI; the foreground load on date/roster change is not quiet.
   */
  const reportRead = useRef(0);
  const reportInFlight = useRef(0);
  const loadReport = useCallback(
    (quiet = false, refresh = false) => {
      if (!quiet) {
        reportInFlight.current += 1;
        setReportLoading(true);
      }
      const seq = ++reportRead.current;
      return api
        .report(start, end, usingFantasy ? 'fantasy' : 'saved', refresh)
        .then((r) => {
          if (seq === reportRead.current) setReports(r.players);
        })
        .catch((e: Error) => {
          // A stale failure is no more worth bannering than a stale answer is
          // worth drawing — the read that superseded it is the one on screen.
          if (seq === reportRead.current) setError(e.message);
        })
        .finally(() => {
          // The wait is cleared when the **last** foreground read finishes
          // rather than when any one of them does: a stale response clearing
          // it would take the block wait off a page that still has nothing on
          // it, which is the same blank the guard above exists to prevent,
          // arrived at from the other side. A count rather than the sequence
          // number, because a quiet poll bumps that and never touches this.
          if (!quiet && --reportInFlight.current === 0) setReportLoading(false);
          // Settled either way — a failed read still counts as an answer, so
          // the tab pills below don't wait forever for one that isn't coming.
          // Setting this to `true` on every call (quiet ones included) is a
          // no-op once it already is, which is the whole of "at least once".
          setReportSettled(true);
        });
    },
    [start, end, usingFantasy],
  );

  // Refresh report when the date range, the roster, or which list is being
  // read changes. `roster` is still a dependency in fantasy mode — it costs
  // one refetch on a change that can't happen while the editor is hidden, and
  // dropping it would mean a switch back showing the pre-edit list.
  useEffect(() => {
    /**
     * **The saved preference decides which roster this is about, so the first
     * read waits for it** — unless the URL has already said, in which case
     * nothing `/api/prefs` can hold could change the answer.
     *
     * Without it every plain visit spent its most expensive request on the
     * wrong list. `rosterSource` starts at `saved` because that is the default
     * a URL with no `roster=` on it means, the effect fired on the very first
     * render, and `/api/prefs` then landed with `fantasy` and fired it again —
     * so a fantasy user's boot was **two** full report reads, the first of them
     * about a roster nobody was going to be shown. Measured on the live app,
     * bare URL: `/api/report?…` at 38ms and `/api/report?…&source=fantasy` at
     * 48ms, against one read on the same load with `roster=fantasy` in the URL.
     * The wasted one is not free anywhere and is least free where it hurts —
     * cold, it is seconds of MLB data, and it competes with the real read for
     * the one Lambda behind them both.
     *
     * What it costs is one round trip on a load whose answer is `saved`, and
     * `/api/prefs` is a single small read fired at the same instant the report
     * would have been. The saved-roster user waits for that and nothing else.
     *
     * This is the same argument as the line below it, one question earlier: a
     * session that opens on `roster=fantasy` waits for the connection status,
     * because firing now would read the saved watchlist, render it, and replace
     * it a moment later — a flash of the wrong list of players, which is worse
     * than a slightly longer wait. The preference deserved the same treatment
     * and had never been given it.
     */
    if (!prefsSettled && !rosterSourceFromUrl) return;
    if (rosterSource === 'fantasy' && !espnStatusSettled) return;
    /* And a session that opens on `?preset=Matchup` waits for the league to say
       which days those are. It is the same argument as the two lines above it
       — a read fired now would be about a range nobody is going to be shown,
       and would be replaced a moment later by the one they asked for — with the
       difference that here the *dates* rather than the roster are the thing not
       yet known. It costs nothing to anybody else: `matchupFromUrl` is false on
       every load that did not name the preset. */
    if (matchupFromUrl && !matchupWindowSettled) return;
    loadReport();
    // `fantasyTeamId` because the report is *about* that team's players: pick a
    // different one on the Fantasy league page and this is what re-reads it.
  }, [
    loadReport,
    roster,
    rosterSource,
    prefsSettled,
    rosterSourceFromUrl,
    espnStatusSettled,
    matchupFromUrl,
    matchupWindowSettled,
    fantasyTeamId,
  ]);

  /**
   * **The roster's projection**, read on the first press of `Projected` and
   * whenever the days, the roster or which list it is change.
   *
   * Every parameter it takes is one `/api/report` takes, and the server
   * resolves the roster the same way — so the lines this describes are the rows
   * that report describes, which two answers to "which players" a moment apart
   * could not promise.
   *
   * **Never over data**, the app's own rule: the last answer is left standing
   * while the next is in flight, so changing the range does not blank a table
   * somebody is reading, and the only mark the press leaves is the ball inside
   * the toggle that started it. A **failed** read costs the lens its figures
   * and nothing else — the table falls back to the report's own numbers rather
   * than the page becoming a message, which is the direction the schedule
   * window already fails in.
   */
  const projRead = useRef(0);
  const loadRosterProjection = useCallback(
    (quiet = false) => {
      // Sequence-numbered rather than canceled per run, which the poll below is
      // what makes necessary: two reads can now be in flight at once — the one
      // the range change fired and the one the twenty-second tick did — and the
      // rule is the app's own, that only the newest may write.
      const seq = ++projRead.current;
      if (!quiet) setRosterProjLoading(true);
      return api
        .rosterProjection(start, end, usingFantasy ? 'fantasy' : 'watchlist', fantasyTeamId)
        .then((p) => {
          if (seq === projRead.current) setRosterProjection(p);
        })
        .catch((e: Error) => {
          if (seq === projRead.current) console.error('reading the roster projection failed:', e.message);
        })
        .finally(() => {
          if (seq === projRead.current && !quiet) setRosterProjLoading(false);
        });
    },
    [start, end, usingFantasy, fantasyTeamId],
  );

  useEffect(() => {
    if (!rosterProjected) {
      // Turning the lens off while a read is in flight discards its answer —
      // and a flag left true is a ball spinning for ever inside a toggle that
      // is no longer doing anything. Clearing it here is what makes the mark
      // say what it means.
      projRead.current += 1;
      setRosterProjLoading(false);
      return;
    }
    loadRosterProjection();
  }, [rosterProjected, loadRosterProjection, roster]);

  /**
   * **Turning the lens on moves the reader to the days it is about**, which is
   * the whole of what the toggle does past swapping the figures: a projection
   * over "Yesterday" is a projection of nothing, so pressing it opens on the
   * days there are still games in — the rest of this matchup period where a
   * league says what that is, and the week ahead where none does.
   *
   * The reader is free to move off it: the date control is untouched, so
   * picking a single future day narrows the projection to that day's games and
   * a past range projects nothing and reads as it always did. **Those days are
   * the lens's own** (`DateScope`), so moving them costs the stats table
   * nothing and turning the lens off has nothing to put back — where the same
   * press used to save a range on the way out and write it back on the way in.
   *
   * **What the lens's entry remembers, and for how long: nothing, and no time
   * at all.** It is **re-derived on every press**, which is the one place this
   * file's own "each reading keeps its own days" is deliberately not carried
   * through, and the reason is the rule one paragraph down: a lens is put away
   * when its page leaves the screen. A remembered projected range would be an
   * answer to a question that has already been retracted — and a *stale* one,
   * "the rest of this period" derived on Tuesday being three played days by
   * Friday, which is precisely the reading the lens is not for. The seed is
   * what the toggle promises in its own tooltip (*open on the days there are
   * games in*), and it is owed on the second press as much as on the first.
   * What the entry buys is the other half: while the lens **is** on, the days
   * are its own and the stats table's are untouched.
   *
   * **Seeded by name rather than through `setRange`.** The scope moves on the
   * commit this press causes, so at the moment the callback runs the ref still
   * says `summary` — and `setRange` writes whatever the ref says. Writing
   * `projected` by name is the same rule the reset below already follows, one
   * scope over.
   *
   * **The Schedule view goes off with it**, and that is exclusivity rather than
   * tidiness: that mode replaces the stat *columns* with days and this replaces
   * the *figures* in them, so they are two readings of one set of cells and
   * cannot both be in force. Its own days are left where they are — an entry is
   * put away, not thrown away.
   */
  const toggleRosterProjected = useCallback(() => {
    // Back to the table first, for the reason the Schedule toggle does it: this
    // is a reading of the stat columns and the stream has none. Harmless when
    // the reader is already there, and it must come before the state below —
    // the `view !== 'summary'` reset would otherwise fire on the same commit
    // and put the lens straight back out.
    setView('summary');
    setRosterProjected((on) => {
      if (on) return false;
      const today = baseballToday();
      // The rest of this matchup period where the league publishes one — which
      // is the span a manager plans in — and the week ahead where it does not.
      // `end` is clamped forward of today either way, a period whose last day
      // has passed being nothing to project.
      const to = matchupWindow?.end ?? addDays(today, 6);
      const days = { start: today, end: to < today ? today : to, preset: null };
      setRanges((prev) => ({ ...prev, projected: days }));
      setScheduleSpan(null);
      return true;
    });
  }, [matchupWindow]);

  /**
   * **Leaving the Roster puts the lens away**, exactly as pressing the toggle a
   * second time would.
   *
   * This is the lens-for-an-afternoon rule the state itself already states,
   * carried one step further than "not a saved preference". Not saving it keeps
   * next week's estimates out of tomorrow's session; it does nothing about the
   * one this app is most exposed to, because **the Roster is where every other
   * page comes back to**. Measured before this: press `Projected` on `Today`,
   * cross to the Feed and come back, and the table is still six days of tenths
   * over `8/19 – 8/23` — and the same after Research and after League. The date
   * range is the reason it matters more here than on either League lens: this
   * toggle is the only one of the three that *moves* the days in view, so a
   * lens left on is also a roster stranded in a week with no stats in it.
   *
   * **A navigation, not a load.** The param is untouched on the way in —
   * `?rproj=1` is in the URL precisely so a link describes the table it opens,
   * and the seed above still reads it. What this ends is the lens *outliving a
   * crossing of the view tabs*. It also takes `rproj=1` out of the URL of every
   * page that is not the roster, which it had no business being in: the Feed
   * has no such reading, and a link copied off it claimed one.
   *
   * **And it puts nothing back, where it used to restore a range by name.** The
   * lens has an entry of its own now, so the stats table's days were never
   * moved and there is nothing to move back; the paragraph that stood here —
   * *the range is written to `summary` by name rather than through `setRange`,
   * because by the time this runs the view has already changed* — was the
   * record of a hazard that no longer exists. The rule it stated is still live
   * one function up, where the lens's own seed writes `projected` by name for
   * the mirror-image reason.
   *
   * **The player page is not a leaving.** It is an overlay over this view, the
   * URL still names the roster, and closing it returns to the same table at the
   * same scroll — so tapping a name to read a projection and coming back must
   * not cost the lens and jump the range back a week. `view` is what this
   * watches, and a `player=` opens without changing it.
   */
  useEffect(() => {
    if (view === 'summary' || !rosterProjected) return;
    setRosterProjected(false);
  }, [view, rosterProjected]);

  /**
   * **The two League lenses go away with their pages**, which is the rule above
   * carried to the two it was written for and deliberately not applied to.
   *
   * The rule it settles on is one sentence: **a page opens measured unless a
   * link says otherwise.** A lens is a press, and a press is about the page it
   * was made on; a lens still in force on a page the reader has just opened is
   * a table of guesses nobody asked for. That is the shape all **four** of this
   * app's projected lenses now have — the Roster's on a crossing of the view
   * tabs, the matchup's on the matchup page closing, the Rankings' on leaving
   * the Rankings tab, and a matchup team page's (`teamProjected`, state inside
   * `LeagueMatchup`) on the overlay unmounting, which it already did.
   *
   * **What this overturns, and why.** The Roster's rule was written with three
   * reasons for stopping there, and they are recorded in *Client — the Roster
   * view* as reasons rather than deleted: the roster's lens is the only one of
   * the three that *moves the days in view*; the Roster is a destination where
   * `lt=rankings` and `mup=` are each opened on purpose; and the two League
   * lenses are read against each other, so a rule that reset them on the way
   * out would have to answer why it does not reset them on the way between. The
   * first two are arguments that the roster's case is the **worst**, not that
   * the other two are harmless — a manager reading dashed cards as scores is
   * the same fault whether or not the calendar moved with it. The third is the
   * real one, and this answers it rather than dodging it: it **does** reset on
   * the way between, because on the way between the reader is *opening a page*,
   * and one press is what a page they chose to open costs. Left as it was, the
   * cost ran the other way — the Rankings lens survived `League` → `Roster` →
   * `League` (the tab is remembered), and the matchup lens survived a card
   * closing, so the next card opened dashed with nothing pressed.
   *
   * **A page over a page is not a leaving**, the precedent the Roster's rule
   * already sets for `player=`. A matchup page opened over the Rankings tab
   * leaves `view` and `leagueTab` where they are, and a player page opened over
   * a matchup leaves `matchupId` where it is — so neither costs the lens
   * underneath it, and both come back to the table they covered.
   *
   * **A sub-selection inside a page is not a leaving either.** The Rankings
   * span strip is the case: `rankproj=1` is written only on the span it can act
   * on, so `Season` and back is a round trip the URL already describes (see
   * *Client — the League rankings*), and resetting on it would be this rule
   * reaching inside a page rather than around it — the same reason the Roster's
   * lens survives a kind tab. The alternative considered was mirroring the URL
   * gate exactly, so state and query string could never disagree; it was
   * rejected for that, and because the gate has a `rankings.projectable` in it
   * that arrives **after** the link does, and a reset watching fetched data
   * would put out a lens an inbound link had just lit.
   *
   * **Navigation only, never a load.** Both tests are made of state seeded
   * synchronously from the URL (`view`, `mup=`, `lt=`), so an inbound
   * `?view=league&mup=12&proj=1` or `?view=league&lt=rankings&rankproj=1` is
   * already on its own surface on the first render and nothing fires. What
   * these end is a lens outliving the page it was pressed on.
   */
  useEffect(() => {
    // The matchup page and the board it opens from are where `proj=1` is drawn,
    // written and read (see the URL sync and the projection's own effect, both
    // gated on this same test), so this is the reader leaving *both* of them
    // rather than one being covered by the other — crossing to Rankings,
    // Transactions or another view puts the lens away, and opening a card over
    // the board does not.
    if (!projected || projLensPage) return;
    setProjected(false);
  }, [projLensPage, projected]);

  useEffect(() => {
    // The tab, not the span: see above. The rankings read (up beside the
    // scoreboard's) is gated on the tab too, so putting the lens away off it
    // costs no request — the live table is read on the next entry, which is the
    // read that entry was going to make anyway.
    if (!rankProjected || (view === 'league' && leagueTab === 'rankings')) return;
    setRankProjected(false);
  }, [view, leagueTab, rankProjected]);

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
  /**
   * Open a player's page from a **transaction row**, which names him by MLB id
   * and by nothing else.
   *
   * The app keys a player page on `${kind}-${id}`, and a transaction has no
   * kind in it: ESPN's activity feed says a player moved, not whether he
   * pitches. So the kind is resolved against the season roster the header
   * search already holds — the same list `detailsPlayer` falls back to when it
   * resolves a `player=` key — and a two-way player, who appears on it once per
   * kind, opens on his batting page, which is the same thing a bare id in an
   * old link has always done (`readKeys`).
   *
   * A player that list has never heard of opens nothing, which is
   * `detailsPlayer`'s own standing behavior rather than a rule invented here:
   * it renders the page only for a key one of its two sources can resolve.
   */
  const openLeaguePlayer = useCallback(
    (mlbId: number) => {
      const hit = knownPlayers.find((p) => p.id === mlbId);
      openPlayer(playerKey({ id: mlbId, kind: hit?.kind ?? 'batter' }));
    },
    [knownPlayers, openPlayer],
  );

  const refreshFantasy = useCallback(() => {
    // The League page's transactions feed goes with it — a move made on ESPN is
    // exactly what changes one, and it is the one thing no cache can know
    // about. It **asks** rather than being dropped, which is two corrections to
    // what stood here: `?refresh=1` is what actually reaches past the server's
    // own cache (clearing the client copy only ever re-read the same cached
    // answer), and setting the result rather than blanking first is rule 1 —
    // the feed stays readable while the read is out, where a null left the tab
    // empty until the reader navigated away and back. Only when there is a feed
    // to refresh: a reader who has never opened the League page is not made to
    // pay for one by pressing this. The scoreboard and the rankings re-read on
    // entry and on the poll's own tick, so neither needs a request from here.
    if (transactionsRef.current) {
      api
        .espnTransactions(true)
        .then(setTransactions)
        .catch((e: Error) => console.error('refreshing transactions failed:', e.message));
    }
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
    // `MIN_SPIN`, for the measured reason it exists: a warm league answers in
    // milliseconds, and a menu row that flickers and settles reads as a press
    // that did nothing.
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
  /* That "lone Research pill" rule is right for a genuinely empty roster and
     was wrong for the half-second before the first report has even answered:
     `displayReports.length > 0` is false in both cases, so the bar drew
     Research alone on every load and only gained Roster/Feed (and League,
     below) once the read came back — a tab row that looked broken rather than
     one that was deliberately saying "nothing watched yet".

     `reportSettled` is what tells the two apart, and `espnStatusSettled` is
     folded into the same gate rather than left on its own: `espnConnected`
     alone would have the pills settle in two waves — three, then a fourth a
     beat later for League — which is the same flicker moved one request
     later. Both settle on their own schedule (independent GET requests fired
     on mount) and either can be the slower of the two, so the pills wait on
     whichever finishes last. Nothing about the ordinary loading state pays
     for it: the block wait and the `Updating` badge below are gated on
     `showLoading`/`reportLoading` and `isRosterView(view)`, not on this, so a
     slow read still shows its own "Reading your roster's games" regardless of
     where the pills stand. */
  const initialLoadSettled = reportSettled && espnStatusSettled;
  /**
   * **The projection rides the same tick**, because a projection of a day being
   * played is a figure that moves: the server projects only the games that have
   * not started, so every first pitch takes a game out of the estimate and puts
   * it on the report beside it, and an inning's runs cross from one half of the
   * row to the other. Left un-re-read, the lens froze at the moment it was
   * pressed while the report under it went on updating — the one state where
   * the two halves of a row are drawn from different minutes, and the row
   * counts a game twice.
   *
   * **Quietly**, which is rule 1: no ball in the toggle, no blank cells, the
   * last answer standing until the next lands. And on the *same* timer as the
   * report rather than one of its own, so the played half and the projected
   * half of every row move together.
   *
   * The lens is read off a ref rather than named in the deps: the report's own
   * clock is not the lens's to reset, and a dep would restart the twenty
   * seconds on every press of a button that has nothing to do with polling.
   */
  const projectedRef = useRef(rosterProjected);
  useEffect(() => {
    projectedRef.current = rosterProjected;
  });
  useEffect(() => {
    if (!hasRealLiveGame) return;
    const t = setInterval(() => {
      loadReport(true);
      if (projectedRef.current) loadRosterProjection(true);
    }, LIVE_POLL_MS);
    return () => clearInterval(t);
  }, [hasRealLiveGame, loadReport, loadRosterProjection]);

  /**
   * **Reopening the app shows what a reload would show.**
   *
   * The case this answers, in the words it was reported in: *"I had my roster
   * open yesterday to the Today date, but when opening it today I still saw
   * yesterday."* An iPhone home-screen PWA is **suspended, not unloaded** — iOS
   * hands the page back with every byte of state it had, which is right for the
   * scroll position and the open dialog and wrong for everything measured
   * against a clock. Nothing in this app was watching for the return, so a
   * session begun on Tuesday went on being a Tuesday session for as long as the
   * icon was tapped, quietly, under a date bar that said `Today`. A desktop tab
   * left open across 3am ET had the same fault the slow way.
   *
   * Two halves, and the first is the one the report was about:
   *
   * - **The clock moves**, which re-derives every preset-backed range through
   *   `presets` (see `today`, and the effect beside `rosterPresets`). This is
   *   free — a string compare — and is what puts `Today` back on today.
   * - **What is on screen is re-read**, quietly and in the order the app itself
   *   would have read it. Every call below is one the app already makes on an
   *   entry or a tick; none of them is new machinery, and each carries its own
   *   failure handling, so a resume with no signal leaves the page exactly as
   *   it was rather than turning it into an error.
   *
   * **A day-rollover re-reads two more things**, gated because they are the
   * expensive ones and the day is the only thing that can move them: the
   * schedule window (days *ahead of today*, so a day old is a played game in
   * the first column) and the research boards (a season measured to yesterday's
   * last out, and a megabyte a piece — see `refreshResearch` for why the one on
   * screen is overwritten and the rest are dropped).
   *
   * **The report is re-read on every resume, rollover or not**, and the
   * duplicate that a rollover therefore fires is deliberate rather than
   * overlooked: the range moves in a later commit, so the quiet read here goes
   * out on the *old* days and the effect's goes out on the new ones. It costs
   * one 40ms request a day, it is the only thing covering a **custom** range on
   * a new day (whose dates do not move, so nothing else re-reads it), and it
   * cannot land wrong — `loadReport` sequence-numbers, and the stale one was
   * issued first, so only the newer may write.
   *
   * The League view is **not** here and that is not an omission: its three tabs
   * run their own minute-by-minute poll, which already fires immediately on
   * becoming visible (`LEAGUE_POLL_MS`). Two refreshes of one board would be
   * two requests for one answer.
   */
  const refreshOnResume = useCallback(() => {
    const now = baseballToday();
    const rolled = now !== today;
    setToday(now);
    loadReport(true);
    if (projectedRef.current) loadRosterProjection(true);
    // Which players are where in today's lineup, and who moved overnight. Both
    // leave their last answer standing while the read is out.
    if (usingFantasy) loadFantasyRoster();
    // Gated exactly as its own effect is — a request for a map only these two
    // surfaces draw is a request the roster views would never make.
    if (view === 'research' || detailsKey !== null) loadStatuses();
    void loadRecentNews();
    if (rolled) {
      refreshSchedule();
      refreshResearch();
    }
  }, [
    today,
    loadReport,
    loadRosterProjection,
    usingFantasy,
    loadFantasyRoster,
    view,
    detailsKey,
    loadStatuses,
    loadRecentNews,
    refreshSchedule,
    refreshResearch,
  ]);
  useResumed(refreshOnResume);

  // Show a "back to top" button once the user has scrolled down a screenful.
  const [showBackToTop, setShowBackToTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // How far the feed's Recent section has been paged out, keyed exactly as the
  // component itself is (kind + range) so it still resets when either of those
  // changes, which is the rule that has always governed it. What it no longer
  // resets on is a **view** switch, and that is the point: the count decides
  // how tall the page is, so a reader who had pressed "Load more" twice and
  // gone to the board came back to twenty items and to a remembered offset the
  // page no longer had the room for — the one way the memory below could be
  // exactly right and still land short. A ref rather than state: the live
  // value lives in the component that grows it, and App only has to hand the
  // same number back when it mounts again.
  const feedShown = useRef(new Map<string, number>());
  // `feedOpenKeys` used to live here — the set of expanded at-bats, outings and
  // upcoming rows, lifted to App so a floating "collapse all" could clear them.
  // All three open a dialog now rather than unrolling in place, so there is one
  // open thing at a time, it is held by the item that opened it, and the button
  // that undid a session's worth of them has nothing left to undo. The feed has
  // no collapsibles at all, so App holds no expansion state for any view.

  // Queued behind whatever else is writing to the user's record — the pick this
  // press also records, above all. See `queueUserWrite`.
  const onAdd = async (p: WatchPlayer) => {
    setRoster(await queueUserWrite(() => api.addPlayer(p)));
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

  /*
   * **A player's name opens his page, exactly as his headshot does.**
   *
   * It used to jump: switch to the feed, turn the grouping on, expand his card
   * and scroll to it — a cross-page navigation that needed a back button of its
   * own, a `scrollPlaced` flag to keep the page memory from undoing the scroll,
   * and `expandedKeys` in the URL to say which card was open. All of that was
   * the machinery of getting to one player's day on a page that is about a
   * roster. The day is on the player page now, so the name is a plain
   * `setDetailsKey` and every one of those pieces is gone: no `backView`, no
   * `goBack`, no float Back button, no `scrollToPlayer`, no `toggleCollapsed`,
   * no `expanded=`.
   *
   * It is also strictly better where the old jump was weakest — the name in the
   * summary table's *pitcher* tab used to land on the feed's pitcher tab, and a
   * name on the research board had no jump at all, the board's rows being
   * players nobody has rostered. The page opens on anybody.
   */
  // Positions come from the season roster; look them up by id for each report.
  const positionById = useMemo(
    () => new Map(knownPlayers.map((p) => [p.id, p.position])),
    [knownPlayers],
  );
  /* Handedness off the same list and by the same trick — two more leaves on a
     request this app already makes at boot, which is what lets a fact about
     *who a player is* reach the research board's strangers at all. One entry
     per person carrying both facts (a two-way player is two rows of that list
     under one id, and they agree), with the reader picking the half it draws. */
  const handById = useMemo(
    () => new Map(knownPlayers.map((p) => [p.id, { bats: p.bats, throws: p.throws }])),
    [knownPlayers],
  );
  /**
   * **Who has a page on both sides of the ball** — the ids the season roster
   * lists under two kinds, which is MLB's own `Y` primary position arriving in
   * the app's currency (`espn.ts::kindsOf`, `store.ts`'s season read).
   *
   * It is read off the **same list** the two maps above are, and for the same
   * reason: a fact about *who a player is* has to reach a man nobody has
   * rostered, and this list is the only one at boot that carries everybody. It
   * is what the player page's Batting/Pitching switch is drawn on — a control
   * that must not appear for the 1,300-odd players who have only one page,
   * where it would offer a reading that does not exist.
   *
   * A `Set` rather than a per-id list of kinds: the only question anybody asks
   * of it is *is there another one of him*, the other kind being the one this
   * page is not (there are two).
   */
  const twoWayIds = useMemo(() => {
    const seen = new Map<number, PlayerKind>();
    const both = new Set<number>();
    for (const p of knownPlayers) {
      const had = seen.get(p.id);
      if (had === undefined) seen.set(p.id, p.kind);
      else if (had !== p.kind) both.add(p.id);
    }
    return both;
  }, [knownPlayers]);
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
      knownPlayers.find((p) => playerKey(p) === detailsKey);
    if (!src) return null;
    return {
      id: src.id,
      name: src.name,
      savantName: src.savantName,
      kind: src.kind,
      position: positionById.get(src.id),
    };
  }, [detailsKey, reports, knownPlayers, positionById]);
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

  /** The boards the Stats tab's percentile badges are ranked within, for
   *  whichever player's page is open — the same per-kind, per-window cache the
   *  research view fills, keyed by window as a string because that is the
   *  currency `PlayerWindowRow.window` deals in. Only the windows that have
   *  landed are in it; a missing one draws no badges rather than an empty
   *  set. */
  const detailsRankPopulations = useMemo(() => {
    const out: Partial<Record<string, ResearchRow[]>> = {};
    if (!detailsPlayer) return out;
    for (const w of RESEARCH_WINDOWS) {
      const rows = research[`${detailsPlayer.kind}:${w}`];
      if (rows) out[String(w)] = rows;
    }
    return out;
  }, [detailsPlayer, research]);
  /** …and the request for the ones that haven't. Bound to the open player's
   *  kind here so the tab itself needs to know nothing about boards. */
  const loadDetailsRankPopulations = useCallback(() => {
    if (detailsPlayer) loadRankPopulations(detailsPlayer.kind);
  }, [detailsPlayer, loadRankPopulations]);

  /** The same pair for a **club's** Stats tab, off the team boards. Written out
   *  rather than folded into the two above because the key differs and the
   *  side it is bound to is the team page's own control, not the open player's
   *  kind. */
  const teamRankPopulations = useMemo(() => {
    const out: Partial<Record<string, ResearchRow[]>> = {};
    if (teamPageId === null) return out;
    for (const w of RESEARCH_WINDOWS) {
      const rows = research[`team-${teamSide}:${w}`];
      if (rows) out[String(w)] = rows;
    }
    return out;
  }, [teamPageId, teamSide, research]);
  const loadTeamRankPopulations = useCallback(() => {
    loadRankPopulations(teamSide, true);
  }, [teamSide, loadRankPopulations]);

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
  /**
   * **The roster views show one list, batters and pitchers together.**
   *
   * There was a tab row here and a `kind=` param behind it, on the reasoning
   * that "a batter card and a pitcher card have nothing in common to scan
   * down". That is true of the *columns* and false of the *roster*: a manager
   * asking what his team did today is asking about nine batters and two
   * pitchers, and answering in two halves made him press a tab to find out
   * whether the other half had done anything. Both surfaces already knew how
   * to draw the two together — `SummaryTable` has stacked a `BatterTable` and
   * a `PitcherTable` in one scroller since it was written, and the feed's
   * sections are built from per-player entries that never cared which kind
   * they came from — so what went was the filter above them, not any drawing
   * code.
   *
   * No sort here: the table splits this itself and the feed sorts by clock.
   */
  const viewCards = shownReports;
  /**
   * **Who, of the rows the roster views are showing, is starting** — as a set of
   * player keys, for the divider the summary table's `Total` row has become
   * (`SummaryTable.tsx::splitStarters`). Null is *the app cannot say*, and there
   * the row goes back to the bottom over everybody.
   *
   * This was the `Starters` filter's own list, and the filter is gone; what
   * survives it is the half the divider needs, with every edge case below the
   * one that filter was argued into. **The reading still changes with the
   * roster**, because the question does. On your own saved roster "starting"
   * is tonight's MLB lineup card — a hitter in a posted lineup, a pitcher named
   * as today's starter, the same `lineupStatus`/`pitchingRole` fields the pip on
   * his headshot is drawn from. Reading your **fantasy** team it is *your*
   * lineup: a man you have started is a start whether or not his real manager
   * wrote him in, since he is accruing you a zero tonight, and a man on your
   * bench is not one however MLB has him batting, since he accrues you nothing.
   * Deliberately **not** the union of the two, which is "starting for anyone" —
   * a set that answers no question anybody asks of this table.
   *
   * `fantasySlots` is null in saved-roster mode, which is what leaves that mode
   * on the MLB reading. It is *also* null while the roster read is in flight or
   * after it has failed, and falling back to the MLB test there is the right
   * direction to fail in: the alternative is a divider that claims nobody is
   * starting when the truth is that the app has not been told yet.
   *
   * **A range is a range of lineups**, so the fantasy tiers ask the question a
   * day at a time (`lib.ts::projectStarters`, the per-day map where there is one
   * and the single end-of-range answer where there is not) — a man you started
   * on Monday and benched on Wednesday is a starter over a range containing
   * Monday. A matchup's team pages run that identical arithmetic over a
   * leaguemate's lineup, which is why it is shared rather than written here.
   *
   * `startersKnown` is what gates it: over a range with no today in it and no
   * per-day lineups there is nobody this could name, and the divider goes back
   * to the bottom rather than drawing a line it cannot justify.
   */
  const starterKeys = useMemo(() => {
    if (!startersKnown) return null;
    const cards =
      fantasyLineups || fantasySlots
        ? projectStarters(
            viewCards,
            rangeDates,
            fantasyLineups,
            (r) => fantasySlots?.get(playerKey(r))?.starting === true,
          )
        : viewCards.filter((r) => isStartingOn(r, baseballToday()));
    return new Set(cards.map(playerKey));
  }, [viewCards, startersKnown, fantasySlots, fantasyLineups, rangeDates]);

  /**
   * **The two numbers the red `N new plays` button is made of** — how many plays
   * are newer than the marker, and the timestamp of the newest one.
   *
   * Computed here rather than in `LiveFeed` because App owns both halves of the
   * feature: it holds the marker, it persists it, it merges the saved one on
   * arrival, and it is what turns the `New` filter off — which is the act that
   * marks the stream read, and so needs the timestamp. `newPlays` is exported
   * from `LiveFeed` so the clock that orders the stream has one definition, the
   * rule `playerDayEntries` already sets for the stream and the player page.
   *
   * **Off `viewCards` rather than off whatever the reader's lens has left on
   * screen**, so the count is news about the day rather than about the lens: a
   * ticked chip must not make the plays it hides stop being new.
   *
   * **The batter feed only**, since a pitcher's stream item is his whole outing
   * rather than a play — the same fact the kind tabs exist for.
   */
  /**
   * **Whether the feed has any batter plays to narrow**, which is what the play
   * pills and the new-plays machinery are about. It was `shownKind === 'batter'`
   * while the stream was one kind at a time; the stream is both kinds now, so
   * the question is no longer *which tab* but *is there anything of that shape
   * on it*. A roster of nothing but pitchers still draws a feed — outings,
   * upcoming starts — and still has no plays to filter, so the pills stay off
   * it rather than offering six lenses over a list none of them can touch.
   */
  const feedHasBatters = view === 'feed' && shownReports.some((r) => r.kind !== 'pitcher');
  const { count: newPlayCount, newest: newestPlayTs } = useMemo(
    () =>
      feedHasBatters ? newPlays(viewCards, seenPlays) : { count: 0, newest: 0 },
    [feedHasBatters, viewCards, seenPlays],
  );

  /**
   * Mark the stream read up to the newest play in view.
   *
   * The write is a **watermark that only moves forward** server-side, so a
   * marker that would not move costs no write at all — which is what makes it
   * safe to call from a range excursion into last week, where the newest play on
   * screen is older than what the reader has already seen.
   */
  const markPlaysSeen = useCallback(
    (ts: number) => {
      if (ts <= 0) return;
      seenPlaysTouched.current = true;
      setSeenPlaysState((cur) => (ts > cur ? ts : cur));
      queueUserWrite(() => api.saveSeenPlays(ts)).catch((e: Error) =>
        console.error('saving seen-plays failed:', e.message),
      );
    },
    [queueUserWrite],
  );

  /**
   * **Turning `New` off is what says "done with those"**, so it is what marks the
   * stream read; turning it on marks nothing. It is no longer the only press
   * that reaches the marker — `Clear` beside the red button says the same thing
   * without the excursion, and reaches it through the same `markPlaysSeen`.
   *
   * The marker has to be **frozen while the filter is on** or the view empties
   * itself the moment it is drawn — the filter narrows to plays newer than the
   * marker, so advancing the marker while it is in force is asking for none of
   * them. That is also why the red button is not drawn while `New` is on
   * (`LiveFeed`'s `showNewButton`): with the reader already looking at the new
   * plays it would be a control offering what is on screen, and pressing it
   * would clear the very list it opened.
   */
  const setFeedNewOnly = useCallback(
    (on: boolean) => {
      setFeedNewOnlyState(on);
      if (!on) markPlaysSeen(newestPlayTs);
    },
    [markPlaysSeen, newestPlayTs],
  );

  /**
   * The red button's press: open the new plays.
   *
   * **It used to scroll the page to the top**, and that was right while the new
   * plays were a *mode over this stream*: the reader was handed a different and
   * much shorter list in the same box, and belonged at the head of it. They are
   * a page of their own now, with its own scroller opening at its own top, so
   * scrolling the page **behind** it would throw away a reading position nobody
   * asked to leave — and throw it away invisibly, under a box that covers it.
   */
  const showNewPlays = useCallback(() => {
    setFeedNewOnlyState(true);
  }, []);

  /**
   * **Leave new-plays mode**, which is the press that marks the stream read —
   * `setFeedNewOnly(false)` advances the watermark, and nothing else does now
   * that a kind pill no longer passes through it.
   *
   * **It does not scroll**, where the way *in* does. Going in, the reader is
   * handed a different and much shorter list and belongs at the head of it;
   * coming out, they are somewhere in a list that is about to get longer around
   * them, and the plays they were reading do not move — the mode is a filter
   * over the same stream, so dropping it inserts items above and the browser's
   * own scroll anchoring keeps the item under their eye where it is. Sending
   * them to the top would throw away a reading position for nothing.
   */
  const showAllPlays = useCallback(() => {
    setFeedNewOnly(false);
  }, [setFeedNewOnly]);

  /**
   * **`Clear`** — the press beside the red button that marks those plays read
   * *in place*, without the excursion into the mode and back out of it.
   *
   * **The same watermark call the way out makes**, rather than a second way to
   * clear: both land on `markPlaysSeen(newestPlayTs)`, which is the only thing
   * in this file that moves the marker or writes it. Wired to `markPlaysSeen`
   * rather than to `showAllPlays` — which would work today, the mode being
   * already off wherever the button is drawn — because that one is *leaving a
   * mode*, and a scroll or a URL edit added to it later is a thing a caller
   * that was never in the mode would silently inherit.
   *
   * **It touches neither the mode nor the URL**, and the second half is the
   * point: `newplays=1` says *which stream this view is showing* and belongs to
   * the link, where "I have seen these" is a fact about the person and belongs
   * to their record (`UserPrefs.seenPlays`, above). So the press writes to the
   * record and leaves the query string exactly as it found it — a reader who
   * clears and then shares the page shares the page they are looking at.
   */
  const clearNewPlays = useCallback(() => {
    markPlaysSeen(newestPlayTs);
  }, [markPlaysSeen, newestPlayTs]);

  /**
   * **Which pill is lit** — one, always, and it is the *kind* axis alone now.
   *
   * `New` was the row's last member and is a mode of its own again, reached
   * from the red button in the stream rather than from the row; the two AND in
   * `passesFilters`, so the pills go on selecting a kind whether or not the
   * mode is on. This is one piece of state read as one lens where it used to
   * be two read as one.
   */
  const feedLens: FeedLens = playFilter ?? 'all';

  /**
   * **Press a pill.** One kind at a time, and **nothing else** — which is the
   * whole of what taking `New` out of the row bought.
   *
   * While it was a pill this had to turn the mode off, and turning the mode off
   * is what *marks the stream read* (`setFeedNewOnly`), so every press of every
   * pill passed through the marker. That needed a guard against the case
   * measured at the time: pressing `HR` from `All` marked the whole day read
   * and took a reader who had never touched `New` to nought. With the mode off
   * this axis there is no path from a pill to the marker at all, so the guard
   * is gone rather than corrected — the fact it protected is now structural.
   */
  const selectFeedLens = useCallback((lens: FeedLens) => {
    setPlayFilter(lens === 'all' ? null : lens);
  }, []);
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
  // The league page has no kind — it is one board about one league — so it
  // keys on the view alone, exactly as the research board does.
  const scrollKey =
    view;
  // The feed's own key — see `feedShown` above, which is keyed by it.
  const feedKey = `${start}-${end}`;
  // Read by the scroll listener, which is bound once and would otherwise close
  // over the key from the render that bound it.
  const scrollKeyRef = useRef(scrollKey);
  scrollKeyRef.current = scrollKey;
  const pageScroll = useRef(new Map<string, number>());
  // High from the moment a restore writes an offset until the frame after it,
  // so the scroll event that write raises isn't recorded as the reader's own —
  // which would overwrite a remembered 2,000 with whatever the write was
  // clamped to. A scroll event is dispatched in the rendering step *ahead* of
  // that frame's animation callbacks, so one frame is exactly long enough and
  // no longer: the flag used to be held for the length of a restore, which is
  // also the window in which the reader might have scrolled themselves.
  const restoring = useRef(false);
  const restoreFrame = useRef(0);

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
        if (target === el) pageScroll.current.set(scrollKeyRef.current, Math.round(el.scrollTop));
      } else if (target === document || target === document.documentElement) {
        pageScroll.current.set(scrollKeyRef.current, Math.round(window.scrollY));
      }
    };
    // Capture, because a scroll event doesn't bubble: the inner scrollers'
    // events reach a document listener on the way down or not at all.
    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, []);

  const firstPage = useRef(true);
  useLayoutEffect(() => {
    // The browser's own restore on a reload owns the first pass. Nothing else
    // places a scroll by hand any more: the jump to a player's day did, and it
    // is a player page now, which is an overlay rather than a place on a page.
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    const want = pageScroll.current.get(scrollKey) ?? 0;
    const pane = pageScroller();
    const read = () => Math.round(pane ? pane.scrollTop : window.scrollY);
    // What was actually reached — the browser clamps a write to the page as it
    // stands, and the difference between the two is the whole subject below.
    let placed = 0;
    const place = () => {
      restoring.current = true;
      if (pane) pane.scrollTop = want;
      else window.scrollTo(0, want);
      placed = read();
      cancelAnimationFrame(restoreFrame.current);
      restoreFrame.current = requestAnimationFrame(() => {
        restoring.current = false;
      });
    };
    const release = () => {
      cancelAnimationFrame(restoreFrame.current);
      restoring.current = false;
    };
    // **One write, before the page is painted.** A layout effect on the commit
    // that swapped the page, so the first frame of the new page is drawn where
    // the reader left it — and it is *exact*, because the page being written
    // to is the page the number was measured against.
    //
    // That last clause is the change. The feed used to come back 1,890px
    // shorter than it was left and grow into itself as its clips resolved, so
    // the write clamped — 2,000 asked for, 1,739 painted, measured — and the
    // offset then had to be *held* against a growing document, every frame,
    // with the browser's scroll anchoring switched off underneath it, until
    // the height had been quiet for 250ms or 900ms had passed. Every symptom
    // came out of that shape: the clamped first paint was the flash; the frame
    // in which the page grew and the hold had not yet caught it was the jump
    // (measured at 2,873 against that same target of 2,000); and the 900ms
    // deadline was the inconsistency — with the clip lookups answering in 1.5s
    // rather than 50ms the hold gave up wherever the page had got to, landing
    // +873, +1,134 and −327 off three consecutive targets, with nothing on
    // screen to say so. What removed all of it is not a better hold but the
    // growth: a clip's lookup is remembered for the life of the tab
    // (`clipUrls` in `PlateAppearanceCard`), so a returning feed renders its
    // clips in its first commit at the height it had when it was left.
    //
    // `overflow-anchor` is untouched now, where the hold used to switch the
    // browser's anchoring off across the whole document for the length of it.
    // That was a defense against a stale pixel target being dragged about by
    // content arriving above the viewport; with nothing arriving, anchoring is
    // on our side — it is what keeps a reader's place when the 20s live poll
    // inserts an at-bat above them, and it has no business being off.
    place();
    if (placed >= want) return release;
    // What a size cache cannot answer: a **scrollport whose own box isn't
    // final** at the instant this runs. Both boards are fixed-height columns
    // and each settles a frame or two after mount — measured,
    // `.research-scroll` is 26px shorter then than it ends up, which is why
    // leaving the board at 31,736 came back to 31,710 and stayed there, the
    // inner branch having been a single assignment with nothing to catch it.
    //
    // So a clamped write is repeated whenever the scrollport reports a new
    // size, and it ends on a **condition** rather than a clock: the offset has
    // been reached, or somebody else has taken the scroll. That second test
    // needs no list of events to watch, because it is the same test either
    // way — the reader scrolling and the research board resetting itself to
    // the top (which this must never pull back) both move the offset off the
    // value we wrote.
    const ro = new ResizeObserver(() => {
      if (read() !== placed) {
        ro.disconnect();
        return;
      }
      place();
      if (placed >= want) ro.disconnect();
    });
    if (pane) {
      // The pane's own box, and its content: a pane grows by the table inside
      // it growing, which is a resize of the child rather than of the pane.
      ro.observe(pane);
      for (const child of pane.children) ro.observe(child);
    } else {
      ro.observe(document.documentElement);
    }
    return () => {
      ro.disconnect();
      release();
    };
  }, [scrollKey]);
  /**
   * **The selected League tab is scrolled into view on a phone**, where that
   * strip scrolls sideways rather than wrapping. Four tabs are 377px against
   * the 346 a 390px screen leaves, so `Transactions` sits off the right edge —
   * and a `?lt=transactions` link, or the red dot being pressed after a poll,
   * would open the page with the tab it is on nowhere to be seen.
   *
   * Scrolled **by hand rather than with `scrollIntoView`**, which walks up
   * every scrollable ancestor and would drag the page with it — the rule the
   * research board's position row already follows, along with the peek that
   * lands a pill inside the edge rather than flush with it, so the strip says
   * there is more of itself to swipe to.
   */
  /**
   * **My own matchup this period**, which is the whole subject of the `Matchup`
   * tab — the board is what says which of its rows is mine (`myTeamId` against
   * each side), so the tab has no subject until it lands.
   *
   * Null means the board holds no row carrying this team at all, which the tab
   * has to answer for itself. **A bye is not that case** — ESPN publishes one
   * as an ordinary matchup with no away side, so it is found here like any
   * other and the page draws its own bye head, which is the honest answer and
   * one this app already had. What is left for the empty state is a period this
   * manager is simply not in.
   */
  const myMatchupId = useMemo(() => {
    const me = scoreboard?.myTeamId;
    if (!scoreboard || me == null) return null;
    const m = scoreboard.matchups.find((x) => x.home.teamId === me || x.away?.teamId === me);
    return m ? m.id : null;
  }, [scoreboard]);

  const leagueTabsRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const row = leagueTabsRef.current;
    const tab = row?.querySelector<HTMLElement>('.lg-tab.active');
    if (!row || !tab) return;
    const left = tab.offsetLeft - row.offsetLeft;
    const overLeft = left - row.scrollLeft;
    const overRight = left + tab.offsetWidth - (row.scrollLeft + row.clientWidth);
    const PEEK = 44;
    if (overLeft < 0) row.scrollLeft += overLeft - PEEK;
    else if (overRight > 0) row.scrollLeft += overRight + PEEK;
    // `espnConnected` is in the list because it is what *draws* the strip: on a
    // `?lt=transactions` deep link the tab and the view are already their final
    // values when this first runs, and the row does not exist yet — the ESPN
    // status not having landed — so without it the effect ran once against a
    // null ref and never again, and the page opened with the tab it is on off
    // the right edge. Measured at 390 before: `scrollLeft` 0 with
    // `Transactions` not fully visible.
  }, [leagueTab, view, espnConnected]);

  /* The League page's own three tabs, in the app's tab row rather than on the
     page below it. They are the same kind of statement as every other group in
     `.view-bar-tabs` — which page, then which reading of it — and the row is
     already the app's answer to "more groups than fit on a line": each group is
     `flex: none`, so this one travels whole and breaks between groups rather
     than inside one. Drawn only on the League view, exactly as the kind tabs are
     drawn only on the two roster views, so no other page carries an empty slot
     for it. */
  const leagueTabs =
    view === 'league' && espnConnected ? (
      <div className="lg-tabs" role="tablist" aria-label="League" ref={leagueTabsRef}>
        {LEAGUE_TABS.map((t) => {
          /* The one mark in this row: moves have landed that this reader has
             not seen. It is **absolutely positioned in the tab's own padding**
             rather than laid out after the label, so a tab does not grow by
             13px the moment something happens and shrink back when it is read
             — a row of tabs that changes width under the reader is worse than
             no mark at all. The dot is `aria-hidden` and the fact is given to a
             screen reader as words, since a colored circle names nothing. */
          const dot = t.tab === 'transactions' && unseenTransactions;
          return (
            <button
              key={t.tab}
              type="button"
              role="tab"
              aria-selected={t.tab === leagueTab}
              className={`lg-tab${t.tab === leagueTab ? ' active' : ''}`}
              onClick={() => setLeagueTab(t.tab)}
              title={dot ? `${t.title} — new since you last looked` : t.title}
            >
              {t.label}
              {dot && (
                <>
                  <span className="lg-tab-dot" aria-hidden="true" />
                  <span className="sr-only"> — new moves since you last looked</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    ) : null;
  /* **The Rankings span strip is gone, and its five cuts are the bar's own
     list.** It was a group in this row — pills above 640px, a `<select>` below,
     both rendered and swapped by one media query — naming `Current matchup`,
     `Season` and the season's halves, and it was argued as the *fast path* to
     the five when the bar under it grew a picker holding both the spans and
     every week: "one door, two ways in".

     That is the sentence this reversal overturns. The bar's `PeriodPicker`
     opens with **`Spans` as its first group and `Weeks` as its second**, off
     the same `rankings.spans` the strip was drawn from — so the strip offered
     nothing the face did not, one tier further from the table, and the two had
     to be kept in step about which of them was lit (`rankings.week` rather than
     `rankWeek`, a rule written twice for that reason and now written once).

     **What it cost, measured on the live 12-team league**, `.view-tools` and
     the table's first row before → after. On the four spans that draw no
     `Projected` toggle — `Season`, the two halves, and any picked week — the
     strip *was* the second line of the tools row, so removing it removes the
     line: at 1200 / 1440 / 1920 the row is **96 → 50** and the first row of the
     table comes up **299 → 253**, at 640 **98 → 50** and **299 → 251**, and at
     320 / 390 **98 → 92** and 347 / 299 → **341 / 293**, the narrow copy of the
     ⓘ taking the line the strip has left. On `Current matchup` the row is
     **unchanged** (98 / 96) because `ProjectedTools` is on that line anyway —
     stated rather than smoothed over: the saving is four spans out of five.

     **`pickRankSpan` survives it**, because the bar's list still picks a span
     and a span still clears the week: the two are alternatives, and written
     once so the list and the URL cannot come to claim two different tables. */
  const pickRankSpan = (sp: EspnRankSpan) => {
    setRankWeek(null);
    setRankSpan(sp);
  };
  /* **The Rankings lens, in the tab row with the span strip** — a reversal: it
     stood in the table's own caption row, on the reasoning that a control
     saying what the figures *are* belongs against the figures.

     It moves for the reason every other filter in this app is up here: what
     this button changes is **which numbers the table draws**, which is the same
     kind of statement as the board's include buttons and the Roster view's own
     `Projected` — and that last one is the argument in one line,
     since the app already draws a projected toggle in this row and drawing the
     League's copy two tiers lower made the same control look like two. The row
     is also the app's answer to "more groups than fit on a line": each group is
     `flex: none`, so this one travels whole and breaks between groups rather
     than inside one, and the caption below it goes back to being nothing but a
     caption.

     **The sentence still says so, which is what makes the move safe.** The
     caption reads `Week 19 · projected to Aug 23 · 5 days still to play`
     whether or not the button is beside it, so a table of guesses is named
     against the numbers even with its control a tier away — and that is also
     what the full-page box keeps, where the tab row is covered: the research
     board's own rule, that an expanded table states its settings and the way to
     change one is the button that expanded it.

     Drawn only on the Rankings tab and only where the projection can act
     (`projectable`, the current matchup of a week still being played) — absent
     rather than disabled, and independently of the span strip beside it, which
     needs more than one span to be worth drawing where this needs none. */
  /* **The key that explains `OVR`, `BAT` and `PIT` is not in this row at all.**

     It lives in the date bar, inside that bar's far arrow, where the table it
     explains is — `LeagueRankings.tsx`'s `endSlot`. This row held a second,
     narrow copy of it for one revision: the bar's five tracks were measured to
     cost the face nothing only from 432px up, so below that the ends collapsed
     and the tools row's copy was what a phone got.

     **That trade was the wrong way round and the breakpoint is gone.** What
     the narrow copy bought was a face that never gave up a pixel; what it cost
     was the key being in a different place on a phone than on a desktop, which
     is the one thing a key must not be — it is read once, and a reader who has
     learned where it is has learned it for one width. The face gives up the
     difference instead — measured at 320, **212 → 152px**, both lines
     truncating rather than wrapping as they already did — and the ⓘ is in the
     same place at every width. The whole of what that costs is the range
     line's trailing `· so far` at 320; from 390 up nothing clips at all. */
  /* **And the Scoreboard's own, in the same row.**
     
     It was the board's control, then the matchup page's alone, and it is both
     again — the argument is in `LeagueView`'s `Scoreboard`. What decides its
     *place* is the sentence directly below this one, written for the Rankings
     tab and true word for word here: what this button changes is which numbers
     the page draws, so it belongs with the other filters rather than on the
     page, and the app already draws two `Projected` toggles in this row.
     
     Drawn only where the projection can act (`boardProjectable` — a categories
     league on a week still being played), absent rather than disabled, and
     lit off `showingProjected`, which is the same test the board swaps its cards
     on. */
  const leagueBoardProjected =
    view === 'league' && leagueTab === 'scoreboard' && boardProjectable(scoreboard) ? (
      <ProjectedTools
        projection={projection}
        categories={scoreboard?.categories.length ?? 0}
        showing={showingProjected(projection, projected)}
        projected={projected}
        /* The undelayed flag, for the mark inside the control that started the
           read — a press is owed no `WAIT_DELAY`. */
        loading={projLoading}
        onProjected={setProjected}
      />
    ) : null;
  const leagueRankProjected =
    view === 'league' && leagueTab === 'rankings' && rankings?.projectable ? (
      <ProjectedTools
        projection={null}
        days={rankings.projectedDaysLeft}
        categories={rankings.categories.length}
        showing={rankings.projected}
        projected={rankProjected}
        /* The **undelayed** flag, for the mark inside the control that started
           the read: `showRankingsWait` beside it is the delayed one the block
           wait in the pane is gated on, and `useDelayedFlag`'s 250ms floor is
           for a wait nobody asked for — a press is owed no delay at all. */
        loading={rankingsLoading}
        onProjected={setRankProjected}
      />
    ) : null;
  // The header's cluster, at the top right: the roster search, and nothing
  // else. The calendar was once beside it and moved down to the roster row (see
  // `dateToggle`); Edit was the next and is now an entry in the settings menu;
  // refresh was the last, and has gone to the brand cluster on the left, where
  // the controls that act on the whole app already are. What is left is the one
  // thing in this header that belongs to the roster rather than to the app.
  //
  // Icons rather than labeled buttons because a full search field is the
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
          players={knownPlayers}
          watchlist={roster}
          recent={recentPlayers}
          canAdd={!usingFantasy}
          onAdd={onAdd}
          onOpenDetails={openPlayer}
          /* The clubs, searched beside the players: this field is the app's one
             way of reaching a subject by typing its name, and a club is one. */
          teams={teams}
          onOpenTeam={openTeam}
          onPick={recordRecentPlayer}
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


  /**
   * The Schedule toggle — the roster row's copy of the control the research
   * board draws in its own bar.
   *
   * **How far ahead is no longer beside it.** `ScheduleSpanTabs` was the second
   * half of this group; it is in the date bar's disclosure now, under a label
   * that reads `Schedule · Week 19` and between two arrows that step the
   * run. The span *is* the days on screen in this mode, and the days are what
   * that bar is for — leaving the strip up here would have been the one state
   * this app forbids, two controls an inch apart holding one piece of state.
   * The board keeps its own copy in its own bar, having no dates and so no bar.
   *
   * **It leads the group**, ahead of the calendar, which is this row's own
   * documented order rather than an exception to it: the questions
   * come in the sequence *which page, which kind, **which reading of it**,
   * which players, which days*, and the mode is literally the third of those.
   * (The board puts it in its tools run after the controls that narrow *rows*
   * and before the two that dress the columns, which is that run's own reading
   * order; the two placements answer to two different rows and each is argued
   * where it sits.)
   *
   * **The calendar is untouched by it**, and that is the same split the board
   * makes: this changes which *columns* the table has, where the calendar
   * decides which days the report was built from. The
   * calendar keeps its second job here — over a range the report's player list
   * is the roster as it stood on those days, so it still says whose roster is on
   * screen even when nothing on screen is drawn from those days.
   */
  /**
   * **The Feed is a reading of the Roster page, not a page beside it.**
   *
   * It was a tab of its own, and the argument for that was sound as far as it
   * went — *Summary is as different from Feed as either is from Research* —
   * but it was an argument about the two readings and not about what the tab
   * row is for. The row says which of four **subjects** you are on: your
   * roster, your week, the league's season, your fantasy league. The stream and
   * the table are one subject read two ways, which is the same sentence
   * `Schedule` and `Projected` already were: the stats behind you, the fixtures
   * ahead, what the fixtures are worth — and the day as it happened.
   *
   * **So it joins that run and takes its rules.** Four readings, one of which
   * is the plain table (nothing lit), and pressing a lit one puts it away.
   * `scheduleSpan` and `rosterProjected` are cleared on the way in for the
   * reason they clear each other: a stream has no stat columns for a schedule
   * to replace or a projection to fill, so a toggle left lit would sit over a
   * page it is not reading. (The projected lens clears itself as well, its own
   * `view !== 'summary'` reset restoring the range it moved — this only has to
   * be sure the *reading* it names is off.)
   *
   * **The `view` value survives**, and that is deliberate rather than
   * leftover: `view=feed` is in every link in the wild, the stream keeps its
   * own date range (`DateScope`), its own scroll memory and its own five
   * params, and none of that is chrome. What changed is which row the control
   * sits in.
   */
  const feedToggle =
    isRosterView(view) && showRosterViews ? (
      <FeedToggle
        on={view === 'feed'}
        onToggle={() => {
          if (view === 'feed') {
            setView('summary');
            return;
          }
          setScheduleSpan(null);
          setRosterProjected(false);
          setView('feed');
        }}
        title={
          view === 'feed'
            ? 'Back to the stat table'
            : 'Read these days as they happened — every plate appearance and outing in the order it came'
        }
      />
    ) : null;

  const scheduleControl = (
      <ScheduleToggle
        on={scheduleSpan !== null}
        loading={scheduleLoading}
        onToggle={() => {
          if (scheduleSpan !== null) {
            setScheduleSpan(null);
            return;
          }
          // **The reading run is four wide and one deep**, so turning this on
          // from the stream comes back to the table it is a reading *of* —
          // the same exclusivity stated one control over. Without it a press
          // would light a toggle whose columns are on a page nobody is on.
          if (view !== 'summary') setView('summary');
          // **The projected lens goes off with it**, which is the same
          // exclusivity `toggleRosterProjected` states from the other side:
          // this replaces the stat *columns* with days and that replaces the
          // *figures* in them, so they are two readings of one set of cells.
          // Left on, its toggle would sit lit over a table it was not reading,
          // which is what this app's rule about a control lying about its reach
          // forbids.
          //
          // **And this reading arrives on its own days**, where it used to
          // inherit whatever the lens had moved the shared range to — argued at
          // the time as "the days ahead being exactly what a schedule is for",
          // which was true of the lens's days and of nothing else. A reading
          // with an entry of its own (`DateScope`) opens on the days it was
          // last read over, and this one's range decides *whose* rows these are
          // rather than which columns are drawn, so inheriting a week in the
          // future was the wrong inheritance twice over: it silently changed the
          // roster the fixtures were of.
          setRosterProjected(false);
          setScheduleSpan(defaultScheduleSpan(matchupWindow));
        }}
      />
  );

  /**
   * The projected reading of this table — what these players are expected to do
   * over the days in view that have not been played.
   *
   * **Beside the Schedule toggle rather than anywhere else**, and it reads
   * after it: the row's order is *which page, which kind, which reading of it,
   * which players, which days*, and these two are the third of those — the
   * stats behind you, the fixtures ahead, and what the fixtures are worth.
   * They are mutually exclusive (see `toggleRosterProjected`), which is what
   * makes a run of two rather than a segmented control of three: each is a
   * departure from the plain table and pressing either from the other is one
   * press, where three pills would spend a third of a phone's line on the
   * option a reader is already on.
   *
   * **Summary only.** A feed is a record of things that happened, and there is
   * no honest projected version of one; the toggle is not drawn there, exactly
   * as the Schedule toggle is not.
   */
  const projectedToggle = (
    <span className="projected-group">
      <ProjectedToggle
        on={rosterProjected}
        loading={rosterProjLoading}
        onToggle={toggleRosterProjected}
        title={
          rosterProjected
            ? 'Back to what has actually happened'
            : "Add what these players are expected to do over the days still to be played — and open on the days there are games in"
        }
      />
      {/* **The key to the lens, beside the control that turns it on.** It hung
          off the table's own caption until that caption went — the date bar
          under the tabs prints `Projected` over the same dates, so the caption
          was saying twice what the bar says once — and this is where the
          League page has always kept its copy: an ⓘ next to the button, opening
          from the row rather than from its own 30px box (`.proj-key`).

          Drawn on the press rather than on the answer, which is the "reserve
          the box" rule read the only way it can be here: the key is *about* the
          lens, so it appears the moment the lens is on and cannot arrive a
          quarter of a second later under the finger that has moved on to the
          next control. `days` is 0 until the read lands, which the panel words
          as `over the days left` rather than naming a number it has not got. */}
      {rosterProjected && (
        <ProjectionKey days={rosterProjection?.daysLeft ?? 0} className="proj-key" />
      )}
    </span>
  );


  /* The batter feed's play filters — one row of pills at the head of the stream
     they narrow.

     **In the page rather than in the pinned tab row**, which is a reversal of
     this app's standing rule that a control deciding *which rows a view shows*
     lives with the tabs that select the view (the research board's whole
     control set, the include buttons). What that rule protects is a
     control a reader has to reach *while scrolling*, which is what the board's
     filters over a six-hundred-row table are; this one is worked on arrival and
     is the answer to the question the page was opened with, so it goes where the
     answer is — directly above the plays, beside the red `N new plays` button
     already in the page for that same reason. The `Plays` disclosure it replaces
     is gone from the row above with it.

     **Batter tab only** (`feedHasBatters`) — *the pills*: a pitcher's stream item
     is his whole outing rather than a play, which is the same fact the kind tabs
     exist for, so there is nothing here for the pills to select on. The row is
     drawn on both tabs now, carrying the one control that is not about kinds:
     `Oldest first`, which turns the stream round. */
  const feedFilterPills = feedHasBatters ? (
    <FeedFilterPills lens={feedLens} onSelect={selectFeedLens} />
  ) : null;

  /* **`Oldest first` stood here and is gone.** It was the one feed control in
     the pinned row rather than in the page, on the standing rule that a row of
     tabs protects a control a reader reaches *while scrolling* — the kind pills
     are worked once on arrival, an order is wanted forty items down a day. That
     rule is unchanged and is the test for the next control that asks for the
     row; what has gone is the only control that met it. The new-plays page's
     own copy went with it (`newPlaysOrder`), along with both directions and
     both params. See `FeedFilters.tsx`. */

  /* ---------------------------------------------------------------------
     The tools row — the band under the tabs, above the dates.
     ---------------------------------------------------------------------

     **Every control that says which *reading* of the page you are on**, in one
     row of its own: the Roster's four readings (Feed, Schedule, Projected and
     the plain table, which is none of them lit) with the stream's order beside
     them, the League view's own three tabs and the Rankings span and lens, and
     the research board's whole control set portalled in.

     They were all in the tab row, as groups beside the page pills, and the row
     wrapped between whole groups as the width allowed. That was one row saying
     two different kinds of thing — *which page* and *which reading of it* —
     and it was the page pills that paid for it: the control a reader looks for
     first was the same weight as a span strip, and moved down the window as the
     window narrowed. Split, the tabs are the width of the page and always the
     first line, and the readings have a line of their own to wrap inside.

     **And this row scrolls away where the tabs do not.** That is the whole
     bargain the split buys: which page you are on is the last thing that should
     leave the screen, and which reading is a thing you set on arrival — so the
     tabs are pinned, this is in the page, and the dates come back under the
     tabs once it has gone (see `dateBar`). On the Roster's table reading both
     this and the bar are rendered *inside the table's own scroller*, which is
     what puts them and the sticky header row against the same scrollport —
     see `paneChrome` below.

     Its groups keep the tab row's own rule — each is `flex: none`, so the row
     fits as many whole ones per line as the width allows and breaks between two
     rather than inside one. The order is the order the questions come in:
     which reading, then what it is drawn from. */
  const rosterTools = isRosterView(view) && showRosterViews && !editMode;
  const viewTools =
    rosterTools || (view === 'league' && espnConnected) ? (
      <div className="view-tools">
        {/* **Scoreboard / Rankings / Transactions, on a centered line of their
            own**, with everything else in the row breaking to the line under
            them. They are *which page of this league*, one tier down from the
            main tabs and the same kind of statement; the key and the lens are
            *which reading of that page*, which is the next question rather than
            a peer of it — and on the Rankings tab all of them sat on one line
            with the three tabs, so the control a reader looks for first was one
            group among four and moved along the row as the window changed. (The
            span strip that used to be the widest of those groups is gone, its
            five cuts being the first group of the bar's own list — see
            `pickRankSpan`.)

            A wrapper rather than `flex: 1 1 100%` on the strip itself: that
            basis stretches the *shell* of a segmented control across the row
            with its three pills bunched at the left end, which this file
            already records measuring at 596px for a control 295 wide. The line
            is the full-width box and the strip inside it is centered at its own
            content width. */}
        {leagueTabs && <div className="lg-tabs-line">{leagueTabs}</div>}
        {/* **The readings scroll rather than shedding their words.** This run
            used to be laid out straight into the wrapping row, and below 640px
            the stylesheet visually hid `Feed`, `Schedule` and `Projected` so
            three glyphs would fit — which left the buttons naming themselves
            only through a `title`, i.e. only to a pointer, on the one class of
            device that has none. `ScrollRow` keeps the words at every width
            and gives up what is off the end instead, with two arrows saying so.

            The League tabs stay *outside* it, on their own line: they are which
            page of the league, and a line that scrolls away is the wrong shape
            for the control a reader looks for first. */}
        <ScrollRow label="the view controls" className="view-tools-scroll">
          {/* And whether it is drawn to the end of the week — the board's lens
              and the Rankings table's, never both at once, the two being one
              tab apart. */}
          {leagueBoardProjected}
          {leagueRankProjected}
          {rosterTools && (
            <>
              {/* The day as it happened, in place of the table — see `feedToggle`. */}
              {feedToggle}
              {/* The days ahead, in place of the stat columns — see `scheduleControl`. */}
              {scheduleControl}
              {/* And what those days are worth — see `projectedToggle`. */}
              {projectedToggle}
            </>
          )}
        </ScrollRow>
      </div>
    ) : null;
  /* **The research board draws this row itself**, which is why the view is not
     in the test above and no box for it is rendered here. It is the same band
     saying the same kind of thing — which players, which span, which position,
     which columns of them — but it is inside the board's own scroller, and the
     controls are inseparable from the board's column vocabulary. App kept an
     empty `.research-chrome` here and the board portalled its bar into it,
     which was the only way to reach the pinned chrome this row used to live in;
     from a pane the board itself renders there is nothing to reach across, and
     the host's one-frame delay was costing the board its scroll offset on the
     way back in. See `ResearchTable.tsx::controls`. */

  /* ---------------------------------------------------------------------
     The date bar — the full-width strip under the tabs.
     ---------------------------------------------------------------------

     It was a calendar *button*, last in the wrapping row of tab groups, and
     before that a square icon in the header beside a round chip that stated
     the range and could not change it. The bar is the third and, this time,
     the whole of the control: the days in the middle, a step either side, and
     the calendar behind a press of the middle. `DateControls.tsx` carries the
     argument for the shape; what lives here is the *state* — which days, which
     reading of them, and what a step does.

     **Below the tab row rather than inside it.** The dates are what every
     number on the page *is*, and inside a row that wraps they were competing
     for line budget with three groups of tabs — which is how the label came to
     be `8/1 – 8/9` and, on a phone, a 10px bubble. A row of its own costs the
     chrome one line and buys the label the width of the window. It stays inside
     `.app-chrome` so the pinned height that clears it (`--chrome-h`) is still
     one measurement of one box, and it is still drawn on the two roster views
     alone: the dates qualify exactly those and nothing on the research board.

     **Three readings, and the bar says which it is on** — see
     `DateBarReading`. The Schedule view draws days *ahead* in place of the stat
     columns, so there the bar prints the span and its own days and the arrows
     step the spans this reader is offered; the projected lens keeps the range
     but fills it with estimates, so it prints `Projected` over the same dates;
     otherwise it prints the preset's word, or `Custom range`, over the range.
     Schedule and Projected are Summary's alone — a feed is a record of things
     that happened — so the Feed's bar is always the plain reading. */
  const scheduleReading = view === 'summary' && scheduleSpan !== null;
  const barSpan = scheduleReading
    ? spanDates(scheduleIndex, scheduleSpan!, matchupWindow, baseballToday())
    : { start, end };
  const barReading: DateBarReading = scheduleReading
    ? {
        kind: 'schedule',
        span: spanLabel(effectiveSpan(scheduleSpan!, matchupWindow), matchupWindow).label,
      }
    : view === 'summary' && rosterProjected
      ? { kind: 'projected' }
      : { kind: 'dates', preset: activePreset };
  /* The step, in whichever vocabulary the reading is in. A null is what
     disables the arrow, and both cases produce one: the calendar runs out at
     the picker's own ceiling, and the span run has two or three members. */
  const stepTo = (delta: -1 | 1) => {
    if (scheduleReading) {
      const to = stepSpan(scheduleSpan!, matchupWindow, delta);
      return to === null
        ? /* Off, and saying what it would have done — a disabled arrow's
             tooltip has to be in the vocabulary of the reading it is in, or the
             Schedule view's first span offers `Previous day` for a press that
             would not move a day. */
          { run: null, title: delta < 0 ? 'The first span offered' : 'The last span offered' }
        : {
            run: () => setScheduleSpan(to),
            title: `Show ${spanLabel(to, matchupWindow).label}`,
          };
    }
    const to = stepRange(start, end, delta, rosterPresets, maxDate);
    return {
      run: to === null ? null : () => setRange(to),
      title: stepTitle(start, end, delta),
    };
  };
  const prevStep = stepTo(-1);
  const nextStep = stepTo(1);
  const dateBar = (
    <DateBar
      /* The one bar whose height the app publishes — `--date-bar-h`, which is
         what the summary table's header row sticks below. See `measure`. */
      measure
      reading={barReading}
      start={barSpan.start}
      end={barSpan.end}
      open={dateOpen}
      onToggle={() => {
        setSearchOpen(false);
        setDateOpen((v) => !v);
      }}
      onClose={closeDates}
      onPrev={prevStep.run}
      onNext={nextStep.run}
      /* A disabled arrow keeps a title, rather than going silent: the reason it
         is off is that there is nowhere to go, and the tooltip is where a
         reader finds that out. */
      prevTitle={prevStep.title}
      nextTitle={nextStep.title}
      /* The span strip, and in the Schedule reading it is the *whole* panel —
         the bar draws it in place of the presets rather than above them, the
         columns there being days ahead rather than a stat range. It was a group
         in the tab row beside the toggle that turns the mode on, and it came
         here with the days: the bar's arrows step it, so the strip that names
         the whole run belongs under the label they move. The board keeps its
         own copy in its own bar — it has no dates and so no bar. */
      spanControl={
        scheduleReading ? (
          <ScheduleSpanTabs
            span={scheduleSpan!}
            matchup={matchupWindow}
            onChange={setScheduleSpan}
          />
        ) : null
      }
      /* **The face opens the calendar in every reading but Schedule.** The
         Feed had this first, on the argument that going to a day is going to a
         *day*; the Roster and the projected lens follow it now, on the same
         argument one step on. The two presets a reader of dated rows actually
         presses are `Today` and `Yesterday`, and the arrows already land on
         both **as rules** — `?preset=Today` → ‹ → `?preset=Yesterday` → › →
         `?preset=Today`, the URL round-tripping through the rule rather than
         through a frozen range. The other four were a field-press away from
         this same calendar, so what the pills bought was one press saved on
         four spans against one press *added* on every day-level move, which is
         the move this bar exists for.

         `DateControls.tsx` carries the geometry (a popover rather than 300px of
         pinned chrome measured into `--chrome-h`); `client-dates.md` carries
         what a preset row was reaching that the calendar does not, and why that
         was thought a fair trade. `rosterPresets` stays — `stepRange` reads it
         to name the days an arrow lands on, which is the half of a preset that
         survives.

         Schedule is the exception because there the columns are days *ahead*:
         a calendar over a table of fixtures would pick days no column on screen
         is drawn from, so the span run is the panel and this is null. */
      popover={
        scheduleReading ? null : (
          <DateCalendar
            start={start}
            end={end}
            max={maxDate}
            onChange={(s, e) => {
              setRange({ start: s, end: e, preset: null });
              setDateOpen(false);
            }}
          />
        )
      }
      popoverLabel="Pick a range on the calendar"
    />
  );

  /**
   * **The table's reading takes the tools row and the dates into its own
   * pane**, and this is the one test that decides it.
   *
   * `.app.summary-mode` is a viewport-tall flex column in which only
   * `.summary-scroll` scrolls, and `position: sticky` sticks to *the box that
   * scrolls*. So a date bar left in the page there is pinned to a column that
   * never moves — it would simply sit where it was laid out — while the table's
   * own header row is pinned to the pane, 54px lower and behind nothing. The
   * two would be one band on screen and two bands to the browser, and the gap
   * between them is where the first row of the table would disappear.
   *
   * Inside the pane both stick against the same scrollport, one under the
   * other, and the tools row above them scrolls away with the rows — which is
   * the whole of what this arrangement is for.
   *
   * **`viewCards.length` is in the test because the pane is**: with nothing to
   * draw, `SummaryTable` is not rendered at all, so there is no pane to hand
   * them to and they go back in the page above the empty state. Missing that is
   * a roster page with no dates on it, which is exactly the state the full-page
   * mode's own rule forbids.
   */
  const tableTakesChrome = view === 'summary' && !editMode && viewCards.length > 0;
  /** The two rows, as the pane's own first children — see `tableTakesChrome`. */
  const paneChrome = tableTakesChrome ? (
    <>
      {viewTools}
      {showRosterViews && dateBar}
    </>
  ) : null;
  /**
   * **And the Rankings tab takes the tools row into its own pane for the
   * identical reason.** `.app.league-rank-mode` is the same viewport-tall flex
   * column `summary-mode` is — the tab is a fifteen-column table read across —
   * so a tools row left up here is held against a column that never scrolls,
   * which is a band that cannot leave rather than a band that stays. Inside the
   * pane it scrolls away with the rows and the table's header row takes the top
   * of the pane behind it.
   *
   * There is no date bar in it: the League view is not read over a range of
   * days, the span strip in the row itself being what says which games these
   * numbers are drawn from.
   *
   * **No test on the data here**, unlike `tableTakesChrome`'s `viewCards`:
   * `LeagueRankings` draws the row above its own wait and its own empty states,
   * so there is exactly one place that knows whether a pane exists to put it
   * in — and duplicating that test up here is how the two would come to
   * disagree and drop the League tabs off a page altogether.
   */
  const leagueTakesChrome = view === 'league' && leagueTab === 'rankings' && espnConnected;

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
        players={knownPlayers}
        watchlist={roster}
        recent={recentPlayers}
        canAdd={!usingFantasy}
        onAdd={onAdd}
        onOpenDetails={openPlayer}
        teams={teams}
        onOpenTeam={openTeam}
        onPick={recordRecentPlayer}
        loading={playersLoading}
        autoFocus
        onClose={() => setSearchOpen(false)}
      />
    </div>
  ) : null;

  // The reorder screen edits the raw watchlist order, one kind at a time, so it
  // reads `reports` rather than the simulate-overlaid copy the cards render.
  //
  // **And only the players who are on the roster *now*.** The report is the
  // roster as it stood over the days in view, so over a range it can carry a
  // man dropped on Tuesday — see **The roster is a range of rosters** in
  // `auth-and-storage.md`. This screen answers a different question from the
  // views behind it: it is the one place the roster is edited as a *list*, and
  // a row you could drag or remove for somebody who is not on it would be
  // offering an edit to a list he isn't in. It reads `rosterKeys`, the same set
  // the research board's baseball and the player page's badge read, so "on the
  // roster" means one thing everywhere; in this mode that is always the saved
  // list, the screen being hidden while a fantasy team is in view.
  //
  // **It used to have a kind split of its own**, and the note here argued at
  // length why that split had to be computed from `editRoster` rather than
  // inherited from the view bar — a batter hidden by the IL filter dropped the
  // Batters tab from the bar, and the screen following it made the one man the
  // screen exists to remove unreachable. The whole composition is gone with the
  // tabs: the list is the roster, batters then pitchers, in one order.
  const editRoster = reports.filter((r) => rosterKeys.has(playerKey(r)));
  const editPlayers = [
    ...editRoster.filter((r) => r.kind !== 'pitcher'),
    ...editRoster.filter((r) => r.kind === 'pitcher'),
  ].map((r) => ({
    id: r.id,
    key: playerKey(r),
    name: r.name,
  }));

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

     The kind switch used to come with it, because the view bar is hidden in
     this mode and it was the only way to reach the other kind's order. There is
     no other kind's order now — one list holds both, batters first, which is
     the order every other surface draws them in. */
  const editPage = (
    <div className="edit-page">
      <div className="edit-page-head">
        <h2 className="edit-page-title">Edit players</h2>
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
    {/* Where the connected league will let each player be started — read by the
        summary table's identity block, which is three components down from here
        and is the only leaf that wants it. Null with no league, which is what
        makes that block fall back to MLB's own listed position. */}
    <EligibilityContext.Provider value={eligibility}>
    {/* Who has been in the news today or yesterday — read by the mark beside
        a name on both roster tables and on the player page's own heading. Null
        until the one request that fills it lands, and every reader draws
        nothing for a null. */}
    <RecentNewsContext.Provider value={recentNews}>
    {/* Which side each man bats from and which arm he throws with — read by
        `PlayerIdentity`, the block three tables share, and by the player page's
        own heading. Off the season roster this app already holds, so it costs
        no request; null until that one boot read lands, and every reader draws
        nothing for a null. */}
    <HandednessContext.Provider value={handById}>
    {/* Every ballpark's park factors — read by the strip on three different
        game-preview dialogs and by the team page's Park tab, none of which
        should be fetching a league-wide table for itself. Lazy: nothing is
        requested until one of those surfaces asks. */}
    <ParkFactorsContext.Provider value={parkRead}>
    {/* The one door into a club's page, for the park strip on a game preview —
        a leaf inside three dialogs in four trees. `openTeam` is stable and is
        already the single door the board row, a player's head and the header
        search all come through; this puts it where a leaf can reach it without
        six components agreeing to pass it on. */}
    <TeamDoorContext.Provider value={openTeam}>
    {/* …and the one door into a game's page, which is the same argument one
        subject over: the callers are the summary table's opponent cell (inside
        a `map` inside a row inside one of two tables drawn in two places) and
        two of the club page's tabs. `openGame` is stable, and it is where the
        exclusion with the other two pages and the one step of memory back are
        both enforced. */}
    <GameDoorContext.Provider value={openGame}>
    <div
      /* `summary-mode` is the fixed-height flex column the table needs, and
         the edit screen is a long scrolling list that must not be trapped in
         one — it took this page over when Edit moved off the Games view. */
      className={`app${view === 'summary' && !editMode ? ' summary-mode' : ''}${
        view === 'research' ? ' research-mode' : ''
      }${
        /* The matchup page is a page of its own with its own pinned band and
           its own scroller — as an overlay it was `position: fixed; inset: 0`
           and got that for free. As a tab it needs the column the other two
           fixed-height views take, for the identical reason: a team page's
           roster reading pins the table's header row, and a sticky row sticks
           to the box that scrolls. */
        view === 'matchup' ? ' matchup-mode' : ''
      }${
        /* The Rankings tab is a wide table read across and wants the same
           fixed-height column the board has, so its header row can pin to a
           scrollport rather than to a page that grows. The other two League
           tabs are card lists and stay ordinary scrolling pages. */
        view === 'league' && leagueTab === 'rankings' ? ' league-rank-mode' : ''
      /* `date-open` used to ride here too: `.date-control` was `display: none`
         and only a class on this shell undid it, which is what made a date row
         rendered anywhere else lay out correctly at 0 × 0. The bar renders its
         own disclosure only while it is open, so the row is a plain flex row
         again and the shell has nothing to say about it. */
      }${editMode ? ' edit-mode' : ''}`}
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
              <div className="settings-popover" role="menu" ref={settingsPopRef}>
                {/* **The color scheme**, as a row of swatches rather than as a
                    third toggle. Two reasons, and the second is the one that
                    decides it. A toggle can only ever hold two, and there is
                    no reason a third palette should mean re-drawing this
                    control; and a color scheme is the one preference in this
                    menu whose *answer* can be shown rather than described —
                    each button is three stops of the palette it selects, which
                    is a truer statement of what it does than any name.

                    A radio group rather than menu items: this is one question
                    with one answer, and `menuitemradio` is what says so to a
                    screen reader, where a row of `menuitemcheckbox`es would
                    claim as many independent switches. The menu deliberately **stays
                    open** across a press, the way `Refresh from ESPN` does and
                    for the same reason: the result is a change in the page
                    behind it, so shutting the menu would hide the thing the
                    press was for.

                    **It leads the menu**, where it used to trail the two
                    toggles. It is the one entry here that changes the whole
                    app's appearance rather than one view's contents, and it is
                    the one a reader opens this menu *for* — the toggles beside
                    it are set once and then left. Leading also puts the picture
                    at the top of the popover, so what the menu opens on says
                    what it is rather than making the reader read two labels to
                    find out. `Settings` therefore heads the run it actually
                    describes rather than the whole popover. */}
                <div className="theme-picker" role="group" aria-label="Color scheme">
                  <span className="settings-popover-label">Color scheme</span>
                  {/* The swatches themselves are `ThemeSwatches`, shared with
                      the invite page's onboarding flow — see that component for
                      why the row is shared and the heading above it is not. */}
                  <ThemeSwatches theme={theme} onPick={setTheme} inMenu />
                </div>
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
                    toggles above.

                    **Offered on one player, where it used to want two.** The
                    test was `reports.length > 1`, which is a rule about
                    *reordering* applied to a screen that also removes — and
                    removing is the half a one-player roster most wants, that
                    being the state you are in when you have just cleared the
                    list and want the last man gone too. Clearing the roster
                    therefore hid the way back into the screen, and adding one
                    player back did not restore it.

                    **And it counts `rosterKeys`, the live saved roster, rather
                    than `reports`.** The report is the roster as it stood over
                    the days in view, so over a range it carries the men dropped
                    inside it — an entry counting that would have opened on the
                    empty screen `editPlayers` draws, this morning's clear-out
                    being invisible to it until the range moved past. Counting
                    the set the screen itself edits is what makes the entry
                    present exactly when there is something behind it. It is
                    also upstream of hide-injured by construction, which
                    `reports` was only by accident: dropping an injured player
                    is precisely what this screen is for, so
                    the entry to it must not be filtered away with him.

                    **Zero is still nothing**, and stays hidden: there is
                    nothing to put in an order and nobody to remove, and the
                    Roster view already meets that reader with `Your roster is
                    empty` and a button opening the search — which is the errand
                    they actually have. An entry leading to a screen with no rows
                    on it would be a mode whose only content is its own way out.

                    The other half of the test is unchanged and correct: ESPN
                    owns the fantasy list, so a screen offering to rearrange it
                    would be offering something it can't do. */}
                {rosterKeys.size > 0 && !usingFantasy && (
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
                      if (view !== 'summary') setView('summary');
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
              <div className="settings-popover fantasy-popover" role="menu" ref={fantasyPopRef}>
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
                  {/* Three quarters of a circle with an arrowhead on the open
                      end, at the menu's 15px, swapped for the app's own
                      spinning baseball in flight — so the swap reads as the
                      arrow closing into the ball it was drawing. */}
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
          {/* **The way to the league's moves, from wherever you are.**

              The fantasy button beside it opens a menu of *controls over the
              app*; the League pill in the tab row opens the league's own page
              on the tab it was last on. Neither is the errand this answers,
              which is the one a manager has several times a day: *has anybody
              done anything*. From the Roster view that was three presses — the
              pill, then the Transactions tab, and the tab is the third of three
              on a strip that scrolls at 320.

              **The dot is the whole reason it is a button rather than an entry
              in the menu beside it.** `client-league-transactions.md` records
              the dot being kept off the League pill deliberately — *the tabs are
              drawn only on the League view, so the dot is a statement about a
              page you are already on* — and that is exactly the sentence this
              reverses: a mark saying *there are moves you have not seen* is
              worth nothing on the one page where you can already see them. It
              is the same mark, drawn from the same comparison
              (`unseenTransactions`), and pressing the button opens the tab that
              clears it.

              Gated on `espnConnected` like the League pill, and for its reason:
              a button leading to a page that could only ever say *connect a
              league* is chrome for a feature the reader hasn't got. */}
          {espnConnected && (
            <button
              type="button"
              /* **No `on` state**, where the fantasy button beside it has one.
                 That one reports a *mode* — which list the roster views are
                 reading — where this is a way to a page, and the app already
                 says which page you are on twice over: the League tab is
                 underlined and the Transactions tab is filled. A third mark for
                 the same fact is a mark that says nothing. */
              className="tx-btn"
              /* The fact goes to a screen reader as words, since a colored
                 circle names nothing — and it goes in the *label* rather than in
                 a hidden child, an element with an `aria-label` taking no name
                 from its contents at all. */
              aria-label={
                unseenTransactions
                  ? 'League transactions — new moves since you last looked'
                  : 'League transactions'
              }
              title={
                unseenTransactions
                  ? 'League transactions — new since you last looked'
                  : 'League transactions'
              }
              onClick={() => {
                setSettingsOpen(false);
                setFantasyOpen(false);
                // A matchup is a page drawn *over* this view whatever tab is
                // behind it, so landing on the Transactions tab with one open
                // would be landing behind it. The press names a page; it lets go
                // of the one that was covering it.
                setMatchupId(null);
                setMatchupTeam(null);
                setView('league');
                setLeagueTab('transactions');
              }}
            >
              {/* Two arrows passing, which is what a transaction is — the same
                  thing `.lg-tx-swap`'s `⇄` says on a trade row, drawn at the
                  weight the header's other icons are drawn at. */}
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
                <path d="M4 8h14" />
                <path d="M14.5 4.5 18 8l-3.5 3.5" />
                <path d="M20 16H6" />
                <path d="M9.5 12.5 6 16l3.5 3.5" />
              </svg>
              {unseenTransactions && <span className="tx-dot" aria-hidden="true" />}
            </button>
          )}
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

      {/* **The main tabs: Roster · Matchup · Research · League.**

          Four pages, one strip, and the strip is the *width of the window* with
          the page you are on underlined — the shape the player page's own tabs
          have always had (`.details-tabs`), applied one tier up.

          It was a **segmented control** in a wrapping row of tab groups, and
          both halves of that were the same compromise: a pill run sized to its
          words sat at the left of a row it shared with the kind tabs, the
          reading toggles, the league's own tabs and the whole research control
          set, and the row's rule was that it wrapped between whole groups. So
          the one control that says *which page of the app you are on* was the
          same weight as a control deciding which span a table is drawn over,
          and it moved down the page as the window narrowed. Full width, it is
          the first thing on the page and the same thing at every width, and the
          underline is the app's own way of saying *this one* where a filled
          pill is how it says *this option*.

          **It keeps its own class rather than growing out of `.view-switch`**,
          which is the standing rule read the other way round: two things that
          are the same object share a selector list, and these two have stopped
          being the same object. `.view-switch` is still the segmented control —
          the Schedule spans, a matchup's tools, the opposing-lineup cuts — and
          a fold that had this strip and those pills agreeing about a border and
          a radius would be one rule holding two shapes apart by exception.

          **Roster covers two `view` values**, the table and the feed, which is
          why the strip tests `mainTab(view)` rather than equality: the Feed is
          a *reading* of the Roster page now (see the tools row below), and a
          `Roster` pill unlit while its feed is on screen would be the row lying
          about where you are.

          The search no longer appears here — it is in the header, which is also
          what lets the tabs stay hidden until something is watched without
          stranding a new user: the only way to add a first player is app
          chrome, not a bar that comes and goes with the view. */}
      {showViewToggle && (
        <div className="view-bar">
          {/* **The whole tablist waits on `initialLoadSettled`, element and
              all** — see where it's computed. It is drawn all at once rather
              than a tab at a time, since Research needs no roster and has
              nothing else gating it, and showing it a beat before its siblings
              is exactly the flicker this waits out.

              The gate is on the element rather than inside it, and that is the
              whole of a fix rather than a detail: the strip carries a rule
              along its foot and a `--control-h` floor of its own, so an empty
              one drew a bare line across the top of the page for the whole of
              the first read — a broken control rather than a bar that has not
              filled in yet. It also put an empty `role="tablist"` in the
              accessibility tree. Nothing under the strip is affected: the tools
              row, the date bar and the research board's own chrome are gated on
              their own conditions and none of them depends on the report. */}
          {initialLoadSettled && (
            <div className="main-tabs" role="tablist" aria-label="Page">
              {/* Nothing watched, nothing for either reading to report on — so
                  this tab only appears once there is something to read. */}
              {showRosterViews && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={mainTab(view) === 'roster'}
                  className={`main-tab${mainTab(view) === 'roster' ? ' is-active' : ''}`}
                  onClick={() => {
                    // Back to the reading it was left on, which is what makes
                    // the Feed a reading rather than a page: a reader who was
                    // in the stream and went to Research returns to the stream.
                    // The reorder screen lives on this page, so coming back to
                    // it is not a reason to close it — the other three are.
                    setView(lastRosterView.current);
                  }}
                >
                  Roster
                </button>
              )}
              {/* **This week's opponent.** It needs a league for the same
                  reason League does — there is no matchup without one — and it
                  is drawn the moment one is connected, in either roster mode:
                  whose week it is, is a fact about the league rather than about
                  which list the roster readings are drawn from. */}
              {espnConnected && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'matchup'}
                  className={`main-tab${view === 'matchup' ? ' is-active' : ''}`}
                  onClick={() => {
                    setEditMode(false);
                    setView('matchup');
                  }}
                >
                  Matchup
                </button>
              )}
              {/* Always present, roster or not — the league board is the one
                  page that doesn't depend on what you're tracking. */}
              <button
                type="button"
                role="tab"
                aria-selected={view === 'research'}
                className={`main-tab${view === 'research' ? ' is-active' : ''}`}
                onClick={() => {
                  setEditMode(false);
                  setView('research');
                }}
              >
                Research
              </button>
              {espnConnected && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'league'}
                  className={`main-tab${view === 'league' ? ' is-active' : ''}`}
                  onClick={() => {
                    setEditMode(false);
                    setView('league');
                  }}
                >
                  League
                </button>
              )}
            </div>
          )}
        </div>
      )}
      </div>
      {/* ↑ `.app-chrome` closes here, and it closes one row earlier than it
          used to. The date bar was the last thing inside it; the tools row and
          the bar are both in the **page** now, and only the title row and the
          tabs are pinned.

          What that buys is the thing the reader asked for and the thing this
          app's chrome had quietly stopped doing: the bar reached 303px at 320px
          wide, most of a phone held sideways, because everything that could be
          called chrome was in it. Pinned, it is the header and four tabs — one
          line, at every width — and the readings scroll away with the page they
          are about.

          The bar itself is still pinned, one tier down: `.date-bar` is sticky
          under the chrome on every page that scrolls the window, and inside the
          table's own scroller on the one that doesn't. Either way it is the
          dates and the column headers that stay, which is what a stat table
          read down thirty rows actually needs on screen. */}

      {/* Outside the pinned box on purpose: a failed report is news about the
          page rather than a control over it, and it would otherwise hold a
          permanent row against the top of the window — and be folded away by a
          menu button that has nothing to do with it. */}
      {error && <div className="error-banner">⚠ {error}</div>}

      {/* Its own line rather than folded into the one above: a failed schedule
          read is news about one *mode* and the report behind the page is
          untouched, so the two must not stand in for each other. The mode stays
          on and both tables go on drawing their stat columns, which is the same
          direction every read in this app fails in. */}
      {scheduleError && (
        <div className="error-banner">⚠ Couldn’t read the schedule — {scheduleError}</div>
      )}

      {/* The tools row and the dates, in the page — **except on the one page
          that does not scroll the page**.

          The Roster's table reading is a viewport-tall flex column in which
          only `.summary-scroll` scrolls, and a sticky box sticks to the box
          that scrolls. Left out here, the bar would be pinned above a pane it
          is not inside and the table's own header row would be pinned inside a
          pane whose top is 54px lower — two things stuck to two different
          edges, saying they are one band. So on that reading both are handed to
          `SummaryTable` and rendered as the first children of the pane itself
          (`paneChrome`), where the tools row scrolls away with the rows and the
          bar and the header row stick against the same scrollport, one under
          the other.

          **Two more pages are now true of this**, and each takes the same
          answer. The research board has no dates to take with it: it is the
          same viewport-tall column with the same one scroller, so its control
          set is inside its pane too and scrolls away with the rows, leaving
          the board's own head stuck at the top. It renders that row itself
          rather than being handed one (`viewTools` is null on that view — see
          there), so nothing about this line has to know. The League's Rankings
          tab takes it minus the bar it has no use for: `.app.league-rank-mode`
          is the same column, so the row goes to `LeagueRankings` as
          `rankPaneChrome` and is rendered inside `.league-scroll` — see
          `leagueTakesChrome`.

          Everywhere else the window is the scroller and this is the plain
          arrangement: the tools row in the flow, the bar sticky under the
          pinned chrome. */}
      {!tableTakesChrome && !leagueTakesChrome && viewTools}
      {!tableTakesChrome && isRosterView(view) && showRosterViews && dateBar}

      {/* `!usingFantasy`, because this block is about the *saved* list and in
          fantasy mode the views are not reading it: a user with an ESPN team
          and nothing saved would otherwise get "Your roster is empty" sitting
          on top of a full page of his fantasy team's cards, over a button that
          opens a search which — ESPN owning the list — no longer adds to
          anything. The mode's own empty case is the block below it.

          `!editMode` for the reason the two filter messages below carry it, and
          more plainly: the edit screen takes the whole page — `.app.edit-mode`
          hides the header cluster, the gear, the fantasy button, the view bar
          and the date controls — so this is a prompt belonging to a view that
          is not on screen. It is reachable because removing the last player is
          exactly what that screen is *for*, and the card then landed over the
          rows it had just emptied, offering a search the mode has hidden. The
          screen says its own emptiness in its own words (`PlayerOrderEditor`),
          and Done is in its head whether or not a row is left. */}
      {rosterLoaded &&
        !usingFantasy &&
        roster.length === 0 &&
        !error &&
        isRosterView(view) &&
        !editMode && (
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
          or read your own list instead. Held until the roster read has
          **settled** rather than succeeded, or the message would flash over
          every fantasy page for as long as ESPN takes to answer — and, held on
          the answer alone, would never appear at all when that read failed,
          which is one of the two ways this view could be left blank. The
          `reports.length === 0` beside it is the other half of the same guard:
          with the roster read failed but the report answered, `rosterKeys`
          falls back to the saved list and could read empty over a full table.

          No `!editMode` here, and that is deliberate rather than an omission:
          the two cannot be true at once. The edit screen is only entered from
          the settings menu, whose entry is gated on `!usingFantasy` — ESPN owns
          that list and a screen offering to rearrange it would be offering
          something it can't do — and every control that could flip the source
          under it (the fantasy button and its popover) is hidden by
          `.app.edit-mode`. A guard against a state nothing can reach is a guard
          nobody can check. */}
      {usingFantasy &&
        (fantasyRoster !== null || fantasyRosterSettled) &&
        rosterKeys.size === 0 &&
        reports.length === 0 &&
        !error &&
        isRosterView(view) && (
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
      {showLoading && reports.length === 0 && isRosterView(view) && (
        <LoadingBlock>Reading your roster&rsquo;s games</LoadingBlock>
      )}

      {/* **`float-badge` is what makes "the cards stay exactly as they are"
          true of their *position* as well as of their content.** The badge is
          a child of `.app` and sat in the flow between the pinned bar and the
          pane, so every re-read pushed the whole page down and let it back up
          again — measured at 1200 and 390, the Roster view's pane went 102 →
          160 and the Feed's first section 272 → 316. It is a fixed pill in the
          bottom-left corner now and the page under it does not move; see
          `.float-badge` in the stylesheet for why that corner. */}
      {showLoading && reports.length > 0 && isRosterView(view) && (
        <LoadingLine className="refreshing float-badge">Updating</LoadingLine>
      )}

      {/* Everyone the active view would show is on the IL and the toggle is
          hiding them. Without this the summary is a header over a Total row of
          zeros, and the players view an expanse of nothing, with no hint on
          either that a setting is doing it. One message for every view now: the
          toggle is the only thing that can empty a view this way, where the
          summary table used to drop them whatever it said. */}
      {isRosterView(view) && displayReports.length > 0 && viewCards.length === 0 && !editMode && (
        <div className="empty-state">
          <p className="empty-title">Nothing to show — everyone here is on the IL</p>
          <p>Turn off “Hide injured players” in settings (the gear by the title) to see them.</p>
        </div>
      )}


      {/* **This week's opponent, as a tab of its own.**

          It is the same page the Scoreboard opens over itself — one component,
          drawn `standalone` (see `LeagueMatchup.tsx`) — because a matchup read
          from a card and a matchup read from the tab strip are the same
          matchup. What the tab adds is that it is *mine*: the board is asked
          which row carries `myTeamId` and the page opens on it, where from the
          Scoreboard the reader names the card.

          Three states before there is a page, and each says its own cause
          rather than sharing one: no league (the tab is drawn anyway, so a
          reader who has not connected one is told why rather than shown a
          blank), no board yet (the app's ordinary block wait, named), and no
          row for this team on the board there is. A **bye** is none of those —
          it is a matchup with one side, found like any other, and the page has
          its own head for it. */}
      {view === 'matchup' ? (
        !espnConnected ? (
          <div className="empty-state">
            <p className="empty-title">No league connected</p>
            <p>
              Connect your ESPN league to read this week&rsquo;s matchup — use the fantasy
              button in the header.
            </p>
            <div className="empty-actions">
              <button type="button" className="empty-help" onClick={openEspnSettings}>
                Connect a league
              </button>
            </div>
          </div>
        ) : scoreboard === null ? (
          scoreboardError ? (
            <div className="empty-state">
              <p className="empty-title">Couldn&rsquo;t read your league</p>
              <p>{scoreboardError}</p>
            </div>
          ) : (
            <LoadingBlock>Reading your league&rsquo;s scoreboard</LoadingBlock>
          )
        ) : myMatchupId === null ? (
          <div className="empty-state">
            <p className="empty-title">No matchup for your team this week</p>
            <p>
              This period&rsquo;s scoreboard has no row for your team. The League tab has
              the rest of it.
            </p>
          </div>
        ) : (
          <LeagueMatchupView
            standalone
            board={scoreboard}
            matchupId={myMatchupId}
            /* Which page of it, and which reading of that page — the same two
               params the overlay writes (`mt=`, `mr=`), because they describe
               the same three pages however the matchup was reached. */
            initialTeamId={matchupTeam}
            onSideTeam={setMatchupTeam}
            initialReading={matchupReading}
            onReading={setMatchupReading}
            /* Never called — there is nothing behind a tab to go back to, and
               `standalone` is what draws neither the Back row nor the Escape
               listener that would call this. */
            onClose={() => {}}
            onOpenDetails={openPlayer}
            projection={projection}
            projected={projected}
            projectionLoading={projLoading}
            onProjected={setProjected}
            presets={presets}
            maxDate={maxDate}
            today={baseballToday()}
            scheduleWindow={scheduleWindow}
            scheduleLoading={scheduleLoading}
            matchupWindow={matchupWindow}
            onNeedSchedule={needSchedule}
            /* The same lookup the Roster view's Schedule mode names its
               opposing starters from, and gated on the same wait: null until
               the season roster has settled, so the grid in there is built
               once with the names in it rather than twice. */
            pitcherLookup={playersLoading ? null : pitcherLookup}
            transactions={transactions}
            onOpenPlayer={openLeaguePlayer}
          />
        )
      ) : view === 'league' ? (
        <LeagueView
          tab={leagueTab}
          board={scoreboard}
          /* The Scoreboard's own lens. The projection is read once and drawn
             twice — this board and the matchup page opened from it — so the two
             can never come to show different figures for one week. */
          projection={projection}
          projected={projected}
          onOpenMatchup={(id) => {
            // A card names the matchup and nothing more, so it opens on the
            // Summary in the middle — clearing any side a `mt=` link or an
            // earlier press from the Rankings tab had named.
            setMatchupId(id);
            setMatchupTeam(null);
          }}
          /* Which teams have a matchup this period, and which — what a press on
             a Rankings row opens. Null until the board lands, which is what
             keeps a row from offering a door with nothing behind it. */
          matchupTeams={matchupTeams}
          onOpenTeamMatchup={(teamId, id) => {
            setMatchupId(id);
            setMatchupTeam(teamId);
          }}
          loading={showScoreboardWait}
          error={scoreboardError}
          onPeriod={(period) => {
            // A matchup id belongs to one period, so stepping to another has to
            // let go of it: `mup=` from last week names a row this board has no
            // match for, and the page it opens would have nothing to draw.
            setMatchupId(null);
            setMatchupTeam(null);
            setMatchupPeriod(period);
          }}
          rankings={rankings}
          rankSpan={rankSpan}
          onRankSpan={pickRankSpan}
          /* Which week the Rankings bar is on. A week and a span are
             alternatives, so this is the only writer of one that does not clear
             the other — it *is* the other. */
          onRankWeek={setRankWeek}
          rankingsLoading={showRankingsWait}
          rankingsError={rankingsError}
          transactions={transactions}
          transactionsLoading={showTransactionsWait}
          transactionsError={transactionsError}
          /* The Transactions tab's player rows draw the same identity block the
             two wide tables do, so they want the same three things: the season
             roster (for a player's kind and MLB's listed position) and the two
             maps the ownership read already puts in hand. No read of its own. */
          players={knownPlayers}
          rosterPct={rosterPct}
          /* And the deltas beside it — the same object the board's trend
             columns and the player page's own header read, handed over whole
             because that tab asks after one player at a time rather than
             merging a column onto every row. */
          rosterTrend={rosterTrend}
          eligibility={eligibility}
          onOpenPlayer={openLeaguePlayer}
          connected={espnConnected}
          onConnect={openEspnSettings}
          /* The tools row, into the Rankings pane rather than the page — see
             `leagueTakesChrome`, which is also the test that keeps it out of
             the page above. */
          rankPaneChrome={leagueTakesChrome ? viewTools : null}
        />
      ) : view === 'research' ? (
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
          teams={researchTeams}
          onTeamsChange={setResearchTeams}
          loading={researchLoading && !research[researchCacheKey]}
          error={researchError}
          pos={researchPos}
          onPosChange={setResearchPos}
          columnKeys={researchCols[researchKind] ?? null}
          onColumnsChange={setResearchColumns}
          window={researchWindow}
          onWindowChange={setResearchWindow}
          /* One flag and one span for both wide tables — see `scheduleSpan`. */
          scheduleSpan={scheduleSpan}
          onScheduleSpanChange={setScheduleSpan}
          matchupWindow={matchupWindow}
          schedule={scheduleIndex}
          /* And the turn filter, which reads the same window over all of its
             days rather than over the span — see `turnIndex`. */
          turnDays={turnDays}
          onTurnDaysChange={setTurnDays}
          turnIndex={turnIndex}
          include={researchInclude}
          onIncludeChange={setResearchInclude}
          includeWatchlist={researchWatchlist}
          onIncludeWatchlistChange={setResearchWatchlist}
          showRanks={showRanks}
          onShowRanksChange={setShowRanks}
          hasRosterPct={rosterPct !== null}
          hasEligibility={eligibility !== null}
          trendWindows={rosterTrend}
          ownedIds={ownedIds}
          ownedElsewhere={ownedElsewhere}
          espnConnected={espnConnected}
          espnError={espnError}
          onConnectEspn={openEspnSettings}
          rosterKeys={rosterKeys}
          watchlistKeys={watchlistKeys}
          onWatchlistToggle={toggleWatchlisted}
          onOpenDetails={openPlayer}
          /* And the team reading's own door: a club row's cap logo and its name
             open the club's page, exactly as a player row's headshot and name
             open his. */
          onOpenTeam={openTeam}
          /* Held here so leaving the page doesn't throw it away, and handed
             back whole — see `researchUi`. */
          ui={researchUi}
          onUiChange={setResearchUi}
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
        viewCards.length > 0 && (
          <SummaryTable
            reports={viewCards}
            onOpenDetails={openPlayer}
            /* The tools row and the dates, rendered as the pane's own first
               children so the bar and the table's header row stick against the
               same scrollport — see `tableTakesChrome`. */
            paneChrome={paneChrome}
            /* Null while the mode is off *and* while its one read is still out,
               so the stat columns stand until the days can replace them. */
            schedule={scheduleIndex}
            /* Null while the lens is off *and* while its one read is still
               out, so the report's own figures stand until the projection can
               be added to them. */
            projection={rosterProjected ? rosterProjection : null}
            /* Who sits above the `Total` row, which is a divider inside the
               table now rather than a pinned foot — see `starterKeys` and
               `SummaryTable.tsx::splitStarters`. */
            starters={starterKeys}
            /* Kept when the table takes the page. The same nodes render in the
               view bar as well, which is behind the expanded box and so never
               on screen at the same time — the alternative is lifting the
               expanded flag out of the table that owns it so App can decide
               where to put them, which is a lot of wiring to avoid two
               invisible elements. */
            chrome={
              <>
                {/* Expanded, the research board reduces its control set to a
                    row of read-only badges; this view keeps its live controls
                    instead. The mode and its span most of all: a table of dates
                    with nothing on screen saying how far they run is the state
                    this must never be in, and the control is also the way back
                    to the stats without leaving the page.

                    **The Feed toggle is deliberately not here.** The other two
                    are readings of *this table* and the way back out of them is
                    this row; the stream is a different page's worth of content
                    and there is no table for the full-page box to be around
                    once it is on — pressing it would empty the very box the
                    control sits in. It is a press away, up in the tools row,
                    once the box is closed. */}
                {scheduleControl}
                {projectedToggle}
                {/* The bar comes with them, and takes a line of its own here
                    the way it does in the chrome (`flex: 1 1 100%`). Its bleed
                    is this box's rather than the app's: it reads
                    `--table-bleed`, which the expanded box declares as its own
                    12px padding — the same token and the same rule the table
                    below it uses to give the gutters back. */}
                {dateBar}
              </>
            }
          />
        )
        )
      ) : (
        viewCards.length > 0 && (
          <>
          {/* The lens, at the head of the stream it narrows — see
              `feedFilterPills`. Inside the same guard as the feed rather than
              beside it: a row of pills over an empty page would be a control
              over nothing, and the empty state below already names its cause. */}
          {feedFilterPills}
          {/* Keyed so changing the date range starts the stream back at its
             first page; a live poll (data only) leaves it alone. */}
          <LiveFeed
            key={feedKey}
            reports={viewCards}
            onOpenDetails={openPlayer}
            shown={feedShown.current.get(feedKey) ?? FEED_PAGE_SIZE}
            onShowMore={(n) => feedShown.current.set(feedKey, n)}
            /* All five gated on the **same flag that draws the control**, so the
               two cannot disagree: a pitcher's stream item is his whole outing
               rather than a play, so none of the six pills can match one and
               passing them through would empty the pitcher feed on behalf of a
               control that tab does not offer. Measured before the gate: a
               `plays=hr` link opened on `kind=pitcher` drew 0 outings. The
               *state* survives the excursion — switching back to batters puts
               the lens straight back in force. A lens the reader set is still
               set on the screen that does not offer it; what a control cannot
               narrow, it does not un-set. */
            playFilter={feedHasBatters ? playFilter : undefined}
            newOnly={feedHasBatters ? feedNewOnly : undefined}
            seenPlays={feedHasBatters ? seenPlays : undefined}
            newCount={feedHasBatters ? newPlayCount : undefined}
            onShowNew={feedHasBatters ? showNewPlays : undefined}
            onShowAll={feedHasBatters ? showAllPlays : undefined}
            onClearNew={feedHasBatters ? clearNewPlays : undefined}
            /* The new-plays page's one control now, in the page at the head of
               the list it narrows. Gated with the six above for the same
               reason. (Its second was the order, in that page's pinned head,
               and both directions are gone — see `FeedFilters.tsx`.) */
            newPlaysFilters={feedHasBatters ? feedFilterPills : undefined}
          />
          </>
        )
      )}

      {/* The "collapse all" float button stood here and is gone with the
          accordions it collapsed: the feed's three openable shapes each raise a
          dialog now, so there is never more than one open and the thing that
          closes it is the box itself. Back-to-top keeps its corner and, with
          nothing to be raised above, its plain `bottom`.

          **This one is the window's, and only the window's.** It reads
          `window.scrollY`, so it answers for the views that let the page itself
          scroll — the Feed above all — and stays hidden on every view that
          moves the scroll into a pane of its own (`.summary-scroll`,
          `.research-scroll`) or into an overlay. The matchup page is the
          second case and raises its own; see `LeagueMatchup`. The button is
          `BackToTop` rather than a fourth copy of the same four attributes. */}
      <BackToTop
        shown={showBackToTop}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      />

      {/* One matchup, as a page over the League view rather than a tab inside
          it — see `LeagueMatchup.tsx`. Rendered here beside the other overlays
          rather than inside `LeagueView`, because that is what it is: a fixed
          box over the whole app, with its own scroller, the body pinned behind
          it and a Back button rather than a tab to leave by. **Before the
          player page in the DOM and below it in the stack** (48 against 50), so
          a name pressed on a team page opens over this and Escape unwinds one
          rung at a time.

          It draws only with a board to draw from, which is also what makes
          `?mup=` on a cold load wait rather than flash an error: the id is held
          from the first render and the page appears when the scoreboard lands. */}
      {view === 'league' && matchupId != null && scoreboard && (
        <LeagueMatchupView
          board={scoreboard}
          matchupId={matchupId}
          /* Which page it opens on, and — while it is open — which page it is
             on: the effect inside reports the side back so `mt=` describes the
             page in front of the reader rather than only the one it opened on. */
          initialTeamId={matchupTeam}
          onSideTeam={setMatchupTeam}
          /* And which reading of that page, on the same terms: seeded from
             `mr=` at mount, reported back as the reader crosses the switch. */
          initialReading={matchupReading}
          onReading={setMatchupReading}
          onClose={() => {
            setMatchupId(null);
            setMatchupTeam(null);
            /* **A reading is put away with the page it was made on**, which is
               the rule `rproj=1` and `proj=1` follow: `mr=summary` is about
               *this* matchup's days, so carrying it onto the next page a reader
               opens would be a lens surviving its own subject. Closing is a
               leaving; crossing the strip inside the page is not, and that
               half is the page's own. */
            setMatchupReading('roster');
          }}
          onOpenDetails={openPlayer}
          /* The same three the Scoreboard gets, so the `Projected` toggle is
             one control over one lens rather than two that can disagree: the
             state is in the URL up here and the read is one per period, so
             projecting the board and then opening a card fetches nothing. */
          projection={projection}
          projected={projected}
          projectionLoading={projLoading}
          onProjected={setProjected}
          /* The app's own named spans, so `Today` means one thing in the app —
             the matchup's own week is added to them in there, that being the
             one named range which means something only on this page. */
          presets={presets}
          maxDate={maxDate}
          today={baseballToday()}
          scheduleWindow={scheduleWindow}
          scheduleLoading={scheduleLoading}
          matchupWindow={matchupWindow}
          onNeedSchedule={needSchedule}
          /* The same lookup the Roster view's Schedule mode names its opposing
             starters from — see the standalone reading above. */
          pitcherLookup={playersLoading ? null : pitcherLookup}
          /* The League view's own feed, already in hand: this page is opened
             from that view, which reads it on entry and keeps it, so the Moves
             section names the week's pickups with no read of its own. */
          transactions={transactions}
          onOpenPlayer={openLeaguePlayer}
        />
      )}

      {detailsPlayer && (
        <PlayerDetails
          playerId={detailsPlayer.id}
          name={detailsPlayer.name}
          position={detailsPlayer.position}
          isPitcher={detailsPlayer.kind === 'pitcher'}
          /* Whether he has a page on the other side of the ball, which is what
             draws the Batting/Pitching switch. Off the season roster, the one
             list at boot that carries every player the page can open on — see
             `twoWayIds`. */
          twoWay={twoWayIds.has(detailsPlayer.id)}
          isOnRoster={detailsRostered}
          ownedBy={ownedElsewhere?.get(detailsPlayer.id) ?? null}
          rosterEditable={!usingFantasy}
          isWatchlisted={watchlistKeys.has(`${detailsPlayer.kind}-${detailsPlayer.id}`)}
          onWatchlistToggle={(on) =>
            toggleWatchlisted(`${detailsPlayer.kind}-${detailsPlayer.id}`, on)
          }
          rosterPct={rosterPct ? rosterPct.get(detailsPlayer.id) ?? null : undefined}
          eligible={eligibility ? eligibility.get(detailsPlayer.id) ?? null : undefined}
          rosterTrends={
            rosterTrend && rosterPct?.has(detailsPlayer.id) && !beyondIds.has(detailsPlayer.id)
              ? /* **The three short spans only**, where the board draws all
                   five. This line sits under a name in pinned chrome, not in a
                   table cell a reader is scanning down: `1d 3d 7d 12d 29d` is
                   five readings of one number across a header, and the two long
                   ones are the two that answer a question nobody has on a
                   player's own page — a month-old share is a fact about the
                   season, where what this page is opened with is whether he is
                   being picked up *now*. The board keeps the long spans, which
                   is where a season-shaped question is asked and where the
                   columns can be sorted on. */
                rosterTrend
                  .filter((w) => w.window <= 7)
                  .map((w) => ({
                    window: w.window,
                    days: w.days,
                    // Absent is flat, an explicit `null` is withheld — the same
                    // three-way reading the board's merge above makes, and for
                    // the same reason.
                    change: w.delta.has(detailsPlayer.id)
                      ? w.delta.get(detailsPlayer.id) ?? null
                      : 0,
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
          statsColumns={statsCols[detailsPlayer.kind] ?? null}
          onStatsColumnsChange={(keys) => setStatsColumns(detailsPlayer.kind, keys)}
          /* Which cut of the spans the Stats tab is on, out of the URL. */
          statsCut={statsCut}
          onStatsCutChange={setStatsCut}
          showRanks={showRanks}
          onShowRanksChange={setShowRanks}
          /* The Stats tab's percentile population — the same board rows the
             research view is drawn from, out of the same cache. Only the
             windows that have landed are in it; the rest simply have no badges
             yet. */
          rankPopulations={detailsRankPopulations}
          onNeedRankPopulations={loadDetailsRankPopulations}
          /* The page is navigable between players: the Overview tab's
             scheduled game names the other side's starter and opens him. The
             same `openPlayer` every other route in uses, so one man's page
             is reached the one way however it was arrived at. */
          onOpenDetails={openPlayer}
          /* …and his club's page, off the chip under his portrait. `openTeam`
             puts his page away as it opens — one page at one layer — and
             remembers him, so the club's `Back` comes back here. */
          onOpenTeam={openTeam}
          /* The Schedule tab's fixture list. The same window, the same
             `needSchedule` and the same pitcher names the matchup page's team
             pages take — one read for every surface that draws days ahead, and
             the page asks only when the tab is opened on somebody whose rows
             come off it. */
          scheduleWindow={scheduleWindow}
          scheduleError={scheduleError}
          onNeedSchedule={needSchedule}
          pitcherLookup={pitcherLookup}
          /* One step back — to whatever page this one was opened from, or out
             to the view. The same `closePage` the other two pages take, `Back`
             and Escape both being `DetailsShell`'s one door out. */
          onClose={closePage}
        />
      )}

      {/* **The club's page, on the same rung as the player's** — the three
          pages are mutually exclusive in state (see `showPage`, which is the
          one place that is enforced), so this and the blocks around it can
          never both be on screen and none has to clear another's layer.

          It draws only for a club the teams table can name: an id nobody has
          heard of opens nothing, which is `detailsPlayer`'s own standing rule
          for an unresolvable `player=` and is the same answer for the same
          reason — a page headed by a bare number is worse than no page. The
          read is one request at boot, so in practice this is only ever false
          for the tick before it lands. */}
      {teamPageId !== null && teamById.has(teamPageId) && (
        <TeamDetails
          /* **Keyed on the club and the tab it was opened for**, so a door that
             names a tab gets a page that opens on it. `TeamDetails` reads
             `initialTab` once, at mount; without the key a second door onto a
             club already on screen would be read by a component that has
             already mounted and would land on the tab the reader left. */
          key={`${teamPageId}:${teamPageTab ?? ''}`}
          team={teamById.get(teamPageId) as TeamInfo}
          initialTab={teamPageTab}
          side={teamSide}
          onSideChange={setTeamSide}
          /* The season roster the header search is already holding — the Roster
             tab is a filter over it, so the tab costs no request at all. */
          players={knownPlayers}
          playersLoading={playersLoading}
          /* The same window, the same `needSchedule` and the same pitcher names
             the player page's Schedule tab takes. One read for every surface
             that draws days ahead. */
          scheduleWindow={scheduleWindow}
          scheduleError={scheduleError}
          onNeedSchedule={needSchedule}
          pitcherLookup={pitcherLookup}
          /* Every row of the Roster tab and every announced starter on a
             fixture is a door into a player's page — through `openPlayer`, so
             the club's page is put away as it opens. */
          onOpenDetails={openPlayer}
          /* The Stats tab's saved columns are the player page's own: one
             vocabulary, one table, one preference. */
          statsColumns={statsCols[teamSide] ?? null}
          onStatsColumnsChange={(keys) => setStatsColumns(teamSide, keys)}
          showRanks={showRanks}
          onShowRanksChange={setShowRanks}
          rankPopulations={teamRankPopulations}
          onNeedRankPopulations={loadTeamRankPopulations}
          /* Which tab it is actually showing, for the one thing that needs it:
             a game opened from here remembers the tab as well as the club. See
             `teamTabRef`, which is where it lands — not the state the page's
             key is built from. */
          onTabChange={noteTeamTab}
          /* One step back — see `closePage`. */
          onClose={closePage}
        />
      )}

      {/* **The game's page, on the same rung as the other two** — the three
          are mutually exclusive in state (see `showPage`), so at most one of
          these three blocks is ever on screen and none of them has to clear
          another's layer.

          Unlike the club's, it draws for any id at all: a game is named by its
          own payload rather than by a table the client holds, so there is no
          equivalent of "a club nobody has heard of" to decline — an id MLB does
          not know answers 502 and the page says so, which is the honest reading
          of *that* fact rather than a blank screen. */}
      {gamePagePk !== null && (
        <GamePage
          /* **Keyed on the game and the tab it was opened for**, so a step back
             onto this page is read by a fresh component that opens where the
             reader left. `GamePage` reads `initialTab` once, at mount — the
             team page's own bargain, and made here for the same reason. */
          key={`${gamePagePk}:${gamePageTab ?? ''}`}
          gamePk={gamePagePk}
          initialTab={gamePageTab}
          initialScroll={backScroll}
          /* Which tab it is actually showing, so `openPage` can record it. It
             lands in a ref rather than in the state above, which the key is
             built from — see `gameTabRef`. */
          onTabChange={noteGameTab}
          /* The season roster the header search already holds — every name in a
             box score is a door only where this list can resolve him, which is
             `detailsPlayer`'s own standing rule read from the other side. */
          players={knownPlayers}
          /* Every name on the page is a door into a player's — through
             `openPlayer`, so the game's page is put away as it opens. */
          onOpenPlayer={openPlayer}
          /* One step back — see `closePage`. */
          onClose={closePage}
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

      {/* Last, so that at one layer it is over everything: an invite link is
          the only thing that opens it, and it is the whole of what the person
          who clicked one is shown. The settings page behind it is reachable
          the moment it closes — from the fantasy button, where the rest of the
          league's apparatus lives. */}
      {espnOnboard && espnStatus?.connected === true && (
        <LeagueOnboarding
          status={espnStatus}
          theme={theme}
          onTheme={setTheme}
          onConfirm={confirmEspnOnboarding}
          onDone={() => setEspnOnboard(false)}
        />
      )}
    </div>
    </GameDoorContext.Provider>
    </TeamDoorContext.Provider>
    </ParkFactorsContext.Provider>
    </HandednessContext.Provider>
    </RecentNewsContext.Provider>
    </EligibilityContext.Provider>
    </PlayerStatusContext.Provider>
    </FantasyRosterContext.Provider>
    </MutedContext.Provider>
  );
}
