import { useState } from 'react';
import type { BattingLine, PitchingLine, PlayerGame, PlayerReport } from '../types';
import type { LiveRole } from '../lib';
import {
  combineLines,
  combinePitchingLines,
  eraOf,
  formatIp,
  formatRate,
  gameStatusView,
  headshotUrl,
  lineupCorner,
  liveRole,
  lineOps,
  mostRecentGameFirst,
} from '../lib';

/** The lineup-spot pip (batting number, or a red "!" when benched) for a game. */
type Corner = { text: string; title: string; tone: 'in' | 'out' } | null;

/**
 * The game to summarize for a player in the opponent column: prefer the live
 * game, then the next scheduled one, then their most recent — the same priority
 * the nav uses, so the column tracks whatever game is most current. (Stats still
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
 * inning while it's on, and the final score once it's over.
 */
function OpponentCell({ game }: { game: PlayerGame | null }) {
  if (!game) return <td className="sum-opp sum-opp-empty">—</td>;
  const { kind, score, detail } = gameStatusView(game);
  const matchup = `${game.isHome ? 'vs' : '@'} ${game.opponent}`;
  return (
    <td className={`sum-opp sum-opp-${kind}`}>
      <span className="sum-opp-main">{kind === 'scheduled' ? matchup : (score ?? matchup)}</span>
      <span className="sum-opp-detail">{detail}</span>
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
      <td className="sum-num sum-ops">{ops !== null ? formatRate(ops) : '—'}</td>
      <td className="sum-num">{line.bb}</td>
      <td className="sum-num">{line.so}</td>
    </>
  );
}

/** A pitcher's aggregate line + rates for the range, shown as one table row. */
function PitchStatCells({ line, csw }: { line: PitchingLine; csw: number | null }) {
  const whip = line.outs > 0 ? ((line.walks + line.hits) * 3) / line.outs : null;
  return (
    <>
      <td className="sum-num sum-hab">{line.outs > 0 ? formatIp(line.outs) : '—'}</td>
      <td className="sum-num">{line.hits}</td>
      <td className="sum-num">{line.runs}</td>
      <td className="sum-num">{line.earnedRuns}</td>
      <td className="sum-num">{line.walks}</td>
      <td className="sum-num">{line.strikeouts}</td>
      <td className="sum-num">{line.hr}</td>
      <td className="sum-num sum-ops">{eraOf(line)}</td>
      <td className="sum-num">{whip === null ? '—' : whip.toFixed(2)}</td>
      <td className="sum-num">{csw === null ? '—' : `${Math.round(csw * 100)}%`}</td>
    </>
  );
}

/** Aggregate a pitcher's game rates (CSW weighted by pitch count) for the range. */
function aggregatePitching(report: PlayerReport): { line: PitchingLine; csw: number | null } {
  const pitched = report.games.filter((g) => g.pitching);
  const line = combinePitchingLines(pitched.map((g) => g.pitching!.line));
  let cswNum = 0;
  let pitches = 0;
  for (const g of pitched) {
    const pg = g.pitching!;
    if (pg.cswRate !== null) {
      cswNum += pg.cswRate * pg.line.pitchesThrown;
      pitches += pg.line.pitchesThrown;
    }
  }
  return { line, csw: pitches > 0 ? cswNum / pitches : null };
}

/**
 * Headshot for a summary row; falls back to a blank circle when MLB has none.
 * `role` paints the live-role ring (at bat / on deck / on base) and `corner`
 * pins the lineup-spot pip — the same colours and treatment the nav and feed use.
 */
function SumPhoto({
  id,
  name,
  role,
  corner,
  onOpen,
}: {
  id: number;
  name: string;
  role: LiveRole | null;
  corner: Corner;
  onOpen: (id: number) => void;
}) {
  const [failed, setFailed] = useState(false);
  const cls = `sum-photo${role ? ` role-${role}` : ''}`;
  return (
    <button
      type="button"
      className="sum-photo-wrap"
      title={`${name} — details`}
      aria-label={`${name} — details`}
      onClick={() => onOpen(id)}
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
          aria-label={corner.tone === 'out' ? 'Not in lineup' : `Batting ${corner.text}`}
        >
          {corner.text}
        </span>
      )}
    </button>
  );
}

interface RowHandlers {
  onOpenDetails: (id: number) => void;
  onOpenPlayerDay: (id: number) => void;
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
        <SumPhoto id={r.id} name={r.name} role={role} corner={corner} onOpen={onOpenDetails} />
      </td>
      <th className="sum-name-col" scope="row">
        <button
          type="button"
          className="sum-name sum-name-link"
          title={`${r.name} — game log`}
          onClick={() => onOpenPlayerDay(r.id)}
        >
          {r.name}
        </button>
      </th>
      <OpponentCell game={game} />
    </>
  );
}

/** The batter stat table: one row per hitter, with an aggregate total row. */
function BatterTable({ batters, handlers }: { batters: PlayerReport[]; handlers: RowHandlers }) {
  const total = combineLines(batters.flatMap((r) => r.games.map((g) => g.line)));
  const cols = ['H/AB', 'R', 'HR', 'RBI', 'SB', 'OPS', 'BB', 'K'];
  return (
    <table className="summary-table">
      <thead>
        <tr>
          <th className="sum-img-col" scope="col">
            <span className="sr-only">Photo</span>
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
function PitcherTable({ pitchers, handlers }: { pitchers: PlayerReport[]; handlers: RowHandlers }) {
  const totalLine = combinePitchingLines(
    pitchers.flatMap((r) => r.games.filter((g) => g.pitching).map((g) => g.pitching!.line)),
  );
  const cols = ['IP', 'H', 'R', 'ER', 'BB', 'K', 'HR', 'ERA', 'WHIP', 'CSW'];
  return (
    <table className="summary-table summary-table-pitchers">
      <thead>
        <tr>
          <th className="sum-img-col" scope="col">
            <span className="sr-only">Photo</span>
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
          const { line, csw } = aggregatePitching(r);
          return (
            <tr key={r.id} className={role ? `role-${role}` : undefined}>
              <LeadCells r={r} game={game} role={role} corner={null} {...handlers} />
              <PitchStatCells line={line} csw={csw} />
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
          <PitchStatCells line={totalLine} csw={null} />
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
  onOpenDetails: (id: number) => void;
  onOpenPlayerDay: (id: number) => void;
}) {
  const handlers = { onOpenDetails, onOpenPlayerDay };
  const batters = reports.filter((r) => r.kind !== 'pitcher');
  const pitchers = reports.filter((r) => r.kind === 'pitcher');
  return (
    <div className="summary-view">
      <div className="summary-scroll">
        {batters.length > 0 && <BatterTable batters={batters} handlers={handlers} />}
        {pitchers.length > 0 && <PitcherTable pitchers={pitchers} handlers={handlers} />}
      </div>
    </div>
  );
}
