import { useState } from 'react';
import type { FacedBatter, PitchMix, PitchingLine, PlayerGame, PlayerReport } from '../types';
import { useScrollIntoViewOnExpand } from '../hooks';
import {
  combinePitchingLines,
  deltaVs,
  eventLabel,
  fmt,
  formatIp,
  liveRole,
  mostRecentGameFirst,
  outcomeKind,
  pitcherSeasonSummary,
  prettyGameDate,
} from '../lib';
import { BaseDiamond } from './BaseDiamond';
import { GameStatusBadge, Headshot, LiveRoleTag, PlayerName, StatPill } from './PlayerCard';

/** A one-line pitching line: "6.0 IP, 4 H, 2 ER, 1 BB, 5 K". */
function lineSummary(l: PitchingLine): string {
  const parts = [`${formatIp(l.outs)} IP`];
  if (l.hits) parts.push(`${l.hits} H`);
  parts.push(`${l.earnedRuns} ER`);
  if (l.walks) parts.push(`${l.walks} BB`);
  parts.push(`${l.strikeouts} K`);
  if (l.hr) parts.push(`${l.hr} HR`);
  return parts.join(', ');
}

const pct = (x: number | null): string => (x === null ? '—' : `${Math.round(x * 100)}%`);

/** One batter faced — the RESULT only (no pitch-by-pitch detail). */
function FacedBatterRow({ fb }: { fb: FacedBatter }) {
  const kind = outcomeKind(fb.event);
  const isTop = fb.half === 'Top';
  return (
    <div className={`faced-row kind-${kind}`}>
      <span className="pa-inning">
        <svg className="pa-inning-arrow" viewBox="0 0 12 10" aria-hidden="true" fill="currentColor">
          <path d={isTop ? 'M6 0 12 10 0 10Z' : 'M0 0 12 0 6 10Z'} />
        </svg>
        {fb.inning}
      </span>
      <BaseDiamond bases={fb.onBase} outs={fb.outsWhenUp ?? 0} className="pa-bases" />
      <span className={`pa-badge kind-${kind}`}>{eventLabel(fb.event)}</span>
      {fb.rbi > 0 && <span className="pa-rbi">{fb.rbi} RBI</span>}
      <span className="faced-batter">
        {fb.batterName}
        {fb.stand ? <span className="faced-hand"> ({fb.stand})</span> : null}
      </span>
      {fb.launchSpeed !== null && (
        <span className="pa-contact-main">{fb.launchSpeed.toFixed(1)} mph</span>
      )}
    </div>
  );
}

/** One reference (season / league) with a direction arrow vs the game value. */
function RefTag({
  label,
  game,
  ref,
  digits,
}: {
  label: string;
  game: number | null;
  ref: number | null;
  digits: number;
}) {
  const d = deltaVs(game, ref);
  if (ref === null) return null;
  const arrow = d?.dir === 'up' ? '▲' : d?.dir === 'down' ? '▼' : '·';
  return (
    <span className={`am-ref dir-${d?.dir ?? 'flat'}`}>
      {label} {fmt(ref, digits)} <span className="am-arrow">{arrow}</span>
    </span>
  );
}

/** One arsenal metric (velo / spin / break) with season + league comparison. */
function ArsenalMetric({
  label,
  value,
  unit,
  season,
  league,
  digits,
}: {
  label: string;
  value: number | null;
  unit: string;
  season: number | null;
  league: number | null;
  digits: number;
}) {
  return (
    <div className="arsenal-metric">
      <span className="am-label">{label}</span>
      <span className="am-value">
        {fmt(value, digits)}
        {unit && <span className="am-unit">{unit}</span>}
      </span>
      <span className="am-refs">
        <RefTag label="szn" game={value} ref={season} digits={digits} />
        <RefTag label="lg" game={value} ref={league} digits={digits} />
      </span>
    </div>
  );
}

/** One pitch type in the arsenal: usage + whiff%, then velo/spin/break metrics. */
function ArsenalRow({ m }: { m: PitchMix }) {
  return (
    <div className="arsenal-row">
      <div className="arsenal-id">
        <span className="arsenal-type">{m.pitchType}</span>
        <span className="arsenal-share">{Math.round(m.share * 100)}%</span>
        {m.whiffRate !== null && <span className="arsenal-whiff">{pct(m.whiffRate)} whiff</span>}
      </div>
      <div className="arsenal-metrics">
        <ArsenalMetric label="Velo" value={m.avgVelo} unit=" mph" season={m.seasonVelo} league={m.leagueVelo} digits={1} />
        <ArsenalMetric label="Spin" value={m.avgSpin} unit="" season={m.seasonSpin} league={m.leagueSpin} digits={0} />
        <ArsenalMetric label="iVB" value={m.vBreak} unit='"' season={m.seasonVBreak} league={m.leagueVBreak} digits={1} />
        <ArsenalMetric label="HB" value={m.hBreak} unit='"' season={m.seasonHBreak} league={m.leagueHBreak} digits={1} />
      </div>
    </div>
  );
}

/** One game a watched pitcher threw in: aggregate stats + arsenal + batters faced. */
function PitcherGameBlock({
  game,
  showMatchup,
  spansMultipleDays,
}: {
  game: PlayerGame;
  showMatchup: boolean;
  spansMultipleDays: boolean;
}) {
  const pg = game.pitching!;
  const L = pg.line;
  const [collapsed, setCollapsed] = useState(showMatchup);
  const blockRef = useScrollIntoViewOnExpand<HTMLDivElement>(!collapsed);
  // Live: most recent batter first; final: in play order.
  const live = game.status.state === 'live';
  const faced = live ? [...pg.facedBatters].reverse() : pg.facedBatters;

  const gameId = (
    <div className="game-sub-id">
      <span className="game-sub-title">
        {game.batterTeam} {game.isHome ? 'vs' : '@'} {game.opponent}
      </span>
      {spansMultipleDays && <span className="game-sub-meta">{prettyGameDate(game.date)}</span>}
    </div>
  );

  return (
    <div ref={blockRef} className="game-block">
      {showMatchup && (
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
          {gameId}
          <div className="game-sub-summary">
            <span className="game-sub-line">{lineSummary(L)}</span>
            <GameStatusBadge game={game} />
          </div>
        </div>
      )}

      {(!showMatchup || !collapsed) && (
        <div className="pitcher-body">
          {/* Game aggregate line */}
          <div className="stat-row pitcher-stats">
            <StatPill label="IP" value={formatIp(L.outs)} />
            <StatPill label="H" value={String(L.hits)} />
            <StatPill label="R" value={String(L.runs)} />
            <StatPill label="ER" value={String(L.earnedRuns)} />
            <StatPill label="BB" value={String(L.walks)} />
            <StatPill label="K" value={String(L.strikeouts)} />
            <StatPill label="HR" value={String(L.hr)} />
            <StatPill label="Pit" value={String(L.pitchesThrown)} />
            <StatPill label="Strike" value={pct(pg.strikePct)} />
            <StatPill label="Whiff" value={pct(pg.whiffRate)} />
            <StatPill label="CSW" value={pct(pg.cswRate)} />
          </div>

          {/* Arsenal: velo/spin/break per pitch type, vs season & league */}
          {pg.pitchMix.length > 0 && (
            <div className="arsenal">
              <div className="arsenal-caption">
                Arsenal — game avg (<span className="am-arrow">▲▼</span> vs season / league)
              </div>
              {pg.pitchMix.map((m) => (
                <ArsenalRow key={m.pitchType} m={m} />
              ))}
            </div>
          )}

          {/* Batters faced — result only */}
          <div className="faced-list">
            {faced.map((fb, i) => (
              <FacedBatterRow key={`${fb.batterId}-${fb.inning}-${i}`} fb={fb} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PitcherCard({
  report,
  position,
  collapsed,
  onToggleCollapsed,
  onOpenDetails,
}: {
  report: PlayerReport;
  position?: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenDetails: (id: number) => void;
}) {
  const games = [...report.games].sort(mostRecentGameFirst);
  const pitched = games.filter((g) => g.pitching);
  const role = liveRole(report);

  // No outing in range — a header-only card with the game status (scheduled /
  // "did not pitch").
  if (pitched.length === 0) {
    const meta = report.pitcherSeasonStats ? pitcherSeasonSummary(report.pitcherSeasonStats) : null;
    return (
      <div className="player-card empty" id={`player-${report.id}`}>
        <div className="player-head">
          <Headshot id={report.id} name={report.name} onOpen={() => onOpenDetails(report.id)} role={role} />
          <div className="player-id">
            <PlayerName name={report.name} position={position ?? 'P'} status={report.rosterStatus} />
            {meta && <span className="player-meta">{meta}</span>}
          </div>
          <div className="player-summary">
            {games.map((g) => (
              <GameStatusBadge key={g.gamePk} game={g} withMatchup />
            ))}
            {games.length > 0 && games.every((g) => g.status.state === 'final') && (
              <span className="dnp-badge">Did not pitch</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  const primary = pitched[0];
  const combined = combinePitchingLines(pitched.map((g) => g.pitching!.line));
  const spansMultipleDays = new Set(pitched.map((g) => g.date)).size > 1;
  const showMatchup = pitched.length > 1;

  const head = (
    <>
      <Headshot id={report.id} name={report.name} onOpen={() => onOpenDetails(report.id)} role={role} />
      <div className="player-id">
        <PlayerName name={report.name} position={position ?? 'P'} status={report.rosterStatus} />
        <span className="player-meta">
          {report.pitcherSeasonStats
            ? pitcherSeasonSummary(report.pitcherSeasonStats)
            : `${primary.batterTeam} ${primary.isHome ? 'vs' : '@'} ${primary.opponent}`}
        </span>
      </div>
      <div className="player-summary">
        <LiveRoleTag role={role} />
        <span className="summary-line">{lineSummary(combined)}</span>
        {pitched.length === 1 && <GameStatusBadge game={primary} withMatchup />}
      </div>
    </>
  );

  return (
    <div
      className={`player-card${collapsed ? ' collapsed' : ''}`}
      id={`player-${report.id}`}
    >
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
        {head}
      </div>

      {!collapsed &&
        pitched.map((g) => (
          <PitcherGameBlock
            key={g.gamePk}
            game={g}
            showMatchup={showMatchup}
            spansMultipleDays={spansMultipleDays}
          />
        ))}
    </div>
  );
}
