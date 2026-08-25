import { useEffect, useMemo, useState } from 'react';

// Self-contained ISO-date ('YYYY-MM-DD') helpers. Same-format ISO strings sort
// lexicographically, so string comparison is a valid date comparison.
function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function prettyShort(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function prettyLong(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/* `wideRange` — `Mon, Aug 18`, or `Aug 10 – Aug 18` across a range — **is in
   `lib.ts` now**, with `prettyDate` it is built on. It was here because the
   date bar was its only caller and the bar's picker is this file; it has four
   callers now and three of them (a matchup's head, the Scoreboard's head, the
   Rankings caption) never open a calendar. It replaced two numeric forms the
   old calendar *button* needed and the bar does not — `numericRange` said
   `8/1 – 8/9` and `tightRange` said `8/1–8/9`, both budgets rather than
   choices, the button having sat in a wrapping row of tab groups where every
   character it spent could push the group after it onto the next line. What is
   left here is the picker's own field label, which is a different form: it
   carries the year, because a calendar you are picking *in* has a year on it. */

function prettyRange(start: string, end: string): string {
  return start === end
    ? prettyLong(start)
    : `${prettyShort(start)} – ${prettyLong(end)}`;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Cells for a month grid: leading nulls pad to the first day's weekday. */
function monthGrid(year: number, month: number): (string | null)[] {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= days; d++) cells.push(iso(year, month, d));
  return cells;
}

/**
 * **The calendar itself** — the month head, the grid, and the foot that names
 * what is picked. No field, no popover, no open state: it is the control, and
 * where it is drawn is the caller's business.
 *
 * Split out of `DateRangePicker` when a second surface wanted the calendar
 * **without** the field in front of it: on the Feed the date face opens this
 * directly, there being no presets on that view for a field to sit beside. See
 * `DateControls.tsx::DateBar` and *The date bar* in `client-dates.md`.
 *
 * It re-centers on the selected end and drops a half-made selection whenever
 * `end` moves — which is what keeps it honest under the bar's own arrows: a
 * step while the calendar is open leaves the grid on the month the reader has
 * just been moved to rather than on the one he opened.
 */
export function DateCalendar({
  start,
  end,
  max,
  month,
  single = false,
  onChange,
}: {
  /**
   * The selection, **or `null` for none at all**.
   *
   * A caller that is picking days *again* passes the range it has, and the grid
   * opens marked on it — which is what makes a picker reopened over a chosen
   * span say which span it is. A caller with nothing chosen passes null, and
   * the grid opens with **no day marked**: the first press starts a range
   * rather than replacing a selection nobody made.
   *
   * That distinction used to be impossible to draw, so a caller with nothing
   * chosen passed *today* — and today then wore the selected fill on a calendar
   * whose whole subject is what the reader is about to choose. A marked day is
   * a claim, and "nothing is picked yet" is not the same claim as "today is
   * picked". The two are `null` and a range now.
   */
  start: string | null;
  end: string | null;
  /** Latest selectable day (inclusive), as an ISO date. */
  max: string;
  /** **Which month to open on where there is no selection** — the day the
   *  caller would call the middle of the reader's attention, which is today on
   *  every caller that has one. Ignored where `end` says which month it is.
   *  Falls back to `max`, which is the only other day this component is
   *  given. */
  month?: string;
  /**
   * **One press picks one day**, and the range it reports is that day twice.
   *
   * A mode rather than a second calendar, which is this stylesheet's own *fold,
   * don't restyle* rule applied to a component: the grid, the month head, the
   * ceiling, the re-centering and the foot are the same control, and the only
   * thing that differs is whether the first press is an anchor or the answer.
   * A copy of this file with one line changed is two controls that will one day
   * disagree about what a disabled day looks like.
   *
   * It exists for the MLB view's Scoreboard, which is **one day** by
   * construction — a board of games played on a date — so a two-press range
   * there would be a control offering something the page cannot draw. See
   * `MlbScoreboard.tsx`.
   */
  single?: boolean;
  /** A whole range was picked — the second of the two presses, or the only one
   *  in `single`. The caller closes whatever this is drawn in; the calendar has
   *  no opinion about it. */
  onChange: (start: string, end: string) => void;
}) {
  // First click of a new range; null means the next click starts a fresh range.
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  /** The day the grid centers on — the selection's end where there is one, and
   *  otherwise the month the caller named. */
  const seed = end ?? month ?? max;
  // Month shown in the grid, as [year, month0].
  const [view, setView] = useState<[number, number]>(() => {
    const [y, m] = seed.split('-').map(Number);
    return [y, m - 1];
  });

  useEffect(() => {
    const [y, m] = seed.split('-').map(Number);
    setView([y, m - 1]);
    setAnchor(null);
    setHover(null);
  }, [seed]);

  const cells = useMemo(() => monthGrid(view[0], view[1]), [view]);

  // The active selection window: committed range, or the in-progress one anchored
  // on the first click and following the hovered day.
  const [lo, hi] = useMemo<[string | null, string | null]>(() => {
    if (anchor) {
      const other = hover ?? anchor;
      return anchor <= other ? [anchor, other] : [other, anchor];
    }
    return [start, end];
  }, [anchor, hover, start, end]);

  const pick = (day: string) => {
    if (day > max) return;
    // One press is the whole answer — see `single`. Ahead of the anchor
    // arithmetic rather than inside it, so no half-made selection can exist in
    // this mode for a later press to complete.
    if (single) {
      onChange(day, day);
      return;
    }
    if (!anchor) {
      setAnchor(day);
      setHover(day);
      return;
    }
    const a = anchor <= day ? anchor : day;
    const b = anchor <= day ? day : anchor;
    onChange(a, b);
    setAnchor(null);
    setHover(null);
  };

  const shiftMonth = (delta: number) => {
    setView(([y, m]) => {
      const next = new Date(Date.UTC(y, m + delta, 1));
      return [next.getUTCFullYear(), next.getUTCMonth()];
    });
  };

  const next = new Date(Date.UTC(view[0], view[1] + 1, 1));
  const nextMonthStart = iso(next.getUTCFullYear(), next.getUTCMonth(), 1);
  const atMaxMonth = nextMonthStart > max;

  return (
    <>
      <div className="drp-head">
        <button
          type="button"
          className="drp-nav"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="drp-month">
          {MONTH_NAMES[view[1]]} {view[0]}
        </span>
        <button
          type="button"
          className="drp-nav"
          onClick={() => shiftMonth(1)}
          disabled={atMaxMonth}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="drp-grid drp-weekdays">
        {WEEKDAYS.map((w) => (
          <span key={w} className="drp-weekday">
            {w}
          </span>
        ))}
      </div>
      <div className="drp-grid" onMouseLeave={() => anchor && setHover(anchor)}>
        {cells.map((day, i) =>
          day === null ? (
            <span key={`x${i}`} />
          ) : (
            <button
              key={day}
              type="button"
              disabled={day > max}
              /* **Nothing selected marks nothing**, tested rather than left to
                 the comparison: `day >= null` is false by coercion today and
                 would be a silent trap the day either end became a number. */
              className={
                'drp-day' +
                (lo !== null && hi !== null && day >= lo && day <= hi ? ' in-range' : '') +
                (day === lo ? ' edge start' : '') +
                (day === hi ? ' edge end' : '')
              }
              onMouseEnter={() => anchor && setHover(day)}
              onClick={() => pick(day)}
            >
              {Number(day.slice(8))}
            </button>
          ),
        )}
      </div>
      {/* **The foot names what is picked, or what the next press does.** It is
          the only thing in the calendar that says the year, and on a
          half-made selection it is the only thing that says a second press is
          expected. */}
      <div className="drp-foot">
        {anchor
          ? 'Pick the range end'
          : start && end
            ? prettyRange(start, end)
            : /* **And with nothing picked the foot says what the first press
                 does**, which is the one thing this calendar can say when it
                 has no days to name. A blank line there would be the box's only
                 empty row. */
              'Pick a day, or the first of a range'}
      </div>
    </>
  );
}

/**
 * **The calendar glyph a field wears** — the one that went out of this file with
 * `.drp-field` and has a reader again: the research board's projected span
 * picker, which is a field with a calendar behind it and is drawn exactly as
 * that shape was drawn here.
 *
 * Here rather than at the call site because this is the range picker's file and
 * a glyph naming a calendar belongs beside the calendar. It is the original
 * markup, unchanged — `currentColor` and no `class`, so the button it sits in
 * decides its ink and the run's lit state carries it along.
 */
export function CalendarGlyph() {
  return (
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
      style={{ flex: '0 0 auto' }}
    >
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  );
}

/* **`DateRangePicker` — the calendar behind a field — went with its last
   reader.** It was the shape the Roster's date panel wanted: a button reading
   the range at the end of a row of preset pills, where a bare calendar would
   have been 260px of grid under six controls answering the same question in a
   word. There is no preset row now (see `DateControls.tsx`), so there is
   nothing for a field to sit beside and nothing the extra press bought — every
   caller draws `DateCalendar` directly. `.drp`, `.drp-field`, `.drp-icon` and
   `.drp-value` went out of the stylesheet with it; `.drp-popover` stayed, the
   bar folding onto it for the one calendar surface this app has.

   The file keeps its name. It is the range picker, and the range picker is now
   exactly the calendar. */
