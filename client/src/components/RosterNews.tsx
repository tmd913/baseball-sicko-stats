import { useMemo, useState } from 'react';
import { api } from '../api';
import { useDelayedFlag } from '../hooks';
import { useResource } from '../resource';
import type { NewsItem, PlayerReport } from '../types';
import { LoadingBlock } from './Loading';
import { NewsList } from './PlayerNews';
import { EmptyState } from './EmptyState';

/**
 * **How many rows a page of this list is — the feed's own ten.**
 *
 * The whole stream is an archive rather than a reading: measured on a real
 * fifteen-man roster it is **232 rows and 19,622px of page**, six weeks of two
 * upstreams. A page of thirty was the first answer to that and is still too
 * much of it — what a reader opens this for is *what has happened lately*, and
 * ten dated lines is that question answered, with the button under them saying
 * how many are behind it. Nothing is hidden, only unrendered.
 *
 * It is `FEED_PAGE_SIZE`'s number and deliberately not that constant: the two
 * lists are different shapes (a feed item is a plate appearance with a diamond
 * and a clip in it; this is one line and a standfirst) and agreeing today is not
 * a reason to be one number tomorrow.
 */
const NEWS_PAGE_SIZE = 10;

/**
 * **The Roster view's News reading: one dated stream across the whole roster.**
 *
 * The player page has had a News tab since there was news, and it answers *what
 * has been said about this man*. The question a manager actually opens the app
 * with is the other one — *what has happened to my team since I last looked* —
 * and answering it meant opening fifteen player pages and reading the top of
 * each. So this is those fifteen tabs merged and sorted, newest first, with the
 * name on the row.
 *
 * **It is the same rows, from the same read.** `NewsList` and `NewsRow` are the
 * player page's own components with one prop added (`who`), and the server route
 * is a fan-out over the very `getPlayerNews` his tab calls — same three
 * upstreams, same cache. Two lists of one man's notes that merely resembled each
 * other are two lists that would one day disagree about what a note says, which
 * is the rule `GameLogTable` and `NewsList` itself were both factored out for.
 *
 * ### The sort, and what a day-resolution date can and cannot decide
 *
 * Both upstreams date to the **day** — MLB stamps a transaction with a date and
 * RotoWire a note `August 31, 2026` — so `2026-08-31` is the finest grain there
 * is and every note filed today ties with every other. The order inside a day is
 * therefore **not** chronological and must not pretend to be: it falls back to
 * the order the roster is in, which is the reader's own list order and the one
 * ordering on this page that means something. Sorting the ties by name, or by
 * source, would be an arbitrary rule wearing the clothes of a real one.
 *
 * `localeCompare` on the date string is exact for `YYYY-MM-DD` and needs no
 * parsing — the same comparison `news.ts::cmpDate` makes on the server, and for
 * the same reason: reading a bare date as an instant is what goes wrong on its
 * own, `new Date('2026-08-31')` being UTC midnight and so the 30th in ET.
 */
export function RosterNews({ reports }: {
  /** The rows the page is showing — his own roster, his ESPN team or a
   *  leaguemate's, already filtered by whatever the view's filters have said.
   *  The list on screen is the list this reads about, which is why the ids are
   *  the client's; see `api.playersNews`. */
  reports: PlayerReport[];
}) {
  /**
   * **One id per man, in roster order**, which is both the request's key and the
   * tie-break below. A two-way player is one man with two rows on the table and
   * one set of news, exactly as his News tab is one tab: news is a fact about a
   * person, which is the same reasoning the player page keys its own news read
   * by player alone rather than by player-and-kind.
   */
  const ids = useMemo(() => {
    const seen = new Set<number>();
    const out: number[] = [];
    for (const r of reports) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        out.push(r.id);
      }
    }
    return out;
  }, [reports]);

  const nameOf = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of reports) if (!m.has(r.id)) m.set(r.id, r.name);
    return m;
  }, [reports]);

  /**
   * **Keyed on the ids and nothing else**, so hiding an injured player or
   * crossing to a leaguemate's roster is a different question and asks it, while
   * a poll of the report that leaves the same fifteen men on screen is the same
   * question and costs nothing.
   *
   * `staleMs` is the news's own thirty minutes rather than the app's live poll:
   * both upstreams publish to the day, so re-asking inside a page-load can only
   * ever return what it already said — the same argument `api.recentNews`
   * records for reading its map once on mount.
   */
  const res = useResource(
    ids.length > 0 ? `rosterNews:${ids.join(',')}` : null,
    () => api.playersNews(ids),
    { staleMs: 30 * 60 * 1000 },
  );
  /** **How much of the stream is drawn.** Component state and no URL param, the
   *  line the app draws for a paged list: how far down a reader has scrolled is
   *  not what a link describes. It is not reset when the roster changes either
   *  — a reader who has loaded five pages and then hides the injured players is
   *  still five pages down the same list, and re-collapsing it under them would
   *  be the page taking back a press. */
  const [shown, setShown] = useState(NEWS_PAGE_SIZE);
  const byPlayer = res.value ?? null;
  const error = res.error?.message ?? null;
  const wait = useDelayedFlag(res.loading && !byPlayer);

  /** The merged stream. `owner` rides beside the item rather than being looked
   *  up again in the row, because two men on one roster can share an MLB
   *  transaction id and the pair is what tells them apart — see `NewsList`. */
  const items = useMemo(() => {
    if (!byPlayer) return [];
    const rows: { item: NewsItem; id: number; order: number }[] = [];
    ids.forEach((id, order) => {
      for (const item of byPlayer[String(id)] ?? []) rows.push({ item, id, order });
    });
    rows.sort((a, b) => b.item.date.localeCompare(a.item.date) || a.order - b.order);
    return rows;
  }, [byPlayer, ids]);

  /** The name for a row, by identity rather than by value: the merged list is
   *  built here, so the item object itself is the key back to whose it is. */
  const owner = useMemo(() => {
    const m = new Map<NewsItem, string>();
    for (const r of items) m.set(r.item, nameOf.get(r.id) ?? '');
    return m;
  }, [items, nameOf]);

  if (ids.length === 0) {
    return <EmptyState compact title="No players on this roster to read the news for" />;
  }
  /* Rule 2: a block wait only while there is nothing to show, and only past
     `WAIT_DELAY`. Rule 1 keeps the last stream standing through a re-read. */
  if (wait) return <LoadingBlock>Reading the roster&rsquo;s news</LoadingBlock>;
  if (error && !byPlayer) {
    return <div className="details-status details-error">Couldn&rsquo;t load the news: {error}</div>;
  }
  if (!byPlayer) return null;
  if (items.length === 0) {
    return (
      <EmptyState
        compact
        title={
          <>
            Nothing in MLB’s transaction record or RotoWire’s notes for any of these{' '}
            {ids.length} players
          </>
        }
      >
        <p className="empty-how">That is an ordinary quiet week rather than a failed read.</p>
      </EmptyState>
    );
  }
  return (
    <div className="roster-news">
      <NewsList
        items={items.map((r) => r.item)}
        shown={shown}
        summaries
        who={(item) => owner.get(item) ?? null}
      />
      {/* **The same button the feed's own list carries**, class and count and
          all — `.feed-more` folded on rather than a second control that
          resembles it. It says how many rows are behind it, which is what keeps
          a page a *page* rather than a cut: nothing on this list is filtered
          away, only not drawn yet. */}
      {items.length > shown && (
        <button
          type="button"
          className="feed-more"
          onClick={() => setShown((n) => n + NEWS_PAGE_SIZE)}
        >
          Load more
          <span className="feed-more-count">{items.length - shown}</span>
        </button>
      )}
    </div>
  );
}
