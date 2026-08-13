import { useEffect, useState } from 'react';
import { api } from '../api';
import { combineLines, combinePitchingLines, prettyGameDate } from '../lib';
import { lineSummary as battingLineSummary } from '../lib';
import type { PlayerGame, PlayerKind, PlayerReport } from '../types';
import { GameStatusBadge } from './PlayerCard';
import { lineSummary as pitchingLineSummary } from './PitcherCard';
import {
  FeedItem,
  LiveEntry,
  UpcomingRow,
  entryKey,
  matchup,
  playerDayEntries,
} from './LiveFeed';
import type { FeedEntry } from './LiveFeed';
import { Modal } from './Modal';

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
 */
export function PlayerDay({
  report,
  gamePk,
  onOpenDetails,
}: {
  report: PlayerReport;
  /** Narrow to one game — what a Game Log row means. Absent, the whole day is
   *  drawn, which on a doubleheader is two sections. */
  gamePk?: number;
  /** Opening another player's page from inside this one. Grouped items draw no
   *  identity row at all, so nothing here can actually reach it; the default
   *  keeps the two call sites from having to invent a handler for a link that
   *  is never rendered. */
  onOpenDetails?: (key: string) => void;
}) {
  const open = onOpenDetails ?? (() => {});
  const isPitcher = report.kind === 'pitcher';
  const day = playerDayEntries(report);
  const inGame = (g: PlayerGame) => gamePk === undefined || g.gamePk === gamePk;
  const live = day.live && inGame(day.live.game) ? day.live : null;
  const entries = day.entries.filter((e) => inGame(e.game));
  const upcoming = day.upcoming.filter((u) => inGame(u.game));
  const games = report.games.filter(inGame);

  // Which items belong to which game. A scheduled game he is actually in is an
  // `UpcomingRow` instead of a section: that row *is* the game info before
  // first pitch — matchup, the SP chip, the other side's announced starter,
  // first pitch — and a section header over it would say the matchup twice.
  const scheduled = new Set(upcoming.map((u) => u.game.gamePk));
  const sections = games
    .filter((g) => !scheduled.has(g.gamePk))
    .map((game) => ({ game, items: entries.filter((e) => e.game.gamePk === game.gamePk) }));

  // A section's own line: what he did in *that* game, in the vocabulary the
  // feed's items already use — a batter's counting line, a pitcher's outing.
  const lineFor = (game: PlayerGame): string | null => {
    if (isPitcher) {
      return game.pitching ? pitchingLineSummary(game.pitching.line) : null;
    }
    return game.plateAppearances.some((pa) => pa.event)
      ? battingLineSummary(game.line)
      : null;
  };

  const nothing = !live && sections.length === 0 && upcoming.length === 0;
  if (nothing) {
    return <div className="feed-empty">No game for {report.name} on this day.</div>;
  }

  return (
    <div className="player-day">
      {/* The live entry sits above the sections rather than inside its own
          game's: it is the "happening now" item and the most important row on
          the page, where filing it under a date would bury it. The game it
          belongs to still gets its section for the plays already completed. */}
      {live &&
        (isPitcher && live.game.pitching ? (
          <FeedItem
            entry={{ type: 'pitching', report, game: live.game }}
            openKeys={new Set()}
            onToggleKey={() => {}}
            onOpenDetails={open}
            grouped
          />
        ) : (
          <PlayerDayLive report={report} role={live.role} game={live.game} onOpenDetails={open} />
        ))}
      {sections.map(({ game, items }) => (
        <PlayerDayGame
          key={game.gamePk}
          game={game}
          line={lineFor(game)}
          items={items}
          onOpenDetails={open}
        />
      ))}
      {upcoming.map(({ game }) => (
        <PlayerDayUpcoming key={game.gamePk} report={report} game={game} onOpenDetails={open} />
      ))}
    </div>
  );
}

/** The live entry, holding its own open state — the page has no `collapse all`
 *  to lift it to, and one at-bat's caret is nobody else's business. */
function PlayerDayLive({
  report,
  role,
  game,
  onOpenDetails,
}: {
  report: PlayerReport;
  role: Parameters<typeof LiveEntry>[0]['role'];
  game: PlayerGame;
  onOpenDetails: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <LiveEntry
      report={report}
      role={role}
      game={game}
      open={open}
      onToggle={() => setOpen((v) => !v)}
      onOpenDetails={onOpenDetails}
      grouped
    />
  );
}

/** Same, for the scheduled game's row. */
function PlayerDayUpcoming({
  report,
  game,
  onOpenDetails,
}: {
  report: PlayerReport;
  game: PlayerGame;
  onOpenDetails: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <UpcomingRow
      report={report}
      game={game}
      open={open}
      onToggle={() => setOpen((v) => !v)}
      onOpenDetails={onOpenDetails}
      grouped
    />
  );
}

/**
 * One game and the plays in it: a static header carrying the date, the matchup,
 * his line for that game and the score badge, over the items.
 *
 * `.feed-game-section` and its head are the classes the grouped feed cut a
 * batter's card into games with — the same block, kept because it is the same
 * job, so the two never had to be drawn twice. Static rather than a collapsible
 * because the plays under it are the thing being read, and a tap to reach them
 * would be a tap spent on nothing.
 */
function PlayerDayGame({
  game,
  line,
  items,
  onOpenDetails,
}: {
  game: PlayerGame;
  line: string | null;
  items: FeedEntry[];
  onOpenDetails: (key: string) => void;
}) {
  // Held here rather than in App: this page has no "collapse all" and lives
  // inside an overlay that unmounts with it, so the keys have nowhere else to
  // belong.
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <div className="feed-game-section">
      <div className="feed-game-head">
        <span className="feed-game-date">{prettyGameDate(game.date)}</span>
        <span className="feed-context">{matchup(game)}</span>
        {line && <span className="feed-game-line">{line}</span>}
        <GameStatusBadge game={game} />
      </div>
      {items.length === 0 ? (
        /* He is on this game's roster and has done nothing in it. Which of the
           two that is turns on the state, and getting it wrong is the whole
           difference between a fact and a wrong claim: a final says he never
           came up, a game still being played says he hasn't *yet*. A
           postponement says neither — the badge above already carries it. */
        <p className="pday-none">
          {game.status.state === 'final'
            ? 'Did not appear.'
            : game.status.state === 'live'
              ? 'Not in the game yet.'
              : 'Yet to play.'}
        </p>
      ) : (
        items.map((entry) => (
          <FeedItem
            key={entryKey(entry)}
            entry={entry}
            openKeys={openKeys}
            onToggleKey={toggle}
            onOpenDetails={onOpenDetails}
            grouped
            /* The header directly above names the game, so an item repeating
               the matchup would be saying it twice. */
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
 * One player's day for one game, in a dialog — what a **Game Log row** opens.
 *
 * The log is the season as the games it is made of, and until now a row was the
 * end of the road: fourteen columns of what he did and no way to see any of it.
 * A press now opens the same reading the player page's Overview tab gives, for
 * that afternoon — his plate appearances with their clips, or his outing with
 * its innings.
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
  kind,
  name,
  date,
  gamePk,
  onClose,
}: {
  playerId: number;
  kind: PlayerKind;
  name: string;
  date: string;
  gamePk: number;
  onClose: () => void;
}) {
  const [report, setReport] = useState<PlayerReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    api
      .playerDay(playerId, kind, date)
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
  }, [playerId, kind, date]);
  return (
    <Modal
      title={`${name} — ${prettyGameDate(date)}`}
      titleId="player-day-title"
      className="player-day-box"
      onClose={onClose}
    >
      {loading && <div className="details-status">Loading the game…</div>}
      {error && !loading && <div className="details-status details-error">⚠ {error}</div>}
      {report && !loading && <PlayerDay report={report} gamePk={gamePk} />}
    </Modal>
  );
}
