export interface BaseState {
  first: boolean;
  second: boolean;
  third: boolean;
}

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
  onBase: BaseState;
  stand: string | null;
  pThrows: string | null;
  pitcherId: number | null;
  pitcherName: string | null;
  event: string | null;
  description: string;
  rbi: number;
  playId: string | null;
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

export interface GameStatus {
  state: 'scheduled' | 'live' | 'final';
  detailedState: string;
  startTime: string | null;
  homeScore: number | null;
  awayScore: number | null;
  currentInning: number | null;
  inningState: string | null;
  isTopInning: boolean | null;
  bases: BaseState | null;
  outs: number | null;
  atBatId: number | null;
  onDeckId: number | null;
  onBaseIds: number[];
}

export interface ProbablePitcher {
  id: number;
  name: string;
  hand: string | null;
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
  status: GameStatus;
  lineupStatus: 'starting' | 'bench' | null;
  probablePitcher: ProbablePitcher | null;
  plateAppearances: PlateAppearance[];
  line: BattingLine;
}

export interface WatchPlayer {
  id: number;
  savantName: string;
  name: string;
}

export interface SeasonStats {
  gamesPlayed: number;
  pa: number;
  avg: string;
  obp: string;
  slg: string;
  ops: string;
  hr: number;
  rbi: number;
  hits: number;
  atBats: number;
  runs: number;
  sb: number;
}

export interface RosterStatus {
  code: string;
  description: string;
}

export interface PlayerReport extends WatchPlayer {
  found: boolean;
  games: PlayerGame[];
  seasonStats: SeasonStats | null;
  splitVsLeft: SeasonStats | null;
  splitVsRight: SeasonStats | null;
  rosterStatus: RosterStatus | null;
}

export interface SeasonPlayer extends WatchPlayer {
  team: string;
  position: string;
}

// ---- Statcast percentile rankings -----------------------------------------

export interface PercentileMetric {
  key: string;
  label: string;
  percentile: number | null; // 0-100 league rank; null when the player has no data
  value: string | null; // the raw stat, pre-formatted for display (".415", "94.1")
  estimated?: boolean; // percentile estimated from the league mean/stddev, not an exact rank
}

export interface PercentileSection {
  title: string;
  metrics: PercentileMetric[];
}

export interface PlayerPercentiles {
  playerId: number;
  year: number;
  sections: PercentileSection[];
  updatedAt: string;
}
