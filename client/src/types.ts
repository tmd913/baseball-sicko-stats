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
  // The score the play left behind (away, home) — the same pair a `BaseEvent`
  // carries, so the feed's two item shapes can state it in the same place.
  awayScore: number | null;
  homeScore: number | null;
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
  // The pitcher each side still has in the game — one per team, live only. See
  // the server's copy: `pitchingId` is the half's mound, this is who has not
  // been taken out of the game.
  inGamePitcherIds: number[];
}

export interface ProbablePitcher {
  id: number;
  name: string;
  hand: string | null;
}

/**
 * A game a player has coming, for a day that holds none — the player page's
 * Overview tab, where "no game today" leaves the obvious next question unasked.
 * Mirrors `server/src/types.ts`; see `nextGame.ts` there for where it comes
 * from and why the window is a fortnight.
 */
export interface NextGame {
  gamePk: number;
  date: string;
  startTime: string | null;
  home: boolean;
  opponent: string;
  opponentId: number;
  /** The **other** side's announced starter — who he would face, or on a
   *  starter's own next start, his counterpart. Null until that club names one. */
  probablePitcher: ProbablePitcher | null;
}

/**
 * The answer, and which question it answers. `start` is true when this is a
 * starting pitcher's next **announced start** rather than his club's next game,
 * so a null `game` beside it means "nobody has named his next turn yet" — a
 * different sentence from "his club has nothing scheduled".
 */
export interface NextGameInfo {
  start: boolean;
  game: NextGame | null;
}

/**
 * How much of a guess a start is — one vocabulary for the player page's
 * Projected Starts block and the Schedule view's grid, which draw all three
 * differently.
 *
 * - `announced` — MLB has named him for it. A fact.
 * - `projected` — placed on **his own** measured pace this season: the median
 *   gap between his consecutive starts, in club games.
 * - `estimated` — placed on **his club's** rotation instead, because his own
 *   record is too thin to read one off (a call-up, a man traded in last week, a
 *   fifth starter two turns into the job). One step less certain again, and
 *   marked as such wherever it is drawn.
 *
 * See `server/src/rotations.ts`, where each is measured.
 */
export type StartTier = 'announced' | 'projected' | 'estimated';

/**
 * One start on a pitcher's next month — the player page's **Projected Starts**
 * block.
 *
 * **`tier` is the field the whole thing turns on.** A club names its probables a
 * few days out and that is a fact; everything past it is a rotation slot stepped
 * forward over the club's remaining schedule, which is a guess — and, since the
 * slot may be read off his own record or borrowed from his club's, a guess of two
 * strengths. The three ride on one list because they answer one question, and the
 * tier is what stops them reading as one kind of thing: the client draws all
 * three differently, the app's standing rule that an estimate is marked as one.
 */
export interface ProjectedStart {
  gamePk: number;
  date: string; // "2026-08-15" — the day it counts on
  startTime: string | null; // ISO, null until the club posts one
  home: boolean; // his club's side of it
  opponent: string; // "TOR" — the abbreviation, as everywhere else
  opponentId: number;
  /** True where MLB has named him for this game, false where we have placed
   *  him. Kept beside `tier` rather than derived from it: it is the one
   *  distinction every older client reads, and `tier === 'announced'` is the
   *  same test. */
  announced: boolean;
  /** Which of the three this row is — see `StartTier`. */
  tier: StartTier;
  /** The **other** side's announced starter — his counterpart. Null until that
   *  club names one, which on a projected row it never has. */
  probablePitcher: ProbablePitcher | null;
}

/**
 * Why nothing was projected past what has been announced. Each is a different
 * sentence on screen, because they are different facts about the pitcher:
 *
 * - `not-a-starter` — he has started nothing this season, so there is no slot.
 * - `too-few-starts` — **no turn could be read at all**, his own or his club's,
 *   which past the first week of a season means a club whose games we haven't
 *   got. It used to mean "under three starts of his own", and no longer does:
 *   that pitcher now takes his club's rotation and an `estimated` row.
 * - `new-club` — he has started this season, every one of them was for the club
 *   that has since traded him, and this one has not named him — so there is
 *   nothing to anchor a slot on here yet.
 * - `out-of-rotation` — his last start was more than two turns ago, so whatever
 *   slot he held is not his to be projected into now.
 * - `off-roster` — he is not on the active roster (the IL, the minors, a
 *   paternity list), so he is not making a start whatever his slot says. The
 *   feed's Upcoming section keeps the same rule for the same reason: *"someone
 *   off the active roster — hurt, suspended, optioned — is in none of them"*. An
 *   announcement still stands, a club naming a returning starter before the
 *   transaction posts being ordinary.
 * - `no-schedule` — his club couldn't be placed, or its schedule couldn't be
 *   read. The only one of the six that is our failure rather than his.
 */
export type ProjectionRefusal =
  | 'not-a-starter'
  | 'too-few-starts'
  | 'new-club'
  | 'out-of-rotation'
  | 'off-roster'
  | 'no-schedule';

export interface ProjectedStarts {
  /** Announced first where they exist, then projected, in date order. */
  starts: ProjectedStart[];
  /** How many of his club's games a turn takes — 5 for an ordinary five-man
   *  rotation. Null whenever nothing was projected, which is what `refusal`
   *  then says the reason for. */
  cadence: number | null;
  /** Null when the projection ran. */
  refusal: ProjectionRefusal | null;
}

/**
 * One thing that has been reported or recorded about a player, for the player
 * page's **News** tab and the section that previews it.
 *
 * The two sources are genuinely different kinds of fact and the field says
 * which, because a section labeled News that quietly mixes them would be
 * lying about half its rows:
 *
 * - **`rotowire`** — a **report**. A short dated note from RotoWire's baseball
 *   desk about this one player: a `headline` written to be scanned ("Lands on
 *   IL with forearm strain"), the note itself in `summary`, the body part in
 *   `kind` where RotoWire files one (`Elbow`, `Hamstring`) and `Report` where
 *   it doesn't, and a `url` onto his RotoWire page, which is where the note and
 *   RotoWire's own analysis of it live.
 * - **`mlb`** — an official transaction. It has no link and no summary, because
 *   MLB publishes neither: the whole of it is the one sentence in `headline`
 *   ("Los Angeles Dodgers placed LHP Blake Snell on the 15-day injured list"),
 *   and `kind` is MLB's own `typeDesc` ("Status Change", "Trade", "Assigned").
 *
 * `date` is a bare **`YYYY-MM-DD` on both**, because that is the resolution
 * each upstream actually publishes — MLB dates a transaction to a day and
 * RotoWire stamps a note `August 14, 2026`. The client still formats on the
 * length of the string rather than assuming, so an instant would draw as one if
 * either ever started publishing them (see `news.ts::cmpDate`, which sorts on
 * the day for the same reason).
 */
export interface NewsItem {
  /** Stable across re-reads. MLB's own id where there is one; on a RotoWire
   *  note there is none to have — the news ids exist on RotoWire's league-wide
   *  feed and not on a player page — so it is the player, the day and the
   *  headline, which is the same "what the row says" rule the transaction
   *  dedupe runs on. Prefixed by source, so the two can never collide. */
  id: string;
  source: 'mlb' | 'rotowire';
  date: string;
  headline: string;
  summary: string | null;
  kind: string | null;
}

/** Newest first, already narrowed to one player. Empty is a real answer and the
 *  client says so in words rather than drawing an empty box. */
export interface PlayerNews {
  items: NewsItem[];
}

/**
 * How recently a player was in the news — the two states the mark beside his
 * name has, and the only two.
 *
 * A **day** rather than an hour, because a day is the resolution both upstreams
 * publish (see `recentNews.ts`): `'today'` is the app's own `baseballToday()`,
 * `'yesterday'` the day before it, and there is no third value because anything
 * older is not shipped at all.
 */
export type NewsRecency = 'today' | 'yesterday';

/**
 * The newest thing said about one player, for the mark beside his name.
 *
 * Deliberately not a `NewsItem`: the mark is a mark and needs the day, the
 * level and something to say in its tooltip, where a news *row* needs a source,
 * a summary, a link and a stable id. Shipping the item would put six hundred of
 * them on the wire to draw six hundred dots.
 */
export interface RecentNews {
  /** `YYYY-MM-DD`, the day the newest item is stamped — the one the tooltip
   *  names, so the reader can check the color against a date. */
  date: string;
  level: NewsRecency;
  /** The headline of that newest item, which is what turns the mark from "go
   *  and look" into "he is on the IL". RotoWire's wording where both halves
   *  spoke on the same day, which is the precedence `getPlayerNews` gives them,
   *  so this is the headline at the top of the tab it points at. */
  headline: string;
}

/**
 * What a base-running event was — MLB's own runner `details.eventType`
 * collapsed to the distinctions worth a badge (see `baseEventKind` on the
 * server for what is in it, and for the two things measurement kept out).
 *
 * - `sb`   stolen base            - `cs`   caught stealing
 * - `po`   picked off             - `pocs` picked off and caught stealing
 * - `poe`  advanced on a pickoff throwing error
 * - `balk` balk, or the disengagement violation that awards the base the same way
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
 * (`onBase` + `outs`, which the feed draws with the same `BaseDiamond` an
 * at-bat card uses). In the feed it is the same kind of item.
 *
 * The same event reaches **two** players' games: the runner's, and — for the
 * ones the pitcher is a party to — the pitcher's.
 */
export interface BaseEvent {
  kind: BaseEventKind;
  inning: number;
  half: string; // "Top" | "Bot"
  timestamp: string | null;
  atBatNumber: number; // the at-bat it happened during, for the inning merge
  base: string | null; // the bag taken/lost, or the one he ended up on
  playId: string | null; // the clip, resolved through /api/video like any play
  description: string; // MLB's own line for the event ('' when it has none)
  runnerName: string | null; // whose event it was — the pitcher's card needs it
  batterName: string | null; // at the plate: stolen on, or drove the run in
  pitcherName: string | null;
  balls: number | null;
  strikes: number | null;
  outs: number | null;
  onBase: BaseState; // the bases as they stood when it happened
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
  stand: string | null;
  // Which at-bat of the game this was (1-based) — the key an inning block
  // merges the game's base events against, so a wild pitch lands between the
  // two batters it happened between.
  atBatNumber: number;
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

/**
 * How far above horizontal a pitcher's arm is at release, with the league's own
 * average beside it — what the movement plot draws in its corner. 0° is a true
 * sidearm slot and 90° would be straight over the top; the league sits near 37°,
 * and that average is **not** split by hand because it barely differs (36.9°
 * against 37.0° on the 2026 board).
 */
export interface ArmAngleInfo {
  angle: number;
  /** Release height in feet — how high the ball leaves his hand. */
  releaseHeight: number;
  /** How far to his arm side of the shoulder he releases it, in feet. */
  releaseSide: number;
  league: number | null;
}

/**
 * One pitch as a point on the Arsenal tab's Movement Profile — where it broke,
 * and nothing else: the plot draws a colored dot at (`hBreak`, `vBreak`) and
 * reads no other field.
 *
 * `hBreak`/`vBreak` are the app's usual convention, inches: positive `hBreak`
 * breaks toward **third base** and positive `vBreak` is rise. That holds for a
 * pitcher of either hand with no special case — a RHP's four-seam runs arm-side
 * to 3B and reads positive, a LHP's runs to 1B and reads negative — which is
 * also exactly where Savant's own chart puts them.
 */
export interface MovementSample {
  pitchType: string;
  hBreak: number;
  vBreak: number;
}

/** A pitcher's season arsenal: the whole season, plus the batter-handedness
 * splits (null when he's faced nobody of that hand). */
export interface SeasonArsenal {
  pitches: SeasonArsenalPitch[];
  vsRight: SeasonArsenalPitch[] | null;
  vsLeft: SeasonArsenalPitch[] | null;
  /** A bounded, evenly-spread selection of the season's pitches, for the
   *  Movement Profile's dot cloud. Empty when the arsenal read found none. */
  samples: MovementSample[];
  /** The season these numbers are, named by the server rather than derived here
   *  — the same way the rolling-xwOBA payload carries its own. */
  season: number;
  /** Which arm he throws with, off the season CSV's own `p_throws`. It picks
   *  the per-hand league line the charts compare against, and it is what lets
   *  that line be labeled `RHP AVG` / `LHP AVG` rather than a blended
   *  "League". Null falls both back to the blended figure. */
  hand: 'R' | 'L' | null;
  /** His arm slot, off Savant's own leaderboard — null where it has no row for
   *  him, or where that read failed, in which case the chart draws no arm. */
  armAngle: ArmAngleInfo | null;
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
  /** How wide the league's own average is for this pitch type, in inches — what
   *  the Movement Profile draws its hatched MLB-average blob from, rather than a
   *  bare point. Always filled (there is a default), unlike the averages above. */
  leagueHRange: number;
  leagueVRange: number;
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
  // His record and his credits — MLB's own tallies on this same line. The
  // Overview tab's season strip reads `IP · W-L · SV · HD · ERA · WHIP · K%`,
  // and these four are the half of it no rate can express. Zeroed on a split,
  // which nothing reads them off.
  wins: number;
  losses: number;
  saves: number;
  holds: number;
  strikeOuts: number;
  baseOnBalls: number;
  hits: number;
  homeRuns: number;
  strikeoutsPer9: string;
  walksPer9: string;
  kRate: string;
  bbRate: string;
  avgAgainst: string;
  /** OPS against — the one line MLB publishes on a pitching split that reads as
   *  a single number, and the Splits tab's headline row for a pitcher. ERA is
   *  unavailable on a split (earned runs aren't split by hand) and OPS-against
   *  is the direct analogue of the batter tab's OPS row, so both kinds of player
   *  lead on the same comparison. */
  opsAgainst: string;
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

/**
 * Where a team places among all 30 in each category — 1 is always the **best
 * offense**, so a low strikeout rate ranks 1st, not 30th. Computed here rather
 * than read off the API, which ranks by its own default sort and doesn't rank
 * splits at all. Each cut ranks within **its own** population: a 30-day
 * home-vs-LHP line is placed against the other 29 teams' 30-day home-vs-LHP
 * lines, not against the season board.
 */
export interface TeamHittingRanks {
  runsPerGame: number | null;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  homeRuns: number | null;
  kRate: number | null;
  bbRate: number | null;
}

/** One batting line for a team, over one window / venue / pitcher hand. */
export interface TeamHittingLine {
  pa: number;
  games: number;
  runs: number;
  runsPerGame: string | null;
  avg: string;
  obp: string;
  slg: string;
  ops: string;
  homeRuns: number;
  strikeOuts: number;
  baseOnBalls: number;
  kRate: string; // K / PA, ".231"
  bbRate: string;
  ranks: TeamHittingRanks | null;
}

/** The three rows of the opponent table: everyone, then by the hand on the
 *  mound. A cut a team has no plate appearance in is null rather than a line of
 *  zeroes — a fortnight in which nobody started a lefty against them is an
 *  absence, not an 0-for. */
export interface TeamHittingSplit {
  all: TeamHittingLine | null;
  vsLeft: TeamHittingLine | null;
  vsRight: TeamHittingLine | null;
}

/** Which spans the opponent table offers. Deliberately the research board's own
 *  five, so "last 30 days" means one thing everywhere in the app. */
export type TeamHittingWindow = 'season' | 7 | 15 | 30 | 60;
export const TEAM_HITTING_WINDOWS: TeamHittingWindow[] = ['season', 7, 15, 30, 60];

/** Which games a cut counts. */
export type TeamHittingVenue = 'all' | 'home' | 'away';

/**
 * How a team has hit over one window — whole, at home, on the road, and each of
 * those three by the hand on the mound. Nine cuts, because the reader picks the
 * venue and reads all three hands at once, so a venue change must cost no
 * request.
 */
export interface TeamHitting {
  teamId: number;
  window: TeamHittingWindow;
  all: TeamHittingSplit;
  home: TeamHittingSplit;
  away: TeamHittingSplit;
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
  plateAppearances: PlateAppearance[];
  // What happened to this player off a plate appearance, in play order. On a
  // **batter's** game that is his own baserunning; on a **pitcher's** it is the
  // ones he was a party to, his balk and his wild pitch among them.
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
 * Feed views report on. The name predates the split between *roster* and
 * *watchlist* and is deliberately left alone: every report and card in both
 * workspaces is built on it. The **watchlist** — the players followed on the
 * research board — is a set of `playerKey` strings and has no entry type.
 */
export interface WatchPlayer {
  id: number;
  savantName: string;
  name: string;
  kind: PlayerKind;
}

/** The identity of a roster entry / watchlist entry / report / card:
 *  "batter-660271". */
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
  /** The two three-true-outcome counts, which is what they are here for: the
   *  Splits tab reads K% and BB% off them (`/pa`), and a hitter's swing-and-miss
   *  against same-side breaking stuff is the classic platoon tell. Counts rather
   *  than rates because a rate over a *split* has to be divided by that split's
   *  own PA, which only this object knows. Nothing else reads them. */
  strikeOuts: number;
  baseOnBalls: number;
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
  // **Where he started**, off that same posted entry — `SS`, `CF`, `DH`. Null
  // on exactly the rows `lineupSpot` is null on, which is the point of reading
  // both off one entry: a man who came off the bench started nowhere, and the
  // two can never say different things about whether he was in the lineup.
  startPosition: string | null;
  // Not a column: it rides the `H/AB` cell's tooltip, since "how many times did
  // he come up" is a fair question to ask of a row whose leading cell counts
  // only the official at-bats. It is also what tells a pinch-runner's `0/0`
  // from a walk-only night's — see `HitsPerAb`, which dims on this and not AB.
  pa: number;
  // The log's leading cell, and the denominator of the season row's AVG and of
  // the SLG inside its OPS — one number under every rate on the line.
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
  // All three are his line **through** this game, as with the batter's rates.
  // ERA and WHIP are MLB's own — the game log publishes both cumulatively, so
  // they are read rather than derived. FIP is not published anywhere and is
  // computed here off `leagueRates.ts::fipLike`, the same definition the pitcher
  // card's season line and the research board use, over the counting stats
  // accumulated across the log in scorebook order. Null under three innings,
  // which is `fipLike`'s own rule — so an opening relief appearance carries no
  // FIP until the season-to-date innings reach three.
  seasonEra: string;
  seasonFip: string | null;
  seasonWhip: string;
}

export interface RosterStatus {
  code: string;
  description: string;
}

/**
 * What is true of a player **today** — his roster status and where his club's
 * game has him — for a view that has no `PlayerReport` to read it off.
 *
 * The watchlist views get all of this from the report: it carries a player's
 * games and his roster status already. The research board and the details view
 * cannot, because the board is every player in the league and the details view
 * opens on any of them, watched or not. Mirrors `PlayerStatus` on the server.
 */
export interface PlayerStatus {
  rosterStatus: RosterStatus | null;
  /** Where today's posted lineup has him, and in which slot. Null both when the
   *  lineup hasn't posted and when his team isn't playing. */
  lineupStatus: 'starting' | 'bench' | null;
  lineupSpot: number | null;
  /** The pitcher-side mirror: today's starter (announced or on the boxscore) or
   *  a reliever, with the inning he came in. */
  pitchingRole: 'starting' | 'relief' | null;
  entryInning: number | null;
  /** The state of the game these facts are about — carried because a
   *  postponement is the reason a posted lineup means nothing. */
  gameState: GameStatus['state'] | null;
  /** Who his club plays today, and whether at home — the research board's
   *  opponent column, drawn as `vs LAD` / `@ LAD`. Null when he has no game.
   *  A fact about today, so it reads the same on every window of that board. */
  opponent: string | null;
  isHome: boolean | null;
  /** That game's score, **his side first** — the game log's own vocabulary for
   *  a narrow column (`W 5-3`), which is what lets the board's cell print a
   *  score under a matchup that has already named both clubs. Null before
   *  first pitch, and null together or not at all. */
  teamScore: number | null;
  opponentScore: number | null;
  /** Where a live game has got to, in `GameStatus`'s own fields rather than a
   *  label — `inningLabel` in `lib.ts` builds "Top 7" from them for this and
   *  for `gameStatusView` alike. Null unless the game is in progress. */
  currentInning: number | null;
  inningState: string | null;
  /** First pitch, ISO, scheduled games only. */
  startTime: string | null;
  /** The starter the other side announced — the counterpart on a pitcher's row.
   *  Scheduled games only, as on the summary table, which drops him once the
   *  game is under way. */
  probablePitcher: ProbablePitcher | null;
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
  /** His club, for the cap logo the summary table draws under his name — the id
   *  MLB serves the mark by, and the abbreviation that is its `alt`, its
   *  tooltip and what the block prints when there is no mark to draw. It is his
   *  **current** club rather than the club of a game in the range, so a traded
   *  player's rows carry the cap he is wearing now. */
  teamId: number | null;
  team: string | null;
  /** MLB's listed position ("1B", "P", "TWP") — what the identity block prints
   *  where ESPN has no eligibility for him, which is every player for a user
   *  with no league connected. */
  position: string | null;
}

export interface SeasonPlayer extends WatchPlayer {
  team: string;
  position: string;
  /** Which side he bats from (`R` / `L` / `S`) and which arm he throws with
   *  (`R` / `L`). This list is the app's one source for handedness, because it
   *  is the one that answers for **anybody**: the client holds it from boot for
   *  the header search, so a lookup by id serves the research board's strangers
   *  as readily as a roster row. One entry per person carrying both facts — a
   *  two-way player is two rows under one id — and the reader picks by kind.
   *  Null where MLB lists neither, drawn as nothing rather than as a dash. */
  bats: string | null;
  throws: string | null;
}

// ---- Statcast percentile rankings -----------------------------------------

export interface PercentileMetric {
  key: string;
  label: string;
  percentile: number | null; // 0-100 league rank; null when the player has no data
  value: string | null; // the raw stat, pre-formatted for display (".415", "94.1")
  // Our rank rather than Savant's: estimated from the league mean/stddev it
  // publishes, or computed against a leaderboard where it publishes none.
  estimated?: boolean;
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
  /** MLB league average, drawn as the reference line — **measured** from the
   *  season's own plate appearances by the nightly job (see `leagueWoba.ts`),
   *  and the old fixed benchmark where that has not run. */
  leagueXwoba: number;
  /** How many wOBA events the average above is drawn from, and **0 where it is
   *  the benchmark rather than a measurement**. The legend reads it to say
   *  which, since a line a reader is judging a season against should not have
   *  to be taken on trust. Absent from a response written before this existed. */
  leagueXwobaPa?: number;
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

/**
 * One player's row on each of the research board's five windows — the player
 * page's **Stats** tab, which is that board transposed.
 *
 * `row` is **null rather than a zeroed row** for a window he does not appear
 * on, and the difference is real: a starter with no outing in the last seven
 * days is absent from the 7d board, where a row of noughts would claim he
 * pitched and did nothing.
 */
export interface PlayerWindowRow {
  window: ResearchWindow;
  row: ResearchRow | null;
}

export interface PlayerWindows {
  season: number;
  kind: PlayerKind;
  windows: PlayerWindowRow[];
}

export interface ResearchRow {
  id: number;
  name: string;
  /** ESPN's global rostered percentage — the share of *all* ESPN leagues the
   *  player is on a roster in, not of the user's own league.
   *
   *  **Merged in by the client**, not sent by `/api/research`: that board is
   *  cached per kind and window and served to everyone, while this is only
   *  shown to a user with a fantasy league connected. Absent means either no
   *  league or no match for the player. */
  rosterPct?: number | null;
  /** How that roster % has moved over each trend window the server could find a
   *  baseline for — client-merged too, and absent entirely when there is no
   *  league or no history yet.
   *
   *  A window present with a `null` is a player ESPN has no roster % for at
   *  all; a window present with a `0` is a player who really has not moved,
   *  since the server drops zeroes from the wire and the client fills them back
   *  in. A window that is **missing** from the object had no baseline, and its
   *  column is not on the board to ask about it. */
  rosterTrends?: Partial<Record<TrendWindow, number | null>>;
  /** The positions ESPN has him eligible at — `['2B', 'SS', 'OF']`, or `['SP',
   *  'RP']` for a swingman — in the board's own vocabulary and its own order.
   *  Each board reads its own half of it.
   *
   *  **Merged in by the client** like the two above, and for the same reason:
   *  the research blob is cached per kind and window and served to everyone,
   *  where this is a fantasy fact shown only to a user with a league connected.
   *  Absent means no league, or a player ESPN can't be joined to, and the
   *  position pills fall back to what the app knows on its own — MLB's single
   *  listed position for a batter, `starter` for a pitcher. */
  eligible?: string[] | null;
  savantName: string;
  kind: PlayerKind;
  team: string; // "MIL" — the abbreviation; a full name is column-wide
  /** …and the id behind it, which is what MLB serves a club's cap logo by.
   *  Null for a player the leaderboard files under no team at all. The board
   *  draws the logo where it used to print the abbreviation — see the name
   *  cell in `ResearchTable.tsx` — so the two are one fact at two widths. */
  teamId: number | null;
  position: string; // "2B"
  // What the position-type filter selects on: Pitcher / Catcher / Infielder /
  // Outfielder / Hitter (DH) / Two-Way Player, straight from the Stats API.
  positionType: string;
  games: number;
  /** A majority of his appearances are starts — the same test `isRotationStarter`
   *  applies to a watched pitcher, recomputed for whichever window the board is
   *  on. Computed server-side because the qualifier below is measured against
   *  it: a starter qualifies on innings and a reliever on appearances. The
   *  SP/RP pills read ESPN's season-long eligibility where there is one and
   *  fall back to this where there isn't, so the two answers may differ — see
   *  `espnPositions` in ResearchTable.tsx. Always false on a batter row. */
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
  // Batted balls that were both **pulled and in the air** — the shape of
  // contact home runs come out of, and a share of the same balls-in-play
  // denominator the three above use. Off Savant's batted-ball leaderboard
  // rather than the custom one, which publishes the column and leaves it
  // empty; **null on every window**, that board taking a year alone (see
  // `research.ts`).
  pullAirRate: number | null; // percent
  // Plate discipline. `chaseRate` is swings at pitches out of the zone;
  // `firstPitchStrikeRate` is 0-0 counts that went to strike one — read as
  // "how often he falls behind" for a batter and "gets ahead" for a pitcher.
  whiffRate: number | null; // percent
  chaseRate: number | null; // percent
  firstPitchStrikeRate: number | null; // percent
  /** Average bat speed over his competitive swings — the ones he took on the
   *  batting board, the ones taken against him on the pitching board. */
  batSpeed: number | null; // mph
  // Batter only — Savant publishes no sprint speed on the pitching board.
  sprintSpeed: number | null; // feet per second
}

/** Everything a user has customised, saved server-side against their id.
 *  `{}` for a user who never has. Mirrors `UserPrefs` in the server's store. */
export interface UserPrefs {
  researchColumns?: Partial<Record<PlayerKind, string[]>>;
  /** The player page's **Stats** tab columns, per kind. A separate entry from
   *  the board's although both are drawn from one vocabulary: the tab has six
   *  fewer columns to offer (`Opp`, `Ros%` and the five trend columns are cut),
   *  so one shared entry would let a write from the player page drop them from
   *  the board's saved set. Absent means that kind's defaults; not in the URL,
   *  where `cols=` names the board `pos=` selects. */
  statsColumns?: Partial<Record<PlayerKind, string[]>>;
  /** Absent means off, the default — the server stores off as no entry. */
  hideInjured?: boolean;
  /** Play every video clip with the sound off. Absent means off. */
  muteAudio?: boolean;
  /** The color scheme, by id — see `theme.ts`, which owns the vocabulary.
   *  Absent means the default (Midnight), the same convention as the toggles
   *  around it, and an id this build does not know is read as the default
   *  rather than as an error. */
  theme?: string;
  /** Draw a percentile rank under every value on the research board and the
   *  player page's Stats tab. Absent means off, the same convention. */
  statRanks?: boolean;
  /** Read the roster views off the ESPN fantasy team rather than the saved
   *  list. The one preference here that stores **both** its values, so absent
   *  means *unspecified* rather than the saved list — which is still what an
   *  absent entry resolves to, every reader testing `=== 'fantasy'`. What the
   *  difference buys is that naming a fantasy team for the first time can turn
   *  this on without overriding anyone who has said they want the saved
   *  roster; see `App.tsx::firstTeamNamed`. */
  rosterSource?: 'fantasy' | 'saved';
  /** Which ownership sets the research board includes. Absent means the
   *  default (free agents alone); `[]` is the real state of a user who has
   *  turned all three off. */
  researchInclude?: ResearchIncludeKey[];
  /** Put the watchlist on the research board **as well as** those sets — a
   *  union, not a narrowing. Absent means off. */
  researchWatchlist?: boolean;
  /** The last few players picked out of the header search, most recent first —
   *  what the field offers before anything is typed. **Player keys**, not
   *  entries: the search is already holding the season roster it matches
   *  against, so a saved name and club would be a staler copy of what is in
   *  hand, and a player who has left that list is one the search cannot find
   *  either. Absent means none, the same convention as everything above. */
  recentPlayers?: string[];
  /** How far the reader has got down the League page's **Transactions** feed:
   *  the date (epoch ms) of the newest move they had seen when that tab was
   *  last open, and the league it belonged to. What draws the red dot on the
   *  tab, and what clears it. The league id is stored with the date because a
   *  marker only means anything against the feed it came from — an
   *  unrecognized league draws the dot, which is news offered rather than news
   *  hidden. Absent means nothing has been read, which is right for a reader
   *  who has never opened the tab. */
  seenTransactions?: { leagueId: number; ts: number };
  /** How far down the Feed view's stream of plays this reader has got — epoch ms
   *  of the newest play they marked read. What draws and undraws the red
   *  `N new plays` button, and what the feed's `New` filter narrows to. A bare
   *  timestamp where `seenTransactions` carries a league id: a play is scoped to
   *  nothing the reader switches between. Mirrors `server/src/store.ts`. */
  seenPlays?: number;
  /** @deprecated The same flag under its old name, from when it narrowed the
   *  board rather than widening it. Read on the way in so a preference saved
   *  before the change survives; never written — a record migrates the first
   *  time the user touches the control. */
  researchWatchlistOnly?: boolean;
}

/**
 * Which sets of players the research board includes — three independent
 * switches that compose, so "my roster and the free agents" is expressible
 * where a single-select could only ever say one of them.
 *
 * - `mine` — everyone on the user's roster (the saved list, or the ESPN team
 *   when the views are reading that).
 * - `others` — everyone on somebody *else's* roster in the connected league.
 * - `fa` — the rest. With a league connected that is the free agents; without
 *   one ownership is unknowable and it is simply everyone off your roster.
 *
 * Disjoint by construction, `mine` winning where it and ESPN disagree — so all
 * three on is the whole board and none on is an empty one. They partition
 * **ownership** and nothing else, which is why the watchlist is not a fourth
 * key: it is a fact about the user rather than about who holds a player, so it
 * rides beside this as its own flag and is unioned on top (`researchWatchlist`).
 */
export type ResearchIncludeKey = 'mine' | 'others' | 'fa';

export const RESEARCH_INCLUDE_KEYS: ResearchIncludeKey[] = ['mine', 'others', 'fa'];

/** Which set of players the three roster views describe. `'saved'` is the list
 *  built here; the wire still calls it `watchlist` on `/api/report?source=`,
 *  which the server accepts as a synonym. */
export type RosterSource = 'saved' | 'fantasy';

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
/**
 * The spans the board reports a roster-% move over. Mirrors `TREND_WINDOWS` in
 * the server's `espn.ts`, which is where the reasoning for the set lives.
 */
export const TREND_WINDOWS = [1, 3, 7, 15, 30] as const;
export type TrendWindow = (typeof TREND_WINDOWS)[number];

/** One window's worth of movement. `days` is what was **measured** — within the
 *  server's per-window drift of `window` — and is what every label in the app
 *  prints, so a column can never claim a span it didn't measure. */
export interface RosterTrendWindow {
  window: TrendWindow;
  days: number;
  delta: Record<number, number>;
}

export interface EspnOwnership {
  leagueId: number;
  leagueName: string;
  season: number;
  teams: EspnTeam[];
  myTeamId: number | null;
  myTeamName: string | null;
  /** MLB player id → the fantasy team id holding him. */
  owned: Record<number, number>;
  /** ESPN's global rostered percentage by MLB player id — see `ResearchRow.rosterPct`. */
  rosterPct: Record<number, number>;
  /** The positions ESPN has each player eligible at, by MLB player id — see
   *  `ResearchRow.eligible`. A player with none in the board's vocabulary is
   *  **absent** rather than carrying an empty list, which is the same shape as
   *  a player ESPN has never heard of and reads as the same instruction: fall
   *  back to MLB's listed position. */
  eligibility: Record<number, string[]>;
  /** How those percentages have moved over each span a baseline was found for,
   *  ascending. Null until a second day of history exists to measure against at
   *  all; a window with no baseline of its own is simply absent from the list,
   *  and its column is dropped rather than shown full of zeroes. */
  trend: RosterTrendWindow[] | null;
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
  /** The fantasy slot he is in on the day this was read for — 'SS', 'UTIL',
   *  'SP', 'BE', 'IL'. Today's, unless the range in view asked for a future
   *  one; the server's copy of this interface has the whole rule. */
  slot: string;
  slotId: number;
  /** In that day's lineup: neither benched nor on the IL. */
  starting: boolean;
  injured: boolean;
  /** ESPN's injury designation, raw (`DAY_TO_DAY`, `OUT`, `TEN_DAY_DL`, …), or
   *  null when active. The app's only source for day-to-day and out — MLB's
   *  roster status has no code for either. `espnInjuryBadge` in `lib.ts` turns
   *  it into a label, as `rosterStatusBadge` does for MLB's own. */
  injuryStatus: string | null;
}

export interface EspnRoster {
  teamName: string | null;
  /**
   * Your team **as it stands** — today's roster, or the future day the request
   * named. This is the "is he on my team" answer: the research board's `My
   * Roster` button and its baseball, the player page's `On roster` badge, the
   * empty-state test. A man you dropped this morning is not on it, whatever
   * range is on screen.
   */
  players: EspnRosterPlayer[];
  /**
   * Your team **as it was at the end of the range in view**, slots and all —
   * the "where was he in my lineup that day" answer, which is what a slot chip
   * is and what the roster's own order is drawn from.
   *
   * Absent on every range ending today or later, where `players` already *is*
   * that day and shipping the same 28 rows twice would say nothing; absent too
   * when the server couldn't read that day, which puts the chips back on
   * today's roster exactly as they were before this existed. Either way the
   * client falls back to `players`, so the ordinary case and the failure case
   * are one line of code rather than two.
   */
  endRoster?: EspnRosterPlayer[] | null;
  /**
   * Your lineup for **each** day of the range in view, as MLB player ids, keyed
   * by date — present only when the request named a `start`, absent (or null)
   * when the read failed.
   *
   * `players[].starting` above is one day's answer, the day the roster was read
   * for; this is every day's, each off that day's own ESPN scoring period. It
   * is what lets the summary table aggregate a week against the lineup that was
   * actually set for each of its days rather than applying today's to all
   * seven. A **missing date** is "we couldn't read that day", not "nobody
   * started" — the client falls back to `starting` there, which is what the app
   * did before this existed.
   */
  lineups?: Record<string, number[]> | null;
}

// ---- The Schedule view -----------------------------------------------------
// Mirrors `server/src/types.ts` by hand, as every type here does.

/**
 * One scheduled game, as the Schedule view reads it — the next fortnight of
 * every club, over the wire once and joined to a row by its player's club.
 *
 * Deliberately thin: the view draws an opponent abbreviation and, on a
 * pitcher's own row, whether he is the man his club has announced, which needs
 * the two ids and nothing else.
 */
export interface ScheduleGame {
  gamePk: number;
  /** The ET baseball day the game counts on, `YYYY-MM-DD`. */
  date: string;
  /** ISO first pitch, or null where the schedule gives none. */
  startTime: string | null;
  homeId: number;
  awayId: number;
  /** Club abbreviations — "MIL". Empty where the teams table couldn't be read. */
  home: string;
  away: string;
  /** MLB's own state. A postponement is not a game he gets and is not counted. */
  state: 'scheduled' | 'live' | 'final' | 'postponed';
  /**
   * Whom each side has *announced*, and nothing more — clubs name a starter
   * about three days out, so a start mark is a fact about the front of the
   * window and an absence past it is the schedule rather than the view.
   */
  homeProbableId: number | null;
  awayProbableId: number | null;
}

/**
 * **Where a live matchup is heading** — one side's projected final total in every
 * category, and the tally that falls out of comparing two of them.
 *
 * Mirrors `server/src/projection.ts` by hand, like every other pair here. What
 * the whole thing is made of, and the four measured inputs behind it, is in that
 * file; the numbers the client draws are these.
 */
export interface EspnProjectedSide {
  teamId: number;
  /** Projected final total per stat id — **the league's own categories only**,
   *  the components the rates were derived from being numbers the server
   *  computed and nothing reads. A count is rounded; a rate is not. */
  scores: Record<number, number>;
  wins: number;
  losses: number;
  ties: number;
  /** What the projection is made of, which is what the key says on screen:
   *  expected batting games, projected starts, projected relief appearances, and
   *  how many men it could not place at all. */
  hitterGames: number;
  starts: number;
  reliefGames: number;
  skipped: number;
}

export interface EspnProjectedMatchup {
  id: number;
  home: EspnProjectedSide;
  /** Null is a bye — a real shape, and one with no result to project though the
   *  side's own total is projected all the same. */
  away: EspnProjectedSide | null;
  /** Never null, unlike the live scoreboard's: this is a claim about the end of
   *  the week and making one is the point of it. */
  winner: 'home' | 'away' | 'tie';
}

export interface EspnProjection {
  matchupPeriod: number;
  /** False where there was nothing to project — a settled week above all, which
   *  is not an error and says so in `note`. */
  ok: boolean;
  note: string | null;
  /** The period's own last ET day, and how many days of it are still to be
   *  played (today included where its games have not started). */
  end: string | null;
  daysLeft: number;
  matchups: EspnProjectedMatchup[];
  fetchedAt: number;
}

/**
 * **The days this fantasy matchup period covers, and the days the next one
 * covers** — the Schedule view's two named spans, and the whole of what a
 * connected league adds to that control.
 *
 * Mirrors `server/src/espn.ts::EspnMatchupWindow` by hand, as everything here
 * does. The dates are the **whole** period rather than the part of it that has
 * been played — see there for why the scoreboard's own `start`/`end` are the
 * wrong two dates for a forward-looking view, and what the derivation was
 * checked against.
 */
export interface MatchupWindow {
  period: number;
  /** `YYYY-MM-DD`, inclusive. */
  start: string;
  end: string;
  /** Absent past the last matchup period the league has. */
  next: { period: number; start: string; end: string } | null;
}

/**
 * One pitcher's rotation slot over the window — what lets the Schedule view mark
 * the turns nobody has announced yet.
 *
 * **Only the unannounced turns are in `starts`.** An announced one is already on
 * the wire as `ScheduleGame.homeProbableId`/`awayProbableId`, so repeating it
 * here would be one fact in two places; the client reads `announced` off the
 * game and these off the map, and they cannot overlap because a projected turn is
 * never placed on a game somebody is named for.
 */
export interface RotationProjection {
  /** How many of his club's games a turn takes — 5 for an ordinary five-man. */
  cadence: number;
  /**
   * True where that cadence is **his club's** rather than his own record's, so
   * the row is one step less certain — `StartTier`'s `estimated` against its
   * `projected`. A pitcher with three starts of his own reads his own pace; a
   * call-up reads the rotation he has just joined.
   */
  estimated: boolean;
  /** The `gamePk`s of his projected turns, in date order. */
  starts: number[];
}

/** The whole window, as `/api/schedule` answers it. */
export interface ScheduleWindow {
  /** First ET day, inclusive — the server's own `baseballToday()`. */
  start: string;
  /** Last ET day, inclusive. */
  end: string;
  /** How many days that is, so a client can tell a short answer from a full one. */
  days: number;
  games: ScheduleGame[];
  /**
   * Player id → his projected turns inside the window, for every pitcher who has
   * one. **A pitcher with nothing to project is absent** rather than present and
   * empty, the rule `/api/statuses` follows for a player with nothing true of
   * him: on a checked board that is 165 of the 335 pitchers who have started a
   * game this season, and sending them would be payload saying nothing.
   */
  rotations: Record<string, RotationProjection>;
}

/**
 * The league scoreboard — one matchup period's matchups, and every team's
 * season-to-date total in each of the league's own scoring categories.
 *
 * Mirrors `EspnScoreboard` and its parts in the server's `espn.ts` by hand,
 * the way every other type in this file mirrors its server twin.
 */
export type EspnScoringFormat = 'h2h-categories' | 'h2h-points' | 'standings' | 'unknown';

/** Which side of the ball a scoring category is scored on. `other` is a real
 *  answer rather than a failure bucket — an ESPN stat id the server's own table
 *  has never been read against — and is drawn in a group of its own rather than
 *  filed under a side nothing establishes it is on. */
export type EspnCategorySide = 'batting' | 'pitching' | 'other';

export interface EspnCategory {
  statId: number;
  label: string;
  name: string;
  /** ERA and WHIP: the smaller number takes the category. */
  lowerBetter: boolean;
  format: 'count' | 'avg' | 'rate';
  /** The side of the ball, and where it reads within that side. The array
   *  itself stays in the **league's own order** — grouping is the client's, and
   *  `categoryGroups` in `LeagueView.tsx` is the one place that does it. */
  side: EspnCategorySide;
  order: number;
}

export interface EspnMatchupSide {
  teamId: number;
  scores: Record<number, number>;
  wins: number;
  losses: number;
  ties: number;
  points: number | null;
  /** How many acquisitions this manager has used in this matchup period. Null
   *  where ESPN reports none. The **limit** is the period's rather than the
   *  team's and rides on the scoreboard — see `EspnScoreboard.acquisitionLimit`. */
  acquisitions: number | null;
}

export interface EspnMatchup {
  id: number;
  home: EspnMatchupSide;
  /** Null is a bye — a real shape in a playoff round, not a failed read. */
  away: EspnMatchupSide | null;
  winner: 'home' | 'away' | 'tie' | null;
}

export interface EspnStandingsTeam {
  id: number;
  name: string;
  abbrev: string;
  logo: string | null;
  wins: number;
  losses: number;
  ties: number;
  gamesBack: number;
  streak: string | null;
  seed: number;
  points: number;
  values: Record<number, number>;
}

export interface EspnScoreboard {
  format: EspnScoringFormat;
  /** ESPN's own word, so an unsupported format can be named rather than
   *  described. */
  scoringType: string;
  matchupPeriod: number;
  prevPeriod: number | null;
  nextPeriod: number | null;
  /** The days the totals cover — for a live matchup, the days played so far. */
  start: string | null;
  end: string | null;
  live: boolean;
  /** How many acquisitions a manager gets in this matchup period, or null where
   *  the league does not limit them per period — which is what makes the client
   *  draw a bare count rather than `5/10`. The server derives it; see
   *  `espn.ts::acquisitionLimitFor`. */
  acquisitionLimit: number | null;
  categories: EspnCategory[];
  matchups: EspnMatchup[];
  teams: EspnStandingsTeam[];
  myTeamId: number | null;
  leagueName: string;
  fetchedAt: number;
}

/**
 * The League page's **Rankings** tab — every team's figure in each scoring
 * category and where that figure stands, over one of five spans.
 *
 * Mirrors `EspnRankings` and its parts in the server's `espn.ts`.
 */
export type EspnRankSpan = 'season' | 'matchup' | 'first' | 'second' | 'playoffs';

export interface EspnRankSpanInfo {
  span: EspnRankSpan;
  label: string;
  /** The matchup periods it is made of, or null for the season — which is
   *  ESPN's own figure rather than a range the server summed. */
  periods: [number, number] | null;
  start: string | null;
  end: string | null;
  /** Whether it reaches into the week being played, which is the difference
   *  between a total and a total *so far*. */
  live: boolean;
}

/**
 * **One whole side of the ball as a single figure** — the question a column of
 * ten ranks cannot answer at a glance.
 *
 * `points` is roto points, `n + 1 − rank` summed over that side's categories,
 * so first place in a twelve-team category is worth 12 and last is worth 1;
 * `rank` is where that total stands. Mirrors
 * `server/src/espn.ts::EspnRankSideTotal`, where the whole of why it is points
 * rather than a mean of ranks — and why a tie shares the better points — is set
 * out.
 */
export interface EspnRankSideTotal {
  points: number;
  rank: number;
  /** How many of that side's categories this team scored in, of how many there
   *  were: the pair that says whether `points` is a full total. */
  categories: number;
  of: number;
}

export interface EspnRankRow {
  teamId: number;
  /** Keyed by stat id. A category with no honest figure for this span is
   *  **absent** rather than zero. */
  values: Record<number, number>;
  /** 1 is best whichever way the category runs, ties sharing a rank. Absent
   *  exactly where the value is. */
  ranks: Record<number, number>;
  /** The whole of one side of the ball, per side the league scores. Absent for
   *  a side with no categories in it. */
  sides: Partial<Record<EspnCategorySide, EspnRankSideTotal>>;
  /** The same over **every** category — the roto total, which is the sum of the
   *  side totals beside it by construction. Absent where there is only one side
   *  to combine, that column being the side's own said twice. */
  overall?: EspnRankSideTotal;
}

/**
 * One day of a matchup period, on the series a category cell opens.
 *
 * Mirrored by hand from `server/src/espn.ts`, like every type in this file.
 */
export interface EspnSeriesDay {
  scoringPeriod: number;
  /** Its ET calendar date, or null where the period anchor could not be read —
   *  which costs the axis its dates and nothing else. */
  date: string | null;
  /** False for a day ESPN would not answer for. Every point from there on is
   *  null: a running total past a hole is not a missing point but a wrong one,
   *  so the chart stops where the series stops knowing. */
  ok: boolean;
}

/**
 * **How each category moved through a matchup period** — what the chart behind
 * a scoreboard cell draws.
 *
 * Keyed by team and stat rather than by matchup, so one read serves every card
 * on the board: the ten cards of a 12-team league are six matchups over the
 * same twelve teams and the same ten categories.
 *
 * The last point of a series **is** the figure on the card above it — checked
 * through both routes on the live league, 120 of 120 cells on a settled week
 * (worst 4.86e-9, which is ESPN's own rounding of an OPS) and 120 of 120
 * exactly on the live one.
 */
export interface EspnMatchupSeries {
  matchupPeriod: number;
  days: EspnSeriesDay[];
  /** Team id -> stat id -> the running figure **after** each day, index-aligned
   *  with `days`. Null is "not known", never zero — an ERA before anybody has
   *  thrown an out and a day that could not be read are both gaps. */
  teams: Record<number, Record<number, (number | null)[]>>;
  fetchedAt: number;
}

export interface EspnRankings {
  span: EspnRankSpan;
  /** Only the spans this league can actually be asked for — a half with no
   *  matchup periods in it is absent rather than served empty, so the tab
   *  strip is drawn from what came back rather than from a list held here. */
  spans: EspnRankSpanInfo[];
  format: EspnScoringFormat;
  scoringType: string;
  categories: EspnCategory[];
  rows: EspnRankRow[];
  teams: EspnStandingsTeam[];
  myTeamId: number | null;
  leagueName: string;
  fetchedAt: number;
}

/**
 * The League page's **Transactions** tab — who added, dropped and traded whom.
 *
 * Mirrors `EspnTransactions` and its parts in the server's `espn.ts`.
 */
export interface EspnTransactionPlayer {
  espnId: number;
  name: string;
  /** The MLB id where the name-and-club join lands on exactly one man, so the
   *  row can open his page; null where it doesn't, and the name draws as
   *  text. */
  mlbId: number | null;
  /** His MLB club, for the cap logo the row's identity block draws — the id the
   *  mark is served by, and the abbreviation that is its `alt`, its tooltip and
   *  what the block prints when there is no mark to draw. Both fall out of the
   *  join that found `mlbId`, so neither is a request of its own; both null on
   *  the row that did not join. */
  mlbTeamId: number | null;
  team: string | null;
  move: 'add' | 'drop';
  via: 'free-agent' | 'waiver' | 'trade';
  toTeamId: number | null;
  fromTeamId: number | null;
  /** ESPN's waiver bid, on a claim that carried one. */
  bid: number | null;
}

export interface EspnTransaction {
  id: string;
  /** Epoch milliseconds. */
  date: number;
  kind: 'add' | 'drop' | 'trade';
  teamIds: number[];
  players: EspnTransactionPlayer[];
}

export interface EspnTransactions {
  transactions: EspnTransaction[];
  /** Whether the read came back at the server's own limit, i.e. whether there
   *  is more season behind it. The page says so rather than implying a
   *  complete record it hasn't got. */
  capped: boolean;
  teams: EspnStandingsTeam[];
  myTeamId: number | null;
  leagueName: string;
  fetchedAt: number;
}
