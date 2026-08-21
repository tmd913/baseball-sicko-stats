import { useRef } from 'react';
import type { ReactNode } from 'react';
import { addDays, wideRange } from '../lib';
import { useDismissable, usePopoverFit, usePublishedHeight } from '../hooks';

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
 * a pointer reaches without aiming on a desktop.
 *
 * ---------------------------------------------------------------------------
 * And the middle opens a calendar, not a preset row
 * ---------------------------------------------------------------------------
 *
 * A row of six preset pills and a field that opened a calendar used to be the
 * disclosure. The Feed dropped it first — going to a day is going to a *day* —
 * and the Roster has now followed it, on the same argument one step further on:
 * the two presses the pills genuinely bought (`Today`, `Yesterday`) are the two
 * the arrows already land on by rule, and the other four were a field away from
 * the calendar anyway. Reaching any other day was three presses — the face, the
 * `Aug 19, 2026` field, then the day — of which the middle one existed only to
 * get past controls the reader was not there for.
 *
 * So `popover` is what every reading but **Schedule** opens, and Schedule opens
 * the span run (`spanControl`) because there the columns are the span's days
 * and nothing a preset says is on screen. `DateRow` — the pills, the phone
 * `<select>` and the field in front of the calendar — went with its last
 * reader, and `DateRangePicker` with it.
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
 *   prints the span (`Schedule · Week 19`) over the days it actually
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
  | { kind: 'schedule'; span: string }
  /**
   * **The matchup so far** — a team page's Summary reading, whose days are the
   * period's start to today (clamped to its end) and are not the reader's to
   * move. It is a *reading* rather than a preset for exactly that reason: a
   * preset is a rule the reader picks and can step off, and this one is what
   * the page is. See `fixed` on `DateBar`.
   */
  | { kind: 'matchup' }
  /**
   * **Days this bar is handed rather than derives** — the League view's two
   * bars, which state a *week* and a *span of weeks* rather than a range of
   * calendar days.
   *
   * The other four readings turn `start`/`end` into their two lines here, which
   * is what stops the roster and a team page wording one state two ways. A
   * league week is not that shape: which days `Week 12` covers is ESPN's
   * answer and arrives on the wire already dated, and the lead carries a *state*
   * beside the name (`Week 19 · Live`) that no range can be read off. So this
   * reading hands both lines over whole and the bar prints them — one bar on
   * every surface, and the one surface whose days are somebody else's arithmetic
   * says so rather than pretending to derive them.
   *
   * `lead` is a node rather than a string for exactly one reason and it is worth
   * naming: the state word is colored (`Live` green, `Projected` accent), which
   * is the app's rule that color is spent on state, and a string cannot carry
   * half a line of it.
   */
  | { kind: 'label'; lead: ReactNode; range: string };

export interface DateBarFace {
  /** The upper line: what kind of days these are. A node rather than a string
   *  because the `label` reading colors part of it — see there. */
  lead: ReactNode;
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
  /* Handed over whole — see the `label` reading. Ahead of everything below
     because it is the one reading that does not derive its lines from the two
     dates, and the two dates it is passed are its own span's ends rather than a
     range the arrows step. */
  if (reading.kind === 'label') return { lead: reading.lead, range: reading.range };
  const lead =
    reading.kind === 'schedule'
      ? `Schedule · ${reading.span}`
      : reading.kind === 'projected'
        ? 'Projected'
        : reading.kind === 'matchup'
          ? /* Not the week's own name, which the band directly above already
               carries (`Week 19 · Aug 10 – Aug 20`): what this line owes is
               *which* of those days, and the answer is all of them up to now. */
            'Matchup to date'
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
  fixed = false,
  measure = false,
  endSlot,
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
   * The whole disclosure **in the Schedule reading**: the span run, which is
   * the only thing a reader of that view can pick, the columns there being days
   * ahead rather than a range. It is the panel's only content — a preset list
   * under a table of days ahead names days no column on screen is drawn from,
   * which is the argument that made it the whole panel and, later, the argument
   * that retired the preset list everywhere else.
   *
   * A caller hands over exactly one of `spanControl` and `popover`, and which
   * one is a function of its own reading: Schedule opens the strip, every other
   * reading opens the calendar.
   */
  spanControl?: ReactNode;
  /**
   * **What the press opens instead of the disclosure, where the disclosure is
   * the wrong shape for it** — a panel floating over the page rather than one
   * pushing the page down, hung under the middle of the bar.
   *
   * It came in for the Feed, whose face opens the calendar straight away, and
   * the reason is a number: the presets panel was 50px and a month grid is 300,
   * so drawn in the flow it would be 300px of pinned chrome on a view whose
   * whole content is a scrolling stream. `--chrome-h` is measured off that box,
   * so the page below would move down by the height of a calendar every time
   * one was opened. Over the page it costs the chrome nothing — measured, the
   * chrome does not move at all at 1400, 390 or 320. **Every reading of a range
   * opens it now**, the Roster's included; only Schedule keeps a panel.
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
   * **Null is the Schedule reading and nothing else**, where `spanControl`
   * is the panel instead.
   */
  popover?: ReactNode;
  /** What the popover calls itself, to a screen reader and in the face's own
   *  tooltip — `Pick a range on the calendar`. Ignored without `popover`. */
  popoverLabel?: string;
  /**
   * **The days are a fact about the page rather than a control on it.** The
   * arrows are not drawn at all and the face is a `<div>`, not a button: it
   * opens nothing, so there is nothing for a press to promise.
   *
   * **Off rather than away is the rule for an arrow that has nowhere to step**,
   * and this is deliberately not that case. A disabled arrow keeps its box
   * because the reader *could* have stepped and cannot from here — the tooltip
   * says why, and the label must not move out from under the finger that is
   * stepping it. In a fixed reading there is no stepping at all and never was,
   * so two permanently dead 36px squares either side would be a control the
   * page does not have; the row goes to one centered column instead.
   *
   * It exists for a matchup team page's **Summary** reading, whose span is the
   * period start to today by definition. Everything else about the bar is
   * unchanged, which is the point — one bar states the days on every surface,
   * and this is the one surface where they are not the reader's to pick.
   */
  fixed?: boolean;
  /**
   * **Publish this bar's height as `--date-bar-h`.** The app's own bar passes
   * it and nobody else does, which is the whole of the rule: the property is
   * what the summary table's header row sticks below, and there is one such
   * table on screen at a time under one such bar. A team page's bar and the
   * expanded box's are neither of them the one a page's header row is under.
   *
   * Measured rather than declared for the reason every height in this app is:
   * the bar is 54px on a desktop and stays 54 as its label changes (that is
   * this control's own rule), but the panel it opens adds 50 and the whole box
   * bleeds and wraps differently at 320 — and a header row stuck 54px down
   * under a 104px bar is a column heading behind a control.
   */
  measure?: boolean;
  /**
   * **One control at the bar's right-hand end**, drawn in the collapsed row
   * beside the two steps rather than inside anything the face opens.
   *
   * **A fourth thing in this row was rejected once**, in as many words: it
   * "would either break the centering the bar's own grid exists for or take a
   * third of the middle column on a 320px phone". Both halves of that are
   * answered here rather than argued away.
   *
   * *The centering* — the slot is **mirrored by an empty one of the same width
   * at the left end**, so the row goes from three tracks to five and the middle
   * one stays on the bar's own center line by construction, exactly as it does
   * with the two equal arrows. That is this file's own *reserve the box* rule:
   * a ghost sharing the grid rather than a number in a stylesheet. Measured,
   * `face.center − bar.center` is **0.00 at 320, 390, 640, 1200 and 1920**,
   * with the slot filled and empty alike.
   *
   * *The 320px phone* — the two end slots cost **38px each** (a 30px icon
   * button and the row's 8px gap), and the widest face this bar prints is the
   * Rankings tab's projected reading at **247.48px**. 247.48 + 2×38 + 2×44
   * (the arrows and their gaps) + 20 (the bar's own padding) is **431.48**, so
   * 432 is the narrowest window where the fourth thing costs the face nothing
   * at all. Below it the ends collapse to three tracks again and the caller's
   * control stays where it was — one media query, both rendered, neither
   * chosen in JS, which is the swap this stylesheet already makes for every
   * pill row that becomes a `<select>`.
   *
   * Ignored on a `fixed` bar, which has no row of controls to end.
   */
  endSlot?: ReactNode;
}) {
  const { lead, range } = dateBarFace(reading, start, end);
  const asPopover = popover != null;
  /* A fixed bar has nothing to open, so it is never open — tested here rather
     than trusted to every caller, a stale `open` surviving a press of `Summary`
     being exactly the kind of thing that outlives the branch it was written
     in. */
  const shown = open && !fixed;
  const barRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  /* The hooks run unconditionally and are handed `false` where the bar is a
     disclosure — a disclosure in the pinned chrome has no outside to press
     past and no height to cap, and a conditional hook is not a thing React
     allows in any case. */
  useDismissable(asPopover && shown, barRef, onClose ?? (() => {}));
  usePopoverFit(asPopover && shown, popRef);
  /* Runs unconditionally and does nothing unless asked — see `measure`. */
  usePublishedHeight(barRef, '--date-bar-h', measure && !fixed);
  if (fixed) {
    return (
      <div className="date-bar date-bar-fixed" role="group" aria-label="Dates">
        <div className="date-bar-row">
          <div className="date-face">
            <span className="date-face-lead">{lead}</span>
            <span className="date-face-range">{range}</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      className={`date-bar${shown ? ' open' : ''}${asPopover ? ' date-bar-anchored' : ''}${
        endSlot ? ' date-bar-ends' : ''
      }`}
      role="group"
      aria-label="Dates"
      ref={barRef}
    >
      <div className="date-bar-row">
        {/* The ghost. It holds the left end open to exactly the width the
            control at the right end takes, which is what keeps the face on the
            bar's own center line — the same trick the two equal arrows already
            play, one track further out. `aria-hidden` and empty: it is a
            reservation, not a thing. */}
        {endSlot && <span className="date-bar-ghost" aria-hidden="true" />}
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
          className={`date-face${shown ? ' active' : ''}`}
          onClick={onToggle}
          aria-expanded={shown}
          aria-haspopup={asPopover ? 'dialog' : undefined}
          /* The tooltip names what is actually behind the press, and there are
             two things it can be: a calendar, which is what every reading of a
             range opens, or the span run in the Schedule reading, where a
             calendar would name days no column on screen is drawn from. */
          title={
            shown
              ? asPopover
                ? 'Close the calendar'
                : 'Close the date controls'
              : asPopover
                ? popoverLabel ?? 'Pick a range'
                : 'How far ahead'
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
        {endSlot && (
          <span
            className="date-bar-end"
            /* **Two disclosures on one bar, and only one of them open.** The
               face opens a list over the page and this slot opens a key; both
               hang off the bar, so at the widths where they overlap (measured,
               the list is centered and this panel is `left: 0`, so they share
               screen from 432 to about 900) a reader could have had both.

               **The press is not spent on the closing**, which is the one place
               this parts from `useDismissable`'s rule — and it parts from it
               because the rule's own reasoning does not reach here. That rule
               is about a press *aimed past* an open panel at a control the
               panel was covering: "a control that fires as a side effect of
               tidying up is one the reader never chose". This control is in the
               bar's own row, above the panel and never covered by it, so a
               press on it is aimed at it. It gets what it aimed at, and the
               bar's other panel closes because a bar holding two is a bar
               holding one too many. */
            onPointerDown={() => {
              if (shown) onClose?.();
            }}
          >
            {endSlot}
          </span>
        )}
      </div>
      {shown &&
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
          <div className="date-bar-panel">{spanControl}</div>
        ))}
    </div>
  );
}
