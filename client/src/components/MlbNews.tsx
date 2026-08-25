import { useMemo } from 'react';
import type { LeagueNews, LeagueNewsItem, NewsItem } from '../types';
import { LoadingBlock } from './Loading';
import { NewsList } from './PlayerNews';

/**
 * # The league's biggest stories
 *
 * The MLB view's third tab. It is the league-wide reading of the same feed a
 * player's own News tab draws one man's slice of — RotoWire's desk and MLB's
 * transaction log — which is why it is **`NewsList` with one slot filled**
 * rather than a list of its own. The rule that decides it is the one that file
 * already states: two lists that merely resemble each other are two lists that
 * will one day disagree about what a row is.
 *
 * What this surface adds is the only thing a league feed needs and a player
 * page cannot want: **who the row is about**, which on his own page is the page
 * itself.
 *
 * ## Ten stories, not nine hundred notes
 *
 * **This was the whole feed and is a top ten.** 973 items over seven days
 * (measured) is not news but an inbox — most of it a desk noting that a man
 * went 2-for-4 — and a tab called News owes the reader the dozen things that
 * actually happened. The ranking is the *server's*, in `recentNews.ts`, and
 * that is deliberate rather than incidental: it is a property of the corpus
 * rather than of this screen, the sweep is where the corpus is, and doing it
 * there takes the payload from **354KB to 3.6KB**.
 *
 * **So there are no filter pills and no paging.** Both were here while this was
 * a feed and both went with it: a source filter over ten rows narrows ten rows,
 * and `Show more` promises a list that no longer exists. The one control this
 * tab has left is the one the whole view has — which tab you are on.
 *
 * ## It costs no upstream of its own
 *
 * The server answers it off the sweep the research board's news marks already
 * pay for — thirty RotoWire club pages and MLB's whole transaction log, once
 * per half hour for every reader in the app. See `recentNews.ts::getLeagueNews`.
 *
 * ## The name is a door only where there is something behind it
 *
 * A row's player is an exact MLB id — RotoWire's half is inverted through a
 * numeric index and MLB's `person.id` needs no join at all — but the *player
 * page* needs the man to be on the season roster to know whether he is a batter
 * or a pitcher. So a name the roster can place is a press and a name it cannot
 * is plain text. That is the join-to-null rule at its smallest, and the
 * alternative is a press that opens a page with nothing on it.
 */

export default function MlbNewsTab({
  news,
  loading,
  error,
  known,
  onOpenPlayer,
}: {
  news: LeagueNews | null;
  loading: boolean;
  error: string | null;
  /** The MLB ids the season roster can place, which is what decides whether a
   *  name is a door — see the file's note. */
  known: Set<number>;
  onOpenPlayer: (mlbId: number) => void;
}) {
  const owner = useMemo(
    () => (item: NewsItem) => <Owner item={item as LeagueNewsItem} known={known} onOpen={onOpenPlayer} />,
    [known, onOpenPlayer],
  );
  // Never over data — rule 1. A re-read leaves the list standing, and the block
  // wait is only for a pane with nothing in it yet.
  if (!news) {
    if (error) {
      return (
        <div className="empty-state">
          <h3>Couldn&rsquo;t read the league&rsquo;s news</h3>
          <p>{error}</p>
        </div>
      );
    }
    return loading ? <LoadingBlock>Reading the league&rsquo;s news</LoadingBlock> : null;
  }
  if (news.items.length === 0) {
    /* An empty state names its own cause. This one's is real and rare rather
       than a filter: the sweep answered and nothing in it was a *story* — every
       note was a box-score line. It says which two feeds were read and what was
       looked for in them, so a reader can tell it apart from a read that
       broke. */
    return (
      <div className="empty-state">
        <h3>Nothing much happened</h3>
        <p>
          Nothing in the last {news.days} days came back as a move, an injury or a role change
          &mdash; which on a quiet week in the middle of a season is the ordinary answer rather
          than a read that broke. This reads RotoWire&rsquo;s club desks and MLB&rsquo;s own
          transaction log.
        </p>
      </div>
    );
  }
  return (
    <div className="mlb-news">
      <NewsList items={news.items} summaries owner={owner} />
      <p className="mlb-news-foot">
        The biggest {news.items.length} of {news.considered} notes over the last {news.days} days,
        ranked by what kind of thing happened and how recently &mdash; trades, injuries, signings
        and role changes over a box-score line. From RotoWire&rsquo;s club desks and MLB&rsquo;s own
        transaction log; minor-league moves are not in it.
      </p>
    </div>
  );
}

function Owner({
  item,
  known,
  onOpen,
}: {
  item: LeagueNewsItem;
  known: Set<number>;
  onOpen: (mlbId: number) => void;
}) {
  const name = item.playerName;
  if (!name) return null;
  const door = item.playerId !== null && known.has(item.playerId);
  return (
    <span className="mlb-news-who">
      {door ? (
        <button type="button" className="lg-tx-name" onClick={() => onOpen(item.playerId as number)}>
          {name}
        </button>
      ) : (
        <span className="lg-tx-name lg-tx-name-plain">{name}</span>
      )}
      {/* His club and his position, in one muted line after the name — the
          identity block the two wide tables draw is a photo, a crest and three
          rows of marks, and this list is ten headlines. */}
      {(item.team || item.position) && (
        <span className="mlb-news-club">
          {item.position && <span className="mlb-news-pos">{item.position}</span>}
          {item.team}
        </span>
      )}
    </span>
  );
}
