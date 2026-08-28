import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useResource, useResourcePoll } from '../resource';
import {
  formatStartTime,
  inningLabel,
  LIVE_POLL_MS,
  prettyGameDate,
  SEASON_STALE_MS,
} from '../lib';
import { useDelayedFlag, useTeamDoor } from '../hooks';
import type { GamePageTab } from '../hooks';
import { DetailsShell, DetailsTabButton } from './DetailsShell';
import { LoadingBlock } from './Loading';
import { Modal } from './Modal';
import { byPlayOrder, entryKey, FeedItem, playerDayEntries } from './LiveFeed';
import type { FeedEntry } from './LiveFeed';
import { TeamPhoto } from './PlayerIdentity';
import type {
  GameBatterLine,
  GamePitcherLine,
  GameReport,
  GameRosterMan,
  GameTeamLine,
  PlayerReport,
  SeasonPlayer,
} from '../types';

/**
 * **A game's own page** — the line score, both clubs' box scores and rosters,
 * and every play in the order it happened.
 *
 * ## Why a page, and why this one
 *
 * It is the **third** thing in this app to be a full-screen page, after a
 * player's and a club's, and it is those two's sibling by construction: the
 * box, the pinned chrome, the back button, the tab strip, the scroll reset and
 * the Escape are `DetailsShell`, which neither of them owns either. What is
 * here is only what is different about reading *one night* rather than one man
 * or one club.
 *
 * The subject is the thing that makes it a page rather than a dialog. Every
 * other reading of a game in this app is a reading of a game **through
 * somebody**: the outing page is a pitcher's night, the feed's cards are a
 * roster's plate appearances, the preview dialog is a matchup one man is about
 * to stand in. This is the game with nobody in front of it, which is a
 * different subject and several screens of table — the same argument
 * `OutingPage` makes for itself one level down.
 *
 * ## Three tabs
 *
 * **Overview · Box Score · Plays**, and the order is the order a reader asks
 * for them.
 *
 * - **Overview** is the answer: the line score, who won it, and the runs as
 *   they were scored. A reader who opened a finished game from an opponent cell
 *   wanted this and can leave.
 * - **Box Score** is the whole of both clubs — nine batting lines a side with
 *   their substitutes under them, every pitcher who took the mound, and the
 *   bench and bullpen who did not. It is the roster reading as well as the stat
 *   one, because MLB files them as one thing and splitting them would put a
 *   man's name on two tabs.
 * - **Plays** is the game as it happened, which is the longest read and so the
 *   last.
 *
 * ## Both sides at once, and no side switch
 *
 * The team page pins a Batting/Pitching switch above every tab and this page
 * deliberately has none. A club is one subject with two halves, so a switch
 * there is *which half am I reading*; a game is **two** subjects and the reader
 * is comparing them. A box score read one club at a time is a box score you
 * cannot read across, which is most of what a box score is for.
 *
 * ## The reads
 *
 * One route, `/api/games/:gamePk`, read on open and — while the game is being
 * played — again every `LIVE_POLL_MS`, which is the roster's own clock so that
 * a reader with both open never sees two answers about one game a beat apart.
 *
 * The poll is **quiet**, which is rule 1 of the loading system: the last answer
 * stands while the next is in flight, nothing blanks, and only the newest read
 * may write (`reqRef`). A block wait is drawn only where there is nothing on
 * screen yet and only past `WAIT_DELAY`.
 */
/**
 * **Every game and every play stream this tab has already read**, by `gamePk`.
 *
 * It is a **layout** cache rather than a network one, and it is here for the
 * reason `PlateAppearanceCard`'s `clipUrls` is there: this page is unmounted
 * and remounted every time a reader steps off it and back — the three pages
 * being exclusive — and a remount that starts empty renders a box of nothing,
 * which the browser clamps the restored scroll offset to 0 against. With the
 * answer in hand the page renders at its full height in the **first** commit,
 * and `DetailsShell`'s `initialScroll` lands where the reader left.
 *
 * It says nothing about freshness. Every mount still issues its read, and a
 * live game still polls; what the cache changes is what is on screen while that
 * is in flight, which is rule 1 of the loading system — *never over data*.
 */
/* `gameCache` and `playsCache` stood here — two module-level `Map`s, kept so a
   page stepped back onto would render at its full height in the **first**
   commit rather than as an empty box the browser clamps a restored scroll to 0
   against. Both are the resource store's now (`resource.ts`), which holds an
   answer past the component that asked for it and hands it back synchronously
   on the next mount, and which — unlike a module `Map` nothing else can see —
   can be invalidated and is bounded. The paragraph above is why they existed
   and still describes what the keys below buy.
*/
/**
 * …and **how far down the game the Plays tab was opened**, by `gamePk`.
 *
 * The same cache and the same reason. Restoring a scroll offset onto a page
 * that has forgotten its paging restores nothing: the tab comes back one inning
 * deep, which is a few thousand pixels tall, and the browser clamps a
 * five-thousand-pixel offset to the bottom of it — measured, `scrollTop 0` and
 * two half-innings where the reader left eight and 5,000.
 *
 * So how much of the game is open is part of the page the reader left, exactly
 * as the scroll is, and it is kept in the same place.
 */
const shownMemo = new Map<number, number>();

export function GamePage({
  gamePk,
  players,
  initialTab,
  onTabChange,
  initialScroll,
  onClose,
  onOpenPlayer,
}: {
  gamePk: number;
  /**
   * The season's players, which the header search already holds — the same list
   * the team page's Roster tab is a filter over.
   *
   * It is here for one job: **deciding which names on this page are doors.**
   * `App::detailsPlayer` renders a player's page only for a key one of its two
   * sources can resolve, so a name this list has never heard of would open a
   * page that never appears. The rule the fixture row's `StarterName` already
   * keeps, one table wider.
   */
  players: SeasonPlayer[];
  /** Which tab to open on. Absent means Overview; a **step back** to this page
   *  names the one the reader left. Read once, at mount. */
  initialTab?: GamePageTab;
  /** …and which tab is showing now, told upwards so that step can be recorded.
   *  Not the same thing as `initialTab`, and it deliberately does not go into
   *  `App`'s render state — see `TeamDetails`, which makes the same split for
   *  the same reason. */
  onTabChange?: (tab: GamePageTab) => void;
  /** Where this page was left, for a reader stepping back onto it — see
   *  `DetailsShell`. */
  initialScroll?: number;
  onClose: () => void;
  onOpenPlayer: (key: string) => void;
}) {
  const [tab, setTab] = useState<GameTab>(initialTab ?? 'overview');
  useEffect(() => {
    onTabChange?.(tab);
  }, [tab, onTabChange]);
  /**
   * **A half-inning the reader pressed on the line score**, drawn as a popup
   * over whatever tab they were on.
   *
   * The line score is the one picture of a game that is already *by inning*,
   * and a reader looking at the `5` in the Nationals' fifth is asking what
   * happened in it. A **dialog** is what that press deserves rather than a jump
   * to the Plays tab: it is a detail about one thing, the page behind it does
   * not move, and Escape or the backdrop puts it back — which is the argument
   * `PlateAppearanceCard` already makes for the box it opens, one play smaller.
   *
   * It sent the reader to the Plays tab for a commit, and the machinery that
   * took is what condemned it: the tab had to open its paging out to that
   * inning, then scroll to it, then **hold** the target while every clip above
   * it resolved and pushed it down the page. Three mechanisms to land a reader
   * somewhere they did not ask to be, against one box holding the six plays
   * they did ask for.
   */
  const [halfOpen, setHalfOpen] = useState<HalfRef | null>(null);

  /**
   * **Which read is on screen**, so a stale answer cannot land on a fresh one.
   *
   * Bumped on every request rather than compared against a key, because the
   * poll below asks for the *same* game over and over — a key would be equal to
   * itself and every answer would look current. Only the newest may write state
   * or raise the banner.
   */
  const gameKey = `game:${gamePk}`;
  /**
   * **`staleMs: 0` — every mount still issues its read**, which is what the
   * paragraph above the old module caches promised and what a page about a game
   * being played has to do. What the store changes is only what is on screen
   * while that read is in flight: the answer it already has, drawn at full
   * height in the first commit, rather than an empty box. That is rule 1 and it
   * is also what `initialScroll` needs to land where the reader left.
   *
   * **`keepPrevious: false`**, because the key changes only when the *game*
   * does, and one game's line score under another's heading is not a stale
   * answer to the question on screen — it is an answer to a different one.
   */
  const gameRes = useResource(gameKey, () => api.game(gamePk), {
    keepPrevious: false,
    staleMs: 0,
  });
  const game = gameRes.value ?? null;
  /* **This page 502s honestly** and the banner is drawn only where `game` is
     null, so a failed *poll* costs nothing: the last answer stands, which is the
     loading rule in its own words. */
  const error = gameRes.error?.message ?? null;
  const loading = gameRes.loading;

  /* The poll, and only for a game that is actually being played — a final game
     is a fact and a scheduled one changes once, when it starts, which is a page
     the reader will have left. Read off the state rather than the report, so
     the twenty seconds are not restarted by the answer that arrives. */
  const live = game?.status.state === 'live';
  useResourcePoll(gameKey, live ? LIVE_POLL_MS : null);

  const wait = useDelayedFlag(loading && game === null);

  /**
   * **The Plays tab's own read**, lazy on first open of it.
   *
   * A route of its own rather than a field on the report, and the reason is
   * measured: it is ~150KB (21.5KB gzipped) against the report's 11.5, and it
   * costs a `getDay`. A reader who came for the box score never pays for it —
   * the rule every read on the player page follows.
   *
   * It re-reads on the same twenty-second clock while the game is being played,
   * and **quietly**: the stream that is on screen stands while the next answer
   * is in flight, and a failed re-read leaves it there.
   */
  /**
   * **Two triggers, one key.** The Plays tab wants the stream, and so does a
   * half-inning opened off the line score — which can happen on the Overview,
   * before that tab has ever been touched. Whichever comes first opens the key
   * and the other finds the answer already there.
   *
   * `playsAsked` stood here — a ref marking *this mount has asked*, set before
   * the read rather than after it, and carrying a comment about being a
   * once-per-mount gate rather than a test of what has landed. A key needs
   * neither reading: the store's dedupe is what stops two triggers making two
   * requests, and `staleMs` is what decides whether a re-entry re-asks.
   *
   * **`SEASON_STALE_MS` rather than the store's default**, and the reason is
   * this read's size: ~150KB (21.5KB gzipped) against the report's 11.5, and it
   * costs a `getDay`. Crossing to the Box Score and back must not re-buy it —
   * which the old per-mount ref gave for free and a twenty-second staleness
   * would have taken away. A game being played re-reads on the poll below,
   * which is the case that actually moves.
   */
  const playsKey = tab === 'plays' || halfOpen !== null ? `gamePlays:${gamePk}` : null;
  const playsRes = useResource(playsKey, () => api.gamePlays(gamePk), {
    keepPrevious: false,
    staleMs: SEASON_STALE_MS,
  });
  const plays = playsRes.value ?? null;
  const playsError = playsRes.error?.message ?? null;
  const playsLoading = playsRes.loading;
  /* It re-reads on the same twenty-second clock while the game is being played,
     and **quietly**: the stream on screen stands while the next answer is in
     flight, and a failed re-read leaves it there. The store counts a poll apart
     from a read somebody started, so neither the wait nor the banner moves. */
  useResourcePoll(playsKey, live ? LIVE_POLL_MS : null);

  /**
   * The keys this page may open, as a set.
   *
   * A set of `${kind}-${id}` rather than a map of ids, because that is exactly
   * what `detailsPlayer` resolves against and because a two-way player is two
   * keys: his batting line here should open his batting page and his pitching
   * line his pitching one, which a lookup keyed on the id alone could not say.
   */
  const openable = useMemo(() => {
    const keys = new Set<string>();
    for (const p of players) keys.add(`${p.kind}-${p.id}`);
    return keys;
  }, [players]);

  const teamDoor = useTeamDoor();

  return (
    <DetailsShell
      tab={tab}
      resetKey={gamePk}
      onClose={onClose}
      tabsLabel="Game sections"
      initialScroll={initialScroll}
      head={<GameHead game={game} onOpenTeam={teamDoor} />}
      tabs={
        <>
          <DetailsTabButton id="overview" tab={tab} onPick={setTab}>
            Overview
          </DetailsTabButton>
          <DetailsTabButton id="box" tab={tab} onPick={setTab}>
            Box Score
          </DetailsTabButton>
          <DetailsTabButton id="plays" tab={tab} onPick={setTab}>
            Plays
          </DetailsTabButton>
        </>
      }
    >
      {game ? (
        <>
          {tab === 'overview' && (
            <GameOverview
              game={game}
              openable={openable}
              onOpenPlayer={onOpenPlayer}
              onOpenHalf={(inning, half) => setHalfOpen({ inning, half })}
            />
          )}
          {tab === 'box' && <GameBox game={game} openable={openable} onOpenPlayer={onOpenPlayer} />}
          {tab === 'plays' && (
            <GamePlays
              game={game}
              reports={plays}
              loading={playsLoading}
              error={playsError}
              onOpenPlayer={onOpenPlayer}
            />
          )}
        </>
      ) : error ? (
        /* **This page 502s honestly**, which is the route's own bargain and the
           `/api/schedule` exception: everywhere else in this app a dead upstream
           costs its own column because there is a table around it still
           standing. Here the answer *is* the page. */
        <div className="details-overview">
          <div className="details-status details-error">Couldn&rsquo;t read the game: {error}</div>
        </div>
      ) : wait ? (
        <LoadingBlock>Reading the game</LoadingBlock>
      ) : null}
      {game && halfOpen && (
        <HalfInningDialog
          game={game}
          half={halfOpen}
          reports={plays}
          loading={playsLoading}
          error={playsError}
          onOpenPlayer={onOpenPlayer}
          onClose={() => setHalfOpen(null)}
        />
      )}
    </DetailsShell>
  );
}

/** One half-inning, as the line score names it and the play stream draws it. */
interface HalfRef {
  inning: number;
  /** MLB's own `Top` / `Bot`, which is what a `PlateAppearance` carries — so
   *  the two ends of this are compared with `isBottom` rather than by string
   *  equality, the line score speaking of `home` and `away`. */
  half: string;
}

/** Whether a half is the bottom of the inning. MLB writes it `Bot` on a
 *  `PlateAppearance`, `bottom` on a play and `Bottom` on a line score's
 *  `inningState`, so the test is the prefix rather than any one of them. */
const isBottom = (half: string) => half.toLowerCase().startsWith('bot');

/** The three, written in strip order for the reason every tab union in this app
 *  is: a tab is a key and never an index, so the order is the order the buttons
 *  are written in and nothing stores a position.
 *
 *  **Not in the URL**, which is where both other details pages keep their tab:
 *  it is which reading of one game is on screen, where `game=` is which game.
 *  The union itself lives in `hooks.ts` — see `GamePageTab`, which `App` names
 *  when it puts a reader back where they were. */
type GameTab = GamePageTab;

/* ────────────────────────────────────────────────────────────────────────────
 * The head
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * **Two clubs and the score between them**, which is the one thing that names
 * this subject — a game has no portrait and no single club to take the crest's
 * place.
 *
 * The crests are `TeamPhoto`, the same round mark the research board's team
 * rows and the summary table's club cell draw, at a size this head sets through
 * `--row-photo` rather than by a second circle of its own. Each is a **door to
 * that club's page**, which is the same press it is everywhere else it appears
 * — and it is the reason the head is worth its space at all: a reader who
 * opened a game from an opponent cell is one press from either club.
 *
 * **The box is held while the read is out.** The head is pinned chrome and
 * publishes `--details-chrome-h` for everything under it, so a head that grew
 * when the answer landed would push the whole page down under the reader. The
 * empty state is the same three rows with nothing written in them.
 */
function GameHead({
  game,
  onOpenTeam,
}: {
  game: GameReport | null;
  onOpenTeam: ((teamId: number) => void) | null;
}) {
  const kind = game?.status.state ?? 'scheduled';
  const detail = game ? statusDetail(game) : '';
  return (
    <div className="game-head">
      <div className="game-head-line">
        <GameHeadSide side={game?.away ?? null} score={game?.away.runs ?? null} onOpenTeam={onOpenTeam} />
        {/* `@` before first pitch and a dash once there are two numbers — the
            same two shapes the summary table's opponent cell draws, and for the
            same reason: a matchup is a fixture until it is a result. */}
        <span className="game-head-vs">{game && game.away.runs !== null ? '–' : '@'}</span>
        <GameHeadSide side={game?.home ?? null} score={game?.home.runs ?? null} onOpenTeam={onOpenTeam} home />
      </div>
      <div className="game-head-sub">
        {/* **The app's own status chip**, folded onto rather than restyled:
            `.game-status` and its four state modifiers are what the summary
            table's cell, the schedule grid and the feed's bar already draw, and
            a page that gave a live game its own green would be a second
            definition of what live looks like. A non-breaking space holds the
            chip's box while the read is out — see the head's own note. */}
        <span className={`game-status ${kind}`}>{detail || '\u00a0'}</span>
        {game?.date && <span className="game-head-when">{prettyGameDate(game.date)}</span>}
        {game?.venueName && <span className="game-head-venue">{game.venueName}</span>}
      </div>
    </div>
  );
}

/**
 * One club in the head: its crest, its abbreviation and its runs.
 *
 * **Away on the left**, which is the order every line score in this app is
 * written in (`ScoreSides`, and `scoreLine` before it) and the order the game
 * is played in.
 */
function GameHeadSide({
  side,
  score,
  onOpenTeam,
  home,
}: {
  side: GameTeamLine | null;
  score: number | null;
  onOpenTeam: ((teamId: number) => void) | null;
  home?: boolean;
}) {
  return (
    <span className={`game-head-side${home ? ' game-head-side-home' : ''}`}>
      <TeamPhoto
        teamId={side?.teamId ?? null}
        team={side?.abbr ?? ''}
        onOpen={side && onOpenTeam ? onOpenTeam : undefined}
      />
      <span className="game-head-abbr" title={side?.name}>
        {side?.abbr ?? ''}
      </span>
      <span className="game-head-runs">{score ?? ''}</span>
    </span>
  );
}

/** What the head's status chip says — the inning while it is on, MLB's own
 *  label once it is over or called off, and first pitch before it starts. The
 *  same three answers `gameStatusView` gives a cell, reached from a
 *  `GameReport` rather than a `PlayerGame`. */
function statusDetail(game: GameReport): string {
  const s = game.status;
  if (s.state === 'postponed') return s.detailedState || 'Postponed';
  if (s.state === 'scheduled') return formatStartTime(s.startTime) ?? (s.detailedState || 'Scheduled');
  if (s.state === 'live') return inningLabel(s.inningState, s.currentInning) ?? (s.detailedState || 'Live');
  return s.detailedState || 'Final';
}

/* ────────────────────────────────────────────────────────────────────────────
 * Names
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A man's name, as a door to his page where this app can open one.
 *
 * **Plain text where it cannot**, which is the rule the fixture row's
 * `StarterName` states and `TeamPhoto` keeps for a club with no page: *a row
 * that looks pressable and is not is worse than one that plainly is not*. A
 * September call-up who is not on the season's player list is the case — the
 * page would open on nothing, and a button that does nothing is a fault the
 * reader has to discover by pressing it.
 */
function PlayerName({
  id,
  name,
  kind,
  openable,
  onOpenPlayer,
  className,
}: {
  id: number;
  name: string;
  kind: 'batter' | 'pitcher';
  openable: Set<string>;
  onOpenPlayer: (key: string) => void;
  className?: string;
}) {
  const key = `${kind}-${id}`;
  if (!openable.has(key)) return <span className={className}>{name}</span>;
  return (
    <button
      type="button"
      className={`game-name${className ? ` ${className}` : ''}`}
      onClick={() => onOpenPlayer(key)}
      title={`${name} — his page`}
    >
      {name}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Overview
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * **The answer, in three blocks**: the line score, who won it, and the runs as
 * they were scored.
 *
 * It is deliberately the short tab — the same call the team page's Overview
 * makes. A game's page is most often opened from an opponent cell that already
 * said `TOR 3–2 NYY`, and what that reader wanted next is *how*, which is these
 * three blocks and not the four hundred rows behind them.
 */
function GameOverview({
  game,
  openable,
  onOpenPlayer,
  onOpenHalf,
}: {
  game: GameReport;
  openable: Set<string>;
  onOpenPlayer: (key: string) => void;
  /** Open the Plays tab on one half-inning — the line score's own door. */
  onOpenHalf: (inning: number, half: string) => void;
}) {
  const played = hasStarted(game);
  return (
    <div className="details-overview">
      {/* **The Overview is three different pages, and which one is the game's
          own state.**

          A game that has been played is the line score, the decisions and the
          runs as they were scored. One that has not is *who is pitching it* —
          drawing the other three empty gave two rows of blank cells, a heading
          with nothing under it and the sentence "nothing has been played yet"
          three times over, which is a page saying the same non-thing at length.
          And a **postponement** is neither: it is one sentence, because there
          is nothing else true about a game that did not happen. */}
      {played ? <LineScore game={game} onOpenHalf={onOpenHalf} /> : null}
      {game.status.state === 'scheduled' && (
        <Probables game={game} openable={openable} onOpenPlayer={onOpenPlayer} />
      )}
      {game.status.state === 'postponed' && (
        <p className="ovw-none ovw-column">
          {game.status.detailedState || 'This game was not played.'}
        </p>
      )}
      {game.decisions.length > 0 && (
        <section className="ovw-block ovw-column">
          <div className="ovw-head-row">
            <h2 className="ovw-head">Decisions</h2>
          </div>
          <ul className="game-decisions">
            {game.decisions.map((d) => (
              <li key={d.role} className="game-decision">
                <span className={`game-decision-role game-decision-${d.role}`} title={DECISION_TITLE[d.role]}>
                  {d.role}
                </span>
                <PlayerName
                  id={d.id}
                  name={d.name}
                  kind="pitcher"
                  openable={openable}
                  onOpenPlayer={onOpenPlayer}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      <GameInfo game={game} />
    </div>
  );
}

/**
 * **Who each club has announced**, which is the whole of what is known about a
 * game nobody has played — and is what the Overview draws where the line score
 * goes once there is one.
 *
 * Away over home, the order every line score in this app is written in. **A
 * club that has named nobody draws nothing rather than `TBD`**, the rule the
 * fixture row states: clubs name a starter about three days out, so past the
 * front of the window the absence is the schedule rather than a fact about the
 * game.
 */
function Probables({
  game,
  openable,
  onOpenPlayer,
}: {
  game: GameReport;
  openable: Set<string>;
  onOpenPlayer: (key: string) => void;
}) {
  const sides = [game.away, game.home].filter((s) => s.probablePitcherId !== null);
  if (sides.length === 0) return null;
  return (
    <section className="ovw-block ovw-column">
      <div className="ovw-head-row">
        <h2 className="ovw-head">Probable Pitchers</h2>
      </div>
      <ol className="start-list">
        {sides.map((side) => (
          <li className="start-row" key={side.teamId}>
            <div className="start-line">
              <span className="ovw-next-when">{side.abbr}</span>
              <PlayerName
                id={side.probablePitcherId as number}
                name={side.probablePitcherName ?? ''}
                kind="pitcher"
                openable={openable}
                onOpenPlayer={onOpenPlayer}
                className="team-roster-name"
              />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** **Whether there is a game to read**, which is the one test three blocks on
 *  this page make and so is written once. A postponement is a `Final` on MLB's
 *  wire, which is why this is a test for the two states that *did* happen
 *  rather than a test against `scheduled`. */
const hasStarted = (game: GameReport): boolean =>
  game.status.state === 'live' || game.status.state === 'final';

const DECISION_TITLE: Record<'W' | 'L' | 'S', string> = {
  W: 'the winning pitcher',
  L: 'the losing pitcher',
  S: 'the save',
};

/**
 * **The line score** — runs by inning with R, H and E on the end, which is the
 * one picture of a game that has been drawn the same way for a century and is
 * the reason this tab leads.
 *
 * **`x` is a half nobody played**, and it is drawn only on a game that is
 * *over*: the wire sends the same absent number for the bottom of the ninth
 * with the home club ahead and for a half being played that has not scored yet
 * (measured, on both — see `server/src/game.ts::buildInnings`). Nothing in the
 * payload separates them and the game's state does, so the judgment is made
 * here, where the state is.
 *
 * The columns run out to `scheduledInnings` on a game that has not reached it,
 * so a game in the fourth is drawn against the nine it is heading for rather
 * than four columns wide and growing an inning under the reader every twenty
 * minutes. Extra innings simply take more.
 */
function LineScore({
  game,
  onOpenHalf,
}: {
  game: GameReport;
  onOpenHalf: (inning: number, half: string) => void;
}) {
  const columns = Math.max(game.innings.length, game.scheduledInnings);
  const nums = Array.from({ length: columns }, (_, i) => i + 1);
  const over = game.status.state === 'final';
  const row = (which: 'away' | 'home') => {
    const side = game[which];
    const half = which === 'home' ? 'Bot' : 'Top';
    return (
      <tr>
        <th scope="row" className="game-ls-team">
          {side.abbr}
        </th>
        {nums.map((n) => {
          const inning = game.innings[n - 1];
          const runs = inning ? inning[which] : null;
          /**
           * **A half nobody played is not a door, and is the only cell that is
           * not.** Two absences arrive as the same null (see the server's
           * `buildInnings`): the bottom of the ninth with the home club ahead,
           * which the game being over turns into the `x` below, and a half
           * still being thrown, which has plays to read. So the test is the
           * `x` itself rather than the null — everything else that MLB has an
           * inning for was batted in.
           */
          const dead = !inning || (over && runs === null);
          const label = runs !== null ? runs : over && inning ? 'x' : '';
          return (
            <td key={n} className="game-ls-cell">
              {dead ? (
                label
              ) : (
                /* The cell **is** the press, which is what makes a two-character
                   target big enough: `.game-ls-door` fills it rather than
                   wrapping the digits. */
                <button
                  type="button"
                  className="game-ls-door"
                  onClick={() => onOpenHalf(n, half)}
                  title={`${isBottom(half) ? 'Bottom' : 'Top'} of the ${ordinalInning(n)} — the plays`}
                >
                  {label}
                </button>
              )}
            </td>
          );
        })}
        <td className="game-ls-cell game-ls-total">{side.runs ?? ''}</td>
        <td className="game-ls-cell game-ls-total">{side.hits ?? ''}</td>
        <td className="game-ls-cell game-ls-total">{side.errors ?? ''}</td>
      </tr>
    );
  };
  return (
    <section className="ovw-block ovw-column">
      <div className="ovw-head-row">
        <h2 className="ovw-head">Line Score</h2>
      </div>
      <div className="game-ls-scroll">
        <table className="game-ls-table">
          <thead>
            <tr>
              <th scope="col" className="game-ls-team" />
              {nums.map((n) => (
                <th key={n} scope="col" className="game-ls-cell">
                  {n}
                </th>
              ))}
              <th scope="col" className="game-ls-cell game-ls-total">
                R
              </th>
              <th scope="col" className="game-ls-cell game-ls-total">
                H
              </th>
              <th scope="col" className="game-ls-cell game-ls-total">
                E
              </th>
            </tr>
          </thead>
          <tbody>
            {row('away')}
            {row('home')}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * **The game's own footnotes**, as MLB writes them — pitches-strikes per
 * pitcher, the umpires, first pitch, the attendance, the weather.
 *
 * Its labels and values are printed **unedited**, which is deliberate: they are
 * prose off the wire rather than fields, MLB's list differs game to game (a
 * pitch-timer violation appears only where there was one), and a curated subset
 * would go quietly stale the first time it added a kind.
 */
function GameInfo({ game }: { game: GameReport }) {
  /* **The ballpark is not here**, and it is the one fact of MLB's that this
     block drops on purpose: the head names it already, three lines up and on
     every tab, and one fact twice in one page reads as two facts that happen to
     agree. */
  const facts: { label: string; value: string }[] = [];
  if (game.attendance !== null) {
    facts.push({ label: 'Attendance', value: game.attendance.toLocaleString() });
  }
  if (game.durationMinutes !== null) {
    const h = Math.floor(game.durationMinutes / 60);
    const m = game.durationMinutes % 60;
    facts.push({ label: 'Time', value: `${h}:${String(m).padStart(2, '0')}` });
  }
  if (game.weather) facts.push({ label: 'Weather', value: game.weather });
  /* MLB's own list, minus what is already above it: the box score repeats the
     venue, the attendance, the time and the weather in its own words, and one
     fact twice in one block reads as two facts that happen to agree. */
  const mine = new Set(['Venue', 'Att', 'T', 'Weather', 'Wind', 'First pitch']);
  const notes = game.notes.filter((n) => !mine.has(n.label));
  if (facts.length === 0 && notes.length === 0) return null;
  return (
    <section className="ovw-block ovw-column">
      <div className="ovw-head-row">
        <h2 className="ovw-head">Game Info</h2>
      </div>
      <dl className="game-info">
        {facts.concat(notes).map((f) => (
          <div className="game-info-row" key={f.label}>
            <dt className="game-info-label">{f.label}</dt>
            <dd className="game-info-value">{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Box Score
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * **One club at a time, and the switch above the table is which.**
 *
 * It drew both stacked at first, on the argument that a game is two subjects
 * and the reader is comparing them — a box score you cannot read across being
 * most of what a box score is not for. That argument is right about a *line*
 * score, which is two rows and is on the Overview; it is wrong about this,
 * which is four tables and forty names a side. Nothing on the away club's
 * batting line is read against a number on the home club's, and stacking them
 * put ninety rows between a reader and the second half of what they opened.
 *
 * So the two clubs are two tabs, in `.view-switch`'s own shape — the same
 * control the team page pins over its own two halves and the Park tab keeps
 * inside itself, which is `role="tablist"` and two `role="tab"` buttons. They
 * are named by **abbreviation**, which is what every table in the app calls a
 * club and what the head three lines up has just said.
 *
 * **Away leads**, the order every line score in this app is written in and the
 * order the game is played in.
 *
 * It is not on the page's own strip, where it would read as `Overview · CHC ·
 * WSH · Plays`: that strip names the *kind* of reading a tab holds, and two
 * clubs are two subjects rather than two readings. The same division the team
 * page makes between its strip and its side switch.
 */
function GameBox({
  game,
  openable,
  onOpenPlayer,
}: {
  game: GameReport;
  openable: Set<string>;
  onOpenPlayer: (key: string) => void;
}) {
  const [side, setSide] = useState<'away' | 'home'>('away');
  const shown = game[side];
  const posted = game.away.batters.length > 0 || game.home.batters.length > 0;
  return (
    <div className="details-overview">
      <div className="game-box-tools">
        <div className="view-switch" role="tablist" aria-label="Which club">
          {(['away', 'home'] as const).map((which) => (
            <button
              key={which}
              type="button"
              role="tab"
              className={`view-tab${side === which ? ' active' : ''}`}
              aria-selected={side === which}
              onClick={() => setSide(which)}
              title={game[which].name}
            >
              {game[which].abbr}
            </button>
          ))}
        </div>
      </div>
      {/* The lineup is the cause, and it is named rather than the game being
          called empty: clubs post one an hour or two out, so before that this
          page has both rosters and no box score at all. */}
      {!posted && (
        <p className="ovw-none">
          {game.status.state === 'scheduled'
            ? 'Neither club has posted a lineup yet.'
            : 'No box score for this game.'}
        </p>
      )}
      {posted ? (
        <BoxSide side={shown} openable={openable} onOpenPlayer={onOpenPlayer} />
      ) : (
        <BoxRoster
          side={shown}
          started={hasStarted(game)}
          openable={openable}
          onOpenPlayer={onOpenPlayer}
        />
      )}
    </div>
  );
}

function BoxSide({
  side,
  openable,
  onOpenPlayer,
}: {
  side: GameTeamLine;
  openable: Set<string>;
  onOpenPlayer: (key: string) => void;
}) {
  return (
    <>
      <section className="ovw-block">
        <div className="ovw-head-row">
          <h2 className="ovw-head">{side.name}</h2>
          {side.runs !== null && (
            <span className="start-note" title={`${side.runs} runs, ${side.hits ?? 0} hits`}>
              {side.runs} R · {side.hits ?? 0} H
            </span>
          )}
        </div>
        <div className="game-box-scroll">
          <table className="game-box-table">
            <thead>
              <tr>
                <th scope="col" className="game-box-name">
                  Batting
                </th>
                <th scope="col">AB</th>
                <th scope="col">R</th>
                <th scope="col">H</th>
                <th scope="col">RBI</th>
                <th scope="col">BB</th>
                <th scope="col">K</th>
                <th scope="col" title="Men he left on base">
                  LOB
                </th>
                <th scope="col" title="His batting average for the season">
                  AVG
                </th>
                <th scope="col" title="His OPS for the season">
                  OPS
                </th>
              </tr>
            </thead>
            <tbody>
              {side.batters.map((b) => (
                <BatterRow key={b.id} line={b} openable={openable} onOpenPlayer={onOpenPlayer} />
              ))}
            </tbody>
            {side.batting && (
              <tfoot>
                <tr>
                  <th scope="row" className="game-box-name">
                    Totals
                  </th>
                  <td>{side.batting.ab}</td>
                  <td>{side.batting.r}</td>
                  <td>{side.batting.h}</td>
                  <td>{side.batting.rbi}</td>
                  <td>{side.batting.bb}</td>
                  <td>{side.batting.k}</td>
                  <td>{side.batting.lob}</td>
                  <td>{side.batting.avg ?? '—'}</td>
                  <td>{side.batting.ops ?? '—'}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
      <section className="ovw-block">
        <div className="game-box-scroll">
          <table className="game-box-table">
            <thead>
              <tr>
                <th scope="col" className="game-box-name">
                  Pitching
                </th>
                <th scope="col">IP</th>
                <th scope="col">H</th>
                <th scope="col">R</th>
                <th scope="col" title="Earned runs">
                  ER
                </th>
                <th scope="col">BB</th>
                <th scope="col">K</th>
                <th scope="col" title="Home runs allowed">
                  HR
                </th>
                <th scope="col" title="Pitches, and how many were strikes">
                  P–S
                </th>
                <th scope="col" title="His ERA for the season">
                  ERA
                </th>
              </tr>
            </thead>
            <tbody>
              {side.pitchers.map((p) => (
                <PitcherRow key={p.id} line={p} openable={openable} onOpenPlayer={onOpenPlayer} />
              ))}
            </tbody>
            {side.pitching && (
              <tfoot>
                <tr>
                  <th scope="row" className="game-box-name">
                    Totals
                  </th>
                  <td>{side.pitching.ip}</td>
                  <td>{side.pitching.h}</td>
                  <td>{side.pitching.r}</td>
                  <td>{side.pitching.er}</td>
                  <td>{side.pitching.bb}</td>
                  <td>{side.pitching.k}</td>
                  <td>{side.pitching.hr}</td>
                  <td>
                    {side.pitching.pitches}–{side.pitching.strikes}
                  </td>
                  <td>—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
      <BoxRoster side={side} started openable={openable} onOpenPlayer={onOpenPlayer} />
    </>
  );
}

/**
 * One batting line.
 *
 * **A substitute is indented under the man he came in for**, off the slot MLB
 * writes into `battingOrder` (`801` is the second man in the eighth) — which is
 * how a box score has always read a pinch hitter and is the reason the server
 * sorts by that number rather than by the order men came up. The slot's number
 * is drawn once, on the man who started it: repeating it down a slot would make
 * a substitution look like a tenth hitter.
 */
function BatterRow({
  line,
  openable,
  onOpenPlayer,
}: {
  line: GameBatterLine;
  openable: Set<string>;
  onOpenPlayer: (key: string) => void;
}) {
  return (
    <tr className={line.sub > 0 ? 'game-box-sub' : undefined}>
      <th scope="row" className="game-box-name">
        <span className="game-box-slot">{line.sub === 0 && line.order !== null ? line.order : ''}</span>
        <PlayerName
          id={line.id}
          name={line.name}
          kind="batter"
          openable={openable}
          onOpenPlayer={onOpenPlayer}
        />
        {line.pos && <span className="game-box-pos">{line.pos}</span>}
      </th>
      <td>{line.ab}</td>
      <td>{line.r}</td>
      <td>{line.h}</td>
      <td>{line.rbi}</td>
      <td>{line.bb}</td>
      <td>{line.k}</td>
      <td>{line.lob}</td>
      <td>{line.avg ?? '—'}</td>
      <td>{line.ops ?? '—'}</td>
    </tr>
  );
}

/**
 * One pitching line.
 *
 * **The decision rides on his name as MLB writes it** — `(W, 10-5)`, the credit
 * and the record it left him with as one string. Re-deriving it from
 * `decisions` would lose the record half, which is the part a reader who is
 * looking at the line wants.
 */
function PitcherRow({
  line,
  openable,
  onOpenPlayer,
}: {
  line: GamePitcherLine;
  openable: Set<string>;
  onOpenPlayer: (key: string) => void;
}) {
  return (
    <tr>
      <th scope="row" className="game-box-name">
        <span className="game-box-slot" />
        <PlayerName
          id={line.id}
          name={line.name}
          kind="pitcher"
          openable={openable}
          onOpenPlayer={onOpenPlayer}
        />
        {line.decision && (
          <span className={`game-box-decision game-box-decision-${decisionTone(line.decision)}`}>
            {line.decision}
          </span>
        )}
      </th>
      <td>{line.ip}</td>
      <td>{line.h}</td>
      <td>{line.r}</td>
      <td>{line.er}</td>
      <td>{line.bb}</td>
      <td>{line.k}</td>
      <td>{line.hr}</td>
      <td>
        {line.pitches}–{line.strikes}
      </td>
      <td>{line.era ?? '—'}</td>
    </tr>
  );
}

/**
 * **Which of the three tones a decision takes**, off the letter MLB opens the
 * string with.
 *
 * It was one color for all of them for a commit, and a loss came out in the
 * app's live green — which reads as a good thing, on the one line of the table
 * where the reader is being told the pitcher lost the game. Green for a win and
 * red for a loss is the game log's own vocabulary (`.glog-res-w` /
 * `.glog-res-l`) and the two surfaces must not disagree about what a `W` looks
 * like.
 *
 * A **save** and a **hold** take neither: they are credits rather than results,
 * and a third color would say they were a third outcome.
 */
function decisionTone(decision: string): 'w' | 'l' | 'none' {
  const letter = decision.replace(/^\(/, '')[0];
  return letter === 'W' ? 'w' : letter === 'L' ? 'l' : 'none';
}

/**
 * **Who did not play** — the bench and the bullpen, which is the roster half of
 * this tab and the half a fantasy reader opens it for: whether the man they
 * were watching was rested or is simply not up yet.
 *
 * A plain list rather than a table, because there is nothing to put in a column
 * — a man who has not appeared has no line. His hand is on the end, pushed
 * there by the same rule the club's Roster tab states: a roster is exactly the
 * list a reader scans for the left-handers.
 */
function BoxRoster({
  side,
  started,
  openable,
  onOpenPlayer,
}: {
  side: GameTeamLine;
  /** Whether there is a game to be out of yet. **The heading is a different
   *  sentence before first pitch**: everybody on the club is "not in the game"
   *  then, which is true and says nothing — what the list is at that point is
   *  simply the roster, and one of them is about to be in the lineup. */
  started: boolean;
  openable: Set<string>;
  onOpenPlayer: (key: string) => void;
}) {
  if (side.bench.length === 0 && side.bullpen.length === 0) return null;
  return (
    <section className="ovw-block">
      <div className="ovw-head-row">
        <h2 className="ovw-head">
          {side.abbr} — {started ? 'Not in the Game' : 'Roster'}
        </h2>
      </div>
      {side.bench.length > 0 && (
        <RosterList label="Bench" men={side.bench} kind="batter" openable={openable} onOpenPlayer={onOpenPlayer} />
      )}
      {side.bullpen.length > 0 && (
        <RosterList label="Bullpen" men={side.bullpen} kind="pitcher" openable={openable} onOpenPlayer={onOpenPlayer} />
      )}
    </section>
  );
}

function RosterList({
  label,
  men,
  kind,
  openable,
  onOpenPlayer,
}: {
  label: string;
  men: GameRosterMan[];
  kind: 'batter' | 'pitcher';
  openable: Set<string>;
  onOpenPlayer: (key: string) => void;
}) {
  return (
    <div className="game-roster">
      <h3 className="game-roster-head">
        {label} <span className="start-note">{men.length}</span>
      </h3>
      <ol className="start-list">
        {men.map((m) => (
          <li className="start-row" key={m.id}>
            <div className="start-line team-roster-line">
              <PlayerName
                id={m.id}
                name={m.name}
                kind={kind}
                openable={openable}
                onOpenPlayer={onOpenPlayer}
                className="team-roster-name"
              />
              <span className="team-roster-pos">{m.pos ?? ''}</span>
              {/* The tables' own token — `LHB` / `RHP` / `SH` — so a man's hand
                  reads the same here as it does on the club's Roster tab. */}
              <span className="team-roster-hand">{handToken(m.hand, kind)}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function handToken(hand: string | null, kind: 'batter' | 'pitcher'): string {
  if (hand === null) return '';
  if (kind === 'pitcher') return hand === 'L' || hand === 'R' ? `${hand}HP` : '';
  if (hand === 'S') return 'SH';
  return hand === 'L' || hand === 'R' ? `${hand}HB` : '';
}

/* ────────────────────────────────────────────────────────────────────────────
 * Plays
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * **The game as it happened, drawn as the feed draws it.**
 *
 * It was a list of MLB's sentences with the pitcher under each — accurate,
 * short, and not what a reader of this app means by a play. A play here is a
 * **`PlateAppearanceCard`**: the pitch sequence in the zone, the exit velocity
 * and the distance, xBA and xwOBA, the win-expectancy swing, the video, and the
 * colored rail that says what the outcome was. So this tab draws the same
 * `FeedItem` the roster's stream and the player page's Overview draw, off the
 * same `playerDayEntries`, and the three readings of what happened cannot
 * disagree.
 *
 * **The base-running comes with it**, which the sentence list had no shape for:
 * a steal, a wild pitch, a run scored are items of their own in the feed and
 * are items of their own here, in play order under the at-bat they happened on.
 *
 * ## Grouped by half-inning, and read forwards
 *
 * The grouping is the whole of the reading: a stream without it is a hundred
 * cards, and with it a reader can find the fifth and read the four plays that
 * turned it. Each heading names the half **and the club that was batting**,
 * because "Top 5th" alone leaves the reader to remember which side is away.
 *
 * **Forwards**, where the feed reads newest-first — `byPlayOrder`, which is the
 * feed's own comparator negated and is exported for exactly this. A roster's
 * stream is *what has just happened*; a game is a narrative, and its own
 * comparator puts cause before effect within a play (the single, then the steal
 * it set up, then the run).
 *
 * ## What is not here
 *
 * **A pitcher's outing.** In the feed his stream item is the whole appearance,
 * which is a different reading of this game and one the Box Score tab already
 * holds; his base events are rows inside it rather than items (see
 * `LiveFeed.tsx::baseEntries`). So the server sends batter reports alone, and
 * every play in the game is on one of them.
 */
function GamePlays({
  game,
  reports,
  loading,
  error,
  onOpenPlayer,
}: {
  game: GameReport;
  /** The day pipeline's own reports, narrowed to this game — `null` until the
   *  tab's own read lands. */
  reports: PlayerReport[] | null;
  loading: boolean;
  error: string | null;
  onOpenPlayer: (key: string) => void;
}) {
  const [scoringOnly, setScoringOnly] = useState(false);
  /**
   * **How many innings of the whole game are drawn**, and the reason the tab
   * has a page at all.
   *
   * A game is seventy plays, each a card with its film under it, and drawn
   * whole that is a **35,747px** page — forty screens — with **65** clip
   * lookups fired the moment the tab opens (measured, gamePk 822696). The feed
   * has the same problem across a roster's day and the same answer: it opens on
   * `FEED_PAGE_SIZE` items and grows by a press.
   *
   * **The page here is an inning**, because that is what a game is read in —
   * about six to ten plays, which is the feed's own page size arrived at from
   * the other direction. One to start, and each press of `Show more` adds one
   * more.
   *
   * **Only on `All`.** The `Scoring` cut is a dozen plays over the whole game
   * and is the summary a reader switched to *because* it is short; paging it
   * would be a control answering a problem that filter had already solved.
   */
  const [shownInnings, setShownInnings] = useState(() => shownMemo.get(game.gamePk) ?? 1);
  useEffect(() => {
    shownMemo.set(game.gamePk, shownInnings);
  }, [game.gamePk, shownInnings]);
  /**
   * Back to the first inning when the **cut** changes, which is what makes the
   * two readings independent: a reader who has opened six innings of `All`,
   * looked at `Scoring` and come back has asked for the game again, not for the
   * six innings they had.
   *
   * **On the cut alone**, and `reports` is deliberately not a dependency. It
   * was, on the reasoning that a new game is a new page — but a new game
   * remounts this whole component (`GamePage` is keyed on `gamePk`), so the
   * only thing that dependency ever fired on was the tab's own read *landing*,
   * null → answer. That put it after the effect below and undid it: pressing
   * the fifth on the line score opened the Plays tab on the fifth and then, a
   * beat later, on the first. Measured — `innings drawn 2` where the fifth
   * needs ten.
   */
  const lastCut = useRef(scoringOnly);
  useEffect(() => {
    /**
     * **Not on the mount**, which is the one run of this effect that is not a
     * change of cut: a page being stepped back onto opens where it was left,
     * and a reset here would undo the seed above before the reader saw it.
     *
     * The test is **the value we already hold**, not a first-run flag. A flag
     * set on the way out of the effect is the trap `RULES.md` names and this
     * codebase has found four times: React StrictMode runs a mount's effects,
     * tears them down and runs them again, so the second pass saw the flag
     * already spent and reset the paging — measured, a page left eight
     * half-innings deep came back two, and the scroll offset restored onto it
     * clamped to 0.
     */
    if (lastCut.current === scoringOnly) return;
    lastCut.current = scoringOnly;
    setShownInnings(1);
  }, [scoringOnly]);
  const halves = useMemo(() => buildHalves(reports, scoringOnly), [reports, scoringOnly]);

  /** The innings the game actually has, which is what the button counts down —
   *  not `scheduledInnings`, since a game can go twelve and a rain-shortened
   *  one stops at seven. */
  const lastInning = halves.length > 0 ? halves[halves.length - 1].inning : 0;
  /* The `Scoring` cut is never paged, so `shown` is the whole game there. */
  const shown = scoringOnly ? halves : halves.filter((h) => h.inning <= shownInnings);
  const moreInnings = scoringOnly ? 0 : Math.max(0, lastInning - shownInnings);

  const wait = useDelayedFlag(loading && reports === null);

  if (!reports) {
    if (error) {
      return (
        <div className="details-overview">
          <div className="details-status details-error">Couldn&rsquo;t read the plays: {error}</div>
        </div>
      );
    }
    if (wait) return <LoadingBlock>Reading the plays</LoadingBlock>;
    return null;
  }
  if (reports.length === 0) {
    return (
      <div className="details-overview">
        <p className="ovw-none ovw-column">
          {game.status.state === 'scheduled'
            ? 'The game hasn’t started.'
            : game.status.state === 'postponed'
              ? 'This game was not played.'
              : 'No plays for this game.'}
        </p>
      </div>
    );
  }
  return (
    <div className="details-overview">
      <div className="game-plays-tools ovw-column">
        {/* **A filter and not a second list.** The Overview's Scoring Plays
            block is the summary; this is the same stream cut down, which is
            what lets a reader who has found the inning they want widen back out
            to it in place. */}
        <div className="view-switch" role="tablist" aria-label="Which plays">
          {([false, true] as const).map((only) => (
            <button
              key={String(only)}
              type="button"
              role="tab"
              className={`view-tab${scoringOnly === only ? ' active' : ''}`}
              aria-selected={scoringOnly === only}
              onClick={() => setScoringOnly(only)}
            >
              {only ? 'Scoring' : 'All'}
            </button>
          ))}
        </div>
      </div>
      {halves.length === 0 ? (
        /* The filter names itself and the control that set it — a message
           reading "nobody scored" would claim a fact about the game where this
           is a fact about the button above it. */
        <p className="ovw-none ovw-column">No scoring plays — press All for the whole game.</p>
      ) : (
        shown.map((h) => (
          <section className="ovw-block game-half ovw-column" key={h.key}>
            <div className="ovw-head-row">
              <h2 className="ovw-head">
                {isBottom(h.half) ? 'Bottom' : 'Top'} {ordinalInning(h.inning)}
                <span className="game-half-club">
                  {' · '}
                  {isBottom(h.half) ? game.home.abbr : game.away.abbr} batting
                </span>
              </h2>
            </div>
            <div className="feed-list game-play-feed">
              {h.entries.map((e) => (
                /* `sameGame` drops the matchup off every item: the page's head
                   carries it above every tab, and the same seven characters on
                   a hundred rows is the mark that marks nothing. The **film
                   stays** — it is what a feed item is, and what keeps seventy
                   of them off the page is the inning page above rather than
                   taking the clip away from the six that are on it. */
                <FeedItem key={entryKey(e)} entry={e} onOpenDetails={onOpenPlayer} sameGame />
              ))}
            </div>
          </section>
        ))
      )}
      {moreInnings > 0 && (
        /* **The feed's own control**, folded onto rather than restyled:
           `.feed-more` with the count of what is left inside it, which is the
           button a reader of this app has already met at the foot of the
           roster's stream. What it counts is innings rather than items, that
           being what this page's page is. */
        <button
          type="button"
          className="feed-more game-plays-more"
          onClick={() => setShownInnings((n) => n + 1)}
        >
          Show the {ordinalInning(shownInnings + 1)}
          <span className="feed-more-count">{moreInnings}</span>
        </button>
      )}
    </div>
  );
}

/** One half-inning of the stream: what to head it with, and what happened. */
interface HalfBlock {
  key: string;
  inning: number;
  half: string;
  entries: FeedEntry[];
}

/**
 * **Every play in the game, in the order it happened, grouped by half-inning.**
 *
 * `playerDayEntries` is called per man and the results merged, which is what
 * `LiveFeed` does across a roster — one function, so a play cannot read one way
 * here and another there. `liveEvents` are folded in beside `entries` because
 * on this page there is no Live section to pin them to: a steal taken behind
 * the batter at the plate belongs in the inning it happened in.
 *
 * A module function rather than a hook, because **two** surfaces build it: the
 * Plays tab and the dialog a line-score cell opens. One grouping, so the fifth
 * inning cannot read one way in the tab and another in the box.
 */
function buildHalves(reports: PlayerReport[] | null, scoringOnly: boolean): HalfBlock[] {
  if (!reports) return [];
  const all: FeedEntry[] = [];
  for (const report of reports) {
    const day = playerDayEntries(report);
    all.push(...day.entries, ...day.liveEvents);
  }
  all.sort(byPlayOrder);
  const out: HalfBlock[] = [];
  for (const e of all) {
    if (isBareRun(e)) continue;
    if (scoringOnly && !changedTheScore(e)) continue;
    const { inning, half } = entryInning(e);
    const key = `${inning}-${half}`;
    const last = out[out.length - 1];
    if (last && last.key === key) last.entries.push(e);
    else out.push({ key, inning, half, entries: [e] });
  }
  return out;
}

/**
 * **One half-inning, as a popup** — what a cell on the line score opens.
 *
 * A dialog rather than a jump into the Plays tab, which is what that press did
 * for a commit. The reasoning is `PlateAppearanceCard`'s, one play larger: this
 * is *a detail about one thing*, the page behind it does not move, and Escape
 * or the backdrop puts it back.
 *
 * The tab version is what condemns it. To land a reader on the fifth it had to
 * open the paging out to that inning, scroll to it, and then **hold** the
 * target while every clip in the four innings above resolved and pushed it down
 * the page — measured, the block finishing 5px below the fold before the
 * holding was added. Three mechanisms to put a reader somewhere they had not
 * asked to be, against one box holding the six plays they had.
 *
 * It draws the **same items** as the tab, off the same `buildHalves`, so a half
 * cannot read one way in the box and another in the stream. The `Scoring` cut
 * is deliberately not applied: a reader who pressed the fifth asked for the
 * fifth.
 */
function HalfInningDialog({
  game,
  half,
  reports,
  loading,
  error,
  onOpenPlayer,
  onClose,
}: {
  game: GameReport;
  half: HalfRef;
  reports: PlayerReport[] | null;
  loading: boolean;
  error: string | null;
  onOpenPlayer: (key: string) => void;
  onClose: () => void;
}) {
  const block = useMemo(
    () =>
      buildHalves(reports, false).find(
        (h) => h.inning === half.inning && isBottom(h.half) === isBottom(half.half),
      ) ?? null,
    [reports, half],
  );
  const wait = useDelayedFlag(loading && reports === null);
  return (
    <Modal
      title={`${isBottom(half.half) ? 'Bottom' : 'Top'} ${ordinalInning(half.inning)} · ${
        isBottom(half.half) ? game.home.abbr : game.away.abbr
      } batting`}
      titleId="game-half-dialog"
      onClose={onClose}
    >
      {block ? (
        <div className="feed-list game-play-feed">
          {block.entries.map((e) => (
            /* `sameGame` drops the matchup, which the page behind this box has
               said and the box's own title has narrowed. */
            <FeedItem key={entryKey(e)} entry={e} onOpenDetails={onOpenPlayer} sameGame />
          ))}
        </div>
      ) : error ? (
        <div className="details-status details-error">Couldn&rsquo;t read the plays: {error}</div>
      ) : reports === null ? (
        wait ? <LoadingBlock>Reading the plays</LoadingBlock> : null
      ) : (
        /* A half the line score has and the play stream has not: an older
           cached day, or a half still being thrown when the read went out. */
        <p className="ovw-none">No plays for this half-inning.</p>
      )}
    </Modal>
  );
}

/** Which half-inning a stream item happened in. Two shapes, one question — a
 *  plate appearance carries it directly and a base event carries it on the play
 *  it happened on, which is the same play. */
function entryInning(e: FeedEntry): { inning: number; half: string } {
  if (e.type === 'pa') return { inning: e.pa.inning, half: e.pa.half };
  if (e.type === 'base') return { inning: e.evs[0].inning, half: e.evs[0].half };
  // A pitcher's outing has no one inning, and the server sends no pitcher
  // reports — this is the exhaustiveness branch rather than a case.
  return { inning: 0, half: 'Top' };
}

/**
 * **A run that is nothing but a run**, which on this page is a play already
 * drawn.
 *
 * In the feed a runner crossing the plate is an item of its own and has to be:
 * the stream is a *roster's*, and the man who scored is very often on it while
 * the man who drove him in is not — so without it the run would go unreported.
 * Here both men are on the page by construction, and the at-bat above says the
 * same thing twice over: MLB's own description ends *"Jorbit Vivas scores"* and
 * the score on the item's head has already moved.
 *
 * **Only where the run is the whole of the item.** `groupBaseEvents` gathers
 * one play's events into one item, so a steal of home is a steal *and* a run
 * and a runner who comes in on a wild pitch is a wild pitch *and* a run — those
 * are plays no at-bat carries, and they keep both badges. What is dropped is
 * the item whose only badge is `RUN SCORED`.
 */
function isBareRun(e: FeedEntry): boolean {
  return e.type === 'base' && e.evs.every((ev) => ev.kind === 'run');
}

/** **Whether the play put a run on the board**, which is what the `Scoring`
 *  filter asks. An RBI on the plate appearance, or a runner crossing the plate
 *  on his own — the two ways a run is recorded, and the second is why this is
 *  not a test on `rbi` alone (a run scored on a wild pitch has no RBI). */
function changedTheScore(e: FeedEntry): boolean {
  if (e.type === 'pa') return e.pa.rbi > 0;
  if (e.type === 'base') return e.evs.some((ev) => ev.kind === 'run');
  return false;
}

/** `1st`, `2nd`, `3rd`, … — an inning is always read as an ordinal, and this is
 *  the only place on the page that needs one. */
function ordinalInning(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}
