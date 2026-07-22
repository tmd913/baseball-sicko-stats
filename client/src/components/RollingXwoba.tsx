import { useMemo, useRef, useState } from 'react';
import { formatRate } from '../lib';
import type { XwobaSeries } from '../types';

const WINDOWS = [50, 100, 250] as const;
type Win = (typeof WINDOWS)[number];

// SVG coordinate space; the element scales to the container width via CSS.
const VBW = 720;
const VBH = 300;
const PAD = { top: 16, right: 22, bottom: 30, left: 48 };
const PLOT_W = VBW - PAD.left - PAD.right;
const PLOT_H = VBH - PAD.top - PAD.bottom;

interface Pt {
  pa: number; // ending plate-appearance number of the window
  y: number; // rolling xwOBA
  date: string;
}

/** Trailing mean of `xs` over `win` values; NaN until the first full window. */
function rollingMean(xs: number[], win: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    sum += xs[i];
    if (i >= win) sum -= xs[i - win];
    out.push(i >= win - 1 ? sum / win : NaN);
  }
  return out;
}

/** A gridline step giving roughly five lines across the value range. */
function niceStep(range: number): number {
  const raw = range / 5;
  return [0.02, 0.025, 0.05, 0.1, 0.2].find((s) => s >= raw) ?? 0.2;
}

/** Month/day label for a YYYY-MM-DD date. */
function md(date: string): string {
  const [, m, d] = date.split('-');
  return m && d ? `${Number(m)}/${Number(d)}` : date;
}

export function RollingXwoba({ series, name }: { series: XwobaSeries; name: string }) {
  const [win, setWin] = useState<Win>(50);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const points = useMemo<Pt[]>(() => {
    const roll = rollingMean(
      series.pas.map((p) => p.xwoba),
      win,
    );
    const pts: Pt[] = [];
    for (let i = 0; i < roll.length; i++) {
      if (!Number.isNaN(roll[i])) pts.push({ pa: i + 1, y: roll[i], date: series.pas[i].date });
    }
    return pts;
  }, [series, win]);

  const { yMin, yMax, yStep } = useMemo(() => {
    if (points.length === 0) return { yMin: 0.25, yMax: 0.45, yStep: 0.05 };
    const ys = points.map((p) => p.y).concat(series.leagueXwoba);
    let lo = Math.min(...ys);
    let hi = Math.max(...ys);
    const pad = Math.max(0.02, (hi - lo) * 0.18);
    const step = niceStep(hi - lo + 2 * pad);
    lo = Math.floor((lo - pad) / step) * step;
    hi = Math.ceil((hi + pad) / step) * step;
    return { yMin: Math.max(0, lo), yMax: hi, yStep: step };
  }, [points, series.leagueXwoba]);

  const xMin = points.length ? points[0].pa : 0;
  const xMax = points.length ? points[points.length - 1].pa : 1;
  const sx = (pa: number) => PAD.left + ((pa - xMin) / Math.max(1, xMax - xMin)) * PLOT_W;
  const sy = (y: number) => PAD.top + (1 - (y - yMin) / (yMax - yMin)) * PLOT_H;

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.pa).toFixed(1)},${sy(p.y).toFixed(1)}`)
    .join(' ');

  // Horizontal gridlines at each nice xwOBA step in the domain.
  const yLines: number[] = [];
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax + 1e-9; v += yStep) {
    yLines.push(Math.round(v * 1000) / 1000);
  }
  // ~5 x ticks at round PA numbers within the shown range.
  const xTicks: number[] = [];
  if (points.length) {
    const span = xMax - xMin;
    const tStep = niceTickStep(span);
    for (let v = Math.ceil(xMin / tStep) * tStep; v <= xMax; v += tStep) xTicks.push(v);
  }

  const cur = hover !== null ? points[hover] : null;

  const onMove = (e: React.PointerEvent) => {
    if (!points.length) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * VBW;
    const paGuess = xMin + ((svgX - PAD.left) / PLOT_W) * (xMax - xMin);
    const idx = Math.max(0, Math.min(points.length - 1, Math.round(paGuess - xMin)));
    setHover(idx);
  };

  return (
    <div className="pct-card">
      <div className="pct-card-head roll-head">
        <span className="pct-card-title">Rolling xwOBA · {series.season}</span>
        <div className="roll-windows" role="group" aria-label="Rolling window">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              className={`roll-win${win === w ? ' is-active' : ''}`}
              aria-pressed={win === w}
              onClick={() => {
                setWin(w);
                setHover(null);
              }}
            >
              {w} PA
            </button>
          ))}
        </div>
      </div>

      {points.length === 0 ? (
        <div className="details-status">
          {name} has {series.pas.length} plate appearance{series.pas.length === 1 ? '' : 's'} this
          season — not enough for a {win}-PA rolling window.
        </div>
      ) : (
        <>
          <div className="roll-chart-wrap">
            <svg
              ref={svgRef}
              className="roll-chart"
              viewBox={`0 0 ${VBW} ${VBH}`}
              role="img"
              aria-label={`Rolling ${win}-plate-appearance xwOBA over the ${series.season} season`}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            >
              {/* horizontal gridlines + y labels */}
              {yLines.map((v) => (
                <g key={v}>
                  <line
                    className="roll-grid"
                    x1={PAD.left}
                    x2={PAD.left + PLOT_W}
                    y1={sy(v)}
                    y2={sy(v)}
                  />
                  <text className="roll-axis-label" x={PAD.left - 8} y={sy(v)} dy="0.32em" textAnchor="end">
                    {formatRate(v)}
                  </text>
                </g>
              ))}
              {/* x ticks */}
              {xTicks.map((v) => (
                <text
                  key={v}
                  className="roll-axis-label"
                  x={sx(v)}
                  y={PAD.top + PLOT_H + 20}
                  textAnchor="middle"
                >
                  {v}
                </text>
              ))}
              {/* league-average reference line */}
              <line
                className="roll-ref"
                x1={PAD.left}
                x2={PAD.left + PLOT_W}
                y1={sy(series.leagueXwoba)}
                y2={sy(series.leagueXwoba)}
              />
              <text
                className="roll-ref-label"
                x={PAD.left + PLOT_W}
                y={sy(series.leagueXwoba) - 5}
                textAnchor="end"
              >
                {formatRate(series.leagueXwoba)} league avg
              </text>
              {/* the rolling line */}
              <path className="roll-line" d={linePath} />
              {/* hover crosshair + dot */}
              {cur && (
                <>
                  <line
                    className="roll-cross"
                    x1={sx(cur.pa)}
                    x2={sx(cur.pa)}
                    y1={PAD.top}
                    y2={PAD.top + PLOT_H}
                  />
                  <circle className="roll-dot" cx={sx(cur.pa)} cy={sy(cur.y)} r={4} />
                </>
              )}
            </svg>
            {cur && (
              <div
                className="roll-tip"
                style={{
                  left: `${(sx(cur.pa) / VBW) * 100}%`,
                  top: `${(sy(cur.y) / VBH) * 100}%`,
                }}
              >
                <span className="roll-tip-val">{formatRate(cur.y)}</span>
                <span className="roll-tip-sub">
                  PA {cur.pa} · {md(cur.date)}
                </span>
              </div>
            )}
          </div>
          <p className="roll-caption">
            xwOBA over the trailing {win} plate appearances, across the season (x-axis = plate
            appearance). Dashed line = MLB league average ({formatRate(series.leagueXwoba)}); this
            player&rsquo;s season xwOBA is {formatRate(series.seasonXwoba)}.
          </p>
        </>
      )}
    </div>
  );
}

/** A round PA-number step for the x-axis, ~5 ticks across `span`. */
function niceTickStep(span: number): number {
  const raw = span / 5;
  return [10, 20, 25, 50, 100, 200].find((s) => s >= raw) ?? 200;
}
