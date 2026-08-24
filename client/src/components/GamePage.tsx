import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { formatStartTime, inningLabel, LIVE_POLL_MS, prettyGameDate } from '../lib';
import { useDelayedFlag, useTeamDoor } from '../hooks';
import { DetailsShell, DetailsTabButton } from './DetailsShell';
import { LoadingBlock } from './Loading';
import { TeamPhoto } from './PlayerIdentity';
import type {
  GameBatterLine,
  GamePitcherLine,
  GamePlay,
  GameReport,
  GameRosterMan,
  GameTeamLine,
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
export function GamePage({
  gamePk,
  players,
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
  onClose: () => void;
  onOpenPlayer: (key: string) => void;
}) {
  const [tab, setTab] = useState<GameTab>('overview');
  const [game, setGame] = useState<GameReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * **Which read is on screen**, so a stale answer cannot land on a fresh one.
   *
   * Bumped on every request rather than compared against a key, because the
   * poll below asks for the *same* game over and over — a key would be equal to
   * itself and every answer would look current. Only the newest may write state
   * or raise the banner.
   */
  const reqRef = useRef(0);
  useEffect(() => {
    let alive = true;
    const read = (quiet: boolean) => {
      const req = (reqRef.current += 1);
      if (!quiet) setLoading(true);
      api.game(gamePk).then(
        (g) => {
          if (!alive || reqRef.current !== req) return;
          setGame(g);
          setError(null);
          setLoading(false);
        },
        (e: Error) => {
          if (!alive || reqRef.current !== req) return;
          // **A failed re-read leaves the last answer standing.** The banner is
          // for a page with nothing on it; a poll that missed a beat is not
          // news, and blanking a box score the reader is in the middle of would
          // be the loading rule broken in its own words.
          if (!quiet) setError(e.message);
          setLoading(false);
        },
      );
    };
    read(false);
    return () => {
      alive = false;
    };
  }, [gamePk]);

  /* The poll, and only for a game that is actually being played — a final game
     is a fact and a scheduled one changes once, when it starts, which is a page
     the reader will have left. Keyed on the state rather than on the report, so
     the twenty seconds are not restarted by the answer that arrives. */
  const live = game?.status.state === 'live';
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      const req = (reqRef.current += 1);
      api.game(gamePk).then(
        (g) => {
          if (reqRef.current === req) setGame(g);
        },
        () => {},
      );
    }, LIVE_POLL_MS);
    return () => clearInterval(t);
  }, [live, gamePk]);

  const wait = useDelayedFlag(loading && game === null);

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
          {tab === 'overview' && <GameOverview game={game} openable={openable} onOpenPlayer={onOpenPlayer} />}
          {tab === 'box' && <GameBox game={game} openable={openable} onOpenPlayer={onOpenPlayer} />}
          {tab === 'plays' && <GamePlays game={game} openable={openable} onOpenPlayer={onOpenPlayer} />}
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
    </DetailsShell>
  );
}

/** The three, written in strip order for the reason every tab union in this app
 *  is: a tab is a key and never an index, so the order is the order the buttons
 *  are written in and nothing stores a position.
 *
 *  **Not in the URL**, which is where both other details pages keep their tab:
 *  it is which reading of one game is on screen, where `game=` is which game. */
type GameTab = 'overview' | 'box' | 'plays';

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
}: {
  game: GameReport;
  openable: Set<string>;
  onOpenPlayer: (key: string) => void;
}) {
  const scoring = game.plays.filter((p) => p.scoring);
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
      {played ? <LineScore game={game} /> : null}
      {game.status.state === 'scheduled' && (
        <Probables game={game} openable={openable} onOpenPlayer={onOpenPlayer} />
      )}
      {game.status.state === 'postponed' && (
        <p className="ovw-none">
          {game.status.detailedState || 'This game was not played.'}
        </p>
      )}
      {game.decisions.length > 0 && (
        <section className="ovw-block">
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
      {played && (
        <section className="ovw-block">
          <div className="ovw-head-row">
            <h2 className="ovw-head">Scoring Plays</h2>
            {scoring.length > 0 && <span className="start-note">{scoring.length}</span>}
          </div>
          {scoring.length > 0 ? (
            <ol className="game-play-list">
              {scoring.map((p) => (
                <PlayRow key={p.index} play={p} game={game} openable={openable} onOpenPlayer={onOpenPlayer} />
              ))}
            </ol>
          ) : (
            <p className="ovw-none">Nobody has scored.</p>
          )}
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
    <section className="ovw-block">
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
function LineScore({ game }: { game: GameReport }) {
  const columns = Math.max(game.innings.length, game.scheduledInnings);
  const nums = Array.from({ length: columns }, (_, i) => i + 1);
  const over = game.status.state === 'final';
  const cell = (runs: number | null, played: boolean) =>
    runs !== null ? runs : over && played ? 'x' : '';
  const row = (which: 'away' | 'home') => {
    const side = game[which];
    return (
      <tr>
        <th scope="row" className="game-ls-team">
          {side.abbr}
        </th>
        {nums.map((n) => {
          const inning = game.innings[n - 1];
          return (
            <td key={n} className="game-ls-cell">
              {inning ? cell(inning[which], true) : ''}
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
    <section className="ovw-block">
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
    <section className="ovw-block">
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
 * **Both clubs, away first**, each as four things: its batting lines, its
 * pitching lines, and the bench and bullpen who did not appear.
 *
 * Stacked rather than switched — see the file header. A box score read one club
 * at a time is a box score you cannot read across.
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
  if (game.away.batters.length === 0 && game.home.batters.length === 0) {
    return (
      <div className="details-overview">
        {/* The lineup is the cause, and it is named rather than the game being
            called empty: clubs post one an hour or two out, so before that this
            page has both rosters and no box score at all. */}
        <p className="ovw-none">
          {game.status.state === 'scheduled'
            ? 'Neither club has posted a lineup yet.'
            : 'No box score for this game.'}
        </p>
        <BoxRoster
          side={game.away}
          started={hasStarted(game)}
          openable={openable}
          onOpenPlayer={onOpenPlayer}
        />
        <BoxRoster
          side={game.home}
          started={hasStarted(game)}
          openable={openable}
          onOpenPlayer={onOpenPlayer}
        />
      </div>
    );
  }
  return (
    <div className="details-overview">
      <BoxSide side={game.away} openable={openable} onOpenPlayer={onOpenPlayer} />
      <BoxSide side={game.home} openable={openable} onOpenPlayer={onOpenPlayer} />
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
 * **The game as it happened**, grouped by half-inning.
 *
 * The grouping is the whole of the reading: a play stream without it is four
 * hundred sentences, and with it a reader can find the fifth and read the four
 * plays that turned it. Each heading names the half and the club that was
 * batting, because "Top 5th" alone leaves the reader to remember which side is
 * away.
 *
 * **`All` / `Scoring` is a filter and not a second list.** A scoring-plays
 * reading already exists on the Overview and is the summary; this is the same
 * stream cut down, which is what lets a reader who has found the inning they
 * want widen back out to it in place.
 */
function GamePlays({
  game,
  openable,
  onOpenPlayer,
}: {
  game: GameReport;
  openable: Set<string>;
  onOpenPlayer: (key: string) => void;
}) {
  const [scoringOnly, setScoringOnly] = useState(false);
  const halves = useMemo(() => {
    const out: { key: string; inning: number; half: 'top' | 'bottom'; plays: GamePlay[] }[] = [];
    for (const p of game.plays) {
      if (scoringOnly && !p.scoring) continue;
      const key = `${p.inning}-${p.half}`;
      const last = out[out.length - 1];
      if (last && last.key === key) last.plays.push(p);
      else out.push({ key, inning: p.inning, half: p.half, plays: [p] });
    }
    return out;
  }, [game.plays, scoringOnly]);

  if (game.plays.length === 0) {
    return (
      <div className="details-overview">
        <p className="ovw-none">
          {game.status.state === 'scheduled'
            ? 'The game hasn’t started.'
            : 'No plays for this game.'}
        </p>
      </div>
    );
  }
  return (
    <div className="details-overview">
      <div className="game-plays-tools">
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
        <p className="ovw-none">No scoring plays — press All for the whole game.</p>
      ) : (
        halves.map((h) => (
          <section className="ovw-block game-half" key={h.key}>
            <div className="ovw-head-row">
              <h2 className="ovw-head">
                {h.half === 'top' ? 'Top' : 'Bottom'} {ordinalInning(h.inning)}
                <span className="game-half-club">
                  {' · '}
                  {h.half === 'top' ? game.away.abbr : game.home.abbr} batting
                </span>
              </h2>
            </div>
            <ol className="game-play-list">
              {h.plays.map((p) => (
                <PlayRow key={p.index} play={p} game={game} openable={openable} onOpenPlayer={onOpenPlayer} />
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}

/**
 * One play.
 *
 * The sentence is **MLB's own**, unedited — it names the batter, what he did,
 * where it went and who scored, in one line, and no rewriting of it here could
 * be more accurate or shorter.
 *
 * What is added around it is the two things the sentence does not say: the
 * **score after** it, and the **pitcher** who threw it. The score rides only on
 * a play that changed it, which is the rule *a mark that would be on every row
 * marks nothing* — a running score down every row of four hundred is a column
 * of the same two numbers.
 *
 * **The live at-bat has no sentence**, MLB not having given it a result, so it
 * draws the count and the two men instead. It is the one row that says what is
 * happening rather than what happened, and it is marked.
 */
function PlayRow({
  play,
  game,
  openable,
  onOpenPlayer,
}: {
  play: GamePlay;
  game: GameReport;
  openable: Set<string>;
  onOpenPlayer: (key: string) => void;
}) {
  return (
    <li
      className={`game-play${play.scoring ? ' game-play-scoring' : ''}${play.live ? ' game-play-live' : ''}`}
    >
      <div className="game-play-line">
        {play.live ? (
          <span className="game-play-desc">
            <PlayerName
              id={play.batterId}
              name={play.batterName}
              kind="batter"
              openable={openable}
              onOpenPlayer={onOpenPlayer}
            />
            {' at the plate — '}
            {play.balls}-{play.strikes}, {play.outs} {play.outs === 1 ? 'out' : 'outs'}
          </span>
        ) : (
          <span className="game-play-desc">{play.desc}</span>
        )}
        {play.scoring && (
          <span className="game-play-score" title="the score after this play">
            {game.away.abbr} {play.awayScore}–{play.homeScore} {game.home.abbr}
          </span>
        )}
      </div>
      <div className="game-play-sub">
        <PlayerName
          id={play.pitcherId}
          name={play.pitcherName}
          kind="pitcher"
          openable={openable}
          onOpenPlayer={onOpenPlayer}
          className="game-play-arm"
        />
        {play.event && <span className="game-play-event">{play.event}</span>}
      </div>
    </li>
  );
}

/** `1st`, `2nd`, `3rd`, … — an inning is always read as an ordinal, and this is
 *  the only place on the page that needs one. */
function ordinalInning(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}
