import type { NewsItem, PlayerNews } from '../types';
import { useDelayedFlag } from '../hooks';
import { LoadingBlock } from './Loading';

/**
 * A player's news, in **one** list drawn two ways.
 *
 * The Overview's section and the News tab are the same component with two props
 * set differently — `shown` and `summaries` — rather than two components, which
 * is the rule `GameLogTable` already sets for the Game Log and its own five-row
 * preview: two lists that merely resemble each other are two lists that will one
 * day disagree about what a row is.
 *
 * **What a row is** turns on where it came from, and the list says so rather
 * than levelling the two into one voice:
 *
 * - A **report** (`rotowire`) is a press that opens RotoWire's page for that
 *   player in a new tab — which is where the note was read from and where
 *   RotoWire's own analysis of it lives, the one thing this section
 *   deliberately does not ship. It carries the note itself as a standfirst on
 *   the tab, where there is room for it.
 * - A **transaction** (`mlb`) is a fact with nowhere to go — MLB publishes one
 *   sentence and no link — so it is a static row and deliberately not a press.
 *   A row that looked like a link and did nothing would be worse than a row
 *   that plainly is not one.
 */
export function NewsList({
  items,
  shown,
  summaries,
}: {
  items: NewsItem[];
  /** How many rows to draw. The preview takes 3 — enough that a move and the
   *  story about it both show, few enough that it stays a glance — and the tab
   *  takes them all. */
  shown?: number;
  /** The article standfirst. Off on the preview, where three two-line rows
   *  would be the whole of the block above the season line it introduces. */
  summaries?: boolean;
}) {
  const rows = shown === undefined ? items : items.slice(0, shown);
  return (
    <ul className="news-list">
      {rows.map((item) => (
        <NewsRow key={item.id} item={item} summary={summaries ?? false} />
      ))}
    </ul>
  );
}

function NewsRow({ item, summary }: { item: NewsItem; summary: boolean }) {
  const body = (
    <>
      <span className="news-meta">
        <span className="news-date">{formatDate(item.date)}</span>
        {item.kind && <span className="news-kind">{prettyKind(item)}</span>}
      </span>
      <span className="news-headline">{item.headline}</span>
      {summary && item.summary && <span className="news-summary">{item.summary}</span>}
    </>
  );
  // `noopener noreferrer` on every one of them: these are third-party links and
  // the app has no business handing RotoWire a handle on the window it opened
  // from.
  return (
    <li className={`news-item news-${item.source}`}>
      {item.url ? (
        <a className="news-link" href={item.url} target="_blank" rel="noopener noreferrer">
          {body}
        </a>
      ) : (
        <div className="news-static">{body}</div>
      )}
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
      <div className="news-empty">
        <p className="ovw-none">No recent news for {name}.</p>
        <p className="news-empty-note">
          This reads RotoWire&rsquo;s notes on him and MLB&rsquo;s own transaction log.
          Nothing has landed in either lately &mdash; which for a man RotoWire has never
          written up, or one nobody has moved in four months, is the ordinary case rather
          than a read that broke.
        </p>
      </div>
    );
  }
  return (
    <div className="news-tab">
      <NewsList items={news.items} summaries />
    </div>
  );
}
