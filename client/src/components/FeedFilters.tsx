/**
 * **The batter feed's play filters** — which kind of play the stream draws.
 *
 * The Feed view is the roster's day read by clock, and on a full slate it is
 * hundreds of items: every plate appearance of every batter on the roster, plus
 * every bag any of them took. The one thing it could not do was answer *what
 * actually happened today* — the home runs, the steals, the plays there is film
 * of — without the reader scrolling past every strikeout in between.
 *
 * **One lens at a time**, drawn as a row of pills at the head of the stream they
 * narrow. It was six independent chips that unioned, plus `New` beside them on
 * an axis of its own, behind a `Plays` disclosure up in the pinned tab row; what
 * that bought is stated below, and it lost to the plainer control. A reader
 * arrives at this stream asking one question — *what did they hit today*, *what
 * is new since I looked* — and a set of switches makes them assemble the answer
 * out of parts and then take it apart again.
 *
 * **`All` is a pill rather than the absence of one**, which is what a
 * single-select control owes its reader: with switches, turning the last one off
 * is how you get the whole stream back, and with one active at a time there has
 * to be something to press that means *no lens*. It leads the row, being the
 * state the feed opens in.
 *
 * **What the union bought and what it costs to lose.** The six sets genuinely
 * overlap — a home run is a hit and, nearly always, an RBI and a play with film
 * — so `HR + SB` ("the things worth watching") and `HR + New` ("the new home
 * runs") were both sayable and are not any more. `New` in particular used to
 * *narrow* whatever the chips had selected rather than replace it. The trade is
 * a row a reader can work without a key: pressing a pill is the whole gesture,
 * and what is on screen is what the lit pill says.
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
 * **Batter tab only.** A pitcher's stream item is his whole *outing* rather than
 * a play — the same fact the kind tabs exist for — so there is nothing here to
 * select on, and the row is not drawn.
 */

import type { ReactNode } from 'react';

/**
 * The six kinds a play can be asked for, **in the order the pills read** — which
 * is a box score's own order and not the vocabulary's history: the two ways of
 * reaching a base by hitting it (`HR`, `Hits`), then the two halves of a run
 * (`Runs` he scored, `RBI` he drove in), then the base he took without a hit at
 * all (`SB`), and last the one pill that is not a kind of play but a fact about
 * whether there is film of it.
 */
export type PlayFilterKey = 'hr' | 'hit' | 'run' | 'rbi' | 'sb' | 'video';

/**
 * What the row is selecting, all of it: the whole stream, one kind of play, or
 * the plays since the reader last marked it read.
 *
 * `new` is a member of this union rather than a switch beside it, because the
 * row is single-select and a second lit pill would be exactly the multi-select
 * this replaced. App still holds it as its own piece of state — it is in the URL
 * under its own name and turning it *off* is what marks the stream read — so
 * this type is how the row states the pair rather than how App stores it.
 */
export type FeedLens = 'all' | PlayFilterKey | 'new';

export interface PlayFilterDef {
  key: PlayFilterKey;
  /** Short enough for the row to read without scrolling on a laptop. */
  label: string;
  /** What the pill is actually selecting, in words — the label cannot say it. */
  title: string;
}

/**
 * The pills' own vocabulary.
 *
 * The labels are abbreviations because the row is read across, and every one of
 * them is a form a box score already uses. What an abbreviation cannot say is
 * which plays it takes — that a home run is inside `Hits`, that `Runs` is him
 * crossing the plate where `RBI` is him driving somebody in — so each carries
 * the sentence.
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
 */
export function FeedFilterPills({
  lens,
  newCount,
  onSelect,
}: {
  /** Which pill is lit. Exactly one always is. */
  lens: FeedLens;
  /** How many plays are unseen — the same figure the red button in the stream
   *  carries, shown on the `New` pill so the two cannot disagree about it. */
  newCount: number;
  onSelect: (lens: FeedLens) => void;
}) {
  const pill = (key: FeedLens, label: string, title: string, extra?: ReactNode) => (
    <button
      key={key}
      type="button"
      className={`research-toggle feed-filter-pill${lens === key ? ' on' : ''}`}
      aria-pressed={lens === key}
      onClick={() => onSelect(key)}
      title={title}
    >
      {label}
      {extra}
    </button>
  );

  return (
    <div
      className="feed-filters"
      role="group"
      aria-label="Which plays the feed shows"
    >
      {pill('all', 'All', 'Every play of the day — the stream as it opens')}
      {PLAY_FILTERS.map((f) => pill(f.key, f.label, f.title))}
      {pill(
        'new',
        'New',
        lens === 'new'
          ? 'Showing only the plays you have not marked read — pressing another pill marks them read'
          : 'Only the plays since you last marked the feed read',
        newCount > 0 && lens !== 'new' ? (
          <span className="feed-filter-count">{newCount}</span>
        ) : null,
      )}
    </div>
  );
}
