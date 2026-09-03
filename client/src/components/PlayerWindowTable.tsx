import { useEffect, useMemo, useState } from 'react';
import type {
  PlayerKind,
  PlayerWindowRow,
  ResearchRow,
  ResearchWindow,
} from '../types';
import { LoadingLine } from './Loading';
import {
  allColumns,
  defaultColumnKeys,
  OPPONENT_KEY,
  ROSTER_PCT_COLUMN,
  TEAM_ONLY,
  TREND_BY_KEY,
} from './researchColumns';
import type { Column } from './researchColumns';
import { ColumnPicker, ColumnsButton } from './ColumnPicker';
import { QUALIFIER_WORDS, RankBadge, RanksButton, rankScales } from './columnRanks';
import { boardPopulation } from './ResearchTable';

/**
 * **The research board, transposed onto one player** — the windows down the
 * side, the board's own stat columns across the top.
 *
 * This is the whole of the player page's Stats tab, and it exists because the
 * board already answers the question and could only ever answer it about six
 * hundred people at once. "How has he hit over the last fortnight, against his
 * season" is a question about *one* man, and the only way to ask it of the
 * board was to open five windows in turn and hold four of the answers in your
 * head.
 *
 * **Every number in it is the board's own** — `researchColumns.tsx` holds one
 * definition of each column's label, tooltip, formatter and value, and both
 * tables read it. A second stat vocabulary here would have been forty chances
 * for the same player's 30-day xwOBA to print two ways in one app. The
 * **picker** is shared on the same terms (`ColumnPicker.tsx`): one drag
 * gesture, one set of group headings, one answer to what happens when the last
 * column is turned off.
 */

/**
 * **Three of the board's columns are meaningless in this shape and are cut —
 * from the picker as well as from the table.**
 *
 * - **`Opp`** is the one column on the board that is about *this afternoon*
 *   rather than about the window the rest of the row is drawn from. That is
 *   defensible on a table where each row is a different player — you are
 *   deciding who to start tonight — and indefensible here, where every row is
 *   the same man and the column would print the identical game five times. What
 *   it says is on this very page already: the Overview tab is his day.
 * - **`Ros%` and the five `Δ`_n_`d` trend columns** are facts about a *player*,
 *   not about a span of his season, so they too would repeat down the column.
 *   The rostered figure and every one of its five moves are already under his
 *   name in the page's own head, which is where a fact about the player belongs.
 * - The **identity block** — headshot, name, club, position — goes for the same
 *   reason one level up: the head above this table has said all four once.
 *
 * **The picker offers what is left and not those six**, which is the honest
 * version of a rule that used to be enforced by having no picker at all. A
 * chip for `Ros%` in a dialog opened from this table would be an offer to add
 * a column whose five cells are one number repeated — the reasoning above says
 * why that is not worth a column, and a control that lets it back in would
 * simply be the same argument lost by default. Nothing else is withheld: the
 * long tail the board's own defaults leave off — `ISO`, `BABIP`, `Chase%`,
 * `Sprint` — is exactly what a reader comes to a single player's page for, and
 * all of it is one tick away.
 *
 * The three families sit at the head of both boards' arrays and each owns its
 * group heading outright (`Today`, `Fantasy`), so cutting them leaves no
 * orphaned run in the picker: the vocabulary starts at `Counting`.
 */
export function statsColumns(kind: PlayerKind): Column[] {
  return allColumns(kind).filter(
    (c) =>
      c.key !== OPPONENT_KEY &&
      c.key !== ROSTER_PCT_COLUMN.key &&
      !TREND_BY_KEY.has(c.key) &&
      // **And `W%`**, which this table cannot reach at all: it is the board's
      // team reading's own column, and every row here is one man. See
      // `TEAM_ONLY`. It is cut here as well as in the board's `allColumns` so
      // the picker on this tab never offers it — the same honesty the three
      // families above are cut with.
      !TEAM_ONLY.has(c.key),
  );
}

/** The board's own default set, less the three families above — which is what
 *  this table showed when it had no picker, so nobody's tab changed shape on
 *  the day one arrived. */
export function defaultStatsKeys(kind: PlayerKind): string[] {
  const vocabulary = new Set(statsColumns(kind).map((c) => c.key));
  return defaultColumnKeys(kind).filter((k) => vocabulary.has(k));
}

/**
 * Narrows a saved selection to this table's vocabulary, the way `toColumnKeys`
 * narrows a `cols=` link to the board's.
 *
 * It is the same three failures: a key from an older build, a key from the
 * *other* kind's board, and — the one this table adds — a key the board has
 * and this table does not, which is what a `Ros%` saved here would be if the
 * two preferences were ever crossed. A list with nothing left in it falls back
 * to the defaults rather than to an empty table.
 */
export function toStatsColumnKeys(
  kind: PlayerKind,
  raw: string[] | null | undefined,
): string[] | null {
  if (!raw) return null;
  const known = new Set(statsColumns(kind).map((c) => c.key));
  const seen = new Set<string>();
  const keys = raw.filter((k) => {
    if (!known.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return keys.length ? keys : null;
}

/** Whether a selection is just the defaults — position by position, since the
 *  same columns rearranged is a change the reader made. What it decides is
 *  whether anything is *stored*: a reset is the absence of an entry, so a user
 *  who resets goes on following the defaults as they change. */
export function isDefaultStatsColumns(kind: PlayerKind, keys: string[]): boolean {
  const def = defaultStatsKeys(kind);
  return keys.length === def.length && def.every((k, i) => keys[i] === k);
}

/**
 * The span, written out.
 *
 * The board's own tabs read `Season · 7d · 15d · 30d · 60d`, and the short form
 * is right there: eleven pills share a phone's width in a row that already
 * scrolls sideways. Here they are five labels read *down* a column that holds
 * nothing else, so the width is free and the plain English is worth having —
 * "7d" beside a batting average could as easily be a stat as a span.
 */
const SPAN_LABEL: Record<string, string> = {
  season: 'Season',
  7: 'Last 7 days',
  15: 'Last 15 days',
  30: 'Last 30 days',
  60: 'Last 60 days',
};

const spanLabel = (w: ResearchWindow): string => SPAN_LABEL[String(w)] ?? String(w);

/**
 * The span column's own sort key, and the reason there is one.
 *
 * **Sorting five spans is a different act from sorting six hundred players**,
 * and the difference is that these rows already have an order: time. The board
 * has none — a leaderboard is unordered until you pick a column, which is why
 * it opens on PA — so there "back to no sort" is not a state anybody wants. Put
 * a sort on this table and it *destroys* something, unless the way back is as
 * cheap as the way out.
 *
 * Three answers were available. A **Reset** control beside the picker is a
 * button that exists only to undo another control, on a tab with room for one
 * row of chrome. **Restoring time order on a third click** of whichever header
 * is sorted is the pattern some tables use, and it is unguessable: nothing on
 * screen says a third press means anything, and it makes one header cycle
 * through three states while every other one has two. So the **span column
 * sorts like any other column**, and time order is what sorting by it *is* —
 * ascending, the board's own `Season · 7d · 15d · 30d · 60d`, which the table
 * opens on with the ▲ showing. The way back is a press on the leftmost header,
 * in the grammar the reader has just used to leave it, and the state the table
 * starts in is visibly a sort rather than an absence of one.
 *
 * It sorts on the row's **position in the server's list** rather than on a
 * number of days, because `season` is not a number of days and would have to be
 * special-cased into one (0 sorts it first and ∞ last, and both are a claim
 * about a span that has no length). Descending is then `60d → season`, which is
 * the other order these rows can honestly be read in.
 */
const SPAN_KEY = 'span';

interface Sort {
  key: string;
  asc: boolean;
}

/**
 * **There is no cut control on this table any more, and the table is the
 * uncut one.**
 *
 * It carried a five-pill run — `All · vs RHP · vs LHP · Home · Away` — which
 * asked the same question the **Splits** tab now answers whole: that tab draws
 * both halves of each of those comparisons side by side with the gap between
 * them measured, where this table showed one half at a time and left the reader
 * flipping pills and subtracting. What went with it is `cut=` in the URL, the
 * server's per-cut window build, the sample column the cut forced into the
 * columns, and the `No percentiles under a cut` disablement on the ranks toggle
 * — the badges are always drawable now, which is the state this table is
 * usually read in anyway.
 */



/**
 * **The percentile badges here are the board's own, over the board's own
 * population — which is why this table has to be handed the boards.**
 *
 * A percentile needs a population, and this table has none: it is one player's
 * five rows off `/api/players/:id/windows`, which is five boards reduced to one
 * row each. Three ways out were considered.
 *
 * - **Rank on the server** and ship a number per cell. It is by far the
 *   cheapest and it fails constraint one: better than half the board's columns
 *   are *derived* in `Column.value` and exist nowhere on `ResearchRow` — BB%,
 *   K-BB%, ISO, PA/HR, SB%, K/BB, SVHD, Str%. Ranking them server-side means
 *   writing every one of those denominators a second time, in a workspace that
 *   cannot import the first, and then hoping the two stay level. It would also
 *   silently leave those columns unbadged the day somebody forgot one.
 * - **Ship a compressed distribution** — quantiles, or a numeric projection of
 *   each board — and rank in the client. It cuts the payload by about half
 *   (measured: 120KB gzipped against 276KB for a batter's five windows) and
 *   buys it with a hand-written list of which fields a column reads: add a
 *   column tomorrow that reads a field the projection does not carry and this
 *   table ranks the whole league as null while the board ranks it fine. A
 *   silent wrong answer is the one failure this app most avoids.
 * - **Read the five boards**, which is what this does: the same
 *   `/api/research` the research view reads, through the same per-kind,
 *   per-window cache App already keeps for it, fetched only when the toggle is
 *   on and the Stats tab is open. The rows are then *literally* the rows the
 *   board ranks, `boardPopulation` cuts them to the same trade, and
 *   `rankScales` is the same function — so the two surfaces agree by
 *   construction rather than by measurement. It is the argument
 *   `getPlayerWindows` already makes for going through `getResearch` rather
 *   than around it.
 *
 * What it costs is bytes and nothing else: the boards are 6h-cached on the
 * server and pulled warm nightly by the warmer, so no upstream is touched, and
 * the client cache is keyed by kind and window rather than by player — twenty
 * player pages in one tab pay for it once, and a reader who has used the
 * research board has already paid for part of it. Measured, gzipped: 276KB for
 * a batter's five windows and 381KB for a pitcher's.
 *
 * **A window whose board has not landed simply has no badges yet**, which is
 * the app's own loading rule — never a wait over data, and nothing blanks while
 * a read is in flight. They arrive a window at a time.
 */
export function PlayerWindowTable({
  kind,
  teams = false,
  windows,
  columnKeys,
  onColumnsChange,
  showRanks,
  onShowRanksChange,
  populations,
  onNeedPopulations,
  updating,
}: {
  kind: PlayerKind;
  /**
   * **Whether these five rows are a club's rather than a player's** — the team
   * page's Stats tab, which is this table over the board's *team* reading.
   *
   * It changes one thing and deliberately nothing else, because everything else
   * is already right: the column vocabulary, the span column, the sort, the
   * picker and the badges all work on a `ResearchRow` and a club's row is one.
   * What it changes is the **population** the badges rank within — thirty clubs,
   * not six hundred players. See `teamResearch.ts`. (It used to hide the cut
   * control too, a club having no boards to cut; that control is gone from both
   * readings now.)
   */
  teams?: boolean;
  windows: PlayerWindowRow[];
  /** The reader's saved selection for this kind, or null for the defaults. */
  columnKeys: string[] | null;
  /** null means "back to the defaults", stored as no entry at all. */
  onColumnsChange: (keys: string[] | null) => void;
  /** Draw a percentile under every value. One saved preference shared with the
   *  research board — see `columnRanks.tsx`. */
  showRanks: boolean;
  onShowRanksChange: (on: boolean) => void;
  /** The research board's rows per window, as far as App has them — keyed by
   *  `String(window)`. Missing entries are windows not read yet, which draw no
   *  badges rather than an empty one. */
  populations: Partial<Record<string, ResearchRow[]>>;
  /** "I would like the five boards for this kind." Called only while the
   *  toggle is on and this tab is mounted, which is the whole of the laziness:
   *  a reader on the Overview tab, or one with ranks off, pays nothing. */
  onNeedPopulations: () => void;
  /** A read is in flight over rows that are already drawn. Never a wait over
   *  data — this is the `Updating` badge and nothing else. */
  updating: boolean;
}) {
  const vocabulary = useMemo(() => statsColumns(kind), [kind]);
  const orderedKeys = useMemo(
    () => columnKeys ?? defaultStatsKeys(kind),
    [columnKeys, kind],
  );
  const columns = useMemo(() => {
    const byKey = new Map(vocabulary.map((c) => [c.key, c]));
    // **The reader's columns, and only the reader's.** The table used to force
    // a sample column in under a cut — a span cut by hand is a fraction of a
    // span and the fraction had to be visible before a `.381` could be believed
    // — and with the cut gone, so is the one case where this table drew a
    // column nobody chose.
    return orderedKeys
      .map((k) => byKey.get(k))
      .filter((c): c is Column => c !== undefined);
  }, [vocabulary, orderedKeys]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [sort, setSort] = useState<Sort>({ key: SPAN_KEY, asc: true });

  // Ask for the boards the badges are ranked within, and only ever from here:
  // this component is mounted by the Stats tab alone, so a reader who never
  // opens it never sends the request. App dedupes and caches — see
  // `loadRankPopulations` there.
  useEffect(() => {
    if (showRanks) onNeedPopulations();
  }, [showRanks, onNeedPopulations]);

  /** One set of yardsticks per window, from whichever boards have landed.
   *  Keyed by window because each row is ranked within *its own* span: a
   *  seven-day xwOBA against the seven-day board, which is the only comparison
   *  that means anything (a week's PA against a season's would rank every
   *  player last). */
  const ranks = useMemo(() => {
    if (!showRanks) return null;
    const out = new Map<string, ReturnType<typeof rankScales>>();
    for (const w of windows) {
      const rows = populations[String(w.window)];
      // **The board's own expression, not a second one.** `boardPopulation`
      // cuts a leaderboard to its trade by reading `positionType`, which a club
      // has not got — on the team reading it would empty the pitching board and
      // pass every row of the batting one. The server already answers with
      // exactly the thirty rows the kind asked for, so there is nothing left to
      // cut; this is the same `teams ? rows : boardPopulation(…)` the research
      // table itself writes, for the same reason and in the same words.
      if (rows) {
        out.set(
          String(w.window),
          rankScales(columns, teams ? rows : boardPopulation(rows, kind)),
        );
      }
    }
    return out;
  }, [showRanks, populations, columns, kind, teams, windows]);

  // A hidden column must not leave the table ordered by it — the same trap the
  // board's `activeSortKey` exists for, and here there is no header left to
  // press either. Falling back to the span is falling back to time order, which
  // is the one order these rows always have.
  const shownKeys = useMemo(() => new Set(columns.map((c) => c.key)), [columns]);
  const activeSort: Sort =
    sort.key === SPAN_KEY || shownKeys.has(sort.key) ? sort : { key: SPAN_KEY, asc: true };

  const rows = useMemo(() => {
    // The server's order *is* time order, so a row's index in it is the span's
    // sort value — see `SPAN_KEY`.
    const indexed = windows.map((w, i) => ({ ...w, i }));
    const dir = activeSort.asc ? 1 : -1;
    if (activeSort.key === SPAN_KEY) {
      return [...indexed].sort((a, b) => (a.i - b.i) * dir);
    }
    const col = columns.find((c) => c.key === activeSort.key);
    if (!col) return indexed;
    return [...indexed].sort((a, b) => {
      // A span he does not appear on has no value in any column, so it sorts
      // exactly as a blank cell does — to the bottom, whichever way the column
      // points. A blank is not a good score or a bad one.
      const av = a.row ? col.value(a.row) : null;
      const bv = b.row ? col.value(b.row) : null;
      if (av === null && bv === null) return a.i - b.i;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av === bv) return a.i - b.i;
      return (av - bv) * dir;
    });
  }, [windows, columns, activeSort]);

  const toggleSort = (key: string, ascFirst: boolean) =>
    setSort((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: ascFirst }));

  const noun = kind === 'pitcher' ? 'outings' : 'games';
  const arrow = (key: string) =>
    activeSort.key === key ? (activeSort.asc ? '▲' : '▼') : '';
  const ariaSort = (key: string) =>
    activeSort.key === key ? (activeSort.asc ? 'ascending' : 'descending') : 'none';

  return (
    <>
      {/* **The picker's button sits above the table rather than in the pinned
          head.** That head (`.details-chrome`) says who is being read and which
          reading of him, and it is shared by every tab — so a control belonging
          to one of them would either appear over the percentile card, where it
          does nothing, or make the pinned box change height as the reader moves
          along the strip. This row is the table's own caption slot, which is
          where the research board keeps its count line for the same reason, and
          it scrolls with the tab rather than adding a second pinned band inside
          an overlay that already has one. */}
      <div className="stats-tools">
        {/* **Laid out whether or not it is showing**, which is the app's own
            "reserve the box, don't move the page": this row wraps on a phone,
            so a badge that arrived with the read would re-flow the two buttons
            under the finger that had just pressed a pill. `visibility` rather
            than a conditional render, so the box reserved is the badge's own
            width and not a number written down here. */}
        <span className={`stats-updating${updating ? '' : ' is-idle'}`} aria-hidden={!updating}>
          <LoadingLine className="refreshing" announce={updating}>
            Updating
          </LoadingLine>
        </span>
        <ColumnsButton
          open={pickerOpen}
          count={columns.length}
          customised={!!columnKeys}
          onToggle={() => setPickerOpen((v) => !v)}
        />
        {/* The same control the board carries, in this table's own caption
            slot, and reading the same saved preference: one reading habit, not
            a setting per table.

            **It is never disabled now.** It used to go inert under a cut, with
            the reason on a wrapper (a disabled button shows no `title` of its
            own) — there being no board of everybody's line against left-handers
            to rank a cut row inside. With the cut control gone every row on this
            table is a board row again, so the badges are always drawable and the
            wrapper that carried the excuse is gone with them. */}
        <RanksButton
          on={showRanks}
          onToggle={() => onShowRanksChange(!showRanks)}
          population={`the qualified players on the research board for that span (Savant’s bar of ${QUALIFIER_WORDS[kind]})`}
        />
      </div>
      {pickerOpen && (
        <ColumnPicker
          kind={kind}
          all={vocabulary}
          keys={orderedKeys}
          onChange={(keys) =>
            onColumnsChange(isDefaultStatsColumns(kind, keys) ? null : keys)
          }
          onReset={() => onColumnsChange(null)}
          canReset={!!columnKeys}
          onClose={() => setPickerOpen(false)}
        />
      )}
      <div className="stats-scroll">
        <table className="glog-table stats-table">
          <thead>
            <tr>
              {/* The span's own header, and the arrow **trails** the label here
                  where it leads on every column to its right. That is the
                  board's own rule read from the other end: the reservation is
                  put on the side the text is *not* aligned to, so the label's
                  own edge lines up with the cells under it. Numbers are
                  right-aligned and take a leading arrow; this column is words
                  and takes a trailing one. */}
              <th
                className={`glog-date stats-span research-sort${
                  activeSort.key === SPAN_KEY ? ' active' : ''
                }`}
                scope="col"
                aria-sort={ariaSort(SPAN_KEY)}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(SPAN_KEY, true)}
                  title="Sort by span — the order these rows come in"
                >
                  Span
                  <span className="research-arrow" aria-hidden="true">
                    {arrow(SPAN_KEY)}
                  </span>
                </button>
              </th>
              {columns.map((c) => (
                // The header carries the board's own `title`, which is the whole
                // of what a three-letter label leaves unsaid, and the board's
                // own `ascFirst` — a column whose good end is the small one
                // (ERA, WHIP, a batter's K) opens on it here as it does there.
                <th
                  key={c.key}
                  className={`glog-num research-sort${activeSort.key === c.key ? ' active' : ''}`}
                  scope="col"
                  aria-sort={ariaSort(c.key)}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key, c.ascFirst ?? false)}
                    title={c.title}
                  >
                    <span className="research-arrow" aria-hidden="true">
                      {arrow(c.key)}
                    </span>
                    {c.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ window, row }) => (
              <tr key={String(window)}>
                <th className="glog-date stats-span" scope="row">
                  {spanLabel(window)}
                </th>
                {row ? (
                  columns.map((c) => (
                    <td
                      key={c.key}
                      className={`glog-num${c.cellClass ? ` ${c.cellClass(row) ?? ''}` : ''}`}
                    >
                      {c.format(row)}
                      {ranks && (
                        <RankBadge
                          col={c}
                          scale={ranks.get(String(window))?.get(c.key)}
                          value={c.value(row)}
                          kind={kind}
                          /* **The club reading draws a standing, the player
                             reading a percentile**, which is the split the
                             board's two readings already make and for the
                             reason written at `asRank` in `columnRanks.tsx`: a
                             percentile of thirty is a share to the nearest 3.3
                             points wearing two significant figures, where a
                             complete population of thirty can say the thing
                             itself. `4th of 30` is shorter and true in a way
                             `88` over thirty clubs is not. It arrives late here
                             — this table drew percentiles on both readings
                             while the board drew a standing on one, which is
                             one component saying two things about the same
                             thirty clubs. */
                          asRank={teams}
                          noun={teams ? 'clubs' : undefined}
                          population={
                            window === 'season'
                              ? 'the Season board'
                              : `the ${window}-day board`
                          }
                          /* His own qualification **in this span**, off that
                             span's own row — a man who qualifies over the
                             season may be short of the bar over seven days,
                             and this table draws both lines at once. */
                          qualified={row.qualified}
                        />
                      )}
                    </td>
                  ))
                ) : (
                  // **Absent, not zero.** A window he does not appear on is a
                  // window the board has no row for at all, and a line of dashes
                  // across twenty columns says that far less clearly than one
                  // sentence does — while a row of noughts would say the opposite
                  // of the truth, claiming he played and did nothing.
                  <td className="stats-none" colSpan={columns.length}>
                    No {noun} in this span
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
