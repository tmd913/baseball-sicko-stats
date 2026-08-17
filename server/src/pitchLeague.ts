import type { ArsenalPitch } from './pitcherArsenal.js';

/**
 * Approximate MLB league averages per pitch type, in the same units/convention as
 * the game feed and the season arsenal: velo (mph), spin (rpm), vBreak (induced
 * vertical break, inches, signed), and hBreak here as a MAGNITUDE (inches) —
 * horizontal break is handedness-dependent, so a raw league mean is ~0. Callers
 * orient this magnitude to the pitcher's own break direction before comparing
 * (see savant.ts). These are stable year-to-year benchmarks for "above / below
 * average"; keyed by the same full pitch names the feed reports.
 */
const LEAGUE_ALL: Record<string, ArsenalPitch> = {
  '4-Seam Fastball': { velo: 94.0, spin: 2300, vBreak: 15.5, hBreak: 8.0 },
  Sinker: { velo: 93.4, spin: 2130, vBreak: 8.5, hBreak: 15.0 },
  Cutter: { velo: 89.0, spin: 2400, vBreak: 8.0, hBreak: 2.5 },
  Slider: { velo: 85.0, spin: 2430, vBreak: 1.0, hBreak: 6.5 },
  Sweeper: { velo: 82.5, spin: 2500, vBreak: -1.0, hBreak: 14.5 },
  Slurve: { velo: 81.0, spin: 2500, vBreak: -4.0, hBreak: 11.0 },
  Curveball: { velo: 79.0, spin: 2540, vBreak: -8.5, hBreak: 8.5 },
  'Knuckle Curve': { velo: 82.0, spin: 2470, vBreak: -7.0, hBreak: 7.5 },
  'Slow Curve': { velo: 72.0, spin: 2200, vBreak: -12.0, hBreak: 9.0 },
  Changeup: { velo: 84.8, spin: 1780, vBreak: 5.5, hBreak: 15.0 },
  Splitter: { velo: 85.5, spin: 1400, vBreak: 3.0, hBreak: 10.0 },
  'Forkball': { velo: 83.0, spin: 1300, vBreak: 2.0, hBreak: 9.0 },
  Screwball: { velo: 82.0, spin: 2000, vBreak: 4.0, hBreak: 14.0 },
  'Knuckleball': { velo: 68.0, spin: 1200, vBreak: 3.0, hBreak: 6.0 },
  Eephus: { velo: 55.0, spin: 1400, vBreak: 0.0, hBreak: 6.0 },
};

/**
 * The same table split by the **pitcher's** hand, off Savant's own league
 * movement figures for 2026.
 *
 * **Velocity is the reason this exists.** A right-hander throws harder than a
 * left-hander at every pitch type — measured, 0.9 to 2.0 mph — so a lefty
 * judged against a blended average is marked down about two miles an hour for
 * being left-handed. The **break** magnitudes barely move by comparison (0.05
 * to 0.74" horizontally, 0.10 to 0.95" vertically), which is why the blended
 * table served for as long as it did; splitting it costs nothing and stops the
 * chart's "RHP AVG" / "LHP AVG" label being a claim the numbers can't back.
 *
 * `hBreak` is a MAGNITUDE here exactly as in `LEAGUE_ALL` — the sign is which
 * way the arm goes, so the caller orients it to the pitcher's own direction.
 * Spin is not split: it is a property of the pitch rather than of the arm, and
 * Savant publishes no per-hand figure this could be read from.
 */
const LEAGUE_BY_HAND: Record<'R' | 'L', Record<string, Partial<ArsenalPitch>>> = {
  R: {
    '4-Seam Fastball': { velo: 94.9, vBreak: 15.1, hBreak: 7.8 },
    Sinker: { velo: 94.4, vBreak: 8.7, hBreak: 14.7 },
    Cutter: { velo: 90.0, vBreak: 7.9, hBreak: 1.8 },
    Slider: { velo: 85.9, vBreak: 1.9, hBreak: 3.9 },
    Sweeper: { velo: 83.0, vBreak: 1.3, hBreak: 13.4 },
    Curveball: { velo: 79.9, vBreak: -9.4, hBreak: 8.2 },
    'Knuckle Curve': { velo: 82.0, vBreak: -7.0, hBreak: 7.5 },
    Changeup: { velo: 87.0, vBreak: 4.0, hBreak: 13.8 },
    Splitter: { velo: 87.1, vBreak: 3.8, hBreak: 10.8 },
    Slurve: { velo: 80.9, vBreak: -6.0, hBreak: 10.2 },
  },
  L: {
    '4-Seam Fastball': { velo: 93.2, vBreak: 14.9, hBreak: 7.6 },
    Sinker: { velo: 92.6, vBreak: 8.5, hBreak: 14.8 },
    Cutter: { velo: 88.0, vBreak: 7.3, hBreak: 1.1 },
    Slider: { velo: 85.0, vBreak: 2.0, hBreak: 4.1 },
    Sweeper: { velo: 81.0, vBreak: 0.6, hBreak: 13.5 },
    Curveball: { velo: 79.0, vBreak: -9.3, hBreak: 7.6 },
    'Knuckle Curve': { velo: 81.0, vBreak: -7.0, hBreak: 7.5 },
    Changeup: { velo: 84.9, vBreak: 4.7, hBreak: 13.6 },
    Splitter: { velo: 85.3, vBreak: 4.8, hBreak: 9.1 },
    Slurve: { velo: 80.0, vBreak: -6.0, hBreak: 10.2 },
  },
};

/**
 * How far a league-average pitch of each type strays from that average — the
 * standard spread of the per-pitcher means, in inches, horizontally and
 * vertically. Read off Baseball Savant's own league movement table (RHP, 2026;
 * a left-hander's spreads are the same, only the horizontal *centre* flips,
 * which `getLeaguePitchAverage`'s caller already orients).
 *
 * The one reader is the Arsenal tab's Movement Profile, which draws each pitch
 * type's league average as a hatched blob rather than a point: "average" is a
 * cloud too, and a bare dot would invite a reader to treat a half-inch miss as
 * a difference. Nothing else reads it, so adding it moved no ▲▼ arrow on any
 * card — deliberately separate from `LEAGUE` above for exactly that reason.
 */
const LEAGUE_SPREAD: Record<string, { hRange: number; vRange: number }> = {
  '4-Seam Fastball': { hRange: 3.7, vRange: 3.5 },
  Sinker: { hRange: 3.7, vRange: 4.0 },
  Cutter: { hRange: 3.8, vRange: 4.5 },
  Slider: { hRange: 3.7, vRange: 4.8 },
  Sweeper: { hRange: 4.6, vRange: 5.0 },
  Slurve: { hRange: 4.4, vRange: 4.6 },
  Curveball: { hRange: 4.1, vRange: 4.9 },
  'Knuckle Curve': { hRange: 4.1, vRange: 4.9 },
  'Slow Curve': { hRange: 4.4, vRange: 5.4 },
  Changeup: { hRange: 4.1, vRange: 4.7 },
  Splitter: { hRange: 4.5, vRange: 5.0 },
  Forkball: { hRange: 5.0, vRange: 5.4 },
  Screwball: { hRange: 4.4, vRange: 5.0 },
  Knuckleball: { hRange: 7.5, vRange: 9.0 },
  Eephus: { hRange: 5.0, vRange: 5.4 },
};

/** Every type in the table sits between 3.5" and 5.4", so a pitch this table has
 *  never heard of gets the middle of that band rather than nothing — the blob is
 *  a "roughly here" mark, and omitting it would say the league throws no such
 *  pitch. (Knuckleballs are the one genuine outlier and are named above.) */
const DEFAULT_SPREAD = { hRange: 4.3, vRange: 4.8 };

/** How wide the league's own average is for a pitch type, in inches. */
export function getLeaguePitchSpread(pitchName: string): { hRange: number; vRange: number } {
  return LEAGUE_SPREAD[pitchName] ?? DEFAULT_SPREAD;
}

/**
 * The MLB league-average line for a pitch type (by full name), or null if the
 * pitch type isn't in the table (the card then shows no league arrow for it).
 *
 * **`hand` narrows it to pitchers who throw with that arm**, which matters most
 * for velocity (see `LEAGUE_BY_HAND`). It is optional and falls back to the
 * blended figure field by field, so a caller that does not know the hand — or a
 * pitch type the split table has never been read against — gets exactly what it
 * got before rather than nothing.
 */
export function getLeaguePitchAverage(
  pitchName: string,
  hand?: 'R' | 'L' | null,
): ArsenalPitch | null {
  const all = LEAGUE_ALL[pitchName];
  if (!all) return null;
  const split = hand ? LEAGUE_BY_HAND[hand]?.[pitchName] : undefined;
  return split ? { ...all, ...split } : all;
}
