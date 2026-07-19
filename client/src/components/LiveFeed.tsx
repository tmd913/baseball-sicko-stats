import { useState } from 'react';
import type { LiveRole } from '../lib';
import {
  headshotUrl,
  liveRoleGame,
  liveRoleLabel,
  mostRecentAtBatFirst,
} from '../lib';
import type { PlayerGame, PlayerReport } from '../types';
import { PlateAppearanceCard } from './PlateAppearanceCard';

/** Priority order for the Live section: at bat, then on deck, then on base. */
const ROLE_ORDER: Record<LiveRole, number> = { 'at-bat': 0, 'on-deck': 1, 'on-base': 2 };

/** A player's live game inning, e.g. "Top 7" (falls back to the game's label). */
function liveInning(game: PlayerGame): string {
  const s = game.status;
  return s.currentInning !== null
    ? `${s.inningState ?? ''} ${s.currentInning}`.trim()
    : s.detailedState || 'Live';
}

/** The matchup line, "NYY vs BOS" / "NYY @ BOS", from the batter's perspective. */
function matchup(game: PlayerGame): string {
  return `${game.batterTeam} ${game.isHome ? 'vs' : '@'} ${game.opponent}`;
}

/**
 * A player's headshot, opening their Statcast details on click. A compact
 * variant of the player card's headshot; `role` paints the live-role ring.
 */
function FeedHeadshot({
  id,
  name,
  role,
  onOpen,
}: {
  id: number;
  name: string;
  role?: LiveRole | null;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      className={`feed-photo-link${role ? ` role-${role}` : ''}`}
      title={`${name} — Statcast details`}
      aria-label={`${name} — Statcast details`}
      onClick={onOpen}
    >
      {failed ? (
        <span className="feed-photo feed-photo-empty" aria-hidden="true" />
      ) : (
        <img
          className="feed-photo"
          src={headshotUrl(id)}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </button>
  );
}

/** One player currently at bat / on deck / on base, in the Live section. */
function LiveRow({
  report,
  role,
  game,
  onOpenDetails,
}: {
  report: PlayerReport;
  role: LiveRole;
  game: PlayerGame;
  onOpenDetails: (id: number) => void;
}) {
  return (
    <div className={`live-row role-${role}`}>
      <FeedHeadshot
        id={report.id}
        name={report.name}
        role={role}
        onOpen={() => onOpenDetails(report.id)}
      />
      <div className="live-row-id">
        <span className="feed-player-name">{report.name}</span>
        <span className="feed-context">
          {matchup(game)} · {liveInning(game)}
        </span>
      </div>
      <span className={`live-role role-${role}`}>{liveRoleLabel(role)}</span>
    </div>
  );
}

/**
 * The watchlist as a flat, most-recent-first stream of individual at-bats —
 * shown while games are active. A "Live" section pins the players currently at
 * bat, on deck, or on base to the top; below it, every completed plate
 * appearance across the watchlist reads newest-first, each labeled with just the
 * player (name + headshot) and the at-bat itself — none of the per-player stats,
 * season line, or score chrome the grouped player view carries.
 */
export function LiveFeed({
  reports,
  onOpenDetails,
}: {
  reports: PlayerReport[];
  onOpenDetails: (id: number) => void;
}) {
  // At-bats expand in place to reveal the pitch sequence / video, keyed by
  // player + game + at-bat number (an at-bat number is only unique within a game).
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Players currently in a live at-bat/on-deck/on-base situation, highest-
  // priority role first (a player is listed once, for their leading role).
  const liveRows = reports
    .map((report) => {
      const lr = liveRoleGame(report);
      return lr ? { report, role: lr.role, game: lr.game } : null;
    })
    .filter((x): x is { report: PlayerReport; role: LiveRole; game: PlayerGame } => x !== null)
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);

  // Every completed plate appearance across the watchlist, newest first. The
  // in-progress at-bat (no event yet) lives in the Live section above, not here.
  const atBats = reports
    .flatMap((report) =>
      report.games.flatMap((game) =>
        game.plateAppearances
          .filter((pa) => pa.event)
          .map((pa) => ({ report, game, pa })),
      ),
    )
    .sort(mostRecentAtBatFirst);

  return (
    <div className="live-feed">
      {liveRows.length > 0 && (
        <section className="feed-section">
          <h2 className="feed-heading">
            <span className="feed-heading-dot" aria-hidden="true" />
            Live
          </h2>
          <div className="live-rows">
            {liveRows.map(({ report, role, game }) => (
              <LiveRow
                key={report.id}
                report={report}
                role={role}
                game={game}
                onOpenDetails={onOpenDetails}
              />
            ))}
          </div>
        </section>
      )}

      <section className="feed-section">
        <h2 className="feed-heading">Recent at-bats</h2>
        {atBats.length === 0 ? (
          <div className="feed-empty">No plate appearances yet.</div>
        ) : (
          <div className="feed-items">
            {atBats.map(({ report, game, pa }) => {
              const key = `${report.id}-${game.gamePk}-${pa.atBatNumber}`;
              return (
                <div className="feed-item" key={key}>
                  <div className="feed-item-head">
                    <FeedHeadshot
                      id={report.id}
                      name={report.name}
                      onOpen={() => onOpenDetails(report.id)}
                    />
                    <div className="feed-item-id">
                      <span className="feed-player-name">{report.name}</span>
                      <span className="feed-context">{matchup(game)}</span>
                    </div>
                  </div>
                  <PlateAppearanceCard
                    pa={pa}
                    gamePk={game.gamePk}
                    open={openKeys.has(key)}
                    onToggle={() => toggle(key)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
