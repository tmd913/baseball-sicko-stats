import { useState } from 'react';
import type { NewsItem, PlayerNews } from '../types';
import { useDelayedFlag } from '../hooks';
import { LoadingBlock } from './Loading';
import { EmptyState } from './EmptyState';

/**
 * A player's news, in **one** list drawn two ways.
 *
 * The Overview's section and the News tab are the same component with two props
 * set differently — `shown` and `summaries` — rather than two components, which
 * is the rule `GameLogTable` already sets for the Game Log and its own five-row
 * preview: two lists that merely resemble each other are two lists that will one
 * day disagree about what a row is.
 *
 * **No row is a press, and a report used to be one.** A `rotowire` note opened
 * that player's RotoWire page in a new tab, on the reasoning that it is where
 * the note was read from and where RotoWire's own (paywalled) analysis of it
 * lives. Two things were wrong with that. The link was **not item-precise** —
 * RotoWire publishes no per-note address a player page can reach, so every one
 * of a man's seven notes went to the same `#latest-news` anchor — and what it
 * offered past the row was a **subscription wall**, which is not somewhere to
 * send a reader from inside this app. So the list is one voice: every row is a
 * dated line, a kind and a headline, with RotoWire's note under it as a
 * standfirst.
 *
 * **What a row still says is where it came from**, in the pill and in the class
 * (`news-rotowire` / `news-mlb`), because the two are different kinds of claim
 * — a desk's report against the official record — and levelling them into one
 * would be the section pretending it has a single source. What is gone is only
 * the press: nothing on this list looks pressable, which is the same rule the
 * transaction row has always followed and the reason it was written down.
 */
export function NewsList({
  items,
  shown,
  summaries,
  who,
}: {
  items: NewsItem[];
  /** How many rows to draw. The preview takes 1 — the latest item is the one
   *  that changes a decision, and one row leaves room to draw the whole of it —
   *  and the tab takes them all. */
  shown?: number;
  /** **Whose note this is**, on a list that is about more than one man — the
   *  Roster view's News reading, where the rows of fifteen players are merged
   *  into one dated stream and a row with no name on it says nothing. Null on
   *  the two surfaces that are already about one player: a name printed on
   *  every row of a man's own tab is the page's title repeated fifteen times.
   *
   *  A function of the item rather than a field on it, because the item is a
   *  `NewsItem` off the wire on all three surfaces and the caller is the only
   *  one that knows which roster row it came from. */
  who?: (item: NewsItem) => string | null;
  /** The standfirst: RotoWire's note itself, which is the only body text either
   *  upstream publishes. On now for both surfaces — it was off on the preview
   *  while that drew three rows, where three two-line ones would have been the
   *  whole of the block above the season line it introduces. A transaction
   *  carries none and the guard below is what keeps that an absent child rather
   *  than an empty one. */
  summaries?: boolean;
}) {
  const rows = shown === undefined ? items : items.slice(0, shown);
  return (
    <ul className="news-list">
      {rows.map((item) => (
        <NewsRow
          /* **The player is in the key on a merged list.** `NewsItem.id` is
             stable per player and prefixed by source, and MLB gives one
             transaction one id — so a trade between two men on the same roster
             is one id on two rows, which React would draw once. On a
             single-player list the name is null and the key is what it was. */
          key={who ? `${who(item)}:${item.id}` : item.id}
          item={item}
          summary={summaries ?? false}
          who={who?.(item) ?? null}
        />
      ))}
    </ul>
  );
}

/**
 * **A row is a press exactly where there is more of the note to read**, and a
 * plain line everywhere else.
 *
 * `item.full` is the whole of a RotoWire note — the lede *and* the analysis
 * paragraph RotoWire's own player page withholds — and the server sets it only
 * where it genuinely beats the summary already on screen (`FULL_MIN_GAIN`). So
 * the affordance is never dead: no `full`, no press, and the row draws as it
 * always has. That is the same rule the league feed's name followed and the
 * reason this file records it — *a press with nothing behind it is worse than
 * a plain line*.
 *
 * **It replaces the summary rather than appending to it.** The full body opens
 * with the same lede, so drawing both would print that sentence twice; what
 * expands is the note growing from its first paragraph to all of it, which is
 * what the reader asked for by pressing.
 *
 * **Open state lives here rather than in the tab**, because it is about this
 * row and nothing else reads it — no URL param, the rule being that the URL
 * carries what data a view shows and this changes none. Collapsing on a
 * re-read is the honest behavior: a note that has changed is a different note.
 */
function NewsRow({
  item,
  summary,
  who,
}: {
  item: NewsItem;
  summary: boolean;
  /** The player's name, on a list about more than one of them — see `NewsList`.
   *  A plain span rather than a door onto his page: the outer row is already a
   *  `<button>` wherever there is more of the note to read, and a button inside
   *  a button is not a thing a browser can be asked for. */
  who?: string | null;
}) {
  const [open, setOpen] = useState(false);
  // Only a row drawing its body can offer more of one. The Overview's preview
  // passes `summaries` too, so this is genuinely both surfaces and not the tab
  // alone — the same note reads the same way in both places.
  const more = summary && item.full !== null && item.full !== undefined;
  const body = (
    <>
      <span className="news-meta">
        {who && <span className="news-who">{who}</span>}
        <span className="news-date">{formatDate(item.date)}</span>
        {item.kind && <span className="news-kind">{prettyKind(item)}</span>}
        {more && (
          <span className="news-more" aria-hidden="true">
            {open ? 'Less' : 'More'}
          </span>
        )}
      </span>
      <span className="news-headline">{item.headline}</span>
      {summary && (open && item.full ? (
        <span className="news-summary news-summary-full">{item.full}</span>
      ) : (
        item.summary && <span className="news-summary">{item.summary}</span>
      ))}
    </>
  );
  if (!more) {
    return (
      <li className={`news-item news-${item.source}`}>
        <div className="news-static">{body}</div>
      </li>
    );
  }
  return (
    <li className={`news-item news-${item.source}`}>
      <button
        type="button"
        className={`news-press${open ? ' is-open' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {body}
      </button>
    </li>
  );
}

/**
 * Both sources date to the **day** — MLB publishes no time with a transaction
 * and RotoWire stamps a note `August 14, 2026` — so every row reads `Aug 11`
 * today. The instant branch is kept rather than cut, and it is doing the work
 * that matters either way: reading a bare date as an instant is what goes
 * wrong on its own, `new Date('2026-08-11')` being UTC midnight, which in ET is
 * the 10th. So the length of the string picks the branch, a day is pinned to
 * noon before it is formatted, and a source that starts publishing an instant
 * draws as one without this being touched.
 */
function formatDate(raw: string): string {
  const dayOnly = raw.length <= 10;
  const d = new Date(dayOnly ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(d.getTime())) return raw;
  const day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (dayOnly) return day;
  return `${day} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/**
 * The upstream's own word for what a row is, and **both upstreams already
 * write English**, which is why this is one line rather than a table.
 *
 * MLB's `typeDesc` is already a reader's phrase ("Status Change", "Trade",
 * "Assigned") and is printed as it comes. RotoWire's is the **body part** it
 * files an injury note under — `Elbow`, `Hamstring`, `Head` — which says more
 * in four characters than any label this app could invent, with `Report` on
 * the notes it files under nothing; the server fills that, so the pill is
 * RotoWire's own word rather than a mapping of it. (ESPN's `type` was the one
 * that needed translating, being a CMS label — `HeadlineNews`, `TeamNotes` —
 * and it went with the feed.)
 */
function prettyKind(item: NewsItem): string {
  return item.kind ?? (item.source === 'mlb' ? 'Transaction' : 'Report');
}

/**
 * The News tab: everything the two sources have on him, newest first.
 *
 * The wait and the two absences are all here rather than in `PlayerDetails`,
 * because the *content* of each is about news rather than about tabs — and
 * because the empty state is the one this feature most has to get right. A
 * player with nothing written about him and no move on his record is an
 * ordinary player rather than a failure, and the app's own rule is that an
 * empty view names its cause: this one says which two things were looked in and
 * that both were empty, so a reader can tell it apart from a read that broke.
 */
export function NewsTab({
  news,
  loading,
  error,
  name,
}: {
  news: PlayerNews | null;
  loading: boolean;
  error: string | null;
  name: string;
}) {
  const wait = useDelayedFlag(loading);
  if (wait) return <LoadingBlock>Reading the latest news</LoadingBlock>;
  if (loading) return null;
  if (error) return <div className="details-status details-error">Couldn&rsquo;t read the news: {error}</div>;
  if (!news || news.items.length === 0) {
    return (
      <EmptyState compact title={<>No recent news for {name}</>}>
        {/* Nothing to show, which for a healthy player mid-season is the
            ordinary case rather than a failure — so the tab says which two
            feeds were read and that both were empty, the app's rule that an
            empty view names its cause. */}
        <p className="empty-how">
          This reads RotoWire’s notes on him and MLB’s own transaction log.
          Nothing has landed in either lately — which for a man RotoWire has never
          written up, or one nobody has moved in four months, is the ordinary case rather
          than a read that broke.
        </p>
      </EmptyState>
    );
  }
  return (
    <div className="news-tab">
      <NewsList items={news.items} summaries />
    </div>
  );
}
