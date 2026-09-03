import { useEffect, useState } from 'react';
import { api } from '../api';
import { combineLines, combinePitchingLines, prettyGameDate } from '../lib';
import { lineSummary as battingLineSummary } from '../lib';
import type { PlayerGame, PlayerReport } from '../types';
import { GameStatusBadge } from './PlayerCard';
import { lineSummary as pitchingLineSummary } from './PitcherCard';
import {
  FeedItem,
  LiveEntry,
  UpcomingRow,
  byPlayOrder,
  entryKey,
  matchup,
  playerDayEntries,
} from './LiveFeed';
import type { FeedEntry } from './LiveFeed';
import { useDelayedFlag } from '../hooks';
import { LoadingBlock } from './Loading';
import { Modal } from './Modal';
import { OutingPage } from './OutingPage';
import { EmptyState } from './EmptyState';

/**
 * One player's day, drawn from the feed's own items.
 *
 * This is what the feed's grouped reading was, and what the Games view was
 * before that: one card per player, holding his live at-bat, his plays or his
 * outing, and his next game. Both of those were *pages* built around a player,
 * on an app that already had one — so the reading moved to where it belongs,
 * the player page's **Overview** tab, and the same component answers the Game
 * Log's per-game popup.
 *
 * **Nothing here is a second rendering of anything.** The items are `FeedItem`,
 * `LiveEntry` and `UpcomingRow` exactly as the stream draws them, and what
 * happened to him is `playerDayEntries`, the very function the stream fans
 * across a roster. A parallel copy would be free to drift from the feed the
 * next time either was touched, which is the whole reason the grouped reading
 * derived itself from the flat one rather than gathering its own.
 *
 * The items are drawn **grouped**, which drops their identity row — the page's
 * own head has said the headshot and the name once, and saying them per play is
 * what the grouping was always for.
 *
 * ### The day is a card per game, and the plays are behind it
 *
 * **It used to be the plays themselves, under a static header per game**, and
 * that was the Overview tab spending its whole height on one thing. A day is
 * one game almost every time, so what the tab opened on was a single date line
 * and then four or five at-bat cards, a clip apiece — 3,000px of page on a
 * phone before the reader had decided whether they wanted any of it. The tab is
 * the *lead* of a player page: the first thing it should answer is "what did he
 * do today", which is his line and how the game stands, and the plays are the
 * follow-up question.
 *
 * So a game is a **card** — date, his line, the score and state — and a press
 * opens the feed for it in a dialog (`GameFeedModal`). Everything the tab used
 * to draw is one press away and nothing was cut; what changed is that a day now
 * fits on a screen, and a doubleheader reads as two things rather than as one
 * long scroll with a rule through the middle of it.
 *
 * **The live entry and a scheduled game keep their place on the page**, which
 * is the line worth drawing. A card behind a press is right for what has
 * already happened; "he is at the plate right now" and "he is starting at 7:05"
 * are what a reader opened the page *for*, and putting either behind a press
 * would be hiding the answer to the question being asked.
 *
 * **What the live entry leaves behind depends on the kind, and for a while it
 * didn't.** A batter's live item is the at-bat in progress, which is never one
 * of the completed plays, so his game keeps its card and the two are
 * complementary. A pitcher's live item is his *whole outing* — the same
 * `FeedItem` the stream carries — so the game it comes from must lose its card
 * entirely, or the same line and the same status badge are drawn twice, an inch
 * apart, on the tab the page opens on. See `livePitching` below.
 *
 * **Narrowed to one game (`gamePk`) there is no card at all** — the Game Log's
 * popup and a card's own dialog are already boxes about that game, so drawing a
 * card inside one would be a press to reach the only thing on screen.
 */
export function PlayerDay({
  report,
  gamePk,
  onOpenDetails,
}: {
  report: PlayerReport;
  /** Narrow to one game — what a Game Log row means, and what a game card's own
   *  dialog passes back in. Absent, the whole day is drawn as a card per game,
   *  which on a doubleheader is two. */
  gamePk?: number;
  /**
   * Opening another player's page from inside this one.
   *
   * This comment used to say the default was safe because "grouped items draw
   * no identity row at all, so nothing here can actually reach it", and that
   * was false the moment the Upcoming row's dialog started naming the opposing
   * starter: `grouped` drops the row's *own* header and not that block, whose
   * headshot and name are links to a man nobody has rostered. So a no-op
   * default silently ate them on the Overview tab — the one caller that never
   * passed a handler.
   *
   * It stays optional for `PlayerDayModal` alone, which narrows to one
   * `gamePk` off a Game Log row: that is a game that has been played, so
   * `upcoming` is empty there by construction and the block cannot render.
   */
  onOpenDetails?: (key: string) => void;
}) {
  const open = onOpenDetails ?? (() => {});
  const isPitcher = report.kind === 'pitcher';
  const oneGame = gamePk !== undefined;
  const day = playerDayEntries(report);
  const inGame = (g: PlayerGame) => gamePk === undefined || g.gamePk === gamePk;
  const live = day.live && inGame(day.live.game) ? day.live : null;
  const entries = day.entries.filter((e) => inGame(e.game));
  // What has happened on the play still being thrown — kept out of `entries`
  // by `playerDayEntries`, so it has to be drawn here or it would vanish from
  // the page between the steal and the end of the at-bat it went behind. It
  // rides with the live block above the games for the same reason the live
  // entry does: it is the "happening now" part of the day.
  const liveEvents = day.liveEvents.filter((e) => inGame(e.game));
  const upcoming = day.upcoming.filter((u) => inGame(u.game));
  const games = report.games.filter(inGame);

  // Which items belong to which game. A scheduled game he is actually in is an
  // `UpcomingRow` instead of a card: that row *is* the game info before first
  // pitch — matchup, the SP chip, the other side's announced starter, first
  // pitch — and a card over it would say the matchup twice.
  const scheduled = new Set(upcoming.map((u) => u.game.gamePk));
  // And the game a **pitcher's** live item is drawn from gets no section
  // either, for the same reason one level in: his live item *is* that outing,
  // where a batter's is the at-bat in progress and his card holds the plays
  // that are already done. `playerDayEntries` has kept the pinned outing out of
  // `entries` since it was written (its own `pinned`); the *card* here is built
  // off `report.games` rather than off the entries, so it never saw the guard —
  // and drew the same line, the same badge and the same matchup a second time
  // directly under the live bar. Under a `gamePk` it was worse than a
  // duplicate: with the entry filtered away the section had nothing in it, so
  // the Game Log's popup read `Not in the game yet.` beneath a bar saying he was
  // on the mound.
  const livePitching = live && isPitcher && live.game.pitching ? live.game.gamePk : null;
  const sections = games
    .filter((g) => !scheduled.has(g.gamePk) && g.gamePk !== livePitching)
    // Read forwards: a day is one afternoon start to finish, so the first game
    // of a doubleheader leads. See `byPlayOrder` for the same argument applied
    // to the plays inside one.
    .map((game) => ({ game, items: [...entries.filter((e) => e.game.gamePk === game.gamePk)].sort(byPlayOrder) }));

  const nothing =
    !live && liveEvents.length === 0 && sections.length === 0 && upcoming.length === 0;
  if (nothing) {
    return <EmptyState compact title={<>No game for {report.name} on this day</>} />;
  }

  return (
    <div className="player-day">
      {/* The live entry sits above the games rather than inside one: it is the
          "happening now" item and the most important row on the page, where
          filing it behind a card would bury it. For a **batter** the game it
          belongs to still gets its card, which holds the plays already
          completed in it; a **pitcher's** live item is his whole outing, so
          that game has no card at all — see `livePitching` above. */}
      {live &&
        (isPitcher && live.game.pitching ? (
          <FeedItem entry={{ type: 'pitching', report, game: live.game }} onOpenDetails={open} grouped />
        ) : (
          <LiveEntry
            report={report}
            role={live.role}
            game={live.game}
            onOpenDetails={open}
            grouped
          />
        ))}
      {/* Under it, and above the games, whatever he has done on the play still
          being thrown — the same `FeedItem` his game card would draw once the
          at-bat resolves, so the item does not change shape when it moves. */}
      {liveEvents.map((entry) => (
        <FeedItem key={entryKey(entry)} entry={entry} onOpenDetails={open} grouped />
      ))}
      {sections.map(({ game, items }) =>
        oneGame ? (
          <PlayerDayGameFeed key={game.gamePk} game={game} items={items} onOpenDetails={open} />
        ) : (
          <PlayerDayGameCard
            key={game.gamePk}
            report={report}
            game={game}
            line={gameLine(report, game)}
            items={items}
            onOpenDetails={open}
          />
        ),
      )}
      {upcoming.map(({ game }) => (
        <UpcomingRow key={game.gamePk} report={report} game={game} onOpenDetails={open} grouped />
      ))}
    </div>
  );
}

/** What he did in *that* game, in the vocabulary the feed's items already use —
 *  a batter's counting line, a pitcher's outing. */
function gameLine(report: PlayerReport, game: PlayerGame): string | null {
  if (report.kind === 'pitcher') {
    return game.pitching ? pitchingLineSummary(game.pitching.line) : null;
  }
  return game.plateAppearances.some((pa) => pa.event) ? battingLineSummary(game.line) : null;
}

/** What a game with nothing in it says. Which of the three it is turns on the
 *  state, and getting it wrong is the whole difference between a fact and a
 *  wrong claim: a final says he never came up, a game still being played says
 *  he hasn't *yet*. A postponement says neither — the badge already carries
 *  it. */
function nothingDoing(game: PlayerGame): string {
  if (game.status.state === 'final') return 'Did not appear.';
  if (game.status.state === 'live') return 'Not in the game yet.';
  return 'Yet to play.';
}

/**
 * One game as a card: the date, his line for it, and how the game stands.
 *
 * The badge carries `withMatchup`, which is the whole reason the card can drop
 * the matchup line the old static header printed beside it. That badge already
 * names both clubs the moment there is a score to put between them (`SEA 3–5
 * LAD`), so the line was the same fact stated twice on one row; `withMatchup`
 * fills exactly the gap it leaves — a game with no score yet — so the card says
 * who was played in every state and says it once.
 *
 * A game he did nothing in is **not** a press: there is nothing behind it, so
 * it draws the line the plays would have been under and stays static.
 *
 * **A pitcher's card opens the outing page rather than a dialog**, which is the
 * same split `useGameOpen` makes for the Game Log's rows and for the same
 * reason: a batter's game is a *feed* of plate appearances and this box is
 * exactly that, where a pitcher's game is **one outing** and the app has a page
 * for it. The dialog in between drew a static outing bar with its innings and a
 * `Full breakdown` button through to that page — two presses and a box in front
 * of a page, on a card whose whole content is the outing.
 *
 * It needs no fetch: this card is already holding the `report` and the
 * `PlayerGame` the page reads, which is what makes the swap free here and a
 * read on a Game Log row (see `OutingPageForGame`).
 *
 * And the pitcher branch is `game.pitching` rather than `items.length`, which
 * for a section on this tab is the same set — a pitcher's entry exists iff his
 * game carries an outing, and the pinned live one is filtered out of `sections`
 * upstream — but says what it means rather than relying on the two agreeing.
 */
function PlayerDayGameCard({
  report,
  game,
  line,
  items,
  onOpenDetails,
}: {
  report: PlayerReport;
  game: PlayerGame;
  line: string | null;
  items: FeedEntry[];
  onOpenDetails: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const body = (
    <>
      <span className="feed-game-date">{prettyGameDate(game.date)}</span>
      {line ? (
        <span className="feed-game-line">{line}</span>
      ) : (
        <span className="feed-game-line pday-none">{nothingDoing(game)}</span>
      )}
      <GameStatusBadge game={game} withMatchup />
    </>
  );
  if (items.length === 0) {
    return <div className="pday-game static">{body}</div>;
  }
  const outing = report.kind === 'pitcher' ? game.pitching : null;
  return (
    <>
      <button
        type="button"
        className="pday-game"
        /* A page rather than a popup for a pitcher, so it carries neither —
           the same reason the feed's own outing bar carries neither, and the
           reason the research board's rows and the scoreboard's cards don't. */
        {...(outing ? {} : { 'aria-haspopup': 'dialog' as const, 'aria-expanded': open })}
        title={outing ? 'Open outing' : `${report.name} — ${matchup(game)}`}
        onClick={() => setOpen(true)}
      >
        {body}
      </button>
      {open &&
        (outing ? (
          <OutingPage report={report} game={game} onClose={() => setOpen(false)} />
        ) : (
          <Modal
            title={`${report.name} — ${matchup(game)}`}
            titleId="player-day-game-title"
            className="player-day-box"
            onClose={() => setOpen(false)}
          >
            <PlayerDayGameFeed game={game} items={items} onOpenDetails={onOpenDetails} />
          </Modal>
        ))}
    </>
  );
}

/**
 * The plays of one game, in play order — what a card's dialog holds and what
 * the Game Log's popup draws directly.
 *
 * `.feed-game-section` is the class the grouped feed cut a batter's card into
 * games with, kept because it is the same job: a column of the feed's own items
 * at the feed's own spacing. What it no longer carries is a header — the box
 * around it has a title, and a game named twice is a game named once too often.
 */
function PlayerDayGameFeed({
  game,
  items,
  onOpenDetails,
}: {
  game: PlayerGame;
  items: FeedEntry[];
  onOpenDetails: (key: string) => void;
}) {
  return (
    <div className="feed-game-section">
      {items.length === 0 ? (
        <p className="pday-none">{nothingDoing(game)}</p>
      ) : (
        items.map((entry) => (
          <FeedItem
            key={entryKey(entry)}
            entry={entry}
            onOpenDetails={onOpenDetails}
            grouped
            /* The box around this names the game, so an item repeating the
               matchup would be saying it twice. */
            multiGame={false}
          />
        ))
      )}
    </div>
  );
}

/**
 * The day's own combined line, for a head that wants one number rather than a
 * section per game — the Overview tab's summary strip.
 */
export function playerDayLine(report: PlayerReport): string | null {
  const played =
    report.kind === 'pitcher'
      ? report.games.filter((g) => g.pitching)
      : report.games.filter((g) => g.plateAppearances.some((pa) => pa.event));
  if (played.length === 0) return null;
  return report.kind === 'pitcher'
    ? pitchingLineSummary(combinePitchingLines(played.map((g) => g.pitching!.line)))
    : battingLineSummary(combineLines(played.map((g) => g.line)));
}

/**
 * One **batter's** day for one game, in a dialog — what a Game Log row opens.
 *
 * The log is the season as the games it is made of, and a row was once the end
 * of the road: fourteen columns of what he did and no way to see any of it. A
 * press opens the same reading the player page's Overview tab gives, for that
 * afternoon — his plate appearances with their clips.
 *
 * **`kind` is narrowed to `'batter'`, and that narrowing is the routing rule
 * made checkable.** A pitcher's game is one outing rather than a feed of plays,
 * and `useGameOpen` sends him to `OutingPageForGame` instead; a row that
 * reached here for him drew a static outing bar over its innings with a
 * `Full breakdown` button through to the very page he should have landed on.
 * The type is what stops that being reintroduced by a caller rather than by a
 * comment nobody reads.
 *
 * It fetches its own day rather than being handed one, because a row names a
 * date the page above it knows nothing about; the request is per open, which is
 * right for an explicit action against a route whose every layer is already
 * cached (a past date is a frozen day snapshot, one read).
 *
 * It needs to say nothing at all about where it sits in the stack, which is the
 * point of `Modal`'s `DialogLayerContext`: the player page declares its own
 * layer once and this dialog — opened from a table two components inside it —
 * clears it without knowing it is in an overlay at all.
 */
export function PlayerDayModal({
  playerId,
  name,
  date,
  gamePk,
  onClose,
}: {
  playerId: number;
  name: string;
  date: string;
  gamePk: number;
  onClose: () => void;
}) {
  const [report, setReport] = useState<PlayerReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Behind WAIT_DELAY like every other block wait — see `Loading.tsx`.
  const wait = useDelayedFlag(loading);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    api
      .playerDay(playerId, 'batter', date)
      .then((d) => {
        if (live) setReport(d.player);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [playerId, date]);
  return (
    <Modal
      title={`${name} — ${prettyGameDate(date)}`}
      titleId="player-day-title"
      className="player-day-box"
      onClose={onClose}
    >
      {wait && <LoadingBlock>Reading the game</LoadingBlock>}
      {error && !loading && <div className="details-status details-error">⚠ {error}</div>}
      {report && !loading && <PlayerDay report={report} gamePk={gamePk} />}
    </Modal>
  );
}
