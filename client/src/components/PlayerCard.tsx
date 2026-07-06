import { useState } from 'react';
import type { PlayerGame, PlayerReport } from '../types';
import { combineLines, fmt, isBigDay, lineSummary, prettyGameDate, savantPlayerUrl } from '../lib';
import { PlateAppearanceCard } from './PlateAppearanceCard';

function StatPill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`stat-pill${accent ? ' accent' : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/**
 * One game's plate appearances, independently collapsible. When a player has
 * only one game in view, the matchup/line score are already shown in the
 * card header above, so the toggle is a plain "Plate appearances" bar instead
 * of repeating them.
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
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="game-block">
      <button
        type="button"
        className="game-sub-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="game-sub-info">
          {showMatchup ? (
            <>
              {spansMultipleDays && <span className="game-date">{prettyGameDate(game.date)} · </span>}
              {game.batterTeam} {game.isHome ? 'vs' : '@'} {game.opponent}
            </>
          ) : (
            `Plate appearances (${game.plateAppearances.length})`
          )}
        </span>
        {showMatchup && <span className="game-sub-line">{lineSummary(game.line)}</span>}
        <span className={`chevron${expanded ? ' expanded' : ''}`}>▸</span>
      </button>
      {expanded && (
        <div className="pa-grid">
          {game.plateAppearances.map((pa) => (
            <PlateAppearanceCard key={pa.atBatNumber} pa={pa} gamePk={game.gamePk} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PlayerCard({
  report,
  onRemove,
  collapsed,
  onToggleCollapsed,
}: {
  report: PlayerReport;
  onRemove: (id: number) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  if (!report.found || report.games.length === 0) {
    return (
      <div className="player-card empty">
        <div className="player-head">
          <div className="player-id">
            <a
              className="player-name"
              href={savantPlayerUrl(report.name, report.id)}
              target="_blank"
              rel="noreferrer"
            >
              {report.name}
            </a>
            <span className="player-dnp">Did not appear</span>
          </div>
          <button className="remove-btn" onClick={() => onRemove(report.id)} title="Remove">
            ✕
          </button>
        </div>
      </div>
    );
  }

  // Combine lines across games (usually one).
  const games = report.games;
  const big = games.some((g) => isBigDay(g.line));
  const combined = combineLines(games.map((g) => g.line));

  const primary = games[0];
  const summary = lineSummary(combined);
  const spansMultipleDays = new Set(games.map((g) => g.date)).size > 1;

  return (
    <div className={`player-card${big ? ' big-day' : ''}${collapsed ? ' collapsed' : ''}`}>
      <div className="player-head">
        <div className="player-id">
          <a
            className="player-name"
            href={savantPlayerUrl(report.name, report.id)}
            target="_blank"
            rel="noreferrer"
          >
            {report.name}
          </a>
          <span className="player-meta">
            {games.length > 1
              ? `${primary.batterTeam} · ${games.length} games`
              : `${primary.batterTeam} ${primary.isHome ? 'vs' : '@'} ${primary.opponent}`}
          </span>
        </div>
        <div className="player-summary">
          <span className="summary-line">{summary}</span>
          {big && <span className="big-flag">🔥</span>}
        </div>
        <button
          type="button"
          className="player-toggle"
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <span className={`chevron${!collapsed ? ' expanded' : ''}`}>▸</span>
        </button>
        <button className="remove-btn" onClick={() => onRemove(report.id)} title="Remove">
          ✕
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="stat-row">
            <StatPill label="H-AB" value={`${combined.hits}-${combined.ab}`} accent={combined.hits >= 2} />
            <StatPill label="R" value={`${combined.runs}`} accent={combined.runs >= 2} />
            <StatPill label="HR" value={`${combined.hr}`} accent={combined.hr > 0} />
            <StatPill label="RBI" value={`${combined.rbi}`} accent={combined.rbi >= 2} />
            <StatPill label="SB-CS" value={`${combined.sb}-${combined.cs}`} accent={combined.sb > 0} />
            <StatPill label="BB" value={`${combined.bb}`} />
            <StatPill label="K" value={`${combined.so}`} />
            <StatPill
              label="Max EV"
              value={fmt(combined.maxExitVelo, 1, '')}
              accent={(combined.maxExitVelo ?? 0) >= 105}
            />
            <StatPill label="Max Dist" value={fmt(combined.maxDistance, 0, ' ft')} />
            <StatPill
              label="Run Value"
              value={
                combined.runValue !== null
                  ? (combined.runValue > 0 ? '+' : '') + combined.runValue.toFixed(2)
                  : '—'
              }
              accent={combined.runValue !== null && combined.runValue > 0.5}
            />
          </div>

          {games.map((g) => (
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
