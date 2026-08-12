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
/** A non-pitch event inside a plate appearance, e.g. a pitching change.
 *  `afterPitch` is the number of pitches thrown before it. */
export interface PlayAction {
  type: string;
  description: string;
  afterPitch: number;
}

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
  // The score the play left behind (away, home) — the same pair a `BaseEvent`
  // carries, so the feed's two item shapes can state it in the same place.
  awayScore: number | null;
  homeScore: number | null;
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
  // Non-pitch events during the at-bat — a pitching change, a mound visit, a
  // pickoff, a runner going. Filled **only while it is in progress**, which is
  // the Live section, the one place they are shown; see `StatsApiPlateAppearance`
  // for why that keeps every stored blob honest. Empty otherwise.
  actions: PlayAction[];
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
  // The pitcher each side still has in the game — one per team, live only, and a
  // different question from `pitchingId`, which names only the half's mound. A
  // starter resting while his own team bats is in here and not in that.
  inGamePitcherIds: number[];
}

/** A game's announced/probable starting pitcher (used before first pitch). */
export interface ProbablePitcher {
  id: number;
  name: string;
  hand: string | null; // "L" | "R"
}

/**
 * What a base-running event was. The vocabulary is MLB's own runner
 * `details.eventType` collapsed to the distinctions worth a badge — measured
 * against 111 games, which is also what settled what is *not* here (see
 * `baseEventKind` in mlbStats.ts).
 *
 * - `sb`   stolen base            - `cs`   caught stealing
 * - `po`   picked off             - `pocs` picked off and caught stealing
 * - `poe`  advanced on a pickoff throwing error
 * - `balk` balk (a disengagement violation awards the base the same way, so it
 *          takes the same kind; the description says which it was)
 * - `wp`   wild pitch             - `pb`   passed ball
 * - `di`   defensive indifference - `run`  he scored
 */
export type BaseEventKind =
  | 'sb'
  | 'cs'
  | 'po'
  | 'pocs'
  | 'poe'
  | 'balk'
  | 'wp'
  | 'pb'
  | 'di'
  | 'run';

/**
 * A base-running event — everything that happens to a runner off a plate
 * appearance — for the feed's stream.
 *
 * It carries the same things a plate appearance does: a description of what
 * happened, a `playId` to play it back, and the situation it happened in
 * (bases + outs, which the feed draws with the same `BaseDiamond` an at-bat
 * card uses). In the feed it is the same kind of item — something that happened
 * to a watched player, with a clip of it.
 *
 * The same event reaches **two** players' games: the runner's, and — for the
 * ones the pitcher is a party to — the pitcher's (see `PITCHER_BASE_EVENTS`).
 */
export interface BaseEvent {
  kind: BaseEventKind;
  inning: number;
  half: string; // "Top" | "Bot"
  timestamp: string | null;
  // The at-bat the event happened during (1-based, as `PlateAppearance`
  // numbers them) — what lets a pitcher's inning block put a balk in the
  // middle of the batters he faced rather than at the end of them.
  atBatNumber: number;
  // The base the event names: the bag taken or lost for `sb`/`cs`/`po`/`pocs`,
  // and the base he ended up on for the kinds that are pure advances
  // (`balk`/`wp`/`pb`/`di`/`poe`). Null for a run and when MLB says neither.
  base: string | null;
  playId: string | null; // the clip, resolved through /api/video like any play
  description: string; // MLB's own line for the event ('' when it has none)
  runnerName: string | null; // whose event it was — the pitcher's card needs it
  batterName: string | null; // at the plate: stolen on, or drove the run in
  pitcherName: string | null;
  balls: number | null;
  strikes: number | null;
  outs: number | null;
  // The bases as they stood when it happened — the play's own start state with
  // every movement recorded before this one applied, so a steal shows the man
  // on first rather than the man on second he became.
  onBase: BaseState;
  fromBase: string | null; // the base he came from ("1B"/"2B"/"3B")
  awayScore: number | null; // the score the event left behind
  homeScore: number | null;
}

// ---- Pitcher model ---------------------------------------------------------

/** One batter a pitcher faced — the RESULT of the PA only (no pitch-by-pitch
 * detail), framed from the pitcher's side (the batter is named). */
export interface FacedBatter {
  batterId: number;
  batterName: string;
  stand: string | null; // batter handedness L/R
  // Which at-bat of the game this was (1-based, as `PlateAppearance` numbers
  // them) — the key an inning block merges the game's base events against, so a
  // wild pitch lands between the two batters it happened between.
  atBatNumber: number;
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
  // The probable starter announced for this player's *own* side — the opposite
  // half of `probablePitcher`, and what says whether a watched starting pitcher
  // is the one taking the ball today (his rotation mates' games are not his).
  // Set only while the game is still scheduled: from first pitch on the
  // boxscore names the real starter and `pitchingRole` carries it, so a
  // finished day's cached snapshot never depends on this field.
  teamProbablePitcher: ProbablePitcher | null;
  plateAppearances: PlateAppearance[];
  // What happened to this player off a plate appearance, in play order — the
  // feed interleaves them chronologically with at-bats. On a **batter's** game
  // that is his own baserunning (steals, pickoffs, the free bases he was given,
  // the runs he scored); on a **pitcher's** it is the ones he was a party to,
  // his balk and his wild pitch among them. Same list, same feed item.
  baseEvents: BaseEvent[];
  line: BattingLine;
  // For a watched pitcher, the pitcher's-eye view of this game; null for batters.
  pitching: PitcherGame | null;
}

/** Batter or pitcher. A two-way player can be on the roster as both, so this is
 * half of an entry's identity — the MLB id alone isn't unique. */
export type PlayerKind = 'batter' | 'pitcher';

/**
 * One entry on the user's **roster** — the saved list the Summary, Games and
 * Feed views report on.
 *
 * The name predates the split between *roster* and *watchlist* and is left
 * alone deliberately: it is the type every report, season player and card in
 * both workspaces is built on, and renaming it would be a hundred-file diff
 * that says nothing the comment doesn't. The **watchlist** — the players
 * followed on the research board — is a set of `playerKey` strings and carries
 * no entry of its own (see `store.ts`).
 */
export interface WatchPlayer {
  id: number;
  savantName: string; // "Last, First"
  name: string; // "First Last"
  kind: PlayerKind;
}

/** The identity of a roster entry / watchlist entry / report: "batter-660271". */
export function playerKey(p: { id: number; kind: PlayerKind }): string {
  return `${p.kind}-${p.id}`;
}

/**
 * Which sets of players the research board includes. Three independent
 * switches rather than one choice: they compose, so "my roster and the free
 * agents" is a state a fantasy manager actually wants and a single-select
 * could not express.
 *
 * - `mine` — everyone on the user's roster (the saved list, or the ESPN team
 *   when the views are reading that).
 * - `others` — everyone on somebody *else's* roster in the connected league.
 * - `fa` — the rest. With a league connected that is the free agents; without
 *   one, ownership is unknowable and it is simply everyone off your roster,
 *   which is what the client labels it.
 *
 * The three are disjoint by construction, `mine` winning where it and ESPN
 * disagree, so all three on is the whole board and none on is an empty one.
 */
export type ResearchIncludeKey = 'mine' | 'others' | 'fa';

export const RESEARCH_INCLUDE_KEYS: ResearchIncludeKey[] = ['mine', 'others', 'fa'];

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
  // The denominator of the log's `H/PA` cell — it counts the walk and the
  // sacrifice that AB throws away, which is the whole reason it is the one
  // shown.
  pa: number;
  // Not a column any more, and still needed: the season row's AVG and SLG are
  // over at-bats whatever the cell above them counts.
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

/**
 * What is true of a player **today**, as against what he has done — his roster
 * status, and where he sits in his team's game if they have one.
 *
 * The watchlist views read all of this off a `PlayerReport`, which carries a
 * player's games and his roster status already. The research board and the
 * details view cannot: the board is every player in the league and the details
 * view opens on any of them, watched or not, and neither is going to pull a
 * report per row to learn that a man is on the IL. So this is the same handful
 * of facts, shorn of everything a report holds besides them, for the two views
 * that want the facts without the report.
 */
export interface PlayerStatus {
  /** His 40-man roster status when it isn't plain "Active" — see `RosterStatus`. */
  rosterStatus: RosterStatus | null;
  /** Where today's posted lineup has him, and in which slot. Null both when the
   *  lineup hasn't posted and when his team isn't playing. */
  lineupStatus: 'starting' | 'bench' | null;
  lineupSpot: number | null;
  /** The pitcher-side mirror: today's starter (announced or on the boxscore) or
   *  a reliever, with the inning he came in. */
  pitchingRole: 'starting' | 'relief' | null;
  entryInning: number | null;
  /** The state of the game these facts are about — the one thing here that is
   *  about the game rather than the player, carried because a postponement is
   *  the reason a posted lineup means nothing. */
  gameState: GameStatus['state'] | null;
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
