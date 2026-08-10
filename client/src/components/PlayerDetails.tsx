import { useEffect, useRef, useState, type ReactElement } from 'react';
import { api } from '../api';
import type {
  BatterGameLog,
  PitcherGameLog,
  PitcherSeasonStats,
  PlayerPercentiles,
  PercentileMetric,
  SeasonArsenal,
  SeasonStats,
  XwobaSeries,
} from '../types';
import { headshotUrl, savantPlayerUrl } from '../lib';
import { SeasonArsenalRow, SplitTabs } from './Arsenal';
import type { SplitKey } from './Arsenal';
import { RemoveButton } from './RemoveButton';
import { RollingXwoba } from './RollingXwoba';
import { GameLog } from './GameLog';
import { useLockBodyScroll } from '../hooks';

/**
 * Savant's diverging percentile scale: deep blue (poor, 0) → neutral grey
 * (average, 50) → red (great, 100). The bubble is filled solid at this color
 * and carries the percentile number in white, so identity never rests on hue
 * alone; the bar behind it is the same color at reduced opacity. The grey
 * midpoint is kept dark enough that white numerals stay legible across the range.
 */
const POOR: [number, number, number] = [50, 90, 161];
const AVG: [number, number, number] = [138, 143, 153];
const GREAT: [number, number, number] = [210, 45, 73];

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const c = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
}

function pctColor(p: number): string {
  return p <= 50 ? mix(POOR, AVG, p / 50) : mix(AVG, GREAT, (p - 50) / 50);
}

/** One metric row: label · bar with percentile bubble · raw value. */
function MetricRow({ metric }: { metric: PercentileMetric }) {
  const { label, percentile, value, estimated } = metric;
  const has = percentile !== null;
  const color = has ? pctColor(percentile) : undefined;
  const title = has
    ? `${label} — ${percentile}th percentile${value ? ` (${value})` : ''}` +
      (estimated ? ' · estimated from league avg (no exact Savant rank)' : '')
    : `${label} — no data`;
  return (
    <div className="pct-row" title={title}>
      <span className="pct-label">{label}</span>
      <div className="pct-track">
        {has && (
          <>
            <span
              className="pct-fill"
              style={{ width: `${percentile}%`, background: color }}
            />
            <span
              className={`pct-bubble${estimated ? ' pct-bubble--est' : ''}`}
              style={{ left: `${percentile}%`, background: color }}
            >
              {percentile}
            </span>
          </>
        )}
      </div>
      <span className="pct-value">{value ?? '–'}</span>
    </div>
  );
}

/** Actual-stat key → its expected (x-) counterpart. When both are present in a
 * section they collapse into one dumbbell row instead of two stacked bars. */
const EXPECTED_OF: Record<string, string> = {
  woba: 'xwoba',
  // Pitcher-only: the card's headline pair — what he gave up against what the
  // contact he gave up was worth.
  era: 'xera',
  ba: 'xba',
  obp: 'xobp',
  slg: 'xslg',
  iso: 'xiso',
  hr: 'xhr',
  // Pitcher-only: what the contact he allowed was worth, against what it should
  // have been worth.
  wobacon: 'xwobacon',
};

/**
 * How far a finger may travel between pointerdown and pointerup and still count
 * as a tap rather than the start of a scroll. Chromium's own touch-slop figure.
 */
const TAP_SLOP = 8;

/**
 * A combined actual/expected row. At rest it reads as a normal row for the
 * EXPECTED stat — a filled bar with a solid bubble at the expected percentile —
 * so the card is calm by default. On hover (mouse) or a deliberate tap (touch,
 * see `TAP_SLOP`) it reveals the
 * dumbbell: the fill recedes and the ACTUAL percentile appears as a ring joined
 * to the expected bubble by a connector, so the actual↔expected gap (over/under-
 * performance) is on-demand rather than always-on. Values follow suit: expected
 * shown by default, actual stacked above it once revealed.
 *
 * When revealed and the two percentiles fall within a bubble-width of each other
 * (`overlapPct`, from the live track width) the markers would collide, so they
 * split into two vertical lanes (actual up, expected down) to stay legible.
 */
function PairRow({
  actual,
  expected,
  overlapPct,
}: {
  actual: PercentileMetric;
  expected: PercentileMetric;
  overlapPct: number;
}) {
  const a = actual.percentile;
  const e = expected.percentile;
  const aColor = a !== null ? pctColor(a) : undefined;
  const eColor = e !== null ? pctColor(e) : undefined;
  const both = a !== null && e !== null;
  const [revealed, setRevealed] = useState(false);
  // Where a touch went down, so pointerup can tell a tap from a scroll.
  const tapOrigin = useRef<{ x: number; y: number } | null>(null);
  const staggered = revealed && both && Math.abs(a - e) < overlapPct;
  const title =
    `${actual.label} — actual ${a ?? '–'}th pct (${actual.value ?? '–'}), ` +
    `expected ${e ?? '–'}th pct (${expected.value ?? '–'})` +
    (actual.estimated || expected.estimated ? ' · estimated from league avg' : '');
  return (
    <div
      className={`pct-row pct-row-pair${revealed ? ' is-revealed' : ''}`}
      title={title}
      // Mouse hovers reveal; touch/pen taps toggle (hover doesn't exist there).
      // The toggle waits for pointerup within TAP_SLOP of where the finger went
      // down: the card is a list of rows inside a scroller, and toggling on
      // pointerdown meant every flick that happened to start on a row flipped it.
      onPointerEnter={(ev) => ev.pointerType === 'mouse' && setRevealed(true)}
      onPointerLeave={(ev) => ev.pointerType === 'mouse' && setRevealed(false)}
      onPointerDown={(ev) => {
        tapOrigin.current =
          ev.pointerType === 'mouse' ? null : { x: ev.clientX, y: ev.clientY };
      }}
      onPointerUp={(ev) => {
        const start = tapOrigin.current;
        tapOrigin.current = null;
        if (!start) return;
        const moved = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
        if (moved <= TAP_SLOP) setRevealed((r) => !r);
      }}
      // A scroll the browser takes over cancels the pointer without an up.
      onPointerCancel={() => {
        tapOrigin.current = null;
      }}
    >
      {/* At rest the row is the expected stat, so it wears the expected label
          (e.g. "xwOBA"); revealing the dumbbell promotes the actual, so the
          label falls back to the base stat ("wOBA"). */}
      <span className="pct-label">{revealed ? actual.label : expected.label}</span>
      <div className="pct-track">
        {e !== null && (
          <span className="pct-fill" style={{ width: `${e}%`, background: eColor }} />
        )}
        {both && (
          <span
            className="pct-connector pct-actual"
            style={{ left: `${Math.min(a, e)}%`, width: `${Math.abs(a - e)}%` }}
          />
        )}
        {e !== null && (
          <span
            className={`pct-bubble${staggered ? ' pct-bubble--down' : ''}${expected.estimated ? ' pct-bubble--est' : ''}`}
            style={{ left: `${e}%`, background: eColor }}
          >
            {e}
          </span>
        )}
        {a !== null && (
          <span
            className={`pct-bubble pct-bubble-x pct-actual${staggered ? ' pct-bubble--up' : ''}${actual.estimated ? ' pct-bubble--est' : ''}`}
            style={{ left: `${a}%`, color: aColor, borderColor: aColor }}
          >
            {a}
          </span>
        )}
      </div>
      <span className="pct-value pct-value-pair">
        {revealed && a !== null && <span className="pct-value-actual">{actual.value ?? '–'}</span>}
        {/* The "x" only appears once revealed, where it disambiguates the muted
            expected subline from the actual; at rest the label already says so. */}
        <span className="pct-value-expected">
          {revealed ? 'x' : ''}
          {expected.value ?? '–'}
        </span>
      </span>
    </div>
  );
}

/** Render a section's metrics, collapsing each actual/expected pair (when both
 * are present) into a single dumbbell row; everything else stays a normal row. */
function renderMetricRows(metrics: PercentileMetric[], overlapPct: number): ReactElement[] {
  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const consumed = new Set<string>();
  const rows: ReactElement[] = [];
  for (const m of metrics) {
    if (consumed.has(m.key)) continue;
    const xKey = EXPECTED_OF[m.key];
    const expected = xKey ? byKey.get(xKey) : undefined;
    if (expected) {
      consumed.add(xKey);
      rows.push(<PairRow key={m.key} actual={m} expected={expected} overlapPct={overlapPct} />);
    } else {
      rows.push(<MetricRow key={m.key} metric={m} />);
    }
  }
  return rows;
}

/** One stat cell in a Season-tab block. A value the source doesn't carry is
 *  dropped rather than dashed — see `Cells` below. */
function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-pill">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/** A stat MLB doesn't carry for this slice comes back as the em-dash `str()`
 *  falls back to (a split has no ERA — earned runs aren't split by hand), and a
 *  derived one comes back null. Either way the pill is left out: a block should
 *  show the stats it has, not a row of dashes standing in for the ones it can't. */
function has(v: string | null | undefined): v is string {
  return !!v && v !== '—';
}

/**
 * The batter's stat row. One list, rendered for the whole season and for each
 * platoon half alike, so a split reads column-for-column against the line above
 * it. It carries what the rest of the app leaves out (R, SB, games) — this is
 * the one place that shows the season whole rather than a slice of it: the cards
 * summarise it in a sentence, the summary table only spans the report's range.
 * `whole` marks the season-wide block, which is the only one MLB gives runs and
 * steals for (see below).
 */
function BatterStats({ s, whole }: { s: SeasonStats; whole: boolean }) {
  return (
    <div className="stat-row">
      <StatCell label="AVG" value={s.avg} />
      <StatCell label="OBP" value={s.obp} />
      <StatCell label="SLG" value={s.slg} />
      <StatCell label="OPS" value={s.ops} />
      <StatCell label="HR" value={String(s.hr)} />
      <StatCell label="RBI" value={String(s.rbi)} />
      {/* Runs and steals are season-only, and not by choice: MLB's platoon
          splits come back with both zeroed for every player, so a split would
          print "0 R" for a leadoff hitter with 44 of them. A false zero reads as
          a real one — 0 is a value a low-PA split could genuinely have — so the
          only honest move is to leave them off the half-season blocks. */}
      {whole && <StatCell label="R" value={String(s.runs)} />}
      {whole && <StatCell label="SB" value={String(s.sb)} />}
      <StatCell label="AB" value={String(s.atBats)} />
    </div>
  );
}

/**
 * The pitcher's stat row, again shared by the season and its halves. Each
 * ERA-scale estimator sits immediately after the number it estimates (ERA →
 * xERA, FIP → xFIP), the way the collapsed card's summary pairs them — the
 * comparison is the reason they're carried. A half of the season shows fewer of
 * them than the whole does, and not by choice: MLB doesn't split earned runs, so
 * a split has no ERA, and xERA/xFIP are season-wide (the leaderboard doesn't
 * split, and the fly-ball count behind xFIP is tallied over the whole CSV).
 */
function PitcherStats({ s }: { s: PitcherSeasonStats }) {
  return (
    <div className="stat-row">
      {has(s.era) && <StatCell label="ERA" value={s.era} />}
      {has(s.xera) && <StatCell label="xERA" value={s.xera} />}
      {has(s.fip) && <StatCell label="FIP" value={s.fip} />}
      {has(s.xfip) && <StatCell label="xFIP" value={s.xfip} />}
      <StatCell label="WHIP" value={s.whip} />
      <StatCell label="AVG" value={s.avgAgainst} />
      <StatCell label="K/9" value={s.strikeoutsPer9} />
      <StatCell label="BB/9" value={s.walksPer9} />
      <StatCell label="HR/9" value={s.homeRunsPer9} />
      <StatCell label="K%" value={s.kRate} />
      <StatCell label="BB%" value={s.bbRate} />
      <StatCell label="K" value={String(s.strikeOuts)} />
      <StatCell label="BB" value={String(s.baseOnBalls)} />
      <StatCell label="HR" value={String(s.homeRuns)} />
    </div>
  );
}

/**
 * One block of the Season card: a head carrying the label and that slice's
 * sample size, then the stats. `whole` marks the season-wide block, which is the
 * only one with a games count to report.
 */
function BatterBlock({
  label,
  s,
  whole = false,
}: {
  label: string;
  s: SeasonStats | null;
  whole?: boolean;
}) {
  if (!s || s.pa === 0) {
    return (
      <div className="split-block">
        <div className="split-head">{label}</div>
        <div className="split-empty">
          No plate appearances {whole ? '' : `${label.toLowerCase()} `}this season.
        </div>
      </div>
    );
  }
  return (
    <div className="split-block">
      <div className="split-head">
        {label} · {whole ? `${s.gamesPlayed} G · ${s.pa} PA` : `${s.pa} PA`}
      </div>
      <BatterStats s={s} whole={whole} />
    </div>
  );
}

/** The same block for a pitcher, measured in batters faced. */
function PitcherBlock({
  label,
  s,
  whole = false,
}: {
  label: string;
  s: PitcherSeasonStats | null;
  whole?: boolean;
}) {
  if (!s || s.battersFaced === 0) {
    return (
      <div className="split-block">
        <div className="split-head">{label}</div>
        <div className="split-empty">
          No batters faced {whole ? '' : `${label.toLowerCase()} `}this season.
        </div>
      </div>
    );
  }
  return (
    <div className="split-block">
      <div className="split-head">
        {label} ·{' '}
        {whole
          ? `${s.gamesPlayed} G · ${s.gamesStarted} GS · ${s.inningsPitched} IP`
          : `${s.battersFaced} BF`}
      </div>
      <PitcherStats s={s} />
    </div>
  );
}

/**
 * The Season tab: the whole season and the two halves of it, as one card. They
 * are the same line cut three ways, so they read as one table of labelled blocks
 * rather than as separate cards — the overall row is the thing a split is a
 * split *of*, and the comparison only lands with them stacked together.
 */
function SeasonPanel({
  season,
  vsLeft,
  vsRight,
}: {
  season: SeasonStats | null;
  vsLeft: SeasonStats | null;
  vsRight: SeasonStats | null;
}) {
  return (
    <div className="pct-card">
      <div className="pct-card-head">
        <span className="pct-card-title">Season</span>
      </div>
      <BatterBlock label="Overall" s={season} whole />
      <BatterBlock label="vs LHP" s={vsLeft} />
      <BatterBlock label="vs RHP" s={vsRight} />
    </div>
  );
}

/** The same card for a pitcher — his season, then the line against each side. */
function PitcherSeasonPanel({
  season,
  vsLeft,
  vsRight,
}: {
  season: PitcherSeasonStats | null;
  vsLeft: PitcherSeasonStats | null;
  vsRight: PitcherSeasonStats | null;
}) {
  return (
    <div className="pct-card">
      <div className="pct-card-head">
        <span className="pct-card-title">Season</span>
      </div>
      <PitcherBlock label="Overall" s={season} whole />
      <PitcherBlock label="vs LHB" s={vsLeft} />
      <PitcherBlock label="vs RHB" s={vsRight} />
    </div>
  );
}

type DetailsTab = 'percentiles' | 'splits' | 'gamelog' | 'rolling' | 'arsenal';

/**
 * The Arsenal tab: a pitcher's season pitch mix, overall or against one batter
 * handedness. Usage share is relative to the selected view, so a split's shares
 * still add to 100% — that's the point of the split, since who he faces changes
 * what he throws.
 */
function ArsenalTab({
  arsenal,
  split,
  onSplit,
}: {
  arsenal: SeasonArsenal;
  split: SplitKey;
  onSplit: (v: SplitKey) => void;
}) {
  const pitches =
    (split === 'R' ? arsenal.vsRight : split === 'L' ? arsenal.vsLeft : null) ?? arsenal.pitches;
  if (arsenal.pitches.length === 0) {
    return <div className="details-status">No Statcast pitches this season.</div>;
  }
  return (
    <div className="details-arsenal">
      <p className="details-note">
        Season averages per pitch type. <span className="am-arrow">▲▼</span> compares him to the
        league average for that pitch — green means better for that pitch, so a four-seamer wants
        more ride and a changeup more drop.
      </p>
      <SplitTabs
        hasRight={!!arsenal.vsRight}
        hasLeft={!!arsenal.vsLeft}
        value={split}
        onChange={onSplit}
      />
      <div className="arsenal">
        {pitches.map((p) => (
          <SeasonArsenalRow key={p.pitchType} p={p} />
        ))}
      </div>
    </div>
  );
}

export function PlayerDetails({
  playerId,
  name,
  position,
  isPitcher = false,
  isWatched,
  rosterPct,
  rosterTrend,
  onAdd,
  onRemove,
  onClose,
}: {
  playerId: number;
  name: string;
  position?: string;
  isPitcher?: boolean;
  isWatched: boolean;
  /** ESPN's global rostered percentage. `undefined` with no fantasy league
   *  connected, which is what hides the line; `null` when there is one but
   *  ESPN has no figure for this player. */
  rosterPct?: number | null;
  /** How that figure has moved, and over how long. Absent with no league or no
   *  baseline; a `change` of 0 is a real answer and renders as "flat". */
  rosterTrend?: { change: number; days: number };
  onAdd: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  // This view covers the page but scrolls in its own box, so the list behind it
  // has to be frozen — otherwise the scroll chains straight through and closing
  // the view lands somewhere the user never scrolled to.
  useLockBodyScroll();
  const kind = isPitcher ? 'pitcher' : 'batter';
  const [tab, setTab] = useState<DetailsTab>('percentiles');
  // The Remove button arms on the first tap and commits on the second, as it
  // does on the reorder screen — see RemoveButton. There is no undo.
  const [armedRemove, setArmedRemove] = useState(false);
  const [data, setData] = useState<PlayerPercentiles | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // The season line and platoon splits are fetched here (not passed in) so the
  // details view works for any player, whether or not they're on the watchlist.
  const [splits, setSplits] = useState<{
    season: SeasonStats | null;
    vsLeft: SeasonStats | null;
    vsRight: SeasonStats | null;
  } | null>(null);
  const [pitcherSplits, setPitcherSplits] = useState<{
    season: PitcherSeasonStats | null;
    vsLeft: PitcherSeasonStats | null;
    vsRight: PitcherSeasonStats | null;
  } | null>(null);
  const [splitsError, setSplitsError] = useState<string | null>(null);
  const [splitsLoading, setSplitsLoading] = useState(true);
  // The season xwOBA series backs the Rolling xwOBA tab. It's a heavier Savant
  // fetch, so it's loaded lazily — only once that tab is first opened.
  const [xwoba, setXwoba] = useState<XwobaSeries | null>(null);
  const [xwobaError, setXwobaError] = useState<string | null>(null);
  const [xwobaLoading, setXwobaLoading] = useState(false);
  // The season arsenal backs the pitcher-only Arsenal tab — another heavy Savant
  // fetch, so it's lazy in the same way.
  // The season game log backs the Game Log tab — a whole season of rows, so it
  // loads lazily on first open like the two above it.
  const [gameLog, setGameLog] = useState<
    { kind: 'batter'; games: BatterGameLog[] } | { kind: 'pitcher'; games: PitcherGameLog[] } | null
  >(null);
  const [gameLogError, setGameLogError] = useState<string | null>(null);
  const [gameLogLoading, setGameLogLoading] = useState(false);
  const [arsenal, setArsenal] = useState<SeasonArsenal | null>(null);
  const [arsenalSplit, setArsenalSplit] = useState<SplitKey>('all');
  const [arsenalError, setArsenalError] = useState<string | null>(null);
  const [arsenalLoading, setArsenalLoading] = useState(false);
  const arsenalReq = useRef<number | null>(null);
  const xwobaReq = useRef<number | null>(null);
  // Keyed by kind as well as player: a two-way player's two logs are two
  // different requests, and the batter's must not stand in for the pitcher's.
  const gameLogReq = useRef<string | null>(null);

  // The percentile-point distance below which two paired bubbles would overlap,
  // measured from the live track width (~a bubble diameter's worth of the rail)
  // so the stagger threshold stays correct across desktop and mobile widths.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [overlapPct, setOverlapPct] = useState(8);
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const measure = () => {
      const track = card.querySelector('.pct-track');
      const w = track?.clientWidth ?? 0;
      if (w > 0) setOverlapPct(Math.min(40, (23 / w) * 100)); // 23px ≈ bubble + breathing room
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(card);
    return () => ro.disconnect();
  }, [data]);

  // Close on Escape, matching a modal/back affordance.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    setData(null);
    api
      .percentiles(playerId, kind)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [playerId, kind]);

  useEffect(() => {
    let live = true;
    setSplitsLoading(true);
    setSplitsError(null);
    setSplits(null);
    setPitcherSplits(null);
    const req = isPitcher
      ? api.pitcherSplits(playerId).then((d) => {
          if (live) setPitcherSplits(d);
        })
      : api.splits(playerId).then((d) => {
          if (live) setSplits(d);
        });
    req
      .catch((e: unknown) => {
        if (live) setSplitsError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (live) setSplitsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [playerId, isPitcher]);

  // Reset the (lazily-loaded) rolling series when the player changes.
  useEffect(() => {
    xwobaReq.current = null;
    setXwoba(null);
    setXwobaError(null);
    arsenalReq.current = null;
    setArsenal(null);
    setArsenalError(null);
    setArsenalSplit('all');
    gameLogReq.current = null;
    setGameLog(null);
    setGameLogError(null);
  }, [playerId]);

  // Same lazy load for the Game Log tab.
  useEffect(() => {
    const req = `${kind}-${playerId}`;
    if (tab !== 'gamelog' || gameLogReq.current === req) return;
    gameLogReq.current = req;
    let live = true;
    setGameLogLoading(true);
    setGameLogError(null);
    (isPitcher ? api.pitcherGameLog(playerId) : api.gameLog(playerId))
      .then((d) => {
        if (live) setGameLog(d);
      })
      .catch((e: unknown) => {
        if (live) {
          setGameLogError(e instanceof Error ? e.message : 'Failed to load');
          gameLogReq.current = null; // allow a retry on re-open
        }
      })
      .finally(() => {
        if (live) setGameLogLoading(false);
      });
    return () => {
      live = false;
    };
  }, [tab, playerId, isPitcher, kind]);

  // Same lazy load for the Arsenal tab.
  useEffect(() => {
    if (tab !== 'arsenal' || arsenalReq.current === playerId) return;
    arsenalReq.current = playerId;
    let live = true;
    setArsenalLoading(true);
    setArsenalError(null);
    api
      .arsenal(playerId)
      .then((d) => {
        if (live) setArsenal(d);
      })
      .catch((e: unknown) => {
        if (live) {
          setArsenalError(e instanceof Error ? e.message : 'Failed to load');
          arsenalReq.current = null; // allow a retry on re-open
        }
      })
      .finally(() => {
        if (live) setArsenalLoading(false);
      });
    return () => {
      live = false;
    };
  }, [tab, playerId]);

  // Fetch the season xwOBA series the first time the Rolling tab is opened for
  // this player (xwobaReq tracks which player we've already requested).
  useEffect(() => {
    if (tab !== 'rolling' || xwobaReq.current === playerId) return;
    xwobaReq.current = playerId;
    let live = true;
    setXwobaLoading(true);
    setXwobaError(null);
    api
      .xwoba(playerId, kind)
      .then((d) => {
        if (live) setXwoba(d);
      })
      .catch((e: unknown) => {
        if (live) {
          setXwobaError(e instanceof Error ? e.message : 'Failed to load');
          xwobaReq.current = null; // allow a retry on re-open
        }
      })
      .finally(() => {
        if (live) setXwobaLoading(false);
      });
    return () => {
      live = false;
    };
  }, [tab, playerId, kind]);

  return (
    // Every tab scrolls the overlay, the Game Log included: it used to become a
    // fixed-height column so its table's own box could scroll and the header
    // could stick to that, and now the header sticks to the overlay instead.
    <div className="details-view">
      <div className="details-head">
        <button type="button" className="details-back" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>
        <div className="details-id">
          <img className="details-photo" src={headshotUrl(playerId)} alt={name} />
          <div>
            <h1 className="details-name">
              {name}
              {position && <span className="player-pos">{position}</span>}
            </h1>
            {/* Under the name rather than out beside the watchlist button: it
                is a fact *about the player*, like the position chip above it,
                where the buttons on the right are things you do to him. Absent
                entirely without a fantasy league — and dashed rather than
                hidden when there is one but ESPN has no figure for him, since
                on a connected account a missing number is information. */}
            {rosterPct !== undefined && (
              <p
                className="details-rostered"
                title="Rostered in this share of all ESPN leagues — ESPN's own figure, not your league's"
              >
                Rostered{' '}
                <strong>{rosterPct === null ? '—' : `${rosterPct.toFixed(1)}%`}</strong>
                {rosterPct !== null && rosterTrend && (
                  <span
                    className={`details-trend${
                      rosterTrend.change > 0
                        ? ' up'
                        : rosterTrend.change < 0
                          ? ' down'
                          : ''
                    }`}
                    title={`Change over the last ${rosterTrend.days} day${
                      rosterTrend.days === 1 ? '' : 's'
                    }`}
                  >
                    {rosterTrend.change === 0
                      ? `flat over ${rosterTrend.days}d`
                      : `${rosterTrend.change > 0 ? '▲' : '▼'} ${Math.abs(
                          rosterTrend.change,
                        ).toFixed(1)} in ${rosterTrend.days}d`}
                  </span>
                )}
              </p>
            )}
            <a
              className="details-savant-link"
              href={savantPlayerUrl(name, playerId)}
              target="_blank"
              rel="noreferrer"
            >
              View on Baseball Savant ↗
            </a>
          </div>
        </div>
        {isWatched ? (
          <div className="details-watch-actions">
            <span className="details-watched" title={`${name} is on your watchlist`}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              On watchlist
            </span>
            <RemoveButton
              name={name}
              armed={armedRemove}
              onArm={() => setArmedRemove(true)}
              onRemove={onRemove}
            />
          </div>
        ) : (
          <button
            type="button"
            className="details-add"
            onClick={onAdd}
            title={`Add ${name} to your watchlist`}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add to watchlist
          </button>
        )}
      </div>

      <div className="details-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'percentiles'}
          className={`details-tab${tab === 'percentiles' ? ' is-active' : ''}`}
          onClick={() => setTab('percentiles')}
        >
          Percentile Rankings
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'splits'}
          className={`details-tab${tab === 'splits' ? ' is-active' : ''}`}
          onClick={() => setTab('splits')}
        >
          Season
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'gamelog'}
          className={`details-tab${tab === 'gamelog' ? ' is-active' : ''}`}
          onClick={() => setTab('gamelog')}
        >
          Game Log
        </button>
        {isPitcher && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'arsenal'}
            className={`details-tab${tab === 'arsenal' ? ' is-active' : ''}`}
            onClick={() => setTab('arsenal')}
          >
            Arsenal
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'rolling'}
          className={`details-tab${tab === 'rolling' ? ' is-active' : ''}`}
          onClick={() => setTab('rolling')}
        >
          Rolling xwOBA
        </button>
      </div>

      {tab === 'arsenal' && arsenalLoading && (
        <div className="details-status">Loading season arsenal…</div>
      )}
      {tab === 'arsenal' && arsenalError && !arsenalLoading && (
        <div className="details-status details-error">⚠ {arsenalError}</div>
      )}
      {tab === 'arsenal' && arsenal && !arsenalLoading && (
        <ArsenalTab arsenal={arsenal} split={arsenalSplit} onSplit={setArsenalSplit} />
      )}

      {tab === 'gamelog' && gameLogLoading && (
        <div className="details-status">Loading game log…</div>
      )}
      {tab === 'gamelog' && gameLogError && !gameLogLoading && (
        <div className="details-status details-error">
          Couldn’t load the game log: {gameLogError}
        </div>
      )}
      {tab === 'gamelog' && gameLog && !gameLogLoading && <GameLog {...gameLog} />}

      {tab === 'rolling' && xwobaLoading && (
        <div className="details-status">Loading season xwOBA…</div>
      )}
      {tab === 'rolling' && xwobaError && !xwobaLoading && (
        <div className="details-status details-error">
          Couldn’t load xwOBA: {xwobaError}
        </div>
      )}
      {tab === 'rolling' && xwoba && !xwobaLoading && (
        <RollingXwoba series={xwoba} name={name} />
      )}

      {tab === 'splits' && splitsLoading && (
        <div className="details-status">Loading season stats…</div>
      )}
      {tab === 'splits' && splitsError && !splitsLoading && (
        <div className="details-status details-error">
          Couldn’t load season stats: {splitsError}
        </div>
      )}
      {tab === 'splits' && !splitsLoading && isPitcher && pitcherSplits && (
        <PitcherSeasonPanel
          season={pitcherSplits.season}
          vsLeft={pitcherSplits.vsLeft}
          vsRight={pitcherSplits.vsRight}
        />
      )}
      {tab === 'splits' && !splitsLoading && !isPitcher && splits && (
        <SeasonPanel season={splits.season} vsLeft={splits.vsLeft} vsRight={splits.vsRight} />
      )}

      {tab === 'percentiles' && loading && (
        <div className="details-status">Loading percentile rankings…</div>
      )}
      {tab === 'percentiles' && error && !loading && (
        <div className="details-status details-error">
          Couldn’t load percentile rankings: {error}
        </div>
      )}
      {tab === 'percentiles' && data && !loading && (
        <div className="pct-card" ref={cardRef}>
          <div className="pct-card-head">
            <span className="pct-card-title">{data.year} MLB Percentile Rankings</span>
          </div>
          {data.sections.map((sec) => (
            <div className="pct-section" key={sec.title}>
              <h2 className="pct-section-title">{sec.title}</h2>
              {renderMetricRows(sec.metrics, overlapPct)}
            </div>
          ))}
          {data.sections.length === 0 && (
            <div className="details-status">No Statcast data for this player.</div>
          )}
        </div>
      )}
    </div>
  );
}
