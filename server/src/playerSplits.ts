import { parse } from 'csv-parse/sync';
import { readJsonBlob, writeJsonBlob } from './storage.js';
import { empty, tally, toStatcast, windowDates } from './statcastWindow.js';
import type { StatcastCounts } from './statcastWindow.js';
import { getResearch, SEASON } from './research.js';
import { RECENT_CUT_SIZE, RESEARCH_WINDOWS, SPLIT_CUTS } from './types.js';
import type { PlayerCut, PlayerKind, ResearchRow, ResearchWindow, SplitCut } from './types.js';

/**
 * **One player's five spans, cut four ways** — vs right, vs left, home, away.
 *
 * The player page's Stats tab is the research board transposed: five spans down
 * the side under the board's own columns. This is that table asked a second
 * question — *is he a different player against left-handers, or on the road* —
 * which is a cut along an axis the board has not got.
 *
 * **And a fifth cut that is none of those**, added with the percentile card's
 * own cut control: `last100`, his most recent hundred at-bats (batters faced on
 * a pitcher). It is not a split and not a span — see `RecentCut` in `types.ts`
 * for why a count of at-bats is the right unit for recent form and a count of
 * days is not — so it hangs off `PlayerCuts` beside the four rather than
 * inside them, and it costs this module no second request: it is one more pass
 * over the season of pitches the four cuts have already downloaded.
 *
 * ### Why none of the cheap routes work
 *
 * **MLB publishes the splits and will not date-range them.** `statSplits` with
 * `sitCodes=[vr,vl,h,a]` is exact, populated and league-wide (checked: 623
 * batters), and it takes `startDate`/`endDate` in either spelling, returns
 * **200**, and ignores them — Juan Soto's `vl` line reads `120 PA .276` for
 * `2026-07-20 → 2026-08-20` exactly as it does for the season, because it *is*
 * the season. `stats=byDateRange&sitCodes=…` is the same dead end from the
 * other side: it honors the dates and drops the split, handing back the overall
 * line once per code with an empty `split` object. Recorded so nobody probes
 * them again; this is the `pull_air_rate` failure wearing a date.
 *
 * **Savant publishes no windowed leaderboard at all**, which
 * `statcastWindow.ts` already records, and its per-day exports carry no
 * counting stats — they are pitches, and the board's `H`, `AB` and `AVG` come
 * off MLB.
 *
 * ### What does work: his own season of pitches
 *
 * `statcast_search/csv` filtered to **one player** takes the whole season in a
 * single request (`batters_lookup[]` / `pitchers_lookup[]`), and every row of
 * it carries `game_date`, `p_throws`, `stand`, `inning_topbot` and `events` —
 * so all four cuts and all five spans fall out of one fetch by filtering. It is
 * the same export `statcastWindow.ts` reads a day at a time, so **the Statcast
 * half is the same arithmetic**: `tally` and `toStatcast`, imported rather than
 * rewritten.
 *
 * Measured: a batter's season is **1,472 rows / 985KB in 3.8s** (Soto) and a
 * starter's **2,077 / 1.4MB in 4.4s** (Sale) — far under the 25,000-row cap
 * that rules this export out league-wide.
 *
 * ### And it reconciles exactly
 *
 * The counting half is computed here from `events`, so it owes a check against
 * the source that publishes it. Against MLB's own `statSplits` for the 2026
 * season, byte for byte:
 *
 * - **Soto** — vs L `120 PA / .276 / .809 OPS`, vs R `239 / .287 / 1.021`, home
 *   `169 / .331 / 1.077`, away `190 / .242 / .833`. All four identical, and
 *   `vsL + vsR = home + away = 359`, which is his season.
 * - **Sale** — home `11 G / 262 BF / 52 H / 74 K`, away `11 / 255 / 51 / 86`,
 *   vs L `127 BF / .248`, vs R `390 / .206`. All four identical **once
 *   `truncated_pa` is excluded** (see `NON_PA_EVENTS`), which was the one
 *   discrepancy: a plate appearance cut short by the third out on the bases,
 *   which Statcast files as an event and MLB does not count as a batter faced.
 *
 * ### What a cut cannot carry, and why it dashes rather than lying
 *
 * A pitch row knows what happened *in the plate appearance*. It does not know
 * who scored, who stole, or which runs were earned, so **R, RBI, SB and CS on a
 * batter, and IP, ER, ERA, W, L, SVHD, FIP, xFIP, WHIP, K/9 and BB/9 on a
 * pitcher, are null on a cut row** and the client dashes them exactly as it
 * dashes `sprintSpeed` and `xERA` on a window row — the same "absent by nature
 * on this shape of row" the board already has two of.
 *
 * **Innings were probed and rejected, and the negative result is the point.**
 * Mapping `events` to outs gets Sale to **384 outs / 128.0 IP** against MLB's
 * **129.0** across the season (home 65.0 against 65.1, away 63.0 against 63.2):
 * three outs a season short, every one of them a runner caught on the bases
 * during a plate appearance, which the export records in `des` and nowhere a
 * parser can trust. Three outs is 0.8% and it is still a wrong number, and a
 * wrong ERA is worse than no ERA — so IP is null and every rate built on it
 * goes with it.
 */

// **The season is imported rather than pinned again.** `CLAUDE.md` keeps a list
// of the places it is hardcoded and warns that the count has been one behind
// before; a tenth copy here would be a tenth thing to update on the roll-over,
// so this reads `research.ts`'s — the very board this module's identity half
// comes off, which makes agreeing with it a property rather than a promise.
//
// Note the file still answers `grep "hfSea"`, which is one of the three patterns
// that list is derived from: the `hfSea=${SEASON}|` below is a *use* of the
// number and not a second definition of it, but a reader auditing the roll-over
// will meet this file and should.

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** The same six hours the boards this table's other half comes from settle on.
 *  A cut is a season of pitches reduced to twenty rows, and the twenty rows are
 *  what is stored — not the megabyte they came from. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * `-v1`: the first version of this blob. Bump it whenever a field a cut row
 * carries is **added or begins to be filled** — a stored blob deserializes with
 * everything added since it missing, and this one is read straight back out as
 * the answer, which is the test `RULES.md` sets.
 *
 * `-v2`: the blob stopped *being* the four cuts and became an object with them
 * under `windows` and the recent-form cut beside it under `last100`. A stored
 * v1 blob is the bare `CutWindows`, so it would deserialize into a `PlayerCuts`
 * with **both** fields undefined — every cut of every span reading as "he has
 * nothing here", which is the shape of answer this file is at pains to
 * distinguish from a real one. The rename is the bump.
 */
const cutKey = (kind: PlayerKind, playerId: number) =>
  `player-cuts-${kind}-${playerId}-${SEASON}-v2.json`;

/**
 * One player's whole season of pitches.
 *
 * `type=details` and `all=true` are `savant.ts`'s own spelling of "every row,
 * nothing grouped"; what differs is the lookup, which is why this is a separate
 * URL rather than a parameter on that one — that function is per-*date* and
 * this is per-*player*, and the two share no filter at all.
 */
function seasonPitchUrl(playerId: number, kind: PlayerKind): string {
  const params = new URLSearchParams({
    hfGT: 'R|',
    hfSea: `${SEASON}|`,
    player_type: kind,
    group_by: 'name-event',
    min_pitches: '0',
    min_results: '0',
    min_pas: '0',
    type: 'details',
    all: 'true',
    minors: 'false',
    wbc: 'false',
  });
  params.append(kind === 'pitcher' ? 'pitchers_lookup[]' : 'batters_lookup[]', String(playerId));
  return `https://baseballsavant.mlb.com/statcast_search/csv?${params.toString()}`;
}

/**
 * Events that fill the column and are **not** a plate appearance.
 *
 * A denylist rather than an allowlist, which is the direction this codebase
 * takes when the upstream owns the vocabulary (`QUIET_ACTIONS` is the
 * precedent): an outcome MLB adds next season shows up as the plate appearance
 * it almost certainly is, rather than vanishing out of the denominator.
 *
 * `truncated_pa` is the one that actually appears — a plate appearance ended by
 * the third out on the bases, which MLB does not count as a batter faced.
 * Measured: exactly **1** in Sale's season, and it is the whole of the
 * difference between 518 and MLB's 517. The base-running family below it is
 * carried because Savant *can* put those in `events` on an export grouped
 * differently, and every one of them would be a phantom plate appearance.
 */
const NON_PA_EVENTS = new Set([
  'truncated_pa',
  'stolen_base_2b',
  'stolen_base_3b',
  'stolen_base_home',
  'caught_stealing_2b',
  'caught_stealing_3b',
  'caught_stealing_home',
  'pickoff_1b',
  'pickoff_2b',
  'pickoff_3b',
  'pickoff_caught_stealing_2b',
  'pickoff_caught_stealing_3b',
  'pickoff_caught_stealing_home',
  'wild_pitch',
  'passed_ball',
  'balk',
  'other_out',
  'runner_double_play',
  'ejection',
  'game_advisory',
]);

/** A plate appearance that is not an at-bat. MLB's own rule, written out:
 *  walks, hit batsmen, sacrifices and catcher's interference. */
const NON_AB_EVENTS = new Set([
  'walk',
  'intent_walk',
  'hit_by_pitch',
  'sac_fly',
  'sac_bunt',
  'sac_fly_double_play',
  'sac_bunt_double_play',
  'catcher_interf',
]);

/** Total bases by outcome — the only four events that are a hit. */
const HIT_BASES: Record<string, number> = {
  single: 1,
  double: 2,
  triple: 3,
  home_run: 4,
};

/** The counting line a cut of a span comes to, before it is dressed as a
 *  `ResearchRow`. Everything here is a **sum**, for the reason
 *  `statcastWindow.ts` gives: a cut is a filter over rows, and rates don't
 *  filter. */
interface CutCounts {
  games: Set<string>;
  pa: number;
  ab: number;
  hits: number;
  doubles: number;
  triples: number;
  hr: number;
  walks: number;
  hbp: number;
  sf: number;
  strikeouts: number;
  totalBases: number;
  pitches: number;
  strikes: number;
  statcast: StatcastCounts;
}

const emptyCut = (): CutCounts => ({
  games: new Set(),
  pa: 0,
  ab: 0,
  hits: 0,
  doubles: 0,
  triples: 0,
  hr: 0,
  walks: 0,
  hbp: 0,
  sf: 0,
  strikeouts: 0,
  totalBases: 0,
  pitches: 0,
  strikes: 0,
  statcast: empty(),
});

function addPitch(into: CutCounts, r: Record<string, string>): void {
  into.pitches++;
  // Savant's own three-way `type`: a called or swinging strike, a ball, or a
  // ball put in play — which is a strike for the purposes of the strike rate
  // the board's `Str%` column derives, as it is everywhere else.
  if (r.type === 'S' || r.type === 'X') into.strikes++;
  tally(into.statcast, r);

  const e = r.events;
  if (!e || NON_PA_EVENTS.has(e)) return;
  into.pa++;
  if (r.game_pk) into.games.add(r.game_pk);
  if (e === 'walk' || e === 'intent_walk') into.walks++;
  if (e === 'hit_by_pitch') into.hbp++;
  if (e === 'sac_fly' || e === 'sac_fly_double_play') into.sf++;
  if (e === 'strikeout' || e === 'strikeout_double_play') into.strikeouts++;
  if (!NON_AB_EVENTS.has(e)) into.ab++;
  const bases = HIT_BASES[e];
  if (bases !== undefined) {
    into.hits++;
    into.totalBases += bases;
    if (bases === 2) into.doubles++;
    if (bases === 3) into.triples++;
    if (bases === 4) into.hr++;
  }
}

const r3 = (v: number | null): number | null =>
  v === null ? null : Math.round(v * 1000) / 1000;

/**
 * Which rows a cut keeps.
 *
 * The handedness cut is **the other man's hand** on both boards, which is what
 * the app already means by a platoon split: a batter's is the pitcher's
 * (`p_throws`) and a pitcher's is the batter's (`stand`). One value, `vsr` or
 * `vsl`, therefore reads as *vs RHP* on a batter's page and *vs RHB* on a
 * pitcher's, and the label is the client's business.
 *
 * Home and away are `inning_topbot`, not the club abbreviations: the top of an
 * inning is the visiting side batting, so a **batter** is at home in the bottom
 * and a **pitcher** is at home in the top. Reading it off `home_team` would need
 * the player's own club, which changes at a trade deadline and is exactly the
 * join this does not have to make.
 */
function keeps(cut: SplitCut, kind: PlayerKind, r: Record<string, string>): boolean {
  switch (cut) {
    case 'vsr':
      return (kind === 'pitcher' ? r.stand : r.p_throws) === 'R';
    case 'vsl':
      return (kind === 'pitcher' ? r.stand : r.p_throws) === 'L';
    case 'home':
      return r.inning_topbot === (kind === 'pitcher' ? 'Top' : 'Bot');
    case 'away':
      return r.inning_topbot === (kind === 'pitcher' ? 'Bot' : 'Top');
  }
}

/** The identity half of a row, which a cut has no opinion about — read off the
 *  season board, whose row for this player is already cached. A failure here
 *  costs the names and not the numbers, which is the standing rule. */
async function identity(playerId: number, kind: PlayerKind): Promise<Partial<ResearchRow>> {
  try {
    const board = await getResearch(kind, 'season');
    const row = board.rows.find((r) => r.id === playerId);
    if (!row) return {};
    const { name, savantName, team, teamId, position, positionType, starter } = row;
    return { name, savantName, team, teamId, position, positionType, starter };
  } catch (err) {
    console.error(`Player cuts: season board unavailable for identity:`, err);
    return {};
  }
}

/**
 * A cut of a span as the board's own row shape.
 *
 * `null` where he has no plate appearance in it, which is the same distinction
 * `getPlayerWindows` draws and for the same reason: a hitter with nothing
 * against left-handers in the last seven days did not go 0-for-0, and the
 * client draws a sentence rather than a line of noughts. **The cut is what makes
 * that case common** — a week cut by hand is a handful of plate appearances at
 * best — which is why the sentence names the cut as well as the span.
 */
function toRow(
  c: CutCounts,
  playerId: number,
  kind: PlayerKind,
  id: Partial<ResearchRow>,
): ResearchRow | null {
  if (c.pa === 0) return null;
  const batting = kind === 'batter';
  const obpDen = c.ab + c.walks + c.hbp + c.sf;
  const avg = c.ab > 0 ? c.hits / c.ab : null;
  const obp = obpDen > 0 ? (c.hits + c.walks + c.hbp) / obpDen : null;
  const slg = c.ab > 0 ? c.totalBases / c.ab : null;
  const babipDen = c.ab - c.strikeouts - c.hr + c.sf;
  const sc = toStatcast(c.statcast);
  return {
    id: playerId,
    name: id.name ?? '',
    savantName: id.savantName ?? '',
    kind,
    team: id.team ?? '',
    teamId: id.teamId ?? null,
    position: id.position ?? '',
    positionType: id.positionType ?? '',
    games: c.games.size,
    starter: id.starter ?? false,
    // **Nothing on a cut row is qualified, and nothing reads this.** Savant's
    // bar is 2.1 plate appearances per team *game* over a whole span, which is a
    // statement about the span and not about a quarter of it; and the badges it
    // decides the ring of are suppressed under a cut anyway, there being no
    // split board to rank within. `false` is the honest value: he is not one of
    // a population that does not exist.
    qualified: false,

    pa: batting ? c.pa : null,
    ab: batting ? c.ab : null,
    doubles: batting ? c.doubles : null,
    triples: batting ? c.triples : null,
    // Runs, RBI and the stolen-base pair are the plate appearance's
    // consequences rather than its outcome, and a pitch row does not carry
    // them. See the header: null, and dashed by the client.
    rbi: null,
    sb: null,
    cs: null,
    avg: batting ? r3(avg) : null,
    obp: batting ? r3(obp) : null,
    slg: batting ? r3(slg) : null,
    ops: batting && obp !== null && slg !== null ? r3(obp + slg) : null,
    babip: batting && babipDen > 0 ? r3((c.hits - c.hr) / babipDen) : null,

    // The pitching half a cut cannot reach — every one of them an inning or an
    // earned run, and the header says why neither is derivable.
    gamesStarted: null,
    wins: null,
    losses: null,
    saves: null,
    holds: null,
    inningsPitched: null,
    era: null,
    whip: null,
    strikeoutsPer9: null,
    walksPer9: null,
    homeRunsPer9: null,
    battersFaced: batting ? null : c.pa,
    avgAgainst: batting ? null : r3(avg),
    hitBatsmen: batting ? null : c.hbp,
    strikes: batting ? null : c.strikes,
    pitches: batting ? null : c.pitches,
    fip: null,
    xfip: null,

    hits: c.hits,
    hr: c.hr,
    runs: null,
    walks: c.walks,
    strikeouts: c.strikeouts,

    xba: sc.xba,
    xslg: sc.xslg,
    xwoba: sc.xwoba,
    xera: null,
    exitVelocity: sc.exitVelocity,
    launchAngle: sc.launchAngle,
    barrelRate: sc.barrelRate,
    hardHitRate: sc.hardHitRate,
    sweetSpotRate: sc.sweetSpotRate,
    gbRate: sc.gbRate,
    ldRate: sc.ldRate,
    fbRate: sc.fbRate,
    // Savant's own pull classification is a second export keyed by date
    // (`hfPull`), which this per-player request has no counterpart for — so the
    // rate is null here exactly as it is on a window, rather than being
    // approximated off a spray angle that was measured not to reproduce it.
    pullAirRate: null,
    whiffRate: sc.whiffRate,
    chaseRate: sc.chaseRate,
    firstPitchStrikeRate: sc.firstPitchStrikeRate,
    batSpeed: sc.batSpeed,
    sprintSpeed: null,
  };
}

type CutWindows = Record<SplitCut, { window: ResearchWindow; row: ResearchRow | null }[]>;

/**
 * Everything one season of one player's pitches reduces to.
 *
 * **`last100` is a sibling of `windows` rather than a fifth key inside it**, and
 * the shape is the argument: a `CutWindows` entry is that cut measured over each
 * of five spans, and recent form has no spans to be measured over — see
 * `RecentCut`, which sets out why "his last 100 at-bats within the last 7 days"
 * is not a narrower question. Folding it in would have meant four honest rows
 * and one row of noughts on every cut of every window, which is exactly the
 * "did not go 0-for-0" fault `toRow` returns null to avoid.
 */
interface PlayerCuts {
  windows: CutWindows;
  /** The most recent 100 at-bats (batters faced for a pitcher), or null where
   *  he has not had a plate appearance all season. Fewer than 100 where he has
   *  not had that many — the row is what he *has* done, and `pa` on it says how
   *  much that is. */
  last100: ResearchRow | null;
}

/**
 * A total order over one season of pitches.
 *
 * `at_bat_number` restarts each game and `pitch_number` each plate appearance,
 * so neither orders a season alone; `game_pk` breaks the one tie `game_date`
 * leaves, which is a doubleheader — two games on one date whose at-bat numbers
 * both start at 1. Measured on a real export: Judge's season arrives in
 * **neither** order (not ascending, not descending), so it has to be sorted
 * rather than read off the end.
 */
function pitchOrder(r: Record<string, string>): [string, number, number, number] {
  return [
    r.game_date ?? '',
    Number(r.game_pk) || 0,
    Number(r.at_bat_number) || 0,
    Number(r.pitch_number) || 0,
  ];
}

function comparePitches(a: Record<string, string>, b: Record<string, string>): number {
  const x = pitchOrder(a);
  const y = pitchOrder(b);
  for (let i = 0; i < x.length; i++) {
    if (x[i] < y[i]) return -1;
    if (x[i] > y[i]) return 1;
  }
  return 0;
}

/**
 * The rows making up his most recent `RECENT_CUT_SIZE` at-bats — or batters
 * faced, on a pitcher, where every plate appearance is one.
 *
 * Walked **backwards through plate appearances**, not through pitches or
 * through days: the cut is a count of at-bats and its edge therefore falls on a
 * plate-appearance boundary, never in the middle of one. Every pitch of a kept
 * plate appearance is kept with it, because the discipline half of the card
 * (chase, whiff, first-pitch strikes) is counted off pitches and would
 * otherwise be measured over a fragment of the very appearances the batting
 * half is measured over.
 *
 * The plate appearances *between* those at-bats come along too — a walk sitting
 * between two of them is inside the span and is counted, which is what makes
 * the BB% on this card mean anything. So the row rests on rather more than 100
 * plate appearances, and that number is what `pa` on it reports.
 */
function recentRows(
  rows: Record<string, string>[],
  kind: PlayerKind,
): Record<string, string>[] {
  const sorted = [...rows].sort(comparePitches);
  let atBats = 0;
  // **The whole season, until proved otherwise.** A player with fewer than
  // `RECENT_CUT_SIZE` at-bats never trips the test below, and keeping every row
  // is the right answer for him: his last 100 at-bats are all of them.
  let cutAt = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const e = sorted[i].events;
    if (!e || NON_PA_EVENTS.has(e)) continue;
    // A pitcher's unit is the batter faced, which every plate appearance is; a
    // batter's is the at-bat, which the walks and sacrifices among them are not.
    if (kind === 'pitcher' || !NON_AB_EVENTS.has(e)) atBats++;
    if (atBats > RECENT_CUT_SIZE) {
      // One too many. `events` sits on the **last** pitch of a plate
      // appearance, so index `i` is where the appearance outside the span ends
      // and `i + 1` is the first pitch of the oldest one inside it.
      cutAt = i + 1;
      break;
    }
  }
  return sorted.slice(cutAt);
}

async function buildAll(playerId: number, kind: PlayerKind): Promise<PlayerCuts> {
  const res = await fetch(seasonPitchUrl(playerId, kind), {
    headers: { 'User-Agent': BROWSER_UA },
  });
  if (!res.ok) {
    throw new Error(`Savant player pitches returned ${res.status} ${res.statusText}`);
  }
  const rows = parse(await res.text(), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  const id = await identity(playerId, kind);

  // One pass per cut per span, over rows already in memory. The spans are
  // date bounds off `windowDates`, which is the very function the board's own
  // windows are cut with — so "the last 30 days" means the same thirty days on
  // both halves of this tab.
  const bounds = new Map<ResearchWindow, [string, string] | null>();
  for (const w of RESEARCH_WINDOWS) {
    if (w === 'season') bounds.set(w, null);
    else {
      const d = windowDates(w);
      bounds.set(w, [d[0], d[d.length - 1]]);
    }
  }

  const out = {} as CutWindows;
  for (const cut of SPLIT_CUTS) {
    const kept = rows.filter((r) => keeps(cut, kind, r));
    out[cut] = RESEARCH_WINDOWS.map((window) => {
      const span = bounds.get(window) ?? null;
      const counts = emptyCut();
      for (const r of kept) {
        const d = r.game_date;
        if (span && (!d || d < span[0] || d > span[1])) continue;
        addPitch(counts, r);
      }
      return { window, row: toRow(counts, playerId, kind, id) };
    });
  }

  // Recent form, off the same rows already in memory: a sixth pass over a list
  // the fetch above has already paid for, which is the same economy the four
  // cuts make between themselves.
  const recent = emptyCut();
  for (const r of recentRows(rows, kind)) addPitch(recent, r);

  return { windows: out, last100: toRow(recent, playerId, kind, id) };
}

const mem = new Map<string, { data: PlayerCuts; fetchedAt: number }>();
const inFlight = new Map<string, Promise<PlayerCuts>>();

/**
 * All four cuts of all five spans, from one request and one cache entry.
 *
 * Keyed by player rather than by cut because **the fetch is the cost and the
 * cut is a filter over it**: a reader who presses `vs LHP` and then `Home` has
 * already paid for both, and storing them apart would be the same megabyte
 * downloaded four times. The blob is the twenty rows, not the megabyte.
 */
async function allCuts(playerId: number, kind: PlayerKind): Promise<PlayerCuts> {
  const key = `${kind}-${playerId}`;
  const hit = mem.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.data;
  const running = inFlight.get(key);
  if (running) return running;

  const p = (async () => {
    const stored = await readJsonBlob<PlayerCuts>(
      cutKey(kind, playerId),
      (_v, cachedAt) => Date.now() - cachedAt < CACHE_TTL_MS,
    );
    if (stored) {
      mem.set(key, { data: stored, fetchedAt: Date.now() });
      return stored;
    }
    const data = await buildAll(playerId, kind);
    mem.set(key, { data, fetchedAt: Date.now() });
    await writeJsonBlob(cutKey(kind, playerId), data);
    return data;
  })();
  inFlight.set(key, p);
  try {
    return await p;
  } finally {
    inFlight.delete(key);
  }
}

/** The Stats tab's table under one cut, in exactly the shape the uncut table
 *  arrives in — same route, same five rows, same `row: null` for a span he has
 *  nothing in. The client's table is therefore one table and not two. */
export async function getPlayerCutWindows(
  playerId: number,
  kind: PlayerKind,
  cut: SplitCut,
): Promise<{
  season: number;
  kind: PlayerKind;
  cut: SplitCut;
  windows: { window: ResearchWindow; row: ResearchRow | null }[];
}> {
  const all = await allCuts(playerId, kind);
  return { season: SEASON, kind, cut, windows: all.windows[cut] };
}

/**
 * **One cut of the whole season, as a single board row** — what the percentile
 * card's cut ranks (see `percentileCuts.ts`).
 *
 * The season entry rather than a span, and that is the point rather than a
 * default: the card places a cut value inside the **full season's** qualified
 * distribution, so a cut measured over anything narrower than the season would
 * be the one half of that comparison drawn to a different scale.
 *
 * `last100` is the exception that proves it — a count of at-bats rather than a
 * span, and the reason it is a sibling field here rather than a fifth key on
 * `windows` is set out on `PlayerCuts`.
 *
 * Costs nothing the Stats tab has not already paid: same fetch, same blob, same
 * six hours, so a reader who has looked at either surface has bought both.
 */
export async function getPlayerSeasonCut(
  playerId: number,
  kind: PlayerKind,
  cut: PlayerCut,
): Promise<ResearchRow | null> {
  const all = await allCuts(playerId, kind);
  if (cut === 'last100') return all.last100 ?? null;
  const windows = all.windows[cut];
  if (!windows) return null;
  return windows.find((w) => w.window === 'season')?.row ?? null;
}
