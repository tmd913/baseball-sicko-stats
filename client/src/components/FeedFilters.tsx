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
 * **The row is the batter tab's alone again, and the order toggle has left it
 * for the navbar.** `Oldest first` was at this row's right end for a spell —
 * drawn on both tabs, since an outing has a clock like a plate appearance does
 * — and it is in the pinned tab row now, beside `Starters`. The two controls
 * are not the same kind of thing and this file's own argument for putting the
 * pills in the page is what separates them: the pills answer the question the
 * page was opened with and are worked once on arrival, where an order is a
 * control a reader reaches *while scrolling*, halfway down a stream they have
 * been reading. *(The order control is gone — see the note above
 * `FeedGlyph`. The distinction it was the other half of is what this paragraph
 * is for and is unchanged: this row stays in the page because it is worked on
 * arrival.)*
 *
 * **And the new-plays page separated them the same way.** It was the one caller
 * that drew both on one row — its navbar had no tab row to hang an order off —
 * so this row took an `order` prop and put the toggle back inside itself. That
 * row is gone: the page's pills are in its page, at the head of the list they
 * narrow. The prop went with its last caller, and so did the order toggle's own
 * `compact`, which existed only to make it 30px tall in that one row.
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
 * **The order toggle was never part of this row** — it lived in the pinned bar,
 * and it is gone from the app altogether (see the note above `FeedGlyph`). This
 * row is the kinds and nothing else, which is now the whole of what it is.
 */
export function FeedFilterPills({
  lens,
  onSelect,
  kinds = true,
}: {
  /** Which pill is lit. Exactly one always is. */
  lens: FeedLens;
  onSelect: (lens: FeedLens) => void;
  /**
   * Whether the **kind** group is drawn at all — false on the pitcher tab,
   * where a stream item is a whole outing rather than a play and there is
   * nothing for these pills to select on. On the page that is now the whole of
   * whether this row is drawn at all: with the order toggle gone to the tab
   * row, a row with no kinds in it would be an empty row.
   */
  kinds?: boolean;
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
    </div>
  );
}

/* **The stream's order was a control here and is not one any more.**

   `FeedOrderToggle` — a lit toggle reading `Newest first` / `Oldest first`,
   drawn in the app's reading run, in a matchup team page's and in the new-plays
   page's own head — is gone, and with it `oldest=1`, `noldest=1`,
   `feedOldestFirst`, `newPlaysOldestFirst` and the two `.sort()` calls that
   read them. The stream runs newest-first, which is what it opens on and what
   makes it a stream: see `byRecency`, and `byPlayOrder`'s own note that a
   *game* is the thing read forwards.

   Two things it was measured against are worth keeping, because both outlive
   the button. **An order is the one feed control a reader wants while
   scrolling**, where the kind pills are worked once on arrival — which is why
   the pills are in the page at the head of the stream they narrow and this one
   was up in the pinned row, and it is the test to apply to the next control
   that asks for that row. And **its label named a state rather than an
   action**, alone in this app, on the grounds that a reader crossing between
   two streams with two directions meets two buttons that have to say which is
   which; the box was reserved by laying both words out in one grid cell under
   `visibility: hidden`, measured at **118.58 × 36px, lit and unlit and back
   again**, against the 5.86px an unreserved box would have jumped on every
   press.

   `byPlayOrder` survives it — the Live block still reads its in-progress
   events cause-then-effect. */

/** The Feed reading's mark: a day as a run of entries down a rail, which is
 *  what the stream is — deliberately not a clock or a list icon, the other two
 *  candidates, since what distinguishes this reading from the table beside it
 *  is that it is one thing after another rather than one row per player. */
function FeedGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="19"
      height="19"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      style={{ flex: 'none' }}
    >
      <path d="M4 6h3M4 12h3M4 18h3" />
      <path d="M11 6h9M11 12h9M11 18h6" />
    </svg>
  );
}

/**
 * **The stream, as a reading of a roster rather than a page beside it.**
 *
 * It is drawn in two places and it is **one component rendered twice** — the
 * rule `ScheduleToggle`, `DateBar` and `PlayerIdentity` already set: the app's
 * own Roster page draws it in `.view-tools` beside `Schedule` and `Projected`,
 * and a matchup's team page draws it in `.mup-tools` beside those two and
 * `Summary`. Both are the same question about the same rows — *what would you
 * like this set of players over these days to look like* — and a control that
 * looked slightly different on the two would be one feature wearing two shapes.
 *
 * Folded onto `.research-toggle`'s selector lists like its neighbours, so it
 * takes `.on` and never `.active`, and loses its word for a 36px square under
 * 640 with the rest of the run.
 */
export function FeedToggle({
  on,
  onToggle,
  title,
}: {
  on: boolean;
  onToggle: () => void;
  /** What the press does, in the vocabulary of the page it is on — the app's
   *  own roster and somebody else's team say it differently. */
  title: string;
}) {
  return (
    <button
      type="button"
      className={`feed-toggle${on ? ' on' : ''}`}
      aria-pressed={on}
      onClick={onToggle}
      title={title}
    >
      <FeedGlyph />
      <span className="feed-toggle-label">Feed</span>
    </button>
  );
}

