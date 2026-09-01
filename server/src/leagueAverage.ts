import { fipLike } from './leagueRates.js';
import type { PitcherSeasonStats, SeasonStats } from './types.js';

/**
 * **The league's own season line, in the shape one player's is** — the second
 * column of the Splits tab's *Against the league* card.
 *
 * Every other card on that tab compares two halves of one man's season. This one
 * compares his whole season against everybody's, which is the comparison a
 * percentile bar makes as a *rank* and this makes as a **gap**: the card says
 * `.908 · .718`, `.190 better for him`, in the units the stat is printed in.
 * The two readings answer different questions and the tab carries both — a rank
 * says where he stands among the men who play, a gap says how far above the
 * average line he is.
 *
 * ### It is 30 team lines summed, and that is exact rather than approximate
 *
 * MLB publishes no league-total line. `/api/v1/stats?stats=season&group=hitting`
 * is a *leaderboard* — probed, it returns one row per player and no aggregate —
 * and the `/teams/stats` board is the one that answers: **30 rows, one per
 * club**, each carrying every count the rates are built from. Summing counts
 * and computing the rates once at the end is the same rule this server applies
 * everywhere it aggregates (`teamHitting.ts` states it: everything stored per
 * day is a count, never a rate, because rates don't add).
 *
 * **Checked against the identity that has to hold**: the league's batters and
 * the league's pitchers face each other, so the two boards must agree on the
 * total. Measured on 2026 through August 31 — hitting **156,337 PA** and
 * pitching **156,337 BF**, the same number, with AVG `.2437`, OBP `.3183`, SLG
 * `.4000`, OPS `.7183`, K% `22.08`, BB% `8.92` and HR% `3.03` falling out of
 * both sides identically. That is not a coincidence to be relied on quietly, it
 * is the check that says the sum is over the right population: a board missing a
 * club, or double-counting one, breaks it.
 *
 * **Both are still fetched**, because the two boards do not carry the same
 * columns. The pitching one has `outs`, `hitBatsmen` and `earnedRuns`, which is
 * what WHIP, FIP and an ERA need and what the hitting board has no counterpart
 * for; the hitting one has `hitByPitch` and `sacFlies`, which OBP's denominator
 * needs. Neither can be derived from the other.
 *
 * ### FIP is the league's, on the league's own line
 *
 * `fipLike` with the league's counts gives **4.23** against a league ERA of
 * **4.16** — the seven hundredths being exactly what `FIP_CONSTANT`'s own
 * comment says an approximated constant costs. The card draws FIP rather than
 * ERA on the pitcher's side because a pitching *split* has no ERA at all (see
 * `PitcherSeasonStats.opsAgainst`), and a comparison row has to be a row both
 * columns can fill.
 */

/** Six hours, the same span the boards this sits beside settle on. A league
 *  average moves by a point over a fortnight; this is generous rather than
 *  tight, and it is memory-only — two 30-row reads on a cold container is not
 *  worth a blob to version. */
const TTL = 6 * 60 * 60 * 1000;

const UA = { 'User-Agent': 'statcast-sicko/1.0' };

interface TeamStatsResponse {
  stats?: { splits?: { stat?: Record<string, unknown> }[] }[];
}

/** Every numeric field on the board, summed across its 30 rows. Summing by type
 *  rather than by name is what keeps this from needing a list of columns MLB
 *  owns: a rate arrives as a string (`".260"`) and is skipped for free, which is
 *  the same reason the rates are recomputed below rather than averaged. */
async function leagueTotals(group: 'hitting' | 'pitching', season: number) {
  const url =
    `https://statsapi.mlb.com/api/v1/teams/stats?season=${season}` +
    `&sportIds=1&group=${group}&stats=season`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`MLB team ${group} stats returned ${res.status}`);
  const data = (await res.json()) as TeamStatsResponse;
  const rows = data.stats?.[0]?.splits ?? [];
  // **Thirty clubs or nothing.** A short board is a partial league and would
  // draw an average that is a claim about nobody — the join-to-null rule, one
  // number wide.
  if (rows.length < 30) throw new Error(`MLB team ${group} stats returned ${rows.length} clubs`);
  const total: Record<string, number> = {};
  for (const row of rows) {
    for (const [k, v] of Object.entries(row.stat ?? {})) {
      if (typeof v === 'number' && Number.isFinite(v)) total[k] = (total[k] ?? 0) + v;
    }
  }
  return total;
}

/** A rate in baseball's own leading-dot form — ".244". */
const rate3 = (v: number): string => {
  const t = v.toFixed(3);
  return t.startsWith('0.') ? t.slice(1) : t;
};

/** Outs as MLB spells innings — 109,927 outs is "36642.1". */
const outsToIp = (outs: number): string => `${Math.floor(outs / 3)}.${outs % 3}`;

export interface LeagueAverage {
  season: number;
  batting: SeasonStats;
  pitching: PitcherSeasonStats;
}

let cache: { data: LeagueAverage; at: number } | null = null;
let inFlight: Promise<LeagueAverage> | null = null;

async function build(season: number): Promise<LeagueAverage> {
  const [bat, pit] = await Promise.all([
    leagueTotals('hitting', season),
    leagueTotals('pitching', season),
  ]);
  const at = (t: Record<string, number>, k: string) => t[k] ?? 0;

  const ab = at(bat, 'atBats');
  const obDen = ab + at(bat, 'baseOnBalls') + at(bat, 'hitByPitch') + at(bat, 'sacFlies');
  const avg = ab > 0 ? at(bat, 'hits') / ab : 0;
  const obp = obDen > 0 ? (at(bat, 'hits') + at(bat, 'baseOnBalls') + at(bat, 'hitByPitch')) / obDen : 0;
  const slg = ab > 0 ? at(bat, 'totalBases') / ab : 0;

  const outs = at(pit, 'outs');
  const innings = outs / 3;
  const pAb = at(pit, 'atBats');
  const pObDen = pAb + at(pit, 'baseOnBalls') + at(pit, 'hitBatsmen') + at(pit, 'sacFlies');
  const pAvg = pAb > 0 ? at(pit, 'hits') / pAb : 0;
  const pObp =
    pObDen > 0 ? (at(pit, 'hits') + at(pit, 'baseOnBalls') + at(pit, 'hitBatsmen')) / pObDen : 0;
  const pSlg = pAb > 0 ? at(pit, 'totalBases') / pAb : 0;
  const bf = at(pit, 'battersFaced');
  const per9 = (n: number) => (innings > 0 ? (n * 9) / innings : 0);
  const perBf = (n: number) => (bf > 0 ? rate3(n / bf) : '—');
  const fip = fipLike(at(pit, 'homeRuns'), at(pit, 'baseOnBalls'), at(pit, 'hitBatsmen'), at(pit, 'strikeOuts'), outs);

  return {
    season,
    batting: {
      // **The counting fields are the league's totals, not an average of them.**
      // Nothing on the Splits card reads a count — every row it draws is a rate
      // — and a per-player average of home runs would be a number no player and
      // no league has. The one count that *is* read is `pa`, which is the
      // sample the head prints, and the league's sample is genuinely 156,337.
      gamesPlayed: at(bat, 'gamesPlayed'),
      pa: at(bat, 'plateAppearances'),
      avg: rate3(avg),
      obp: rate3(obp),
      slg: rate3(slg),
      // The leading-dot form MLB's own lines arrive in — `rate3` keeps the zero
      // on a 1.0-and-over OPS, which is the only way that form ever carries one.
      ops: rate3(obp + slg),
      hr: at(bat, 'homeRuns'),
      rbi: at(bat, 'rbi'),
      hits: at(bat, 'hits'),
      atBats: ab,
      runs: at(bat, 'runs'),
      sb: at(bat, 'stolenBases'),
      strikeOuts: at(bat, 'strikeOuts'),
      baseOnBalls: at(bat, 'baseOnBalls'),
    },
    pitching: {
      gamesPlayed: at(pit, 'gamesPlayed'),
      gamesStarted: at(pit, 'gamesStarted'),
      battersFaced: bf,
      inningsPitched: outsToIp(outs),
      era: innings > 0 ? per9(at(pit, 'earnedRuns')).toFixed(2) : '—',
      whip: innings > 0 ? ((at(pit, 'hits') + at(pit, 'baseOnBalls')) / innings).toFixed(2) : '—',
      wins: at(pit, 'wins'),
      losses: at(pit, 'losses'),
      saves: at(pit, 'saves'),
      holds: at(pit, 'holds'),
      strikeOuts: at(pit, 'strikeOuts'),
      baseOnBalls: at(pit, 'baseOnBalls'),
      hits: at(pit, 'hits'),
      homeRuns: at(pit, 'homeRuns'),
      strikeoutsPer9: per9(at(pit, 'strikeOuts')).toFixed(2),
      walksPer9: per9(at(pit, 'baseOnBalls')).toFixed(2),
      kRate: perBf(at(pit, 'strikeOuts')),
      bbRate: perBf(at(pit, 'baseOnBalls')),
      avgAgainst: rate3(pAvg),
      opsAgainst: rate3(pObp + pSlg),
      hitBatsmen: at(pit, 'hitBatsmen'),
      homeRunsPer9: per9(at(pit, 'homeRuns')).toFixed(2),
      fip: fip === null ? null : fip.toFixed(2),
      // Both are a fly-ball count and a Savant leaderboard away, and neither is
      // a row the card draws — see `PitcherSeasonStats`, where the same two are
      // null on every split for the same reason.
      xfip: null,
      xera: null,
    },
  };
}

/**
 * The league's two lines, cached for six hours.
 *
 * **It throws rather than returning null**, and the caller swallows it: the
 * player page fetches this inside the same `try` its other splits are in, so a
 * dead MLB costs the *Against the league* card and leaves the other three
 * standing — the standing rule that a failure costs its own column. Returning a
 * half-built average would be the alternative, and a card comparing a man
 * against a league missing four clubs is worse than a card that is not there.
 */
export async function getLeagueAverage(season: number): Promise<LeagueAverage> {
  if (cache && cache.data.season === season && Date.now() - cache.at < TTL) return cache.data;
  if (inFlight) return inFlight;
  const p = build(season)
    .then((data) => {
      cache = { data, at: Date.now() };
      return data;
    })
    .finally(() => {
      inFlight = null;
    });
  inFlight = p;
  return p;
}
