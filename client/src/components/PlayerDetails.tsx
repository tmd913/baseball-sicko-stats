import { useEffect, useRef, useState, type ReactElement } from 'react';
import { api } from '../api';
import type { PlayerPercentiles, PercentileMetric } from '../types';
import { headshotUrl, savantPlayerUrl } from '../lib';

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
  ba: 'xba',
  obp: 'xobp',
  slg: 'xslg',
  iso: 'xiso',
  hr: 'xhr',
};

/**
 * A combined actual/expected row. At rest it reads as a normal row for the
 * EXPECTED stat — a filled bar with a solid bubble at the expected percentile —
 * so the card is calm by default. On hover (mouse) or tap (touch) it reveals the
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
      onPointerEnter={(ev) => ev.pointerType === 'mouse' && setRevealed(true)}
      onPointerLeave={(ev) => ev.pointerType === 'mouse' && setRevealed(false)}
      onPointerDown={(ev) => ev.pointerType !== 'mouse' && setRevealed((r) => !r)}
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

export function PlayerDetails({
  playerId,
  name,
  position,
  onClose,
}: {
  playerId: number;
  name: string;
  position?: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<PlayerPercentiles | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      .percentiles(playerId)
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
  }, [playerId]);

  return (
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
      </div>

      {loading && <div className="details-status">Loading percentile rankings…</div>}
      {error && !loading && (
        <div className="details-status details-error">
          Couldn’t load percentile rankings: {error}
        </div>
      )}
      {data && !loading && (
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
