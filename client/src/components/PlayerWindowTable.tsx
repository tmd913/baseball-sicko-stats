import type { PlayerKind, PlayerWindowRow, ResearchWindow } from '../types';
import {
  allColumns,
  defaultColumnKeys,
  OPPONENT_KEY,
  ROSTER_PCT_COLUMN,
  TREND_BY_KEY,
} from './researchColumns';
import type { Column } from './researchColumns';

/**
 * **The research board, transposed onto one player** — the windows down the
 * side, the board's own stat columns across the top.
 *
 * This is the whole of the player page's Stats tab above the platoon card, and
 * it exists because the board already answers the question and could only ever
 * answer it about six hundred people at once. "How has he hit over the last
 * fortnight, against his season" is a question about *one* man, and the only
 * way to ask it of the board was to open five windows in turn and hold four of
 * the answers in your head.
 *
 * **Every number in it is the board's own** — `researchColumns.tsx` holds one
 * definition of each column's label, tooltip, formatter and value, and both
 * tables read it. A second stat vocabulary here would have been forty chances
 * for the same player's 30-day xwOBA to print two ways in one app.
 */

/**
 * **Three of the board's columns are meaningless in this shape and are cut.**
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
 * What is left is the board's **default** set for the kind rather than all
 * forty-odd. This tab has no column picker and should not grow one: the picker
 * is a board setting, saved per user and shared with a `cols=` link, and it is
 * phrased in the question "which columns do I want against six hundred names".
 * A reader who wants the long tail has the board itself, one tab-strip away in
 * the app's own chrome. Following the *saved* board selection was the other
 * option and was rejected on the same ground: this page opens from everywhere,
 * including places with no board on screen, and a player page that quietly
 * reshaped itself because of something set on another view would be the harder
 * thing to explain.
 */
function windowColumns(kind: PlayerKind): Column[] {
  const shown = new Set(defaultColumnKeys(kind));
  return allColumns(kind).filter(
    (c) =>
      shown.has(c.key) &&
      c.key !== OPPONENT_KEY &&
      c.key !== ROSTER_PCT_COLUMN.key &&
      !TREND_BY_KEY.has(c.key),
  );
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

export function PlayerWindowTable({
  kind,
  windows,
}: {
  kind: PlayerKind;
  windows: PlayerWindowRow[];
}) {
  const columns = windowColumns(kind);
  const noun = kind === 'pitcher' ? 'outings' : 'games';
  return (
    <div className="stats-scroll">
      <table className="glog-table stats-table">
        <thead>
          <tr>
            <th className="glog-date stats-span" scope="col">
              Span
            </th>
            {columns.map((c) => (
              // The header carries the board's own `title`, which is the whole
              // of what a three-letter label leaves unsaid — and there is no
              // sort button under it. Sorting five windows by a stat would put
              // "last 30 days" above "season" on the strength of one number and
              // destroy the only order these rows have, which is time.
              <th key={c.key} className="glog-num" scope="col" title={c.title}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {windows.map(({ window, row }) => (
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
  );
}
