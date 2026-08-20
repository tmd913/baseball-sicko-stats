import { useRef } from 'react';
import type { ReactNode } from 'react';
import { addDays, wideRange } from '../lib';
import { useDismissable, usePopoverFit } from '../hooks';
import { DateRangePicker } from './DateRangePicker';

/**
 * The app's date controls: **a full-width bar of its own, directly under the
 * navigation chrome**, and the row it discloses.
 *
 * ---------------------------------------------------------------------------
 * Why a bar rather than a button in the tab row
 * ---------------------------------------------------------------------------
 *
 * This was a calendar *button*, last in the wrapping row of tab groups, with
 * the range as its label and — under 640px — as a bubble on the corner of a
 * 36px glyph. Two things were wrong with that, and neither was fixable inside a
 * button:
 *
 * - **The one fact every number on the page depends on was the smallest thing
 *   in the chrome.** It read `8/1 – 8/9` because it sat in a row that wrapped,
 *   so every character it spent was one that could push the group after it onto
 *   the next line; on a phone it lost even that and became a 10px badge. The
 *   dates are what the table *is*, and they were being written in the space
 *   left over.
 * - **Moving them was a two-press errand at every width.** Open the row, pick,
 *   and the row closes again. There was no way to say "the day before this one"
 *   at all — the commonest move there is — short of opening the picker and
 *   hitting the same day twice.
 *
 * The bar answers both: it runs the full width of the window under the tabs,
 * states the days in the middle in words a reader does not have to decode, and
 * puts the two steps either side of them, where a thumb reaches on a phone and
 * a pointer reaches without aiming on a desktop. The presets and the range
 * picker are still a disclosure behind the middle — they are 576px of control
 * set once a session, which is the shape of a thing that belongs behind a press
 * — but they now open under a bar that has already said what they hold.
 *
 * ---------------------------------------------------------------------------
 * The bar says which *reading* of the days it is on
 * ---------------------------------------------------------------------------
 *
 * Two modes reinterpret the dates, and a bar that printed a bare range under
 * either would be stating a fact that is no longer the one on screen:
 *
 * - **Schedule** replaces the stat columns with one column per day *ahead*. The
 *   days on screen are then the span's rather than the range's, so the bar
 *   prints the span (`Schedule · This Matchup`) over the days it actually
 *   draws, and the arrows step through the spans this reader is offered instead
 *   of through the calendar. The range is not lost — it still decides *whose*
 *   roster the rows are — but it is not what the columns are, so **the
 *   disclosure holds the span run alone** (`spanControl`) rather than the span
 *   run over a preset list that names days no column on screen is drawn from.
 * - **Projected** keeps the range but fills it with estimates over days that
 *   have not been played. `Custom range` is what the lens leaves behind (it
 *   moves the reader to today → the end of the period, clearing the preset),
 *   which is exactly the label that says nothing about why. It reads
 *   `Projected`.
 *
 * Everything else — Starters, hide-injured, the kind tabs — narrows *rows*
 * rather than reinterpreting days, and the bar is silent about all of it.
 *
 * ---------------------------------------------------------------------------
 * Drawn twice, defined once
 * ---------------------------------------------------------------------------
 *
 * The matchup overlay's team pages are the app's own roster and feed read for
 * somebody else's team over a span the reader picks, and a second
 * implementation of "Today / Yesterday / a range" beside the first is two
 * controls that will one day disagree about what a preset means. What each
 * caller keeps is the *state* — which days, which preset, whether the row is
 * open, and what a step does to it — because that is the only half the two
 * genuinely answer differently.
 */

/** Re-exported so a caller that draws the bar draws the calendar from the same
 *  import — the two are one control on the Feed, and a second import site is
 *  how a surface comes to hold a calendar the bar knows nothing about. */
export { DateCalendar } from './DateRangePicker';

/** One named span the presets row offers. */
export interface DatePreset {
  label: string;
  start: string;
  end: string;
}

/** Whole days in an inclusive ISO range. UTC arithmetic, so no DST boundary can
 *  round a step the wrong way — the rule `lib.ts::addDays` follows. */
function dayCount(start: string, end: string): number {
  const [ys, ms, ds] = start.split('-').map(Number);
  const [ye, me, de] = end.split('-').map(Number);
  const diff = Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds);
  return Math.round(diff / 86_400_000) + 1;
}

/**
 * The range one step either side of this one — **the same window moved by its
 * own length**, so a day steps a day, a week steps a week and `Last 15 days`
 * steps fifteen. Null past the ceiling, which is what disables the arrow.
 *
 * **The ceiling is the picker's own `max`** rather than today, or a second
 * opinion about which days exist: the arrows have to reach exactly what the
 * calendar reaches, or the bar holds two controls that disagree about the end
 * of the season. (The app's max is 31 December of the current season — the
 * published schedule runs that far, and it is what `Tomorrow` and the Schedule
 * view are read from.) There is no floor for the same reason: the picker has
 * none.
 *
 * **A step lands on a preset's label where the days are exactly that preset's
 * days**, and that is the decision the arrows had to make. A preset is a *rule*
 * and the URL carries only the label, so stepping back from `Today` could
 * either freeze the range at yesterday's dates or say `Yesterday` — and the
 * second is the true one: the rule and the range agree on this reader's clock,
 * so a link shared from there re-derives on the recipient's own today, which is
 * what `Yesterday` means. Where no rule matches, the step honestly produces a
 * hand-picked range with no preset and the bar reads `Custom range`.
 */
export function stepRange(
  start: string,
  end: string,
  delta: -1 | 1,
  presets: DatePreset[],
  max: string,
): { start: string; end: string; preset: string | null } | null {
  const span = dayCount(start, end);
  const s = addDays(start, delta * span);
  const e = addDays(end, delta * span);
  if (e > max) return null;
  const hit = presets.find((p) => p.start === s && p.end === e);
  return { start: s, end: e, preset: hit ? hit.label : null };
}

/** What the arrows call themselves, in a tooltip and to a screen reader. The
 *  step is the window's own length, so the wording is too — `Previous day` on a
 *  single day, `Previous 15 days` on a fortnight. */
export function stepTitle(start: string, end: string, delta: -1 | 1): string {
  const n = dayCount(start, end);
  const which = delta < 0 ? 'Previous' : 'Next';
  return n === 1 ? `${which} day` : `${which} ${n} days`;
}

/** Which reading of the days the bar is printing — see the file's own note. */
export type DateBarReading =
  | { kind: 'dates'; preset: string | null }
  | { kind: 'projected' }
  /** `span` is the Schedule control's own label for the span in force. */
  | { kind: 'schedule'; span: string };

export interface DateBarFace {
  /** The upper line: what kind of days these are. */
  lead: string;
  /** The lower line: which days they are. */
  range: string;
}

/**
 * The two lines the bar prints, from one place so the roster and a team page
 * cannot come to word the same state differently.
 *
 * **Both lines are always filled**, which is what keeps the bar from changing
 * height under the finger that pressed it: there is no state in which the lead
 * is absent, so there is nothing to reserve a box for — the worst case *is* the
 * ordinary case, and each line is `nowrap`. (`Custom range` is the lead when no
 * rule is in force, and it is a truthful one: the reader picked these days
 * himself.)
 */
export function dateBarFace(
  reading: DateBarReading,
  start: string,
  end: string,
): DateBarFace {
  const lead =
    reading.kind === 'schedule'
      ? `Schedule · ${reading.span}`
      : reading.kind === 'projected'
        ? 'Projected'
        : (reading.preset ?? 'Custom range');
  return { lead, range: wideRange(start, end) };
}

function Chevron({ back }: { back: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      /* `flex: none` is load-bearing rather than decoration: an `<svg>` in a
         flex row is a flex *item*, and its `width` attribute is a basis it will
         shrink below the moment the line is tight. See the same note on the
         starters toggle, whose 20px clipboard once rendered 10 wide. */
      style={{ flex: 'none' }}
    >
      <path d={back ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  );
}

/**
 * The bar itself: a step, the days, a step — and the disclosure under them.
 *
 * **A three-column grid rather than a flex row with `space-between`**, because
 * the middle has to be centered on the *bar* and not on the space its
 * neighbours leave: the two arrows are the same width, so equal fixed side
 * columns put the label on the bar's own center line whatever it says, where
 * `space-between` would slide it about as the range changed width. That is the
 * difference between a label which sits still as you step through a week and
 * one which shuffles a few pixels a press.
 */
export function DateBar({
  reading,
  start,
  end,
  open,
  onToggle,
  onClose,
  onPrev,
  onNext,
  prevTitle,
  nextTitle,
  spanControl,
  popover,
  popoverLabel,
  children,
}: {
  reading: DateBarReading;
  start: string;
  end: string;
  open: boolean;
  onToggle: () => void;
  /** Only wanted alongside `popover` — a popover dismisses on an outside press
   *  and on Escape, and neither of those is a toggle. */
  onClose?: () => void;
  /** Null disables the arrow — there is nowhere to step in that direction. */
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  prevTitle: string;
  nextTitle: string;
  /**
   * The whole disclosure **in the Schedule reading**, drawn in place of
   * `children` rather than above it: the span run, which is the only thing a
   * reader of that view can pick. The bar decides this rather than each caller,
   * because the bar is where `reading` already lives — the roster and a team
   * page would otherwise be two implementations of one rule, which is the fault
   * this component was extracted to avoid.
   *
   * **Null falls back to `children`.** A caller with no span control to offer
   * gets the presets it would have had, rather than an empty panel under a
   * press that promised one.
   */
  spanControl?: ReactNode;
  /**
   * **What the press opens instead of the disclosure, where the disclosure is
   * the wrong shape for it** — a panel floating over the page rather than one
   * pushing the page down, hung under the middle of the bar.
   *
   * It exists for the Feed, whose face opens the calendar straight away, and
   * the reason is a number: the presets panel is 50px and a month grid is 300,
   * so drawn in the flow it would be 300px of pinned chrome on a view whose
   * whole content is a scrolling stream. `--chrome-h` is measured off that box,
   * so the page below would move down by the height of a calendar every time
   * one was opened. Over the page it costs the chrome nothing.
   *
   * **It dismisses like every other popover in this app** — `useDismissable`,
   * so an outside press closes it and is spent on the closing, and Escape goes
   * through `answersEscape` and undoes exactly this one thing. The box the
   * press is tested against is the **whole bar**, not the popover: the face is
   * the opener and its own `onClick` already toggles, so a face inside the test
   * is one press doing one thing rather than a dismissal and a re-open racing
   * each other. The arrows are inside it for the same reason — they and the
   * calendar are one control over one range, and a step with the calendar open
   * moves the grid rather than closing it.
   *
   * **Null falls back to the disclosure**, which is what every caller that has
   * not asked for this gets.
   */
  popover?: ReactNode;
  /** What the popover calls itself, to a screen reader and in the face's own
   *  tooltip — `Pick a range on the calendar`. Ignored without `popover`. */
  popoverLabel?: string;
  /** The disclosure everywhere else: the presets and the picker. Rendered only
   *  while `open`, which is what lets `.date-control` be a plain flex row again
   *  rather than a `display: none` undone by a class on somebody else's
   *  shell. */
  children: ReactNode;
}) {
  const { lead, range } = dateBarFace(reading, start, end);
  const asPopover = popover != null;
  const barRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  /* The hooks run unconditionally and are handed `false` where the bar is a
     disclosure — a disclosure in the pinned chrome has no outside to press
     past and no height to cap, and a conditional hook is not a thing React
     allows in any case. */
  useDismissable(asPopover && open, barRef, onClose ?? (() => {}));
  usePopoverFit(asPopover && open, popRef);
  return (
    <div
      className={`date-bar${open ? ' open' : ''}${asPopover ? ' date-bar-anchored' : ''}`}
      role="group"
      aria-label="Dates"
      ref={barRef}
    >
      <div className="date-bar-row">
        <button
          type="button"
          className="date-step"
          onClick={() => onPrev?.()}
          disabled={!onPrev}
          aria-label={prevTitle}
          title={prevTitle}
        >
          <Chevron back />
        </button>
        <button
          type="button"
          className={`date-face${open ? ' active' : ''}`}
          onClick={onToggle}
          aria-expanded={open}
          aria-haspopup={asPopover ? 'dialog' : undefined}
          /* The tooltip names what is actually behind the press, and two things
             change it: the Schedule reading, where a preset list is not what
             opens, and a caller that has handed over a popover in place of the
             disclosure — on the Feed the press is a calendar and saying
             `Presets and a range picker` would name one control this bar does
             not have and one it opens at a remove. */
          title={
            open
              ? asPopover
                ? 'Close the calendar'
                : 'Close the date controls'
              : asPopover
                ? popoverLabel ?? 'Pick a range'
                : reading.kind === 'schedule' && spanControl
                  ? 'How far ahead'
                  : 'Presets and a range picker'
          }
        >
          <span className="date-face-lead">{lead}</span>
          <span className="date-face-range">{range}</span>
        </button>
        <button
          type="button"
          className="date-step"
          onClick={() => onNext?.()}
          disabled={!onNext}
          aria-label={nextTitle}
          title={nextTitle}
        >
          <Chevron back={false} />
        </button>
      </div>
      {open &&
        (asPopover ? (
          <div
            className="drp-popover date-bar-pop"
            role="dialog"
            aria-label={popoverLabel ?? 'Dates'}
            ref={popRef}
          >
            {popover}
          </div>
        ) : (
          <div className="date-bar-panel">
            {reading.kind === 'schedule' && spanControl ? spanControl : children}
          </div>
        ))}
    </div>
  );
}

/**
 * The presets and the range picker themselves, in the bar's disclosure.
 *
 * They open under the label that states the range, which is the rule they
 * followed when that label was a button in the tab row and is the reason they
 * moved with it: a disclosure and the thing it discloses have to stay together.
 */
export function DateRow({
  presets,
  activePreset,
  start,
  end,
  max,
  onPick,
  onRange,
}: {
  presets: DatePreset[];
  activePreset: string | null;
  start: string;
  end: string;
  max: string;
  /** A named span was chosen. The caller closes the row behind it, that being
   *  the errand the row was opened for — the range picker deliberately does
   *  not, its own popover needing the row to stay put. */
  onPick: (p: DatePreset) => void;
  onRange: (start: string, end: string) => void;
}) {
  return (
    <div className="date-control">
      <div className="date-row">
        {/* Desktop: a row of preset pills. On phones this row is hidden and
            the equivalent <select> below takes over (see styles.css). */}
        <div className="date-presets">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`date-preset${activePreset === p.label ? ' active' : ''}`}
              onClick={() => onPick(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {/* Phone-only equivalent of the pill row. A custom range (no active
            preset) shows the disabled placeholder option. */}
        <select
          className="date-presets-select"
          value={activePreset ?? ''}
          onChange={(e) => {
            const p = presets.find((x) => x.label === e.target.value);
            if (p) onPick(p);
          }}
          aria-label="Date range preset"
        >
          <option value="" disabled>
            Custom range
          </option>
          {presets.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
            </option>
          ))}
        </select>
        <DateRangePicker start={start} end={end} max={max} onChange={onRange} />
      </div>
    </div>
  );
}
