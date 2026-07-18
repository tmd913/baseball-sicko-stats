import { useEffect, useRef, useState } from 'react';
import type { PlateAppearance } from '../types';
import { api } from '../api';
import { useScrollIntoViewOnExpand } from '../hooks';
import {
  contactHighlight,
  describePitch,
  eventLabel,
  finalSwingBatSpeed,
  isSwing,
  outcomeKind,
  pitchAbbr,
} from '../lib';
import { BaseDiamond } from './BaseDiamond';
import { StrikeZone } from './StrikeZone';

function VideoClip({ playId, gamePk }: { playId: string; gamePk: number }) {
  const [state, setState] = useState<'checking' | 'available' | 'unavailable' | 'watching'>(
    'checking',
  );
  const [url, setUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLDivElement>(null);

  // When playback starts, bring the clip to the top of the screen (below the
  // sticky nav, via scroll-margin-top) so the whole player is in view — 'start'
  // rather than 'nearest' because the at-bat is often already scrolled to the
  // top when the clip opens, which left 'nearest' under-scrolling it.
  useEffect(() => {
    if (state === 'watching') {
      videoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [state]);

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
      <div className="pa-video" ref={videoRef}>
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
  active,
  onHover,
  onTap,
}: {
  pitch: PlateAppearance['pitches'][number];
  active: boolean;
  onHover: (pitchNumber: number | null) => void;
  onTap: (pitchNumber: number) => void;
}) {
  const count =
    pitch.balls !== null && pitch.strikes !== null
      ? `${pitch.balls}-${pitch.strikes}`
      : '';
  const showBatSpeed = pitch.batSpeed !== null && isSwing(pitch.description);
  return (
    <div
      className={`pitch-row-wrap desc-${pitch.description.split('_')[0]}${active ? ' active' : ''}`}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(pitch.pitchNumber)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onHover(null)}
      onPointerUp={(e) => e.pointerType !== 'mouse' && onTap(pitch.pitchNumber)}
    >
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
        {showBatSpeed && (
          <span className="metric metric-bat">SW {pitch.batSpeed!.toFixed(1)} mph</span>
        )}
      </div>
    </div>
  );
}

export function PlateAppearanceCard({
  pa,
  gamePk,
  open,
  onToggle,
}: {
  pa: PlateAppearance;
  gamePk: number;
  open: boolean;
  onToggle: () => void;
}) {
  const [activePitch, setActivePitch] = useState<number | null>(null);
  // Tap toggles a pin on touch/pen (no hover to rely on); tapping the same
  // pitch again clears it.
  const toggleActivePitch = (n: number) => setActivePitch((cur) => (cur === n ? null : n));
  const kind = outcomeKind(pa.event);
  const contact = contactHighlight(pa);
  const swingSpeed = finalSwingBatSpeed(pa);
  const isTop = pa.half === 'Top';

  // On expand, bring this at-bat to the top of the screen so its detail isn't
  // left off-screen below the fold.
  const cardRef = useScrollIntoViewOnExpand<HTMLDivElement>(open);

  return (
    <div ref={cardRef} className={`pa-card kind-${kind}${open ? ' expanded' : ''}`}>
      <button
        type="button"
        className="pa-summary-row"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="pa-inning">
          <svg
            className="pa-inning-arrow"
            viewBox="0 0 12 10"
            aria-hidden="true"
            fill="currentColor"
          >
            <path d={isTop ? 'M6 0 12 10 0 10Z' : 'M0 0 12 0 6 10Z'} />
          </svg>
          {pa.inning}
          <span className="sr-only">{isTop ? 'Top' : 'Bottom'} of inning</span>
        </span>
        <BaseDiamond bases={pa.onBase} outs={pa.outsWhenUp ?? 0} className="pa-bases" />
        <span className={`pa-badge kind-${kind}`}>{eventLabel(pa.event)}</span>
        {pa.rbi > 0 && <span className="pa-rbi">{pa.rbi} RBI</span>}
        {pa.pitcherName && (
          <span className="pa-pitcher">
            vs {pa.pitcherName}
            {pa.pThrows ? ` (${pa.pThrows}HP)` : ''}
          </span>
        )}
        {contact && <span className="pa-contact-main">{contact}</span>}
        {swingSpeed !== null && (
          <span className="metric metric-bat">SW {swingSpeed.toFixed(1)} mph</span>
        )}
      </button>

      {open && (
        <div className="pa-detail">
          {(pa.pitcherName || (pa.stand && pa.pThrows)) && (
            <div className="pa-hand">
              {pa.pitcherName
                ? `${pa.stand ? `${pa.stand}HB ` : ''}vs ${pa.pitcherName}${
                    pa.pThrows ? ` (${pa.pThrows}HP)` : ''
                  }`
                : `${pa.stand}HB vs ${pa.pThrows}HP`}
            </div>
          )}

          <div className="pa-body">
            <div className="pa-main">
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

              <div className="pa-pitches">
                <div className="pitch-row pitch-head">
                  <span className="pitch-num">#</span>
                  <span className="pitch-count">Cnt</span>
                  <span className="pitch-type">Pit</span>
                  <span className="pitch-velo">MPH</span>
                  <span className="pitch-desc">Result</span>
                </div>
                {pa.pitches.map((p) => (
                  <PitchRow
                    key={p.pitchNumber}
                    pitch={p}
                    active={activePitch === p.pitchNumber}
                    onHover={setActivePitch}
                    onTap={toggleActivePitch}
                  />
                ))}
              </div>

              {pa.playId && <VideoClip playId={pa.playId} gamePk={gamePk} />}
            </div>
            <StrikeZone
              pitches={pa.pitches}
              activePitch={activePitch}
              onHoverPitch={setActivePitch}
              onTapPitch={toggleActivePitch}
            />
          </div>
        </div>
      )}
    </div>
  );
}
