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
 * which, because a section labelled News that quietly mixes them would be
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
   *  names, so the reader can check the colour against a date. */
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
 * and nothing else: the plot draws a coloured dot at (`hBreak`, `vBreak`) and
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
  // rather than anything derived. The player page's Overview summarises a
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
 * offence**, so a low strikeout rate ranks 1st, not 30th. Computed here rather
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
  position: string;
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
  /** ISO first pitch, or null where the schedule gives none. */
  startTime: string | null;
  homeId: number;
  awayId: number;
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
