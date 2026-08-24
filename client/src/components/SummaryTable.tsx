import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { FantasySlotTag, ProjectedSlotTag, readLineup } from './FantasySlot';
import { ExpandButton } from './ExpandButton';
import { PhotoSpot, PhotoStatus, useStatusBadge } from './PhotoStatus';
import { PlayerIdentity } from './PlayerIdentity';
import { PlayerNewsMark } from './NewsMark';
import {
  DayHead,
  OpponentPress,
  ScheduleCell,
  gameCount,
  gamesOn,
  spanPhrase,
  startTally,
  tallyTier,
  tallyWords,
} from './schedule';
import type { ScheduleIndex } from './schedule';
import type { FantasySlot } from '../hooks';
import {
  PreviewDoorContext,
  useEligible,
  useFantasyRoster,
  useFullPage,
  useGameDoor,
  usePreviewDoor,
} from '../hooks';
import type { PreviewTarget } from '../hooks';
import { UpcomingPreview, canPreview } from './LiveFeed';
import { SchedulePreview, canPreviewFixture } from './PlayerSchedule';
import { useOpponentBoards } from './OpponentTable';
import { startTierOn } from './schedule';
import type {
  BattingLine,
  PitchingLine,
  PlayerGame,
  PlayerKind,
  PlayerReport,
  ProjectedPlayerLine,
  RosterProjection,
} from '../types';
import { playerKey } from '../types';
import type { Corner, LiveRole } from '../lib';
import {
  combineLines,
  combinePitchingLines,
  eraOf,
  formatIp,
  formatRate,
  gameStatusView,
  handThrows,
  headshotUrl,
  isRotationStarter,
  lineupCorner,
  liveRole,
  liveRoleLabel,
  lineOps,
  mostRecentGameFirst,
  pitchingCorner,
  positionCell,
  prettyGameDate,
  surname,
  whipOf,
} from '../lib';

/**
 * The game to summarize for a player in the opponent column: prefer the live
 * game, then the next scheduled one, then their most recent — the same priority
 * the player cards use, so the column tracks whatever game is most current. (Stats still
 * aggregate every game in the range; this cell reflects one representative game.)
 */
function pickGame(report: PlayerReport): PlayerGame | null {
  const games = report.games;
  if (games.length === 0) return null;
  return (
    games.find((g) => g.status.state === 'live') ??
    games.find((g) => g.status.state === 'scheduled') ??
    [...games].sort(mostRecentGameFirst)[0]
  );
}

/**
 * The opponent / game cell: the matchup before first pitch, the live score +
 * inning while it's on, the final score once it's over.
 *
 * Before first pitch the second line is the starter the other side announced
 * (`game.probablePitcher` — on a pitcher's row that's his counterpart, not
 * someone he faces) and the start time moves up beside the matchup, so the cell
 * is two lines in every state rather than three in one of them. Once the game is
 * under way the starter drops off: by then the line that matters is the score
 * and the inning, and the batter is as likely to be facing a reliever.
 */
function OpponentCell({ r, game }: { r: PlayerReport; game: PlayerGame | null }) {
  const openPreview = usePreviewDoor();
  const openGame = useGameDoor();
  if (!game) return <td className="sum-opp sum-opp-empty">—</td>;
  /* **Only a game nobody has played is a preview.** The dialog is a reading of
     a matchup *before* it — his split against the man they have named, or the
     lineup waiting for him — and once there is a score the cell is showing one,
     which is the answer. */
  const press =
    openPreview && game.status.state === 'scheduled' && canPreview(r, game)
      ? () => openPreview({ kind: 'game', report: r, game })
      : null;
  /**
   * **…and a game that has been played opens the game.**
   *
   * That slot used to be plain text, and the reasoning for it was sound as far
   * as it went: the preview answers *what is this game* and a cell already
   * showing `TOR 3–2 NYY` has answered it. What it left unanswered is the
   * question a score raises — **how** — and there was nowhere in the app to
   * send a reader who asked it. There is now: the box score, both rosters and
   * every play, on the game's own page.
   *
   * So the cell's one press means two things across the game's life, and they
   * do not overlap: a fixture opens the preview, a result opens the page. It is
   * the same press in the same place either way, which is what stops it reading
   * as two controls.
   *
   * A **postponement** opens neither, and that is not an omission: there is no
   * game to read. Its cell says `PPD` and the schedule is where the makeup
   * lands.
   */
  const gamePress =
    openGame && (game.status.state === 'live' || game.status.state === 'final')
      ? () => openGame(game.gamePk)
      : null;
  const { kind, sides, score, detail } = gameStatusView(game);
  const matchup = `${game.isHome ? 'vs' : '@'} ${game.opponent}`;
  const scheduled = kind === 'scheduled';
  const sp = scheduled ? game.probablePitcher : null;
  /**
   * **The whole cell is one door, in whichever of the two shapes it is
   * drawing** — and what is behind it is what the shape says.
   *
   * Before first pitch the cell writes a matchup, so the door is `vs HOU` and
   * it opens the **preview**: prefix and abbreviation are one fact and eleven
   * characters are a small enough target already. Once there is a score the
   * cell writes `TOR 3–2 NYY`, and the whole of *that* is the door onto the
   * **game's page** — the same argument, one string longer: a result is one
   * fact and splitting the press off part of it would halve the target for no
   * gain.
   *
   * **It drew the two clubs separately for a while and no longer does.** The
   * reasoning then was that a link cannot be put through the middle of a
   * finished string, so `gameStatusView` hands back `sides` beside `score` and
   * the abbreviation alone was to be the link. That was written for a door onto
   * a *club's* page, which is not what a reader looking at a score is asking
   * for — and while it stood, the branch was unreachable anyway: a scheduled
   * game has no `sides` and a played one had nothing to open. The line is one
   * press again, and `sides` survives as the test for which shape this is.
   */
  const main =
    sides === null || score === null ? (
      <OpponentPress onPress={press} label={matchup} />
    ) : (
      <OpponentPress
        onPress={gamePress}
        label={score}
        opens="page"
        title={`${game.awayTeam} at ${game.homeTeam} — the game’s page`}
      />
    );
  return (
    <td className={`sum-opp sum-opp-${kind}`}>
      <span className="sum-opp-main">
        {main}
        {scheduled && <span className="sum-opp-time">{detail}</span>}
      </span>
      {!scheduled && <span className="sum-opp-detail">{detail}</span>}
      {sp && (
        <span className="sum-opp-sp" title={`Starting pitcher: ${sp.name}`}>
          vs {handThrows(sp.hand)} {surname(sp.name)}
        </span>
      )}
    </td>
  );
}

/**
 * The player's aggregate batting line for the range, shown as one table row.
 *
 * **`fmt` is how a count is printed**, and it is the whole of what the projected
 * reading changes about this component: a real count is an integer and a
 * projected one is a tenth (`projCount`), and a player with nothing to project
 * and nothing played gets an em-dash rather than a row of noughts. The OPS cell
 * needs no case of its own — a line with no at-bats has no OPS, so `lineOps`
 * already answers null for exactly the row that is blank.
 */
function StatCells({
  line,
  fmt = String,
  blank = false,
}: {
  line: BattingLine;
  fmt?: (n: number) => string;
  /** Nothing played and nothing to project, so the leading cell is one dash
   *  rather than `—/—`. Every other cell falls out of `fmt`. */
  blank?: boolean;
}) {
  const ops = lineOps(line);
  return (
    <>
      <td className="sum-num sum-hab">
        {blank ? '—' : `${fmt(line.hits)}/${fmt(line.ab)}`}
      </td>
      <td className="sum-num">{fmt(line.runs)}</td>
      <td className="sum-num">{fmt(line.hr)}</td>
      <td className="sum-num">{fmt(line.rbi)}</td>
      <td className="sum-num">{fmt(line.sb)}</td>
      <td className="sum-num">{ops !== null ? formatRate(ops) : '—'}</td>
      <td className="sum-num">{fmt(line.bb)}</td>
      <td className="sum-num">{fmt(line.so)}</td>
    </>
  );
}

/** A pitcher's aggregate line + rates for the range, shown as one table row. */
/**
 * A win / save / hold count, dashed at zero — these columns are empty for almost
 * every row, and a column of noughts reads as data when it isn't.
 */
function CreditCell({ n, fmt = String }: { n: number; fmt?: (n: number) => string }) {
  return <td className="sum-num">{n > 0 ? fmt(n) : '—'}</td>;
}

function PitchStatCells({
  line,
  fmt = String,
  ip = formatIp,
}: {
  line: PitchingLine;
  fmt?: (n: number) => string;
  /** How the innings cell is written. `formatIp` is the scorebook's `6.2` — two
   *  thirds of an inning, not two tenths — and it takes a whole out count, which
   *  a projection has not got: a projected 17.4 outs is `5.8` innings and
   *  writing it `5.2` would be a decimal read as a fraction. So the projected
   *  reading passes its own, and the two never meet. */
  ip?: (outs: number) => string;
}) {
  return (
    <>
      <td className="sum-num sum-hab">{line.outs > 0 ? ip(line.outs) : '—'}</td>
      <td className="sum-num">{fmt(line.hits)}</td>
      <td className="sum-num">{fmt(line.runs)}</td>
      <td className="sum-num">{fmt(line.earnedRuns)}</td>
      <td className="sum-num">{fmt(line.walks)}</td>
      <td className="sum-num">{fmt(line.strikeouts)}</td>
      <td className="sum-num">{fmt(line.hr)}</td>
      <CreditCell n={line.wins} fmt={fmt} />
      <CreditCell n={line.saves} fmt={fmt} />
      <CreditCell n={line.holds} fmt={fmt} />
      <td className="sum-num">{eraOf(line)}</td>
      <td className="sum-num">{whipOf(line)}</td>
    </>
  );
}

/** A pitcher's combined line across every game he pitched in the range. */
function aggregatePitching(report: PlayerReport): PitchingLine {
  return combinePitchingLines(report.games.filter((g) => g.pitching).map((g) => g.pitching!.line));
}

/**
 * ---------------------------------------------------------------------------
 * The projected reading
 * ---------------------------------------------------------------------------
 *
 * **A projected row is this table's own row over different numbers**, which is
 * the whole design and is the scoreboard card's own (`asProjected`): rather than
 * teaching the table a second set of cells, the *line* is swapped and everything
 * downstream — the slash line, the ERA, the `Total` — is the arithmetic that was
 * already there.
 *
 * **What is swapped in is `what he has already done` + `what he should still
 * add`.** The server projects only the games of the range that have not been
 * played, and the report carries his real lines for the ones that have, so the
 * two halves are added here. That is what makes an arbitrary range need no case
 * of its own: a past range projects nothing and reads exactly as it always did,
 * a future one is projection alone, and a range straddling today is the two.
 */
export type ProjectedLines = Map<string, ProjectedPlayerLine>;

/**
 * How a projected count is printed: to a **tenth**, with a whole number left
 * whole.
 *
 * A tenth because a per-player projection of 0.4 home runs over three days is a
 * real answer where `0` is not — the matchup card rounds to whole numbers and
 * can, a side's week being twenty of these added together. Whole numbers stay
 * whole so a range that is entirely in the past reads identically to the
 * ordinary table, which is what makes the two halves add up on screen: the
 * server rounds each projected component to a tenth before it sends it, so what
 * a reader totals down a column is what was printed in it.
 */
function projCount(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Nothing to say: a club with no game left in the span, a starter whose turn
 *  does not fall in it, a man neither board has a row for. Dashes rather than a
 *  line of noughts, which would claim he plays and does nothing. */
const noCount = (): string => '—';

/** Projected innings — `17.4` outs is `5.8` innings, and deliberately not
 *  `formatIp`'s `5.2`: that form is thirds, and a projected decimal read as one
 *  would be off by a factor of five. */
function projIp(outs: number): string {
  return (outs / 3).toFixed(1);
}

/**
 * **A row is what he would do if he plays; the `Total` is what the lineup gets.**
 *
 * Two arithmetics on one table, and each is the only honest answer to its own
 * question. A **row** is read to decide *should I start this man*, and cutting
 * it by the seat the projection happened to give him would make the row a
 * statement about the allocation rather than about the player — the bench bat
 * you are weighing would read as dashes precisely because you have not started
 * him yet. A **column total** is read as *what is my week worth*, and adding up
 * twenty players who cannot all be in the lineup at once is a figure nobody can
 * act on; that one takes the seated half, so it agrees with the League page's
 * matchup projection over the same days.
 *
 * `seated` picks which. Where there is no lineup at all — a saved watchlist,
 * a league with no slot counts — `lineup` is null and both fall back to the
 * full line, which is exactly what this table did before.
 */
function projectedBatting(
  r: PlayerReport,
  proj: ProjectedPlayerLine | undefined,
  seated = false,
): BattingLine {
  const lines = r.games.map((g) => g.line);
  const half = seated ? (proj?.lineup?.batting ?? proj?.batting) : proj?.batting;
  if (half) lines.push(half);
  return combineLines(lines);
}

function projectedPitching(
  r: PlayerReport,
  proj: ProjectedPlayerLine | undefined,
  seated = false,
): PitchingLine {
  const lines = r.games.filter((g) => g.pitching).map((g) => g.pitching!.line);
  const half = seated ? (proj?.lineup?.pitching ?? proj?.pitching) : proj?.pitching;
  if (half) lines.push(half);
  return combinePitchingLines(lines);
}

/**
 * The two stat runs, drawn either way — which is one component per kind rather
 * than a branch at each of the four call sites (a row and a `Total` per table).
 *
 * All the projected reading changes is **how a count is written** and whether a
 * blank row is dashes: a projected line whose player has neither played nor got
 * a game left is `pa === 0` (or no outs), which is exactly the row that must
 * not read as a line of noughts.
 */
function ProjectableStatCells({ line, projected }: { line: BattingLine; projected: boolean }) {
  if (!projected) return <StatCells line={line} />;
  const blank = line.pa === 0;
  return <StatCells line={line} fmt={blank ? noCount : projCount} blank={blank} />;
}

function ProjectablePitchCells({ line, projected }: { line: PitchingLine; projected: boolean }) {
  if (!projected) return <PitchStatCells line={line} />;
  // The innings, ERA and WHIP cells already dash themselves at no outs, so the
  // blank row needs nothing but a count formatter that says so.
  return (
    <PitchStatCells line={line} fmt={line.outs === 0 ? noCount : projCount} ip={projIp} />
  );
}

/** Did he play in this one — each kind's own test, and both are the app's
 *  existing ones: a batter's game he came to the plate in (`PlayerCard`'s own
 *  `played`) and a pitcher's game he threw in (`aggregatePitching`'s filter).
 *  Neither counts the placeholder games a report carries for the days his club
 *  played without him. */
function playedGame(kind: PlayerKind, g: PlayerGame): boolean {
  return kind === 'pitcher' ? g.pitching != null : g.plateAppearances.length > 0;
}

/** Games of the range he actually played. Read by the `Games` column and by
 *  `playedStarts` beside it, which asks the same question of a smaller set of
 *  days. */
function playedGames(r: PlayerReport): number {
  return r.games.filter((g) => playedGame(r.kind, g)).length;
}

/**
 * **The played half of `Starts`** — the games he played on days your lineup
 * actually had him.
 *
 * It is the exact counterpart of `playedGames` beside it, and that is the whole
 * of the decision: `Games` is *what he has already done + what he should still
 * add*, so a `Starts` counting only the second half would be the one cell on
 * the row keeping a different arithmetic — which is precisely what it was.
 * Measured on the live roster on 2026-08-19, a day whose games are all played:
 * `Games 5 · Starts 4` for a man started every day of the span, the missing
 * start being today's, already in the books.
 *
 * **Two tiers, `projectStarters`' own**: the per-day lineup map where there is
 * one (`FantasySlot.startedDays`), and the single end-of-range answer where
 * there is not — an older tab, a failed read — which is the direction the whole
 * of that filter fails in.
 *
 * A game he played on a day you had him **benched** is not a start, and his row
 * still counts it: the row is what the *player* did, which is the rule the two
 * arithmetics below rest on.
 */
function playedStartDays(r: PlayerReport, spot: FantasySlot | null): string[] {
  if (!spot) return [];
  const days = spot.startedDays ? new Set(spot.startedDays) : null;
  const kept = r.games.filter(
    (g) => playedGame(r.kind, g) && (days ? days.has(g.date) : spot.starting),
  );
  // **Days, not games**, which is what keeps the column consistent with its own
  // other half: the plan seats a man once a day however many games that day
  // holds, so a doubleheader you started him for is one start against two
  // games. `Games 2 · Starts 1` is the same relationship a play-share gives
  // every other row, arrived at from the other side.
  return [...new Set(kept.map((g) => g.date))];
}

function playedStarts(r: PlayerReport, spot: FantasySlot | null): number {
  return playedStartDays(r, spot).length;
}

/**
 * **How many games a projected row's figures are drawn over** — the ones he has
 * already played over the days in view, plus the ones he is expected still to
 * get.
 *
 * It follows the *row* rather than the projection, and that is the whole of the
 * decision: every figure beside it is `what he has already done + what he
 * should still add`, so a count naming only the second half would be the one
 * cell on the row keeping a different arithmetic. It is not a corner case
 * either — the ordinary press straddles today, a game already under way this
 * afternoon being in the report's own line and out of the projection by
 * `remainingGames`' rule.
 *
 * **"Played" is each kind's own test, and both are the app's existing ones**: a
 * batter's game he came to the plate in (`PlayerCard`'s own `played`) and a
 * pitcher's game he threw in (`aggregatePitching`'s filter). Neither counts the
 * placeholder games a report carries for days his club played without him —
 * which over a future range is *every* game on it, and is why `r.games.length`
 * cannot be the answer.
 */
function projectedGames(
  r: PlayerReport,
  proj: ProjectedPlayerLine | undefined,
  seated = false,
): number {
  const played = playedGames(r);
  // The same split the lines take: a row counts the chances he has, the `Total`
  // counts the ones the lineup gives him.
  const ahead = seated ? (proj?.lineup?.chances ?? proj?.chances) : proj?.chances;
  return played + (ahead ?? 0);
}

/**
 * **The `G` column, in the Opponent column's place** — drawn whenever the
 * projected lens is on, exactly as the Schedule view puts its own `G` there.
 *
 * The opponent cell is one representative game's matchup, which is a fair
 * summary of a range that has been played and says almost nothing about one the
 * lens has just moved the reader into the future of: it names a single fixture
 * out of a week of them, most of which nobody has played. What a projected row
 * *is* read against is how many games it is made of, which is the same question
 * the Schedule view's leading column answers — hence the same header.
 *
 * *(The header is the word now, not the letter: `G` beside a `Starts` column
 * has two readings on a pitcher's row and one of them is the other column —
 * `G` is appearances and `GS` is games started in every baseball table ever
 * printed. It costs 14px at 390 and nothing at 1400. The Schedule view's own
 * `G` is untouched: it counts a club's fixtures rather than a man's
 * appearances, and nothing sits beside it to be confused with.)*
 */
function ProjectedGamesHead({ kind }: { kind: PlayerKind }) {
  return (
    <th
      className="sum-num"
      scope="col"
      title={
        kind === 'pitcher'
          ? 'Appearances behind these figures — games he pitches in, a start and a relief outing alike: the ones already thrown over the days in view plus the ones he is expected still to get. A reliever’s is a share of every game his club has left rather than a whole outing on a night nobody can name, so a fraction is the honest count and the line beside it is worth the same fraction'
          : 'Games behind these figures — the ones he has come to the plate in over the days in view plus the ones he is expected still to get'
      }
    >
      Games
    </th>
  );
}

/** A `G` cell. A tenth like every other projected count, since an expected game
 *  count is a share of one; and a dash at nothing, which is the honest reading
 *  of a man whose club has no game left and who played none of the days in view
 *  — the same absence `chances: 0` already dashes the rest of his row for. */
function ProjectedGamesCell({ n }: { n: number }) {
  return <td className="sum-num">{n > 0 ? projCount(n) : '—'}</td>;
}

/**
 * **How many days of the span the projection actually starts him**, in a column
 * of its own beside the `G` it qualifies.
 *
 * It was on the slot chip — `2B 5/5`, `3B/UTIL 4/5` — which put the one fact
 * about the *span* on this row into the one cell that carries facts about the
 * *player*, and put it where no two rows' figures line up to be read against
 * each other. Every other thing the lens says about a week is a column: a
 * reader scans it, compares two rows at a glance, and adds it up at the foot.
 * A count buried at the end of a pill in the name column could do none of the
 * three, and the `Total` row had nowhere to say how many seat-days the plan
 * spends. So the chip keeps *where* he plays and this keeps *how often* — the
 * split the two questions had all along.
 *
 * **Both halves of the row, like every figure beside it.** The days already
 * played that your lineup had him plus the days ahead the plan seats him —
 * `playedStarts` and `lineup.days`. It counted only the second when it was
 * built, which made it the one cell on the row keeping a different arithmetic
 * from the `Games` next to it: measured on the live roster on an evening whose
 * games were all played, a man started every day of the span read **`Games 5 ·
 * Starts 4`**, the missing start being today's, already in the books. That is
 * not a rounding difference a reader can talk themselves into — it is the
 * column disagreeing with its neighbor about what a span is.
 *
 * **A whole number, where every other projected figure is a tenth.** Those are
 * shares of a game (`chances` is play-share weighted, and half a game is a real
 * answer); a start is a decision made on a named day, and there is no such
 * thing as 4.3 of them. It is why `Starts` sits *above* `Games` on most rows
 * and should: four starts of a man who bats in 80% of the games he is started
 * for is `Starts 4 · Games 3.3`, which is the two questions answered
 * separately.
 *
 * **`0` where nobody started him on any of it, a dash where there was nothing
 * to decide either way** — no day played with him in your lineup, and no day
 * left for his club. The dash is this table's standing rule that a nought is
 * never drawn where the honest answer is *nothing was asked*, and it is the
 * same absence that dashes the rest of that row.
 *
 * Drawn only where there is a lineup to fill. A saved watchlist and a league
 * that published no slot counts have no plan and so no starts, and a column of
 * dashes states nothing — see `anyLineup` in each table.
 */
function ProjectedStartsHead({ kind }: { kind: PlayerKind }) {
  return (
    <th
      className="sum-num"
      scope="col"
      title={
        // **Whose lineup is left unsaid**, since this table draws a leaguemate's
        // roster on a matchup's team page as readily as your own — the chip in
        // the name column is the one that says whose, and it has an owner to
        // say it with.
        'Days the projection puts him in a lineup slot, of the days his club plays — the rest it benches him for.' +
        // **A pitcher's column says which kind of start it means.** `Starts`
        // beside a pitcher's line is `GS` in every other baseball table there
        // is, and this one counts days in a lineup slot — a reliever holding a
        // seat all week reads `Games 1 · Starts 4`, which is the row that has
        // to be unambiguous or it is worse than no column.
        (kind === 'pitcher' ? ' A lineup slot, not a start on the mound.' : '')
      }
    >
      Starts
    </th>
  );
}

/**
 * A `Starts` cell: the days already played that you started him on plus the
 * days ahead the plan seats him, with both named on the title — `readLineup`'s
 * own sentence for the second half, which is the sentence the chip beside it
 * carries word for word.
 *
 * **A dash only where there was nothing to decide either way** — no day played
 * with him in your lineup and no day left for his club — which is the same
 * absence that dashes the rest of his row. `0` is the other thing: days were
 * there and the answer was no.
 */
function ProjectedStartsCell({
  r,
  lineup,
  spot,
}: {
  r: PlayerReport;
  lineup?: ProjectedPlayerLine['lineup'];
  spot: FantasySlot | null;
}) {
  const played = playedStarts(r, spot);
  const read = lineup && lineup.openDays.length > 0 ? readLineup(lineup) : null;
  if (!read && played === 0) return <td className="sum-num">—</td>;
  const n = played + (read?.seated ?? 0);
  const playedDays = playedStartDays(r, spot);
  const parts = [
    playedDays.length > 0 ? `started ${playedDays.map(prettyGameDate).join(', ')}` : '',
    read ? `projected ${read.tail}` : '',
  ].filter(Boolean);
  return (
    <td className="sum-num" title={`${n} ${n === 1 ? 'start' : 'starts'} — ${parts.join('; ')}`}>
      {n}
    </td>
  );
}

/** The `Starts` total: the lineup days the men above the line spend between
 *  them — started and projected alike, which is the column added up as this
 *  table's standing rule requires. */
function ProjectedStartsTotal({ n }: { n: number }) {
  return (
    <td className="sum-num" title="Lineup spots these players fill over these days — the ones already started and the ones the projection fills — added up">
      {n}
    </td>
  );
}

/**
 * **The whole row's starts** — the days already played that you started him on,
 * plus the days ahead the plan seats him.
 *
 * The same shape as `projectedGames` beside it and for the same reason: every
 * figure on this row is *what has happened + what is still to come*, and a
 * count of one half would read as a count of the row.
 */
function startsOf(r: PlayerReport, proj: ProjectedPlayerLine | undefined, spot: FantasySlot | null): number {
  return playedStarts(r, spot) + (proj?.lineup?.days.length ?? 0);
}

/**
 * **The one thing the caption said that nothing else on the page can say.**
 *
 * What stood here was a full caption — `Projected · Aug 18 – Aug 23 · 6 days
 * still to play` — and two thirds of it are now printed a few pixels above it,
 * in the date bar under the tabs: that bar has three readings and the lens is
 * one of them, so it already leads with `Projected` over the very dates this
 * line was restating. Two statements of one fact, eight pixels apart, is a
 * caption that has been made redundant by something better placed — the bar is
 * pinned, so it says it whether or not the table is scrolled, and it says it in
 * the expanded mode too. The ⓘ went up beside the `Projected` toggle, which is
 * the control it explains.
 *
 * **What the bar cannot say is that there is nothing to project**, and that is
 * the one state this must not be silent in: with every day in view already
 * played the lens adds nothing, and a reader who has just pressed a control and
 * seen the table not move deserves to be told why rather than left to conclude
 * the press failed. Where the clubs are idle as well as the days spent it is a
 * table of *dashes*, which is the same state wearing a worse face. So the
 * caption survives exactly where it is still the only thing saying anything,
 * and nowhere else — it is drawn at `daysLeft === 0` and not at all otherwise.
 *
 * It keeps its place directly above the pane rather than moving up beside the
 * toggle, for the reason it was put there in the first place: it is about the
 * rows under it, not about the control that produced them, and at a phone's
 * width the tab row has no line to spare for a sentence.
 */
function ProjectionNote({ p }: { p: RosterProjection }) {
  if (p.daysLeft > 0) return null;
  return (
    <div className="summary-proj-note">
      <span className="summary-proj-days">
        nothing to project — every game in these days has been played
      </span>
    </div>
  );
}

/**
 * Headshot for a summary row; falls back to a blank circle when MLB has none.
 * `role` paints the live-role ring (at bat / on deck / on base) and `corner`
 * pins the lineup-spot pip — the same colors and treatment the cards and feed use.
 */
/**
 * The player's status as a short code on the bottom edge of his headshot —
 * `IL10`, `RA`, `DTD`, `OUT`, `DFA`.
 *
 * On the headshot rather than beside the name because that is where the row
 * already carries what is *true of the player* as opposed to what he did: the
 * lineup-spot pip is on the opposite corner of the same circle. It also costs
 * the name column nothing, which matters on a table that overflows a phone —
 * a "Rehab Assignment" chip beside a name was pushing stat columns off the
 * right edge to say something four characters could.
 *
 * The badge itself is `useStatusBadge`'s, shared with the research board and
 * the details view; the only thing this adds is the report it reads the roster
 * status off, which those two haven't got.
 */
function SumStatus({ r }: { r: PlayerReport }) {
  return <PhotoStatus badge={useStatusBadge(playerKey(r), r.rosterStatus)} className="sum-photo-status" />;
}

function SumPhoto({
  id,
  playerKey: key,
  name,
  role,
  corner,
  status,
  onOpen,
}: {
  id: number;
  playerKey: string;
  name: string;
  role: LiveRole | null;
  corner: Corner;
  status: ReactNode;
  onOpen: (key: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  const cls = `sum-photo${role ? ` role-${role}` : ''}`;
  return (
    <button
      type="button"
      className="sum-photo-wrap"
      title={`${name} — details`}
      aria-label={`${name} — details`}
      onClick={() => onOpen(key)}
    >
      {failed ? (
        <span className={`${cls} sum-photo-empty`} aria-hidden="true" />
      ) : (
        <img
          className={cls}
          src={headshotUrl(id)}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      <PhotoSpot corner={corner} className="sum-photo-spot" />
      {status}
    </button>
  );
}

/**
 * The identity block on a summary row: the name line the caller draws, over his
 * club's cap mark and the positions his league will let him fill.
 *
 * The **block** is the research board's, shared rather than copied — see
 * `PlayerIdentity`. What this adds is where the two facts come from for a
 * *report* rather than a leaderboard row, and both come off the report itself:
 * `teamId`/`team` are his current club (`getRosterInfo`, so a traded man wears
 * the cap he is wearing now rather than the one on a game in the range), and
 * the position is `lib.ts::positionCell` over the same three-deep rule the
 * board follows.
 *
 * The one thing that is not on the report is ESPN's eligibility, which is a
 * per-user fact about a connected league and reaches this leaf through
 * `EligibilityContext` — see `hooks.ts` for why it is a context and why it is
 * not `FantasyRosterContext`, which is null in saved-roster mode where this
 * must still answer.
 *
 * The **pitcher fallback is his season**, not a window: `isRotationStarter` is
 * the same "a majority of his appearances are starts" test the feed's Upcoming
 * section gates on, and the tooltip says so, where the board's says "over the
 * window" because that is what its own `starter` measures.
 */
function RowIdentity({ r, children }: { r: PlayerReport; children: ReactNode }) {
  const pos = positionCell({
    eligible: useEligible(r.id),
    kind: r.kind,
    position: r.position,
    starter: r.kind === 'pitcher' && isRotationStarter(r),
    starterSource: 'off his appearances this season',
    unknownTitle: (p) => `${p} — MLB's listed position`,
  });
  return (
    <PlayerIdentity teamId={r.teamId} team={r.team ?? ''} pos={pos} playerId={r.id} kind={r.kind}>
      {children}
    </PlayerIdentity>
  );
}

/**
 * ---------------------------------------------------------------------------
 * The Schedule view's cells, on this table
 * ---------------------------------------------------------------------------
 *
 * Everything about what a day says — the opponent, the start mark, the counts,
 * the header — is `schedule.tsx`'s and is shared with the research board, so a
 * day read here and the same day read there cannot come to say two things. What
 * is this table's own is the shape of the row: which columns replace the stats,
 * and what the `Total` row adds up when they do.
 */

/** The day headers, plus the two counts that lead them. */
function ScheduleHeadCells({ index, kind }: { index: ScheduleIndex; kind: 'batter' | 'pitcher' }) {
  return (
    <>
      <th
        className="sum-num"
        scope="col"
        title={`Games his club plays ${spanPhrase(index)} — postponements excluded`}
      >
        G
      </th>
      {kind === 'pitcher' && (
        <th
          className="sum-num"
          scope="col"
          title={
            `Turns he gets ${spanPhrase(index)} — the ones his club has announced, plus the ` +
            `ones his rotation slot puts him in. A cell says which it is made of.`
          }
        >
          GS
        </th>
      )}
      {index.dates.map((date) => (
        <th key={date} className="sum-num" scope="col">
          <DayHead date={date} today={index.today} />
        </th>
      ))}
    </>
  );
}

/** One player's row of days, and the counts over them. */
function ScheduleCells({
  index,
  r,
}: {
  index: ScheduleIndex;
  r: PlayerReport;
}) {
  const openPreview = usePreviewDoor();
  const tally = r.kind === 'pitcher' ? startTally(index, r.teamId, r.id) : null;
  const tier = tally && tallyTier(tally);
  return (
    <>
      <td className="sum-num">{gameCount(index, r.teamId)}</td>
      {r.kind === 'pitcher' && (
        <td className="sum-num">
          {!tally || tally.total === 0 || !tier ? (
            '—'
          ) : (
            /* **The two-start marker**, which is the single most actionable
               thing this table can say — and it can now say it about a projected
               pair as well as an announced one. See `startTally` for why the
               announcement-only rule it used to keep could not answer the
               question this column is read with. The tier is the *weakest* of
               the turns counted, so a `2` resting on a guess is drawn as one. */
            <span
              className={`sched-gs sched-gs-${tier}${tally.total >= 2 ? ' sched-two' : ''}`}
              title={`${tally.total} ${tally.total === 1 ? 'turn' : 'turns'} ${spanPhrase(index)} — ${tallyWords(tally)}`}
            >
              {tally.total}
            </span>
          )}
        </td>
      )}
      {index.dates.map((date) => (
        <td key={date} className="sum-num">
          <ScheduleCell
            index={index}
            teamId={r.teamId}
            playerId={r.id}
            date={date}
            /* The cell has the fixture and this row has the man; the table
               above owns the dialog. `canPreviewFixture` is asked with no board
               yet — a pitcher's is a press by default and goes static only on
               the server answering that his opponent has none. */
            onPreview={
              openPreview
                ? (g) => {
                    if (!canPreviewFixture(r, g, r.kind === 'pitcher', undefined)) return false;
                    openPreview({ kind: 'fixture', report: r, game: g });
                    return true;
                  }
                : undefined
            }
          />
        </td>
      ))}
    </>
  );
}

/**
 * The `Total` row, in schedule mode — and it is the most useful row on the
 * table rather than a formality.
 *
 * Each day's cell is **how many of these players have a game that day**, which
 * is the "do I have enough bodies on Thursday" question a fantasy manager asks
 * of a schedule and which no other view in the app can answer. The two leading
 * cells are the ordinary sums: games the roster plays in the span, and starts
 * it has announced.
 */
function ScheduleTotalCells({
  index,
  players,
  kind,
}: {
  index: ScheduleIndex;
  players: PlayerReport[];
  kind: 'batter' | 'pitcher';
}) {
  const games = players.reduce((n, r) => n + gameCount(index, r.teamId), 0);
  // The `Total` row counts every turn the roster gets, announced or projected —
  // the same arithmetic as the rows above it, and the sum a manager plans a week
  // of pitching around.
  const starts = players.reduce((n, r) => n + startTally(index, r.teamId, r.id).total, 0);
  return (
    <>
      <td className="sum-num">{games}</td>
      {kind === 'pitcher' && <td className="sum-num">{starts > 0 ? starts : '—'}</td>}
      {index.dates.map((date) => {
        const n = players.filter(
          (r) => gamesOn(index, r.teamId, date).some((g) => g.state !== 'postponed'),
        ).length;
        return (
          <td
            key={date}
            className="sum-num"
            title={`${n} of these ${players.length} play on this day`}
          >
            {n > 0 ? n : '—'}
          </td>
        );
      })}
    </>
  );
}

interface RowHandlers {
  onOpenDetails: (key: string) => void;
}

/** The shared leading cells of a summary row: headshot, name (link), opponent.
 *
 *  The opponent cell is dropped in **both** of the table's other readings, and
 *  in each it is replaced by the `G` column. In schedule mode it would be a
 *  thirteenth of the same fact — that column is one representative game's
 *  matchup and the whole table beside it is every game of the span; under the
 *  projected lens it would name one fixture of a week the reader has just been
 *  moved into the future of. See `ProjectedGamesHead`. */
function LeadCells({
  r,
  game,
  role,
  corner,
  showOpponent,
  lineup,
  onOpenDetails,
}: {
  r: PlayerReport;
  game: PlayerGame | null;
  role: LiveRole | null;
  corner: Corner;
  showOpponent: boolean;
  /** The projection's own lineup decisions for this man, where the lens is on
   *  and there is a lineup to fill — what the slot chip says instead of today's
   *  ESPN slot. `undefined` off the lens, `null` where there is no lineup. */
  lineup?: ProjectedPlayerLine['lineup'];
} & RowHandlers) {
  return (
    <>
      <td className="sum-img-col">
        <SumPhoto
          id={r.id}
          playerKey={playerKey(r)}
          name={r.name}
          role={role}
          corner={corner}
          status={<SumStatus r={r} />}
          onOpen={onOpenDetails}
        />
      </td>
      <th className="sum-name-col" scope="row">
        {/* Ahead of the name rather than after it, and only on this table: the
            slot is what you scan a fantasy roster by, so it leads. Outside the
            button, since the name is a link to that player's page and a slot
            chip is a label rather than part of what you are pressing. It leads
            the whole identity block rather than the name line inside it — the
            chip is one fact about the row, not a second line of who he is, and
            a 42px floor plus `align-items: center` is what keeps every name in
            the column starting at one x against a two-line block. */}
        {/* **Under the lens the chip answers for the days ahead**, which is a
            different question from the one it answers the rest of the time: the
            ordinary chip names the slot ESPN has him in on the last day of the
            range, and over a span nobody has played there is no such slot —
            there is a set of lineup decisions, which is what the projection has
            just made. So the lens swaps it for the count of them. Where there
            is no lineup to fill (a saved watchlist, a league with no slot
            counts) `lineup` is null and the day chip stands, which is also what
            every non-fantasy reader sees. */}
        {lineup ? (
          <ProjectedSlotTag lineup={lineup} />
        ) : (
          <FantasySlotTag playerKey={playerKey(r)} />
        )}
        {/* **His club and his positions, under the name** — the research
            board's identity block, drawn by the same component (see
            `PlayerIdentity`). This table said neither: which club a man plays
            for, and where a fantasy league will let you start him, are the two
            standing facts about a roster row, and the only column with slack
            to spend is the one already carrying his name. */}
        <RowIdentity r={r}>
          {/* The name opens his player page, exactly as the headshot beside it
              does. It used to jump to his card on the feed's grouped reading —
              the page that reading has since become *is* the player page, whose
              Overview tab opens on the very day the jump was for, so the two
              controls lead to one place rather than to two. */}
          <button
            type="button"
            className="sum-name sum-name-link"
            title={`${r.name} — player page`}
            onClick={() => onOpenDetails(playerKey(r))}
          >
            {r.name}
          </button>
          {/* And the newspaper, on the same terms it takes on the research
              board: a fact about the player rather than about the row's
              numbers, after the name and before the sub-line. This is the one
              table read *as a roster*, so "he was in the news this morning" is
              the IL placement a manager most needs to be told about — and the
              name column is the one column here with slack to absorb it (see
              `PlayerIdentity`). */}
          <PlayerNewsMark id={r.id} name={r.name} />
          {/* The status is on the headshot (`PhotoStatus`), not here: an injured
              player is on this table whenever the hide-injured toggle is off, so
              the row must say why its stats are dashes — but it can say it in
              four characters on a circle the row already draws, instead of a
              chip that widens the one column this table can least afford. */}
        </RowIdentity>
      </th>
      {showOpponent && <OpponentCell r={r} game={game} />}
    </>
  );
}

/** The batter stat table: one row per hitter, with an aggregate total row. */
/** Full-page state, handed down to whichever table renders the corner cell the
 *  button sits in. */
type Expand = { isFull: boolean; toggle: () => void };

/**
 * **What the foot row is a total *of*, said in the label** — because under the
 * lens it stops being the sum of the column above it.
 *
 * This table's standing rule is that a reader can add a column up and get the
 * figure at the foot: the server rounds each projected component to a tenth
 * precisely so what is totalled is what was printed. The lineup reading breaks
 * that on purpose — the rows say what each man would do **if you started him**
 * and the foot adds only the days the lineup has room for him, so on a roster
 * with more bats than seats the two genuinely differ (measured on the live
 * league: rows 59.5 games against a lineup of 48.5).
 *
 * A departure that large has to be **named where it is read**, not explained in
 * a tooltip: half this app's traffic has no hover, and a foot reading `Total`
 * that disagrees with its own column is the kind of quiet wrongness the rest of
 * this file is written to avoid. So the word changes with the arithmetic —
 * `Total` when it is the column's, **`Lineup`** when it is the plan's — and the
 * tooltip carries the sentence.
 */
/**
 * **Who the `Total` row is a total of, and where it falls in the table.**
 *
 * The row used to be a `<tfoot>` under every player on the tab — starters,
 * bench and injured list alike — which made the most useful row on the table
 * the one figure nobody could act on: `what my roster would score if all
 * sixteen of them could bat`. What a manager reads a roster to find out is what
 * *tonight's* team is worth, and that is the men above the line.
 *
 * So the table is cut in two and the row is the cut: **starters, the total,
 * then the bench and the injured**. It is a divider inside the body rather than
 * a foot, so it is no longer pinned to the bottom of the pane — a divider that
 * followed the scroll would sit across the middle of the rows it is meant to
 * separate, and there is nothing left for it to be the foot *of*.
 *
 * **Who is a starter is not this component's decision**, and deliberately: the
 * app already has exactly one answer to that question and it is the `Starters`
 * filter's — `lib.ts::projectStarters`, called once in `App.tsx` whether the
 * filter is pressed or not, and handed down here as the set of keys it keeps.
 * A second test written here is a second test that will one day disagree with
 * the button, and the two would disagree *silently*, the button narrowing to
 * one set while the line above the total drew another.
 *
 * **Under the projected lens the plan answers, and that is the same rule
 * rather than an exception to it.** There is still exactly one test in this app
 * for who is starting, and over days nobody has played it is not ESPN's
 * lineup: that one describes today, and on a future span the `Starters`
 * filter's own fallback is today's lineup carried forward — a guess, where the
 * projection has just filled every one of those days seat by seat. So a man the
 * plan starts on any day of the span is above the line, the foot beside it adds
 * up precisely the men it seated, and the chip in each name column already says
 * which of them they are. The two halves of a straddling range each take their
 * own answer: the plan for the days ahead, `starters` for the days behind, so
 * nothing a man banked on Monday falls out of the foot because Thursday's
 * lineup has no room for him.
 *
 * That means the word carries the filter's own two readings and its own edge
 * cases, which are argued in full at `projectStarters`: on your own roster a
 * starter is a man in tonight's posted lineup or named as today's starting
 * pitcher (the field the pip on his headshot is drawn from), and on a fantasy
 * team he is a man *you* started on some day of the range, however his real
 * manager has him. **A player the app cannot place is below the line**, which
 * is the filter's own answer — it keeps what it can name and drops the rest —
 * and it is the conservative direction: a man counted into a lineup he is not
 * in overstates the row that is read as *what is tonight worth*, where one left
 * out of it merely sits with the bench and adds up on his own row as before.
 *
 * **Two degenerate cases, and both are the old table exactly.** With nobody
 * above the line — no lineup posted yet this morning, or a range the filter is
 * not offered over at all, where `starters` is null — a divider would divide
 * nothing and label a total of nought, so the row goes back to the bottom over
 * everybody. With nobody *below* it — the filter already pressed, or a team
 * every man of which is in the lineup — it is at the bottom for the ordinary
 * reason, that there is nothing after it. The rule reads the same at both ends:
 * the row totals what is above it, and what is above it is the whole table
 * whenever the split has nothing to say.
 */
function splitStarters(
  players: PlayerReport[],
  starters: Set<string> | null,
  projection: ProjectedLines | null,
  slots: Map<string, FantasySlot> | null,
): { top: PlayerReport[]; rest: PlayerReport[] } {
  // Under the lens the plan is the answer — see the paragraph above. Splitting
  // on anything else puts a man above a `Lineup` total his own seat is not in.
  // And it is the **column's** own count that decides, both halves of it: the
  // ordinary press straddles today, so a projected span has a played half the
  // plan does not answer for and which must not be allowed to drop — a man you
  // started on Monday and the projection benches on Thursday earned you Monday,
  // his row carries it, and the foot beside this line adds it up. One test for
  // the line and the figure printed on it.
  const plan = projection && players.some((r) => projection.get(playerKey(r))?.lineup != null);
  const isTop = plan
    ? (r: PlayerReport) =>
        startsOf(r, projection!.get(playerKey(r)), slots?.get(playerKey(r)) ?? null) > 0
    : starters
      ? (r: PlayerReport) => starters.has(playerKey(r))
      : null;
  if (!isTop) return { top: players, rest: [] };
  const top = players.filter(isTop);
  if (top.length === 0 || top.length === players.length) return { top: players, rest: [] };
  return { top, rest: players.filter((r) => !isTop(r)) };
}

/**
 * The label on the divider, and the count is the count of what it totals.
 *
 * **`Total` or `Lineup` is which arithmetic the figures beside it are** — see
 * *A row is what he would do if he plays; the foot is what the lineup gets*.
 * **`n` is who** — and now that the row can have players under it as well as
 * over it, that number is the men above the line rather than the men on the
 * tab, which is the whole point of moving it: `Total · 9` on a sixteen-man
 * roster is a figure a manager can act on where `Total · 16` never was.
 *
 * **And the count says how many it left out**, which is what the sentence above
 * this one used to hand to the title: *nine of sixteen and nine of nine read
 * identically*, so the label printed `· 9` and a hover explained the rest.
 * That is the same fault the word beside it was changed to fix — half this
 * app's traffic has no hover, and a number a reader cannot act on is worse for
 * being explained somewhere they will never look. So the denominator is
 * printed: **`Lineup · 11 of 14`** where the line has men under it, and
 * **`Lineup · 11`** where it has none, since `11 of 11` is a fraction that
 * divides nothing. It is the app's own `n of n` — the form the projected chip
 * and the `Starts` column's title already say a span in.
 *
 * **It costs the label 35.7px and the table nothing**, measured under the lens
 * on the live fantasy roster over 8/21–8/23: `Lineup · 11` **69.1 → 104.8px**
 * on the batting table and `Lineup · 10` **71.3 → 107.1** on the pitching one,
 * at **1400, 390 and 320 alike** — the string is the same width at every one of
 * them, the label being text in a cell nothing else is competing for. The name
 * column is **292.1 / 205.9px at 1400, 226.2 / 167.5 at 390 and 221.0 / 164.9
 * at 320 before and after**, the table **1472.6 / 857.5 / 814.6** at the three,
 * the divider **48.00px**, the rows 58.00, the header 51.00, the pinned
 * headshot column at **left: 0**, and page-body overflow **0**. The label is
 * **16.0px tall** at all three widths, which is one line: nothing wraps.
 *
 * And the two branches, read off the same page — hide the injured
 * (`hideil=1`) and the batting table has nobody left under the line, so it goes
 * back to **`Lineup · 11` at 69.1px** while the pitching table keeps two below
 * and reads **`Lineup · 10 of 12`**.
 *
 * The title still says *what* is down there, which a fraction cannot: a
 * denominator names a size, not a bench and an injured list.
 */
function TotalLabel({ n, all, lineup }: { n: number; all: number; lineup: boolean }) {
  /** Anything below the line — the two counts are one partition, so this is the
   *  same question `rest.length > 0` asks at the call site and cannot come to
   *  disagree with the number printed beside it. */
  const split = all > n;
  const only = split ? ' Only the players above this line are in it; the bench and the injured are below it.' : '';
  return (
    <span
      className="sum-total-label"
      title={
        lineup
          ? `What your projected lineup gets — only the days each man holds a lineup spot. The rows above say what each would do if you started him, so this is deliberately less than their sum.${only}`
          : split
            ? `Your starters, added up.${only}`
            : undefined
      }
    >
      {lineup ? 'Lineup' : 'Total'} · {split ? `${n} of ${all}` : n}
    </span>
  );
}

function BatterTable({
  batters,
  handlers,
  expand,
  schedule,
  projection,
  starters,
}: {
  batters: PlayerReport[];
  handlers: RowHandlers;
  expand: Expand;
  schedule: ScheduleIndex | null;
  /** The projected reading, or null for the ordinary one — the mode is the
   *  *presence of the map* rather than a flag beside one, which is the rule
   *  `schedule` already follows and what makes "projected with no projection"
   *  impossible to draw. */
  projection: ProjectedLines | null;
  /** Who sits above the `Total` line — see `splitStarters`. */
  starters: Set<string> | null;
}) {
  const lineOf = (r: PlayerReport): BattingLine =>
    projection ? projectedBatting(r, projection.get(playerKey(r))) : combineLines(r.games.map((g) => g.line));
  const slots = useFantasyRoster();
  const { top, rest } = splitStarters(batters, starters, projection, slots);
  /** Whether the plan filled a lineup at all — what the `Starts` column is
   *  drawn on. Over the whole tab rather than over `top`, so the header and
   *  the cells under it cannot disagree about how many columns there are. */
  const anyLineup = projection != null && batters.some((r) => projection.get(playerKey(r))?.lineup != null);
  // The total's two arithmetics are one arithmetic wherever no lineup was
  // filled — a saved watchlist, a league with no slot counts — and the label
  // says `Total` there, which is what it has always said. Read off `top`
  // rather than the tab, since that is what the row is a total of.
  const hasPlan = top.some((r) => projection?.get(playerKey(r))?.lineup != null);
  const total = projection
    ? combineLines(top.map((r) => projectedBatting(r, projection.get(playerKey(r)), true)))
    : combineLines(top.flatMap((r) => r.games.map((g) => g.line)));
  const cols = ['H/AB', 'R', 'HR', 'RBI', 'SB', 'OPS', 'BB', 'K'];
  /* One row, drawn from either side of the line — the two groups are the same
     rows in two `<tbody>`s, so this is a function rather than a copy of the
     markup. */
  const row = (r: PlayerReport) => {
    const game = pickGame(r);
    const role = liveRole(r);
    return (
      <tr key={r.id} className={role ? `role-${role}` : undefined}>
        <LeadCells
          r={r}
          game={game}
          role={role}
          corner={game ? lineupCorner(game) : null}
          showOpponent={!schedule && !projection}
          lineup={projection?.get(playerKey(r))?.lineup}
          {...handlers}
        />
        {schedule ? (
          <ScheduleCells index={schedule} r={r} />
        ) : (
          <>
            {projection && (
              <ProjectedGamesCell n={projectedGames(r, projection.get(playerKey(r)))} />
            )}
            {anyLineup && (
              <ProjectedStartsCell
                r={r}
                lineup={projection?.get(playerKey(r))?.lineup}
                spot={slots?.get(playerKey(r)) ?? null}
              />
            )}
            <ProjectableStatCells line={lineOf(r)} projected={projection != null} />
          </>
        )}
      </tr>
    );
  };
  return (
    <table className="summary-table">
      <thead>
        <tr>
          <th className="sum-img-col" scope="col">
            <span className="sr-only">Photo</span>
            <ExpandButton isFull={expand.isFull} onToggle={expand.toggle} what="table" />
          </th>
          <th className="sum-name-col" scope="col">
            Batter
          </th>
          {schedule ? (
            <ScheduleHeadCells index={schedule} kind="batter" />
          ) : (
            <>
              {projection ? (
                <ProjectedGamesHead kind="batter" />
              ) : (
                <th className="sum-opp-col" scope="col">
                  Opponent
                </th>
              )}
              {/* **How often the plan starts him**, which the slot chip used to
                  carry and which belongs in a column — see
                  `ProjectedStartsHead`. */}
              {anyLineup && <ProjectedStartsHead kind="batter" />}
              {cols.map((c) => (
                <th key={c} className="sum-num" scope="col">
                  {c}
                </th>
              ))}
            </>
          )}
        </tr>
      </thead>
      <tbody>{top.map(row)}</tbody>
      {/* A `<tbody>` of its own, which is what keeps the zebra stripe honest:
          `tbody tr:nth-child(even)` counts within its own body, so the divider
          is always the first row of its and takes no stripe, and the group
          under it stripes from its own first row rather than from a parity the
          line happened to leave behind. */}
      <tbody className="sum-total-body">
        <tr className="sum-total-row">
          <td className="sum-img-col" aria-hidden="true" />
          <th className="sum-name-col" scope="row">
            <TotalLabel n={top.length} all={batters.length} lineup={hasPlan} />
          </th>
          {schedule ? (
            <ScheduleTotalCells index={schedule} players={top} kind="batter" />
          ) : (
            <>
              {projection ? (
                /* The same sum the schedule mode's own `G` total is: every
                   row's count added up, so a reader can add the column and get
                   the figure at the foot of it. */
                <ProjectedGamesCell
                  n={top.reduce(
                    (n, r) => n + projectedGames(r, projection.get(playerKey(r)), true),
                    0,
                  )}
                />
              ) : (
                <td className="sum-opp" aria-hidden="true" />
              )}
              {anyLineup && (
                <ProjectedStartsTotal
                  n={top.reduce(
                    (n, r) =>
                      n +
                      startsOf(r, projection!.get(playerKey(r)), slots?.get(playerKey(r)) ?? null),
                    0,
                  )}
                />
              )}
              <ProjectableStatCells line={total} projected={projection != null} />
            </>
          )}
        </tr>
      </tbody>
      {rest.length > 0 && <tbody>{rest.map(row)}</tbody>}
    </table>
  );
}

/** The pitcher stat table: one row per pitcher, with an aggregate total row. */
function PitcherTable({
  pitchers,
  handlers,
  expand,
  schedule,
  projection,
  starters,
}: {
  pitchers: PlayerReport[];
  handlers: RowHandlers;
  expand: Expand;
  schedule: ScheduleIndex | null;
  /** See `BatterTable`'s own. */
  projection: ProjectedLines | null;
  /** See `BatterTable`'s own, and `splitStarters`. */
  starters: Set<string> | null;
}) {
  const lineOf = (r: PlayerReport): PitchingLine =>
    projection ? projectedPitching(r, projection.get(playerKey(r))) : aggregatePitching(r);
  const slots = useFantasyRoster();
  const { top, rest } = splitStarters(pitchers, starters, projection, slots);
  /** See `BatterTable`'s own. */
  const anyLineup = projection != null && pitchers.some((r) => projection.get(playerKey(r))?.lineup != null);
  /** See `BatterTable`'s own. */
  const hasPlan = top.some((r) => projection?.get(playerKey(r))?.lineup != null);
  const totalLine = projection
    ? combinePitchingLines(top.map((r) => projectedPitching(r, projection.get(playerKey(r)), true)))
    : combinePitchingLines(
        top.flatMap((r) => r.games.filter((g) => g.pitching).map((g) => g.pitching!.line)),
      );
  const cols = ['IP', 'H', 'R', 'ER', 'BB', 'K', 'HR', 'W', 'SV', 'HLD', 'ERA', 'WHIP'];
  /** See `BatterTable`'s own. */
  const row = (r: PlayerReport) => {
    const game = pickGame(r);
    const role = liveRole(r);
    return (
      <tr key={r.id} className={role ? `role-${role}` : undefined}>
        <LeadCells
          r={r}
          game={game}
          role={role}
          corner={game ? pitchingCorner(game) : null}
          showOpponent={!schedule && !projection}
          lineup={projection?.get(playerKey(r))?.lineup}
          {...handlers}
        />
        {schedule ? (
          <ScheduleCells index={schedule} r={r} />
        ) : (
          <>
            {projection && (
              <ProjectedGamesCell n={projectedGames(r, projection.get(playerKey(r)))} />
            )}
            {anyLineup && (
              <ProjectedStartsCell
                r={r}
                lineup={projection?.get(playerKey(r))?.lineup}
                spot={slots?.get(playerKey(r)) ?? null}
              />
            )}
            <ProjectablePitchCells line={lineOf(r)} projected={projection != null} />
          </>
        )}
      </tr>
    );
  };
  return (
    <table className="summary-table summary-table-pitchers">
      <thead>
        <tr>
          <th className="sum-img-col" scope="col">
            <span className="sr-only">Photo</span>
            <ExpandButton isFull={expand.isFull} onToggle={expand.toggle} what="table" />
          </th>
          <th className="sum-name-col" scope="col">
            Pitcher
          </th>
          {schedule ? (
            <ScheduleHeadCells index={schedule} kind="pitcher" />
          ) : (
            <>
              {projection ? (
                <ProjectedGamesHead kind="pitcher" />
              ) : (
                <th className="sum-opp-col" scope="col">
                  Opponent
                </th>
              )}
              {/* **How often the plan starts him**, which the slot chip used to
                  carry and which belongs in a column — see
                  `ProjectedStartsHead`. */}
              {anyLineup && <ProjectedStartsHead kind="pitcher" />}
              {cols.map((c) => (
                <th key={c} className="sum-num" scope="col">
                  {c}
                </th>
              ))}
            </>
          )}
        </tr>
      </thead>
      <tbody>{top.map(row)}</tbody>
      {/* See `BatterTable`'s own note on why the divider is a body of its own. */}
      <tbody className="sum-total-body">
        <tr className="sum-total-row">
          <td className="sum-img-col" aria-hidden="true" />
          <th className="sum-name-col" scope="row">
            <TotalLabel n={top.length} all={pitchers.length} lineup={hasPlan} />
          </th>
          {schedule ? (
            <ScheduleTotalCells index={schedule} players={top} kind="pitcher" />
          ) : (
            <>
              {projection ? (
                <ProjectedGamesCell
                  n={top.reduce(
                    (n, r) => n + projectedGames(r, projection.get(playerKey(r)), true),
                    0,
                  )}
                />
              ) : (
                <td className="sum-opp" aria-hidden="true" />
              )}
              {anyLineup && (
                <ProjectedStartsTotal
                  n={top.reduce(
                    (n, r) =>
                      n +
                      startsOf(r, projection!.get(playerKey(r)), slots?.get(playerKey(r)) ?? null),
                    0,
                  )}
                />
              )}
              <ProjectablePitchCells line={totalLine} projected={projection != null} />
            </>
          )}
        </tr>
      </tbody>
      {rest.length > 0 && <tbody>{rest.map(row)}</tbody>}
    </table>
  );
}

/**
 * The key to the row tints, drawn under the table.
 *
 * **It is always drawn, and it always names all four rules.** Both halves of
 * that are a reversal, and both reversals are the same correction: this is a
 * *key to the app's color vocabulary*, not a report on what happens to be live
 * this half-inning.
 *
 * What stood here argued the opposite, and the argument reads well until you
 * meet it on a page. It was gated on `anyLive` — something on screen actually
 * at bat, on deck, on base or on the mound — by analogy with the marks the app
 * suppresses when they would say nothing: the research board's roster baseball
 * when every row carries one, the kind tabs when only one kind is watched. The
 * analogy does not hold. Those are marks *on* the data, and a mark on every row
 * distinguishes nothing; this is a **legend**, and a legend's whole job is to be
 * there before you need it. The effect of the gate was that the one time a
 * reader goes looking for it — a quiet morning, a tinted row they have not seen
 * before, "what does the purple mean" — is precisely the time it was not on the
 * page. And it made the key flicker: it appeared at first pitch and vanished at
 * the last out, on a table the reader had not touched.
 *
 * The contents were per-kind for a related reason and cost the same thing: the
 * batter tab drew the three batting roles and the pitcher tab the one pitching
 * role, so **"On mound" could not be read from the Batters tab at all** — you
 * had to already know the purple meant something in order to go and find out
 * what. A vocabulary is not per-page. All four are drawn on both tabs, which
 * also puts the on-base and on-mound swatches side by side for the first time —
 * and that is what showed they were **literally the same color**. It was
 * argued for at the time as the app's own convention (a man on base and a man on
 * the mound are both *in the game right now*), which reads well and is wrong
 * where it matters: a key exists to tell one shade from another, so two labels
 * over one swatch is the key saying these are the same row tint when the table
 * calls them two roles. On the mound has its own color now — `--mound-teal`,
 * beside `--live-purple` in `styles.css`, where the hue and the measured gaps
 * between all four grounds are set out.
 *
 * What the gate was really protecting is real: the row cost the pane its
 * height, this view being a fixed-height column where every pixel under the
 * table is a row of players off the bottom of it. That was a fixed ~36px rather
 * than a row that came and went — and it is **nothing** now, the key having
 * moved inside the pane, under the last row, where it scrolls instead of
 * standing on the window's bottom edge. Measured: pane 694 → 731 at 1400 and
 * 650 → 687 at 390, which is the legend's own 37px given back. See where it is
 * rendered for the two decisions that took (whose width it centers in, and why
 * it is sticky on the horizontal axis alone).
 *
 * The labels are `liveRoleLabel`'s, the same strings the live tag on a feed row
 * and a player card carry, and the swatches read the same `--role-*` tokens the
 * row tints do, so the key and the thing it explains cannot come to call one
 * role by two names or paint it in two colors.
 */
function RoleLegend() {
  return (
    <div className="summary-legend">
      {ALL_ROLES.map((role) => (
        <span key={role} className="summary-legend-item">
          <span className={`summary-legend-swatch role-${role}`} aria-hidden="true" />
          {liveRoleLabel(role)}
        </span>
      ))}
    </div>
  );
}

/** Every rule the row tints can express, in the order a half-inning runs
 *  through them — at the plate, next up, aboard, and the man throwing. */
const ALL_ROLES: LiveRole[] = ['at-bat', 'on-deck', 'on-base', 'pitching'];

/**
 * A full-page stat table over the date range — batters and pitchers in separate
 * stacked tables (each with its own columns + total row). The header/total rows
 * stick vertically and the headshot column sticks horizontally.
 */
export function SummaryTable({
  reports,
  onOpenDetails,
  chrome,
  paneChrome,
  schedule,
  projection,
  starters,
}: {
  reports: PlayerReport[];
  /** The headshot and the name both open the player's page — the one that leads
   *  with his day. */
  onOpenDetails: (key: string) => void;
  /**
   * The Schedule view: the days ahead in place of the stat columns.
   *
   * Null is the ordinary table, so the mode is the *presence of an index*
   * rather than a flag beside one — which is what makes "on but still reading"
   * impossible to draw. App holds the flag and hands this down only once the
   * window has landed, so the table never has a schedule mode with no schedule
   * in it.
   */
  schedule?: ScheduleIndex | null;
  /**
   * The projected reading: what these players are expected to do over the days
   * in view that have not been played, added to what they have already done.
   *
   * **The whole `RosterProjection` rather than the map it is reduced to**,
   * because the caption above the table is drawn from the rest of it — the span
   * actually projected, and how many days of it still have a game. Null is the
   * ordinary table, so the mode is again the *presence of the answer* rather
   * than a flag beside one: App hands this down only once the read has landed,
   * and until then the table goes on drawing what it has, which is rule 1 of
   * the app's loading system.
   *
   * It is **exclusive with `schedule`** — that one replaces the stat columns
   * and this one replaces the figures in them, so they cannot both be a
   * reading of the same cells. App turns one off when the other goes on, and
   * this component draws the schedule where it is given both.
   */
  projection?: RosterProjection | null;
  /**
   * **Which of these players are starting**, as the app's own player keys —
   * the set `lib.ts::projectStarters` keeps, which is the `Starters` filter's
   * own answer and is computed in App whether that button is pressed or not.
   *
   * They are drawn above the `Total` row and everybody else below it; null is
   * *the app cannot say* — a range the filter is not offered over — and there
   * the row goes back to the bottom over the whole table. See `splitStarters`
   * for the whole of that rule and for why the test is not written here.
   */
  starters?: Set<string> | null;
  /** What to keep from the app's own chrome once the table has the page: the
   *  kind tabs and the date control, handed down as nodes because App owns both
   *  the state behind them and the markup. Rendered only while expanded. */
  chrome?: ReactNode;
  /**
   * **The app's tools row and date bar, drawn inside this table's own
   * scroller.**
   *
   * The Roster view is a viewport-tall flex column in which only
   * `.summary-scroll` scrolls, and `position: sticky` sticks to the box that
   * scrolls — so a date bar rendered *above* this pane is pinned to a column
   * that never moves, while the header row inside it is pinned to the pane. Two
   * boxes stuck to two different edges, drawn as one band, with the first row
   * of the table lost in the difference.
   *
   * As the pane's first children they stick to the same scrollport, one under
   * the other: the tools row scrolls away with the rows, the bar holds at the
   * top of the pane, and the header row holds directly under the bar (the
   * stylesheet reads `--date-bar-h` for that offset, measured because the bar's
   * own height is). Nodes rather than props, for the reason `chrome` is: App
   * owns the state behind both and the markup of both.
   */
  paneChrome?: ReactNode;
}) {
  const handlers = { onOpenDetails };
  // Keyed by the app's own `${kind}-${id}`, so a two-way player's bat and his
  // arm carry their own projections exactly as they carry their own rows.
  const projLines = useMemo<ProjectedLines | null>(
    () => (projection ? new Map(projection.players.map((p) => [p.key, p])) : null),
    [projection],
  );
  const batters = reports.filter((r) => r.kind !== 'pitcher');
  const pitchers = reports.filter((r) => r.kind === 'pitcher');
  const { isFull, toggle, ref: fullRef } = useFullPage<HTMLDivElement>();
  const expand = { isFull, toggle };
  /**
   * **The game preview an opponent cell opens, held here rather than in the
   * cell.** One at a time, which is what a dialog is, and the state that goes
   * with it — the opposing club's board — is a read this table should make once
   * per club rather than once per cell.
   *
   * The two shapes are the two readings of this table: the stats reading holds
   * a `PlayerGame` and raises the feed's own `UpcomingPreview`; the Schedule
   * view holds a `ScheduleGame` and raises the player page's `SchedulePreview`,
   * which is the one that can read a fixture nobody has been named for. Both
   * are the components those surfaces already draw, so a game opened from a
   * roster row and the same game opened from the feed answer alike.
   */
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  /* Keyed on whose preview is open, so a board read for one man is dropped when
     the next opens — `useOpponentBoards`'s own contract. */
  const { opps, load } = useOpponentBoards(preview?.report.id ?? 0);
  const openPreview = useCallback((t: PreviewTarget) => {
    // A pitcher's dialog reads the opposing club's line, and the read is started
    // by the press exactly as the Schedule row starts it — the dialog itself
    // draws the three loading states.
    if (t.report.kind === 'pitcher') {
      const oppId =
        t.kind === 'game'
          ? t.game.opponentId
          : t.game.homeId === t.report.teamId
            ? t.game.awayId
            : t.game.homeId;
      if (oppId) load(oppId);
    }
    setPreview(t);
  }, [load]);
  return (
    /* Full page is a class on this box, not the Fullscreen API — see
       `hooks.ts::useFullPage`. The button that sets it is down in the table's
       corner header cell, which is pinned on both axes and so is always the way
       back out. */
    <PreviewDoorContext.Provider value={openPreview}>
    <div ref={fullRef} className={`summary-view${isFull ? ' is-expanded' : ''}`}>
      {/* **The preview, drawn once for the whole table.** `Modal` portals it,
          so where it sits in this tree decides nothing about where it paints —
          only which state it can see, which is the reason it is here. */}
      {preview?.kind === 'game' && (
        <UpcomingPreview
          report={preview.report}
          game={preview.game}
          onOpenDetails={onOpenDetails}
          onClose={() => setPreview(null)}
        />
      )}
      {preview?.kind === 'fixture' && schedule && preview.report.teamId !== null && (
        <SchedulePreview
          report={preview.report}
          game={preview.game}
          index={schedule}
          teamId={preview.report.teamId}
          name={preview.report.name}
          isPitcher={preview.report.kind === 'pitcher'}
          tier={startTierOn(schedule, preview.game, preview.report.teamId, preview.report.id)}
          opp={
            opps[
              preview.game.homeId === preview.report.teamId
                ? preview.game.awayId
                : preview.game.homeId
            ]
          }
          onLoad={load}
          onOpenDetails={onOpenDetails}
          onClose={() => setPreview(null)}
        />
      )}
      {/* Expanded, the app's header and tab rows are behind this box — but
          which kind the table is showing and which days it covers are not
          decoration, they are what the numbers *are*, and both are controls you
          reach for while reading. They come along; nothing else does. */}
      {isFull && chrome && <div className="expanded-chrome">{chrome}</div>}
      {/* The table's caption, directly above the pane — see `ProjectionNote`.
          Not drawn in schedule mode, where the columns are days rather than
          figures and there is nothing for it to be a caption to. */}
      {projection && !schedule && <ProjectionNote p={projection} />}
      {/* `has-pane-chrome` is what the header row's sticky offset reads: with
          the bar in here it holds at `--date-bar-h`, and without it at 0. A
          class rather than `:has(> .date-bar)` because the condition is *whose*
          bar it is rather than whether one is present — the expanded box draws
          its own above the pane, and a header row stuck 54px down under nothing
          is a band of table showing through the gap. */}
      <div className={`summary-scroll${paneChrome && !isFull ? ' has-pane-chrome' : ''}`}>
        {/* The app's own tools row and date bar, in here rather than above —
            see `paneChrome`. First, because the bar sticks to the top of this
            pane and the header row sticks under it.

            **Not while expanded**, where `.expanded-chrome` above the pane
            already carries them: that box is a fixed-height column of its own
            with its own 12px gutter, so the bar is above the scroller there and
            the header row sticks at the pane's own top, which is the
            arrangement that mode has always had. Rendering both would be two
            date bars on one screen. */}
        {!isFull && paneChrome}
        {/* The tables sit in one max-content flex column so the narrower of the
            two stretches to the other's width — otherwise the batter table (fewer
            columns) would stop short of the scrolled-right edge. */}
        <div className="summary-tables">
          {batters.length > 0 && (
            <BatterTable
              batters={batters}
              handlers={handlers}
              expand={expand}
              schedule={schedule ?? null}
              projection={schedule ? null : projLines}
              starters={starters ?? null}
            />
          )}
          {pitchers.length > 0 && (
            <PitcherTable
              pitchers={pitchers}
              handlers={handlers}
              expand={expand}
              schedule={schedule ?? null}
              projection={schedule ? null : projLines}
              starters={starters ?? null}
            />
          )}
        </div>
        {/* The key to the row tints — always, and the whole vocabulary, however
            quiet the day is. See `RoleLegend`.

            **Inside the pane, under the last row**, which is where it stopped
            being a strip of chrome held against the bottom of the window. This
            view is a viewport-tall flex column where only the table scrolls, so
            a legend *outside* the pane is pinned by construction: it sat on the
            window's own bottom edge at every scroll position and cost the rows
            37px of a screen that has nothing else to give. A key is a thing you
            go and look at, not a thing that follows you — so it scrolls with
            the rows it explains, and reaching the last one is what brings it
            into view.

            A sibling of `.summary-tables` rather than a child of it: that
            column is `width: max-content`, so a key inside it is centered on
            the *table's* width and on a phone lands half off the right of a
            screen the reader has not scrolled yet. Out here it takes the
            scroller's own width and centers in the viewport at every width —
            and takes `position: sticky; left: 0` so a reader scrolled out to
            the K column still has it, which is the horizontal half of the
            pinning this table already does for the headshot column. */}
        <RoleLegend />
      </div>
    </div>
    </PreviewDoorContext.Provider>
  );
}
