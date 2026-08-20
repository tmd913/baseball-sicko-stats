import { useEffect, useMemo, useRef, useState } from 'react';

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

function weekdayShort(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * `Mon, Aug 18`, or `Aug 10 – Aug 18` across a range — **what the date bar
 * prints on its lower line.**
 *
 * This replaces two forms the calendar button needed and the bar does not.
 * `numericRange` said `8/1 – 8/9` and `tightRange` said `8/1–8/9`, and both
 * were budgets rather than choices: the button sat in a wrapping row of tab
 * groups where every character it spent could push the group after it onto the
 * next line, and under 640px it was a 10px bubble on the corner of a 36px
 * glyph. The bar is the full width of the window and the label is the only
 * thing in the middle of it, so there is nothing to save the characters for —
 * measured at 320px, the widest form this produces (`Aug 28 – Sep 11`, a range
 * across a month boundary) is 108px against the 204 the bar leaves between its
 * two arrows.
 *
 * **The weekday only on a single day**, which is where it is worth something: a
 * manager reading one day wants to know it is a Sunday, and a range already
 * says its length in its two ends. The year stays off both — the app shows one
 * season and says so nowhere else on the page.
 */
export function wideRange(start: string, end: string): string {
  return start === end
    ? weekdayShort(start)
    : `${prettyShort(start)} – ${prettyShort(end)}`;
}

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
  onChange,
}: {
  start: string;
  end: string;
  /** Latest selectable day (inclusive), as an ISO date. */
  max: string;
  /** A whole range was picked — the second of the two presses. The caller
   *  closes whatever this is drawn in; the calendar has no opinion about it. */
  onChange: (start: string, end: string) => void;
}) {
  // First click of a new range; null means the next click starts a fresh range.
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  // Month shown in the grid, as [year, month0].
  const [view, setView] = useState<[number, number]>(() => {
    const [y, m] = end.split('-').map(Number);
    return [y, m - 1];
  });

  useEffect(() => {
    const [y, m] = end.split('-').map(Number);
    setView([y, m - 1]);
    setAnchor(null);
    setHover(null);
  }, [end]);

  const cells = useMemo(() => monthGrid(view[0], view[1]), [view]);

  // The active selection window: committed range, or the in-progress one anchored
  // on the first click and following the hovered day.
  const [lo, hi] = useMemo(() => {
    if (anchor) {
      const other = hover ?? anchor;
      return anchor <= other ? [anchor, other] : [other, anchor];
    }
    return [start, end];
  }, [anchor, hover, start, end]);

  const pick = (day: string) => {
    if (day > max) return;
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
              className={
                'drp-day' +
                (day >= lo && day <= hi ? ' in-range' : '') +
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
      <div className="drp-foot">{anchor ? 'Pick the range end' : prettyRange(start, end)}</div>
    </>
  );
}

/**
 * The calendar **behind a field** — a button reading the range, and the grid in
 * a popover under it.
 *
 * This is the shape the Roster's date panel wants: it sits at the end of a row
 * of preset pills, where a bare calendar would be 260px of grid under six
 * controls that answer the same question in a word. The Feed's bar draws
 * `DateCalendar` on its own instead, and the two share the grid rather than
 * two grids agreeing about how a range is picked.
 */
export function DateRangePicker({
  start,
  end,
  max,
  onChange,
}: {
  start: string;
  end: string;
  /** Latest selectable day (inclusive), as an ISO date. */
  max: string;
  onChange: (start: string, end: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="drp" ref={rootRef}>
      <button
        type="button"
        className="drp-field"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg
          className="drp-icon"
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 9h18M8 2v4M16 2v4" />
        </svg>
        <span className="drp-value">{prettyRange(start, end)}</span>
      </button>
      {open && (
        <div className="drp-popover" role="dialog">
          {/* Mounted only while open, which is what replaced the effect that
              used to re-center the grid and drop a half-made selection on every
              `open` — a fresh mount does both in its own initializers. */}
          <DateCalendar
            start={start}
            end={end}
            max={max}
            onChange={(s, e) => {
              onChange(s, e);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
