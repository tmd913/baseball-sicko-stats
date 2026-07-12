import type { Pitch } from '../types';
import { describePitch } from '../lib';

interface Props {
  pitches: Pitch[];
  activePitch?: number | null;
  onHoverPitch?: (pitchNumber: number | null) => void;
  onTapPitch?: (pitchNumber: number) => void;
}

// Feet -> viewBox coordinate mapping (catcher's view).
const X_MIN = -2.2;
const X_MAX = 2.2;
const Z_MIN = 0;
const Z_MAX = 5;
const W = 200;
const H = 240;

const sx = (x: number) => ((x - X_MIN) / (X_MAX - X_MIN)) * W;
const sy = (z: number) => H - ((z - Z_MIN) / (Z_MAX - Z_MIN)) * H;

function pitchColor(description: string): string {
  if (description === 'hit_into_play') return 'var(--inplay)';
  if (description.includes('swinging') || description === 'foul_tip')
    return 'var(--whiff)';
  if (description.includes('foul')) return 'var(--foul)';
  if (description.includes('called')) return 'var(--called)';
  if (description === 'hit_by_pitch') return 'var(--walk)';
  return 'var(--ball)'; // ball, blocked_ball
}

export function StrikeZone({ pitches, activePitch = null, onHoverPitch, onTapPitch }: Props) {
  const located = pitches.filter((p) => p.plateX !== null && p.plateZ !== null);
  // Render the active pitch last so its circle sits above the others.
  const ordered = [...located].sort((a, b) => {
    if (a.pitchNumber === activePitch) return 1;
    if (b.pitchNumber === activePitch) return -1;
    return 0;
  });
  // Average zone bounds for the batter.
  const tops = pitches.map((p) => p.szTop).filter((v): v is number => v !== null);
  const bots = pitches.map((p) => p.szBot).filter((v): v is number => v !== null);
  const top = tops.length ? tops.reduce((a, b) => a + b, 0) / tops.length : 3.4;
  const bot = bots.length ? bots.reduce((a, b) => a + b, 0) / bots.length : 1.6;
  const halfW = 0.83; // half plate width incl. ball, feet

  return (
    <svg className="strikezone" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pitch locations">
      {/* Strike zone box + thirds */}
      <rect
        x={sx(-halfW)}
        y={sy(top)}
        width={sx(halfW) - sx(-halfW)}
        height={sy(bot) - sy(top)}
        className="sz-box"
      />
      {[1, 2].map((i) => {
        const zx = -halfW + (i * (halfW * 2)) / 3;
        const zz = top - (i * (top - bot)) / 3;
        return (
          <g key={i} className="sz-grid">
            <line x1={sx(zx)} y1={sy(top)} x2={sx(zx)} y2={sy(bot)} />
            <line x1={sx(-halfW)} y1={sy(zz)} x2={sx(halfW)} y2={sy(zz)} />
          </g>
        );
      })}
      {/* Home plate */}
      <polygon
        className="sz-plate"
        points={`${sx(-halfW)},${sy(0.35)} ${sx(halfW)},${sy(0.35)} ${sx(halfW)},${sy(0.2)} ${sx(0)},${sy(0.05)} ${sx(-halfW)},${sy(0.2)}`}
      />
      {ordered.map((p) => {
        const active = p.pitchNumber === activePitch;
        const dimmed = activePitch !== null && !active;
        const cx = sx(p.plateX as number);
        const cy = sy(p.plateZ as number);
        return (
          <g
            key={p.pitchNumber}
            className={`sz-pitch${active ? ' active' : ''}${dimmed ? ' dimmed' : ''}`}
            onPointerEnter={(e) => e.pointerType === 'mouse' && onHoverPitch?.(p.pitchNumber)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && onHoverPitch?.(null)}
            onPointerUp={(e) => e.pointerType !== 'mouse' && onTapPitch?.(p.pitchNumber)}
          >
            <title>
              {`#${p.pitchNumber} ${p.pitchType ?? ''} ${
                p.releaseSpeed ? p.releaseSpeed.toFixed(1) + ' mph' : ''
              } — ${describePitch(p.description)}`}
            </title>
            {active && <circle className="sz-ring" cx={cx} cy={cy} r={14} />}
            <circle cx={cx} cy={cy} r={active ? 13 : 11} fill={pitchColor(p.description)} />
            <text x={cx} y={cy + 3.5} className="sz-num">
              {p.pitchNumber}
            </text>
          </g>
        );
      })}
      {located.length === 0 && (
        <text x={W / 2} y={H / 2} className="sz-empty">
          no location data
        </text>
      )}
    </svg>
  );
}
