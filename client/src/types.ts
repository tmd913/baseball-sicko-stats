export interface Pitch {
  pitchNumber: number;
  pitchType: string | null;
  releaseSpeed: number | null;
  spinRate: number | null;
  description: string;
  balls: number | null;
  strikes: number | null;
  plateX: number | null;
  plateZ: number | null;
  szTop: number | null;
  szBot: number | null;
  zone: number | null;
  launchSpeed: number | null;
  launchAngle: number | null;
  hitDistance: number | null;
  bbType: string | null;
  batSpeed: number | null;
  swingLength: number | null;
}

export interface PlateAppearance {
  atBatNumber: number;
  inning: number;
  half: string;
  outsWhenUp: number | null;
  stand: string | null;
  pThrows: string | null;
  event: string | null;
  description: string;
  rbi: number;
  launchSpeed: number | null;
  launchAngle: number | null;
  hitDistance: number | null;
  bbType: string | null;
  xba: number | null;
  xwoba: number | null;
  deltaRunExp: number | null;
  deltaWinExp: number | null;
  pitches: Pitch[];
}

export interface BattingLine {
  pa: number;
  ab: number;
  hits: number;
  singles: number;
  doubles: number;
  triples: number;
  hr: number;
  bb: number;
  so: number;
  hbp: number;
  runs: number;
  rbi: number;
  sb: number;
  cs: number;
  totalBases: number;
  avgExitVelo: number | null;
  maxExitVelo: number | null;
  maxDistance: number | null;
  hardHits: number;
  runValue: number | null;
}

export interface PlayerGame {
  gamePk: number;
  date: string;
  homeTeam: string;
  awayTeam: string;
  batterTeam: string;
  opponent: string;
  isHome: boolean;
  stand: string | null;
  plateAppearances: PlateAppearance[];
  line: BattingLine;
}

export interface WatchPlayer {
  id: number;
  savantName: string;
  name: string;
}

export interface PlayerReport extends WatchPlayer {
  found: boolean;
  games: PlayerGame[];
}

export interface RosterEntry extends WatchPlayer {
  team: string;
  opponent: string;
  pa: number;
}
