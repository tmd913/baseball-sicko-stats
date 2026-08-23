import { useEffect, useState } from 'react';
import { api } from '../api';
import {
  formatStartTime,
  handThrows,
  isRotationStarter,
  prettyGameDate,
  ratePercent,
  surname,
} from '../lib';
import type {
  BatterGameLog,
  NextGameInfo,
  PitcherGameLog,
  PitcherSeasonStats,
  PlayerNews,
  PlayerReport,
  ProjectedStart,
  ProjectedStarts,
  ScheduleWindow,
  SeasonStats,
  StartTier,
} from '../types';
import type { PitcherLookup } from './schedule';
import { useDelayedFlag } from '../hooks';
import { LoadingLine } from './Loading';
import { GameLogPreview } from './GameLog';
import { Modal } from './Modal';
import { OpponentRead, useOpponentBoards } from './OpponentTable';
import { GamePark } from './ParkFactors';
import type { OppRead } from './OpponentTable';
import { NewsList } from './PlayerNews';
import { PlayerDay, playerDayLine } from './PlayerDay';
import { OVERVIEW_GAMES, UpcomingGames } from './PlayerSchedule';

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
 * **There is a fifth between the first two, and which one it is depends on the
 * man**: a rotation starter gets `Projected Starts`, his next five turns —
 * announced where his club has named him, projected from his own rotation slot
 * past that — and everybody else gets `Next 5 games`, the first five rows of
 * the Schedule tab's fixture list with a `Schedule →` door under the heading.
 * It sits second either way because "when does he play next" is the forward
 * half of *what is he doing*, and the paragraph below is about not splitting
 * those two halves across a page.
 *
 * **Two blocks in one slot rather than a block a starter does without.** The
 * split is the one the day block above has already made: a batter is in every
 * game his club plays and a reliever could be in any of them, so what either
 * has coming is the fixture list, where a starter is in one in five and his
 * turns are the answer (`lib.ts::isRotationStarter`, the app's one definition
 * of that, read here as it is there). A starter is not shown the fixtures on
 * *this* tab because the block that would tell him which of them are his is the
 * one already in the slot; his Schedule tab shows him both.
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
  starts,
  startsLoading,
  startsFailed,
  scheduleWindow,
  scheduleError,
  onNeedSchedule,
  pitcherLookup,
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
  /** His rotation, handed down for the reason the news and the game log are:
   *  `PlayerDetails` reads it once for this block and for the Schedule tab,
   *  which draws the very same block, so the two cannot show different turns
   *  and re-entering either tab costs no request. */
  starts: ProjectedStarts | null;
  startsLoading: boolean;
  startsFailed: boolean;
  /** The league-wide window the next-five block draws, handed down exactly as
   *  it is to the Schedule tab: it takes no parameters, `App` holds one for the
   *  session and both surfaces ask for it the same way. */
  scheduleWindow: ScheduleWindow | null;
  scheduleError: string | null;
  onNeedSchedule: () => void;
  pitcherLookup: PitcherLookup;
  /** Switch the page to another tab — what each block's own link does. */
  onTab: (tab: 'news' | 'stats' | 'gamelog' | 'schedule') => void;
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
  // Whether he works out of the rotation, which decides two things on this tab:
  // that the Projected Starts block is drawn at all, and that the day block
  // above it stops trying to answer "when next". `lib.ts::isRotationStarter` is
  // the app's one definition of it and is read rather than restated.
  const wantStart = isPitcher && isRotationStarter(report);
  // The day block's heading names what the block holds. For a starter that is
  // always the day — the next turn is the block *under* it now — so the third
  // wording, `Next start`, has gone with the sentence it used to head.
  const dayHead = hasGames || wantStart ? 'Today' : 'Next game';
  /**
   * **He has not appeared in a major-league game this season, and the page has
   * to say so.**
   *
   * A prospect reaches this page off a fantasy roster — a league can roster
   * anybody in its own universe, and every reading in this app is built on
   * major-league play. So what he draws is a Season block with no line, a game
   * log with no rows and a column of dashes, none of which is distinguishable
   * from a page whose reads failed. The app's rule is that an empty state names
   * its own cause, and here **one** fact is the cause of every empty block
   * under it at once, so it is said once at the top rather than five times.
   *
   * **It is measured off the page's own reads, not declared by a flag.** No
   * season line of either kind, and a game log that came back **successfully
   * and empty** — a log that failed to read is null and draws its own message,
   * which is what stops a dead upstream being reported as a fact about the
   * player. Both conditions together, because the strictest test is the one
   * that fails in the safe direction: an unmet condition costs the note, and
   * the page then reads exactly as it did before this existed.
   *
   * Deliberately says **this season**, which is what was measured — Spencer
   * Schwellenbach reaches this page by the same route with 78 major-league
   * starts behind him and none in 2026, and the sentence is true of him too.
   */
  const noMajorLeagueSeason =
    !seasonLoading &&
    !gameLogLoading &&
    season === null &&
    pitcherSeason === null &&
    gameLog !== null &&
    gameLog.games.length === 0;
  return (
    <div className="details-overview">
      {noMajorLeagueSeason && (
        <p className="ovw-note">
          {name} has not appeared in a major-league game this season, so there are no stats to
          show.
        </p>
      )}
      {/* **The day leads.** Whichever of its three states it is in — a game in
          progress, a game already played, or none at all — this block is the
          answer to what a player page is opened with, and it is never empty:
          the third state is the scheduled game, which is what the block's own
          heading then names. */}
      {/* `ovw-day` so the section can be reached by the rule that caps and
          centers the tab's three reading columns. It carried no modifier while
          the cap sat on `.player-day` *inside* it, which centered the day's
          items and left this heading at the tab's left edge. */}
      <section className="ovw-block ovw-day">
        <h2 className="ovw-head">{dayHead}</h2>
        {line && <p className="details-note details-day-line">{line}</p>}
        {hasGames ? (
          <PlayerDay report={report} onOpenDetails={onOpenDetails} />
        ) : wantStart ? (
          /* **A rotation starter's "when, then" is the block below**, and that
             is a deferral rather than a loss. `NextGameBlock` answered this for
             a starter by asking for his next *announced* start, which for most
             of the month is nothing — clubs name a rotation three or four days
             out — so what it mostly said was `Not yet scheduled.`: a true
             sentence, and a useless one over a question the club's own schedule
             and his own cadence can answer in five rows. So he gets the line
             saying today is empty, and Projected Starts says when. */
          <p className="ovw-none">No game for {name} today.</p>
        ) : (
          /* Nothing today for a batter or a reliever, and for them the club's
             next game really is the answer: any of its games could be his,
             where a starter is in one in five. */
          <NextGameBlock playerId={playerId} name={name} />
        )}
      </section>

      {/* Second, because "when does he pitch next" is the forward half of the
          question the block above answers — see this file's own head.

          **Every player has a block in this slot now, and which one he gets is
          the same test the day block above him just made.** A rotation starter's
          forward question is his turns and he gets those; everybody else is in
          every game his club plays, so his is the fixture list — five rows of
          it, over to the Schedule tab that holds the fortnight. The two are
          never both drawn, which is the property that makes this a slot rather
          than two blocks: the Overview's rhythm is *now → next → what has
          happened → the record*, and `next` is one block wherever the reader
          lands. */}
      {wantStart ? (
        <ProjectedStartsBlock
          playerId={playerId}
          name={name}
          throws={report.throws}
          info={starts}
          loading={startsLoading}
          failed={startsFailed}
        />
      ) : (
        <UpcomingGames
          onOpenDetails={onOpenDetails}
          report={report}
          reportLoading={false}
          playerId={playerId}
          name={name}
          isPitcher={isPitcher}
          scheduleWindow={scheduleWindow}
          scheduleError={scheduleError}
          onNeedSchedule={onNeedSchedule}
          pitcherLookup={pitcherLookup}
          limit={OVERVIEW_GAMES}
          heading={`Next ${OVERVIEW_GAMES} games`}
          onSeeAll={() => onTab('schedule')}
        />
      )}

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
 * The News block: his **latest item, whole**, over to the tab that holds them all.
 *
 * **`NewsList` with `shown` set small**, not a second list — the same rule the
 * five-game preview follows against the Game Log tab, and for the same reason:
 * the row shapes, the two sources' different voices and the press that opens an
 * article have one definition. The only things this block decides are how many
 * rows and whether the standfirst is drawn.
 *
 * **One row with its standfirst, where it was three rows without.** Three
 * headlines is a list of things that have happened and answers none of them: a
 * manager who reads `Lands on IL with forearm strain` still has to press through
 * to learn how long for. The latest item is the one that changes a decision, and
 * with only one row on the block there is room to show the whole of what the
 * item actually carries — the date, the source's own word for the kind of thing
 * it is, the headline and RotoWire's note under it. Measured on a real report,
 * that is a **93px** block against the 88 three bare headlines took, so the
 * whole trade costs five pixels.
 *
 * **A transaction has no standfirst and leaves no gap.** MLB publishes one
 * sentence and no summary (see `types.ts::NewsItem`), so a row whose latest item
 * is a transaction draws headline and meta and stops — `NewsRow` guards on the
 * field and the row is a `gap`-spaced flex column, so an absent child costs
 * nothing rather than leaving a hole where prose should be. The one further body
 * text either upstream has is RotoWire's own analysis, which is **paywalled and
 * deliberately not taken** (`rotowire.ts`, *What is deliberately not taken*);
 * the row links to the page it was read from, which is where that lives.
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
        <NewsList items={items} shown={1} summaries />
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
 *
 * **And his K% is a share, so it prints as one.** `PitcherSeasonStats.kRate`
 * comes down the wire as `".261"` — a three-decimal string, which is what MLB's
 * own line is made of — and this strip used to print it raw, so a column headed
 * `K%` read `.261`: a share drawn in the notation the app reserves for a slash
 * line, three cells along from an ERA and a WHIP that really are decimals.
 * `ratePercent` is the one place that conversion lives (see **Client**, *A rate
 * is `.xxx` and a share is a percent*), so this cell and the opposing-lineup
 * section that draws the same field cannot come to print it two ways.
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
          // A share, not a slash-line rate: the line carries it as ".261" and
          // the column is headed `K%`, so it prints as 26.1% (see `ratePercent`).
          ['K%', ratePercent(pitcherSeason.kRate)],
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
 * **It asks for his club's next game and nothing else now**, where it used to
 * take a `wantStart` and ask for his next *announced* start instead. That half
 * belongs to `ProjectedStartsBlock`, which answers the same question in five
 * rows and can answer it for the turns nobody has named yet — so this block
 * is not drawn for a rotation starter at all, and the flag it would have needed
 * has gone with the branch. **The server route keeps its `?start=1`**, which is
 * the rule `/api/watchlist` follows for its own name: a tab open at the moment
 * of a deploy is still asking for it, and it still answers correctly.
 *
 * Its own read, on open, and only in this branch: a day that holds a game never
 * asks the question, so a player who is playing today costs nothing.
 */
function NextGameBlock({ playerId, name }: { playerId: number; name: string }) {
  const [info, setInfo] = useState<NextGameInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const wait = useDelayedFlag(loading);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setInfo(null);
    api
      // False, and hard-coded rather than passed: this block is the club's-next-game
      // half of the question and the other half is the Projected Starts block's.
      .nextGame(playerId, false)
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
  }, [playerId]);

  const game = info?.game ?? null;
  // **The label is the block's heading now, so it is not repeated here.** The
  // day block leads the tab and its heading names what it holds — `Today` where
  // there is a game and `Next game` where there isn't — so a label on the line
  // under it would be the same two words an inch apart. And there is one
  // sentence rather than two: `Not yet scheduled.` was the starter's answer and
  // a starter no longer reaches this block.
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
              : 'Nothing scheduled in the next two weeks.'}
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * The Projected Starts block: his next five turns, announced where his club has
 * named him and projected from his own rotation slot past that.
 *
 * **It sits second, directly under the day**, and that is the tab's own ordering
 * argument rather than an exception to it. The day block answers *what is he
 * doing*; "when does he pitch next" is the forward half of exactly that
 * question, which is why the day block's own note says the two halves must not
 * end up in two places on one page. For a starting pitcher it is also the most
 * actionable thing on the page — a two-start week is worth seeing a fortnight
 * out — and nothing else in the app can say it.
 *
 * **Drawn only for a rotation starter** (`lib.ts::isRotationStarter`, the app's
 * one definition of who works out of the rotation), because the block is
 * meaningless for anybody else: a batter is in every game his club plays and a
 * reliever could be in any of them, so neither has a slot to be projected into.
 * ESPN's `SP` eligibility is deliberately not the test — it is a cover rather
 * than a partition, so it says where a league will let you start a man and not
 * whether he takes the ball every fifth day.
 *
 * **And the day block above defers to it.** `NextGameBlock` used to answer this
 * question for a starter and mostly answered it with `Not yet scheduled.`, which
 * is true for most of the month and useless: clubs name a rotation three or four
 * days out, so the honest answer is the one nobody has published and everybody
 * can work out. So for a rotation starter that block is not drawn at all — the
 * day says `Today` and the block under it says when, in five rows instead of a
 * sentence.
 *
 * Its own read, lazily and once per player, in the shape every other lazily
 * fetched thing on this page takes: `useDelayedFlag` behind `WAIT_DELAY` so a
 * warm answer never flashes a wait, and the spinning baseball over a line naming
 * what is being read.
 */
/**
 * **Exported, because the Schedule tab is this block and nothing else for a
 * rotation starter** (`PlayerSchedule.tsx`). That is the arrangement News and
 * the Game Log already have — the Overview previews and a tab holds the whole
 * thing — with one difference worth naming: those two are one *read* shared by
 * two drawings, and this is one *component* drawn on two tabs. Only one of them
 * is ever mounted (the strip draws one tab), so it is one read either way; and
 * a second implementation of the same five rows is the thing that could not be
 * kept honest.
 */
export function ProjectedStartsBlock({
  playerId,
  name,
  throws,
  info,
  loading,
  failed,
}: {
  playerId: number;
  name: string;
  /** His own throwing hand, which decides which row of the opponent table is
   *  accented. A start nobody has played has no `game.stand` to read it off. */
  throws: string | null;
  /**
   * **The rotation, read by `PlayerDetails` rather than here.**
   *
   * It used to be this block's own effect, and the block is now drawn on two
   * tabs — the Overview and the Schedule tab — so mounting it fetched. Which is
   * a re-read on every tab switch either way, and was **two** in development,
   * StrictMode double-invoking an effect whose only guard was a `live` flag it
   * cleared on the way out. Every other lazy read on this page is held by a ref
   * one level up for exactly that reason (see `PlayerDetails`' own
   * `startsReq`), and now so is this one: pressing a tab twice fetches once,
   * and leaving it and coming back draws what it has.
   *
   * **`loading` covers the beat before the request goes out** as well as the
   * request itself (`PlayerDetails`' `startsPending`): the effect that fires it
   * runs after the paint that mounts this, and `info === null` with neither
   * flag set is precisely the state the refusal branch below draws
   * `Couldn’t read his club’s schedule.` for. So this block can no longer see
   * that state at all.
   */
  info: ProjectedStarts | null;
  loading: boolean;
  failed: boolean;
}) {
  const wait = useDelayedFlag(loading);
  // One opposing club's season line per team id, read on the press that opens a
  // row and then held for the life of the block. **The cache moved to
  // `OpponentTable.tsx`** when the Schedule tab's fixture rows became presses
  // onto the same dialog: two lists of dated rows reading one club's line is
  // one behavior, and it now sits beside the table it feeds — see
  // `useOpponentBoards`, which carries the reasoning this comment used to.
  const { opps, load: loadOpponent } = useOpponentBoards(playerId);

  const starts = info?.starts ?? [];
  const note = headNote(info, starts, name);
  return (
    <section className="ovw-block ovw-starts">
      {/* **The block's own note rides in the heading row**, where it used to be
          a paragraph under the list. Two of them, in fact — the cadence caveat
          and, on a list that stopped short, the reason it did — and a block of
          five rows closing on two sentences of small print was more apparatus
          than the rows it qualified. What each said is not lost, only shortened
          to the phrase that carries it and moved to the one line on the block
          that is always drawn and always read: `a turn every 5 club games` says
          how much to trust the muted rows, exactly as the sentence did, and
          `nothing past what his club has named` says why a list is one row long.
          The sentence itself is the note's `title`, so the reasoning is a hover
          away rather than gone — and it is a *supplement* here rather than the
          only copy, which is the rule a `title` may be used under. */}
      <div className="ovw-head-row">
        <h2 className="ovw-head">Projected Starts</h2>
        {note && (
          <span className="start-note" title={note.title}>
            {note.text}
          </span>
        )}
      </div>
      {starts.length > 0 ? (
        <ol className="start-list">
          {starts.map((s) => (
            <StartRow
              key={s.gamePk}
              start={s}
              name={name}
              throws={throws}
              opp={opps[s.opponentId]}
              onLoad={loadOpponent}
            />
          ))}
        </ol>
      ) : wait ? (
        <LoadingLine>Reading his rotation</LoadingLine>
      ) : loading ? null : (
        <p className="ovw-none">{refusalText(info, failed, name)}</p>
      )}
    </section>
  );
}

/**
 * The phrase beside the heading, and the sentence behind it. Two states, one
 * slot, and they cannot both hold: a refusal is the projection declining to run,
 * so there is no cadence when there is a refusal and nothing projected when
 * there is no cadence.
 *
 * - **A cadence**, whenever something on screen is actually a guess. It names
 *   *his own pace* rather than saying "estimated", because the number is what
 *   tells a reader how much to trust the muted rows — one turn every five club
 *   games is a settled rotation, and the same phrase saying six is a club
 *   running a six-man.
 * - **A refusal with rows above it.** A pitcher can have an announced start and
 *   no cadence to project past it — a call-up his club has named for Sunday is
 *   exactly that — and a block that showed the one row and stopped would leave
 *   a reader wondering where the other two went. The refusal *branch* below
 *   only speaks when there is nothing at all, so this says it over a list.
 *
 * Nothing at all in the ordinary announced-only case, and nothing while the read
 * is out: a heading that grew a phrase as the rows landed would move the list
 * under the reader's eye.
 */
function headNote(
  info: ProjectedStarts | null,
  starts: ProjectedStart[],
  name: string,
): { text: string; title: string } | null {
  if (!info || starts.length === 0) return null;
  if (info.refusal) {
    return {
      text: 'nothing past what his club has named',
      title: refusalText(info, false, name),
    };
  }
  const guesses = starts.filter((s) => s.tier !== 'announced');
  if (guesses.length === 0 || info.cadence == null) return null;
  const games = `${info.cadence} club ${info.cadence === 1 ? 'game' : 'games'}`;
  // **Whose pace it is, not just what it is.** A turn every five club games is
  // the same phrase whether it was measured off his own starts or borrowed from
  // his club's rotation, and which of those it is decides how much the muted rows
  // are worth — so the phrase names the source. `estimated` wins where the list
  // holds both, being the weaker.
  const estimated = guesses.some((s) => s.tier === 'estimated');
  const whose = estimated ? "his club's rotation" : 'his own pace this season';
  return {
    text: estimated ? `his club's turn: every ${games}` : `a turn every ${games}`,
    title:
      `${guesses.length === 1 ? 'One start is' : `${guesses.length} starts are`} projected from ` +
      `his last one, at a turn every ${games} — ${whose}. Nobody has named them yet.`,
  };
}

/** What the block says when it has nothing to show, which is four different
 *  facts about the pitcher and so four different sentences — see
 *  `ProjectionRefusal`, where each is set out. */
function refusalText(info: ProjectedStarts | null, failed: boolean, name: string): string {
  if (failed || info === null || info.refusal === 'no-schedule') {
    return 'Couldn’t read his club’s schedule.';
  }
  switch (info.refusal) {
    case 'not-a-starter':
      return `${name} hasn’t started a game this season, so there’s no rotation slot to place him in.`;
    case 'new-club':
      return `${name} hasn’t started for his new club yet, so there’s no slot to place him in — nothing past what they have named.`;
    case 'too-few-starts':
      // It now means *nobody's* turn could be read — neither his own record nor
      // his club's — which past the opening week of a season is a club whose
      // games we haven't got. See `ProjectionRefusal`.
      return `No rotation to read a slot off yet — nothing past what his club has named.`;
    case 'out-of-rotation':
      return `${name} has missed more than a turn, so his rotation slot isn’t his to project from — nothing past what his club has named.`;
    case 'off-roster':
      // He may well hold a slot; he is not available to fill it. See
      // `ProjectionRefusal`, and the feed's Upcoming section, which drops an
      // off-active-roster player for the same reason.
      return `${name} isn’t on the active roster, so he isn’t making a start his rotation slot falls on — nothing past what his club has named.`;
    default:
      return 'Nothing left on his club’s schedule.';
  }
}

/**
 * The word each tier wears, and the sentence behind it.
 *
 * **Three where there were two**, and the third is the one worth explaining: a
 * pitcher too new to his club to have a rotation record of his own is placed on
 * his club's rotation instead, which is a real answer and a weaker one. The words
 * are the app's own — `estimated` is what the percentile card has called a
 * fallback since its first dotted bar — and the *title* carries which cadence it
 * was, since `Projected` and `Estimated` are near enough synonyms in ordinary
 * English to need saying once.
 *
 * See `StartTier` for the three, and `server/src/rotations.ts` for what each was
 * measured against.
 */
const TIER_TAG: Record<StartTier, string> = {
  announced: 'Announced',
  projected: 'Projected',
  estimated: 'Estimated',
};

const TIER_LEAD: Record<StartTier, string> = {
  announced: 'Announced by his club',
  projected: 'Projected from his rotation slot at his own pace this season — nobody has named it yet',
  estimated:
    "Estimated from his club's rotation, his own record being too thin to read one off — nobody has named it yet",
};

/**
 * One start. The parts are a when, a matchup, whoever the other side has named,
 * and the tag that says whether the row is a fact or a guess — the same wrapping
 * line `.ovw-next-line` uses one block up, so a start read here and the next
 * game read there read alike.
 *
 * **A projected row is drawn as a guess and an announced one is not**, which is
 * the app's standing rule that an estimate is marked as one — the percentile
 * card's dotted bubble and the Splits card's hatched fill are the same rule on
 * two other surfaces. It used to be said **three** ways and is now said two:
 * the row's text goes muted and the tag says the word. The third was a dashed
 * left rail against the announced row's solid accent one, and it went with that
 * one — see the stylesheet, where dropping the pair together is argued: the two
 * that are left are the clearer two, and a rail on one kind of row alone would
 * have left the list indented in two places for no reason a reader could see.
 *
 * The opposing starter is by **surname**, where the single next-game line above
 * prints the whole name: this is a list of rows scanned down rather than one
 * sentence read across, which is the same reason the summary table's opponent
 * cell and the feed's Upcoming bar cut theirs. The full name is on the row's
 * tooltip.
 */
function StartRow({
  start,
  name,
  throws,
  opp,
  onLoad,
}: {
  start: ProjectedStart;
  name: string;
  throws: string | null;
  /** What the block has learned about this club, if anything yet. */
  opp: OppRead | undefined;
  onLoad: (teamId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const when = prettyGameDate(start.date);
  const time = formatStartTime(start.startTime);
  const matchup = `${start.home ? 'vs' : '@'} ${start.opponent}`;
  const sp = start.probablePitcher;

  // **A row with nothing behind it is not a press**, which is the feed's own
  // rule (`expandable = !!game.opponentHitting`) arriving one read later. There
  // it is decided up front because the report already carries the line; here it
  // cannot be known until the club has been read, so a row goes static only once
  // the server has answered *with no board for that club* — the state
  // `getTeamHitting` returns for a team its own board has no row for. A read
  // that **threw** keeps the press, since a retry is a different thing from an
  // absence and the dialog offers one.
  const known = opp !== undefined && 'board' in opp;
  const expandable = !(known && opp.board == null);

  const title =
    `${TIER_LEAD[start.tier]}: ${when}${time ? ` at ${time}` : ''} ${matchup}` +
    (sp ? ` · against ${handThrows(sp.hand)} ${sp.name}` : '') +
    (expandable ? ' · open to see how that lineup has hit' : '');

  // The line itself, drawn the same whether or not it is a press: the row's own
  // muting and its `Announced` / `Projected` / `Estimated` tag already say what
  // kind of fact it is, and a second treatment for "you can open this" would be
  // a third.
  const line = (
    <>
      <span className="ovw-next-when">
        {when}
        {time ? ` · ${time}` : ''}
      </span>
      <span className="ovw-next-opp">{matchup}</span>
      {sp && (
        <span className="ovw-next-vs">
          vs {handThrows(sp.hand)} {surname(sp.name)}
        </span>
      )}
      <span className="start-tag">{TIER_TAG[start.tier]}</span>
    </>
  );

  return (
    <li className={`start-row start-row--${start.tier}`}>
      {expandable ? (
        // No caret: the row is the affordance, which is the rule this app
        // restates wherever a bar opens something (see `pitchers.md`).
        <button
          type="button"
          className="start-line"
          aria-haspopup="dialog"
          aria-expanded={open}
          title={title}
          onClick={() => {
            onLoad(start.opponentId);
            setOpen(true);
          }}
        >
          {line}
        </button>
      ) : (
        <div className="start-line static" title={title}>
          {line}
        </div>
      )}
      {/* `open` alone rather than `expandable && open`, which is not the tidier
          spelling of the same thing: the answer that makes a row static arrives
          *while its own dialog is up*, so gating on both unmounted the box in
          front of the reader the moment the read landed — a press that flashed
          and shut with nothing said. Only a press can set `open`, and a static
          row has none, so the two states cannot contradict each other. */}
      {open && (
        <Modal
          title={`${name} — ${when} ${matchup}`}
          titleId={`start-opponent-${start.gamePk}`}
          className="play-detail-box"
          onClose={() => setOpen(false)}
        >
          <div className="start-detail">
            {/* The ballpark he would work in. Both hands together, on every row
                of this list: it is a pitcher's, and he faces whichever nine the
                other club writes down. See `ParkFactors.tsx`. */}
            <GamePark
              venueId={start.venueId}
              handNote="The park as it plays to both hands — he faces whoever they write down."
              onNavigate={() => setOpen(false)}
            />
            {/* **A projected row's dialog must not read as a claim about a game
                he has been named for.** The row says `Projected` and goes muted;
                inside the box that context is gone, so the sentence is repeated
                where the reader is — and it says what the lineup below it *is*,
                which is who he would face rather than who he will. An announced
                row needs none of it: his club has named him. */}
            {!start.announced && (
              <p className="ovw-none">
                Projected from his rotation slot — nobody has named this start yet, so this is the
                lineup he <em>would</em> face.
              </p>
            )}
            <OpponentRead
              opp={opp}
              opponent={start.opponent}
              opponentId={start.opponentId}
              hand={throws}
              onRetry={onLoad}
            />
          </div>
        </Modal>
      )}
    </li>
  );
}

