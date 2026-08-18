import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BaseballMark } from './BaseballMark';
import { LockGlyph, LockMark } from './LockMark';
import { PlayerNewsMark } from './NewsMark';
import { LoadingBlock, LoadingLine } from './Loading';
import { ExpandButton } from './ExpandButton';
import { PhotoSpot, PhotoStatus, useStatusBadge } from './PhotoStatus';
import { createPortal } from 'react-dom';
import { ColumnPicker, ColumnsButton } from './ColumnPicker';
import { RankBadge, RanksButton, rankScales } from './columnRanks';
import { ScheduleSpanTabs, ScheduleToggle } from './ScheduleControl';
import {
  defaultScheduleSpan,
  effectiveSpan,
  scheduleColumns,
  spanLabel,
} from './schedule';
import type { ScheduleIndex, ScheduleSpan } from './schedule';
import {
  PlayerStatusContext,
  useFullPage,
  usePlayerStatus,
} from '../hooks';
import { RESEARCH_INCLUDE_KEYS, RESEARCH_WINDOWS } from '../types';
import type {
  MatchupWindow,
  PlayerKind,
  ResearchIncludeKey,
  ResearchRow,
  ResearchWindow,
  TrendWindow,
} from '../types';
import {
  eligibleCodes,
  headshotUrl,
  positionCell,
  searchFold,
  statusCorner,
} from '../lib';
import { PlayerIdentity } from './PlayerIdentity';
import {
  BATTER_COLUMNS,
  DEFAULT_SORT,
  defaultColumnKeys,
  isDefaultColumns,
  OPPONENT_KEY,
  opponentColumn,
  PITCHER_COLUMNS,
  TREND_BY_KEY,
  trendKey,
} from './researchColumns';
import type { Column } from './researchColumns';
// Re-exported so every existing importer of these three (App, and any `cols=`
// link handling that grows later) goes on naming this file: the *selection* is
// a board setting, and the board is what App is configuring, even though the
// vocabulary behind it now lives next door.
export { defaultColumnKeys, isDefaultColumns, toColumnKeys } from './researchColumns';

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
 * behaviour the whole pitching board had until now, window and all. It is
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

/** A pill that filters at all — anything but the two whole-board entries. */
const filtersRows = (p: PositionOption) => Boolean(p.codes);

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
 * The same eleven, in the same order, cut into the three runs they already read
 * as. Only the phone's dropdown uses them: a row of pills shows the whole set
 * at once and needs no headings, where a closed select shows one.
 */
const POSITION_GROUPS: { label: string; positions: PositionOption[] }[] = [
  { label: 'Board', positions: POSITIONS.filter((p) => !filtersRows(p)) },
  { label: 'Batting', positions: POSITIONS.filter((p) => filtersRows(p) && p.kind === 'batter') },
  { label: 'Pitching', positions: POSITIONS.filter((p) => filtersRows(p) && p.kind === 'pitcher') },
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

const includeKeys = (i: ResearchInclude): ResearchIncludeKey[] =>
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
    // Nothing recognised — an older build's spelling — falls back to the
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
  return <>{code}</>;
}

const includeMeta = (k: ResearchIncludeKey, connected: boolean) =>
  (!connected && INCLUDE_META[k].solo) || INCLUDE_META[k];

export function researchKindFor(pos: ResearchPos): PlayerKind {
  return POSITION_BY_KEY.get(pos)?.kind ?? 'batter';
}

/** Narrows an unrecognised `pos=` from the URL back to the default board. */
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

// ---- Component ------------------------------------------------------------

interface Props {
  rows: ResearchRow[];
  kind: PlayerKind;
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
  /** Put a player on the watchlist, or take him off. */
  onWatchlistToggle: (key: string, on: boolean) => void;
  /** Open the details overlay (percentiles, game log, season splits) for a row.
   *  Takes a player key, the same currency the rest of the app navigates in. */
  onOpenDetails: (key: string) => void;
  /** The board's own settings, held by App so leaving the page doesn't throw
   *  them away — see `ResearchUi`. The updater form only, since every change
   *  here is a patch of one field of one board. */
  ui: ResearchUi;
  onUiChange: (update: (prev: ResearchUi) => ResearchUi) => void;
  /** Where the control set renders: a box App keeps inside the pinned chrome,
   *  so the research page has one top section rather than a band of controls
   *  stacked under the app's own. Null on the first render — App has to have
   *  committed the element before it can be handed over — and the bar simply
   *  isn't drawn for that one frame, which happens before paint. */
  controlsHost: HTMLElement | null;
}

/** An unrecognised `win=` is the season, matching `toResearchPos`'s rule and the
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
 * **And it grows on scroll rather than on a `Load more` button**, unlike the
 * feed and the game log. Those two are *lists* whose end is a real place — the
 * button says how many are left and hands the reader the choice. A leaderboard
 * has no end worth stopping at; the reader is looking for a name or a run of
 * rows, and a button between row 50 and row 51 is a control asking permission
 * to carry on doing the one thing the page is for. What the app's "no silent
 * caps" rule asks for is that nothing be hidden, and nothing is: the count
 * line above the table still says how many rows the filters left, and every
 * one of them is one scroll away.
 */
const PAGE_SIZE = 50;

/**
 * How far off the foot of the pane the next page is asked for.
 *
 * **Deliberately short — the strip below has to be on screen when it fires.**
 * The instinct is to prefetch early and never let the reader see the end of the
 * list, and it is the wrong instinct here for a reason particular to this table:
 * the rows are already in hand, so the next page appears in the frame after it
 * is asked for, and a page asked for ten rows early lands 600px below the fold
 * — the reader gets fifty more rows with nothing anywhere to say where they came
 * from. Two hundred is the footer strip and a row or two, so the mark that says
 * the board is growing is in view at the moment it goes up.
 */
const LOAD_AHEAD = 200;

/**
 * How long the mark at the foot of the table stays up before the rows land.
 *
 * **Nothing is being fetched, which is exactly why there is a beat at all.**
 * `visible` is already in memory — the page is a `slice` — so a flag set and
 * cleared in one commit would be a spinner that never painted, and the reader
 * would get fifty rows out of nowhere. This is `MIN_SPIN`'s own argument
 * (a mark a press put up holds a floor so the press leaves a trace) applied to
 * a scroll instead of a press, and it is the same 450ms: long enough to read as
 * a beat, short enough that the reader is still scrolling through it.
 *
 * It costs nothing in reach. `LOAD_AHEAD` fires while there are still rows
 * under the fold, so the beat is spent on rows the reader has not got to yet
 * rather than on a table that has stopped.
 */
const PAGE_BEAT = 450;

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
export interface ResearchUi {
  boards: Record<PlayerKind, BoardState>;
  /** Which disclosures are open (Columns being a dialog rather than a panel,
   *  but held here with the other two: it is the same kind of state). An open
   *  panel is part of where you were:
   *  coming back to find the Filters panel shut is the same surprise as coming
   *  back to find it empty. */
  panels: { search: boolean; filters: boolean; columns: boolean };
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
  boards: { batter: freshBoard(), pitcher: freshBoard() },
  panels: { search: false, filters: false, columns: false },
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
  rows,
  kind,
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
  onWatchlistToggle,
  onOpenDetails,
  ui,
  onUiChange,
  controlsHost,
}: Props) {
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
  const allColumns = useMemo(() => {
    const base = kind === 'pitcher' ? PITCHER_COLUMNS : BATTER_COLUMNS;
    return base
      .filter((c) => (c.key === 'rosterPct' ? hasRosterPct : true))
      // The one column whose cells read something other than the row. Injected
      // here for the reason a trend column's label is: the array above is the
      // canonical *order*, and runtime is where the data to fill it arrives.
      .map((c) => (c.key === OPPONENT_KEY ? opponentColumn(statuses) : c))
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
  }, [kind, hasRosterPct, measured, statuses]);
  const columnsByKey = useMemo(
    () => new Map(allColumns.map((c) => [c.key, c])),
    [allColumns],
  );
  // **The list is the order**, which it was not until the columns became
  // reorderable: the keys used to be read into a `Set` and the table rendered
  // `allColumns.filter(...)`, so the arrangement was always the board's own
  // however the keys arrived. Now the arrangement is the reader's, and the
  // array is what carries it — through the URL, through the saved preference,
  // and into the header row below. The set is kept beside it for the half-dozen
  // membership tests that don't care about order (the picker's ticks, the
  // sort's "is this column still shown").
  const orderedKeys = useMemo(
    () => columnKeys ?? defaultColumnKeys(kind),
    [columnKeys, kind],
  );
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
  const columns = useMemo(() => {
    if (schedule) return scheduleColumns(schedule, kind);
    const byKey = new Map(allColumns.map((c) => [c.key, c]));
    // `filter(Boolean)` rather than a fallback: a key with no column on this
    // board is one the board doesn't have — Ros% without a league, a trend
    // window with no baseline — and dropping it is what those two rules
    // already do. A saved list keeps the key, so connecting a league puts the
    // column back where the reader had it.
    return orderedKeys.map((k) => byKey.get(k)).filter((c): c is Column => c !== undefined);
  }, [allColumns, orderedKeys, schedule, kind]);
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
      new Set(schedule ? [...columns.map((c) => c.key), ...orderedKeys] : orderedKeys),
    [schedule, columns, orderedKeys],
  );
  /** The columns actually on screen, by key. The sort resolves through this
   *  first and `columnsByKey` second: in schedule mode the sorted column is a
   *  day and exists nowhere in the stat vocabulary, and out of it the fallback
   *  is what preserves the old behaviour of sorting by a column the reader has
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
  const { search: searchOpen, filters: filtersOpen, columns: columnsOpen } = ui.panels;
  const setPanel = (which: keyof ResearchUi['panels'], on: boolean) =>
    onUiChange((u) => ({ ...u, panels: { ...u.panels, [which]: on } }));

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
  const board = boards[kind];
  /** Change the board on screen, leaving the other one alone. */
  const patchBoard = (next: Partial<BoardState> | ((b: BoardState) => Partial<BoardState>)) =>
    onUiChange((u) => ({
      ...u,
      boards: {
        ...u.boards,
        [kind]: { ...u.boards[kind], ...(typeof next === 'function' ? next(u.boards[kind]) : next) },
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
   * labelled free agents is not. The watchlist is exempt from that wait for the
   * same reason it is unioned — it needs no ownership to be known.
   */
  /** The board's own population — everyone of this trade on this window's
   *  leaderboard, before any pill or button. It is what `boardRows` narrows,
   *  and it is what the percentile badges are ranked within; see
   *  `boardPopulation` and `columnRanks.tsx`. */
  const population = useMemo(() => boardPopulation(rows, kind), [rows, kind]);
  const boardRows = useMemo(() => {
    const byTrade = population;
    return byTrade.filter((r) => {
      const key = `${r.kind}-${r.id}`;
      if (includeWatchlist && watchlistKeys.has(key)) return true;
      if (rosterKeys.has(key)) return include.mine;
      if (!espnConnected) return include.fa;
      if (!ownedIds) return false;
      return ownedIds.has(r.id) ? include.others : include.fa;
    });
  }, [population, include, includeWatchlist, rosterKeys, watchlistKeys, ownedIds, espnConnected]);

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
  const ranks = useMemo(
    () => (showRanks && !schedule ? rankScales(columns, population) : null),
    [showRanks, columns, population, schedule],
  );
  /** What a badge says it is ranked against — the board and the span, in
   *  words, since a 7-day percentile and a season one are different claims. */
  const rankPopulationLabel = `the ${windowLabel(statWindow)} board`;

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
  const defaultSortKey =
    hasRosterPct && visibleKeys.has('rosterPct') ? 'rosterPct' : DEFAULT_SORT[kind];
  const activeSortKey =
    sortKey && visibleKeys.has(sortKey) ? sortKey : defaultSortKey;

  // Memoised on the pill alone: a fresh closure every render would break the
  // `visible` memo below, which lists this among its dependencies.
  const posMatch = useMemo(() => positionMatcher(pos), [pos]);
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
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const measure = () => {
      const head = box.querySelector('thead tr');
      if (!head) return;
      const img = head.querySelector<HTMLElement>('.sum-img-col');
      const name = head.querySelector<HTMLElement>('.sum-name-col');
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
      const pin =
        img.offsetWidth + (name && pinnedAcross(name) ? name.offsetWidth : 0);
      box.style.setProperty('--research-pin-left', `${pin}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  });

  const posRowRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const row = posRowRef.current;
    const tab = row?.querySelector<HTMLElement>('.research-pos-tab.active');
    if (!row || !tab) return;
    const left = tab.offsetLeft - row.offsetLeft;
    const overLeft = left - row.scrollLeft;
    const overRight = left + tab.offsetWidth - (row.scrollLeft + row.clientWidth);
    // A pill flush with either edge reads as cut off, so land it a pill's worth
    // inside — which also hints there is more row to swipe to.
    const PEEK = 44;
    if (overLeft < 0) row.scrollLeft += overLeft - PEEK;
    else if (overRight > 0) row.scrollLeft += overRight + PEEK;
  }, [pos]);

  /** The mark at the foot of the table, and the timer holding it up — see
   *  `PAGE_BEAT`, which is why there is a timer at all when the rows are
   *  already in memory. */
  const [loadingMore, setLoadingMore] = useState(false);
  const beat = useRef<number | null>(null);
  // A beat outlives nothing: it is cancelled when the table changes under it
  // (the signature effect below) and when the board goes away.
  useEffect(
    () => () => {
      if (beat.current !== null) clearTimeout(beat.current);
    },
    [],
  );

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
    activeSortKey,
    sortAsc,
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
  const placedSignature = useRef(boardSignature);
  useLayoutEffect(() => {
    if (placedSignature.current === boardSignature) return;
    placedSignature.current = boardSignature;
    // A layout effect, so the new rows are never painted once at the old
    // offset before being yanked to the top.
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    // The reading position goes back to the top with the scroll, and for the
    // same reason: a page into a table is a fact about *that* table, and this
    // is a different one. It is also what stops a reader who had 400 rows open
    // paying for 400 rows of a board they have just narrowed to shortstops.
    onUiChange((u) => (u.shown === PAGE_SIZE ? u : { ...u, shown: PAGE_SIZE }));
    // And a beat in flight is a beat about the table that has just gone: left to
    // fire it would add a page to the one that replaced it, fifty rows into a
    // board the reader has this second narrowed to shortstops.
    if (beat.current !== null) {
      clearTimeout(beat.current);
      beat.current = null;
      setLoadingMore(false);
    }
  }, [boardSignature]);

  const visible = useMemo(() => {
    // Folded exactly as the rows are, so `garcia` finds García and `García`
    // finds him too, and so `crow-armstrong` and `crow armstrong` are one query.
    const q = searchFold(search);
    const out = boardRows.filter((r) => {
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

    const col = drawnByKey.get(activeSortKey) ?? columnsByKey.get(activeSortKey);
    if (!col) return out;
    const dir = sortAsc ? 1 : -1;
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
  }, [
    boardRows,
    search,
    searchText,
    posMatch,
    filters,
    activeSortKey,
    sortAsc,
    columnsByKey,
    drawnByKey,
  ]);

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
   * Ask for the next page if the foot of the pane is within `LOAD_AHEAD`.
   *
   * A scroll handler on the pane rather than an `IntersectionObserver` on a
   * sentinel row, and the axis is why: this is the app's widest table and the
   * pane scrolls in **both** directions, so a marker element is off the
   * horizontal viewport whenever the reader is out at Chase% and an observer
   * would quietly stop loading exactly there. `scrollTop` against
   * `scrollHeight` asks the vertical question alone and cannot be confused by
   * the other axis. The read is three layout properties on an event the
   * browser is already dispatching, which is cheaper than it looks and cheaper
   * than the row it saves mounting.
   */
  const wantMore = () => {
    const el = scrollRef.current;
    if (!el) return;
    // One beat at a time: a scroll fires this every frame, and re-arming on each
    // of them would collapse the beat and stack a page per frame.
    if (beat.current !== null) return;
    if (shown >= visible.length) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > LOAD_AHEAD) return;
    setLoadingMore(true);
    beat.current = window.setTimeout(() => {
      beat.current = null;
      setLoadingMore(false);
      onUiChange((u) => (u.shown >= visible.length ? u : { ...u, shown: u.shown + PAGE_SIZE }));
    }, PAGE_BEAT);
  };

  // And once after each page lands, for the case a scroll event cannot cover:
  // a pane taller than the page it was given. `PAGE_SIZE` is chosen so that
  // cannot happen with real rows, so this is a guard rather than a mechanism —
  // and it terminates either way, `wantMore` stopping dead once every row of
  // `visible` is drawn.
  useEffect(wantMore, [shown, visible.length]);

  function toggleSort(col: Column) {
    if (activeSortKey === col.key) {
      setSortAsc((v) => !v);
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

  return (
    <div ref={fullRef} className={`research-view${isFull ? ' is-expanded' : ''}`}>
      {/* Expanded, the board's whole control set is hidden — but a table you
          cannot see the controls of is a table you cannot read: "of 622" means
          nothing without knowing it is the 30-day window, free agents only, and
          shortstops. So every setting that is doing something states itself as
          a badge. Labels, not controls: the app's round pill is the shape it
          reserves for things you read, and the way to change any of them is the
          same button that got you here. */}
      {isFull && (
        <div className="expanded-chrome research-badges">
          <span className="research-badge">{POSITION_BY_KEY.get(pos)?.label ?? pos}</span>
          {/* One badge per set the board is including — the watchlist among
              them, since it is one of the sets the board is a union of rather
              than a filter over them — or one saying it is including none,
              which is a state the buttons can reach and a blank row would leave
              unexplained. */}
          {nothingIncluded ? (
            <span className="research-badge">Nobody included</span>
          ) : (
            includeKeys(include).map((k) => (
              <span key={k} className="research-badge">
                {includeMeta(k, espnConnected).full}
              </span>
            ))
          )}
          {includeWatchlist && <span className="research-badge">Watchlist</span>}
          {/* The badges under the values are a setting like any other, and one
              the reader most needs named here: expanded there is no toggle on
              screen to explain a second number in every cell. */}
          {showRanks && !schedule && (
            <span
              className="research-badge"
              title={`Every value carries its percentile against the whole ${windowLabel(
                statWindow,
              )} board — 100 is best`}
            >
              Ranks
            </span>
          )}
          {/* **What span of days the columns are**, which expanded is the one
              thing nothing else on screen can say: the toggle and its span tabs
              are behind this box, and a grid of dates whose header says `Fri
              8/15` still leaves "how far does this run" unanswered. The rule
              this row exists for — a table narrowed with nothing on screen to
              say why — applies to a table *widened* into the future exactly as
              it does to one narrowed to shortstops. */}
          {scheduleSpan !== null && (
            <span
              className="research-badge"
              title={
                schedule
                  ? `Every club's games from ${schedule.dates[0]} to ${
                      schedule.dates[schedule.dates.length - 1]
                    }`
                  : 'The days ahead, still loading'
              }
            >
              {/* The span in its own words — a named one reads `Schedule ·
                  this matchup` where a numeric one reads `next 7 days`, since
                  a badge saying "next matchup days" would be nonsense and a
                  badge saying "7" over a fortnight of columns would be a lie.
                  `spanLabel` is the same wording the pills carry, lower-cased
                  into the badge's own sentence. */}
              Schedule ·{' '}
              {spanLabel(effectiveSpan(scheduleSpan, matchupWindow), matchupWindow)
                .label.replace(/^Next (\d+)$/, 'next $1 days')
                .toLowerCase()}
            </span>
          )}
          <span className="research-badge">{windowLabel(statWindow)}</span>
          {search.trim() && <span className="research-badge">“{search.trim()}”</span>}
          {filters.map((f) => (
            <span key={f.id} className="research-badge">
              {columnsByKey.get(f.column)?.label ?? f.column} {OP_LABEL[f.op]} {f.label}
            </span>
          ))}
        </div>
      )}
      {/* **The control set renders in the app's pinned chrome, not here.**
          `.app-chrome` is the header, the search bar and the view tabs in one
          box — everything that says where you are and what you are looking at —
          and this bar is the rest of that sentence on this page: which players,
          which span, which position, which columns. Left below the box it read
          as a second control area stacked under the first, two bands of chrome
          with a hairline between them and nothing to say why.

          A portal rather than a move, because the alternative is to lift the
          bar into App and the bar is inseparable from the board's *vocabulary*
          — the column list, the visible set, the filter builder, every one of
          which the table beneath also reads. Portalling relocates the DOM and
          leaves that where it belongs; lifting would split this file in two and
          thread a dozen values back down. The one price is the host having to
          exist first, which is the `controlsHost &&` below.

          The include buttons, the window tabs, the positions and the five
          disclosure buttons all share one wrapping row: every group is only as
          wide as its own content, so on a desktop the whole control set fits on
          a single line, and the row breaks to two (or three) as the screen
          narrows. */}
      {controlsHost &&
        createPortal(
          <>
          <div className="research-bar">
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
          <div className="research-include" role="group" aria-label="Which players">
            {RESEARCH_INCLUDE_KEYS.filter(
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
          {/* Out in the bar rather than inside the Filters panel: it decides which
              games every number on the board is drawn from, which is too large a
              thing to keep behind a disclosure — and being always visible, it needs
              no chip to say what it is set to. */}
          <div className="research-window-row" role="tablist" aria-label="Time span">
            {RESEARCH_WINDOWS.map((w) => (
              <button
                key={String(w)}
                type="button"
                role="tab"
                aria-selected={statWindow === w}
                className={`research-window-tab${statWindow === w ? ' active' : ''}`}
                onClick={() => onWindowChange(w)}
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
          {/* The same tabs as a dropdown, for a phone. It keeps the tabs' short
              labels: a native select is as wide as its widest option, and "Last 60
              days" would cost back the width this is here to save. */}
          <select
            className="research-window-select"
            value={String(statWindow)}
            onChange={(e) => onWindowChange(toResearchWindow(e.target.value))}
            aria-label="Time span"
          >
            {RESEARCH_WINDOWS.map((w) => (
              <option key={String(w)} value={String(w)}>
                {windowLabel(w)}
              </option>
            ))}
          </select>
          <div className="research-positions" role="tablist" aria-label="Position" ref={posRowRef}>
            {POSITIONS.map((p) => (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={pos === p.key}
                className={`research-pos-tab${pos === p.key ? ' active' : ''}`}
                title={(hasEligibility && p.espnTitle) || p.title}
                onClick={() => onPosChange(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* The eleven pills as one dropdown, for a phone. The pills' own labels,
              which are two characters wide by design, are grouped under headings
              here — a select shows one option at a time and "SS" alone in a closed
              box says less than it does in a row with C and 1B beside it. Short
              headings, because an optgroup label counts toward the width the same
              way an option does. */}
          <select
            className="research-pos-select"
            value={pos}
            onChange={(e) => onPosChange(e.target.value as ResearchPos)}
            aria-label="Position"
          >
            {POSITION_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.positions.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

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
            {/* Search and Filters lead the run — the two disclosures you come to
                the board with a question in. Each carries an `on` state whenever
                its panel holds something, open or shut: a collapsed control must
                never be the only place a filter lives. */}
            <button
              type="button"
              className={`research-toggle${searchOpen ? ' active' : ''}${
                search.trim() ? ' on' : ''
              }`}
              aria-expanded={searchOpen}
              onClick={() => setPanel('search', !searchOpen)}
              title="Search the league by name"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <span className="research-toggle-label">Search</span>
            </button>
            <button
              type="button"
              /* `.on` means the panel *holds* something, whether it is open or
                 shut. The window used to count here; it is out in the bar now and
                 speaks for itself. */
              className={`research-toggle${filtersOpen ? ' active' : ''}${
                filters.length ? ' on' : ''
              }`}
              aria-expanded={filtersOpen}
              onClick={() => setPanel('filters', !filtersOpen)}
              title="Filter the board by a stat threshold"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M3 5h18l-7 8v6l-4 2v-8Z" />
              </svg>
              <span className="research-toggle-label">Filters</span>
              {filters.length > 0 && <span className="research-toggle-count">{filters.length}</span>}
            </button>
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
            <button
              type="button"
              className={`research-toggle${includeWatchlist ? ' on' : ''}`}
              aria-pressed={includeWatchlist}
              onClick={() => onIncludeWatchlistChange(!includeWatchlist)}
              title="Also show the players on your watchlist, whoever owns them — the star on each row is what puts them there"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9Z" />
              </svg>
              <span className="research-toggle-label">Watchlist</span>
              {watchlistCount > 0 && (
                <span className="research-toggle-count">{watchlistCount}</span>
              )}
            </button>
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
            <ScheduleToggle
              on={scheduleSpan !== null}
              /* On with no index is the read still out — App holds the window
                 and hands it down only once it has landed, so this needs no
                 fourth prop to know it. */
              loading={scheduleSpan !== null && !schedule}
              onToggle={() =>
                onScheduleSpanChange(
                  scheduleSpan === null ? defaultScheduleSpan(matchupWindow) : null,
                )
              }
            />
            {!schedule && (
              <>
                {/* Columns reads last: the three before it decide *who* is in the
                    table, where this changes what is shown about them. Shared with
                    the player page's Stats tab (`ColumnsButton`), so the two cannot
                    come to look like different controls. */}
                <ColumnsButton
                  open={columnsOpen}
                  count={columns.length}
                  customised={!!columnKeys}
                  onToggle={() => setPanel('columns', !columnsOpen)}
                />
                {/* And Ranks after it, which is the order the two are read in:
                    Columns decides which numbers are on screen, this decides
                    whether each of them carries a second reading. It is the run's
                    other panel-less toggle, so it takes `.on` and never `.active`,
                    exactly as Watchlist does. Shared with the Stats tab's caption
                    row (`RanksButton`), for the reason `ColumnsButton` is. */}
                <RanksButton
                  on={showRanks}
                  onToggle={() => onShowRanksChange(!showRanks)}
                  population={`the whole ${windowLabel(statWindow)} board (${population.length} ${
                    kind === 'pitcher' ? 'pitchers' : 'batters'
                  }), whatever you have narrowed it to`}
                />
              </>
            )}
            </div>
            {/* How far ahead, offered only while the mode is on — its own group,
                so it wraps whole and lands beside the tools run or under it as
                the width allows, exactly as every other group in this bar does.
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
          </div>

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

          {/* Outside the panel on purpose: the chips are the record of what the
              table is currently showing, so they stay whether the Filters panel is
              open or shut. The stat thresholds are now the whole of it — Qualified
              carried a chip here too until it was cut (see below).

              **The watchlist had a chip here and has lost it**, which is the one
              piece of the old design the union genuinely retires. Every member
              of this row *takes rows out* of the table, and `Clear all` is the
              button that puts them back; a control that puts rows in has no
              business in a row whose one action would then shrink the board —
              and with the three ownership buttons off, `Clear all` would have
              emptied it outright. Nothing is hidden by the loss: the three
              include buttons keep no chips either, for the same reason this one
              no longer needs one — it is always on screen in the bar above,
              lit, with its count beside it. */}
          {filters.length > 0 && (
            <div className="research-chips">
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="research-chip"
                  onClick={() => setFilters((fs) => fs.filter((x) => x.id !== f.id))}
                  title="Remove this filter"
                >
                  {columnsByKey.get(f.column)?.label ?? f.column} {OP_LABEL[f.op]} {f.label}
                  <span className="research-chip-x" aria-hidden="true">
                    ×
                  </span>
                </button>
              ))}
              {/* Clears exactly what the row shows — the stat thresholds — and
                  nothing else. It used to clear the watchlist too, which was
                  right while that narrowed the table and is wrong now that it
                  widens it: a button for undoing filters must not be able to
                  take players *off* the board, still less empty it outright
                  with the three ownership buttons off. It also cleared the
                  Qualified toggle, which no longer exists. */}
              <button type="button" className="research-clear" onClick={() => setFilters([])}>
                Clear all
              </button>
            </div>
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
              all={allColumns}
              keys={orderedKeys}
              onChange={(keys) => onColumnsChange(isDefaultColumns(kind, keys) ? null : keys)}
              onReset={() => onColumnsChange(null)}
              canReset={!!columnKeys}
              onClose={() => setPanel('columns', false)}
            />
          )}

          </>,
          controlsHost,
        )}

      {/* Suppressed behind a failed load, where "0 of 0 batters" would read as
          a finding about the league rather than as nothing having arrived. It
          stays on the page rather than travelling up into the chrome with the
          controls: a board that failed to load is news about the table, the
          same argument that keeps App's own error banner outside the chrome. */}
      {error && <div className="error-banner">⚠ {error}</div>}

      {/* Directly above the table, reading as its caption — how many rows the
          filters left, out of the board they were applied to. No season: the
          app shows one season and says so nowhere else on the page either. */}
      {/* The wait and the answer arrive in the same place, which is why this is
          a `LoadingLine` rather than a block: the caption is the one line on
          the page that is about to hold the count, so the ball turning in it
          says the count is on its way. App keeps the rows it already has while
          a re-read is in flight (`loading` is gated on the cache being empty),
          so this can only ever be a board with nothing on it yet. */}
      {(loading || boardRows.length > 0) && (
        <div className="research-count" role="status">
          {loading ? (
            <LoadingLine>Reading the league leaderboard</LoadingLine>
          ) : (
            `${visible.length} of ${boardRows.length} ${kind === 'pitcher' ? 'pitchers' : 'batters'}`
          )}
        </div>
      )}

      {!loading && !error && visible.length === 0 && boardRows.length > 0 && (
        <div className="empty-state">
          <p className="empty-title">No players match these filters</p>
          <p>Loosen a threshold or clear a filter above.</p>
        </div>
      )}

      {/* Every reason the board can be empty, each naming its own cause and the
          way out — see `emptyBoard`. */}
      {!loading && !error && boardRows.length === 0 && emptyBoard()}

      {visible.length > 0 && (
        <div className="research-scroll" ref={scrollRef} onScroll={wantMore}>
          <table className="summary-table research-table">
            <thead>
              <tr>
                <th className="sum-img-col" scope="col">
                  <span className="sr-only">Headshot</span>
                  <ExpandButton isFull={isFull} onToggle={toggle} what="board" />
                </th>
                {/* Club and position used to be two columns of their own here
                    and are now the second line of this one — see the cell. */}
                <th className="sum-name-col" scope="col">
                  Player
                </th>
                {columns.map((c) => {
                  const active = activeSortKey === c.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      className={`sum-num research-sort${active ? ' active' : ''}`}
                      aria-sort={active ? (sortAsc ? 'ascending' : 'descending') : 'none'}
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
                          {active ? (sortAsc ? '▲' : '▼') : ''}
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
                const posCell = posCellText(r, posCodes);
                return (
                  <tr key={key}>
                    <td className="sum-img-col">
                      <ResearchPhoto row={r} playerKey={key} onOpen={onOpenDetails} />
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
                        on={watchlistKeys.has(key)}
                        name={r.name}
                        onToggle={(on) => onWatchlistToggle(key, on)}
                      />
                      </PlayerIdentity>
                    </td>
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`sum-num${activeSortKey === c.key ? ' research-sorted' : ''}${
                          c.cellClass ? ` ${c.cellClass(r) ?? ''}` : ''
                        }`}
                      >
                        {c.format(r)}
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
                            population={rankPopulationLabel}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
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
          {shown < visible.length && (
            <div className="research-more">
              {loadingMore && <LoadingLine>Loading more players</LoadingLine>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
