import { useEffect, useMemo } from 'react';
import { formatStartTime, isRotationStarter, prettyGameDate } from '../lib';
import { useDelayedFlag } from '../hooks';
import { LoadingBlock } from './Loading';
import { ProjectedStartsBlock } from './PlayerOverview';
import {
  buildScheduleIndex,
  gamesOn,
  opponentText,
  opposingStarter,
  spanPhrase,
  VS_TITLE,
} from './schedule';
import type { PitcherLookup, ScheduleIndex } from './schedule';
import type { PlayerReport, ProjectedStarts, ScheduleGame, ScheduleWindow } from '../types';

/**
 * ---------------------------------------------------------------------------
 * The Schedule tab — what he has coming, which is the one question this page
 * could only answer about *today*.
 * ---------------------------------------------------------------------------
 *
 * Seven of the tabs beside it are readings of a season already played and the
 * eighth is his day. A fantasy manager setting a lineup is asking the forward
 * half of that — *how many games does he get this week, against whom, and does
 * my starter get two turns* — and until this tab the app answered it only on a
 * **grid of everybody** (the roster and the board's Schedule view) or one row
 * at a time on the Overview.
 *
 * **Two kinds of row, because it is two questions.** A batter is in every game
 * his club plays and a reliever could be in any of them, so what either has
 * coming *is* his club's fixture list. A starting pitcher is in one in five of
 * them, and his club's next game is somebody else's start — so his rows are his
 * **turns**. The test is `lib.ts::isRotationStarter`, the app's one definition
 * of who works out of the rotation, read off the day report exactly as
 * `NextGameBlock` and `ProjectedStartsBlock` read it. ESPN's `SP` eligibility
 * is deliberately not the test, for the reason both of those already record: it
 * is a cover rather than a partition, so it says where a league will let you
 * start a man and not whether he takes the ball every fifth day.
 *
 * **The starter's half is not a second implementation of anything** — it is
 * `ProjectedStartsBlock` itself, over `/api/players/:id/projected-starts`,
 * which is the same route, the same five rows, the same three tiers and the
 * same opponent dialog the Overview draws. That is the rule this page already
 * follows for News and the Game Log: the Overview previews and the tab holds
 * the whole thing, off **one** read, so a fact drawn in two places on one page
 * cannot come to say two things.
 *
 * **The other half is a fold rather than a new object.** A row here is a when,
 * a matchup and the man the other club is throwing — which is exactly what a
 * `.start-row` is, minus the tag that says whose guess it is — so it takes
 * `.start-list` / `.start-row` / `.start-line` and `.ovw-next-when` /
 * `.ovw-next-opp` / `.ovw-next-vs` unchanged and adds **no CSS at all**.
 *
 * The *data* is folded too: `buildScheduleIndex` is the roster and the board's
 * own index, called here unchanged, so a day read on this tab and the same day
 * read on the grid come off one function over one payload — including the
 * opposing starter, whose resolution (`buildStarters`, and the four ways it
 * declines to name anybody) is the fiddliest thing in that file and the last
 * thing that should exist twice.
 *
 * **What is *not* folded is the grid itself**, and that is the judgment this
 * tab turns on. `ScheduleCell` is a cell two characters wide in a table
 * fourteen columns across and hundreds of rows down; the whole span control
 * exists because *width* is that view's binding constraint. This is one man in
 * a scrolling overlay, where a row has room for a date, a time, a matchup and a
 * named pitcher. The two draw the same facts at two widths, which is the case
 * the stylesheet's rule calls two things that merely resemble each other — so
 * what is shared is the index, the vocabulary and the row, and what is not is
 * the geometry.
 */

/**
 * How far ahead the fixture list runs.
 *
 * **Fourteen, which is the app's own planning horizon** rather than a number
 * picked here: `nextGame.ts` argues it (a rotation turn is five days, and an
 * off day either side of the All-Star break is the widest gap a club's schedule
 * has) and the Schedule view's `Next 14` is the same number on the same
 * question. Measured on the live window it is **12 to 14 rows** for a club — a
 * list to scan rather than a wall — where the whole 28-day window the server
 * answers with is 24 to 26.
 *
 * **That whole window was the alternative and it was rejected twice over.** It
 * would have meant either a fifth `ScheduleSpan` that no URL can carry and no
 * control offers — a concept in `schedule.tsx` existing for one caller — or a
 * private copy of that file's `byTeam`, which is the drift this whole
 * arrangement exists to prevent. And what it would have bought is days 15 to
 * 28, which is past where anybody sets a lineup.
 *
 * The two kinds of row are then bounded in their own units — a fortnight of
 * fixtures, five turns — which is right rather than untidy: at a cadence of
 * five club games those five turns *are* about four weeks, and a turn is the
 * unit a rotation is planned in where a day is the unit a lineup is.
 */
const HORIZON = 14;

export function PlayerScheduleTab({
  report,
  reportLoading,
  playerId,
  name,
  isPitcher,
  starts,
  startsLoading,
  startsFailed,
  scheduleWindow,
  scheduleError,
  onNeedSchedule,
  pitcherLookup,
}: {
  /** The Overview's day, which carries both facts this tab turns on — his club
   *  (`teamId`) and whether he works out of the rotation. It is the page's
   *  cheapest read and fires with the page, the Overview being the tab it opens
   *  on; this tab asks for it too (see `PlayerDetails`' day effect), so pressing
   *  Schedule after a failed day read retries it. */
  report: PlayerReport | null;
  reportLoading: boolean;
  playerId: number;
  name: string;
  isPitcher: boolean;
  /** His rotation, read by `PlayerDetails` and handed down — the same object
   *  the Overview's own copy of this block draws, so the two tabs cannot show
   *  different turns and re-entering either costs no request. */
  starts: ProjectedStarts | null;
  startsLoading: boolean;
  startsFailed: boolean;
  /** The league-wide 28-day window, read **once per session and shared** — the
   *  same one the two wide tables and the matchup page's team pages draw from.
   *  This is the third surface to ask for it and it asks the same way
   *  (`onNeedSchedule`), which is what keeps it one request. */
  scheduleWindow: ScheduleWindow | null;
  scheduleError: string | null;
  onNeedSchedule: () => void;
  pitcherLookup: PitcherLookup;
}) {
  const starter = report !== null && isPitcher && isRotationStarter(report);
  // **Asked for only where it is drawn.** A rotation starter's rows come off
  // his own route, so his page never orders the league-wide window — the same
  // economy the toggle itself follows ("a reader who never presses it never
  // pays for it"). The ask waits for the day to settle rather than firing while
  // it is out, or every starter's page would order a window it is about to have
  // no use for.
  const wantWindow = !reportLoading && !starter;
  useEffect(() => {
    if (wantWindow) onNeedSchedule();
  }, [wantWindow, onNeedSchedule]);

  if (starter) {
    // The Overview's own block, imported rather than reimplemented — one route,
    // one list, one set of tiers. `report.throws` is what decides which row of
    // the opponent dialog's table is accented, exactly as on the Overview.
    return (
      <div className="details-schedule">
          <ProjectedStartsBlock
          playerId={playerId}
          name={name}
          throws={report.throws}
          info={starts}
          loading={startsLoading}
          failed={startsFailed}
        />
      </div>
    );
  }
  return (
    <div className="details-schedule">
      <ClubGames
        report={report}
        reportLoading={reportLoading}
        name={name}
        scheduleWindow={scheduleWindow}
        scheduleError={scheduleError}
        pitcherLookup={pitcherLookup}
      />
    </div>
  );
}

/**
 * His club's fixtures, one row a game.
 *
 * **Only what is still to come.** A game already live or final today is not
 * something anybody plans around — the Overview's day block is what says what
 * today's game is doing — and a **postponement is not a game he gets**, which
 * is the rule the Schedule view's own `G` count states and the one error that
 * would make this list lie. So the filter is `state === 'scheduled'`, which
 * says all three at once, and a list that comes back empty says which of the
 * reasons it is empty for.
 */
function ClubGames({
  report,
  reportLoading,
  name,
  scheduleWindow,
  scheduleError,
  pitcherLookup,
}: {
  report: PlayerReport | null;
  reportLoading: boolean;
  name: string;
  scheduleWindow: ScheduleWindow | null;
  scheduleError: string | null;
  pitcherLookup: PitcherLookup;
}) {
  const teamId = report?.teamId ?? null;
  /**
   * The shared index, built once per window. **`buildScheduleIndex` unchanged**
   * — the span is `HORIZON` and the matchup argument is null, which is the
   * numeric fallback every reader without a connected league already gets on
   * the grid. A fantasy week is a fact about a *league* and this tab is about a
   * man, so it does not offer one: the two named spans are a control the roster
   * row carries, and this page has no row to carry it on.
   */
  const index = useMemo(
    () => (scheduleWindow ? buildScheduleIndex(scheduleWindow, HORIZON, null, pitcherLookup) : null),
    [scheduleWindow, pitcherLookup],
  );
  const rows = useMemo(() => {
    if (!index || teamId === null) return [];
    const out: ScheduleGame[] = [];
    for (const date of index.dates) {
      const day = gamesOn(index, teamId, date).filter((g) => g.state === 'scheduled');
      // **A doubleheader is sorted by first pitch, and the grid's order is not
      // wrong so much as answering a different question.** `schedule.ts` keeps a
      // day's games in MLB's own game order, which the grid stacks in one cell
      // where two lines under one date read as "twice that day" whichever way up
      // they are. A list is read *down*, so an out-of-order pair reads as an
      // error — and it happens: measured on the live window, the Yankees' Aug 29
      // doubleheader against Boston arrives `gamePk` 823501 (7:15 PM) ahead of
      // 823539 (1:05 PM), so the tab drew the nightcap first. A time nobody has
      // posted sorts last, which is the only place a game with no time can go.
      if (day.length > 1) {
        day.sort((a, b) => {
          if (a.startTime === b.startTime) return 0;
          if (a.startTime === null) return 1;
          if (b.startTime === null) return -1;
          return a.startTime < b.startTime ? -1 : 1;
        });
      }
      out.push(...day);
    }
    return out;
  }, [index, teamId]);

  // Rule 1 of the app's loading system, and the two flags are deliberately
  // different: the *content* is gated on the real one, so a window already in
  // hand draws with no wait at all, and only the delayed one may put a wait on
  // screen. Nothing here can be superseded — the window takes no parameters and
  // is one object for every player — so there is no sequence number to keep and
  // no mark to clear: `PlayerDetails` unmounts this on a player change.
  const loading = reportLoading || (scheduleWindow === null && scheduleError === null);
  const wait = useDelayedFlag(loading);

  if (index && rows.length > 0) {
    const phrase = spanPhrase(index);
    return (
      // **`.ovw-starts` as well as `.ovw-block`**, which is a fold rather than a
      // borrowed class: that rule is what gives a *list of one player's dated
      // rows* the `--card-column` cap and the tab's shared center, and it is
      // also what turns the head row's `space-between` off so a note reads
      // beside the heading instead of 800px away from it. The block on the other
      // branch of this tab is the very block it was written for.
      <section className="ovw-block ovw-starts">
        <div className="ovw-head-row">
          <h2 className="ovw-head">Upcoming Games</h2>
          {/* The horizon, in the same words the grid's count columns title
              themselves with and off the same function — worded once, so this
              tab and that column cannot describe one fortnight two ways. It
              takes `.start-note`'s slot beside the heading for the reason that
              phrase does on the Projected Starts block: a caveat about a list
              belongs on the one line of the block that is always drawn. */}
          <span
            className="start-note"
            title={`Every game his club is scheduled to play ${phrase}. A postponement is not a game he gets, so it is not here.`}
          >
            {phrase.replace(/^in /, '')}
          </span>
        </div>
        <ol className="start-list">
          {rows.map((g) => (
            <GameRow key={g.gamePk} game={g} index={index} teamId={teamId as number} />
          ))}
        </ol>
      </section>
    );
  }
  if (wait) return <LoadingBlock>Reading his upcoming games</LoadingBlock>;
  if (loading) return null;
  return (
    <section className="ovw-block ovw-starts">
      <div className="ovw-head-row">
        <h2 className="ovw-head">Upcoming Games</h2>
      </div>
      <p className="ovw-none">{emptyText(report, teamId, scheduleError, index !== null, name)}</p>
    </section>
  );
}

/**
 * **An empty list names its own cause**, and there are four of them here — each
 * a different fact about the player or about the read, and so a different
 * sentence. A single "nothing scheduled" would be a claim about his club's
 * schedule made in three cases where we never got as far as looking at it.
 */
function emptyText(
  report: PlayerReport | null,
  teamId: number | null,
  scheduleError: string | null,
  haveIndex: boolean,
  name: string,
): string {
  if (scheduleError !== null || !haveIndex) return 'Couldn’t read the league schedule.';
  if (report === null) {
    return `Couldn’t read which club ${name} is on, so there is no schedule to draw.`;
  }
  if (teamId === null) return `${name} isn’t on a club right now, so there are no games to list.`;
  return `Nothing left on his club’s schedule in the next ${HORIZON} days.`;
}

/**
 * One fixture — the same line a projected start is, minus the tag.
 *
 * **No tag, and that is the rule rather than an omission**: every row here is a
 * game his club is scheduled to play, so a mark saying so would be on every row
 * and a mark that would be on every row marks nothing. It is also what keeps
 * the app's other standing rule intact on this tab — an estimate never wears
 * the same clothes as a measurement — since the *one* guess a row can hold is
 * the opposing starter, and that guess wears the grid's own underline ladder
 * and is the only thing on the row that does.
 *
 * The opposing starter is `opposingStarter`'s, which is the grid's resolution
 * rather than a second one: announced where his club has named him, projected
 * where his own rotation slot puts him there, estimated where his club's
 * rotation does, and **absent** where the answer is not one man. Measured on
 * the live 28-day window that is 81.3% of game-sides named against the 10% an
 * announcement alone can reach, which is the whole reason this line is worth
 * drawing a fortnight out. Nothing is added on the announced tier, an underline
 * says the slot is our reading of him and a dashed one that it is his club's —
 * `.sched-vs-projected` / `.sched-vs-estimated`, taken rather than restated,
 * because it is the same ladder about the same fact.
 *
 * `vs.label` rather than a name built here: `RHP Alcantara`, hand and surname,
 * is what `buildStarters` already resolved and what the grid's own cell prints.
 */
function GameRow({
  game,
  index,
  teamId,
}: {
  game: ScheduleGame;
  index: ScheduleIndex;
  teamId: number;
}) {
  const when = prettyGameDate(game.date);
  const time = formatStartTime(game.startTime);
  const matchup = opponentText(game, teamId);
  const vs = opposingStarter(index, game, teamId);
  // The weekday rides on the row's title rather than in the line. A fantasy
  // week runs Monday to Sunday and the day is worth having, but `prettyGameDate`
  // is how *this page* says a date — on the next-game line and on every
  // projected start — and a schedule wording it differently from the block one
  // tab over would be two vocabularies for one fact.
  const weekday = new Date(`${game.date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
  });
  const title =
    `${weekday}, ${when}${time ? ` at ${time}` : ''} ${matchup}` +
    (vs ? ` · against ${vs.full} — ${VS_TITLE[vs.tier]}` : '');
  return (
    <li className="start-row">
      <div className="start-line static" title={title}>
        <span className="ovw-next-when">
          {when}
          {time ? ` · ${time}` : ''}
        </span>
        <span className="ovw-next-opp">{matchup}</span>
        {vs && (
          <span className={`ovw-next-vs${vs.tier === 'announced' ? '' : ` sched-vs-${vs.tier}`}`}>
            {vs.label}
          </span>
        )}
      </div>
    </li>
  );
}
