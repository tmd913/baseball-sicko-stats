import type { BaseState } from '../types';
import { basesLabel } from '../lib';

/**
 * A tiny baseball situation glyph: a diamond (2B top, 1B right, 3B left from the
 * batter's view) with each occupied base filled, plus two out-dots beneath it
 * filled to the current out count.
 */
export function BaseDiamond({
  bases,
  outs,
  className,
}: {
  bases: BaseState;
  outs: number;
  className?: string;
}) {
  const r = 4.2;
  const diamond = (cx: number, cy: number) =>
    `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
  const label = `${basesLabel(bases)}, ${outs} out${outs === 1 ? '' : 's'}`;
  return (
    <svg
      className={`base-diamond${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 28"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <polygon className={`base${bases.second ? ' on' : ''}`} points={diamond(12, 7)} />
      <polygon className={`base${bases.first ? ' on' : ''}`} points={diamond(17, 12)} />
      <polygon className={`base${bases.third ? ' on' : ''}`} points={diamond(7, 12)} />
      <circle className={`out${outs >= 1 ? ' on' : ''}`} cx={9} cy={24.5} r={2} />
      <circle className={`out${outs >= 2 ? ' on' : ''}`} cx={15} cy={24.5} r={2} />
    </svg>
  );
}
