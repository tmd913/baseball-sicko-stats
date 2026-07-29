import { useState, type ReactNode } from 'react';
import type {
  FacedBatter,
  PitcherGame,
  PitcherSplit,
  PitchingLine,
  PlayerGame,
  PlayerReport,
} from '../types';
import { playerKey } from '../types';
import { useScrollIntoViewOnExpand } from '../hooks';
import {
  combinePitchingLines,
  eraOf,
  eventLabel,
  formatIp,
  liveRole,
  mostRecentGameFirst,
  outcomeKind,
  pitcherSeasonSummary,
  prettyGameDate,
  whipOf,
} from '../lib';
import {
  ArsenalRow,
  SplitTabs,
  ResultStat,
  RateBar,
  avg3,
  pct,
} from './Arsenal';
import type { SplitKey } from './Arsenal';
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

/** Group the batters faced by inning, preserving play order — so both the
 * innings and the batters within each one read first-to-last. */
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
function FacedBatterCard({
  fb,
  seq,
  gamePk,
}: {
  fb: FacedBatter;
  // Where this batter came up within the inning — 1 for the inning's first.
  seq: number;
  gamePk: number;
}) {
  const [open, setOpen] = useState(false);
  const kind = outcomeKind(fb.event);
  const expandable = fb.pitches.length > 0;
  // On expand, bring this batter to the top of the screen — same as a batter's
  // at-bat card, so the pitch sequence isn't left below the fold.
  const cardRef = useScrollIntoViewOnExpand<HTMLDivElement>(open);

  const summary = (
    <>
      <span className="faced-seq" title={`Batter ${seq} of the inning`}>
        {seq}
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
      {expandable && <span className="faced-pitches">{fb.pitches.length} P</span>}
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
function InningBlock({
  group,
  gamePk,
  active,
}: {
  group: InningGroup;
  gamePk: number;
  // The pitcher is on the mound right now, in this inning.
  active: boolean;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const s = inningStats(group.batters);
  const isTop = group.half === 'Top';
  // Expanding an inning brings it to the top of the screen, like a game block.
  const blockRef = useScrollIntoViewOnExpand<HTMLDivElement>(!collapsed);
  return (
    <div
      ref={blockRef}
      className={`inning-block${collapsed ? ' collapsed' : ''}${active ? ' active' : ''}`}
    >
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
        {active && <span className="inning-live">Live</span>}
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
      </button>
      {!collapsed && (
        <div className="inning-batters">
          {group.batters.map((fb, i) => (
            <FacedBatterCard
              key={`${fb.batterId}-${fb.inning}-${i}`}
              fb={fb}
              seq={i + 1}
              gamePk={gamePk}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One collapsible section of a pitcher card — Line, Innings, Arsenal. The bar
 * reuses the batter card's game bar (`.game-sub-bar`) so the two cards' toggles
 * share one format: a bare label, no caret. Expanding scrolls it to the top,
 * like every other collapsible in the app.
 */
function CardSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const secRef = useScrollIntoViewOnExpand<HTMLDivElement>(open);
  return (
    <div ref={secRef} className="card-section">
      <button
        type="button"
        className="game-sub-bar section-bar"
        aria-expanded={open}
        title={open ? `Collapse ${title.toLowerCase()}` : `Expand ${title.toLowerCase()}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="section-title">{title}</span>
      </button>
      {open && children}
    </div>
  );
}

/** The selected handedness split, or null for the whole outing. */
function splitOf(pg: PitcherGame, key: SplitKey): PitcherSplit | null {
  if (key === 'R') return pg.vsRight;
  if (key === 'L') return pg.vsLeft;
  return null;
}

/** The Savant-style arsenal table (one row per pitch type), for the whole
 * outing or one batter handedness. */
function ArsenalSection({ pg }: { pg: PitcherGame }) {
  const [split, setSplit] = useState<SplitKey>('all');
  if (pg.pitchMix.length === 0) return null;
  const mix = splitOf(pg, split)?.pitchMix ?? pg.pitchMix;
  return (
    <CardSection title="Arsenal">
      <SplitTabs hasRight={!!pg.vsRight} hasLeft={!!pg.vsLeft} value={split} onChange={setSplit} />
      <div className="arsenal">
        {mix.map((m) => (
          <ArsenalRow key={m.pitchType} m={m} />
        ))}
      </div>
    </CardSection>
  );
}

/** The color keyed to a decision (W/L/S) — the game line's accent. */
function decisionColor(d: PitcherGame['decision']): string {
  if (d === 'W') return 'var(--hit)';
  if (d === 'L') return 'var(--strikeout)';
  if (d === 'S') return 'var(--accent)';
  return 'var(--muted)';
}

/** Batted-ball threshold Statcast calls "hard hit". */
const HARD_HIT_MPH = 95;

/**
 * Contact quality allowed, over the balls the pitcher let the batter put in
 * play. Derived from the plays rather than the boxscore — the boxscore only
 * counts batted-ball *outs*, and exit velocity isn't in it at all. A ball
 * counts as in play once it has either a trajectory or an exit velocity;
 * Statcast misses one or the other often enough to need both.
 */
function battedBallStats(faced: FacedBatter[]) {
  let bip = 0;
  let evSum = 0;
  let evCount = 0;
  let maxEv: number | null = null;
  let hard = 0;
  let gb = 0;
  let ld = 0;
  let fly = 0; // fly balls and popups together — the usual "FB%"
  for (const fb of faced) {
    const t = fb.bbType;
    if (!t && fb.launchSpeed === null) continue;
    bip++;
    if (fb.launchSpeed !== null) {
      evSum += fb.launchSpeed;
      evCount++;
      if (maxEv === null || fb.launchSpeed > maxEv) maxEv = fb.launchSpeed;
      if (fb.launchSpeed >= HARD_HIT_MPH) hard++;
    }
    if (t?.includes('ground')) gb++;
    else if (t?.includes('line')) ld++;
    else if (t?.includes('fly') || t?.includes('popup')) fly++;
  }
  const share = (n: number) => (bip ? n / bip : null);
  return {
    bip,
    avgEv: evCount ? evSum / evCount : null,
    maxEv,
    // Over the batted balls Statcast actually tracked, not all of them.
    hardPct: evCount ? hard / evCount : null,
    gbPct: share(gb),
    ldPct: share(ld),
    fbPct: share(fly),
  };
}

/**
 * The outing's aggregate line, laid out as an arsenal row rather than a grid of
 * stat pills — the two then read as one table. The head strip carries the
 * decision, innings and pitch count (with strike% as the usage bar), the
 * counting stats fill the metric grid, and the rates ride in the same dashed
 * strip the arsenal uses for its season results.
 */
function GameLine({ pg }: { pg: PitcherGame }) {
  const [split, setSplit] = useState<SplitKey>('all');
  const sp = splitOf(pg, split);
  // A split's line is derived from the plays, so it has no innings, and the
  // decision belongs to the game as a whole — both are Overall-only.
  const L = sp ? sp.line : pg.line;
  const rates = sp ?? pg;
  const color = sp ? 'var(--accent)' : decisionColor(pg.decision);
  const strike = rates.strikePct === null ? 0 : Math.round(rates.strikePct * 100);
  const bb = battedBallStats(
    split === 'all' ? pg.facedBatters : pg.facedBatters.filter((f) => f.stand === split),
  );
  // Rates over batters faced, the denominator Savant uses for K%/BB%.
  const perBf = (n: number) => (L.battersFaced ? n / L.battersFaced : null);
  const singles = Math.max(0, L.hits - L.doubles - L.triples - L.hr);
  return (
    <CardSection title="Line">
      <SplitTabs hasRight={!!pg.vsRight} hasLeft={!!pg.vsLeft} value={split} onChange={setSplit} />
      <div className="pline">
        <div className="ars-row" style={{ borderLeftColor: color }}>
          <div className="ars-head">
            <span className="ars-dot" style={{ background: color }} />
            {!sp && pg.decision && (
              <span className={`ars-abbr dec-${pg.decision}`}>{pg.decision}</span>
            )}
            <span className="ars-name pline-ip">
              {sp ? `${L.battersFaced} BF` : `${formatIp(L.outs)} IP`}
            </span>
            <span className="ars-count">{L.pitchesThrown} P</span>
            {/* The arsenal's rate bar, so the line and the rows read alike.
                Neutral accent, not the decision color — a strike rate isn't
                good or bad by itself. */}
            <RateBar
              label="Strike"
              pct={rates.strikePct === null ? null : strike}
              color="var(--accent)"
              counts={`${L.strikes} S · ${L.balls} B`}
            />
          </div>
          {/* Hits broken out by base, then runs, free passes and strikeouts. */}
          <div className="ars-results">
            <span className="ars-rtag">Results</span>
            <ResultStat label="H" value={String(L.hits)} title={`${singles} singles`} />
            <ResultStat label="2B" value={String(L.doubles)} />
            <ResultStat label="3B" value={String(L.triples)} />
            <ResultStat label="HR" value={String(L.hr)} />
            <ResultStat
              label="R"
              value={String(L.runs)}
              title={sp ? 'Runs that scored on these plays' : undefined}
            />
            <ResultStat label="ER" value={String(L.earnedRuns)} />
            <ResultStat
              label="BB"
              value={String(L.walks)}
              title={L.intentionalWalks ? `${L.intentionalWalks} intentional` : undefined}
            />
            <ResultStat label="HBP" value={String(L.hitBatsmen)} />
            <ResultStat label="K" value={String(L.strikeouts)} />
          </div>
          <div className="ars-results">
            <span className="ars-rtag">Rates</span>
            {/* Both are per-inning, and a split has no innings of its own. */}
            {!sp && <ResultStat label="ERA" value={eraOf(L)} />}
            {!sp && <ResultStat label="WHIP" value={whipOf(L)} />}
            <ResultStat label="BAA" value={avg3(L.atBats ? L.hits / L.atBats : null)} />
            <ResultStat label="K%" value={pct(perBf(L.strikeouts))} />
            <ResultStat label="BB%" value={pct(perBf(L.walks))} />
            <ResultStat label="Whiff" value={pct(rates.whiffRate)} />
            <ResultStat label="CSW" value={pct(rates.cswRate)} />
            {/* Only worth the space when they actually happened. */}
            {L.wildPitches > 0 && <ResultStat label="WP" value={String(L.wildPitches)} />}
            {L.inheritedRunners > 0 && (
              <ResultStat
                label="IR scored"
                value={`${L.inheritedRunnersScored}/${L.inheritedRunners}`}
              />
            )}
          </div>
          {bb.bip > 0 && (
            <div className="ars-results" title={`${bb.bip} balls in play`}>
              <span className="ars-rtag">Contact</span>
              <ResultStat label="BIP" value={String(bb.bip)} />
              <ResultStat label="EV" value={bb.avgEv === null ? '—' : bb.avgEv.toFixed(1)} />
              <ResultStat label="Max" value={bb.maxEv === null ? '—' : bb.maxEv.toFixed(1)} />
              <ResultStat label={`${HARD_HIT_MPH}+`} value={pct(bb.hardPct)} />
              <ResultStat label="GB" value={pct(bb.gbPct)} />
              <ResultStat label="LD" value={pct(bb.ldPct)} />
              <ResultStat label="FB" value={pct(bb.fbPct)} />
            </div>
          )}
        </div>
      </div>
    </CardSection>
  );
}

/** One game a watched pitcher threw in: aggregate stats + arsenal + batters faced. */
function PitcherGameBlock({
  game,
  pitcherId,
  showMatchup,
  spansMultipleDays,
}: {
  game: PlayerGame;
  pitcherId: number;
  showMatchup: boolean;
  spansMultipleDays: boolean;
}) {
  const pg = game.pitching!;
  const L = pg.line;
  const [collapsed, setCollapsed] = useState(showMatchup);
  const blockRef = useScrollIntoViewOnExpand<HTMLDivElement>(!collapsed);
  // Always in play order, live or final — an outing reads first inning down.
  const faced = pg.facedBatters;
  // While this pitcher is the one on the mound, the half-inning he's throwing
  // gets a live accent. Null once the game is over or he's been pulled.
  const st = game.status;
  const onMound = st.state === 'live' && st.pitchingId === pitcherId;
  const activeInning = onMound ? st.currentInning : null;
  const activeIsTop = st.isTopInning;

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
          <CardSection title="Innings">
            <div className="innings-list">
              {groupByInning(faced).map((group) => (
                <InningBlock
                  key={`${group.inning}-${group.half}`}
                  group={group}
                  gamePk={game.gamePk}
                  active={
                    group.inning === activeInning && (group.half === 'Top') === activeIsTop
                  }
                />
              ))}
            </div>
          </CardSection>

          {/* Arsenal: velo/spin/break per pitch type, vs season & league */}
          <ArsenalSection pg={pg} />
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
  onOpenDetails: (key: string) => void;
}) {
  const games = [...report.games].sort(mostRecentGameFirst);
  const pitched = games.filter((g) => g.pitching);
  const role = liveRole(report);

  // No outing in range — a header-only card with the game status (scheduled /
  // "did not pitch").
  if (pitched.length === 0) {
    const meta = report.pitcherSeasonStats ? pitcherSeasonSummary(report.pitcherSeasonStats) : null;
    return (
      <div className="player-card empty" id={`player-${playerKey(report)}`}>
        <div className="player-head">
          <Headshot id={report.id} name={report.name} onOpen={() => onOpenDetails(playerKey(report))} role={role} />
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
      <Headshot id={report.id} name={report.name} onOpen={() => onOpenDetails(playerKey(report))} role={role} />
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
      id={`player-${playerKey(report)}`}
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
            pitcherId={report.id}
            showMatchup={showMatchup}
            spansMultipleDays={spansMultipleDays}
          />
        ))}
    </div>
  );
}
