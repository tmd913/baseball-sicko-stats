import type { ReactNode } from 'react';
import { TREND_WINDOWS } from '../types';
import type { PlayerKind, PlayerStatus, ResearchRow, TrendWindow } from '../types';
import { formatStartTime, handThrows, inningLabel, surname } from '../lib';

/**
 * **The research board's stat vocabulary, in one place.**
 *
 * It lived inside `ResearchTable.tsx` for as long as that table was its only
 * reader. The player page's **Stats** tab is a second one — the same board
 * transposed, with the five windows down the side instead of six hundred names
 * — and a second copy of forty column definitions, their formatters, their
 * `value` functions and their `ascFirst` flags is precisely the drift the rest
 * of this codebase spends its comments avoiding: one file would gain a column
 * or fix a denominator and the other would quietly go on printing the old
 * answer. So the definitions moved here and both tables import them.
 *
 * What did **not** move is anything about *reading* the board — the sort, the
 * filters, the position pills, the column picker and the table itself are all
 * still `ResearchTable.tsx`'s, because they are phrased in this vocabulary
 * rather than being part of it. What moved is exactly the vocabulary.
 */

// ---- Columns --------------------------------------------------------------

export type Align = 'num' | 'text';

export interface Column {
  key: string;
  label: string; // the header, kept to the width of its own numbers
  title: string; // the full name, on hover — a three-letter header says little
  /** What the filter builder calls this column, for when `title` is a sentence
   *  rather than a phrase and would truncate in a select. Defaults to `title`. */
  pick?: string;
  // What the cell prints. Every sortable value is a number on the row, so the
  // formatter is about presentation alone (`.265`, `3.52`, `20.8%`) — and it
  // returns a node rather than a string because one column is not a number at
  // all: the opponent cell is two lines and colors its live inning, which is
  // state rather than value and so is exactly what this table does color.
  format: (r: ResearchRow) => ReactNode;
  // What the sort compares. Null sorts to the bottom in both directions — a
  // player with no barrel rate is neither the best nor the worst at it.
  value: (r: ResearchRow) => number | null;
  /** What the sort compares when the column holds words rather than a number —
   *  only the opponent does. A column with this is sorted alphabetically (which
   *  on that column means "group my players by tonight's game") and is left out
   *  of the filter builder, a threshold on a club abbreviation being nothing
   *  anyone can type. Its `value` is null throughout, which is what keeps the
   *  numeric paths below from having to know about it. */
  text?: (r: ResearchRow) => string | null;
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
  // A class for the cell, chosen from the value. Only the trend column uses it,
  // and it earns its place there: a rise and a fall are different *kinds* of
  // news, and a signed number in the same color as everything around it makes
  // the reader do the arithmetic.
  cellClass?: (r: ResearchRow) => string | undefined;
  // Names the run of columns this one *starts*, for the column picker's
  // headings. Set on the first column of each run only and carried forward by
  // `columnGroups` — a group per column would be forty lines of the same
  // string, and the arrays are already written in those runs.
  group?: string;
  /**
   * What the header draws, where a string won't do it.
   *
   * Only the Schedule view's day columns have one, and they need it for the
   * reason the opponent cell needs a `ReactNode` formatter: a day's header is
   * two lines — `Fri` over `8/15` — so that the column is as narrow as the
   * matchup under it rather than as wide as its own label. The header renderer
   * reads this where a column has one and `label` where it hasn't, so every
   * other column in the app is untouched.
   */
  headNode?: ReactNode;
}

/** The column list cut into the picker's labeled sections. */
export function columnGroups(columns: Column[]): { title: string; columns: Column[] }[] {
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
      format: (r) => rate(r.xba), value: (r) => r.xba, ascFirst: p,
    },
    {
      key: 'xslg', label: 'xSLG', title: `Expected slugging${p ? ' against' : ''}`,
      format: (r) => rate(r.xslg), value: (r) => r.xslg, ascFirst: p,
    },
    {
      key: 'xwoba', label: 'xwOBA', title: `Expected wOBA${p ? ' against' : ''}`,
      format: (r) => rate(r.xwoba), value: (r) => r.xwoba, ascFirst: p,
    },
    {
      key: 'exitVelocity', label: 'EV', title: `Average exit velocity${allowed} (mph)`,
      format: (r) => dec(r.exitVelocity, 1), value: (r) => r.exitVelocity, ascFirst: p,
    },
    {
      key: 'launchAngle', label: 'LA', title: `Average launch angle${allowed} (degrees)`,
      format: (r) => dec(r.launchAngle, 1), value: (r) => r.launchAngle,
      // Neither high nor low is "good" — it's a profile, not a grade — so it
      // declares no `ascFirst` and opens descending like any other column.
    },
    {
      key: 'barrelRate', label: 'Brl%', title: `Barrels per batted ball${allowed}`,
      format: (r) => pct(r.barrelRate), value: (r) => r.barrelRate, ascFirst: p,
    },
    {
      key: 'hardHitRate', label: 'HH%', title: `Hard-hit rate — 95+ mph${allowed}`,
      format: (r) => pct(r.hardHitRate), value: (r) => r.hardHitRate, ascFirst: p,
    },
    {
      key: 'sweetSpotRate', label: 'SwSp%', title: `Sweet-spot rate — batted balls at 8-32°${allowed}`,
      format: (r) => pct(r.sweetSpotRate), value: (r) => r.sweetSpotRate, ascFirst: p,
    },
    {
      key: 'gbRate', label: 'GB%', title: `Ground balls per batted ball${allowed}`,
      format: (r) => pct(r.gbRate), value: (r) => r.gbRate,
    },
    {
      key: 'ldRate', label: 'LD%', title: `Line drives per batted ball${allowed}`,
      format: (r) => pct(r.ldRate), value: (r) => r.ldRate,
    },
    {
      key: 'fbRate', label: 'FB%', title: `Fly balls per batted ball${allowed}`,
      format: (r) => pct(r.fbRate), value: (r) => r.fbRate,
    },
    {
      key: 'pullAirRate', label: 'PulAir%',
      // Phrase-shaped like `Hard-hit rate — 95+ mph` and `Sweet-spot rate —
      // batted balls at 8-32°` rather than a sentence, so it needs no `pick`:
      // the filter builder's select names every column by its `title`, and the
      // one column that carries a short `pick` (Ros%) does so because its title
      // is a sentence explaining which leagues it counts.
      title: `Pull air rate — batted balls${allowed} that are pulled and in the air`,
      format: (r) => pct(r.pullAirRate), value: (r) => r.pullAirRate,
      // A **grade** rather than a profile, which is why it declares a direction
      // where the three columns above it don't. GB/LD/FB say what kind of hitter
      // he is and neither end is the good one; pulled air contact is the shape
      // home runs come out of, so a batter wants more of it and a pitcher wants
      // to allow less — the same way round as Brl% and HH% beside it.
      ascFirst: p,
    },
    {
      key: 'batSpeed', label: 'Bat', title: p
        ? 'Average bat speed against — mph over the competitive swings taken at him'
        : 'Average bat speed — mph over his competitive swings',
      format: (r) => dec(r.batSpeed, 1), value: (r) => r.batSpeed,
      // A grade rather than a profile, and the same way round as EV beside it:
      // a batter wants to swing hard and a pitcher wants slower swings at him.
      // (Bat speed is not a virtue on its own — a short quick swing beats a
      // slow one and loses to a fast one — but the direction the column opens
      // in has to pick an end, and this is the end each side is trying for.)
      ascFirst: p,
    },
    {
      key: 'whiffRate', label: 'Whiff%', title: 'Whiffs per swing',
      // The one metric whose good end flips: a pitcher wants swings and misses,
      // a batter wants not to be the one missing.
      format: (r) => pct(r.whiffRate), value: (r) => r.whiffRate, ascFirst: !p,
    },
    {
      key: 'chaseRate', label: 'Chase%',
      title: p ? 'Chases induced — swings at pitches out of the zone' : 'Swings at pitches out of the zone',
      format: (r) => pct(r.chaseRate), value: (r) => r.chaseRate, ascFirst: !p,
    },
    {
      key: 'firstPitchStrikeRate', label: 'F-Str%',
      title: p ? 'First-pitch strike rate — how often he gets ahead 0-1' : 'First-pitch strikes seen — how often he falls behind 0-1',
      format: (r) => pct(r.firstPitchStrikeRate), value: (r) => r.firstPitchStrikeRate,
      ascFirst: !p,
    },
  ];
  // xERA is a Statcast number but does not live in this group: it sits beside
  // the ERA it estimates, with FIP/xFIP (see PITCHER_COLUMNS).
  if (p) return shared;
  return [
    ...shared,
    {
      key: 'sprintSpeed', label: 'Sprint', title: 'Sprint speed — feet per second in his fastest one-second window',
      format: (r) => dec(r.sprintSpeed, 1), value: (r) => r.sprintSpeed,
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
// them, then the Statcast group.

/**
 * Which way a roster % has moved, one column per span.
 *
 * Five of them because a move over a night and a move over a month are
 * different facts about a player and regularly point opposite ways — the man
 * everyone dropped in April and has been picked back up all week is falling on
 * 30D and rising on 1D, and a single column has to pick one of those to say.
 *
 * **The key is the window, the label is the measurement.** `rosterTrend` stays
 * the seven-day column's key rather than becoming `rosterTrend7`, because saved
 * column sets and every `cols=` link in the wild name it, and renaming it would
 * silently drop the one trend column anybody has today. The label is written
 * from what the server actually measured (`\u03946d` if the seventh day back is
 * missing and the sixth is not), since a header saying "7d" when it means six
 * would be a lie the reader has no way to catch — see `TREND_DRIFT` on the
 * server for why no two of these can ever land on the same span.
 *
 * Each sorts descending first, like every other counting column: the question
 * people bring to a trend column is "who is being added", and one tap answers
 * it. One more gives the drops.
 */
export const trendKey = (w: TrendWindow): string => (w === 7 ? 'rosterTrend' : `rosterTrend${w}`);

const trendOf = (r: ResearchRow, w: TrendWindow): number | null => r.rosterTrends?.[w] ?? null;

const trendColumn = (w: TrendWindow): Column => ({
  key: trendKey(w),
  label: `\u0394${w}d`,
  title: `Change in roster % over the last ${w === 1 ? 'day' : `${w} days`}`,
  format: (r) => {
    const v = trendOf(r, w);
    // Zero takes no sign at all. It used to come out as "\u22120.0", the sign
    // being chosen on `> 0` — which reads as a fall of nothing, and there are a
    // great many flat players on a board that drops zeroes from the wire.
    if (v === null) return '\u2014';
    if (v === 0) return '0.0';
    return `${v > 0 ? '+' : '\u2212'}${Math.abs(v).toFixed(1)}`;
  },
  value: (r) => trendOf(r, w),
  cellClass: (r) => {
    const v = trendOf(r, w);
    return v === null || v === 0 ? undefined : v > 0 ? 'research-trend-up' : 'research-trend-down';
  },
});

export const TREND_COLUMNS: Column[] = TREND_WINDOWS.map(trendColumn);

/**
 * **Who he plays today, and how it is going** — the one column on this board
 * that is about this afternoon rather than about the window the rest of the row
 * is drawn from.
 *
 * That is the point of it rather than an inconsistency: a season line is read
 * to decide whether to start a man *tonight*, and against whom, off which
 * starter, and how the game is going are the facts that decision turns on and
 * that no amount of season data carries. It reads the same on a 7-day board as
 * on a season one for the same reason.
 *
 * It comes off the league-wide status map (`/api/statuses`) — the same request
 * every row's lineup pip and IL badge already come from, so the column costs no
 * second upstream and no extra field on the research blob (which is cached per
 * kind and window and served to everyone alike; this is a fact about a day, and
 * would go stale inside that blob's six hours). The map is null until that one
 * request lands, and the cells are dashes until it does.
 *
 * **It says what the summary table's opponent cell says, in a narrower column**
 * — the matchup and the announced starter before first pitch, the score and the
 * inning while the game is on, the score and `Final` once it is over — and it
 * departs from that cell in exactly one place, for width. There the score is
 * the away-first line score (`SEA 3–5 LAD`), which names both clubs and so can
 * stand in for the matchup; here the matchup **stays on the first line in every
 * state** and the score is written from his side of it (`5–3`), which is the
 * game log's own vocabulary for a narrow column (`W 5-3`) and saves a second
 * club abbreviation on the app's widest table.
 *
 * Two lines, never three, which is the row-height rule: 58px is set by the 42px
 * headshot (6 + 46 + 6 against the text cells' 12 + content + 12), and the
 * identity block under the name spends 31 of the 34 that leaves. So the start
 * time rides the matchup rather than taking a line of its own — exactly as
 * `.sum-opp-time` does — leaving the second line to the starter.
 *
 * Still sorted **alphabetically on the opponent**, which on this column means
 * "group my players by tonight's game". Everything the cell gained is a fact
 * about that same game and so is constant within a group: sorting on any of it
 * would only reorder ties. And none of it is a threshold anyone would type,
 * which is why the column stays out of the filter builder (see `Column.text`).
 */
export const OPPONENT_KEY = 'opponent';

/** What one player's cell reads, given today's status for him. */
function OpponentCell({ status }: { status: PlayerStatus | null | undefined }) {
  if (!status?.opponent) return <>{'—'}</>;
  const scheduled = status.gameState === 'scheduled';
  const matchup = `${status.isHome ? 'vs' : '@'} ${status.opponent}`;
  const score =
    status.teamScore !== null && status.opponentScore !== null
      ? `${status.teamScore}–${status.opponentScore}`
      : null;
  const time = scheduled ? formatStartTime(status.startTime) : null;
  const sp = scheduled ? status.probablePitcher : null;
  // A postponement has no score and no inning, and this map carries no
  // `detailedState` to spell it out with — `PPD` is what fits, in the amber the
  // summary table's own postponed cell takes.
  const detail = scheduled
    ? null
    : status.gameState === 'live'
      ? inningLabel(status.inningState, status.currentInning)
      : status.gameState === 'postponed'
        ? 'PPD'
        : status.gameState === 'final'
          ? 'Final'
          : null;
  return (
    <>
      <span className="research-opp-main">
        {matchup}
        {score && <span className="research-opp-score">{score}</span>}
        {time && <span className="research-opp-time">{time}</span>}
      </span>
      {sp && (
        <span className="research-opp-sp" title={`Starting pitcher: ${sp.name}`}>
          {handThrows(sp.hand)} {surname(sp.name)}
        </span>
      )}
      {detail && <span className="research-opp-detail">{detail}</span>}
    </>
  );
}

export const opponentColumn = (statuses: Map<number, PlayerStatus> | null): Column => ({
  key: OPPONENT_KEY,
  label: 'Opp',
  group: 'Today',
  title:
    "Today's game — “@” away, “vs” at home, with the opposing starter before first pitch and the score from his side of it once there is one. Sorts alphabetically, which groups your players by tonight's game",
  format: (r) => <OpponentCell status={statuses?.get(r.id)} />,
  text: (r) => statuses?.get(r.id)?.opponent ?? null,
  // Nothing numeric to compare, and nothing to threshold — see `Column.text`.
  value: () => null,
  // The cell is words on two lines rather than a number, and its live inning is
  // one of the few things on this board worth coloring — `cellClass` carries
  // both, the same hook the trend columns use for their rise and fall.
  cellClass: (r) => {
    const st = statuses?.get(r.id);
    return st?.opponent ? `research-opp research-opp-${st.gameState ?? 'none'}` : 'research-opp';
  },
});

/** Which window a column key belongs to, for the two places that have to tell a
 *  trend column from an ordinary one without re-deriving the names. */
export const TREND_BY_KEY = new Map<string, TrendWindow>(TREND_WINDOWS.map((w) => [trendKey(w), w]));

export const ROSTER_PCT_COLUMN: Column = {
  key: 'rosterPct',
  label: 'Ros%',
  group: 'Fantasy',
  title: "Rostered in this share of all ESPN leagues \u2014 ESPN's own figure, not your league's",
  // The filter builder lists columns by their tooltip, which for every other one
  // is a short phrase ("Games played"). This one has to be a sentence, because
  // "roster %" invites the wrong reading and the header is the place to say so —
  // but a sentence truncates in a 240px select, and this is the option that
  // select now *opens on* once a league is connected. Hence a short name for the
  // picker alone, keeping the part that does the disambiguating.
  pick: 'Rostered % (all ESPN leagues)',
  format: (r) => (r.rosterPct == null ? '\u2014' : `${r.rosterPct.toFixed(1)}%`),
  value: (r) => r.rosterPct ?? null,
};

export const BATTER_COLUMNS: Column[] = [
  ROSTER_PCT_COLUMN,
  ...TREND_COLUMNS,
  // The statuses map is injected in `allColumns`, the way a trend column's
  // measured label is — the canonical order belongs in this array.
  opponentColumn(null),
  { key: 'games', label: 'G', group: 'Counting', title: 'Games played', format: (r) => count(r.games), value: (r) => r.games },
  { key: 'pa', label: 'PA', title: 'Plate appearances', format: (r) => count(r.pa), value: (r) => r.pa },
  { key: 'ab', label: 'AB', title: 'At bats', format: (r) => count(r.ab), value: (r) => r.ab },
  // One cell where H and AB are two columns — the shape the summary table and
  // the game log's leading cell already use, and the way a batting line is
  // read. It **sorts on hits**, the numerator being what a counting column is
  // asked for; the average it implies is the AVG column three along, computed
  // over this very pair. `hits` is off by default now that this carries it.
  { key: 'hAb', label: 'H/AB', title: 'Hits and at-bats — sorts on hits', format: (r) => (r.hits === null || r.ab === null ? '\u2014' : `${r.hits}/${r.ab}`), value: (r) => r.hits },
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

export const PITCHER_COLUMNS: Column[] = [
  ROSTER_PCT_COLUMN,
  ...TREND_COLUMNS,
  opponentColumn(null),
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
// Statcast numbers; the rest are a click away in the Columns dialog.
//
// Expressed as what's *off* rather than what's on, so a column added later
// shows up by default instead of being invisible until someone remembers to
// list it — the safe direction for this to fail in.
//
// The four new trend windows are the case that tests that rule and are listed
// off deliberately. They are not a *new* stat, which is what the rule protects:
// they are four more resolutions of one already on the board, and left on they
// would put five near-identical signed columns at the very front of the table
// for every connected user — before games played. So the one that has always
// been there (7d, the fantasy convention) stays on and the rest are a tick
// away in the Columns dialog, next to it, under the same Fantasy heading where
// nobody has to know they exist to find them.
const DEFAULT_OFF: Record<PlayerKind, ReadonlySet<string>> = {
  batter: new Set([
    'rosterTrend1', 'rosterTrend3', 'rosterTrend15', 'rosterTrend30',
    // `hits` and `ab` are what `hAb` prints, so the two of them off is the
    // same line in one column rather than a stat dropped from the board.
    'hits', 'ab', 'cs', 'iso', 'babip', 'bbPerK', 'paPerHr', 'sbRate',
    'launchAngle', 'sweetSpotRate', 'gbRate', 'ldRate', 'fbRate',
    'whiffRate', 'chaseRate', 'firstPitchStrikeRate', 'sprintSpeed',
  ]),
  pitcher: new Set([
    'rosterTrend1', 'rosterTrend3', 'rosterTrend15', 'rosterTrend30',
    // SV and HLD are off because SVHD is on — the sum is the read, and the
    // split between them is the follow-up question rather than the first one.
    'battersFaced', 'saves', 'holds', 'runs', 'hitBatsmen', 'avgAgainst',
    'homeRunsPer9', 'kMinusBb', 'kPerBb', 'strikeRate',
    'xba', 'xslg', 'launchAngle', 'sweetSpotRate', 'gbRate', 'ldRate', 'fbRate',
    'chaseRate', 'firstPitchStrikeRate',
  ]),
};

export const allColumns = (kind: PlayerKind): Column[] =>
  kind === 'pitcher' ? PITCHER_COLUMNS : BATTER_COLUMNS;

/** The board's out-of-the-box column set, in canonical order. */
export function defaultColumnKeys(kind: PlayerKind): string[] {
  return allColumns(kind)
    .filter((c) => !DEFAULT_OFF[kind].has(c.key))
    .map((c) => c.key);
}

/**
 * Narrows a `cols=` list off the URL: unknown keys are dropped (a link from an
 * older build, or one board's keys pasted onto the other), and a list with
 * nothing left in it falls back to the defaults rather than an empty table.
 *
 * **The order it arrives in is kept**, which it deliberately was not until the
 * columns became reorderable: the list used to be read into a `Set` on the
 * grounds that a hand-edited `cols=` had no business shuffling the table. Now
 * that the order is the reader's to set, it is part of what the parameter says
 * — so a link carries the arrangement as well as the selection. What a
 * hand-edited one still cannot do is name a column twice: a duplicate key would
 * render two identical columns under one React key, so the list is deduped on
 * the way in and the first mention wins.
 */
export function toColumnKeys(kind: PlayerKind, raw: string | null): string[] | null {
  if (!raw) return null;
  const known = new Set(allColumns(kind).map((c) => c.key));
  const seen = new Set<string>();
  const keys = raw.split(',').filter((k) => {
    if (!known.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return keys.length ? keys : null;
}

/** Whether a selection is just the defaults — the test App uses to keep `cols=`
 *  out of the URL until the user has actually changed something. **Order
 *  counts**: the same columns in a different arrangement is a change the reader
 *  made and a link should carry, so this compares position by position rather
 *  than membership. */
export function isDefaultColumns(kind: PlayerKind, keys: string[]): boolean {
  const def = defaultColumnKeys(kind);
  return keys.length === def.length && def.every((k, i) => keys[i] === k);
}

/**
 * Where a column that has just been switched *on* lands in a list the reader
 * may have rearranged: at its canonical place relative to the columns already
 * there — ahead of the first one that follows it in the board's own order, and
 * at the end if none does.
 *
 * The alternative, appending, is worse in the ordinary case and no better in
 * the rearranged one: someone ticking `2B` with the default set on screen wants
 * it beside `H/AB`, not out past the Statcast group. Whatever custom order is
 * in force is left alone either way — one column is inserted, nothing else
 * moves.
 */
export function withColumn(kind: PlayerKind, keys: string[], key: string): string[] {
  if (keys.includes(key)) return keys;
  const canonical = allColumns(kind).map((c) => c.key);
  const at = canonical.indexOf(key);
  const before = keys.findIndex((k) => {
    const i = canonical.indexOf(k);
    return i > at;
  });
  if (before === -1) return [...keys, key];
  return [...keys.slice(0, before), key, ...keys.slice(before)];
}

/** The column the board opens on: the players with the most work behind them,
 *  so the table lands on names worth reading rather than the alphabet. */
export const DEFAULT_SORT: Record<PlayerKind, string> = { batter: 'pa', pitcher: 'ip' };
