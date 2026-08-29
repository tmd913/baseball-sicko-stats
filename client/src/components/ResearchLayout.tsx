import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import type { ResearchControlsPref } from '../types';

/**
 * ---------------------------------------------------------------------------
 * The research board's bar, as an arrangement the reader owns
 * ---------------------------------------------------------------------------
 *
 * **Reported, against the bar of four buttons this replaces: not all of these
 * controls were meant to be in a popup — some of them need the board visible.**
 * That is the fault, and it is a real one. Half of what went behind the gear is
 * a *lens*: Compare ticks players on the rows underneath it, Projected and
 * Schedule swap what the cells say, Ranks puts a second reading under every
 * number, the three ownership buttons change how many rows there are. A reader
 * presses one of those to watch the table move — and a control that covers the
 * table with a dialog while it is being pressed is a control you cannot see the
 * result of. The four-button bar answered a real measurement (156px of chrome
 * over a table where every pixel is a row) with a shape that was right for the
 * *saved things* and wrong for the lenses.
 *
 * **So the shape stops being a decision this file makes.** The bar is up to
 * four rows, and the reader says which control is on which row and in what
 * order, whether each is drawn as its icon, its word or both, and which
 * controls the sticky line carries once the bar has scrolled away and in what
 * order. Anything on no row is behind the gear, which is exactly where the
 * four-button bar put everything — so the old shape is one of the arrangements
 * this can be set to, and so is the three-run bar before it. The gear alone is
 * required to be *somewhere* (`REQUIRED_CONTROL`); it is placed like everything
 * else.
 *
 * **This file is the vocabulary and the arithmetic; `ResearchTable.tsx` draws
 * the controls themselves.** The split is the one the stylesheet and the
 * picker already make: what a key *means* lives with the thing it names, and
 * everything that has to agree about the set of keys — the editor, the
 * normalizer, the default — is here in one place. The server stores keys and
 * validates their shape, never their spelling (see `/api/prefs/research-controls`),
 * which is what lets a newer build's arrangement open in an older tab short one
 * control rather than not at all.
 */

/** Every control that can be placed, the gear among them — see
 *  `REQUIRED_CONTROL` for the one thing that is special about it. */
export type ResearchControlKey =
  | 'settings'
  | 'search'
  | 'pos'
  | 'window'
  | 'include'
  | 'watchlist'
  | 'searches'
  | 'teams'
  | 'filters'
  | 'turns'
  | 'compare'
  | 'schedule'
  | 'projected'
  | 'columns'
  | 'ranks';

/** How many rows the bar will draw. Four, because four rows of controls over a
 *  table is already more chrome than the measurement that started all this
 *  called too much — this is the ceiling on how badly a reader can arrange
 *  their own page, not a target. */
export const MAX_RESEARCH_ROWS = 4;

/**
 * **The one control that must be on the bar somewhere.**
 *
 * The gear can be moved — to another place in its row, to another row, to the
 * head or the end of the whole bar — and it cannot be taken **off**. A gear
 * behind the gear would take the screen that puts it back with it, and there is
 * no other door: the arrangement lives on the user's record, so a reader who
 * lost it would have nothing on screen to undo it with.
 *
 * It is required on the **sticky line** for the same reason and no other: that
 * line is the whole of the bar once the board is scrolled, and a reader who has
 * hidden every other control there has said they want the table — which is
 * exactly when the one way back to the controls must still be under the finger.
 *
 * Enforced in `readResearchLayout` rather than by leaving it out of the
 * arrangement, which is what it used to be. Left out, it was drawn first on the
 * first row and could not be moved at all; a rule that puts it *back* is the
 * same guarantee with the reader's choice of place kept.
 */
export const REQUIRED_CONTROL: ResearchControlKey = 'settings';

export interface ResearchControlMeta {
  key: ResearchControlKey;
  /** What the editor calls it — the word the control itself carries wherever it
   *  has one, so the chip and the button are the same noun. */
  label: string;
  /** One line under it, saying what it does. The editor is the one screen in
   *  the app where a reader meets all fourteen at once and several of them are
   *  controls they have never opened. */
  hint: string;
  /**
   * **Whether this control has both a word and a glyph**, and so whether how it
   * is drawn is a choice at all. Three of the fifteen say no, for two opposite
   * reasons:
   *
   * - **`pos` and `window` have no glyph.** It is the sentence the four-button
   *   bar was argued with: *their whole job is to say what they are set to, and
   *   a glyph cannot say `SS`*. Squared they are two identical carets, which is
   *   the exact fault the condensed run carries a three-declaration override to
   *   prevent.
   * - **`settings` has no word.** The gear names itself to a screen reader
   *   through `sr-only` and has never carried a visible label anywhere in this
   *   app, so the switch would be a control with nothing to act on.
   *
   * One flag rather than two, because what the editor needs to know is only
   * whether there is a choice here — but the two reasons are worth keeping
   * apart, since a control that grew a word would move for the second reason
   * and never for the first.
   */
  dual: boolean;
  /**
   * Whether the control **needs the board on screen to be worth pressing** —
   * the lenses, and the reason this whole screen exists. Marked so the editor
   * can say so beside the ones a reader is about to file behind the gear.
   */
  live?: boolean;
}

/**
 * The fourteen, in the order the editor lists them — which is the order the
 * *default* reads in, so a reader who has never opened this screen meets the
 * chips in the arrangement they can already see above it.
 */
export const RESEARCH_CONTROLS: ResearchControlMeta[] = [
  {
    key: 'settings',
    label: 'Board settings',
    hint: 'This box — whatever is not on the bar, and this screen',
    dual: false,
  },
  {
    key: 'search',
    label: 'Search',
    hint: 'Narrow the board to a name',
    dual: true,
  },
  {
    key: 'pos',
    label: 'Position',
    hint: 'Which slice of the league — it says which one it is set to',
    dual: false,
  },
  {
    key: 'window',
    label: 'Season / window',
    hint: 'How much of the season every number is drawn from',
    dual: false,
  },
  {
    key: 'include',
    label: 'Free agents, my roster, others',
    hint: 'Which ownership sets are on the board',
    dual: true,
    live: true,
  },
  {
    key: 'watchlist',
    label: 'Watchlist',
    hint: 'Put your watched players on top of whatever else is showing',
    dual: true,
    live: true,
  },
  {
    key: 'searches',
    label: 'Saved searches',
    hint: 'Save this reading of the board, or go back to one',
    dual: true,
  },
  {
    key: 'teams',
    label: 'Teams',
    hint: 'Read the board as thirty clubs instead of six hundred players',
    dual: true,
    live: true,
  },
  {
    key: 'filters',
    label: 'Filters',
    hint: 'Take rows out by a stat threshold',
    dual: true,
    live: true,
  },
  {
    key: 'turns',
    label: 'Starting',
    hint: 'Only the pitchers starting on the days you pick',
    dual: true,
    live: true,
  },
  {
    key: 'compare',
    label: 'Compare',
    hint: 'Tick players on the rows, then narrow the board to just them',
    dual: true,
    live: true,
  },
  {
    key: 'schedule',
    label: 'Schedule',
    hint: 'The days ahead in place of the stat columns',
    dual: true,
    live: true,
  },
  {
    key: 'projected',
    label: 'Projected',
    hint: 'What every player is expected to do over days still to be played',
    dual: true,
    live: true,
  },
  {
    key: 'columns',
    label: 'Columns',
    hint: 'Which stats the table draws, and in what order',
    dual: true,
    live: true,
  },
  {
    key: 'ranks',
    label: 'Ranks',
    hint: 'A percentile under every value',
    dual: true,
    live: true,
  },
];

const META = new Map(RESEARCH_CONTROLS.map((c) => [c.key, c]));
const KNOWN = new Set(RESEARCH_CONTROLS.map((c) => c.key));

export function researchControlMeta(key: ResearchControlKey): ResearchControlMeta {
  return META.get(key)!;
}

/**
 * **How one control is drawn on the bar** — and it is three answers rather than
 * two.
 *
 * It was a switch between the word and the glyph, and that was reported as
 * confusing, rightly: it named two of the three states a control with both can
 * be in and made the third — the one every button on this bar is in by default
 * — the *absence* of a setting rather than one of its choices. So the editor
 * offers all three and `both` is one of them, which is what makes the control a
 * choice among things a reader can see rather than a toggle between a state and
 * its negation.
 *
 * `both` is still what an **absent** entry means, which is the storage
 * convention every preference in this app follows and is a different question
 * from what the editor shows: absence lets the default move, and the third
 * segment lets the reader see it.
 */
export type ResearchControlDisplay = 'both' | 'icon' | 'text';

export const RESEARCH_DISPLAYS: ResearchControlDisplay[] = ['both', 'icon', 'text'];

export const DISPLAY_WORDS: Record<ResearchControlDisplay, string> = {
  both: 'Both',
  icon: 'Icon',
  text: 'Text',
};

/** The arrangement in the shape the board reads it in — the stored one with
 *  every gap filled and every unknown dropped. See `readResearchLayout`. */
export interface ResearchLayout {
  /** Exactly `MAX_RESEARCH_ROWS` rows, top to bottom, any of them possibly
   *  empty. Normalized to a fixed length so the editor can draw four boxes
   *  without asking whether a row exists. */
  rows: ResearchControlKey[][];
  /** The condensed run's **order** — every on-bar key, exactly once, whether or
   *  not it is drawn there. Membership is `condensedOff`'s question, kept apart
   *  from this one so a control hidden from the sticky line and put back comes
   *  back where it was rather than at the end. */
  condensed: ResearchControlKey[];
  /** Which of them are **not drawn** on the sticky line. `REQUIRED_CONTROL` is
   *  never in here. */
  condensedOff: ResearchControlKey[];
  /** How each control is drawn, where that differs from `both`. A map rather
   *  than a list because there are three answers now and only two of them are
   *  worth storing — absence is `both`, which is what every control on this bar
   *  has always been. */
  display: Partial<Record<ResearchControlKey, ResearchControlDisplay>>;
}

/** How one control is drawn, with the default filled in. */
export const displayOf = (
  l: ResearchLayout,
  key: ResearchControlKey,
): ResearchControlDisplay => l.display[key] ?? 'both';

/**
 * **The default: two rows, and the saved things behind the gear.**
 *
 * It is deliberately between the two shapes this replaces. The three-run bar
 * was measured at 156px of chrome at every width and reported as hard to
 * manage; the four-button bar took that to 60 and put a lens behind a dialog.
 * Two scrolling rows are ~96px and hold every control whose whole point is
 * watching the table move — the `live` ones above, all of which are here.
 *
 * **Row 1 is what the board is *of*** (a name, a position, a span, whose
 * players) and **row 2 is what is *done* to it** (the filters and the lenses),
 * which is the same two questions the settings dialog's own two groups ask.
 *
 * **Teams and Saved searches are the two off it**, and they are the two the
 * gear was right about: a saved search is a *list of saved things*, which is a
 * dialog's shape by the volume test `ColumnPicker` settled here, and the clubs
 * lens is a reading a reader crosses to once and stays on rather than one they
 * toggle against the rows. Neither is `live`.
 *
 * `condensed: []` means *the bar's own order*, which is what a reader who has
 * never opened the editor should get — see `readResearchLayout`, where the gap
 * is filled rather than stored.
 */
const DEFAULT_ROWS: ResearchControlKey[][] = [
  ['settings', 'search', 'pos', 'window', 'include', 'watchlist'],
  ['filters', 'turns', 'compare', 'schedule', 'projected', 'columns', 'ranks'],
  [],
  [],
];

export const DEFAULT_RESEARCH_LAYOUT: ResearchLayout = {
  rows: DEFAULT_ROWS,
  /* **Derived, not written out**, which is what keeps the two from drifting: a
     control moved between the default's rows would otherwise have to be moved
     in a second list saying the same thing, and the day someone forgot is the
     day the sticky line lost a control the bar was carrying. It is the bar read
     top to bottom, which is the arrangement-independent version of the reading
     the condensed run was measured on. */
  condensed: DEFAULT_ROWS.flat(),
  condensedOff: [],
  display: {},
};

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** Whether an arrangement is the default one — what decides that nothing is
 *  stored at all. The same policy the column picker applies to a list that has
 *  come back to the defaults: store it as **nothing**, so a reset goes on
 *  following the default as it moves rather than pinning today's copy of it. */
export function isDefaultResearchLayout(l: ResearchLayout): boolean {
  return (
    l.rows.length === DEFAULT_RESEARCH_LAYOUT.rows.length &&
    l.rows.every((r, i) => sameList(r, DEFAULT_RESEARCH_LAYOUT.rows[i])) &&
    Object.keys(l.display).length === 0 &&
    l.condensedOff.length === 0 &&
    sameList(l.condensed, DEFAULT_RESEARCH_LAYOUT.condensed)
  );
}

/**
 * **The stored arrangement, made safe to draw.**
 *
 * Everything here is a *fill* rather than a rejection, which is the rule this
 * preference is stored under: the vocabulary is the client's, so a key from a
 * newer build is dropped and the rest of the arrangement stands. Four things
 * get done, and each answers a way the stored object can be behind the code:
 *
 * - **Unknown keys go**, and a key on two rows keeps its first place — a
 *   control drawn twice on one bar is the "same disclosure a press apart" fault
 *   the gear's own exclusion of Search already names.
 * - **The rows are padded to four**, so the editor draws four boxes without a
 *   test and a stored three-row object does not lose its fourth to an
 *   `undefined`.
 * - **`condensed` is filtered to what is on the bar and then completed from
 *   it.** A control promoted onto a row is in the condensed run without the
 *   reader being asked a second question about it, and one taken off the bar
 *   leaves the run with it. The reader's stored order is kept for everything it
 *   still names; the rest is appended in bar order.
 * - **`condensedOff` keeps only on-bar controls, and never the gear.** It is
 *   kept apart from the order above rather than folded into it: a control put
 *   back on the sticky line returns to the place it had, and a stored order
 *   survives a control being hidden and shown again. And a key stored there by
 *   a build that had not yet made the gear placeable cannot hide it.
 * - **`display` keeps only controls that have both a word and a glyph**, and
 *   only the two readings that are not the default — a stored `both` is the
 *   same as no entry and is dropped, which is what keeps "absence is the
 *   default" true of what is written as well as of what is read.
 * - **The gear is put back if it is missing**, wherever the rows have left
 *   room — the head of the first row. That is `REQUIRED_CONTROL`, and it is a
 *   fill like every other rule here rather than a rejection: an arrangement
 *   written by a build that did not place the gear at all opens with it back at
 *   the front, which is exactly where that build drew it.
 */
export function readResearchLayout(
  raw: ResearchControlsPref | null | undefined,
): ResearchLayout {
  if (!raw || !Array.isArray(raw.rows)) return DEFAULT_RESEARCH_LAYOUT;
  const seen = new Set<ResearchControlKey>();
  const rows: ResearchControlKey[][] = [];
  for (const row of raw.rows.slice(0, MAX_RESEARCH_ROWS)) {
    const next: ResearchControlKey[] = [];
    for (const k of Array.isArray(row) ? row : []) {
      const key = k as ResearchControlKey;
      if (!KNOWN.has(key) || seen.has(key)) continue;
      seen.add(key);
      next.push(key);
    }
    rows.push(next);
  }
  while (rows.length < MAX_RESEARCH_ROWS) rows.push([]);
  /* The gear, put back at the head of the first row if nothing placed it. */
  if (!seen.has(REQUIRED_CONTROL)) {
    rows[0] = [REQUIRED_CONTROL, ...rows[0]];
    seen.add(REQUIRED_CONTROL);
  }

  const flat = rows.flat();
  const named = new Set<ResearchControlKey>();
  const condensed: ResearchControlKey[] = [];
  for (const k of Array.isArray(raw.condensed) ? raw.condensed : []) {
    const key = k as ResearchControlKey;
    if (!seen.has(key) || named.has(key)) continue;
    named.add(key);
    condensed.push(key);
  }
  for (const k of flat) if (!named.has(k)) condensed.push(k);

  const condensedOff: ResearchControlKey[] = [];
  for (const k of Array.isArray(raw.condensedOff) ? raw.condensedOff : []) {
    const key = k as ResearchControlKey;
    if (!seen.has(key) || key === REQUIRED_CONTROL || condensedOff.includes(key)) continue;
    condensedOff.push(key);
  }

  const display: Partial<Record<ResearchControlKey, ResearchControlDisplay>> = {};
  /* **The old two-state shape, read first and never written.** `iconOnly` was a
     list of keys drawn as their glyph, from when the choice was a switch rather
     than three readings; taken as `'icon'` entries here, an arrangement saved
     before the change keeps the readings its owner set by hand instead of
     silently coming back with every word restored. `display` is read after it,
     so a record that carries both — one written by a build in between — is the
     newer field's. The same treatment `researchWatchlistOnly` gets, and a
     record migrates the first time its owner touches the screen. */
  for (const k of Array.isArray(raw.iconOnly) ? raw.iconOnly : []) {
    const key = k as ResearchControlKey;
    if (!KNOWN.has(key) || !META.get(key)!.dual) continue;
    display[key] = 'icon';
  }
  for (const [k, v] of Object.entries(raw.display ?? {})) {
    const key = k as ResearchControlKey;
    if (!KNOWN.has(key) || !META.get(key)!.dual) continue;
    if (v !== 'icon' && v !== 'text') continue;
    display[key] = v;
  }
  return { rows, condensed, condensedOff, display };
}

/** The sticky line as it is actually drawn — the order, less what is hidden.
 *  One function so the board and the editor's own preview cannot disagree about
 *  which controls are on that line. */
export function condensedOrder(l: ResearchLayout): ResearchControlKey[] {
  return l.condensed.filter((k) => !l.condensedOff.includes(k));
}

/** What goes on the wire — `null` for the default, which is what stores nothing
 *  at all. */
export function researchLayoutPref(l: ResearchLayout): ResearchControlsPref | null {
  return isDefaultResearchLayout(l) ? null : l;
}

// ---- The editor -----------------------------------------------------------

/** With nothing picked up. Written once and read twice, exactly as the column
 *  picker's own hint is. */
const IDLE_HINT =
  'Press a control to pick it up, then press where it should go. The bar reads top to bottom.';

/** The same, for the sticky line — which is one row, so it has no top to
 *  bottom to speak of. */
const COND_HINT = 'Press a control to pick it up, then press where it should go.';


/**
 * **The hint line, and it is `ColumnPicker`'s own.**
 *
 * `.research-order-hint` is folded onto rather than copied, which is this
 * repo's rule for two things that are the same object: it is the line above a
 * press-and-press reorder saying what is in hand, on a box whose height is
 * **reserved by laying the resting string out invisibly underneath the live
 * one**. That measurement is the picker's and the reasoning is in its file —
 * without it the chips move under the finger between the press that picks a
 * control up and the press that drops it, because the two sentences wrap to
 * different numbers of rows.
 *
 * The ghost is the resting string for the same reason it is there: it is the
 * longer of the two at every width these boxes are drawn at.
 */
function ReorderHint({ resting, moving }: { resting: string; moving: string | null }) {
  return (
    <p className="research-order-hint" aria-live="polite">
      <span className="research-order-hint-ghost" aria-hidden="true">
        {resting}
      </span>
      <span>{moving ?? resting}</span>
    </p>
  );
}

/** Where a picked-up control is being put. `row` is `-1` for the box behind the
 *  gear, and `before` is the control it lands in front of — a key rather than an
 *  index, so removing the picked one first cannot shift the target out from
 *  under it. `null` is the end of that row. */
type Spot = { row: number; before: ResearchControlKey | null };

/**
 * **One control, as a chip.**
 *
 * The top of it is the press target — it picks the control up, or drops
 * whatever is in hand in front of it. Under that, on its own line, whichever
 * switch this box asks for: **how it is drawn** on the bar, **on or off** on the
 * sticky line, and neither behind the gear.
 *
 * **The switch is under the label rather than beside it**, and that is measured
 * rather than tidy: three segments and a two-line label came to 320px against
 * the 338 a 390px phone leaves inside this dialog, so a row layout wrapped
 * unpredictably — sometimes the switch beside the label, sometimes under it,
 * chip by chip down the same box. A column is the same shape at every width,
 * which is what a screen full of them needs.
 *
 * **Never two switches on one chip.** The two questions are asked in two
 * different boxes and a chip carrying both would be a control the reader has to
 * read before they can aim it.
 */
function ControlChip({
  meta,
  picked,
  moving,
  display,
  absent,
  hidden,
  frozen,
  onPress,
  onDisplay,
  onToggleHidden,
}: {
  meta: ResearchControlMeta;
  picked: boolean;
  /** Something else is in hand, so this chip is a *destination* and says so. */
  moving: boolean;
  display?: ResearchControlDisplay;
  /** Why this control has no subject on the reading the board is showing right
   *  now, or absent where it has one — `ResearchTable::noSubject`, in words. */
  absent?: string;
  /** Drawn dim, being on the sticky line's list but not on the line. */
  hidden?: boolean;
  /** Not a destination for what is in hand — the gear over the off-bar box, the
   *  one move this screen refuses. It says why in its `title` rather than going
   *  quiet under the press, a control that ignores a press being worse than one
   *  that declines it. */
  frozen?: { why: string };
  onPress: () => void;
  onDisplay?: (mode: ResearchControlDisplay) => void;
  onToggleHidden?: () => void;
}) {
  return (
    <div
      className={`rlay-chip${picked ? ' picked' : ''}${hidden ? ' off' : ''}${
        frozen ? ' frozen' : ''
      }`}
    >
      <button
        type="button"
        className="rlay-chip-main"
        aria-pressed={picked}
        disabled={!!frozen}
        onClick={onPress}
        title={
          frozen
            ? frozen.why
            : picked
              ? `Press somewhere else to put ${meta.label} there, or press it again to put it back`
              : moving
                ? `Drop it in front of ${meta.label}`
                : `${meta.hint} — press to move it`
        }
      >
        <span className="rlay-chip-label">{meta.label}</span>
        <span className="rlay-chip-hint">{meta.hint}</span>
        {/* **What this chip cannot promise.** Six of the fifteen take
            themselves off a reading that has no subject for them — a turn is a
            fact about a pitcher, a comparison is of players, a percentile is a
            standing among measured ones — and that rule has always been right
            on the *bar*. It was silent here, which was reported: `Starting`
            sitting in row 2 of this screen and nowhere on a batters board, with
            nothing on either to say which of the two was wrong.

            The *place* is stated and the arrangement is not touched, because
            the arrangement is not what changed: crossing to the clubs and back
            finds every control exactly where it was left. So this is a line on
            the chip rather than a chip moved into some other box, and the chip
            stays pressable — a reader arranging their pitching bar while
            looking at a batters board is doing something perfectly ordinary. */}
        {absent && (
          <span className="rlay-chip-absent">Not on the bar right now — {absent}</span>
        )}
      </button>
      {/* **Text, icon or both — three segments, and the third is the default.**
          It was a two-state switch reading `Word`/`Icon` and it was reported as
          confusing: it named two of the three states a control can be in and
          made the third — the one every button on this bar is in unless it is
          told otherwise — the *absence* of a setting. Three segments say what
          the three answers are, and the one in force is lit. Drawn only where
          there are both a word and a glyph to choose between: `Position` and
          the span have no glyph, the gear has no word. */}
      {onDisplay && display && (
        <div className="rlay-modes" role="group" aria-label={`How ${meta.label} is drawn`}>
          {RESEARCH_DISPLAYS.map((m) => (
            <button
              key={m}
              type="button"
              className={`rlay-mode${display === m ? ' on' : ''}`}
              aria-pressed={display === m}
              onClick={() => onDisplay(m)}
              title={
                m === 'both'
                  ? `Draw ${meta.label} with its icon and its word`
                  : m === 'icon'
                    ? `Draw ${meta.label} as its icon alone`
                    : `Draw ${meta.label} as its word alone`
              }
            >
              {DISPLAY_WORDS[m]}
            </button>
          ))}
        </div>
      )}
      {/* **On or off the sticky line**, in the slot the display switch takes on
          the bar. Two segments rather than the three above because that is how
          many answers there are, and lit on `On` for the same reason the
          display switch lights what is in force: a reader scanning this box is
          looking for what is set, not for what is default. */}
      {onToggleHidden && (
        <div
          className="rlay-modes"
          role="group"
          aria-label={`${meta.label} on the sticky line`}
        >
          <button
            type="button"
            className={`rlay-mode${hidden ? '' : ' on'}`}
            aria-pressed={!hidden}
            onClick={() => hidden && onToggleHidden()}
            title={`Draw ${meta.label} on the sticky line`}
          >
            On
          </button>
          <button
            type="button"
            className={`rlay-mode${hidden ? ' on' : ''}`}
            aria-pressed={!!hidden}
            onClick={() => !hidden && onToggleHidden()}
            title={`Leave ${meta.label} off the sticky line — it stays on the bar, and keeps its place here for when you put it back`}
          >
            Off
          </button>
        </div>
      )}
    </div>
  );
}

/** The strip at the end of a row (and the whole of an empty one): where a
 *  picked-up control lands when there is no chip to put it in front of. Drawn
 *  only while something is in hand — a permanent dotted box on four rows is
 *  four rows of instruction over a screen that already carries one line of it. */
function DropTail({
  moving,
  empty,
  label,
  onPress,
}: {
  moving: boolean;
  empty: boolean;
  label: string;
  onPress: () => void;
}) {
  if (!moving) {
    return empty ? <p className="rlay-empty">Nothing on this line.</p> : null;
  }
  return (
    <button type="button" className="rlay-tail" onClick={onPress} title={label}>
      {empty ? 'Put it here' : 'End of the row'}
    </button>
  );
}

/**
 * **The arrangement screen.**
 *
 * A dialog opened from the settings dialog, which is one step above it on
 * `DialogLayerContext` and needs to know nothing about that — the same rung
 * `ColumnPicker` takes from the same box.
 *
 * **The gesture is a press and a press**, and it is the column picker's,
 * deliberately: press a chip to pick a control up, press another to drop it in
 * front of that one. That file records why it is not a drag — a drag inside a
 * scroller fights the scroll, `touch-action` cannot arbitrate two gestures that
 * differ in neither place nor axis, and press-and-press measured 30 of 30 where
 * dragging did not. The same is true here and more so: these boxes are four
 * separate lists and a drag between them crosses every one of them.
 *
 * **Escape cancels the pick-up rather than closing the box**, the app's
 * standing rule that one press of Escape undoes one thing. `Modal` answers the
 * key on `window` in the bubble phase, so this listens in **capture** and stops
 * it there — the two are on the same object and only the phase orders them.
 *
 * **Every press commits.** There is no Save: the bar above the dialog is the
 * preview, and a reader who has moved a control wants to see the row it landed
 * on. That is the write-through the whole app's preferences take.
 */
export function ResearchLayoutEditor({
  layout,
  absent,
  onChange,
  onReset,
  onClose,
}: {
  layout: ResearchLayout;
  /** Which controls the board behind this box is not drawing, and why — keyed
   *  by control, in words. See `ResearchTable::noSubject`, which is the one
   *  place that decides it for both. */
  absent: Partial<Record<ResearchControlKey, string>>;
  onChange: (next: ResearchLayout) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<ResearchControlKey | null>(null);

  // A pick-up cannot outlive a reset, which is the one thing that can change
  // this list under the reader's hand while a chip is in it.
  const membership = layout.rows.flat().slice().sort().join(',');
  useEffect(() => setPicked(null), [membership]);

  useEffect(() => {
    if (picked === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setPicked(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [picked]);

  const offBar = RESEARCH_CONTROLS.map((c) => c.key).filter(
    (k) => !layout.rows.some((r) => r.includes(k)),
  );

  /** Put the control in hand where the press says, and commit. `condensed` is
   *  left alone: `readResearchLayout` completes it from the bar on the way back
   *  in, so a control that has just arrived on a row joins the condensed run at
   *  the end of it rather than needing a second decision here. */
  const place = (spot: Spot) => {
    const from = picked;
    setPicked(null);
    if (from === null) return;
    // The one move this screen refuses — see `REQUIRED_CONTROL`. The off-bar
    // box declines the press rather than reaching here (its chips are frozen
    // and its tail is not drawn while the gear is in hand), so this is the
    // backstop rather than the message.
    if (from === REQUIRED_CONTROL && spot.row < 0) return;
    const rows = layout.rows.map((r) => r.filter((k) => k !== from));
    if (spot.row >= 0) {
      const row = rows[spot.row];
      const at = spot.before === null ? row.length : row.indexOf(spot.before);
      row.splice(at < 0 ? row.length : at, 0, from);
    }
    /* Straight back through the normalizer, which is the one place that knows
       how `condensed` follows the bar: a control that has just landed on a row
       joins the sticky line at the end of it, and one that has just gone behind
       the gear leaves the line with it. Writing that rule a second time here is
       how the two would come to disagree. */
    onChange(readResearchLayout({ ...layout, rows }));
  };

  /** The condensed run's own reorder — the same gesture over one list, and its
   *  own pick-up, because a control being moved between rows and a control being
   *  moved along the sticky line are two different sentences and one chip in
   *  hand cannot be both. */
  const [pickedCond, setPickedCond] = useState<ResearchControlKey | null>(null);
  useEffect(() => setPickedCond(null), [membership]);
  useEffect(() => {
    if (pickedCond === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setPickedCond(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pickedCond]);

  const placeCond = (before: ResearchControlKey | null) => {
    const from = pickedCond;
    setPickedCond(null);
    if (from === null) return;
    const next = layout.condensed.filter((k) => k !== from);
    const at = before === null ? next.length : next.indexOf(before);
    next.splice(at < 0 ? next.length : at, 0, from);
    onChange({ ...layout, condensed: next });
  };

  /** How a control is drawn. `both` is stored as **nothing**, which keeps
   *  "absence is the default" true of what is written as well as of what is
   *  read — and is what lets that default move later. */
  const setDisplay = (key: ResearchControlKey, mode: ResearchControlDisplay) => {
    const display = { ...layout.display };
    if (mode === 'both') delete display[key];
    else display[key] = mode;
    onChange({ ...layout, display });
  };

  /** On or off the sticky line. It writes `condensedOff` and never `condensed`,
   *  which is the whole reason the two are separate lists: a control taken off
   *  and put back returns to the place it had rather than to the end. */
  const toggleHidden = (key: ResearchControlKey) =>
    onChange({
      ...layout,
      condensedOff: layout.condensedOff.includes(key)
        ? layout.condensedOff.filter((k) => k !== key)
        : [...layout.condensedOff, key],
    });

  const moving = picked !== null;
  const movingLabel = picked === null ? null : researchControlMeta(picked).label;

  /* `onBar` decides whether the chip carries the display switch, and that is
     not tidiness: behind the gear every control is drawn with its word by the
     dialog it sits in, so the switch there would be a setting with nothing to
     act on until the control is moved.

     `frozen` is the one move this screen refuses — the gear over the off-bar
     box (`REQUIRED_CONTROL`). It is said on the chip rather than enforced
     silently in `place`, a control that ignores a press being worse than one
     that declines it and says why. */
  const chip = (key: ResearchControlKey, onBar: boolean) => {
    const meta = researchControlMeta(key);
    const frozen =
      !onBar && picked === REQUIRED_CONTROL
        ? { why: 'Board settings has to stay on the bar — it is the only way back to this screen' }
        : undefined;
    return (
      <ControlChip
        key={key}
        meta={meta}
        picked={picked === key}
        moving={moving}
        frozen={frozen}
        absent={absent[key]}
        display={displayOf(layout, key)}
        onPress={() =>
          picked === null
            ? setPicked(key)
            : picked === key
              ? setPicked(null)
              : place({
                  row: layout.rows.findIndex((r) => r.includes(key)),
                  before: key,
                })
        }
        onDisplay={onBar && meta.dual ? (m) => setDisplay(key, m) : undefined}
      />
    );
  };

  return (
    <Modal
      title="Arrange the controls"
      titleId="research-layout-title"
      className="rl-dialog-box rlay-dialog-box"
      onClose={onClose}
    >
      <div className="rlay">
        {/* The one line on the screen that says what a picked-up chip is and
            how to put it down — a live region, since the same box is the whole
            of the feedback for a gesture that has two halves a press apart. */}
        <ReorderHint
          resting={IDLE_HINT}
          moving={
            picked === null
              ? null
              : `Moving ${movingLabel} — press where it should go, or Esc to cancel.`
          }
        />

        {layout.rows.map((row, i) => (
          <section className="rlay-row" key={i}>
            <h3 className="rlay-head">Row {i + 1}</h3>
            <div className="rlay-slots">
              {row.map((k) => chip(k, true))}
              <DropTail
                moving={moving}
                empty={row.length === 0}
                label={`Put ${movingLabel} at the end of row ${i + 1}`}
                onPress={() => place({ row: i, before: null })}
              />
            </div>
          </section>
        ))}

        {/* **Off the bar is not "off".** Everything here is in the settings
            dialog this screen was opened from, which is where the four-button
            bar put all fourteen — so this box is that shape, kept and named,
            rather than a bin. The note says which controls are worse off in it,
            because that is the whole finding this screen exists to answer. */}
        <section className="rlay-row rlay-off">
          <h3 className="rlay-head">Behind the gear</h3>
          <p className="rlay-note">
            These stay in this settings box instead of the bar. A control that
            changes what the table says is worth a place on the bar — you can't
            watch the board move behind a dialog.
          </p>
          <div className="rlay-slots">
            {offBar.map((k) => chip(k, false))}
            {/* No tail while the gear is in hand — this box is the one place it
                cannot go, and a drop target that refused the drop would be
                worse than none. The chips beside it say the same thing in their
                own `title` (`frozen`), which is where a reader who pressed one
                finds out why. */}
            {picked !== REQUIRED_CONTROL && (
              <DropTail
                moving={moving}
                empty={offBar.length === 0}
                label={`Put ${movingLabel} behind the gear`}
                onPress={() => place({ row: -1, before: null })}
              />
            )}
            {moving && picked === REQUIRED_CONTROL && (
              <p className="rlay-empty">Board settings has to stay on the bar.</p>
            )}
          </div>
        </section>

        {/* **The sticky line is its own order, and that is not a duplicate of
            the bar's.** Once the board is scrolled the bar is gone and this one
            line stands in for all four rows — so what a reader wants first
            there is what they reach for *while reading the table*, which is
            rarely what they set the board up with. One list, no rows: it is one
            line by construction. */}
        <section className="rlay-row rlay-cond">
          <h3 className="rlay-head">Once the bar has scrolled away</h3>
          <p className="rlay-note">
            The order this one line reads in, and which of the bar's controls
            are on it. Turning one off leaves it on the bar and keeps its place
            here, so putting it back puts it back where it was.
          </p>
          <ReorderHint
            resting={COND_HINT}
            moving={
              pickedCond === null
                ? null
                : `Moving ${researchControlMeta(pickedCond).label} — press where it should go, or Esc to cancel.`
            }
          />
          <div className="rlay-slots">
            {layout.condensed.map((k) => (
              <ControlChip
                key={k}
                meta={researchControlMeta(k)}
                picked={pickedCond === k}
                moving={pickedCond !== null}
                absent={absent[k]}
                hidden={layout.condensedOff.includes(k)}
                onPress={() =>
                  pickedCond === null
                    ? setPickedCond(k)
                    : pickedCond === k
                      ? setPickedCond(null)
                      : placeCond(k)
                }
                /* The gear keeps its place here and takes no switch: this line
                   is the whole of the bar once the board is scrolled, and a
                   reader who has turned every other control off has said they
                   want the table — which is exactly when the one way back must
                   still be under the finger. See `REQUIRED_CONTROL`. */
                onToggleHidden={k === REQUIRED_CONTROL ? undefined : () => toggleHidden(k)}
              />
            ))}
            <DropTail
              moving={pickedCond !== null}
              empty={layout.condensed.length === 0}
              label="Put it at the end of the sticky line"
              onPress={() => placeCond(null)}
            />
          </div>
        </section>

        <div className="rlay-foot">
          <button
            type="button"
            className="research-clear"
            onClick={onReset}
            title="Back to the two rows this board opens with"
          >
            Reset the arrangement
          </button>
        </div>
      </div>
    </Modal>
  );
}
