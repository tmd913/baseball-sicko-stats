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

/** The MLB league-average line for a pitch type (by full name), or null if the
 * pitch type isn't in the table (the card then shows no league arrow for it). */
export function getLeaguePitchAverage(pitchName: string): ArsenalPitch | null {
  return LEAGUE[pitchName] ?? null;
}
