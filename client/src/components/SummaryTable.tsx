import { useState } from 'react';
import type { BattingLine, PlayerGame, PlayerReport } from '../types';
import type { LiveRole } from '../lib';
import {
  combineLines,
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

/** The player's aggregate line for the range, shown as one table row. */
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

/**
 * A full-page stat table over the date range: one row per watched player
 * (hits/AB, R, HR, RBI, SB, OPS, BB, K), with an aggregate total pinned to the
 * bottom. The header row + total row stick while scrolling vertically, and only
 * the (narrow) headshot column sticks while scrolling horizontally — the name
 * scrolls away with the rest so the stat columns get the room on a phone. The
 * headshot and name are separate columns for exactly that reason.
 */
export function SummaryTable({
  reports,
  onOpenDetails,
  onOpenPlayerDay,
}: {
  reports: PlayerReport[];
  // The headshot opens the player's details (percentiles/splits); the name jumps
  // to their at-bats for the current range on the players view.
  onOpenDetails: (id: number) => void;
  onOpenPlayerDay: (id: number) => void;
}) {
  const rows = reports.map((r) => {
    const game = pickGame(r);
    return {
      r,
      line: combineLines(r.games.map((g) => g.line)),
      game,
      role: liveRole(r),
      corner: game ? lineupCorner(game) : null,
    };
  });
  const total = combineLines(reports.flatMap((r) => r.games.map((g) => g.line)));

  return (
    <div className="summary-view">
      <div className="summary-scroll">
        <table className="summary-table">
          <thead>
            <tr>
              <th className="sum-img-col" scope="col">
                <span className="sr-only">Photo</span>
              </th>
              <th className="sum-name-col" scope="col">
                Player
              </th>
              <th className="sum-opp-col" scope="col">
                Opponent
              </th>
              <th className="sum-num" scope="col">
                H/AB
              </th>
              <th className="sum-num" scope="col">
                R
              </th>
              <th className="sum-num" scope="col">
                HR
              </th>
              <th className="sum-num" scope="col">
                RBI
              </th>
              <th className="sum-num" scope="col">
                SB
              </th>
              <th className="sum-num" scope="col">
                OPS
              </th>
              <th className="sum-num" scope="col">
                BB
              </th>
              <th className="sum-num" scope="col">
                K
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, line, game, role, corner }) => (
              <tr key={r.id} className={role ? `role-${role}` : undefined}>
                <td className="sum-img-col">
                  <SumPhoto
                    id={r.id}
                    name={r.name}
                    role={role}
                    corner={corner}
                    onOpen={onOpenDetails}
                  />
                </td>
                <th className="sum-name-col" scope="row">
                  <button
                    type="button"
                    className="sum-name sum-name-link"
                    title={`${r.name} — at-bats`}
                    onClick={() => onOpenPlayerDay(r.id)}
                  >
                    {r.name}
                  </button>
                </th>
                <OpponentCell game={game} />
                <StatCells line={line} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="sum-img-col" aria-hidden="true" />
              <th className="sum-name-col" scope="row">
                <span className="sum-total-label">Total · {reports.length}</span>
              </th>
              <td className="sum-opp" aria-hidden="true" />
              <StatCells line={total} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
