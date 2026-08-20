import { useEffect, useMemo, useState } from 'react';
import { formatStartTime, handThrows, prettyGameDate } from '../lib';
import { useDelayedFlag } from '../hooks';
import { LoadingBlock } from './Loading';
import { Modal } from './Modal';
import { OpponentRead, useOpponentBoards } from './OpponentTable';
import type { OppRead } from './OpponentTable';
import { BatterSplitsTab } from './PlatoonSplits';
import {
  buildScheduleIndex,
  gamesOn,
  opponentText,
  opposingStarter,
  rotationOf,
  spanPhrase,
  startTierOn,
  TIER_TITLE,
  VS_TITLE,
} from './schedule';
import type { PitcherLookup, ScheduleIndex } from './schedule';
import type { PlayerReport, ScheduleGame, ScheduleWindow, StartTier } from '../types';

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
 * **One list now, for every kind of player, and that is a reversal of what
 * stood here.** The tab used to be two: a batter or a reliever got his club's
 * fixtures, and a rotation starter got `ProjectedStartsBlock` — his five turns
 * and nothing else. The argument for the split was that a starter is in one in
 * five of his club's games, so his turns are what he *has coming*; what it left
 * out is that the other four are what he does **not** have coming, and a
 * manager holding a two-start week is reading the fortnight to find out. A
 * five-row list of turns cannot answer "does he go again before Sunday" without
 * the reader knowing which days those turns fall between. So every player's tab
 * is his club's fixture list, and a starter's own turns are **marked** within
 * it — the same reading the roster's Schedule grid gives a pitcher's row, where
 * `SP` sits on the days he takes the ball and the rest of the club's games are
 * still drawn.
 *
 * **His Projected Starts block is unmoved**, on the Overview where it has
 * always been: five turns with their tiers, their cadence note and their
 * refusal sentences is the *rotation* read, and this is the fixture read. The
 * two now answer their own questions in their own places rather than one
 * standing in for the other.
 *
 * **The other half is a fold rather than a new object.** A row here is a when,
 * a matchup and the man the other club is throwing — which is exactly what a
 * `.start-row` is — so it takes `.start-list` / `.start-row` / `.start-line`
 * and `.ovw-next-when` / `.ovw-next-opp` / `.ovw-next-vs` unchanged, and a
 * marked row takes `.start-tag` and its three weights.
 *
 * The *data* is folded too: `buildScheduleIndex` is the roster and the board's
 * own index, called here unchanged, so a day read on this tab and the same day
 * read on the grid come off one function over one payload — including the
 * opposing starter, whose resolution (`buildStarters`, and the four ways it
 * declines to name anybody) is the fiddliest thing in that file and the last
 * thing that should exist twice. **And so is the mark**: `startTierOn` is the
 * function the grid's own cell asks, which is what keeps a row here and a cell
 * there from placing a turn on two different days.
 *
 * **What is *not* folded is the grid itself**, and that is the judgment this
 * tab turns on. `ScheduleCell` is a cell two characters wide in a table
 * fourteen columns across and hundreds of rows down; the whole span control
 * exists because *width* is that view's binding constraint. This is one man in
 * a scrolling overlay, where a row has room for a date, a time, a matchup, a
 * named pitcher and a word for what kind of start it is. The two draw the same
 * facts at two widths, which is the case the stylesheet's rule calls two things
 * that merely resemble each other — so what is shared is the index, the
 * vocabulary and the row, and what is not is the geometry.
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
 */
const HORIZON = 14;

/** How many rows the Overview's preview of this list draws — five, the number
 *  the Game Log preview beside it draws for the same reason: enough that a
 *  week's shape shows, few enough that it stays a glance. */
export const OVERVIEW_GAMES = 5;

export function PlayerScheduleTab({
  report,
  reportLoading,
  playerId,
  name,
  isPitcher,
  scheduleWindow,
  scheduleError,
  onNeedSchedule,
  pitcherLookup,
}: {
  /** The Overview's day, which carries both facts this tab turns on — his club
   *  (`teamId`) and, through `startTierOn`, nothing at all: the rotation is the
   *  window's. It is the page's cheapest read and fires with the page, the
   *  Overview being the tab it opens on; this tab asks for it too (see
   *  `PlayerDetails`' day effect), so pressing Schedule after a failed day read
   *  retries it. */
  report: PlayerReport | null;
  reportLoading: boolean;
  playerId: number;
  name: string;
  isPitcher: boolean;
  /** The league-wide 28-day window, read **once per session and shared** — the
   *  same one the two wide tables and the matchup page's team pages draw from.
   *  This is the third surface to ask for it and it asks the same way
   *  (`onNeedSchedule`), which is what keeps it one request. */
  scheduleWindow: ScheduleWindow | null;
  scheduleError: string | null;
  onNeedSchedule: () => void;
  pitcherLookup: PitcherLookup;
}) {
  return (
    <div className="details-schedule">
      <UpcomingGames
        report={report}
        reportLoading={reportLoading}
        playerId={playerId}
        name={name}
        isPitcher={isPitcher}
        scheduleWindow={scheduleWindow}
        scheduleError={scheduleError}
        onNeedSchedule={onNeedSchedule}
        pitcherLookup={pitcherLookup}
      />
    </div>
  );
}

/**
 * His club's fixtures, one row a game — **the whole tab, and five rows of it on
 * the Overview**.
 *
 * One component with a `limit` and a door rather than two lists, which is the
 * rule this page already keeps for the Game Log and the News: the tab holds the
 * whole thing, the Overview previews it, and the row shapes, the marks, the
 * empty sentences and the press that opens an opponent have one definition.
 * The two differ in exactly two props.
 *
 * **Only what is still to come.** A game already live or final today is not
 * something anybody plans around — the Overview's day block is what says what
 * today's game is doing — and a **postponement is not a game he gets**, which
 * is the rule the Schedule view's own `G` count states and the one error that
 * would make this list lie. So the filter is `state === 'scheduled'`, which
 * says all three at once, and a list that comes back empty says which of the
 * reasons it is empty for.
 */
export function UpcomingGames({
  report,
  reportLoading,
  playerId,
  name,
  isPitcher,
  scheduleWindow,
  scheduleError,
  onNeedSchedule,
  pitcherLookup,
  limit,
  heading = 'Upcoming Games',
  onSeeAll,
}: {
  report: PlayerReport | null;
  reportLoading: boolean;
  playerId: number;
  name: string;
  isPitcher: boolean;
  scheduleWindow: ScheduleWindow | null;
  scheduleError: string | null;
  onNeedSchedule: () => void;
  pitcherLookup: PitcherLookup;
  /** The preview's five. Absent is the fortnight, which is the tab. */
  limit?: number;
  heading?: string;
  /** The preview's door through to the tab that holds the whole fortnight —
   *  text in the accent, the `News →` / `Stats →` device, because what it does
   *  is change which tab is on screen. */
  onSeeAll?: () => void;
}) {
  const teamId = report?.teamId ?? null;
  // **Asked for where it is drawn**, which is now both places this block is
  // mounted. The window takes no parameters and `App` holds one for the
  // session, so the second surface to ask costs nothing; the ask waits for the
  // day only in the sense that this block is not mounted until the tab that
  // draws it is.
  useEffect(() => {
    onNeedSchedule();
  }, [onNeedSchedule]);
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
    return limit === undefined ? out : out.slice(0, limit);
  }, [index, teamId, limit]);

  // One opposing club's season line per team id, read on the press that opens a
  // row and held for the life of the block — the cache `ProjectedStartsBlock`
  // uses, which is why it lives beside the table both of them draw.
  const { opps, load } = useOpponentBoards(playerId);

  // Rule 1 of the app's loading system, and the two flags are deliberately
  // different: the *content* is gated on the real one, so a window already in
  // hand draws with no wait at all, and only the delayed one may put a wait on
  // screen. Nothing here can be superseded — the window takes no parameters and
  // is one object for every player — so there is no sequence number to keep and
  // no mark to clear: `PlayerDetails` unmounts this on a player change.
  const loading = reportLoading || (scheduleWindow === null && scheduleError === null);
  const wait = useDelayedFlag(loading);

  if (index && rows.length > 0 && report) {
    // The horizon, in the same words the grid's count columns title themselves
    // with and off the same function — worded once, so this tab and that column
    // cannot describe one fortnight two ways. The preview says how many rows it
    // is showing instead, its own heading having already said the number.
    const phrase = spanPhrase(index);
    const rotation = isPitcher ? rotationOf(index, playerId) : null;
    return (
      // **`.ovw-starts` as well as `.ovw-block`**, which is a fold rather than a
      // borrowed class: that rule is what gives a *list of one player's dated
      // rows* the `--card-column` cap and the tab's shared center, and it is
      // also what turns the head row's `space-between` off so a note reads
      // beside the heading instead of 800px away from it. The Projected Starts
      // block is the block it was written for and this is the same list of the
      // same kind of row.
      <section className={`ovw-block ovw-starts${onSeeAll ? ' ovw-upcoming' : ''}`}>
        <div className="ovw-head-row">
          <h2 className="ovw-head">{heading}</h2>
          {onSeeAll ? (
            <button type="button" className="ovw-link" onClick={onSeeAll}>
              Schedule →
            </button>
          ) : (
            /* It takes `.start-note`'s slot beside the heading for the reason
               that phrase does on the Projected Starts block: a caveat about a
               list belongs on the one line of the block that is always drawn. */
            <span
              className="start-note"
              title={`Every game his club is scheduled to play ${phrase}. A postponement is not a game he gets, so it is not here.`}
            >
              {phrase.replace(/^in /, '')}
            </span>
          )}
        </div>
        <ol className="start-list">
          {rows.map((g) => (
            <GameRow
              key={g.gamePk}
              game={g}
              index={index}
              teamId={teamId as number}
              report={report}
              name={name}
              isPitcher={isPitcher}
              tier={isPitcher ? startTierOn(index, g, teamId as number, playerId) : null}
              cadence={rotation?.cadence ?? null}
              opp={opps[g.homeId === teamId ? g.awayId : g.homeId]}
              onLoad={load}
            />
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
        <h2 className="ovw-head">{heading}</h2>
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

/** What a marked row says at the end of its line. **`Start` rather than
 *  `Announced`**, which is the word the Projected Starts block uses: there
 *  every row is one of his starts and the tag says how sure it is, and here
 *  most rows are not, so the tag has to say *that he starts* before it says how
 *  sure. The three weights then say the rest, and they are the ladder the tag
 *  already had. */
const MARK_TAG: Record<StartTier, string> = {
  announced: 'Start',
  projected: 'Proj. start',
  estimated: 'Est. start',
};

/**
 * One fixture — the same line a projected start is.
 *
 * **A press, and the same press an upcoming game is everywhere else in this
 * app.** The feed's Upcoming row and the Overview's Projected Starts row both
 * open a dialog on the fact a scheduled game actually carries: for a **pitcher**
 * the opposing lineup, nine cuts of it (`OpponentSection`), and for a **batter**
 * his own platoon split with the half the announced starter creates marked
 * (`BatterSplitsTab`). This row opens the same two boxes by the same test, so a
 * game pressed here and the same game pressed in the feed answer alike.
 *
 * **A row with nothing behind it is not a press**, which is the same rule in
 * both branches and arrives at two different moments. A batter's is decided
 * before anything is drawn — the feed's own `spHand !== null` — because a split
 * needs a hand to mark and an unnamed starter has none. A pitcher's cannot be:
 * the opposing club's line is not read until somebody presses, so the row is a
 * press by default and goes static on exactly one answer, the server returning
 * **no board for that club**. A read that *threw* keeps its press, since a retry
 * is a different fact from an absence and the dialog offers one.
 *
 * **The one guess a plain row can hold is the opposing starter**, and it wears
 * the grid's own underline ladder — nothing on the announced tier, a solid
 * underline for our reading of his slot, a dashed one for his club's. That is
 * *an estimate never wears the same clothes as a measurement* said on a row
 * rather than in a cell.
 *
 * **A marked row holds a second one**, and it wears the same ladder in the
 * `.start-tag` pill: `Start` in the accent where his club has named him,
 * `Proj. start` in a solid muted outline where his own rotation slot puts him
 * there, `Est. start` dashed where his club's does. What it deliberately does
 * **not** take is `.start-row--projected`'s muting of the whole line, which is
 * right on a list of nothing but starts and wrong here: the date, the time and
 * the matchup on this row are a scheduled game his club is playing whatever we
 * think of the rotation, so the guess is confined to the thing that is one.
 */
function GameRow({
  game,
  index,
  teamId,
  report,
  name,
  isPitcher,
  tier,
  cadence,
  opp,
  onLoad,
}: {
  game: ScheduleGame;
  index: ScheduleIndex;
  teamId: number;
  report: PlayerReport;
  name: string;
  isPitcher: boolean;
  /** Whether this game is one of *his* starts, and how sure that is. Null on
   *  every row of a batter's or a reliever's list, and on most of a starter's:
   *  he is in one in five. */
  tier: StartTier | null;
  cadence: number | null;
  opp: OppRead | undefined;
  onLoad: (teamId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const when = prettyGameDate(game.date);
  const time = formatStartTime(game.startTime);
  const matchup = opponentText(game, teamId);
  const vs = opposingStarter(index, game, teamId);
  const oppId = game.homeId === teamId ? game.awayId : game.homeId;
  const oppAbbr = game.homeId === teamId ? game.away : game.home;
  const vsHand = vs?.hand === 'L' || vs?.hand === 'R' ? vs.hand : null;
  const known = opp !== undefined && 'board' in opp;
  const expandable = isPitcher ? !(known && opp.board == null) : vsHand !== null;
  // The weekday rides on the row's title rather than in the line. A fantasy
  // week runs Monday to Sunday and the day is worth having, but `prettyGameDate`
  // is how *this page* says a date — on the next-game line and on every
  // projected start — and a schedule wording it differently from the block one
  // tab over would be two vocabularies for one fact.
  const weekday = new Date(`${game.date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
  });
  const turn = tier === null || tier === 'announced' || cadence == null ? '' : ` (a turn every ${cadence} club ${cadence === 1 ? 'game' : 'games'})`;
  const title =
    `${weekday}, ${when}${time ? ` at ${time}` : ''} ${matchup}` +
    (tier ? ` · ${TIER_TITLE[tier]}${turn}` : '') +
    (vs ? ` · against ${vs.full} — ${VS_TITLE[vs.tier]}` : '') +
    (expandable
      ? isPitcher
        ? ' · open to see how that lineup has hit'
        : ' · open to see how he has hit that hand'
      : '');

  // The line itself, drawn the same whether or not it is a press — the row's
  // own tag already says what kind of fact it is, and a second treatment for
  // "you can open this" would be one more than the row can carry.
  const line = (
    <>
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
      {tier && <span className={`start-tag start-tag--${tier}`}>{MARK_TAG[tier]}</span>}
    </>
  );

  return (
    <li className="start-row">
      {expandable ? (
        // No caret: the row is the affordance, which is the rule this app
        // restates wherever a bar opens something.
        <button
          type="button"
          className="start-line"
          aria-haspopup="dialog"
          aria-expanded={open}
          title={title}
          onClick={() => {
            if (isPitcher) onLoad(oppId);
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
          spelling of the same thing: the answer that makes a pitcher's row
          static arrives *while its own dialog is up*, so gating on both
          unmounted the box in front of the reader the moment the read landed — a
          press that flashed and shut with nothing said. Only a press can set
          `open`, and a static row has none, so the two cannot contradict each
          other. */}
      {open && (
        <Modal
          title={`${name} — ${when} ${matchup}`}
          titleId={`game-opponent-${game.gamePk}`}
          className="play-detail-box"
          onClose={() => setOpen(false)}
        >
          <div className="start-detail">
            {/* **What the box is looking at may itself be a guess**, and it says
                so where the reader is: on a batter's dialog the half of his
                split that is marked is the half the *projected* starter would
                create, and on a starter's it is a turn nobody has named him for.
                The row says both of those in a tag and an underline, and neither
                travels into the box. */}
            {tier && tier !== 'announced' && (
              <p className="ovw-none">
                Projected from his rotation slot — nobody has named this start yet, so this is the
                lineup he <em>would</em> face.
              </p>
            )}
            {isPitcher ? (
              <OpponentRead
                opp={opp}
                opponent={oppAbbr}
                opponentId={oppId}
                hand={report.throws}
                onRetry={onLoad}
              />
            ) : (
              <>
                {vs && vs.tier !== 'announced' && (
                  <p className="ovw-none">
                    {oppAbbr} hasn’t named a starter this far out — {vs.full} is who their rotation
                    puts on the mound, so this is the half of his split that <em>would</em> apply.
                  </p>
                )}
                {/* The whole platoon comparison with this game's half marked,
                    rather than that half alone — the feed's Upcoming dialog
                    draws exactly this, for the reason `BatterSplitsTab` records:
                    a split is a comparison, and one side of it is a number. */}
                <BatterSplitsTab
                  vsLeft={report.splitVsLeft}
                  vsRight={report.splitVsRight}
                  highlight={vsHand === 'L' ? 'left' : 'right'}
                  highlightTitle={`${vs?.full ?? handThrows(vsHand)} throws ${
                    vsHand === 'L' ? 'left' : 'right'
                  }-handed, so this is the half that applies to this game.`}
                />
              </>
            )}
          </div>
        </Modal>
      )}
    </li>
  );
}
