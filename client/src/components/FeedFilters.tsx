/**
 * **The batter feed's play filters** — which kinds of play the stream draws.
 *
 * The Feed view is the roster's day read by clock, and on a full slate it is
 * hundreds of items: every plate appearance of every batter on the roster, plus
 * every bag any of them took. The one thing it could not do was answer *what
 * actually happened today* — the home runs, the steals, the plays there is film
 * of — without the reader scrolling past every strikeout in between.
 *
 * **Six kinds, and they union.** That is the research board's include-button
 * model rather than a segmented control, and for its reason: the sets genuinely
 * overlap (a home run is a hit and — nearly always — an RBI and a play with
 * film), so "pick one" would be a lie about the vocabulary, where independent
 * switches say every one of their states. Nothing selected is the whole stream —
 * a filter set that defaults to *everything* rather than to nothing, so the feed
 * opens as it always did.
 *
 * **`XBH` was a seventh and is gone**, and the two reasons are the ones that
 * decide any chip here. It answered a question nobody asks of a *stream*: a
 * double and a home run are two plays a reader recognizes on sight, and the
 * chip's job is to cut hundreds of items down rather than to name a category of
 * hit. And it barely cut — on a checked day it was 11 of 51 items against
 * `Hits`' 18, so it selected two thirds of a set already one chip away, on a row
 * where every chip costs the next one its place on the line. An old
 * `plays=xbh` link is read as the wider stream it no longer names, which is the
 * direction `toPlayFilters` fails in for every key it does not know.
 *
 * **`New` is not one of them and is deliberately kept out of this list.** It
 * asks *when* rather than *what kind*, so it narrows whatever the six selected
 * instead of adding to it — which is exactly the split `inc=` and `watch=1`
 * already make on the research board, where the ownership sets union and the
 * watchlist is a separate axis. Read `HR + New` as "the new home runs", never as
 * "the home runs and also everything new".
 *
 * **Batter tab only.** A pitcher's stream item is his whole *outing* rather than
 * a play — the same fact the kind tabs exist for — so there is nothing here to
 * select on, and the control is not drawn.
 */

/**
 * The six kinds a play can be asked for, **in the order the chips read** — which
 * is a box score's own order and not the vocabulary's history: the two ways of
 * reaching a base by hitting it (`HR`, `Hits`), then the two halves of a run
 * (`Runs` he scored, `RBI` he drove in), then the base he took without a hit at
 * all (`SB`), and last the one chip that is not a kind of play but a fact about
 * whether there is film of it.
 */
export type PlayFilterKey = 'hr' | 'hit' | 'run' | 'rbi' | 'sb' | 'video';

export const PLAY_FILTER_KEYS: PlayFilterKey[] = ['hr', 'hit', 'run', 'rbi', 'sb', 'video'];

export interface PlayFilterDef {
  key: PlayFilterKey;
  /** Short enough for six of them to share a phone's width. */
  label: string;
  /** What the chip is actually selecting, in words — the label cannot say it. */
  title: string;
}

/**
 * The chips' own vocabulary.
 *
 * The labels are abbreviations because six of these share one row on a 390px
 * phone, and every one of them is a form a box score already uses. What an
 * abbreviation cannot say is which plays it takes — that a home run is inside
 * `Hits` and inside `RBI`, that `Runs` is him crossing the plate where `RBI` is
 * him driving somebody in — so each carries the sentence.
 */
export const PLAY_FILTERS: PlayFilterDef[] = [
  { key: 'hr', label: 'HR', title: 'Home runs' },
  {
    key: 'hit',
    label: 'Hits',
    title: 'Hits — singles, doubles, triples and home runs',
  },
  {
    key: 'run',
    label: 'Runs',
    title: 'Runs he scored — crossing the plate, not driving one in',
  },
  {
    key: 'rbi',
    label: 'RBI',
    title: 'Plate appearances he drove a run in on — the other half of Runs',
  },
  { key: 'sb', label: 'SB', title: 'Stolen bases' },
  {
    key: 'video',
    label: 'Video',
    title: 'Plays MLB filed a clip for',
  },
];

const BY_KEY = new Map(PLAY_FILTERS.map((f) => [f.key, f]));

/** A chip's own label, for the empty state's wording and the button's title. */
export function playFilterLabel(key: PlayFilterKey): string {
  return BY_KEY.get(key)?.label ?? key;
}

/**
 * Read the URL's `plays=` into a set, dropping anything this build has no chip
 * for. An older link naming a kind that has since gone is a link that shows a
 * *wider* stream than it promised rather than an empty one, which is the
 * direction every parameter in this app fails in.
 */
export function toPlayFilters(raw: string | null): Set<PlayFilterKey> {
  if (!raw) return new Set();
  const out = new Set<PlayFilterKey>();
  for (const part of raw.split(',')) {
    const k = part.trim() as PlayFilterKey;
    if (BY_KEY.has(k)) out.add(k);
  }
  return out;
}

/** The `plays=` value for a set, or null where it says nothing (the default). */
export function playFiltersParam(keys: Set<PlayFilterKey>): string | null {
  if (keys.size === 0) return null;
  // In the vocabulary's own order rather than insertion order, so two readers
  // who tick the same three chips share one link.
  return PLAY_FILTER_KEYS.filter((k) => keys.has(k)).join(',');
}

/**
 * **The `Plays` disclosure and its panel** — the app's own toggle-and-panel
 * shape rather than a second one that resembles it.
 *
 * `.research-toggle` and `.research-panel` are the research board's classes,
 * folded onto by every disclosure in this app, so the button carries `.active`
 * while its panel is open and `.on` while the filter *holds* something — and
 * that second class is what makes a collapsed panel safe: the count badge and
 * the lit border say the stream is narrowed while the reader scrolls, which is
 * the board's own rule that a collapsed control must never be the only place a
 * filter lives.
 *
 * **`New` reads last and is spaced like every chip before it**, which is a
 * reversal of the two devices that came before it. It was a **hairline**, which
 * could not survive the wrap — the panel breaks where the window says, so at
 * 390px `New` drops to a second line and the rule was left at the end of the
 * first with nothing after it, a mark separating a group from nothing. It was
 * then a wider gap, which cannot dangle and so was the right shape for the
 * wrong claim: a chip set an inch apart from its neighbours reads as a second
 * *group*, and the row breaks wherever the window says, so the daylight lands
 * where the break puts it rather than where the argument wanted it.
 *
 * What actually carries the distinction is what it always did: the **word**,
 * which is not a stat, and the chip's own **red count**, which is the only
 * colour in the row. Neither depends on where the line happens to break.
 */
export function PlaysButton({
  keys,
  newOnly,
  open,
  onToggle,
}: {
  keys: Set<PlayFilterKey>;
  newOnly: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const held = keys.size + (newOnly ? 1 : 0);
  return (
    <button
      type="button"
      className={`research-toggle plays-toggle${open ? ' active' : ''}${held > 0 ? ' on' : ''}`}
      aria-expanded={open}
      onClick={onToggle}
      title={
        held === 0
          ? 'Narrow the stream to certain kinds of play'
          : `Showing ${[...PLAY_FILTER_KEYS.filter((k) => keys.has(k)).map(playFilterLabel), ...(newOnly ? ['New'] : [])].join(' · ')}`
      }
    >
      {/* A funnel, which is what the panel behind it is. It carries `flex: none`
          in the stylesheet for the reason every glyph on this row does: an
          `<svg>` in a flex row is a flex item and its `width` is a basis it will
          shrink below the moment the line is tight, which on a phone — where the
          label is visually hidden and the glyph is the whole button — is the
          whole button. */}
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 4h18l-7 8.5V20l-4-2v-5.5L3 4z" />
      </svg>
      <span className="research-toggle-label">Plays</span>
      {held > 0 && <span className="research-toggle-count">{held}</span>}
    </button>
  );
}

export function PlaysPanel({
  keys,
  newOnly,
  newCount,
  onToggleKey,
  onToggleNew,
}: {
  keys: Set<PlayFilterKey>;
  newOnly: boolean;
  /** How many plays are unseen — the same figure the red button carries, shown
   *  on the chip so the two cannot disagree about it. */
  newCount: number;
  onToggleKey: (key: PlayFilterKey) => void;
  onToggleNew: () => void;
}) {
  return (
    <div className="research-panel plays-panel">
      {PLAY_FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          className={`research-toggle plays-chip${keys.has(f.key) ? ' on' : ''}`}
          aria-pressed={keys.has(f.key)}
          onClick={() => onToggleKey(f.key)}
          title={f.title}
        >
          {f.label}
        </button>
      ))}
      <button
        type="button"
        className={`research-toggle plays-chip plays-chip-new${newOnly ? ' on' : ''}`}
        aria-pressed={newOnly}
        onClick={onToggleNew}
        title={
          newOnly
            ? 'Showing only the plays you have not marked read — turning this off marks them read'
            : 'Only the plays since you last marked the feed read. It narrows whatever the chips beside it selected rather than adding to them.'
        }
      >
        New
        {newCount > 0 && !newOnly && <span className="plays-chip-count">{newCount}</span>}
      </button>
    </div>
  );
}
