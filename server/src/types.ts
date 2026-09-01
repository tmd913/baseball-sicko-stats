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
  // Where the pitch broke, inches, in the app's usual convention: positive
  // `hBreak` toward third base and positive `vBreak` a rise, for a pitcher of
  // either hand (see `MovementSample`). The per-type averages on `PitchMix` are
  // these same numbers; these are the individual pitches an outing's Movement
  // Profile draws its cloud from, which no average can stand in for — the
  // spread *within* a pitch type is what that chart is read for.
  hBreak: number | null;
  vBreak: number | null;
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
 * A game a player has coming, for a day that holds none — the player page's
 * Overview tab, where "there is no game today" is an answer that leaves the
 * obvious next question unasked. See `nextGame.ts`.
 */
export interface NextGame {
  gamePk: number;
  date: string; // "2026-08-15" — the day it counts on
  startTime: string | null; // ISO, for the local first-pitch time
  home: boolean; // his club's side of it
  opponent: string; // "TOR" — the abbreviation, as everywhere else
  opponentId: number;
  /** The **other** side's announced starter — who he would be facing, or on a
   *  starting pitcher's own next start, his counterpart. Null until that club
   *  names one. */
  probablePitcher: ProbablePitcher | null;
}

/**
 * The answer, and which question it answers. `start` is true when this is a
 * starting pitcher's next **announced start** rather than his club's next game,
 * so a null `game` beside it means "nobody has named his next turn yet" — which
 * is a different sentence from "his club has nothing scheduled".
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
  /**
   * **Which half of a doubleheader this is** — 1 or 2 — or **null where his club
   * plays once that day**, which is every row but a handful a season.
   *
   * Null rather than a `1` on every ordinary row, which is *a mark that would be
   * on every row marks nothing* applied to a field: the number is only ever
   * worth printing when there is another game beside it to be told apart from,
   * so the wire says whether there is rather than making the client work it out
   * from a list that holds one of the two.
   */
  gameNumber: number | null;
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
  // Whether that at-bat was **still being played** when the feed was read: MLB
  // had given the play no result yet, so this steal or wild pitch happened
  // *during* the plate appearance the Live section is showing. The feed keeps it
  // in the Live section until the at-bat resolves; it is false everywhere else.
  //
  // Live-only by nature — a day snapshot is written once every game is final, so
  // no play in one can be in progress and every event in a stored day is false —
  // which is why adding it needs no `DAY_SNAPSHOT_VERSION` bump: a blob written
  // before it existed reads back `undefined`, which is the answer it should give.
  midAtBat: boolean;
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
  // How wide his own season is for this pitch type, in inches — the standard
  // deviation of the season's per-pitch break (`PitchSpread` in
  // `pitcherArsenal.ts`). An outing's Movement Profile draws it as the hatched
  // blob the night's dots are read against, the way the season chart draws the
  // league's spread. Null where his season has fewer than two of the type.
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
 * reads no other field. A `velo` and a `stand` rode along until the tab's split
 * tabs were removed and took their last reader with them (the rule
 * `teamProbablePitcher`'s removal sets); both are one line to put back if a
 * per-dot tooltip or a per-hand cloud ever wants them.
 *
 * `hBreak`/`vBreak` are the app's usual convention, inches: positive `hBreak`
 * breaks toward **third base** and positive `vBreak` is rise. That holds for a
 * pitcher of either hand with no special case — a RHP's four-seam runs arm-side
 * to 3B and reads positive, a LHP's runs to 1B and reads negative — which is
 * also exactly where Savant's own chart puts them.
 *
 * **This is the declaration `pitcherArsenal.ts` imports**, rather than one of
 * two: it had its own copy for a while, `tsc` could not see the pair drift
 * because nothing imported the duplicate, and the copy in this file was still
 * carrying two fields the wire had stopped sending.
 */
export interface MovementSample {
  pitchType: string;
  hBreak: number;
  vBreak: number;
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

/** A pitcher's season line (and platoon splits vs L/R), for the card header. */
export interface PitcherSeasonStats {
  gamesPlayed: number;
  gamesStarted: number;
  battersFaced: number; // sample size (esp. for splits)
  inningsPitched: string; // "84.1"
  era: string;
  whip: string;
  // His record and his credits, which are MLB's own tallies on this same line
  // rather than anything derived. The player page's Overview summarizes a
  // pitcher's season as `IP · W-L · SV · HD · ERA · WHIP · K%`, and these four
  // are the half of that no rate can express — a closer's year is his saves.
  // The game log counts the same credits a game at a time (`decisionOf` there),
  // which is a different question: what he got *that night*.
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
  kRate: string; // K / batters faced, ".291"
  bbRate: string;
  avgAgainst: string; // batting average against, ".221"
  /** OPS against — the one line MLB publishes on a pitching split that reads as
   *  a single number, and the Splits tab's headline row for a pitcher. ERA is
   *  unavailable on a split (earned runs aren't split by hand) and OPS-against
   *  is the direct analogue of the batter tab's OPS row, so both kinds of player
   *  lead on the same comparison. */
  opsAgainst: string;
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
 * They partition **ownership** and nothing else, which is why the watchlist is
 * not a fourth key: it is a fact about the user rather than about who holds a
 * player, so it rides beside this as its own stored flag
 * (`UserPrefs.researchWatchlist`) and the board unions it on top.
 */
export type ResearchIncludeKey = 'mine' | 'others' | 'fa';

export const RESEARCH_INCLUDE_KEYS: ResearchIncludeKey[] = ['mine', 'others', 'fa'];

/**
 * **The research board's bar, as an arrangement rather than a fixed shape.**
 *
 * Up to four rows, each an ordered list of control keys; a key on none of them
 * is off the bar and lives behind the gear. `condensed` is the order the sticky
 * run reads in, which is a different question from the bar's own — the bar is
 * read top to bottom and the condensed run is one line replacing the last of
 * them. `condensedOff` is which of them that line leaves out, and `display` is
 * how each control is drawn where that is not the default.
 *
 * Every list is **keys**, and the meaning of a key lives where the bar is drawn
 * (`client/src/components/ResearchLayout.tsx`) — the same split `researchColumns`
 * makes, where the route validates the shape and the vocabulary lives with the
 * thing it names. Mirrors `ResearchControlsPref` in `client/src/types.ts`.
 */
export interface ResearchControlsPref {
  /** Up to four rows, top to bottom. */
  rows: string[][];
  /** The condensed run's order. Anything on the bar and not named here is
   *  appended in the bar's own order, so a control added to a row is in the
   *  condensed run without the reader being asked twice. */
  condensed: string[];
  /** Which controls are on the bar but **not drawn** on the sticky line. An
   *  order and a membership kept apart on purpose: a control turned off here
   *  keeps its place in `condensed`, so turning it back on puts it back where it
   *  was rather than at the end. */
  condensedOff: string[];
  /** How each control is drawn, by key — `'icon'` for its glyph alone,
   *  `'text'` for its word alone. **Absent means both**, which is what every
   *  control on this bar has always been and is the same
   *  absence-is-the-default convention as every other entry here; a value this
   *  build does not recognize is read as both rather than rejected. */
  display: Record<string, string>;
  /** @deprecated **The glyph-alone controls, under the shape that predates the
   *  third reading.** It was a list of keys drawn as their icon, from when the
   *  choice was a two-state switch; it is a `display` entry of `'icon'` now.
   *  Read on the way in so an arrangement saved before the change keeps the
   *  readings its owner set by hand, and **never written** — a record migrates
   *  the first time its owner touches the screen. The same treatment
   *  `researchWatchlistOnly` gets, and for the same reason. */
  iconOnly?: string[];
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
  // His team's result — **null until the game is actually final**, which the
  // gameLog split's own `isWin` does not say: MLB fills that field while the
  // game is being played, where it means only "his side is ahead right now". So
  // it is gated on `state` here rather than passed through; see
  // `gameLog.ts::toEntry`.
  win: boolean | null;
  // Where the game itself is, off the season schedule's status — the gameLog
  // split carries none. Null when the schedule lookup missed the game, which is
  // the same miss that leaves the two scores below null.
  state: GameStatus['state'] | null;
  // MLB's own label for that state — "In Progress", "Suspended: Rain",
  // "Final". A **wire value**: the spelling is MLB's and is not ours to
  // Americanize. Empty string when the schedule lookup missed the game.
  detailedState: string;
  // The score from his side of it, so the row reads "W 5-3" rather than needing
  // the reader to know which team was home. On a game still being played it is
  // the score so far, which is what the state beside it says. Both null when
  // the score lookup failed or the game hasn't started — the game log itself
  // carries no score, so this comes off the season schedule.
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

/** A player's current roster status, from their team's 40-man roster. */
export interface RosterStatus {
  code: string; // MLB status code, e.g. "A", "D10", "SU", "RM"
  description: string; // human label, e.g. "Active", "Injured 10-Day", "Suspended # days"
}

/**
 * **What a club's day is**, by MLB team id — the same nine facts
 * `PlayerStatus` carries about a game, without the four that are about a
 * person.
 *
 * It exists because the two surfaces that draw a man's game had come to
 * disagree about the same man. `PlayerStatus` is built from the day's
 * **boxscore rosters**, so a player who is not on one has no opponent — which
 * is right for the lineup pip and wrong for the question the research board's
 * `Opp` column asks. The summary table has never had the problem: it draws off
 * a report, and a report ties a player to his club's games "even when they're
 * off the active roster (suspended, on the IL, optioned)". So Aaron Judge on
 * the 60-day IL read `vs BOS 7:15 PM` on the Roster view and `—` on the board,
 * on the same afternoon.
 *
 * Keyed by **team id** rather than by abbreviation because that is what the
 * client holds: every row of both wide tables carries `teamId` for its cap
 * logo, and a join on a display string is the thing this repo refuses
 * everywhere else.
 *
 * Thirty entries at most, off the day the player map is already built from.
 */
export interface GameFacts {
  /** 1 for a single game, 1 or 2 for the halves of a doubleheader — what orders
   *  a day's two games, `gamePk` disagreeing with the played order on 30 of the
   *  2026 season's 44 doubleheader club-days. Null on a game MLB gave none. */
  gameNumber: number | null;
  gameState: GameStatus['state'];
  /** The other club's abbreviation, from this club's side. */
  opponent: string;
  isHome: boolean;
  teamScore: number | null;
  opponentScore: number | null;
  currentInning: number | null;
  inningState: string | null;
  startTime: string | null;
  /** The **other** side's announced starter, before first pitch — the same
   *  reading `PlayerStatus.probablePitcher` carries, which is who his hitters
   *  would face. */
  probablePitcher: ProbablePitcher | null;
}

export interface ClubStatus extends GameFacts {
  /** **The club's other game that day**, on a doubleheader — the same facts
   *  about the game `currentOf` did not pick, and null on the ordinary day.
   *
   *  The pick answers *which game speaks for this row* and every other thing on
   *  a row still asks it; the **opponent cell** is about the day, and drawing
   *  one half of a doubleheader was the cell answering a question nobody asked
   *  of it. One field rather than a list because a club plays at most twice —
   *  MLB has scheduled no triple-header since 1920 — and a list would be a
   *  shape the data cannot fill. Never nested: this is always null on the
   *  object hanging here. */
  otherGame: GameFacts | null;
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
  /** Who his club plays today — the other side's abbreviation, and which park
   *  it is in. Null when he has no game at all, which for a man off the active
   *  roster is the whole of what this map says about him.
   *
   *  It is the research board's opponent column, and it is the reason that
   *  column costs no second upstream: the day this is built from already knows
   *  every player's game, so the same read that answers "is he batting third"
   *  answers "against whom". Being a fact about *today*, it is the same answer
   *  on a 7-day board as on a season one — which is right: a season line is
   *  read to decide whether to start him tonight. */
  opponent: string | null;
  /** True when his club is at home — what turns the abbreviation into `vs LAD`
   *  or `@ LAD`. Null exactly when `opponent` is. */
  isHome: boolean | null;
  /** The score of that game, **his side first** — the vocabulary the game log
   *  already uses for a narrow column (`W 5-3`), and the one that lets the cell
   *  print a score without repeating both clubs' abbreviations beside a matchup
   *  that has just named them. Both null before first pitch, and null together
   *  or not at all. */
  teamScore: number | null;
  opponentScore: number | null;
  /** Where a live game has got to, in `GameStatus`'s own two fields rather than
   *  a label built here, so the client's one definition of "Top 7" serves the
   *  research board and the summary table alike. Both null unless the game is
   *  in progress — a final has an inning and nothing reads it. */
  currentInning: number | null;
  inningState: string | null; // "Top" | "Middle" | "Bottom" | "End"
  /** First pitch, ISO, **scheduled games only** — once a game is under way the
   *  time it started is not what anyone is reading the cell for, and leaving it
   *  out is a third of the field's payload across a full slate. */
  startTime: string | null;
  /** The starter the **other** side announced — his counterpart on a pitcher's
   *  row, someone he faces on a batter's, and the fact a pre-game cell exists
   *  to carry. Scheduled games only, for the reason the summary table drops him
   *  at first pitch: by then the score is the line that matters and the batter
   *  is as likely to be facing a reliever. */
  probablePitcher: ProbablePitcher | null;
  /** Which half of a doubleheader the facts above are, and the other half. Both
   *  null on the ordinary one-game day; see `ClubStatus.otherGame`, which is the
   *  same field for the club fallback and the same shape. */
  gameNumber: number | null;
  otherGame: GameFacts | null;
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
  // Who he is rather than what he did: his club (id for the cap logo,
  // abbreviation for the `alt` and the fallback) and MLB's listed position.
  // All three come off `getRosterInfo` and are filled by `getReport` alone —
  // the per-day reports a snapshot holds carry nulls and nothing reads them
  // there, `getReport` taking only `games` off a day. See the summary table's
  // identity block in `docs/claude/client.md`.
  teamId: number | null;
  team: string | null;
  position: string | null;
}

/** A rostered player for the season, used for search/autocomplete. */
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
  /**
   * Which side he bats from (`R` / `L` / `S`) and which arm he throws with
   * (`R` / `L`), off MLB's own `batSide` and `pitchHand`.
   *
   * They are **here** rather than on `PlayerReport` because this is the list
   * that answers for everybody: the client holds it from boot for the header
   * search, so one lookup by id serves the research board — six hundred rows of
   * players nobody has rostered, with no report behind any of them — as readily
   * as it serves a roster table. One source, so a man cannot read one hand in
   * one place and another somewhere else.
   *
   * Both facts ride on **one entry per person**, and the caller picks by kind:
   * a two-way player is two rows of this list under one id, and each of them is
   * about a different half of him. Null where MLB lists neither, which every
   * reader draws as nothing rather than as a dash.
   *
   * Note `pitchHand` is `S` for two position players on a checked season
   * (Carlos Cortes, Anthony Seigler — ambidextrous, and neither of them a
   * pitcher), so the client's own vocabulary answers for `R` and `L` and draws
   * nothing for anything else rather than inventing a word for it.
   */
  bats: string | null;
  throws: string | null;
}

// ---- Statcast percentile rankings -----------------------------------------

/** One metric in the Savant-style percentile chart (e.g. xwOBA at the 99th pct). */
export interface PercentileMetric {
  key: string;
  label: string;
  percentile: number | null; // 0-100 league rank; null when the player has no data
  value: string | null; // the raw stat, pre-formatted for display (".415", "94.1")
  // True when the rank is ours rather than Savant's — it had no exact rank for
  // this player (a part-season metric, most often), so it was estimated from the
  // league mean/stddev it publishes, or, where it publishes neither, computed
  // against the leaderboard carrying that column league-wide. Approximate to a
  // few points either way; the card draws it with a dotted bubble.
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
  /**
   * **The same card at Savant's own density** — its fifteen bars, in its groups
   * and its order, against the thirty-odd of `sections`.
   *
   * Two arrangements rather than two cards: both are built from one scrape of
   * one row (see `percentiles.ts::scrape`), so the client's density switch
   * costs no request and cannot show a `Summary` and a `Detailed` that disagree
   * about a number. Empty exactly when `sections` is — a player Savant holds no
   * card for has neither, and the client's empty state is drawn off `sections`
   * alone.
   */
  summary: PercentileSection[];
  updatedAt: string; // ISO timestamp of when the data was fetched
  // Shape of the card when it was scraped; a stored card built by an older
  // version is re-scraped rather than served (see CARD_VERSION).
  version?: number;
  /**
   * **Which cut of the season this card ranks**, or absent for the whole of it.
   *
   * On the wire for the reason `PlayerWindows.cut` is: the card is re-read when
   * the reader picks a cut, and a stale reply landing on a fresh one would
   * otherwise be a card of the wrong split with nothing on it to say so.
   *
   * Absent means the full season, which is the **only** card whose bars are
   * Savant's own. Every cut card is built here — see `percentileCuts.ts` — so
   * every row on one is marked `estimated` and drawn broken, which is this
   * app's standing rule that an estimate never wears the same clothes as a
   * measurement.
   */
  cut?: PlayerCut | null;
  /**
   * **How much of a season the cut rests on** — plate appearances for a batter,
   * batters faced for a pitcher — and absent on the full-season card, where
   * Savant's own qualifier already answers the question.
   *
   * A cut card is the one place in this app where the population and the
   * sample come apart on purpose: the bars rank a **cut** value inside the
   * **whole season's** qualified distribution, which is what was asked for and
   * is the only reading that makes `vs LHP` comparable with anything. That
   * makes the sample size the reader's only guard against a 34-PA card of
   * noise, so it is carried rather than left to be inferred from a bar.
   */
  cutSample?: number | null;
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

/**
 * **The two halves of the season — the only cuts the percentile card offers.**
 *
 * The card used to take four splits and a fifth cut of its own (`last100`,
 * his most recent hundred at-bats), and every one of them asked *the same*
 * question the Splits tab asks better: the tab draws both halves of a
 * comparison side by side with the gap between them measured, where a cut card
 * could only ever show one half at a time and left the reader subtracting two
 * cards they could not see at once. So the splits moved there whole — see
 * `client-player-splits.md` — and what is left here is the one cut that is a
 * **span** rather than a split, and so genuinely belongs on a control labeled
 * *which part of the season*.
 *
 * **The break is the All-Star game's own date**, asked for rather than
 * approximated — `mlbStats.ts::getAllStarDate`, the very read the standings
 * board's two half columns are split on, so the two surfaces cannot come to
 * disagree about which side of July a game fell on. A season with no All-Star
 * date read yet has no halves at all, and the card says so rather than guessing
 * at a mid-July constant.
 */
export type PlayerCut = 'firstHalf' | 'secondHalf';

/** In the order the percentile card's control offers them, which is the order
 *  they happened in. `Season` is the absence of a cut and so is not in here. */
export const PLAYER_CUTS: PlayerCut[] = ['firstHalf', 'secondHalf'];

export interface ResearchRow {
  id: number;
  name: string;
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
   *  still badged, placed on that scale with a dashed underline saying he is not one
   *  of them (`columnRanks.tsx`). */
  qualified: boolean;
  /**
   * **The club's won-lost record over the same span the row's numbers are** —
   * only ever set on a **team** row, where it takes the place of the position
   * list under the name (a club has no position and no hand). Absent on every
   * player row, which is what `?` says: `getRecordFor` in `teamResearch.ts` is
   * the only thing that fills it.
   *
   * Span-matched rather than season-long, and deliberately: every other number
   * on a 7-day team row covers those seven days, and a season record sitting
   * among them would be the one figure on the line answering a different
   * question. Null where the record could not be read — a failure costs its own
   * cell, not the row.
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
   * a different span from the figures beside it. The board draws `G` there
   * instead, the rule the roster's own projected reading already follows.
   *
   * Absent, too, on the measured board, exactly as `record` is absent on a
   * player row — one optional field, filled by one builder
   * (`projection.ts::getBoardProjection`).
   */
  projGame?: ProjectedFixture | null;
}

/**
 * **One club's game on the day a projection was narrowed to**, from the side of
 * the man whose row it is.
 *
 * Deliberately the *fixture* and not a game state: the day this describes has
 * not been played (a projection over a game already under way is a game
 * `remainingGames` has dropped), so there is no score, no inning and no `Final`
 * to draw — which is the whole of why it is not `PlayerStatus`'s opponent read
 * a second way.
 */
export interface ProjectedFixture {
  gamePk: number;
  /** The other club's abbreviation — "SEA". */
  opponent: string;
  /** His club is at home, which is what decides `vs` against `@`. */
  isHome: boolean;
  /** ISO first pitch, or null where the schedule gives none. */
  startTime: string | null;
  /**
   * **The man the other club is throwing**, or null where nobody is named and
   * no rotation slot puts anybody there.
   *
   * The name rides on the row here where `ScheduleGame` deliberately carries
   * only ids, and the reason is the population: that window is every club's
   * fortnight, read by a grid whose cells are two characters wide; this is one
   * fixture per row of a board that is *read to pick a stranger up*, where who
   * is pitching is half the decision. One name per row against 750 names for
   * every row of a window nobody has narrowed.
   */
  starter: ProjectedStarter | null;
}

export interface ProjectedStarter {
  id: number;
  name: string;
  /** `R` / `L`, or null where MLB lists none — what the `RHP` token is drawn
   *  from, the same field the board's own identity line reads. */
  hand: string | null;
  /**
   * **Which of the app's three tiers the start is**, the ladder the Schedule
   * view's own cell already draws: `announced` where his club has named him,
   * `projected` where his own rotation slot puts him there, `estimated` where
   * his club's pooled rotation does.
   *
   * The same three words `RotationProjection.estimated` is the server half of,
   * resolved here rather than left to the client: this row carries one starter
   * and not a window, so there is no map to look the tier up in.
   */
  tier: 'announced' | 'projected' | 'estimated';
}

// ---- The Schedule view -----------------------------------------------------

/**
 * One scheduled game, as the Schedule view reads it — the next fortnight of
 * every club, over the wire once and joined to a row by its player's club.
 *
 * Deliberately thin. It carries no scores, no line score and no probable
 * *names*: the view draws an opponent abbreviation and, on a pitcher's own row,
 * whether he is the man his club has announced — which needs the two ids and
 * nothing else. A name here would be a few hundred strings on the wire to fill
 * a tooltip the row already answers with the player it is about.
 */
export interface ScheduleGame {
  gamePk: number;
  /** The ET baseball day the game counts on, `YYYY-MM-DD`. */
  date: string;
  /**
   * **Which game of the day this is** — 1 for a single game, 1 or 2 for the
   * halves of a doubleheader.
   *
   * It is what a day's games are **ordered** by, and that is what it is on the
   * wire for rather than for the label it also buys. `gamePk` is not an order:
   * measured over the 2026 season's 44 doubleheader club-days, id order and
   * game order **disagree on 30 of them**, a makeup added to a date taking a
   * fresh and higher id while being the opener. First pitch agrees with this
   * field 44 of 44.
   */
  gameNumber: number;
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
  /**
   * MLB's own state for the game. **A postponement is not a game he gets**, so
   * it is excluded from the per-row count and the cell says so; and today's
   * column can hold a game already final, which the cell draws quietly rather
   * than as something still to come.
   */
  state: 'scheduled' | 'live' | 'final' | 'postponed';
  /**
   * Whom each side has *announced*, and nothing more. Clubs name a starter
   * about three days out (measured: 28/28 today, 27/30 tomorrow, 30/30 at two
   * days, 3/22 at three, 1/30 at four and nothing beyond), so a start mark is a
   * fact about the front of the window and an absence past it is the schedule
   * rather than the view — see `docs/claude/client-summary.md`.
   */
  homeProbableId: number | null;
  awayProbableId: number | null;
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

