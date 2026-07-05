import { useState } from 'react';
import type { PlayerReport } from '../types';
import { fmt, isBigDay, lineSummary, savantPlayerUrl } from '../lib';
import { PlateAppearanceCard } from './PlateAppearanceCard';

function StatPill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`stat-pill${accent ? ' accent' : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function PlayerCard({
  report,
  onRemove,
}: {
  report: PlayerReport;
  onRemove: (id: number) => void;
}) {
  const [open, setOpen] = useState(true);

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
  const totalHits = games.reduce((s, g) => s + g.line.hits, 0);
  const totalAb = games.reduce((s, g) => s + g.line.ab, 0);
  const totalRuns = games.reduce((s, g) => s + g.line.runs, 0);
  const totalHr = games.reduce((s, g) => s + g.line.hr, 0);
  const totalRbi = games.reduce((s, g) => s + g.line.rbi, 0);
  const totalSb = games.reduce((s, g) => s + g.line.sb, 0);
  const totalCs = games.reduce((s, g) => s + g.line.cs, 0);
  const totalBb = games.reduce((s, g) => s + g.line.bb, 0);
  const totalSo = games.reduce((s, g) => s + g.line.so, 0);
  const maxEv = Math.max(...games.map((g) => g.line.maxExitVelo ?? 0));
  const maxDist = Math.max(...games.map((g) => g.line.maxDistance ?? 0));
  const runVals = games.map((g) => g.line.runValue).filter((v): v is number => v !== null);
  const runValue = runVals.length ? runVals.reduce((a, b) => a + b, 0) : null;

  const primary = games[0];
  const summary = games.map((g) => lineSummary(g.line)).join(' / ');

  return (
    <div className={`player-card${big ? ' big-day' : ''}`}>
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
            {primary.batterTeam} {primary.isHome ? 'vs' : '@'} {primary.opponent}
          </span>
        </div>
        <div className="player-summary">
          <span className="summary-line">{summary}</span>
          {big && <span className="big-flag">🔥</span>}
        </div>
        <button className="remove-btn" onClick={() => onRemove(report.id)} title="Remove">
          ✕
        </button>
      </div>

      <div className="stat-row">
        <StatPill label="H-AB" value={`${totalHits}-${totalAb}`} accent={totalHits >= 2} />
        <StatPill label="R" value={`${totalRuns}`} accent={totalRuns >= 2} />
        <StatPill label="HR" value={`${totalHr}`} accent={totalHr > 0} />
        <StatPill label="RBI" value={`${totalRbi}`} accent={totalRbi >= 2} />
        <StatPill label="SB-CS" value={`${totalSb}-${totalCs}`} accent={totalSb > 0} />
        <StatPill label="BB" value={`${totalBb}`} />
        <StatPill label="K" value={`${totalSo}`} />
        <StatPill label="Max EV" value={fmt(maxEv || null, 1, '')} accent={maxEv >= 105} />
        <StatPill label="Max Dist" value={fmt(maxDist || null, 0, ' ft')} />
        <StatPill
          label="Run Value"
          value={runValue !== null ? (runValue > 0 ? '+' : '') + runValue.toFixed(2) : '—'}
          accent={runValue !== null && runValue > 0.5}
        />
      </div>

      <button className="toggle-pas" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide' : 'Show'} plate appearances (
        {games.reduce((s, g) => s + g.plateAppearances.length, 0)})
      </button>

      {open &&
        games.map((g) => (
          <div key={g.gamePk} className="game-block">
            {games.length > 1 && (
              <div className="game-sub">
                {g.batterTeam} {g.isHome ? 'vs' : '@'} {g.opponent}
              </div>
            )}
            <div className="pa-grid">
              {g.plateAppearances.map((pa) => (
                <PlateAppearanceCard key={pa.atBatNumber} pa={pa} />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
