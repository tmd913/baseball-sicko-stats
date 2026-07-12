import { useState } from 'react';
import type { PlayerGame, PlayerReport } from '../types';
import {
  combineLines,
  gameStatusView,
  handThrows,
  headshotUrl,
  lineSummary,
  prettyGameDate,
  savantPlayerUrl,
  seasonStatsSummary,
} from '../lib';
import { BaseDiamond } from './BaseDiamond';
import { PlateAppearanceCard } from './PlateAppearanceCard';

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-pill">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/**
 * Compact game-state chip: start time (scheduled), score + inning (live), or
 * "Final". With `withMatchup`, a not-yet-started game also shows the opponent
 * and home/away inside the bubble (used where no score badge reveals the teams).
 */
function GameStatusBadge({ game, withMatchup }: { game: PlayerGame; withMatchup?: boolean }) {
  const { kind, score, detail } = gameStatusView(game);
  const matchup =
    withMatchup && kind === 'scheduled' ? `${game.isHome ? 'vs' : '@'} ${game.opponent}` : null;
  return (
    <span className={`game-status ${kind}`}>
      {kind === 'live' && <span className="live-dot" aria-hidden="true" />}
      {score && <span className="game-score">{score}</span>}
      <span className="game-status-detail">{detail}</span>
      {matchup && <span className="game-matchup">{matchup}</span>}
      {kind === 'live' && game.status.bases && (
        <BaseDiamond
          bases={game.status.bases}
          outs={game.status.outs ?? 0}
          className="status-bases"
        />
      )}
    </span>
  );
}

/** The opposing probable starter for a not-yet-started game. */
function ProbablePitcher({ game }: { game: PlayerGame }) {
  const p = game.probablePitcher;
  if (game.status.state !== 'scheduled' || !p) return null;
  return (
    <span className="game-prob-pitcher" title="Probable starting pitcher">
      vs {handThrows(p.hand)} {p.name}
    </span>
  );
}

/**
 * For a not-yet-started game, the batter's season line against pitchers of the
 * probable starter's hand (e.g. their vs-RHP split when facing a righty).
 */
function PlatoonSplit({ report, game }: { report: PlayerReport; game: PlayerGame }) {
  const hand = game.probablePitcher?.hand;
  if (game.status.state !== 'scheduled' || (hand !== 'R' && hand !== 'L')) return null;
  const split = hand === 'R' ? report.splitVsRight : report.splitVsLeft;
  const label = `Season vs ${handThrows(hand)}`;

  if (!split || split.pa === 0) {
    return (
      <div className="split-block">
        <div className="split-head">{label}</div>
        <div className="split-empty">No plate appearances vs {handThrows(hand)} this season.</div>
      </div>
    );
  }
  return (
    <div className="split-block">
      <div className="split-head">
        {label} · {split.pa} PA
      </div>
      <div className="stat-row">
        <StatPill label="AVG" value={split.avg} />
        <StatPill label="OBP" value={split.obp} />
        <StatPill label="SLG" value={split.slg} />
        <StatPill label="OPS" value={split.ops} />
        <StatPill label="HR" value={`${split.hr}`} />
        <StatPill label="RBI" value={`${split.rbi}`} />
      </div>
    </div>
  );
}

/**
 * One game's plate appearances. Clicking the bar collapses/expands the whole
 * game; when multiple games are in view they start collapsed so the card stays
 * scannable. Each PA is individually collapsible. When a player has only one
 * game in view, the matchup/line score are already shown in the card header
 * above, so the bar is a plain "Plate appearances" label instead of repeating
 * them.
 */
function GameBlock({
  game,
  showMatchup,
  spansMultipleDays,
}: {
  game: PlayerGame;
  showMatchup: boolean;
  spansMultipleDays: boolean;
}) {
  // Show most recent plate appearances first (highest at-bat number).
  const pas = [...game.plateAppearances].sort((a, b) => b.atBatNumber - a.atBatNumber);
  const hasPas = pas.length > 0;
  // Multiple games (showMatchup) start collapsed; a lone game stays open.
  const [collapsed, setCollapsed] = useState(showMatchup);
  // PAs start collapsed; clicking an individual row opens it.
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set());
  const togglePa = (id: number) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const matchup = (
    <span className="game-sub-info">
      {spansMultipleDays && <span className="game-date">{prettyGameDate(game.date)} · </span>}
      {game.batterTeam} {game.isHome ? 'vs' : '@'} {game.opponent}
    </span>
  );

  // A game the player hasn't batted in yet (scheduled or just underway): no PAs
  // to collapse into, so the bar is a static matchup + status, no toggle/grid.
  if (!hasPas) {
    return (
      <div className="game-block">
        <div className="game-sub-bar static">
          {matchup}
          <GameStatusBadge game={game} />
          <ProbablePitcher game={game} />
        </div>
      </div>
    );
  }

  return (
    <div className="game-block">
      <div
        className="game-sub-bar"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand game' : 'Collapse game'}
        onClick={() => setCollapsed((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setCollapsed((v) => !v);
          }
        }}
      >
        {showMatchup ? (
          <>
            {matchup}
            <GameStatusBadge game={game} />
          </>
        ) : (
          <span className="game-sub-info">
            {`Plate appearances (${game.plateAppearances.length})`}
          </span>
        )}
        {showMatchup && <span className="game-sub-line">{lineSummary(game.line)}</span>}
      </div>
      {!collapsed && (
        <div className="pa-grid">
          {pas.map((pa) => (
            <PlateAppearanceCard
              key={pa.atBatNumber}
              pa={pa}
              gamePk={game.gamePk}
              open={openIds.has(pa.atBatNumber)}
              onToggle={() => togglePa(pa.atBatNumber)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Player headshot, linking to the player's Baseball Savant page. Falls back to a
 * blank circle when MLB has no image for the id. stopPropagation keeps a click
 * from also toggling the (collapsible) card header it sits in.
 */
function Headshot({ id, name }: { id: number; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <a
      className="player-photo-link"
      href={savantPlayerUrl(name, id)}
      target="_blank"
      rel="noreferrer"
      title={`${name} on Baseball Savant`}
      onClick={(e) => e.stopPropagation()}
    >
      {failed ? (
        <div className="player-photo player-photo-empty" aria-hidden="true" />
      ) : (
        <img
          className="player-photo"
          src={headshotUrl(id)}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </a>
  );
}

export function PlayerCard({
  report,
  position,
  collapsed,
  onToggleCollapsed,
}: {
  report: PlayerReport;
  position?: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  if (!report.found || report.games.length === 0) {
    const meta = [position, report.seasonStats ? seasonStatsSummary(report.seasonStats) : null]
      .filter(Boolean)
      .join(' · ');
    return (
      <div className="player-card empty" id={`player-${report.id}`}>
        <div className="player-head">
          <Headshot id={report.id} name={report.name} />
          <div className="player-id">
            <span className="player-name">{report.name}</span>
            {meta && <span className="player-meta">{meta}</span>}
          </div>
          <span className="dnp-badge">Did not appear</span>
        </div>
      </div>
    );
  }

  // Combine lines across games (usually one). Show most recent games first.
  const games = [...report.games].sort(
    (a, b) => b.date.localeCompare(a.date) || b.gamePk - a.gamePk,
  );
  const combined = combineLines(games.map((g) => g.line));

  const primary = games[0];
  const summary = lineSummary(combined);
  const spansMultipleDays = new Set(games.map((g) => g.date)).size > 1;
  // A player may be in view only for an upcoming/just-started game with no plate
  // appearances yet — then the batting line is all zeros and not worth showing.
  const hasAnyPa = games.some((g) => g.plateAppearances.length > 0);

  return (
    <div
      className={`player-card${collapsed ? ' collapsed' : ''}`}
      id={`player-${report.id}`}
    >
      {/* The whole header toggles collapse; inner link/buttons stop propagation. */}
      <div
        className="player-head player-head-toggle"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand' : 'Collapse'}
        onClick={onToggleCollapsed}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapsed();
          }
        }}
      >
        <Headshot id={report.id} name={report.name} />
        <div className="player-id">
          <span className="player-name">{report.name}</span>
          <span className="player-meta">
            {position ? `${position} · ` : ''}
            {report.seasonStats
              ? seasonStatsSummary(report.seasonStats)
              : games.length > 1
                ? `${primary.batterTeam} · ${games.length} games`
                : `${primary.batterTeam} ${primary.isHome ? 'vs' : '@'} ${primary.opponent}`}
          </span>
        </div>
        <div className="player-summary">
          {hasAnyPa && <span className="summary-line">{summary}</span>}
          {games.length === 1 && <ProbablePitcher game={primary} />}
          {/* A not-yet-started game has no score badge to reveal the teams, so
              the badge also carries the opponent and home/away (withMatchup). */}
          {games.length === 1 && <GameStatusBadge game={primary} withMatchup />}
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Not-yet-started games: show the batter's split vs the starter's hand. */}
          {games
            .filter((g) => g.status.state === 'scheduled')
            .map((g) => (
              <PlatoonSplit key={`split-${g.gamePk}`} report={report} game={g} />
            ))}

          {games
            // A lone no-PA game is fully described by the header's status badge,
            // so skip its empty block; keep it when several games share the card.
            .filter((g) => g.plateAppearances.length > 0 || games.length > 1)
            .map((g) => (
              <GameBlock
                key={g.gamePk}
                game={g}
                showMatchup={games.length > 1}
                spansMultipleDays={spansMultipleDays}
              />
            ))}
        </>
      )}
    </div>
  );
}
