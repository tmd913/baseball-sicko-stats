import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ScrollRow } from './TabStrip';
import { ListsPanel, SavedButton, SearchesPanel, SharedNotice } from './ResearchLists';
/* The measured contrast cap the park board's heat is capped at — imported
   rather than repeated, so a palette change is re-measured once. */
import { MAX_TINT } from './ParkFactors';
import { BaseballMark } from './BaseballMark';
import { LockGlyph, LockMark } from './LockMark';
import { PlayerNewsMark } from './NewsMark';
import { LoadingBlock, LoadingLine } from './Loading';
import { PageMore, usePagedRows } from './paging';
import { ExpandButton } from './ExpandButton';
import { PhotoSpot, PhotoStatus, useStatusBadge } from './PhotoStatus';
import { ColumnPicker, ColumnsButton } from './ColumnPicker';
import { QUALIFIER_WORDS, RankBadge, RanksButton, rankPopulation, rankScales } from './columnRanks';
import { ScheduleSpanTabs, ScheduleToggle } from './ScheduleControl';
import { ProjectedToggle, ProjectionKey } from './Projection';
import { CalendarGlyph, DateCalendar } from './DateRangePicker';
import { Modal } from './Modal';
import { TurnButton, TurnDayStrip } from './TurnPicker';
import {
  defaultScheduleSpan,
  scheduleColumns,
  startTierOn,
  TURN_KEY,
  turnColumn,
  turnCounts,
  turnDaysLabel,
  turnDaysTitle,
  turnsOnDays,
} from './schedule';
import type { ScheduleIndex, ScheduleSpan, TurnDays } from './schedule';
import { SchedulePreview } from './PlayerSchedule';
import type { SplitsRead } from './PlayerSchedule';
import { useOpponentBoards } from './OpponentTable';
import { api } from '../api';
import {
  PlayerStatusContext,
  useFullPage,
  useGameDoor,
  useHandedness,
  usePlayerStatus,
  ClubStatusContext,
  usePublishedHeight,
  useScoringCategories,
} from '../hooks';
import { RESEARCH_INCLUDE_KEYS, RESEARCH_WINDOWS } from '../types';
import type {
  BoardProjection,
  MatchupWindow,
  PlayerKind,
  ResearchIncludeKey,
  ResearchRow,
  ResearchWindow,
  SavedList,
  SavedSearch,
  ScheduleGame,
  SharedItem,
  TrendWindow,
} from '../types';
import {
  eligibleCodes,
  headshotUrl,
  ordinal,
  positionCell,
  searchFold,
  statusCorner,
  wideRange,
} from '../lib';
import { PlayerIdentity, TeamIdentity, TeamPhoto } from './PlayerIdentity';
import {
  BATTER_COLUMNS,
  DEFAULT_SORT,
  defaultColumnKeys,
  isDefaultColumns,
  NAME_COLUMN,
  NAME_KEY,
  OPPONENT_KEY,
  opponentColumn,
  PITCHER_COLUMNS,
  projectedColumns,
  projectedColumnKeys,
  isDefaultProjectedColumns,
  toProjectedColumnKeys,
  TEAM_HIDDEN,
  TEAM_ONLY,
  TREND_BY_KEY,
  trendKey,
} from './researchColumns';
import type { Column } from './researchColumns';
// Re-exported so every existing importer of these three (App, and any `cols=`
// link handling that grows later) goes on naming this file: the *selection* is
// a board setting, and the board is what App is configuring, even though the
// vocabulary behind it now lives next door.
export {
  defaultColumnKeys,
  isDefaultColumns,
  isDefaultProjectedColumns,
  projectedColumnKeys,
  toColumnKeys,
  toProjectedColumnKeys,
} from './researchColumns';

/**
 * A league-wide, season-to-date stat table: every player on one board, sortable
 * by any column and filterable down to the slice you're after.
 *
 * It shares the summary view's table chrome (`.summary-table` and its sticky
 * header / sticky headshot column) rather than restyling a second wide table to
 * resemble it — the two are the same object, one over the range and one over the
 * season, and folding the selectors together is what keeps them from drifting.
 */


// ---- Positions ------------------------------------------------------------
//
// One scrolling row that is both the board switch and the position filter:
// Batters and Pitchers are the two boards whole, and everything after them is a
// slice of one of them. That makes the *kind* a consequence of the position —
// picking SS puts you on the batting board, picking RP on the pitching one —
// so this list is the single vocabulary for both, and `researchKindFor` is what
// App reads to know which board to fetch.
//
// Deliberately not built from the rows in view: an empty position is a fact
// worth seeing ("no two-way player has batted yet") and a row of pills that
// appears and disappears with the data is harder to aim at than a fixed one.

export type ResearchPos =
  | 'batters' | 'pitchers'
  | 'C' | '1B' | '2B' | '3B' | 'SS' | 'IF' | 'OF'
  | 'SP' | 'RP';

/**
 * Someone who pitches for a living — which is what the whole pitching board is
 * narrowed to (`boardRows`), not just the SP and RP pills.
 *
 * MLB's pitching leaderboard also carries the ~44 position players who mopped
 * up an eleven-run loss. Those really were relief appearances, but they are not
 * what anyone reading a pitching board wants: one scoreless inning from a
 * utility infielder tops it the moment it's sorted by ERA. Filtering at the
 * board rather than per pill is what keeps the count line honest — "227 of 745"
 * counts a population every pill can actually reach, where narrowing only the
 * pills would leave 44 rows in the denominator that nothing could ever show.
 *
 * A two-way player counts: he is a pitcher when he's on the mound, and dropping
 * him would take a real starter out of SP.
 */
function isPitcherByTrade(r: ResearchRow): boolean {
  return r.positionType === 'Pitcher' || r.positionType === 'Two-Way Player';
}

/**
 * …and the mirror of it for the batting board, which arrives with the 77
 * pitchers who took a plate appearance on it. Same failure in reverse: a
 * pitcher who went 1-for-1 sits atop the AVG sort on a .1000 average.
 *
 * Note the test is shaped the other way round — an allowlist above, a denylist
 * here — and deliberately so. The set that belongs on a pitching board is small
 * and closed; the set that belongs on a batting board is *everyone else*,
 * including the players MLB has no primary position on record for (`Unknown`,
 * 17 of them). Those are ordinary hitters — Conforto at 200 PA, Grichuk at 178
 * — reached by no position pill but perfectly real under Batters, so an
 * allowlist of the named positions would quietly drop a season's worth of them.
 * A two-way player passes both tests, which is right: he belongs on both.
 */
function isBatterByTrade(r: ResearchRow): boolean {
  return r.positionType !== 'Pitcher';
}

/**
 * **Everyone this board can show** — the leaderboard cut to its own trade, and
 * nothing else. It is `boardRows` before the include buttons and the watchlist,
 * which is to say the `M` in "455 of 622 batters" with all three of them on.
 *
 * Exported because it is also the **percentile population** (`columnRanks.tsx`),
 * and the player page's Stats tab has to be able to reach exactly the same set
 * from the same rows — a board and a transposed row of it ranking against two
 * different populations would be two answers to one question. One definition,
 * two callers, the rule this file already applies to the column vocabulary.
 */
export const boardPopulation = (rows: ResearchRow[], kind: PlayerKind): ResearchRow[] =>
  rows.filter(kind === 'pitcher' ? isPitcherByTrade : isBatterByTrade);

/**
 * **What a position pill matches, and why it is two different facts.**
 *
 * With a fantasy league connected the batting pills read **ESPN's eligibility**
 * (`ResearchRow.eligible`), which is multi-valued: Willi Castro is eligible at
 * 1B, 2B, 3B, SS and OF at once, and a manager filtering to SS wants him. MLB's
 * single listed position cannot express that — 301 of the 628 batters ESPN
 * could be joined to carry more than one, 95 carry three or more — and it is
 * not merely narrower but sometimes *wrong* for the purpose: on a checked board
 * 21 batters have an MLB primary ESPN doesn't grant at all (Scott Kingery lists
 * SS and is eligible at 2B and OF), so a fantasy manager was being shown a
 * position his league would not let him use.
 *
 * Without a league — or for a player the name-and-club join can't place — it
 * falls back to MLB's listed position, which is exactly what the board did
 * before and reads identically: `Infielder`/`Outfielder` are precisely the four
 * infield and three outfield abbreviations, so IF and OF answer the same as the
 * `positionType` tests they replace. That map is `lib.ts::MLB_TO_ELIGIBLE`,
 * shared with the summary table's identity block, which falls back the same way
 * for the same reason.
 */

/**
 * ESPN's vocabulary, cut by the board that reads it.
 *
 * A row is filtered by the half its **own** board speaks, and the cut is doing
 * real work in both directions. The batting pills can act on nothing in
 * `SP`/`RP`, and — the case that would otherwise be a silent wrong answer — a
 * pitcher the name-and-club join placed on the wrong man of a duplicate name
 * comes back carrying somebody else's positions: ESPN has the Yankees' Fernando
 * Cruz eligible at `2B` and `SS`. Filtered per board that leaves him with an
 * empty list, which is the same thing as no list at all and sends him to the
 * fallback, rather than putting a second baseman on the pitching board.
 */
/**
 * The positions a row counts as, in the board's own vocabulary.
 *
 * **The pitching board reads eligibility too, and used not to.** ESPN grants SP
 * and RP the way it grants 2B, so it was always the same *kind* of fact; what
 * kept the pills on `ResearchRow.starter` was three objections, and they are
 * worth stating because two of them are still true and the board now pays them
 * rather than avoiding them.
 *
 * The pills **stop partitioning**: 143 of the 749 pitchers on a checked board
 * are eligible at both, so a fifth of the board is under SP *and* RP. That is a
 * cost and not an error — the batting pills already overlap by design (`IF` is
 * the whole infield, not "some other infielder", and a utility man is under 2B
 * and SS and OF at once), and a swingman genuinely is both. It costs the pill
 * counts their sum, which the count line never reported anyway: it has always
 * said "N of M" against the whole board, and M is unchanged.
 *
 * Eligibility is **season-long where `starter` follows the window**, which was
 * the sharpest of the three and turns out to argue the other way once it is
 * followed through. The window says which games the numbers are drawn from; it
 * has never said who the player *is*, and every batting pill beside these two
 * has been a season-long fact on a 7-day board since eligibility landed. Under
 * `starter` these were the one control in the row whose meaning changed with
 * the span — and changed into the wrong answer for the question a fantasy
 * manager is asking it. On the 7-day board **2 pitchers had started a majority
 * of their week and are RP-eligible only** (Erik Miller, Daniel Lynch IV), so
 * filtering to SP offered a man the league will not let you start there, which
 * is exactly the Curtis Mead correction the batting side already made; **6 more
 * had only relieved that week and are SP-eligible only** (Slade Cecconi, Jordan
 * Montgomery — a rehab or spot outing), so RP offered men who cannot fill it.
 * The window still decides the fallback below, where it is the only answer
 * there is and is honestly a description of that span.
 *
 * `starter` **stays on the row, and its reason has changed under it.** It was
 * kept because the server's qualifier read it and one definition of a starter
 * was enough; that rule no longer reaches a screen at all, the `Qualified`
 * toggle it fed having gone, so `ResearchRow.qualified` is a field nothing
 * renders. What keeps `starter` is the fallback below — it is what these two
 * pills read for a pitcher ESPN cannot place and for every user with no league,
 * which is a live reader rather than a vestigial one. What has changed is that
 * the pills are no longer the *primary* reader of that definition — they are ESPN's answer
 * to a different question ("where may I start him") — so the two can differ,
 * and where they can be compared they mostly don't: of the 601 pitchers with a
 * single ESPN answer, 561 match.
 *
 * The narrowing itself is `lib.ts::eligibleForKind`, read through
 * `eligibleCodes` below — the card chip and the summary table's identity block
 * take the same half of the same list for the same reason.
 */
/**
 * ESPN's answer where there is one, and the app's own where there isn't — per
 * row, never per page, so a player the join can't place is filtered by what the
 * app does know about him rather than dropped out of every pill. With no league
 * connected that is every row, which is why nothing changes for a user without
 * one.
 *
 * The two boards fall back to different things because they have different
 * things to fall back *to*. A batter has MLB's single listed position, which is
 * what the board read before any of this. A pitcher's MLB position is `P`, which
 * no pill has ever been able to use — so his fallback is `starter`, the exact
 * behavior the whole pitching board had until now, window and all. It is
 * narrow: on a checked board **5 of 749 pitchers** take it (4 ESPN has no list
 * for at all, and the mis-joined Fernando Cruz above).
 */
function eligibleFor(r: ResearchRow): string[] {
  // `lib.ts::eligibleCodes`, which is also what the Pos cell beside these pills
  // reads through `positionCell` — so a pill and the row it lets through cannot
  // come to disagree about where a man is eligible.
  return eligibleCodes(posFacts(r));
}

/** A board row in the shape `lib.ts`'s position helpers read — the summary
 *  table hands them the same four facts off a `PlayerReport`. */
function posFacts(r: ResearchRow) {
  return { eligible: r.eligible, kind: r.kind, position: r.position, starter: r.starter };
}

/**
 * The Pos cell's text and its tooltip.
 *
 * **The cell prints the whole list.** It used to print two codes and a count
 * (`2B/SS+3`), the card chip's form, on the argument that this column hugs its
 * content on the app's widest table and every pixel of it is a stat off the
 * right edge of a phone. What that traded away is the one thing this cell is
 * for: it is where a filtered row says *why* it is on screen, and on the 301 of
 * 628 matched batters who are eligible in more than one place — 95 in three or
 * more — a `+3` said that three quarters of the answer existed somewhere else.
 * The hoist made the cap safe rather than harmless: the reader could trust the
 * pill they had filtered to was in front, and had no way to see the rest.
 *
 * The order still comes from `lib.ts::positionOrder`, shared with the card
 * chip, so the active pill leads here exactly as it does there; what the board
 * no longer takes from it is the cap and the DH trim, both of which are that
 * chip's line-width rules — see there.
 *
 * **The rule itself is `lib.ts::positionCell` now**, shared with the summary
 * table's identity block, which is the same block under the same kind of name
 * and had no business owning a second copy of a three-deep fallback. What stays
 * here is the two things that really are this board's: the pill to hoist, and
 * the wording of a pitcher's fallback — `starter` is measured over the window
 * the board is on, where a report's is his season.
 */
function posCellText(
  r: ResearchRow,
  leadCodes: string[] | undefined,
): { text: string; title: string } {
  return positionCell({
    ...posFacts(r),
    lead: leadCodes,
    starterSource: 'off his own appearances over the window',
    // Nothing in the board's vocabulary at all, which on the batting board is a
    // two-way player (`TWP`) or a position MLB has no record of; the cell then
    // prints MLB's own spelling with its old `positionType` tooltip, exactly as
    // it did before any of this. A pitching row can no longer reach it,
    // `starter` always being there to fall back on.
    unknownTitle: () => posTypeLabel(r.positionType),
  });
}

interface PositionOption {
  key: ResearchPos;
  label: string;
  title: string;
  /** What the title becomes once ESPN eligibility is what the pill reads. The
   *  two are genuinely different claims — "shortstops" against "anyone your
   *  league will let you start at short" — and a pill that said the first while
   *  doing the second would be the label lying about the filter. */
  espnTitle?: string;
  kind: PlayerKind;
  /** The eligibility codes this pill selects on — one for a single position,
   *  four for `IF`, one each for the two pitching roles. Absent only on the two
   *  whole-board entries, which filter nothing. SP and RP carried a predicate
   *  of their own until they read eligibility like everything else; every pill
   *  in the row is now one test over one vocabulary. */
  codes?: string[];
}

/** One pill's test. */
function positionMatcher(pos: ResearchPos): ((r: ResearchRow) => boolean) | undefined {
  const codes = POSITION_BY_KEY.get(pos)?.codes;
  if (!codes) return undefined;
  return (r) => eligibleFor(r).some((p) => codes.includes(p));
}

/**
 * The row, in the order it reads: both boards whole, then the batting positions
 * from the plate outwards, then the two pitching roles.
 *
 * Note there is no DH pill — a player whose listed position is DH is on the
 * Batters board and nowhere else. C/1B/2B/3B/SS match a position he is eligible
 * at (ESPN's list with a league connected, MLB's single listed one without);
 * IF and OF are the group (an infielder is any of the four, an outfielder any
 * of LF/CF/RF), so those two overlap the individual pills by design — IF is the
 * whole infield, not "some other infielder". **A multi-position player is now on
 * more than one pill**, which is the point of reading eligibility: the pills
 * were a partition of each board and are a cover of it. That is true of SP and
 * RP as well now — a swingman is under both, 143 of 749 pitchers being eligible
 * at both — see `espnPositions` for what that costs and what it buys.
 */
const POSITIONS: PositionOption[] = [
  { key: 'batters', label: 'Batters', title: 'Every batter', kind: 'batter' },
  { key: 'pitchers', label: 'Pitchers', title: 'Every pitcher', kind: 'pitcher' },
  { key: 'C', label: 'C', title: 'Catchers', espnTitle: 'Eligible at catcher in ESPN', kind: 'batter', codes: ['C'] },
  { key: '1B', label: '1B', title: 'First basemen', espnTitle: 'Eligible at first base in ESPN', kind: 'batter', codes: ['1B'] },
  { key: '2B', label: '2B', title: 'Second basemen', espnTitle: 'Eligible at second base in ESPN', kind: 'batter', codes: ['2B'] },
  { key: '3B', label: '3B', title: 'Third basemen', espnTitle: 'Eligible at third base in ESPN', kind: 'batter', codes: ['3B'] },
  { key: 'SS', label: 'SS', title: 'Shortstops', espnTitle: 'Eligible at shortstop in ESPN', kind: 'batter', codes: ['SS'] },
  { key: 'IF', label: 'IF', title: 'Infielders — 1B, 2B, 3B and SS', espnTitle: 'Eligible somewhere in the infield in ESPN — 1B, 2B, 3B or SS', kind: 'batter', codes: ['1B', '2B', '3B', 'SS'] },
  { key: 'OF', label: 'OF', title: 'Outfielders — LF, CF and RF', espnTitle: 'Eligible in the outfield in ESPN', kind: 'batter', codes: ['OF'] },
  // These read ESPN's eligibility like the eight above, falling back to
  // `ResearchRow.starter` — which is what they used to read outright — for a
  // pitcher ESPN can't be joined to and for every user with no league.
  { key: 'SP', label: 'SP', title: 'Starting pitchers — a majority of his appearances are starts', espnTitle: 'Eligible at starting pitcher in ESPN', kind: 'pitcher', codes: ['SP'] },
  { key: 'RP', label: 'RP', title: 'Relief pitchers', espnTitle: 'Eligible at relief pitcher in ESPN', kind: 'pitcher', codes: ['RP'] },
];

const POSITION_BY_KEY = new Map(POSITIONS.map((p) => [p.key, p]));

/**
 * **The same eleven, in the two groups a reader actually thinks in.**
 *
 * Derived from `POSITIONS` rather than written out beside it, which is this
 * file's own rule about one vocabulary: a pill added to that array is on the
 * picker without anything here being told, and a group is `kind` — the field
 * every entry already carries and which `researchKindFor` already reads.
 *
 * The order inside each group is `POSITIONS`' own, which puts the whole-board
 * pill first: it is what the group *is* before anything under it narrows it.
 */
const POSITION_GROUPS: { label: string; items: PositionOption[] }[] = [
  { label: 'Batters', items: POSITIONS.filter((p) => p.kind === 'batter') },
  { label: 'Pitchers', items: POSITIONS.filter((p) => p.kind === 'pitcher') },
];

/**
 * **The two the team reading keeps**, relabeled for a club.
 *
 * Nine of the eleven pills select a *position* and a club plays them all, so
 * they go; what is left is the two that were never positions — they say which
 * side of the ball the board is, which is exactly the question a team board
 * still has to answer. They are the same two options (`batters` / `pitchers`)
 * carrying the same `pos=` values, so the reading adds nothing to the URL and
 * `researchKindFor` goes on deciding which board is fetched.
 *
 * Only the words change: "Batters" and "Pitchers" name people, and a row here
 * is a club. `Hitting` and `Pitching` name what the numbers are about.
 */
const TEAM_SIDES: PositionOption[] = [
  {
    key: 'batters',
    label: 'Hitting',
    title: "How each club has hit — the whole roster's line",
    kind: 'batter',
  },
  {
    key: 'pitchers',
    label: 'Pitching',
    title: "How each club has pitched — the whole staff's line",
    kind: 'pitcher',
  },
];


/** The group a row's position belongs to, for the Pos cell's tooltip — the
 *  Stats API's own `position.type` less its two unhelpful spellings (it calls
 *  the DH "Hitter" and files a player with no position on record under
 *  "Unknown"). */
const POSITION_TYPE_LABELS: Record<string, string> = {
  Hitter: 'Designated hitter',
  Unknown: 'No position listed',
};
const posTypeLabel = (t: string) => POSITION_TYPE_LABELS[t] ?? t;

/** Which board a position sits on — what App fetches and keys the table on. */
/**
 * **Which players the board includes** — three independent buttons rather than
 * the single-select `My Players / All Players / Free Agents` this replaced.
 *
 * The old control could only ever name one set, and the question a fantasy
 * manager actually arrives with spans two of them: "my roster and the free
 * agents", or "everyone who isn't already spoken for". Three switches that
 * compose say all eight of those states, and the sets are disjoint by
 * construction — a row belongs to exactly one, `mine` winning where your roster
 * and ESPN's view of ownership disagree — so all three on is the whole board
 * and none on is an empty one, with an empty state that says why.
 *
 * **Free agents is the default**, and it is the right one for both kinds of
 * user. With a league connected the board opens on the players you could
 * actually add, which is what it is *for*; with no league there is no ownership
 * to read, so the same button means "everyone else" and the board opens on
 * essentially the whole league, which is what `All Players` used to do.
 * Orthogonal to the position pills, exactly as scope was: position narrows who
 * is eligible, this names which rosters they may be on.
 *
 * Note what these three are a partition *of*: **ownership**. That is the whole
 * of the question they answer, and it is why the **watchlist** is not a fourth
 * key here — not because it doesn't belong on the board beside them, but
 * because it is an answer to a different question. A watched player is on your
 * roster, on a leaguemate's or free; the star says nothing about which. So it
 * is a second axis, unioned on top of whatever these three let through
 * (`includeWatchlist` below), and keeping it out of this record is what keeps
 * the record a partition — which is what `inc=none`, `isDefaultInclude` and the
 * disjointness of `boardRows` all lean on.
 */
export type ResearchInclude = Record<ResearchIncludeKey, boolean>;

/** The board as it opens. */
export const DEFAULT_INCLUDE: ResearchInclude = { mine: false, others: false, fa: true };

/** The set as a list of keys — exported because a **saved search** stores one
 *  (see `ResearchSearchBoard`), and `fromIncludeKeys` beside it reads one back. */
export const includeKeys = (i: ResearchInclude): ResearchIncludeKey[] =>
  RESEARCH_INCLUDE_KEYS.filter((k) => i[k]);

export const fromIncludeKeys = (keys: ResearchIncludeKey[]): ResearchInclude => ({
  mine: keys.includes('mine'),
  others: keys.includes('others'),
  fa: keys.includes('fa'),
});

export const isDefaultInclude = (i: ResearchInclude): boolean =>
  RESEARCH_INCLUDE_KEYS.every((k) => i[k] === DEFAULT_INCLUDE[k]);

/** The URL form: the active keys, comma-joined. Null when it is the default,
 *  which keeps `inc=` out of a link that isn't saying anything. `none` is a
 *  real state and has to be spellable, since an empty string reads as absent. */
export function includeParam(i: ResearchInclude): string | null {
  if (isDefaultInclude(i)) return null;
  const keys = includeKeys(i);
  return keys.length ? keys.join(',') : 'none';
}

/**
 * Read `inc=`, falling back to the **legacy `scope=`** so every link written
 * before this control existed still opens on the board it describes:
 * `scope=mine` was your own players, `scope=fa` the free agents, and
 * `scope=all` was everybody — which is all three switches on, since that is
 * what "everybody" is now made of.
 */
export function toResearchInclude(inc: string | null, scope: string | null): ResearchInclude {
  if (inc !== null) {
    if (inc === 'none') return { mine: false, others: false, fa: false };
    const keys = inc
      .split(',')
      .filter((k): k is ResearchIncludeKey =>
        RESEARCH_INCLUDE_KEYS.includes(k as ResearchIncludeKey),
      );
    // Nothing recognized — an older build's spelling — falls back to the
    // default rather than to an empty board, the rule `toColumnKeys` follows.
    return keys.length ? fromIncludeKeys(keys) : { ...DEFAULT_INCLUDE };
  }
  if (scope === 'mine') return { mine: true, others: false, fa: false };
  if (scope === 'all') return { mine: true, others: true, fa: true };
  return { ...DEFAULT_INCLUDE };
}

/**
 * What each button is called, at each of the three widths it is drawn at. `fa`
 * carries a second wording for the unconnected case, because with no league the
 * set genuinely is a different one: ownership is unknowable, so the button
 * means "everyone off your roster" and says so rather than promising a free
 * agency it cannot check. All three forms are rendered and swapped by the
 * queries, the pattern the date presets and the window tabs already use.
 *
 * **`code` is the narrowest form and is deliberately not always a glyph.** The
 * two sets the app already has a mark for take it — the accent baseball that
 * means "mine" on every row of this board and on the fantasy button, and the
 * padlock that means "somebody else has him" on the rows beside it — so the
 * control wears the same marks as the thing it selects, which is the whole
 * reason to reach for icons here rather than draw three new ones. Free agency
 * has no such mark, so it is the letters `FA`, set in the same slot the glyphs
 * occupy so the three buttons stay one shape. And the *solo* wording gets `Rest`
 * rather than `FA`, because `Everyone Else` is not free agency: with no league
 * the app cannot read ownership, and two characters promising it would be a
 * claim rather than an abbreviation.
 */
type IncludeWording = { full: string; abbr: string; code: string; title: string };

const INCLUDE_META: Record<ResearchIncludeKey, IncludeWording & { solo?: IncludeWording }> = {
  mine: {
    full: 'My Roster',
    abbr: 'Mine',
    code: 'baseball',
    title: 'Players on your roster — the list the Summary, Games and Feed views report on',
  },
  others: {
    full: 'Other Rosters',
    abbr: 'Others',
    code: 'lock',
    title: "Players on somebody else's roster in your ESPN fantasy league",
  },
  fa: {
    full: 'Free Agents',
    abbr: 'Free',
    code: 'FA',
    title: 'Players nobody in your ESPN fantasy league has rostered',
    solo: {
      full: 'Everyone Else',
      abbr: 'Rest',
      code: 'Rest',
      title:
        'Every other player in the majors. With no fantasy league connected there is no ownership to read, so this is everyone who is not on your roster',
    },
  },
};

/** The narrowest form: one of the app's two ownership marks, or short text for
 *  the set that has none. */
function IncludeCode({ code }: { code: string }) {
  if (code === 'baseball') return <BaseballMark size={17} width={2} />;
  if (code === 'lock') return <LockGlyph size={17} width={2} />;
  /* **Free agents is a lock swung open**, where it used to be the letters `FA`.
     The two-letter form was right while this mark was the button's *whole*
     content on a phone; now the mark stands beside the word at every width, and
     `FA Free Agents` is a label saying itself twice. The open lock says the same
     thing in the vocabulary the other two are already in — the closed one is
     "somebody else has him", so its undone form is "nobody has". `Rest`, the
     wording with no league connected, takes it too: there is no ownership to
     read there, which is the same fact from the other end. */
  return <LockGlyph size={17} width={2} open />;
}

/**
 * **The order the three are read in, which is not the order they are stored
 * in.** `RESEARCH_INCLUDE_KEYS` is the state's own list — what exists, what a
 * URL round-trips, what `allDefault` walks — and reordering it to suit a row
 * would move the vocabulary to suit the furniture.
 *
 * The row runs widest-set-first: free agents is nearly the whole league, then
 * the two rosters that are a few dozen players each. Watchlist sits ahead of
 * all of them (see `rowWho`) because it is the reader's own list rather than a
 * cut of the league's, and because it is the one of the four that says *these
 * are the players I already care about*.
 */
const INCLUDE_ORDER: ResearchIncludeKey[] = ['fa', 'mine', 'others'];

const includeMeta = (k: ResearchIncludeKey, connected: boolean) =>
  (!connected && INCLUDE_META[k].solo) || INCLUDE_META[k];

export function researchKindFor(pos: ResearchPos): PlayerKind {
  return POSITION_BY_KEY.get(pos)?.kind ?? 'batter';
}

/** Narrows an unrecognized `pos=` from the URL back to the default board. */
export function toResearchPos(v: string | null): ResearchPos {
  return v !== null && POSITION_BY_KEY.has(v as ResearchPos) ? (v as ResearchPos) : 'batters';
}

// ---- Stat filters ---------------------------------------------------------

type Op = 'gte' | 'lte';

/** One "stat ≥ value" condition. Held as a list rather than a min/max pair per
 *  column because a research table has forty of them and two inputs each is a
 *  form, not a filter bar — you come here with a question ("300+ PA, .350+
 *  xwOBA"), and the builder is that question typed out. */
export interface StatFilter {
  id: number;
  column: string;
  op: Op;
  value: number; // in the column's comparison units (see Column.toValue)
  label: number; // …and as typed, which is what the chip shows
}

const OP_LABEL: Record<Op, string> = { gte: '≥', lte: '≤' };

/**
 * **How many may be compared at once.**
 *
 * Six is where a phone stops being able to show a stat name and two numbers,
 * and it is far past the two or three anybody actually lines up. The row
 * declines past it rather than dropping the oldest to make room: a seventh tick
 * silently un-ticking a first the reader still wants, with nothing on screen to
 * say which went, is worse than a tick that does nothing and says why.
 *
 * Lives here rather than in a file of its own now that the comparison *is* this
 * board — it was `ComparePage.tsx`'s, and that page is gone.
 */
export const MAX_COMPARE = 6;

/**
 * **A saved search's payload: the whole of what decides what is on this board.**
 *
 * **Fourteen fields**, and the test each one had to pass is *would a reader who
 * saved this and came back tomorrow be surprised to find it different*. Which
 * position, over which span, which ownership sets, with the watchlist on or
 * off, the clubs board or the players one, measured or projected, which
 * columns, sorted how, filtered how, searched for what, **which days a starter
 * has to be starting on, the schedule reading or the stats, and whether the
 * percentile badges are drawn** — every one of those is something somebody
 * deliberately set, and a "saved search" that dropped any of them would come
 * back as a different board wearing the right name.
 *
 * *(It was **eleven**, and the last three are the report that it "doesn't seem
 * to be saving all the settings" run to ground. Driven, all three failed and one
 * of them failed in the direction that matters most — see `turn`, `sched` and
 * `ranks` below, which carry the measurements. The test above never changed;
 * what was wrong is that it had been applied to the controls somebody thought of
 * rather than to the board.)*
 *
 * **What is deliberately not here** is anything that is not a *reading*: the
 * paging (`shown`), which panels were open, the half-typed condition in the
 * filter builder. Those are where the reader had got to, not what they were
 * looking at, and restoring them would be a saved search re-opening somebody's
 * furniture.
 *
 * **`v` is a version and it is checked**, which is the one thing that makes
 * this safe to store opaquely on the server. The board's vocabulary is the
 * client's — see `SavedSearch` — so a search written by a newer build can name
 * a position, a window or a filter operator this one has never heard of.
 * `readSearchBoard` is where that is handled: every field is narrowed against
 * what this build actually has, and one it cannot place falls back rather than
 * being applied. The alternative is a saved search from next season silently
 * putting the board into a state with no control able to undo it.
 */
export interface ResearchSearchBoard {
  v: 1;
  pos: ResearchPos;
  window: ResearchWindow;
  include: ResearchIncludeKey[];
  watchlist: boolean;
  teams: boolean;
  projected: boolean;
  /** The column keys, or null for "this board's defaults" — the same null the
   *  saved preference uses, and it means the same thing: follow the defaults as
   *  they change rather than being pinned to today's. */
  cols: string[] | null;
  sortKey: string | null;
  sortAsc: boolean;
  filters: StatFilter[];
  /** The name search, which is `search` on `BoardState` and `text` here because
   *  `search` on a thing called a *search* reads as the whole object. */
  text: string;
  /**
   * **The `Starting` filter's days**, as the URL spells them (`turnDaysParam`),
   * or null for the filter off.
   *
   * It was missing, and it is the one of the three that changed the *rows*:
   * driven, a board at `SP / 30d / Starting Fri 8/28 · Sun 8/30` read **32 of
   * 418 pitchers**, and the same search applied came back with no days and
   * **203 of 418**. A saved search that does not remember the narrowest filter
   * on the board is not a saved search.
   *
   * **Absolute dates, and they may go stale** — which is exactly what `turn=`
   * in a link already does and for the reason set out at `turnDays` in
   * `App.tsx`: `Starting Fri 8/28` is a fact about the schedule, not a rule
   * about the reader's today, and `clampTurnDays` cuts a stored day the window
   * no longer holds. A search kept past its fortnight therefore opens with the
   * filter off rather than with days nobody can start on.
   */
  turn: string | null;
  /**
   * **The Schedule reading**, or null for the stats. Missing too, and worse than
   * missing: `applySearchBoard` actively cleared it, so a search saved off a
   * schedule board came back as a stat board — measured, 80 schedule cells → 0.
   */
  sched: ScheduleSpan | null;
  /**
   * **Whether the percentile badges are drawn.**
   *
   * Not saved, and it did not merely fail to restore — it **leaked**. `showRanks`
   * is neither in the URL nor in the search, so it simply survived whatever board
   * the search was applied over: driven, a search saved with the badges *off*
   * came back with 1,426 of them, because the board it was applied from had them
   * on. The same search from two boards gave two different tables, which is the
   * one thing an apply is supposed to make impossible.
   *
   * **Optional, and absent means "no opinion".** A search saved before this
   * field existed has none, and the app's own rule is that an unrecognized value
   * falls back rather than emptying the view — so an old search leaves the
   * reader's badges as it finds them rather than turning them off. Every new
   * save writes a definite `true` or `false`.
   *
   * **And applying it never writes the record.** `showRanks` is a saved
   * *preference* (see it in `App.tsx`, where the comment draws the line between
   * a fact about the reader and a fact about the board), so the apply sets it
   * locally with its touched ref raised — exactly what the include set and the
   * watchlist already do, and what keeps opening somebody's link from quietly
   * becoming your saved default.
   */
  ranks?: boolean;
  /**
   * **Which watchlist was the active one** — the id of the reader's own list
   * the star was pointing at when the board was saved.
   *
   * `watchlist` a few fields up is whether the *button* was on; this is **which
   * list it was on**, and the two are a different question. A reader with
   * `Closers`, `Streamers` and `Deep SP` has three boards behind one lit button,
   * and a search that remembered the button and not the list re-opened on
   * whichever list happened to be selected — the same "the same search from two
   * boards gives two different tables" that `ranks` records one field up, on a
   * control that changes the *rows* rather than the badges.
   *
   * It matters with the button **off** as well as on: the active list is what
   * fills the star on every row of the board, and what the next press of one
   * writes to.
   *
   * **Optional, and absent means "no opinion"** — a search saved before this
   * field existed leaves the reader's list exactly as it finds it, the app's own
   * rule that an unrecognized value falls back rather than emptying the view.
   *
   * **And it is narrowed against the reader's own lists on the way in**, which
   * is what makes a *shared* search safe: a list id is one person's, so a search
   * somebody else saved names a list this reader does not have, and the apply
   * leaves theirs alone rather than pointing the star at nothing. That is *a
   * join fails to null, never to a guess* — see `applySearchBoard`, which is
   * also where the one thing this field does that its three neighbors do not is
   * argued: applying it **writes to the record**.
   */
  list?: string;
}

const ALL_POSITIONS = new Set<string>(POSITIONS.map((p) => p.key));
/** Every span the Schedule control can be in, including the two a league
 *  supplies — narrowed against on the way back out of a stored search. */
const SCHEDULE_SPANS_ALL = new Set<ScheduleSpan>([7, 14, 'matchup', 'next']);

/**
 * Narrow a stored board into one this build can actually apply.
 *
 * **Every field falls back rather than failing**, which is the app's standing
 * rule for an unrecognized value arriving in a link, applied to a whole object:
 * a search that names a position this build has dropped opens on `batters`
 * rather than on nothing, and a filter naming a column that has gone is
 * dropped while the rest of the search still applies. The only thing that
 * returns null is a payload that is not a saved board at all — a wrong `v`, or
 * an object with none of this shape — because there is no honest partial
 * reading of that.
 */
export function readSearchBoard(raw: unknown): ResearchSearchBoard | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return null;
  const pos = typeof r.pos === 'string' && ALL_POSITIONS.has(r.pos) ? (r.pos as ResearchPos) : 'batters';
  const window = (RESEARCH_WINDOWS as unknown[]).includes(r.window)
    ? (r.window as ResearchWindow)
    : 'season';
  const include = Array.isArray(r.include)
    ? (r.include.filter(
        (k): k is ResearchIncludeKey => (RESEARCH_INCLUDE_KEYS as string[]).includes(k as string),
      ))
    : [];
  const cols = Array.isArray(r.cols)
    ? r.cols.filter((c): c is string => typeof c === 'string')
    : null;
  const filters = Array.isArray(r.filters)
    ? r.filters.flatMap((f, i) => {
        if (typeof f !== 'object' || f === null) return [];
        const g = f as Record<string, unknown>;
        if (typeof g.column !== 'string') return [];
        if (g.op !== 'gte' && g.op !== 'lte') return [];
        const value = Number(g.value);
        if (!Number.isFinite(value)) return [];
        const label = Number(g.label);
        return [
          {
            // **Minted here rather than restored.** `StatFilter.id` is a React
            // key and a handle for the chip's ✕, and two searches applied in
            // one session would otherwise hand out the same ids twice. The
            // index is enough — the list is rebuilt whole on every apply.
            id: Date.now() + i,
            column: g.column,
            op: g.op,
            value,
            label: Number.isFinite(label) ? label : value,
          } satisfies StatFilter,
        ];
      })
    : [];
  return {
    v: 1,
    pos,
    window,
    include,
    watchlist: r.watchlist === true,
    teams: r.teams === true,
    projected: r.projected === true,
    cols,
    sortKey: typeof r.sortKey === 'string' ? r.sortKey : null,
    sortAsc: r.sortAsc === true,
    filters,
    text: typeof r.text === 'string' ? r.text : '',
    // The days are re-parsed by the caller (`toTurnDays`) and cut to the window
    // by the clamp that already guards an inbound `turn=`, so all this has to
    // decide is whether a string was stored at all.
    turn: typeof r.turn === 'string' && r.turn ? r.turn : null,
    sched: SCHEDULE_SPANS_ALL.has(r.sched as ScheduleSpan) ? (r.sched as ScheduleSpan) : null,
    // Three states, not two: `true`, `false`, and **absent** — a search saved
    // before the field existed, which leaves the reader's own setting alone.
    ranks: typeof r.ranks === 'boolean' ? r.ranks : undefined,
    // A string or nothing. Whether the string names a list *this reader owns*
    // is not decided here — this function narrows a stored board against what
    // the build understands, and which lists exist is a fact about the reader.
    // `applySearchBoard` is where that test lives.
    list: typeof r.list === 'string' && r.list ? r.list : undefined,
  };
}

/**
 * **Everything the board's two saved-thing controls need**, in one object.
 *
 * Held together rather than spread across the props for the reason a component
 * gets a props object at all: this is one feature with one owner
 * (`ResearchLists.tsx`), and `ResearchTable` does nothing with any of it but
 * hand it on. Keeping it in one field means adding a gesture to that feature is
 * a change in two files rather than four.
 */
export interface SavedControls {
  lists: SavedList[];
  searches: SavedSearch[];
  activeListId: string;
  maxLists: number;
  maxSearches: number;
  /** The shared list or search in force, or null — what draws the notice above
   *  the board and what `Save as my own` copies. */
  shared: SharedItem | null;
  /** What the Watchlist button is called: the active list's name, or a shared
   *  list's when one is showing. Empty before the boot read lands, which falls
   *  the label back to the word it always was rather than to nothing. */
  watchlistName: string;
  sharedSaving: boolean;
  onPickList: (id: string) => void;
  onCreateList: (name: string) => void;
  onRenameList: (id: string, name: string) => void;
  onDeleteList: (id: string) => void;
  onApplySearch: (search: SavedSearch) => void;
  /** The name of the saved search that replaced the reader's own board, or null
   *  where nothing has. Applying is the one press on this board that throws a
   *  reading away in one gesture, so it is the one that owes a way back — see
   *  `searchUndo` in `App.tsx`, and `undoLine` below for where it is said. */
  undoSearchName: string | null;
  onUndoSearch: () => void;
  onSaveSearch: (name: string) => void;
  onReplaceSearch: (id: string) => void;
  onRenameSearch: (id: string, name: string) => void;
  onDeleteSearch: (id: string) => void;
  onShare: (kind: 'list' | 'search', id: string, enabled: boolean) => void;
  onSaveSharedAsMine: () => void;
  onDismissShared: () => void;
}

// ---- Component ------------------------------------------------------------

interface Props {
  rows: ResearchRow[];
  kind: PlayerKind;
  /**
   * **The board read as thirty clubs rather than six hundred players.**
   *
   * A *reading* of the same board, not a second table: `rows` is the same
   * `ResearchRow[]` shape and every column, sort, filter, badge and page below
   * works untouched. What changes is the population, and with it the controls
   * that are only about people — the ownership buttons, the watchlist, the
   * position pills and the four per-row marks. Lifted to App with the rest of
   * the cross-board controls and carried in the URL as `board=teams`, for the
   * reason the window is: it decides what the table is a table *of*.
   */
  teams: boolean;
  onTeamsChange: (on: boolean) => void;
  loading: boolean;
  error: string | null;
  /** The selected position pill. Lifted to App because changing it can change
   *  the board, and the board is what this component is keyed on — held here it
   *  would be thrown away by the very remount it caused. */
  pos: ResearchPos;
  onPosChange: (pos: ResearchPos) => void;
  /** The visible column keys, or null for this board's defaults. Lifted to App
   *  for the same reason `pos` is — and so the URL can carry it. */
  columnKeys: string[] | null;
  onColumnsChange: (keys: string[] | null) => void;
  /** How much of the season the numbers cover. Lifted to App alongside `pos`:
   *  it survives the remount a board switch causes, and it is the one page
   *  control the URL carries, since it decides which games the table is about
   *  rather than which of its rows are shown. */
  window: ResearchWindow;
  onWindowChange: (w: ResearchWindow) => void;
  /**
   * The **Schedule view** — the days ahead in place of the stat columns.
   *
   * Two props rather than one because the two answer different questions and
   * arrive at different times: `scheduleSpan` is the control's own state (in
   * the URL as `sched=`, held in App and shared with the summary table, so one
   * press of the toggle changes the mode on both), and `schedule` is the window
   * once it has landed. So a board can be *in* the mode with the index still
   * null, which is exactly the state the wait below is drawn for — the app's
   * standing rule that nothing blanks while a read is in flight.
   */
  scheduleSpan: ScheduleSpan | null;
  onScheduleSpanChange: (s: ScheduleSpan | null) => void;
  schedule: ScheduleIndex | null;
  /** The league's own two matchup periods, or null with no league — what the
   *  span run offers past `Next 7` / `Next 14`, and what the mode opens on.
   *  Threaded rather than read here for the reason `trendWindows` is: it is a
   *  per-user league fact, and this table is otherwise the league's. */
  matchupWindow: MatchupWindow | null;
  /**
   * **The projected reading** — what the whole league is expected to do over a
   * span of days nobody has played yet, in place of the season or window the
   * board otherwise draws.
   *
   * Three props, for the reason the Schedule view takes two and the turn filter
   * three: they answer different questions and arrive at different times.
   * `projected` is the control's own state (in the URL as `bproj=1`, held in
   * App so a lens survives a crossing to a player's page and back);
   * `projection` is the answer once it has landed, **null until it does**, so
   * the board goes on drawing the measured figures until there is something to
   * replace them with — rule 1 of the app's loading system, and the same
   * arrangement `schedule` has one field up; and `projSpan` is the days
   * themselves, which App owns because it owns every range in the app.
   *
   * The board is in the lens with the answer still null for exactly as long as
   * the read is out, which is the state the ball inside the toggle is drawn
   * for.
   */
  projected: boolean;
  projection: BoardProjection | null;
  /** The days the lens is over — held in App, which owns every range in the
   *  app, and **re-derived on every fresh press** rather than remembered. */
  projSpan: { start: string; end: string };
  /** A new span, which turns the lens **on**; `null` turns it off. One callback
   *  for both because the panel's pills are toggles — pressing the lit one is
   *  how the lens goes off, which is the rule the turn filter's day strip
   *  already follows for its own last day. */
  onProjSpanChange: (span: { start: string; end: string } | null) => void;
  /**
   * **The named spans the panel offers**, and the calendar under them is
   * everything else. Built in App, which owns this app's clock and its league's
   * two matchup periods — a board that derived its own today would be a second
   * answer to *which day is it*, which is the thing `today` was lifted out of
   * five memos to prevent. See `boardProjSpans`.
   */
  projSpans: { label: string; start: string; end: string; title: string }[];
  /** The app's own baseball today — what the `Custom` calendar opens on where
   *  no range is in force, and this app's one clock. */
  today: string;
  /**
   * **The lens's own visible columns**, or null for its defaults — a separate
   * entry from `columnKeys` beside it and its own for the reason the player
   * page's Stats tab keeps one: the lens offers a **strict subset** of this
   * board's vocabulary, so a write from its picker would drop every Statcast
   * and roster-% column from the measured board's saved list. Saved per user
   * (`UserPrefs.projectedColumns`) and carried in `cols=` while the lens is the
   * reading on screen, exactly as the measured set is while it is.
   */
  projColumnKeys: string[] | null;
  onProjColumnsChange: (keys: string[] | null) => void;
  /** The latest day the calendar may reach — the app's own ceiling, so the
   *  board and the Roster cannot disagree about where the season ends. */
  maxDate: string;
  /**
   * **The turn filter** — the days a pitcher must be due to start on to be on
   * the board at all. Null is off, which is every board but a pitching one and
   * most pitching ones.
   *
   * Three props for the same reason the Schedule view takes two: they answer
   * different questions and arrive at different times. `turnRange` is the
   * control's own state (in the URL as `turn=`, held in App so leaving the view
   * does not throw it away), and `turnIndex` is the **whole window** indexed —
   * every day the server answered for, not the span the grid happens to be
   * drawing — so the filter can name a day the Schedule view is not showing and
   * both can be on at once. So a board can be *in* the filter with the index
   * still null, which is exactly the state the button's own wait is drawn for:
   * nothing narrows while the read is in flight.
   */
  turnDays: TurnDays | null;
  onTurnDaysChange: (d: string[] | null) => void;
  turnIndex: ScheduleIndex | null;
  /** Which of the three sets of players the board includes. Lifted to App with
   *  the other cross-board controls, and in the URL for the same reason the
   *  window is: it changes the population the table describes, not the
   *  presentation of it. */
  include: ResearchInclude;
  onIncludeChange: (i: ResearchInclude) => void;
  /** Put the watchlist on the board **as well as** whatever the three above let
   *  through — a union, not an intersection. A watched player can be on any of
   *  the three ownership sets, so narrowing by him was the surprising operation
   *  and unioning him in is the useful one; see `ResearchInclude`. Lifted and
   *  persisted alongside it, the two being one control set. */
  includeWatchlist: boolean;
  onIncludeWatchlistChange: (on: boolean) => void;
  /** Draw a percentile rank under every value — see `columnRanks.tsx` for the
   *  rule and for what it is ranked against. Lifted to App because the player
   *  page's Stats tab reads the same flag: it is one reading habit rather than
   *  a per-table setting, and the two tables are the same vocabulary. Saved per
   *  user, and deliberately not in the URL. */
  showRanks: boolean;
  onShowRanksChange: (on: boolean) => void;
  /** Whether a fantasy league is connected, and so whether the board carries a
   *  roster-% column at all. The figure is ESPN's own and needs no credentials,
   *  so this gate is about relevance rather than access: to someone with no
   *  fantasy league it is a column of noise. */
  hasRosterPct: boolean;
  /** Whether ESPN's eligibility map has landed, and so whether the position
   *  pills read it rather than MLB's single listed position. It decides only
   *  the *wording* — the pill titles and the Pos cell's tooltip; which rows
   *  match is decided per row off `ResearchRow.eligible`, so a player ESPN
   *  can't place falls back on his own rather than by a page-wide flag. */
  hasEligibility: boolean;
  /** The spans the trend columns measure — one entry per window the server
   *  found a baseline for, carrying both the window (the column's identity) and
   *  the days actually measured (its label). Null, or simply missing an entry,
   *  is what removes a column entirely. */
  trendWindows: readonly { window: TrendWindow; days: number }[] | null;
  /** MLB ids of every player rostered in the connected fantasy league, or null
   *  while there is no league connected and nothing has been read. The free
   *  agents are the complement of this within the board — see `boardRows`. */
  ownedIds: Set<number> | null;
  /** MLB id → the name of the fantasy team holding him, for the players held by
   *  somebody **other than this user** — the same set `Other Rosters` selects,
   *  minus anyone on the user's own ESPN team. Null with no league connected,
   *  which is what keeps the lock off the board entirely. Built in App off the
   *  same `/api/espn/ownership` payload `ownedIds` comes from, so it costs no
   *  request of its own; see there for why the user's own team is excluded
   *  upstream rather than at the draw site. */
  ownedElsewhere: Map<number, string> | null;
  /** Whether a league is connected at all, which is what decides if the Free
   *  Agents pill is offered. Separate from `ownedIds` being null, since a
   *  connected league whose read is still in flight is a third state. */
  espnConnected: boolean;
  /** A failed read — usually an expired `espn_s2`. Shown on the board rather
   *  than swallowed, because the alternative is a table that silently claims
   *  every player is available. */
  espnError: string | null;
  /** Open the Fantasy league settings page. */
  onConnectEspn: () => void;
  /** `${kind}-${id}` for everything on the user's **roster** — the saved list,
   *  or the ESPN team when the views are reading that. What `My Roster`
   *  selects on and what the baseball beside a name marks. */
  rosterKeys: Set<string>;
  /** `${kind}-${id}` for everything on the **watchlist** — a different list
   *  from the roster (see `store.ts`), the one each row's star toggles. Keyed
   *  by the app's player key, so a two-way player followed only as a pitcher is
   *  starred on the pitching board and not the batting one. */
  watchlistKeys: Set<string>;
  /**
   * **The reader's own active list**, which is what a row's star reflects and
   * writes to — always, and whether or not somebody else's list is being shown
   * over the top of it.
   *
   * A second set beside `watchlistKeys` because that one has three jobs (the
   * union on the board, the count on the button, the star) and a **shared**
   * list splits them: the first two are about the list on screen and the third
   * is about the list you own. Marking a stranger's players starred while the
   * press writes to your own list would be a control lying about what it does.
   * Identical to `watchlistKeys` whenever nothing is shared, which is almost
   * always.
   */
  ownWatchlistKeys: Set<string>;
  /**
   * **Compare mode** — whether the tick that puts a row into a comparison is
   * drawn at all.
   *
   * A mode rather than a column that is always there, and the name column is
   * the reason: see `WatchStar`'s own note, which records that this is the
   * app's widest table's sticky column and that a control ahead of the name
   * pushes every name along by its own width. The tick sits **after** the star
   * for the same reason the star sits after the name, and only while somebody
   * is using it.
   */
  compareOn: boolean;
  onCompareModeChange: (on: boolean) => void;
  /** Who is ticked, in the order they were ticked — which is the order they
   *  are drawn in on the page, so a reader picks left to right. */
  compareSelected: string[];
  onToggleCompare: (key: string) => void;
  /** How many may be ticked. The row declines past it rather than dropping the
   *  oldest to make room; the button says how many are in. */
  maxCompare: number;
  /** Commit the ticked set — which **narrows this board to it** rather than
   *  opening anything. */
  onOpenCompare: () => void;
  /**
   * **The committed set: the players this board is currently limited to**, or
   * empty for the ordinary board.
   *
   * It is a narrowing and not a page. A comparison of three men is the research
   * board asked about three men — the same columns, the same sort, the same
   * picker, the same everything — so it is a *filter over the population*, in
   * the place the include buttons already narrow it, rather than a second table
   * somewhere else that has to be kept in step with this one.
   */
  compareKeys: string[];
  onClearCompare: () => void;
  /** The named lists, the saved searches and the shared-link chrome — one prop
   *  object rather than fifteen flat ones, and the reason is that they are one
   *  feature: every field is read by `ResearchLists.tsx` and by nothing else in
   *  this file, so flattening them would be fifteen names in a signature that
   *  already has sixty. */
  saved: SavedControls;
  /** Put a player on the watchlist, or take him off. */
  onWatchlistToggle: (key: string, on: boolean) => void;
  /** Open the details overlay (percentiles, game log, season splits) for a row.
   *  Takes a player key, the same currency the rest of the app navigates in. */
  onOpenDetails: (key: string) => void;
  /** …and the same for a **club**, which is what a row of the team reading
   *  opens. A team id rather than a key: a club is one row on this board and
   *  one page, where a two-way player is two of each. */
  onOpenTeam: (teamId: number) => void;
  /** The board's own settings, held by App so leaving the page doesn't throw
   *  them away — see `ResearchUi`. The updater form only, since every change
   *  here is a patch of one field of one board. */
  ui: ResearchUi;
  onUiChange: (update: (prev: ResearchUi) => ResearchUi) => void;
}

/** An unrecognized `win=` is the season, matching `toResearchPos`'s rule and the
 *  server's: a link from a build that offered a different set of windows should
 *  still open the board rather than 404 on a query param. */
export function toResearchWindow(v: string | null): ResearchWindow {
  const n = Number(v);
  return RESEARCH_WINDOWS.includes(n as ResearchWindow) ? (n as ResearchWindow) : 'season';
}

const windowLabel = (w: ResearchWindow) => (w === 'season' ? 'Season' : `${w}d`);

/**
 * How many rows the board draws at once, and how close to the foot of the pane
 * the reader has to get before the next lot are added.
 *
 * **A page rather than the whole board**, because the board is the whole
 * league: 600-odd rows, each of them a headshot, an identity block, three
 * marks and up to 44 cells, and — with `Ranks` on — a percentile badge under
 * every one of those cells. Every one of them was mounted on the first paint
 * of a page nobody has scrolled yet.
 *
 * **Fifty rather than the feed's twenty**, and the difference is what the two
 * pages are for: the feed is read down, an item at a time, where this is a
 * leaderboard that is *scanned* — the leaders are the point, and a page that
 * runs out ten rows past the fold would be a table that stops in the middle of
 * the answer. Fifty is comfortably more than any pane can hold (50 × 58px is
 * 2,900px against a 1,080px screen), which is also what makes the load-ahead
 * below safe: one page always overfills the pane, so growing can never leave
 * the foot still in view and chain.
 *
 * **And it grows on scroll rather than on a `Load more` button**, which is the
 * argument this board's own paragraph made and which the **game log has since
 * come round to** — it had the button and now takes this mechanism whole (see
 * `paging.tsx`, and `GameLog.tsx` for its own 20). The half of that paragraph
 * that stands is the part about a leaderboard: it has no end worth stopping at,
 * the reader is looking for a name or a run of rows, and a button between row
 * 50 and row 51 is a control asking permission to carry on doing the one thing
 * the page is for. What has gone is the *contrast* it drew — that a list whose
 * end is a real place wants a button — because the log's end turned out not to
 * be a place anyone was stopping at either.
 *
 * What the app's "no silent caps" rule asks for is that nothing be hidden, and
 * nothing is: the count line above the table still says how many rows the
 * filters left, and every one of them is one scroll away.
 */
const PAGE_SIZE = 50;

/** One empty map rather than a fresh one per render — the day strip's counts
 *  are a memo dependency of nothing, but a new `Map` every render would make
 *  every child holding it re-render for no change. */
const NO_COUNTS: Map<string, number> = new Map();


/** What each board remembers while you are looking at the other one. */
export type BoardState = {
  search: string;
  /** Null until the reader sorts something — see `freshBoard`. */
  sortKey: string | null;
  sortAsc: boolean;
  filters: StatFilter[];
};

/** A board as it opens: descending, nothing searched, nothing filtered, and
 *  **no sort of its own yet** — `sortKey: null` means "whatever this board's
 *  default is", which is read at render because it depends on a column that
 *  isn't there on the first one (see `defaultSortKey`). */
const freshBoard = (): BoardState => ({
  search: '',
  sortKey: null,
  sortAsc: false,
  filters: [],
});

/**
 * Everything the board is set to that App didn't already own — the two boards'
 * search, sort and filters, which of the three disclosures are open, and the
 * half-built condition sitting in the filter builder.
 *
 * It is held in **App**, and the shape exists to make that one line rather than
 * six. The reason is that this component is unmounted the moment you leave the
 * page: state kept in it is state the Roster tab throws away, so a look at the
 * summary cost you the four filters you had built and put the sort back to its
 * default — precisely the loss `BoardState` was written to prevent between the
 * two boards, happening one level up between the two views. App already holds
 * the position, the window, the include set and the columns for that same
 * reason; these are the rest of that set, and keeping half the board's
 * settings in each place is why only half of them survived.
 *
 * The vocabulary stays here: App stores this object and hands it back, and
 * every rule about what is in it — the per-kind slots, the sort's fallback, the
 * draft's fallback — is still written in this file.
 */
/**
 * **Which of the four slots a board's search, sort and filters live in** — the
 * two kinds times the two readings.
 *
 * The team reading gets its own for the reason the two kinds have theirs: "a
 * batter's `PA ≥ 300` is not a condition the pitching board can even express",
 * and it is not one thirty clubs can express either — every one of them has
 * 4,800 of them. A sort is the same story: `Ros%` is the board's default sort
 * with a league connected and is not a column a club has. So crossing to the
 * clubs and back restores the player board exactly as it was, which is the
 * whole point of this record existing.
 */
export type BoardStateKey = PlayerKind | `team-${PlayerKind}`;
export const boardStateFor = (kind: PlayerKind, teams: boolean): BoardStateKey =>
  teams ? (`team-${kind}` as const) : kind;

export interface ResearchUi {
  boards: Record<BoardStateKey, BoardState>;
  /** Which disclosures are open (Columns being a dialog rather than a panel,
   *  but held here with the other two: it is the same kind of state). An open
   *  panel is part of where you were:
   *  coming back to find the Filters panel shut is the same surprise as coming
   *  back to find it empty. */
  panels: {
    search: boolean;
    filters: boolean;
    turns: boolean;
    columns: boolean;
    /** The watchlist chooser and the saved searches — panels like the rest, and
     *  held here for the reason the rest are: coming back to find one shut is
     *  the same surprise as coming back to find it empty. */
    lists: boolean;
    searches: boolean;
    /**
     * **The position picker and the span picker** — the two runs of pills the
     * bar used to draw flat, now behind the buttons that state what they are
     * set to.
     *
     * They are panels rather than dialogs because they are *one strip of pills
     * each*, which is the test `ColumnPicker` states from the other side: a
     * panel several hundred pixels tall wedged into the chrome pushes the table
     * down the page, and eleven pills in a row is not that. `settings` is the
     * one that is, and it is a dialog and so is not here — see `settingsOpen`.
     */
    pos: boolean;
    window: boolean;
    /** The projected lens's span picker — the days it is drawn over. Open is a
     *  fact about where you were, like the other three. */
    projected: boolean;
    /** …and whether that panel's `Custom` door is the one in force — the
     *  calendar is drawn only behind it. Held with the rest of *where you were*
     *  so a reader who picked a range, crossed to the Roster and came back
     *  finds the calendar showing their range rather than a run of pills that
     *  says nothing is selected. */
    projCustom: boolean;
  };
  /** The condition being typed, deliberately *not* per board — it is a
   *  keystroke rather than a setting. The column it names does belong to one
   *  board, so `draftColumn` falls back when you cross to a board without it. */
  draft: { column: string | null; op: Op; value: string };
  /**
   * How many rows of the table are drawn — `PAGE_SIZE`, then a page more each
   * time the reader reaches the foot of the pane.
   *
   * Up here with the rest of the board's settings rather than in the component
   * for the reason the whole of this object is up here, and the feed's own
   * `feedShown` is one level up from *it*: the component is unmounted the
   * moment you leave the page, and this number decides **how tall the table
   * is**. App restores a scroll offset per view (keyed `'research'`), so a
   * reader who had scrolled to row 300 and gone to the Roster tab would come
   * back to fifty rows and to an offset that page had no room for — the one
   * way that memory can be exactly right and still land wrong.
   *
   * It is one number rather than one per board because it is reset by the
   * board signature anyway, and crossing to the other board is a change of
   * signature: a page into the batters is not a page into the pitchers.
   */
  shown: number;
}

/** The board as it opens — what App seeds its `useState` with. */
export const freshResearchUi = (): ResearchUi => ({
  boards: {
    batter: freshBoard(),
    pitcher: freshBoard(),
    'team-batter': freshBoard(),
    'team-pitcher': freshBoard(),
  },
  panels: {
    search: false,
    filters: false,
    turns: false,
    columns: false,
    projected: false,
    projCustom: false,
    lists: false,
    searches: false,
    pos: false,
    window: false,
  },
  draft: { column: null, op: 'gte', value: '' },
  shown: PAGE_SIZE,
});

/**
 * A board row's headshot, with today's two marks on it: the lineup pip on the
 * top corner — a batting slot, `SP`, a reliever's entry inning — and the status
 * code on the bottom edge, `IL10` or `DTD`.
 *
 * They matter more here than anywhere else in the app. Every other view draws
 * players the user chose; this one is the whole league, most of it strangers,
 * and the question it exists to answer is whether to pick somebody up. A man
 * batting second tonight and a man who went on the IL this morning have the
 * same season line, and the line is all this table showed of the difference.
 *
 * `usePlayerStatus` is what the summary table reads off a report — the board
 * has no report for a player nobody is watching, so it reads the same facts off
 * the league-wide status map instead. Absent until that one request lands, and
 * absent afterwards for a player with nothing to say, which is most of them.
 */
function ResearchPhoto({
  row,
  playerKey: key,
  onOpen,
}: {
  row: ResearchRow;
  playerKey: string;
  onOpen: (key: string) => void;
}) {
  const status = usePlayerStatus(row.id);
  const badge = useStatusBadge(key, status?.rosterStatus ?? null);
  return (
    <button
      type="button"
      className="sum-photo-wrap"
      onClick={() => onOpen(key)}
      title={`${row.name} — Statcast details`}
    >
      <img className="sum-photo" src={headshotUrl(row.id)} alt="" />
      <PhotoSpot
        corner={status ? statusCorner(status, row.kind) : null}
        className="sum-photo-spot"
      />
      <PhotoStatus badge={badge} className="sum-photo-status" />
    </button>
  );
}

/**
 * The star that puts a row on the watchlist, or takes it off.
 *
 * It sits **after the name**, and the cost is the reason: this is the app's
 * widest table by some way, every pixel of the name column is a stat pushed off
 * the right edge of a phone, and a control ahead of the name would push every
 * name in the column along by its own width. Trailing, it takes 19px (a 13px
 * glyph in a 6px gutter) of a column that is fluid anyway — it absorbs the
 * table's slack — so on a desktop it costs the stats nothing at all and on a
 * phone it costs them one character of a name that was already truncating.
 *
 * Drawn on **every** row rather than on hover, because half this app's traffic
 * has no hover to give: an outline star is "not watched" and a filled one is
 * "watched", which is the same read a checkbox would give at three times the
 * width and with a form's grammar rather than a state's.
 */
/**
 * **The tick that puts a row into a comparison**, drawn only in compare mode.
 *
 * A checkbox in everything but the element: `role="checkbox"` on a button
 * rather than an `<input>`, which is what the rest of this bar's controls do
 * and what lets it be the same 19px square the star beside it is without
 * fighting a UA-drawn box. Its state is announced by `aria-checked`, so nothing
 * rests on the glyph.
 *
 * **Full is `aria-disabled`, not `disabled`.** A disabled button shows no
 * `title`, and the title is the whole of the explanation — a reader who presses
 * a sixth row is owed the sentence saying why nothing happened, and a control
 * that is merely inert says nothing at all.
 */
function CompareTick({
  on,
  full,
  max,
  name,
  onToggle,
}: {
  on: boolean;
  full: boolean;
  max: number;
  name: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-disabled={full || undefined}
      className={`research-tick${on ? ' on' : ''}${full ? ' is-full' : ''}`}
      title={
        on
          ? `Drop ${name} from the comparison`
          : full
            ? `${max} players is the most you can compare — untick one to add ${name}`
            : `Add ${name} to the comparison`
      }
      onClick={() => {
        if (!full) onToggle();
      }}
    >
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
        <rect
          x="4"
          y="4"
          width="16"
          height="16"
          rx="3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        {on && (
          <path
            d="m7.8 12.3 2.9 2.9 5.5-5.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </button>
  );
}

function WatchStar({
  on,
  name,
  onToggle,
}: {
  on: boolean;
  name: string;
  onToggle: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`research-watch${on ? ' on' : ''}`}
      aria-pressed={on}
      title={on ? `Remove ${name} from your watchlist` : `Add ${name} to your watchlist`}
      onClick={() => onToggle(!on)}
    >
      <svg
        viewBox="0 0 24 24"
        width="13"
        height="13"
        fill={on ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9Z" />
      </svg>
      <span className="sr-only">{on ? 'On your watchlist' : 'Add to watchlist'}</span>
    </button>
  );
}

export function ResearchTable({
  rows: measuredRows,
  kind,
  teams,
  onTeamsChange,
  loading,
  error,
  pos,
  onPosChange,
  columnKeys,
  onColumnsChange,
  window: statWindow,
  onWindowChange,
  scheduleSpan,
  onScheduleSpanChange,
  projected,
  projection,
  projSpan,
  onProjSpanChange,
  projSpans,
  today,
  projColumnKeys,
  onProjColumnsChange,
  maxDate,
  turnDays,
  onTurnDaysChange,
  turnIndex,
  matchupWindow,
  schedule,
  include,
  onIncludeChange,
  includeWatchlist,
  onIncludeWatchlistChange,
  showRanks,
  onShowRanksChange,
  hasRosterPct,
  hasEligibility,
  trendWindows,
  ownedIds,
  ownedElsewhere,
  espnConnected,
  espnError,
  onConnectEspn,
  rosterKeys,
  watchlistKeys,
  ownWatchlistKeys,
  compareOn,
  onCompareModeChange,
  compareSelected,
  onToggleCompare,
  maxCompare,
  onOpenCompare,
  compareKeys,
  onClearCompare,
  saved,
  onWatchlistToggle,
  onOpenDetails,
  onOpenTeam,
  ui,
  onUiChange,
}: Props) {
  /**
   * **The lens is in force**, which is the flag every branch below reads —
   * pressed *and* answered.
   *
   * The two halves are deliberately one test: the board goes on drawing the
   * measured board for as long as the read is out (rule 1 of the loading
   * system — never over data), so a press swaps nothing until there is
   * something to swap in, and the only mark it leaves is the ball inside the
   * toggle that started it. Every control the lens takes off the bar comes off
   * on the same beat the columns change, which is what stops the bar saying one
   * thing while the table says another for the length of a fetch.
   */
  const projectedOn = projected && projection !== null;
  /**
   * **The rows the whole of this component is about.**
   *
   * One swap at the top rather than a branch at every reader, and it is the
   * economy the projected board was designed around: `BoardProjection.rows` are
   * `ResearchRow`s, so the population, the include buttons, the position pills,
   * the search, the sort, the filters, the marks and the paging below are all
   * untouched and none of them had to be told the lens exists. What the lens
   * changes past this line is the *columns* (`columns`) and the two controls
   * whose subject it swaps out.
   */
  const rows = projectedOn ? projection.rows : measuredRows;
  // Every column this board *has* — what the picker lists, what a filter can be
  // built on, and the canonical order. `columns` below is the visible subset.
  // Roster % drops out of the vocabulary entirely without a league, rather than
  // showing as a column of dashes: a column you cannot fill is worse than one
  // that isn't offered, and it would otherwise sit at the very front.
  const measured = useMemo(
    () => new Map((trendWindows ?? []).map((t) => [trendKey(t.window), t.days])),
    [trendWindows],
  );
  // Today's facts for the whole league — the same map every row's lineup pip
  // and IL badge are drawn from, read here because one *column* is drawn from
  // it too (see `opponentColumn`). Straight off the context rather than a prop:
  // the rows already read it a row at a time through `usePlayerStatus`, and a
  // second route to the same map is a second thing to keep in step.
  const statuses = useContext(PlayerStatusContext);
  // …and the same day by club, which is what the column falls back to for a man
  // today's boxscores do not carry — see `OpponentCell`. Off the context beside
  // the map above and for the identical reason.
  const clubStatuses = useContext(ClubStatusContext);
  const allColumns = useMemo(() => {
    const base = kind === 'pitcher' ? PITCHER_COLUMNS : BATTER_COLUMNS;
    return base
      // **A column a club has not got is not offered**, exactly as `Ros%` is
      // not offered without a league — see `TEAM_HIDDEN`, which carries the
      // reason for each one. It is first in the chain so nothing below it has
      // to know about the reading.
      .filter((c) => !(teams && TEAM_HIDDEN[kind].has(c.key)))
      // **And the mirror**: a column only a club has is not offered on the
      // player reading — `W%` is a fact about the row, and a player's row is a
      // person. See `TEAM_ONLY`, which is the same rule as the line above read
      // the other way.
      .filter((c) => !(!teams && TEAM_ONLY.has(c.key)))
      .filter((c) => (c.key === 'rosterPct' ? hasRosterPct : true))
      // The one column whose cells read something other than the row. Injected
      // here for the reason a trend column's label is: the array above is the
      // canonical *order*, and runtime is where the data to fill it arrives.
      .map((c) => (c.key === OPPONENT_KEY ? opponentColumn(statuses, clubStatuses) : c))
      // A window with no baseline is dropped rather than dashed, and so is
      // every one of them on a cold install: a column of zeroes would read as
      // "nobody is moving", which is a claim where the truth is an absence.
      .filter((c) => (TREND_BY_KEY.has(c.key) ? measured.has(c.key) : true))
      .map((c) => {
        const days = measured.get(c.key);
        return days === undefined
          ? c
          : {
              ...c,
              label: `\u0394${days}d`,
              title: `Change in roster % over the last ${days} day${days === 1 ? '' : 's'}`,
            };
      });
  }, [kind, teams, hasRosterPct, measured, statuses]);
  /**
   * **The vocabulary in force** — the board's, or the lens's strict subset of
   * it while the lens is drawing.
   *
   * This is what the **Columns picker lists**, what the **filter builder**
   * offers a threshold on, and what the sort resolves a key through. All three
   * have to move together with the figures: a picker offering `xwOBA` on a
   * board that cannot draw it is a control lying about its reach, and a
   * threshold on a column whose value is null on every row is a filter that
   * empties the table for no reason a reader can see.
   *
   * `allColumns` above stays the **measured** vocabulary whatever the lens is
   * doing, because two things still need it: the picker's own `DEFAULT_OFF`
   * arithmetic for the measured set, and the reader's saved measured list
   * surviving a press of the toggle untouched.
   */
  const scoringCategories = useScoringCategories();
  const vocabulary = useMemo(
    () =>
      projectedOn ? projectedColumns(kind, projection.oneDay, scoringCategories) : allColumns,
    [projectedOn, projection, kind, allColumns, scoringCategories],
  );
  const columnsByKey = useMemo(
    () => new Map(vocabulary.map((c) => [c.key, c])),
    [vocabulary],
  );
  /**
   * **What the Columns dialog lists** — the vocabulary in force, less the one
   * column under the lens that is not the reader's to turn off.
   *
   * `Opp` on a single day is what that reading *is*: a reader who narrows a
   * projection to one date is asking who each man plays, and the figures beside
   * it are read against that fixture. It is also the one projected column whose
   * existence comes and goes with the span, which is what makes a tick for it
   * dishonest in both directions — off it would be put straight back by
   * `toProjectedColumnKeys` (a range cannot record a decision about a column it
   * never offered), and on it is already there. A checkbox that cannot change
   * anything is a control lying about its reach, so there is no checkbox.
   *
   * **The key still rides in `orderedKeys`**, which is what draws and sorts it,
   * and the dialog carries a key it cannot resolve through its own reorder
   * untouched (`ColumnPicker`'s `commit`) — so an arrangement made in there
   * comes back with the opponent still leading it.
   *
   * The measured board is untouched: there `Opp` is one column among 44,
   * drawn from today's status map whatever span the reader picked, and turning
   * it off is a perfectly good thing to want.
   */
  const pickerColumns = useMemo(
    () => (projectedOn ? vocabulary.filter((c) => c.key !== OPPONENT_KEY) : vocabulary),
    [projectedOn, vocabulary],
  );

  /**
   * ---------------------------------------------------------------------
   * The game preview an opponent cell opens, in the Schedule view.
   * ---------------------------------------------------------------------
   *
   * **The same dialog the roster table's Schedule cell opens**, because it is
   * the same cell — `ScheduleCell` was built with an `onPreview` from the
   * start and this board simply never handed it one, so `vs MIL` read as a
   * press on twelve of your own men and as plain text on the other four
   * hundred and fifty. One cell drawing two behaviors is the thing this file
   * and `client-summary.md` spend their length preventing.
   *
   * It matters more here than it does there, and for the reason the board
   * exists: the roster is men you already own, where the fixture answers *do I
   * start him Thursday*; this is the whole league, where it answers *is this
   * the week to pick him up* — a two-start turn against the club with the
   * worst line against right-handers is exactly the case, and until now the
   * board could show the `2` and not what the two were against.
   *
   * **What the board cannot hand the dialog is the man himself.** A row here
   * is a `ResearchRow` — a leaderboard line, not a `PlayerReport` — so it has
   * neither his throwing hand nor his platoon split. The hand comes off
   * `HandednessContext`, which the board's own rows already read for the `L/R`
   * under a name; the split is **read on the press** and held, exactly as the
   * opposing club's board beside it is (`useOpponentBoards`), and the dialog
   * draws the wait. Fetching 450 splits to make 450 cells pressable is the
   * alternative, and it is not one.
   */
  /**
   * The fixture whose preview is open — **and the index it was opened from**.
   *
   * Two surfaces raise this box now: the Schedule view's grid, off the span
   * index, and the turn filter's `Start` column, off the whole-window one. The
   * index has to travel with the fixture rather than be looked up at the draw
   * site, because at that point there is no telling which of the two a game
   * came from — and the dialog reads the index for the man the other club is
   * throwing, which is the half of it a reader opened it for.
   */
  const [fixture, setFixture] = useState<{
    row: ResearchRow;
    game: ScheduleGame;
    index: ScheduleIndex;
  } | null>(null);
  /* Keyed on whose preview is open, so a club line read for one man is dropped
     when the next opens — `useOpponentBoards`'s own contract, and the summary
     table holds it exactly this way. */
  const { opps, load: loadOpponent } = useOpponentBoards(fixture?.row.id ?? 0);
  /** The door onto a game's own page, for a start that has already been made —
   *  the same context the roster table's opponent cell reads, and null outside
   *  the provider, which leaves those starts the plain text they were. */
  const openGame = useGameDoor();
  /**
   * His platoon split, by MLB id, read lazily and **kept for the board's
   * lifetime** — which is the one place this departs from the club cache above.
   * A club's line is scoped to the man whose dialog asked for it; a man's split
   * is a fact about him, so scanning down a column and opening five batters and
   * then the first one again should cost five reads rather than six.
   *
   * The mark comes off on failure so `Try again` is a retry rather than a
   * no-op, the departure from *never mark a request answered before it is
   * answered* that `useOpponentBoards` records: this is a press handler, not an
   * effect with a cleanup that could discard the answer.
   */
  const [splits, setSplits] = useState<Record<number, SplitsRead>>({});
  const splitsAsked = useRef<Set<number>>(new Set());
  const loadSplits = useCallback((id: number) => {
    if (splitsAsked.current.has(id)) return;
    splitsAsked.current.add(id);
    setSplits((p) => ({ ...p, [id]: { loading: true } }));
    api
      .splits(id)
      .then((d) => setSplits((p) => ({ ...p, [id]: { splits: { vsLeft: d.vsLeft, vsRight: d.vsRight } } })))
      .catch(() => {
        splitsAsked.current.delete(id);
        setSplits((p) => ({ ...p, [id]: { error: true } }));
      });
  }, []);
  /**
   * **The press.** The read the dialog will want is started here rather than
   * inside it, which is what the Schedule row and the summary table both do:
   * the dialog draws the three loading states, and starting the read on the
   * press is what makes them short.
   *
   * A row with no club is not a fixture at all — the leaderboard files a
   * handful of men under no team — and it opens nothing rather than opening a
   * box that would have to say so.
   */
  const openFixtureIn = useCallback(
    (row: ResearchRow, game: ScheduleGame, index: ScheduleIndex) => {
      if (row.teamId === null) return;
      if (row.kind === 'pitcher') {
        const oppId = game.homeId === row.teamId ? game.awayId : game.homeId;
        if (oppId) loadOpponent(oppId);
      } else {
        loadSplits(row.id);
      }
      setFixture({ row, game, index });
    },
    [loadOpponent, loadSplits],
  );
  /** The grid's door — the span index, which is the one its cells are drawn
   *  from. Null while the mode is off, which is what leaves those cells plain
   *  text; there are none to press then anyway. */
  const openFixture = useMemo(
    () =>
      schedule
        ? (row: ResearchRow, game: ScheduleGame) => openFixtureIn(row, game, schedule)
        : undefined,
    [openFixtureIn, schedule],
  );
  /* His hand, for the accented row of the lineup a pitcher's dialog draws. The
     board's rows already read this map for the `L/R` under a name, so the
     dialog is asking the app what it has rather than fetching anything. */
  const openHand = useHandedness(fixture?.row.id ?? 0);
  // **The list is the order**, which it was not until the columns became
  // reorderable: the keys used to be read into a `Set` and the table rendered
  // `allColumns.filter(...)`, so the arrangement was always the board's own
  // however the keys arrived. Now the arrangement is the reader's, and the
  // array is what carries it — through the URL, through the saved preference,
  // and into the header row below. The set is kept beside it for the half-dozen
  // membership tests that don't care about order (the picker's ticks, the
  // sort's "is this column still shown").
  /**
   * **Which columns are shown and in what order** — the reader's own list, or
   * this reading's defaults.
   *
   * **Two lists, one per reading**, and they are kept apart for the reason the
   * player page's Stats tab keeps its own: the lens draws a strict subset of
   * this board's vocabulary, so one shared entry would let a write from its
   * picker drop every Statcast and roster-% column from the measured board's.
   * A saved list is narrowed to the vocabulary it is being read against
   * (`toProjectedColumnKeys`), so a list stored under an older build — or one
   * that has lost the opponent column because the span stopped being a single
   * day — comes back as the columns that still exist rather than as gaps.
   */
  const orderedKeys = useMemo(() => {
    if (projectedOn) {
      const one = projection.oneDay;
      return toProjectedColumnKeys(kind, one, projColumnKeys) ?? projectedColumnKeys(kind, one);
    }
    return columnKeys ?? defaultColumnKeys(kind);
  }, [projectedOn, projection, projColumnKeys, columnKeys, kind]);
  /**
   * **What the table draws** — the reader's stat columns, or the days ahead.
   *
   * The swap is here and nowhere else, which is the whole of the Schedule
   * view's cost on this board: everything downstream reads `columns` and
   * `visible`, so the sort, the count line, the pinned headshot and name, the
   * sorted-column double-edge pin, the include buttons, the position pills, the
   * search and the row identity all work untouched.
   *
   * `allColumns` deliberately stays the **stat** vocabulary underneath, because
   * two things still read it and must: the column picker (which is what the
   * reader comes back to) and `columnsByKey`, which is what the stat *filters*
   * are applied through. "A filter on a hidden column still applies" is this
   * board's own rule, and a schedule of `PA ≥ 300` batters is exactly the
   * question a fantasy manager asks of it — so a `PA ≥ 300` chip goes on
   * narrowing the rows while their PA is off screen, precisely as it does when
   * the column is merely unticked.
   */
  /**
   * **The turn filter, where it is in force — and null everywhere else.**
   *
   * One derivation read by all six of its consequences (the column, the row
   * test, the chip, `Clear all`, the empty state and the board signature),
   * because the gate is four conditions deep and a copy of it that fell out of
   * step would be a board narrowed by a control it is not drawing. It was:
   * crossing to the batters left the range in force with the button gone, and
   * the board read `0 of 166 batters` under an empty state blaming a threshold
   * nobody had set.
   *
   * A turn is a fact about a pitcher, so the batting board and the thirty clubs
   * are not narrowed by one; the range itself is kept, so coming back to the
   * pitchers finds the days still picked.
   */
  const activeTurn = useMemo(
    () =>
      turnDays && turnIndex && kind === 'pitcher' && !teams
        ? { days: turnDays, set: new Set(turnDays), index: turnIndex }
        : null,
    [turnDays, turnIndex, kind, teams],
  );

  /**
   * **What a start in the `Start` column opens** — the same pair of doors the
   * roster table's opponent cell has, chosen on the game's own state: a fixture
   * opens the preview (the park, the man the other club is throwing, the lineup
   * waiting for him), and one already under way or finished opens the game's
   * page.
   *
   * It was plain text for one commit, on the argument that the grid's cell is
   * the *fixture* and this one is a caption on a start. That is a distinction
   * without a difference to a reader: it names a club on a day, which is the
   * one thing this app has made pressable wherever it appears — and a filter
   * that puts forty starts on screen and lets none of them be opened is the
   * board's own `vs MIL` fault, which this file records under the Schedule
   * view, made twice.
   *
   * Off the **whole-window** index rather than the span's, so a start four
   * weeks out opens exactly as tonight's does.
   */
  const turnDoors = useMemo(
    () =>
      activeTurn
        ? {
            preview: (row: ResearchRow, game: ScheduleGame) =>
              openFixtureIn(row, game, activeTurn.index),
            game: openGame ?? undefined,
          }
        : undefined,
    [activeTurn, openFixtureIn, openGame],
  );

  const columns = useMemo(() => {
    if (schedule) return scheduleColumns(schedule, kind, teams, teams ? undefined : openFixture);
    /**
     * **The lens swaps the vocabulary as well as the figures**, which is the
     * Schedule view's own move one line up applied to a different question.
     *
     * A projection can answer for a count and for a rate built out of counts,
     * and for nothing else: xwOBA, exit velocity, barrels, the batted-ball
     * split, chase rate, bat speed and roster % are readings of contact and of
     * a fantasy league, not of a week that has not happened. Left in, two
     * thirds of the columns on the app's widest table would draw em dashes,
     * which reads as a broken board rather than an honest one. So the lens
     * draws its own list — see `projectedColumns`, which pulls every definition
     * out of this board's own arrays by key so no formatter is restated.
     *
     * **The turn filter's `Start` column still leads them**, below: it is why
     * those rows are on screen, and *who starts Friday, and what is he worth*
     * is precisely the pair the two controls answer together — the same reason
     * `Starting` stays on the bar in schedule mode where Columns and Ranks go.
     */
    const byKey = new Map(vocabulary.map((c) => [c.key, c]));
    // `filter(Boolean)` rather than a fallback: a key with no column on this
    // board is one the board doesn't have — Ros% without a league, a trend
    // window with no baseline — and dropping it is what those two rules
    // already do. A saved list keeps the key, so connecting a league puts the
    // column back where the reader had it.
    // **One line for both readings now.** The lens used to draw its whole
    // vocabulary outright, which made it the one table in the app whose columns
    // were not the reader's to choose; it has a saved list of its own, so this
    // is the same `map` over the same kind of list, and what differs is only
    // which vocabulary `byKey` was built from.
    const stats = orderedKeys.map((k) => byKey.get(k)).filter((c): c is Column => c !== undefined);
    /**
     * **The `Start` column leads them while the turn filter is on**, and it is
     * the filter's own rather than a member of the vocabulary: it is not in
     * `allColumns`, the picker never lists it and no threshold can be typed
     * against it.
     *
     * A filtered row has to say *why it is on screen* — the argument the
     * position cell already makes on this board — and `Starting Fri – Sun`
     * narrows six hundred pitchers to forty while saying nothing about which of
     * the three days any of them goes on, which is the half of the answer the
     * reader is choosing between. It leads because it is the reason the row is
     * there.
     *
     * Not in schedule mode, where the day columns already *are* this fact,
     * drawn fourteen wide.
     */
    return activeTurn
      ? [turnColumn(activeTurn.index, activeTurn.set, turnDoors), ...stats]
      : stats;
  }, [
    vocabulary,
    orderedKeys,
    schedule,
    kind,
    teams,
    openFixture,
    activeTurn,
    turnDoors,
  ]);
  /**
   * Which keys the sort's fallback will accept. Out of schedule mode that is
   * the columns on screen: hiding the one you were sorting on has to fall the
   * order back, there being no header left to click.
   *
   * **In schedule mode it is those days *plus* the stat vocabulary**, and the
   * union is the whole of "the mode leaves your sort alone". Swapping the
   * columns is not the reader unticking one — it is a second reading of the
   * same rows in the same order, and a board sorted by HR should become a
   * schedule of the home-run leaders rather than a schedule of whoever plays
   * most. The comparator already resolves a key that is not drawn
   * (`columnsByKey`, the same fallback a filter on a hidden column takes), so
   * nothing else had to be told; and the way back to the column is one press
   * of the lit toggle, which is exactly what the trap the fallback guards
   * against has not got.
   */
  const visibleKeys = useMemo(
    () =>
      new Set(
        // **The lens takes the same union schedule mode does, and for the same
        // reason.** Swapping the columns is not the reader unticking one — it
        // is a second reading of the same rows in the same order — so a board
        // sorted by `HR` becomes a *projected* home-run leaderboard rather than
        // falling back to the default, and the way back to the measured column
        // is one press of the lit toggle. The comparator already resolves a key
        // that is not drawn (`columnsByKey`), so nothing else had to be told.
        schedule || projectedOn
          ? [...columns.map((c) => c.key), ...orderedKeys]
          : // **And `Start` is sortable while it is drawn**, which it has to be
            // said explicitly for: this set is the reader's *saved list*, and the
            // turn filter's column is in no list and no vocabulary. Left out, a
            // press on its header set a `sortKey` this test rejected and the
            // order fell straight back to the board's default — a header that
            // lit nothing, which is the one thing a sort control must not be.
            // Ordering by it is what the column is for: soonest turn first.
            activeTurn
            ? [TURN_KEY, ...orderedKeys]
            : orderedKeys,
      ),
    [schedule, projectedOn, columns, orderedKeys, activeTurn],
  );
  /** The columns actually on screen, by key. The sort resolves through this
   *  first and `columnsByKey` second: in schedule mode the sorted column is a
   *  day and exists nowhere in the stat vocabulary, and out of it the fallback
   *  is what preserves the old behavior of sorting by a column the reader has
   *  unticked. */
  const drawnByKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);

  // Search and the stat filters each sit behind their own button. The table is
  // the page; on a phone a permanently-open control bar cost it four rows
  // before the first name. Neither can hide state, though — see the `on`
  // classes below and the chips, which stay put whether the panel is or not.
  //
  // Which of them is open lives in App's `ResearchUi` with everything else the
  // board is set to: a panel you left open is part of where you were, and this
  // component is unmounted the moment you look at anything else.
  const {
    search: searchOpen,
    filters: filtersOpen,
    turns: turnsOpen,
    columns: columnsOpen,
    projected: projectedOpen,
    lists: listsOpen,
    searches: searchesOpen,
    pos: posOpen,
    window: windowOpen,
  } = ui.panels;
  /**
   * **The settings dialog, and it is local state where the panels beside it are
   * not.**
   *
   * `ColumnPicker`'s own rule, restated one control along: a dialog is not a
   * panel — it never survives leaving the board, and there is nothing about it
   * worth carrying to the other kind's board. The flags above are places the
   * reader *is*; this is a box that is open, and a reader who comes back to the
   * board wants the board rather than the box they left over it.
   */
  const [settingsOpen, setSettingsOpen] = useState(false);
  /**
   * **The span in force came through the calendar** — it is not one of the
   * named periods, so `Custom` is the door it came through.
   *
   * Computed here rather than inside `projCustomRange` below because two
   * things now need it: which door the panel opens on, and what that door's
   * press means.
   */
  const projCustomInForce =
    projected && !projSpans.some((sp) => sp.start === projSpan.start && sp.end === projSpan.end);
  /**
   * **The panel opens on the door the span in force came through**, which is
   * the whole of what this flag is for and is not what it used to be.
   *
   * `ui.panels.projCustom` is cleared whenever the panel closes (see
   * `setPanel`), and *picking on the calendar closes the panel* — so a reader
   * who picked `Aug 27 – Aug 30` and pressed `Projected` again got the panel
   * back with **nothing in it**: no pill lit, the span being custom and
   * matching none of them, and no calendar, the flag having been cleared by
   * their own press. Three unlit pills, and the one place on the page that
   * could have said which days were being projected said nothing. Reported as
   * exactly that.
   *
   * So the flag is the reader's *question* (`Custom` pressed, nothing picked
   * yet) **or** the reader's *answer* (a custom span is what the board is
   * drawing). Both are states in which the calendar is the thing to show, and
   * in the second it opens marked on the range in force — `projCustomRange`
   * already returns exactly that.
   *
   * The bug the clearing rule was written for is untouched: `Projected →
   * Custom → Filters → Projected` with nothing picked comes back on the pills,
   * because there is no custom span in force to open the door.
   */
  const projCustomOpen = ui.panels.projCustom || projCustomInForce;
  /**
   * **The calendar left the head**, where it was a month of grid in the flow of
   * six rows of chrome.
   *
   * The accordion was written for a head whose every other panel is one, and
   * the measurement behind it was about *width* — a 260px grid marooned at the
   * left edge of a full-width box reads as a control that failed to lay out, so
   * it took the panel's width and was capped at 640. That is a true answer to
   * the wrong question. The rest of this app picks a range in **one** shape: a
   * face that states the days, and the calendar over the page when you press
   * it. A board that opened a month inside its own chrome was the one surface
   * asking the reader to learn a second one, and it spent 346px of head doing
   * it, on a phone, above the table it is chrome for.
   *
   * So `Custom` reveals the app's own field — a calendar glyph, and the days
   * once there are days — and the field opens the calendar over the page. Two
   * presses to a month rather than one, which is the shape the field had before
   * it was retired (`DateRangePicker.tsx`'s own note on `.drp-field`).
   *
   * **A `Modal` rather than a popover hung off the field**, which is the one
   * thing here that is not the date bar's shape, and it is this head that
   * decides it. `.research-head` clips on both axes and **has to**: it is a
   * sticky box in a pane that scrolls sideways, and `overflow: hidden` is what
   * makes it a scroller that never scrolls, which is what gives its
   * `overscroll-behavior-x` something to hold. Relaxed to `overflow-x: clip` so
   * a popover could hang out of it, the paint was right and a wheel or a finger
   * anywhere in those six rows chained straight through and **scrolled the
   * table sideways under the reader** — reported, and reverted. The other half
   * is width: the field rides after a run of pills, so with nothing picked it
   * sits 246px along a 346px row and a 260px calendar ran 138px off a phone.
   * `ColumnPicker` is the same call made one control earlier and says it in the
   * same words — *a modal, where Search and Filters beside it are inline
   * panels*. A box this chrome has no room for leaves the row.
   *
   * **Local state rather than `ResearchUi.panels`.** A dialog is not a panel:
   * it never survives leaving the board and there is nothing about it worth
   * carrying to the other kind's board. The three flags beside it are places
   * the reader *is*; this is a box that is open.
   */
  const [calPressed, setCalPressed] = useState(false);
  /** **A door that is closed has no calendar open behind it**, which is read off
   *  the two rather than remembered: `Custom` can stop being the door under the
   *  reader — a named pill pressed, the lens cleared — and a dialog left open
   *  over a button that is no longer drawn is a box with no opener. */
  const projCalOpen = projCustomOpen && calPressed;
  /**
   * **What the `Custom` calendar opens marked on** — the reader's own range
   * where they have picked one, and **nothing at all** where they have not.
   *
   * A reader pressing `Custom` off `Week 20` is saying the period's fortnight
   * is *not* what they want, so a grid marking those fourteen days would mark a
   * range they have just rejected and make picking a single day two presses of
   * un-marking. **It marked today instead, and that was the same fault one day
   * wide**: today is not a choice the reader made either, and a filled cell
   * under it is the calendar claiming a selection where the honest state is
   * that there is none. So the selection is `null` and the grid opens with no
   * day marked — see `DateCalendar`'s own `start`.
   *
   * The month is still today's (`month={today}`), which is a different claim
   * and a true one: it is where the reader's attention is and the day every
   * projection starts from. `today` is App's, threaded down with the spans
   * rather than derived here — this app has one clock (see App's own `today`,
   * lifted out of five memos for exactly this reason) and a board that asked
   * the browser again would be a second answer to *which day is it* across a
   * 3am rollover.
   */
  const projCustomRange = useMemo(
    () => (projCustomInForce ? projSpan : null),
    [projCustomInForce, projSpan],
  );

  /** Whether the day strip is on screen — the panel's flag *and* a board a turn
   *  is a fact about. It is one flag for the whole board (`ResearchUi.panels`),
   *  so left open and carried to the batters it would go on counting a strip
   *  nobody is drawing: 166 rows walked for a `Map` nothing reads. */
  const turnStripOpen = turnsOpen && kind === 'pitcher' && !teams;
  /**
   * **One panel at a time**, which the bar's disclosures were not.
   *
   * Each of them set only its own flag, so Search, Filters, the day strip and
   * the lens's span picker could all be open at once — and every one of them
   * opens **into the head**, so the reader who pressed `Projected`, thought
   * better of it and pressed `Filters` got the filter row *under* a month of
   * calendar he had not dismissed, with the table three hundred pixels further
   * down than he left it. Reported as exactly that.
   *
   * They are mutually exclusive now: opening one closes the rest. That is what
   * a reader means by pressing a second button — the first question is
   * abandoned, not stacked — and it is the rule the app's own dialog layer
   * already keeps one tier up, where a popup dismisses on a press outside it.
   *
   * **`projCustom` is not a panel and is not in the run.** It is a *state of*
   * the span picker — which of that panel's three doors is open — so it clears
   * when its own panel closes and is otherwise left alone. Passing it here at
   * all would have `Custom` closing `Projected`, which is the panel it lives
   * inside.
   */
  /**
   * **Opening a panel from inside the settings dialog shuts the dialog.**
   *
   * The dialog holds every control the bar no longer does, and seven of them
   * answer with a panel of their own — Filters, Starting, the two saved-thing
   * boxes, the lens's span picker, Columns. Those panels open into
   * `.research-head`, which is *behind* this dialog: left up, the box would be
   * covering the answer to the press the reader has just made. So a press that
   * opens something closes the box it was made in, which is the same thing the
   * exclusivity one level down already does between panels — the first question
   * is abandoned, not stacked.
   *
   * **Only where it is opening.** A press that turns a panel *off* is a reader
   * changing their mind inside the box, and shutting it under them would spend
   * a gesture they did not make.
   */
  const openPanel = (which: keyof ResearchUi['panels'], on: boolean) => {
    setPanel(which, on);
    if (on) setSettingsOpen(false);
  };

  const setPanel = (which: keyof ResearchUi['panels'], on: boolean) =>
    onUiChange((u) => {
      if (which === 'projCustom') return { ...u, panels: { ...u.panels, projCustom: on } };
      const shut = {
        search: false,
        filters: false,
        turns: false,
        columns: false,
        projected: false,
        lists: false,
        searches: false,
        pos: false,
        window: false,
      };
      const panels = { ...u.panels, ...(on ? shut : {}), [which]: on };
      // **The span picker's own door goes wherever its panel goes**, and that
      // is tested on the *result* rather than on which button was pressed —
      // which is the bug this replaced. Clearing it in the `projected` branch
      // alone left it set when the panel was shut by the exclusivity above, so
      // `Projected → Custom → Filters → Projected` came back on a calendar the
      // reader had last seen three presses earlier, at 383px of head.
      return { ...u, panels: { ...panels, projCustom: panels.projected && panels.projCustom } };
    });

  /**
   * The search, the sort and the filters, **kept per board**.
   *
   * The two boards have to keep their own: a batter's `PA ≥ 300` is not a
   * condition the pitching board can even express, and each opens on its own
   * sort. But they must also *survive* the trip to the other board and back —
   * a look at the RP list should not cost you the four filters you built on the
   * batters, which is exactly what it cost when App remounted this component on
   * every crossing (`key={researchKind}`) and the state went with it.
   *
   * Both at once means one record with a slot per kind. It is stored in App
   * (`ResearchUi`) for the reason the whole of that object is: the crossing
   * this record survives is only the one between the two boards, and the
   * bigger one — to the Roster tab and back — unmounts the component holding
   * it. Every rule about the record is still written here; App only keeps it.
   */
  const boards = ui.boards;
  /** **The team reading keeps its own**, on the very argument this file already
   *  makes for the two kinds keeping theirs: "a batter's `PA ≥ 300` is not a
   *  condition the pitching board can even express". A club's is not either —
   *  every one of the thirty has 4,800 of them — and a sort on `Ros%` names a
   *  column the reading has not got. So four slots rather than two, and
   *  crossing to the clubs and back leaves the four filters you built on the
   *  batters exactly where they were. */
  const boardStateKey = boardStateFor(kind, teams);
  const board = boards[boardStateKey];
  /** Change the board on screen, leaving the other one alone. */
  const patchBoard = (next: Partial<BoardState> | ((b: BoardState) => Partial<BoardState>)) =>
    onUiChange((u) => ({
      ...u,
      boards: {
        ...u.boards,
        [boardStateKey]: {
          ...u.boards[boardStateKey],
          ...(typeof next === 'function' ? next(u.boards[boardStateKey]) : next),
        },
      },
    }));

  const { search, sortKey, sortAsc, filters } = board;
  const setSearch = (v: string) => patchBoard({ search: v });
  const setSortKey = (v: string) => patchBoard({ sortKey: v });
  const setSortAsc = (v: boolean | ((prev: boolean) => boolean)) =>
    patchBoard((b) => ({ sortAsc: typeof v === 'function' ? v(b.sortAsc) : v }));
  const setFilters = (v: StatFilter[] | ((prev: StatFilter[]) => StatFilter[])) =>
    patchBoard((b) => ({ filters: typeof v === 'function' ? v(b.filters) : v }));

  // The half-built condition in the add-filter row, kept out of `filters` until
  // it has a number in it — a blank threshold would filter everyone out. Not
  // per board, because it is a keystroke rather than a setting.
  //
  // **Null until the user picks one**, rather than seeded with a key at mount.
  // Two things follow, and the first is the bug the second was hiding: the
  // board's first column is `Ros%` when a fantasy league is connected, but
  // `hasRosterPct` is false on the first render — the ESPN status is still in
  // flight — so a seeded default captured `G` and stayed there for the session,
  // with Ros% sitting at the head of the very list the select was ignoring.
  // Reading `allColumns[0]` live opens the builder on Ros% for anyone with a
  // league, and on `G` for anyone without. It also covers the other case for
  // free: a column the *other* board doesn't have is not a value this select
  // can show, so crossing falls back rather than leaving it on a dead option.
  const { column: draftColumnRaw, op: draftOp, value: draftValue } = ui.draft;
  // …and it has to be a column a threshold can be typed against: the board's
  // first is now `Opp` for a user with no fantasy league, which holds words.
  const filterableColumns = useMemo(() => allColumns.filter((c) => !c.text), [allColumns]);
  const draftColumn =
    draftColumnRaw && filterableColumns.some((c) => c.key === draftColumnRaw)
      ? draftColumnRaw
      : filterableColumns[0].key;
  const patchDraft = (next: Partial<ResearchUi['draft']>) =>
    onUiChange((u) => ({ ...u, draft: { ...u.draft, ...next } }));
  const setDraftColumn = (v: string) => patchDraft({ column: v });
  const setDraftOp = (v: Op) => patchDraft({ op: v });
  const setDraftValue = (v: string) => patchDraft({ value: v });

  // Everyone this board can show, before any pill or filter. Each MLB
  // leaderboard arrives carrying the other trade's players — pitchers who took
  // a plate appearance, position players who mopped up an eleven-run loss — and
  // both are dropped here rather than per pill, which is what makes the count
  // line's "of N" a number some pill can actually reach.
  /**
   * Trade first, then who is on the board. What survives is the *population*
   * the count line is measured against, so that "12 of 12" on your own roster
   * is honest about the board it describes rather than quoting the league's 624.
   *
   * **Two axes, and they compose in opposite directions.** The three include
   * sets partition *ownership* — read in one pass, and the order of the tests
   * is what makes them disjoint: your roster wins first, so a player you hold
   * who ESPN says is on a leaguemate's team (possible in saved-roster mode,
   * where the two lists are unrelated) is counted once, as yours. Free agency
   * is then the complement of ownership — a player nobody in the league holds
   * is one you could add — and with **no** league connected there is no
   * ownership to read, so the third set quietly becomes "everyone off your
   * roster", which is what its own label says there.
   *
   * The **watchlist is unioned on top of all of that**, and is tested first
   * because a union short-circuits: a watched player is on the board whoever
   * owns him. That is the useful operation and the intersection was the
   * surprising one — the star is a fact about *you*, not about ownership, so
   * "my roster and the men I'm watching" is a question someone actually asks
   * and "watched free agents only" is a slice nobody wants. It costs the count
   * line nothing: this is still one `filter` over one array, so a player who is
   * both watched and free appears once and is counted once.
   *
   * With a league connected but the read still in flight, everything but your
   * own roster and your watchlist falls out rather than falling *in*: an empty
   * table under "Reading your league…" is honest, where the whole league
   * labeled free agents is not. The watchlist is exempt from that wait for the
   * same reason it is unioned — it needs no ownership to be known.
   */
  /** The board's own population — everyone of this trade on this window's
   *  leaderboard, before any pill or button. It is what `boardRows` narrows,
   *  and it is what the percentile badges are ranked within; see
   *  `boardPopulation` and `columnRanks.tsx`. */
  /** …and on the team reading, the thirty clubs as they arrive. `boardPopulation`
   *  cuts a leaderboard to its own trade by reading `positionType`, which a club
   *  has not got — the pitching board would come back empty. The server already
   *  answers with exactly the thirty rows the kind asks for, so there is nothing
   *  left to cut. */
  const population = useMemo(
    () => (teams ? rows : boardPopulation(rows, kind)),
    [rows, kind, teams],
  );
  /** Whether the board is narrowed to a named set. Never on the team reading —
   *  a comparison is of players, and this board's rows are clubs. */
  const comparing = !teams && compareKeys.length > 0;
  /**
   * **Whether the table draws its checkbox column** — compare mode, and not the
   * team reading, where the control that turns it on is not drawn either. It is
   * one const rather than the same test written three times (the `th`, the
   * `td`, and the pin measurement below), because a header cell and a body cell
   * that can disagree about whether they exist is a table with a column of
   * nothing in it.
   */
  const compareCol = compareOn && !teams;
  const boardRows = useMemo(() => {
    // **Nothing partitions thirty clubs.** The three include buttons are a
    // partition of *ownership* and the watchlist is a list of players; neither
    // has anything to say about the Brewers, and both are off screen on this
    // reading (see `controls`). Every club is on the board, which is why the
    // count line reads `30 of 30` until a filter or the search narrows it.
    if (teams) return population;
    // **A comparison overrides the ownership sets, and that is the point.** The
    // reader has named the players; a Free-Agents-only board that then dropped
    // two of the three men they picked would be a control quietly overruling a
    // more specific instruction. So this narrowing is applied *instead of* the
    // include filter rather than after it — the board is those players, full
    // stop, which is what `Compare` says it does.
    if (comparing) {
      const wanted = new Set(compareKeys);
      return population.filter((r) => wanted.has(`${r.kind}-${r.id}`));
    }
    const byTrade = population;
    return byTrade.filter((r) => {
      const key = `${r.kind}-${r.id}`;
      if (includeWatchlist && watchlistKeys.has(key)) return true;
      if (rosterKeys.has(key)) return include.mine;
      if (!espnConnected) return include.fa;
      if (!ownedIds) return false;
      return ownedIds.has(r.id) ? include.others : include.fa;
    });
  }, [
    teams,
    population,
    comparing,
    compareKeys,
    include,
    includeWatchlist,
    rosterKeys,
    watchlistKeys,
    ownedIds,
    espnConnected,
  ]);

  /**
   * One yardstick per rankable column, over that population.
   *
   * Memoised on the population and the visible columns alone — **not** on the
   * pills, the search, the filters or the sort, which is the whole point of the
   * population being the board rather than what the reader has narrowed it to:
   * a badge must not change because somebody typed a letter. Null when the
   * toggle is off, so the pass costs nothing at all to anyone not reading them.
   */
  // Null in schedule mode whatever the toggle says, and the toggle is not drawn
  // there either: a percentile under `@ LAD` is nothing, and a games-in-the-span
  // count ranked against the league would be a percentile of a *fixture list*
  // — the same reason the Fantasy group is on `NO_GOOD_END`, a step further.
  // **And null under the projected lens, whose toggle is off the bar there
  // too.** A percentile is a standing among the *qualified* players on a
  // measured board — Savant's own bar, read off `ResearchRow.qualified` — and a
  // projection has no such population: nobody qualifies for a week nobody has
  // played, and ranking an estimate against a field of estimates would put a
  // solid badge under a number this app's own rule says must never wear a
  // measurement's clothes. (The `columnRanks.tsx` note that "neither surface
  // that draws a `.col-rank` percentile has a projected reading" is what this
  // answers: one of them does now, and it answers by not drawing them.)
  const ranks = useMemo(
    () => (showRanks && !schedule && !projectedOn ? rankScales(columns, population) : null),
    [showRanks, columns, population, schedule, projectedOn],
  );

  /**
   * **The comparison's own scales, and they are the *same* scales the badges
   * use.**
   *
   * A comparison has to say *how much better*, and the honest measure of that
   * is not the gap between the two men — two hitters on .252 and .251 are a
   * range apart and level in every way that matters. It is the gap **by the
   * league's own standards**, which is exactly what a percentile is: `of()`
   * returns 0–100 with **100 at the good end**, direction already resolved off
   * `ascFirst`, ranked within the qualified population.
   *
   * So one point of batting average is about two points of percentile and
   * draws almost nothing; sixty points is seventy and saturates. And because
   * this is the very scale `RankBadge` draws, the tint and the badge can never
   * disagree about which end of a column is the good one.
   *
   * Computed off `population` — the whole board — and **not** off the narrowed
   * rows, which is the same care `ranks` takes one line up: the yardstick must
   * not change because the reader picked three men. Only built while comparing,
   * so an ordinary board pays nothing.
   */
  const compareScales = useMemo(
    () => (comparing && !schedule && !projectedOn ? (ranks ?? rankScales(columns, population)) : null),
    [comparing, ranks, columns, population, schedule, projectedOn],
  );

  /**
   * **What the group is being measured against: its own mean percentile, per
   * column.**
   *
   * The midpoint is the compared players' own average rather than the league's
   * 50th, because the question on this board is *which of these* — three men
   * who are all excellent should not all read as hot, and three who are all
   * poor should not all read as cold. Their mean is the line, and the tint is
   * how far each sits from it.
   *
   * A column where fewer than two of them have a value has no comparison to
   * draw and is left out entirely.
   */
  const compareMids = useMemo(() => {
    if (!compareScales) return null;
    const mids = new Map<string, number>();
    for (const col of columns) {
      const scale = compareScales.get(col.key);
      if (!scale) continue;
      let sum = 0;
      let n = 0;
      for (const r of boardRows) {
        const pct = scale.of(col.value(r));
        if (pct !== null) {
          sum += pct;
          n += 1;
        }
      }
      if (n >= 2) mids.set(col.key, sum / n);
    }
    return mids;
  }, [compareScales, columns, boardRows]);

  /**
   * The tint on one cell — `ParkFactors`' own, which is where this pattern in
   * this app lives: `--park-hot` above the line, `--park-cold` below, mixed
   * into the cell's ground in proportion to the distance and capped at
   * `MAX_TINT`. That cap is imported rather than repeated: it is a **measured**
   * number (the worst contrast across the six themes at four caps), and a
   * second copy of it is a second thing to re-measure when a palette moves.
   *
   * **A level column is left alone**, which is this app's rule that a mark on
   * every row marks nothing: three men within a percentile point of each other
   * are not distinguishable and three pale tints would claim they are.
   */
  /**
   * **Why a cell is lit, in words** — because a color cannot say it, and this
   * app's rule is that identity never rests on hue. It states the percentile
   * and the group's line, which between them are the whole of the claim the
   * tint makes.
   */
  const compareTitle = (col: Column, row: ResearchRow): string | undefined => {
    const mid = compareMids?.get(col.key);
    const scale = compareScales?.get(col.key);
    if (mid === undefined || !scale) return undefined;
    const pct = scale.of(col.value(row));
    if (pct === null) return undefined;
    const off = Math.round(pct - mid);
    // `ordinal`, not a hardcoded `th`: the tooltip reads a percentile back as a
    // sentence, and `3th`/`22th`/`43th` is the first thing a reader sees in it.
    const where = `${row.name} — ${col.title}: ${ordinal(pct)} percentile of ${rankPopulationLabel}`;
    if (Math.abs(off) < 1) return `${where}, level with the others compared.`;
    return `${where}, ${Math.abs(off)} percentile points ${
      off > 0 ? 'above' : 'below'
    } the average of the players compared.`;
  };

  const compareTint = (col: Column, row: ResearchRow): CSSProperties | undefined => {
    const mid = compareMids?.get(col.key);
    const scale = compareScales?.get(col.key);
    if (mid === undefined || !scale) return undefined;
    const pct = scale.of(col.value(row));
    if (pct === null) return undefined;
    const off = pct - mid;
    if (Math.abs(off) < 1) return undefined;
    const frac = Math.min(1, Math.abs(off) / 50);
    const hue = off > 0 ? 'var(--park-hot)' : 'var(--park-cold)';
    // A plain `background`, because it lands on a **badge** rather than on the
    // cell — see `.research-cmp-badge`. Tinting the cell meant layering over a
    // ground that is *named* (`--cell-bg`) and carries the zebra, which took a
    // gradient and a qualified selector to do without stripping it; a badge has
    // no such ground and takes the color directly, the way the park strip's
    // own figures do.
    return {
      background: `color-mix(in srgb, ${hue} ${Math.round(frac * MAX_TINT)}%, transparent)`,
    };
  };
  /** What a badge says it is ranked against — the board and the span, in
   *  words, since a 7-day percentile and a season one are different claims. */
  const rankPopulationLabel = `the ${windowLabel(statWindow)} board`;
  /** What the population is called on this reading — thirty clubs, not six
   *  hundred batters. See `columnRanks.tsx` for why the same module answers
   *  both: it is handed a population and asked for a scale, and a club row's
   *  `qualified` is false throughout, which is what routes it down the path
   *  that ranks against the field and draws no ring. */
  const rankNoun = teams ? 'clubs' : undefined;
  /** How many of the board clear Savant's bar for this span — the scale's own
   *  size, named wherever the population is. Counted through `rankPopulation`
   *  so it cannot come to disagree with the set the scale is built from. */
  const qualifiedCount = useMemo(() => rankPopulation(population).length, [population]);

  /**
   * What the search box matches each row against, **folded once per row rather
   * than once per keystroke**: this is the whole league (~1,400 rows) and the
   * filter re-runs on every letter typed, where the rows themselves arrive once
   * per board and are then kept for the life of the tab. Keyed on the row
   * object, so the include buttons rebuilding `boardRows` — which returns the
   * same objects through a `filter` — costs nothing.
   *
   * Name and club are joined by a **space**, which `searchFold` can never leave
   * in a query: it is therefore a separator no typed string can straddle, so
   * `garcialad` cannot match García of the Dodgers while both halves stay in one
   * string and one `includes`.
   */
  const searchText = useMemo(() => {
    const m = new Map<ResearchRow, string>();
    for (const r of rows) m.set(r, `${searchFold(r.name)} ${searchFold(r.team)}`);
    return m;
  }, [rows]);

  /** How many of the watchlist are on *this* board — the count on the Watchlist
   *  button, and what its empty state tests. A key carries its own kind, so
   *  this needs no lookup against the rows. */
  const watchlistCount = useMemo(
    () => [...watchlistKeys].filter((k) => k.startsWith(`${kind}-`)).length,
    [watchlistKeys, kind],
  );
  /** No ownership set is on. On its own that is no longer an empty board — the
   *  watchlist can carry one by itself, which is a state someone genuinely
   *  wants ("just the men I'm following") and the reason the two flags below
   *  are separate. */
  const noOwnershipSets = !include.mine && !include.others && !include.fa;
  /** Nothing on either axis: the one combination that can put nobody on the
   *  board however the league read goes. */
  const nothingIncluded = noOwnershipSets && !includeWatchlist;
  /** The board is the watchlist and nothing else — the state whose empty case
   *  is about the star rather than about any of the three buttons. */
  const watchlistAlone = noOwnershipSets && includeWatchlist;

  // Hiding the column you were sorting on leaves the table ordered by something
  // you can neither see nor reverse — there is no header left to click. So the
  // sort falls back to the board's default, which is always a shown column.
  /**
   * What the board sorts by before anyone touches a header — and what it falls
   * back to when the sorted column is switched off, since a table ordered by
   * something you can neither see nor reverse is a trap.
   *
   * **Ros% when a fantasy league is connected**: it is the board's first column
   * there and the one a fantasy manager is reading the league *by*, so the most
   * widely rostered players lead. Without a league that column does not exist
   * and the answer is the board's own counting stat — PA for batters, IP for
   * pitchers, which lands you on names worth reading rather than the alphabet.
   *
   * Computed here rather than stored on the board, because `hasRosterPct` is
   * false on the first render (the ESPN status is in flight) and anything
   * seeded at mount would keep the answer from before the league arrived.
   */
  // Visible, not merely present: hiding the Ros% column must not leave the
  // board ordered by it, which is the same trap the fallback exists for.
  //
  // **Schedule mode has no default of its own**, and used to open on games in
  // the span. That is a fair reading of what the view is opened with and it
  // reordered a table the reader had already ordered: a board sorted by HR
  // came back sorted by G, which is a change nobody asked the toggle for. The
  // mode swaps the *columns* and nothing else, so the default here is the
  // board's whichever reading is on screen.
  //
  // **`columnsByKey` and not `hasRosterPct`**, and the difference is the team
  // reading. That flag says a league is connected; this asks whether the column
  // is in *this reading's vocabulary at all*, which it is not for a club — and
  // `visibleKeys` cannot answer it, being the reader's saved list, which keeps
  // the key exactly as it keeps it with no league. Left on the flag, a
  // connected reader's team board opened sorted by a column no row has, which
  // is an order that is neither the default nor anything he can see: measured,
  // the thirty came out in the server's own order with no header lit.
  //
  // **The team reading opens on the club's name**, which is the one board where
  // the alphabet is a reading rather than the absence of one. Thirty clubs is a
  // list you look *things up* in — the reader has a club in mind and wants the
  // row — where six hundred players is a leaderboard you scan, which is what
  // `DEFAULT_SORT`'s own comment means by "names worth reading rather than the
  // alphabet". And it is the fix for a live case of the fault the paragraph
  // above records: `Ros%` is not in a club's vocabulary, so the team board fell
  // to `PA` — which a reader who has unticked PA does not have on the table.
  // Measured before this line, at 1200 with a connected league: **no header lit
  // anywhere in the 28-column header row**, no cell carrying `research-sorted`,
  // and the thirty in an order (Cubs, Pirates, Nationals, Brewers, …) that
  // nothing on screen accounts for. The name column is on every team board by
  // construction and cannot be unticked, so the order is legible from the
  // column it is drawn from.
  const defaultSortKey = teams
    ? NAME_KEY
    : columnsByKey.has('rosterPct') && visibleKeys.has('rosterPct')
      ? 'rosterPct'
      : DEFAULT_SORT[kind];
  /** Whether the name column is a sort control on this reading — see the header
   *  cell, which draws `Team` as a button and `Player` as a word. */
  const nameSortable = teams;
  const sortableKey = (k: string) => visibleKeys.has(k) || (nameSortable && k === NAME_KEY);
  const onDefaultSort = !(sortKey && sortableKey(sortKey));
  const activeSortKey = onDefaultSort ? defaultSortKey : (sortKey as string);
  /**
   * **The direction, resolved the same way the key above is.** `sortAsc` is the
   * direction the reader last *pressed*, and while the board is on its default
   * there has been no press — so the answer is the default column's own
   * `ascFirst`, which is already the field that decides which way a header
   * opens and which end a rank counts from.
   *
   * It was the stored `sortAsc` outright, which reads `false` on a fresh board
   * and was right for as long as every possible default (`Ros%`, `PA`, `IP`)
   * opened descending. A name does not: left on the stored flag the team board
   * opened at Washington and ended at Arizona.
   */
  const defaultSortColumn =
    defaultSortKey === NAME_KEY ? NAME_COLUMN : columnsByKey.get(defaultSortKey);
  const activeSortAsc = onDefaultSort ? (defaultSortColumn?.ascFirst ?? false) : sortAsc;

  // Memoised on the pill alone: a fresh closure every render would break the
  // `visible` memo below, which lists this among its dependencies.
  // …and nothing at all on the team reading, where the pills are a
  // Hitting/Pitching switch and select no subset of the thirty.
  const posMatch = useMemo(() => (teams ? undefined : positionMatcher(pos)), [pos, teams]);
  /** The codes the active pill selects on, so the Pos cell can lead with them —
   *  see `posCellText`. Undefined on the two whole-board pills alone. */
  const posCodes = POSITION_BY_KEY.get(pos)?.codes;

  // Keep the selected pill on screen. The row scrolls sideways and holds eleven
  // of them, so on a phone the one you're on is often past the right edge —
  // and a selector whose selection you can't see is worse than no selector.
  // Scrolled by hand rather than with scrollIntoView, which walks up to every
  // scrollable ancestor and would drag the table (and the page) with it.
  /**
   * The sorted column follows you along the table: it sits where it belongs
   * until it would scroll off an edge, then pins to that edge — left if you
   * have scrolled past it, right if you haven't reached it yet. That is one
   * `position: sticky` with **both** `left` and `right` set; the browser picks
   * the edge, so there is no scroll listener and nothing to keep in sync.
   *
   * The `left` offset can't be a calc the way the name column's own is (the
   * headshot plus its two gutters, off `--row-photo` and `--research-gutter`).
   * It has to clear whatever is already pinned there, and the name column is
   * fluid — it absorbs the table's slack — so the width is measured and handed
   * to CSS as `--research-pin-left`. Below 820px the name isn't sticky at all
   * and only the headshot has to be cleared, which the same measurement gives
   * for free by reading whichever cell is actually pinned.
   */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /**
   * **The head's height, measured, because there is no one number.** The column
   * headings stick directly under it (`--pane-bar-h` in the stylesheet), so the
   * offset they are held at *is* this box's height — and this box is a count
   * line with whatever the reader has opened above it: a chips row that comes
   * and goes with the filters, and either of the two panels, which are two
   * different heights and each a different one again on a phone. A constant
   * would be a
   * band of rows showing through the gap on every width but the one it was
   * written at, which is the fault `--chrome-h` and `--date-bar-h` already
   * record. Published on the root, floored, by the same hook they use.
   */
  const headRef = useRef<HTMLDivElement | null>(null);
  usePublishedHeight(headRef, '--research-head-h');
  /**
   * **Whether the bar has reached its third row**, which is what swaps the
   * control set for the condensed run.
   *
   * A sentinel rather than a scroll listener on the pane: the question is "has
   * this line reached the top", and an `IntersectionObserver` answers it off
   * the compositor instead of on every scroll event. The root is the scroller,
   * not the window — this pane is the only thing on this view that scrolls.
   *
   * **The line it is read off is the third row's, not the head's**, and the
   * difference is 50px of table. Read off the head, the run arrived once the
   * whole bar had already gone: the run's 52px and the head's own line landed
   * together on rows that nothing had vacated, so the band over the first row
   * went 31 → 83 in a frame (measured at 1200). Read off the third row, the run
   * *takes that row's place* — the mark sits one gap above it, the run's own
   * air is that gap and the band's closing margin, and the head's sticky offset
   * is where the head already was. Nothing moves; the two runs above simply
   * scroll away behind their own condensed copy.
   *
   * The mark is inside the bar, so the **expanded** box — which hides the whole
   * of `.view-tools` — hides it too and this reads `true` there. That costs
   * nothing: the run is drawn on `stuck || isFull` either way, and it is the
   * only thing the flag decides.
   */
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [stuck, setStuck] = useState(false);
  /** **How tall the condensed run is**, published because two sticky boxes are
   *  held under it — the head, and through `--pane-bar-h` the table's own
   *  header row. Measured rather than declared for this file's usual reason:
   *  it is a control height plus a font this app does not choose, and it is 0
   *  whenever the rail is not drawn. */
  const condRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const mark = sentinelRef.current;
    const box = scrollRef.current;
    if (!mark || !box) return;
    const io = new IntersectionObserver(
      ([e]) => setStuck(!e.isIntersecting),
      { root: box, threshold: 0 },
    );
    io.observe(mark);
    return () => io.disconnect();
  }, []);
  /**
   * **Nothing here compensates the scroll any more, because nothing moves.**
   *
   * The condensed run used to render *inside* this head, which grew it by 52px
   * the moment it stuck — and a sticky box still occupies its place in flow, so
   * every row below shifted under the finger. That was answered by putting the
   * difference onto `scrollTop` from a `ResizeObserver`, and the answer was
   * worse than the fault: **assigning `scrollTop` during a touch or momentum
   * scroll cancels the scroll on iOS.** Reported from a phone as the board
   * stopping dead under the thumb at the exact moment the head stuck.
   *
   * The run is out of flow now — a zero-height sticky rail, `.research-condensed
   * -rail` — so it can appear and vanish without moving a row, and there is
   * nothing left to compensate. `overflow-anchor: none` went with it: it was
   * only ever there to stop Chrome's scroll anchoring double-counting *our*
   * writes, and there are no writes.
   */
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const measure = () => {
      const head = box.querySelector('thead tr');
      if (!head) return;
      const img = head.querySelector<HTMLElement>('.sum-img-col');
      const name = head.querySelector<HTMLElement>('.sum-name-col');
      /* **The compare column, when there is one** — see `.research-cmp-col`.
         It is drawn only in compare mode, so this is `null` and its width `0`
         the rest of the time, which is what makes the two offsets below read as
         the numbers they were before the column existed. Measured for the same
         reason the name is: the cell is a 28px button between two
         `--research-gutter`s and that gutter is a `clamp` on `vw`, so there is
         no *one* number to declare. */
      const cmp = head.querySelector<HTMLElement>('.research-cmp-col');
      if (!img) return;
      // The **sum of the pinned widths**, not a position. A width is unaffected
      // both by how far the table is scrolled and by where the page happens to
      // sit — `offsetLeft` is neither, and measuring with it quietly folded the
      // app's own side padding into the offset (290px for a block ending at
      // 268), which parked the sorted column that far past the name.
      // Pinned **horizontally**, which is `left`, not `position`. Every header
      // cell in this table is already `position: sticky` at every width — that
      // is what pins the header row to the top — so testing the position made
      // the name column count as pinned on a phone, where it is not. The board
      // then held the sorted column 240px in on a 346px-wide table, out in the
      // middle of the screen past a column that had scrolled away.
      const pinnedAcross = (el: HTMLElement) => getComputedStyle(el).left !== 'auto';
      const cmpW = cmp ? cmp.offsetWidth : 0;
      const pin =
        cmpW + img.offsetWidth + (name && pinnedAcross(name) ? name.offsetWidth : 0);
      // Published before the pin that reads it, though both are one style
      // recalculation either way: `offsetWidth` is a width, and a width does not
      // move when the `left` beside it does.
      box.style.setProperty('--research-cmp-w', `${cmpW}px`);
      box.style.setProperty('--research-pin-left', `${pin}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  });

  /* **The effect that scrolled the active position pill into view is gone**, and
     with it the ref it read. It existed because eleven pills were one
     horizontally-scrolling run in the bar, so `SS` could be off the end of it at
     rest; the run is two wrapping groups in a panel now (`posStrip`), where
     every pill is on screen the moment the panel opens and there is nothing to
     scroll into view. */

  /**
   * Changing **which players are in the table, or what order they are in**
   * puts the table back at the top.
   *
   * Four hundred rows down the board, a tap on `30d` or on the `SS` pill used
   * to leave the reader at the same offset in a table that had become a
   * different set of players — rows with nothing to do with where they were,
   * and the row they were actually reading gone. An offset only ever meant
   * "where I am in *this* list", so a new list has no place to keep.
   *
   * The line is drawn on **population and order**, and the signature below is
   * therefore a read on the table as it comes out rather than a list of the
   * controls that can move it:
   *
   * - **Population** — the board (`kind`/`pos`), the window, the include set,
   *   the watchlist filter, the search term and the stat filters.
   *   Every one of them changes who is in the table, and every one of them is
   *   worked from the chrome pinned *above* the table, which gives no hint
   *   that the top of it has changed under you.
   * - **Order** — the sorted column and its direction. This is the one that
   *   looks arguable, and the header row being **sticky** is what settles it:
   *   the point of clicking `HR` is to bring the home-run leaders to the top,
   *   and because the header is reachable from anywhere in the table the
   *   reader can ask for that from row 400 and never see the answer. On a
   *   table you had to scroll to the top to click, this reset would be a
   *   no-op; here it is the difference between getting what you asked for and
   *   not. It reads `activeSortKey` rather than the board's stored `sortKey`,
   *   so hiding the sorted column — which quietly falls the order back to the
   *   board's default — counts as the reorder it is.
   *
   * Deliberately **not** in it: the column picker. It changes what is shown
   * *about* the same players in the same order, so the row under your eye is
   * still the row you were reading — and it is worked a checkbox at a time
   * with the panel open, where a reset per tick would yank the table away
   * fifteen times while you build the view you wanted.
   *
   * **`scrollTop` only — `scrollLeft` stays.** The two axes ask different
   * questions on this table: down it is *which players*, across it is *which
   * stat you are reading about them*. Narrowing to shortstops does not change
   * the second answer, and this is the app's widest table — a reader out at
   * Chase% who lost the horizontal scroll on every pill would swipe back
   * across forty columns each time. The pinned name column and the pinned
   * sorted column keep a row legible from out there, so nothing is lost by
   * staying where you are.
   */
  const boardSignature = [
    kind,
    // The reading is the largest thing about the population there is — thirty
    // rows where six hundred were — so it belongs here beside the board itself.
    teams ? 'teams' : 'players',
    pos,
    statWindow,
    includeKeys(include).join('+'),
    includeWatchlist,
    // Folded, not merely trimmed: the signature has to describe the *population*
    // the table came out as, and two spellings that fold together select the
    // same rows — so typing the accent onto a name you have already typed is not
    // a new table and must not scroll one back to the top.
    searchFold(search),
    filters.map((f) => `${f.column}${f.op}${f.value}`).join(','),
    // The days picked, which cut the population harder than anything else on
    // this list — six hundred pitchers to forty. A reader who was two hundred
    // rows into Wednesday's starters and presses Friday is looking at a
    // different table, which is the whole of what this signature is for.
    activeTurn ? activeTurn.days.join(',') : '',
    activeSortKey,
    activeSortAsc,
  ].join('|');
  // App keeps a scroll offset per view (keyed `'research'`) and restores it in
  // a layout effect of its own, so leaving the board and coming back lands
  // where the reader left it. This must not race that: the signature as it
  // stands at mount describes the board the reader is arriving *on*, not a
  // change they made to it, so a mount places nothing and the restore wins.
  //
  // The guard is the **last signature placed**, not a "have I mounted yet"
  // flag, and the difference is not academic: StrictMode runs a mounting
  // effect, tears it down and runs it again, which a flag reads as a second
  // visit and answers by scrolling to nought — undoing App's restore on every
  // return to the board in development. Comparing signatures makes the effect
  // idempotent for a given table, so a re-run of any kind is a no-op and only
  // a genuine change of population or order moves anything.
  /**
   * **Where the reader was, as of the last scroll they made** — which is not
   * always what `scrollTop` reads by the time the reset below runs.
   *
   * That reset is `Math.min(where you are, the top of the table)`, and the
   * `min` is what keeps a press still: a reader who can see the control they
   * pressed is above the target already, and scrolling *to* it would take that
   * control off the screen from under them. It reads the live `scrollTop` for
   * "where you are", and the browser can have moved that before the effect runs
   * — a commit that both narrows the rows **and** changes the columns replaces
   * the whole of the table's DOM, and Chrome clamps the offset against whatever
   * the content momentarily is while it does. Measured on the turn filter's
   * first press from **1400**: the effect computes the right target (156) and
   * finds `scrollTop` already **0**, so the `min` answers 0 and the reader
   * lands on a screenful of the control bar — the exact thing the target exists
   * to prevent. A press that only narrows rows (a search over the same board)
   * never sees it, which is why it took a control that does both to surface.
   *
   * So "where you are" is recorded on the reader's own scrolls and read from
   * here. Nothing else about the rule changes: still never downwards, still no
   * further up than the top of the table.
   */
  const wasAt = useRef(0);

  const placedSignature = useRef(boardSignature);
  useLayoutEffect(() => {
    if (placedSignature.current === boardSignature) return;
    placedSignature.current = boardSignature;
    // A layout effect, so the new rows are never painted once at the old
    // offset before being yanked to the top.
    //
    // **The top of the table, and never downwards** — which was `scrollTop = 0`
    // for as long as those were the same place. They are not any more: the
    // control set is inside this scroller now, so 0 is the top of the *pills*,
    // and a reader who sorted by `HR` from row 400 would be answered with a
    // screenful of buttons and the leaders below them. The target is the offset
    // at which the head is exactly where it sticks — the table's own offset in
    // the content, less the head's height — measured as 110 on a checked board
    // at 1200 and 158 at 390, where the table's top lands exactly on the head's
    // bottom edge (143 and 172) either way.
    //
    // `Math.min` is the other half of it, and it is what keeps the *press* case
    // still: every control that can change this signature is up in that row,
    // so a reader who can see the control they just pressed is by definition
    // above the target, and scrolling *to* it would take the control they are
    // using off the screen from under them. Only a sort — the one board-changing
    // press that is reachable from row 400, the header row being sticky — ever
    // moves anything, which is the case the reset was written for.
    const box = scrollRef.current;
    if (box) {
      const table = box.querySelector('table');
      const head = headRef.current;
      const top =
        table && head
          ? box.scrollTop +
            table.getBoundingClientRect().top -
            box.getBoundingClientRect().top -
            head.offsetHeight
          : 0;
      box.scrollTop = Math.min(wasAt.current, Math.max(0, top));
      wasAt.current = box.scrollTop;
    }
    // The reading position goes back to the top with the scroll, and for the
    // same reason: a page into a table is a fact about *that* table, and this
    // is a different one. It is also what stops a reader who had 400 rows open
    // paying for 400 rows of a board they have just narrowed to shortstops.
    onUiChange((u) => (u.shown === PAGE_SIZE ? u : { ...u, shown: PAGE_SIZE }));
    // And a beat in flight is a beat about the table that has just gone: left to
    // fire it would add a page to the one that replaced it, fifty rows into a
    // board the reader has this second narrowed to shortstops.
    cancelBeat();
  }, [boardSignature]);

  /**
   * The board as every control **but the turn filter** leaves it — the position
   * pill, the search and the stat thresholds.
   *
   * It is a step of its own rather than one `filter` because the day strip's
   * counts are measured against it: `12` under Friday has to be *the rows that
   * press would leave*, which is this set and not the one the filter has
   * already cut. See `turnCounts`.
   */
  const narrowed = useMemo(() => {
    // Folded exactly as the rows are, so `garcia` finds García and `García`
    // finds him too, and so `crow-armstrong` and `crow armstrong` are one query.
    const q = searchFold(search);
    return boardRows.filter((r) => {
      if (posMatch && !posMatch(r)) return false;
      if (q && !(searchText.get(r) ?? '').includes(q)) return false;
      for (const f of filters) {
        const col = columnsByKey.get(f.column);
        // A text column can hold no threshold and is not offered in the
        // builder; skipping it here is belt and braces against a filter built
        // against a key that has since become one.
        if (!col || col.text) continue;
        const v = col.value(r);
        // No value fails every threshold: a player Savant has no barrel rate for
        // hasn't cleared 10%, and letting him through would put a row of dashes
        // in a table you filtered precisely to keep them out of.
        if (v === null) return false;
        if (f.op === 'gte' ? v < f.value : v > f.value) return false;
      }
      return true;
    });
  }, [boardRows, search, searchText, posMatch, filters, columnsByKey]);

  /**
   * Who is due a turn in the days picked — **ids rather than a test run inside
   * the sort's own filter**, because the test is a walk of the man's club's
   * fixtures and the board is re-filtered on every letter typed into the search.
   * Worked once per (board, range) and read as a `Set` afterwards.
   *
   * Null is the filter off, which is what leaves every row standing — and it is
   * null while the window is still being read as well, which is rule 1 of the
   * loading system: nothing narrows until there is something to narrow it by,
   * and the only mark the wait leaves is the ball inside the control.
   */
  const turnIds = useMemo(() => {
    if (!activeTurn) return null;
    const ids = new Set<number>();
    for (const r of narrowed) {
      if (turnsOnDays(activeTurn.index, r.teamId, r.id, activeTurn.set).length > 0) ids.add(r.id);
    }
    return ids;
  }, [narrowed, activeTurn]);

  /** How many of the board start on each day of the window — the number under
   *  every chip in the strip, and worked only while that strip is open: it is a
   *  walk of the whole board and nothing else reads it. */
  const dayCounts = useMemo(
    () => (turnStripOpen && turnIndex ? turnCounts(turnIndex, narrowed) : NO_COUNTS),
    [turnStripOpen, turnIndex, narrowed],
  );

  const visible = useMemo(() => {
    const out = turnIds ? narrowed.filter((r) => turnIds.has(r.id)) : narrowed;

    // The name column is resolved ahead of both maps because it is in neither:
    // it is not a stat, so the picker never offers it and the filter builder
    // never sees it — see `NAME_COLUMN`.
    const col =
      activeSortKey === NAME_KEY
        ? NAME_COLUMN
        : (drawnByKey.get(activeSortKey) ?? columnsByKey.get(activeSortKey));
    if (!col) return out;
    const dir = activeSortAsc ? 1 : -1;
    // A column of words orders by them, the null-to-the-bottom rule below being
    // exactly as right for a player with no game today as for one with no
    // barrel rate. Only the opponent takes this path — see `Column.text`.
    if (col.text) {
      const text = col.text;
      return [...out].sort((a, b) => {
        const av = text(a);
        const bv = text(b);
        if (av === null && bv === null) return a.name.localeCompare(b.name);
        if (av === null) return 1;
        if (bv === null) return -1;
        if (av === bv) return a.name.localeCompare(b.name);
        return av.localeCompare(bv) * dir;
      });
    }
    return [...out].sort((a, b) => {
      const av = col.value(a);
      const bv = col.value(b);
      // Nulls to the bottom whichever way the column points — a blank is not a
      // good score or a bad one, and floating them would bury the leaders.
      if (av === null && bv === null) return a.name.localeCompare(b.name);
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av === bv) return a.name.localeCompare(b.name);
      return (av - bv) * dir;
    });
  }, [narrowed, turnIds, activeSortKey, activeSortAsc, columnsByKey, drawnByKey]);

  /**
   * The rows actually mounted — a page of them, growing as the reader reaches
   * the foot of the pane. See `PAGE_SIZE` for why the board is paged at all
   * and why it grows on scroll rather than on a button.
   *
   * `visible` stays the whole filtered, sorted table, and the count line above
   * it goes on reading off that: "455 of 622 batters" is a statement about the
   * board the filters left, not about how far down it anybody has scrolled.
   */
  const shown = ui.shown;
  const drawn = useMemo(() => visible.slice(0, shown), [visible, shown]);

  /**
   * Ask for the next page as the reader reaches the foot of the pane —
   * `usePagedRows`, which is the game log's mechanism too. The whole of the
   * reasoning (why a scroll handler and not an observer, why there is a beat
   * when nothing is being fetched, why one beat at a time) is in `paging.tsx`;
   * what is the board's own is the page size above and where the count lives.
   */
  /** The pane's own scroll handler — paging's, plus the note of where the
   *  reader has got to that the reset above reads (`wasAt`). */
  const onPaneScroll = (e: React.UIEvent<HTMLDivElement>) => {
    wasAt.current = e.currentTarget.scrollTop;
    onScroll();
  };
  const { onScroll, loadingMore, cancelBeat } = usePagedRows({
    scrollRef,
    total: visible.length,
    shown,
    pageSize: PAGE_SIZE,
    onShown: (next) =>
      onUiChange((u) => (u.shown >= visible.length ? u : { ...u, shown: next })),
  });

  function toggleSort(col: Column) {
    if (activeSortKey === col.key) {
      // **Flipped from the direction on screen, not from the stored flag.** On
      // a board still on its default the two differ — the stored flag is
      // `false` and the arrow is the default column's `ascFirst` — so a press
      // on the header that is already lit read as "descending, please" while
      // the ▲ under the reader's finger said it was ascending. Writing the key
      // as well as the direction is what takes the board off its default: the
      // reader has now chosen this column, and hiding it later must fall the
      // order back rather than leave a sort nothing on screen accounts for.
      setSortKey(col.key);
      setSortAsc(!activeSortAsc);
    } else {
      setSortKey(col.key);
      setSortAsc(col.ascFirst ?? false);
    }
  }

  function addFilter() {
    const v = Number(draftValue);
    if (draftValue.trim() === '' || !Number.isFinite(v)) return;
    const col = columnsByKey.get(draftColumn);
    setFilters((fs) => [
      ...fs,
      {
        // One past the highest on this board, rather than a counter kept beside
        // the list. The ids only have to be unique within the board that holds
        // them (a React key, and what the chip removes by), and a counter is
        // the one piece of this that a mount could reset while the filters it
        // numbered survived in App — which is two chips answering to one id.
        id: fs.reduce((m, f) => Math.max(m, f.id), 0) + 1,
        column: draftColumn,
        op: draftOp,
        value: col?.toValue ? col.toValue(v) : v,
        label: v,
      },
    ]);
    setDraftValue('');
  }

  /** Only your own roster is on the board, so every row would carry the
   *  baseball and it would mark nothing — the rule the old `My Players` scope
   *  followed. **The watchlist has to be in that test**: unioned in, it can put
   *  a free agent on a board that is otherwise your roster, and then the mark
   *  distinguishes the two again rather than marking everything. */
  const onlyMine = include.mine && !include.others && !include.fa && !includeWatchlist;

  /** The lock's mirror of the rule above: with **only** `Other Rosters` on,
   *  every row on the board is by definition held by somebody else, so a
   *  padlock on each of them marks nothing — it is the state of the board, not
   *  a fact distinguishing one row from the next, and it is already said by the
   *  lit button and by the badge in the expanded chrome. Any other combination
   *  puts at least one unlocked row beside them and the mark does its job.
   *  (The watchlist counts here as it does in `onlyMine`: unioned in, it can put
   *  a free agent on a board that is otherwise other people's rosters.) */
  const onlyOthers = include.others && !include.mine && !include.fa && !includeWatchlist;

  /**
   * Why the board is empty, and the way out.
   *
   * Three ownership buttons and a watchlist make sixteen states, and several of
   * them are legitimately empty — nothing included at all, a watchlist with
   * nobody on it, a league that hasn't been read yet. **Every one of them has to
   * name its own cause**, which is the standard the old three-state free-agent
   * message set; a generic "nothing found" would leave a user staring at a
   * table with no idea which of four controls emptied it.
   *
   * Tested in the order the causes *govern*: nothing included at all beats
   * everything else (no set can be empty if no set was asked for), then the
   * board that is the **watchlist alone**, then the league read the last two
   * buttons depend on, and last the ordinary case of a set that genuinely holds
   * nobody.
   *
   * **The union changed two of these and it is worth saying which.** The
   * watchlist no longer narrows, so its empty state is only reachable when it is
   * the *only* thing on — with an ownership set beside it the board is that set,
   * and an empty one is that set's story rather than the star's. And the way out
   * it offers had to change with it: "show everyone" used to mean turning the
   * filter off, which now leaves a board with nothing included at all, so the
   * link turns an ownership set **on** instead.
   */
  function emptyBoard() {
    const noun = kind === 'pitcher' ? 'pitchers' : 'batters';
    const faLabel = includeMeta('fa', espnConnected).full;
    /* **The team reading governs before any of the six below it**, which is the
       rule this family already follows: the causes are tested in the order they
       govern, and none of the six can even be reached here — the buttons that
       define every one of them are off the bar and `boardRows` is the whole
       population. So an empty board on this reading has exactly one cause, and
       it is not a control the reader touched: the thirty rows did not arrive.
       It names that rather than blaming a filter, and points at the one control
       that can get a table back. */
    if (teams) {
      return (
        <div className="empty-state">
          <p className="empty-title">No clubs to show</p>
          <p>
            The team board came back empty, which is a read that failed rather
            than a filter you set — nothing here narrows the thirty. Try another
            span, or go back to{' '}
            <button
              type="button"
              className="empty-inline-link"
              onClick={() => onTeamsChange(false)}
            >
              Players
            </button>
            .
          </p>
        </div>
      );
    }
    if (nothingIncluded) {
      return (
        <div className="empty-state">
          <p className="empty-title">No players included</p>
          <p>
            Every one of the buttons up top is off, so the board has nobody to
            draw. Turn on{' '}
            <button
              type="button"
              className="empty-inline-link"
              onClick={() => onIncludeChange({ ...include, fa: true })}
            >
              {faLabel}
            </button>{' '}
            — or any of the others — to put players back on it.
          </p>
        </div>
      );
    }
    if (watchlistAlone && watchlistCount === 0) {
      return (
        <div className="empty-state">
          <p className="empty-title">No {noun} on your watchlist</p>
          <p>
            The star beside a player's name adds him to it — it is a list of who
            you are keeping an eye on, and nothing to do with your roster. Turn
            on{' '}
            <button
              type="button"
              className="empty-inline-link"
              onClick={() => onIncludeChange({ ...include, fa: true })}
            >
              {faLabel}
            </button>{' '}
            to read the league and find somebody to star.
          </p>
        </div>
      );
    }
    if (espnConnected && (include.others || include.fa) && !ownedIds) {
      /* The league read the last two buttons are defined by. `espnLoading` is a
         frame behind the effect that starts it, so the in-flight case is
         "nothing has landed yet" rather than a flag — and "nobody is available"
         is the one wrong thing this state must never flash. */
      return espnError ? (
        <div className="empty-state">
          <p className="empty-title">Couldn't read your league</p>
          <p>{espnError}</p>
          <div className="empty-actions">
            <button type="button" className="empty-help" onClick={onConnectEspn}>
              Fantasy league settings
            </button>
          </div>
        </div>
      ) : (
        /* Not an `.empty-state`, which is the app's box for a finding: "there
           is nobody here" is precisely what this must not say while the league
           read is still out. A block wait says the opposite, in the same slot
           the finding would have taken. */
        <LoadingBlock>Reading your ESPN league</LoadingBlock>
      );
    }
    if (!espnConnected && include.others) {
      /* Reachable only from a link, since the button isn't offered without a
         league — and it is then the only thing turned on, or one of the others
         would have filled the table. */
      return (
        <div className="empty-state">
          <p className="empty-title">No fantasy league connected</p>
          <p>
            Connect an ESPN fantasy baseball league and the board can tell who is
            on a leaguemate's roster from who is free to pick up.
          </p>
          <div className="empty-actions">
            <button type="button" className="empty-help" onClick={onConnectEspn}>
              Connect a league
            </button>
          </div>
        </div>
      );
    }
    if (onlyMine) {
      return (
        <div className="empty-state">
          <p className="empty-title">No {noun} on your roster</p>
          <p>
            Turn on{' '}
            <button
              type="button"
              className="empty-inline-link"
              onClick={() => onIncludeChange({ ...include, fa: true })}
            >
              {faLabel}
            </button>{' '}
            to read the rest of the league, and open a player to add him.
          </p>
        </div>
      );
    }
    /* The closing case names every set that *is* on, the watchlist among them
       now that it is one of them. It has to be in the list rather than left to
       the branch above: the watchlist's own empty state only fires when the
       board is the watchlist alone and the list is empty, and there is a second
       way to an empty watchlist-only board — a starred player who is on neither
       leaderboard (a two-way man watched as a pitcher, with the batting board
       on) — which would otherwise have reached a sentence naming nothing at
       all. */
    const onLabels = [
      ...includeKeys(include).map((k) => includeMeta(k, espnConnected).full.toLowerCase()),
      ...(includeWatchlist ? ['on your watchlist'] : []),
    ];
    return (
      <div className="empty-state">
        <p className="empty-title">No {noun} to show</p>
        <p>
          Nobody on this board is {onLabels.join(' or ')}. Turn on another of the
          buttons up top, or pick a different position.
        </p>
      </div>
    );
  }

  const { isFull, toggle, ref: fullRef } = useFullPage<HTMLDivElement>();
  /* Published here rather than beside `condRef` because it reads `isFull`, and
     it measures the rail's **inner** box: the rail itself is `height: 0` — that
     being the whole point of it — so measuring the rail would publish 0 and put
     the head back under the run. */
  usePublishedHeight(condRef, '--research-cond-h', stuck || isFull);

  /* **Every setting the board is on, stated as a badge**, and it is the head
     of the table rather than a mode's chrome. The control set scrolls away
     above it — see `controls` — and expanded it is behind a full-page box, so
     on both surfaces the same sentence is missing without this: "of 622" means
     nothing without knowing it is the 30-day window, free agents only, and
     shortstops.

     Labels, not controls: the app's round pill is the shape it reserves for
     things you read, and the way to change any of them is a scroll up, or the
     button that expanded the table. */
  /**
   * **Teams and Watchlist are lifted out of the tools run**, because the bar is
   * three rows now and neither belongs in the third of them.
   *
   * The rows are *which players*, *which slice*, and *what to do with the
   * board*, and they are the order the questions come in. Watchlist joins the
   * three include buttons because it is the fourth set the board is a union of
   * — the measurement that once kept it out of `.research-include` was about a
   * row that had to wrap, and a row that scrolls has no such budget to defend.
   * Teams joins the span and the position because all three name *which slice
   * of the league the table is*, which is exactly the argument the comment on
   * `.research-tools` already makes for keeping the span beside the position.
   */
  const watchlistName = saved.watchlistName;
  const watchlistToggle = !teams ? (
    <button
      type="button"
      className={`research-toggle${includeWatchlist ? ' on' : ''}`}
      aria-pressed={includeWatchlist}
      onClick={() => onIncludeWatchlistChange(!includeWatchlist)}
      title={
        watchlistName
          ? `Also show the players on “${watchlistName}”, whoever owns them — the star on each row is what puts them there`
          : 'Also show the players on your watchlist, whoever owns them — the star on each row is what puts them there'
      }
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9Z" />
      </svg>
      {/* **The button names the list it is about**, which is the whole of what
          the bar had to learn: with one list "Watchlist" said everything, and
          with several it says which of them only by not saying. The default
          list is *called* `Watchlist`, so a reader who never made a second one
          sees exactly the button they always did — the rename is theirs to do
          and the label follows it.

          A shared list showing over the top of it takes the label too, because
          that is the list on the board; the star still writes to the reader's
          own, and the bar above the table is what says so. */}
      <span className="research-toggle-label">{watchlistName || 'Watchlist'}</span>
      {watchlistCount > 0 && <span className="research-toggle-count">{watchlistCount}</span>}
    </button>
  ) : null;
  /**
   * **The saved searches, beside the watchlist chooser rather than last in the
   * tools run.**
   *
   * *(It read last in that run, and the paragraph is kept: "after everything
   * they are made of. Search, Filters and Watchlist decide who is in the table;
   * Schedule decides what the table is about them; Columns and Ranks decide how
   * it is drawn — and this one is* all of them at once, under a name*, so it
   * belongs after the controls it stands in for rather than among them." That is
   * a good argument about **what a search is made of**, and it turned out to be
   * the wrong question.)*
   *
   * The right one is *what the reader is doing when they reach for it*, and it
   * is the same thing they are doing at the watchlist chooser: opening a dialog
   * of **saved things** to pick one. Those two are the only controls on this bar
   * that do that — they are two configurations of one component
   * (`ResearchLists.tsx`) and they open the same box in the same place. Beside
   * each other, `Lists ⌄` and `Searches ⌄` read as the pair they are; nine
   * buttons apart they read as two unrelated disclosures that happen to look
   * alike.
   *
   * **And the count is gone.** `Searches 3` was the shape the include buttons
   * and the funnel wear, where a number says *how much of this control is in
   * force* — three filters are narrowing the board, five men are on the
   * watchlist. Nothing is in force here: having three saved searches is not a
   * state the board is in, and the badge put a lit-looking figure on the one
   * control in the run that is doing nothing at all until it is pressed. The
   * watchlist's own count stays, that one being a count of rows on the board.
   */
  const searchesButton = !teams ? (
    <SavedButton
      label="Searches"
      title="Saved readings of this board — apply, save, share"
      open={searchesOpen}
      onToggle={() => setPanel('searches', !searchesOpen)}
      /* **A mark, because the condensed run is marks.** That run hides every
         label and squares the button; with no glyph this one collapsed to its
         own caret alone — a bare `⌄` in a row where Search is a magnifier and
         Filters a funnel. A bookmark is what a *saved* thing looks like, and it
         is distinct from both. */
      glyph={
        <svg
          viewBox="0 0 16 16"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 2.4h8a.6.6 0 0 1 .6.6v10.6L8 10.9l-4.6 2.7V3a.6.6 0 0 1 .6-.6Z" />
        </svg>
      }
    />
  ) : null;
  const teamsToggle = (
    <button
      type="button"
      className={`research-toggle${teams ? ' on' : ''}`}
      aria-pressed={teams}
      onClick={() => onTeamsChange(!teams)}
      title={
        teams
          ? 'Back to the players'
          : "Read the board as thirty clubs instead — each row a club's aggregate over the span on screen"
      }
    >
      {/* A crest: the one shape in this run that says *club* rather than
          person, list or column. Distinct at 15px from the star, the calendar,
          the funnel and the bars beside it. */}
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3.2 20 6v6.2c0 4.2-3.2 7-8 8.6-4.8-1.6-8-4.4-8-8.6V6Z" />
      </svg>
      <span className="research-toggle-label">Teams</span>
    </button>
  );

  /**
   * **The badge row is gone, and the chips are what it was for.**
   *
   * It carried one badge per *setting* once — the reading, the position, each
   * included set, Ranks, the schedule span, the window, the search — on the
   * argument that a control set scrolled off the top leaves `of 622` meaning
   * nothing without them. That was right about the problem and wrong about the
   * answer, and the condensed run replaced all but one of them: every setting
   * is a lit button that sticks with the head, which is the state on screen
   * *and* pressable, where a badge never was.
   *
   * The one it could not replace was the stat threshold, which has no button of
   * its own to be lit — `PA ≥ 300` is a sentence the funnel's count (`3`)
   * cannot say. That is what the row was left carrying.
   *
   * **And the chips row moved into the head under it**, which finished the
   * argument the other way: the chips say the same sentence in the same words
   * off the same `filters` array, and each one is pressable. Measured at 390
   * with three filters, the head printed `HR ≥ 10 · RBI ≥ 40 · SB ≥ 5` twice,
   * 33px apart — the chips at y=350 and the badges at y=383 — and the badge row
   * cost the head **25px at every width** to restate a control one line above
   * it. Reported as the filter badges being displayed twice, which is what they
   * were.
   *
   * So the row went and the chips stayed: of two rows saying one thing, the one
   * that keeps is the one you can act on. `.research-badge` and
   * `.research-badges` went with it — see `.research-chips`, which inherits the
   * constraint that made this row a scroller rather than a wrapping run.
   */

  /**
   * **The control set, as the tools row itself.** `.view-tools` is the band
   * that says which *reading* of a page you are on, and this bar is the whole
   * of that sentence on this page: which players, which span, which position,
   * which columns.
   *
   * **It is this file's box now, where it used to be a portal into one App
   * kept.** That portal was written when the row lived in the app's pinned
   * chrome — a different subtree, which only a portal could reach without
   * lifting the bar into App and the board's whole column vocabulary with it.
   * The row is inside this board's own scroller now, which is this component's
   * own tree, so there is nothing left to reach across.
   *
   * **And the portal was costing the board its place on the way back in.** A
   * host handed over by a callback ref is empty for the commit that creates it
   * and filled by the re-render that ref triggers, so the row was 28px tall for
   * one frame and 110 the next — an 82px growth *above* the viewport, which the
   * browser's scroll anchoring answers by adding 82 to `scrollTop`, and which
   * App's own restore reads as the reader having taken the scroll and stops
   * placing. Measured: left at 800, back at **882**; left at 1,500, back at
   * **1,582**. Rendered inline the row is its full height in the first commit
   * and there is no growth to compensate for — back at 800 and 1,500 on the
   * nose.
   *
   * The include buttons, the window tabs, the positions and the five
   * disclosure buttons all share one wrapping row: every group is only as wide
   * as its own content, so on a desktop the whole control set fits on a single
   * line, and the row breaks to two (or three) as the screen narrows.
   * `.research-chrome` and `.research-bar` are `display: contents`, so their
   * groups are items of the row's own flex container and take part in its wrap.
   */
  /**
   * **The bar is three runs, and each of them scrolls.**
   *
   * It was one wrapping row of five groups, which on a phone answered its width
   * problem twice over: the span and the position collapsed into `<select>`s,
   * and every disclosure button dropped its word to a bare glyph. Both are
   * gone. A row that scrolls has no line budget to defend, so the pills stay
   * pills and the buttons keep their labels at every width.
   *
   * **The three are the order the questions come in** — *which players*, *which
   * slice of them*, *what to do with the board* — and each is a `ScrollRow`, so
   * a run too wide for the window gives up its end to an arrow rather than
   * wrapping onto a line the table pays for.
   *
   * They are consts rather than JSX in place because **the head draws them a
   * second time** once the control set has scrolled away — see
   * `.research-condensed`. The same elements, from the same props, calling the
   * same callbacks: two copies of a control that cannot disagree, which is only
   * safe because every one of these is controlled from above.
   */

  /**
   * What the turn filter's mark says, or null where there is nothing to say —
   * the filter off, the window not yet read, or a board a turn is not a fact
   * about. One test, read by the mark, by `Clear all` and by the empty state,
   * so the three cannot come to disagree about whether the days are in force.
   *
   * **Declared up here rather than beside the panels**, where it was: `marks`
   * reads it, and `marks` has to be built before the bar that carries its count.
   */
  const turnChip = activeTurn ? turnDaysLabel(activeTurn.days, activeTurn.index.today) : null;

  const groupWho = (
    <>
          {/* Ahead of the position pills, and a separate control from them:
              which rosters and which position both apply, so folding them into
              one row would read as a single-select where picking SS un-picks
              your own roster.

              Three `.research-toggle`s rather than the segmented switch this
              replaced, and that is the whole point of the change: a segment
              says "pick one of these", a lit toggle says "this set is in". They
              take the disclosure buttons' shape for exactly that reason — `.on`
              already means "this control is doing something" everywhere else in
              the bar. */}
          {/* **Nothing here can say anything about a club.** The three sets are
              a partition of *ownership* — of players — and the watchlist beside
              them is a list of players; on the team reading every row is in and
              no button could take one out, which is the rule that suppresses a
              mark every row would carry, applied to a control instead. It is
              not disabled, it is not drawn: a control whose whole subject has
              been swapped out is a setting lying about its own reach, which is
              the same argument that takes Columns and Ranks off the bar in
              schedule mode. */}
          {/* **The toggle, wrapped in its chooser.** The button's job has not
              changed — union the watchlist onto the board — and what is new is
              that "the watchlist" now names one of several, so the caret beside
              it is where that is said and changed. A split control rather than
              one button doing both: pressing a button that both toggles a set
              and opens a menu is a control the reader cannot aim.

              Off the bar on the team reading with the include buttons it
              composes with, and for the same reason: a watchlist is a list of
              players and unioning players onto a board of clubs is not an
              operation. */}
          {teams ? (
            watchlistToggle
          ) : (
            <div className="rl-split">
              {watchlistToggle}
              {/* **The word is back, and the paragraph that took it away is
                  kept rather than deleted.** It read: *a caret, not a second
                  word — `Watchlist · Lists ▾` is two nouns for one thing, the half
                  beside this one already names the list, so all this half has to
                  say is* there are others. That argument was made about a bar
                  where the toggle always said `Watchlist`, and it is the half
                  that was right: two nouns for one thing is what it read as.

                  What it missed is that the toggle stopped saying `Watchlist`
                  the same day — it names the **active list**, so the pair reads
                  `Closers │ Lists ⌄`, which is a list and the button that
                  changes it rather than one noun twice. And the caret alone was
                  a 29×36 target with no name on it in a run where every other
                  button carries its word: nothing on screen said what pressing
                  it would do, and the only thing that did was a `title` a touch
                  device never sees. Measured at 1400, the half went **29 → 70px** and the
                  pair 136 → 177, with the third run and the head unmoved.

                  It is still one shape and still two targets — see `.rl-split`,
                  which is unchanged. The condensed run hides the word with every
                  other label and the half goes back to being a caret in a 36px
                  square, which is that run's whole grammar. */}
              <SavedButton
                label="Lists"
                title="Choose a watchlist, or rename, share and add one"
                open={listsOpen}
                onToggle={() => openPanel('lists', !listsOpen)}
                className="rl-split-caret"
              />
            </div>
          )}
          {/* **Straight after the split**, and ahead of the ownership sets
              rather than behind them: the two saved-thing controls are a pair,
              and a pair is read together. Off the bar on the team reading for
              the reason the split beside it is — a saved search names a position
              and an ownership set, and a board of thirty clubs has neither, so a
              reading applied there would be a control lying about its reach. */}
          {searchesButton}
          {!teams && (
          <div className="research-include" role="group" aria-label="Which players">
            {INCLUDE_ORDER.filter(
              // Other rosters needs a league to name a set at all. A link that
              // arrives with it on keeps the button, so the state is always
              // visible and always undoable — the courtesy the Free Agents pill
              // used to extend to an unconnected visitor.
              (k) => k !== 'others' || espnConnected || include.others,
            ).map((k) => {
              const meta = includeMeta(k, espnConnected);
              const on = include[k];
              return (
                <button
                  key={k}
                  type="button"
                  className={`research-toggle research-inc${on ? ' on' : ''}`}
                  aria-pressed={on}
                  title={meta.title}
                  onClick={() => onIncludeChange({ ...include, [k]: !on })}
                >
                  {/* All three rendered, swapped by the queries — the pattern
                      the date presets and the window tabs already use, so the
                      breakpoints live in one place. A phone has no room for
                      "Other Rosters" three times over.

                      The full label is the one that stays in the accessibility
                      tree once the button is down to its mark: at the icon
                      width it is *visually* hidden rather than dropped, the
                      rule `.research-toggle-label` already sets, so what a
                      screen reader reads is "My Roster" and not three buttons
                      whose only content is an `aria-hidden` glyph. The mark
                      itself is hidden from it wholesale — the glyphs carry no
                      words and `FA` is a shorthand for a label already there,
                      so announcing it would only be the name said twice. */}
                  <span className="research-inc-full">{meta.full}</span>
                  <span className="research-inc-abbr">{meta.abbr}</span>
                  <span className="research-inc-code" aria-hidden="true">
                    <IncludeCode code={meta.code} />
                  </span>
                </button>
              );
            })}
          </div>
          )}
    </>
  );

  /**
   * **The span, as a strip in the head rather than a run in the bar.**
   *
   * It was five pills flat on the bar's second row, plus a `<select>` beside
   * them for a phone. It is now behind a button that states what it is set to,
   * and that button is one of the four the bar has left — which is the whole
   * point of the change: five pills were five pills' worth of bar spent saying
   * `Season` four fifths of the time.
   *
   * **A panel and not a dialog**, which is the test `ColumnPicker` states from
   * the other side: a box several hundred pixels tall wedged into the chrome
   * pushes the table down the page, and a strip of five is not that. The
   * `<select>` went with the change — a strip in the head is full-width at
   * every width, so there is no narrow case left for a dropdown to answer, and
   * the media query that swapped them is gone.
   *
   * **Picking closes it**, which is the day strip's own asymmetry read the easy
   * way: a press here *is* the answer, so there is nothing left to keep open.
   *
   * **Not reachable at all under the projected lens**, which is the old rule
   * moved with the control rather than dropped: a projection is his season
   * blended with his last thirty days, always, so under the lens these five
   * decide nothing — and a reader who pressed `7d` and watched the table not
   * move would be owed an explanation this chrome has no room for. The setting
   * survives the lens and the board comes back to it, exactly as the turn
   * filter's days survive a crossing to the batters. The *button* is not drawn
   * either, so there is no lit control pointing at a panel nothing can open.
   */
  const windowStrip = (
    <div className="research-panel research-pick-panel">
      <div className="research-pick-row" role="tablist" aria-label="Time span">
        {RESEARCH_WINDOWS.map((w) => (
          <button
            key={String(w)}
            type="button"
            role="tab"
            aria-selected={statWindow === w}
            className={`research-window-tab${statWindow === w ? ' active' : ''}`}
            onClick={() => {
              onWindowChange(w);
              openPanel('window', false);
            }}
            title={
              w === 'season'
                ? 'The whole season to date'
                : `The last ${w} days of games, ending yesterday`
            }
          >
            {windowLabel(w)}
          </button>
        ))}
      </div>
    </div>
  );

  /**
   * **The positions, grouped by the side of the ball they belong to.**
   *
   * Eleven pills in one run is a control you have to read along to find `SS`,
   * which is what the `<select>` beside them existed to answer on a phone. In
   * two named groups it is two short runs — `Batters · C · 1B · 2B · 3B · SS ·
   * IF · OF` and `Pitchers · SP · RP` — and the heading over each is the thing
   * a flat run could never say: that the eight and the two are not one list.
   * The whole-board pill leads its own group, being what that group is when
   * nothing under it is narrowed.
   *
   * **The group headings are `<div role="presentation">` rather than headings**,
   * for the reason `Top Performers` is a `span` on the Overview: this panel is
   * inside a `tablist` whose tabs are the pills, and a heading between them
   * would be announced as structure in a list that has none. The tablist's own
   * `aria-label` names what is being picked; each group carries `aria-label` on
   * its own row.
   *
   * **On the team reading it is the two sides and no groups** — a club plays
   * every position, so nine of the eleven have nothing to select, and an
   * `optgroup` over a run of one reads as a heading with nothing under it. That
   * is the rule `TEAM_SIDES` already carried down from the `<select>` it
   * replaces.
   */
  const posStrip = (
    <div className="research-panel research-pick-panel">
      {(teams ? [{ label: null, items: TEAM_SIDES }] : POSITION_GROUPS).map((g) => (
        <div className="research-pick-group" key={g.label ?? 'sides'}>
          {g.label && (
            <div className="research-pick-head" role="presentation">
              {g.label}
            </div>
          )}
          <div
            className="research-pick-row"
            role="tablist"
            aria-label={g.label ?? (teams ? 'Side' : 'Position')}
          >
            {g.items.map((p) => {
              const on = teams ? researchKindFor(pos) === p.kind : pos === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  className={`research-pos-tab${on ? ' active' : ''}`}
                  title={(hasEligibility && p.espnTitle) || p.title}
                  /* On the team reading the press is a no-op where the kind is
                     already right — pressing `Hitting` on a board reached from
                     the `SS` pill must not spend that pill. */
                  onClick={() => {
                    if (!(teams && researchKindFor(pos) === p.kind)) onPosChange(p.key);
                    openPanel('pos', false);
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  const groupTools = (
    <>

            {/* One group, so the four buttons never split across two lines of the
                bar. As individual flex children they wrapped one at a time, and on
                a wide screen that stranded whichever one happened to fit at the end
                of the position row — a lone Search up there, its three companions
                below. `flex: none` on the group is what makes the whole run move
                down together instead.

                The window dropdown used to sit at the head of it, to share the
                buttons' line on a phone. It has moved back up beside its own pill
                row now that the position row has a dropdown of its own: the two
                belong together — they name which slice of the league the table
                is, where the buttons open panels. */}
            <div className="research-tools">
            {/**
             * **Teams leads the run, and it is a toggle rather than a
             * segmented switch.**
             *
             * The first shape was a `Players · Teams` tablist at the head of
             * the bar, beside the window tabs whose class list it borrowed, and
             * it was measured out: two one-word tabs are **145.5px**, and the
             * control set at 1920 fits on one row with nothing to spare — so it
             * took the player board from **50px of chrome to 96 at 1920, 96 to
             * 142 at 1200 and 98 to 146 at 480**, a whole extra row on the one
             * page where every pixel of height is a row of the table, and on
             * the reading that had not asked for the control. That is the
             * measurement that kept the Watchlist button out of
             * `.research-include`, arriving on a wider screen.
             *
             * As a member of `.research-tools` it costs the bar far less: the
             * run is one flex item that wraps whole, so a button added to it
             * grows a group that was already moving as a unit rather than
             * adding a sixth thing for the row to place.
             *
             * **And the shape is honest.** `ScheduleToggle` two buttons along
             * is the precedent and the same kind of thing: a mode you turn on
             * that changes what the table is, with the board's own reading as
             * the off state. Players is what this page *is* — every other view
             * in the app is about players — and Teams is the lens. It is the
             * run's third panel-less toggle, so it takes `.on` and never
             * `.active`, exactly as Watchlist and Ranks do.
             *
             * **And the element is back beside the paragraph that describes
             * it.** It had drifted onto the row above — the bar's second run,
             * with the span and the position — while this comment stayed here,
             * so the file said "Teams leads the run" about a control that was
             * not in it. With the bar down to four buttons the run is the
             * settings dialog's, and Teams is a setting: it changes what the
             * table *is*, which is exactly the kind of thing that box holds.
             */}
            {teamsToggle}
            {/* **Search is not in this box, and it is the only control that
                isn't.** It is one of the four the bar keeps, so a copy here
                would be the same disclosure drawn twice — and the two would sit
                a press apart, one of them behind a box the other's panel would
                have to close. Filters leads the run instead. Each of these
                carries an `on` state whenever its panel holds something, open
                or shut: a collapsed control must never be the only place a
                filter lives, which is what the badge strip under the count now
                answers for the whole of this box. */}
            <button
              type="button"
              /* `.on` means the panel *holds* something, whether it is open or
                 shut. The window used to count here; it is out in the bar now and
                 speaks for itself. */
              className={`research-toggle${filtersOpen ? ' active' : ''}${
                filters.length ? ' on' : ''
              }`}
              aria-expanded={filtersOpen}
              onClick={() => openPanel('filters', !filtersOpen)}
              title="Filter the board by a stat threshold"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M3 5h18l-7 8v6l-4 2v-8Z" />
              </svg>
              <span className="research-toggle-label">Filters</span>
              {filters.length > 0 && <span className="research-toggle-count">{filters.length}</span>}
            </button>
            {/**
             * **Starting — the third disclosure, and the pitching board's
             * own.**
             *
             * It reads with Search and Filters because it does what they do:
             * it takes *rows* out. What it selects on is the one thing this
             * board is the right population for — a whole league of arms, and
             * the question *who is starting on Friday* — which is why it is
             * here and not on the roster table, where the twelve men you hold
             * are already a list you can read down.
             *
             * **Not drawn on the batting board or on the clubs**, and not
             * disabled there either: a turn is a fact about a pitcher, and a
             * control whose whole subject has been swapped out is a setting
             * lying about its own reach — the rule that takes Columns and Ranks
             * off the bar in schedule mode, and the include buttons off the
             * team reading. The range it holds survives the crossing, so coming
             * back finds the days you had picked.
             *
             * **It stays on the bar in schedule mode**, where Columns and Ranks
             * go, and that is the same rule read the other way: this narrows
             * rows, and *a schedule of the men starting this weekend* is
             * precisely the question the two controls answer together.
             */}
            {kind === 'pitcher' && !teams && (
              <TurnButton
                days={turnDays}
                today={turnIndex?.today ?? null}
                open={turnsOpen}
                /* On with no index is the window still being read — App holds
                   it and hands it down only once it has landed, exactly as the
                   Schedule toggle knows its own wait. */
                loading={turnDays !== null && !turnIndex}
                onToggle={() => openPanel('turns', !turnsOpen)}
              />
            )}
            {/**
             * **Watchlist sits after Filters, and it is the one control here
             * that adds players rather than taking them away.** It stays in this
             * group rather than joining the three include buttons it now
             * composes with, and the reason is measured: moved into
             * `.research-include` it takes that group from 170px to 240 at
             * 390px wide, where the first row has 346 to spend and the
             * `Roster · Research` pills already have 171 of it — so the group
             * drops to a line of its own and the bar goes **three rows to four,
             * 207px of chrome to 255**, on the one page where every pixel of
             * height is a row of the table. At 640, 900, 1200 and 1920 the move
             * costs and buys nothing at all (2 / 3 / 2 / 1 rows either way), so
             * it would be tidiness bought only where there is room to spare and
             * paid for only where there isn't. Keeping the icon-only phone form
             * doesn't save it either — 240px is the group *with* the label
             * hidden.
             *
             * Within the run it reads third, after the two disclosures and
             * before Columns. Where it sits in the group is a matter of the
             * order the four are read in and not of layout: they are one flex
             * item that wraps whole, so a button moved among them cannot change
             * a width — measured before and after, the group is 240 / 468px and
             * the bar wraps to 3 / 2 / 3 / 2 / 1 rows (207 / 159 / 207 / 161 /
             * 115px of chrome) at 390 / 640 / 900 / 1200 / 1920 either way, with
             * no horizontal overflow at any of them.
             *
             * The one button in the run with **no panel**, so it takes `.on` and
             * never `.active`, and it carries the count for the same reason the
             * Filters button does — a control that holds something has to say so
             * with its panel shut, and this one has no panel at all.
             */}
            {/* Off the bar on the team reading with the three include buttons
                it composes with, and for the same reason: the watchlist is a
                list of players, and unioning players onto a board of clubs is
                not an operation. */}
            {/**
             * **Schedule reads after the four that narrow the board and before
             * the two that dress it**, which is where it belongs in the run's
             * own order: Search, Filters and Watchlist decide *who* is in the
             * table, this decides *what the table is about them*, and Columns
             * and Ranks decide how that is drawn.
             *
             * The two below it are **not drawn while it is on**, and that is
             * the honest version of the rule the app already applies to a menu
             * entry that would do nothing on the page it is read from. Columns
             * names the stat vocabulary and Ranks puts a percentile under each
             * of them; neither is on screen in schedule mode, and a control
             * whose whole subject has been swapped out is a setting lying about
             * its own reach. Search and Filters stay, because they narrow the
             * *rows* and a schedule of the shortstops with 300+ PA is exactly
             * the question this board is opened with.
             */}
            {/* *(Saved searches stood here and are in the first run now, beside
                the watchlist chooser — see `searchesButton`, which keeps the
                paragraph that put them here.)* */}
            {/**
             * **Compare, and it is two controls in one place rather than two
             * buttons.**
             *
             * Off, it is a toggle that turns the ticks on. On with fewer than
             * two ticked it is the same toggle wearing the count, which is what
             * says *keep going*. On with two or more it grows a second button
             * beside it that opens the page — a **separate target**, because
             * `Compare 3` doing one thing at two ticks and another at three is
             * a control whose meaning changes under the reader.
             *
             * Off the bar on the team reading with the controls it sits among:
             * a comparison is of players, and this board's rows are clubs.
             */}
            {!teams && (
              <div className="research-compare">
                <button
                  type="button"
                  className={`research-toggle${compareOn ? ' on' : ''}`}
                  aria-pressed={compareOn}
                  title={
                    compareOn
                      ? 'Stop picking players to compare'
                      : `Tick up to ${maxCompare} players, then narrow the board to just them`
                  }
                  onClick={() => onCompareModeChange(!compareOn)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="15"
                    height="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    {/* Two bars of different heights, which is what a
                        comparison looks like — and not the ⇄ arrows, which in
                        this app already mean a swap. */}
                    <path d="M8 20V9M16 20V4" />
                    <path d="M3.5 20h17" />
                  </svg>
                  <span className="research-toggle-label">Compare</span>
                  {compareOn && compareSelected.length > 0 && (
                    <span className="research-toggle-count">{compareSelected.length}</span>
                  )}
                </button>
                {/**
                  * **One button, two states, because it is one thought.**
                  *
                  * Picking, it commits: `Compare 3 →`. Committed, it is the way
                  * back: `Comparing 3 ✕`, lit, and pressing it puts the whole
                  * board back. A second button for the second half would be a
                  * control that is only ever pressable in the state the first
                  * one is not.
                  *
                  * **Its word is in a `.research-toggle-label`, and that is not
                  * decoration.** The condensed run hides every button's label by
                  * that class and squares what is left to 36px — so a bare text
                  * node here was a 36px box with `Compare 2 →` spilling out of
                  * it across the two buttons beside it. Measured at 407: `w: 36`
                  * with `scrollWidth` past its own `clientWidth`. The glyph is
                  * what survives the condense, and it carries the state: an
                  * arrow to go in, a ✕ to come out.
                  */}
                {(comparing || compareSelected.length >= 2) && (
                  <button
                    type="button"
                    className={`research-toggle research-compare-go${comparing ? ' on' : ''}`}
                    title={
                      comparing
                        ? `Showing only the ${compareKeys.length} you picked — press to bring the whole board back`
                        : `Narrow the board to the ${compareSelected.length} players you have ticked`
                    }
                    onClick={comparing ? onClearCompare : onOpenCompare}
                  >
                    <span className="research-toggle-label">
                      {comparing
                        ? `Comparing ${compareKeys.length}`
                        : `Compare these ${compareSelected.length}`}
                    </span>
                    {comparing ? (
                      <svg
                        viewBox="0 0 16 16"
                        width="15"
                        height="15"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 16 16"
                        width="15"
                        height="15"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M2.5 8h11M9.5 4l4 4-4 4" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            )}
            <ScheduleToggle
              on={scheduleSpan !== null}
              /* On with no index is the read still out — App holds the window
                 and hands it down only once it has landed, so this needs no
                 fourth prop to know it. */
              loading={scheduleSpan !== null && !schedule}
              onToggle={() => {
                // **The lens's panel goes with the lens.** Pressing this turns
                // the projected reading off (App's `setBoardScheduleSpan`), and
                // a span picker left open over a mode that is no longer on is
                // the same fault the run's own exclusivity fixes, arriving from
                // a control that is not a disclosure.
                if (scheduleSpan === null) openPanel('projected', false);
                onScheduleSpanChange(
                  scheduleSpan === null ? defaultScheduleSpan(matchupWindow) : null,
                );
              }}
            />
            {/* **How far ahead, immediately after the button that turns the
                mode on** — and it was at the far end of the run.

                It stood outside `.research-tools` as a group of its own, which
                was right while Schedule was the last control in the run: the
                strip landed beside the group or under it as the width allowed,
                and either way it read as Schedule's. Adding `Projected` after
                Schedule put a second toggle *between* the mode and its own
                span, so the row read `Schedule · Projected · Week 20 · Week 21`
                — a span strip whose subject was two controls back, and which
                looked at a glance like the projected lens's. Reported as
                exactly that.

                Inside the group it is unambiguous by position, which is the
                only thing that can settle it: the strip is drawn only while the
                mode is on, so the run it joins is one button longer only in the
                state where the strip is what the reader is looking at.

                `Next 7` / `Next 14` spelled out rather than `7d` / `14d`,
                because the window tabs an inch away read `7d` and mean the
                opposite direction in time — see `ScheduleSpanTabs`. */}
            {scheduleSpan !== null && (
              <ScheduleSpanTabs
                span={scheduleSpan}
                matchup={matchupWindow}
                onChange={onScheduleSpanChange}
              />
            )}
            {/**
             * **Projected reads directly after Schedule**, and the two are the
             * same kind of control read one step apart: that one swaps the stat
             * columns for the days ahead, and this one swaps the *figures* in
             * them for what those days are worth. They are two readings of one
             * set of cells and cannot both be in force — each turns the other
             * off, which is the exclusivity the summary table's own pair
             * already keeps.
             *
             * **Not drawn on the team reading**, and not disabled there: a
             * projection is a line per *man* — his lineup slot, his rotation
             * turn, his platoon — and there is no such thing for the Brewers.
             * That is the rule the include buttons and the position pills
             * already follow on that reading.
             *
             * The wait is inside the button, exactly as `Schedule`'s is: the
             * board goes on drawing the measured figures until the answer
             * lands, so this is the only mark the press leaves.
             */}
            {/**
             * **A disclosure, and it is `Starting`'s shape rather than the
             * Roster's plain switch.**
             *
             * That toggle has one thing to say — *the days in view, estimated*
             * — because the Roster already carries a date control and the lens
             * simply borrows it. This board has no dates at all, so the lens
             * has to bring its own span with it, and a span is exactly what a
             * lit button cannot say: `Week 20`, `Wed, Aug 26` and `Aug 26 –
             * Aug 30` are three different readings behind one word. So the
             * button opens a panel and takes the class pair the board's three
             * other disclosures take — **`.active` for open, `.on` for holding
             * something** — where the Roster's takes `.on` alone.
             *
             * **Pressing it does not turn the lens on**, which is the half
             * borrowed whole from `Starting`: that button opens the day strip
             * and narrows nothing until a day is pressed. Here the panel opens
             * and the board goes on drawing its measured figures until a span
             * is picked — and picking one closes the panel again, which is the
             * thing a reader asked for in as many words.
             *
             * **And pressing the lit span off is how the lens goes off**, which
             * is the turn filter's rule for its own last day. The panel's
             * `Clear` covers the case no pill can — a range picked on the
             * calendar, where nothing is lit to press.
             */}
            {!teams && (
              <>
                <ProjectedToggle
                  on={projected}
                  active={projectedOpen}
                  loading={projected && !projection}
                  onToggle={() => openPanel('projected', !projectedOpen)}
                  title={
                    projected
                      ? `Projected over ${wideRange(projSpan.start, projSpan.end)} — pick other days, or clear it`
                      : 'Read the board as what every player is expected to do over days still to be played'
                  }
                />
                {/**
                 * **The key is not here any more — it is on the line the lens
                 * writes** (`projSpanLine`, `.research-proj-key`). The paragraph
                 * that put it here is kept, this file's rule for superseded
                 * reasoning, because most of it is still the record of what a
                 * key on this board has to survive:
                 *
                 * *"The key, beside the control it explains and drawn only while
                 * that control is doing something — `ProjectionKey`, the same
                 * popover the Roster row and the League page open, from the same
                 * `.proj-key` anchor. One engine explained by one component on
                 * all three surfaces. It was an accordion in the head for one
                 * round, because `.research-scroll > .view-tools` was `overflow:
                 * hidden` and a panel opened from a button inside it painted as a
                 * 46px sliver. That row clips on the inline axis only now
                 * (`overflow-x: clip`, which is the one value that does not drag
                 * `visible` on the other axis to `auto`), so the popover hangs
                 * below the row exactly as it does everywhere else. Drawn on the
                 * press rather than on the answer, the rule the Roster's copy
                 * states: a key that arrived a quarter of a second later would
                 * move the run under the finger that had gone on to the next
                 * control."*
                 *
                 * **What that got wrong is which thing the key explains.** Beside
                 * the toggle it was the fourth item in a run of eight buttons, a
                 * 30px bordered box that read as a ninth control — and the
                 * sentence it opens is not about the button, it is about the
                 * numbers: *these figures are estimates over days still to be
                 * played*. That sentence belongs against the line that makes the
                 * claim, which is `PROJECTED · Aug 27 – Sep 5` in the head.
                 *
                 * **And the press-not-the-answer rule comes for free there.** It
                 * existed because the key appearing late would move the seven
                 * buttons beside it; on the head's own line there is nothing to
                 * move — the line and the key arrive in the same commit, the
                 * line being drawn only once `projection` has landed, and the
                 * head publishes its measured height either way.
                 */}
              </>
            )}
            {/**
             * **Columns is drawn under the lens and Ranks is not**, which is
             * this pair's own rule read one control at a time rather than as a
             * block.
             *
             * That rule is *a control whose whole subject has been swapped out
             * is a setting lying about its own reach* — and the lens does not
             * swap the columns out, it swaps them for **a smaller set of its
             * own**. There is still a vocabulary to pick from, still an order to
             * set, and a reader who wants `SV` split out of `SVHD` on a
             * projected board wants it exactly as much as on a measured one. So
             * the picker stays and lists what the lens can actually draw.
             *
             * **Ranks genuinely has no subject.** A percentile is a standing
             * among the *qualified* players on a measured board — Savant's own
             * bar — and nobody qualifies for a week nobody has played; ranking
             * an estimate against a field of estimates would put a solid badge
             * under a number this app's rule says must never wear a
             * measurement's clothes. Schedule mode still takes both off, the
             * day columns being a vocabulary nobody picks.
             */}
            {/**
             * **One button for both readings**, where it was briefly two — and
             * the two had come to mean different things. The measured copy
             * counts the columns **on the table** and the projected one counted
             * the columns that **exist**, so the same control read `31` beside a
             * 44-column vocabulary and `19` beside a table drawing 16. Written
             * once, they cannot part again; what differs is only which entry the
             * `customised` dot is about.
             *
             * `- 1` for the turn filter's `Start`, which is that filter's own
             * column and in no vocabulary — counting it would put a `30` on a
             * button whose panel has 29 things in it.
             */}
            {!schedule && (
              <ColumnsButton
                open={columnsOpen}
                count={columns.length - (activeTurn ? 1 : 0)}
                customised={projectedOn ? !!projColumnKeys : !!columnKeys}
                onToggle={() => openPanel('columns', !columnsOpen)}
              />
            )}
            {/**
             * **Ranks is the half of the pair that genuinely has no subject
             * under the lens.** A percentile is a standing among the
             * *qualified* players on a measured board — Savant's own bar — and
             * nobody qualifies for a week nobody has played; ranking an estimate
             * against a field of estimates would put a solid badge under a
             * number this app's rule says must never wear a measurement's
             * clothes. Schedule mode takes both off, the day columns being a
             * vocabulary nobody picks.
             */}
            {!schedule && !projectedOn && (
              <>
                {/* Ranks reads after Columns, which is the order the two are
                    read in: Columns decides which numbers are on screen, this
                    decides whether each of them carries a second reading. It is
                    the run's other panel-less toggle, so it takes `.on` and
                    never `.active`, exactly as Watchlist does. Shared with the
                    Stats tab's caption row (`RanksButton`), for the reason
                    `ColumnsButton` is. */}
                <RanksButton
                  on={showRanks}
                  onToggle={() => onShowRanksChange(!showRanks)}
                  /* Two different sentences, because they are two different
                     claims — and the wording is where a reader finds out which
                     one is under his numbers. A club's badge is a standing among
                     thirty, with no bar and so nothing to be short of; a
                     player's is a percentile against a subset the bar defines,
                     which is why only that one names the bar. */
                  asRank={teams}
                  population={
                    teams
                      ? `the ${population.length} clubs on the ${windowLabel(
                          statWindow,
                        )} board, whatever you have narrowed it to`
                      : `the qualified players on the whole ${windowLabel(
                          statWindow,
                        )} board (${qualifiedCount} of ${population.length} ${
                          kind === 'pitcher' ? 'pitchers' : 'batters'
                        }, Savant's bar of ${
                          QUALIFIER_WORDS[kind]
                        }), whatever you have narrowed it to`
                  }
                />
              </>
            )}
            </div>
    </>
  );

  /**
   * **What the position button says**, which is the whole reason a button
   * replaces the run: the run said eleven things and the reader only ever needs
   * the one that is set. `Batters` is the default and reads as one, so nothing
   * on the bar has to say *default*.
   */
  const posLabel =
    (teams ? TEAM_SIDES : POSITIONS).find((p) =>
      teams ? researchKindFor(pos) === p.kind : p.key === pos,
    )?.label ?? 'Batters';

  /**
   * ---------------------------------------------------------------------------
   * The bar: four controls, and everything else behind one of them
   * ---------------------------------------------------------------------------
   *
   * **It was three wrapping runs of up to seventeen controls** — the ownership
   * sets and the two saved-thing boxes, then the span and the position as two
   * pill rows with a `<select>` each, then eight to ten tools — and on a phone
   * that is three or four rows of chrome over a table where every pixel of
   * height is a row of the board. Reported as the top of this page being hard
   * to manage, and worst on a phone, which is exactly where it cost most.
   *
   * **Four, and each one answers a different question.** *Which name am I
   * looking for* (Search), *which slice of the league* (Position), *over what*
   * (Season), and *everything else about the board* (the gear). The first three
   * are the questions a reader arrives with; the fourth is the box they open
   * when they have one of the others.
   *
   * **Two of them are icons and two are words, and that is not inconsistency.**
   * Search and the gear are *actions with no state to report* — a magnifier
   * means search wherever you meet one, and this app already spends a gear on
   * settings in its own header. Position and Season are the opposite: their
   * whole job is to say what they are set to, and a glyph cannot say `SS`. So
   * each control is drawn as the thing it is, which is the same rule that gives
   * the include buttons a code, an abbreviation and a full word at three widths.
   *
   * **The two icon buttons keep a `sr-only` word**, a wordless control owing a
   * label to everything that is not a pointer — the rule the saved-things row's
   * four icon buttons already state.
   */
  /**
   * ---------------------------------------------------------------------------
   * The marks: every setting in force, beside the count
   * ---------------------------------------------------------------------------
   *
   * **The bar hides most of the board's settings now, so something has to say
   * what they are.** That is this file's own standing rule — *a collapsed
   * control must never be the only place a filter lives* — and it used to be
   * answered by the controls themselves: they were all on the bar, lit, and the
   * condensed run kept them lit once it had scrolled away. Four buttons cannot
   * do that, so the answer moves to the one line that was already saying what
   * the board is: the count.
   *
   * **They are the chips, widened.** `.research-chips` already drew the stat
   * thresholds and the turn filter's days as pressable labels with an `×`, one
   * row above the count, and those are two of the settings a reader can no
   * longer see the control for — so a second row of *badges* beside them would
   * be the same sentence twice, 33px apart, which is the exact fault the old
   * `.research-badge` row was removed for. One strip, holding all of it, and
   * the chips' own behavior generalized: **a mark is what the setting is, and
   * pressing it undoes it.**
   *
   * **Where a setting has no single undo, the press opens the box that sets
   * it.** The include set is the case — `Nobody included` is a state three
   * buttons make together and there is no one press that resolves it — so that
   * mark carries no `×` and raises the settings dialog instead. A mark that
   * looks clearable and is not would be worse than either.
   *
   * **Order is coarsest first**, which is what the chips already did between
   * the days and the thresholds: what the board *is* (the lens, the clubs, the
   * sets), then what has been taken out of it (the days, the name, the
   * thresholds). A reader scanning the strip meets the big claims first, and
   * the strip scrolls, so the ones most worth seeing are the ones that stay.
   *
   * `hidden` is whether the setting lives behind the gear, which is what that
   * button's own count is of — the name search is on the strip and is *not*
   * behind it, having a button of its own in the bar.
   */
  const marks = useMemo(() => {
    const out: {
      key: string;
      label: string;
      title: string;
      hidden: boolean;
      onClear?: () => void;
    }[] = [];
    const push = (m: (typeof out)[number]) => out.push(m);
    if (teams) {
      push({
        key: 'teams',
        label: 'Clubs',
        title: 'The board is thirty clubs rather than six hundred players — press to go back to the players',
        hidden: true,
        onClear: () => onTeamsChange(false),
      });
    }
    if (projected) {
      push({
        key: 'projected',
        label: `Projected · ${wideRange(projSpan.start, projSpan.end)}`,
        title: 'Every figure is what the player is expected to do over these days — press to go back to what he has done',
        hidden: true,
        onClear: () => onProjSpanChange(null),
      });
    }
    if (scheduleSpan !== null) {
      push({
        key: 'sched',
        label: `Schedule · ${scheduleSpan === 'matchup' ? 'This matchup' : scheduleSpan === 'next' ? 'Next matchup' : `Next ${scheduleSpan}`}`,
        title: 'The columns are the days ahead rather than the stats — press to go back to the stats',
        hidden: true,
        onClear: () => onScheduleSpanChange(null),
      });
    }
    if (!teams) {
      /* **One mark for the ownership sets, not one per button**, because what
         is worth saying is the *set* — `Mine + FA` is a sentence and three
         separate marks reading `Mine`, `FA` are a row the reader has to add up.
         Drawn only where it is not the default, which is the rule every mark
         here follows: a mark that would be on every board marks nothing. */
      if (!isDefaultInclude(include)) {
        const on = includeKeys(include).map((k) => includeMeta(k, espnConnected).abbr);
        push({
          key: 'include',
          label: on.length ? on.join(' + ') : 'No rosters',
          title: on.length
            ? `Only these rosters are on the board — ${on.join(', ')}`
            : 'None of the three ownership sets is on, so the board is whatever the watchlist adds to it',
          hidden: true,
        });
      }
      if (includeWatchlist) {
        push({
          key: 'watch',
          /* The `+` says which direction this one goes: every other mark here
             takes rows out and this one puts them in, which is the distinction
             the chips row was careful to keep the watchlist *out* of when
             `Clear all` was the only thing beside it. It is safe on a strip
             whose presses are per-mark. */
          label: `+ ${watchlistName || 'Watchlist'}`,
          title: `The players on “${watchlistName || 'your watchlist'}” are on the board whoever owns them — press to take them off again`,
          hidden: true,
          onClear: () => onIncludeWatchlistChange(false),
        });
      }
      if (compareOn) {
        push({
          key: 'compare',
          label: comparing
            ? `Comparing ${compareKeys.length}`
            : `Comparing ${compareSelected.length ? `${compareSelected.length} picked` : '— pick some'}`,
          title: comparing
            ? 'The board is narrowed to the players you ticked — press to bring the whole board back'
            : 'The tick column is on — press to put it away',
          hidden: true,
          onClear: () => {
            if (comparing) onClearCompare();
            onCompareModeChange(false);
          },
        });
      }
    }
    if (turnChip) {
      push({
        key: 'turn',
        label: `Starting ${turnChip}`,
        title: activeTurn
          ? `Starting ${turnDaysTitle(activeTurn.days, activeTurn.index.today)} — press to show every pitcher again, whatever day he starts`
          : '',
        hidden: true,
        onClear: () => onTurnDaysChange(null),
      });
    }
    if (search.trim()) {
      push({
        key: 'search',
        label: `“${search.trim()}”`,
        title: 'The board is narrowed to names matching this — press to clear it',
        // The one mark whose control is still on the bar, so it is not one of
        // the things the gear is hiding and is not in its count.
        hidden: false,
        onClear: () => setSearch(''),
      });
    }
    for (const f of filters) {
      push({
        key: `f-${f.id}`,
        label: `${columnsByKey.get(f.column)?.label ?? f.column} ${OP_LABEL[f.op]} ${f.label}`,
        title: 'Remove this filter',
        hidden: true,
        onClear: () => setFilters((fs) => fs.filter((x) => x.id !== f.id)),
      });
    }
    return out;
  }, [
    teams,
    projected,
    projSpan,
    scheduleSpan,
    include,
    espnConnected,
    includeWatchlist,
    watchlistName,
    compareOn,
    comparing,
    compareKeys,
    compareSelected,
    turnChip,
    activeTurn,
    search,
    filters,
    columnsByKey,
    onTeamsChange,
    onProjSpanChange,
    onScheduleSpanChange,
    onIncludeWatchlistChange,
    onClearCompare,
    onCompareModeChange,
    onTurnDaysChange,
    setSearch,
    setFilters,
  ]);

  const rowMain = (
    <>
      {/* Search leads, being the one question you can ask this board without
          knowing anything about it. `.on` while the field holds something, so a
          board narrowed by a name says so with the panel shut — and the badge
          strip under the count says *what* the name is. */}
      <button
        type="button"
        className={`research-toggle research-icon${searchOpen ? ' active' : ''}${
          search.trim() ? ' on' : ''
        }`}
        aria-expanded={searchOpen}
        onClick={() => setPanel('search', !searchOpen)}
        title="Search the league by name"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="sr-only">Search the league by name</span>
      </button>
      {/**
       * **The gear, and it carries a count.**
       *
       * The count is how many settings inside are doing something — the same
       * figure the badge strip under the count spells out. Both, deliberately,
       * and it is not the restatement it looks like: the strip **scrolls**, so
       * on a phone with four things in force the fourth is off the end of it,
       * and a control that hides settings owes an always-visible answer to *is
       * anything in here on*. The strip says which; this says how many. It is
       * the shape `Filters` already wore for the same reason one row down.
       *
       * `.active` for open and `.on` for holding something, which is the class
       * pair every disclosure on this board takes.
       */}
      <button
        type="button"
        className={`research-toggle research-icon${settingsOpen ? ' active' : ''}${
          marks.length ? ' on' : ''
        }`}
        aria-expanded={settingsOpen}
        aria-haspopup="dialog"
        onClick={() => setSettingsOpen((v) => !v)}
        title={
          marks.length
            ? `Everything else this board is set to — ${marks.length} in force`
            : 'Everything else this board is set to'
        }
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47V21a2 2 0 1 1-4 0v-.09a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.47-.97H3a2 2 0 1 1 0-4h.09A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 9 4.6a1.6 1.6 0 0 0 .97-1.47V3a2 2 0 1 1 4 0v.09A1.6 1.6 0 0 0 15 4.6a1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 19.4 9v0a1.6 1.6 0 0 0 1.47.97H21a2 2 0 1 1 0 4h-.09a1.6 1.6 0 0 0-1.47.97Z" />
        </svg>
        <span className="sr-only">Board settings</span>
        {marks.length > 0 && <span className="research-toggle-count">{marks.length}</span>}
      </button>
      {/* The position, stating what it is set to. `.active` alone and never
          `.on`: every board is on *some* position, so a lit button here would
          be a mark on every board, which marks nothing. */}
      <SavedButton
        label={posLabel}
        title={teams ? 'Which side of the ball the clubs are read on' : 'Which position the board is narrowed to'}
        open={posOpen}
        onToggle={() => setPanel('pos', !posOpen)}
        className="research-pick-btn"
      />
      {/* …and the span, on the same terms, and **not drawn under the projected
          lens** — the rule that took the pill row off the bar there, arriving on
          the button that replaced it. See `windowStrip`. */}
      {!projectedOn && (
        <SavedButton
          label={windowLabel(statWindow)}
          title="How much of the season every number on the board is drawn from"
          open={windowOpen}
          onToggle={() => setPanel('window', !windowOpen)}
          className="research-pick-btn"
        />
      )}
    </>
  );


  /* **The two panels and the chips travel with the head, not with the bar.**

      Search and Filters open inline rows rather than dialogs — see the Columns
      picker below for why that one alone leaves the row. Drawn in the control
      set, though, they were rows of a box that scrolls away: pressing Filters
      in the condensed run lit the button and opened the panel **734px above
      the top of the pane**, measured at 390 with the board scrolled 900. The
      button was reachable at every offset and the thing it opened was not,
      which is the fault the condensed run exists to answer, left standing in
      the two controls that answer with a panel rather than with a state.

      So they are drawn in `.research-head` — the one box here that is rendered
      at every offset and sticks — above the count. That is the same order
      they already read in under the bar at rest (panel, chips, count),
      and once the head is stuck it puts them directly under the condensed run,
      beneath the button that opened them. One copy rather than one per state: a
      second set drawn in the rail would remount the search field on the scroll
      that crosses the threshold, which is an `autoFocus` firing — and a phone
      keyboard opening — mid-fling.

      The head's height is measured (`--research-head-h`), so the column
      headings and the sort's scroll target follow an opened panel without being
      told anything about it. What it does cost is the head growing under a
      reader who is already scrolled: the rows below move by the panel's height
      and the head's own bottom edge moves with them, so the row against that
      edge stays against it. That is an accordion opening, not the forbidden
      "control that changes size under the finger that pressed it" — the finger
      is on the condensed run, which rides a zero-height rail and does not
      move. */

  /**
   * Whether the surface that raised the open preview is **still on screen** —
   * the grid's span index, or the turn filter's window one. Identity is the
   * test rather than a flag: both are memoized objects that go null or change
   * the moment their control does, so a fixture opened from the grid closes
   * when the grid does even with the filter still on, and one opened from a
   * start closes when the days are cleared or the reader crosses to the
   * batters.
   */
  const fixtureLive =
    !!fixture && (fixture.index === schedule || fixture.index === activeTurn?.index);

  const panels = (
    <>
      {/* **The position and the span, behind the two buttons that state them.**

          They are the newest members of this run and they arrive by the same
          argument every other one is here on: a panel opens into the head,
          which is the one box on this board drawn at every offset — so a
          control pressed in the condensed run has its answer under the finger
          rather than hundreds of pixels above the top of the pane.

          They lead the run because they are what the two buttons beside Search
          open, and because they are the smallest: one strip and two, where
          Filters is a builder and the day strip is a fortnight. */}
      {posOpen && posStrip}
      {windowOpen && !projectedOn && windowStrip}
      {/* **The two saved-thing panels are dialogs now, and are drawn beside the
          Columns picker rather than here.** Two paragraphs of this file's
          history sit under that one sentence and both are worth keeping:

          *"They were written as popovers hanging off their buttons and that does
          not work here: the control set is `.tool-scroll-box`, which scrolls
          horizontally and therefore clips on both axes, so the panel measured a
          perfectly ordinary 268×322 box and painted nothing at all. The head is
          where a panel on this board goes."* True, and still the reason a
          **popover** is not an option here.

          And `client-dialogs.md` listed *the research board's panels* among the
          two things that deliberately stayed accordions when every detail in the
          app became a dialog, on the test of **grouping against detail**: these
          are navigation and controls, not a detail about one thing.

          What both missed is that Search, Filters and the day strip are *one
          line of controls each*, and these two are not. A list of saved things
          with a rename, a share, an armed delete and a `Save this board` field
          is the shape `ColumnPicker` already left the row for — see the
          paragraph there, which turns on **volume**: a panel several hundred
          pixels tall wedged into the chrome pushes the table it describes down
          the page, and on a phone takes the screen outright while pretending to
          be a strip of controls. Driven against the old build at 1400: opening
          Lists put a 420×237 panel in the head, took the head **31 → 273.9px**
          and pushed the first row of the board **340 → 582.9** — four rows gone
          under a box you open to choose which list is active.

          And it went on moving. The `⋯` drawer inside a row took the head to
          **317.9** and the first row to **626.9**, and opening `Rename` over it
          took them to **325.9 / 634.9** — the table shifting twice more under a
          reader who is looking at a control three rows above it. Nothing behind
          a modal moves: measured after, the head is **31px and the first row at
          340 with either dialog open**, at 1400 and at 390. */}
      {searchOpen && (
        <div className="research-panel">
          <input
            className="research-search"
            type="search"
            placeholder="Search player or team…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search by player or team"
            autoFocus
          />
          {search && (
            <button type="button" className="research-clear" onClick={() => setSearch('')}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* The days, under the same head the other two panels open into — see the
          note above `panels` for why every one of them is drawn there rather
          than in the control set that opens it. Nothing is drawn while the
          window is still out: the strip *is* the window's days, so there is no
          shape to reserve, and the wait is marked inside the button. */}
      {turnStripOpen && turnIndex && (
        <TurnDayStrip
          index={turnIndex}
          days={turnDays}
          counts={dayCounts}
          onChange={onTurnDaysChange}
        />
      )}

      {/**
       * **The days the lens is over, behind the button that draws it.**
       *
       * It is `TurnDayStrip`'s place in the head and its arrangement: a panel
       * the board's own disclosure opens, drawn in `.research-head` rather than
       * in the control set, for the reason every panel on this board is —
       * pressed from the condensed run, a panel in the control set opens
       * hundreds of pixels above the top of the pane, so the button is
       * reachable at every offset and the thing it opens is not.
       *
       * **Three doors, and only two of them are spans.**
       *
       * - **This matchup period and the next**, which is what a fantasy manager
       *   plans in and the one thing a calendar cannot express: a period's
       *   dates are the league's own arithmetic and they move as the week is
       *   played. `Next 7` / `Next 14` where no league names them.
       * - **`Custom`**, which is not a span at all but the door to the app's
       *   own calendar — one press on a date picks a day, two pick a range.
       *   The grid is drawn **only behind it**, which is what keeps the panel
       *   at one row for the two presses most readers make: measured, 346px of
       *   head with the calendar always drawn against **36** without it.
       *
       * **A named span closes the panel and `Custom` does not**, which is the
       * one asymmetry here and it is not one: pressing a period *is* the
       * answer, where pressing `Custom` is asking the question — a panel that
       * shut on it would take the calendar away in the same frame it drew it.
       * Picking on the calendar closes it, that press being the answer.
       *
       * **The way out is not in here**, and it has moved twice. Pressing the
       * lit pill off was the first answer — the rule the turn filter's day strip
       * keeps for its own last day — and it is true and not *findable*: nothing
       * on a lit pill says it is also a switch. A `Clear` in this row was the
       * second, and it is only reachable with the panel open, which is the one
       * state a reader who wants the measured board back is not in. It rides on
       * the head's own span line now (`projSpanLine`), which sticks — so it is
       * on screen at row 400 and inside the expanded box, where this panel is
       * neither.
       */}
      {projectedOpen && (
        <div className="research-panel research-proj-panel">
          <div className="research-proj-spans">
            <div className="proj-span view-switch" role="group" aria-label="Days to project">
              {projSpans.map((sp) => {
                const on =
                  projected && !projCustomOpen && projSpan.start === sp.start && projSpan.end === sp.end;
                return (
                  <button
                    key={sp.label}
                    type="button"
                    className={`view-tab${on ? ' active' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      onUiChange((u) => ({ ...u, panels: { ...u.panels, projected: false, projCustom: false } }));
                      onProjSpanChange({ start: sp.start, end: sp.end });
                    }}
                    title={sp.title}
                  >
                    {sp.label}
                  </button>
                );
              })}
              <button
                type="button"
                className={`view-tab${projCustomOpen ? ' active' : ''}`}
                aria-pressed={projCustomOpen}
                /* **A lit pill is the span in force, and pressing one puts the
                   panel away** — which is what the two periods beside it
                   already do, and what this one has to do once it can be lit by
                   the span rather than by the press. Pressing it while it is
                   merely *open* still closes the calendar and leaves the pills,
                   that press being the reader abandoning the question rather
                   than answering it. See `projCustomOpen`. */
                onClick={() =>
                  projCustomInForce
                    ? setPanel('projected', false)
                    : setPanel('projCustom', !projCustomOpen)
                }
                title={
                  projCustomInForce
                    ? 'These are the days being projected — pick others on the calendar, or close'
                    : 'Pick a day, or a run of days, on the calendar'
                }
              >
                Custom
              </button>
            </div>
            {/* **The app's own date field, revealed by `Custom`** — the glyph
                alone while there is nothing picked, the days themselves once
                there are. It is what makes the reopened panel say which days
                the board is projecting: `Custom` lit says *the calendar*, and
                this says *which*.

                `view-tab` outright rather than a lookalike, so it takes the
                board's own disclosure shape — the ground, the border, the
                `--control-h` height that lines it up with the run beside it, the
                lit `.active` and the focus ring — rather than a lookalike, which
                is the stylesheet's *fold, don't restyle*. `.view-tab` is what it
                is *not*: that class is a **segment of a switch** (`border: none;
                background: none`) and outside one it draws as bare text, which
                is a field with no field about it — measured, 25px tall against
                the 36 of the run it stands beside. What is left as its own is
                the anchor the popover hangs from. */}
            {projCustomOpen && (
              <div className="research-proj-pick">
                <button
                  type="button"
                  className={`research-toggle research-proj-cal-btn${projCalOpen ? ' active' : ''}`}
                  aria-expanded={projCalOpen}
                  aria-haspopup="dialog"
                  onClick={() => setCalPressed((o) => !o)}
                  title={
                    projCalOpen
                      ? 'Close the calendar'
                      : projCustomInForce
                        ? `Projected over ${wideRange(projSpan.start, projSpan.end)} — pick other days`
                        : 'Pick a day, or a run of days, on the calendar'
                  }
                >
                  <CalendarGlyph />
                  {projCustomInForce && (
                    <span className="research-proj-cal-range">
                      {wideRange(projSpan.start, projSpan.end)}
                    </span>
                  )}
                </button>
                {projCalOpen && (
                  <Modal
                    title="Days to project"
                    titleId="research-proj-cal"
                    className="research-cal-box"
                    onClose={() => setCalPressed(false)}
                  >
                    <DateCalendar
                      /* **Nothing marked where there is no custom range in
                         force** — see `projCustomRange`: a reader pressing
                         `Custom` off `Week 20` has chosen no days yet, and a
                         calendar is the one control that must not answer for
                         him. The month is today's all the same. */
                      start={projCustomRange?.start ?? null}
                      end={projCustomRange?.end ?? null}
                      month={today}
                      max={maxDate}
                      onChange={(start, end) => {
                        /* **The pick is the answer, so it puts the whole thing
                           away** — the calendar it was made on and the panel the
                           calendar was opened from, which is what a named pill
                           beside it already does with its own press. */
                        setCalPressed(false);
                        setPanel('projected', false);
                        onProjSpanChange({ start, end });
                      }}
                    />
                  </Modal>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {filtersOpen && (
        <div className="research-panel research-filter-add">
          {/* Every column, not just the shown ones: a threshold on a stat you
              have hidden is a legitimate thing to want ("300+ PA" without a PA
              column), and the chip keeps saying so. */}
          <select
            value={draftColumn}
            onChange={(e) => setDraftColumn(e.target.value)}
            aria-label="Stat to filter on"
          >
            {allColumns
              .filter((c) => !c.text)
              .map((c) => (
                <option key={c.key} value={c.key}>
                  {c.pick ?? c.title}
                </option>
              ))}
          </select>
          <select
            className="research-op"
            value={draftOp}
            onChange={(e) => setDraftOp(e.target.value as Op)}
            aria-label="Comparison"
          >
            <option value="gte">{OP_LABEL.gte}</option>
            <option value="lte">{OP_LABEL.lte}</option>
          </select>
          <input
            className="research-value"
            type="number"
            step="any"
            inputMode="decimal"
            placeholder="0"
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addFilter();
            }}
            aria-label="Threshold"
          />
          <button
            type="button"
            className="research-add"
            onClick={addFilter}
            disabled={draftValue.trim() === ''}
          >
            Add
          </button>
        </div>
      )}

      {/* **The chips are the mark strip now, and it lives beside the count.**

          What stood here was the stat thresholds and the turn filter's days, as
          pressable labels with an `×`, on their own row of the head above the
          count. Both are still exactly that — the same array, the same press,
          the same `×` — and what has changed is that they are no longer the only
          two settings a reader cannot see the control for. The bar is four
          buttons; the ownership sets, the watchlist, the clubs lens, the
          schedule lens, the projected lens and the comparison are all behind the
          gear, and every one of them owes the same sentence.

          So one strip holds all of it and it moves down beside the count — see
          `marks` for what is in it and in what order, and `.research-marks` for
          why it scrolls rather than wraps. A second row of badges beside these
          chips was the alternative and it is the fault the old `.research-badge`
          row was removed for: the same filter printed twice, 33px apart, with
          the head paying for both.

          **`Clear all` goes with them**, and its rule is unchanged in words and
          wider in reach: it undoes what the strip beside it says. That used to
          be the thresholds and the days; it is now every mark that has an undo,
          which is all of them but the ownership set — the one whose press opens
          the box instead, there being no single gesture that resolves *nobody
          included*. It still cannot take a player off the board by accident:
          the watchlist mark's own undo does that and is a press of its own,
          where this button's job is to put the board back to what it was. */}
    </>
  );

  /**
   * **What the lens is reading, and the way out of it** — the last thing in the
   * head before the count.
   *
   * The board's own version of the caption the Roster's projected reading once
   * had and retired. That one went because the date bar eight pixels above it
   * was printing the same two lines, and being **pinned** was printing them
   * better; neither half reaches here. This board has no date bar at all — the
   * days live behind the `Projected` button, in a panel the reader closes as
   * soon as they have picked — so the head is the only place the span is
   * stated, and the head is the one box on this page that sticks and that the
   * expanded mode keeps.
   *
   * **`Projected · Wed, Aug 26`, and no count of days.** It read `· 1 day still
   * to play` for a round, on the argument that a span whose clubs are mostly
   * idle draws a board of dashes and the count line under it would be the only
   * number on screen. That case is real and it is the *zero* case, which the
   * branch below still says in full; between one day and fourteen the figure
   * was arithmetic the reader can do off the dates beside it, spent on the one
   * line this head has for saying what the table is.
   *
   * **`Clear` rides on it**, which is what makes the lens undoable from where
   * it is *stated* rather than only from inside the control that set it: this
   * line is in the sticky head, so it is on screen at row 400 and inside the
   * expanded box, where the button is neither. It is the panel's own `Clear`
   * moved rather than a second one — one control for one action, and this is
   * the reachable place for it.
   *
   * **At none the span is not printed at all**, and the line becomes the whole
   * sentence: naming a projected span there would be the lens taking credit for
   * figures it did not touch. Reached by an inbound `?bproj=1` over a past range
   * — every span the panel offers starts today, so a press cannot land here —
   * and it keeps the `Clear` beside it, that state being the one a reader most
   * wants out of.
   *
   * Drawn only once the answer has landed. A line that named a span before the
   * server had clamped it (`start` is clamped forward to today) would be
   * describing days the table is not about.
   */
  const projSpanLine = projectedOn ? (
    <div className="research-proj-line">
      <span>
        {projection.daysLeft === 0 ? (
          'Nothing to project — every game in these days has been played'
        ) : (
          <>
            <span className="research-proj-lead">Projected</span> ·{' '}
            {wideRange(projection.start, projection.end)}
          </>
        )}
      </span>
      {/* **The key sits against the claim it explains**, which is this line and
          not the button three runs above it — see the paragraph at the toggle
          for the reasoning it replaces. It is the same `ProjectionKey` the
          Roster row and the League page open; what is this caller's is where it
          hangs from, which is `.research-proj-key`.

          **A glyph rather than a box.** Every other `InfoKey` in the app is
          `.app-dialog-close`'s 30px bordered square, which is right beside a
          heading and wrong on a 12px caption: at 30px it was taller than the
          line it belongs to and drew a second control between the sentence and
          `Clear`. Here it is the 16px mark alone, with the press area kept at
          the app's own size by padding the button out and pulling it back in —
          measured, the box paints 16×16 and hit-tests 28×28, so nothing is lost
          to a finger. */}
      <ProjectionKey board days={projection.daysLeft} className="research-proj-key" />
      <button
        type="button"
        className="research-clear"
        onClick={() => {
          setPanel('projected', false);
          onProjSpanChange(null);
        }}
        title="Back to what has actually happened"
      >
        Clear
      </button>
    </div>
  ) : null;

  /**
   * **The way back out of an applied saved search**, and it takes the projected
   * line's shape because it is the same object: a line in the head saying what
   * the board is in, with the way out of it beside the words rather than under
   * them. Folded onto that selector rather than given rules that agree today —
   * the stylesheet's standing rule.
   *
   * **The tense is the shared notice's, and for its reason.** A search is a
   * reading that was *applied*; the board is the reader's own to change from
   * here, and a line reading `Showing Closers` would go on claiming so after
   * they had re-sorted and re-filtered it into something else. `Opened from`
   * stays true however far they take it — which is exactly what makes the
   * button beside it worth pressing, since the further they have taken it the
   * less they can reconstruct what was there before.
   *
   * **`Undo` rather than `Clear`**, one word off its neighbour, because they do
   * different things: `Clear` takes a lens off and leaves the board, and this
   * puts a whole board back. The two lines are never drawn together by
   * accident, either — a search remembers `projected`, so applying one that was
   * saved unprojected takes the lens off with it.
   *
   * It is not drawn on the team reading, where a search cannot be applied.
   */
  const undoSearchName = saved.undoSearchName;
  const undoLine = undoSearchName && !teams ? (
    <div className="research-proj-line research-undo-line">
      <span>
        <span className="research-proj-lead">Opened from</span> ·{' '}
        <strong className="research-undo-name">{undoSearchName}</strong>
      </span>
      <button
        type="button"
        className="research-clear"
        onClick={saved.onUndoSearch}
        title="Back to the board you had before this search was applied"
      >
        Undo
      </button>
    </div>
  ) : null;

  const controls = (
    <>
    <div className="view-tools">
      <div className="research-chrome">
          <div className="research-bar">
          {/* **One run, where there were three**, and it carries the mark the
              stick is read off — see `stuck`, and `.research-stick-line` for why
              the mark needs a box of its own rather than a place in this row.
              The run scrolls away and is replaced in place by a condensed copy
              of itself; with four buttons the copy is very nearly the run, which
              is the point — a bar you can hold in one line is a bar that does
              not need a second shape at every offset. */}
          <div className="research-stick-line">
            <div className="research-sentinel" ref={sentinelRef} aria-hidden="true" />
            <ScrollRow label="the board's controls" className="research-row">
              {rowMain}
            </ScrollRow>
          </div>
          </div>

          {/* **The bar that says you are reading somebody else's**, and it sits
              here — under the controls, above the table — because that is where
              the fact belongs: the board below it looks entirely ordinary, and
              without this there is nothing on screen to say the rows came out
              of a link. Inside the bar it would be a fourth run that is there
              almost never; below the table it would be under six hundred rows.

              It is not drawn on the team reading, where neither kind of shared
              thing can be in force. */}
          {saved.shared && !teams && (
            <SharedNotice
              shared={saved.shared}
              saving={saved.sharedSaving}
              onSaveAsMine={saved.onSaveSharedAsMine}
              onDismiss={saved.onDismissShared}
            />
          )}

          {/**
           * **Everything the bar no longer carries, in one box.**
           *
           * Thirteen controls, which is the *volume* argument `ColumnPicker`
           * already settled for this board: a panel several hundred pixels tall
           * wedged into the chrome pushes the table it describes down the page,
           * and on a phone takes the screen outright while pretending to be a
           * strip of controls. A dialog is the shape for that, and it is the
           * shape the two saved-thing boxes and the column picker beside it
           * already take — so opening the settings and opening Columns from
           * inside it are the same kind of gesture rather than two.
           *
           * **The two groups are the questions the bar's runs used to be**:
           * *which players* (the ownership sets, the watchlist and its chooser,
           * the saved searches) and *what to do with the board* (the clubs
           * lens, Filters, Starting, Schedule, the comparison, Projected,
           * Columns, Ranks). They are unchanged inside — the same components
           * from the same props calling the same callbacks — because the
           * change here is one of **place**, which is the same thing the
           * saved-thing panels' own move records.
           *
           * **A press that opens a panel closes this box** — `openPanel`, which
           * is where that is argued.
           *
           * **Drawn on the team reading too**, unlike the two below it, and the
           * box is simply shorter there: the controls that have no subject on a
           * board of clubs already take themselves off (`!teams`), which is a
           * rule they carried in from the bar and which reads the same inside a
           * dialog. What is left is Teams itself, Filters, Columns and Ranks —
           * and a gear that opened nothing would be the one control on this
           * board that lies about having anything behind it.
           */}
          {settingsOpen && (
            <Modal
              title="Board settings"
              titleId="research-settings-title"
              className="rl-dialog-box"
              onClose={() => setSettingsOpen(false)}
            >
              <div className="research-settings">
                {!teams && (
                  <div className="research-settings-group">
                    <h3 className="research-settings-head">Which players</h3>
                    {groupWho}
                  </div>
                )}
                <div className="research-settings-group">
                  <h3 className="research-settings-head">The board</h3>
                  {groupTools}
                </div>
              </div>
            </Modal>
          )}

          {/* **The watchlist chooser and the saved searches, as dialogs.**

              They were rows of the head with Search, Filters and the day strip,
              and they are the two of the five that are *lists of saved things*
              rather than a line of controls — see the note above `panels`, which
              keeps the reasoning that put them in the head and says what it
              missed. The move is a change of **place** and nothing else: the two
              components are unchanged but for the heading each dropped, the
              buttons keep `ui.panels` and their `.active` fill, and pressing a
              lit button still shuts the box exactly as it shut the panel.

              **Four ways out, which is what a modal owes** and three more than a
              panel had: the ✕, Escape, a press on the backdrop, and the button.
              The layer is `Modal`'s own — portalled to the body at the page's
              46, over the pinned chrome that opened them and over the full-page
              table box at 45, which is the rung `ColumnPicker` beside them
              already takes and for the same reason.

              **Exclusive, still.** `setPanel` shuts the others when one opens,
              so opening Lists closes Filters exactly as it did — which matters
              more now, not less: two of these are fixed boxes and a panel left
              open under one is a row of head the reader cannot see being
              changed. And each dialog's own state (a rename in progress, a
              half-pressed delete) needs no reset, being unmounted with the box.

              Drawn on `!teams` for the reason the buttons are: a watchlist is a
              list of players and a saved search remembers a position and an
              ownership set, neither of which is an operation on thirty clubs. */}
          {listsOpen && !teams && (
            <Modal
              title="Watchlists"
              titleId="research-lists-title"
              className="rl-dialog-box"
              onClose={() => setPanel('lists', false)}
            >
              <ListsPanel
                lists={saved.lists}
                activeId={saved.activeListId}
                max={saved.maxLists}
                onPick={saved.onPickList}
                onCreate={saved.onCreateList}
                onRename={saved.onRenameList}
                onDelete={saved.onDeleteList}
                onShare={(id: string, on: boolean) => saved.onShare('list', id, on)}
              />
            </Modal>
          )}
          {searchesOpen && !teams && (
            <Modal
              title="Saved searches"
              titleId="research-searches-title"
              className="rl-dialog-box"
              onClose={() => setPanel('searches', false)}
            >
              <SearchesPanel
                searches={saved.searches}
                max={saved.maxSearches}
                onApply={saved.onApplySearch}
                onSave={saved.onSaveSearch}
                onReplace={saved.onReplaceSearch}
                onRename={saved.onRenameSearch}
                onDelete={saved.onDeleteSearch}
                onShare={(id: string, on: boolean) => saved.onShare('search', id, on)}
                /* Applying a search closes the box, where picking a list leaves
                   it open — the asymmetry `ResearchLists.tsx` argues, and one
                   the dialog makes sharper rather than softer: a search's result
                   *is* the board underneath, which a modal is covering. */
                onClose={() => setPanel('searches', false)}
              />
            </Modal>
          )}

          {/* **A modal, where Search and Filters beside it are inline panels**
              — see `ColumnPicker.tsx` for why this one alone leaves the row,
              and for the whole of the press-and-press gesture inside it. The
              picker is shared with the player page's Stats tab; what stays
              here is the *policy* about the selection, which is this board's:
              a list that has come back to the defaults is stored as nothing at
              all, which is what keeps `cols=` out of a link that isn't saying
              anything and what makes a reset go on following the defaults as
              they change rather than pinning today's copy of them. */}
          {columnsOpen && (
            <ColumnPicker
              kind={kind}
              /* **The vocabulary in force**, which under the lens is its own
                 subset less the opponent — see `pickerColumns`. The picker is
                 handed a list and a selection and has no opinion about which
                 reading produced them, which is what lets one dialog serve
                 three tables. */
              all={pickerColumns}
              keys={orderedKeys}
              /* …and the write goes to that reading's own entry. The two are
                 kept apart for the reason the Stats tab's is: the lens lists a
                 strict subset, so one shared entry would let a write from here
                 drop every Statcast column from the measured board's list. A
                 selection that is just this reading's defaults is stored as
                 **nothing at all**, so a reset goes on following the defaults
                 as they change rather than pinning today's copy of them —
                 the policy is this board's on both branches. */
              onChange={(keys) =>
                projectedOn
                  ? onProjColumnsChange(
                      isDefaultProjectedColumns(kind, projection.oneDay, keys) ? null : keys,
                    )
                  : onColumnsChange(isDefaultColumns(kind, keys) ? null : keys)
              }
              onReset={() => (projectedOn ? onProjColumnsChange(null) : onColumnsChange(null))}
              canReset={projectedOn ? !!projColumnKeys : !!columnKeys}
              onClose={() => setPanel('columns', false)}
            />
          )}

      </div>
    </div>
    </>
  );

  return (
    <div ref={fullRef} className={`research-view${isFull ? ' is-expanded' : ''}`}>
      {/* **The fixture preview, drawn once for the whole board.** `Modal`
          portals it, so where it sits in this tree decides nothing about where
          it paints — only which state it can see, which is why it is here and
          not in the cell that opened it. The same reasoning, and the same
          placement, as the summary table's own.

          `fixtureLive` is tested as well as `fixture` because the surface that
          raised this box can be pressed off with it open — the Schedule mode,
          or the turn filter — and a preview of a fixture the board is no longer
          showing is a box about nothing. It compares the index the fixture came
          from against the two that are in force, which is the same test read
          for either door and needs no flag saying which opened it. */}
      {fixture && fixtureLive && fixture.row.teamId !== null && (
        <SchedulePreview
          report={{
            id: fixture.row.id,
            throws: openHand?.throws ?? null,
            /* Never carried on a board row — `splits` below is where his
               platoon line actually comes from, and this pair is what the
               roster's callers fill instead. */
            splitVsLeft: null,
            splitVsRight: null,
          }}
          splits={fixture.row.kind === 'pitcher' ? undefined : (splits[fixture.row.id] ?? {})}
          onRetrySplits={() => loadSplits(fixture.row.id)}
          game={fixture.game}
          index={fixture.index}
          teamId={fixture.row.teamId}
          name={fixture.row.name}
          isPitcher={fixture.row.kind === 'pitcher'}
          tier={startTierOn(fixture.index, fixture.game, fixture.row.teamId, fixture.row.id)}
          opp={
            opps[
              fixture.game.homeId === fixture.row.teamId
                ? fixture.game.awayId
                : fixture.game.homeId
            ]
          }
          onLoad={loadOpponent}
          onOpenDetails={onOpenDetails}
          onClose={() => setFixture(null)}
        />
      )}
      {/* **The whole page is in the pane**, and the pane is the one box on this
          view that scrolls (`.app.research-mode` is a viewport-tall flex column
          — see the stylesheet). Everything above the rows therefore scrolls
          away with them: the control set first, then the head, which stops at
          the top of the pane and stays there with the column headings holding
          directly under it.

          Rendered **whatever the board holds**, where the table it contains is
          not. Two reasons, and the second is the one that decided it. The pane
          is where the control set lives now, so a pane that came and went with
          the rows would take the controls with it — every button on the board
          unmounting and remounting on the keystroke that narrows it to nobody,
          which is a search field losing the caret mid-word. And an empty state
          reads under the count it explains, not on the far side of a hairline
          from it. */}
      <div className="research-scroll" ref={scrollRef} onScroll={onPaneScroll}>
        {/* **The whole control set again, condensed — on a rail that takes no
            room.**

            One run rather than three and marks rather than words: a reader who
            has scrolled into the table wants the table, and a control they can
            still *press* beats a badge that only says what it was set to. That
            is what let the badge row come down to the filters — everything else
            is a lit button here.

            **The rail is `height: 0`**, which is the whole of why the scroll no
            longer stalls. Drawn inside the head it grew that box by 52px on the
            stick, and a sticky box keeps its place in flow, so the rows moved;
            compensating with `scrollTop` cancels an iOS momentum scroll. With
            no height there is nothing to move and nothing to correct.

            **Drawn expanded from the first frame**, not only once stuck: that
            box covers the app's chrome, so the three-row bar is not merely
            scrolled away there, it is unreachable — which is the case the
            badge row was carrying alone and doing badly, before the run took
            it off that row and the chips took what was left.

            **First in the pane, ahead of the control set it replaces**, and
            that is what lets it land on the third row rather than under it.
            `position: sticky` can only ever hold a box *back* from where its
            flow would take it: drawn after the bar, this rail's flow line is
            the head's, 50px further down, so at the moment the stick fires it
            sat at 56 with the head pinned at 60 and the two overlapped —
            measured at 1200, scrollTop 100, run 56 → 116 across a head at
            60 → 91. Ahead of the bar its flow line is the top of the pane, so
            `top: 0` holds from the first frame it is drawn in, which is the
            frame the third row reaches that line. It costs the bar nothing to
            sit above it, the rail having no height. */}
        {(stuck || isFull) && (
          <div className="research-condensed-rail">
            <div className="research-condensed-inner" ref={condRef}>
            {/* **The tools lead this run, where the bar reads who → slice →
                tools**, and the stick is what turns that around. This run is
                drawn in the third row's own place now, so the controls that
                *were* standing there are the ones that must not move: led by
                the include marks instead, the five tools started 741px along a
                1,156px line at 1200 and Filters, Schedule, Columns and Ranks
                went behind the scroll arrow at the exact frame the row they
                live on stopped moving. Reading order belongs to a bar you read
                top to bottom; this is one line replacing one row. */}
            <ScrollRow label="the board's controls" className="research-row research-condensed">
              {rowMain}
            </ScrollRow>
            </div>
          </div>
        )}
        {/* The control set — see `controls`. The one thing in this pane that
            scrolls away, and it goes only as far as its third row: the mark
            inside that row (`.research-stick-line`) is what puts the condensed
            rail above on screen, in the place the row is standing in. */}
        {controls}

        {/* Suppressed behind a failed load, where "0 of 0 batters" would read as
            a finding about the league rather than as nothing having arrived. It
            stays under the controls rather than traveling up into the chrome
            with them: a board that failed to load is news about the table, the
            same argument that keeps App's own error banner outside the chrome. */}
        {error && <div className="error-banner">⚠ {error}</div>}

        {/* **The head of the table**: what the board is set to, and how much of
            it survived — the two things the reader needs on screen at row 400,
            where the controls that set them are a page above. It is the one box
            here that sticks, and the column headings stick under it at its
            *measured* height (`--research-head-h`).

            The count reads as the table's caption — how many rows the filters
            left, out of the board they were applied to. No season: the app
            shows one season and says so nowhere else on the page either.

            The wait and the answer arrive in the same place, which is why this
            is a `LoadingLine` rather than a block: the caption is the one line
            on the page that is about to hold the count, so the ball turning in
            it says the count is on its way. App keeps the rows it already has
            while a re-read is in flight (`loading` is gated on the cache being
            empty), so this can only ever be a board with nothing on it yet. */}
        <div className={`research-head${stuck ? ' is-stuck' : ''}`} ref={headRef}>

          {/* **The settings first, the count last.** They were one wrapping run
              with the count leading it, which is the shorter box and was chosen
              for that; what it got wrong is which of the two the *rows* are
              about. What qualifies the board — the window, the position, the
              include set, a threshold — is read before the count, which is a
              fact about the table immediately under it and so is the last thing
              before the first row.

              **The row that qualified it here was a badge row and is the chips
              now.** Both printed the same sentence off the same `filters`
              array; only one of them could be pressed. See `panels` above. */}
          {panels}
          {/* **The provenance line before the reading line**, which is the
              order the two are read in: *where this board came from*, then
              *what the figures in it are*. A search remembers the lens, so
              where both are drawn the second is a consequence of the first. */}
          {undoLine}
          {projSpanLine}
          {/* **The count and the marks are one line**, which is what the strip
              being *beside* the count rather than above it buys: the count is
              `418 of 640 pitchers` and the marks are why it is not 640, so the
              two are one sentence and reading them as one is the whole point.
              The count is pinned and the marks scroll past it — see
              `.research-count-row`.

              `role="status"` stays on the count alone. The marks are controls,
              and a live region that announced a row of buttons every time one of
              them changed would read the whole strip out on every press. */}
          {(loading || boardRows.length > 0 || marks.length > 0) && (
            <div className="research-count-row">
            {(loading || boardRows.length > 0) && (
            <div className="research-count" role="status">
              {loading ? (
                <LoadingLine>
                  {teams ? 'Reading the team leaderboard' : 'Reading the league leaderboard'}
                </LoadingLine>
              ) : comparing ? (
                /* **`3 of 3` says nothing**, which is what the ordinary count
                   line would read here: a comparison *is* its population, so
                   the numerator and the denominator are the same number by
                   construction. What a reader wants to know instead is what
                   they are looking at and what the badges mean — the color
                   is a claim about the league, and this is the sentence that
                   states it. Two clauses, in the order the reader needs them:
                   what the badge measures, then which way each hue runs. */
                <>
                  Comparing <strong>{visible.length}</strong>{' '}
                  {kind === 'pitcher' ? 'pitchers' : 'batters'} — each badge ranks that player on{' '}
                  {rankPopulationLabel}: warm is above the average of these {visible.length}, cool
                  is below.
                </>
              ) : (
                `${visible.length} of ${boardRows.length} ${
                  teams ? 'clubs' : kind === 'pitcher' ? 'pitchers' : 'batters'
                }`
              )}
            </div>
            )}
            {marks.length > 0 && (
              <div className="research-marks">
                {marks.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    className={`research-chip${m.onClear ? '' : ' is-flat'}`}
                    title={
                      m.title ||
                      (m.onClear ? undefined : 'Open the board settings to change this')
                    }
                    onClick={m.onClear ?? (() => setSettingsOpen(true))}
                  >
                    {m.label}
                    {m.onClear && (
                      <span className="research-chip-x" aria-hidden="true">
                        ×
                      </span>
                    )}
                  </button>
                ))}
                {/* Two or more, because `Clear all` beside a single mark is a
                    second button for what that mark's own `×` already does —
                    the same rule that keeps a kind tab off a board with one
                    kind on it. It clears every mark that has an undo; the
                    ownership set has none, and is deliberately not swept up by
                    a button whose word is *clear* into a state that shows
                    fewer rows rather than more. */}
                {marks.filter((m) => m.onClear).length > 1 && (
                  <button
                    type="button"
                    className="research-clear"
                    onClick={() => {
                      for (const m of marks) m.onClear?.();
                    }}
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}
            </div>
          )}
        </div>

        {!loading && !error && visible.length === 0 && boardRows.length > 0 && (
          <div className="empty-state">
            {/* **The days are named where they are what emptied it**, which is
                this board's own rule about an empty state: it names its own
                cause and the control that caused it. `narrowed` is everything
                the reader set *except* the days, so a board that had rows
                before the filter and none after it was emptied by the filter
                and by nothing else — and on a run of free agents that is the
                ordinary case rather than a corner, most days having nobody on
                a board of forty men. The general message would send the reader
                to loosen a threshold that is not what took the rows. */}
            {turnChip && narrowed.length > 0 ? (
              <>
                <p className="empty-title">Nobody here starts {turnChip}</p>
                <p>Pick other days under Starting, or clear it.</p>
              </>
            ) : (
              <>
                <p className="empty-title">No {teams ? 'clubs' : 'players'} match these filters</p>
                <p>Loosen a threshold or clear a filter above.</p>
              </>
            )}
          </div>
        )}

        {/* Every reason the board can be empty, each naming its own cause and
            the way out — see `emptyBoard`. */}
        {!loading && !error && boardRows.length === 0 && emptyBoard()}

        {visible.length > 0 && (
          <table className={`summary-table research-table${teams ? ' is-teams' : ''}`}>
            <thead>
              <tr>
                {/* **The comparison's own column, ahead of everything**, drawn
                    only while compare mode is on.

                    *(The ticks were in the name cell, after the star, and the
                    paragraph there argued it: "this is the sticky name column,
                    so a control ahead of the name pushes every name along by
                    its own width, and a control drawn all the time pays that on
                    every row for a comparison nobody is making." Both halves of
                    that are still true — this column is drawn **only** in
                    compare mode, so the second half costs nothing, and the
                    first is now the price rather than the objection.)*

                    What the name cell got wrong is that a tick is not a mark on
                    a name. Trailing the star, the newspaper, the padlock and
                    the baseball, it was the fifth glyph on a line of four
                    labels and one control — a checkbox in a row of facts, at
                    the far end of a name that truncates, in a different place
                    on every row because the marks ahead of it come and go. A
                    checkbox column is what a table of things you are choosing
                    between looks like: one edge, one axis, every box on it.

                    It is a `th` with a `sr-only` name rather than an empty cell,
                    so the column the ticks are in is announced as what it is,
                    and it takes no sort — there is nothing to order rows by
                    here that ticking them does not already say. */}
                {compareCol && (
                  <th className="research-cmp-col" scope="col">
                    <span className="sr-only">Compare</span>
                  </th>
                )}
                <th className="sum-img-col" scope="col">
                  <span className="sr-only">{teams ? 'Cap logo' : 'Headshot'}</span>
                  <ExpandButton isFull={isFull} onToggle={toggle} what="board" />
                </th>
                {/* Club and position used to be two columns of their own here
                    and are now the second line of this one — see the cell.

                    **A sort control on the team reading and a word on the
                    player one**, which is the same asymmetry the include
                    buttons and the position pills already carry: a control is
                    drawn where it has a subject. Thirty clubs is a list you
                    look a row up in, so A-to-Z is a reading of it and the
                    board opens on exactly that (see `defaultSortKey`); six
                    hundred players alphabetically is a phone book nobody
                    asked the research board for, and `Player` stays a word.

                    It takes `research-sort` for the button — the padding it
                    zeroes off the `th` is the padding the button puts back
                    from the same `--sort-gutter`, so the label stays on the
                    gutter the names below it start on — and **not `active`**,
                    whose rule pins the sorted column to whichever edge it is
                    passing. This column is the leftmost one and is already
                    pinned there above 820px; a second `left` on it would park
                    it past its own right edge. `is-sorted` is the lit state
                    alone. */}
                <th
                  className={`sum-name-col${
                    nameSortable
                      ? ` research-sort research-name-sort${
                          activeSortKey === NAME_KEY ? ' is-sorted' : ''
                        }`
                      : ''
                  }`}
                  scope="col"
                  /* `none` rather than absent while it is a control and
                     unsorted — that is what the stat headers say, and the
                     attribute's absence means "this column cannot be sorted",
                     which on this reading is untrue. Absent on the player
                     reading, where it is true. */
                  aria-sort={
                    !nameSortable
                      ? undefined
                      : activeSortKey === NAME_KEY
                        ? activeSortAsc
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                  }
                >
                  {nameSortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(NAME_COLUMN)}
                      title={NAME_COLUMN.title}
                    >
                      Team
                      {/* The arrow **trails** the label here, where every other
                          header leads with it. Same rule, opposite alignment:
                          the reservation is paid on the side away from the edge
                          the label is set against, so the label's own edge is
                          the cell's. Leading it on a left-aligned column pushed
                          `TEAM` 11px inside the gutter its thirty club names
                          are set on. */}
                      <span className="research-arrow" aria-hidden="true">
                        {activeSortKey === NAME_KEY ? (activeSortAsc ? '▲' : '▼') : ''}
                      </span>
                    </button>
                  ) : (
                    'Player'
                  )}
                </th>
                {columns.map((c) => {
                  const active = activeSortKey === c.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      className={`sum-num research-sort${active ? ' active' : ''}`}
                      aria-sort={active ? (activeSortAsc ? 'ascending' : 'descending') : 'none'}
                    >
                      <button type="button" onClick={() => toggleSort(c)} title={c.title}>
                        {/* The arrow leads the label rather than trailing it, and
                            that is an alignment decision rather than a stylistic
                            one. It reserves its width on every column, sorted or
                            not, so that clicking a header doesn't shove every
                            column right of it along — but reserved *after* the
                            label it pushed the label 11px (8px arrow + 3px gap)
                            inside the edge the numbers right-align to, so no
                            header sat over its own column. Ahead of the label,
                            the reservation is still paid and the label's right
                            edge is the cell's, exactly like the values below. */}
                        <span className="research-arrow" aria-hidden="true">
                          {active ? (activeSortAsc ? '▲' : '▼') : ''}
                        </span>
                        {/* A string for every column in the app but one: the
                            Schedule view's days are two lines (`Fri` over
                            `8/15`), which is what keeps a day column as narrow
                            as the matchup under it. */}
                        {c.headNode ?? c.label}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {drawn.map((r) => {
                const key = `${r.kind}-${r.id}`;
                const posCell = teams
                  ? { text: '', title: '' }
                  : posCellText(r, posCodes);
                return (
                  <tr key={key}>
                    {compareCol && (
                      <td className="research-cmp-col">
                        <CompareTick
                          on={compareSelected.includes(key)}
                          /* Full and not ticked: the row declines rather than
                             dropping somebody to make room, and says why. */
                          full={
                            compareSelected.length >= maxCompare &&
                            !compareSelected.includes(key)
                          }
                          max={maxCompare}
                          name={r.name}
                          onToggle={() => onToggleCompare(key)}
                        />
                      </td>
                    )}
                    <td className="sum-img-col">
                      {/* **The cap logo where the headshot is** — a club has no
                          face, and the mark MLB serves by team id is the one
                          picture of a club this app already draws. None of the
                          headshot's marks come with it: the lineup pip is a
                          batting order and the status code is an injury
                          designation, and neither is a fact about thirty men
                          at once. */}
                      {teams ? (
                        <TeamPhoto teamId={r.teamId} team={r.team} onOpen={onOpenTeam} />
                      ) : (
                        <ResearchPhoto row={r} playerKey={key} onOpen={onOpenDetails} />
                      )}
                    </td>
                    <td className="sum-name-col">
                      {/* **Club and position, under the name.** They were two
                          columns of their own — `Tm` and `Pos` — and on the
                          app's widest table that is ~110px of a row spent on
                          two facts about *who the player is*, beside a name
                          that is the same kind of fact and has a column that
                          absorbs the table's slack anyway. Underneath, they
                          cost the stats nothing and read as what they are: the
                          identity block, the way a player card's header
                          already sets a name over its context line.

                          The block itself is `PlayerIdentity`, shared with the
                          summary table, which draws the same two facts under
                          the same name for the same reason — see there, and
                          `PhotoStatus` for the rule that says two tables which
                          merely resemble each other are two tables that will
                          one day differ. What this row supplies is its own name
                          line: the board trails a name with the roster baseball
                          and the watchlist star, where the summary table leads
                          it with a fantasy slot chip. */}
                      {/* **The team reading swaps the block and drops every
                          mark on the line.** `TeamIdentity` is the same two
                          rows in the same classes with the club's record where
                          the position list was — see there. The name **is** a
                          link now, there being a club page behind it at last
                          (this sentence read "plain text rather than a link,
                          there being no club page behind it" and was true of
                          the app it was written in); and none of the four marks
                          is drawn,
                          because each of them is a fact about a *person*. The
                          baseball and the padlock say who owns him, which no
                          fantasy league can say of the Brewers; the newspaper
                          reads a per-player news map with no club entry; and
                          the star adds a `${kind}-${id}` key to a watchlist of
                          players. Each would be a mark on no row or on every
                          row, and the rule for both is the same. */}
                      {teams ? (
                        <TeamIdentity record={r.record ?? null}>
                          <button
                            type="button"
                            className="sum-name-link"
                            onClick={() => r.teamId !== null && onOpenTeam(r.teamId)}
                          >
                            {r.name}
                          </button>
                        </TeamIdentity>
                      ) : (
                      <PlayerIdentity
                        teamId={r.teamId}
                        team={r.team}
                        pos={posCell}
                        playerId={r.id}
                        kind={r.kind}
                      >
                      <button
                        type="button"
                        className="sum-name-link"
                        onClick={() => onOpenDetails(key)}
                      >
                        {r.name}
                      </button>
                      {/* Two marks, two different lists, and keeping them
                          distinct is the point of the pair. The **baseball** is
                          the same one `PlayerDetails` shows beside "On roster"
                          and says exactly that; it is suppressed when your
                          roster is all that is on the board, where every row
                          would carry one and so it would mark nothing. The
                          **star** is the watchlist, and is a control rather
                          than a label — it is on every row, because the point
                          of it is to be pressed. */}
                      {!onlyMine && rosterKeys.has(key) && (
                        <span
                          className="research-watched"
                          title={`${r.name} is on your roster`}
                        >
                          <BaseballMark size={13} width={2.4} />
                          <span className="sr-only">On your roster</span>
                        </span>
                      )}
                      {/* And the **lock**, which is the baseball's opposite
                          number: not yours, and not available to become yours.
                          It is drawn on the same terms — only where a league
                          says so, only where it distinguishes this row from the
                          ones around it (`onlyOthers`), and never on a row
                          already wearing the baseball, since the two answer the
                          same question and a name carrying both would invite a
                          reader to look for a difference that isn't there. */}
                      {!onlyOthers && !rosterKeys.has(key) && ownedElsewhere?.has(r.id) && (
                        <LockMark name={r.name} team={ownedElsewhere.get(r.id) as string} />
                      )}
                      {/* And the **newspaper**, which is a different kind of
                          fact from the two above it and so sits after both:
                          those two answer *whose* he is, this one answers what
                          has happened to him. It is last among the labels and
                          ahead of the star, which is the only control on the
                          line.

                          Unsuppressed, unlike the baseball — that mark is
                          hidden when every row would carry one, and this one
                          cannot reach that state: 285 of the league's 1,386
                          players were inside the window when this was measured,
                          so it always distinguishes the row it is on. */}
                      <PlayerNewsMark id={r.id} name={r.name} />
                      <WatchStar
                        /* **The reader's own list**, never the shared one —
                           see `ownWatchlistKeys`. */
                        on={ownWatchlistKeys.has(key)}
                        name={r.name}
                        onToggle={(on) => onWatchlistToggle(key, on)}
                      />
                      {/* *(The compare tick was the fifth mark on this line,
                          after the star. It is a column of its own at the head
                          of the row now — see the `th` in `thead`, which keeps
                          the paragraph that put it here.)* */}
                      </PlayerIdentity>
                      )}
                    </td>
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`sum-num${activeSortKey === c.key ? ' research-sorted' : ''}${
                          c.cellClass ? ` ${c.cellClass(r) ?? ''}` : ''
                        }${comparing ? ' research-cmp-cell' : ''}`}
                        title={comparing ? compareTitle(c, r) : undefined}
                      >
                        {/* **The heat is a badge around the value, not a wash
                            over the cell.** A tinted cell is a *block* — it runs
                            the column's full width whatever the number in it is,
                            so a table of them reads as a checkerboard rather
                            than as figures worth comparing, and it fights the
                            zebra and the sorted column's own tint for the same
                            ground. Round the figure it is the park strip's own
                            shape (`.pf-fig-val`), which is where this app
                            already draws a number wearing a hot/cold reading.

                            Drawn whenever a comparison is in force, tint or no
                            tint: an untinted badge is invisible, and a box that
                            appeared and vanished per column would step the
                            numbers in and out down a row. */}
                        {comparing ? (
                          <span className="research-cmp-badge" style={compareTint(c, r)}>
                            {c.format(r)}
                          </span>
                        ) : (
                          c.format(r)
                        )}
                        {/* …and the percentile under it, when the reader has
                            asked for one. A second line rather than something
                            beside the value, because this table cannot afford
                            the width — see `RankBadge`. */}
                        {ranks && (
                          <RankBadge
                            col={c}
                            scale={ranks.get(c.key)}
                            value={c.value(r)}
                            kind={kind}
                            asRank={teams}
                            noun={rankNoun}
                            population={rankPopulationLabel}
                            qualified={r.qualified}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {/* The foot of the board: the mark that says the next page is coming.
              See `PAGE_BEAT` for why it is held up at all — the rows are in
              memory, so without the beat it would never paint.

              **The strip is reserved whenever there are rows still to come**,
              rather than appearing with the mark, because it is inside the
              scroller: a box that came and went would take 44px out of
              `scrollHeight` under a reader sitting at the very bottom of it,
              which is a jolt every page. It goes for good on the last page,
              where it would be a strip promising something that isn't coming.

              **Sticky on the inline axis**, which the two pinned columns beside
              it already are and for the same reason: this is the app's widest
              table, and a block child of the scroller is only ever as wide as
              the pane — left alone it sits off the left edge of the screen the
              moment the reader is out at Chase%, which is where a mark about
              the foot of the list would be least use. */}
        {shown < visible.length && <PageMore loading={loadingMore} what="players" />}
      </div>
    </div>
  );
}
