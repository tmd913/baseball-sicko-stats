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

/**
 * The half-inning marker an at-bat card leads with: the top/bottom triangle and
 * the inning number. A label rather than a toggle — the only triangle allowed
 * anywhere near an inning in this app (see the no-carets note in styles.css).
 */
export function HalfInning({ inning, half }: { inning: number; half: string }) {
  const isTop = half === 'Top';
  return (
    <span className="pa-inning">
      <svg className="pa-inning-arrow" viewBox="0 0 12 10" aria-hidden="true" fill="currentColor">
        <path d={isTop ? 'M6 0 12 10 0 10Z' : 'M0 0 12 0 6 10Z'} />
      </svg>
      {inning}
      <span className="sr-only">{isTop ? 'Top' : 'Bottom'} of inning</span>
    </span>
  );
}

/**
 * When it happened and what the situation was — the half-inning, then the
 * runners and outs. Extracted from `PlateAppearanceCard`'s summary row so a
 * base-running feed item can say it the same way: a steal and the at-bat above
 * it in the same stream are both something that happened in a particular
 * situation, and a bespoke "Bot 5 · 2 outs" text line beside a card drawing the
 * same facts as a diamond made them read as two different kinds of entry.
 */
export function PlaySituation({
  inning,
  half,
  bases,
  outs,
}: {
  inning: number;
  half: string;
  bases: BaseState;
  outs: number;
}) {
  return (
    <>
      <HalfInning inning={inning} half={half} />
      <BaseDiamond bases={bases} outs={outs} className="pa-bases" />
    </>
  );
}
