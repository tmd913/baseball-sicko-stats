// ---- Pitch-level Statcast model -------------------------------------------

/** Which bases are occupied (used per plate appearance and for a live game). */
export interface BaseState {
  first: boolean;
  second: boolean;
  third: boolean;
}

/** A single pitch within a plate appearance. */
export interface Pitch {
  pitchNumber: number;
  pitchType: string | null; // e.g. "4-Seam Fastball", "Slider"
  releaseSpeed: number | null; // mph
  spinRate: number | null;
  description: string; // ball, called_strike, swinging_strike, foul, hit_into_play, ...
  balls: number | null;
  strikes: number | null;
  plateX: number | null; // horizontal location at plate (ft, catcher's view)
  plateZ: number | null; // vertical location at plate (ft)
  szTop: number | null;
  szBot: number | null;
  zone: number | null;
  // Contact metrics (present when this pitch was put in play or fouled off)
  launchSpeed: number | null;
  launchAngle: number | null;
  hitDistance: number | null;
  bbType: string | null; // ground_ball, line_drive, fly_ball, popup
  batSpeed: number | null;
  swingLength: number | null;
}

/** One plate appearance: a sequence of pitches ending in an outcome. */
export interface PlateAppearance {
  atBatNumber: number;
  inning: number;
  half: string; // "Top" | "Bot"
  // ISO time the PA ended (or, for the in-progress at-bat, when it began) — the
  // recency sort key for the live feed. Null for older cached feeds without it.
  timestamp: string | null;
  outsWhenUp: number | null;
  onBase: BaseState; // runners on base when the batter stepped up
  stand: string | null; // batter handedness L/R
  pThrows: string | null; // pitcher handedness L/R
  pitcherId: number | null;
  pitcherName: string | null; // pitcher faced in this PA
  event: string | null; // single, home_run, strikeout, walk, field_out, ...
  description: string; // human-readable play description (des)
  rbi: number; // runs batted in on this PA (official scoring)
  playId: string | null; // Statcast video id (present when ball in play)
  // Final batted-ball summary (when contact was made)
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
  hardHits: number; // batted balls >= 95 mph
  runValue: number | null; // sum of delta_run_exp
}

/** Where a game is in its lifecycle, with score/inning (live) or start time (scheduled). */
export interface GameStatus {
  state: 'scheduled' | 'live' | 'final';
  detailedState: string; // MLB's label, e.g. "Warmup", "In Progress", "Final"
  startTime: string | null; // ISO datetime of first pitch (for scheduled games)
  homeScore: number | null;
  awayScore: number | null;
  currentInning: number | null;
  inningState: string | null; // "Top" | "Middle" | "Bottom" | "End"
  isTopInning: boolean | null;
  bases: BaseState | null; // current runners on base (live games only)
  outs: number | null; // current outs (live games only)
  // Live batting-team situation, for highlighting a watched player's current
  // role. All null/empty unless the game is in progress.
  atBatId: number | null;
  onDeckId: number | null;
  onBaseIds: number[]; // player ids currently on base
  pitchingId: number | null; // the pitcher currently on the mound (live only)
}

/** A game's announced/probable starting pitcher (used before first pitch). */
export interface ProbablePitcher {
  id: number;
  name: string;
  hand: string | null; // "L" | "R"
}

/** A base-running event (stolen base or run scored) for the feed's stream. */
export interface BaseEvent {
  kind: 'sb' | 'run';
  inning: number;
  half: string; // "Top" | "Bot"
  timestamp: string | null;
  base: string | null; // stolen-base target ("2nd"/"3rd"/"home"); null for a run
}

// ---- Pitcher model ---------------------------------------------------------

/** One batter a pitcher faced — the RESULT of the PA only (no pitch-by-pitch
 * detail), framed from the pitcher's side (the batter is named). */
export interface FacedBatter {
  batterId: number;
  batterName: string;
  stand: string | null; // batter handedness L/R
  inning: number;
  half: string; // "Top" | "Bot"
  outsWhenUp: number | null;
  onBase: BaseState;
  event: string | null; // strikeout, single, walk, field_out, ...
  description: string;
  rbi: number;
  // Runs that scored on this play, and how many were earned — per-inning R/ER.
  runs: number;
  earnedRuns: number;
  timestamp: string | null;
  playId: string | null;
  launchSpeed: number | null;
  hitDistance: number | null;
  xwoba: number | null;
  // The pitch-by-pitch sequence the pitcher threw in this PA (in order).
  pitches: Pitch[];
}

/** A pitcher's per-game counting line (authoritative, from the boxscore). `outs`
 * is the aggregation-safe innings field; IP is formatted for display. */
export interface PitchingLine {
  outs: number; // innings pitched × 3
  hits: number;
  runs: number;
  earnedRuns: number;
  walks: number;
  strikeouts: number;
  hr: number;
  battersFaced: number;
  pitchesThrown: number;
  strikes: number;
  balls: number;
}

/** One pitch type in a pitcher's game arsenal, with the game averages and the
 * season / league baselines that power the comparison arrows. */
export interface PitchMix {
  pitchType: string; // "4-Seam Fastball", "Slider", ...
  count: number;
  share: number; // fraction of the game's pitches (0-1)
  whiffRate: number | null; // whiffs / swings on this pitch type
  avgVelo: number | null;
  avgSpin: number | null;
  hBreak: number | null; // horizontal break, inches
  vBreak: number | null; // induced vertical break, inches
  seasonVelo: number | null;
  seasonSpin: number | null;
  seasonHBreak: number | null;
  seasonVBreak: number | null;
  leagueVelo: number | null;
  leagueSpin: number | null;
  leagueHBreak: number | null;
  leagueVBreak: number | null;
  // Season outcomes this pitch type produced (Baseball Savant "Results" columns).
  seasonPa: number | null; // sample size (PA that ended on this pitch)
  seasonBa: number | null; // batting average against
  seasonSlg: number | null; // slugging against
  seasonWoba: number | null; // wOBA against
  seasonXwoba: number | null; // expected wOBA against
  seasonWhiff: number | null; // whiffs / swings (0-1)
  seasonPutAway: number | null; // 2-strike strikeouts / 2-strike pitches (0-1)
}

/** A pitcher's game: the counting line, batters faced (result-only), and the
 * pitch-type arsenal with rate aggregates. */
export interface PitcherGame {
  line: PitchingLine;
  facedBatters: FacedBatter[];
  pitchMix: PitchMix[];
  whiffRate: number | null; // whiffs / swings, overall
  cswRate: number | null; // (called strikes + whiffs) / pitches
  strikePct: number | null; // strikes / pitches
  isStart: boolean;
  decision: 'W' | 'L' | 'S' | null; // this pitcher's W/L/S in the game
}

/** A pitcher's season line (and platoon splits vs L/R), for the card header. */
export interface PitcherSeasonStats {
  gamesPlayed: number;
  gamesStarted: number;
  battersFaced: number; // sample size (esp. for splits)
  inningsPitched: string; // "84.1"
  era: string;
  whip: string;
  strikeOuts: number;
  baseOnBalls: number;
  hits: number;
  homeRuns: number;
  strikeoutsPer9: string;
  walksPer9: string;
  kRate: string; // K / batters faced, ".291"
  bbRate: string;
  avgAgainst: string; // batting average against, ".221"
}

export interface PlayerGame {
  gamePk: number;
  // 1 for a single game; 1 or 2 for the halves of a doubleheader. Games are
  // ordered by this (then gamePk), since gamePk isn't reliably ordered by game
  // number. Null for older cached games from before this was captured.
  gameNumber: number | null;
  date: string;
  homeTeam: string;
  awayTeam: string;
  batterTeam: string;
  opponent: string;
  isHome: boolean;
  stand: string | null;
  status: GameStatus;
  // Where the batter sits in this game's lineup, once it's been posted:
  // 'starting' (in the announced starting nine), 'bench' (on the roster but not
  // a starter), or null when the lineup isn't out yet / isn't known.
  lineupStatus: 'starting' | 'bench' | null;
  // Batting-order slot (1-9) when starting; null otherwise.
  lineupSpot: number | null;
  // The opposing probable starter — the pitcher this batter is scheduled to
  // face. Meaningful before the game starts; null once real matchups exist.
  probablePitcher: ProbablePitcher | null;
  plateAppearances: PlateAppearance[];
  // Stolen bases + runs scored by this player in the game, in play order — the
  // feed interleaves them chronologically with at-bats.
  baseEvents: BaseEvent[];
  line: BattingLine;
  // For a watched pitcher, the pitcher's-eye view of this game; null for batters.
  pitching: PitcherGame | null;
}

/** A player saved on the user's watchlist. */
export interface WatchPlayer {
  id: number;
  savantName: string; // "Last, First"
  name: string; // "First Last"
  kind: 'batter' | 'pitcher';
}

/** A player's batting line — full-season, or a platoon split (vs L/R pitching). */
export interface SeasonStats {
  gamesPlayed: number;
  pa: number; // plate appearances (sample size, esp. for splits)
  avg: string; // ".237" (string to preserve the leading-dot baseball format)
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

/** A player's current roster status, from their team's 40-man roster. */
export interface RosterStatus {
  code: string; // MLB status code, e.g. "A", "D10", "SU", "RM"
  description: string; // human label, e.g. "Active", "Injured 10-Day", "Suspended # days"
}

/** A player as returned in the day's report. */
export interface PlayerReport extends WatchPlayer {
  found: boolean;
  games: PlayerGame[];
  seasonStats: SeasonStats | null;
  // The pitcher's season line (null for batters; parallel to seasonStats).
  pitcherSeasonStats: PitcherSeasonStats | null;
  // Platoon splits for the season, shown when the player faces a same-handed
  // probable starter in a not-yet-started game.
  splitVsLeft: SeasonStats | null; // vs LHP
  splitVsRight: SeasonStats | null; // vs RHP
  // Current roster status (IL, suspended, optioned, ...) when the player isn't
  // plainly active — explains a card whose games come only from the team's
  // schedule (the player is off the active roster). Null when active/unknown.
  rosterStatus: RosterStatus | null;
}

/** A rostered player for the season, used for search/autocomplete. */
export interface SeasonPlayer extends WatchPlayer {
  team: string;
  position: string;
}

// ---- Statcast percentile rankings -----------------------------------------

/** One metric in the Savant-style percentile chart (e.g. xwOBA at the 99th pct). */
export interface PercentileMetric {
  key: string;
  label: string;
  percentile: number | null; // 0-100 league rank; null when the player has no data
  value: string | null; // the raw stat, pre-formatted for display (".415", "94.1")
  // True when the percentile was estimated from the league mean/stddev (Savant
  // has no exact rank for this player, e.g. a part-season bat-tracking metric)
  // rather than read from a `percent_rank_` field. Approximate to a few points.
  estimated?: boolean;
}

/** A labeled group of metrics (Value, Batting, Running, Fielding). */
export interface PercentileSection {
  title: string;
  metrics: PercentileMetric[];
}

/** A player's full percentile-ranking card for one season, scraped from Savant. */
export interface PlayerPercentiles {
  playerId: number;
  year: number;
  sections: PercentileSection[];
  updatedAt: string; // ISO timestamp of when the data was fetched
}

/** One plate appearance in a season xwOBA series (Savant estimated wOBA). */
export interface XwobaPa {
  date: string; // game date, YYYY-MM-DD
  xwoba: number; // this PA's xwOBA contribution
}

/** A player's season sequence of per-PA xwOBA, for the rolling-xwOBA chart. */
export interface XwobaSeries {
  season: number;
  seasonXwoba: number; // the player's season average, shown as caption text
  leagueXwoba: number; // MLB league average, drawn as the reference line
  pas: XwobaPa[]; // in play order
}
