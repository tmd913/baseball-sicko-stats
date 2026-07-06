import { useEffect, useState } from 'react';
import type { PlateAppearance } from '../types';
import { api } from '../api';
import {
  contactHighlight,
  describePitch,
  eventLabel,
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
  return (
    <div className={`pitch-row desc-${pitch.description.split('_')[0]}`}>
      <span className="pitch-num">{pitch.pitchNumber}</span>
      <span className="pitch-count">{count}</span>
      <span className="pitch-type" title={pitch.pitchType ?? ''}>
        {pitchAbbr(pitch.pitchType)}
      </span>
      <span className="pitch-velo">
        {pitch.releaseSpeed !== null ? `${pitch.releaseSpeed.toFixed(1)}` : '—'}
      </span>
      <span className="pitch-desc">{describePitch(pitch.description)}</span>
      <span className="pitch-ev">
        {pitch.launchSpeed !== null && pitch.description === 'hit_into_play'
          ? `${pitch.launchSpeed.toFixed(0)} mph`
          : ''}
      </span>
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
  const kind = outcomeKind(pa.event);
  const contact = contactHighlight(pa);
  const inningLabel = `${pa.half === 'Top' ? '▲' : '▼'} ${pa.inning}`;

  return (
    <div className={`pa-card kind-${kind}`}>
      <div className="pa-head">
        <div className="pa-outcome">
          <span className={`pa-badge kind-${kind}`}>{eventLabel(pa.event)}</span>
          {pa.rbi > 0 && (
            <span className="pa-rbi">{pa.rbi} RBI</span>
          )}
          <span className="pa-inning">{inningLabel}</span>
        </div>
        <div className="pa-hand">
          {pa.stand && pa.pThrows ? `${pa.stand}HB vs ${pa.pThrows}HP` : ''}
        </div>
      </div>

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
            <span className="pitch-ev" />
          </div>
          {pa.pitches.map((p) => (
            <PitchRow key={p.pitchNumber} pitch={p} />
          ))}
        </div>
        <StrikeZone pitches={pa.pitches} />
      </div>
    </div>
  );
}
