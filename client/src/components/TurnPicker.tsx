import { useEffect, useRef, useState } from 'react';
import { SpinningBaseball } from './Loading';
import { ScrollRow } from './TabStrip';
import { dayWords, turnRangeLabel } from './schedule';
import type { ScheduleIndex, TurnRange } from './schedule';

/**
 * **The turn filter's control** — pick a day, or a run of them, and the board
 * narrows to the pitchers due to start in it.
 *
 * The rule it selects on is `schedule.tsx`'s (`turnsInRange`, off the same
 * `startTierOn` the Schedule view's grid draws its boxes with); what is here is
 * the picking. See *The turn filter* in that file for why it is a filter rather
 * than a second mode of the schedule.
 *
 * **It is a disclosure, like Search and Filters**, and for the reason those two
 * are: it narrows *rows*, it holds something worth saying with its panel shut,
 * and the thing it holds is too long for a button (`Fri 8/28 – Sun 8/30`). So
 * the button takes `.active` for open and `.on` for holding, and the range
 * itself is said by a chip in the head — the one place on this board a filter's
 * sentence stays legible from row 400.
 */

/** A calendar with one day marked — the Schedule view's own grid glyph with a
 *  square filled in, which is what this control does to it. Drawn from the same
 *  19px box on the same 2px stroke, so the two sit level in the run. */
function TurnGlyph() {
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
      <path d="M2.5 9.5h19" />
      <rect x="13" y="12.5" width="5.5" height="4.5" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TurnButton({
  range,
  today,
  open,
  loading,
  onToggle,
}: {
  range: TurnRange | null;
  /** The window's own today, so the button says `Today` about the same day the
   *  strip and the grid do. Null before the window has landed, which is only
   *  ever the state a deep link opens in. */
  today: string | null;
  open: boolean;
  /** The window is being read. **Nothing narrows while it is** — the board goes
   *  on showing every row until the schedule lands, which is rule 1 of the
   *  loading system, so the only mark the press leaves is here inside the
   *  control that started it. */
  loading?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`research-toggle${open ? ' active' : ''}${range ? ' on' : ''}`}
      aria-expanded={open}
      title={
        range && today
          ? `Starting ${turnRangeLabel(range, today)} — pick other days, or clear it`
          : 'Show only the pitchers due to start on the days you pick'
      }
      onClick={onToggle}
    >
      {loading ? <SpinningBaseball size="sm" /> : <TurnGlyph />}
      <span className="research-toggle-label">Starting</span>
    </button>
  );
}

/**
 * The days themselves — one chip per day the window has, each carrying how many
 * of the board start on it.
 *
 * **A press commits, and a second press extends.** The calendar this app already
 * has (`DateCalendar`) commits nothing on its first press and asks for a second
 * before it says anything, which is right for a control that sets the range a
 * whole page of numbers is drawn from and wrong here: this filter is live, so
 * the first press has to already be an answer — one press for *the men starting
 * Friday*, which is the question nine times in ten. The second press is what
 * turns that day into a run, and the third starts over rather than extending
 * again, which is the same three-press model the calendar's anchor follows.
 *
 * The foot says which of the two the next press is, exactly as the calendar's
 * does (`Pick the range end`), because a control whose behavior changes with the
 * last thing you did has to say which state it is in.
 *
 * **The strip scrolls rather than wrapping**, and it is a `ScrollRow` — 28 days
 * at ~46px is 1,300px, so it is over the width at every screen this app is read
 * on, and a run that wrapped would put four rows of chips in the pinned head
 * where the table's rows go. The arrows are what says there is more of it.
 */
export function TurnDays({
  index,
  range,
  counts,
  onChange,
}: {
  index: ScheduleIndex;
  range: TurnRange | null;
  /** Date → how many rows of the board start that day. Absent is nought. */
  counts: Map<string, number>;
  onChange: (r: TurnRange | null) => void;
}) {
  /** The day the next press extends *from*, or null where the next press starts
   *  a fresh selection. Armed by a first press and spent by the second. */
  const [anchor, setAnchor] = useState<string | null>(null);
  /**
   * The range **this control last committed**, so the reset below can tell a
   * range that moved under it from one it moved itself.
   *
   * It is not a nicety: the first press commits `{d, d}` *and* arms the anchor,
   * so a reset watching the range alone disarms it in the very same pass — the
   * second press then reads as a first and a range can never be built at all.
   * Written before `onChange` rather than in an effect, so the prop that comes
   * back is already recognized when the reset runs.
   */
  const ours = useRef<string | null>(null);
  const key = range ? `${range.start}..${range.end}` : '';
  // A range that moves under this control — the chip's ×, `Clear all`, a link
  // arriving, the clamp against a window that has rolled over — leaves any
  // half-made selection meaningless. The calendar drops its own anchor on the
  // same event and for the same reason.
  useEffect(() => {
    if (key !== ours.current) setAnchor(null);
  }, [key]);

  const press = (day: string) => {
    const commit = (r: TurnRange) => {
      ours.current = `${r.start}..${r.end}`;
      onChange(r);
    };
    if (anchor === null) {
      setAnchor(day);
      commit({ start: day, end: day });
      return;
    }
    setAnchor(null);
    commit(anchor <= day ? { start: anchor, end: day } : { start: day, end: anchor });
  };

  return (
    <div className="research-panel research-turn-panel">
      <ScrollRow label="the days" className="turn-days">
        <div className="turn-day-run" role="group" aria-label="Which days">
          {index.dates.map((date) => {
            const w = dayWords(date, index.today);
            const on = !!range && date >= range.start && date <= range.end;
            const n = counts.get(date) ?? 0;
            return (
              <button
                key={date}
                type="button"
                className={`turn-day${on ? ' on' : ''}${
                  range && (date === range.start || date === range.end) ? ' edge' : ''
                }`}
                aria-pressed={on}
                title={`${n} of the board ${n === 1 ? 'starts' : 'start'} ${w.day === 'Today' ? 'today' : `on ${w.day} ${w.date}`}`}
                onClick={() => press(date)}
              >
                <span className="turn-day-wk">{w.day}</span>
                <span className="turn-day-date">{w.date}</span>
                {/* The count is drawn at nought as well, and quietly: a day
                    nobody on this board starts is a fact about the board the
                    reader has built, and blanking it would leave the chip
                    looking unmeasured rather than empty. */}
                <span className={`turn-day-n${n === 0 ? ' none' : ''}`}>{n}</span>
              </button>
            );
          })}
        </div>
      </ScrollRow>
      <div className="turn-foot">
        {/* **What the next press does, and nothing else.** It said the range in
            words here first, and that is the fault this board has already had
            reported once and fixed: the chip a line below says the same
            sentence off the same range, and of two rows saying one thing the
            one that keeps is the one you can press (see the note above
            `.research-chips`, and the badge row it replaced). So the foot
            speaks only where the chip cannot — before anything is picked, and
            while a press is armed and the range on screen is half of what the
            reader is building. */}
        <span className="turn-hint">
          {anchor
            ? 'Press another day for a range'
            : range
              ? ''
              : 'Press a day to see who starts on it'}
        </span>
        {range && (
          <button type="button" className="research-clear" onClick={() => onChange(null)}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
