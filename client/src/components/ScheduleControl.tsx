import { SpinningBaseball } from './Loading';
import { effectiveSpan, scheduleSpans, spanLabel, toScheduleSpan } from './schedule';
import type { ScheduleSpan } from './schedule';
import type { MatchupWindow } from '../types';
import { SlidingTabs } from './TabSlider';

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
         so it is the same object as the board's Watchlist button and the
         matchup row's Summary toggle by construction. A plain switch with no panel, so
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
 * **A connected league is offered its own two weeks — `Week 19` and `Week 20` —
 * and nothing else; everyone else gets `Next 7` and `Next 14`.** The named pair is what a
 * fantasy manager actually plans in — a matchup period rather than a rolling
 * week that starts today and ends in the middle of one — and on the live league
 * today the two are nowhere near the same span: this matchup is a fortnight's
 * playoff round with eight days left, and next runs a fortnight after that.
 * This week is what the mode opens on (`defaultScheduleSpan`), because it
 * is the question the view is opened with.
 *
 * The numeric pair is a **fallback rather than a fifth and sixth option** — see
 * `scheduleSpans` for why the test is *both* named spans and not merely the
 * league, and what the last matchup period of a season is offered.
 *
 * They are offered **only where there is a league to define them**: a matchup
 * period is a fact about an ESPN league rather than about which list the roster
 * views happen to be reading, which is why the gate is a connected league
 * rather than `rosterSource` — the same gate `Ros%` and the eligibility chip
 * are on, and the same reason the research board gets them too. A board of free
 * agents read for *next* matchup is exactly the pickup question.
 *
 * **`Next 7` and `Next 14` are spelled out, and that wording is load-bearing on
 * the research board**: the board already carries a run of spans reading
 * `Season · 7d · 15d · 30d · 60d`, and those name the days the *stats* are
 * drawn from — the opposite direction in time. Two controls both reading `7d`
 * an inch apart, meaning last week on one and next week on the other, is the
 * one thing that row must not say.
 *
 * **On a phone it is a `<select>`**, which is the app's own answer for every
 * strip of pills that outgrows a narrow screen — the research board's window
 * tabs, its position row and the Rankings spans all make the same swap at 640,
 * and `.schedule-span-select` is folded onto `.research-window-select` so all
 * of them are one control by construction. (The date presets were the first of
 * them and headed that selector list; they went with the preset row, and the
 * list's head moved to the first surviving member.) Both are rendered and the media query picks,
 * rather than a JS media test that could drift from the CSS.
 *
 * It swaps at one width whatever the run holds, and that is the point rather
 * than a simplification: **how many spans a reader is offered is a fact about
 * his league**, so the pill row's width is not ours to know — the fallback run
 * measures **367px at 390 against the 346** the app's gutters leave, taking a
 * line of its own and the pinned chrome from 207px to 255. A control whose
 * shape depended on what somebody's league happened to publish would be the
 * one thing worse than a control that is always a dropdown on a phone.
 */
export function ScheduleSpanTabs({
  span,
  matchup,
  onChange,
}: {
  span: ScheduleSpan;
  /** The league's own two periods, or null with no league — which is what
   *  decides whether the named pair is offered at all. */
  matchup: MatchupWindow | null;
  onChange: (s: ScheduleSpan) => void;
}) {
  const spans = scheduleSpans(matchup);
  // What is *selected* is the span in force rather than the one asked for: a
  // `sched=next` link opened without a league draws seven days, and the control
  // has to agree with the table under it.
  const active = effectiveSpan(span, matchup);
  return (
    <>
      <SlidingTabs className="schedule-span view-switch" label="How far ahead">
        {spans.map((s) => {
          const { label, title } = spanLabel(s, matchup);
          return (
            <button
              key={String(s)}
              type="button"
              role="tab"
              aria-selected={active === s}
              className={`view-tab${active === s ? ' active' : ''}`}
              onClick={() => onChange(s)}
              title={title}
            >
              {label}
            </button>
          );
        })}
      </SlidingTabs>
      <select
        className="schedule-span-select"
        aria-label="How far ahead"
        value={String(active)}
        onChange={(e) => onChange(toScheduleSpan(e.target.value) ?? 7)}
      >
        {spans.map((s) => {
          const { label, title } = spanLabel(s, matchup);
          return (
            <option key={String(s)} value={String(s)} title={title}>
              {label}
            </option>
          );
        })}
      </select>
    </>
  );
}
