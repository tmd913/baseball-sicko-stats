import { useState } from 'react';
import { FantasySlotTag } from './FantasySlot';
import { ExpandButton } from './ExpandButton';
import { useFullPage } from '../hooks';
import type { BattingLine, PitchingLine, PlayerGame, PlayerReport } from '../types';
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
  lineupCorner,
  liveRole,
  lineOps,
  mostRecentGameFirst,
  pitchingCorner,
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
function OpponentCell({ game }: { game: PlayerGame | null }) {
  if (!game) return <td className="sum-opp sum-opp-empty">—</td>;
  const { kind, score, detail } = gameStatusView(game);
  const matchup = `${game.isHome ? 'vs' : '@'} ${game.opponent}`;
  const scheduled = kind === 'scheduled';
  const sp = scheduled ? game.probablePitcher : null;
  return (
    <td className={`sum-opp sum-opp-${kind}`}>
      <span className="sum-opp-main">
        {scheduled ? matchup : (score ?? matchup)}
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

/** The player's aggregate batting line for the range, shown as one table row. */
function StatCells({ line }: { line: BattingLine }) {
  const ops = lineOps(line);
  return (
    <>
      <td className="sum-num sum-hab">
        {line.hits}/{line.ab}
      </td>
      <td className="sum-num">{line.runs}</td>
      <td className="sum-num">{line.hr}</td>
      <td className="sum-num">{line.rbi}</td>
      <td className="sum-num">{line.sb}</td>
      <td className="sum-num">{ops !== null ? formatRate(ops) : '—'}</td>
      <td className="sum-num">{line.bb}</td>
      <td className="sum-num">{line.so}</td>
    </>
  );
}

/** A pitcher's aggregate line + rates for the range, shown as one table row. */
/**
 * A win / save / hold count, dashed at zero — these columns are empty for almost
 * every row, and a column of noughts reads as data when it isn't.
 */
function CreditCell({ n }: { n: number }) {
  return <td className="sum-num">{n > 0 ? n : '—'}</td>;
}

function PitchStatCells({ line }: { line: PitchingLine }) {
  return (
    <>
      <td className="sum-num sum-hab">{line.outs > 0 ? formatIp(line.outs) : '—'}</td>
      <td className="sum-num">{line.hits}</td>
      <td className="sum-num">{line.runs}</td>
      <td className="sum-num">{line.earnedRuns}</td>
      <td className="sum-num">{line.walks}</td>
      <td className="sum-num">{line.strikeouts}</td>
      <td className="sum-num">{line.hr}</td>
      <CreditCell n={line.wins} />
      <CreditCell n={line.saves} />
      <CreditCell n={line.holds} />
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
 * Headshot for a summary row; falls back to a blank circle when MLB has none.
 * `role` paints the live-role ring (at bat / on deck / on base) and `corner`
 * pins the lineup-spot pip — the same colours and treatment the cards and feed use.
 */
function SumPhoto({
  id,
  playerKey: key,
  name,
  role,
  corner,
  onOpen,
}: {
  id: number;
  playerKey: string;
  name: string;
  role: LiveRole | null;
  corner: Corner;
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
      {corner && (
        <span
          className={`lineup-spot sum-photo-spot spot-${corner.tone}`}
          title={corner.title}
          aria-label={corner.title}
        >
          {corner.text}
        </span>
      )}
    </button>
  );
}

interface RowHandlers {
  onOpenDetails: (key: string) => void;
  onOpenPlayerDay: (key: string) => void;
}

/** The shared leading cells of a summary row: headshot, name (link), opponent. */
function LeadCells({
  r,
  game,
  role,
  corner,
  onOpenDetails,
  onOpenPlayerDay,
}: {
  r: PlayerReport;
  game: PlayerGame | null;
  role: LiveRole | null;
  corner: Corner;
} & RowHandlers) {
  return (
    <>
      <td className="sum-img-col">
        <SumPhoto id={r.id} playerKey={playerKey(r)} name={r.name} role={role} corner={corner} onOpen={onOpenDetails} />
      </td>
      <th className="sum-name-col" scope="row">
        <button
          type="button"
          className="sum-name sum-name-link"
          title={`${r.name} — game log`}
          onClick={() => onOpenPlayerDay(playerKey(r))}
        >
          {r.name}
        </button>
        {/* Outside the button: the name is a link to that player's day, and a
            slot chip is a label rather than part of what you are pressing. */}
        <FantasySlotTag playerKey={playerKey(r)} />
      </th>
      <OpponentCell game={game} />
    </>
  );
}

/** The batter stat table: one row per hitter, with an aggregate total row. */
/** Full-page state, handed down to whichever table renders the corner cell the
 *  button sits in. */
type Expand = { isFull: boolean; toggle: () => void };

function BatterTable({
  batters,
  handlers,
  expand,
}: {
  batters: PlayerReport[];
  handlers: RowHandlers;
  expand: Expand;
}) {
  const total = combineLines(batters.flatMap((r) => r.games.map((g) => g.line)));
  const cols = ['H/AB', 'R', 'HR', 'RBI', 'SB', 'OPS', 'BB', 'K'];
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
          <th className="sum-opp-col" scope="col">
            Opponent
          </th>
          {cols.map((c) => (
            <th key={c} className="sum-num" scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {batters.map((r) => {
          const game = pickGame(r);
          const role = liveRole(r);
          return (
            <tr key={r.id} className={role ? `role-${role}` : undefined}>
              <LeadCells r={r} game={game} role={role} corner={game ? lineupCorner(game) : null} {...handlers} />
              <StatCells line={combineLines(r.games.map((g) => g.line))} />
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td className="sum-img-col" aria-hidden="true" />
          <th className="sum-name-col" scope="row">
            <span className="sum-total-label">Total · {batters.length}</span>
          </th>
          <td className="sum-opp" aria-hidden="true" />
          <StatCells line={total} />
        </tr>
      </tfoot>
    </table>
  );
}

/** The pitcher stat table: one row per pitcher, with an aggregate total row. */
function PitcherTable({
  pitchers,
  handlers,
  expand,
}: {
  pitchers: PlayerReport[];
  handlers: RowHandlers;
  expand: Expand;
}) {
  const totalLine = combinePitchingLines(
    pitchers.flatMap((r) => r.games.filter((g) => g.pitching).map((g) => g.pitching!.line)),
  );
  const cols = ['IP', 'H', 'R', 'ER', 'BB', 'K', 'HR', 'W', 'SV', 'HLD', 'ERA', 'WHIP'];
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
          <th className="sum-opp-col" scope="col">
            Opponent
          </th>
          {cols.map((c) => (
            <th key={c} className="sum-num" scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {pitchers.map((r) => {
          const game = pickGame(r);
          const role = liveRole(r);
          return (
            <tr key={r.id} className={role ? `role-${role}` : undefined}>
              <LeadCells r={r} game={game} role={role} corner={game ? pitchingCorner(game) : null} {...handlers} />
              <PitchStatCells line={aggregatePitching(r)} />
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td className="sum-img-col" aria-hidden="true" />
          <th className="sum-name-col" scope="row">
            <span className="sum-total-label">Total · {pitchers.length}</span>
          </th>
          <td className="sum-opp" aria-hidden="true" />
          <PitchStatCells line={totalLine} />
        </tr>
      </tfoot>
    </table>
  );
}

/**
 * A full-page stat table over the date range — batters and pitchers in separate
 * stacked tables (each with its own columns + total row). The header/total rows
 * stick vertically and the headshot column sticks horizontally.
 */
export function SummaryTable({
  reports,
  onOpenDetails,
  onOpenPlayerDay,
}: {
  reports: PlayerReport[];
  // The headshot opens the player's details; the name jumps to their game log.
  onOpenDetails: (key: string) => void;
  onOpenPlayerDay: (key: string) => void;
}) {
  const handlers = { onOpenDetails, onOpenPlayerDay };
  const batters = reports.filter((r) => r.kind !== 'pitcher');
  const pitchers = reports.filter((r) => r.kind === 'pitcher');
  const { isFull, toggle } = useFullPage();
  const expand = { isFull, toggle };
  return (
    /* Full page is a class on this box, not the Fullscreen API — see
       `hooks.ts::useFullPage`. The button that sets it is down in the table's
       corner header cell, which is pinned on both axes and so is always the way
       back out. */
    <div className={`summary-view${isFull ? ' is-expanded' : ''}`}>
      <div className="summary-scroll">
        {/* The tables sit in one max-content flex column so the narrower of the
            two stretches to the other's width — otherwise the batter table (fewer
            columns) would stop short of the scrolled-right edge. */}
        <div className="summary-tables">
          {batters.length > 0 && (
            <BatterTable batters={batters} handlers={handlers} expand={expand} />
          )}
          {pitchers.length > 0 && (
            <PitcherTable pitchers={pitchers} handlers={handlers} expand={expand} />
          )}
        </div>
      </div>
    </div>
  );
}
