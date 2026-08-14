import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatStartTime, handThrows, isRotationStarter, prettyGameDate } from '../lib';
import type {
  BatterGameLog,
  NextGameInfo,
  PitcherGameLog,
  PitcherSeasonStats,
  PlayerNews,
  PlayerReport,
  SeasonStats,
} from '../types';
import { useDelayedFlag } from '../hooks';
import { LoadingLine } from './Loading';
import { GameLogPreview } from './GameLog';
import { NewsList } from './PlayerNews';
import { PlayerDay, playerDayLine } from './PlayerDay';

/**
 * The **Overview** tab: the player as a summary page.
 *
 * It began as one thing — his day, the feed's grouped reading arrived where it
 * belonged — and one thing is not what a page opened on a stranger is opened
 * for. A research-board row is a man you are deciding about, and the questions
 * under that decision are *what is he doing*, *what is being said about him*,
 * *how good is he* and *how has he been going*. So the tab is four blocks in
 * that order, each of them a summary with a door to the tab that holds it whole:
 *
 * 1. **Today**, or the **next game** he has when the day holds none.
 * 2. **News** — his latest transactions and articles, over to the News tab.
 * 3. **Season** — the box-score line a roster decision turns on, over to Stats.
 * 4. **Last 5 games** — the Game Log's own table, five rows of it.
 *
 * **The day leads, where the season used to.** What a player page is opened
 * with on a game day is *what he is doing* — which is the argument this tab is
 * already the default one on — and the block that answers it is the same block
 * whichever of its three states it is in: a live at-bat, today's finished line,
 * or the game he has next. Splitting the scheduled-game half out so that *it*
 * alone led was the alternative and is worse in the way that matters: the
 * leading block would then be present on a quiet morning and absent on a game
 * day, so the page would open on a different thing depending on the fixture
 * list, and the two halves of one question ("what is he doing / when next")
 * would sit in two places on one page.
 *
 * None of the four is a second copy of anything. The season line is the very one
 * the Stats tab draws (`/api/players/:id/splits`, already in flight when the
 * page opens); the day is `PlayerDay`, which is the feed's own items; the five
 * rows are `GameLogTable` with `shown` set small; and the news is `NewsList`
 * with `shown` set small — see `GameLog.tsx` and `PlayerNews.tsx`, where both
 * were factored out for exactly this.
 */
export function OverviewTab({
  report,
  playerId,
  name,
  season,
  pitcherSeason,
  seasonLoading,
  gameLog,
  gameLogLoading,
  news,
  newsLoading,
  onTab,
  onOpenDetails,
}: {
  /** His day — the same `PlayerReport` the feed reads, off `/api/players/:id/day`. */
  report: PlayerReport;
  playerId: number;
  name: string;
  /** The season line, whichever kind he is. Both are handed down rather than
   *  fetched here, because `PlayerDetails` already holds them for the Stats tab
   *  and a second read would be a second answer to one question. */
  season: SeasonStats | null;
  pitcherSeason: PitcherSeasonStats | null;
  seasonLoading: boolean;
  gameLog:
    | { kind: 'batter'; games: BatterGameLog[] }
    | { kind: 'pitcher'; games: PitcherGameLog[] }
    | null;
  gameLogLoading: boolean;
  /** His news, handed down for the reason the game log is: `PlayerDetails`
   *  reads it once for this preview and the News tab alike, so the two can
   *  never show different items. */
  news: PlayerNews | null;
  newsLoading: boolean;
  /** Switch the page to another tab — what each block's own link does. */
  onTab: (tab: 'news' | 'stats' | 'gamelog') => void;
  onOpenDetails?: (key: string) => void;
}) {
  const isPitcher = report.kind === 'pitcher';
  // **The combined line only appears when there is something to combine.** A
  // day is one game almost every time, and that game's own section header
  // already carries his line for it — so on a single-game day the strip was the
  // same string twice, an inch apart. On a doubleheader it is genuinely new,
  // being the only place the two halves are added up.
  const line = report.games.length > 1 ? playerDayLine(report) : null;
  const hasGames = report.games.length > 0;
  // Which of the two questions the next-game block asks, hoisted here because
  // the block's *heading* now names it and the block itself prints it. One
  // definition, so the two can never say different words.
  const wantStart = isPitcher && isRotationStarter(report);
  const nextLabel = wantStart ? 'Next start' : 'Next game';
  return (
    <div className="details-overview">
      {/* **The day leads.** Whichever of its three states it is in — a game in
          progress, a game already played, or none at all — this block is the
          answer to what a player page is opened with, and it is never empty:
          the third state is the scheduled game, which is what the block's own
          heading then names. */}
      <section className="ovw-block">
        <h2 className="ovw-head">{hasGames ? 'Today' : nextLabel}</h2>
        {line && <p className="details-note details-day-line">{line}</p>}
        {hasGames ? (
          <PlayerDay report={report} onOpenDetails={onOpenDetails} />
        ) : (
          /* Nothing today, which is the moment the obvious next question is
             "when, then". Whose next game it is turns on `isRotationStarter` —
             a starter is in one game in five and only the one he is named for
             is his, where any of his club's could be a reliever's or a
             batter's. ESPN's SP/RP eligibility is deliberately *not* the test:
             it is a cover rather than a partition (a fifth of the league's
             pitchers are eligible at both), so it can say where a league will
             let you start him and not whether he works out of the rotation.

             The heading above carries the label, so the block does not print
             it a second time on its own line — see `NextGameBlock`. */
          <NextGameBlock playerId={playerId} wantStart={wantStart} name={name} />
        )}
      </section>

      <NewsPreview
        news={news}
        loading={newsLoading}
        name={name}
        onSeeAll={() => onTab('news')}
      />

      <SeasonSummary
        isPitcher={isPitcher}
        season={season}
        pitcherSeason={pitcherSeason}
        loading={seasonLoading}
        onSeeAll={() => onTab('stats')}
      />

      {gameLog ? (
        <GameLogPreview
          log={gameLog}
          playerId={playerId}
          name={name}
          onSeeAll={() => onTab('gamelog')}
        />
      ) : (
        <section className="ovw-block">
          <h2 className="ovw-head">Recent games</h2>
          <GameLogWait loading={gameLogLoading} />
        </section>
      )}
    </div>
  );
}

/**
 * The News block: his three latest items, over to the tab that holds them all.
 *
 * **`NewsList` with `shown` set small**, not a second list — the same rule the
 * five-game preview follows against the Game Log tab, and for the same reason:
 * the row shapes, the two sources' different voices and the press that opens an
 * article have one definition. The only things this block decides are how many
 * rows and whether the standfirst is drawn.
 *
 * It sits **second**, between the day and the season line. That is where it
 * belongs on the question the tab is ordered by: the day says what he is doing,
 * the news says what is being said about him — an IL placement, a call-up, a
 * report that he is losing the closer's job — and both of those are things that
 * happened *this week*, where the season line and the game log underneath are
 * the record. A manager who has just been told a man is hurt does not want to
 * read a season line first.
 *
 * The empty case is a **line rather than a box**: a preview of nothing has no
 * business spending an `.empty-state` on itself when the tab beside it will say
 * the whole of it, and the `News →` link is what takes a reader there.
 */
function NewsPreview({
  news,
  loading,
  name,
  onSeeAll,
}: {
  news: PlayerNews | null;
  loading: boolean;
  name: string;
  onSeeAll: () => void;
}) {
  const wait = useDelayedFlag(loading);
  const items = news?.items ?? [];
  return (
    <section className="ovw-block ovw-news">
      <div className="ovw-head-row">
        <h2 className="ovw-head">News</h2>
        {/* The door is drawn whether or not there is anything behind it: a
            reader who wants to be sure nothing has been missed is exactly the
            reader with an empty block in front of them, and the tab is where
            that is said in full. */}
        <button type="button" className="ovw-link" onClick={onSeeAll}>
          News →
        </button>
      </div>
      {items.length > 0 ? (
        <NewsList items={items} shown={3} />
      ) : wait ? (
        <LoadingLine>Reading the latest news</LoadingLine>
      ) : loading ? null : (
        <p className="ovw-none">No recent news for {name}.</p>
      )}
    </section>
  );
}

/** The log's own wait, held back by `WAIT_DELAY` like every other in the app —
 *  a warm log comes back in tens of milliseconds, and a mark that appears and
 *  vanishes inside a tenth of a second reads as the page breaking. */
function GameLogWait({ loading }: { loading: boolean }) {
  const wait = useDelayedFlag(loading);
  if (wait) return <LoadingLine>Reading the game log</LoadingLine>;
  if (loading) return null;
  return <p className="ovw-none">Couldn&rsquo;t read the game log.</p>;
}

/**
 * The season as the handful of numbers a roster decision turns on.
 *
 * **Deliberately short, and short in a way the Stats tab is not.** That tab is
 * the season whole — the slash line beside each of its expected twins, the
 * platoon halves under it, every counting stat — which is the right answer to
 * "how good is he" and the wrong shape for the top of a summary page. Here it
 * is the fantasy box score and nothing else: a batter's `G · R · HR · RBI · SB`
 * with his slash-line ends, a pitcher's `IP · W-L · SV · HD · ERA · WHIP · K%`.
 * Anything more and the day underneath it starts below the fold.
 *
 * A pitcher's four credits are read off the line rather than tallied from his
 * game log, which the Game Log's own foot does a game at a time: they are MLB's
 * own totals on the very line this block already has, and a second arithmetic
 * over 60 rows would be a second answer free to disagree with it.
 */
function SeasonSummary({
  isPitcher,
  season,
  pitcherSeason,
  loading,
  onSeeAll,
}: {
  isPitcher: boolean;
  season: SeasonStats | null;
  pitcherSeason: PitcherSeasonStats | null;
  loading: boolean;
  onSeeAll: () => void;
}) {
  const wait = useDelayedFlag(loading);
  const cells: [string, string][] | null = isPitcher
    ? pitcherSeason && pitcherSeason.gamesPlayed > 0
      ? [
          ['IP', pitcherSeason.inningsPitched],
          ['W-L', `${pitcherSeason.wins}-${pitcherSeason.losses}`],
          ['SV', String(pitcherSeason.saves)],
          ['HD', String(pitcherSeason.holds)],
          ['ERA', pitcherSeason.era],
          ['WHIP', pitcherSeason.whip],
          ['K%', pitcherSeason.kRate],
        ]
      : null
    : season && season.pa > 0
      ? [
          ['G', String(season.gamesPlayed)],
          ['R', String(season.runs)],
          ['HR', String(season.hr)],
          ['RBI', String(season.rbi)],
          ['SB', String(season.sb)],
          ['AVG', season.avg],
          ['SLG', season.slg],
          ['OPS', season.ops],
        ]
      : null;
  return (
    <section className="ovw-block">
      <div className="ovw-head-row">
        <h2 className="ovw-head">Season</h2>
        <button type="button" className="ovw-link" onClick={onSeeAll}>
          Stats →
        </button>
      </div>
      {cells ? (
        /* `.glog-table` outright rather than a lookalike — this **is** the app's
           one plain stat table, at one row. See the note beside `.ovw-table` in
           the stylesheet for the three things a single row takes back off. */
        <div className="glog-scroll">
          <table className="glog-table ovw-table">
            <thead>
              <tr>
                {cells.map(([label]) => (
                  <th key={label} className="glog-num" scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {cells.map(([label, value]) => (
                  <td key={label} className="glog-num">
                    {value}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : wait ? (
        <LoadingLine>Reading the season line</LoadingLine>
      ) : loading ? null : (
        <p className="ovw-none">
          No {isPitcher ? 'innings' : 'plate appearances'} this season.
        </p>
      )}
    </section>
  );
}

/**
 * What he has coming, drawn where his day would have been.
 *
 * "No game today" is a true answer and a useless one on its own — the reader
 * who opened this page wanted to know when, and every other view in the app can
 * only say *today*. So the block names the next one: his club's, or, for a
 * starting pitcher, the next turn he has actually been named for.
 *
 * **A starter with nothing announced is told so rather than shown his club's
 * next game**, which would be somebody else's start. That distinction is the
 * whole reason the server answers with `start` beside the game rather than a
 * bare `NextGame | null`.
 *
 * Its own read, on open, and only in this branch: a day that holds a game never
 * asks the question, so a player who is playing today costs nothing.
 */
function NextGameBlock({
  playerId,
  wantStart,
  name,
}: {
  playerId: number;
  wantStart: boolean;
  name: string;
}) {
  const [info, setInfo] = useState<NextGameInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const wait = useDelayedFlag(loading);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setInfo(null);
    api
      .nextGame(playerId, wantStart)
      .then((d) => {
        if (live) setInfo(d);
      })
      .catch(() => {
        // A failed read costs the line and nothing else — the "no game today"
        // above it is still the answer to what was asked.
        if (live) setInfo(null);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [playerId, wantStart]);

  const game = info?.game ?? null;
  // **The label is the block's heading now, so it is not repeated here.** The
  // day block leads the tab and its heading names what it holds — `Today` where
  // there is a game and `Next start` / `Next game` where there isn't — so a
  // label on the line under it would be the same two words an inch apart. The
  // *sentences* below still have to distinguish the two, which is what
  // `wantStart` is still read for: "not yet scheduled" is a fact about how far
  // ahead clubs name a rotation and is a different claim from "nothing
  // scheduled".
  return (
    <div className="ovw-next">
      <p className="ovw-none">No game for {name} today.</p>
      {wait && <LoadingLine>Reading his next game</LoadingLine>}
      {!loading && game && (
        <p className="ovw-next-line">
          <span className="ovw-next-when">
            {prettyGameDate(game.date)}
            {formatStartTime(game.startTime) ? ` · ${formatStartTime(game.startTime)}` : ''}
          </span>
          <span className="ovw-next-opp">
            {game.home ? 'vs' : '@'} {game.opponent}
          </span>
          {/* The other side's announced starter — the one thing that decides
              whether a scheduled game is worth anything to a batter, and a
              starter's counterpart on his own next start. Absent until that
              club names one, which is most of the fortnight. */}
          {game.probablePitcher && (
            <span className="ovw-next-vs">
              vs {handThrows(game.probablePitcher.hand)} {game.probablePitcher.name}
            </span>
          )}
        </p>
      )}
      {!loading && !game && (
        <p className="ovw-next-line">
          <span className="ovw-next-when">
            {info === null
              ? 'Couldn’t read the schedule.'
              : wantStart
                ? 'Not yet scheduled.'
                : 'Nothing scheduled in the next two weeks.'}
          </span>
        </p>
      )}
    </div>
  );
}
