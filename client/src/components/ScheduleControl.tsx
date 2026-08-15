import { SpinningBaseball } from './Loading';
import { SCHEDULE_SPANS } from './schedule';
import type { ScheduleSpan } from './schedule';

/**
 * The Schedule view's one control, drawn in two places.
 *
 * It is **one component rendered twice** rather than two that resemble each
 * other — the rule `kindSwitch` already sets for the kind tabs, and the reason
 * `PlayerIdentity` and `PhotoStatus` are shared: a mode that looked slightly
 * different on the two tables it applies to would be one feature wearing two
 * shapes. The roster row draws it beside `Starters` and the calendar; the
 * research board draws it in its own control bar, where `ResearchTable` owns
 * the markup.
 */

/** A calendar grid — the view drawn as what it is, days across and rows down.
 *  Deliberately not the date button's calendar, which is a *disclosure* for the
 *  dates the numbers are drawn from; this is a table of them. */
function ScheduleGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="19"
      height="19"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: 'none' }}
    >
      <rect x="2.5" y="4" width="19" height="16" rx="2" />
      <path d="M2.5 9.5h19M9 9.5V20M15.5 9.5V20" />
    </svg>
  );
}

export function ScheduleToggle({
  on,
  loading,
  onToggle,
}: {
  on: boolean;
  /** The window is being read. **Nothing blanks while it is** — both tables go
   *  on drawing their stat columns until it lands, which is rule 1 of the app's
   *  loading system, so the only mark a press leaves is here, inside the
   *  control that started it. */
  loading?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      /* Folded onto `.research-toggle`'s selector list rather than styled anew,
         so it is the same object as the board's Watchlist button and the roster
         row's Starters toggle by construction. A plain switch with no panel, so
         it takes `.on` and never `.active`. */
      className={`schedule-toggle${on ? ' on' : ''}`}
      aria-pressed={on}
      onClick={onToggle}
      title={
        on
          ? 'Back to the stat columns'
          : "Swap the stat columns for the days ahead — who each player faces, and which pitchers are announced to start"
      }
    >
      {loading ? <SpinningBaseball size="sm" /> : <ScheduleGlyph />}
      {/* Visually hidden under 640px with the rest of this run, so the button
          still names itself to a screen reader rather than being a lone glyph. */}
      <span className="schedule-toggle-label">Schedule</span>
    </button>
  );
}

/**
 * How far ahead, offered only while the mode is on.
 *
 * **`Next 7` and `Next 14`, spelled out, and that wording is load-bearing on
 * the research board**: the board already carries a run of spans reading
 * `Season · 7d · 15d · 30d · 60d`, and those name the days the *stats* are
 * drawn from — the opposite direction in time. Two controls both reading `7d`
 * an inch apart, meaning last week on one and next week on the other, is the
 * one thing this row must not say.
 *
 * Two spans rather than one because they are two questions. Seven is the
 * fantasy week and the default — *who plays how many games this week* is the
 * question the view exists for — and fourteen is the planning horizon, which is
 * also as far as the schedule can usefully be read (see `SCHEDULE_DAYS`).
 */
export function ScheduleSpanTabs({
  span,
  onChange,
}: {
  span: ScheduleSpan;
  onChange: (s: ScheduleSpan) => void;
}) {
  return (
    <div className="schedule-span view-switch" role="tablist" aria-label="How far ahead">
      {SCHEDULE_SPANS.map((s) => (
        <button
          key={s}
          type="button"
          role="tab"
          aria-selected={span === s}
          className={`view-tab${span === s ? ' active' : ''}`}
          onClick={() => onChange(s)}
          title={`The next ${s} days`}
        >
          Next {s}
        </button>
      ))}
    </div>
  );
}
