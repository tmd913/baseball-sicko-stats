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
  timestamp: string | null; // ISO time the PA ended (or began, if in progress)
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
  state: 'scheduled' | 'live' | 'final' | 'postponed';
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
  pitchingId: number | null; // the pitcher currently on the mound (live only)
}

export interface ProbablePitcher {
  id: number;
  name: string;
  hand: string | null;
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
  stand: string | null;
  inning: number;
  half: string; // "Top" | "Bot"
  outsWhenUp: number | null;
  onBase: BaseState;
  event: string | null;
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
  bbType: string | null;
  xwoba: number | null;
  // The pitch-by-pitch sequence the pitcher threw in this PA (in order).
  pitches: Pitch[];
}

/** A win, loss, save or hold — what a pitcher took away from an outing. */
export type PitchingCredit = 'W' | 'L' | 'S' | 'H';

/** A pitcher's per-game counting line (authoritative, from the boxscore). */
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

/** One pitch type in a pitcher's game arsenal, with game averages + season /
 * league baselines that power the comparison arrows. */
export interface PitchMix {
  pitchType: string;
  count: number;
  strikes: number; // pitches of this type not ruled a ball (balls = count - strikes)
  share: number; // 0-1
  whiffRate: number | null;
  avgVelo: number | null;
  avgSpin: number | null;
  hBreak: number | null;
  vBreak: number | null;
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

/** A pitcher's game view. */
/**
 * One game's work against a single batter handedness. Derived from the plays,
 * not the boxscore (which doesn't split) — so `line.outs` is 0 and the counting
 * stats are per batter faced. Everything else aggregates like the whole outing.
 */
export interface PitcherSplit {
  line: PitchingLine;
  pitchMix: PitchMix[];
  whiffRate: number | null;
  cswRate: number | null;
  strikePct: number | null;
}

export interface PitcherGame {
  line: PitchingLine;
  facedBatters: FacedBatter[];
  // The same view restricted to right- / left-handed batters. Null when he
  // faced nobody of that hand.
  vsRight: PitcherSplit | null;
  vsLeft: PitcherSplit | null;
  pitchMix: PitchMix[];
  whiffRate: number | null;
  cswRate: number | null;
  strikePct: number | null;
  isStart: boolean;
  // What he came away with: the official W/L/S, or a hold — which the feed's
  // decisions never name, so the server reads it off his boxscore line.
  decision: PitchingCredit | null;
}

/** A pitcher's season arsenal: the whole season, plus the batter-handedness
 * splits (null when he's faced nobody of that hand). */
export interface SeasonArsenal {
  pitches: SeasonArsenalPitch[];
  vsRight: SeasonArsenalPitch[] | null;
  vsLeft: SeasonArsenalPitch[] | null;
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

/** A pitcher's season line (+ vs L/R splits handled at report level). */
export interface PitcherSeasonStats {
  gamesPlayed: number;
  gamesStarted: number;
  battersFaced: number;
  inningsPitched: string;
  era: string;
  whip: string;
  strikeOuts: number;
  baseOnBalls: number;
  hits: number;
  homeRuns: number;
  strikeoutsPer9: string;
  walksPer9: string;
  kRate: string;
  bbRate: string;
  avgAgainst: string;
  hitBatsmen: number;
  homeRunsPer9: string;
  // ERA-scale estimators: FIP from his own three true outcomes, xFIP with his
  // home runs swapped for fly balls at the league rate. Null on a split, and
  // for too small a workload to mean anything.
  fip: string | null;
  xfip: string | null;
  // Statcast's own contact-quality ERA estimator, off Savant's expected-stats
  // leaderboard rather than derived here. Null on a split, which it doesn't cover.
  xera: string | null;
}

/** Where a team places among all 30 in each category. 1 is always the **best
 *  offence**, so the fewest strikeouts ranks 1st. Null where there's no value. */
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
  kRate: string;
  bbRate: string;
  ranks: TeamHittingRanks | null;
}

/** How the opposing lineup has hit this season, whole and by pitcher hand
 *  (`vsLeft`/`vsRight` are their lines against left/right-handed pitching). */
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
  lineupStatus: 'starting' | 'bench' | null;
  lineupSpot: number | null;
  // Pitcher-side mirror of lineupStatus (null for a batter's game): 'starting'
  // for the announced/actual starter, 'relief' once he's come out of the
  // bullpen — `entryInning` is the inning he entered (null for a starter).
  pitchingRole: 'starting' | 'relief' | null;
  entryInning: number | null;
  // The opposing team, and — on a watched pitcher's game — how that lineup has
  // hit this season.
  opponentId: number | null;
  opponentHitting: TeamHitting | null;
  probablePitcher: ProbablePitcher | null;
  // The probable starter announced for this player's *own* side — the opposite
  // half of `probablePitcher`, and what says whether a watched starting pitcher
  // is the one taking the ball today (his rotation mates' games are not his).
  // Set only while the game is still scheduled: from first pitch on the
  // boxscore names the real starter and `pitchingRole` carries it, so a
  // finished day's cached snapshot never depends on this field.
  teamProbablePitcher: ProbablePitcher | null;
  plateAppearances: PlateAppearance[];
  // Stolen bases + runs scored by this player in the game, in play order.
  baseEvents: BaseEvent[];
  line: BattingLine;
  // For a watched pitcher, the pitcher's-eye view of this game; null for batters.
  pitching: PitcherGame | null;
}

/** Batter or pitcher. A two-way player can be watched as both, so this is half
 * of a watchlist entry's identity — the MLB id alone isn't unique. */
export type PlayerKind = 'batter' | 'pitcher';

export interface WatchPlayer {
  id: number;
  savantName: string;
  name: string;
  kind: PlayerKind;
}

/** The identity of a watchlist entry / report / card: "batter-660271". */
export function playerKey(p: { id: number; kind: PlayerKind }): string {
  return `${p.kind}-${p.id}`;
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
  // lookup failed or the game hasn't started.
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
  // Carried but not shown as columns: with these the season row recomputes OBP
  // and SLG from the totals, instead of averaging 150 per-game rates.
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

export interface RosterStatus {
  code: string;
  description: string;
}

export interface PlayerReport extends WatchPlayer {
  found: boolean;
  games: PlayerGame[];
  seasonStats: SeasonStats | null;
  pitcherSeasonStats: PitcherSeasonStats | null;
  splitVsLeft: SeasonStats | null;
  splitVsRight: SeasonStats | null;
  rosterStatus: RosterStatus | null;
  // Throwing hand ("L"/"R") — pitchers only, and null for a batter. His games
  // carry it as `stand` once he's appeared in one; this is what the card reads
  // before that, when the only thing on it is a game he hasn't pitched yet.
  throws: string | null;
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

// ---- Research table (league-wide season leaderboard) -----------------------

/**
 * One player's season on the research table — every player in the league, not
 * just the watchlist, which is what separates this from `SeasonStats`.
 *
 * Both kinds share one row shape and one endpoint, with the half that doesn't
 * apply left null: the client renders one kind's columns at a time, and a
 * discriminated union would make every column accessor need a narrowing step
 * to read a field the table already knows is there.
 *
 * Counting stats are `number`; everything a filter or a sort compares is a
 * `number | null` rather than MLB's display string, so the client can order and
 * threshold them without reparsing. `null` means "no value" — the reliever with
 * no batted ball behind his barrel rate — and sorts to the bottom whichever way
 * the column is pointing, since a blank is not a good score or a bad one.
 */
/**
 * How much of the season the research board is reading. `'season'` is the whole
 * of it — the default, and the only one Savant publishes a Statcast leaderboard
 * for; the numbers are days back, ending yesterday (today's games are in
 * progress and Savant lags the feed by a day).
 */
export type ResearchWindow = 'season' | 7 | 15 | 30 | 60;

/** The tabs, in the order the Filters panel shows them. */
export const RESEARCH_WINDOWS: ResearchWindow[] = ['season', 7, 15, 30, 60];

export interface ResearchRow {
  id: number;
  name: string;
  savantName: string;
  kind: PlayerKind;
  team: string; // "MIL" — the abbreviation; a full name is column-wide
  position: string; // "2B"
  // What the position-type filter selects on: Pitcher / Catcher / Infielder /
  // Outfielder / Hitter (DH) / Two-Way Player, straight from the Stats API.
  positionType: string;
  games: number;
  /** A majority of his appearances are starts — the same test `isRotationStarter`
   *  applies to a watched pitcher. Computed server-side so the SP/RP pills and
   *  the qualifier below can't drift apart on what a starter is. Always false
   *  on a batter row. */
  starter: boolean;
  /** The rate-stat qualifier, measured against games **his team** has played
   *  rather than games he has played, which is the whole point of it. Three
   *  rules, because one number can't serve all three roles — see `qualifies`
   *  in research.ts. */
  qualified: boolean;

  // Batting half — null on a pitcher row.
  pa: number | null;
  ab: number | null;
  doubles: number | null;
  triples: number | null;
  rbi: number | null;
  sb: number | null;
  cs: number | null; // caught stealing — carried for SB%, which needs both
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  babip: number | null;

  // Pitching half — null on a batter row.
  gamesStarted: number | null;
  wins: number | null;
  losses: number | null;
  saves: number | null;
  holds: number | null;
  inningsPitched: string | null; // "158.1" — thirds, so it displays as given
  // …and the same innings as a plain count, because the display string doesn't
  // sort: 6.2 is two thirds past six, not two tenths, so 6.2 > 6.11 as a number
  // but 6.2 < 6.11 as innings. The column shows the string and orders on this.
  outs?: number;
  era: number | null;
  whip: number | null;
  strikeoutsPer9: number | null;
  walksPer9: number | null;
  homeRunsPer9: number | null;
  battersFaced: number | null;
  avgAgainst: number | null; // batting average against
  earnedRuns?: number;
  hitBatsmen: number | null;
  // Pitch counts, for the strike rate the client derives from them.
  strikes: number | null;
  pitches: number | null;
  // Fielding-independent pitching, computed server-side off `leagueRates.ts`
  // rather than in the table: the FIP constant lives there and is shared with
  // the pitcher card, and one definition of FIP in the codebase is enough.
  // Null under three innings, where the number is noise.
  fip: number | null;
  // …and its fly-ball twin, which swaps his own home runs for his fly balls at
  // the league rate. Computed in `enrich`, not beside FIP, because the fly-ball
  // count is Savant's — so a failed custom board costs this and leaves FIP.
  xfip: number | null;

  // Shared by both halves, meaning "his" for a batter and "allowed" for a
  // pitcher — the columns a research table wants on either board.
  hits: number | null;
  hr: number | null;
  runs: number | null;
  walks: number | null;
  strikeouts: number | null;

  // Statcast enrichment (Savant). Null when Savant has no row for the player or
  // when the board it comes from was unavailable — a failed fetch costs these
  // columns a value, never the table.
  xba: number | null;
  xslg: number | null;
  xwoba: number | null;
  xera: number | null; // pitcher only
  exitVelocity: number | null; // mph
  launchAngle: number | null; // degrees
  barrelRate: number | null; // percent
  hardHitRate: number | null; // percent
  sweetSpotRate: number | null; // percent of batted balls at 8-32°
  // Batted-ball profile, as a share of balls in play.
  gbRate: number | null;
  ldRate: number | null;
  fbRate: number | null;
  // Plate discipline. `chaseRate` is swings at pitches out of the zone;
  // `firstPitchStrikeRate` is 0-0 counts that went to strike one — read as
  // "how often he falls behind" for a batter and "gets ahead" for a pitcher.
  whiffRate: number | null; // percent
  chaseRate: number | null; // percent
  firstPitchStrikeRate: number | null; // percent
  // Batter only — Savant publishes no sprint speed on the pitching board.
  sprintSpeed: number | null; // feet per second
}

/** Everything a user has customised, saved server-side against their id.
 *  `{}` for a user who never has. Mirrors `UserPrefs` in the server's store. */
export interface UserPrefs {
  researchColumns?: Partial<Record<PlayerKind, string[]>>;
  /** Absent means off, the default — the server stores off as no entry. */
  hideInjured?: boolean;
  /** Play every video clip with the sound off. Absent means off. */
  muteAudio?: boolean;
  /** Read the watchlist views off the ESPN fantasy roster rather than the
   *  saved list. Absent means the saved list, which is the default. */
  rosterSource?: 'fantasy';
}

/** Which set of players the four watchlist views describe. */
export type RosterSource = 'watchlist' | 'fantasy';

// ---- ESPN fantasy league ---------------------------------------------------

/** One fantasy team in the connected league. */
export interface EspnTeam {
  id: number;
  name: string;
  abbrev: string;
}

/** What the server will say about a user's ESPN connection. Deliberately
 *  credential-free: `espn_s2` goes in through `saveEspn` and never comes back,
 *  so there is nothing here for the client to have to be careful with. */
export type EspnStatus =
  | { connected: false }
  | {
      connected: true;
      leagueId: number;
      leagueName: string | null;
      teamId: number | null;
      teamName: string | null;
      /** Whether an ESPN cookie is stored for this connection at all — false
       *  for a public league, which is read anonymously. The value itself is
       *  never sent; this only says which of the two kinds it is. */
      hasCredentials: boolean;
      /** The invite code while sharing is on, else null. Only ever sent to
       *  someone already on the league. */
      inviteCode: string | null;
      /** How many app users are on this connection. */
      memberCount: number;
      /** Whether this user's own cookie is the one the league is read with.
       *  False means a leaguemate's session is carrying it. */
      credentialMine: boolean;
      savedAt: number;
    };

/** Who in the connected league is already rostered — keyed by **MLB** player
 *  id, so the research board's free-agent test is a lookup on the id every row
 *  already carries. Mirrors `EspnOwnership` in the server's `espn.ts`. */
export interface EspnOwnership {
  leagueId: number;
  leagueName: string;
  season: number;
  teams: EspnTeam[];
  myTeamId: number | null;
  myTeamName: string | null;
  /** MLB player id → the fantasy team id holding him. */
  owned: Record<number, number>;
  /** Roster entries read, and how many found an MLB player. The gap is
   *  prospects who have never played a major-league game; it is carried so a
   *  match that has silently stopped working is visible rather than showing up
   *  as a league where everyone is a free agent. */
  rosterCount: number;
  matched: number;
  fetchedAt: number;
}

/** One player on the user's fantasy roster, joined to his MLB id. Mirrors
 *  `EspnRosterPlayer` in the server's `espn.ts`. */
export interface EspnRosterPlayer {
  espnId: number;
  name: string;
  /** Null when the name matched no major leaguer — a prospect, usually. */
  mlbId: number | null;
  savantName: string | null;
  /** One kind, or two for a two-way player. */
  kinds: PlayerKind[];
  /** Today's fantasy slot — 'SS', 'UTIL', 'SP', 'BE', 'IL'. */
  slot: string;
  slotId: number;
  /** In today's lineup: neither benched nor on the IL. */
  starting: boolean;
  injured: boolean;
}

export interface EspnRoster {
  teamName: string | null;
  players: EspnRosterPlayer[];
}
