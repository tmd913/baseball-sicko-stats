/**
 * **The batter feed's play filters** — which kind of play the stream draws.
 *
 * The Feed view is the roster's day read by clock, and on a full slate it is
 * hundreds of items: every plate appearance of every batter on the roster, plus
 * every bag any of them took. The one thing it could not do was answer *what
 * actually happened today* — the home runs, the steals, the plays there is film
 * of — without the reader scrolling past every strikeout in between.
 *
 * **One kind at a time**, drawn as a row of pills at the head of the stream they
 * narrow. It was six independent chips that unioned, behind a `Plays` disclosure
 * up in the pinned tab row; what that bought is stated below, and it lost to the
 * plainer control. A reader arrives at this stream asking one question — *what
 * did they hit today* — and a set of switches makes them assemble the answer out
 * of parts and then take it apart again.
 *
 * **`New` is not one of these pills, and was for a spell.** It asks *when*
 * rather than *what kind*, so it composes with them rather than replacing them:
 * "the new home runs" is an ordinary thing to want and a single-select row
 * holding both axes could not put it. It is a **mode** now — the red
 * `N new plays` button turns it on and a `Show all plays` button turns it off —
 * and every pill here goes on working inside it. See `LiveFeed`'s Recent
 * section, which draws both buttons and whose `passesFilters` ANDs the two.
 *
 * **`All` is a pill rather than the absence of one**, which is what a
 * single-select control owes its reader: with switches, turning the last one off
 * is how you get the whole stream back, and with one active at a time there has
 * to be something to press that means *no lens*. It leads the row, being the
 * state the feed opens in.
 *
 * **What the union bought and what it costs to lose.** The six sets genuinely
 * overlap — a home run is a hit and, nearly always, an RBI and a play with film
 * — so `HR + SB` ("the things worth watching") was sayable and is not any more.
 * The trade is a row a reader can work without a key: pressing a pill is the
 * whole gesture, and what is on screen is what the lit pill says. `HR + New` was
 * on that casualty list too and has been given back, `New` having left the row
 * for an axis of its own rather than being one more thing on this one.
 *
 * **`XBH` was a seventh chip and is gone**, and the two reasons are the ones
 * that decide any pill here. It answered a question nobody asks of a *stream*: a
 * double and a home run are two plays a reader recognizes on sight, and the
 * pill's job is to cut hundreds of items down rather than to name a category of
 * hit. And it barely cut — on a checked day it was 11 of 51 items against
 * `Hits`' 18, so it selected two thirds of a set already one pill away. An old
 * `plays=xbh` link is read as the whole stream, which is the direction
 * `toPlayFilter` fails in for every key it does not know.
 *
 * **Batter tab only — the pills.** A pitcher's stream item is his whole *outing*
 * rather than a play — the same fact the kind tabs exist for — so there is
 * nothing here to select on, and the kind group is not drawn.
 *
 * **The row itself is drawn on both tabs**, because it carries a second control
 * that is not about kinds at all: `Oldest first`, which turns the stream round.
 * An outing has a clock like a plate appearance does, so a pitcher's day reads
 * forwards on the same press, and the toggle keeps its place at the row's right
 * end whichever tab is up. See `FeedFilterPills` for the shape and why it is
 * not an eighth pill.
 */

/**
 * The six kinds a play can be asked for. **The union's order is not the row's** —
 * the pills read `H · RBI · HR · SB · R · Video` and `PLAY_FILTERS` below is
 * what fixes that, this being a set of keys and nothing that draws them.
 */
export type PlayFilterKey = 'hr' | 'hit' | 'run' | 'rbi' | 'sb' | 'video';

/**
 * What the row is selecting, all of it: the whole stream, or one kind of play.
 *
 * **`new` was a member of this union and is not**, which is the whole of the
 * reversal above. It named a *when* on a row of *what kinds*, so a reader who
 * wanted the new home runs had to pick which half of that to ask for. The mode
 * lives beside the row now, and App's `feedLens` is `playFilter ?? 'all'`
 * unconditionally rather than a pair read as one lens.
 */
export type FeedLens = 'all' | PlayFilterKey;

export interface PlayFilterDef {
  key: PlayFilterKey;
  /** Short enough for the row to read without scrolling on a laptop. */
  label: string;
  /** What the pill is actually selecting, in words — the label cannot say it. */
  title: string;
}

/**
 * The pills' own vocabulary, **in the order the row reads**:
 * `All · H · RBI · HR · SB · R · Video`.
 *
 * **That order is the fantasy categories' rather than a box score's**, which is
 * the reversal of what stood here. The box-score run led with the two ways of
 * reaching a base by hitting it and kept the halves of a run together; it was
 * right about a *line score* and wrong about this row, which is worked by a
 * reader who scores in categories. So `H` leads — it is the widest cut of the
 * day and the one press that turns hundreds of items into the ones that
 * mattered — then the three that decide a week (`RBI`, `HR`, `SB`), then `R`,
 * which is the one thing on the row that happens *to* him rather than by him
 * and the one nobody opens this page to count. `Video` stays last: it is not a
 * kind of play at all but a fact about whether there is film of one.
 *
 * **`Hits` and `Runs` are `H` and `R` now**, which the reordering forces rather
 * than merely permits: a row of category abbreviations with two words in the
 * middle of it reads as two kinds of thing, and both single letters are forms a
 * box score already uses. It also buys the row 24px, which is 24px of a
 * scrollport at 320. The keys are untouched (`hit`, `run`), so every `plays=`
 * link ever written still opens on the pill it named.
 *
 * What an abbreviation cannot say is which plays it takes — that a home run is
 * inside `H`, that `R` is him crossing the plate where `RBI` is him driving
 * somebody in — so each carries the sentence as its `title`.
 */
export const PLAY_FILTERS: PlayFilterDef[] = [
  {
    key: 'hit',
    label: 'H',
    title: 'Hits — singles, doubles, triples and home runs',
  },
  {
    key: 'rbi',
    label: 'RBI',
    title: 'Plate appearances he drove a run in on — the other half of Runs',
  },
  { key: 'hr', label: 'HR', title: 'Home runs' },
  { key: 'sb', label: 'SB', title: 'Stolen bases' },
  {
    key: 'run',
    label: 'R',
    title: 'Runs he scored — crossing the plate, not driving one in',
  },
  {
    key: 'video',
    // Plays there is film *of*, rather than plays MLB filed a play id for —
    // which is very nearly all of them, and is what made this pill a no-op
    // until `LiveFeed`'s `filmTest` answered the question properly.
    label: 'Video',
    title: 'Plays there is video of — highlights land through the day, and the rest arrive a day later',
  },
];

/* Keyed for `toPlayFilter`, which is the one thing that has to ask whether a
   string off the URL is a pill this build draws. `PLAY_FILTER_KEYS` and
   `playFilterLabel` stood beside it and are gone with their readers — the row
   below maps `PLAY_FILTERS` itself, and the empty state names `All` rather
   than the lens it is empty of. */
const BY_KEY = new Map(PLAY_FILTERS.map((f) => [f.key, f]));

/**
 * Read the URL's `plays=` into one key, dropping anything this build has no pill
 * for. It takes the **first** key it recognizes, which is what makes a link
 * written when these unioned (`plays=hr,sb`) open on a lens this row can draw
 * rather than on nothing; a link naming a kind that has since gone opens on the
 * whole stream, which is the direction every parameter in this app fails in.
 */
export function toPlayFilter(raw: string | null): PlayFilterKey | null {
  if (!raw) return null;
  for (const part of raw.split(',')) {
    const k = part.trim() as PlayFilterKey;
    if (BY_KEY.has(k)) return k;
  }
  return null;
}

/** The `plays=` value for a lens, or null where it says nothing (the default). */
export function playFilterParam(key: PlayFilterKey | null): string | null {
  return key;
}

/**
 * **The row of pills**, at the head of the stream it narrows.
 *
 * **In the page rather than in the pinned tab row**, which is a reversal of this
 * app's standing rule that a control deciding *which rows a view shows* lives
 * with the tabs that select the view (`Starters`, the research board's whole
 * control set, the include buttons). What that rule is really protecting is a
 * control a reader has to be able to reach *while scrolling* — the board's
 * filters qualify a table six hundred rows long. This one qualifies a stream
 * read from the top and worked once on arrival, and it is the answer to the
 * question the reader opened the page with, so it belongs where the answer is:
 * directly above the plays, beside the red `N new plays` button that is already
 * in the page for the same reason.
 *
 * **It scrolls sideways rather than wrapping**, which is the answer every other
 * strip of pills in this app gives when it outgrows its width — the research
 * board's position row and window tabs, the player page's tab strip, the
 * tutorial's jump strip. A wrapping row would change the height of the thing
 * sitting above a stream on every width, and this row is read across.
 *
 * The pills are `.research-toggle`, folded onto rather than restyled, so `.on`
 * is the app's own lit state and a pill here is the same object as a pill
 * anywhere else.
 *
 * **And the row carries a second axis at its right end: `Oldest first`.**
 *
 * **Not an eighth pill**, which is the mistake `New` made and was reversed for:
 * the pills are single-select over *kinds*, and an order is not a kind — a
 * reader who wants the home runs read forwards has to be able to say both. So
 * the kinds are a `role="group"` of their own (`.feed-filter-kinds`) and this
 * stands outside it.
 *
 * **A lit toggle rather than a segmented `Newest | Oldest` run**, which is the
 * other shape this app has for a two-valued control. A segmented run says its
 * two values are *peers* — Roster/Feed/Research, Batters/Pitchers — and these
 * are not: newest-first is what makes a stream a stream (see `byRecency`, and
 * `byPlayOrder`'s own note that a *game* is the thing read forwards), and
 * oldest-first is the departure from it. This app spells a departure as a lit
 * toggle whose absence is the default — `Starters`, `Watchlist`, `Projected`,
 * `hideil` — and carries only the departure in the URL (`oldest=1`). It also
 * costs half the width of a segmented pair, on a row that is already a
 * scrollport at 320.
 *
 * **The label does not change when it lights.** `Oldest first` is what pressing
 * it does and what being lit means, in one word each way; a label that flipped
 * to `Newest first` would change the button's width under the finger that
 * pressed it, which is this app's *reserve the box* rule broken by a control
 * that is nothing but a box. The `title` carries the state instead, that being
 * the one thing on a button that can change size for free.
 *
 * **It sits outside the scrollport rather than at the end of it.** The kinds
 * scroll — seven pills do not fit 320 and never did — and a control the reader
 * has to discover by scrolling a row sideways is a control most of them will
 * not find. This one is `flex: none` with `margin-left: auto` in a row that no
 * longer scrolls as a whole, so it is in the same place at every width and on
 * both kind tabs, and the pills go on scrolling underneath it.
 */
export function FeedFilterPills({
  lens,
  onSelect,
  kinds = true,
  oldestFirst,
  onToggleOrder,
}: {
  /** Which pill is lit. Exactly one always is. */
  lens: FeedLens;
  onSelect: (lens: FeedLens) => void;
  /**
   * Whether the **kind** group is drawn at all — false on the pitcher tab,
   * where a stream item is a whole outing rather than a play and there is
   * nothing for these pills to select on. The order toggle beside it is drawn
   * either way: outings have a clock too.
   */
  kinds?: boolean;
  /** Whether the stream is running forwards — see `feed-order` below. */
  oldestFirst: boolean;
  onToggleOrder: () => void;
}) {
  const pill = (key: FeedLens, label: string, title: string) => (
    <button
      key={key}
      type="button"
      className={`research-toggle feed-filter-pill${lens === key ? ' on' : ''}`}
      aria-pressed={lens === key}
      onClick={() => onSelect(key)}
      title={title}
    >
      {label}
    </button>
  );

  return (
    <div className="feed-filters">
      {kinds && (
        <div
          className="feed-filter-kinds"
          role="group"
          aria-label="Which plays the feed shows"
        >
          {pill('all', 'All', 'Every play of the day — the stream as it opens')}
          {PLAY_FILTERS.map((f) => pill(f.key, f.label, f.title))}
        </div>
      )}
      <button
        type="button"
        className={`research-toggle feed-filter-pill feed-order${oldestFirst ? ' on' : ''}`}
        aria-pressed={oldestFirst}
        onClick={onToggleOrder}
        title={
          oldestFirst
            ? 'The day read forwards, first play first — press to put the newest back on top'
            : 'Read the day forwards instead, from its first play'
        }
      >
        Oldest first
      </button>
    </div>
  );
}
