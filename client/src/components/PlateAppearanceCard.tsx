import { useEffect, useState } from 'react';
import type { PlateAppearance } from '../types';
import { api } from '../api';
import {
  contactHighlight,
  describePitch,
  eventLabel,
  finalSwingBatSpeed,
  isSwing,
  outcomeKind,
  pitchAbbr,
} from '../lib';
import { StrikeZone } from './StrikeZone';

function VideoClip({ playId, gamePk }: { playId: string; gamePk: number }) {
  const [state, setState] = useState<'checking' | 'available' | 'unavailable' | 'watching'>(
    'checking',
  );
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState('checking');
    api
      .video(playId, gamePk)
      .then((resolved) => {
        if (cancelled) return;
        setUrl(resolved);
        setState('available');
      })
      .catch(() => {
        if (!cancelled) setState('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [playId, gamePk]);

  if (state === 'watching' && url) {
    return (
      <div className="pa-video">
        <div className="pa-video-bar">
          <button className="pa-hide" onClick={() => setState('available')}>
            ✕ Hide video
          </button>
        </div>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video className="pa-video-el" src={url} controls autoPlay playsInline />
      </div>
    );
  }
  if (state === 'available') {
    return (
      <button className="pa-watch" onClick={() => setState('watching')}>
        ▶ Watch
      </button>
    );
  }
  // 'checking' and 'unavailable' render nothing — no button for clips that
  // don't exist in either the official MLB highlights or the Savant fallback.
  return null;
}

function PitchRow({
  pitch,
}: {
  pitch: PlateAppearance['pitches'][number];
}) {
  const count =
    pitch.balls !== null && pitch.strikes !== null
      ? `${pitch.balls}-${pitch.strikes}`
      : '';
  const showBatSpeed = pitch.batSpeed !== null && isSwing(pitch.description);
  const showExitVelo = pitch.launchSpeed !== null && pitch.description === 'hit_into_play';
  return (
    <div className={`pitch-row-wrap desc-${pitch.description.split('_')[0]}`}>
      <div className="pitch-row">
        <span className="pitch-num">{pitch.pitchNumber}</span>
        <span className="pitch-count">{count}</span>
        <span className="pitch-type" title={pitch.pitchType ?? ''}>
          {pitchAbbr(pitch.pitchType)}
        </span>
        <span className="pitch-velo">
          {pitch.releaseSpeed !== null ? `${pitch.releaseSpeed.toFixed(1)}` : '—'}
        </span>
        <span className="pitch-desc">{describePitch(pitch.description)}</span>
      </div>
      {(showBatSpeed || showExitVelo) && (
        <div className="pitch-metrics">
          {showBatSpeed && (
            <span className="metric metric-bat">SW {pitch.batSpeed!.toFixed(1)} mph</span>
          )}
          {showExitVelo && (
            <span className="metric metric-ev">
              EV {pitch.launchSpeed!.toFixed(0)} mph
              {pitch.launchAngle !== null ? ` · ${pitch.launchAngle}°` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function PlateAppearanceCard({
  pa,
  gamePk,
}: {
  pa: PlateAppearance;
  gamePk: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const kind = outcomeKind(pa.event);
  const contact = contactHighlight(pa);
  const swingSpeed = finalSwingBatSpeed(pa);
  const inningLabel = `${pa.half === 'Top' ? '▲' : '▼'} ${pa.inning}`;

  return (
    <div className={`pa-card kind-${kind}`}>
      <button
        type="button"
        className="pa-summary-row"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="pa-inning">{inningLabel}</span>
        <span className={`pa-badge kind-${kind}`}>{eventLabel(pa.event)}</span>
        {pa.rbi > 0 && <span className="pa-rbi">{pa.rbi} RBI</span>}
        {contact && <span className="pa-contact-main">{contact}</span>}
        {swingSpeed !== null && (
          <span className="metric metric-bat">SW {swingSpeed.toFixed(1)} mph</span>
        )}
        <span className={`chevron${expanded ? ' expanded' : ''}`}>▸</span>
      </button>

      {expanded && (
        <div className="pa-detail">
          {pa.stand && pa.pThrows && (
            <div className="pa-hand">
              {pa.stand}HB vs {pa.pThrows}HP
            </div>
          )}

          <p className="pa-des">{pa.description || '—'}</p>

          {contact && (
            <div className="pa-contact">
              <span className="pa-contact-main">{contact}</span>
              {pa.bbType && <span className="pa-bbtype">{pa.bbType.replace(/_/g, ' ')}</span>}
              {pa.xwoba !== null && (
                <span className="pa-xwoba">xwOBA {pa.xwoba.toFixed(3)}</span>
              )}
            </div>
          )}

          {pa.playId && <VideoClip playId={pa.playId} gamePk={gamePk} />}

          <div className="pa-body">
            <div className="pa-pitches">
              <div className="pitch-row pitch-head">
                <span className="pitch-num">#</span>
                <span className="pitch-count">Cnt</span>
                <span className="pitch-type">Pit</span>
                <span className="pitch-velo">MPH</span>
                <span className="pitch-desc">Result</span>
              </div>
              {pa.pitches.map((p) => (
                <PitchRow key={p.pitchNumber} pitch={p} />
              ))}
            </div>
            <StrikeZone pitches={pa.pitches} />
          </div>
        </div>
      )}
    </div>
  );
}
