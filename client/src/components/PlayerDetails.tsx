import { useEffect, useState } from 'react';
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
  const { label, percentile, value } = metric;
  const has = percentile !== null;
  const color = has ? pctColor(percentile) : undefined;
  const title = has
    ? `${label} — ${percentile}th percentile${value ? ` (${value})` : ''}`
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
              className="pct-bubble"
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
        <div className="pct-card">
          <div className="pct-card-head">
            <span className="pct-card-title">{data.year} MLB Percentile Rankings</span>
          </div>
          {data.sections.map((sec) => (
            <div className="pct-section" key={sec.title}>
              <h2 className="pct-section-title">{sec.title}</h2>
              {sec.metrics.map((m) => (
                <MetricRow key={m.key} metric={m} />
              ))}
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
