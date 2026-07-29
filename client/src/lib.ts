import type {
  BaseState,
  BattingLine,
  PitcherSeasonStats,
  PitchingLine,
  PlateAppearance,
  PlayerGame,
  PlayerReport,
  RosterStatus,
  SeasonStats,
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

/** A compact pitcher season summary for the card header. */
export function pitcherSeasonSummary(s: PitcherSeasonStats): string {
  const parts = [`${s.era} ERA`, `${s.whip} WHIP`];
  if (s.strikeoutsPer9 && s.strikeoutsPer9 !== '—') parts.push(`${s.strikeoutsPer9} K/9`);
  return parts.join(', ');
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
 * Corner badge for a player headshot: the batting-order number when the player is
 * in the lineup, an exclamation mark when a posted lineup left them out or the
 * game was postponed. Null when the lineup hasn't posted (or a starter has no
 * known spot) — nothing to show.
 */
export function lineupCorner(
  game: PlayerGame,
): { text: string; title: string; tone: 'in' | 'out' | 'postponed' } | null {
  if (game.status.state === 'postponed') {
    return { text: '!', title: 'Postponed', tone: 'postponed' };
  }
  if (game.lineupStatus === 'bench') {
    return { text: '!', title: 'Not in lineup', tone: 'out' };
  }
  if (game.lineupStatus === 'starting' && game.lineupSpot) {
    return { text: String(game.lineupSpot), title: `Batting ${ordinal(game.lineupSpot)}`, tone: 'in' };
  }
  return null;
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
 * A pitcher is 'pitching' when they're the game's current pitcher; a batter is
 * at bat → on deck → on base. Used by the live feed's "Live" section.
 */
export function liveRoleGame(
  report: PlayerReport,
): { role: LiveRole; game: PlayerGame } | null {
  for (const g of report.games) {
    if (g.status.state !== 'live') continue;
    if (report.kind === 'pitcher') {
      if (g.status.pitchingId === report.id) return { role: 'pitching', game: g };
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
 * Compact season line for the card header, e.g.
 * ".722 OPS, 11 HR, 30 RBI, 35 R, 1 SB". Commas separate the groups.
 */
export function seasonStatsSummary(s: SeasonStats): string {
  return `${s.ops} OPS, ${s.hr} HR, ${s.rbi} RBI, ${s.runs} R, ${s.sb} SB`;
}

export type RosterTone = 'il' | 'susp' | 'minors' | 'other';

/**
 * A short card badge for a roster status that keeps a player off the field —
 * an IL stint, suspension, or option to the minors. Returns null when the
 * player is active (or status is unknown), since an active player needs no
 * badge. `tone` drives the badge color; `title` is the API's full description.
 */
export function rosterStatusBadge(
  status: RosterStatus | null,
): { label: string; title: string; tone: RosterTone } | null {
  if (!status) return null;
  const { code, description } = status;
  // Active (and the on-roster non-states) need no badge.
  if (code === 'A' || code === 'RM0' || description === 'Active') return null;
  // Injured 10/15/60-Day → "IL" with the day count when the label carries one.
  if (/^D\d/.test(code) || description.startsWith('Injured')) {
    const days = description.match(/(\d+)-Day/)?.[1];
    return { label: days ? `${days}-day IL` : 'IL', title: description, tone: 'il' };
  }
  if (code === 'SU' || description.startsWith('Suspended')) {
    return { label: 'Suspended', title: description, tone: 'susp' };
  }
  if (code === 'RM' || description.includes('Minors')) {
    return { label: 'Minors', title: description, tone: 'minors' };
  }
  // Anything else (DFA, restricted, paternity, not-yet-reported, ...) shows the
  // API's own description, trimmed of the "# days" placeholder some carry.
  return { label: description.replace(/\s*#\s*days?$/i, ''), title: description, tone: 'other' };
}

/** Best xwOBA / batted-ball highlight for a PA, if any. */
export function contactHighlight(pa: PlateAppearance): string | null {
  if (pa.launchSpeed === null) return null;
  const bits: string[] = [`${pa.launchSpeed.toFixed(1)} mph`];
  if (pa.launchAngle !== null) bits.push(`${pa.launchAngle}°`);
  if (pa.hitDistance !== null && pa.hitDistance > 0) bits.push(`${pa.hitDistance} ft`);
  return bits.join(' · ');
}

/** Bat speed on the PA's final, decisive swing (if tracked), for a one-line summary. */
export function finalSwingBatSpeed(pa: PlateAppearance): number | null {
  const last = pa.pitches[pa.pitches.length - 1];
  if (!last || !isSwing(last.description) || last.batSpeed === null) return null;
  return last.batSpeed;
}
