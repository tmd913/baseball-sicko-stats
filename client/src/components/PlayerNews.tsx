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
 * - An **article** (`espn`) is a press that opens ESPN in a new tab. It carries
 *   a standfirst on the tab, where there is room for it.
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
  // the app has no business handing ESPN a handle on the window it opened from.
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
 * A transaction is a **day** and an article is an **instant**, and the two are
 * printed at the resolution each of them actually has: `Aug 11` for a move
 * nobody timed, `Aug 14 · 7:23 AM` for a story that was filed at one. Reading a
 * bare date as an instant is what would go wrong on its own — `new Date('2026-08-11')`
 * is UTC midnight, which in ET is the 10th — so the length of the string is what
 * picks the branch.
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
 * The upstream's own word for what a row is, in the reader's vocabulary where
 * the two differ.
 *
 * MLB's `typeDesc` is already English ("Status Change", "Trade", "Assigned")
 * and is printed as it comes. ESPN's `type` is a CMS label — `HeadlineNews`,
 * `TeamNotes` — which is a fact about ESPN's publishing system rather than
 * about the article, so the ones that say nothing to a reader collapse to
 * `Report`; `Story`, `Recap` and `Preview` already read as English and keep
 * their own word.
 */
const ESPN_KIND: Record<string, string> = {
  HeadlineNews: 'Report',
  Story: 'Story',
  Recap: 'Recap',
  Preview: 'Preview',
  Media: 'Video',
};

function prettyKind(item: NewsItem): string {
  if (item.source === 'mlb') return item.kind ?? 'Transaction';
  return (item.kind && ESPN_KIND[item.kind]) ?? 'Report';
}

/**
 * The News tab: everything the two feeds have on him, newest first.
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
          This reads MLB&rsquo;s own transaction log and the ESPN articles ESPN itself files
          under his name. Nothing has landed in either lately, which for a healthy player in
          the middle of a season is the ordinary case.
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
