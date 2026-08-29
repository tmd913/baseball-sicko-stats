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
 * four rows, the reader says which control is on which row and in what order,
 * which ones give up their word for their glyph, and what order the condensed
 * run reads in once the bar has scrolled away. Anything on no row is behind the
 * gear, which is exactly where the four-button bar put everything — so the old
 * shape is one of the arrangements this can be set to, and so is the three-run
 * bar before it.
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

/** Every control that can be placed. The gear is deliberately not among them —
 *  see `DEFAULT_RESEARCH_LAYOUT`. */
export type ResearchControlKey =
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
   * Whether it has a glyph of its own, and so whether its word can come off.
   *
   * `pos` and `window` are the two that cannot, and it is the same sentence the
   * bar's own four-button shape was argued with: *their whole job is to say
   * what they are set to, and a glyph cannot say `SS`*. Offered as a toggle
   * anyway they would square to two identical carets, which is the exact fault
   * the condensed run carries a three-declaration override to prevent.
   */
  glyph: boolean;
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
    key: 'search',
    label: 'Search',
    hint: 'Narrow the board to a name',
    glyph: true,
  },
  {
    key: 'pos',
    label: 'Position',
    hint: 'Which slice of the league — it says which one it is set to',
    glyph: false,
  },
  {
    key: 'window',
    label: 'Season / window',
    hint: 'How much of the season every number is drawn from',
    glyph: false,
  },
  {
    key: 'include',
    label: 'Free agents, my roster, others',
    hint: 'Which ownership sets are on the board',
    glyph: true,
    live: true,
  },
  {
    key: 'watchlist',
    label: 'Watchlist',
    hint: 'Put your watched players on top of whatever else is showing',
    glyph: true,
    live: true,
  },
  {
    key: 'searches',
    label: 'Saved searches',
    hint: 'Save this reading of the board, or go back to one',
    glyph: true,
  },
  {
    key: 'teams',
    label: 'Teams',
    hint: 'Read the board as thirty clubs instead of six hundred players',
    glyph: true,
    live: true,
  },
  {
    key: 'filters',
    label: 'Filters',
    hint: 'Take rows out by a stat threshold',
    glyph: true,
    live: true,
  },
  {
    key: 'turns',
    label: 'Starting',
    hint: 'Only the pitchers starting on the days you pick',
    glyph: true,
    live: true,
  },
  {
    key: 'compare',
    label: 'Compare',
    hint: 'Tick players on the rows, then narrow the board to just them',
    glyph: true,
    live: true,
  },
  {
    key: 'schedule',
    label: 'Schedule',
    hint: 'The days ahead in place of the stat columns',
    glyph: true,
    live: true,
  },
  {
    key: 'projected',
    label: 'Projected',
    hint: 'What every player is expected to do over days still to be played',
    glyph: true,
    live: true,
  },
  {
    key: 'columns',
    label: 'Columns',
    hint: 'Which stats the table draws, and in what order',
    glyph: true,
    live: true,
  },
  {
    key: 'ranks',
    label: 'Ranks',
    hint: 'A percentile under every value',
    glyph: true,
    live: true,
  },
];

const META = new Map(RESEARCH_CONTROLS.map((c) => [c.key, c]));
const KNOWN = new Set(RESEARCH_CONTROLS.map((c) => c.key));

export function researchControlMeta(key: ResearchControlKey): ResearchControlMeta {
  return META.get(key)!;
}

/** The arrangement in the shape the board reads it in — the stored one with
 *  every gap filled and every unknown dropped. See `readResearchLayout`. */
export interface ResearchLayout {
  /** Exactly `MAX_RESEARCH_ROWS` rows, top to bottom, any of them possibly
   *  empty. Normalized to a fixed length so the editor can draw four boxes
   *  without asking whether a row exists. */
  rows: ResearchControlKey[][];
  /** The condensed run's order — every on-bar key, exactly once. */
  condensed: ResearchControlKey[];
  /** Which controls are drawn as their glyph alone. */
  iconOnly: ResearchControlKey[];
}

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
  ['search', 'pos', 'window', 'include', 'watchlist'],
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
  iconOnly: [],
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
    l.iconOnly.length === 0 &&
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
 * - **`iconOnly` keeps only controls that have a glyph to fall back to**, since
 *   a word taken off `Position` leaves a caret and nothing else.
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

  const iconOnly: ResearchControlKey[] = [];
  for (const k of Array.isArray(raw.iconOnly) ? raw.iconOnly : []) {
    const key = k as ResearchControlKey;
    if (!KNOWN.has(key) || !META.get(key)!.glyph || iconOnly.includes(key)) continue;
    iconOnly.push(key);
  }
  return { rows, condensed, iconOnly };
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

/** One control, as a chip: the press target that picks it up or drops another
 *  one in front of it, and — where it has a glyph — the switch that takes its
 *  word off. */
function ControlChip({
  meta,
  picked,
  moving,
  icon,
  onPress,
  onToggleIcon,
}: {
  meta: ResearchControlMeta;
  picked: boolean;
  /** Something else is in hand, so this chip is a *destination* and says so. */
  moving: boolean;
  icon: boolean;
  onPress: () => void;
  onToggleIcon?: () => void;
}) {
  return (
    <div className={`rlay-chip${picked ? ' picked' : ''}`}>
      <button
        type="button"
        className="rlay-chip-main"
        aria-pressed={picked}
        onClick={onPress}
        title={
          picked
            ? `Press somewhere else to put ${meta.label} there, or press it again to put it back`
            : moving
              ? `Drop it in front of ${meta.label}`
              : `${meta.hint} — press to move it`
        }
      >
        <span className="rlay-chip-label">{meta.label}</span>
        <span className="rlay-chip-hint">{meta.hint}</span>
      </button>
      {/* **The word or the glyph, on the chip rather than in a list of its
          own.** It is a fact about *this* control and there is exactly one
          place a reader is already looking at all fourteen of them. Drawn only
          where there is a glyph to fall back to: `Position` and the span say
          what they are set to and have nothing else to say it with. */}
      {onToggleIcon && (
        <button
          type="button"
          className={`rlay-chip-icon${icon ? ' on' : ''}`}
          aria-pressed={icon}
          onClick={onToggleIcon}
          title={
            icon
              ? `${meta.label} is drawn as its icon alone — press to put the word back`
              : `${meta.label} is drawn with its word — press to leave the icon alone`
          }
        >
          {icon ? 'Icon' : 'Word'}
        </button>
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
  onChange,
  onReset,
  onClose,
}: {
  layout: ResearchLayout;
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

  const toggleIcon = (key: ResearchControlKey) =>
    onChange({
      ...layout,
      iconOnly: layout.iconOnly.includes(key)
        ? layout.iconOnly.filter((k) => k !== key)
        : [...layout.iconOnly, key],
    });

  const moving = picked !== null;
  const movingLabel = picked === null ? null : researchControlMeta(picked).label;

  /* `onBar` decides whether the chip carries its Word/Icon switch, and that is
     not tidiness: behind the gear every control is drawn with its word by the
     dialog it sits in, so a switch there would be a setting with nothing to
     act on until the control is moved. */
  const chip = (key: ResearchControlKey, onBar: boolean) => {
    const meta = researchControlMeta(key);
    return (
      <ControlChip
        key={key}
        meta={meta}
        picked={picked === key}
        moving={moving}
        icon={layout.iconOnly.includes(key)}
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
        onToggleIcon={onBar && meta.glyph ? () => toggleIcon(key) : undefined}
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
            <DropTail
              moving={moving}
              empty={offBar.length === 0}
              label={`Put ${movingLabel} behind the gear`}
              onPress={() => place({ row: -1, before: null })}
            />
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
            {layout.condensed.length
              ? 'The order this one sticky line reads in. Every control on the bar is on it.'
              : 'Nothing is on the bar, so there is no sticky line.'}
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
                icon={layout.iconOnly.includes(k)}
                onPress={() =>
                  pickedCond === null
                    ? setPickedCond(k)
                    : pickedCond === k
                      ? setPickedCond(null)
                      : placeCond(k)
                }
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
