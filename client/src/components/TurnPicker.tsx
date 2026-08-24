import { SpinningBaseball } from './Loading';
import { ScrollRow } from './TabStrip';
import { dayWords, turnDaysTitle } from './schedule';
import type { ScheduleIndex, TurnDays } from './schedule';

/**
 * **The turn filter's control** — press the days, and the board narrows to the
 * pitchers due to start on them.
 *
 * The rule it selects on is `schedule.tsx`'s (`turnsOnDays`, off the same
 * `startTierOn` the Schedule view's grid draws its boxes with); what is here is
 * the picking. See *The turn filter* in that file for why it is a filter rather
 * than a second mode of the schedule.
 *
 * **It is a disclosure, like Search and Filters**, and for the reason those two
 * are: it narrows *rows*, it holds something worth saying with its panel shut,
 * and the thing it holds is too long for a button (`Fri 8/28 · Sun 8/30`). So
 * the button takes `.active` for open and `.on` for holding — with the count
 * beside it, the shape Filters already has — and the days themselves are said
 * by a chip in the head, the one place on this board a filter's sentence stays
 * legible from row 400.
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
  days,
  today,
  open,
  loading,
  onToggle,
}: {
  days: TurnDays | null;
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
      className={`research-toggle${open ? ' active' : ''}${days ? ' on' : ''}`}
      aria-expanded={open}
      title={
        days && today
          ? `Starting ${turnDaysTitle(days, today)} — pick other days, or clear it`
          : 'Show only the pitchers due to start on the days you pick'
      }
      onClick={onToggle}
    >
      {loading ? <SpinningBaseball size="sm" /> : <TurnGlyph />}
      {/* Visually hidden under 640px with the rest of this run, so the button
          still names itself to a screen reader rather than being a lone glyph. */}
      <span className="research-toggle-label">Starting</span>
      {/* The count where there is more than one, which is what the run's other
          two disclosures do with what they hold — and it is what the label
          gives up when the chip below counts instead of listing. */}
      {days && days.length > 1 && (
        <span className="research-toggle-count">{days.length}</span>
      )}
    </button>
  );
}

/**
 * The days themselves — one chip per day the filter can be pointed at, each
 * carrying how many of the board start on it.
 *
 * **Each day is its own toggle.** It picked the two *ends* of a range for one
 * commit, everything between them coming with them, and that is a calendar's
 * shape rather than this control's: the question is which days you can start
 * somebody, and *Monday and Thursday* — a two-start week around an off day, or
 * the two days of a fantasy week with a slot free — is not a run of days with
 * the middle swept in. It cost a mode as well: the strip had to know whether a
 * press would begin a range or close one, and had to say which in its own foot
 * (`Press another day for a range`). A toggle is one rule, needs no foot to
 * explain it, and undoes itself.
 *
 * **The strip is a `ScrollRow`** — fourteen chips at ~50px fit outright on a
 * desktop and nowhere near it on a phone, and a run that wrapped would put
 * three rows of chips into the pinned head where the table's rows go. The
 * arrows are what says there is more of it.
 */
export function TurnDayStrip({
  index,
  days,
  counts,
  onChange,
}: {
  index: ScheduleIndex;
  days: TurnDays | null;
  /** Date → how many rows of the board start that day. Absent is nought. */
  counts: Map<string, number>;
  /** The new set, or null where the last day has just been pressed off — an
   *  empty set is the filter *off* rather than a filter nobody can satisfy. */
  onChange: (days: string[] | null) => void;
}) {
  const on = new Set(days ?? []);
  const press = (day: string) => {
    const next = new Set(on);
    if (!next.delete(day)) next.add(day);
    onChange(next.size === 0 ? null : [...next].sort());
  };

  return (
    <div className="research-panel research-turn-panel">
      <ScrollRow label="the days" className="turn-days">
        <div className="turn-day-run" role="group" aria-label="Which days">
          {index.dates.map((date) => {
            const w = dayWords(date, index.today);
            const lit = on.has(date);
            const n = counts.get(date) ?? 0;
            const when = w.day === 'Today' ? 'today' : `on ${w.day} ${w.date}`;
            return (
              <button
                key={date}
                type="button"
                className={`turn-day${lit ? ' on' : ''}`}
                aria-pressed={lit}
                title={
                  lit
                    ? `Stop showing the pitchers starting ${when}`
                    : `${n} of the board ${n === 1 ? 'starts' : 'start'} ${when}`
                }
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
      {/* **No foot, and it had two lines in it once.**

          A `Clear` sat here first, where the Search panel has one — but that
          control has no chip, so its own panel is the only place its term can
          be undone, where this one is undone by the chip's `×` and by `Clear
          all` beside it, both riding in the head at every scroll offset. A
          third button doing what two on screen already do is a row of chrome
          the table pays for at every width.

          And a line saying *Press a day to see who starts on it* sat beside it,
          drawn **only until a day was picked** — which is a panel that changes
          height under the finger that pressed it, the one thing this app's
          layout rules are strictest about. Reserved instead, it is a
          permanently blank line in the pinned head; and what it said is said by
          fourteen labelled buttons with counts under them. (It also *appeared*
          to break the board's scroll reset. That turned out to be a different
          fault with the same symptom — see `wasAt` in `ResearchTable.tsx` — and
          it is fixed there, so this line's removal rests on the rule alone.) */}
    </div>
  );
}
