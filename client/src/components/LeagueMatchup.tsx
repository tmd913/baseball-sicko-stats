import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  answersEscape,
  useLockBodyScroll,
  useOverlayChromeOffset,
  useOverlayFocus,
} from '../hooks';
import { DialogLayerContext, Modal } from './Modal';
import { MatchupSeriesChart } from './MatchupSeriesChart';
import { LoadingLine } from './Loading';
import { api } from '../api';
import { BackButton } from './BackButton';
import { InfoKey } from './InfoKey';
import { DateBar, DateCalendar, stepRange, stepTitle } from './DateControls';
import type { DateBarReading, DatePreset } from './DateControls';
import LeagueTeam from './LeagueTeam';
import { FeedToggle } from './FeedFilters';
import type { FeedLens } from './FeedFilters';
import { ProjectedToggle } from './Projection';
import { ScheduleSpanTabs, ScheduleToggle } from './ScheduleControl';
import {
  buildScheduleIndex,
  defaultScheduleSpan,
  effectiveSpan,
  spanDates,
  spanLabel,
  stepSpan,
} from './schedule';
import type { PitcherLookup, ScheduleSpan } from './schedule';
import {
  asProjected,
  catScore,
  categoryGroups,
  fmtValue,
  prettyDate,
  ProjectedTools,
  record,
  teamAbbrev,
  TeamLogo,
} from './LeagueView';
import { moveLabel } from './LeagueTransactions';
import { addDays, easternDate, LEAGUE_POLL_MS, wideRange } from '../lib';
import type {
  EspnCategory,
  EspnMatchupSeries,
  EspnMatchupSide,
  EspnProjection,
  EspnScoreboard,
  EspnStandingsTeam,
  EspnTransactionPlayer,
  EspnTransactions,
  MatchupWindow,
  RosterProjection,
  ScheduleWindow,
} from '../types';

/**
 * One matchup, as a **full-screen page over the League view** rather than a tab
 * inside it.
 *
 * **Why it left the tab row.** It was the League view's first tab, and it did
 * not belong there: the other three — Scoreboard, Rankings, Transactions — are
 * three readings of *the league*, where this is one row of the first of them
 * opened up. A tab row is a set of siblings, and one of the four was a
 * different depth from the other three; it also meant the strip carried a page
 * whose subject the strip could not name (which matchup?), and answered it with
 * a dropdown of ten pairs of team names sitting above the thing it selected.
 *
 * As a page opened *from* a scoreboard card, all of that goes: **the card is
 * what names the matchup**, the way a row of the research board names the
 * player its page opens on, and the way back is a Back button rather than a
 * control that has to be found again. It is the shape `PlayerDetails` has, and
 * it takes that shape's whole vocabulary — a fixed box with its own scroller,
 * the body pinned behind it, the background `inert`, focus in on open and back
 * out on close, and Escape undoing exactly one thing.
 *
 * **No week selector and no matchup picker.** Both were controls over *which
 * matchup*, which is a question this page no longer asks: it is opened on one,
 * from the board that lists them all. The week is printed rather than
 * navigable, because the numbers on the page are meaningless without it and
 * because a live week's totals cover the days played so far — the arrows are
 * back on the Scoreboard, which is the page about which week.
 *
 * **Three pages inside it**: the away team, the comparison, the home team —
 * two teams with the comparison between them, which is the shape of the thing
 * being read and is the same arrangement each category has on the card below.
 * Summary is the middle one and the default.
 */

/**
 * The layer this overlay paints on.
 *
 * **Below the player page (50), above the full-page table box (45)** — which is
 * what makes the stack behave without a single special case: a player page
 * opened from a team page's table sits over this one and answers Escape first,
 * and a dialog opened *inside* here (a feed item's at-bat card) takes 49 from
 * the context below, which is above this box and below that page. The how-to
 * and league-settings overlays keep their 60 and cover everything.
 */
const MATCHUP_LAYER = 48;

/** Which of the three pages of a matchup is on screen. */
type MatchupSideTab = 'away' | 'summary' | 'home';

/**
 * **Which reading of a team page is on screen**, which is a different question
 * from which page — `MatchupSideTab` picks the manager, this picks what is said
 * about him.
 *
 * `roster` and `feed` are the app's own two roster views, which is what a team
 * page *is*. `summary` is the third and is this page's alone: the same table
 * over **the matchup so far**, which is a span rather than a filter, and the
 * one span that makes the table agree with the category card next door.
 *
 * Exported because it rides in the URL as `mr=` and App holds it — see there.
 */
export type MatchupReading = 'roster' | 'summary' | 'feed';

/** The winner of one category, from the two figures. `outcome`'s twin in
 *  `LeagueView.tsx` and deliberately the same arithmetic: ESPN fills its own
 *  `result` only once a matchup is over, so a live week would say nothing. */
function winnerOf(
  left: number | undefined,
  right: number | undefined,
  cat: EspnCategory,
): 'left' | 'right' | 'tie' | null {
  if (typeof left !== 'number' || typeof right !== 'number') return null;
  if (left === right) return 'tie';
  return (cat.lowerBetter ? left < right : left > right) ? 'left' : 'right';
}

/**
 * **How lopsided a category is** — the gap between the two figures as a share of
 * the two of them together, which is the length of the bar the row draws toward
 * whoever is ahead.
 *
 * A scale with no calibration in it, which is the whole reason for this one
 * rather than the Splits card's: that bar measures a platoon gap against
 * `full`, the 90th percentile of the league's real gaps in that stat, because
 * one hitter's split means nothing until you know what a big split *is*. Here
 * the comparison is already complete — two teams, one week, one category — so
 * the pair can be measured against itself and needs no league behind it. `|a−b|
 * / (|a|+|b|)` is in [0, 1] by construction, so nothing can clamp and a full
 * bar means one side has the lot.
 *
 * What it says is **how close the category is**, which is the question a
 * manager reads a matchup with: 63 strikeouts against 66 is a 2% sliver and is
 * a coin flip with three days to go, where 12 home runs against 2 is a 71% bar
 * and is gone. It is deliberately *not* a probability and not a projection —
 * the two figures are printed either side of it, and the bar is the glance.
 *
 * Zero either way (a category nobody has scored in yet, both sides on 0) is a
 * tie and draws nothing, which the guard gives for free.
 */
function barShare(left: number | undefined, right: number | undefined): number {
  if (typeof left !== 'number' || typeof right !== 'number') return 0;
  const total = Math.abs(left) + Math.abs(right);
  if (!Number.isFinite(total) || total === 0) return 0;
  return Math.min(1, Math.abs(left - right) / total);
}

/**
 * **What each manager did about it** — the players he took in and let go of
 * inside this matchup period, under the count of how many acquisitions that
 * spent.
 *
 * The count was the whole of the section and is the half a reader can act on
 * least: `5/10` says a manager has moved five times and not *who*, which on a
 * page about two teams' week is the more interesting half by some way — a
 * category swinging back is usually somebody's pickup, and this is where the
 * pickup is named.
 *
 * ### Which moves belong to this week, and the boundary that decides it
 *
 * ESPN's activity feed carries no scoring period on a topic, only an instant,
 * so the span is the period's own days and the test is the day a move happened
 * on. Which *day* that is, is the whole of the difficulty, and it was measured
 * against ESPN's own acquisition counter rather than assumed — the counter is
 * the one number on this section that ESPN publishes, so a list under it that
 * counts differently is a contradiction the reader can see.
 *
 * **A matchup period's moves run from 13:00 ET on the day before its first day
 * to 13:00 ET on its last.** Which is to say ESPN books an acquisition against
 * the *next* scoring period once the day's games have started — invisible on
 * six days of seven, because the next scoring period is still this matchup
 * period, and decisive on the seventh, where a Sunday-afternoon pickup spends
 * next week's allowance.
 *
 * **Measured, not guessed.** Sweeping the boundary hour against the counter
 * over seven matchup periods and 84 team-periods of the live league: the app's
 * own baseball day (3am ET) and the plain calendar day both reproduce **67 of
 * 84**, and a 13:00 ET boundary reproduces **84 of 84**. The 24 topics the two
 * rules disagree about are **every one of them on a Sunday after 13:00**, and
 * the knee is bracketed to **12:55–13:23 ET** by the 51 topics filed on the
 * seven last-days — 12:55, 12:05, 12:03, 11:58 and 11:22 stay put; 13:23 and
 * 13:46 move. 13:00 ET is when a Sunday slate starts, which is the mechanism
 * that reading implies.
 *
 * The honest caveat is that this is one league's seven weeks and ESPN
 * documents none of it, so the constant is a **measurement rather than a spec**
 * — and where it is ever wrong, the count above is ESPN's own and is the
 * authority.
 *
 * ### A trade is an add and is not an acquisition
 *
 * The counter counts free-agent and waiver pickups; a trade spends none of the
 * allowance, which is measured too — team 11's seven adds in period 15 are
 * seven trade arrivals and ESPN's counter for that week is **0**. They are
 * still players the manager took in, so they are in the list, and the row that
 * came by trade says so: without the tag a week with a trade in it is a list
 * of seven names under a count of nought with nothing on screen to reconcile
 * them.
 *
 * ### Attribution is per player, not per topic
 *
 * A topic is one act by one manager and can move players in both directions and
 * between three teams, so a side's list is built from `toTeamId`/`fromTeamId`
 * on each **player** rather than from the topic's `teamIds`. That gives a
 * trade both of its halves for free: the man who came the other way is a drop
 * on one list and an add on the other, with no case of its own.
 *
 * ### It does not say green
 *
 * The Transactions tab draws an add in `--hit`, which is right on a page whose
 * only color it is. Here green means **ahead in this category** — the winning
 * figure, its bar, and the leader's run of the meter — and an add is not a
 * category anybody is winning, so the section stays the one part of this card
 * with no color in it. What separates the two directions is the heading over
 * each run and the weight under it: a man coming in reads at full strength,
 * one going out reads muted.
 */
const PERIOD_ROLLOVER_HOUR = 13;

/** The matchup-period day a move falls on — see the boundary measurement above.
 *  Shifting the instant forward by what is left of the day after the rollover
 *  and taking the ET date is the same test written without a comparison. */
function periodDay(ms: number): string {
  return easternDate(new Date(ms + (24 - PERIOD_ROLLOVER_HOUR) * 3_600_000));
}

function movesFor(
  side: EspnMatchupSide,
  feed: EspnTransactions | null,
  from: string | null,
  to: string | null,
): { player: EspnTransactionPlayer; date: number }[] | null {
  // No feed, or a period whose own dates could not be derived — the header
  // above says the same thing by printing no dates, and a list of moves with
  // no week to belong to is not a list worth drawing.
  if (!feed || !from || !to) return null;
  const inSpan = feed.transactions.filter((t) => {
    const day = periodDay(t.date);
    return day >= from && day <= to;
  });
  // **Does the feed even reach this week?** It is read at the server's own
  // limit — 250 topics against a season of 770 on the live league — so an old
  // period is simply not in it, and drawing an empty list under a count of five
  // would be the page saying nobody moved when what it means is that it cannot
  // see that far. The oldest topic in hand is the horizon: past it, the section
  // says so instead.
  const oldest = feed.transactions[feed.transactions.length - 1];
  if (feed.capped && (!oldest || periodDay(oldest.date) > from)) return null;
  const out: { player: EspnTransactionPlayer; date: number }[] = [];
  for (const t of inSpan) {
    for (const p of t.players) {
      if (p.toTeamId === side.teamId || p.fromTeamId === side.teamId) out.push({ player: p, date: t.date });
    }
  }
  return out;
}

/**
 * One side's moves, **grouped by direction rather than labeled per row**.
 *
 * The alternative was the Transactions tab's own shape — the move's word before
 * each name — and it fails on the one case this page has that the tab does not:
 * a trade between *these two teams* puts the same man in both columns, and
 * `Traded` on both says nothing about which way he went. Naming the direction
 * per row instead (`Traded away`) is the widest label on the card in the
 * narrowest column on the page, on a phone where each side has about 150px.
 * The group heading says it once for every row under it, and a trade needs no
 * case of its own.
 *
 * What the grouping costs is the claim-against-pickup distinction the tab
 * spends a word on; the row's tooltip carries it, with the day and the bid.
 *
 * Newest first, the feed's own order, which is also the tab's.
 */
function MovesColumn({
  moves,
  teamId,
  onOpenPlayer,
}: {
  moves: { player: EspnTransactionPlayer; date: number }[];
  teamId: number;
  onOpenPlayer?: (mlbId: number) => void;
}) {
  const dir = (out: boolean) => moves.filter((m) => (m.player.fromTeamId === teamId) === out);
  const runs: { label: string; out: boolean; rows: typeof moves }[] = [
    { label: 'In', out: false, rows: dir(false) },
    { label: 'Out', out: true, rows: dir(true) },
  ];
  if (moves.length === 0) return <div className="mup-move-none">No moves</div>;
  return (
    <>
      {runs
        .filter((r) => r.rows.length > 0)
        .map((r) => (
          <div className={`mup-move-run${r.out ? ' mup-move-run-out' : ''}`} key={r.label}>
            <div className="mup-move-dir">{r.label}</div>
            <ul className="mup-move-list">
              {r.rows.map(({ player, date }, i) => {
                const detail = [
                  moveLabel(player),
                  // The day it actually happened, which is what ESPN's own
                  // activity page shows — the 13:00 boundary above decides
                  // which *week* it counts toward and has no business
                  // renaming the day.
                  prettyDate(easternDate(new Date(date))),
                  player.bid != null && player.bid > 0 ? `$${player.bid}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li className="mup-move" key={`${date}-${player.espnId}-${i}`} title={detail}>
                    {player.mlbId !== null && onOpenPlayer ? (
                      <button
                        type="button"
                        className="mup-move-name"
                        onClick={() => onOpenPlayer(player.mlbId as number)}
                      >
                        {player.name}
                      </button>
                    ) : (
                      <span className="mup-move-name">{player.name}</span>
                    )}
                    {player.via === 'trade' && <span className="mup-move-tag">Trade</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
    </>
  );
}

/** **`Summary` is a toggle, not a tab.**
 *
 *  It was the middle of three reading pills and it did not belong there: the
 *  other two say *what kind of thing this page is showing* — a table or a
 *  stream — where this one says *over which days*, which is the question the
 *  bar below the row answers and the one `Schedule` and `Projected` qualify. A
 *  reader looking for the matchup's own totals was reaching past `Feed` to find
 *  them.
 *
 *  So it sits with the two toggles that ask the same kind of question, takes
 *  their shape by being folded onto their selector lists, and leaves the pill
 *  strip saying the one thing it is good at: table or stream. The strip losing
 *  its middle pill is also what gets this row onto one line — see the note on
 *  `.mup-tool-icons`.
 *
 *  **It is still a reading**, and `MatchupReading` still has its three values:
 *  what changed is where the control lives and what shape it wears, not what
 *  the page does. Pressing it while it is on goes back to `roster`, the reading
 *  it is a lens over — which is the behavior of every other toggle in this run
 *  and the reason it is `aria-pressed` rather than a tab.
 *
 *  **It also settles the two-`Summary` collision.** The strip above this row
 *  has a `Summary` tab — the comparison page — and for a while both were
 *  `.view-switch` pills one press apart, told apart only by their titles. They
 *  are two different shapes now, which is what they always were: one is which
 *  page you are on, the other is a lens over the page you are on. */
function SummaryToggle({ on, onToggle, title }: { on: boolean; onToggle: () => void; title: string }) {
  return (
    <button
      type="button"
      className={`summary-toggle${on ? ' on' : ''}`}
      aria-pressed={on}
      onClick={onToggle}
      title={title}
    >
      {/* Three rows over a rule — a column of days added up. Drawn here rather
          than imported: it is this page's only use, and it is 19px to match
          `ProjectedGlyph` beside it rather than the 17 that glyph defaults to. */}
      <svg
        viewBox="0 0 24 24"
        width={19}
        height={19}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M5 6h14M5 11h14M5 16h9" />
        <path d="M5 20.5h14" strokeWidth={2.6} />
      </svg>
      <span className="summary-toggle-label">Summary</span>
    </button>
  );
}

function SideHead({
  side,
  team,
  score,
  leading,
  align,
}: {
  side: EspnMatchupSide;
  team: EspnStandingsTeam | undefined;
  score: string | null;
  leading: boolean;
  align: 'left' | 'right';
}) {
  return (
    <div className={`mup-side mup-side-${align}${leading ? ' mup-leading' : ''}`}>
      <TeamLogo team={team} />
      <span className="mup-side-id">
        <span className="mup-side-name">{team?.name ?? `Team ${side.teamId}`}</span>
        {team && <span className="mup-side-rec">{record(team)}</span>}
      </span>
      {score !== null && <span className="mup-side-score">{score}</span>}
    </div>
  );
}

export default function LeagueMatchupView({
  board,
  matchupId,
  initialTeamId,
  onSideTeam,
  initialReading,
  onReading,
  onClose,
  standalone,
  onOpenDetails,
  projection,
  projected,
  projectionLoading,
  onProjected,
  transactions,
  onOpenPlayer,
  presets,
  maxDate,
  today,
  scheduleWindow,
  scheduleLoading,
  matchupWindow,
  onNeedSchedule,
  pitcherLookup,
}: {
  board: EspnScoreboard;
  matchupId: number;
  /**
   * **Which page this opens on, named by the team rather than by the side** —
   * because a team id is what every caller knows. A scoreboard card knows the
   * pair and passes null, which is the Summary in the middle; a Rankings row
   * knows one team, and the page works out which side of the matchup he is.
   * Read once, at mount: after that the strip is the reader's.
   */
  initialTeamId: number | null;
  /**
   * Which page is on screen, reported back as the team whose page it is (null
   * on the Summary). That is what keeps `mt=` describing the page in front of
   * the reader rather than only the one it opened on — the rule every other
   * param on this view follows.
   */
  onSideTeam?: (teamId: number | null) => void;
  /**
   * **Which reading of a team page it opens on**, and — like `initialTeamId` —
   * read once at mount, the switch owning it after that. `mr=` in the URL; see
   * `reading` below for why a reading is in the URL at all and `App.tsx` for
   * why the param is spelled the way it is.
   */
  initialReading?: MatchupReading;
  /** And the reading reported back as the reader crosses the switch, so `mr=`
   *  describes the page in front of them rather than the one it opened on —
   *  the rule `onSideTeam` follows one line up. */
  onReading?: (reading: MatchupReading) => void;
  onClose: () => void;
  /**
   * **The same page, as a tab rather than as a box over one.**
   *
   * This component is drawn in two places and they are the same page: the
   * League view's Scoreboard opens a *card* as a page over itself, and the
   * `Matchup` tab opens the reader's own week as a page of the app. What
   * differs is not the matchup but what is behind it — an overlay covers a
   * view and has to pin it, inert it, take its focus and give it back on
   * Escape; a tab has nothing behind it to do any of that to.
   *
   * So the flag turns off exactly those four and the way out that goes with
   * them (`onClose` is never called, and the Back row is not drawn — the tab
   * strip above is the navigation). Everything the page *is* — the three
   * readings, the strip, the dates, the tools, the bars — is untouched, which
   * is the point: two drawings of one page, not two pages that resemble each
   * other.
   */
  standalone?: boolean;
  onOpenDetails: (key: string) => void;
  /**
   * **Where this week is heading**, and the reader's own lens on it — the
   * Scoreboard's `Projected` toggle, drawn here too.
   *
   * The state and the read both live in App, which is where they were: the
   * toggle is in the URL as `proj=1`, and one read serves both surfaces, so a
   * reader who projects the board and then opens a card gets the projected
   * figures with nothing fetched a second time. Null until it lands, and
   * `ok: false` on a period there is nothing left to project.
   */
  projection: EspnProjection | null;
  projected: boolean;
  /** The projection is in flight — the mark for which goes inside the button
   *  that started it, this card going on drawing the figures it has until the
   *  answer lands. App owns it because App owns the read. */
  projectionLoading?: boolean;
  onProjected: (on: boolean) => void;
  /** The League view's own transactions feed, read on entry to that view and
   *  kept — this page is opened from it, so the Moves section costs no read of
   *  its own. Null until it lands, and while it is null the section is the
   *  count alone, which is what it has always been. */
  transactions: EspnTransactions | null;
  /** Opens a transacted player's page by MLB id, the Transactions tab's own
   *  route in: the kind is resolved from the season roster up in App, a
   *  transaction saying a player moved and not whether he pitches. */
  onOpenPlayer?: (mlbId: number) => void;
  /** The app's own named spans, handed down rather than rebuilt here — one
   *  definition of what `Today` means, and the matchup's own span is added to
   *  them below. */
  presets: DatePreset[];
  maxDate: string;
  today: string;
  /** Every club's next four weeks, read once per session by App and shared: the
   *  Schedule view's own data takes no parameters, so a second read here would
   *  buy a wait and nothing else. Null until somebody asks for it. */
  scheduleWindow: ScheduleWindow | null;
  scheduleLoading: boolean;
  /** The league's own two matchup periods — the Schedule view's named spans.
   *  Shared from App like the window beside it rather than derived from
   *  `board`, whose `start`/`end` are the *observed* span and truncate at today
   *  for the week being played (see `espn.ts::getMatchupWindow`). */
  matchupWindow: MatchupWindow | null;
  onNeedSchedule: () => void;
  /**
   * **The season roster reduced to what naming a pitcher takes** — the same
   * `PitcherLookup` App builds for its own Schedule view, handed down rather
   * than rebuilt, so a day read on a team page and the same day read on the
   * roster table cannot come to name two different men.
   *
   * **Null means the names are not in hand yet**, and the index is not built
   * until they are — App collapses its own `playersLoading` into this prop for
   * that reason. It is the same wait the roster view takes and for the same
   * measured reason: a cell naming the opposing starter is a line taller than
   * one that cannot, so an index built before the list lands would grow the
   * grid under the reader a beat later. Rule 1 is intact meanwhile — with the
   * index null the table goes on drawing its stat columns.
   */
  pitcherLookup: PitcherLookup | null;
}) {
  // Both off in the standalone reading — see `standalone`. A page does not pin
  // the document it is part of, and there is no background outside a tab.
  useLockBodyScroll(!standalone);
  const viewRef = useRef<HTMLDivElement | null>(null);
  useOverlayFocus(viewRef, undefined, !standalone);
  /**
   * **The band is measured rather than declared**, which is what carrying a
   * team page's controls costs it: the head is one row of tabs on the Summary
   * page, that row plus the tools on a team page, and the tools themselves wrap
   * to a second line on a phone — three heights for one box, and no stylesheet
   * can know which is in force. `useOverlayChromeOffset` writes it onto the
   * overlay as `--details-chrome-h`, where `.details-view`'s own rule (this
   * page is folded onto it) turns it into the `--scroll-offset` every
   * `scroll-margin-top` inside here reads — a clip in a team page's feed
   * scrolling itself into view was landing behind this band, and it now clears
   * whatever the band currently is. Zero whenever it is not pinned, which the
   * hook reads off the computed `position` rather than off a second copy of the
   * rule: the roster reading makes the chrome `static` and gives the scroll to
   * the table's own pane.
   */
  const chromeRef = useOverlayChromeOffset<HTMLDivElement>(viewRef);

  /**
   * **The page it opens on, resolved from the team the caller named.** A
   * lazy initialiser rather than an effect: the board and the matchup are
   * props at mount, so the first paint is already the right page — where an
   * effect would draw Summary and swap a frame later. After mount the strip
   * owns it, so a `mt=` that changes underneath (which nothing does today, the
   * page being unmounted on close) cannot yank the reader off the tab they
   * pressed.
   */
  const [sideTab, setSideTab] = useState<MatchupSideTab>(() => {
    if (initialTeamId == null) return 'summary';
    const m = board.matchups.find((x) => x.id === matchupId);
    if (!m) return 'summary';
    if (m.away?.teamId === initialTeamId) return 'away';
    if (m.home.teamId === initialTeamId) return 'home';
    // A team id this matchup has no side for — a hand-made link, or one
    // outliving the week it was written in. Summary is the honest answer, and
    // the effect below then clears `mt=` rather than leaving it claiming a page
    // that isn't open.
    return 'summary';
  });
  /**
   * **Which of a team page's three readings is on screen.**
   *
   * `roster` is the app's own Roster table over a span the reader picks,
   * `summary` is that same table over **the matchup so far** and nothing else,
   * and `feed` is his stream. Seeded from `mr=` at mount, the rule
   * `initialTeamId` follows: the strip owns it after that, and it is reported
   * back up so the param describes the page in front of the reader.
   *
   * **A reading is in the URL because it decides which data is on screen** —
   * the test `view=`, `win=`, `mp=` and `mt=` are all in the URL for. That is a
   * change of position rather than of rule: `mup` and `mt` were the whole of
   * what a matchup link carried while a reading was only *which cut of the same
   * span* a page drew, and `summary` is not that — it is a different span,
   * derived rather than picked, which a link that dropped it would silently
   * turn back into whatever range the recipient's own default seeded. The three
   * things still out of the URL (`kind`, the feed's lens and its order) narrow rows inside a reading; they do not decide the days.
   */
  const [reading, setReading] = useState<MatchupReading>(() => initialReading ?? 'roster');
  /**
   * **Which kind of play the feed reading is narrowed to** — the app's own row
   * of pills (`FeedFilterPills`), on somebody else's stream.
   *
   * It was the one half of the Feed view this page did not have, and the reason
   * recorded for its absence was that this page's control row already carried
   * four groups. That is an argument about `mup-tools`, and the pills are not in
   * it: they sit **in the page, at the head of the stream they narrow**, which
   * is where the Feed view puts them and for a reason that holds here word for
   * word — a reader arrives at a leaguemate's week asking *what did his batters
   * actually do*, and without a lens the answer is three hundred items of which
   * a dozen are the question.
   *
   * **The `New` watermark did not come with them**, and that half of the old
   * reasoning stands: the marker is a fact about how far down *the reader's
   * own* stream they have got, saved on their own record (`UserPrefs.seenPlays`
   * — one watermark, not one per team), so a red count over a leaguemate's
   * plays would be counting somebody else's day against the reader's marker and
   * `Clear` would mark the reader's own feed read from a page that is not it.
   *
   * The overlay owns it for the reason it owns the reading, the kind, the dates
   * — those are chrome above *both* team pages and must not reset when the
   * reader crosses from one manager to the other. And it is **state rather than
   * anything in the URL** — `mup`, `mt` and `mr` are the whole of what a matchup
   * link carries, and `plays=` stays the app's own Feed view's alone, two params
   * never meaning two things.
   */
  const [feedLens, setFeedLens] = useState<FeedLens>('all');
  /* Which way that stream ran was a second piece of state here, held beside the
     lens and out of the URL for the same reason (`mup`, `mt` and `mr` are the
     whole of what a matchup link carries). It is gone with the control. */
  const [dateOpen, setDateOpen] = useState(false);
  /* Stable for `useDismissable`'s sake — see the same note on the app's own
     copy, whose effect is keyed on the callback it is handed. */
  const closeDates = useCallback(() => setDateOpen(false), []);
  const [scheduleSpan, setScheduleSpan] = useState<ScheduleSpan | null>(null);
  /**
   * **The projected reading of a team page** — the app's own Roster-view lens,
   * on somebody else's roster, and the third of this row's readings of one set
   * of cells beside the plain table and the Schedule view.
   *
   * The overlay owns it for the reason it owns the reading, the kind, the dates
   * — those are chrome above *both* team pages and must not reset when the
   * reader crosses from one manager to the other. And it is state rather than
   * anything in the URL — `mup`, `mt` and `mr` are the whole of what a matchup
   * link carries, and this is a lens over a reading rather than a reading.
   *
   * **Not the Summary page's `Projected`**, which is a different lens on a
   * different object: that one projects the *matchup*'s categories and lives
   * inside the card it acts on. This projects a line per player, off
   * `/api/projection/roster` — the same engine asked the same question the main
   * roster view asks it, so a row here and a row there are one arithmetic.
   *
   * The projection is held **with the team it was read for**, so crossing to
   * the other manager cannot draw one team's lines over the other's roster in
   * the beat before the new read lands: the keys would mostly miss, and every
   * row would quietly fall back to its real figures under a `Projected`
   * caption.
   */
  const [teamProjected, setTeamProjected] = useState(false);
  const [teamProjection, setTeamProjection] = useState<{
    teamId: number;
    p: RosterProjection;
  } | null>(null);
  const [teamProjLoading, setTeamProjLoading] = useState(false);
  /** The span the reader was on when they turned the lens on, so turning it off
   *  puts them back rather than stranding them in a week with no stats in it —
   *  the preset with it, so `Matchup` goes back to *being* Matchup rather than
   *  to the two dates it happened to mean. */
  const beforeProjection = useRef<{ start: string; end: string; preset: string | null } | null>(
    null,
  );
  /**
   * **The matchup's own days**, or null where the period has no dates to name —
   * an anchor the schedule could not be read for, where a span with no days in
   * it would be worse than none.
   *
   * Hoisted above both readers so they cannot come to disagree: the `Matchup`
   * preset below is built from it, and the default span is seeded from it, so
   * the default can never select a preset the row does not contain.
   */
  const matchupSpan = useMemo(
    () => (board.start && board.end ? { start: board.start, end: board.end } : null),
    [board.start, board.end],
  );

  /**
   * **The days a team page reports on: today on the week being played, and the
   * matchup's own days on one that is over.**
   *
   * The first half is the reading a manager arrives with — *what is his team
   * doing right now* — and it is what the app's own roster views open on, which
   * is the whole point of these pages being those views. That argument is right
   * about the live week and is plainly wrong about a settled one: on last
   * week's matchup `Today` names days that are not in the matchup at all, so
   * the roster table would have nothing to do with the categories the Summary
   * page next door is drawn from. A page opened on a finished week is opened to
   * read that week.
   *
   * **The test is `board.live`, which is the flag the header's own `Live` /
   * `Final` tag reads** — deliberately not a second definition of "current"
   * derived from the dates, which are the *observed* span and truncate at today
   * for the week being played (see **ESPN fantasy league**, *The matchup
   * window*). So the page cannot say `Final` beside the week and open on today,
   * whichever way ESPN's own clock happens to be running: in the ~90 minutes
   * each morning before ESPN opens the new matchup period, the board is the
   * week that has just ended, says `Final`, and opens on that week's days,
   * which is exactly what it is showing.
   *
   * **The fallback is `Today`**, because `Matchup` is only in the preset row
   * when there are dates to name it with — a control marking a preset the row
   * does not contain is worse than the old default.
   *
   * **A lazy initialiser rather than an effect**, the rule `sideTab` above
   * follows: the board is a prop at mount (App draws this page only once the
   * scoreboard has landed), so the first paint is already the right span, where
   * an effect would draw today's rows, fetch them, and swap a frame later.
   *
   * And it applies **once**. A week that settles under a reader who has the
   * page open must not move the days out from under them, and neither must the
   * live poll re-running with a newer board; the reader's own pick — a preset
   * or a custom range — is the last word from the moment they make it. That
   * costs nothing in reach: closing the page unmounts it, and stepping the
   * period on the Scoreboard clears `mup=`, so every other matchup is a fresh
   * mount and a fresh default.
   */
  const [span, setSpan] = useState<{ start: string; end: string; preset: string | null }>(() =>
    !board.live && matchupSpan
      ? { ...matchupSpan, preset: 'Matchup' }
      : { start: today, end: today, preset: 'Today' },
  );

  /**
   * The app's presets plus **this matchup's own span**, which is the one named
   * range that means something only here: `Matchup` is the days the categories
   * next door were summed over — for a week still being played, the days played
   * so far, so the two agree rather than the table quietly including a day the
   * score does not.
   *
   * It leads, being the reason a reader is on this page at all, and it is
   * absent where the period has no dates to name.
   */
  const spanPresets = useMemo<DatePreset[]>(
    () => (matchupSpan ? [{ label: 'Matchup', ...matchupSpan }, ...presets] : presets),
    [matchupSpan, presets],
  );

  const teams = useMemo(() => new Map(board.teams.map((t) => [t.id, t])), [board.teams]);
  const groups = useMemo(() => categoryGroups(board.categories), [board.categories]);
  const matchup = board.matchups.find((m) => m.id === matchupId) ?? null;

  /**
   * **This matchup's own projection**, or null where there is nothing to draw.
   *
   * Read by id rather than by position — the projection comes back in ESPN's
   * order and this page was opened on one row of it — and gated on the same two
   * things the Scoreboard's toggle is: a **categories** league, whose card is a
   * grid of categories where a points league's is one number a side that the
   * projection does not fill, and a **live** period, a settled week having
   * nothing left to happen (which the server says in as many words, `ok: false`
   * with `note: 'settled'`).
   *
   * `projectable` and `showingProj` are two different questions and both are
   * needed: the first decides whether the control is drawn at all, and the
   * second whether the figures on screen *are* the projection — false while the
   * read is still out, so the page shows the live figures under an unlit button
   * rather than blanking, which is the app's own rule that nothing goes empty
   * over data it already has.
   */
  const projectable = board.format === 'h2h-categories' && board.live;
  const projMatchup =
    projectable && projected && projection?.ok
      ? projection.matchups.find((m) => m.id === matchupId) ?? null
      : null;
  const showingProj = matchup !== null && projMatchup !== null;

  /**
   * Which page is on screen, and whose it is.
   *
   * Hoisted above the `!matchup` return because the effect that reports it up
   * is a hook and hooks cannot sit past a conditional return. `active` is the
   * strip's own answer with the one override a bye forces — one team, so the
   * page *is* his — and `sideTeamId` is that read as a team, which is exactly
   * what `mt=` wants and what the team page below already needed.
   */
  const active: MatchupSideTab = matchup ? (matchup.away ? sideTab : 'home') : 'summary';
  const sideTeamId = !matchup
    ? null
    : active === 'away'
      ? matchup.away?.teamId ?? null
      : active === 'home'
        ? matchup.home.teamId
        : null;

  /**
   * The strip reported up, so the URL keeps saying which page is open. It is a
   * `setState` at the other end, so the identity is stable and this fires once
   * per real change; a matchup with no side for the id it was given corrects
   * itself here, `sideTeamId` being null on the Summary it fell back to.
   */
  useEffect(() => {
    onSideTeam?.(sideTeamId);
  }, [sideTeamId, onSideTeam]);

  /** And the reading, for `onSideTeam`'s reason exactly: `mr=` has to describe
   *  the page in front of the reader, not the one the link opened. */
  useEffect(() => {
    onReading?.(reading);
  }, [reading, onReading]);

  /**
   * **This team's projection**, read on the first press and whenever the team,
   * the days or the lens itself change.
   *
   * Every parameter is one `/api/report` takes above it and the server resolves
   * the roster the same way, so the lines this describes are the rows that
   * report describes — which two answers to "which players" a moment apart
   * could not promise.
   *
   * **Never over data**: the last answer stands while the next is in flight, so
   * changing the range does not blank a table somebody is reading, and the only
   * mark a press leaves is the ball inside the control that started it. A
   * **failed** read costs the lens its figures and nothing else — the table
   * falls back to the report's own numbers rather than the page becoming a
   * message, which is the direction the schedule window already fails in.
   */
  const teamProjRead = useRef(0);
  const loadTeamProjection = useCallback(
    (quiet = false) => {
      if (sideTeamId === null) return;
      // Sequence-numbered rather than canceled per run, which the poll below is
      // what makes necessary — two reads can be in flight at once, and only the
      // newest may write. The team id rides on the answer as it always has, so
      // a page that has moved to the other manager cannot be drawn from this
      // one's.
      const seq = ++teamProjRead.current;
      if (!quiet) setTeamProjLoading(true);
      void api
        .rosterProjection(span.start, span.end, 'fantasy', sideTeamId)
        .then((p) => {
          if (seq === teamProjRead.current) setTeamProjection({ teamId: sideTeamId, p });
        })
        .catch((e: Error) => {
          if (seq === teamProjRead.current) console.error('reading the team projection failed:', e.message);
        })
        .finally(() => {
          if (seq === teamProjRead.current && !quiet) setTeamProjLoading(false);
        });
    },
    [sideTeamId, span.start, span.end],
  );

  useEffect(() => {
    if (!teamProjected || sideTeamId === null) {
      // Turning the lens off mid-read discards its answer, so the flag has to
      // be cleared on the way out as well as set on the way in — otherwise the
      // ball goes on spinning inside a toggle that is doing nothing.
      teamProjRead.current += 1;
      setTeamProjLoading(false);
      return;
    }
    loadTeamProjection();
  }, [teamProjected, sideTeamId, loadTeamProjection]);

  /**
   * **And it re-reads itself while the week is being played**, on the League
   * page's own minute — the same correction the Roster view's lens takes on the
   * report's twenty seconds, for the same reason. The server projects only the
   * games that have not started, so every first pitch moves a game out of this
   * table's estimate and onto the report beside it; read once when the toggle
   * was pressed, the lens was the one thing on a live page frozen at the moment
   * of the press.
   *
   * `board.live` is the gate, which is the poll's own rule up in App: a settled
   * week has nothing left to move. **Quiet**, so nothing blanks and no ball
   * turns in the toggle, and the last answer stands until the next one lands.
   */
  useEffect(() => {
    if (!teamProjected || sideTeamId === null || !board.live) return;
    const t = setInterval(() => loadTeamProjection(true), LEAGUE_POLL_MS);
    return () => clearInterval(t);
  }, [teamProjected, sideTeamId, board.live, loadTeamProjection]);

  /**
   * **Turning the lens on moves the reader to the days it is about**, which is
   * the main roster view's own rule and is what makes the toggle answer a
   * question rather than draw a table of dashes: a projection over days that
   * have been played is a projection of nothing, and a team page opens on
   * `Matchup` for a settled week and on `Today` for a live one — neither of
   * which is the days ahead.
   *
   * The end is `matchupWindow`'s rather than `board.end`, and that is the same
   * trap the head above already documents: the board's dates are the *observed*
   * span and truncate at today for the week being played, so projecting to them
   * would be projecting to yesterday. With no window at all it is the week
   * ahead, which is what a reader with no league gets on the roster view.
   *
   * The date control is untouched, so the reader is free to move off it, and
   * turning the lens **off** puts the span back where it was. **The Schedule
   * view goes off with it** — that mode replaces the stat *columns* with days
   * and this replaces the *figures* in them, so they are two readings of one
   * set of cells and cannot both be in force.
   */
  const toggleTeamProjected = useCallback(() => {
    setTeamProjected((on) => {
      if (on) {
        const back = beforeProjection.current;
        beforeProjection.current = null;
        if (back) setSpan(back);
        return false;
      }
      beforeProjection.current = span;
      const to = matchupWindow?.end ?? addDays(today, 6);
      setSpan({ start: today, end: to < today ? today : to, preset: null });
      setScheduleSpan(null);
      return true;
    });
  }, [span, matchupWindow, today]);

  // The Schedule view's index, or null while the mode is off or either of its
  // two reads is still out — "the mode is the presence of an index rather than
  // a flag beside one", which is what makes "on but still reading" impossible
  // to draw. **`pitcherLookup` is the second of those reads**: the index names
  // the opposing starter in every cell, and a grid built before the season
  // roster lands would draw those cells a line short and grow under the reader
  // when it arrives — App's own Schedule view waits on the same list for the
  // same measured reason, and hands this down already gated on it.
  const scheduleIndex = useMemo(
    () =>
      scheduleSpan !== null && scheduleWindow && pitcherLookup
        ? buildScheduleIndex(scheduleWindow, scheduleSpan, matchupWindow, pitcherLookup)
        : null,
    [scheduleSpan, scheduleWindow, matchupWindow, pitcherLookup],
  );

  /**
   * Escape closes this page — **once**, and only when nothing is stacked above
   * it. `answersEscape` marks the press so a ladder unwinds one rung per key,
   * and the subtree test in front of it is `PlayerDetails`' own: a full-page
   * table box lives *inside* this overlay and answers for itself.
   */
  useEffect(() => {
    // Nothing to close in the standalone reading, and that is the whole test:
    // one press of Escape undoes exactly one thing, so a listener that answers
    // and then does nothing would swallow the press a dialog above it wanted.
    if (standalone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (viewRef.current?.querySelector('.is-expanded')) return;
      if (!answersEscape(e, viewRef.current)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, standalone]);

  // Turning the Schedule view on is what asks App for the window; it is one
  // read per session, shared with the roster views' own copy of this mode.
  useEffect(() => {
    if (scheduleSpan !== null) onNeedSchedule();
  }, [scheduleSpan, onNeedSchedule]);

  // Crossing between the three pages puts this one back at the top: a page is a
  // different reading of the matchup, not a place in one — the rule the player
  // page's own tabs follow.
  useEffect(() => {
    viewRef.current?.scrollTo({ top: 0 });
  }, [sideTab, reading]);

  /**
   * **The `Projected` tag is the Summary page's**, because the figures it
   * describes are.
   *
   * The head is shared by all three pages, so without this gate it would sit
   * over a *roster table* calling that manager's stats a projection. The toggle
   * itself needs no gate of its own any more — it is drawn inside the card, and
   * the card is the Summary page (see the row above `Moves`), which is the
   * tidier version of the same rule: a control cannot be on a page it has
   * nothing to act on if it lives in the thing it acts on.
   */
  const onSummary = matchup !== null && active === 'summary';
  const headProj = onSummary && showingProj;

  /**
   * **The days the figures cover, and while projected that is the whole
   * period** rather than the part of it that has been played.
   *
   * `board.end` is the *observed* span and truncates at today for a live week,
   * which is exactly right for figures that are what has happened and a lie
   * over figures that reach the end of it. The projection carries the period's
   * own last day for this — the Scoreboard's head does the same thing with the
   * same two fields, so the two pages cannot print different weeks over the
   * same numbers.
   */
  const headEnd = (headProj ? projection?.end : null) ?? board.end;
  const period = (
    <span className="mup-week">
      <span className="mup-week-n">Week {board.matchupPeriod}</span>
      {/* **The date bar's own wording, not a second one that agrees with it.**
          This head open-coded the span and so did the Scoreboard's and the
          Rankings caption, and all three parted from the roster's date face on
          exactly one reading: a period one day old printed `Aug 19` here where
          the bar printed `Wed, Aug 19`. `wideRange` is the one function now —
          see `lib.ts`. */}
      {board.start && headEnd && (
        <span className="mup-week-dates">{wideRange(board.start, headEnd)}</span>
      )}
      {/* **`Projected` replaces `Live` rather than joining it**, which is the
          Scoreboard's own rule: the tag says what the figures on the page *are*,
          and two of them would be the page claiming to be both. */}
      <span
        className={`lg-state${
          headProj ? ' lg-state-proj' : board.live ? ' lg-state-live' : ''
        }`}
      >
        {headProj ? 'Projected' : board.live ? 'Live' : 'Final'}
      </span>
    </span>
  );

  /**
   * The pinned band: the Back row, and under it whatever navigation the page
   * has — the strip of three pages, or the team itself on a bye — with the bars
   * key beside it where there is one.
   *
   * **The key is a sibling of the strip rather than a corner of the band.** It
   * spent a round absolutely positioned at the top right of the screen, which
   * put it as far from the tabs as the window is wide and made the Back row
   * reserve 34px for a box it knew nothing about. Beside the strip it is where a
   * reader's eye already is, and the row can keep the tabs centered *and* hold
   * it — see `.mup-nav-row`, which does that with a grid rather than by
   * centering the pair (which would sit the tabs 19px left of center).
   */
  const head = (extra: ReactNode, key?: ReactNode) => (
    <div className="mup-chrome" ref={chromeRef}>
      <div className="mup-bar">
        {/* The way back, and the only one this page needs: it was opened from a
            card on the Scoreboard and returns to it. It is `BackButton` — the
            app's one back control — where it used to be `.details-back`'s class
            around the text `‹ Back`, which is the same *class* as the player
            page's and was not the same button: 65.03 × 31 against 80.08 × 34,
            the chevron being an 18px icon there and a text glyph here. */}
        {/* The way back, and only where there is somewhere to go back *to*: the
            Scoreboard card this was opened from. As the `Matchup` tab it is a
            page of the app and the tab strip above is how you leave it, so a
            Back button here would be a control pointing at nothing. */}
        {!standalone && <BackButton onClose={onClose} />}
        {/* Printed rather than navigable. The arrows are the Scoreboard's,
            which is the page about *which* week; here the week is context the
            numbers cannot be read without — a live period's totals cover the
            days played so far, which is why the dates and the state are
            together. */}
        {period}
      </div>
      {/* **The strip is part of the head rather than of the page.** It is this
          page's own navigation — which of the three readings of the matchup is
          on screen — and that is the one thing that should not scroll away from
          under a reader partway down a team's feed. It is the argument
          `.details-chrome` makes for the player page's tabs and `.app-chrome`
          makes for the view bar, one page along. */}
      {key ? (
        <div className="mup-nav-row">
          {extra}
          {key}
        </div>
      ) : (
        extra
      )}
      {/* **The team page's own reading controls used to end this band and are
          in the page now**, which reverses what the paragraph here used to say
          — *which manager and which reading of him are one statement, and half
          of it scrolling away under the other half is the fault `.app-chrome`
          answers by pinning the pair*. The app settled it the other way one page
          along and this follows it: **which page you are on** is what must not
          leave the screen, and **which reading** is set on arrival. The band is
          the week, the manager and the strip; the readings and the days are
          below it, the first scrolling away and the second pinned under it.
          That takes the pinned band from 144px to 96 at 1200 and buys the rows
          the difference. */}
    </div>
  );

  /**
   * **The chart behind a category row.** A press on a row of the comparison
   * opens that category's day-by-day series for this matchup's two sides.
   *
   * It lives here rather than on the scoreboard, where it was first built. A
   * scoreboard card is a *summary* — ten of them on one page, each a grid of
   * twenty figures — and hanging a dialog off one of those numbers put a study
   * tool on the page whose job is to be scanned; nothing about a bare figure
   * said it was pressable, and the card around it is itself a press, so the
   * plain reading was "the card is the button". This page is the one you open
   * to *study* one matchup, its rows are already the category comparison, and
   * a row is a target a finger can find.
   *
   * **Lazy on the first press**, which is what earns the series a route of its
   * own: a week of ESPN rosters summed a day at a time has no business on the
   * boot path of a page most readers open to look at a roster. Cached for the
   * life of the page — a second category is free, and the page is remounted
   * per matchup anyway.
   */
  const [openStat, setOpenStat] = useState<number | null>(null);
  const [series, setSeries] = useState<EspnMatchupSeries | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const asked = useRef(false);

  const openCategory = useCallback(
    (statId: number) => {
      setOpenStat(statId);
      if (asked.current) return;
      // **Marked only once it is answered** — the rule this repo has written
      // down four times now: a mark set before the fetch makes a failed read
      // unrepeatable, and a failed chart has to be retryable by pressing again.
      setSeriesError(null);
      api
        .espnMatchupSeries(board.matchupPeriod)
        .then((r) => {
          asked.current = true;
          setSeries(r);
        })
        .catch((e: Error) => setSeriesError(e.message));
    },
    [board.matchupPeriod],
  );

  if (!matchup) {
    return (
      <DialogLayerContext.Provider value={MATCHUP_LAYER}>
        <div ref={viewRef} tabIndex={-1} className="mup-view">
          {head(null)}
          <div className="empty-state">
            <h3>That matchup isn&rsquo;t in week {board.matchupPeriod}</h3>
            <p>
              ESPN has no row for it — the link may be for another week. Go back and pick one off
              the scoreboard.
            </p>
          </div>
        </div>
      </DialogLayerContext.Provider>
    );
  }

  /**
   * **The two sides the Summary is drawn from**, which is the projection where
   * one is in force.
   *
   * The comparison's whole job is to set two sides against each other across
   * the league's categories and mark the winner, and that arithmetic is
   * identical whether the figures are what has happened or what is going to —
   * so the *data* is swapped and every line below it is the code that was
   * already checked. `asProjected` is the Scoreboard's own function rather than
   * a second one here, and it keeps the team ids and the acquisitions off the
   * live side: a manager's moves are a fact about the period so far and are not
   * projected either way, which is why the Moves section reads the same under
   * both lenses.
   *
   * The strip, `active` and `sideTeamId` above are unaffected by construction —
   * they read team ids, which the swap preserves.
   */
  const shown = showingProj && projMatchup ? asProjected(matchup, projMatchup) : matchup;
  const { home, away } = shown;
  const openCat =
    openStat === null ? null : board.categories.find((c) => c.statId === openStat) ?? null;
  /**
   * **Who is ahead**, which is deliberately not the same claim as who won.
   *
   * `matchup.winner` is null for the whole of the week being played — the
   * server sets it only once the period is settled (`espn.ts`, `else if (live)
   * winner = null`), because a winner is a settled fact and ESPN's own field
   * says `UNDECIDED` until it is one. Read straight, that left the *live*
   * matchup — the one anybody is actually looking at — with neither side
   * marked: two gray triples, and a meter with no green in it.
   *
   * So the page reads the tally instead, which is the same comparison the
   * server makes when it does settle one (`hw > aw ? 'home' : …`) and which
   * agrees with ESPN's own `winner` on every one of the league's 108 settled
   * matchups. `away.losses` is `home.wins` by construction, so the two tests
   * cannot both hold, and a dead-level week marks neither.
   */
  const ahead =
    away === null
      ? null
      : away.wins > away.losses
        ? away.teamId
        : home.wins > home.losses
          ? home.teamId
          : null;
  const score = (side: EspnMatchupSide) =>
    board.format === 'h2h-points'
      ? typeof side.points === 'number'
        ? String(Math.round(side.points * 100) / 100)
        : '—'
      : catScore(side);

  const awayName = away ? teams.get(away.teamId)?.name ?? `Team ${away.teamId}` : '';
  const homeName = teams.get(home.teamId)?.name ?? `Team ${home.teamId}`;

  /**
   * The three runs of the matchup meter — away's categories, the ties, home's —
   * and the sentence a reader gets on hover or from a screen reader, a bar
   * being a thing you see rather than a thing you can read.
   *
   * Null on a bye and on a points league, both of which have no categories to
   * split: a bye has nobody to be ahead of, and a points league has one number
   * a side and says so in its own note below.
   */
  const meter =
    away && board.format !== 'h2h-points'
      ? {
          away: away.wins,
          ties: away.ties,
          home: away.losses,
          label: `Categories: ${awayName} ${away.wins}, ${homeName} ${home.wins}${
            away.ties > 0 ? `, ${away.ties} tied` : ''
          }`,
        }
      : null;

  /**
   * **The key to the bars, beside the strip of three pages.**
   *
   * It sat beside the meter it describes, which is where a key usually belongs
   * and is the one place on this page it could not stay: the meter is a row in
   * the middle of a card that scrolls, so the key scrolled away with it — and
   * what it explains is not that bar alone but every bar under it, ten category
   * rows the reader is still going down when the button has gone. In the pinned
   * head it is on screen for the whole of that reading.
   *
   * **Beside the tabs rather than in the band's far corner**, which is where it
   * went first: at 1920 that is a thousand pixels from anything it explains, and
   * it made the Back row reserve space for a box positioned against the band
   * rather than laid out in it. The row keeps the tabs centered and holds the
   * key to their right, and gives that reservation back.
   *
   * Drawn only where there is something to explain — a points league has no bars
   * and a bye has no comparison, which is `meter`'s own test, and a team page has
   * no card, which is `onSummary`'s.
   */
  const barsKey =
    onSummary && meter !== null ? (
      <InfoKey className="mup-key" label="How to read these bars">
        <p>
          The bar under the two records is the <strong>whole matchup</strong> — the categories
          each side holds, ties between them, and the leader&rsquo;s share in green.
        </p>
        <p>
          Each category&rsquo;s own bar runs from its label toward whoever is ahead, and its
          length is the gap as a share of the two figures together. A long bar is a category one
          side is running away with; a sliver is a coin flip.
        </p>
        {/* **The gesture, third — where a line of its own over the comparison
            used to say it.** It reads here because this panel is already the
            answer to *what are these bars*, and what you can do to one is the
            last sentence of that rather than a separate caption.

            What it costs is that a reader has to open the key to be told —
            which is a real cost, this feature having shipped invisible once
            already (on the scoreboard, where it had to be reported). What is
            different here is the target: a category row is the full width of
            the card with a hover tint on it, where that one was four characters
            inside a card that was itself a press, so the affordance is doing
            most of the work and the sentence is the backstop.

            Kept on `groups.length` — its own gate before either move — so a
            categories league with nothing to press is not told to press it. */}
        {groups.length > 0 && (
          <p>
            <strong>Press any category</strong> for a day-by-day chart of the week.
          </p>
        )}
      </InfoKey>
    ) : null;

  /**
   * What a category row says on hover: the two figures and who is ahead, which
   * is the bar beside them put into words. It carries the category's **full**
   * name too, that being what the label under it abbreviates and what the cell
   * used to spend its own `title` on.
   */
  const rowTitle = (
    c: EspnCategory,
    l: number | undefined,
    r: number | undefined,
    w: 'left' | 'right' | 'tie' | null,
  ) => {
    const pair = `${fmtValue(l, c)} to ${fmtValue(r, c)}`;
    if (w === null) return `${c.name} — ${pair}`;
    if (w === 'tie') return `${c.name} — ${pair}: level`;
    return `${c.name} — ${pair}: ${w === 'left' ? awayName : homeName} ahead`;
  };

  /**
   * **The three pages**, away on the left and home on the right — the same
   * order the card puts them in, so the strip and the comparison cannot
   * disagree about which side is which.
   *
   * **A bye has no pages at all**, and that is the point rather than a
   * degenerate case: there is one team and nothing to compare it against, so a
   * `Summary` of one side would be a page whose whole content is the line the
   * scoreboard card already draws, and a strip of one tab is a control with no
   * choice in it. The page goes **straight to his roster and feed**, which is
   * what a manager on a bye week came for, and the head names the team where
   * the strip would have been.
   */
  /**
   * **The label is the team's short name and the title is its full one.** Three
   * tabs of `The Stickystackers` and `Brian&Tom's Excellent Adventure` clipped
   * mid-word at 320 — measured, two of the three — and filled the strip at
   * every width above it. `teamAbbrev` reads ESPN's own abbreviation where the
   * manager has set one, which is what ESPN's scoreboard shows and so what a
   * leaguemate already recognizes, and derives one only where the field is
   * empty. The full name goes on the tab's `title`, where it was already.
   */
  const sides: { tab: MatchupSideTab; label: string; title: string }[] = away
    ? [
        {
          tab: 'away',
          label: teamAbbrev(teams.get(away.teamId), away.teamId),
          title: `${teams.get(away.teamId)?.name ?? `Team ${away.teamId}`} — his roster and his feed`,
        },
        { tab: 'summary', label: 'Summary', title: 'The two teams, category by category' },
        {
          tab: 'home',
          label: teamAbbrev(teams.get(home.teamId), home.teamId),
          title: `${teams.get(home.teamId)?.name ?? `Team ${home.teamId}`} — his roster and his feed`,
        },
      ]
    : [];
  const homeTeam = teams.get(home.teamId);

  /**
   * **How many acquisitions each manager has spent this week**, at the foot of
   * the comparison.
   *
   * It is the one thing a category matchup turns on that is not a category: a
   * manager two behind in saves with `2/10` left has a move to make and one at
   * `10/10` has not, and until now the page said nothing about it. It reads as
   * a row of the comparison — the same `1fr auto 1fr`, so each figure lands
   * under the name it belongs to — because that is what it is.
   *
   * `5/10` where the league limits them per period and a bare count where it
   * does not, which is the honest reading of a league with no cap: the number
   * is still worth having, the denominator is not ours to invent. A manager
   * ESPN reports no counter for at all is a dash.
   */
  const acqCell = (side: EspnMatchupSide) =>
    side.acquisitions === null
      ? '—'
      : board.acquisitionLimit === null
        ? String(side.acquisitions)
        : `${side.acquisitions}/${board.acquisitionLimit}`;
  const acqTitle = (side: EspnMatchupSide) =>
    side.acquisitions === null
      ? 'ESPN reports no acquisition count for this team'
      : board.acquisitionLimit === null
        ? `${side.acquisitions} acquisitions this matchup period`
        : `${side.acquisitions} of ${board.acquisitionLimit} acquisitions used this matchup period`;

  /**
   * The two lists under the count. Null means the feed cannot answer for this
   * week — see `movesFor`, which is where that is decided and why.
   */
  const awayMoves = away ? movesFor(away, transactions, board.start, board.end) : null;
  const homeMoves = movesFor(home, transactions, board.start, board.end);
  /** Whether the section has anything to say at all beyond a count — which is
   *  what keeps it on screen for a league ESPN reports no counter for, where
   *  the two figures are dashes and the lists are the whole of it. */
  const hasMoves = (awayMoves?.length ?? 0) > 0 || (homeMoves?.length ?? 0) > 0;

  /**
   * What the head carries under the Back button: the strip, or — on a bye — the
   * team itself, since there is nothing to choose between and the reader still
   * has to be told whose roster this is.
   */
  const nav =
    sides.length > 1 ? (
      <div className="view-switch mup-sides" role="tablist" aria-label="Matchup">
        {sides.map((s) => (
          <button
            key={s.tab}
            type="button"
            role="tab"
            aria-selected={s.tab === active}
            className={`view-tab${s.tab === active ? ' active' : ''}${
              s.tab === 'summary' ? '' : ' mup-side-team'
            }`}
            title={s.title}
            onClick={() => setSideTab(s.tab)}
          >
            {/* The label is a span of its own so it can ellipsize: a tab is
                `inline-flex`, and `text-overflow` has no effect on a flex
                container's anonymous item — a 17-character team name clipped
                mid-letter with no ellipsis to say it had. */}
            <span className="mup-side-label">{s.label}</span>
          </button>
        ))}
      </div>
    ) : (
      <div className="mup-team-head">
        <TeamLogo team={homeTeam} />
        <span className="mup-side-id">
          {/* The name carries its own `title` here and nowhere else on this
              page: a bye has no tab strip, so this head is the only thing
              naming the team, and the longest name in the live league
              ellipsizes at 390 against the block opposite. Every other surface
              that truncates a team name has the strip or a card head to fall
              back on. */}
          <span className="mup-side-name" title={homeTeam?.name ?? `Team ${home.teamId}`}>
            {homeTeam?.name ?? `Team ${home.teamId}`}
          </span>
          {homeTeam && <span className="mup-side-rec">{record(homeTeam)}</span>}
        </span>
        {/* **The week's two facts, stacked at the right end** — why there is one
            team here rather than two, and what he has spent of his allowance
            while there was nobody to spend it against.

            A block rather than two loose items, because the head is then two
            columns that mirror each other: the team's own two lines on the left
            (who he is, how his season has gone) and the week's two on the right,
            each pair reading top-down. The acquisitions have nowhere else to go
            — the Summary page is where the two managers' counts are compared
            and a bye has no Summary page — and a line of their own is what buys
            the word rather than `ACQ`. */}
        <span className="mup-bye-block">
          <span className="lg-bye-tag">Bye</span>
          {home.acquisitions !== null && (
            <span className="mup-acq-tag" title={acqTitle(home)}>
              <span className="mup-acq-label">Acquisitions:</span> {acqCell(home)}
            </span>
          )}
        </span>
      </div>
    );

  /**
   * A team page's own controls — **the roster views' controls, because a team
   * page is those views**. Which reading, which kind, the Schedule view and its
   * span, and the dates: the same set, drawn from the same components, so a
   * reader who knows the Roster page knows this one.
   *
   * **They sit in the pinned head with the strip**, and they used to sit on the
   * page under it. The objection to putting them there was that the row belongs
   * to two of the three pages and would be an empty band on the third — which
   * is a fact about the Summary page and not an argument: the band is drawn
   * from what the page has, so on Summary there is simply no row, exactly as
   * there is no strip on a bye. What the page position actually cost is the
   * thing the strip is pinned to avoid: *which manager* stayed on screen the
   * whole way down a feed while *which reading of him* and *which kind* were an
   * inch of page you had to go back up for, and they are the controls a reader
   * crossing a leaguemate's week reaches for most.
   *
   * **The dates did not come with them.** See `dateBar` below, which is a line
   * across the box rather than a group in a row and would be a third line of
   * pinned chrome — where the row it opens is already a panel over the page.
   */
  const sideName =
    sideTeamId === null ? 'this team' : teams.get(sideTeamId)?.name ?? `Team ${sideTeamId}`;

  /* A club whose name already ends in an `s` takes the bare apostrophe. Its last
     reader used to be the `Starters` title; it survives that button's removal
     because the Summary face's titles name whose table is on screen. */
  const sidePossessive = /s$/i.test(sideName) ? `${sideName}’` : `${sideName}’s`;

  /* This page's own copy of the roster views' date bar, and it is the same
     component with this page's state in it — see `DateControls.tsx`. Its three
     readings are this page's three: the Schedule view swaps the table's stat
     columns for days ahead, the projected lens fills the span with estimates,
     and otherwise the span is the span.

     The bar sits **below** the tools row rather than in it, which is the shape
     it takes one level down: the row is groups that wrap, and this is a line.
     Measured at 390 the four groups already came to 382 against the 358 this
     box has, so the row wrapped — and it wrapped the calendar by itself, a lone
     36px square under two full-width switches with its range bubble hanging
     over nothing. That square is gone and the row is three groups now.

     **And it stayed on the page when the tools row went into the band.** It is
     a line rather than a group, so it cannot pack beside them — it would be a
     third row of pinned chrome on a phone, on a page whose band already carries
     the way back, the week, the strip and the tools. It is also the one control
     here that opens a panel *over* the page rather than changing it in place,
     and a disclosure is at its clearest directly above the thing it is about.
     It keeps its own row under the band (`.mup-dates`), at the same 12px from
     the table it always had. */
  const mupScheduleReading = reading === 'roster' && scheduleSpan !== null;
  /**
   * **The Summary reading's days, which are the page's rather than the
   * reader's**: the matchup's own span, which `board.start`/`board.end` already
   * publish clamped to today for the week being played (see `matchupSpan` and
   * *The matchup window* in **ESPN fantasy league**). So the table is summed
   * over exactly the days the category card next door is, which is the whole of
   * what this reading is for — the `Matchup` pill said the same thing and said
   * it as a *pick*, one press away from being stepped off by an arrow.
   *
   * **The fallback is the reader's own span**, for the reason the `Matchup`
   * pill was absent rather than dead in that case: a period with no dates to
   * name has no days for this reading either, and the honest answer is the ones
   * already on screen rather than an empty table. `matchupSpan` is null only
   * where the board carries no dates at all.
   */
  const summarySpan = matchupSpan ?? { start: span.start, end: span.end };
  const mupSummaryReading = reading === 'summary';
  /** The days actually on screen, whichever reading is drawing them — read by
   *  the table below and by the `Starters` tooltip, which says a different
   *  sentence for one day than for many. */
  const viewSpan = mupSummaryReading ? summarySpan : { start: span.start, end: span.end };
  const mupBarSpan = mupScheduleReading
    ? spanDates(scheduleIndex, scheduleSpan!, matchupWindow, today)
    : viewSpan;
  const mupBarReading: DateBarReading = mupScheduleReading
    ? {
        kind: 'schedule',
        span: spanLabel(effectiveSpan(scheduleSpan!, matchupWindow), matchupWindow).label,
      }
    : mupSummaryReading
      ? { kind: 'matchup' }
      : reading === 'roster' && teamProjected
        ? { kind: 'projected' }
        : { kind: 'dates', preset: span.preset };
  const mupStepTo = (delta: -1 | 1) => {
    if (mupScheduleReading) {
      const to = stepSpan(scheduleSpan!, matchupWindow, delta);
      return to === null
        ? { run: null, title: delta < 0 ? 'The first span offered' : 'The last span offered' }
        : {
            run: () => setScheduleSpan(to),
            title: `Show ${spanLabel(to, matchupWindow).label}`,
          };
    }
    const to = stepRange(span.start, span.end, delta, spanPresets, maxDate);
    return {
      run: to === null ? null : () => setSpan(to),
      title: stepTitle(span.start, span.end, delta),
    };
  };
  const mupPrev = mupStepTo(-1);
  const mupNext = mupStepTo(1);
  const dateBar = (
    <DateBar
      /* **This page's bar publishes `--date-bar-h` too**, which is what the
         team table's header row sticks below — the same arrangement the app's
         own Roster page has. Only one of the two is ever on screen: App draws
         no bar on the League or Matchup views, and this page is only ever
         opened over the League view or as the Matchup tab. */
      measure
      reading={mupBarReading}
      start={mupBarSpan.start}
      end={mupBarSpan.end}
      open={dateOpen}
      onToggle={() => setDateOpen((v) => !v)}
      onClose={closeDates}
      onPrev={mupPrev.run}
      onNext={mupNext.run}
      prevTitle={mupPrev.title}
      nextTitle={mupNext.title}
      /* The same rule the roster's bar is on, from the same component: in the
         Schedule reading the span run *is* the panel. This page's preset row
         leads with a `Matchup` pill of its own, and that is exactly the pill
         that would be least true there — the days on screen are the span's. */
      spanControl={
        mupScheduleReading ? (
          <ScheduleSpanTabs
            span={scheduleSpan!}
            matchup={matchupWindow}
            onChange={setScheduleSpan}
          />
        ) : null
      }
      /* And the same rule the app's own bar is on, from the same component: the
         face opens the calendar. The Feed reading had it first here and the
         Roster reading has it now, the preset row having gone from both bars
         together — and on this page the pill that led that row was `Matchup`,
         which is exactly the span the Summary reading beside it now *is*, held
         rather than picked. */
      popover={
        mupScheduleReading || mupSummaryReading ? null : (
          <DateCalendar
            start={span.start}
            end={span.end}
            max={maxDate}
            onChange={(s, e) => {
              setSpan({ start: s, end: e, preset: null });
              setDateOpen(false);
            }}
          />
        )
      }
      popoverLabel="Pick a range on the calendar"
      /* **In the Summary reading the days are the page**, so the bar states
         them and offers nothing: no arrows, and a face that is a `<div>` rather
         than a button. A range the reader could step would be a Summary of
         something other than this matchup a press later, which is the one thing
         this reading cannot be. */
      fixed={mupSummaryReading}
    />
  );

  const tools = (
    /**
     * **The four readings of a team page, as one run of toggles.**
     *
     * It was a `Roster | Feed` segmented pair and then three separate icon
     * buttons, and the pair is gone: the app's own Roster page settled this one
     * page along, where `Feed` became a toggle beside `Schedule` and
     * `Projected` rather than a tab beside `Roster`. The argument is the same
     * here and stronger, this page having a fourth. A segmented switch says
     * *pick one of these*; what these actually are is **departures from the
     * plain table**, one at a time, with the table itself being none of them
     * lit — which is what a run of toggles says and what the strip above
     * already says about *whose* page it is.
     *
     * The order is the app's: the stream, the fixtures ahead, what they are
     * worth, and then the matchup's own span. `FeedToggle` and `ScheduleToggle`
     * and `ProjectedToggle` are literally the components the Roster page draws,
     * so the two surfaces cannot come to differ.
     *
     * **And the ghosts are gone with the pinning.** Half the reasoning that
     * used to live here was about reserving the box a control vacated —
     * `.mup-tool-modes`, `.mup-tool-order`, `visibility: hidden` pairs, `order:
     * 1` to keep the blank trailing — and every word of it was in service of
     * one rule: *this row is pinned, so it must not change height under the
     * finger that pressed a reading*. The row is in the page now (see where it
     * is rendered), so a control that comes and goes moves page content by its
     * own height and nothing that is pinned at all. Four of the five are drawn
     * on every reading in any case; only the order toggle comes and goes, and
     * it is last in the run.
     */
    /* **`.view-tools`, which is the app's own row and not a copy of it.** The
       class is the fold: the Roster page's reading run and this one are the
       same set of controls answering the same question, so they share a
       selector rather than two rules that agree today — which also hands this
       row the container query the order toggle's word threshold is measured
       against, and the 640px rule that squares the run on a phone. What was
       here before (`.mup-tools`, `.mup-tool-icons`, the two ghosts and a
       container query of its own) was all in service of a card-column cap and
       a pinned band, and both are gone. */
    <div className="view-tools">
      <FeedToggle
        on={reading === 'feed'}
        onToggle={() => {
          if (reading === 'feed') {
            setReading('roster');
            return;
          }
          // The two column modes go off with it, the same exclusivity they
          // already state about each other: a stream has no stat columns for a
          // fixture list to replace or a projection to fill.
          setScheduleSpan(null);
          setTeamProjected(false);
          setReading('feed');
        }}
        title={
          reading === 'feed'
            ? `Back to ${sidePossessive} table`
            : `${sidePossessive} plays, in the order they came`
        }
      />
      <ScheduleToggle
        on={scheduleSpan !== null}
        loading={scheduleLoading}
        onToggle={() => {
          // Back to the table this is a reading *of*, which is what makes the
          // run one deep: pressed from the stream or from `Summary` it would
          // otherwise light over columns nobody is looking at.
          setReading('roster');
          setScheduleSpan((s) => {
            if (s !== null) return null;
            // **The projected lens goes off with it**, which is the same
            // exclusivity `toggleTeamProjected` states from the other side.
            // The range it moved the reader to stays, the days ahead being
            // exactly what a schedule is for.
            setTeamProjected(false);
            return defaultScheduleSpan(matchupWindow);
          });
        }}
      />
      {/* **The projected reading, after the Schedule view** — the roster row's
          own order, where these two are the third of *which page, which kind,
          which reading of it, which players, which days*: the stats behind you,
          the fixtures ahead, and what the fixtures are worth. */}
      <ProjectedToggle
        on={teamProjected}
        loading={teamProjLoading}
        onToggle={() => {
          setReading('roster');
          toggleTeamProjected();
        }}
        title={
          teamProjected
            ? 'Back to what has actually happened'
            : `Add what ${sideName} should get from these players over the days still to be played — and open on the days there are games in`
        }
      />
      {/* **`Summary` is the fourth reading and the one that is not the reader's
          days.** It is the app's Roster table over the matchup's own span — the
          days the category card two presses away is summed over — so the bar
          below draws them as text rather than as something to step (see
          `dateBar`, `fixed`).

          **It is the second thing on this page to wear the word**, the strip
          above having a `Summary` tab, which is the comparison page rather than
          a reading of a team. They are one press apart and are told apart by
          the strip being *whose* page and this being *what about him*, and by
          their titles saying so in as many words; the alternative was a second
          word for one idea, which is worse — a manager reading his own week
          wants the summary of it. */}
      <SummaryToggle
        on={reading === 'summary'}
        onToggle={() =>
          setReading((r) => {
            if (r === 'summary') return 'roster';
            // Same clearing the other three do: `Summary` is a span of its own
            // and the table it draws is the plain one.
            setScheduleSpan(null);
            setTeamProjected(false);
            return 'summary';
          })
        }
        title={
          reading === 'summary'
            ? 'Back to the days you pick'
            : `${sidePossessive} table over this matchup so far — every day of it up to today, which is the span the category card is summed over`
        }
      />
      {/* The stream's direction was a fifth button here, on the feed reading
          alone. It is gone from the app — see `FeedFilters.tsx` — so this run
          is four readings at every one of them, which is what the ghosts this
          row used to carry were trying to buy. */}
    </div>
  );

  /* The dates and, in the Schedule reading, the span — one bar across the box,
     arrows either side, on its own row under the band. See `dateBar` above: the
     calendar square that used to end the icon run and the span strip that used
     to be a group of its own are both in it, and it is the one control of this
     page's that stayed on the page when the rest went into the head. */
  /* The bar itself, bare — it was wrapped in a `.mup-dates` box that capped it
     at the card column and centered it. The table under it is the width of the
     page, and so is the app's own bar over the app's own table; a control
     narrower than the thing it describes was the one place these two surfaces
     still parted. */
  const dates = dateBar;

  /** The two rows under the band — which reading, then which days — as one
   *  node, because they travel together into whichever box the reading gives
   *  them. See `LeagueTeam`'s `chrome`. */
  const teamChrome = (
    <>
      {tools}
      {dates}
    </>
  );

  return (
    <DialogLayerContext.Provider value={MATCHUP_LAYER}>
      {/*
        **`roster-mode` is what makes the table's own header and total row
        stick.** A sticky row sticks to the box that scrolls, and outside this
        mode the box that scrolls is the overlay: the table grows to its rows,
        the overlay takes the scroll, and the header slides away under the
        pinned head exactly as it would on a page. The Roster view has the same
        problem and the same answer one level up (`.app.summary-mode`, a
        `100dvh` flex column with `overflow: hidden`, so `.summary-scroll` is
        the scroller), and so does the Game Log inside the player page.

        **On the roster reading alone.** The feed is a stream of cards with
        nothing to pin, and bounding its height would put a second scroller
        inside a page that is already a scroller — which is the one thing this
        overlay should not have two of.
      */}
      <div
        ref={viewRef}
        tabIndex={-1}
        className={`mup-view${standalone ? ' mup-page' : ''}${
          sideTeamId !== null && reading !== 'feed' ? ' roster-mode' : ''
        }`}
      >
        {head(nav, barsKey)}

        {sideTeamId !== null ? (
          <>
            <LeagueTeam
              /* Keyed on the team alone: the span, the kind and the reading are
                 the chrome's and must not remount the page — only crossing to
                 the other manager is a fresh page rather than one team's rows
                 under the other's name while the read is out. */
              key={sideTeamId}
              teamId={sideTeamId}
              team={teams.get(sideTeamId)}
              /* The days the reading is drawing, which on `summary` are the
                 matchup's own rather than the span the reader last picked —
                 that span is *kept*, not overwritten, so crossing back to
                 `Roster` puts them on the days they left. */
              start={viewSpan.start}
              end={viewSpan.end}
              /* `summary` is the roster table read over other days, so the page
                 below is handed the table it already draws — a fourth value
                 there would be a second definition of what a table of a team
                 is. */
              reading={reading === 'feed' ? 'feed' : 'roster'}
              /* **`Summary` is the manager's lineup, not his roster** — the
                 whole of what that reading is for is that it adds up to the
                 category card two presses away, and a bench is not in that
                 arithmetic. See `LeagueTeam`'s `startersOnly`. */
              startersOnly={reading === 'summary'}
              /* The pills are drawn *inside* that page rather than beside it
                 here, which is the Feed view's own rule: a row of pills over an
                 empty page would be a control over nothing, and the two empty
                 states in there already name their own cause. */
              lens={feedLens}
              onLens={setFeedLens}
              schedule={reading === 'roster' ? scheduleIndex : null}
              /* Held with the team it was read for, so crossing to the other
                 manager draws the plain table until his own answer lands rather
                 than the last man's lines over this one's roster. */
              projection={
                reading === 'roster' && teamProjected && teamProjection?.teamId === sideTeamId
                  ? teamProjection.p
                  : null
              }
              onOpenDetails={onOpenDetails}
              /* **The reading run and the dates, handed to the page they are
                 about** — see `chrome` there. On the roster reading they go
                 inside the table's own scroller, which is the app's own
                 arrangement and for the app's own reason: that reading is a
                 fixed-height column in which only the pane scrolls, and a
                 sticky box sticks to the box that scrolls, so a date bar left
                 above the pane is pinned to a column that never moves while
                 the table's header row is pinned to the pane. Two boxes stuck
                 to two different edges, drawn as one band. */
              chrome={teamChrome}
            />
          </>
        ) : !away ? (
          // Unreachable: a bye has no `summary` page — `active` is forced to
          // `home`, so the branch above is the only one it can take. Kept as
          // the honest fall-through rather than a non-null assertion on `away`
          // in the comparison below, which is the thing that would go wrong
          // quietly if that rule ever changed.
          null
        ) : (
          /* **A projected card is drawn as a projection**, which is this app's
             standing rule that an estimate never wears the same clothes as a
             measurement. Here that is a **dashed border**, at the size of the
             whole card rather than per cell because every figure on it is
             projected — plus the head's own `Projected` tag and its dates. The
             bars themselves stay solid: they were hatched for a round, and a
             broken mark earns its keep by marking one row among solid ones,
             which on a card where everything is projected it cannot do. See
             `.mup-card.mup-proj` in the stylesheet. */
          <div className={`mup-card${showingProj ? ' mup-proj' : ''}`}>
            <div className="mup-heads">
              <SideHead
                side={away}
                team={teams.get(away.teamId)}
                score={score(away)}
                leading={ahead === away.teamId}
                align="left"
              />
              <span className="mup-vs">vs</span>
              <SideHead
                side={home}
                team={teams.get(home.teamId)}
                score={score(home)}
                leading={ahead === home.teamId}
                align="right"
              />
            </div>

            {/* **The whole matchup in one bar**, directly under the two
                records it is made of: the categories each side holds, the ties
                between them, and the leader's share in green — the same green
                the winning figure in every row below takes, so the page has
                one color meaning one thing.

                The counts are the **server's own tally** (`side.wins/losses/
                ties`) rather than a second count made here: ESPN fills its own
                only once a matchup is over, so `espn.ts` computes it live and
                final alike, and that computation is the one checked against
                ESPN on all 1,080 category comparisons of the league's settled
                weeks. The triples in the heads read the same three numbers, so
                the bar and the score cannot come to disagree. */}
            {board.format !== 'h2h-points' && meter !== null && (
              <div className="mup-meter-row">
                <div className="mup-meter" role="img" aria-label={meter.label} title={meter.label}>
                  {/* Only a segment with something in it is rendered, so the
                      2px gaps fall between the runs that exist rather than
                      opening up beside two zero-width boxes. */}
                  {meter.away > 0 && (
                    <span
                      className={`mup-meter-seg${ahead === away.teamId ? ' mup-meter-lead' : ''}`}
                      style={{ flexGrow: meter.away }}
                    />
                  )}
                  {meter.ties > 0 && (
                    <span
                      className="mup-meter-seg mup-meter-tied"
                      style={{ flexGrow: meter.ties }}
                    />
                  )}
                  {meter.home > 0 && (
                    <span
                      className={`mup-meter-seg${ahead === home.teamId ? ' mup-meter-lead' : ''}`}
                      style={{ flexGrow: meter.home }}
                    />
                  )}
                </div>
              </div>
            )}

            {board.format === 'h2h-points' ? (
              <div className="mup-note">
                A points league has one number a side, so there is no category line to break down.
              </div>
            ) : (
              groups.map((g) => {
                /* The winner of each category of this group, worked once: the
                   rows draw it and the heading counts it, so a side of the
                   ball's tally and the green figures under it are one
                   arithmetic rather than two that can drift. `winnerOf` is the
                   same function the scoreboard's own cells use, run over this
                   group alone — the server publishes a tally for the matchup
                   and not for half of it. */
                const won = g.categories.map((c) =>
                  winnerOf(away.scores[c.statId], home.scores[c.statId], c),
                );
                const tally = (side: 'left' | 'right') =>
                  `${won.filter((w) => w === side).length}-${
                    won.filter((w) => w !== null && w !== 'tie' && w !== side).length
                  }-${won.filter((w) => w === 'tie').length}`;
                const tallyTitle = (side: 'left' | 'right') =>
                  `${side === 'left' ? awayName : homeName} in the ${g.label.toLowerCase()}' categories, won-lost-tied`;
                return (
                  <div className="mup-group" key={g.side}>
                    {/* The heading takes the row's own grid, so the label
                        centers over the category column it names and each
                        side's tally lands in the column its figures are in —
                        which is also the one number this page could not say
                        before: you are winning the bats and losing the arms. */}
                    <div className="mup-group-head">
                      <span className="mup-group-tally" title={tallyTitle('left')}>
                        {tally('left')}
                      </span>
                      <span className="mup-group-label">{g.label}</span>
                      <span className="mup-group-tally" title={tallyTitle('right')}>
                        {tally('right')}
                      </span>
                    </div>
                    {g.categories.map((c, i) => {
                      const l = away.scores[c.statId];
                      const r = home.scores[c.statId];
                      const w = won[i];
                      const share = barShare(l, r);
                      const state = (s: 'left' | 'right') =>
                        w === null ? '' : w === s ? ' mup-win' : w === 'tie' ? ' mup-tie' : ' mup-loss';
                      return (
                        <button
                          type="button"
                          className="mup-row"
                          key={c.statId}
                          aria-haspopup="dialog"
                          aria-label={`${c.name} — chart of how it moved through this matchup`}
                          /* **The chart is of the days played, whichever lens
                             the figures are under** — it is a running total and
                             a projection is not one — so while projected the
                             title says so rather than leaving a reader to press
                             `63` and find a line ending at 35. */
                          title={`${rowTitle(c, l, r, w)}${
                            showingProj ? ' by the end of the week' : ''
                          } — press for the day-by-day chart of the days played`}
                          onClick={() => openCategory(c.statId)}
                        >
                          <span className={`mup-val mup-val-left${state('left')}`}>
                            {fmtValue(l, c)}
                          </span>
                          {/* The two figures sit at the edges, under the teams
                              they belong to, and the bar between them says
                              which way the category is going and how far. That
                              is what the page is opened to find out and what a
                              column of bare numbers made the reader work out
                              ten times over. Each half-track is anchored at the
                              label, so the fill grows *out of* the category it
                              belongs to toward the side that is ahead — the
                              Splits card's own rule that a bar grows out of its
                              zero. */}
                          <span className="mup-track mup-track-left">
                            {w === 'left' && (
                              <span className="mup-fill" style={{ width: `${share * 100}%` }} />
                            )}
                          </span>
                          <span className="mup-cat">{c.label}</span>
                          <span className="mup-track mup-track-right">
                            {w === 'right' && (
                              <span className="mup-fill" style={{ width: `${share * 100}%` }} />
                            )}
                          </span>
                          <span className={`mup-val mup-val-right${state('right')}`}>
                            {fmtValue(r, c)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}

            {/* **The `Projected` toggle, at the foot of the comparison rather
                than in the head.**

                It sat at the far end of the Back row, beside the `Projected`
                tag it lights — which is the Scoreboard's own arrangement and
                the wrong one here, for two reasons this page has and that one
                does not. The head is **shared by three pages**, so a control
                belonging to one of them had to be gated out of the other two
                and cost the band a wrapped line on a phone (114 → 160px)
                whichever page was on screen. And it is the *card* whose figures
                it swaps: below them it reads as the comparison's own control,
                where above them it read as one more thing about the week
                alongside the dates.

                Directly above `Moves` because that is where the categories end
                — everything under it is a fact about the period so far and is
                not projected either way, so the toggle is the last line of the
                thing it governs rather than the first line of the thing it does
                not. The tag in the head still says what the figures **are**,
                which is the one half of this that has to stay visible while the
                reader scrolls.

                Centered rather than at an edge: this card is a symmetric
                comparison and a control at one end of it would read as
                belonging to that manager. `.lg-proj-tools` carries a
                `margin-left: auto` for its place on the scoreboard's head row,
                which the stylesheet resets here — an auto margin eats the free
                space `justify-content` would have divided. */}
            {projectable && (
              <div className="mup-proj-row">
                <ProjectedTools
                  projection={projection}
                  categories={board.categories.length}
                  showing={showingProj}
                  projected={projected}
                  loading={projectionLoading}
                  onProjected={onProjected}
                  /* Upward, because this row is at the foot of a card that runs
                     past the bottom of the window: opening downward left the
                     panel at the hook's own 120px floor, a four-paragraph key
                     read through a letterbox. The stylesheet anchors it to
                     match. */
                  drop="up"
                />
              </div>
            )}

            {/* Under the categories, because it is what a manager does *about*
                them rather than one of them — and at the foot rather than the
                head for the same reason.

                **The counts are in the heading and there is no `Acq` row.**
                They were a category row of their own — `5/10 · ACQ · 7/10`
                under a `MOVES` label — which is one row spent on a heading and
                a subtitle for the same section, and which drew a *category*'s
                shape around the one figure on this card that is not one:
                nobody is winning acquisitions, so the row had no bar, no
                color and two deliberately empty track cells holding its
                figures in place. The heading is the row now, exactly as
                `BATTERS` carries its side's won-lost-tied at the same two
                edges — one line, the same grid, and the lists start where the
                row used to. */}
            {(home.acquisitions !== null || away.acquisitions !== null || hasMoves) && (
              <div className="mup-group mup-acq">
                <div className="mup-group-head">
                  <span className="mup-group-tally" title={acqTitle(away)}>
                    {acqCell(away)}
                  </span>
                  <span className="mup-group-label">Moves</span>
                  <span className="mup-group-tally" title={acqTitle(home)}>
                    {acqCell(home)}
                  </span>
                </div>
                {/* **Who those moves were**, which is the half of this section a
                    reader can actually act on: `5/10` says a manager has moved
                    five times and not whom he moved, and on a page about two
                    teams' week the pickup behind a category swinging back is
                    the more interesting fact by some way.

                    Two columns under the two counts, mirrored the way every
                    other pair on this card is — each list hugging the edge its
                    own team's figures are on. */}
                {awayMoves && homeMoves ? (
                  <div className="mup-moves">
                    <div className="mup-moves-side">
                      <MovesColumn
                        moves={awayMoves}
                        teamId={away.teamId}
                        onOpenPlayer={onOpenPlayer}
                      />
                    </div>
                    <div className="mup-moves-side mup-moves-right">
                      <MovesColumn
                        moves={homeMoves}
                        teamId={home.teamId}
                        onOpenPlayer={onOpenPlayer}
                      />
                    </div>
                  </div>
                ) : (
                  transactions &&
                  board.start &&
                  board.end && (
                    // The feed is in hand, the week has dates, and the feed
                    // does not reach that far back —
                    // said rather than drawn as two empty columns under a count
                    // of five, which would read as nobody having moved.
                    <div className="mup-move-none mup-moves-gap">
                      ESPN&rsquo;s activity feed doesn&rsquo;t reach back to this week.
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Above the page rather than beside it: `DialogLayerContext` is set to
          MATCHUP_LAYER here, so this takes the next rung and one press of
          Escape closes the chart while the matchup stays put. */}
      {openStat !== null && openCat && (
        <Modal
          title={`${openCat.name} — week ${board.matchupPeriod}`}
          titleId="mup-series-title"
          className="lg-series-box"
          onClose={() => setOpenStat(null)}
        >
          {seriesError ? (
            <div className="mser-none">
              <p>Couldn&rsquo;t read the day-by-day totals: {seriesError}</p>
            </div>
          ) : series && series.matchupPeriod === board.matchupPeriod ? (
            <MatchupSeriesChart
              series={series}
              category={openCat}
              teamIds={away ? [away.teamId, home.teamId] : [home.teamId]}
              teams={teams}
            />
          ) : (
            <LoadingLine>Reading the week a day at a time</LoadingLine>
          )}
        </Modal>
      )}
    </DialogLayerContext.Provider>
  );
}
