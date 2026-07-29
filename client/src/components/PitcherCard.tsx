import { useState } from 'react';
import type {
  FacedBatter,
  PitcherGame,
  PitchMix,
  PitchingLine,
  PlayerGame,
  PlayerReport,
} from '../types';
import { useScrollIntoViewOnExpand } from '../hooks';
import {
  combinePitchingLines,
  deltaVs,
  eraOf,
  eventLabel,
  fmt,
  formatIp,
  liveRole,
  mostRecentGameFirst,
  outcomeKind,
  pitcherSeasonSummary,
  pitchStyle,
  prettyGameDate,
  whipOf,
} from '../lib';
import { BaseDiamond } from './BaseDiamond';
import { VideoClip } from './PlateAppearanceCard';
import { PitchSequence } from './PitchSequence';
import { GameStatusBadge, Headshot, LiveRoleTag, PlayerName } from './PlayerCard';

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

/** Baseball rate line ".265" / "1.250" — drops the leading zero below 1.000. */
const avg3 = (n: number | null): string => (n === null ? '—' : n.toFixed(3).replace(/^0\./, '.'));

/** One season-result stat in an arsenal row's Results strip. */
function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="ars-rstat">
      <span className="ars-rlabel">{label}</span>
      <span className="ars-rval">{value}</span>
    </span>
  );
}

/** English ordinal for an inning number: 1 → "1st", 3 → "3rd", 11 → "11th". */
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** One inning's worth of a pitcher's results, grouped in encounter order. */
interface InningGroup {
  inning: number;
  half: string;
  batters: FacedBatter[];
}

/** Group the batters faced by inning, preserving the order they're passed in
 * (ascending for a final game, most-recent-first for a live one). */
function groupByInning(faced: FacedBatter[]): InningGroup[] {
  const groups: InningGroup[] = [];
  const idx = new Map<number, number>();
  for (const fb of faced) {
    let gi = idx.get(fb.inning);
    if (gi === undefined) {
      gi = groups.length;
      idx.set(fb.inning, gi);
      groups.push({ inning: fb.inning, half: fb.half, batters: [] });
    }
    groups[gi].batters.push(fb);
  }
  return groups;
}

/** The pitcher's line for one inning: batters faced, hits, R, ER, K, BB, pitches. */
function inningStats(batters: FacedBatter[]) {
  let h = 0;
  let r = 0;
  let er = 0;
  let k = 0;
  let bb = 0;
  let pitches = 0;
  for (const fb of batters) {
    const kind = outcomeKind(fb.event);
    if (kind === 'hit' || kind === 'hr') h++;
    else if (kind === 'strikeout') k++;
    else if (kind === 'walk') bb++;
    r += fb.runs;
    er += fb.earnedRuns;
    pitches += fb.pitches.length;
  }
  return { bf: batters.length, h, r, er, k, bb, pitches };
}

/** One batter faced — the result row, expandable to the full pitch sequence. */
function FacedBatterCard({ fb, gamePk }: { fb: FacedBatter; gamePk: number }) {
  const [open, setOpen] = useState(false);
  const kind = outcomeKind(fb.event);
  const expandable = fb.pitches.length > 0;
  // On expand, bring this batter to the top of the screen — same as a batter's
  // at-bat card, so the pitch sequence isn't left below the fold.
  const cardRef = useScrollIntoViewOnExpand<HTMLDivElement>(open);

  const summary = (
    <>
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
      {expandable && (
        <>
          <span className="faced-pitches">{fb.pitches.length} P</span>
          <span className="faced-caret" aria-hidden="true">
            ▾
          </span>
        </>
      )}
    </>
  );

  if (!expandable) {
    return <div className={`faced-row kind-${kind}`}>{summary}</div>;
  }

  return (
    <div ref={cardRef} className={`faced-card kind-${kind}${open ? ' expanded' : ''}`}>
      <button
        type="button"
        className="faced-row faced-summary"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {summary}
      </button>
      {open && (
        <div className="faced-detail">
          {fb.description && <p className="pa-des">{fb.description}</p>}
          <PitchSequence pitches={fb.pitches} />
          {fb.playId && <VideoClip playId={fb.playId} gamePk={gamePk} />}
        </div>
      )}
    </div>
  );
}

/** A collapsible per-inning card: header with the inning's line, then the
 * expandable result rows for each batter faced that inning. */
function InningBlock({ group, gamePk }: { group: InningGroup; gamePk: number }) {
  const [collapsed, setCollapsed] = useState(true);
  const s = inningStats(group.batters);
  const isTop = group.half === 'Top';
  // Expanding an inning brings it to the top of the screen, like a game block.
  const blockRef = useScrollIntoViewOnExpand<HTMLDivElement>(!collapsed);
  return (
    <div ref={blockRef} className={`inning-block${collapsed ? ' collapsed' : ''}`}>
      <button
        type="button"
        className="inning-head"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((v) => !v)}
      >
        <span className="inning-label">
          <svg className="pa-inning-arrow" viewBox="0 0 12 10" aria-hidden="true" fill="currentColor">
            <path d={isTop ? 'M6 0 12 10 0 10Z' : 'M0 0 12 0 6 10Z'} />
          </svg>
          {ordinal(group.inning)}
        </span>
        <span className="inning-stats">
          <span className="inning-stat">{s.bf} BF</span>
          {s.h > 0 && <span className="inning-stat is-h">{s.h} H</span>}
          {s.r > 0 && (
            <span className="inning-stat is-r">
              {s.r} R{s.er !== s.r ? ` (${s.er} ER)` : ''}
            </span>
          )}
          {s.k > 0 && <span className="inning-stat is-k">{s.k} K</span>}
          {s.bb > 0 && <span className="inning-stat is-bb">{s.bb} BB</span>}
          <span className="inning-stat is-p">{s.pitches} P</span>
        </span>
        <span className="inning-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {!collapsed && (
        <div className="inning-batters">
          {group.batters.map((fb, i) => (
            <FacedBatterCard key={`${fb.batterId}-${fb.inning}-${i}`} fb={fb} gamePk={gamePk} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One arsenal metric (velo / spin / break): the game value with a small ▲▼
 * delta vs the pitcher's own season average (league avg in the hover title). */
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
  const d = deltaVs(value, season);
  const arrow = d?.dir === 'up' ? '▲' : d?.dir === 'down' ? '▼' : null;
  const title = [
    season !== null ? `season ${fmt(season, digits)}${unit}` : null,
    league !== null ? `league ${fmt(league, digits)}${unit}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="ars-metric" title={title || undefined}>
      <span className="ars-mlabel">{label}</span>
      <span className="ars-mval">
        {fmt(value, digits)}
        {unit && <span className="ars-unit">{unit}</span>}
      </span>
      {d && arrow ? (
        <span className={`ars-delta dir-${d.dir}`}>
          {arrow} {fmt(Math.abs(d.diff), digits)}
        </span>
      ) : (
        <span className="ars-delta dir-flat">·</span>
      )}
    </div>
  );
}

/** One pitch type as a Savant-style arsenal row: color-coded id + usage bar,
 * then velo / spin / iVB / HB (vs season) + whiff. */
function ArsenalRow({ m }: { m: PitchMix }) {
  const { abbr, color } = pitchStyle(m.pitchType);
  const share = Math.round(m.share * 100);
  return (
    <div className="ars-row" style={{ borderLeftColor: color }}>
      <div className="ars-head">
        <span className="ars-dot" style={{ background: color }} />
        <span className="ars-abbr">{abbr}</span>
        <span className="ars-name">{m.pitchType}</span>
        <span className="ars-count">{m.count}</span>
        <span className="ars-usage">
          <span className="ars-bar">
            <span className="ars-bar-fill" style={{ width: `${share}%`, background: color }} />
          </span>
          <span className="ars-share">{share}%</span>
        </span>
      </div>
      <div className="ars-metrics">
        <ArsenalMetric label="Velo" value={m.avgVelo} unit=" mph" season={m.seasonVelo} league={m.leagueVelo} digits={1} />
        <ArsenalMetric label="Spin" value={m.avgSpin} unit="" season={m.seasonSpin} league={m.leagueSpin} digits={0} />
        <ArsenalMetric label="iVB" value={m.vBreak} unit='"' season={m.seasonVBreak} league={m.leagueVBreak} digits={1} />
        <ArsenalMetric label="HB" value={m.hBreak} unit='"' season={m.seasonHBreak} league={m.leagueHBreak} digits={1} />
        <div className="ars-metric ars-metric-whiff">
          <span className="ars-mlabel">Whiff</span>
          <span className="ars-mval">{pct(m.whiffRate)}</span>
          <span className="ars-delta dir-flat" aria-hidden="true">
            {' '}
          </span>
        </div>
      </div>
      {m.seasonPa !== null && (
        <div className="ars-results" title={`${m.seasonPa} PA ended on this pitch (season)`}>
          <span className="ars-rtag">Szn vs</span>
          <ResultStat label="BA" value={avg3(m.seasonBa)} />
          <ResultStat label="SLG" value={avg3(m.seasonSlg)} />
          <ResultStat label="wOBA" value={avg3(m.seasonWoba)} />
          <ResultStat label="xwOBA" value={avg3(m.seasonXwoba)} />
          <ResultStat label="PutAway" value={pct(m.seasonPutAway)} />
        </div>
      )}
    </div>
  );
}

/** The collapsible Savant-style arsenal table (one row per pitch type). */
function ArsenalSection({ pitchMix }: { pitchMix: PitchMix[] }) {
  const [open, setOpen] = useState(true);
  const secRef = useScrollIntoViewOnExpand<HTMLDivElement>(open);
  if (pitchMix.length === 0) return null;
  return (
    <div ref={secRef} className={`arsenal${open ? '' : ' collapsed'}`}>
      <button
        type="button"
        className="arsenal-caption"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="arsenal-caption-title">Arsenal</span>
        <span className="arsenal-caption-sub">
          game avg · <span className="am-arrow">▲▼</span> vs season
        </span>
        <span className="arsenal-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && pitchMix.map((m) => <ArsenalRow key={m.pitchType} m={m} />)}
    </div>
  );
}

/** The color keyed to a decision (W/L/S) — the game line's accent. */
function decisionColor(d: PitcherGame['decision']): string {
  if (d === 'W') return 'var(--hit)';
  if (d === 'L') return 'var(--strikeout)';
  if (d === 'S') return 'var(--accent)';
  return 'var(--muted)';
}

/** One labelled stat in the game line — an arsenal metric without the delta. */
function LineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ars-metric">
      <span className="ars-mlabel">{label}</span>
      <span className="ars-mval">{value}</span>
    </div>
  );
}

/**
 * The outing's aggregate line, laid out as an arsenal row rather than a grid of
 * stat pills — the two then read as one table. The head strip carries the
 * decision, innings and pitch count (with strike% as the usage bar), the
 * counting stats fill the metric grid, and the rates ride in the same dashed
 * strip the arsenal uses for its season results.
 */
function GameLine({ pg }: { pg: PitcherGame }) {
  const L = pg.line;
  const color = decisionColor(pg.decision);
  const strike = pg.strikePct === null ? 0 : Math.round(pg.strikePct * 100);
  return (
    <div className="pline">
      <div className="pline-caption">
        <span className="pline-caption-title">Line</span>
        <span className="pline-caption-sub">game totals</span>
      </div>
      <div className="ars-row" style={{ borderLeftColor: color }}>
        <div className="ars-head">
          <span className="ars-dot" style={{ background: color }} />
          {pg.decision && <span className={`ars-abbr dec-${pg.decision}`}>{pg.decision}</span>}
          <span className="ars-name pline-ip">{formatIp(L.outs)} IP</span>
          <span className="ars-count">{L.pitchesThrown} P</span>
          {/* Strike rate fills the arsenal's usage bar. Neutral accent, not the
              decision color — a strike rate isn't good or bad by itself. */}
          <span className="ars-usage" title={`${strike}% of pitches for strikes`}>
            <span className="ars-mlabel">Strike</span>
            <span className="ars-bar">
              <span
                className="ars-bar-fill"
                style={{ width: `${strike}%`, background: 'var(--accent)' }}
              />
            </span>
            <span className="ars-share">{pct(pg.strikePct)}</span>
          </span>
        </div>
        <div className="ars-metrics">
          <LineStat label="H" value={String(L.hits)} />
          <LineStat label="R" value={String(L.runs)} />
          <LineStat label="ER" value={String(L.earnedRuns)} />
          <LineStat label="BB" value={String(L.walks)} />
          <LineStat label="K" value={String(L.strikeouts)} />
          <LineStat label="HR" value={String(L.hr)} />
        </div>
        <div className="ars-results">
          <span className="ars-rtag">Game</span>
          <ResultStat label="ERA" value={eraOf(L)} />
          <ResultStat label="WHIP" value={whipOf(L)} />
          <ResultStat label="Whiff" value={pct(pg.whiffRate)} />
          <ResultStat label="CSW" value={pct(pg.cswRate)} />
        </div>
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
          <GameLine pg={pg} />

          {/* Batters faced — grouped by inning, each result expandable to its pitches */}
          <div className="innings-list">
            {groupByInning(faced).map((group) => (
              <InningBlock key={`${group.inning}-${group.half}`} group={group} gamePk={game.gamePk} />
            ))}
          </div>

          {/* Arsenal: velo/spin/break per pitch type, vs season & league */}
          <ArsenalSection pitchMix={pg.pitchMix} />
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
        {pitched.length === 1 && primary.pitching!.decision && (
          <span className={`dec-tag dec-${primary.pitching!.decision}`}>
            {primary.pitching!.decision}
          </span>
        )}
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
