import { useMemo, useState } from 'react';
import type { PlayerKind, PlayerWindowRow, ResearchWindow } from '../types';
import {
  allColumns,
  defaultColumnKeys,
  OPPONENT_KEY,
  ROSTER_PCT_COLUMN,
  TREND_BY_KEY,
} from './researchColumns';
import type { Column } from './researchColumns';
import { ColumnPicker, ColumnsButton } from './ColumnPicker';

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
      !TREND_BY_KEY.has(c.key),
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

export function PlayerWindowTable({
  kind,
  windows,
  columnKeys,
  onColumnsChange,
}: {
  kind: PlayerKind;
  windows: PlayerWindowRow[];
  /** The reader's saved selection for this kind, or null for the defaults. */
  columnKeys: string[] | null;
  /** null means "back to the defaults", stored as no entry at all. */
  onColumnsChange: (keys: string[] | null) => void;
}) {
  const vocabulary = useMemo(() => statsColumns(kind), [kind]);
  const orderedKeys = useMemo(
    () => columnKeys ?? defaultStatsKeys(kind),
    [columnKeys, kind],
  );
  const columns = useMemo(() => {
    const byKey = new Map(vocabulary.map((c) => [c.key, c]));
    return orderedKeys.map((k) => byKey.get(k)).filter((c): c is Column => c !== undefined);
  }, [vocabulary, orderedKeys]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [sort, setSort] = useState<Sort>({ key: SPAN_KEY, asc: true });

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
        <ColumnsButton
          open={pickerOpen}
          count={columns.length}
          customised={!!columnKeys}
          onToggle={() => setPickerOpen((v) => !v)}
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
