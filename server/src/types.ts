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
  state: 'scheduled' | 'live' | 'final' | 'postponed';
  detailedState: string; // MLB's label, e.g. "Warmup", "In Progress", "Final", "Postponed"
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
  launchAngle: number | null;
  hitDistance: number | null;
  bbType: string | null; // ground_ball, line_drive, fly_ball, popup
  xwoba: number | null;
  // The pitch-by-pitch sequence the pitcher threw in this PA (in order).
  pitches: Pitch[];
}

/** A win, loss, save or hold — what a pitcher took away from an outing. */
export type PitchingCredit = 'W' | 'L' | 'S' | 'H';

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
  doubles: number;
  triples: number;
  hitBatsmen: number;
  atBats: number; // batters faced minus walks/HBP/sacs — the denominator for BAA
  intentionalWalks: number; // a subset of `walks`
  wildPitches: number;
  inheritedRunners: number;
  inheritedRunnersScored: number;
  // The game's official credits, from the boxscore — 0 or 1 each per game, and
  // summed over a range by combinePitchingLines. A win/save agrees with
  // `PitcherGame.decision`; a hold has no equivalent there (liveData.decisions
  // only names the W/L/S pitchers).
  wins: number;
  saves: number;
  holds: number;
}

/** One pitch type in a pitcher's game arsenal, with the game averages and the
 * season / league baselines that power the comparison arrows. */
export interface PitchMix {
  pitchType: string; // "4-Seam Fastball", "Slider", ...
  count: number;
  strikes: number; // pitches of this type not ruled a ball (balls = count - strikes)
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

/**
 * One game's work against a single batter handedness. Derived from the plays,
 * not the boxscore (which doesn't split) — so `line.outs` is 0 and the counting
 * stats are per batter faced. Everything else aggregates the same way as the
 * whole outing.
 */
export interface PitcherSplit {
  line: PitchingLine;
  pitchMix: PitchMix[];
  whiffRate: number | null;
  cswRate: number | null;
  strikePct: number | null;
}

/** A pitcher's game: the counting line, batters faced (result-only), and the
 * pitch-type arsenal with rate aggregates. */
export interface PitcherGame {
  line: PitchingLine;
  facedBatters: FacedBatter[];
  // The same view restricted to right- / left-handed batters. Null when he
  // faced nobody of that hand.
  vsRight: PitcherSplit | null;
  vsLeft: PitcherSplit | null;
  pitchMix: PitchMix[];
  whiffRate: number | null; // whiffs / swings, overall
  cswRate: number | null; // (called strikes + whiffs) / pitches
  strikePct: number | null; // strikes / pitches
  isStart: boolean;
  // What he came away with: the official W/L/S, or a hold — which `decisions`
  // never names, so it comes off his boxscore line instead.
  decision: PitchingCredit | null;
}

/**
 * One pitch type in a pitcher's **season** arsenal — what the details view's
 * Arsenal tab renders. The per-game `PitchMix` is the same idea for one outing;
 * here the pitcher's own season is the value and the league is the baseline
 * (rather than the game being the value and his season the baseline).
 */
export interface SeasonArsenalPitch {
  pitchType: string;
  count: number; // pitches thrown this season
  strikes: number; // of those, the ones not ruled a ball (balls = count - strikes)
  share: number; // fraction of his season's pitches (0-1)
  velo: number | null;
  spin: number | null;
  hBreak: number | null; // horizontal break, inches
  vBreak: number | null; // induced vertical break, inches
  leagueVelo: number | null;
  leagueSpin: number | null;
  leagueHBreak: number | null; // oriented to his own break direction
  leagueVBreak: number | null;
  // Season outcomes against this pitch (Savant's "Results" columns).
  pa: number | null;
  ba: number | null;
  slg: number | null;
  woba: number | null;
  xwoba: number | null;
  whiff: number | null;
  putAway: number | null;
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
  hitBatsmen: number;
  homeRunsPer9: string;
  // ERA-scale estimators (leagueRates.ts). FIP is the pitcher's own three true
  // outcomes; xFIP swaps his home runs for his fly balls at the league HR/FB
  // rate, so it needs the Savant season CSV and is filled in getReport — null
  // for a split, and until that fetch lands.
  fip: string | null;
  xfip: string | null;
  // Statcast's contact-quality ERA estimator, scraped whole-league from Savant
  // (`expectedStats.ts`) rather than computed. Filled in getReport beside xFIP,
  // and null for a split — the leaderboard doesn't split.
  xera: string | null;
}

/**
 * Where a team places among all 30 in each category — 1 is always the **best
 * offence**, so a low strikeout rate ranks 1st, not 30th. Computed here rather
 * than read off the API, which ranks by its own default sort and doesn't rank
 * splits at all. Null where the category has no value (a split has no runs).
 */
export interface TeamHittingRanks {
  runsPerGame: number | null;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  homeRuns: number | null;
  stolenBases: number | null;
  kRate: number | null;
  bbRate: number | null;
}

/** One batting line for a team — the whole season, or against one pitcher hand. */
export interface TeamHittingLine {
  pa: number;
  games: number;
  runs: number;
  runsPerGame: string | null; // null on a split, which carries no runs
  avg: string;
  obp: string;
  slg: string;
  ops: string;
  homeRuns: number;
  strikeOuts: number;
  baseOnBalls: number;
  stolenBases: number;
  kRate: string; // K / PA, ".231"
  bbRate: string;
  ranks: TeamHittingRanks | null;
}

/**
 * How a team has hit this season, whole and by the pitcher's hand — the lineup
 * a watched pitcher is about to face (or just did). `vsLeft` / `vsRight` are
 * their lines against left- and right-handed *pitching*.
 */
export interface TeamHitting {
  teamId: number;
  season: TeamHittingLine;
  vsLeft: TeamHittingLine | null;
  vsRight: TeamHittingLine | null;
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
  // The pitcher-side mirror of lineupStatus (always null for a batter's game):
  // 'starting' once he's the announced probable or has actually taken the ball
  // to open the game, 'relief' once he's come out of the bullpen. Null when he
  // hasn't pitched and isn't the posted probable.
  pitchingRole: 'starting' | 'relief' | null;
  // The inning a reliever entered in. Null for a starter (it's the 1st by
  // definition) and before he appears.
  entryInning: number | null;
  // The opposing team's MLB id, and — for a watched pitcher's game — how that
  // lineup has hit this season. It's the "who is he facing" half of an outing,
  // and null for a batter's game (his own line already says how it went).
  opponentId: number | null;
  opponentHitting: TeamHitting | null;
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
/** Batter or pitcher. A two-way player can be watched as both, so this is half
 * of a watchlist entry's identity — the MLB id alone isn't unique. */
export type PlayerKind = 'batter' | 'pitcher';

export interface WatchPlayer {
  id: number;
  savantName: string; // "Last, First"
  name: string; // "First Last"
  kind: PlayerKind;
}

/** The identity of a watchlist entry / report: "batter-660271". */
export function playerKey(p: { id: number; kind: PlayerKind }): string {
  return `${p.kind}-${p.id}`;
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

/**
 * One game in a player's season game log — the half that says which game it was.
 * The stats hang off the kind-specific interfaces below.
 */
export interface GameLogEntry {
  gamePk: number;
  date: string; // "2026-04-07"
  home: boolean;
  opponent: string; // "MIL" — the abbreviation, the full name being column-wide
  opponentId: number;
  win: boolean | null; // his team's result; null until the game is decided
  // The final score from his side of it, so the row reads "W 5-3" rather than
  // needing the reader to know which team was home. Both null when the score
  // lookup failed or the game hasn't started — the game log itself carries no
  // score, so this comes off the season schedule.
  teamScore: number | null;
  opponentScore: number | null;
  summary: string; // MLB's own one-liner, e.g. "1-4 | 2B, 2 K, RBI"
}

/** A batter's line for one game. */
export interface BatterGameLog extends GameLogEntry {
  // Where he hit in the posted order, 1-9. Null when he wasn't in it — he came
  // on off the bench, and the posted lineup doesn't say whose spot he took.
  lineupSpot: number | null;
  pa: number;
  ab: number;
  runs: number;
  hits: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  so: number;
  sb: number;
  // Carried but not shown: with these the season row recomputes OBP and SLG
  // from the totals, instead of averaging 150 per-game rates into nonsense.
  hbp: number;
  sacFlies: number;
  totalBases: number;
  // MLB's game log carries these as the line **through** that game, not the
  // game's own — a 1-for-4 night reads ".248". That running line is the useful
  // one (a game's own AVG is just its H/AB restated), so the names say so.
  seasonAvg: string;
  seasonObp: string;
  seasonSlg: string;
  seasonOps: string;
}

/** A pitcher's line for one game. */
export interface PitcherGameLog extends GameLogEntry {
  // The innings he was in the game for, and his team's margin at his first
  // pitch (+2 up two, 0 tied, -1 down one). MLB's game log has none of this —
  // it comes off his season's pitch-level Savant CSV — so all three are null
  // together when that lookup failed.
  firstInning: number | null;
  lastInning: number | null;
  entryMargin: number | null;
  decision: PitchingCredit | null;
  started: boolean;
  outs: number; // what the season row sums — thirds of an inning don't add up
  inningsPitched: string; // "5.1"
  hits: number;
  runs: number;
  earnedRuns: number;
  walks: number;
  strikeOuts: number;
  hr: number;
  hitBatsmen: number;
  battersFaced: number;
  pitches: number;
  strikes: number;
  seasonEra: string; // his ERA through this game, as with the batter's rates
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
  // Throwing hand ("L"/"R") — pitchers only, and null for a batter. His games
  // carry it as `stand` once he's appeared in one; this is what the card reads
  // before that, when the only thing on it is a game he hasn't pitched yet.
  throws: string | null;
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
  // Shape of the card when it was scraped; a stored card built by an older
  // version is re-scraped rather than served (see CARD_VERSION).
  version?: number;
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
