import type {
  BaseEvent,
  BaseEventKind,
  BaseState,
  BattingLine,
  PitchingCredit,
  PitchingLine,
  PlateAppearance,
  GameStatus,
  PlayerGame,
  PlayerKind,
  PlayerReport,
  PlayerStatus,
  RosterStatus,
} from './types';

/** Category used for color-coding an outcome. */
export type OutcomeKind = 'hr' | 'hit' | 'walk' | 'out' | 'strikeout' | 'other';

export function outcomeKind(event: string | null): OutcomeKind {
  switch (event) {
    case 'home_run':
      return 'hr';
    case 'single':
    case 'double':
    case 'triple':
      return 'hit';
    case 'walk':
    case 'intent_walk':
    case 'hit_by_pitch':
      return 'walk';
    case 'strikeout':
    case 'strikeout_double_play':
      return 'strikeout';
    case null:
    case undefined:
      return 'other';
    default:
      return 'out';
  }
}

const EVENT_LABELS: Record<string, string> = {
  single: 'Single',
  double: 'Double',
  triple: 'Triple',
  home_run: 'Home Run',
  walk: 'Walk',
  intent_walk: 'Intentional Walk',
  hit_by_pitch: 'Hit By Pitch',
  strikeout: 'Strikeout',
  strikeout_double_play: 'Strikeout DP',
  field_out: 'Field Out',
  force_out: 'Force Out',
  grounded_into_double_play: 'GIDP',
  double_play: 'Double Play',
  sac_fly: 'Sac Fly',
  sac_bunt: 'Sac Bunt',
  field_error: 'Reached On Error',
  fielders_choice: "Fielder's Choice",
  fielders_choice_out: "Fielder's Choice",
  catcher_interf: 'Catcher Interference',
};

export function eventLabel(event: string | null): string {
  if (!event) return 'In Progress';
  return EVENT_LABELS[event] ?? event.replace(/_/g, ' ');
}

/** A compact box-score style line, e.g. "2-4, HR, BB". */
/**
 * OPS for a batting line (a single game or an aggregated range). Sacrifice
 * flies aren't tracked on the line, so the OBP denominator is AB+BB+HBP (a hair
 * high when SFs occurred). Returns null when there's no on-base opportunity to
 * divide by (e.g. a line of only sacrifices).
 */
export function lineOps(line: BattingLine): number | null {
  const obpDen = line.ab + line.bb + line.hbp;
  if (obpDen === 0) return null;
  const obp = (line.hits + line.bb + line.hbp) / obpDen;
  const slg = line.ab > 0 ? line.totalBases / line.ab : 0;
  return obp + slg;
}

/** A rate stat printed the baseball way: three decimals, no leading zero (".812", "1.250"). */
export function formatRate(n: number): string {
  const s = n.toFixed(3);
  return s.startsWith('0.') ? s.slice(1) : s;
}

export function lineSummary(line: BattingLine): string {
  const parts: string[] = [`${line.hits}-${line.ab}`];
  const extras: string[] = [];
  if (line.runs) extras.push(`${line.runs} R`);
  if (line.hr) extras.push(line.hr > 1 ? `${line.hr} HR` : 'HR');
  if (line.triples) extras.push(line.triples > 1 ? `${line.triples} 3B` : '3B');
  if (line.doubles) extras.push(line.doubles > 1 ? `${line.doubles} 2B` : '2B');
  if (line.rbi) extras.push(`${line.rbi} RBI`);
  if (line.sb) extras.push(line.sb > 1 ? `${line.sb} SB` : 'SB');
  if (line.bb) extras.push(line.bb > 1 ? `${line.bb} BB` : 'BB');
  if (line.so) extras.push(line.so > 1 ? `${line.so} K` : 'K');
  if (line.hbp) extras.push('HBP');
  const ops = lineOps(line);
  if (ops !== null) extras.push(`${formatRate(ops)} OPS`);
  return [parts[0], ...extras].join(', ');
}

/** Sum per-game batting lines into one aggregate line (e.g. across a date range). */
export function combineLines(lines: BattingLine[]): BattingLine {
  const sum = (f: (l: BattingLine) => number) => lines.reduce((s, l) => s + f(l), 0);
  const max = (f: (l: BattingLine) => number | null) => {
    const vals = lines.map(f).filter((v): v is number => v !== null && v > 0);
    return vals.length ? Math.max(...vals) : null;
  };
  const runValues = lines.map((l) => l.runValue).filter((v): v is number => v !== null);
  return {
    pa: sum((l) => l.pa),
    ab: sum((l) => l.ab),
    hits: sum((l) => l.hits),
    singles: sum((l) => l.singles),
    doubles: sum((l) => l.doubles),
    triples: sum((l) => l.triples),
    hr: sum((l) => l.hr),
    bb: sum((l) => l.bb),
    so: sum((l) => l.so),
    hbp: sum((l) => l.hbp),
    runs: sum((l) => l.runs),
    rbi: sum((l) => l.rbi),
    sb: sum((l) => l.sb),
    cs: sum((l) => l.cs),
    totalBases: sum((l) => l.totalBases),
    hardHits: sum((l) => l.hardHits),
    avgExitVelo: null,
    maxExitVelo: max((l) => l.maxExitVelo),
    maxDistance: max((l) => l.maxDistance),
    runValue: runValues.length ? runValues.reduce((a, b) => a + b, 0) : null,
  };
}

// ---- Pitching helpers ------------------------------------------------------

/** Outs recorded → innings pitched, the baseball way ("17" outs → "5.2"). */
export function formatIp(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

/** Sum per-game pitching lines into one aggregate (for a multi-game card header). */
export function combinePitchingLines(lines: PitchingLine[]): PitchingLine {
  const sum = (f: (l: PitchingLine) => number) => lines.reduce((s, l) => s + f(l), 0);
  return {
    outs: sum((l) => l.outs),
    hits: sum((l) => l.hits),
    runs: sum((l) => l.runs),
    earnedRuns: sum((l) => l.earnedRuns),
    walks: sum((l) => l.walks),
    strikeouts: sum((l) => l.strikeouts),
    hr: sum((l) => l.hr),
    battersFaced: sum((l) => l.battersFaced),
    pitchesThrown: sum((l) => l.pitchesThrown),
    strikes: sum((l) => l.strikes),
    balls: sum((l) => l.balls),
    doubles: sum((l) => l.doubles),
    triples: sum((l) => l.triples),
    hitBatsmen: sum((l) => l.hitBatsmen),
    atBats: sum((l) => l.atBats),
    intentionalWalks: sum((l) => l.intentionalWalks),
    wildPitches: sum((l) => l.wildPitches),
    inheritedRunners: sum((l) => l.inheritedRunners),
    inheritedRunnersScored: sum((l) => l.inheritedRunnersScored),
    wins: sum((l) => l.wins),
    saves: sum((l) => l.saves),
    holds: sum((l) => l.holds),
  };
}

/** ERA over an aggregate line (earned runs × 9 / innings), or "—" with no outs. */
export function eraOf(line: PitchingLine): string {
  if (line.outs === 0) return '—';
  return ((line.earnedRuns * 27) / line.outs).toFixed(2);
}

/** WHIP over an aggregate line ((walks + hits) / innings), or "—" with no outs. */
export function whipOf(line: PitchingLine): string {
  if (line.outs === 0) return '—';
  return (((line.walks + line.hits) * 3) / line.outs).toFixed(2);
}

/**
 * A pitcher's line over the range in view, as the rates the counting line
 * beside it can't give: "2.45 ERA, 1.09 WHIP, 29% K, 7% BB". This is the card
 * header's line now. The season one it replaced (ERA · FIP · WHIP · K/9 · BB/9
 * · HR/9) stated a different span from everything under it — the card is a read
 * on the days in view — and it isn't lost: the details view's Season tab shows
 * it whole, a tap away, with the room to pair each estimator with the number it
 * estimates.
 *
 * K and BB are shares of **batters faced** rather than the season line's per-9
 * rates. A season has innings to spare where a range can be one appearance, and
 * a single inning turns K/9 into 18.0 where a share of the batters he faced
 * reads the same at any sample — and it is already the vocabulary of the card's
 * own Rates strip below.
 */
export function rangePitchingSummary(line: PitchingLine): string {
  const parts = [`${eraOf(line)} ERA`, `${whipOf(line)} WHIP`];
  const share = (n: number, label: string) => {
    if (line.battersFaced > 0)
      parts.push(`${Math.round((n / line.battersFaced) * 100)}% ${label}`);
  };
  share(line.strikeouts, 'K');
  share(line.walks, 'BB');
  // Comma-separated to match the batter card's line (`rangeBattingSummary`).
  return parts.join(', ');
}

/**
 * What a base-running event did for the runner, which is what its colour says.
 *
 * Ten kinds is far too many colours, and the distinction the eye actually wants
 * off a feed is not *which* rule sent him down the line but whether he gained,
 * was given, lost or scored:
 *
 * - `take` he took the base himself (a steal) — the live purple the on-base
 *   ring already uses;
 * - `free` he was handed it (a balk, a wild pitch, a passed ball, a pickoff
 *   throw into right field, the defence declining to contest) — `--walk`, the
 *   colour of a free base at the plate, which is what this is on the paths;
 * - `out` he was thrown out (caught stealing, picked off) — `--out`, the same
 *   grey an at-bat's out takes;
 * - `run` he scored — `--hit`.
 */
export type BaseEventTone = 'take' | 'free' | 'out' | 'run';

const BASE_EVENT_TONES: Record<BaseEventKind, BaseEventTone> = {
  sb: 'take',
  cs: 'out',
  po: 'out',
  pocs: 'out',
  poe: 'free',
  balk: 'free',
  wp: 'free',
  pb: 'free',
  di: 'free',
  run: 'run',
};

export const baseEventTone = (kind: BaseEventKind): BaseEventTone => BASE_EVENT_TONES[kind];

/**
 * The badge on a base-running feed item, and on the row it takes in a pitcher's
 * inning block.
 *
 * The base rides in the label only for the kinds the base *is* the event —
 * stealing second, being caught at third. For a balk or a wild pitch the badge
 * names the infraction and MLB's own line directly under it says who moved and
 * where to, so carrying it here would be the same fact twice on two adjacent
 * rows. `pocs` and `po` share their wording deliberately: "picked off" is what
 * happened either way, and they name different bases (he is picked off *at*
 * first, or caught out between first and second), so the two never read alike.
 */
export function baseEventLabel(ev: BaseEvent): string {
  switch (ev.kind) {
    case 'run':
      return 'Run Scored';
    case 'sb':
      return ev.base ? `Stole ${ev.base}` : 'Stolen Base';
    case 'cs':
      return ev.base ? `Caught Stealing ${ev.base}` : 'Caught Stealing';
    case 'po':
    case 'pocs':
      return ev.base ? `Picked Off ${ev.base}` : 'Picked Off';
    case 'poe':
      return 'Pickoff Error';
    case 'balk':
      return 'Balk';
    case 'wp':
      return 'Wild Pitch';
    case 'pb':
      return 'Passed Ball';
    case 'di':
      return 'Indifference';
  }
}

/**
 * The score a play or an event left behind, in the game badge's own away–home
 * form. One helper because a feed item states it in one place whichever kind of
 * item it is — an at-bat and a base event both read it off the same pair.
 */
export function scoreLine(
  game: { awayTeam: string; homeTeam: string },
  away: number | null,
  home: number | null,
): string | null {
  if (away === null || home === null) return null;
  return `${game.awayTeam} ${away}–${home} ${game.homeTeam}`;
}

/** The color keyed to a credit (W/L/S/HLD) — the accent on a pitcher's line,
 *  wherever that line is shown (the card, the feed, the game log). */
export function decisionColor(d: PitchingCredit | null): string {
  if (d === 'W') return 'var(--hit)';
  if (d === 'L') return 'var(--strikeout)';
  if (d === 'S') return 'var(--accent)';
  // A hold takes the relief amber the RP chip uses — it's the reliever's credit.
  if (d === 'H') return 'var(--hr)';
  return 'var(--muted)';
}

/**
 * The chip text for a pitching credit. The letters are the scorebook's, except
 * a hold — "H" alone reads as a hit next to a line of them, so it's spelled.
 */
export function creditLabel(credit: PitchingCredit): string {
  return credit === 'H' ? 'HLD' : credit;
}

/** How a game value compares to a reference (season/league avg), for an arrow. */
export interface Delta {
  dir: 'up' | 'down' | 'flat';
  diff: number; // signed magnitude (game − reference)
}

/** Compare a game value to a reference; `flatBand` is the |diff| treated as even. */
export function deltaVs(value: number | null, ref: number | null, flatBand = 0): Delta | null {
  if (value === null || ref === null) return null;
  const diff = value - ref;
  const dir = Math.abs(diff) <= flatBand ? 'flat' : diff > 0 ? 'up' : 'down';
  return { dir, diff };
}

export function fmt(n: number | null, digits = 0, suffix = ''): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n.toFixed(digits)}${suffix}`;
}

/** Baseball Savant's pitch-type color + abbreviation, keyed by the full pitch
 * name the feed reports ("4-Seam Fastball"). Used to color-code the arsenal the
 * way the Savant player page does. Falls back to a neutral gray + 2-letter slug. */
const PITCH_STYLE: Record<string, { abbr: string; color: string }> = {
  '4-Seam Fastball': { abbr: 'FF', color: '#d22d49' },
  Sinker: { abbr: 'SI', color: '#fe9d00' },
  Cutter: { abbr: 'FC', color: '#933f2c' },
  Slider: { abbr: 'SL', color: '#c9b200' },
  Sweeper: { abbr: 'ST', color: '#ddb33a' },
  Slurve: { abbr: 'SV', color: '#93afd4' },
  Curveball: { abbr: 'CU', color: '#00d1ed' },
  'Knuckle Curve': { abbr: 'KC', color: '#6236cd' },
  'Slow Curve': { abbr: 'CS', color: '#7a5fd0' },
  Changeup: { abbr: 'CH', color: '#1dbe3a' },
  Splitter: { abbr: 'FS', color: '#3bacac' },
  Forkball: { abbr: 'FO', color: '#55ccab' },
  Screwball: { abbr: 'SC', color: '#60db33' },
  Knuckleball: { abbr: 'KN', color: '#5b6bb5' },
  Eephus: { abbr: 'EP', color: '#888888' },
};

export function pitchStyle(name: string): { abbr: string; color: string } {
  return PITCH_STYLE[name] ?? { abbr: name.slice(0, 2).toUpperCase(), color: '#8a8f98' };
}

/** Slug + id for a Baseball Savant player page link. */
export function savantPlayerUrl(name: string, id: number): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `https://baseballsavant.mlb.com/savant-player/${slug}-${id}?stats=statcast-r-hitting-mlb`;
}

/** MLB headshot for a player id (transparent PNG, ~120px). */
export function headshotUrl(id: number): string {
  return `https://midfield.mlbstatic.com/v1/people/${id}/spots/120`;
}

const PITCH_ABBR: Record<string, string> = {
  '4-Seam Fastball': 'FF',
  Sinker: 'SI',
  Cutter: 'FC',
  Slider: 'SL',
  Sweeper: 'ST',
  Curveball: 'CU',
  'Knuckle Curve': 'KC',
  Changeup: 'CH',
  Splitter: 'FS',
  'Split-Finger': 'FS',
  Slurve: 'SV',
  Screwball: 'SC',
  Forkball: 'FO',
  Eephus: 'EP',
  'Slow Curve': 'CS',
};

export function pitchAbbr(name: string | null): string {
  if (!name) return '?';
  return PITCH_ABBR[name] ?? name.slice(0, 2).toUpperCase();
}

/** Whether a pitch description represents a swing. */
export function isSwing(description: string): boolean {
  return (
    description.includes('swinging') ||
    description === 'hit_into_play' ||
    description.includes('foul')
  );
}

/** Local first-pitch time like "7:05 PM" from an ISO datetime (null if unparseable). */
export function formatStartTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export interface GameStatusView {
  kind: 'scheduled' | 'live' | 'final' | 'postponed';
  /** Away-first line score, e.g. "BOS 2–3 NYY" (null before a game starts). */
  score: string | null;
  /** Right-hand label: start time, current inning, or "Final". */
  detail: string;
}

/** Presentation of a game's status: start time (scheduled), score + inning (live), or final. */
export function gameStatusView(game: PlayerGame): GameStatusView {
  const s = game.status;
  const score =
    s.awayScore !== null && s.homeScore !== null
      ? `${game.awayTeam} ${s.awayScore}–${s.homeScore} ${game.homeTeam}`
      : null;

  if (s.state === 'postponed') {
    // A postponed game's start time is often bumped to the makeup date, so show
    // the "Postponed" label rather than a misleading next-day time.
    return { kind: 'postponed', score: null, detail: s.detailedState || 'Postponed' };
  }
  if (s.state === 'scheduled') {
    const t = formatStartTime(s.startTime);
    return { kind: 'scheduled', score: null, detail: t ?? (s.detailedState || 'Scheduled') };
  }
  if (s.state === 'live') {
    const inning =
      s.currentInning !== null
        ? `${s.inningState ?? ''} ${s.currentInning}`.trim()
        : s.detailedState || 'Live';
    return { kind: 'live', score, detail: inning };
  }
  return { kind: 'final', score, detail: 'Final' };
}

/** Short "Jul 3" style date, for disambiguating games across a date range. */
export function prettyGameDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function describePitch(description: string): string {
  return description.replace(/_/g, ' ');
}

/** Pitcher-hand code to a throwing label: "R" → "RHP", "L" → "LHP". */
export function handThrows(hand: string | null): string {
  return hand === 'R' ? 'RHP' : hand === 'L' ? 'LHP' : 'P';
}

const NAME_SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv']);

/**
 * "Tarik Skubal" → "Skubal", "Nestor Cortes Jr." → "Cortes Jr." — a starter is
 * referred to by surname anyway, and every place one is named beside a matchup
 * (the summary table's opponent cell, the feed's Upcoming bar) is a row where a
 * wider name costs something else off the right of a phone screen.
 */
export function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const last = parts[parts.length - 1];
  return NAME_SUFFIXES.has(last.toLowerCase()) && parts.length > 2
    ? `${parts[parts.length - 2]} ${last}`
    : last;
}

/**
 * True when a watched player never came to the plate: either their team didn't
 * play (no games) or they were rostered for a completed game but didn't bat. A
 * player with a still-pending game (scheduled/live) hasn't "not appeared" yet.
 */
export function didNotAppear(report: PlayerReport): boolean {
  if (!report.found || report.games.length === 0) return true;
  return !report.games.some(
    (g) => g.plateAppearances.length > 0 || g.pitching || g.status.state !== 'final',
  );
}

/**
 * True once a player has actually batted — at least one plate appearance in
 * some game. This is what counts as "played": being rostered or in the lineup
 * for a scheduled/in-progress game doesn't count until they come to the plate.
 */
export function hasPlayed(report: PlayerReport): boolean {
  return report.games.some((g) => g.plateAppearances.length > 0 || g.pitching);
}

/**
 * Sort comparator putting a player's most recent game first: by date, then game
 * number within a day (so a doubleheader's game 2 leads game 1), with gamePk as
 * a last-resort tiebreak. gamePk alone is NOT reliable — a doubleheader's game 2
 * can carry a lower gamePk than game 1 — so gameNumber decides. gameNumber is
 * null only for older cached games, where it falls back to gamePk.
 */
export function mostRecentGameFirst(a: PlayerGame, b: PlayerGame): number {
  return (
    b.date.localeCompare(a.date) ||
    (b.gameNumber ?? 0) - (a.gameNumber ?? 0) ||
    b.gamePk - a.gamePk
  );
}

/** An integer as an English ordinal: 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th". */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  const suffix =
    rem100 >= 11 && rem100 <= 13
      ? 'th'
      : n % 10 === 1
        ? 'st'
        : n % 10 === 2
          ? 'nd'
          : n % 10 === 3
            ? 'rd'
            : 'th';
  return `${n}${suffix}`;
}

/**
 * The lineup indicator for a game. For a starter it's just their batting-order
 * number (with "Batting Nth" as the hover title); "Not in lineup" when the
 * lineup is out but they're not in it. Null when the lineup hasn't posted.
 */
export function lineupBadge(
  game: PlayerGame,
): { label: string; title: string; tone: 'in' | 'out' } | null {
  if (game.lineupStatus === 'starting') {
    return game.lineupSpot
      ? { label: String(game.lineupSpot), title: `Batting ${ordinal(game.lineupSpot)}`, tone: 'in' }
      : { label: 'Starting', title: 'Starting', tone: 'in' };
  }
  if (game.lineupStatus === 'bench') {
    return { label: 'Not in lineup', title: 'Not in lineup', tone: 'out' };
  }
  return null;
}

/**
 * The pip pinned to a headshot corner — a batting slot, a pitching role, or a
 * flag for a game the player is out of. Shared by the cards and the summary
 * table so the two read identically.
 */
export type CornerTone = 'in' | 'out' | 'postponed' | 'start' | 'relief';
export type Corner = { text: string; title: string; tone: CornerTone } | null;

/**
 * The five facts a corner pip is drawn from, named apart from the game they
 * usually arrive on.
 *
 * A watchlist view has a whole `PlayerGame` to read them off; the research
 * board and the details view have a `PlayerStatus`, which is these five and
 * nothing else precisely because they are all a pip needs. Pulling them out
 * keeps one definition of what "batting 3rd" and "SP" look like rather than a
 * second, drifting copy for the views with no report behind them.
 */
export interface CornerFacts {
  state: GameStatus['state'] | null;
  lineupStatus: 'starting' | 'bench' | null;
  lineupSpot: number | null;
  pitchingRole: 'starting' | 'relief' | null;
  entryInning: number | null;
}

function factsOfGame(game: PlayerGame): CornerFacts {
  return {
    state: game.status.state,
    lineupStatus: game.lineupStatus,
    lineupSpot: game.lineupSpot,
    pitchingRole: game.pitchingRole,
    entryInning: game.entryInning,
  };
}

/**
 * Corner badge for a player headshot: the batting-order number when the player is
 * in the lineup, an exclamation mark when a posted lineup left them out or the
 * game was postponed. Null when the lineup hasn't posted (or a starter has no
 * known spot) — nothing to show.
 */
export function battingCorner(f: CornerFacts): Corner {
  if (f.state === 'postponed') {
    return { text: '!', title: 'Postponed', tone: 'postponed' };
  }
  if (f.lineupStatus === 'bench') {
    return { text: '!', title: 'Not in lineup', tone: 'out' };
  }
  if (f.lineupStatus === 'starting' && f.lineupSpot) {
    return { text: String(f.lineupSpot), title: `Batting ${ordinal(f.lineupSpot)}`, tone: 'in' };
  }
  return null;
}

export function lineupCorner(game: PlayerGame): Corner {
  return battingCorner(factsOfGame(game));
}

/**
 * The pitching-role indicator for a game — the pitcher-side mirror of
 * lineupBadge. "SP" for the starter (announced before first pitch, confirmed by
 * the boxscore after), "RP 7th" for a reliever, naming the inning he came in.
 * Null when he hasn't pitched and isn't the posted probable.
 */
export function pitchingRoleBadge(
  f: CornerFacts,
): { label: string; title: string; tone: 'start' | 'relief' } | null {
  if (f.pitchingRole === 'starting') {
    return {
      label: 'SP',
      title: f.state === 'scheduled' ? 'Probable starting pitcher' : 'Started the game',
      tone: 'start',
    };
  }
  if (f.pitchingRole === 'relief') {
    return f.entryInning
      ? {
          label: `RP ${ordinal(f.entryInning)}`,
          title: `Relieved in the ${ordinal(f.entryInning)}`,
          tone: 'relief',
        }
      : { label: 'RP', title: 'Relief appearance', tone: 'relief' };
  }
  return null;
}

export function pitchingBadge(
  game: PlayerGame,
): { label: string; title: string; tone: 'start' | 'relief' } | null {
  return pitchingRoleBadge(factsOfGame(game));
}

/**
 * Corner badge for a pitcher headshot, the counterpart of battingCorner: "SP"
 * for a starter, the entry inning for a reliever (a bare number, like a batting
 * slot — the title spells it out), or an exclamation mark for a postponed game.
 */
export function pitcherCorner(f: CornerFacts): Corner {
  if (f.state === 'postponed') {
    return { text: '!', title: 'Postponed', tone: 'postponed' };
  }
  const badge = pitchingRoleBadge(f);
  if (!badge) return null;
  return {
    text: f.pitchingRole === 'relief' && f.entryInning ? String(f.entryInning) : 'SP',
    title: badge.title,
    tone: badge.tone,
  };
}

export function pitchingCorner(game: PlayerGame): Corner {
  return pitcherCorner(factsOfGame(game));
}

/**
 * The corner pip for a player with no report behind him — the research board
 * and the details view, which know a `PlayerStatus` and nothing else about his
 * day. Reads exactly as the watchlist's does, because it is the same two
 * functions: a batting slot for a hitter, "SP" or an entry inning for a
 * pitcher, "!" for a postponement or a lineup that left him out.
 */
export function statusCorner(status: PlayerStatus, kind: PlayerKind): Corner {
  const facts: CornerFacts = {
    state: status.gameState,
    lineupStatus: status.lineupStatus,
    lineupSpot: status.lineupSpot,
    pitchingRole: status.pitchingRole,
    entryInning: status.entryInning,
  };
  return kind === 'pitcher' ? pitcherCorner(facts) : battingCorner(facts);
}

/**
 * Is this player starting on `date` — in the posted lineup if he's a hitter,
 * the announced (or actual) starting pitcher if he isn't.
 *
 * The summary table's one filter reads this. It is deliberately drawn from the
 * player's own `PlayerGame` rather than from the league-wide `/api/statuses`
 * map: the summary is a read on the watchlist, so every row already carries the
 * report the pip on its headshot is drawn from, and a row marked "2" is exactly
 * a row this keeps. The board and the details view fetch that map because they
 * have *no* report — asking a hundred kilobytes of the whole league for the
 * twenty players already in hand would be a second source that could disagree
 * with the pip beside it.
 *
 * Reading a game rather than a report is what makes the date explicit, and it
 * has to be: a report spans the range in view, and "starting" said of a game
 * four days ago is a fact about a night that has already happened. A
 * doubleheader passes on either game — `some`, not the first one found.
 *
 * A postponed game is not a start. The lineup for one is posted and then means
 * nothing, which is exactly what the "!" pip on the headshot says.
 */
export function isStartingOn(report: PlayerReport, date: string): boolean {
  return report.games.some((g) => {
    if (g.date !== date || g.status.state === 'postponed') return false;
    return report.kind === 'pitcher'
      ? g.pitchingRole === 'starting'
      : g.lineupStatus === 'starting';
  });
}

/**
 * Label for a player with no batting to show. "No game" when their team wasn't
 * scheduled that day (no game to tie them to at all — getReport gives a rostered
 * player a placeholder for any game their team plays, so zero games means none
 * happened). When a game did happen: "Not in lineup" if a posted lineup left
 * them out (benched), otherwise the plain "Did not appear".
 */
export function absenceLabel(report: PlayerReport): string {
  if (report.games.length === 0) return 'No game';
  if (report.kind === 'pitcher') return 'Did not pitch';
  return report.games.some((g) => g.lineupStatus === 'bench')
    ? 'Not in lineup'
    : 'Did not appear';
}

/**
 * True when the player's team plays two (or more) games on a single date — a
 * doubleheader. Counts per date so a multi-day range with one game each day
 * doesn't read as a doubleheader.
 */
export function hasDoubleheader(games: PlayerGame[]): boolean {
  const byDate = new Map<string, number>();
  for (const g of games) byDate.set(g.date, (byDate.get(g.date) ?? 0) + 1);
  return [...byDate.values()].some((n) => n >= 2);
}

/** A watched player's current live role, for highlighting them in the UI. */
export type LiveRole = 'at-bat' | 'on-deck' | 'on-base' | 'pitching';

/**
 * The player's current live role: a watched pitcher on the mound ('pitching'),
 * else a batter at bat / on deck / on base (checked in that priority order).
 * Null otherwise.
 */
export function liveRole(report: PlayerReport): LiveRole | null {
  return liveRoleGame(report)?.role ?? null;
}

/** Short label for a live role, shown as a nav tag. */
export function liveRoleLabel(role: LiveRole): string {
  return role === 'at-bat'
    ? 'At bat'
    : role === 'on-deck'
      ? 'On deck'
      : role === 'on-base'
        ? 'On base'
        : 'Pitching';
}

/**
 * The player's current live role together with the live game it's happening in.
 * A pitcher is 'pitching' while he is still **in** the game; a batter is at bat
 * → on deck → on base. Used by the live feed's "Live" section.
 *
 * `inGamePitcherIds` rather than `pitchingId` is what "still pitching" means
 * here. `pitchingId` is the man on the mound in *this* half, which is nobody on
 * the resting side — so a starter dropped out of the Live section the moment his
 * own team came up to bat, and climbed back in an inning later, all game. He is
 * pitching until he is taken out, and the section should say so without
 * flickering; a pitcher who *has* been replaced falls out of it for good, which
 * is the half of the old behaviour that was right.
 */
export function liveRoleGame(
  report: PlayerReport,
): { role: LiveRole; game: PlayerGame } | null {
  for (const g of report.games) {
    if (g.status.state !== 'live') continue;
    if (report.kind === 'pitcher') {
      if (g.status.inGamePitcherIds.includes(report.id)) return { role: 'pitching', game: g };
      continue;
    }
    if (g.status.atBatId === report.id) return { role: 'at-bat', game: g };
    if (g.status.onDeckId === report.id) return { role: 'on-deck', game: g };
    if (g.status.onBaseIds.includes(report.id)) return { role: 'on-base', game: g };
  }
  return null;
}

/**
 * A single recency value (epoch ms) for an at-bat: the real per-play `timestamp`
 * when present (live and modern cached games carry it), else the game's day as a
 * stand-in so undated at-bats from older cached feeds still land on the right
 * date. Returning ONE value per at-bat — rather than switching keys per pair —
 * is what keeps the comparator a consistent total order.
 */
function atBatRecency(entry: { game: PlayerGame; pa: PlateAppearance }): number {
  if (entry.pa.timestamp) {
    const t = Date.parse(entry.pa.timestamp);
    if (!Number.isNaN(t)) return t;
  }
  // No per-play time: fall back to the end of the game's date, so it sorts onto
  // the correct day; within the day gameNumber/atBatNumber break the tie.
  const d = Date.parse(`${entry.game.date}T23:59:59Z`);
  return Number.isNaN(d) ? 0 : d;
}

/**
 * Comparator putting the most recent at-bat first, across every watched player's
 * games. Sorts by a single recency key (see `atBatRecency`) so it stays a valid
 * total order even when some at-bats have a timestamp and others don't — mixing
 * a timestamp comparison for some pairs with a game-order comparison for others
 * (the previous approach) is non-transitive and scrambles the whole list.
 */
export function mostRecentAtBatFirst(
  a: { game: PlayerGame; pa: PlateAppearance },
  b: { game: PlayerGame; pa: PlateAppearance },
): number {
  return (
    atBatRecency(b) - atBatRecency(a) ||
    (b.game.gameNumber ?? 0) - (a.game.gameNumber ?? 0) ||
    b.pa.atBatNumber - a.pa.atBatNumber ||
    // Final tiebreaker so undated at-bats (older cached games with no timestamp)
    // from different games on the same day still order deterministically.
    b.game.gamePk - a.game.gamePk
  );
}

/** Human description of a base state, for a diamond's aria-label/tooltip. */
export function basesLabel(b: BaseState): string {
  if (b.first && b.second && b.third) return 'Bases loaded';
  const on = [b.first && '1st', b.second && '2nd', b.third && '3rd'].filter(Boolean);
  if (on.length === 0) return 'Bases empty';
  return `Runner${on.length > 1 ? 's' : ''} on ${on.join(' and ')}`;
}

/**
 * A batter's line over the range in view: "4 G · .313/.389/.625". The card
 * header's line now, in place of the season one (".722 OPS, 11 HR, 30 RBI, 35
 * R, 1 SB"), which stated a different span from everything under it; the season
 * reads whole on the details view's Season tab, a tap away.
 *
 * The slash rather than the counting stats, because the counting line sits in
 * the same header a few centimetres to the right (`lineSummary` — "5-16, 3 R, 2
 * HR, 5 RBI") and the two halves of a slash line are the one thing it cannot
 * say. Its own OPS is left out for that same reason: the line beside it already
 * ends in one, and this is that number's two halves.
 */
export function rangeBattingSummary(line: BattingLine, games: number): string {
  const g = `${games} G`;
  // A range of nothing but walks has no at-bat to divide by, and the plate
  // appearances are then the whole of what happened.
  if (line.ab === 0) return `${g} · ${line.pa} PA`;
  // The OBP denominator is lineOps's — sacrifice flies aren't on the line, so
  // it runs a hair high when one happened.
  const obpDen = line.ab + line.bb + line.hbp;
  const obp = obpDen ? (line.hits + line.bb + line.hbp) / obpDen : 0;
  return `${g} · ${formatRate(line.hits / line.ab)}/${formatRate(obp)}/${formatRate(
    line.totalBases / line.ab,
  )}`;
}

export type RosterTone = 'il' | 'susp' | 'dtd' | 'minors' | 'other';

/**
 * Whether the player is on the active roster and can appear in a game today.
 * Anything that earns a status badge — an IL stint, a suspension, an option to
 * the minors, paternity leave — means he isn't, so nothing about him belongs in
 * a list of what's still to come.
 */
export function isOnActiveRoster(status: RosterStatus | null): boolean {
  return rosterStatusBadge(status) === null;
}

/**
 * Whether a pitcher works out of the rotation — a majority of his appearances
 * this season are starts. A starter takes the ball every fifth day, so his
 * team's other games are somebody else's; a reliever's could be any of them,
 * which is why the distinction is worth drawing at all. Nobody with no
 * appearances yet counts (a season-opening rotation is a guess from here).
 */
export function isRotationStarter(report: PlayerReport): boolean {
  const s = report.pitcherSeasonStats;
  if (!s || s.gamesPlayed === 0) return false;
  return s.gamesStarted * 2 >= s.gamesPlayed;
}

/**
 * A short card badge for a roster status that keeps a player off the field —
 * an IL stint, suspension, or option to the minors. Returns null when the
 * player is active (or status is unknown), since an active player needs no
 * badge. `tone` drives the badge color; `title` is the API's full description.
 */
/**
 * Short codes for the statuses that have no natural abbreviation, keyed by
 * MLB's own status code. The badge on a headshot has about four characters of
 * room, so "Designated for Assignment" has to become something, and the
 * something is worth writing down once rather than deriving: initials give
 * `DFA` here but `RA` for "Rehab Assignment" only by luck, and `MLC` for
 * "Minor League Contract" where the useful word is that he is in the minors.
 */
const SHORT_BY_CODE: Record<string, string> = {
  RA: 'RA', // Rehab assignment — an IL stint with minor-league games attached.
  SU: 'SUS',
  RM: 'MIN',
  MIN: 'MIN', // "Minor League Contract" — the same fact as RM for our purposes.
  TR: 'TR',
  RL: 'REL',
  CL: 'CL',
  DES: 'DFA',
  FA: 'FA',
  RES: 'RES',
  BRV: 'BRV',
  PL: 'PAT',
  NRI: 'NRI',
};

/** Last resort for a code the table above hasn't got: the code itself if it is
 *  already badge-sized, else the description's initials (so an unmapped
 *  "Temporarily Inactive" reads `TI` rather than being blank or overflowing). */
function fallbackShort(code: string, description: string): string {
  if (code && code.length <= 4) return code.toUpperCase();
  const initials = description
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .map((w) => w[0].toUpperCase())
    .join('');
  return initials.slice(0, 4) || '•';
}

export function rosterStatusBadge(
  status: RosterStatus | null,
): { label: string; short: string; title: string; tone: RosterTone } | null {
  if (!status) return null;
  const { code, description } = status;
  // Active (and the on-roster non-states) need no badge.
  if (code === 'A' || code === 'RM0' || description === 'Active') return null;
  // Injured 10/15/60-Day → "IL" with the day count when the label carries one.
  if (/^D\d/.test(code) || description.startsWith('Injured')) {
    const days = description.match(/(\d+)-Day/)?.[1];
    return {
      label: days ? `${days}-day IL` : 'IL',
      // `IL10` rather than `10-day IL`: on a headshot the number is what
      // distinguishes one stint from another, and the word is what doesn't fit.
      short: days ? `IL${days}` : 'IL',
      title: description,
      tone: 'il',
    };
  }
  if (code === 'SU' || description.startsWith('Suspended')) {
    return { label: 'Suspended', short: 'SUS', title: description, tone: 'susp' };
  }
  if (code === 'RM' || description.includes('Minors')) {
    return { label: 'Minors', short: 'MIN', title: description, tone: 'minors' };
  }
  // Anything else (DFA, restricted, paternity, not-yet-reported, ...) shows the
  // API's own description, trimmed of the "# days" placeholder some carry.
  return {
    label: description.replace(/\s*#\s*days?$/i, ''),
    short: SHORT_BY_CODE[code] ?? fallbackShort(code, description),
    title: description,
    tone: 'other',
  };
}

/**
 * Whether the player is on the injured list. The summary table and the players
 * view both offer to drop these rows (the settings menu's "Hide injured"), and
 * neither does so unasked — a line of dashes beside the badge is a fair answer
 * to "is he playing?", and hiding him says nothing at all. Narrower than
 * "has a status badge at all", on purpose: a suspension or an option to the
 * minors is a few days and can end with a recall mid-day, an IL stint is weeks
 * — only the latter is worth a standing filter.
 */
export function isInjured(status: RosterStatus | null): boolean {
  if (!status) return false;
  // A rehab assignment is an IL stint with minor-league games attached: he's
  // still on the IL and still can't turn up in a box score. Its code ('RA')
  // isn't a D-code, so the badge files it under "other" — but for the purpose
  // of hiding a player who won't play, it's the same thing.
  if (status.code === 'RA' || /rehab/i.test(status.description)) return true;
  return rosterStatusBadge(status)?.tone === 'il';
}

/**
 * ESPN's injury designation as a badge, the counterpart to `rosterStatusBadge`
 * for the one thing MLB's roster status cannot say.
 *
 * **Day-to-day and out exist nowhere else in the app.** MLB publishes a roster
 * status, and a day-to-day player is still on the active roster — checked
 * league-wide, its vocabulary is `Active`, the 10/15/60-day IL stints, minors,
 * traded, released, claimed, DFA, free agent and suspended, and nothing in it
 * marks a man who is playing hurt or sitting tonight. ESPN's league roster
 * carries both, so they arrive with the fantasy slot and share its limits: a
 * connected league, and the views reading that roster.
 *
 * The IL codes are here for completeness rather than for display — where ESPN
 * says `TEN_DAY_DL`, MLB has already said `10-day IL`, which is the better
 * label of the two because it is the one the rest of the app uses. The summary
 * table shows this only where MLB's own badge is absent, so the two never state
 * one absence twice.
 */
export function espnInjuryBadge(
  status: string | null | undefined,
): { label: string; short: string; title: string; tone: RosterTone } | null {
  if (!status || status === 'ACTIVE') return null;
  if (status === 'DAY_TO_DAY') {
    return { label: 'DTD', short: 'DTD', title: 'Day-to-day (ESPN)', tone: 'dtd' };
  }
  if (status === 'OUT') {
    return { label: 'OUT', short: 'OUT', title: 'Out (ESPN)', tone: 'il' };
  }
  // TEN_DAY_DL -> "10-day IL", matching what MLB's own badge would have said.
  const dl = status.match(/^(SEVEN|TEN|FIFTEEN|SIXTY)_DAY_DL$/);
  if (dl) {
    const days = { SEVEN: 7, TEN: 10, FIFTEEN: 15, SIXTY: 60 }[dl[1] as
      'SEVEN' | 'TEN' | 'FIFTEEN' | 'SIXTY'];
    return {
      label: `${days}-day IL`,
      short: `IL${days}`,
      title: `${days}-day IL (ESPN)`,
      tone: 'il',
    };
  }
  if (status === 'SUSPENSION') {
    return { label: 'Suspended', short: 'SUS', title: 'Suspended (ESPN)', tone: 'susp' };
  }
  // Anything ESPN adds later reads as itself — "NON_ROSTER" -> "Non roster",
  // short `NR` — rather than vanishing, which is the safe direction to fail in.
  const label = status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const short = status.split('_').map((w) => w[0]).join('').slice(0, 4);
  return { label, short, title: `${label} (ESPN)`, tone: 'other' };
}

/** Exit velo · launch angle · distance for a batted ball, if any was tracked.
 * Takes the batted-ball fields rather than a whole plate appearance, so the
 * pitcher's side reads the same line off a `FacedBatter` — the two carry the
 * same three fields and should say the same thing about the same contact. */
export function contactHighlight(
  hit: Pick<PlateAppearance, 'launchSpeed' | 'launchAngle' | 'hitDistance'>,
): string | null {
  if (hit.launchSpeed === null) return null;
  const bits: string[] = [`${hit.launchSpeed.toFixed(1)} mph`];
  if (hit.launchAngle !== null) bits.push(`${hit.launchAngle}°`);
  if (hit.hitDistance !== null && hit.hitDistance > 0) bits.push(`${hit.hitDistance} ft`);
  return bits.join(' · ');
}

/** Bat speed on the PA's final, decisive swing (if tracked), for a one-line summary. */
export function finalSwingBatSpeed(pa: PlateAppearance): number | null {
  const last = pa.pitches[pa.pitches.length - 1];
  if (!last || !isSwing(last.description) || last.batSpeed === null) return null;
  return last.batSpeed;
}
