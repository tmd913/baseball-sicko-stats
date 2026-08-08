/**
 * Curated league-wide rates the ERA estimators need, in the same spirit as
 * `pitchLeague.ts`: a couple of numbers that only move a little year to year and
 * aren't worth a second data source. Both are league-season constants — refresh
 * them when the season rolls over (alongside the four season pins listed in
 * CLAUDE.md) if the run environment has shifted.
 */

/**
 * The FIP constant — league ERA minus league (13·HR + 3·(BB+HBP) − 2·K)/IP. It
 * exists only to put FIP on the ERA scale, so an approximation costs a hundredth
 * or two and nothing more.
 */
export const FIP_CONSTANT = 3.15;

/**
 * League home-run-per-fly-ball rate. xFIP's whole idea is to replace a pitcher's
 * own HR/FB — which swings wildly on a season's worth of fly balls — with this.
 */
export const LEAGUE_HR_PER_FB = 0.125;

/** Innings pitched, MLB-style ("84.1" = 84 innings and one out), as outs. */
export function ipToOuts(ip: string | null | undefined): number {
  if (!ip) return 0;
  const [whole, frac] = ip.split('.');
  return Number(whole) * 3 + Number(frac ?? 0);
}

/**
 * An ERA-scale estimator from the three true outcomes: (13·HR + 3·(BB+HBP) −
 * 2·K) / IP + the constant. `homeRuns` is the pitcher's own for FIP, and his
 * expected count (fly balls × the league rate) for xFIP — the two differ in
 * nothing else. Null below a token workload, where the number is noise.
 */
export function fipLike(
  homeRuns: number,
  walks: number,
  hitBatsmen: number,
  strikeOuts: number,
  outs: number,
): number | null {
  if (outs < 9) return null; // fewer than 3 innings
  const innings = outs / 3;
  return (13 * homeRuns + 3 * (walks + hitBatsmen) - 2 * strikeOuts) / innings + FIP_CONSTANT;
}
