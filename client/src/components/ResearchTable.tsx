import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RESEARCH_WINDOWS } from '../types';
import type { PlayerKind, ResearchRow, ResearchWindow } from '../types';
import { headshotUrl } from '../lib';

/**
 * A league-wide, season-to-date stat table: every player on one board, sortable
 * by any column and filterable down to the slice you're after.
 *
 * It shares the summary view's table chrome (`.summary-table` and its sticky
 * header / sticky headshot column) rather than restyling a second wide table to
 * resemble it — the two are the same object, one over the range and one over the
 * season, and folding the selectors together is what keeps them from drifting.
 */

// ---- Columns --------------------------------------------------------------

type Align = 'num' | 'text';

interface Column {
  key: string;
  label: string; // the header, kept to the width of its own numbers
  title: string; // the full name, on hover — a three-letter header says little
  // What the cell prints. Every sortable value is a number on the row, so the
  // formatter is about presentation alone (`.265`, `3.52`, `20.8%`).
  format: (r: ResearchRow) => string;
  // What the sort compares. Null sorts to the bottom in both directions — a
  // player with no barrel rate is neither the best nor the worst at it.
  value: (r: ResearchRow) => number | null;
  align?: Align;
  // Converts a threshold typed in the column's *displayed* units into the units
  // `value` compares in. Only IP needs it — it displays thirds ("158.1") and
  // orders on an out count — but without it a filter silently means something
  // other than what the chip says: "IP ≥ 100" read as 100 *outs* let a 49.1-IP
  // reliever through.
  toValue?: (input: number) => number;
  // Which way the column opens when it's first clicked. Counting stats and
  // rate stats want their leaders first; ERA, WHIP and strikeouts-allowed want
  // their best first, which is the small end.
  ascFirst?: boolean;
  statcast?: boolean; // tinted, and grouped behind a divider
  // Names the run of columns this one *starts*, for the column picker's
  // headings. Set on the first column of each run only and carried forward by
  // `columnGroups` — a group per column would be forty lines of the same
  // string, and the arrays are already written in those runs.
  group?: string;
}

/** The column list cut into the picker's labelled sections. */
function columnGroups(columns: Column[]): { title: string; columns: Column[] }[] {
  const out: { title: string; columns: Column[] }[] = [];
  for (const c of columns) {
    if (c.group || out.length === 0) out.push({ title: c.group ?? 'Stats', columns: [] });
    out[out.length - 1].columns.push(c);
  }
  return out;
}

/** ".265" — the leading zero dropped, as a baseball rate is always written. */
function rate(n: number | null): string {
  if (n === null) return '—';
  const s = n.toFixed(3);
  return s.startsWith('0.') ? s.slice(1) : s;
}
const dec = (n: number | null, places = 2): string =>
  n === null ? '—' : n.toFixed(places);
const pct = (n: number | null): string => (n === null ? '—' : `${n.toFixed(1)}%`);
const count = (n: number | null): string => (n === null ? '—' : String(n));
/** A credit column is empty for almost every row, and a column of noughts reads
 *  as data when it isn't — the same rule the summary table's W/SV/HLD follow. */
const credit = (n: number | null): string => (n ? String(n) : '—');

// ---- Derived rates --------------------------------------------------------
//
// Computed here rather than carried on the row: every one is arithmetic over
// two fields already in the payload, and a column's `value` is the single place
// a number has to exist for the table to sort and threshold it. FIP is the
// exception and comes from the server — it needs the league constant, which
// `leagueRates.ts` owns and the pitcher card shares.
//
// Every one guards its denominator and returns null rather than a 0 or an
// Infinity, which is what keeps a player with no plate appearances out of the
// top of a rate sort.

/** `a / b` as a percentage, null when there's nothing to divide by. */
const share = (a: number | null, b: number | null): number | null =>
  a === null || !b ? null : (a / b) * 100;

/** A plain ratio (BB/K, K/BB), null on a zero denominator — a pitcher who has
 *  walked nobody has no K/BB, and ∞ would sort him above everyone who does. */
const ratio = (a: number | null, b: number | null): number | null =>
  a === null || !b ? null : a / b;

/** Isolated power — extra bases per at-bat, SLG less the singles in it. */
const iso = (r: ResearchRow): number | null =>
  r.slg === null || r.avg === null ? null : r.slg - r.avg;

/** Plate appearances per home run. Null at zero homers rather than infinite,
 *  so "hasn't hit one" doesn't sort as "takes forever to hit one". */
const paPerHr = (r: ResearchRow): number | null => ratio(r.pa, r.hr);

/** Strikeout rate less walk rate, in percentage points. */
const kMinusBb = (r: ResearchRow): number | null => {
  const k = share(r.strikeouts, r.battersFaced);
  const bb = share(r.walks, r.battersFaced);
  return k === null || bb === null ? null : k - bb;
};

/** Saves plus holds. A plain sum rather than a guarded ratio: both are counts,
 *  and zero is a real answer (a starter has none), so it stays a 0 for the
 *  format to dash rather than a null for the sort to bury. */
const svhd = (r: ResearchRow): number => (r.saves ?? 0) + (r.holds ?? 0);

/** Stolen-base success rate, over attempts rather than games. */
const sbRate = (r: ResearchRow): number | null =>
  r.sb === null || r.cs === null ? null : share(r.sb, r.sb + r.cs);

/** The Statcast columns, shared by both boards bar xERA. The contact quality
 *  behind whatever the traditional half of the row says happened — and on the
 *  pitching board, what he *allowed*, which is why nearly every one of them
 *  opens the other way (`ascFirst`) there. */
function statcastColumns(kind: PlayerKind): Column[] {
  const p = kind === 'pitcher';
  const allowed = p ? ' allowed' : '';
  const shared: Column[] = [
    {
      key: 'xba', label: 'xBA', group: 'Statcast', title: `Expected batting average${p ? ' against' : ''}`,
      format: (r) => rate(r.xba), value: (r) => r.xba, ascFirst: p, statcast: true,
    },
    {
      key: 'xslg', label: 'xSLG', title: `Expected slugging${p ? ' against' : ''}`,
      format: (r) => rate(r.xslg), value: (r) => r.xslg, ascFirst: p, statcast: true,
    },
    {
      key: 'xwoba', label: 'xwOBA', title: `Expected wOBA${p ? ' against' : ''}`,
      format: (r) => rate(r.xwoba), value: (r) => r.xwoba, ascFirst: p, statcast: true,
    },
    {
      key: 'exitVelocity', label: 'EV', title: `Average exit velocity${allowed} (mph)`,
      format: (r) => dec(r.exitVelocity, 1), value: (r) => r.exitVelocity, ascFirst: p, statcast: true,
    },
    {
      key: 'launchAngle', label: 'LA', title: `Average launch angle${allowed} (degrees)`,
      format: (r) => dec(r.launchAngle, 1), value: (r) => r.launchAngle,
      // Neither high nor low is "good" — it's a profile, not a grade — so it
      // opens descending like any other column and colours nothing.
      statcast: true,
    },
    {
      key: 'barrelRate', label: 'Brl%', title: `Barrels per batted ball${allowed}`,
      format: (r) => pct(r.barrelRate), value: (r) => r.barrelRate, ascFirst: p, statcast: true,
    },
    {
      key: 'hardHitRate', label: 'HH%', title: `Hard-hit rate — 95+ mph${allowed}`,
      format: (r) => pct(r.hardHitRate), value: (r) => r.hardHitRate, ascFirst: p, statcast: true,
    },
    {
      key: 'sweetSpotRate', label: 'SwSp%', title: `Sweet-spot rate — batted balls at 8-32°${allowed}`,
      format: (r) => pct(r.sweetSpotRate), value: (r) => r.sweetSpotRate, ascFirst: p, statcast: true,
    },
    {
      key: 'gbRate', label: 'GB%', title: `Ground balls per batted ball${allowed}`,
      format: (r) => pct(r.gbRate), value: (r) => r.gbRate, statcast: true,
    },
    {
      key: 'ldRate', label: 'LD%', title: `Line drives per batted ball${allowed}`,
      format: (r) => pct(r.ldRate), value: (r) => r.ldRate, statcast: true,
    },
    {
      key: 'fbRate', label: 'FB%', title: `Fly balls per batted ball${allowed}`,
      format: (r) => pct(r.fbRate), value: (r) => r.fbRate, statcast: true,
    },
    {
      key: 'whiffRate', label: 'Whiff%', title: 'Whiffs per swing',
      // The one metric whose good end flips: a pitcher wants swings and misses,
      // a batter wants not to be the one missing.
      format: (r) => pct(r.whiffRate), value: (r) => r.whiffRate, ascFirst: !p, statcast: true,
    },
    {
      key: 'chaseRate', label: 'Chase%',
      title: p ? 'Chases induced — swings at pitches out of the zone' : 'Swings at pitches out of the zone',
      format: (r) => pct(r.chaseRate), value: (r) => r.chaseRate, ascFirst: !p, statcast: true,
    },
    {
      key: 'firstPitchStrikeRate', label: 'F-Str%',
      title: p ? 'First-pitch strike rate — how often he gets ahead 0-1' : 'First-pitch strikes seen — how often he falls behind 0-1',
      format: (r) => pct(r.firstPitchStrikeRate), value: (r) => r.firstPitchStrikeRate,
      ascFirst: !p, statcast: true,
    },
  ];
  // xERA is a Statcast number but does not live in this group: it sits beside
  // the ERA it estimates, with FIP/xFIP (see PITCHER_COLUMNS).
  if (p) return shared;
  return [
    ...shared,
    {
      key: 'sprintSpeed', label: 'Sprint', title: 'Sprint speed — feet per second in his fastest one-second window',
      format: (r) => dec(r.sprintSpeed, 1), value: (r) => r.sprintSpeed, statcast: true,
    },
  ];
}

/** Innings as the out count the IP column sorts on: "158.1" is 158 whole
 *  innings and one out, not 158 and a tenth. Thirds are clamped, since a typed
 *  "6.5" is a half-inning nobody pitches — it rounds to the nearest third. */
function inningsToOuts(ip: number): number {
  const whole = Math.floor(ip);
  const thirds = Math.min(2, Math.max(0, Math.round((ip - whole) * 10)));
  return whole * 3 + thirds;
}

// The two boards' column tables. Order follows how a stat line is read: the
// counting stats first, then the slash line and the rate stats derived from
// them, then the Statcast group behind its divider.

const BATTER_COLUMNS: Column[] = [
  { key: 'games', label: 'G', group: 'Counting', title: 'Games played', format: (r) => count(r.games), value: (r) => r.games },
  { key: 'pa', label: 'PA', title: 'Plate appearances', format: (r) => count(r.pa), value: (r) => r.pa },
  { key: 'ab', label: 'AB', title: 'At bats', format: (r) => count(r.ab), value: (r) => r.ab },
  { key: 'runs', label: 'R', title: 'Runs scored', format: (r) => count(r.runs), value: (r) => r.runs },
  { key: 'hits', label: 'H', title: 'Hits', format: (r) => count(r.hits), value: (r) => r.hits },
  { key: 'doubles', label: '2B', title: 'Doubles', format: (r) => count(r.doubles), value: (r) => r.doubles },
  { key: 'triples', label: '3B', title: 'Triples', format: (r) => count(r.triples), value: (r) => r.triples },
  { key: 'hr', label: 'HR', title: 'Home runs', format: (r) => count(r.hr), value: (r) => r.hr },
  { key: 'rbi', label: 'RBI', title: 'Runs batted in', format: (r) => count(r.rbi), value: (r) => r.rbi },
  { key: 'walks', label: 'BB', title: 'Walks', format: (r) => count(r.walks), value: (r) => r.walks },
  { key: 'strikeouts', label: 'K', title: 'Strikeouts', format: (r) => count(r.strikeouts), value: (r) => r.strikeouts, ascFirst: true },
  { key: 'sb', label: 'SB', title: 'Stolen bases', format: (r) => count(r.sb), value: (r) => r.sb },
  { key: 'cs', label: 'CS', title: 'Caught stealing', format: (r) => count(r.cs), value: (r) => r.cs, ascFirst: true },

  { key: 'avg', label: 'AVG', group: 'Slash line', title: 'Batting average', format: (r) => rate(r.avg), value: (r) => r.avg },
  { key: 'obp', label: 'OBP', title: 'On-base percentage', format: (r) => rate(r.obp), value: (r) => r.obp },
  { key: 'slg', label: 'SLG', title: 'Slugging percentage', format: (r) => rate(r.slg), value: (r) => r.slg },
  { key: 'ops', label: 'OPS', title: 'On-base plus slugging', format: (r) => rate(r.ops), value: (r) => r.ops },
  { key: 'iso', label: 'ISO', title: 'Isolated power — extra bases per at-bat (SLG − AVG)', format: (r) => rate(iso(r)), value: iso },
  { key: 'babip', label: 'BABIP', title: 'Batting average on balls in play', format: (r) => rate(r.babip), value: (r) => r.babip },

  { key: 'bbRate', label: 'BB%', group: 'Rates', title: 'Walks per plate appearance', format: (r) => pct(share(r.walks, r.pa)), value: (r) => share(r.walks, r.pa) },
  { key: 'kRate', label: 'K%', title: 'Strikeouts per plate appearance', format: (r) => pct(share(r.strikeouts, r.pa)), value: (r) => share(r.strikeouts, r.pa), ascFirst: true },
  { key: 'bbPerK', label: 'BB/K', title: 'Walks per strikeout', format: (r) => dec(ratio(r.walks, r.strikeouts), 2), value: (r) => ratio(r.walks, r.strikeouts) },
  { key: 'paPerHr', label: 'PA/HR', title: 'Plate appearances per home run', format: (r) => dec(paPerHr(r), 1), value: paPerHr, ascFirst: true },
  { key: 'sbRate', label: 'SB%', title: 'Stolen-base success rate, over attempts', format: (r) => pct(sbRate(r)), value: sbRate },

  ...statcastColumns('batter'),
];

const PITCHER_COLUMNS: Column[] = [
  { key: 'games', label: 'G', group: 'Counting', title: 'Games pitched', format: (r) => count(r.games), value: (r) => r.games },
  { key: 'gamesStarted', label: 'GS', title: 'Games started', format: (r) => count(r.gamesStarted), value: (r) => r.gamesStarted },
  // Shown as thirds ("158.1") and ordered on the out count behind it — 6.2 is
  // two thirds past six, so the display string doesn't sort.
  { key: 'ip', label: 'IP', title: 'Innings pitched', format: (r) => r.inningsPitched ?? '—', value: (r) => r.outs ?? null, toValue: inningsToOuts },
  { key: 'battersFaced', label: 'BF', title: 'Batters faced', format: (r) => count(r.battersFaced), value: (r) => r.battersFaced },
  { key: 'wins', label: 'W', title: 'Wins', format: (r) => credit(r.wins), value: (r) => r.wins },
  { key: 'losses', label: 'L', title: 'Losses', format: (r) => credit(r.losses), value: (r) => r.losses, ascFirst: true },
  { key: 'saves', label: 'SV', title: 'Saves', format: (r) => credit(r.saves), value: (r) => r.saves },
  { key: 'holds', label: 'HLD', title: 'Holds', format: (r) => credit(r.holds), value: (r) => r.holds },
  // Saves and holds together — the way a bullpen arm's leverage work is
  // actually counted. Kept beside the two it sums rather than replacing them,
  // since which half a reliever's came from is the next question you ask.
  { key: 'svhd', label: 'SVHD', title: 'Saves plus holds', format: (r) => credit(svhd(r)), value: svhd },
  { key: 'hits', label: 'H', title: 'Hits allowed', format: (r) => count(r.hits), value: (r) => r.hits, ascFirst: true },
  { key: 'runs', label: 'R', title: 'Runs allowed', format: (r) => count(r.runs), value: (r) => r.runs, ascFirst: true },
  { key: 'earnedRuns', label: 'ER', title: 'Earned runs', format: (r) => count(r.earnedRuns ?? null), value: (r) => r.earnedRuns ?? null, ascFirst: true },
  { key: 'hr', label: 'HR', title: 'Home runs allowed', format: (r) => count(r.hr), value: (r) => r.hr, ascFirst: true },
  { key: 'walks', label: 'BB', title: 'Walks allowed', format: (r) => count(r.walks), value: (r) => r.walks, ascFirst: true },
  { key: 'hitBatsmen', label: 'HBP', title: 'Hit batsmen', format: (r) => count(r.hitBatsmen), value: (r) => r.hitBatsmen, ascFirst: true },
  { key: 'strikeouts', label: 'K', title: 'Strikeouts', format: (r) => count(r.strikeouts), value: (r) => r.strikeouts },

  // Each ERA-scale estimator sits immediately after the number it estimates —
  // the rule the pitcher card's season line follows, and the reason xERA is
  // here rather than leading the Statcast group it comes from: split up, the
  // two pairs would read as different kinds of thing when they are the same
  // comparison twice.
  { key: 'era', label: 'ERA', group: 'Run prevention', title: 'Earned run average', format: (r) => dec(r.era), value: (r) => r.era, ascFirst: true },
  { key: 'xera', label: 'xERA', title: 'Expected ERA — Statcast contact quality', format: (r) => dec(r.xera), value: (r) => r.xera, ascFirst: true },
  { key: 'fip', label: 'FIP', title: 'Fielding-independent pitching — ERA scale, from HR, BB, HBP and K alone', format: (r) => dec(r.fip), value: (r) => r.fip, ascFirst: true },
  { key: 'xfip', label: 'xFIP', title: 'FIP with his home runs replaced by his fly balls at the league HR/FB rate', format: (r) => dec(r.xfip), value: (r) => r.xfip, ascFirst: true },
  { key: 'whip', label: 'WHIP', title: 'Walks + hits per inning pitched', format: (r) => dec(r.whip), value: (r) => r.whip, ascFirst: true },
  { key: 'avgAgainst', label: 'BAA', title: 'Batting average against', format: (r) => rate(r.avgAgainst), value: (r) => r.avgAgainst, ascFirst: true },

  { key: 'strikeoutsPer9', label: 'K/9', group: 'Rates', title: 'Strikeouts per nine innings', format: (r) => dec(r.strikeoutsPer9, 1), value: (r) => r.strikeoutsPer9 },
  { key: 'walksPer9', label: 'BB/9', title: 'Walks per nine innings', format: (r) => dec(r.walksPer9, 1), value: (r) => r.walksPer9, ascFirst: true },
  { key: 'homeRunsPer9', label: 'HR/9', title: 'Home runs per nine innings', format: (r) => dec(r.homeRunsPer9, 1), value: (r) => r.homeRunsPer9, ascFirst: true },
  { key: 'kRate', label: 'K%', title: 'Strikeouts per batter faced', format: (r) => pct(share(r.strikeouts, r.battersFaced)), value: (r) => share(r.strikeouts, r.battersFaced) },
  { key: 'bbRate', label: 'BB%', title: 'Walks per batter faced', format: (r) => pct(share(r.walks, r.battersFaced)), value: (r) => share(r.walks, r.battersFaced), ascFirst: true },
  // The single best one-number read on a pitcher's own doing, which is why it
  // sits with the two rates it is the difference of rather than off in the
  // Statcast group.
  { key: 'kMinusBb', label: 'K-BB%', title: 'Strikeout rate less walk rate', format: (r) => pct(kMinusBb(r)), value: kMinusBb },
  { key: 'kPerBb', label: 'K/BB', title: 'Strikeouts per walk', format: (r) => dec(ratio(r.strikeouts, r.walks), 2), value: (r) => ratio(r.strikeouts, r.walks) },
  { key: 'strikeRate', label: 'Str%', title: 'Share of his pitches that were strikes', format: (r) => pct(share(r.strikes, r.pitches)), value: (r) => share(r.strikes, r.pitches) },

  ...statcastColumns('pitcher'),
];

// ---- Which columns show ---------------------------------------------------
//
// A default set rather than everything: the two boards carry forty-odd columns
// between them, which is the point of a research table but a poor thing to open
// on. The default is the line you would find in a box score plus the headline
// Statcast numbers; the rest are a click away in the Columns panel.
//
// Expressed as what's *off* rather than what's on, so a column added later
// shows up by default instead of being invisible until someone remembers to
// list it — the safe direction for this to fail in.
const DEFAULT_OFF: Record<PlayerKind, ReadonlySet<string>> = {
  batter: new Set([
    'ab', 'cs', 'iso', 'babip', 'bbPerK', 'paPerHr', 'sbRate',
    'launchAngle', 'sweetSpotRate', 'gbRate', 'ldRate', 'fbRate',
    'whiffRate', 'chaseRate', 'firstPitchStrikeRate', 'sprintSpeed',
  ]),
  pitcher: new Set([
    // SV and HLD are off because SVHD is on — the sum is the read, and the
    // split between them is the follow-up question rather than the first one.
    'battersFaced', 'saves', 'holds', 'runs', 'hitBatsmen', 'avgAgainst',
    'homeRunsPer9', 'kMinusBb', 'kPerBb', 'strikeRate',
    'xba', 'xslg', 'launchAngle', 'sweetSpotRate', 'gbRate', 'ldRate', 'fbRate',
    'chaseRate', 'firstPitchStrikeRate',
  ]),
};

const allColumns = (kind: PlayerKind): Column[] =>
  kind === 'pitcher' ? PITCHER_COLUMNS : BATTER_COLUMNS;

/** The board's out-of-the-box column set, in canonical order. */
export function defaultColumnKeys(kind: PlayerKind): string[] {
  return allColumns(kind)
    .filter((c) => !DEFAULT_OFF[kind].has(c.key))
    .map((c) => c.key);
}

/** Narrows a `cols=` list off the URL: unknown keys are dropped (a link from an
 *  older build, or one board's keys pasted onto the other), and a list with
 *  nothing left in it falls back to the defaults rather than an empty table. */
export function toColumnKeys(kind: PlayerKind, raw: string | null): string[] | null {
  if (!raw) return null;
  const known = new Set(allColumns(kind).map((c) => c.key));
  const keys = raw.split(',').filter((k) => known.has(k));
  return keys.length ? keys : null;
}

/** Whether a selection is just the defaults — the test App uses to keep `cols=`
 *  out of the URL until the user has actually changed something. */
export function isDefaultColumns(kind: PlayerKind, keys: string[]): boolean {
  const def = defaultColumnKeys(kind);
  return keys.length === def.length && def.every((k) => keys.includes(k));
}

/** The column the board opens on: the players with the most work behind them,
 *  so the table lands on names worth reading rather than the alphabet. */
const DEFAULT_SORT: Record<PlayerKind, string> = { batter: 'pa', pitcher: 'ip' };

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

interface PositionOption {
  key: ResearchPos;
  label: string;
  title: string;
  kind: PlayerKind;
  /** Absent on the two whole-board entries, which filter nothing. */
  match?: (r: ResearchRow) => boolean;
}

/**
 * The row, in the order it reads: both boards whole, then the batting positions
 * from the plate outwards, then the two pitching roles.
 *
 * Note there is no DH pill — a player whose listed position is DH is on the
 * Batters board and nowhere else. C/1B/2B/3B/SS match his listed position;
 * IF and OF are the group he belongs to (an infielder is any of the four, an
 * outfielder any of LF/CF/RF), so those two overlap the individual pills by
 * design — IF is the whole infield, not "some other infielder". SP and RP do
 * partition Pitchers, the board they slice being pitchers already.
 */
const POSITIONS: PositionOption[] = [
  { key: 'batters', label: 'Batters', title: 'Every batter', kind: 'batter' },
  { key: 'pitchers', label: 'Pitchers', title: 'Every pitcher', kind: 'pitcher' },
  { key: 'C', label: 'C', title: 'Catchers', kind: 'batter', match: (r) => r.position === 'C' },
  { key: '1B', label: '1B', title: 'First basemen', kind: 'batter', match: (r) => r.position === '1B' },
  { key: '2B', label: '2B', title: 'Second basemen', kind: 'batter', match: (r) => r.position === '2B' },
  { key: '3B', label: '3B', title: 'Third basemen', kind: 'batter', match: (r) => r.position === '3B' },
  { key: 'SS', label: 'SS', title: 'Shortstops', kind: 'batter', match: (r) => r.position === 'SS' },
  { key: 'IF', label: 'IF', title: 'Infielders — 1B, 2B, 3B and SS', kind: 'batter', match: (r) => r.positionType === 'Infielder' },
  { key: 'OF', label: 'OF', title: 'Outfielders — LF, CF and RF', kind: 'batter', match: (r) => r.positionType === 'Outfielder' },
  // `starter` comes off the row rather than being re-derived here, so these
  // pills and the qualifier the server applies can't disagree about who is one.
  { key: 'SP', label: 'SP', title: 'Starting pitchers — a majority of his appearances are starts', kind: 'pitcher', match: (r) => r.starter },
  { key: 'RP', label: 'RP', title: 'Relief pitchers', kind: 'pitcher', match: (r) => !r.starter },
];

const POSITION_BY_KEY = new Map(POSITIONS.map((p) => [p.key, p]));

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
 * Whose players the board is showing. Orthogonal to the position pills — scope
 * narrows *who* is eligible, position narrows it again — which is why it is a
 * switch of its own rather than two more pills on that row: picking SS must not
 * look like it deselects "My Players".
 *
 * `'all'` is the default and stays the default. This is the one view that works
 * with nothing watched, and defaulting to a watchlist that may be empty would
 * open a new user onto a blank table on the only page they can currently use.
 */
export type ResearchScope = 'all' | 'mine';

export function toResearchScope(v: string | null): ResearchScope {
  return v === 'mine' ? 'mine' : 'all';
}

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
interface StatFilter {
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
  /** The one filter worth a button of its own: almost every rate question on
   *  this page ("who has the best xwOBA") is really about the players with
   *  enough of a season behind them, and building it by hand means knowing
   *  today's PA threshold.
   *
   *  Lifted to App like `pos` — unlike the search and the stat filters, which
   *  are phrased in one board's vocabulary and are right to clear when the
   *  board changes, "qualified" means the same thing on both, so losing it on
   *  a tab switch would be a silent change of population. */
  qualifiedOnly: boolean;
  onQualifiedChange: (on: boolean) => void;
  /** How much of the season the numbers cover. Lifted to App alongside `pos`
   *  and `qualifiedOnly`: it survives the remount a board switch causes, and it
   *  is the one page control the URL carries, since it decides which games the
   *  table is about rather than which of its rows are shown. */
  window: ResearchWindow;
  onWindowChange: (w: ResearchWindow) => void;
  /** Whose players to show. Lifted to App with the other cross-board controls,
   *  and in the URL for the same reason the window is: it changes the
   *  population the table describes, not the presentation of it. */
  scope: ResearchScope;
  onScopeChange: (s: ResearchScope) => void;
  /** `${kind}-${id}` for everything on the watchlist — the app's player key, so
   *  a two-way player watched only as a pitcher is marked on the pitching board
   *  and not the batting one, which is what watching him as a pitcher means. */
  watchedKeys: Set<string>;
  /** Open the details overlay (percentiles, game log, season splits) for a row.
   *  Takes a player key, the same currency the rest of the app navigates in. */
  onOpenDetails: (key: string) => void;
}

/** An unrecognised `win=` is the season, matching `toResearchPos`'s rule and the
 *  server's: a link from a build that offered a different set of windows should
 *  still open the board rather than 404 on a query param. */
export function toResearchWindow(v: string | null): ResearchWindow {
  const n = Number(v);
  return RESEARCH_WINDOWS.includes(n as ResearchWindow) ? (n as ResearchWindow) : 'season';
}

const windowLabel = (w: ResearchWindow) => (w === 'season' ? 'Season' : `${w}d`);
/** Spelt out where there is room for it — the chip and the count line, which are
 *  read as sentences rather than scanned as tabs. */
const windowPhrase = (w: ResearchWindow) =>
  w === 'season' ? 'Season' : `Last ${w} days`;

export function ResearchTable({
  rows,
  kind,
  loading,
  error,
  pos,
  onPosChange,
  columnKeys,
  onColumnsChange,
  qualifiedOnly,
  onQualifiedChange,
  window: statWindow,
  onWindowChange,
  scope,
  onScopeChange,
  watchedKeys,
  onOpenDetails,
}: Props) {
  // Every column this board *has* — what the picker lists, what a filter can be
  // built on, and the canonical order. `columns` below is the visible subset.
  const allColumns = kind === 'pitcher' ? PITCHER_COLUMNS : BATTER_COLUMNS;
  const columnsByKey = useMemo(
    () => new Map(allColumns.map((c) => [c.key, c])),
    [allColumns],
  );
  // A set rather than the array, so the rendered order is always the canonical
  // one however the keys arrived (a hand-edited `cols=` can't shuffle columns).
  const visibleKeys = useMemo(
    () => new Set(columnKeys ?? defaultColumnKeys(kind)),
    [columnKeys, kind],
  );
  const columns = useMemo(
    () => allColumns.filter((c) => visibleKeys.has(c.key)),
    [allColumns, visibleKeys],
  );

  const [search, setSearch] = useState('');
  // Search and the stat filters each sit behind their own button. The table is
  // the page; on a phone a permanently-open control bar cost it four rows
  // before the first name. Neither can hide state, though — see the `on`
  // classes below and the chips, which stay put whether the panel is or not.
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [sortKey, setSortKey] = useState(DEFAULT_SORT[kind]);
  const [sortAsc, setSortAsc] = useState(false);
  const [filters, setFilters] = useState<StatFilter[]>([]);
  // The half-built condition in the add-filter row, kept out of `filters` until
  // it has a number in it — a blank threshold would filter everyone out.
  const [draftColumn, setDraftColumn] = useState(allColumns[0].key);
  const [draftOp, setDraftOp] = useState<Op>('gte');
  const [draftValue, setDraftValue] = useState('');
  const nextFilterId = useRef(1);

  // Everyone this board can show, before any pill or filter. Each MLB
  // leaderboard arrives carrying the other trade's players — pitchers who took
  // a plate appearance, position players who mopped up an eleven-run loss — and
  // both are dropped here rather than per pill, which is what makes the count
  // line's "of N" a number some pill can actually reach.
  // Trade first, then scope. Both narrow the *population* the count line is
  // measured against, so that "12 of 12" on My Players is honest about the
  // board it describes rather than quoting the league's 624.
  const boardRows = useMemo(() => {
    const byTrade = rows.filter(kind === 'pitcher' ? isPitcherByTrade : isBatterByTrade);
    if (scope !== 'mine') return byTrade;
    return byTrade.filter((r) => watchedKeys.has(`${r.kind}-${r.id}`));
  }, [rows, kind, scope, watchedKeys]);

  // Hiding the column you were sorting on leaves the table ordered by something
  // you can neither see nor reverse — there is no header left to click. So the
  // sort falls back to the board's default, which is always a shown column.
  const activeSortKey = visibleKeys.has(sortKey) ? sortKey : DEFAULT_SORT[kind];

  const posMatch = POSITION_BY_KEY.get(pos)?.match;

  // Keep the selected pill on screen. The row scrolls sideways and holds eleven
  // of them, so on a phone the one you're on is often past the right edge —
  // and a selector whose selection you can't see is worse than no selector.
  // Scrolled by hand rather than with scrollIntoView, which walks up to every
  // scrollable ancestor and would drag the table (and the page) with it.
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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = boardRows.filter((r) => {
      if (qualifiedOnly && !r.qualified) return false;
      if (posMatch && !posMatch(r)) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.team.toLowerCase().includes(q)) {
        return false;
      }
      for (const f of filters) {
        const col = columnsByKey.get(f.column);
        if (!col) continue;
        const v = col.value(r);
        // No value fails every threshold: a player Savant has no barrel rate for
        // hasn't cleared 10%, and letting him through would put a row of dashes
        // in a table you filtered precisely to keep them out of.
        if (v === null) return false;
        if (f.op === 'gte' ? v < f.value : v > f.value) return false;
      }
      return true;
    });

    const col = columnsByKey.get(activeSortKey);
    if (!col) return out;
    const dir = sortAsc ? 1 : -1;
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
  }, [boardRows, search, qualifiedOnly, posMatch, filters, activeSortKey, sortAsc, columnsByKey]);

  function toggleSort(col: Column) {
    if (activeSortKey === col.key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(col.key);
      setSortAsc(col.ascFirst ?? false);
    }
  }

  /** Show or hide one column, always emitting the full list in canonical order
   *  so the URL never encodes a shuffle. Emits null when the result is just the
   *  defaults again, which is what keeps `cols=` out of the URL. */
  function setColumn(key: string, on: boolean) {
    const next = new Set(visibleKeys);
    if (on) next.add(key);
    else next.delete(key);
    // Never let the last one go: an empty table has no headers left to click,
    // so there would be no way back except the Reset button beside it.
    if (next.size === 0) return;
    const keys = allColumns.filter((c) => next.has(c.key)).map((c) => c.key);
    onColumnsChange(isDefaultColumns(kind, keys) ? null : keys);
  }

  function setGroup(group: Column[], on: boolean) {
    const next = new Set(visibleKeys);
    for (const c of group) {
      if (on) next.add(c.key);
      else next.delete(c.key);
    }
    if (next.size === 0) return;
    const keys = allColumns.filter((c) => next.has(c.key)).map((c) => c.key);
    onColumnsChange(isDefaultColumns(kind, keys) ? null : keys);
  }

  function addFilter() {
    const v = Number(draftValue);
    if (draftValue.trim() === '' || !Number.isFinite(v)) return;
    const col = columnsByKey.get(draftColumn);
    setFilters((fs) => [
      ...fs,
      {
        id: nextFilterId.current++,
        column: draftColumn,
        op: draftOp,
        value: col?.toValue ? col.toValue(v) : v,
        label: v,
      },
    ]);
    setDraftValue('');
  }

  const statcastStart = columns.findIndex((c) => c.statcast);

  return (
    <div className="research-view">
      {/* Positions, the two disclosure buttons and the count all share one
          wrapping row: the pills are only as wide as their content, so on a
          desktop the whole control set fits on a single line, and the row
          breaks to two (or three) as the screen narrows. */}
      <div className="research-bar">
      {/* Ahead of the position pills, and a separate control from them: scope and
          position both apply, so folding these two into that row would read as
          one single-select where picking SS un-picks My Players. */}
      <div className="research-scope" role="tablist" aria-label="Whose players">
        {(['mine', 'all'] as const).map((sc) => (
          <button
            key={sc}
            type="button"
            role="tab"
            aria-selected={scope === sc}
            className={`research-scope-tab${scope === sc ? ' active' : ''}`}
            title={
              sc === 'mine'
                ? 'Only the players on your watchlist'
                : 'Every player in the league'
            }
            onClick={() => onScopeChange(sc)}
          >
            {sc === 'mine' ? 'My Players' : 'All Players'}
          </button>
        ))}
      </div>
      <div className="research-positions" role="tablist" aria-label="Position" ref={posRowRef}>
        {POSITIONS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={pos === p.key}
            className={`research-pos-tab${pos === p.key ? ' active' : ''}`}
            title={p.title}
            onClick={() => onPosChange(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

        {/* Not a disclosure like the three beside it — it has no panel, so it
            takes `.on` and never `.active`. First of the buttons because it is
            the one that changes *who* is in the table rather than what is shown
            about them. */}
        <button
          type="button"
          className={`research-toggle${qualifiedOnly ? ' on' : ''}`}
          aria-pressed={qualifiedOnly}
          onClick={() => onQualifiedChange(!qualifiedOnly)}
          title={
            kind === 'pitcher'
              ? 'Only pitchers with enough of a season: starters at 1 inning per team game, relievers at 1 appearance per 3 team games'
              : 'Only batters with 3.1 plate appearances per game their team has played'
          }
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Qualified
        </button>
        {/* Each panel's button carries an `on` state whenever the panel holds
            something, open or shut — a collapsed control must never be the
            only place a filter lives. */}
        <button
          type="button"
          className={`research-toggle${searchOpen ? ' active' : ''}${
            search.trim() ? ' on' : ''
          }`}
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          Search
        </button>
        <button
          type="button"
          /* `.on` means the panel *holds* something, whether it is open or
             shut — a non-default window counts, the same as a stat filter. */
          className={`research-toggle${filtersOpen ? ' active' : ''}${
            filters.length || statWindow !== 'season' ? ' on' : ''
          }`}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M3 5h18l-7 8v6l-4 2v-8Z" />
          </svg>
          Filters
          {filters.length > 0 && <span className="research-toggle-count">{filters.length}</span>}
        </button>
        <button
          type="button"
          className={`research-toggle${columnsOpen ? ' active' : ''}${
            columnKeys ? ' on' : ''
          }`}
          aria-expanded={columnsOpen}
          onClick={() => setColumnsOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16M15 4v16" />
          </svg>
          Columns
          <span className="research-toggle-count">{columns.length}</span>
        </button>
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
            {allColumns.map((c) => (
              <option key={c.key} value={c.key}>
                {c.title}
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
          open or shut. */}
      {(filters.length > 0 || statWindow !== 'season') && (
        <div className="research-chips">
          {/* The window reads first and cannot be dismissed by clicking it —
              every other chip here removes a restriction, and "Season" is not
              the absence of a window but another one, so this returns to the
              default rather than to nothing. */}
          {statWindow !== 'season' && (
            <button
              type="button"
              className="research-chip research-chip-window"
              onClick={() => onWindowChange('season')}
              title="Back to the whole season"
            >
              {windowPhrase(statWindow)}
              <span className="research-chip-x" aria-hidden="true">
                ×
              </span>
            </button>
          )}
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
          {filters.length > 0 && (
            <button
              type="button"
              className="research-clear"
              onClick={() => setFilters([])}
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Suppressed behind a failed load, where "0 of 0 batters" would read as
          a finding about the league rather than as nothing having arrived. */}
      {error && <div className="error-banner">⚠ {error}</div>}

      {columnsOpen && (
        <div className="research-panel research-columns">
          {columnGroups(allColumns).map((g) => {
            const allOn = g.columns.every((c) => visibleKeys.has(c.key));
            return (
              <div key={g.title} className="research-colgroup">
                <div className="research-colgroup-head">
                  <span>{g.title}</span>
                  {/* One click for a whole run — checking off fifteen Statcast
                      boxes by hand is the reason a picker gets abandoned. */}
                  <button type="button" onClick={() => setGroup(g.columns, !allOn)}>
                    {allOn ? 'None' : 'All'}
                  </button>
                </div>
                <div className="research-colgroup-items">
                  {g.columns.map((c) => (
                    <label
                      key={c.key}
                      className={`research-col-chip${visibleKeys.has(c.key) ? ' on' : ''}`}
                      title={c.title}
                    >
                      <input
                        type="checkbox"
                        checked={visibleKeys.has(c.key)}
                        onChange={(e) => setColumn(c.key, e.target.checked)}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          <button
            type="button"
            className="research-clear research-cols-reset"
            onClick={() => onColumnsChange(null)}
            disabled={!columnKeys}
          >
            Reset to defaults
          </button>
        </div>
      )}

      {/* Directly above the table, reading as its caption — how many rows the
          filters left, out of the board they were applied to. No season: the
          app shows one season and says so nowhere else on the page either. */}
      {(loading || boardRows.length > 0) && (
        <div className="research-count" role="status">
          {loading
            ? 'Loading league leaderboard…'
            : `${visible.length} of ${boardRows.length} ${kind === 'pitcher' ? 'pitchers' : 'batters'}`}
        </div>
      )}

      {!loading && !error && visible.length === 0 && boardRows.length > 0 && (
        <div className="empty-state">
          <p className="empty-title">No players match these filters</p>
          <p>Loosen a threshold or clear a filter above.</p>
        </div>
      )}

      {/* My Players with nothing on the watchlist of this kind. Distinct from the
          message above, which is about filters — here there is nothing to filter,
          and the way out is All Players rather than a looser threshold. */}
      {!loading && !error && scope === 'mine' && boardRows.length === 0 && (
        <div className="empty-state">
          <p className="empty-title">
            No {kind === 'pitcher' ? 'pitchers' : 'batters'} on your watchlist
          </p>
          <p>
            Open a player from{' '}
            <button
              type="button"
              className="empty-inline-link"
              onClick={() => onScopeChange('all')}
            >
              All Players
            </button>{' '}
            to add them.
          </p>
        </div>
      )}

      {visible.length > 0 && (
        <div className="research-scroll">
          <table className="summary-table research-table">
            <thead>
              <tr>
                <th className="sum-img-col" scope="col">
                  <span className="sr-only">Headshot</span>
                </th>
                <th className="sum-name-col" scope="col">
                  Player
                </th>
                <th className="research-team-col" scope="col">
                  Tm
                </th>
                <th className="research-pos-col" scope="col">
                  Pos
                </th>
                {columns.map((c, i) => {
                  const active = activeSortKey === c.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      className={`sum-num research-sort${active ? ' active' : ''}${
                        i === statcastStart ? ' research-statcast-start' : ''
                      }${c.statcast ? ' research-statcast' : ''}`}
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
                        {c.label}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const key = `${r.kind}-${r.id}`;
                return (
                  <tr key={key}>
                    <td className="sum-img-col">
                      <button
                        type="button"
                        className="sum-photo-wrap"
                        onClick={() => onOpenDetails(key)}
                        title={`${r.name} — Statcast details`}
                      >
                        <img className="sum-photo" src={headshotUrl(r.id)} alt="" />
                      </button>
                    </td>
                    <td className="sum-name-col">
                      <button
                        type="button"
                        className="sum-name-link"
                        onClick={() => onOpenDetails(key)}
                      >
                        {r.name}
                      </button>
                      {/* Only on All Players: on My Players every row would
                          carry one, which marks nothing. The same accent check
                          `PlayerDetails` uses for "On watchlist", so the app
                          says this one thing one way. */}
                      {scope === 'all' && watchedKeys.has(key) && (
                        <span
                          className="research-watched"
                          title={`${r.name} is on your watchlist`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="13"
                            height="13"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                          <span className="sr-only">On your watchlist</span>
                        </span>
                      )}
                    </td>
                    <td className="research-team-col">{r.team || '—'}</td>
                    <td className="research-pos-col" title={posTypeLabel(r.positionType)}>
                      {r.position || '—'}
                    </td>
                    {columns.map((c, i) => (
                      <td
                        key={c.key}
                        className={`sum-num${activeSortKey === c.key ? ' research-sorted' : ''}${
                          i === statcastStart ? ' research-statcast-start' : ''
                        }`}
                      >
                        {c.format(r)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
