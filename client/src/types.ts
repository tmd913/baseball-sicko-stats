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
  /** Where the pitch broke, inches, in the app's usual convention: positive
   *  `hBreak` toward third base and positive `vBreak` a rise, for a pitcher of
   *  either hand (see `MovementSample`). These are the individual pitches an
   *  outing's Movement Profile draws its cloud from — the per-type averages on
   *  `PitchMix` cannot stand in for them, the spread *within* a pitch type
   *  being what that chart is read for. */
  hBreak: number | null;
  vBreak: number | null;
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
  /**
   * **Sacrifice flies, and the only reason they are here is the OBP
   * denominator.**
   *
   * On-base percentage is `(H + BB + HBP) / (AB + BB + HBP + SF)` — the one
   * rate in baseball whose denominator is not the plate appearances minus the
   * obvious. The line carried no SF at all, so `lib.ts::lineOps` divided by
   * `AB + BB + HBP` and every OPS in this app ran a hair high. Measured against
   * the live fantasy league: a manager's eleven-day lineup read `.824` where
   * ESPN read `.8221`, and the whole of the difference was two sacrifice flies
   * (143/428 against 143/430).
   *
   * **It costs no upstream read.** A sacrifice fly is already an event on the
   * plate appearances this line is summed from — `sac_fly` and
   * `sac_fly_double_play`, both of which `classifyHit` already had to know
   * about to keep them out of the at-bats. Probed against MLB's own boxscores
   * before it was built on: over **104 player-games** of the live league,
   * deriving SF this way reproduces `sacFlies` exactly, alongside AB, H, BB,
   * HBP and PA — 0 mismatches.
   *
   * **Sacrifice hits are deliberately not here.** SH is not in the OBP
   * denominator and nothing in this app computes anything from it, so it would
   * be a field nobody reads. What the SH side did cost was an at-bat: see
   * `savant.ts::classifyHit`.
   *
   * On a **projected** line this carries the whole sacrifice residue (SF + SH)
   * rather than sacrifice flies alone, which is deliberate and is what makes a
   * projected OPS recompute to the OBP it was built from — see
   * `projection.ts::projectBatter`, where the residue is split.
   */
  sf: number;
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
  /** **The ballpark he would work in**, MLB's own venue id, off the same
   *  fixture the row is built from. Null where the schedule carried none. */
  venueId: number | null;
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
  /**
   * **The whole note, where anything has more of it than the summary above.**
   *
   * A RotoWire note has two halves — the lede that says what happened and the
   * analysis that says what it means — and RotoWire's own player page publishes
   * only the first. CBS republishes the same desk's note entire, and this is
   * that: lede and analysis, `\n\n` between them. See `server/src/cbs.ts` for
   * why CBS is an enrichment of RotoWire's list rather than a source beside it.
   *
   * **Null is the ordinary case and means "this is all there is"** — a
   * transaction has no analysis to have, and CBS can address about two thirds
   * of the pitching board. The client draws no affordance where this is null,
   * which is the rule that a press with nothing behind it is worse than no
   * press: the row is expandable exactly where there is something to expand
   * into.
   *
   * Set only where it is genuinely **longer** than `summary`, not merely
   * present — a note whose lede is the whole note would otherwise offer a
   * reader an expansion that reveals the text he is already looking at.
   */
  full: string | null;
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
  // Whether that at-bat was **still being played** when the day was read — the
  // steal that went behind the batter the Live section is showing, and not yet
  // history. `playerDayEntries` keeps these out of the Recent stream and pins
  // them to the Live section until the play resolves.
  //
  // Absent from a day snapshot written before the field existed, and that reads
  // right: a snapshot holds only finished games, so nothing in one was ever mid
  // at-bat. See the server's copy of this comment.
  midAtBat: boolean;
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
  /** How wide his own season is for this pitch type, in inches — the standard
   *  deviation of the season's per-pitch break. An outing's Movement Profile
   *  draws it as the hatched blob the night's dots are read against, the way the
   *  season chart draws the league's own spread. Null where his season holds
   *  fewer than two of the type. */
  seasonHRange: number | null;
  seasonVRange: number | null;
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
/**
 * **One of the thirty clubs, by id** — the whole of what a client needs to name
 * a team it has only an id for, and the shape `/api/teams` answers in.
 *
 * Three fields because there are three things drawn: the **name** on a team
 * page's head and in the header search's own rows, the **abbreviation** in the
 * places a column is three characters wide, and the **id** everything else is
 * keyed on (the cap logo, the club color table, the schedule's `homeId`, a
 * player's `teamId`).
 *
 * Nothing about a club's *record* or its division rides here: those change
 * daily and are read where they are drawn (`ResearchRow.record`), where this is
 * a table that changes once a decade and is fetched once a session.
 */
export interface TeamInfo {
  id: number;
  name: string;
  /** "MIL". Empty where MLB's teams table carried none. */
  abbreviation: string;
}

/**
 * **Which hitter a park is being read for.** A ballpark is not one park: the
 * same fence is a short porch to one side of the plate and a long out to the
 * other, and the gap is large enough to change how a game reads. Measured on
 * the 2026 board — Yankee Stadium's home-run index is **139 to a left-handed
 * hitter and 105 to a right-handed one**, Oracle Park's **64 and 83** — which
 * is why this is a cut of the data rather than a footnote on it.
 *
 * `all` is both hands together, and is what a *pitcher* is shown: he faces
 * whichever nine the other club writes down, so the park he works in is the
 * park as it plays to everybody.
 */
export type ParkHand = 'all' | 'L' | 'R';

/**
 * One park's Statcast indexes for one hitter hand.
 *
 * **100 is the average park, and every field is scaled to it** — 109 means a
 * plate appearance here produces 9% more of that stat than the same plate
 * appearance in a neutral park would, and 91 means 9% less. So a number above
 * 100 favors the hitter on every row *except* `so`, where more strikeouts is
 * the pitcher's gain; the client's key is what says so, since nothing about the
 * number itself can.
 *
 * Every field but `woba` and `pa` is nullable: Savant leaves a cell empty on a
 * park with too little of that event to index (a venue with three hundred
 * plate appearances at it has no triples rate worth printing), and an absent
 * index is drawn as a dash rather than as a 100 it has not earned.
 */
export interface ParkIndexes {
  /** **The headline** — the number Savant's own board calls *Park Factor*, and
   *  the one figure this app leads with everywhere it shows a park. */
  woba: number;
  runs: number | null;
  hr: number | null;
  /** Strikeouts. **The one row where above 100 is the pitcher's** — see above. */
  so: number | null;
  bb: number | null;
  obp: number | null;
  hits: number | null;
  singles: number | null;
  doubles: number | null;
  triples: number | null;
  hardHit: number | null;
  /** wOBA on contact — the park with the strikeouts taken out of it. */
  wobaCon: number | null;
  xwobaCon: number | null;
  xbaCon: number | null;
  baCon: number | null;
  /** wOBA excluding the times through the order Savant excludes. */
  wobaTto: number | null;
  /** Plate appearances the cut is measured over — what says whether a 164 is a
   *  park or a small sample. A neutral-site venue can carry a few hundred. */
  pa: number;
}

/** One ballpark, cut three ways. */
export interface ParkFactor {
  venueId: number;
  /** "Coors Field". */
  venue: string;
  /**
   * The club whose home park this is, or **null for a neutral site** — the
   * handful of venues a season is played at that nobody is at home in. Savant
   * spells those with a negative `main_team_id`; this is the null that spelling
   * becomes, and the reason a game's park is joined on its **venue** and never
   * on its home club.
   */
  teamId: number | null;
  /** "Rockies", as Savant names the club; null on a neutral site. */
  club: string | null;
  hands: Record<ParkHand, ParkIndexes | null>;
}

/** Every park, as `/api/park-factors` answers it. */
export interface ParkFactors {
  season: number;
  /** Venue-name order, which is the order a reader meets them in. */
  parks: ParkFactor[];
}

/** Which side of the ball a club's splits are read from.
 *
 * **`batting` is the club at the plate** — how they have hit, cut by the hand
 * on the mound. That is what a watched pitcher's opponent table has always
 * asked for, and it is the default everywhere for that reason.
 *
 * **`pitching` is the same club in the field**, which is to say the line
 * *opposing batters* have put up against them, cut by the batter's own hand.
 * It is the exact mirror off the exact same rows of the same day export — see
 * `teamHitting.ts` — which is why it is a parameter rather than a second table:
 * a club's pitching line **is** its opponents' batting line.
 */
export type TeamSplitSide = 'batting' | 'pitching';

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
  /**
   * **Which side of the ball these nine cuts are**, on the wire so the answer
   * says what it is an answer to — the rule `PlayerWindows.cut` follows, and
   * for the identical reason: the team page re-reads this table when the reader
   * presses the side switch, and a stale answer landing on a fresh one would
   * otherwise be a club's *hitting* under three rows headed `vs RHB`.
   *
   * Optional, because a blob stored before the pitching side existed
   * deserializes without it; absent means `batting`, which is what every one of
   * those blobs holds.
   */
  side?: TeamSplitSide;
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
  /**
   * **The ballpark this game is played in**, MLB's own venue id — what the park
   * factors on a game preview are joined on. Null on a game read before this
   * was captured, and on any feed that carried no venue.
   *
   * The **venue** rather than the home club, which are the same thing all but a
   * handful of times a season and are not the same *fact*: a Reds "home" game
   * in Mexico City is not played in Great American Ball Park, and joining on
   * the club would quietly show the reader the wrong park's numbers. Savant's
   * board carries those neutral sites as venues of their own, so the honest
   * join is available and is the one taken — *a join fails to null, never to a
   * guess*.
   */
  venueId: number | null;
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
 * **A stretch of a player's season in one state** — on the injured list, in the
 * minors, designated for assignment, on nobody's roster. Folded out of his
 * transactions by `stints.ts`, whose file comment carries the reading.
 *
 * `status` is `null` for the stretches he was **available**, which is the state
 * that makes a game he is missing from a day he did not get into rather than a
 * day he was not there for. `to` is exclusive and `null` on the stint he is
 * still in.
 */
export interface PlayerStint {
  from: string; // "2026-06-02"
  to: string | null;
  status: string | null; // "10-day IL", "Minors — Memphis Redbirds", null
  /** His major-league club through the stint, or null where he was on none of
   *  them. It is here so the gap walk need not guess which club's fixtures a
   *  day he did not play belongs to — the alternative was the club of his
   *  nearest played game, which is wrong on exactly the days either side of a
   *  trade, the days it would most be asked. */
  club: number | null;
  detail: string; // MLB's own sentence, for the row's title
}

/**
 * **A row of a batter's game log that is not a game he played.**
 *
 * The log is a list of games he appeared in, and for its whole life the days it
 * left out were left out identically whether he had the day off or was six
 * weeks into a rib fracture. These are those days, and they come back beside the
 * games rather than merged into them so that everything already reading
 * `games` — the Overview's five-game preview, the season totals row — keeps
 * reading exactly what it read before.
 *
 * Two shapes, because the two silences are not the same size. **A day off is a
 * game**, with an opponent and a score and a result, and reads as a log row with
 * dashes where the stats would be. **An absence is a stretch**, and a man who
 * missed May reading as thirty near-identical rows would bury the season he did
 * play; it collapses to one row naming the state and counting the games it cost.
 */
export type GameLogGap =
  | ({ kind: 'dnp' } & GameLogEntry)
  | {
      kind: 'absence';
      /** Inclusive, both ends — the first and last of *his club's games* the
       *  stint covers, rather than the stint's own dates, so the range a row
       *  prints is a range the reader can count games in. */
      from: string;
      to: string;
      /** How many of his club's games it cost him. The one number that says how
       *  much of the season this row is standing for. */
      games: number;
      status: string; // "10-day IL"
      detail: string; // MLB's own sentence
    };

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
  // His team's result, **null until the game is actually final**. The server
  // gates it on `state` rather than passing MLB's `isWin` through, that field
  // being filled while a game is still being played; see the server's copy.
  win: boolean | null;
  // Where the game itself is, and MLB's own label for it ("In Progress",
  // "Suspended: Rain"). `state` is null and the label empty when the season
  // schedule had no entry for the game — the same miss that nulls the scores.
  // The label is a wire value: its spelling is MLB's, not ours.
  state: GameStatus['state'] | null;
  detailedState: string;
  // The score from his side of it, so the row reads "W 5-3" rather than needing
  // the reader to know which team was home — the score *so far* on a game still
  // being played. Both null when the score lookup failed or the game hasn't
  // started.
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
  /**
   * **The club's own MLB id**, beside the name above — what anything going from
   * a player to his club is keyed on: the link off his page to the team page,
   * and the club a team page's roster tab selects its players by. Matching on
   * `team` instead would be a join on a display string, which is the one thing
   * the app's join rule forbids.
   *
   * Null for a free agent, whom MLB files under no club. A reader draws nothing
   * rather than a guess.
   */
  teamId: number | null;
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
  /**
   * Which cut of the spans these rows are, or null/absent for all of them.
   *
   * On the wire so the answer says what it is an answer to: the table is
   * re-read when the reader picks a cut, and a stale reply landing on a fresh
   * one would otherwise be five rows of the wrong split with nothing to say so.
   * The read is sequence-numbered as well — this is the belt to those braces.
   */
  cut?: SplitCut | null;
}

/**
 * The four ways the Stats tab will cut a span.
 *
 * **The handedness pair names the *other* man's hand**, which is what a platoon
 * split means on both boards: `vsr` reads as *vs RHP* on a batter's page and
 * *vs RHB* on a pitcher's. One value rather than four, because the axis is the
 * same one and the label is a fact about whose page it is — the same economy
 * `PlatoonSplits` already makes.
 *
 * Mirrors `server/src/types.ts` by hand, like everything else in this file.
 */
export type SplitCut = 'vsr' | 'vsl' | 'home' | 'away';

/** In the order the control offers them: the hands, then the ballpark. */
export const SPLIT_CUTS: SplitCut[] = ['vsr', 'vsl', 'home', 'away'];

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
  /**
   * **Hit by pitch and sacrifice flies, on a projected row and nowhere else.**
   *
   * No column prints either, and the measured board does not carry them: they
   * are here because the client scores a projected line against the reader's
   * league categories (`categoryValue.ts`), and on-base percentage is the one
   * rate in baseball whose denominator is not the obvious one — `AB + BB + HBP +
   * SF`. Every other term that arithmetic needs is on the row or falls out of
   * what is; these two do not, and a league scoring OBP or OPS would otherwise
   * be scored two terms short of its own denominator.
   *
   * Optional because the measured board has no use for them and no reader of
   * one, which is this repo's own rule read forwards: a field is added with its
   * first reader, not before it.
   */
  hbp?: number;
  sf?: number;
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
   *  on. Computed server-side so one definition of a starter serves the SP/RP
   *  pills' fallback; it used to serve the qualifier below too, and no longer
   *  does — Savant's rule makes no starter/reliever split. The SP/RP pills read
   *  ESPN's season-long eligibility where there is one and fall back to this
   *  where there isn't, so the two answers may differ — see `espnPositions` in
   *  ResearchTable.tsx. Always false on a batter row. */
  starter: boolean;
  /** **Savant's percentile bar for this window** — 2.1 plate appearances per
   *  team game for a batter, 1.25 batters faced for a pitcher, measured against
   *  games **his team** played inside the span rather than games he played,
   *  which is the whole point of it. Not MLB's 3.1-PA rate-stat qualifier; see
   *  `qualifies` in research.ts for the measurement that pins each figure.
   *
   *  **This is what the percentile scale is built from** — the rows where it is
   *  true are the population `rankScales` ranks within, on the board and on the
   *  player page's Stats tab alike. A row where it is false is still drawn and
   *  still badged, placed on that scale with a dashed ring saying he is not one
   *  of them (`columnRanks.tsx`). **False on every row of the team reading**,
   *  where thirty clubs have all played the whole span and a bar would
   *  partition nothing — which is what puts `rankScales` on its
   *  nobody-qualifies path and builds the scale over all thirty. */
  qualified: boolean;
  /**
   * **The club's won-lost record over the same span the row's numbers are** —
   * only ever set on a **team** row, where it takes the place of the position
   * list under the name (a club has no position and no hand). Absent on every
   * player row.
   *
   * Span-matched rather than season-long: every other number on a 7-day team
   * row covers those seven days, and a season record among them would be the
   * one figure on the line answering a different question. Null where the
   * standings or the schedule could not be read.
   */
  record?: { wins: number; losses: number } | null;

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

  /**
   * **The fixture a one-day projection is drawn over** — only ever set on a row
   * of the *projected* board, and only where that board's span is a single day.
   *
   * It is the projected reading's answer to the same question `Opp` answers on
   * the measured board: *who is he facing*. That column reads today's status
   * map, which is a fact about **this afternoon** and says nothing whatever
   * about the Thursday a reader has just narrowed a projection to — so under
   * the lens the cell is drawn from this instead, and the two never meet.
   *
   * **Absent over a range**, which is not an omission: a week is a week of
   * fixtures and naming one of them would be the one cell on the row describing
   * a different span from the figures beside it. The board draws `Games` there
   * instead, the rule the roster's own projected reading already follows.
   */
  projGame?: ProjectedFixture | null;
}

/**
 * **One club's game on the day a projection was narrowed to**, from the side of
 * the man whose row it is. Mirrors `server/src/types.ts` by hand.
 *
 * Deliberately the *fixture* and not a game state: the day this describes has
 * not been played, so there is no score, no inning and no `Final` to draw —
 * which is why it is not `PlayerStatus`'s opponent read a second way.
 */
export interface ProjectedFixture {
  gamePk: number;
  /** The other club's abbreviation — "SEA". */
  opponent: string;
  /** His club is at home, which is what decides `vs` against `@`. */
  isHome: boolean;
  /** ISO first pitch, or null where the schedule gives none. */
  startTime: string | null;
  /** The man the other club is throwing, or null where nobody is named and no
   *  rotation slot puts anybody there. */
  starter: ProjectedStarter | null;
}

export interface ProjectedStarter {
  id: number;
  name: string;
  /** `R` / `L`, or null where MLB lists none. */
  hand: string | null;
  /** Which of the app's three tiers the start is — `announced` where his club
   *  has named him, `projected` where his own rotation slot puts him there,
   *  `estimated` where his club's pooled rotation does. The same ladder
   *  `StartTier` draws in the Schedule view's own cell. */
  tier: 'announced' | 'projected' | 'estimated';
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
  /**
   * The research board's **projected** reading, per kind — a third entry
   * alongside the two above and its own for the identical reason the Stats
   * tab's is: the lens offers a **strict subset** of the board's vocabulary
   * (only what a projection can actually fill), so a write from it would drop
   * every Statcast and roster-% column from the board's saved list. Absent
   * means that kind's projected defaults, the same convention.
   */
  projectedColumns?: Partial<Record<PlayerKind, string[]>>;
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
  /** **Absent, `null` and `0` are three different answers.** Absent is flat —
   *  the server drops zeroes to keep the blob small and the client fills them
   *  back. `null` is *withheld*: the baseline for that man is known to be
   *  another player's, so nothing knows how he has moved and the column draws a
   *  dash. Mirrors `RosterTrendWindow` in the server's `espn.ts`, where
   *  `snapshotKey` carries the reasoning. */
  delta: Record<number, number | null>;
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
  /**
   * The league's rostered players **that `/api/players` does not carry** — the
   * prospects, resolved against MLB's own player search. Mirrors
   * `EspnOwnership.beyondMlb` in the server's `espn.ts`.
   *
   * `/api/players` is `sports/1/players`, the season's *major leaguers*, so a
   * man who has never appeared in a major-league game is in neither it nor the
   * name index built from it. App merges these rows into that list, which is
   * the whole of what makes a prospect findable in the header search and
   * openable as a player page. His `team` is where he actually is — `Arkansas
   * Travelers`, not a major-league club he has never played for.
   */
  beyondMlb: SeasonPlayer[];
  /** Roster entries read, and how many found an MLB player. The gap was
   *  prospects who have never played a major-league game and is now almost
   *  nothing, the prospect fallback having closed it (316 of 316 on the live
   *  league, against 311 before it); it is carried so a match that has silently
   *  stopped working is visible rather than showing up as a league where
   *  everyone is a free agent. */
  rosterCount: number;
  matched: number;
  fetchedAt: number;
}

/** One player on the user's fantasy roster, joined to his MLB id. Mirrors
 *  `EspnRosterPlayer` in the server's `espn.ts`. */
export interface EspnRosterPlayer {
  espnId: number;
  name: string;
  /** Null when the name matched nobody at all. It used to be null for every
   *  prospect; the fallback that resolves them has all but emptied it, and what
   *  is left is a genuine ambiguity the club could not settle — two men of one
   *  name, neither on the club ESPN says — which is left **unmatched rather
   *  than guessed**, because marking the wrong Wilmer Flores as owned is worse
   *  than marking neither. Such a row keeps his name and loses his links. */
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
   * Your lineup for **each** day of the range in view, as **player keys**
   * (`batter-660271`), keyed by date — present only when the request named a
   * `start`, absent (or null) when the read failed.
   *
   * `players[].starting` above is one day's answer, the day the roster was read
   * for; this is every day's, each off that day's own ESPN scoring period. It
   * is what lets the summary table aggregate a week against the lineup that was
   * actually set for each of its days rather than applying today's to all
   * seven. A **missing date** is "we couldn't read that day", not "nobody
   * started" — the client falls back to `starting` there, which is what the app
   * did before this existed.
   *
   * **Keys rather than MLB ids because a seat has a side of the ball.** ESPN
   * seats a two-way player once and the app draws him as two rows, so an id
   * put Ohtani's `UTIL` afternoon on his pitching row as well as his batting
   * one. The server reads the slot off the same per-day roster this map is
   * derived from — `espn.ts::seatKinds` — so the answer is per day rather than
   * per range.
   */
  lineups?: Record<string, string[]> | null;
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
  /** **The ballpark**, MLB's own venue id — what a fixture's park factors are
   *  joined on. Null where the schedule carried none. The venue rather than
   *  `homeId` deliberately; see `PlayerGame.venueId`. */
  venueId: number | null;
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
 * **What one player is expected to do over the days still to be played** — the
 * Roster view's `Projected` toggle, one line per man.
 *
 * Mirrors `server/src/projection.ts` by hand, like every other pair here. It is
 * the *same* engine the matchup card's figures come off, asked a different
 * question: that one wants a team's total added to what ESPN has already
 * scored, and this wants a line per player. Which is why these are the table's
 * own `BattingLine` / `PitchingLine` rather than a shape of their own — a
 * projected row is the summary table's row over different numbers, exactly as a
 * projected matchup card is the scoreboard's card over different numbers.
 *
 * **Only the games still to be played are in it**, and the client adds the
 * report's own lines for the days already played. That is what makes an
 * arbitrary range need no case of its own: a past range projects nothing and
 * reads as it always did, a future one is projection alone, and one straddling
 * today is the two halves added.
 */
export interface ProjectedPlayerLine {
  key: string;
  id: number;
  kind: PlayerKind;
  /** What the line was drawn over — a batter's expected games, a pitcher's
   *  starts plus relief appearances. **Zero is an honest absence** (a club with
   *  no game left in the span, a starter whose turn does not fall in it, a man
   *  neither board has a row for) and is drawn as dashes rather than as a line
   *  of noughts, which would claim he plays and does nothing. */
  chances: number;
  batting: BattingLine | null;
  pitching: PitchingLine | null;
  /**
   * **What the projection would actually start him for**, or null where there
   * is no lineup to fill — a saved watchlist rather than a fantasy team, a
   * league that published no slot counts, or a read that failed.
   *
   * The line above is *what he would do if he plays* and this is *what he is
   * projected to be given*. The row draws the first and the `Total` sums the
   * second; the server's copy of this interface has the argument.
   */
  lineup: {
    /** Day, and the slot he holds it at, in date order. Empty means the plan
     *  benches him every day of the span. */
    days: { day: string; slot: string }[];
    /** Every day he could have been started on — his club's games, or a
     *  starter's turns — so an idle club never reads as a benching, and the
     *  chip's tooltip can name the days he sits out. */
    openDays: string[];
    chances: number;
    batting: BattingLine | null;
    pitching: PitchingLine | null;
  } | null;
}

export interface RosterProjection {
  /** The span actually projected — `start` clamped forward to today, a day that
   *  has been played being nobody's to project. */
  start: string;
  end: string;
  /** Days of it that still have a game to be played. Zero means there was
   *  nothing to project, which the view says in words. */
  daysLeft: number;
  players: ProjectedPlayerLine[];
  fetchedAt: number;
}

/**
 * **What one player is expected to do in one game** — the line a game preview
 * draws under the ballpark and the split, and the narrowest of the three
 * questions the projection engine is asked.
 *
 * Mirrors `server/src/projection.ts::GameProjection` by hand, like every other
 * pair here, and it is the *same* engine the roster's toggle and the board's
 * lens come off — narrowed to one man and one fixture rather than a second
 * arithmetic. Two engines answering *what is he worth tonight* is the drift the
 * server's copy of this interface has the argument against.
 *
 * **`chances` is a fraction on purpose** and the line beside it is worth that
 * fraction. A batter who sits one start in five is `0.8` of a game and eight
 * tenths of a line; a reliever nobody knows will warm up is `0.4` of an
 * appearance. **Zero is the honest absence** — a day already played, a game
 * already under way, a man neither board has a row for — and every figure
 * beside it is null, which the dialog draws as a sentence naming the cause
 * rather than as a line of noughts.
 */
export interface GameProjection {
  playerId: number;
  kind: PlayerKind;
  /** **The game asked about, echoed back** — what a slow read is checked
   *  against, so an answer for the fixture the reader has left cannot land in
   *  the box they have moved on to. */
  gamePk: number;
  /** Its date, echoed for the same reason. */
  date: string;
  chances: number;
  /** 1 where this is one of his turns, 0 where he would be coming out of the
   *  bullpen — what the head's chip is written from. */
  starts: number;
  batting: BattingLine | null;
  pitching: PitchingLine | null;
  /** The fixture as the projection sees it — the opponent, the side, and the
   *  arm the other club is throwing with the tier that says how firm that is.
   *  Null where the game is not one his club has left to play. */
  fixture: ProjectedFixture | null;
  fetchedAt: number;
}

/**
 * **The research board, projected** — every row of the league over a span of
 * days nobody has played yet, in place of the season or window the board
 * ordinarily draws.
 *
 * **The rows are `ResearchRow`s and that is the whole economy of it.** A
 * projected board is this board over different numbers, exactly as a projected
 * roster row is the summary table's row over different numbers: the sort, the
 * filters, the position pills, the include buttons, the marks and the identity
 * block are all phrased in that vocabulary and none of them had to be told
 * anything. What the lens changes is which *columns* are drawn — the ones the
 * projection can actually fill — and the numbers in them.
 *
 * **Every stat field the projection cannot fill is `null`, not carried over
 * from the season row.** A projected line and a measured Statcast reading on
 * one row would be two arithmetics on one line, which is the thing this
 * codebase spends its length preventing; the narrowed vocabulary means nobody
 * ever draws them, and a filter left over from the measured board finds a null
 * rather than last month's barrel rate.
 */
export interface BoardProjection {
  kind: PlayerKind;
  /** The span actually projected — `start` clamped forward to today, a day that
   *  has been played being nobody's to project. */
  start: string;
  end: string;
  /** Days of it that still have a game to be played. Zero means there was
   *  nothing to project, which the board says in words rather than drawing six
   *  hundred rows of dashes with nothing to explain them. */
  daysLeft: number;
  /** **True where the span is one day**, which is the condition `projGame` is
   *  filled under — carried rather than re-derived from `start === end` because
   *  the two dates are the *clamped* span and the client's own are what the
   *  reader picked. */
  oneDay: boolean;
  rows: ResearchRow[];
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

/** One matchup period the league's schedule carries, with the days it covers —
 *  the **observed** span, exactly as `EspnScoreboard.start`/`end` are, so the
 *  week list and the header above it cannot print different days for the week
 *  being played. Null dates where the period anchor could not be read. */
export interface EspnPeriodSpan {
  period: number;
  start: string | null;
  end: string | null;
}

export interface EspnScoreboard {
  format: EspnScoringFormat;
  /** ESPN's own word, so an unsupported format can be named rather than
   *  described. */
  scoringType: string;
  matchupPeriod: number;
  prevPeriod: number | null;
  nextPeriod: number | null;
  /** Every matchup period the schedule has materialised, in order. The two
   *  arrows are members of this list; the header's own press draws the rest of
   *  it as a list of weeks. */
  periods: EspnPeriodSpan[];
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
export type EspnRankSpan = 'season' | 'matchup' | 'first' | 'second' | 'playoffs' | 'week';

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
  /** Whether this span could carry a projection at all — the `matchup` span of
   *  a week still being played, and nothing else. It is the server's answer
   *  rather than a rule held here, so the toggle is drawn off the league's own
   *  week; **absent rather than disabled** anywhere else. */
  projectable: boolean;
  /** Whether the figures on this response *are* the projection — not the same
   *  question as whether the reader asked for one, which is why the toggle's
   *  lit state reads this rather than the request. */
  projected: boolean;
  /** The day the projection runs to and how many of the period's days are still
   *  to be played — the caption's own two figures, and the key's `days`. */
  projectedEnd: string | null;
  projectedDaysLeft: number;
  /** Only the spans this league can actually be asked for — a half with no
   *  matchup periods in it is absent rather than served empty, so the tab
   *  strip is drawn from what came back rather than from a list held here.
   *  **`week` is never in it**: the strip offers five named cuts and the
   *  league has nineteen weeks, so a picked one rides on `week` below. */
  spans: EspnRankSpanInfo[];
  /** **The one matchup period this table is of**, where the reader picked a
   *  week off the league's calendar rather than one of the five spans — and
   *  null where they did not. Its `live` is always false: the week being
   *  played is `matchup`, the rule, rather than the range it happens to be. */
  week: EspnRankSpanInfo | null;
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

/* ────────────────────────────────────────────────────────────────────────────
 * A game's own page
 *
 * Everything below is `/api/games/:gamePk` — the box score, both clubs'
 * rosters and the whole play stream, for one game, drawn on the page a live
 * or finished opponent cell and a club's Results tab open.
 *
 * **It is a shape of ours rather than MLB's**, built in `game.ts` off the
 * `feed/live` payload the day pipeline already reads. The alternative — widen
 * `StatsApiGame` and bump `FEED_CACHE_VERSION` — was rejected: that type is
 * cut *per player* (a batter's plate appearances, a pitcher's line) because
 * every one of its readers is a player, and the six hundred blobs already on
 * disk would each have been re-fetched to carry a linescore no day view draws.
 * ──────────────────────────────────────────────────────────────────────────── */

/** One club's half of a game — its line score, its box score and its roster. */
export interface GameTeamLine {
  teamId: number;
  /** In full, for the page's head. */
  name: string;
  /** `MIL`, which is what every table in the app calls this club. */
  abbr: string;
  runs: number | null;
  hits: number | null;
  errors: number | null;
  /** Men left on base — the box score's own last column. */
  lob: number | null;
  /** Whom this side announced, which is all there is before first pitch. */
  probablePitcherId: number | null;
  probablePitcherName: string | null;
  /** In batting order: the nine who started, each followed by whoever hit in
   *  his slot after him. Empty until MLB posts the lineup. */
  batters: GameBatterLine[];
  /** In the order they took the mound — `[0]` is the starter. */
  pitchers: GamePitcherLine[];
  /** The men on the active roster who did not appear, as MLB files them. */
  bench: GameRosterMan[];
  bullpen: GameRosterMan[];
  /** The club's own totals, for the foot of each box score table. */
  batting: GameBattingTotals | null;
  pitching: GamePitchingTotals | null;
}

/** A man on the roster who has not appeared — the bench and the bullpen. */
export interface GameRosterMan {
  id: number;
  name: string;
  /** His listed position, or null where the boxscore names none. */
  pos: string | null;
  /** `L` / `R` / `S` — which side he hits from, or which arm he throws with. */
  hand: string | null;
}

/** One man's batting line for the game. */
export interface GameBatterLine {
  id: number;
  name: string;
  /** The position he took the field at. */
  pos: string | null;
  /**
   * His slot, 1–9.
   *
   * **Never null on a row that reaches a client**, though the type allows it:
   * a man MLB gives no `battingOrder` was never in the order at all — the
   * relievers MLB appends to its own `batters` list — and `game.ts` drops him
   * rather than filing him at the foot of the table with a `.000` line. The
   * null survives on the type because it is what the wire says, and a reader of
   * this file should know that the absence means *not in the order* rather than
   * *slot unknown*.
   */
  order: number | null;
  /**
   * **How far down the slot he is** — 0 for the man who started it, 1 for the
   * first off the bench, and so on. It is MLB's own `battingOrder` read as the
   * two numbers it is (`"801"` is the second man in the eighth slot), which is
   * what lets the table indent a substitute under the man he came in for
   * rather than filing him as a tenth hitter.
   */
  sub: number;
  ab: number;
  r: number;
  h: number;
  rbi: number;
  bb: number;
  k: number;
  hr: number;
  lob: number;
  /** MLB's own one-line summary — `1-4 | K, R`. */
  summary: string | null;
  /** His season line as MLB prints it, for the two columns beside the game's. */
  avg: string | null;
  ops: string | null;
}

/** One man's pitching line for the game. */
export interface GamePitcherLine {
  id: number;
  name: string;
  /** `5.2` — five innings and two outs, MLB's own spelling. */
  ip: string;
  h: number;
  r: number;
  er: number;
  bb: number;
  k: number;
  hr: number;
  pitches: number;
  strikes: number;
  battersFaced: number;
  /** `(W, 10-5)` as MLB writes it beside his name, or null. */
  decision: string | null;
  /** His season ERA, as MLB prints it. */
  era: string | null;
  /** Whether this was a start, which is what separates the first line from the
   *  relief that follows it. */
  started: boolean;
}

export interface GameBattingTotals {
  ab: number;
  r: number;
  h: number;
  rbi: number;
  bb: number;
  k: number;
  lob: number;
  avg: string | null;
  ops: string | null;
}

export interface GamePitchingTotals {
  ip: string;
  h: number;
  r: number;
  er: number;
  bb: number;
  k: number;
  hr: number;
  pitches: number;
  strikes: number;
}

/** One inning of the line score. */
export interface GameInning {
  num: number;
  /** **Null runs is a half nobody played** — the bottom of the ninth with the
   *  home club ahead — which is the `x` a line score prints there, and is a
   *  different fact from the 0 of a half that was played and scored nothing. */
  away: number | null;
  home: number | null;
}

/** The winning, losing and saving pitchers, once MLB has closed the box. */
export interface GameDecision {
  role: 'W' | 'L' | 'S';
  id: number;
  name: string;
}

/** **One game, whole** — what `/api/games/:gamePk` answers with. */
export interface GameReport {
  gamePk: number;
  status: GameStatus;
  /** MLB's official ET date for the game, `YYYY-MM-DD`. */
  date: string;
  venueId: number | null;
  venueName: string | null;
  attendance: number | null;
  /** Once MLB has closed the box, in minutes. */
  durationMinutes: number | null;
  /** `89 degrees, Partly Cloudy · 8 mph, In From LF`, or null. */
  weather: string | null;
  away: GameTeamLine;
  home: GameTeamLine;
  innings: GameInning[];
  /** How many innings the game was scheduled for — 9 ordinarily, and the
   *  number a line score's empty columns are drawn out to. */
  scheduledInnings: number;
  decisions: GameDecision[];
  /** The box score's own footnotes — pitches-strikes, umpires, first pitch.
   *  MLB's labels and values, unedited. */
  notes: { label: string; value: string }[];
}

/**
 * One row of a club's **Results** tab — a game it has played or is playing.
 *
 * Deliberately not `ScheduleGame`: that type is the *forward* window and is
 * thin on purpose (no score, because there is none yet). This is the backward
 * one, and the score is the whole of what it is for.
 */
export interface TeamGameResult {
  gamePk: number;
  /** MLB's official ET date, `YYYY-MM-DD`. */
  date: string;
  startTime: string | null;
  /** Whether the club whose page this is was at home. */
  home: boolean;
  opponentId: number;
  opponent: string;
  state: 'scheduled' | 'live' | 'final' | 'postponed';
  detailedState: string;
  teamScore: number | null;
  opponentScore: number | null;
  /** Null on a game with no winner — one still being played, and a tie. */
  won: boolean | null;
  /** Where a live game has got to, so a row can say `Top 6`. */
  inning: number | null;
  inningState: string | null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The MLB view — the league itself, rather than a roster or a fantasy league
 *
 * Three readings, one per tab: the day's games, where the thirty clubs stand,
 * and what has been said about them. Everything below is the wire shape of one
 * of those three, and all three are **league-wide and user-independent** —
 * which is the class `getPlayerPool` and the recent-news sweep are in, so each
 * is one upstream read shared by every reader rather than one per session.
 * ──────────────────────────────────────────────────────────────────────────── */

/** One club's half of a scoreboard row. */
export interface MlbScoreboardTeam {
  id: number;
  /** In full — `Tampa Bay Rays`. The card draws the club name and the crest is
   *  joined on the id, so no abbreviation is needed for the card itself; it is
   *  here because a narrow card prints it in place of the name. */
  name: string;
  /** "TB". Empty where MLB's teams table carried none — the join-to-null rule
   *  one cell wide, and the card falls back to the name. */
  abbreviation: string;
  /** Null before a pitch is thrown, which is a different fact from `0`. */
  score: number | null;
  /** The club's record **going into this game**, which is what MLB's schedule
   *  carries and is the honest reading of a row about that game. */
  wins: number | null;
  losses: number | null;
  /** Whom the club has *announced*, and nothing more — `ScheduleGame`'s own
   *  rule. Null on a game already being played, where the starter is a fact
   *  about the box score rather than a promise. */
  probableId: number | null;
  probableName: string | null;
  /** Null on a game with no winner, which is two things at once — one still
   *  being played, and a tie. `TeamGameResult.won`'s rule. */
  winner: boolean | null;
}

/** One game on the day's board. */
export interface MlbScoreboardGame {
  gamePk: number;
  /** The ET day MLB files it on, `YYYY-MM-DD`. */
  date: string;
  /** ISO first pitch, or null where the schedule gives none. */
  startTime: string | null;
  /** MLB's own state, off the two predicates every reading of a status in this
   *  server goes through. Postponed is tested first — see `stateOf`. */
  state: 'scheduled' | 'live' | 'final' | 'postponed';
  /** MLB's wording — `Final`, `Warmup`, `Postponed`, `Delayed: Rain`. What the
   *  card prints where it has no better line of its own. */
  detailedState: string;
  /** Why a game was called off or held up, where MLB gives a reason. */
  reason: string | null;
  away: MlbScoreboardTeam;
  home: MlbScoreboardTeam;
  /** Where a live game has got to, so a row can say `Top 6`. Null on anything
   *  not being played — including a game MLB calls Live at Warmup, which it
   *  hands a `Top 1` linescore half an hour before anybody plays it. */
  inning: number | null;
  inningState: string | null;
  outs: number | null;
  /**
   * **Who is at the plate, who is on the mound, and who is on base** — the
   * three facts a scoreboard card is being watched for, and all three are on
   * the same `linescore` hydration the half-inning already comes from
   * (`offense.batter`, `defense.pitcher`, `offense.first`/`second`/`third`).
   * Measured: they cost nothing beyond the `fields=` names, the read staying at
   * ~11KB for a fifteen-game day.
   *
   * **Null on anything not being played**, and that gate is not cosmetic: MLB
   * goes on sending a whole `offense`/`defense` block on a game that finished
   * three hours ago — the last man to bat, the last man to pitch — which on a
   * `Final` card would be a live matchup drawn under a final score. It is the
   * `probablePitcher` fault read from the other end.
   *
   * **Between halves the pair is the half about to be played.** MLB swaps
   * `offense` and `defense` the moment an inning's third out is made, so a
   * board on `Middle 6` carries the pitcher and the leadoff man of the bottom —
   * measured on 2026-08-25, where a `Middle 6` game read `P Clay Holmes` with
   * the other club's batter beside him and the bases cleared. The card says
   * `DUE` rather than `AB` there, which is the only thing that would otherwise
   * be a claim about a fact.
   */
  bases: BaseState | null;
  atBat: { id: number; name: string } | null;
  onMound: { id: number; name: string } | null;
  /** The ballpark, for the card's second line. */
  venue: string | null;
  /** Which game of the series this is, and how many there are — `Game 2 of 3`.
   *  Null where the schedule carried neither. */
  seriesGame: number | null;
  seriesLength: number | null;
  /** The three pitchers a finished game names. Null until it is final. */
  winPitcher: { id: number; name: string } | null;
  lossPitcher: { id: number; name: string } | null;
  savePitcher: { id: number; name: string } | null;
}

/** One ET day's games, as `/api/mlb/scoreboard` answers it. */
export interface MlbScoreboard {
  /** The day asked for, `YYYY-MM-DD`. */
  date: string;
  games: MlbScoreboardGame[];
  fetchedAt: number;
}

/** A won-lost pair, as a board draws it — `43-23`. Null where the club has not
 *  played a game the cut selects, which on a seven-day window is an ordinary
 *  answer and not a failure. */
export interface StandingsRecord {
  wins: number;
  losses: number;
}

/**
 * One club's row.
 *
 * **Every field is over the span asked for**, with three exceptions named
 * below that only a season can have — and those are `null` on a window rather
 * than carried over from the season, which is `BoardProjection`'s rule: a
 * measured season figure standing on a seven-day row would be two arithmetics
 * on one line.
 */
export interface StandingsTeam {
  id: number;
  name: string;
  abbreviation: string;
  /** 103 American, 104 National — MLB's own ids. */
  leagueId: number;
  divisionId: number;
  wins: number;
  losses: number;
  /** `.595`, as MLB spells it, computed the same way on a window. */
  pct: string;
  /** Games behind the division leader, and `-` for the leader — MLB's own
   *  string. */
  gamesBack: string;
  /** Games behind the third wild card, `+9.0` for a club holding one. */
  wildCardGamesBack: string | null;
  runsScored: number;
  runsAllowed: number;
  runDiff: number;
  home: StandingsRecord | null;
  away: StandingsRecord | null;
  /** **Record against clubs at .500 or better**, where "or better" is measured
   *  off the club's record *now* rather than on the day of the game. That is
   *  MLB's own definition of its `winners` split, verified against it — see
   *  `mlbStandings.ts`. */
  vsOver500: StandingsRecord | null;
  /** The last ten games, MLB's own `lastTen` split. */
  lastTen: StandingsRecord | null;
  /**
   * **The last thirty games, and the two halves of the season** — three cuts
   * MLB does not publish, computed from the season's schedule.
   *
   * They stand beside `lastTen` and are counted the way it is: **games, not
   * days**. Two columns an inch apart, one counting games and one counting
   * days, is the kind of thing this codebase spends its length preventing — and
   * a club that has had four days off would otherwise read as having gone cold.
   *
   * The halves are split on the **All-Star game's own date**, asked for rather
   * than approximated (the break moves by a week between seasons). Null on both
   * where that read failed, which is the honest reading of "we could not ask"
   * where `0-0` on thirty rows would claim nobody has played since July.
   */
  lastThirty: StandingsRecord | null;
  firstHalf: StandingsRecord | null;
  secondHalf: StandingsRecord | null;
  /** One-run games, and the Pythagorean record MLB publishes as `xWinLoss`.
   *  **Season only**, both being MLB's own figures rather than ours. */
  oneRun: StandingsRecord | null;
  expected: StandingsRecord | null;
  /** `W2`, `L4`. Computed from the club's own games either way, so the season
   *  and a window mean the same thing by it. Null where the span holds none. */
  streak: string | null;
  /** Whether the club leads its division, and whether it has clinched
   *  something. **Season only** — a lens is not a standing. */
  divisionLeader: boolean;
  clinched: boolean;
  /** MLB's own strings, `-` meaning none. Season only. */
  magicNumber: string | null;
  eliminationNumber: string | null;
  /**
   * Where the club stands **in its division** and **in its league**, 1-based.
   *
   * Carried rather than left to the client to derive, and that is a decision
   * rather than a convenience: on the season board these are MLB's own ranks,
   * which settle ties by a tiebreaker order this app has no business
   * reimplementing, and a client sorting on `pct` would quietly disagree with
   * the upstream exactly where the standings are interesting. On a window they
   * are computed, by pct and then by run differential, and the board says the
   * numbers are ours.
   */
  divisionRank: number;
  leagueRank: number;
  /** …and across all thirty clubs, which is what the Overall board is ordered
   *  by. MLB's own `sportRank`; `leagueRank` is kept beside it because the
   *  wild-card order is a per-league standing and the two are different
   *  questions. */
  overallRank: number;
}

/** The whole board, as `/api/mlb/standings` answers it. */
export interface MlbStandings {
  /** Every club, in no particular order — the client groups and ranks, there
   *  being three groupings on one board and one order per group. */
  teams: StandingsTeam[];
  /**
   * **The wild-card order, per league, as team ids.** It is not derivable from
   * the rows: a wild-card board excludes division leaders and is ranked by a
   * tiebreaker order MLB owns, so the alternative was the client re-deriving a
   * standing the upstream had already stated. Computed on a window, where MLB
   * has no opinion, by the same rule it applies — leaders out, then by pct.
   */
  wildcard: { leagueId: number; teamIds: number[] }[];
  /** MLB's own divisions, so no copy of six names goes stale in the bundle. */
  divisions: { id: number; name: string; shortName: string; leagueId: number }[];
  fetchedAt: number;
}

