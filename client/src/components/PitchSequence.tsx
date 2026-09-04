import { Fragment, useState } from 'react';
import type { Pitch, PlayAction } from '../types';
import { describePitch, isSwing, pitchAbbr } from '../lib';
import { StrikeZone } from './StrikeZone';

/** One row of the pitch-by-pitch table: number, count, type, velo, result. */
function PitchRow({
  pitch,
  active,
  onHover,
  onTap,
}: {
  pitch: Pitch;
  active: boolean;
  onHover: (pitchNumber: number | null) => void;
  onTap: (pitchNumber: number) => void;
}) {
  const count =
    pitch.balls !== null && pitch.strikes !== null ? `${pitch.balls}-${pitch.strikes}` : '';
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

/** The pitch-by-pitch table (header + rows). Active-pitch state is controlled so
 * a sibling `StrikeZone` can share the hover/tap highlight. */
export function PitchTable({
  pitches,
  actions = [],
  activePitch,
  onHover,
  onTap,
}: {
  pitches: Pitch[];
  /**
   * **The non-pitch events of the at-bat, in their place in it** — a mound
   * visit, a pitching change, a runner going. Each is drawn as a muted row
   * after the pitch it followed (`afterPitch`, the number of pitches thrown
   * when it happened; 0 puts it ahead of the first), so the table reads as
   * the at-bat did rather than as the pitches with the interruptions listed
   * underneath. The game page's Live tab is the caller; the feed's card
   * carries none, its at-bats being finished.
   */
  actions?: PlayAction[];
  activePitch: number | null;
  onHover: (pitchNumber: number | null) => void;
  onTap: (pitchNumber: number) => void;
}) {
  const after = (n: number) =>
    actions
      .filter((a) => a.afterPitch === n)
      .map((a, i) => (
        <div className="pitch-row pitch-action" key={`${n}-${i}`}>
          <span className="pitch-num" aria-hidden="true" />
          <span className="pitch-action-text">{a.description}</span>
        </div>
      ));
  return (
    <div className="pa-pitches">
      <div className="pitch-row pitch-head">
        <span className="pitch-num">#</span>
        <span className="pitch-count">Cnt</span>
        <span className="pitch-type">Pit</span>
        <span className="pitch-velo">MPH</span>
        <span className="pitch-desc">Result</span>
      </div>
      {after(0)}
      {pitches.map((p, i) => (
        <Fragment key={p.pitchNumber}>
          <PitchRow
            pitch={p}
            active={activePitch === p.pitchNumber}
            onHover={onHover}
            onTap={onTap}
          />
          {after(i + 1)}
        </Fragment>
      ))}
    </div>
  );
}

/** A self-contained pitch sequence: the pitch table beside its `StrikeZone` plot,
 * sharing a hover/tap highlight. Renders nothing with no pitches. */
export function PitchSequence({ pitches }: { pitches: Pitch[] }) {
  const [activePitch, setActivePitch] = useState<number | null>(null);
  // Tap toggles a pin on touch/pen (no hover); tapping the same pitch clears it.
  const toggleActivePitch = (n: number) => setActivePitch((cur) => (cur === n ? null : n));
  if (pitches.length === 0) return null;
  return (
    <div className="pa-body">
      <div className="pa-main">
        <PitchTable
          pitches={pitches}
          activePitch={activePitch}
          onHover={setActivePitch}
          onTap={toggleActivePitch}
        />
      </div>
      <StrikeZone
        pitches={pitches}
        activePitch={activePitch}
        onHoverPitch={setActivePitch}
        onTapPitch={toggleActivePitch}
      />
    </div>
  );
}
