import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  answersEscape,
  useLockBodyScroll,
  useOverlayChromeOffset,
  useOverlayFocus,
} from '../hooks';
import { DialogLayerContext } from './Modal';
import { api } from '../api';
import { BackButton } from './BackButton';
import { BackToTop, useScrolledAScreen, useScrollToTop } from './FloatControls';
import { DateBar, DateCalendar, stepRange, stepTitle } from './DateControls';
import { ScrollRow } from './TabStrip';
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
import { categoryGroups, record, teamAbbrev, TeamLogo } from './LeagueView';
import { MatchupBarsKey, MatchupCard, matchupLens } from './MatchupCard';
import { addDays, LEAGUE_POLL_MS, wideRange } from '../lib';
import type {
  EspnProjection,
  EspnScoreboard,
  EspnTransactions,
  MatchupWindow,
  RosterProjection,
  ScheduleWindow,
} from '../types';
import { SlidingTabs } from './TabSlider';

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

/** A range as this page holds one: the two days, and the preset label they were
 *  derived from — null for a range picked by hand, which has none. The shape
 *  App's `DateRange` is, and for the same reason: a preset is a rule rather than
 *  a pair of dates, so the label is what the bar's face prints. */
interface MatchupRange {
  start: string;
  end: string;
  preset: string | null;
}

/**
 * **A reading of a team page keeps its own days**, which is the arrangement the
 * app's own roster views have (`App.tsx::DateScope`) and which this page did not
 * until the projected lens was found leaking its span into every other reading.
 *
 * Three entries rather than App's four, and the difference is which readings
 * here let a reader *pick* days: the plain table (`roster`), the stream
 * (`feed`) and the projected lens. `summary` is the matchup's own span held
 * rather than picked, and the Schedule view has `scheduleSpan`, which is a run
 * of days rather than a pair — so neither owns an entry, and neither can have
 * one moved out from under it.
 *
 * The lens is the reason the split earns its keep and also the one entry that
 * remembers nothing: it is re-derived on every press (see
 * `toggleTeamProjected`), because *the days there are still games in* is a
 * question whose answer goes stale, where the other two are the reader's own
 * pick and are theirs until they move them.
 */
type MatchupSpanScope = 'roster' | 'feed' | 'projected';

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
 *  **It also settled the two-`Summary` collision**, which no longer exists at
 *  all: the strip's comparison tab is called `Matchup` now, and this is the
 *  only `Summary` on the page. The shapes stay different anyway, which is what
 *  they always were — one is which page you are on, the other is a lens over the
 *  page you are on — and the tab is named for what it holds rather than being
 *  kept clear of a word nothing else uses any more. */
export function SummaryToggle({
  on,
  onToggle,
  title,
}: {
  on: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      className={`summary-toggle${on ? ' on' : ''}`}
      aria-pressed={on}
      onClick={onToggle}
      title={title}
    >
      {/* **A report card**: two lines of subjects and the grade under them, on a
          card. It was three bare rows over a rule — a column of days added up —
          and it is the same statement drawn as the thing it produces, which is
          what this toggle makes of a roster: the week's totals, marked.

          Drawn here rather than imported: it is this page's only use, and it is
          19px to match `ProjectedGlyph` beside it rather than the 17 that glyph
          defaults to. **Portrait, and deliberately so** — `ScheduleGlyph` sits
          two buttons away and is a *landscape* box with a grid in it, so a
          16×19 card and a 19×16 calendar are told apart by their silhouette
          before either one's contents are legible, which at 19px is most of
          the reading. The grade keeps the outgoing glyph's heavier stroke, for
          the same reason it had one: it is the line the others add up to. */}
      <svg
        viewBox="0 0 24 24"
        width={19}
        height={19}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="4.5" y="3" width="15" height="18" rx="2.5" />
        <path d="M8 9h8M8 13h8" />
        <path d="M8 17h4" strokeWidth={2.8} />
      </svg>
      <span className="summary-toggle-label">Summary</span>
    </button>
  );
}

/**
 * **The Roster's own `Matchup` reading**, and it was a door before it was a
 * reading.
 *
 * It replaced the `Matchup` *tab* first, on the argument that a tab says *which
 * page of the app you are on* and this week's opponent is a page you open off
 * your own roster and come back from — so it was drawn as a door, with
 * `aria-haspopup="dialog"`, no `aria-pressed` and no `.on`, and what it opened
 * was the overlay every other door already opened.
 *
 * **That is superseded, and the argument that supersedes it is the same one
 * read one step further.** A page you open and come back from is right for a
 * matchup you *picked* — a Scoreboard card, a Rankings row, the Overview's own
 * card, all of which can name any of the league's ten. Your own week is not
 * picked: there is exactly one of it, the reader is already on the page whose
 * numbers it is about, and covering that page to say so meant the two readings
 * of one week — *what my players did* and *what that came to against him* —
 * were a screen apart with a Back button between them. So it is a **reading of
 * the Roster view**, in the run with `Feed`, `Schedule`, `Projected` and
 * `Summary`: pressed, the comparison card takes the place of the date bar and
 * the table (`App.tsx`'s `rosterMatchup`), and pressed again the table comes
 * back. The overlay is untouched and still what the other three doors open.
 *
 * **First in the run**, which is where it was as a door and is where it stays:
 * the four beside it are readings of *your* rows and this is the one that is
 * about both teams, so it reads before them the same way the app's tab strip
 * reads above the row this sits in. `Opponent` follows it, the two being the
 * only controls here that leave your own table.
 *
 * **The glyph is crossed swords**, which is the one mark for this that a reader
 * already knows — a head-to-head, in the vocabulary every scoreboard and every
 * game in the genre uses. Two drawings were tried and thrown away first, and
 * both failed the same test: *is this legible as a thing rather than as a
 * shape?* A bar chart either side of a center spine reads as a **plus sign** at
 * 19px, and `FeedGlyph` two buttons along is already two columns of horizontal
 * strokes; two arrowheads facing each other read as `> <` and mean nothing in
 * particular. Swords are unmistakable at a glance and collide with none of the
 * five beside them — `ScheduleGlyph` a landscape calendar, `ProjectedGlyph` a
 * rising line, `FeedGlyph` a list, the summary card portrait, `Opponent` a
 * figure.
 *
 * **`strokeWidth` 2, not the summary card's 2.2**, and that is the one thing the
 * denser mark costs: this is eight strokes reaching all four corners of the box
 * where its neighbours are three or four in the middle of one, so the heavier
 * stroke closed the gap the two blades cross in. 19px like the rest of the run.
 */
export function MatchupButton({
  on,
  onToggle,
  title,
}: {
  on: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      className={`matchup-open${on ? ' on' : ''}`}
      aria-pressed={on}
      onClick={onToggle}
      title={title}
    >
      <svg
        viewBox="0 0 24 24"
        width={19}
        height={19}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* The blade running up-left, and its hilt in the opposite corner: a
            guard across the grip, the grip itself, and a pommel. The notch at
            the tip (`V3h3`) is what makes it a point rather than a line — at
            19px it is the difference between a sword and a slash. */}
        <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
        <path d="m13 19 6-6M16 16l4 4M19 21l2-2" />
        {/* …and its mirror, tip up-right, hilt bottom-left. */}
        <path d="M14.5 6.5 18 3h3v3l-3.5 3.5" />
        <path d="m5 14 4 4M7 17l-3 3M3 19l2 2" />
      </svg>
      {/* Its own class rather than `.summary-toggle-label` beside it: that name
          belongs to the control it was written for, and an unstyled hook shared
          between two buttons is the first half of two buttons that have to be
          told apart later. */}
      <span className="matchup-open-label">Matchup</span>
    </button>
  );
}

/**
 * **The whole Roster view, read for this week's opponent** — the second of the
 * two controls in that run that are not about your own rows.
 *
 * It is what the matchup page's two **team pages** were the only way to reach.
 * Those pages are the app's own Roster and Feed views drawn for a leaguemate
 * (`LeagueTeam`), and reaching them meant opening an overlay, crossing a strip
 * of three tabs and arriving on a page whose date bar, readings and kind of
 * scroll were a second set of controls that had to agree with the ones behind
 * it. What a reader actually wants at that moment is the page they are already
 * on, about him: the same table, the same stream, the same days, the same
 * `Schedule`, `Projected` and `Summary` readings. So this is a **side switch**
 * rather than a door — press it and every one of those controls goes on
 * meaning what it meant, over his roster instead of yours.
 *
 * **Mutually exclusive with `Matchup` beside it**, and that is the one rule
 * that makes the pair honest: the comparison card is about both managers and
 * neither side's table, so a lit `Opponent` over it would be a control claiming
 * a page it is not on. Neither lit is your own table, which is the run's own
 * shape — the plain reading is none of them lit.
 *
 * **Drawn only where there is an opponent**, which is one test rather than
 * three: no league connected, no board yet, and a bye week all leave
 * `App.tsx`'s own opponent null, and in each of them a button offering
 * somebody's roster would be a promise nothing could keep. A bye is the case
 * worth naming — the manager has a week and no opponent in it, and the honest
 * answer is a run of four readings rather than a fifth that opens an empty
 * page.
 *
 * **The glyph is a single figure**, deliberately one rather than two: two is
 * *the league* (the Fantasy tab's own subject) and one is *the other manager*,
 * which is what this switches to. It is a head over shoulders at 19px —
 * the one silhouette in this run that is not made of lines and boxes, so it is
 * told apart from the calendar, the rising line, the list, the report card and
 * the swords before any of its detail is legible. `strokeWidth` 2.2, the run's
 * own.
 */
export function OpponentToggle({
  on,
  onToggle,
  title,
}: {
  on: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      className={`opponent-toggle${on ? ' on' : ''}`}
      aria-pressed={on}
      onClick={onToggle}
      title={title}
    >
      <svg
        viewBox="0 0 24 24"
        width={19}
        height={19}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* The head, and the shoulders under it as an arc rather than a closed
            box: at 19px a rectangle under a circle reads as a plug in a socket,
            where the open arc reads as a person from across the room. */}
        <circle cx="12" cy="8" r="3.6" />
        <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      </svg>
      {/* Its own hook rather than `.matchup-open-label` beside it, which is the
          rule that button's own label records: an unstyled class shared between
          two controls is the first half of two controls that have to be told
          apart later. */}
      <span className="opponent-toggle-label">Opponent</span>
    </button>
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
  /* **`standalone` stood here and is gone with the `Matchup` tab.** It was the
     same page drawn as a *page* rather than as a box over one — no body lock,
     no focus capture, no inert background, no Escape and no Back row, there
     being nothing behind a tab to do any of that to — and it took a
     fixed-height column of its own in the stylesheet (`.app.matchup-mode`,
     `.mup-view.mup-page`) to get what an overlay has for free. The tab is a
     button on the Roster now (`App.tsx::matchupButton`) opening this same
     overlay, so there is one drawing again and every door reaches it the same
     way. */
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
  // A box over a view pins the document behind it, takes its focus and gives it
  // back — unconditionally now, this page having one drawing again.
  useLockBodyScroll(true);
  const viewRef = useRef<HTMLDivElement | null>(null);
  useOverlayFocus(viewRef, undefined, true);
  /**
   * **The way back up, on the one page in the app whose scroll App cannot
   * see.** App's own `↑` reads `window.scrollY`, and this box is the scroller:
   * as an overlay it is `position: fixed` with its own `overflow-y`, and as a
   * tab it is the column's one scrolling child. Measured on the Feed reading at
   * 390 — the page 2,875 tall against 744 of client, dragged to `scrollTop`
   * 2,131 — `window.scrollY` never left **0** and the app's button stayed
   * `visibility: hidden`. Reported as the feed page inside a matchup having no
   * way back to the top, which is what it was: 2,131px of stream, and the
   * pinned head above it offering `Back` out of the page but nothing up it.
   *
   * **One rule rather than one per reading**, and the readings sort themselves
   * out. On `roster-mode` this box is `overflow: hidden` and the table's own
   * pane takes the scroll, so `scrollTop` stays 0 and the button never reveals
   * — which is right, a `↑` here would point at a page that has not moved. The
   * Summary card and the Feed both scroll this box and both raise it.
   *
   * Only the `↑`, not `FloatControls`' pair: the how-to and league settings
   * pages float a `Back` because their own head scrolls away, and `.mup-chrome`
   * is `position: sticky` — the way out of this page is on screen at every
   * offset already.
   */
  const scrolledAScreen = useScrolledAScreen(viewRef);
  const toTop = useScrollToTop(viewRef);
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
  /* **`beforeProjection` is gone**, and with it the excursion it was the return
     ticket for. It held the span the reader was on when they pressed the lens,
     so that pressing it again could put them back rather than strand them in a
     week with no stats in it — the right answer while every reading of this page
     shared one span, and one that only ever worked when the lens was put away by
     *its own* toggle. It was not: `Feed`, `Schedule` and `Summary` each clear the
     lens with a bare `setTeamProjected(false)`, so the ref was never consumed and
     the projected days simply became the page's days. Measured on team 6 on
     2026-08-21 — `Today · Fri, Aug 21` on the roster, press `Projected` and the
     bar reads `Projected · Aug 21 – Aug 23`, cross to `Feed` and it reads
     `Custom range · Aug 21 – Aug 23`, a stream over two days nobody has played;
     come back to the table and it is still `Custom range · Aug 21 – Aug 23` with
     the lens off. Each reading keeps its own days now (`MatchupSpanScope`, the
     shape App's own `DateScope` takes on the roster views), so the lens borrows
     nothing and there is nothing to give back. */
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
   *
   * **And it seeds every entry, because a reading is a set of days of its own.**
   * See `MatchupSpanScope` below: the three readings that let a reader pick days
   * part from one seed rather than sharing one range, which is the arrangement
   * App's roster views already have.
   */
  const [spans, setSpans] = useState<Record<MatchupSpanScope, MatchupRange>>(() => {
    const seed: MatchupRange =
      !board.live && matchupSpan
        ? { ...matchupSpan, preset: 'Matchup' }
        : { start: today, end: today, preset: 'Today' };
    return { roster: seed, feed: seed, projected: seed };
  });
  /**
   * **Which reading's days are on screen**, and so which entry a control in the
   * date bar writes.
   *
   * Derived rather than stored, and idempotent, so any re-render (StrictMode's
   * double pass included) recomputes the same answer — App's own `dateScopeRef`
   * rule, arrived at from the other side. **The order of the tests is the order
   * the readings exclude each other in**: the stream is a `reading` and the lens
   * is a toggle that exists only on the table, and every one of the other three
   * readings clears the lens on press, so the test never has to ask what happens
   * if both are set.
   *
   * `summary` and the Schedule view are absent because neither is a range the
   * reader picks: `summary` **is** the matchup's own days (see `summarySpan`,
   * and the bar is drawn `fixed` over it) and the Schedule view has
   * `scheduleSpan`, a run of days rather than a pair of them. Mapping `summary`
   * onto `roster` is what makes the fallback in `summarySpan` the days the
   * reader left the table on.
   */
  const spanScope: MatchupSpanScope =
    reading === 'feed' ? 'feed' : teamProjected ? 'projected' : 'roster';
  const span = spans[spanScope];
  /** Move the days **of the reading on screen**, which is the only one a control
   *  in the bar can have been pressed from. The one caller that must not go
   *  through it is the lens's own seed, which runs on the commit before the
   *  scope has moved and writes `projected` by name — see
   *  `toggleTeamProjected`. */
  const setSpan = (to: MatchupRange) => setSpans((prev) => ({ ...prev, [spanScope]: to }));

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
   * **Whether the figures on screen *are* the projection**, which is what the
   * head's tag says and the one half of the lens this page still asks about.
   *
   * `matchupLens` is the answer, in `MatchupCard.tsx` beside the card that
   * applies it — one function, so a `Projected` tag in this band and dashed
   * figures under it can never come from two readings. It is false while the
   * read is still out, so the page shows the live figures under an unlit button
   * rather than blanking, which is the app's own rule that nothing goes empty
   * over data it already has.
   *
   * *(`projectable` — a categories league whose week is live — was the other
   * half and is gone from here: the toggle it gated is drawn inside the card
   * now, and `matchupProjectable` is where the test lives.)*
   */
  const showingProj = matchupLens(board, matchup, projection, projected).showingProj;

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
   * The date control is untouched, so the reader is free to move off it —
   * narrowing to a single future day is a projection of that day's games — and
   * **those days are the lens's own** (`MatchupSpanScope`), so moving them costs
   * the plain table and the stream nothing and turning the lens off has nothing
   * to put back.
   *
   * **What the lens's entry remembers, and for how long: nothing, and no time at
   * all.** It is re-derived on every press, which is the one place this page's
   * own "each reading keeps its own days" is deliberately not carried through,
   * and the reason is the rule the toggle states in its own tooltip: *open on the
   * days there are games in*. A remembered projected range would be a stale
   * answer — "the rest of this period" derived on Tuesday is three played days by
   * Friday — and that is precisely the reading the lens is not for. What the
   * entry buys is the other half: while the lens **is** on, the days are its own.
   *
   * **Seeded by name rather than through `setSpan`.** The scope moves on the
   * commit this press causes, so at the moment the callback runs `spanScope`
   * still says `roster` — and `setSpan` writes whatever it says. This is App's
   * `toggleRosterProjected`, one file over, for the same reason.
   *
   * **The Schedule view goes off with it** — that mode replaces the stat
   * *columns* with days and this replaces the *figures* in them, so they are two
   * readings of one set of cells and cannot both be in force. Its own days stay
   * where they are: an entry is put away, not thrown away.
   */
  const toggleTeamProjected = useCallback(() => {
    setTeamProjected((on) => {
      if (on) return false;
      const to = matchupWindow?.end ?? addDays(today, 6);
      setSpans((prev) => ({
        ...prev,
        projected: { start: today, end: to < today ? today : to, preset: null },
      }));
      setScheduleSpan(null);
      return true;
    });
  }, [matchupWindow, today]);

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (viewRef.current?.querySelector('.is-expanded')) return;
      if (!answersEscape(e, viewRef.current)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
        <BackButton onClose={onClose} />
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

  /* **The chart a category row opens moved into the card with the card.**
     It is the comparison's own dialog — its state, its lazy read, its
     sequence numbers and its live-week poll — and it followed the rows that
     open it into `MatchupCard.tsx`, where the Roster view's own reading of
     this card gets it for nothing. */

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
   * **The two sides, straight off the matchup** — deliberately *not* under the
   * lens, which is what this line used to be.
   *
   * The card applies the lens itself now (`matchupLens`, in `MatchupCard.tsx`),
   * so the only readers left up here are the strip, the bye head and the acq
   * cells beside it — and every one of them wants the live figures. The lens
   * preserves team ids by construction, so the strip is unaffected either way;
   * the acquisitions are the case that matters, `asProjected` keeping them off
   * the projected side precisely because a manager's moves are a fact about the
   * period so far.
   */
  const { home, away } = matchup;
  /**
   * **The key to the bars, beside the strip of three pages.**
   *
   * The panel itself is `MatchupBarsKey`, exported from `MatchupCard.tsx` with
   * the card it explains — the Roster's own reading of that card draws the same
   * key beside its week face. What stays here is *where* and *whether*: it sat
   * beside the meter it describes, which is where a key usually belongs and is
   * the one place on this page it could not stay, the meter being a row in the
   * middle of a card that scrolls while what it explains is every bar under it.
   * In the pinned head it is on screen for the whole of that reading.
   *
   * **Beside the tabs rather than in the band's far corner**, which is where it
   * went first: at 1920 that is a thousand pixels from anything it explains, and
   * it made the Back row reserve space for a box positioned against the band
   * rather than laid out in it. The row keeps the tabs centered and holds the
   * key to their right, and gives that reservation back.
   *
   * Drawn only where there is something to explain — a points league has no
   * bars, a bye has no comparison, and a team page has no card, which is
   * `onSummary`'s own test.
   */
  const barsKey =
    onSummary && away !== null && board.format !== 'h2h-points' ? (
      <MatchupBarsKey categories={groups.length} />
    ) : null;

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
        { tab: 'summary', label: 'Matchup', title: 'The two teams, category by category' },
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
  const acqCell = (side: typeof home) =>
    side.acquisitions === null
      ? '—'
      : board.acquisitionLimit === null
        ? String(side.acquisitions)
        : `${side.acquisitions}/${board.acquisitionLimit}`;
  const acqTitle = (side: typeof home) =>
    side.acquisitions === null
      ? 'ESPN reports no acquisition count for this team'
      : board.acquisitionLimit === null
        ? `${side.acquisitions} acquisitions this matchup period`
        : `${side.acquisitions} of ${board.acquisitionLimit} acquisitions used this matchup period`;

  /**
   * What the head carries under the Back button: the strip, or — on a bye — the
   * team itself, since there is nothing to choose between and the reader still
   * has to be told whose roster this is.
   */
  const nav =
    sides.length > 1 ? (
      <SlidingTabs className="view-switch mup-sides" label="Matchup">
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
      </SlidingTabs>
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
      {/* **The four readings scroll rather than shedding their words.** Below
          640px this row used to visually hide `Feed`, `Schedule`, `Projected`
          and `Summary`, leaving four glyphs whose only self-description was a
          `title` — a tooltip a touch device never shows, on the width where
          almost all the touch is. `ScrollRow` is the app's own answer and the
          Roster's row takes it too; the fold is the same one `.view-tools`
          already is. */}
      <ScrollRow label="the readings" className="view-tools-scroll">
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
            // exclusivity `toggleTeamProjected` states from the other side. A
            // bare clear is all it takes now: the lens has an entry of its own
            // (`MatchupSpanScope`), so putting it away moves nobody's days and
            // this reading has a span run rather than a range in any case. It
            // used to be the bug — this clear bypassed `toggleTeamProjected`,
            // so the ref that was supposed to put the reader's range back was
            // never consumed and the projected days simply stayed.
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
      </ScrollRow>
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
        className={`mup-view${
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
          /* **The comparison, which is a component of its own now** — see
             `MatchupCard.tsx`. It was written inline here, and it is drawn on
             two surfaces since the Roster view grew its own `Matchup` reading:
             one card, two callers, which is this repo's standing rule the
             moment a second one appears.

             What it takes is the board, the matchup with both its sides, and
             the projection the head above it is already describing — the same
             three the Scoreboard's own card is drawn from. `matchup` rather
             than `shown`: the lens is the card's to apply (`matchupLens`, which
             this page reads too for the head's `Projected` tag), so handing it
             the projected copy would be applying it twice. */
          <MatchupCard
            board={board}
            matchup={matchup}
            teams={teams}
            projection={projection}
            projected={projected}
            projectionLoading={projectionLoading}
            onProjected={onProjected}
            transactions={transactions}
            onOpenPlayer={onOpenPlayer}
          />
        )}

        {/* **Inside the view, which is what puts it over the view.** The button
            is `position: fixed` and stays fixed to the window — nothing on the
            way up here is a containing block for it — but as an overlay this
            box is a stacking context at 48 and the button's own `z-index: 20`
            is the app's page layer, so drawn as a sibling it would sit behind
            the very page it belongs to. As a child it takes that context with
            it and needs no layer of its own. */}
        <BackToTop shown={scrolledAScreen} onClick={toTop} />
      </div>

    </DialogLayerContext.Provider>
  );
}
