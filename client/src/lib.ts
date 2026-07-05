import type { BattingLine, PlateAppearance } from './types';

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
  return [parts[0], ...extras].join(', ');
}

/** Did the player have a notable day worth a highlight glow? */
export function isBigDay(line: BattingLine): boolean {
  return line.hr > 0 || line.hits >= 3 || line.totalBases >= 5;
}

export function fmt(n: number | null, digits = 0, suffix = ''): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n.toFixed(digits)}${suffix}`;
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

export function describePitch(description: string): string {
  return description.replace(/_/g, ' ');
}

/** Best xwOBA / batted-ball highlight for a PA, if any. */
export function contactHighlight(pa: PlateAppearance): string | null {
  if (pa.launchSpeed === null) return null;
  const bits: string[] = [`${pa.launchSpeed.toFixed(1)} mph`];
  if (pa.launchAngle !== null) bits.push(`${pa.launchAngle}°`);
  if (pa.hitDistance !== null && pa.hitDistance > 0) bits.push(`${pa.hitDistance} ft`);
  return bits.join(' · ');
}
