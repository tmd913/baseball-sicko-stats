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
const LEAGUE: Record<string, ArsenalPitch> = {
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

/** The MLB league-average line for a pitch type (by full name), or null if the
 * pitch type isn't in the table (the card then shows no league arrow for it). */
export function getLeaguePitchAverage(pitchName: string): ArsenalPitch | null {
  return LEAGUE[pitchName] ?? null;
}
